'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const APP_VERSION = '3.0.5';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.EDUSEND_DATA_DIR || path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'simple-class-teacher.json');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'DEV_ONLY_CHANGE_ME_reportform_zm_v3';
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim();
const OPENAI_MODEL = String(process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
const OPENAI_API_URL = String(process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions').trim();

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

let gradingMigrated = false;
for (const cls of db.classes || []) {
  if (String(cls.gradingSystem || '').toUpperCase() === 'LEGACY') { cls.gradingSystem = 'OBC'; gradingMigrated = true; }
}
if (gradingMigrated) saveDb();

let pupilNameMigrated = false;
for (const p of db.pupils || []) {
  if (!p.firstName && !p.surname && p.name) {
    const parts = String(p.name).trim().split(/\s+/).filter(Boolean);
    p.firstName = parts.shift() || '';
    p.surname = parts.join(' ');
    pupilNameMigrated = true;
  }
}
if (pupilNameMigrated) saveDb();

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

function standaloneUser(){
  let user=(db.users||[]).find(u=>u.active!==false && userClass(u.id)) || (db.users||[]).find(u=>u.active!==false) || null;
  let changed=false;
  if(!user){
    user={id:id('usr'),name:'',phone:'',identifier:'standalone',active:true,createdAt:nowIso()};
    db.users.push(user);changed=true;
  }
  let cls=userClass(user.id);
  if(!cls){
    cls={id:id('cls'),teacherUserId:user.id,teacherName:user.name||'',teacherPhone:user.phone||'',schoolName:'',name:'',gradingSystem:'CBC',createdAt:nowIso()};
    db.classes.push(cls);changed=true;
  } else {
    if(cls.teacherName===undefined){cls.teacherName=user.name||'';changed=true;}
    if(cls.teacherPhone===undefined){cls.teacherPhone=user.phone||'';changed=true;}
  }
  let assessment=userAssessment(user.id);
  if(!assessment){db.assessments.push({id:id('assess'),classId:cls.id,name:'Current Assessment',createdAt:nowIso()});changed=true;}
  if(changed)saveDb();
  return user;
}

function cleanMark(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error('Marks must be between 0 and 100');
  return Math.round(n * 10) / 10;
}

function gradeCBC(mark){const n=Number(mark);return n>=70?1:n>=60?2:n>=50?3:n>=40?4:5;}
function remarkCBC(g){return ['','Outstanding','Advanced','Basic','Satisfactory','Unsatisfactory'][g]||'';}
function gradeOBC(mark){const n=Number(mark);return n>=75?1:n>=70?2:n>=65?3:n>=60?4:n>=55?5:n>=50?6:n>=45?7:n>=40?8:9;}
function remarkOBC(g){return g===1?'Excellent':g===2?'Very Good':g<=4?'Good':g<=6?'Satisfactory':g<=8?'Fair':'Fail';}
function pronouns(sex){const s=String(sex||'').toUpperCase();if(s==='F')return{subj:'She',subjL:'she',obj:'her',poss:'her'};if(s==='M')return{subj:'He',subjL:'he',obj:'him',poss:'his'};return{subj:'The learner',subjL:'the learner',obj:'the learner',poss:'their'};}

function pupilReportSnapshot(user,pupil){
  const cls=userClass(user.id), assessment=userAssessment(user.id);
  if(!cls||!assessment) return null;
  const subjects=classSubjects(cls.id), isCBC=cls.gradingSystem==='CBC';
  const rows=subjects.map(s=>{
    const raw=db.marks[markKey(assessment.id,pupil.id,s.id)];
    const has=raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(Number(raw));
    const mark=has?Number(raw):null;
    const grade=has?(isCBC?gradeCBC(mark):gradeOBC(mark)):null;
    return {subject:s.name,mark,grade,remark:has?(isCBC?remarkCBC(grade):remarkOBC(grade)):'Pending'};
  });
  const entered=rows.filter(r=>r.mark!==null), complete=entered.length===rows.length && rows.length>0;
  const strongest=[...entered].sort((a,b)=>b.mark-a.mark).slice(0,3);
  const weakest=[...entered].sort((a,b)=>a.mark-b.mark).slice(0,3);
  const summary={complete,entered:entered.length,total:rows.length};
  if(entered.length){summary.average=Math.round(entered.reduce((n,x)=>n+x.mark,0)/entered.length*10)/10;}
  if(!isCBC&&entered.length>=6){const best=[...entered].sort((a,b)=>b.mark-a.mark).slice(0,6);summary.best6=best.reduce((n,x)=>n+x.mark,0);summary.points=best.reduce((n,x)=>n+x.grade,0);summary.division=summary.points<=12?'I':summary.points<=17?'II':summary.points<=24?'III':summary.points<=35?'IV':'FAIL';}
  if(isCBC&&entered.length)summary.averageGrade=gradeCBC(summary.average);
  return {school:cls.schoolName,className:cls.name,assessment:assessment.name,gradingSystem:cls.gradingSystem,pupil:{name:pupil.name,firstName:pupil.firstName,surname:pupil.surname,sex:pupil.sex,examNo:pupil.examNo},rows,summary,strongest,weakest,missing:rows.filter(r=>r.mark===null).map(r=>r.subject)};
}

function smartLocalComment(snapshot){
  if(!snapshot) return 'Results are not available yet.';
  const {pupil,summary,strongest,weakest,school,assessment,gradingSystem,missing}=snapshot;
  const name=pupil.name||'This pupil', pr=pronouns(pupil.sex);
  if(!summary.entered) return `Dear Parent/Guardian, results for ${name} have not yet been entered for ${assessment}. The report will be completed once the subject marks are available.`;
  if(!summary.complete){
    const miss=missing.slice(0,3).join(', ');
    return `Dear Parent/Guardian, ${name}'s result record for ${assessment} is not yet complete. ${summary.entered} of ${summary.total} subject results have been entered${miss?`, while ${miss}${missing.length>3?' and other subjects':''} are still pending`:''}. A final overall judgement should be made after all required marks are entered. Please continue encouraging ${pr.obj} to revise consistently while the remaining results are completed.`;
  }
  const best=strongest[0], weak=weakest[0];
  let text=`Dear Parent/Guardian, ${name} completed ${assessment} at ${school}. `;
  if(gradingSystem==='CBC'){
    const g=gradeCBC(summary.average), desc=remarkCBC(g);
    text+=`${pr.subj} obtained an overall average of ${summary.average}%, which is CBC Grade ${g} (${desc}). `;
  }else{
    text+=`${pr.subj} recorded a Best 6 total of ${summary.best6}/600, ${summary.points} grade points and Division ${summary.division}. `;
  }
  if(best) text+=`${pr.subj} performed strongest in ${best.subject} with ${best.mark}%. `;
  if(weak && (!best || weak.subject!==best.subject)){
    const weakDesc=gradingSystem==='CBC'?`${remarkCBC(gradeCBC(weak.mark))}`:`Grade ${gradeOBC(weak.mark)} (${remarkOBC(gradeOBC(weak.mark))})`;
    text+=`To improve the overall result, ${pr.subjL} should give more attention to ${weak.subject}, where the mark was ${weak.mark}%${weakDesc?` — ${weakDesc}`:''}. `;
  }
  text+=`Please encourage regular revision, careful correction of mistakes and consultation with subject teachers where help is needed. Continued effort and good study habits can strengthen the next result.`;
  return text;
}

function aiSystemPrompt(gradingSystem){
  const scale=gradingSystem==='CBC'
    ? 'CBC scale: 70-100 Grade 1 Outstanding; 60-69 Grade 2 Advanced; 50-59 Grade 3 Basic; 40-49 Grade 4 Satisfactory; 0-39 Grade 5 Unsatisfactory. Do not use Grade 6-9 or Division I-IV for CBC.'
    : 'OBC scale: 75-100 Grade 1; 70-74 Grade 2; 65-69 Grade 3; 60-64 Grade 4; 55-59 Grade 5; 50-54 Grade 6; 45-49 Grade 7; 40-44 Grade 8; 0-39 Grade 9. Best 6 points determine the displayed division in the supplied data.';
  return `You write class-teacher comments for Zambian school report forms. Produce one polished paragraph only, about 90-150 words. Make it natural, specific, parent-friendly, encouraging and professional. Analyse only the supplied pupil data: actual marks, strongest and weakest subjects, grading, Best 6/points/division when supplied, and genuinely missing marks. ${scale} Never invent attendance, discipline, conduct, improvement/decline over time, family circumstances or personal qualities that are not present in the data. If results are incomplete, say so tactfully and do not invent missing marks. Give practical revision advice based on weaker entered subjects. Do not use bullets, markdown, headings or quotation marks.`;
}

async function generateOnlineComment(snapshot){
  if(!OPENAI_API_KEY) return null;
  const res=await fetch(OPENAI_API_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${OPENAI_API_KEY}`},body:JSON.stringify({model:OPENAI_MODEL,messages:[{role:'system',content:aiSystemPrompt(snapshot.gradingSystem)},{role:'user',content:`Generate one class teacher comment for this report form.\n\nPupil data:\n${JSON.stringify(snapshot,null,2)}`}],temperature:0.7,max_tokens:260})});
  const raw=await res.text();
  let data;try{data=JSON.parse(raw);}catch{data={raw};}
  if(!res.ok) throw new Error(data?.error?.message||raw.slice(0,240)||`AI request failed (${res.status})`);
  const content=data?.choices?.[0]?.message?.content;
  if(typeof content==='string'&&content.trim()) return content.replace(/^['"\s]+|['"\s]+$/g,'').trim();
  if(typeof data?.output_text==='string'&&data.output_text.trim()) return data.output_text.trim();
  return null;
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
  return { version:APP_VERSION, user:safeUser(user), class:cls, assessment, subjects, pupils, marks, ai:{onlineConfigured:!!OPENAI_API_KEY} };
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

  const user = standaloneUser();

  if (req.method === 'GET' && pathname === '/api/me') return sendJson(res,200,stateForUser(user));
  if (req.method === 'GET' && pathname === '/api/class-data') return sendJson(res,200,stateForUser(user));

  if (req.method === 'POST' && pathname === '/api/ai-comment') {
    const b=await readJson(req), cls=userClass(user.id);
    if(!cls) return sendError(res,404,'Class not found');
    const pupil=db.pupils.find(p=>p.id===String(b.pupilId||'')&&p.classId===cls.id&&p.active!==false);
    if(!pupil) return sendError(res,404,'Pupil not found');
    const snapshot=pupilReportSnapshot(user,pupil);
    const fallback=smartLocalComment(snapshot);
    if(!OPENAI_API_KEY) return sendJson(res,200,{comment:fallback,source:'smart-local',message:'Online AI is not configured on the server. Smart Local comment generated.'});
    try{
      const comment=await generateOnlineComment(snapshot);
      return sendJson(res,200,{comment:comment||fallback,source:comment?'online-ai':'smart-local',message:comment?`AI comment generated with ${OPENAI_MODEL}.`:'AI returned no text. Smart Local comment generated.'});
    }catch(err){
      console.error('AI comment failed:',err.message);
      return sendJson(res,200,{comment:fallback,source:'smart-local',message:`Online AI was unavailable. Smart Local comment generated instead.`});
    }
  }

  if (req.method === 'PUT' && pathname === '/api/setup') {
    const b = await readJson(req);
    const cls = userClass(user.id); const assessment = userAssessment(user.id);
    if (!cls || !assessment) return sendError(res,404,'Class not found');
    const teacherName=String(b.teacherName||'').trim(); const teacherPhone=String(b.teacherPhone||'').trim();
    const schoolName=String(b.schoolName||'').trim(); const className=String(b.className||'').trim();
    const assessmentName=String(b.assessmentName||'').trim() || 'Current Assessment';
    const gradingSystem=normalizeGradingSystem(b.gradingSystem);
    if(!teacherName||!teacherPhone||!schoolName||!className) return sendError(res,400,'Class teacher name, phone number, school and class are required');
    user.name=teacherName; user.phone=teacherPhone; cls.teacherName=teacherName; cls.teacherPhone=teacherPhone;
    cls.schoolName=schoolName; cls.name=className; cls.gradingSystem=gradingSystem; assessment.name=assessmentName;

    // Backward-compatible support for older V3 clients that still submit a subject array.
    if(Array.isArray(b.subjects)){
      const subjectNames=[...new Set(b.subjects.map(x=>String(x||'').trim()).filter(Boolean))].slice(0,10);
      const oldSubjects=classSubjects(cls.id); const subjectByName=new Map(oldSubjects.map(s=>[s.name.toLowerCase(),s]));
      for(const s of oldSubjects) s.active=false;
      for(const name of subjectNames){ let s=subjectByName.get(name.toLowerCase()); if(!s){s={id:id('sub'),classId:cls.id,name,active:true,createdAt:nowIso()};db.subjects.push(s);} s.name=name;s.active=true; }
    }

    // Backward-compatible support for older V3 bulk-pupil setup payloads.
    if(Array.isArray(b.pupils)){
      const pupilRows=b.pupils.map(x=>{
        let firstName=String(x.firstName||'').trim(), surname=String(x.surname||'').trim();
        const legacyName=String(x.name||'').trim();
        if(!firstName&&!surname&&legacyName){const parts=legacyName.split(/\s+/).filter(Boolean);firstName=parts.shift()||'';surname=parts.join(' ');}
        const name=[firstName,surname].filter(Boolean).join(' ').trim()||legacyName;
        return {firstName,surname,name,sex:String(x.sex||'').trim().toUpperCase().slice(0,1),examNo:String(x.examNo||'').trim(),parentPhone:String(x.parentPhone||'').trim()};
      }).filter(x=>x.name).slice(0,120);
      const oldPupils=classPupils(cls.id); const pupilByKey=new Map(oldPupils.map(p=>[(p.examNo||p.name).toLowerCase(),p]));
      for(const p of oldPupils) p.active=false;
      for(const row of pupilRows){ const key=(row.examNo||row.name).toLowerCase(); let p=pupilByKey.get(key); if(!p){p={id:id('p'),classId:cls.id,active:true};db.pupils.push(p);} Object.assign(p,row,{active:true}); }
    }
    saveDb(); return sendJson(res,200,stateForUser(user));
  }

  if (req.method === 'POST' && pathname === '/api/subjects') {
    const b=await readJson(req), cls=userClass(user.id);
    if(!cls) return sendError(res,404,'Class not found');
    const current=classSubjects(cls.id);
    if(current.length>=10) return sendError(res,400,'Maximum 10 subjects allowed for one class');
    const name=String(b.name||'').trim().replace(/\s+/g,' ');
    if(!name) return sendError(res,400,'Enter the subject name');
    if(current.some(s=>s.name.toLowerCase()===name.toLowerCase())) return sendError(res,409,'That subject is already in this class');
    const subject={id:id('sub'),classId:cls.id,name,active:true,createdAt:nowIso()};
    db.subjects.push(subject);saveDb();return sendJson(res,201,{subject,state:stateForUser(user)});
  }

  const subjectMatch=pathname.match(/^\/api\/subjects\/([^/]+)$/);
  if(subjectMatch && req.method==='PUT'){
    const cls=userClass(user.id);if(!cls)return sendError(res,404,'Class not found');
    const subject=db.subjects.find(s=>s.id===decodeURIComponent(subjectMatch[1])&&s.classId===cls.id&&s.active!==false);
    if(!subject)return sendError(res,404,'Subject not found');
    const b=await readJson(req), name=String(b.name||'').trim().replace(/\s+/g,' ');
    if(!name)return sendError(res,400,'Enter the subject name');
    if(classSubjects(cls.id).some(s=>s.id!==subject.id&&s.name.toLowerCase()===name.toLowerCase()))return sendError(res,409,'That subject is already in this class');
    subject.name=name;saveDb();return sendJson(res,200,{subject,state:stateForUser(user)});
  }
  if(subjectMatch && req.method==='DELETE'){
    const cls=userClass(user.id);if(!cls)return sendError(res,404,'Class not found');
    const subject=db.subjects.find(s=>s.id===decodeURIComponent(subjectMatch[1])&&s.classId===cls.id&&s.active!==false);
    if(!subject)return sendError(res,404,'Subject not found');
    subject.active=false;subject.removedAt=nowIso();saveDb();return sendJson(res,200,{removed:true,state:stateForUser(user)});
  }

  if (req.method === 'POST' && pathname === '/api/pupils') {
    const b=await readJson(req); const cls=userClass(user.id);
    if(!cls) return sendError(res,404,'Class not found');
    if(classPupils(cls.id).length>=120) return sendError(res,400,'This class already has the maximum of 120 pupils');
    const firstName=String(b.firstName||'').trim(); const surname=String(b.surname||'').trim();
    if(!firstName||!surname) return sendError(res,400,'Enter both first name and surname');
    const pupil={id:id('p'),classId:cls.id,firstName,surname,name:`${firstName} ${surname}`.replace(/\s+/g,' ').trim(),sex:String(b.sex||'').trim().toUpperCase().slice(0,1),examNo:String(b.examNo||'').trim(),parentPhone:String(b.parentPhone||'').trim(),classTeacherComment:'',active:true,createdAt:nowIso()};
    db.pupils.push(pupil); saveDb(); return sendJson(res,201,{pupil,state:stateForUser(user)});
  }

  const pupilCommentMatch=pathname.match(/^\/api\/pupils\/([^/]+)\/comment$/);
  if(pupilCommentMatch && req.method==='PUT'){
    const cls=userClass(user.id);if(!cls)return sendError(res,404,'Class not found');
    const pupil=db.pupils.find(p=>p.id===decodeURIComponent(pupilCommentMatch[1])&&p.classId===cls.id&&p.active!==false);
    if(!pupil)return sendError(res,404,'Pupil not found');
    const b=await readJson(req);pupil.classTeacherComment=String(b.comment||'').trim().slice(0,4000);saveDb();return sendJson(res,200,{saved:true,comment:pupil.classTeacherComment,state:stateForUser(user)});
  }

  const pupilMatch=pathname.match(/^\/api\/pupils\/([^/]+)$/);
  if (pupilMatch && req.method === 'PUT') {
    const cls=userClass(user.id); if(!cls) return sendError(res,404,'Class not found');
    const pupil=db.pupils.find(p=>p.id===decodeURIComponent(pupilMatch[1])&&p.classId===cls.id&&p.active!==false);
    if(!pupil) return sendError(res,404,'Pupil not found');
    const b=await readJson(req); const firstName=String(b.firstName||'').trim(); const surname=String(b.surname||'').trim();
    if(!firstName||!surname) return sendError(res,400,'Enter both first name and surname');
    Object.assign(pupil,{firstName,surname,name:`${firstName} ${surname}`.replace(/\s+/g,' ').trim(),sex:String(b.sex||'').trim().toUpperCase().slice(0,1),examNo:String(b.examNo||'').trim(),parentPhone:String(b.parentPhone||'').trim()});
    saveDb(); return sendJson(res,200,{pupil,state:stateForUser(user)});
  }

  if (pupilMatch && req.method === 'DELETE') {
    const cls=userClass(user.id); if(!cls) return sendError(res,404,'Class not found');
    const pupil=db.pupils.find(p=>p.id===decodeURIComponent(pupilMatch[1])&&p.classId===cls.id&&p.active!==false);
    if(!pupil) return sendError(res,404,'Pupil not found');
    pupil.active=false; pupil.removedAt=nowIso(); saveDb(); return sendJson(res,200,{removed:true,state:stateForUser(user)});
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
server.listen(PORT,HOST,()=>{console.log(`Reportform ZM V${APP_VERSION} running on http://${HOST}:${PORT}`);console.log(`Simple data file: ${DATA_FILE}`);console.log(`Online AI comments: ${OPENAI_API_KEY?'configured':'not configured (Smart Local fallback active)'}`);console.log('Account sign-in: disabled (single class-teacher mode).');});
