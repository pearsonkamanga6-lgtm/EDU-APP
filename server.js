'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const APP_VERSION = '3.1.11';
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = process.env.EDUSEND_DATA_DIR || path.join(ROOT, 'data');
const WORKSPACE_DIR = path.join(DATA_DIR, 'workspaces');
const RECOVERY_DIR = path.join(DATA_DIR, 'recovery');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim();
const OPENAI_MODEL = String(process.env.OPENAI_MODEL || 'gpt-4o-mini').trim();
const OPENAI_API_URL = String(process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions').trim();
const BASE_ASSESSMENT_NAMES = ['Week 4 Assessment','Week 8 Assessment','End of Term Test'];
const GRADE12_EXTRA_ASSESSMENTS = ['Pre-Mock Exam','Mock Exam','Post-Mock Exam'];
const ASSESSMENT_NAMES = [...BASE_ASSESSMENT_NAMES,...GRADE12_EXTRA_ASSESSMENTS];
const COOKIE_NAME = 'reportform_workspace';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2;

fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
fs.mkdirSync(RECOVERY_DIR, { recursive: true });

const nowIso = () => new Date().toISOString();
const id = prefix => `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;
const normalizeGradingSystem = value => ['OBC','LEGACY'].includes(String(value || '').trim().toUpperCase()) ? 'OBC' : 'CBC';
const normalizeSchoolType = value => ['DAY','BOARDING'].includes(String(value||'').trim().toUpperCase()) ? String(value).trim().toUpperCase() : '';
const normalizeAssessmentName = value => ASSESSMENT_NAMES.includes(String(value||'').trim()) ? String(value).trim() : 'Week 4 Assessment';
const normalizeGradeLevel = value => {
  const v=String(value||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(['FORM1','FORM2','GRADE10','GRADE11','GRADE12'].includes(v)) return v;
  return 'OTHER';
};
const normalizeStream = value => String(value||'').trim().toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,8);
function parseClassParts(value){
  const raw=String(value||'').trim(); let m;
  if((m=raw.match(/^FORM\s*1\s*([A-Z0-9-]+)?$/i))) return {gradeLevel:'FORM1',stream:normalizeStream(m[1]||'')};
  if((m=raw.match(/^FORM\s*2\s*([A-Z0-9-]+)?$/i))) return {gradeLevel:'FORM2',stream:normalizeStream(m[1]||'')};
  if((m=raw.match(/^(?:GRADE\s*)?(10|11|12)\s*([A-Z0-9-]+)?$/i))) return {gradeLevel:`GRADE${m[1]}`,stream:normalizeStream(m[2]||'')};
  return {gradeLevel:'OTHER',stream:''};
}
function classNameFromParts(gradeLevel,stream,custom=''){
  const g=normalizeGradeLevel(gradeLevel),st=normalizeStream(stream);
  if(g==='FORM1') return `Form 1${st}`.trim();
  if(g==='FORM2') return `Form 2${st}`.trim();
  if(g==='GRADE10') return `10${st}`.trim();
  if(g==='GRADE11') return `11${st}`.trim();
  if(g==='GRADE12') return `12${st}`.trim();
  return String(custom||'').trim();
}
const isGrade12Class = (className,gradeLevel='') => normalizeGradeLevel(gradeLevel)==='GRADE12' || parseClassParts(className).gradeLevel==='GRADE12';
const assessmentNamesForClass = (className,gradeLevel='') => isGrade12Class(className,gradeLevel) ? ASSESSMENT_NAMES : BASE_ASSESSMENT_NAMES;
const normalizeAssessmentForClass = (value,className,gradeLevel='') => { const name=normalizeAssessmentName(value); return assessmentNamesForClass(className,gradeLevel).includes(name)?name:'Week 4 Assessment'; };
const normalizeTerm = value => ['Term 1','Term 2','Term 3'].includes(String(value||'').trim()) ? String(value).trim() : 'Term 1';
const normalizeAcademicYear = value => { const n=Number(value); return Number.isInteger(n)&&n>=2020&&n<=2100 ? String(n) : String(new Date().getFullYear()); };
const normalizeSchoolDateType = value => ['OPENS','CLOSES'].includes(String(value||'').trim().toUpperCase()) ? String(value).trim().toUpperCase() : '';
const normalizeSchoolDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value||'').trim()) ? String(value).trim() : '';

function emptyDb() {
  return { schema:'simple-class-teacher-v2', version:2, users:[], classes:[], subjects:[], pupils:[], assessments:[], marks:{}, updatedAt:nowIso() };
}

function migrateDb(input) {
  const db = input && typeof input === 'object' ? input : emptyDb();
  db.schema = 'simple-class-teacher-v2'; db.version = 2;
  db.users = Array.isArray(db.users) ? db.users : [];
  db.classes = Array.isArray(db.classes) ? db.classes : [];
  db.subjects = Array.isArray(db.subjects) ? db.subjects : [];
  db.pupils = Array.isArray(db.pupils) ? db.pupils : [];
  db.assessments = Array.isArray(db.assessments) ? db.assessments : [];
  db.marks = db.marks && typeof db.marks === 'object' ? db.marks : {};
  for (const cls of db.classes) {
    cls.gradingSystem = normalizeGradingSystem(cls.gradingSystem);
    cls.schoolType = normalizeSchoolType(cls.schoolType);
    cls.term = normalizeTerm(cls.term);
    cls.academicYear = normalizeAcademicYear(cls.academicYear);
    const parsedClass=parseClassParts(cls.name);
    cls.gradeLevel=normalizeGradeLevel(cls.gradeLevel||parsedClass.gradeLevel);
    cls.stream=normalizeStream(cls.stream||parsedClass.stream);
    if (cls.teacherName === undefined) cls.teacherName = '';
    if (cls.teacherPhone === undefined) cls.teacherPhone = '';
  }
  for (const a of db.assessments) {
    a.name = normalizeAssessmentName(a.name);
    a.term = normalizeTerm(a.term);
    a.academicYear = normalizeAcademicYear(a.academicYear);
    a.schoolDateType = normalizeSchoolDateType(a.schoolDateType);
    a.schoolDate = normalizeSchoolDate(a.schoolDate);
  }
  for (const p of db.pupils) {
    if (!p.firstName && !p.surname && p.name) {
      const parts=String(p.name).trim().split(/\s+/).filter(Boolean); p.firstName=parts.shift()||''; p.surname=parts.join(' ');
    }
    p.comments = p.comments && typeof p.comments === 'object' ? p.comments : {};
  }
  db.updatedAt = nowIso();
  return db;
}

function parseCookies(req){
  const out={}; for(const part of String(req.headers.cookie||'').split(';')){const i=part.indexOf('=');if(i>0)out[part.slice(0,i).trim()]=decodeURIComponent(part.slice(i+1).trim());} return out;
}
function workspaceKeyFor(req,res){
  const cookies=parseCookies(req); let key=String(cookies[COOKIE_NAME]||'');
  if(!/^[a-f0-9]{48}$/.test(key)){
    key=crypto.randomBytes(24).toString('hex');
    const secure=String(req.headers['x-forwarded-proto']||'').toLowerCase().includes('https');
    const cookie=`${COOKIE_NAME}=${key}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${secure?'; Secure':''}`;
    res.setHeader('Set-Cookie',cookie);
  }
  return key;
}

let storageMode = 'local-workspace';
const localQueues = new Map();

async function initStorage(){ storageMode='local-workspace'; }

function localFileFor(key){return path.join(WORKSPACE_DIR,crypto.createHash('sha256').update(key).digest('hex')+'.json');}
function readLocal(key){try{return migrateDb(JSON.parse(fs.readFileSync(localFileFor(key),'utf8')));}catch{return emptyDb();}}
function writeLocal(key,db){db.updatedAt=nowIso();const file=localFileFor(key),tmp=file+'.tmp';fs.writeFileSync(tmp,JSON.stringify(db,null,2));fs.renameSync(tmp,file);}

function recoveryKeyHash(key){return crypto.createHash('sha256').update(key).digest('hex');}
function recoveryWorkspaceDir(key){const dir=path.join(RECOVERY_DIR,recoveryKeyHash(key));fs.mkdirSync(dir,{recursive:true});return dir;}
function dbHasMeaningfulData(db){return !!((db?.subjects?.length||0)||(db?.pupils?.length||0)||(db?.classes||[]).some(c=>String(c?.teacherName||c?.schoolName||c?.name||'').trim())||Object.keys(db?.marks||{}).length);}
function listRecoverySnapshots(key){
  const dir=recoveryWorkspaceDir(key);
  try{return fs.readdirSync(dir).filter(n=>n.endsWith('.json')).map(name=>{const file=path.join(dir,name);const st=fs.statSync(file);let meta={};try{const raw=JSON.parse(fs.readFileSync(file,'utf8'));meta=raw?._recovery||{};}catch{}return{id:name,at:meta.at||st.mtime.toISOString(),reason:meta.reason||'Automatic recovery',size:st.size};}).sort((a,b)=>String(b.at).localeCompare(String(a.at)));}catch{return [];}
}
function writeRecoverySnapshot(key,db,reason='Automatic recovery',force=false){
  try{if(!dbHasMeaningfulData(db))return null;const dir=recoveryWorkspaceDir(key),existing=listRecoverySnapshots(key),now=Date.now();if(!force&&existing[0]&&now-new Date(existing[0].at).getTime()<10*60*1000)return existing[0];const at=nowIso(),safeAt=at.replace(/[:.]/g,'-'),name=`${safeAt}_${crypto.randomBytes(3).toString('hex')}.json`,payload={_recovery:{at,reason,appVersion:APP_VERSION},data:db};fs.writeFileSync(path.join(dir,name),JSON.stringify(payload));const all=listRecoverySnapshots(key);for(const item of all.slice(120)){try{fs.unlinkSync(path.join(dir,item.id));}catch{}}for(const item of all){if(now-new Date(item.at).getTime()>365*24*60*60*1000){try{fs.unlinkSync(path.join(dir,item.id));}catch{}}}return{id:name,at,reason};}catch(err){console.warn('Recovery snapshot failed:',err.message);return null;}
}
function readRecoverySnapshot(key,snapshotId){const id=path.basename(String(snapshotId||''));if(!id.endsWith('.json'))throw new Error('Invalid recovery snapshot');const file=path.join(recoveryWorkspaceDir(key),id);if(!fs.existsSync(file))throw Object.assign(new Error('Recovery snapshot not found'),{status:404});const raw=JSON.parse(fs.readFileSync(file,'utf8'));return migrateDb(raw?.data||raw);}

async function withWorkspace(key,fn){
  const prev=localQueues.get(key)||Promise.resolve();
  const run=prev.catch(()=>{}).then(async()=>{const db=readLocal(key);const result=await fn(db);writeLocal(key,db);return result;});
  const tracked=run.finally(()=>{if(localQueues.get(key)===tracked)localQueues.delete(key);});
  localQueues.set(key,tracked);
  return run;
}

async function readWorkspace(key,fn){ return fn(readLocal(key)); }

function safeUser(u){if(!u)return null;const {pinHash,...rest}=u;return rest;}
function sendJson(res,status,obj){const body=JSON.stringify(obj);res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(body);}
function sendError(res,status,error){sendJson(res,status,{error});}
function readJson(req){return new Promise((resolve,reject)=>{let raw='';req.on('data',c=>{raw+=c;if(raw.length>2_000_000)req.destroy();});req.on('end',()=>{try{resolve(raw?JSON.parse(raw):{});}catch{reject(new Error('Invalid JSON'));}});req.on('error',reject);});}

function ctx(db){
  const userClass=userId=>db.classes.find(c=>c.teacherUserId===userId)||null;
  const classSubjects=classId=>db.subjects.filter(s=>s.classId===classId&&s.active!==false);
  const classPupils=classId=>db.pupils.filter(p=>p.classId===classId&&p.active!==false);
  const markKey=(assessmentId,pupilId,subjectId)=>`${assessmentId}:${pupilId}:${subjectId}`;
  function userAssessment(userId){
    const c=userClass(userId);if(!c)return null;
    if(c.activeAssessmentId){const byId=db.assessments.find(a=>a.id===c.activeAssessmentId&&a.classId===c.id);if(byId)return byId;}
    const desired=String(c.activeAssessmentName||'').trim(),term=normalizeTerm(c.term),year=normalizeAcademicYear(c.academicYear);
    if(desired){const hit=db.assessments.find(a=>a.classId===c.id&&a.name===desired&&normalizeTerm(a.term)===term&&normalizeAcademicYear(a.academicYear)===year);if(hit)return hit;}
    return db.assessments.find(a=>a.classId===c.id)||null;
  }
  function ensureAssessment(cls,name,term=cls.term,academicYear=cls.academicYear,inheritFrom=null){
    const assessmentName=normalizeAssessmentForClass(name,cls.name,cls.gradeLevel),assessmentTerm=normalizeTerm(term),assessmentYear=normalizeAcademicYear(academicYear);
    let a=db.assessments.find(x=>x.classId===cls.id&&x.name===assessmentName&&normalizeTerm(x.term)===assessmentTerm&&normalizeAcademicYear(x.academicYear)===assessmentYear);
    if(!a){a={id:id('assess'),classId:cls.id,name:assessmentName,term:assessmentTerm,academicYear:assessmentYear,schoolDateType:inheritFrom?.schoolDateType||'',schoolDate:inheritFrom?.schoolDate||'',createdAt:nowIso()};db.assessments.push(a);}
    a.term=assessmentTerm;a.academicYear=assessmentYear;a.schoolDateType=normalizeSchoolDateType(a.schoolDateType);a.schoolDate=normalizeSchoolDate(a.schoolDate);cls.activeAssessmentId=a.id;cls.activeAssessmentName=assessmentName;return a;
  }
  function standaloneUser(){
    let user=(db.users||[]).find(u=>u.active!==false&&userClass(u.id))||(db.users||[]).find(u=>u.active!==false)||null;
    if(!user){user={id:id('usr'),name:'',phone:'',identifier:'workspace',active:true,createdAt:nowIso()};db.users.push(user);}
    let cls=userClass(user.id);
    if(!cls){cls={id:id('cls'),teacherUserId:user.id,teacherName:'',teacherPhone:'',schoolName:'',schoolType:'',name:'',gradeLevel:'OTHER',stream:'',gradingSystem:'CBC',term:'Term 1',academicYear:String(new Date().getFullYear()),activeAssessmentName:'Week 4 Assessment',createdAt:nowIso()};db.classes.push(cls);}
    let assessment=userAssessment(user.id);
    if(!assessment||!assessmentNamesForClass(cls.name,cls.gradeLevel).includes(assessment.name))assessment=ensureAssessment(cls,'Week 4 Assessment');
    for(const p of classPupils(cls.id)){p.comments=p.comments&&typeof p.comments==='object'?p.comments:{};if(p.classTeacherComment&&Object.keys(p.comments).length===0){p.comments[assessment.id]=String(p.classTeacherComment);p.classTeacherComment='';}}
    return user;
  }
  return{db,userClass,classSubjects,classPupils,markKey,userAssessment,ensureAssessment,standaloneUser};
}

function cleanMark(value){if(String(value||'').trim().toUpperCase()==='ABSENT')return'ABSENT';if(value===null||value===undefined||value==='')return null;const n=Number(value);if(!Number.isFinite(n)||n<0||n>100)throw new Error('Marks must be between 0 and 100');return Math.round(n*10)/10;}
function gradeCBC(mark){const n=Number(mark);return n>=70?1:n>=60?2:n>=50?3:n>=40?4:5;}
function remarkCBC(g){return ['','Outstanding','Advanced','Basic','Satisfactory','Unsatisfactory'][g]||'';}
function gradeOBC(mark){const n=Number(mark);return n>=75?1:n>=70?2:n>=65?3:n>=60?4:n>=55?5:n>=50?6:n>=45?7:n>=40?8:9;}
function remarkOBC(g){return g===1?'Excellent':g===2?'Very Good':g<=4?'Good':g<=6?'Satisfactory':g<=8?'Fair':'Fail';}
function pronouns(sex){const s=String(sex||'').toUpperCase();if(s==='F')return{subj:'She',subjL:'she',obj:'her',poss:'her'};if(s==='M')return{subj:'He',subjL:'he',obj:'him',poss:'his'};return{subj:'The learner',subjL:'the learner',obj:'the learner',poss:'their'};}
function humanDate(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return'';const[y,m,d]=String(value).split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});}
function schoolCalendarText(a){if(!a?.schoolDateType||!a?.schoolDate)return'';return `School ${a.schoolDateType==='OPENS'?'opens':'closes'} on ${humanDate(a.schoolDate)}`;}

function pupilReportSnapshot(db,user,pupil){
  const c=ctx(db),cls=c.userClass(user.id),assessment=c.userAssessment(user.id);if(!cls||!assessment)return null;
  const subjects=c.classSubjects(cls.id),isCBC=cls.gradingSystem==='CBC';
  const rows=subjects.map(s=>{const raw=db.marks[c.markKey(assessment.id,pupil.id,s.id)],absent=raw==='ABSENT';const has=!absent&&raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(Number(raw));const visited=absent||has,mark=has?Number(raw):null,grade=has?(isCBC?gradeCBC(mark):gradeOBC(mark)):null;return{subject:s.name,mark,grade,status:absent?'absent':has?'mark':'pending',visited,remark:absent?'Absent / Did not write':has?(isCBC?remarkCBC(grade):remarkOBC(grade)):'Pending'};});
  const entered=rows.filter(r=>r.status==='mark'),completed=rows.filter(r=>r.visited),absent=rows.filter(r=>r.status==='absent'),complete=completed.length===rows.length&&rows.length>0;const strongest=[...entered].sort((a,b)=>b.mark-a.mark).slice(0,3),weakest=[...entered].sort((a,b)=>a.mark-b.mark).slice(0,3);const summary={complete,entered:entered.length,sat:entered.length,completedCount:completed.length,absentCount:absent.length,total:rows.length};
  if(entered.length)summary.average=Math.round(entered.reduce((n,x)=>n+x.mark,0)/entered.length*10)/10;
  if(!isCBC&&entered.length){const best=[...entered].sort((a,b)=>b.mark-a.mark).slice(0,6);summary.best6Count=best.length;summary.best6=best.reduce((n,x)=>n+x.mark,0);summary.points=best.reduce((n,x)=>n+x.grade,0);if(best.length>=6)summary.division=summary.points<=12?'I':summary.points<=17?'II':summary.points<=24?'III':summary.points<=35?'IV':'FAIL';}
  if(isCBC&&entered.length)summary.averageGrade=gradeCBC(summary.average);
  return{school:cls.schoolName,schoolType:cls.schoolType||'',className:cls.name,term:cls.term,academicYear:cls.academicYear,assessment:assessment.name,schoolDateType:assessment.schoolDateType||'',schoolDate:assessment.schoolDate||'',schoolCalendar:schoolCalendarText(assessment),gradingSystem:cls.gradingSystem,pupil:{name:pupil.name,firstName:pupil.firstName,surname:pupil.surname,sex:pupil.sex,examNo:pupil.examNo},rows,summary,strongest,weakest,missing:rows.filter(r=>r.status==='pending').map(r=>r.subject),absent:rows.filter(r=>r.status==='absent').map(r=>r.subject)};
}

function smartLocalComment(snapshot){
  if(!snapshot)return'Results are not available yet.';const{pupil,summary,strongest,weakest,school,schoolType,assessment,gradingSystem,missing,schoolCalendar}=snapshot;const name=pupil.name||'This pupil',pr=pronouns(pupil.sex),boarding=schoolType==='BOARDING',endTerm=assessment==='End of Term Test';
  if(!summary.entered)return`Dear Parent/Guardian, results for ${name} have not yet been entered for ${assessment}. The report will be completed once the subject marks are available.`;
  if(!summary.complete){const miss=missing.slice(0,3).join(', ');return`Dear Parent/Guardian, ${name}'s result record for ${assessment} is not yet complete. ${summary.completedCount} of ${summary.total} subjects have been checked${miss?`, while ${miss}${missing.length>3?' and other subjects':''} are still pending`:''}. A final overall judgement should be made after all required results are entered.`;}
  const best=strongest[0],weak=weakest[0];let text=`Dear Parent/Guardian, ${name} completed ${assessment} at ${school}. `;
  if(gradingSystem==='CBC'){const g=gradeCBC(summary.average);text+=`${pr.subj} obtained an overall average of ${summary.average}%, which is CBC Grade ${g} (${remarkCBC(g)}). `;}else if(summary.best6Count>=6)text+=`${pr.subj} recorded a Best 6 total of ${summary.best6}/600, ${summary.points} grade points and Division ${summary.division}. `;else text+=`${pr.subj} obtained an average of ${summary.average}% across the ${summary.entered} subjects written. `;
  if(best)text+=`${pr.subj} performed strongest in ${best.subject} with ${best.mark}%. `;
  if(weak&&(!best||weak.subject!==best.subject)){const weakDesc=gradingSystem==='CBC'?remarkCBC(gradeCBC(weak.mark)):`Grade ${gradeOBC(weak.mark)} (${remarkOBC(gradeOBC(weak.mark))})`;text+=`To strengthen the overall result, ${pr.subjL} should give more attention to ${weak.subject}, where the mark was ${weak.mark}%${weakDesc?` — ${weakDesc}`:''}. `;}
  if(boarding&&!endTerm)text+=`As ${name} is still at boarding school, please use the available calls, visits or messages to encourage ${pr.obj} to remain focused, revise consistently and seek help from subject teachers in weaker areas. `;
  else if(boarding&&endTerm)text+=`As ${name} is now with you for the holiday, please continue encouraging ${pr.obj}, help ${pr.obj} maintain a simple revision routine and give particular attention to weaker subjects${snapshot.schoolDateType==='OPENS'&&snapshot.schoolDate?` before school reopens on ${humanDate(snapshot.schoolDate)}`:' before school reopens'}. `;
  else if(endTerm)text+=`During the holiday, please continue encouraging ${pr.obj} to keep a balanced revision routine, correct mistakes from this assessment and prepare steadily for the next term. `;
  else text+=`Please continue supporting regular home revision, discussion of schoolwork and timely attention to weaker subjects before the next assessment. `;
  if(schoolCalendar)text+=`${schoolCalendar}. `;text+=`Continued encouragement from both home and school can help strengthen the next result.`;return text;
}

