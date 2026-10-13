'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const APP_VERSION = '3.0.2';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.EDUSEND_DATA_DIR || path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'simple-class-teacher.json');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'DEV_ONLY_CHANGE_ME_reportform_zm_v3';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

fs.mkdirSync(DATA_DIR, { recursive: true });

const nowIso = () => new Date().toISOString();
const id = prefix => `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString('hex')}`;
const validPin = pin => /^\d{4,}$/.test(String(pin || '').trim());
const normalizeGradingSystem = value => ['OBC','LEGACY'].includes(String(value || '').trim().toUpperCase()) ? 'OBC' : 'CBC';

function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPin(pin, stored) {
  try {
    const [salt, hash] = String(stored || '').split(':');
    const got = crypto.scryptSync(String(pin), salt, 64);
    const expected = Buffer.from(hash, 'hex');
    return expected.length === got.length && crypto.timingSafeEqual(expected, got);
  } catch { return false; }
}

function signToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function issueToken(userId) {
  const now = Math.floor(Date.now() / 1000);
  return signToken({ userId, iat: now, exp: now + TOKEN_TTL_SECONDS });
}

function readToken(token) {
  if (!token || !token.includes('.')) return null;
  try {
    const [body, sig] = token.split('.');
    const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url');
    const a = Buffer.from(sig); const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

function emptyDb() {
  return { schema:'simple-class-teacher-v1', version:1, users:[], classes:[], subjects:[], pupils:[], assessments:[], marks:{}, updatedAt:nowIso() };
}

function loadDb() {
  try {
    const x = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return x && x.schema === 'simple-class-teacher-v1' ? x : emptyDb();
  } catch { return emptyDb(); }
}

let db = loadDb();
function saveDb() {
  db.updatedAt = nowIso();
  const tmp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

// V3.0.1 terminology migration: the former LEGACY option is now called OBC.
let gradingMigrated = false;
for (const cls of db.classes || []) {
  if (String(cls.gradingSystem || '').toUpperCase() === 'LEGACY') { cls.gradingSystem = 'OBC'; gradingMigrated = true; }
}
if (gradingMigrated) saveDb();

function safeUser(u) {
  if (!u) return null;
  const { pinHash, ...rest } = u;
  return rest;
}

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
  res.end(body);
}
function sendError(res, status, error) { sendJson(res, status, { error }); }
function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw='';
    req.on('data', c => { raw += c; if (raw.length > 2_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

function authUser(req) {
  const h = String(req.headers.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const payload = readToken(token);
  if (!payload) return null;
  return db.users.find(u => u.id === payload.userId && u.active !== false) || null;
}

function userClass(userId) { return db.classes.find(c => c.teacherUserId === userId) || null; }
function userAssessment(userId) { const c=userClass(userId); return c ? db.assessments.find(a=>a.classId===c.id) || null : null; }
function classSubjects(classId) { return db.subjects.filter(s => s.classId === classId && s.active !== false); }
function classPupils(classId) { return db.pupils.filter(p => p.classId === classId && p.active !== false); }
function markKey(assessmentId,pupilId,subjectId){ return `${assessmentId}:${pupilId}:${subjectId}`; }

function cleanMark(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Marks must be between 0 and 100');
  return Math.round(n * 10) / 10;
}

function stateForUser(user) {
  const cls = userClass(user.id);
  const assessment = userAssessment(user.id);
  const subjects = cls ? classSubjects(cls.id) : [];
  const pupils = cls ? classPupils(cls.id) : [];
  const marks = {};
  if (assessment) {
    for (const p of pupils) {
      marks[p.id] = {};
      for (const s of subjects) marks[p.id][s.id] = db.marks[markKey(assessment.id,p.id,s.id)] ?? null;
    }
  }
  return { version:APP_VERSION, user:safeUser(user), class:cls, assessment, subjects, pupils, marks };
}

async function api(req,res,urlObj) {
  const { pathname } = urlObj;
  if (req.method === 'GET' && pathname === '/api/version') return sendJson(res,200,{version:APP_VERSION});

  if (req.method === 'POST' && pathname === '/api/register') {
    const b = await readJson(req);
    const name = String(b.name||'').trim();
    const identifier = String(b.identifier||'').trim().toLowerCase();
    const pin = String(b.pin||'').trim();
    const schoolName = String(b.schoolName||'').trim();
    const className = String(b.className||'').trim();
    const gradingSystem = normalizeGradingSystem(b.gradingSystem);
    if (!name || !identifier || !schoolName || !className) return sendError(res,400,'Complete all required fields');
    if (!validPin(pin)) return sendError(res,400,'PIN must contain numbers only and be at least 4 digits');
    if (db.users.some(u => u.identifier === identifier)) return sendError(res,409,'That staff ID is already in use');
    const user = { id:id('usr'), name, identifier, pinHash:hashPin(pin), active:true, createdAt:nowIso() };
    const cls = { id:id('cls'), teacherUserId:user.id, schoolName, name:className, gradingSystem, createdAt:nowIso() };
    const assessment = { id:id('assess'), classId:cls.id, name:'Current Assessment', createdAt:nowIso() };
    db.users.push(user); db.classes.push(cls); db.assessments.push(assessment); saveDb();
    return sendJson(res,201,{ token:issueToken(user.id), user:safeUser(user) });
  }

  if (req.method === 'POST' && pathname === '/api/login') {
    const b = await readJson(req);
    const identifier = String(b.identifier||'').trim().toLowerCase();
    const pin = String(b.pin||'').trim();
    if (!validPin(pin)) return sendError(res,400,'Enter a PIN of at least 4 numbers');
    const user = db.users.find(u => u.identifier === identifier && u.active !== false);
    if (!user || !verifyPin(pin,user.pinHash)) return sendError(res,401,'Incorrect staff ID or PIN');
    return sendJson(res,200,{ token:issueToken(user.id), user:safeUser(user) });
  }

  const user = authUser(req);
  if (!user) return sendError(res,401,'Please sign in again');

  if (req.method === 'GET' && pathname === '/api/me') return sendJson(res,200,stateForUser(user));
  if (req.method === 'GET' && pathname === '/api/class-data') return sendJson(res,200,stateForUser(user));

  if (req.method === 'PUT' && pathname === '/api/setup') {
    const b = await readJson(req);
    const cls = userClass(user.id); const assessment = userAssessment(user.id);
    if (!cls || !assessment) return sendError(res,404,'Class not found');
    const schoolName=String(b.schoolName||'').trim(); const className=String(b.className||'').trim();
    const assessmentName=String(b.assessmentName||'').trim() || 'Current Assessment';
    const gradingSystem=normalizeGradingSystem(b.gradingSystem);
    const subjectNames=[...new Set((Array.isArray(b.subjects)?b.subjects:[]).map(x=>String(x||'').trim()).filter(Boolean))].slice(0,20);
    const pupilRows=(Array.isArray(b.pupils)?b.pupils:[]).map(x=>({name:String(x.name||'').trim(),sex:String(x.sex||'').trim().toUpperCase().slice(0,1),examNo:String(x.examNo||'').trim(),parentPhone:String(x.parentPhone||'').trim()})).filter(x=>x.name).slice(0,120);
    if(!schoolName||!className) return sendError(res,400,'School and class names are required');
    cls.schoolName=schoolName; cls.name=className; cls.gradingSystem=gradingSystem; assessment.name=assessmentName;

    const oldSubjects=classSubjects(cls.id); const subjectByName=new Map(oldSubjects.map(s=>[s.name.toLowerCase(),s]));
    for(const s of oldSubjects) s.active=false;
    const newSubjects=[];
    for(const name of subjectNames){ let s=subjectByName.get(name.toLowerCase()); if(!s){s={id:id('sub'),classId:cls.id,name,active:true};db.subjects.push(s);} s.name=name;s.active=true;newSubjects.push(s); }

    const oldPupils=classPupils(cls.id); const pupilByKey=new Map(oldPupils.map(p=>[(p.examNo||p.name).toLowerCase(),p]));
    for(const p of oldPupils) p.active=false;
    const newPupils=[];
    for(const row of pupilRows){ const key=(row.examNo||row.name).toLowerCase(); let p=pupilByKey.get(key); if(!p){p={id:id('p'),classId:cls.id,active:true};db.pupils.push(p);} Object.assign(p,row,{active:true});newPupils.push(p); }
    saveDb(); return sendJson(res,200,stateForUser(user));
  }

  if (req.method === 'PUT' && pathname === '/api/results') {
    const b=await readJson(req); const cls=userClass(user.id); const assessment=userAssessment(user.id);
    if(!cls||!assessment) return sendError(res,404,'Class not found');
    const allowedPupils=new Set(classPupils(cls.id).map(p=>p.id)); const allowedSubjects=new Set(classSubjects(cls.id).map(s=>s.id));
    const rows=Array.isArray(b.rows)?b.rows:[];
    for(const r of rows){ if(!allowedPupils.has(r.pupilId)||!allowedSubjects.has(r.subjectId)) continue; db.marks[markKey(assessment.id,r.pupilId,r.subjectId)]=cleanMark(r.mark); }
    saveDb(); return sendJson(res,200,{saved:true,at:nowIso()});
  }

  return sendError(res,404,'API endpoint not found');
}

const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml'};
function serveStatic(pathname,res){
  let rel=decodeURIComponent(pathname||'/'); if(rel==='/'||rel==='') rel='/index.html';
  const file=path.normalize(path.join(PUBLIC_DIR,rel)); if(!file.startsWith(PUBLIC_DIR)) return false;
  let final=file; try{if(fs.statSync(final).isDirectory()) final=path.join(final,'index.html');}catch{return false;}
  try{const data=fs.readFileSync(final);res.writeHead(200,{'Content-Type':MIME[path.extname(final).toLowerCase()]||'application/octet-stream','Cache-Control':path.basename(final)==='service-worker.js'?'no-cache':'public, max-age=60'});res.end(data);return true;}catch{return false;}
}

const server=http.createServer(async(req,res)=>{const urlObj=new URL(req.url,`http://${req.headers.host||'localhost'}`);try{if(urlObj.pathname.startsWith('/api/')){await api(req,res,urlObj);return;}if(!serveStatic(urlObj.pathname,res))sendError(res,404,'Not found');}catch(err){console.error(err);if(!res.headersSent)sendError(res,500,err.message||'Server error');else res.end();}});
server.listen(PORT,HOST,()=>{console.log(`Reportform ZM V${APP_VERSION} running on http://${HOST}:${PORT}`);console.log(`Simple data file: ${DATA_FILE}`);if(TOKEN_SECRET.includes('DEV_ONLY'))console.warn('Set TOKEN_SECRET before production use.');});
