(() => {
  const APP_VERSION='3.0.5';
  const app=document.getElementById('app');
  const state={me:null,page:'home',saveTimer:null};
  const esc=s=>String(s??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const byId=id=>document.getElementById(id);

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
    return !!(String(d?.class?.teacherName||d?.user?.name||'').trim() && String(d?.class?.teacherPhone||d?.user?.phone||'').trim() && String(d?.class?.schoolName||'').trim() && String(d?.class?.name||'').trim());
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

  function stats(){
    const d=state.me,total=(d.pupils?.length||0)*(d.subjects?.length||0);let entered=0;
    for(const p of d.pupils||[])for(const s of d.subjects||[])if(d.marks?.[p.id]?.[s.id]!==null&&d.marks?.[p.id]?.[s.id]!==undefined)entered++;
    return{total,entered};
  }

  function renderHome(c){
    const d=state.me,{total,entered}=stats(),pct=total?Math.round(entered/total*100):0;
    c.innerHTML=`<section class="hero"><span class="eyebrow">CLASS TEACHER MODE</span><h1>${esc(d.class?.name||'My Class')}</h1><p>${d.pupils?.length||0} pupils • ${d.subjects?.length||0} subjects • ${esc(d.class?.gradingSystem==='CBC'?'CBC':'OBC')} grading</p><div class="progress"><span style="width:${pct}%"></span></div><small>${entered}/${total} marks entered</small></section>
      ${(d.subjects?.length||0)===0?'<div class="notice">First add the subjects taught in this class. Tap + Add Subject.</div>':(d.pupils?.length||0)===0?'<div class="notice">Now add the pupils in your class. Tap + Add Pupil.</div>':''}
      <div class="action-grid">
        <button class="action-card subject-action" data-go="subjects"><b>＋ Subjects</b><span>Add or edit subjects for this class one by one.</span></button>
        <button class="action-card pupil-action" data-go="pupils"><b>👥 Pupils</b><span>Add pupils using first name and surname.</span></button>
        <button class="action-card" data-go="results"><b>✎ Enter Results</b><span>Enter marks for all pupils and subjects.</span></button>
        <button class="action-card" data-go="reports"><b>▤ Generate Reports</b><span>Old-style progress report, AI comment, PDF and WhatsApp.</span></button>
        <button class="action-card" data-go="setup"><b>⚙ Class Setup</b><span>School, class, assessment and grading system.</span></button>
      </div>`;
    c.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));
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
      <details class="optional-details" ${p.sex||p.examNo||p.parentPhone?'open':''}><summary>Optional pupil details</summary>
        <div class="optional-grid">
          <label>Sex<select id="pupilSex"><option value="">Not set</option><option value="F" ${p.sex==='F'?'selected':''}>Female</option><option value="M" ${p.sex==='M'?'selected':''}>Male</option></select></label>
          <label>Exam number<input id="pupilExamNo" value="${esc(p.examNo||'')}" placeholder="Optional"></label>
          <label>Parent / guardian WhatsApp<input id="pupilPhone" value="${esc(p.parentPhone||'')}" inputmode="tel" placeholder="e.g. 097xxxxxxx"></label>
        </div>
      </details>
      <button class="btn primary big" type="submit">${p.id?'Save Changes':'Save Pupil'}</button>
    </form>`;
  }

  function openPupilForm(pupil=null){
    showModal(`<div class="modal-scroll pupil-modal"><div class="page-head"><h2>${pupil?'Edit Pupil':'Add Pupil'}</h2><p>Enter the pupil's first name and surname.</p></div>${pupilFormHtml(pupil||{})}</div>`);
    const form=byId('singlePupilForm');setTimeout(()=>byId('pupilFirstName')?.focus(),60);
    form.onsubmit=async e=>{
      e.preventDefault();
      const firstName=byId('pupilFirstName').value.trim(),surname=byId('pupilSurname').value.trim();
      if(!firstName||!surname){toast('Enter both first name and surname',true);return;}
      const body={firstName,surname,sex:byId('pupilSex').value,examNo:byId('pupilExamNo').value.trim(),parentPhone:byId('pupilPhone').value.trim()};
      const btn=e.submitter;btn.disabled=true;btn.textContent=pupil?'Saving…':'Adding…';
      try{await api(pupil?`/api/pupils/${encodeURIComponent(pupil.id)}`:'/api/pupils',{method:pupil?'PUT':'POST',body});closeModal();toast(pupil?'Pupil updated':'Pupil added');await navigate('pupils');}
      catch(err){toast(err.message,true);btn.disabled=false;btn.textContent=pupil?'Save Changes':'Save Pupil';}
    };
  }

  async function removePupil(p){
    if(!p||!confirm(`Remove ${p.name} from this class?`))return;
    try{await api(`/api/pupils/${encodeURIComponent(p.id)}`,{method:'DELETE'});toast('Pupil removed');await navigate('pupils');}catch(err){toast(err.message,true);}
  }

  function renderPupils(c){
    const d=state.me,pupils=d.pupils||[];
    const list=pupils.length?pupils.map((p,i)=>{const n=splitStoredName(p);return `<article class="pupil-row">
      <div class="pupil-number">${i+1}</div>
      <div class="pupil-name-block"><b>${esc(n.firstName)} ${esc(n.surname)}</b><span>${esc(p.examNo||'')}</span></div>
      <div class="pupil-row-actions"><button class="icon-btn" type="button" data-edit-pupil="${p.id}" title="Edit pupil">✎</button><button class="icon-btn danger-icon" type="button" data-delete-pupil="${p.id}" title="Remove pupil">×</button></div>
    </article>`}).join(''):`<div class="empty-pupils"><div class="empty-plus">＋</div><h3>No pupils added yet</h3><p>Tap <b>+ Add Pupil</b> and enter the learner's first name and surname.</p></div>`;
    c.innerHTML=`<div class="page-head row-head pupils-head"><div><h2>Pupils</h2><p>${esc(d.class?.name||'Your class')} • ${pupils.length} ${pupils.length===1?'pupil':'pupils'}</p></div><button id="addPupil" class="btn primary add-pupil-btn" type="button"><span class="plus-symbol">＋</span> Add Pupil</button></div>
      <div class="pupil-list">${list}</div>${pupils.length?'<button id="addAnotherPupil" class="btn ghost full add-another" type="button">＋ Add another pupil</button>':''}`;
    byId('addPupil').onclick=()=>openPupilForm();if(byId('addAnotherPupil'))byId('addAnotherPupil').onclick=()=>openPupilForm();
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
    const list=subjects.length?subjects.map((s,i)=>`<article class="subject-row"><div class="subject-number">${i+1}</div><div class="subject-name-block"><b>${esc(s.name)}</b><span>Marks will appear automatically under Results.</span></div><div class="subject-row-actions"><button class="icon-btn" data-edit-subject="${s.id}" title="Edit subject">✎</button><button class="icon-btn danger-icon" data-delete-subject="${s.id}" title="Remove subject">×</button></div></article>`).join(''):`<div class="empty-pupils"><div class="empty-plus">＋</div><h3>No subjects added yet</h3><p>Tap <b>+ Add Subject</b> and add the subjects taught in this class one by one.</p></div>`;
    c.innerHTML=`<div class="page-head row-head subjects-head"><div><h2>Subjects</h2><p>${esc(d.class?.name||'Your class')} • ${subjects.length}/10 subjects</p></div><button id="addSubject" class="btn primary add-subject-btn"><span class="plus-symbol">＋</span> Add Subject</button></div><div class="subject-list">${list}</div>${subjects.length?'<button id="addAnotherSubject" class="btn ghost full add-another">＋ Add another subject</button>':''}<button id="backHomeFromSubjects" class="btn ghost full">Back to Home</button>`;
    byId('addSubject').onclick=()=>openSubjectForm();if(byId('addAnotherSubject'))byId('addAnotherSubject').onclick=()=>openSubjectForm();
    byId('backHomeFromSubjects').onclick=()=>navigate(subjects.length?'home':'setup');
    c.querySelectorAll('[data-edit-subject]').forEach(b=>b.onclick=()=>openSubjectForm(subjects.find(s=>s.id===b.dataset.editSubject)));
    c.querySelectorAll('[data-delete-subject]').forEach(b=>b.onclick=()=>removeSubject(subjects.find(s=>s.id===b.dataset.deleteSubject)));
  }

  function renderSetup(c){
    const d=state.me,grading=d.class?.gradingSystem==='CBC'?'CBC':'OBC';
    const teacherName=d.class?.teacherName||d.user?.name||'';
    const teacherPhone=d.class?.teacherPhone||d.user?.phone||'';
    c.innerHTML=`<div class="page-head"><h2>Class Setup</h2><p>Enter the class teacher details once, then set the school, class, assessment and grading system.</p></div><form id="setupForm" class="card stack">
      <div class="teacher-details-box"><h3>Class Teacher</h3><div class="teacher-grid">
        <label>Class teacher name<input id="teacherName" value="${esc(teacherName)}" placeholder="e.g. Pearson Kamanga" autocomplete="name" required></label>
        <label>Phone number<input id="teacherPhone" value="${esc(teacherPhone)}" placeholder="e.g. 0973731979" inputmode="tel" autocomplete="tel" required></label>
      </div></div>
      <label>School name<input id="schoolName" value="${esc(d.class?.schoolName||'')}" required></label>
      <label>Class<input id="className" value="${esc(d.class?.name||'')}" placeholder="e.g. 10L" required></label>
      <label>Assessment name<input id="assessmentName" value="${esc(d.assessment?.name||'Current Assessment')}" placeholder="e.g. Term 2 Examination 2026"></label>
      <label>Grading system<select id="grading"><option value="CBC" ${grading==='CBC'?'selected':''}>CBC (Grades 1–5)</option><option value="OBC" ${grading==='OBC'?'selected':''}>OBC (Grades 1–9)</option></select></label>
      <div class="setup-subject-link"><div><b>${d.subjects?.length||0} subjects added</b><span>Add, edit or remove subjects one by one.</span></div><button id="manageSubjects" class="btn ghost" type="button">＋ Subjects</button></div>
      <button class="btn primary big" type="submit">Save Class Setup</button>
    </form>`;
    byId('manageSubjects').onclick=()=>navigate('subjects');
    byId('setupForm').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;btn.textContent='Saving…';try{state.me=await api('/api/setup',{method:'PUT',body:{teacherName:byId('teacherName').value,teacherPhone:byId('teacherPhone').value,schoolName:byId('schoolName').value,className:byId('className').value,assessmentName:byId('assessmentName').value,gradingSystem:byId('grading').value}});toast('Class setup saved');renderShell();navigate((state.me.subjects?.length||0)?((state.me.pupils?.length||0)?'home':'pupils'):'subjects');}catch(err){toast(err.message,true)}finally{btn.disabled=false;btn.textContent='Save Class Setup';}};
  }

  function renderResults(c){
    const d=state.me;if(!setupComplete()){c.innerHTML='<div class="notice">Add at least one subject and at least one pupil first.</div>';return;}
    const heads=d.subjects.map(s=>`<th>${esc(s.name)}</th>`).join('');
    const rows=d.pupils.map((p,i)=>`<tr><th class="pupil-cell"><span>${i+1}. ${esc(p.name)}</span><small>${esc(p.examNo||'')}</small></th>${d.subjects.map(s=>{const v=d.marks?.[p.id]?.[s.id];return `<td><input class="mark-box" data-pupil="${p.id}" data-subject="${s.id}" type="number" min="0" max="100" step="0.1" value="${v??''}" placeholder="—"></td>`}).join('')}</tr>`).join('');
    c.innerHTML=`<div class="page-head row-head"><div><h2>Enter Results</h2><p>${esc(d.assessment?.name||'Current Assessment')}</p></div><div id="saveState" class="save-state">✓ Saved</div></div><div class="marks-wrap"><table class="marks-table"><thead><tr><th class="pupil-cell">Pupil</th>${heads}</tr></thead><tbody>${rows}</tbody></table></div><p class="helper">Blank means no mark entered. Marks save automatically.</p>`;
    c.querySelectorAll('.mark-box').forEach(input=>input.addEventListener('input',scheduleSave));
  }

  function scheduleSave(){const status=byId('saveState');if(status){status.textContent='Saving…';status.classList.add('saving');}clearTimeout(state.saveTimer);state.saveTimer=setTimeout(saveResults,700);}
  async function saveResults(){const inputs=[...document.querySelectorAll('.mark-box')];if(!inputs.length)return;const rows=inputs.map(x=>({pupilId:x.dataset.pupil,subjectId:x.dataset.subject,mark:x.value===''?null:Number(x.value)}));try{await api('/api/results',{method:'PUT',body:{rows}});const status=byId('saveState');if(status){status.textContent='✓ Saved';status.classList.remove('saving');}}catch(e){const status=byId('saveState');if(status){status.textContent='Not saved';status.classList.remove('saving');}toast(e.message,true);}}

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
    const rows=d.subjects.map(s=>{const raw=d.marks?.[p.id]?.[s.id];const has=raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(Number(raw));const mark=has?Number(raw):null;const grade=has?(isCBC?gradeCBC(mark):gradeOBC(mark)):null;const st=subjectStats(d,s.id);return{subjectId:s.id,subject:s.name,mark,grade,points:grade,average:st.average,totalSat:st.sat,remark:has?(isCBC?remarkCBC(grade):remarkOBC(grade)):'PENDING'};});
    const entered=rows.filter(r=>r.mark!==null),complete=rows.length>0&&entered.length===rows.length;let summary={complete,entered:entered.length,total:rows.length};
    if(entered.length)summary.average=Math.round(entered.reduce((n,x)=>n+x.mark,0)/entered.length*10)/10;
    if(isCBC&&entered.length)summary.averageGrade=gradeCBC(summary.average);
    if(!isCBC&&entered.length>=6){const best=[...entered].sort((a,b)=>b.mark-a.mark).slice(0,6);summary.best6=best.reduce((n,x)=>n+x.mark,0);summary.points=best.reduce((n,x)=>n+x.grade,0);summary.division=summary.points<=12?'I':summary.points<=17?'II':summary.points<=24?'III':summary.points<=35?'IV':'FAIL';}
    return{rows,summary};
  }

  function overallPosition(d,p){
    const isCBC=d.class.gradingSystem==='CBC';
    const ranked=(d.pupils||[]).map(x=>({p:x,m:reportModel(d,x)})).filter(x=>x.m.summary.complete).sort((a,b)=>{
      if(isCBC)return (b.m.summary.average||0)-(a.m.summary.average||0);
      return (a.m.summary.points??999)-(b.m.summary.points??999)||(b.m.summary.best6||0)-(a.m.summary.best6||0);
    });
    let rank=0,lastKey='',shown=0;
    for(let i=0;i<ranked.length;i++){
      const x=ranked[i],key=isCBC?String(x.m.summary.average):`${x.m.summary.points}:${x.m.summary.best6}`;
      if(key!==lastKey){rank=i+1;lastKey=key;}if(x.p.id===p.id){shown=rank;break;}
    }
    return shown||'—';
  }

  function pronouns(sex){const s=String(sex||'').toUpperCase();if(s==='F')return{subj:'She',subjL:'she',obj:'her'};if(s==='M')return{subj:'He',subjL:'he',obj:'him'};return{subj:'The learner',subjL:'the learner',obj:'the learner'};}
  function smartLocalComment(d,p,m){
    const entered=m.rows.filter(x=>x.mark!==null),pr=pronouns(p.sex),name=p.name||'This pupil';
    if(!entered.length)return `Dear Parent/Guardian, results for ${name} have not yet been entered for ${d.assessment.name}. The report will be completed once the subject marks are available.`;
    if(!m.summary.complete){const missing=m.rows.filter(x=>x.mark===null).map(x=>x.subject);return `Dear Parent/Guardian, ${name}'s result record for ${d.assessment.name} is not yet complete. ${m.summary.entered} of ${m.summary.total} subject results have been entered${missing.length?`, while ${missing.slice(0,3).join(', ')}${missing.length>3?' and other subjects':''} are still pending`:''}. A final overall judgement should be made after all required marks are entered. Please continue encouraging ${pr.obj} to revise consistently while the remaining results are completed.`;}
    const sorted=[...entered].sort((a,b)=>b.mark-a.mark),best=sorted[0],weak=sorted[sorted.length-1];let text=`Dear Parent/Guardian, ${name} completed ${d.assessment.name} at ${d.class.schoolName}. `;
    if(d.class.gradingSystem==='CBC')text+=`${pr.subj} obtained an overall average of ${m.summary.average}%, which is CBC Grade ${m.summary.averageGrade} (${remarkCBC(m.summary.averageGrade)}). `;
    else text+=`${pr.subj} recorded a Best 6 total of ${m.summary.best6}/600, ${m.summary.points} grade points and Division ${m.summary.division}. `;
    text+=`${pr.subj} performed strongest in ${best.subject} with ${best.mark}%. `;
    if(weak.subject!==best.subject)text+=`To improve the overall result, ${pr.subjL} should give more attention to ${weak.subject}, where the mark was ${weak.mark}% (${d.class.gradingSystem==='CBC'?`Grade ${weak.grade} — ${weak.remark}`:`Grade ${weak.grade} — ${weak.remark}`}). `;
    text+=`Please encourage regular revision, careful correction of mistakes and consultation with subject teachers where help is needed. Continued effort and good study habits can strengthen the next result.`;
    return text;
  }
  function teacherComment(d,p,m){return String(p.classTeacherComment||'').trim()||smartLocalComment(d,p,m);}

  function renderReports(c){
    const d=state.me;if(!setupComplete()){c.innerHTML='<div class="notice">Add at least one subject and at least one pupil first.</div>';return;}
    const cards=d.pupils.map(p=>{const m=reportModel(d,p),saved=String(p.classTeacherComment||'').trim();return `<article class="report-card"><div><b>${esc(p.name)}</b><small>${esc(p.examNo||'No exam number')}</small><span class="status ${m.summary.complete?'ready':'pending'}">${m.summary.complete?'Ready for WhatsApp':`${m.summary.entered}/${m.summary.total} subjects`}</span>${saved?'<span class="comment-saved">✨ Comment saved</span>':''}</div><div class="report-actions"><button class="btn ghost" data-preview="${p.id}">Preview / Comment</button><button class="btn primary" data-pdf="${p.id}">PDF</button><button class="btn whatsapp" data-share="${p.id}">WhatsApp</button></div></article>`}).join('');
    c.innerHTML=`<div class="page-head row-head"><div><h2>Reports</h2><p>Progress-report appearance restored from the earlier version, with editable AI class-teacher comments.</p></div><button id="allPdf" class="btn primary">Download All</button></div><div class="report-list">${cards}</div>`;
    c.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>previewReport(b.dataset.preview));c.querySelectorAll('[data-pdf]').forEach(b=>b.onclick=()=>downloadOne(b.dataset.pdf));c.querySelectorAll('[data-share]').forEach(b=>b.onclick=()=>shareOne(b.dataset.share));byId('allPdf').onclick=downloadAll;
  }

  function displayDate(){return new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});}
  function reportHtml(d,p){
    const m=reportModel(d,p),pos=overallPosition(d,p),year=new Date().getFullYear(),comment=teacherComment(d,p,m);
    return `<div class="report-sheet report-v21">
      <div class="report-head old-report-head"><div class="republic">REPUBLIC OF ZAMBIA</div><div class="ministry">MINISTRY OF EDUCATION</div><h2>${esc(String(d.class.schoolName||'').toUpperCase())}</h2><h3>PUPIL'S PROGRESS REPORT</h3></div>
      ${!m.summary.complete?'<div class="incomplete old-incomplete">INCOMPLETE REPORT — SOME RESULTS PENDING</div>':''}
      <div class="old-meta-box"><div><b>NAME:</b><span>${esc(String(p.name||'').toUpperCase())}</span><b>CLASS:</b><span>${esc(d.class.name)}</span><b>SEX:</b><span>${esc(p.sex||'—')}</span><b>DATE:</b><span>${esc(displayDate())}</span></div><div><b>YEAR:</b><span>${year}</span><b>EXAM NO:</b><span>${esc(p.examNo||'—')}</span><b>ASSESSMENT:</b><span>${esc(d.assessment.name)}</span><b>OVERALL POS:</b><span>${esc(pos)}</span></div></div>
      <div class="report-table-wrap"><table class="report-table old-report-table"><thead><tr><th>SUBJECT</th><th>TOTAL SAT</th><th>MARK (%)</th><th>GRADE</th><th>PTS</th><th>AV</th><th>COMMENT</th></tr></thead><tbody>${m.rows.map((r,i)=>`<tr class="${i%2?'alt':''}"><td>${esc(String(r.subject).toUpperCase())}</td><td>${r.totalSat}</td><td class="grade-mark">${r.mark??'—'}</td><td class="grade-mark">${r.grade??'—'}</td><td>${r.points??'—'}</td><td>${r.average??'—'}</td><td>${esc(r.remark)}</td></tr>`).join('')}</tbody></table></div>
      <div class="old-summary">${!m.summary.complete?`RESULT STATUS: <b>INCOMPLETE (${m.summary.entered}/${m.summary.total} subjects entered)</b>`:d.class.gradingSystem==='CBC'?`OVERALL AVERAGE: <b>${m.summary.average}%</b><span>CBC AVERAGE GRADE: <b>Grade ${m.summary.averageGrade} — ${esc(remarkCBC(m.summary.averageGrade))}</b></span>`:`TOTAL MARKS (Best 6): <b>${m.summary.best6}/600</b><span>GRADE POINTS: <b>${m.summary.points}</b> • DIVISION: <b>${esc(m.summary.division)}</b></span>`}</div>
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
    let y=44;doc.rect(12,y,186,28);doc.setFontSize(8.8);const left=15,right=108;
    const line=(label,value,x,yy,offset=18)=>{doc.setFont('helvetica','bold');doc.setTextColor(0);doc.text(label,x,yy);doc.setFont('helvetica','normal');doc.text(String(value||'—').slice(0,42),x+offset,yy);};
    line('NAME:',String(p.name||'').toUpperCase(),left,y+6,15);line('CLASS:',d.class.name,left,y+12,15);line('SEX:',p.sex||'—',left,y+18,15);line('DATE:',displayDate(),left,y+24,15);
    line('YEAR:',new Date().getFullYear(),right,y+6,15);line('EXAM NO:',p.examNo||'—',right,y+12,21);line('ASSESS:',d.assessment.name,right,y+18,18);line('OVERALL POS:',pos,right,y+24,28);
    if(!m.summary.complete){doc.setTextColor(...red);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text('INCOMPLETE REPORT — SOME RESULTS PENDING',105,75,{align:'center'});}
    const widths=[48,20,20,16,14,16,52],headers=['SUBJECT','TOTAL SAT','MARK (%)','GRADE','PTS','AV','COMMENT'];let x=12;y=79;doc.setFillColor(...blue);doc.setDrawColor(0);headers.forEach((h,i)=>{doc.rect(x,y,widths[i],9,'FD');x+=widths[i];});doc.setTextColor(255);doc.setFont('helvetica','bold');doc.setFontSize(7.6);x=12;headers.forEach((h,i)=>{doc.text(h,x+widths[i]/2,y+5.7,{align:'center'});x+=widths[i];});y+=9;
    const gradeColor=g=>g<=2?blue:g<=4?green:g<=6?orange:red;
    m.rows.forEach((r,i)=>{x=12;if(i%2){doc.setFillColor(...light);}else doc.setFillColor(255,255,255);widths.forEach(w=>{doc.setDrawColor(0);doc.rect(x,y,w,8,'FD');x+=w;});x=12;doc.setFont('helvetica','normal');doc.setFontSize(8.2);doc.setTextColor(0);doc.text(String(r.subject).toUpperCase().slice(0,27),x+2,y+5.3);x+=widths[0];doc.setTextColor(60);doc.text(String(r.totalSat),x+widths[1]/2,y+5.3,{align:'center'});x+=widths[1];if(r.grade!==null){doc.setTextColor(...gradeColor(r.grade));doc.setFont('helvetica','bold');}else{doc.setTextColor(150);doc.setFont('helvetica','normal');}doc.text(r.mark===null?'—':String(r.mark),x+widths[2]/2,y+5.3,{align:'center'});x+=widths[2];doc.text(r.grade===null?'—':String(r.grade),x+widths[3]/2,y+5.3,{align:'center'});x+=widths[3];doc.setTextColor(0);doc.setFont('helvetica','normal');doc.text(r.points===null?'—':String(r.points),x+widths[4]/2,y+5.3,{align:'center'});x+=widths[4];doc.text(r.average===null?'—':String(r.average),x+widths[5]/2,y+5.3,{align:'center'});x+=widths[5];doc.setFontSize(7.3);doc.text(String(r.remark).slice(0,25),x+widths[6]/2,y+5.3,{align:'center'});y+=8;});
    y+=5;doc.setTextColor(0);doc.setFont('helvetica','bold');doc.setFontSize(9.5);
    if(!m.summary.complete)doc.text(`RESULT STATUS: INCOMPLETE (${m.summary.entered}/${m.summary.total} subjects entered)`,12,y);
    else if(d.class.gradingSystem==='CBC'){doc.text(`OVERALL AVERAGE: ${m.summary.average}%`,12,y);const rightText=`CBC AVG GRADE: Grade ${m.summary.averageGrade} - ${remarkCBC(m.summary.averageGrade)}`;doc.text(rightText,198-doc.getTextWidth(rightText),y);}
    else{doc.text(`TOTAL MARKS (Best 6): ${m.summary.best6} / 600`,12,y);const rightText=`POINTS: ${m.summary.points}   DIVISION: ${m.summary.division}`;doc.text(rightText,198-doc.getTextWidth(rightText),y);}
    y+=7;doc.setDrawColor(180);doc.line(12,y,198,y);y+=6;doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text("Class Teacher's Comment:",12,y);y+=5;doc.setFont('helvetica','normal');doc.setFontSize(8.6);const lines=doc.splitTextToSize(teacherComment(d,p,m),186);doc.text(lines.slice(0,13),12,y);y+=Math.min(lines.length,13)*4+6;
    doc.setFontSize(8);doc.text(String(d.class?.teacherName||d.user?.name||''),15,Math.min(y,257));if(d.class?.teacherPhone){doc.setFontSize(7.2);doc.setTextColor(80);doc.text(String(d.class.teacherPhone),15,Math.min(y+3.5,260));doc.setTextColor(0);}const sy=Math.min(y+6,263);doc.setDrawColor(0);doc.line(15,sy,78,sy);doc.line(120,sy,180,sy);doc.text('Class Teacher',15,sy+4);doc.text('Date',120,sy+4);
    doc.setFontSize(7.5);doc.setTextColor(80);doc.text(`Reportform ZM • ${d.class.gradingSystem} • ${pageNo}`,198,280,{align:'right'});
  }

  async function buildDoc(pupils){const JsPDF=await ensurePdf(),doc=new JsPDF({unit:'mm',format:'a4'});pupils.forEach((p,i)=>{if(i)doc.addPage();drawPdf(doc,state.me,p,i+1);});return doc;}
  async function downloadOne(id){try{const p=state.me.pupils.find(x=>x.id===id);if(!p)return;const doc=await buildDoc([p]);doc.save(`${state.me.class.name}_${p.name.replace(/\s+/g,'_')}.pdf`);}catch(e){toast(e.message,true);}}
  async function downloadAll(){try{const doc=await buildDoc(state.me.pupils);doc.save(`${state.me.class.name}_${state.me.assessment.name.replace(/\s+/g,'_')}_Reports.pdf`);}catch(e){toast(e.message,true);}}
  function normalizeWhatsAppPhone(value){let x=String(value||'').replace(/\D/g,'');if(x.startsWith('00'))x=x.slice(2);if(x.startsWith('0'))x='260'+x.slice(1);return x;}
  async function shareOne(id){const p=state.me.pupils.find(x=>x.id===id);if(!p)return;try{const doc=await buildDoc([p]),blob=doc.output('blob'),file=new File([blob],`${state.me.class.name}_${p.name.replace(/\s+/g,'_')}.pdf`,{type:'application/pdf'}),message=`${state.me.class.schoolName} — ${state.me.assessment.name} report for ${p.name}.`;if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({files:[file],title:`${p.name} - Pupil Report`,text:message});return;}doc.save(file.name);const phone=normalizeWhatsAppPhone(p.parentPhone),url=`https://wa.me/${phone}?text=${encodeURIComponent(message+' The PDF has been downloaded; please attach it to this WhatsApp message.')}`;const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';document.body.appendChild(link);link.click();link.remove();toast('PDF downloaded. WhatsApp opened — attach the downloaded report.');}catch(e){if(e.name!=='AbortError')toast(e.message,true);}}

  bootstrap().catch(err=>{app.innerHTML=`<div class="auth-page"><div class="auth-card"><h2>Reportform ZM could not open</h2><p>${esc(err.message||err)}</p><button class="btn primary full" onclick="location.reload()">Try again</button></div></div>`;});
})();