function aiSystemPrompt(snapshot){
  const scale=snapshot.gradingSystem==='CBC'?'CBC scale: 70-100 Grade 1 Outstanding; 60-69 Grade 2 Advanced; 50-59 Grade 3 Basic; 40-49 Grade 4 Satisfactory; 0-39 Grade 5 Unsatisfactory. Do not use Grade 6-9 or Division I-IV for CBC.':'OBC scale: 75-100 Grade 1; 70-74 Grade 2; 65-69 Grade 3; 60-64 Grade 4; 55-59 Grade 5; 50-54 Grade 6; 45-49 Grade 7; 40-44 Grade 8; 0-39 Grade 9. Best 6 points determine the displayed division in the supplied data.';
  const boarding=snapshot.schoolType==='BOARDING',endTerm=snapshot.assessment==='End of Term Test',mockExam=/Mock Exam$/i.test(snapshot.assessment);let context;
  if(boarding&&!endTerm)context=mockExam?'This is a boarding school and a Grade 12 mock-series examination. The learner is still at school. Address the parent/guardian as someone who may have limited direct contact. Encourage them to use available calls, visits or messages to motivate the learner and to work with the school where support is needed. Do NOT tell the parent to supervise daily home study because the learner is still boarding.':'This is a boarding school and this is a Week 4 or Week 8 progress assessment. The learner is still at school. Address the parent/guardian as someone who may have limited direct contact. Encourage them to use available calls, visits or messages to motivate the learner and to work with the school where support is needed. Do NOT tell the parent to supervise daily home study because the learner is still boarding.';
  else if(boarding&&endTerm)context='This is a boarding school and the End of Term Test. The learner is now with the parent/guardian for the holiday. Encourage the parent to continue motivating the learner at home, help maintain a realistic holiday revision routine, focus on weaker subjects, correct mistakes, and prepare for reopening while allowing reasonable rest.';
  else if(endTerm)context='This is a day school and the End of Term Test. The learner is with the family during the holiday. Encourage balanced holiday revision and preparation for the next term.';
  else context='This is a day school. The learner normally returns home daily. Encourage appropriate home support, regular revision and discussion of schoolwork without inventing family circumstances.';
  if(mockExam)context+=` This is a Grade 12 ${snapshot.assessment}. Treat it as an examination-readiness assessment: advise the parent/guardian to encourage correction of examination weaknesses, past-paper practice, time management and focused preparation for the next examination, without inventing readiness facts.`;
  const calendar=snapshot.schoolCalendar?` The report states: ${snapshot.schoolCalendar}. Use this date naturally when relevant, especially for holiday/reopening advice, but do not repeat it awkwardly.`:'';
  return`You write class-teacher comments for Zambian school report forms. Produce one polished paragraph only, about 90-150 words. Make it natural, specific, parent-friendly, encouraging and professional. Analyse only the supplied pupil data: actual marks, strongest and weakest subjects, grading, Best 6/points/division when supplied, assessment, school type, genuinely missing marks and subjects marked absent. ${scale} ${context}${calendar} Never invent attendance, discipline, conduct, improvement/decline over time, family circumstances or personal qualities that are not present in the data. If results are incomplete, say so tactfully and do not invent missing marks. Give practical advice based on weaker entered subjects. Do not use bullets, markdown, headings or quotation marks.`;
}
async function generateOnlineComment(snapshot){if(!OPENAI_API_KEY)return null;const res=await fetch(OPENAI_API_URL,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${OPENAI_API_KEY}`},body:JSON.stringify({model:OPENAI_MODEL,messages:[{role:'system',content:aiSystemPrompt(snapshot)},{role:'user',content:`Generate one class teacher comment for this report form.\n\nPupil data:\n${JSON.stringify(snapshot,null,2)}`}],temperature:.7,max_tokens:260})});const raw=await res.text();let data;try{data=JSON.parse(raw);}catch{data={raw};}if(!res.ok)throw new Error(data?.error?.message||raw.slice(0,240)||`AI request failed (${res.status})`);const content=data?.choices?.[0]?.message?.content;if(typeof content==='string'&&content.trim())return content.replace(/^['"\s]+|['"\s]+$/g,'').trim();if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text.trim();return null;}

function stateForUser(db,user,workspaceKey){const c=ctx(db),cls=c.userClass(user.id),assessment=c.userAssessment(user.id),subjects=cls?c.classSubjects(cls.id):[],sourcePupils=cls?c.classPupils(cls.id):[],pupils=sourcePupils.map(p=>({...p,classTeacherComment:assessment?String(p.comments?.[assessment.id]||''):''})),marks={},trash={subjects:[],pupils:[]};if(cls){trash.subjects=(db.subjects||[]).filter(s=>s.classId===cls.id&&s.active===false).map(s=>({id:s.id,name:s.name,removedAt:s.removedAt||''}));trash.pupils=(db.pupils||[]).filter(p=>p.classId===cls.id&&p.active===false).map(p=>({id:p.id,name:p.name,firstName:p.firstName,surname:p.surname,sex:p.sex,removedAt:p.removedAt||''}));}if(assessment){for(const p of sourcePupils){marks[p.id]={};for(const s of subjects)marks[p.id][s.id]=db.marks[c.markKey(assessment.id,p.id,s.id)]??null;}}return{version:APP_VERSION,user:safeUser(user),class:cls,assessment,assessmentOptions:cls?assessmentNamesForClass(cls.name,cls.gradeLevel):BASE_ASSESSMENT_NAMES,subjects,pupils,marks,trash,recovery:{serverSnapshots:listRecoverySnapshots(workspaceKey).slice(0,10)},ai:{onlineConfigured:!!OPENAI_API_KEY},storage:{mode:storageMode,multiTeacherReady:true,durableCloud:false,workspace:String(workspaceKey).slice(-8)}};}

async function workspaceApi(db,workspaceKey,req,urlObj){
  const c=ctx(db),pathname=urlObj.pathname,user=c.standaloneUser();
  if(req.method==='GET'&&(pathname==='/api/me'||pathname==='/api/class-data'))return{status:200,body:stateForUser(db,user,workspaceKey)};
  if(req.method==='GET'&&pathname==='/api/backup')return{status:200,body:{appVersion:APP_VERSION,exportedAt:nowIso(),data:db}};
  if(req.method==='POST'&&pathname==='/api/restore'){const b=await readJson(req),restored=migrateDb(b?.data||b);for(const k of Object.keys(db))delete db[k];Object.assign(db,restored);const restoredUser=ctx(db).standaloneUser();return{status:200,body:{restored:true,state:stateForUser(db,restoredUser,workspaceKey)}};}
  if(req.method==='PUT'&&pathname==='/api/setup'){
    const b=await readJson(req),cls=c.userClass(user.id);if(!cls)return{status:404,body:{error:'Class not found'}};
    const teacherName=String(b.teacherName||'').trim(),teacherPhone=String(b.teacherPhone||'').trim(),schoolName=String(b.schoolName||'').trim();
    const gradeLevel=normalizeGradeLevel(b.gradeLevel),stream=normalizeStream(b.stream),className=classNameFromParts(gradeLevel,stream,b.className),assessmentName=normalizeAssessmentForClass(b.assessmentName,className,gradeLevel),gradingSystem=normalizeGradingSystem(b.gradingSystem),schoolType=normalizeSchoolType(b.schoolType),term=normalizeTerm(b.term),academicYear=normalizeAcademicYear(b.academicYear),schoolDateType=normalizeSchoolDateType(b.schoolDateType),schoolDate=normalizeSchoolDate(b.schoolDate);
    if(!teacherName||!teacherPhone||!schoolName||!className||!schoolType)return{status:400,body:{error:'Class teacher name, phone number, school, class and school type are required'}};
    if(!schoolDateType||!schoolDate)return{status:400,body:{error:'Choose whether school opens or closes, then select the date'}};
    user.name=teacherName;user.phone=teacherPhone;cls.teacherName=teacherName;cls.teacherPhone=teacherPhone;cls.schoolName=schoolName;cls.schoolType=schoolType;cls.name=className;cls.gradeLevel=gradeLevel;cls.stream=stream;cls.gradingSystem=gradingSystem;cls.term=term;cls.academicYear=academicYear;
    const assessment=c.ensureAssessment(cls,assessmentName,term,academicYear,c.userAssessment(user.id));assessment.schoolDateType=schoolDateType;assessment.schoolDate=schoolDate;
    return{status:200,body:stateForUser(db,user,workspaceKey)};
  }
  if(req.method==='PUT'&&pathname==='/api/assessment'){
    const b=await readJson(req),cls=c.userClass(user.id);if(!cls)return{status:404,body:{error:'Class not found'}};const previous=c.userAssessment(user.id),assessmentName=normalizeAssessmentForClass(b.assessmentName,cls.name,cls.gradeLevel),term=normalizeTerm(b.term||cls.term),academicYear=normalizeAcademicYear(b.academicYear||cls.academicYear);cls.term=term;cls.academicYear=academicYear;c.ensureAssessment(cls,assessmentName,term,academicYear,previous);return{status:200,body:stateForUser(db,user,workspaceKey)};
  }
  if(req.method==='POST'&&pathname==='/api/subjects'){
    const b=await readJson(req),cls=c.userClass(user.id);if(!cls)return{status:404,body:{error:'Class not found'}};const current=c.classSubjects(cls.id);if(current.length>=10)return{status:400,body:{error:'Maximum 10 subjects allowed for one class'}};const name=String(b.name||'').trim().replace(/\s+/g,' ');if(!name)return{status:400,body:{error:'Enter the subject name'}};if(current.some(s=>s.name.toLowerCase()===name.toLowerCase()))return{status:409,body:{error:'That subject is already in this class'}};const subject={id:id('sub'),classId:cls.id,name,active:true,createdAt:nowIso()};db.subjects.push(subject);return{status:201,body:{subject,state:stateForUser(db,user,workspaceKey)}};
  }
  const subjectMatch=pathname.match(/^\/api\/subjects\/([^/]+)$/);
  if(subjectMatch&&req.method==='PUT'){const cls=c.userClass(user.id),subject=cls&&db.subjects.find(s=>s.id===decodeURIComponent(subjectMatch[1])&&s.classId===cls.id&&s.active!==false);if(!subject)return{status:404,body:{error:'Subject not found'}};const b=await readJson(req),name=String(b.name||'').trim().replace(/\s+/g,' ');if(!name)return{status:400,body:{error:'Enter the subject name'}};if(c.classSubjects(cls.id).some(s=>s.id!==subject.id&&s.name.toLowerCase()===name.toLowerCase()))return{status:409,body:{error:'That subject is already in this class'}};subject.name=name;return{status:200,body:{subject,state:stateForUser(db,user,workspaceKey)}};}
  if(subjectMatch&&req.method==='DELETE'){const cls=c.userClass(user.id),subject=cls&&db.subjects.find(s=>s.id===decodeURIComponent(subjectMatch[1])&&s.classId===cls.id&&s.active!==false);if(!subject)return{status:404,body:{error:'Subject not found'}};subject.active=false;subject.removedAt=nowIso();return{status:200,body:{removed:true,state:stateForUser(db,user,workspaceKey)}};}

  if(req.method==='POST'&&pathname==='/api/screenshot-import'){
    const b=await readJson(req),cls=c.userClass(user.id),assessment=c.userAssessment(user.id);if(!cls||!assessment)return{status:404,body:{error:'Class or assessment not found'}};
    const rows=Array.isArray(b.rows)?b.rows.slice(0,120):[],subjects=c.classSubjects(cls.id),current=c.classPupils(cls.id);
    if(!rows.length)return{status:400,body:{error:'No pupil rows were supplied for import'}};
    const norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
    const map=new Map();
    for(const p of current){const direct=norm(`${p.firstName||''}${p.surname||''}`)||norm(p.name),reverse=norm(`${p.surname||''}${p.firstName||''}`);if(direct)map.set(direct,p);if(reverse)map.set(reverse,p);}
    let created=0,matched=0,marksSaved=0,skipped=0;
    for(const row of rows){
      const firstName=String(row.firstName||'').trim(),surname=String(row.surname||'').trim(),sex=String(row.sex||'').trim().toUpperCase().slice(0,1);
      if(!firstName||!surname){skipped++;continue;}
      const key=norm(firstName+surname);let pupil=map.get(key);
      if(!pupil){
        if(c.classPupils(cls.id).length>=120)break;
        if(!['F','M'].includes(sex)){skipped++;continue;}
        pupil={id:id('p'),classId:cls.id,firstName,surname,name:`${firstName} ${surname}`.replace(/\s+/g,' ').trim(),sex,examNo:'',parentPhone:'',classTeacherComment:'',comments:{},active:true,createdAt:nowIso()};
        db.pupils.push(pupil);map.set(key,pupil);created++;
      }else{
        matched++;
        pupil.firstName=firstName;pupil.surname=surname;pupil.name=`${firstName} ${surname}`.replace(/\s+/g,' ').trim();
        if(['F','M'].includes(sex))pupil.sex=sex;
        map.set(norm(firstName+surname),pupil);map.set(norm(surname+firstName),pupil);
      }
      if(String(b.mode||'').toUpperCase()==='RESULTS'&&Array.isArray(row.marks)){
        for(let i=0;i<subjects.length&&i<row.marks.length;i++){
          const raw=row.marks[i];if(raw===null||raw===undefined||raw==='')continue;
          const mark=cleanMark(raw);if(mark===null)continue;
          db.marks[c.markKey(assessment.id,pupil.id,subjects[i].id)]=mark;marksSaved++;
        }
      }
    }
    return{status:200,body:{created,matched,marksSaved,skipped,state:stateForUser(db,user,workspaceKey)}};
  }
  if(req.method==='POST'&&pathname==='/api/pupils'){
    const b=await readJson(req),cls=c.userClass(user.id);if(!cls)return{status:404,body:{error:'Class not found'}};if(c.classPupils(cls.id).length>=120)return{status:400,body:{error:'This class already has the maximum of 120 pupils'}};const firstName=String(b.firstName||'').trim(),surname=String(b.surname||'').trim(),sex=String(b.sex||'').trim().toUpperCase().slice(0,1);if(!firstName||!surname)return{status:400,body:{error:'Enter both first name and surname'}};if(!['F','M'].includes(sex))return{status:400,body:{error:'Select the pupil sex: Male or Female'}};const pupil={id:id('p'),classId:cls.id,firstName,surname,name:`${firstName} ${surname}`.replace(/\s+/g,' ').trim(),sex,examNo:String(b.examNo||'').trim(),parentPhone:String(b.parentPhone||'').trim(),classTeacherComment:'',comments:{},active:true,createdAt:nowIso()};db.pupils.push(pupil);return{status:201,body:{pupil,state:stateForUser(db,user,workspaceKey)}};
  }
  const pupilCommentMatch=pathname.match(/^\/api\/pupils\/([^/]+)\/comment$/);
  if(pupilCommentMatch&&req.method==='PUT'){const cls=c.userClass(user.id),pupil=cls&&db.pupils.find(p=>p.id===decodeURIComponent(pupilCommentMatch[1])&&p.classId===cls.id&&p.active!==false),assessment=c.userAssessment(user.id);if(!pupil)return{status:404,body:{error:'Pupil not found'}};if(!assessment)return{status:404,body:{error:'Assessment not found'}};const b=await readJson(req),comment=String(b.comment||'').trim().slice(0,4000);pupil.comments=pupil.comments&&typeof pupil.comments==='object'?pupil.comments:{};pupil.comments[assessment.id]=comment;pupil.classTeacherComment='';return{status:200,body:{saved:true,comment,state:stateForUser(db,user,workspaceKey)}};}
  const pupilMatch=pathname.match(/^\/api\/pupils\/([^/]+)$/);
  if(pupilMatch&&req.method==='PUT'){const cls=c.userClass(user.id),pupil=cls&&db.pupils.find(p=>p.id===decodeURIComponent(pupilMatch[1])&&p.classId===cls.id&&p.active!==false);if(!pupil)return{status:404,body:{error:'Pupil not found'}};const b=await readJson(req),firstName=String(b.firstName||'').trim(),surname=String(b.surname||'').trim(),sex=String(b.sex||'').trim().toUpperCase().slice(0,1);if(!firstName||!surname)return{status:400,body:{error:'Enter both first name and surname'}};if(!['F','M'].includes(sex))return{status:400,body:{error:'Select the pupil sex: Male or Female'}};Object.assign(pupil,{firstName,surname,name:`${firstName} ${surname}`.replace(/\s+/g,' ').trim(),sex,examNo:String(b.examNo||'').trim(),parentPhone:String(b.parentPhone||'').trim()});return{status:200,body:{pupil,state:stateForUser(db,user,workspaceKey)}};}
  if(pupilMatch&&req.method==='DELETE'){const cls=c.userClass(user.id),pupil=cls&&db.pupils.find(p=>p.id===decodeURIComponent(pupilMatch[1])&&p.classId===cls.id&&p.active!==false);if(!pupil)return{status:404,body:{error:'Pupil not found'}};pupil.active=false;pupil.removedAt=nowIso();return{status:200,body:{removed:true,state:stateForUser(db,user,workspaceKey)}};}
  const restorePupilMatch=pathname.match(/^\/api\/trash\/pupils\/([^/]+)\/restore$/);
  if(restorePupilMatch&&req.method==='POST'){const cls=c.userClass(user.id),pupil=cls&&db.pupils.find(p=>p.id===decodeURIComponent(restorePupilMatch[1])&&p.classId===cls.id&&p.active===false);if(!pupil)return{status:404,body:{error:'Deleted pupil not found'}};pupil.active=true;delete pupil.removedAt;return{status:200,body:{restored:true,state:stateForUser(db,user,workspaceKey)}};}
  const restoreSubjectMatch=pathname.match(/^\/api\/trash\/subjects\/([^/]+)\/restore$/);
  if(restoreSubjectMatch&&req.method==='POST'){const cls=c.userClass(user.id),subject=cls&&db.subjects.find(s=>s.id===decodeURIComponent(restoreSubjectMatch[1])&&s.classId===cls.id&&s.active===false);if(!subject)return{status:404,body:{error:'Deleted subject not found'}};subject.active=true;delete subject.removedAt;return{status:200,body:{restored:true,state:stateForUser(db,user,workspaceKey)}};}
  if(req.method==='PUT'&&pathname==='/api/results'){const b=await readJson(req),cls=c.userClass(user.id),assessment=c.userAssessment(user.id);if(!cls||!assessment)return{status:404,body:{error:'Class not found'}};const allowedPupils=new Set(c.classPupils(cls.id).map(p=>p.id)),allowedSubjects=new Set(c.classSubjects(cls.id).map(s=>s.id)),rows=Array.isArray(b.rows)?b.rows:[];for(const r of rows){if(!allowedPupils.has(r.pupilId)||!allowedSubjects.has(r.subjectId))continue;db.marks[c.markKey(assessment.id,r.pupilId,r.subjectId)]=cleanMark(r.mark);}return{status:200,body:{saved:true,at:nowIso()}};}
  return{status:404,body:{error:'API endpoint not found'}};
}

async function api(req,res,urlObj){
  const pathname=urlObj.pathname;
  if(req.method==='GET'&&pathname==='/api/version')return sendJson(res,200,{version:APP_VERSION,storage:storageMode});
  if(req.method==='GET'&&pathname==='/api/health')return sendJson(res,200,{ok:true,version:APP_VERSION,storage:storageMode});
  const workspaceKey=workspaceKeyFor(req,res);
  if(req.method==='POST'&&pathname==='/api/ai-comment'){
    const b=await readJson(req);
    const snap=await readWorkspace(workspaceKey,db=>{const c=ctx(db),user=c.standaloneUser(),cls=c.userClass(user.id),pupil=cls&&db.pupils.find(p=>p.id===String(b.pupilId||'')&&p.classId===cls.id&&p.active!==false);if(!pupil)throw Object.assign(new Error('Pupil not found'),{status:404});return pupilReportSnapshot(db,user,pupil);});
    const fallback=smartLocalComment(snap);if(!OPENAI_API_KEY)return sendJson(res,200,{comment:fallback,source:'smart-local',message:'Online AI is not configured on the server. Smart Local comment generated.'});
    try{const comment=await generateOnlineComment(snap);return sendJson(res,200,{comment:comment||fallback,source:comment?'online-ai':'smart-local',message:comment?`AI comment generated with ${OPENAI_MODEL}.`:'AI returned no text. Smart Local comment generated.'});}catch(err){console.error('AI comment failed:',err.message);return sendJson(res,200,{comment:fallback,source:'smart-local',message:'Online AI was unavailable. Smart Local comment generated instead.'});}
  }
  if(req.method==='POST'&&pathname==='/api/recovery/restore'){const b=await readJson(req);const current=readLocal(workspaceKey);writeRecoverySnapshot(workspaceKey,current,'Before restoring an older version',true);const restored=readRecoverySnapshot(workspaceKey,b.snapshotId);writeLocal(workspaceKey,restored);const c=ctx(restored),user=c.standaloneUser();return sendJson(res,200,{restored:true,state:stateForUser(restored,user,workspaceKey)});}
  if(req.method!=='GET'){const current=readLocal(workspaceKey);const force=req.method==='DELETE'||pathname==='/api/restore';writeRecoverySnapshot(workspaceKey,current,force?'Before deletion or restore':'Automatic recovery',force);}
  const result=await withWorkspace(workspaceKey,db=>workspaceApi(db,workspaceKey,req,urlObj));return sendJson(res,result.status,result.body);
}

const MIME={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.svg':'image/svg+xml'};
function serveStatic(pathname,res){let rel=decodeURIComponent(pathname||'/');if(rel==='/'||rel==='')rel='/index.html';const file=path.normalize(path.join(PUBLIC_DIR,rel));if(!file.startsWith(PUBLIC_DIR))return false;let final=file;try{if(fs.statSync(final).isDirectory())final=path.join(final,'index.html');}catch{return false;}try{const data=fs.readFileSync(final);{const base=path.basename(final);const fresh=['service-worker.js','app.js','styles.css','index.html'].includes(base);res.writeHead(200,{'Content-Type':MIME[path.extname(final).toLowerCase()]||'application/octet-stream','Cache-Control':fresh?'no-store, no-cache, must-revalidate':'public, max-age=60'});}res.end(data);return true;}catch{return false;}}

const server=http.createServer(async(req,res)=>{const urlObj=new URL(req.url,`http://${req.headers.host||'localhost'}`);try{if(urlObj.pathname.startsWith('/api/')){await api(req,res,urlObj);return;}if(!serveStatic(urlObj.pathname,res))sendError(res,404,'Not found');}catch(err){console.error(err);if(!res.headersSent)sendError(res,err.status||500,err.message||'Server error');else res.end();}});

initStorage().then(()=>server.listen(PORT,HOST,()=>{console.log(`EduSend V${APP_VERSION} running on http://${HOST}:${PORT}`);console.log(`Storage: ${storageMode} (separate browser workspaces; no DATABASE_URL required)`);console.log(`Online AI comments: ${OPENAI_API_KEY?'configured':'not configured (Smart Local fallback active)'}`);console.log('Account sign-in: disabled; each browser receives a separate private class workspace.');})).catch(err=>{console.error('Could not initialise storage:',err);process.exit(1);});
