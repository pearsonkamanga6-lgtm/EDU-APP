(() => {
  const APP_VERSION='3.1.5';
  const app=document.getElementById('app');
  const state={me:null,page:'home',saveTimer:null};
  const esc=s=>String(s??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const byId=id=>document.getElementById(id);
  const BASE_ASSESSMENT_OPTIONS=['Week 4 Assessment','Week 8 Assessment','End of Term Test'];
  const GRADE12_EXTRA_ASSESSMENTS=['Pre-Mock Exam','Mock Exam','Post-Mock Exam'];
  const GRADE_LEVEL_OPTIONS=[['FORM1','Form 1'],['FORM2','Form 2'],['GRADE10','Grade 10'],['GRADE11','Grade 11'],['GRADE12','Grade 12'],['OTHER','Other class']];
  const STREAMS={FORM1:['L','M'],FORM2:['L','M'],GRADE10:['L','N','P','M'],GRADE11:['L','N','P','M'],GRADE12:['L','N','P','M']};
  function normalizeGradeLevel(value){const v=String(value||'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');return ['FORM1','FORM2','GRADE10','GRADE11','GRADE12'].includes(v)?v:'OTHER';}
  function parseClassSelection(value){const raw=String(value||'').trim();let m;if((m=raw.match(/^FORM\s*1\s*([A-Z0-9-]+)?$/i)))return{gradeLevel:'FORM1',stream:(m[1]||'').toUpperCase()};if((m=raw.match(/^FORM\s*2\s*([A-Z0-9-]+)?$/i)))return{gradeLevel:'FORM2',stream:(m[1]||'').toUpperCase()};if((m=raw.match(/^(?:GRADE\s*)?(10|11|12)\s*([A-Z0-9-]+)?$/i)))return{gradeLevel:`GRADE${m[1]}`,stream:(m[2]||'').toUpperCase()};return{gradeLevel:'OTHER',stream:''};}
  function classNameForSelection(gradeLevel,stream,customClass=''){const g=normalizeGradeLevel(gradeLevel),st=String(stream||'').trim().toUpperCase();if(g==='FORM1')return `Form 1${st}`;if(g==='FORM2')return `Form 2${st}`;if(g==='GRADE10')return `10${st}`;if(g==='GRADE11')return `11${st}`;if(g==='GRADE12')return `12${st}`;return String(customClass||'').trim();}
  function assessmentOptionsForClass(value,gradeLevel=''){const g=normalizeGradeLevel(gradeLevel||parseClassSelection(value).gradeLevel);return g==='GRADE12'?[...BASE_ASSESSMENT_OPTIONS,...GRADE12_EXTRA_ASSESSMENTS]:BASE_ASSESSMENT_OPTIONS;}
  const assessmentLabel=d=>d?.assessment?.name||'Week 4 Assessment';
  function workflowBar(step){
    const d=state.me||{}, details=profileComplete(), hasSubjects=(d.subjects?.length||0)>0, hasPupils=(d.pupils?.length||0)>0;
    const pupilDone=hasPupils&&(d.pupils||[]).every(p=>reportModel(d,p).summary.complete);
    const done={setup:details,subjects:hasSubjects,pupils:pupilDone,reports:pupilDone};
    const items=[['setup','1','Class details'],['subjects','2','Subjects'],['pupils','3','Pupils & results'],['reports','4','Reports']];
    return `<div class="workflow-bar">${items.map(([key,n,label])=>`<div class="workflow-step ${key===step?'current':''} ${done[key]?'done':''}"><span>${done[key]&&key!==step?'✓':n}</span><b>${label}</b></div>`).join('')}</div>`;
  }

  async function api(path,opts={}){
    const headers={...(opts.headers||{})};
    if(opts.body) headers['Content-Type']='application/json';
    const body=opts.body&&typeof opts.body!=='string'?JSON.stringify(opts.body):opts.body;
    const res=await fetch(path,{...opts,headers,body,cache:'no-store'});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error||`Request failed (${res.status})`);
    return data;
  }

  function toast(message,bad=false){
    let t=document.querySelector('.toast');
    if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t);}
    t.classList.toggle('bad',bad);t.textContent=message;t.style.display='block';clearTimeout(t._t);t._t=setTimeout(()=>t.style.display='none',2800);
  }

  function profileComplete(){
    const d=state.me;
    return !!(String(d?.class?.teacherName||d?.user?.name||'').trim() && String(d?.class?.teacherPhone||d?.user?.phone||'').trim() && String(d?.class?.schoolName||'').trim() && String(d?.class?.name||'').trim() && ['DAY','BOARDING'].includes(String(d?.class?.schoolType||'').toUpperCase()) && ['OPENS','CLOSES'].includes(String(d?.assessment?.schoolDateType||'').toUpperCase()) && /^\d{4}-\d{2}-\d{2}$/.test(String(d?.assessment?.schoolDate||'')));
  }

  function formatStoredDate(value){
    const m=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return'';
    return new Date(Number(m[1]),Number(m[2])-1,Number(m[3])).toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'});
  }
  function schoolCalendarLabel(d){
    const a=d?.assessment||{},date=formatStoredDate(a.schoolDate);if(!date)return'';
    return `School ${a.schoolDateType==='CLOSES'?'closes':'opens'} on ${date}`;
  }

  async function bootstrap(){
    state.me=await api('/api/class-data');
    renderShell();
    const first=!profileComplete()?'setup':(state.me?.subjects?.length||0)===0?'subjects':(state.me?.pupils?.length||0)===0?'pupils':'home';
    navigate(first);
  }
  function setupComplete(){return (state.me?.subjects?.length||0)>0&&(state.me?.pupils?.length||0)>0;}

  function renderShell(){
    const d=state.me;
    const teacher=d?.class?.teacherName||d?.user?.name||'';
    app.innerHTML=`<div class="shell"><header class="topbar"><div><div class="app-title">Reportform ZM</div><div class="subtle">${esc(d.class?.name||'My Class')}${teacher?` • ${esc(teacher)}`:''}</div></div></header><main id="content" class="content"></main><nav class="bottom-nav"><button data-nav="home">⌂<span>Home</span></button><button data-nav="pupils">👥<span>Pupils</span></button><button data-nav="results">✎<span>Results</span></button><button data-nav="reports">▤<span>Reports</span></button></nav></div>`;
    document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));
  }

  async function refresh(){state.me=await api('/api/class-data');}
  async function navigate(page){
    state.page=page;
    document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===page));
    const c=byId('content');c.innerHTML='<div class="card">Loading…</div>';
    try{
      await refresh();
      if(page==='home')renderHome(c);
      else if(page==='pupils')renderPupils(c);
      else if(page==='subjects')renderSubjects(c);
      else if(page==='results')renderResults(c);
      else if(page==='reports')renderReports(c);
      else renderSetup(c);
    }catch(e){c.innerHTML=`<div class="error-card">${esc(e.message)}</div>`;}
  }

  function markVisited(v){return v==='ABSENT'||(v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v)));}
  function stats(){
    const d=state.me,total=(d.pupils?.length||0)*(d.subjects?.length||0);let completedCells=0,sat=0;
    for(const p of d.pupils||[])for(const s of d.subjects||[]){const v=d.marks?.[p.id]?.[s.id];if(markVisited(v))completedCells++;if(v!=='ABSENT'&&v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v)))sat++;}
    return{total,completedCells,sat};
  }
  function progressSummary(d){
    const models=(d.pupils||[]).map(p=>({p,m:reportModel(d,p)}));
    const complete=models.filter(x=>x.m.summary.complete).length;
    const inProgress=models.filter(x=>!x.m.summary.complete&&x.m.summary.completedCount>0).length;
    const notStarted=models.length-complete-inProgress;
    const next=models.find(x=>!x.m.summary.complete)||null;
    return{complete,inProgress,notStarted,next};
  }
  function nextAssessmentName(current){const options=assessmentOptionsForClass(state.me?.class?.name||'',state.me?.class?.gradeLevel||'');const i=options.indexOf(current);return i>=0&&i<options.length-1?options[i+1]:null;}
  async function startAssessment(name){
    if(!name)return;
    if(!confirm(`Open ${name}? The same class, subjects and pupils will be kept. Its marks are stored separately.`))return;
    try{state.me=await api('/api/assessment',{method:'PUT',body:{assessmentName:name}});renderShell();toast(`${name} is ready`);navigate('home');}catch(err){toast(err.message,true);}
  }

  async function downloadWorkspaceBackup(){
    try{
      const data=await api('/api/backup');
      const safeClass=String(state.me?.class?.name||'class').replace(/[^A-Za-z0-9_-]+/g,'_');
      const stamp=new Date().toISOString().slice(0,10);
      const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download=`Reportform_ZM_Backup_${safeClass}_${stamp}.json`;a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);toast('Backup downloaded');
    }catch(err){toast(err.message,true);}
  }
  function restoreWorkspaceBackup(){
    const input=document.createElement('input');input.type='file';input.accept='application/json,.json';
    input.onchange=()=>{const file=input.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=async()=>{try{const parsed=JSON.parse(String(reader.result||''));if(!confirm('Restore this backup? It will replace the current class workspace on this browser.'))return;const r=await api('/api/restore',{method:'POST',body:parsed});state.me=r.state;renderShell();toast('Backup restored');navigate('home');}catch(err){toast('Could not restore this backup: '+err.message,true);}};reader.readAsText(file);};
    input.click();
  }

  function renderHome(c){
    const d=state.me,{total,completedCells}=stats(),pct=total?Math.round(completedCells/total*100):0,ps=progressSummary(d),nextAssessment=nextAssessmentName(assessmentLabel(d));
    const schoolType=d.class?.schoolType==='BOARDING'?'Boarding School':'Day School';
    const continueHtml=ps.next?`<button id="continuePupil" class="btn primary big full continue-work">Continue ${esc(ps.next.p.name)} — ${ps.next.m.summary.completedCount}/${ps.next.m.summary.total} subjects →</button>`:(d.pupils?.length?'<div class="all-complete-banner">✓ All pupils have been checked for this assessment.</div>':'');
    const calendar=schoolCalendarLabel(d);
    const storageBanner=`<div class="cloud-status ok">✓ Private teacher workspace active — no database setup required. Each browser has its own class workspace. Download a backup before major updates or changing device.</div>`;
    c.innerHTML=`<section class="hero"><span class="eyebrow">CLASS TEACHER MODE</span><h1>${esc(d.class?.name||'My Class')}</h1><p>${esc(assessmentLabel(d))} • ${esc(d.class?.term||'Term 1')} ${esc(d.class?.academicYear||new Date().getFullYear())} • ${esc(schoolType)} • ${esc(d.class?.gradingSystem==='CBC'?'CBC':'OBC')} grading</p>${calendar?`<div class="hero-calendar">${esc(calendar)}</div>`:''}<div class="progress"><span style="width:${pct}%"></span></div><small>${completedCells}/${total} subject entries checked for this assessment</small></section>
      ${storageBanner}
      <div class="dashboard-stats"><div><b>${d.pupils?.length||0}</b><span>Pupils</span></div><div><b>${ps.complete}</b><span>Complete</span></div><div><b>${ps.inProgress}</b><span>In progress</span></div><div><b>${ps.notStarted}</b><span>Not started</span></div></div>
      ${continueHtml}
      ${(d.subjects?.length||0)===0?'<div class="notice">Step 2: add the subjects taught in this class.</div>':(d.pupils?.length||0)===0?'<div class="notice">Step 3: add the first pupil. Results will open immediately after the pupil is saved.</div>':''}
      ${nextAssessment?`<section class="next-assessment-card"><div><b>When ${esc(assessmentLabel(d))} is finished</b><span>Keep the same subjects and pupils and open a fresh results sheet for ${esc(nextAssessment)}.</span></div><button id="startNextAssessment" class="btn ghost">Start ${esc(nextAssessment)} →</button></section>`:''}
      <div class="action-grid">
        <button class="action-card" data-go="setup"><b>1. Class Details</b><span>Teacher, school type, class, term, assessment and grading.</span></button>
        <button class="action-card subject-action" data-go="subjects"><b>2. ＋ Subjects</b><span>Add or edit subjects in the order you teach them.</span></button>
        <button class="action-card pupil-action" data-go="pupils"><b>3. 👥 Pupils & Results</b><span>Add each pupil, then enter that pupil's marks subject by subject.</span></button>
        <button class="action-card" data-go="reports"><b>4. ▤ Reports</b><span>Class position, TOTAL SAT, AI comment, PDF and WhatsApp.</span></button>
        <button class="action-card" data-go="results"><b>✎ Results Grid</b><span>Use this when you need to review or correct several marks.</span></button>
      </div>
      <section class="backup-card"><div><b>Protect this class data</b><span>Keep a copy before app updates or when moving to another device.</span></div><div class="backup-actions"><button id="downloadBackup" class="btn ghost">Download Backup</button><button id="restoreBackup" class="btn ghost">Restore Backup</button></div></section>`;
    c.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
    if(byId('startNextAssessment'))byId('startNextAssessment').onclick=()=>startAssessment(nextAssessment);
    if(byId('continuePupil'))byId('continuePupil').onclick=()=>openGuidedResults(ps.next.p.id,firstMissingSubjectIndex(ps.next.p.id));
    if(byId('downloadBackup'))byId('downloadBackup').onclick=downloadWorkspaceBackup;
    if(byId('restoreBackup'))byId('restoreBackup').onclick=restoreWorkspaceBackup;
  }

  function splitStoredName(p){
    const first=String(p.firstName||'').trim(),surname=String(p.surname||'').trim();
    if(first||surname)return{firstName:first,surname};
    const parts=String(p.name||'').trim().split(/\s+/).filter(Boolean);
    return{firstName:parts.shift()||'',surname:parts.join(' ')};
  }

  function pupilFormHtml(p={}){
    const n=splitStoredName(p);
    return `<form id="singlePupilForm" class="stack pupil-form">
      <div class="name-grid">
        <label>First name<input id="pupilFirstName" value="${esc(n.firstName)}" placeholder="e.g. Mary" autocomplete="off" required></label>
        <label>Surname<input id="pupilSurname" value="${esc(n.surname)}" placeholder="e.g. Banda" autocomplete="off" required></label>
      </div>
      <label>Sex<select id="pupilSex" required><option value="">Select Male or Female</option><option value="F" ${p.sex==='F'?'selected':''}>Female</option><option value="M" ${p.sex==='M'?'selected':''}>Male</option></select></label>
      <details class="optional-details" ${p.examNo||p.parentPhone?'open':''}><summary>Optional pupil details</summary>
        <div class="optional-grid two-col">
          <label>Exam number<input id="pupilExamNo" value="${esc(p.examNo||'')}" placeholder="Optional"></label>
          <label>Parent / guardian WhatsApp<input id="pupilPhone" value="${esc(p.parentPhone||'')}" inputmode="tel" placeholder="e.g. 097xxxxxxx"></label>
        </div>
      </details>
      <button class="btn primary big" type="submit">${p.id?'Save Changes':'Save Pupil & Enter Results'}</button>
    </form>`;
  }

  function firstMissingSubjectIndex(pupilId){
    const d=state.me;const idx=(d.subjects||[]).findIndex(s=>d.marks?.[pupilId]?.[s.id]===null||d.marks?.[pupilId]?.[s.id]===undefined||d.marks?.[pupilId]?.[s.id]==='');
    return idx>=0?idx:0;
  }

  function openPupilForm(pupil=null){
    if(!pupil && !(state.me?.subjects?.length)){toast('Add the class subjects first',true);navigate('subjects');return;}
    showModal(`<div class="modal-scroll pupil-modal">${workflowBar('pupils')}<div class="page-head"><h2>${pupil?'Edit Pupil':'Add Pupil'}</h2><p>${pupil?'Update the learner details.':'Enter the learner name and sex. Results will open immediately after saving.'}</p></div>${pupilFormHtml(pupil||{})}</div>`);
    const form=byId('singlePupilForm');setTimeout(()=>byId('pupilFirstName')?.focus(),60);
    form.onsubmit=async e=>{
      e.preventDefault();
      const firstName=byId('pupilFirstName').value.trim(),surname=byId('pupilSurname').value.trim(),sex=byId('pupilSex').value;
      if(!firstName||!surname){toast('Enter both first name and surname',true);return;}
      if(!sex){toast('Select Male or Female',true);return;}
      const body={firstName,surname,sex,examNo:byId('pupilExamNo').value.trim(),parentPhone:byId('pupilPhone').value.trim()};
      const btn=e.submitter;btn.disabled=true;btn.textContent=pupil?'Saving…':'Saving pupil…';
      try{
        const r=await api(pupil?`/api/pupils/${encodeURIComponent(pupil.id)}`:'/api/pupils',{method:pupil?'PUT':'POST',body});state.me=r.state;
        closeModal();toast(pupil?'Pupil updated':`${r.pupil.name} added`);
        if(pupil){await navigate('pupils');}else{setTimeout(()=>openGuidedResults(r.pupil.id,0),80);}
      }catch(err){toast(err.message,true);btn.disabled=false;btn.textContent=pupil?'Save Changes':'Save Pupil & Enter Results';}
    };
  }

  function openGuidedResults(pupilId,index=0){
    const d=state.me,p=d.pupils.find(x=>x.id===pupilId),subjects=d.subjects||[];if(!p)return;
    if(!subjects.length){toast('Add subjects before entering results',true);navigate('subjects');return;}
    const i=Math.max(0,Math.min(index,subjects.length-1)),subject=subjects[i],existing=d.marks?.[pupilId]?.[subject.id],wasAbsent=existing==='ABSENT',existingMark=wasAbsent?'':(existing??'');
    const progress=Math.round(((i+1)/subjects.length)*100),last=i===subjects.length-1;
    showModal(`<div class="modal-scroll guided-results-modal">${workflowBar('pupils')}<div class="guided-ai-note"><span>✨</span><div><b>${esc(p.name)}</b><p>${i===0?`${esc(p.name)} is saved. Now enter ${esc(subject.name)}.`:`Next: enter ${esc(subject.name)}.`}</p></div></div><div class="result-step-head"><span>Subject ${i+1} of ${subjects.length}</span><b>${progress}%</b></div><div class="result-step-progress"><span style="width:${progress}%"></span></div>${wasAbsent?'<div class="absent-note">Currently marked Absent / Did not write.</div>':''}<form id="guidedResultForm" class="stack guided-result-form"><label class="guided-subject-label">${esc(subject.name)} mark (%)<input id="guidedMark" type="number" min="0" max="100" step="0.1" value="${existingMark}" inputmode="decimal" placeholder="Enter mark from 0 to 100" autofocus></label><p class="helper">If the pupil did not write this subject, tap <b>Absent / No mark</b>. It will count as checked but will not increase TOTAL SAT.</p><div class="guided-result-actions">${i>0?'<button id="previousSubject" type="button" class="btn ghost">← Previous</button>':''}<button id="absentSubject" type="button" class="btn ghost">Absent / No mark</button><button class="btn primary" type="submit">${last?'Save & Finish':'Save & Next →'}</button></div></form></div>`);
    const input=byId('guidedMark');setTimeout(()=>input?.focus(),70);
    async function saveAndMove(mark){
      try{await api('/api/results',{method:'PUT',body:{rows:[{pupilId,subjectId:subject.id,mark}]}});state.me.marks=state.me.marks||{};state.me.marks[pupilId]=state.me.marks[pupilId]||{};state.me.marks[pupilId][subject.id]=mark;if(last){finishPupilResults(pupilId);}else openGuidedResults(pupilId,i+1);}catch(err){toast(err.message,true);}
    }
    byId('guidedResultForm').onsubmit=e=>{e.preventDefault();const raw=input.value.trim();if(raw===''){toast('Enter the mark or tap Absent / No mark',true);return;}const n=Number(raw);if(!Number.isFinite(n)||n<0||n>100){toast('Mark must be between 0 and 100',true);return;}saveAndMove(n);};
    byId('absentSubject').onclick=()=>saveAndMove('ABSENT');
    if(byId('previousSubject'))byId('previousSubject').onclick=()=>openGuidedResults(pupilId,i-1);
  }

  function finishPupilResults(pupilId){
    const p=state.me.pupils.find(x=>x.id===pupilId);if(!p)return;
    showModal(`<div class="modal-scroll result-complete"><div class="complete-check">✓</div><h2>${esc(p.name)} is complete</h2><p>All class subjects have been visited for ${esc(assessmentLabel(state.me))}. You can add the next pupil or go to the reports.</p><div class="complete-actions"><button id="nextPupil" class="btn primary">＋ Add Next Pupil</button><button id="viewPupilReport" class="btn whatsapp">View Report</button><button id="donePupil" class="btn ghost">Done</button></div></div>`);
    byId('nextPupil').onclick=()=>openPupilForm();
    byId('viewPupilReport').onclick=async()=>{closeModal();await navigate('reports');previewReport(pupilId);};
    byId('donePupil').onclick=async()=>{closeModal();await navigate('pupils');};
  }

  async function removePupil(p){
    if(!p||!confirm(`Remove ${p.name} from this class?`))return;
    try{await api(`/api/pupils/${encodeURIComponent(p.id)}`,{method:'DELETE'});toast('Pupil removed');await navigate('pupils');}catch(err){toast(err.message,true);}
  }

  function renderPupils(c){
    const d=state.me,pupils=d.pupils||[];
    const list=pupils.length?pupils.map((p,i)=>{const n=splitStoredName(p),m=reportModel(d,p),sex=p.sex==='F'?'Female':p.sex==='M'?'Male':'Sex not set';return `<article class="pupil-row guided-pupil-row">
      <div class="pupil-number">${i+1}</div>
      <div class="pupil-name-block"><b>${esc(n.firstName)} ${esc(n.surname)}</b><span>${esc(sex)} • ${m.summary.completedCount}/${m.summary.total} subjects checked • ${m.summary.sat} sat ${m.summary.complete?'• Complete':''}</span><div class="mini-pupil-actions"><button class="mini-result-btn" type="button" data-enter-results="${p.id}">✎ ${m.summary.complete?'Review Results':'Continue Results'}</button><button class="mini-report-btn" type="button" data-view-report="${p.id}">▤ Report</button></div></div>
      <div class="pupil-row-actions"><button class="icon-btn" type="button" data-edit-pupil="${p.id}" title="Edit pupil">✎</button><button class="icon-btn danger-icon" type="button" data-delete-pupil="${p.id}" title="Remove pupil">×</button></div>
    </article>`}).join(''):`<div class="empty-pupils"><div class="empty-plus">＋</div><h3>No pupils added yet</h3><p>Tap <b>+ Add Pupil</b>. After you save the pupil, the app will immediately ask for results one subject at a time.</p></div>`;
    c.innerHTML=`${workflowBar('pupils')}<div class="page-head row-head pupils-head"><div><h2>Pupils & Results</h2><p>${esc(d.class?.name||'Your class')} • ${pupils.length} ${pupils.length===1?'pupil':'pupils'} • ${esc(assessmentLabel(d))}</p></div><button id="addPupil" class="btn primary add-pupil-btn" type="button"><span class="plus-symbol">＋</span> Add Pupil</button></div>
      <div class="pupil-list">${list}</div>${pupils.length?'<button id="addAnotherPupil" class="btn primary full add-another" type="button">＋ Add another pupil</button>':''}${pupils.length?'<button id="goReports" class="btn ghost full" type="button">Continue to Reports →</button>':''}`;
    byId('addPupil').onclick=()=>openPupilForm();if(byId('addAnotherPupil'))byId('addAnotherPupil').onclick=()=>openPupilForm();if(byId('goReports'))byId('goReports').onclick=()=>navigate('reports');
    c.querySelectorAll('[data-enter-results]').forEach(b=>b.onclick=()=>openGuidedResults(b.dataset.enterResults,firstMissingSubjectIndex(b.dataset.enterResults)));
    c.querySelectorAll('[data-view-report]').forEach(b=>b.onclick=async()=>{await navigate('reports');previewReport(b.dataset.viewReport);});
    c.querySelectorAll('[data-edit-pupil]').forEach(b=>b.onclick=()=>openPupilForm(pupils.find(p=>p.id===b.dataset.editPupil)));
    c.querySelectorAll('[data-delete-pupil]').forEach(b=>b.onclick=()=>removePupil(pupils.find(p=>p.id===b.dataset.deletePupil)));
  }

  function subjectFormHtml(subject={}){
    return `<form id="singleSubjectForm" class="stack subject-form"><label>Subject name<input id="subjectName" value="${esc(subject.name||'')}" placeholder="e.g. Mathematics" autocomplete="off" required></label><button class="btn primary big" type="submit">${subject.id?'Save Changes':'Save Subject'}</button></form>`;
  }

  function openSubjectForm(subject=null){
    showModal(`<div class="modal-scroll subject-modal"><div class="page-head"><h2>${subject?'Edit Subject':'Add Subject'}</h2><p>Add one subject for ${esc(state.me.class?.name||'this class')}.</p></div>${subjectFormHtml(subject||{})}</div>`);
    setTimeout(()=>byId('subjectName')?.focus(),60);
    byId('singleSubjectForm').onsubmit=async e=>{
      e.preventDefault();const name=byId('subjectName').value.trim();if(!name){toast('Enter the subject name',true);return;}
      const btn=e.submitter;btn.disabled=true;btn.textContent=subject?'Saving…':'Adding…';
      try{await api(subject?`/api/subjects/${encodeURIComponent(subject.id)}`:'/api/subjects',{method:subject?'PUT':'POST',body:{name}});closeModal();toast(subject?'Subject updated':'Subject added');await navigate('subjects');}
      catch(err){toast(err.message,true);btn.disabled=false;btn.textContent=subject?'Save Changes':'Save Subject';}
    };
  }

  async function removeSubject(subject){
    if(!subject||!confirm(`Remove ${subject.name} from this class? Existing marks for this subject will no longer appear.`))return;
    try{await api(`/api/subjects/${encodeURIComponent(subject.id)}`,{method:'DELETE'});toast('Subject removed');await navigate('subjects');}catch(err){toast(err.message,true);}
  }

  function renderSubjects(c){
    const d=state.me,subjects=d.subjects||[];
    const list=subjects.length?subjects.map((s,i)=>`<article class="subject-row"><div class="subject-number">${i+1}</div><div class="subject-name-block"><b>${esc(s.name)}</b><span>Result entry will follow this subject order.</span></div><div class="subject-row-actions"><button class="icon-btn" data-edit-subject="${s.id}" title="Edit subject">✎</button><button class="icon-btn danger-icon" data-delete-subject="${s.id}" title="Remove subject">×</button></div></article>`).join(''):`<div class="empty-pupils"><div class="empty-plus">＋</div><h3>No subjects added yet</h3><p>Add the subjects for this class one by one. The order shown here is the order used when entering each pupil's results.</p></div>`;
    c.innerHTML=`${workflowBar('subjects')}<div class="page-head row-head subjects-head"><div><h2>Subjects for ${esc(d.class?.name||'this class')}</h2><p>${subjects.length}/10 subjects • add them in the order you want results entered</p></div><button id="addSubject" class="btn primary add-subject-btn"><span class="plus-symbol">＋</span> Add Subject</button></div><div class="subject-list">${list}</div>${subjects.length?'<button id="addAnotherSubject" class="btn ghost full add-another">＋ Add another subject</button><button id="continuePupils" class="btn primary big full">Subjects Done — Continue to Pupils →</button>':''}`;
    byId('addSubject').onclick=()=>openSubjectForm();if(byId('addAnotherSubject'))byId('addAnotherSubject').onclick=()=>openSubjectForm();if(byId('continuePupils'))byId('continuePupils').onclick=()=>navigate('pupils');
    c.querySelectorAll('[data-edit-subject]').forEach(b=>b.onclick=()=>openSubjectForm(subjects.find(s=>s.id===b.dataset.editSubject)));
    c.querySelectorAll('[data-delete-subject]').forEach(b=>b.onclick=()=>removeSubject(subjects.find(s=>s.id===b.dataset.deleteSubject)));
  }

  function renderSetup(c){
    const d=state.me,grading=d.class?.gradingSystem==='CBC'?'CBC':'OBC';
    const teacherName=d.class?.teacherName||d.user?.name||'',teacherPhone=d.class?.teacherPhone||d.user?.phone||'';
    const parsed=parseClassSelection(d.class?.name||'');
    const gradeLevel=normalizeGradeLevel(d.class?.gradeLevel||parsed.gradeLevel),savedStream=String(d.class?.stream||parsed.stream||'').toUpperCase();
    const knownStreams=STREAMS[gradeLevel]||[],streamIsKnown=knownStreams.includes(savedStream),initialStream=gradeLevel==='OTHER'?'':(streamIsKnown?savedStream:(savedStream?'OTHER':knownStreams[0]||''));
    const customStream=!streamIsKnown&&savedStream?savedStream:'';
    const setupAssessmentOptions=assessmentOptionsForClass(d.class?.name||'',gradeLevel);
    const currentAssessment=setupAssessmentOptions.includes(d.assessment?.name)?d.assessment.name:'Week 4 Assessment';
    const term=['Term 1','Term 2','Term 3'].includes(d.class?.term)?d.class.term:'Term 1',year=d.class?.academicYear||String(new Date().getFullYear()),schoolType=['DAY','BOARDING'].includes(d.class?.schoolType)?d.class.schoolType:'';
    const schoolDateType=['OPENS','CLOSES'].includes(d.assessment?.schoolDateType)?d.assessment.schoolDateType:'',schoolDate=d.assessment?.schoolDate||'';
    c.innerHTML=`${workflowBar('setup')}<div class="page-head"><h2>Start the Class</h2><p>Enter these details first. When you save, the app will take you directly to the subjects.</p></div><form id="setupForm" class="card stack guided-setup">
      <div class="setup-section"><span class="setup-number">1</span><div><h3>Class Teacher</h3><p>Your name and phone number will appear on the report.</p></div></div>
      <div class="teacher-grid"><label>Class teacher's name<input id="teacherName" value="${esc(teacherName)}" placeholder="Enter class teacher's full name" autocomplete="name" required></label><label>Class teacher's phone number<input id="teacherPhone" value="${esc(teacherPhone)}" placeholder="e.g. 0973731979" inputmode="tel" autocomplete="tel" required></label></div>
      <div class="setup-section"><span class="setup-number">2</span><div><h3>Class & School</h3><p>Choose the Grade/Form and stream. Grade 12 automatically unlocks Pre-Mock, Mock and Post-Mock assessments.</p></div></div>
      <div class="class-selector-grid">
        <label>Grade / Form<select id="gradeLevel" required>${GRADE_LEVEL_OPTIONS.map(([v,l])=>`<option value="${v}" ${gradeLevel===v?'selected':''}>${l}</option>`).join('')}</select></label>
        <label id="streamField">Class stream<select id="classStream"></select></label>
        <label id="customStreamField" class="conditional-field">Other stream<input id="customStream" value="${esc(customStream)}" maxlength="8" placeholder="e.g. A or K"></label>
        <label id="customClassField" class="conditional-field">Other class name<input id="customClassName" value="${esc(gradeLevel==='OTHER'?(d.class?.name||''):'')}" placeholder="e.g. 9A"></label>
      </div>
      <div id="classPreview" class="class-preview"></div>
      <div class="school-details-grid"><label>School name<input id="schoolName" value="${esc(d.class?.schoolName||'')}" placeholder="Enter school name" required></label><label>School type<select id="schoolType" required><option value="">Choose school type</option><option value="DAY" ${schoolType==='DAY'?'selected':''}>Day School</option><option value="BOARDING" ${schoolType==='BOARDING'?'selected':''}>Boarding School</option></select></label></div>
      <div class="setup-section"><span class="setup-number">3</span><div><h3>Assessment</h3><p>Choose the assessment whose marks and reports you are entering now.</p></div></div>
      <div class="setup-grid"><label>Term<select id="term"><option ${term==='Term 1'?'selected':''}>Term 1</option><option ${term==='Term 2'?'selected':''}>Term 2</option><option ${term==='Term 3'?'selected':''}>Term 3</option></select></label><label>Academic year<input id="academicYear" type="number" min="2020" max="2100" value="${esc(year)}" required></label><label class="assessment-field">Assessment<select id="assessmentName">${setupAssessmentOptions.map(x=>`<option value="${esc(x)}" ${x===currentAssessment?'selected':''}>${esc(x)}</option>`).join('')}</select></label></div>
      <div class="setup-section compact"><span class="setup-number">4</span><div><h3>School Opening / Closing Date</h3><p>This date will appear on the pupil report and can also guide the parent/guardian comment.</p></div></div>
      <div class="school-calendar-card" id="schoolCalendarPanel">
        <div class="school-calendar-card-head"><span class="calendar-icon">📅</span><div><b>School calendar for this report</b><small>Choose whether the report should say the school opens or closes, then select the exact date.</small></div></div>
        <div class="calendar-fields">
          <label>School status<select id="schoolDateType" required><option value="">Select school opens / closes</option><option value="OPENS" ${schoolDateType==='OPENS'?'selected':''}>School opens on</option><option value="CLOSES" ${schoolDateType==='CLOSES'?'selected':''}>School closes on</option></select></label>
          <label><span id="schoolDateLabel">${schoolDateType==='CLOSES'?'School closing date':schoolDateType==='OPENS'?'School opening date':'Opening / closing date'}</span><input id="schoolDate" type="date" value="${esc(schoolDate)}" required></label>
        </div>
      </div>
      <div class="grading-single"><label>Grading system<select id="grading"><option value="CBC" ${grading==='CBC'?'selected':''}>CBC (Grades 1–5)</option><option value="OBC" ${grading==='OBC'?'selected':''}>OBC (Grades 1–9)</option></select></label></div>
      <div class="assessment-note">Grade 12 classes have Week 4, Week 8, End of Term, Pre-Mock, Mock and Post-Mock. Every assessment keeps separate marks and comments.</div>
      <button class="btn primary big" type="submit">Save & Continue to Subjects →</button>
    </form>`;
    const gradeSelect=byId('gradeLevel'),streamSelect=byId('classStream'),customStreamInput=byId('customStream'),customClassInput=byId('customClassName'),assessmentSelect=byId('assessmentName');
    let lastGrade=gradeLevel;
    const effectiveStream=()=>streamSelect.value==='OTHER'?customStreamInput.value.trim().toUpperCase():streamSelect.value;
    const currentClassName=()=>classNameForSelection(gradeSelect.value,effectiveStream(),customClassInput.value);
    const refreshAssessmentOptions=()=>{const options=assessmentOptionsForClass(currentClassName(),gradeSelect.value),selected=assessmentSelect.value;assessmentSelect.innerHTML=options.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');assessmentSelect.value=options.includes(selected)?selected:'Week 4 Assessment';};
    const refreshClassPreview=()=>{const name=currentClassName();byId('classPreview').innerHTML=name?`Selected class: <b>${esc(name)}</b>`:'Choose the class above.';};
    const refreshClassControls=(preserve=true)=>{
      const grade=gradeSelect.value,streams=STREAMS[grade]||[];
      const previous=preserve?streamSelect.value:'';
      byId('streamField').style.display=grade==='OTHER'?'none':'';
      byId('customClassField').style.display=grade==='OTHER'?'grid':'none';
      if(grade!=='OTHER'){
        streamSelect.innerHTML=[...streams,'OTHER'].map(v=>`<option value="${v}">${v==='OTHER'?'Other stream':v}</option>`).join('');
        const preferred=grade===lastGrade?(previous||initialStream):'';
        streamSelect.value=[...streams,'OTHER'].includes(preferred)?preferred:(streams[0]||'OTHER');
        byId('customStreamField').style.display=streamSelect.value==='OTHER'?'grid':'none';
      }else byId('customStreamField').style.display='none';
      lastGrade=grade;refreshClassPreview();refreshAssessmentOptions();
    };
    refreshClassControls(false);
    if(gradeLevel!=='OTHER')streamSelect.value=initialStream||streamSelect.value;
    byId('customStreamField').style.display=streamSelect.value==='OTHER'?'grid':'none';
    refreshClassPreview();refreshAssessmentOptions();
    gradeSelect.addEventListener('change',()=>refreshClassControls(false));
    streamSelect.addEventListener('change',()=>{byId('customStreamField').style.display=streamSelect.value==='OTHER'?'grid':'none';refreshClassPreview();refreshAssessmentOptions();});
    customStreamInput.addEventListener('input',()=>{customStreamInput.value=customStreamInput.value.toUpperCase();refreshClassPreview();refreshAssessmentOptions();});
    customClassInput.addEventListener('input',()=>{refreshClassPreview();refreshAssessmentOptions();});
    const schoolDateTypeSelect=byId('schoolDateType'),schoolDateInput=byId('schoolDate'),schoolDateLabel=byId('schoolDateLabel');
    const refreshSchoolDateLabel=()=>{schoolDateLabel.textContent=schoolDateTypeSelect.value==='CLOSES'?'School closing date':schoolDateTypeSelect.value==='OPENS'?'School opening date':'Opening / closing date';};
    schoolDateTypeSelect.addEventListener('change',refreshSchoolDateLabel);refreshSchoolDateLabel();
    byId('setupForm').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;const selectedGrade=gradeSelect.value,stream=selectedGrade==='OTHER'?'':effectiveStream(),className=currentClassName();if(selectedGrade!=='OTHER'&&!stream){toast('Choose or enter the class stream',true);return;}if(!className){toast('Choose the class',true);return;}if(!schoolDateTypeSelect.value||!schoolDateInput.value){const panel=byId('schoolCalendarPanel');panel.classList.add('needs-attention');panel.scrollIntoView({behavior:'smooth',block:'center'});if(!schoolDateTypeSelect.value)schoolDateTypeSelect.focus();else schoolDateInput.focus();toast('Choose School opens on / School closes on and select the date',true);return;}btn.disabled=true;btn.textContent='Saving…';try{state.me=await api('/api/setup',{method:'PUT',body:{teacherName:byId('teacherName').value,teacherPhone:byId('teacherPhone').value,schoolName:byId('schoolName').value,gradeLevel:selectedGrade,stream,className,schoolType:byId('schoolType').value,term:byId('term').value,academicYear:byId('academicYear').value,assessmentName:byId('assessmentName').value,schoolDateType:schoolDateTypeSelect.value,schoolDate:schoolDateInput.value,gradingSystem:byId('grading').value}});toast(`${state.me.class.name} • ${state.me.assessment.name}`);renderShell();navigate('subjects');}catch(err){toast(err.message,true)}finally{btn.disabled=false;btn.textContent='Save & Continue to Subjects →';}};
  }

  function renderResults(c){
    const d=state.me;if(!setupComplete()){c.innerHTML='<div class="notice">Add at least one subject and at least one pupil first.</div>';return;}
    const heads=d.subjects.map(s=>`<th>${esc(s.name)}</th>`).join('');
    const rows=d.pupils.map((p,i)=>`<tr><th class="pupil-cell"><span>${i+1}. ${esc(p.name)}</span><small>${esc(p.examNo||'')}</small></th>${d.subjects.map(s=>{const v=d.marks?.[p.id]?.[s.id],abs=v==='ABSENT',val=abs?'':(v??'');return `<td><input class="mark-box" data-pupil="${p.id}" data-subject="${s.id}" data-status="${abs?'ABSENT':''}" type="number" min="0" max="100" step="0.1" value="${val}" placeholder="${abs?'ABS':'—'}" title="${abs?'Marked absent':'Enter mark'}"></td>`}).join('')}</tr>`).join('');
    c.innerHTML=`<div class="page-head row-head"><div><h2>Results Grid</h2><p>${esc(assessmentLabel(d))} • ${esc(d.class?.term||'Term 1')} ${esc(d.class?.academicYear||'')}</p></div><div id="saveState" class="save-state">✓ Saved</div></div><div class="marks-wrap"><table class="marks-table"><thead><tr><th class="pupil-cell">Pupil</th>${heads}</tr></thead><tbody>${rows}</tbody></table></div><p class="helper">Blank means no mark entered. Marks save automatically.</p>`;
    c.querySelectorAll('.mark-box').forEach(input=>input.addEventListener('input',e=>{e.currentTarget.dataset.status='';scheduleSave();}));
  }

  function scheduleSave(){const status=byId('saveState');if(status){status.textContent='Saving…';status.classList.add('saving');}clearTimeout(state.saveTimer);state.saveTimer=setTimeout(saveResults,700);}
  async function saveResults(){const inputs=[...document.querySelectorAll('.mark-box')];if(!inputs.length)return;const rows=inputs.map(x=>({pupilId:x.dataset.pupil,subjectId:x.dataset.subject,mark:x.value===''?(x.dataset.status==='ABSENT'?'ABSENT':null):Number(x.value)}));try{await api('/api/results',{method:'PUT',body:{rows}});const status=byId('saveState');if(status){status.textContent='✓ Saved';status.classList.remove('saving');}}catch(e){const status=byId('saveState');if(status){status.textContent='Not saved';status.classList.remove('saving');}toast(e.message,true);}}

  function gradeOBC(mark){const n=Number(mark);return n>=75?1:n>=70?2:n>=65?3:n>=60?4:n>=55?5:n>=50?6:n>=45?7:n>=40?8:9;}
  function remarkOBC(g){return g===1?'EXCELLENT':g===2?'VERY GOOD':g<=4?'GOOD':g<=6?'SATISFACTORY':g<=8?'FAIR':'FAIL';}
  function gradeCBC(mark){const n=Number(mark);return n>=70?1:n>=60?2:n>=50?3:n>=40?4:5;}
  function remarkCBC(g){return ['','OUTSTANDING','ADVANCED','BASIC','SATISFACTORY','UNSATISFACTORY'][g];}
  function gradeFor(d,mark){return d.class.gradingSystem==='CBC'?gradeCBC(mark):gradeOBC(mark);}
  function remarkFor(d,grade){return d.class.gradingSystem==='CBC'?remarkCBC(grade):remarkOBC(grade);}

  function subjectStats(d,subjectId){
    const values=(d.pupils||[]).map(p=>d.marks?.[p.id]?.[subjectId]).filter(v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))).map(Number);
    return{sat:values.length,average:values.length?Math.round(values.reduce((a,b)=>a+b,0)/values.length):null};
  }

  function reportModel(d,p){
    const isCBC=d.class.gradingSystem==='CBC';
    const rows=d.subjects.map(s=>{const raw=d.marks?.[p.id]?.[s.id],absent=raw==='ABSENT',has=!absent&&raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(Number(raw)),visited=absent||has;const mark=has?Number(raw):null;const grade=has?(isCBC?gradeCBC(mark):gradeOBC(mark)):null;const st=subjectStats(d,s.id);return{subjectId:s.id,subject:s.name,mark,grade,points:grade,average:st.average,totalSat:st.sat,status:absent?'absent':has?'mark':'pending',visited,remark:absent?'ABSENT / DID NOT WRITE':has?(isCBC?remarkCBC(grade):remarkOBC(grade)):'PENDING'};});
    const entered=rows.filter(r=>r.status==='mark'),completed=rows.filter(r=>r.visited),absent=rows.filter(r=>r.status==='absent'),complete=rows.length>0&&completed.length===rows.length;let summary={complete,entered:entered.length,sat:entered.length,completedCount:completed.length,absentCount:absent.length,total:rows.length};
    if(entered.length)summary.average=Math.round(entered.reduce((n,x)=>n+x.mark,0)/entered.length*10)/10;
    if(isCBC&&entered.length)summary.averageGrade=gradeCBC(summary.average);
    if(!isCBC&&entered.length){const best=[...entered].sort((a,b)=>b.mark-a.mark).slice(0,6);summary.best6Count=best.length;summary.best6=best.reduce((n,x)=>n+x.mark,0);summary.points=best.reduce((n,x)=>n+x.grade,0);if(best.length>=6)summary.division=summary.points<=12?'I':summary.points<=17?'II':summary.points<=24?'III':summary.points<=35?'IV':'FAIL';}
    return{rows,summary};
  }

  function overallPosition(d,p){
    const isCBC=d.class.gradingSystem==='CBC';
    const ranked=(d.pupils||[]).map(x=>({p:x,m:reportModel(d,x)})).filter(x=>x.m.summary.complete).sort((a,b)=>{
      if(isCBC)return (b.m.summary.average||0)-(a.m.summary.average||0);
      if(a.m.summary.best6Count>=6&&b.m.summary.best6Count>=6)return (a.m.summary.points??999)-(b.m.summary.points??999)||(b.m.summary.best6||0)-(a.m.summary.best6||0);return (b.m.summary.average||0)-(a.m.summary.average||0);
    });
    let rank=0,lastKey='',shown=0;
    for(let i=0;i<ranked.length;i++){
      const x=ranked[i],key=isCBC?String(x.m.summary.average):x.m.summary.best6Count>=6?`${x.m.summary.points}:${x.m.summary.best6}`:`AVG:${x.m.summary.average}`;
      if(key!==lastKey){rank=i+1;lastKey=key;}if(x.p.id===p.id){shown=rank;break;}
    }
    return shown||'—';
  }

  function pronouns(sex){const s=String(sex||'').toUpperCase();if(s==='F')return{subj:'She',subjL:'she',obj:'her'};if(s==='M')return{subj:'He',subjL:'he',obj:'him'};return{subj:'The learner',subjL:'the learner',obj:'the learner'};}
  function smartLocalComment(d,p,m){
    const entered=m.rows.filter(x=>x.status==='mark'),pr=pronouns(p.sex),name=p.name||'This pupil',assessment=d.assessment.name,boarding=d.class?.schoolType==='BOARDING',endTerm=assessment==='End of Term Test',mockExam=/Mock Exam$/i.test(assessment),calendar=schoolCalendarLabel(d),reopen=d.assessment?.schoolDateType==='OPENS'&&d.assessment?.schoolDate?formatStoredDate(d.assessment.schoolDate):'';
    if(!entered.length)return `Dear Parent/Guardian, results for ${name} have not yet been entered for ${assessment}. The report will be completed once the subject marks are available.`;
    if(!m.summary.complete){const missing=m.rows.filter(x=>x.status==='pending').map(x=>x.subject);return `Dear Parent/Guardian, ${name}'s result record for ${assessment} is not yet complete. ${m.summary.completedCount} of ${m.summary.total} subjects have been checked${missing.length?`, while ${missing.slice(0,3).join(', ')}${missing.length>3?' and other subjects':''} are still pending`:''}. A final overall judgement should be made after all required results are entered.`;}
    const sorted=[...entered].sort((a,b)=>b.mark-a.mark),best=sorted[0],weak=sorted[sorted.length-1];let text=`Dear Parent/Guardian, ${name} completed ${assessment} at ${d.class.schoolName}. `;
    if(d.class.gradingSystem==='CBC')text+=`${pr.subj} obtained an overall average of ${m.summary.average}%, which is CBC Grade ${m.summary.averageGrade} (${remarkCBC(m.summary.averageGrade)}). `;
    else if(m.summary.best6Count>=6)text+=`${pr.subj} recorded a Best 6 total of ${m.summary.best6}/600, ${m.summary.points} grade points and Division ${m.summary.division}. `;else text+=`${pr.subj} obtained an average of ${m.summary.average}% across the ${m.summary.entered} subjects written. `;
    text+=`${pr.subj} performed strongest in ${best.subject} with ${best.mark}%. `;
    if(weak.subject!==best.subject)text+=`To strengthen the overall result, ${pr.subjL} should give more attention to ${weak.subject}, where the mark was ${weak.mark}% (Grade ${weak.grade} — ${weak.remark}). `;
    if(mockExam)text+=`As this is a Grade 12 examination assessment, please encourage ${pr.obj} to use the result to identify examination gaps, practise past-paper questions and strengthen weaker subjects before the next examination. `;
    if(boarding&&!endTerm)text+=`As ${name} is still at boarding school, please use the available calls, visits or messages to encourage ${pr.obj} to remain focused, revise consistently and seek help from subject teachers in weaker areas. `;
    else if(boarding&&endTerm)text+=`As ${name} is now with you for the holiday, please continue encouraging ${pr.obj}, help ${pr.obj} maintain a simple revision routine and give particular attention to the weaker subjects${reopen?` before school reopens on ${reopen}`:' before school reopens'}. `;
    else if(endTerm)text+=`During the holiday, please continue encouraging ${pr.obj} to keep a balanced revision routine, correct mistakes from this assessment and prepare steadily for the next term. `;
    else text+=`Please continue supporting regular home revision, discussion of schoolwork and timely attention to the weaker subjects before the next assessment. `;
    if(calendar)text+=`${calendar}. `;
    text+=`Continued encouragement from both home and school can help strengthen the next result.`;
    return text;
  }
  function teacherComment(d,p,m){return String(p.classTeacherComment||'').trim()||smartLocalComment(d,p,m);}

  function renderReports(c){
    const d=state.me;if(!setupComplete()){c.innerHTML='<div class="notice">Add at least one subject and at least one pupil first.</div>';return;}
    const cards=d.pupils.map(p=>{const m=reportModel(d,p),saved=String(p.classTeacherComment||'').trim();return `<article class="report-card"><div><b>${esc(p.name)}</b><small>${esc(p.examNo||'No exam number')}</small><span class="status ${m.summary.complete?'ready':'pending'}">${m.summary.complete?'Ready for WhatsApp':`${m.summary.entered}/${m.summary.total} subjects`}</span>${saved?'<span class="comment-saved">✨ Comment saved</span>':''}</div><div class="report-actions"><button class="btn ghost" data-preview="${p.id}">Preview / Comment</button><button class="btn primary" data-pdf="${p.id}">PDF</button><button class="btn whatsapp" data-share="${p.id}">WhatsApp</button></div></article>`}).join('');
    c.innerHTML=`${workflowBar('reports')}<div class="page-head row-head"><div><h2>Reports</h2><p>${esc(assessmentLabel(d))} • ${esc(d.class?.term||'Term 1')} ${esc(d.class?.academicYear||'')} • position and TOTAL SAT update from entered marks.</p></div><button id="allPdf" class="btn primary">Download All</button></div><div class="report-list">${cards}</div>`;
    c.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>previewReport(b.dataset.preview));c.querySelectorAll('[data-pdf]').forEach(b=>b.onclick=()=>downloadOne(b.dataset.pdf));c.querySelectorAll('[data-share]').forEach(b=>b.onclick=()=>shareOne(b.dataset.share));byId('allPdf').onclick=downloadAll;
  }

  function displayDate(){return new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});}
  function reportHtml(d,p){
    const m=reportModel(d,p),pos=overallPosition(d,p),year=d.class?.academicYear||new Date().getFullYear(),comment=teacherComment(d,p,m),calendarDate=formatStoredDate(d.assessment?.schoolDate),calendarTitle=d.assessment?.schoolDateType==='CLOSES'?'SCHOOL CLOSES ON:':'SCHOOL OPENS ON:';
    return `<div class="report-sheet report-v21">
      <div class="report-head old-report-head"><div class="republic">REPUBLIC OF ZAMBIA</div><div class="ministry">MINISTRY OF EDUCATION</div><h2>${esc(String(d.class.schoolName||'').toUpperCase())}</h2><h3>PUPIL'S PROGRESS REPORT</h3></div>
      ${!m.summary.complete?'<div class="incomplete old-incomplete">INCOMPLETE REPORT — SOME RESULTS PENDING</div>':''}
      <div class="old-meta-box"><div><b>NAME:</b><span>${esc(String(p.name||'').toUpperCase())}</span><b>CLASS:</b><span>${esc(d.class.name)}</span><b>SEX:</b><span>${esc(p.sex==='F'?'Female':p.sex==='M'?'Male':'—')}</span><b>TERM:</b><span>${esc(d.class?.term||'—')}</span><b>DATE:</b><span>${esc(displayDate())}</span></div><div><b>YEAR:</b><span>${esc(year)}</span><b>EXAM NO:</b><span>${esc(p.examNo||'—')}</span><b>ASSESSMENT:</b><span>${esc(d.assessment.name)}</span><b>OVERALL POS:</b><span>${esc(pos)}</span><b>GRADING:</b><span>${esc(d.class.gradingSystem)}</span></div>${calendarDate?`<div class="school-calendar-meta"><b>${esc(calendarTitle)}</b><span>${esc(calendarDate)}</span></div>`:''}</div>
      <div class="report-table-wrap"><table class="report-table old-report-table"><thead><tr><th>SUBJECT</th><th>TOTAL SAT</th><th>MARK (%)</th><th>GRADE</th><th>PTS</th><th>AV</th><th>COMMENT</th></tr></thead><tbody>${m.rows.map((r,i)=>`<tr class="${i%2?'alt':''}"><td>${esc(String(r.subject).toUpperCase())}</td><td>${r.totalSat}</td><td class="grade-mark">${r.status==='absent'?'ABS':(r.mark??'—')}</td><td class="grade-mark">${r.grade??'—'}</td><td>${r.points??'—'}</td><td>${r.average??'—'}</td><td>${esc(r.remark)}</td></tr>`).join('')}</tbody></table></div>
      <div class="old-summary">${!m.summary.complete?`RESULT STATUS: <b>INCOMPLETE (${m.summary.completedCount}/${m.summary.total} subjects checked)</b>`:d.class.gradingSystem==='CBC'?`OVERALL AVERAGE: <b>${m.summary.average}%</b><span>SAT: <b>${m.summary.sat}/${m.summary.total}</b> • CBC AVG GRADE: <b>Grade ${m.summary.averageGrade} — ${esc(remarkCBC(m.summary.averageGrade))}</b></span>`:m.summary.best6Count>=6?`TOTAL MARKS (Best 6): <b>${m.summary.best6}/600</b><span>SAT: <b>${m.summary.sat}/${m.summary.total}</b> • POINTS: <b>${m.summary.points}</b> • DIVISION: <b>${esc(m.summary.division)}</b></span>`:`TOTAL MARKS (${m.summary.best6Count} subjects): <b>${m.summary.best6}</b><span>GRADE POINTS: <b>${m.summary.points}</b> • DIVISION: <b>Pending until 6 subjects</b></span>`}</div>
      <div class="old-comment"><b>Class Teacher's Comment:</b><p>${esc(comment)}</p></div>
      <div class="old-signatures"><div><span>${esc(d.class?.teacherName||d.user?.name||'')}</span><i></i><small>Class Teacher${d.class?.teacherPhone?` • ${esc(d.class.teacherPhone)}`:''}</small></div><div><span>&nbsp;</span><i></i><small>Date</small></div></div>
      <div class="report-footer">Reportform ZM • ${esc(d.class.gradingSystem)} grading</div>
    </div>`;
  }

  function showModal(inner,wide=false){closeModal();const x=document.createElement('div');x.id='modal';x.className='modal-backdrop';x.innerHTML=`<div class="modal ${wide?'modal-wide':''}"><button class="modal-close" data-close>×</button>${inner}</div>`;document.body.appendChild(x);x.addEventListener('click',e=>{if(e.target===x||e.target.matches('[data-close]'))closeModal();});}
  function closeModal(){byId('modal')?.remove();}

  function previewReport(pupilId){
    const p=state.me.pupils.find(x=>x.id===pupilId);if(!p)return;
    const m=reportModel(state.me,p),initial=teacherComment(state.me,p,m);
    showModal(`<div class="modal-scroll report-modal-scroll"><div id="reportPreview">${reportHtml(state.me,p)}</div><section class="comment-tools"><div class="comment-tools-head"><div><h3>Class Teacher's Comment</h3><p>Like the earlier version: generate a pupil-specific comment from the actual results, then edit it if needed.</p></div><span id="aiBadge" class="ai-badge">${state.me.ai?.onlineConfigured?'Online AI ready':'Smart Local ready'}</span></div><div class="comment-buttons"><button id="generateAiComment" class="btn ai-btn">✨ Generate AI Comment</button><button id="useLocalComment" class="btn ghost">Use Smart Local</button></div><textarea id="commentEditor" rows="7">${esc(initial)}</textarea><div class="comment-save-row"><span id="commentStatus" class="helper">Comments never invent marks or unsupported behaviour.</span><button id="saveComment" class="btn primary">Save Comment</button></div></section></div><div class="modal-actions"><button class="btn ghost" data-close>Close</button><button class="btn primary" id="modalPdf">Download PDF</button><button class="btn whatsapp" id="modalWhatsApp">WhatsApp</button></div>`,true);
    const editor=byId('commentEditor'),status=byId('commentStatus');
    async function saveCurrent(message='Comment saved'){
      const d=await api(`/api/pupils/${encodeURIComponent(pupilId)}/comment`,{method:'PUT',body:{comment:editor.value}});state.me=d.state;const np=state.me.pupils.find(x=>x.id===pupilId);byId('reportPreview').innerHTML=reportHtml(state.me,np);status.textContent=message;return np;
    }
    byId('generateAiComment').onclick=async()=>{const btn=byId('generateAiComment');btn.disabled=true;btn.textContent='Generating…';status.textContent='Analysing the pupil results…';try{const d=await api('/api/ai-comment',{method:'POST',body:{pupilId}});editor.value=d.comment||'';byId('aiBadge').textContent=d.source==='online-ai'?'Online AI':'Smart Local';await saveCurrent(d.message||'Comment generated and saved.');toast('Comment generated and saved');}catch(err){status.textContent=err.message;toast(err.message,true);}finally{btn.disabled=false;btn.textContent='✨ Generate AI Comment';}};
    byId('useLocalComment').onclick=()=>{const current=state.me.pupils.find(x=>x.id===pupilId);editor.value=smartLocalComment(state.me,current,reportModel(state.me,current));status.textContent='Smart Local comment loaded. Tap Save Comment.';};
    byId('saveComment').onclick=async()=>{try{await saveCurrent('Comment saved.');toast('Comment saved');}catch(err){toast(err.message,true);}};
    byId('modalPdf').onclick=async()=>{try{await saveCurrent('Comment saved before PDF.');await downloadOne(pupilId);}catch(err){toast(err.message,true);}};
    byId('modalWhatsApp').onclick=async()=>{try{await saveCurrent('Comment saved before WhatsApp.');await shareOne(pupilId);}catch(err){toast(err.message,true);}};
  }

  async function ensurePdf(){if(window.jspdf?.jsPDF)return window.jspdf.jsPDF;await new Promise((ok,fail)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';s.onload=ok;s.onerror=()=>fail(new Error('PDF library could not load. Check internet connection.'));document.head.appendChild(s);});return window.jspdf.jsPDF;}

  function drawPdf(doc,d,p,pageNo){
    const m=reportModel(d,p),pos=overallPosition(d,p),W=doc.internal.pageSize.getWidth(),blue=[30,64,175],light=[239,246,255],green=[22,163,74],orange=[234,88,12],red=[210,38,38];
    const center=(text,y,size,bold=false,color=null)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);color?doc.setTextColor(...color):doc.setTextColor(0,0,0);doc.text(String(text),W/2,y,{align:'center'});};
    doc.setDrawColor(0);doc.setLineWidth(.4);doc.rect(8,8,194,281);
    center('REPUBLIC OF ZAMBIA',15,10,true);center('MINISTRY OF EDUCATION',20,10,true);center(String(d.class.schoolName||'').toUpperCase(),27,14,true,[30,58,138]);center("PUPIL'S PROGRESS REPORT",38,11,true);
    doc.setDrawColor(0);doc.line(70,39.7,140,39.7);
    let y=44;const calendarDate=formatStoredDate(d.assessment?.schoolDate),calendarTitle=d.assessment?.schoolDateType==='CLOSES'?'SCHOOL CLOSES ON:':'SCHOOL OPENS ON:',metaHeight=calendarDate?41:34;doc.rect(12,y,186,metaHeight);doc.setFontSize(8.5);const left=15,right=108;
    const line=(label,value,x,yy,offset=18)=>{doc.setFont('helvetica','bold');doc.setTextColor(0);doc.text(label,x,yy);doc.setFont('helvetica','normal');doc.text(String(value||'—').slice(0,42),x+offset,yy);};
    line('NAME:',String(p.name||'').toUpperCase(),left,y+6,15);line('CLASS:',d.class.name,left,y+12,15);line('SEX:',p.sex==='F'?'Female':p.sex==='M'?'Male':'—',left,y+18,15);line('TERM:',d.class?.term||'—',left,y+24,15);line('DATE:',displayDate(),left,y+30,15);
    line('YEAR:',d.class?.academicYear||new Date().getFullYear(),right,y+6,15);line('EXAM NO:',p.examNo||'—',right,y+12,21);line('ASSESS:',d.assessment.name,right,y+18,18);line('OVERALL POS:',pos,right,y+24,28);line('GRADING:',d.class.gradingSystem,right,y+30,21);
    if(calendarDate){doc.setDrawColor(120,150,190);doc.line(12,y+34,198,y+34);doc.setFillColor(...light);doc.rect(12,y+34,186,7,'F');doc.setFont('helvetica','bold');doc.setFontSize(8.4);doc.setTextColor(...blue);doc.text(calendarTitle,15,y+38.8);doc.setTextColor(0);doc.text(calendarDate,53,y+38.8);}
    const tableY=y+metaHeight+7;if(!m.summary.complete){doc.setTextColor(...red);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text('INCOMPLETE REPORT — SOME RESULTS PENDING',105,tableY-3,{align:'center'});}
    const widths=[48,20,20,16,14,16,52],headers=['SUBJECT','TOTAL SAT','MARK (%)','GRADE','PTS','AV','COMMENT'];let x=12;y=tableY;doc.setFillColor(...blue);doc.setDrawColor(0);headers.forEach((h,i)=>{doc.rect(x,y,widths[i],9,'FD');x+=widths[i];});doc.setTextColor(255);doc.setFont('helvetica','bold');doc.setFontSize(7.6);x=12;headers.forEach((h,i)=>{doc.text(h,x+widths[i]/2,y+5.7,{align:'center'});x+=widths[i];});y+=9;
    const gradeColor=g=>g<=2?blue:g<=4?green:g<=6?orange:red;
    m.rows.forEach((r,i)=>{x=12;if(i%2){doc.setFillColor(...light);}else doc.setFillColor(255,255,255);widths.forEach(w=>{doc.setDrawColor(0);doc.rect(x,y,w,8,'FD');x+=w;});x=12;doc.setFont('helvetica','normal');doc.setFontSize(8.2);doc.setTextColor(0);doc.text(String(r.subject).toUpperCase().slice(0,27),x+2,y+5.3);x+=widths[0];doc.setTextColor(60);doc.text(String(r.totalSat),x+widths[1]/2,y+5.3,{align:'center'});x+=widths[1];if(r.grade!==null){doc.setTextColor(...gradeColor(r.grade));doc.setFont('helvetica','bold');}else{doc.setTextColor(150);doc.setFont('helvetica','normal');}doc.text(r.status==='absent'?'ABS':r.mark===null?'—':String(r.mark),x+widths[2]/2,y+5.3,{align:'center'});x+=widths[2];doc.text(r.grade===null?'—':String(r.grade),x+widths[3]/2,y+5.3,{align:'center'});x+=widths[3];doc.setTextColor(0);doc.setFont('helvetica','normal');doc.text(r.points===null?'—':String(r.points),x+widths[4]/2,y+5.3,{align:'center'});x+=widths[4];doc.text(r.average===null?'—':String(r.average),x+widths[5]/2,y+5.3,{align:'center'});x+=widths[5];doc.setFontSize(7.3);doc.text(String(r.remark).slice(0,25),x+widths[6]/2,y+5.3,{align:'center'});y+=8;});
    y+=5;doc.setTextColor(0);doc.setFont('helvetica','bold');doc.setFontSize(9.5);
    if(!m.summary.complete)doc.text(`RESULT STATUS: INCOMPLETE (${m.summary.completedCount}/${m.summary.total} subjects checked)`,12,y);
    else if(d.class.gradingSystem==='CBC'){doc.text(`OVERALL AVERAGE: ${m.summary.average}%   SAT: ${m.summary.sat}/${m.summary.total}`,12,y);const rightText=`CBC AVG GRADE: Grade ${m.summary.averageGrade} - ${remarkCBC(m.summary.averageGrade)}`;doc.text(rightText,198-doc.getTextWidth(rightText),y);}
    else if(m.summary.best6Count>=6){doc.text(`TOTAL MARKS (Best 6): ${m.summary.best6} / 600   SAT: ${m.summary.sat}/${m.summary.total}`,12,y);const rightText=`POINTS: ${m.summary.points}   DIVISION: ${m.summary.division}`;doc.text(rightText,198-doc.getTextWidth(rightText),y);}else{doc.text(`TOTAL MARKS (${m.summary.best6Count} subjects): ${m.summary.best6}`,12,y);const rightText=`POINTS: ${m.summary.points}   DIVISION: PENDING`;doc.text(rightText,198-doc.getTextWidth(rightText),y);}
    y+=7;doc.setDrawColor(180);doc.line(12,y,198,y);y+=6;doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text("Class Teacher's Comment:",12,y);y+=5;doc.setFont('helvetica','normal');doc.setFontSize(8.6);const lines=doc.splitTextToSize(teacherComment(d,p,m),186);doc.text(lines.slice(0,13),12,y);y+=Math.min(lines.length,13)*4+5;
    doc.setFontSize(8);doc.text(String(d.class?.teacherName||d.user?.name||''),15,Math.min(y,257));if(d.class?.teacherPhone){doc.setFontSize(7.2);doc.setTextColor(80);doc.text(String(d.class.teacherPhone),15,Math.min(y+3.5,260));doc.setTextColor(0);}const sy=Math.min(y+6,263);doc.setDrawColor(0);doc.line(15,sy,78,sy);doc.line(120,sy,180,sy);doc.text('Class Teacher',15,sy+4);doc.text('Date',120,sy+4);
    doc.setFontSize(7.5);doc.setTextColor(80);doc.text(`Reportform ZM • ${d.class.gradingSystem} • ${pageNo}`,198,280,{align:'right'});
  }

  async function buildDoc(pupils){const JsPDF=await ensurePdf(),doc=new JsPDF({unit:'mm',format:'a4'});pupils.forEach((p,i)=>{if(i)doc.addPage();drawPdf(doc,state.me,p,i+1);});return doc;}
  async function downloadOne(id){try{const p=state.me.pupils.find(x=>x.id===id);if(!p)return;const doc=await buildDoc([p]);doc.save(`${state.me.class.name}_${p.name.replace(/\s+/g,'_')}_${state.me.assessment.name.replace(/\s+/g,'_')}_${state.me.class.academicYear||''}.pdf`);}catch(e){toast(e.message,true);}}
  async function downloadAll(){try{const doc=await buildDoc(state.me.pupils);doc.save(`${state.me.class.name}_${state.me.assessment.name.replace(/\s+/g,'_')}_Reports.pdf`);}catch(e){toast(e.message,true);}}
  function normalizeWhatsAppPhone(value){let x=String(value||'').replace(/\D/g,'');if(x.startsWith('00'))x=x.slice(2);if(x.startsWith('0'))x='260'+x.slice(1);return x;}
  async function shareOne(id){const p=state.me.pupils.find(x=>x.id===id);if(!p)return;try{const doc=await buildDoc([p]),blob=doc.output('blob'),file=new File([blob],`${state.me.class.name}_${p.name.replace(/\s+/g,'_')}_${state.me.assessment.name.replace(/\s+/g,'_')}_${state.me.class.academicYear||''}.pdf`,{type:'application/pdf'}),message=`${state.me.class.schoolName} — ${state.me.assessment.name}, ${state.me.class.term||''} ${state.me.class.academicYear||''} report for ${p.name}.${schoolCalendarLabel(state.me)?` ${schoolCalendarLabel(state.me)}.`:''}`;if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({files:[file],title:`${p.name} - Pupil Report`,text:message});return;}doc.save(file.name);const phone=normalizeWhatsAppPhone(p.parentPhone),url=`https://wa.me/${phone}?text=${encodeURIComponent(message+' The PDF has been downloaded; please attach it to this WhatsApp message.')}`;const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';document.body.appendChild(link);link.click();link.remove();toast('PDF downloaded. WhatsApp opened — attach the downloaded report.');}catch(e){if(e.name!=='AbortError')toast(e.message,true);}}

  bootstrap().catch(err=>{app.innerHTML=`<div class="auth-page"><div class="auth-card"><h2>Reportform ZM could not open</h2><p>${esc(err.message||err)}</p><button class="btn primary full" onclick="location.reload()">Try again</button></div></div>`;});
})();
