(() => {
  const APP_VERSION='3.0.3';
  const app=document.getElementById('app');
  const state={token:localStorage.getItem('reportform_token')||'',me:null,page:'home',saveTimer:null};
  const esc=s=>String(s??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  const byId=id=>document.getElementById(id);

  async function api(path,opts={}){
    const headers={...(opts.headers||{})};
    if(state.token) headers.Authorization=`Bearer ${state.token}`;
    if(opts.body) headers['Content-Type']='application/json';
    const body=opts.body&&typeof opts.body!=='string'?JSON.stringify(opts.body):opts.body;
    const res=await fetch(path,{...opts,headers,body,cache:'no-store'});
    const data=await res.json().catch(()=>({}));
    if(res.status===401){localStorage.removeItem('reportform_token');state.token='';state.me=null;renderLogin();throw new Error(data.error||'Please sign in again');}
    if(!res.ok) throw new Error(data.error||`Request failed (${res.status})`);
    return data;
  }

  function toast(message,bad=false){
    let t=document.querySelector('.toast');if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t);}t.classList.toggle('bad',bad);t.textContent=message;t.style.display='block';clearTimeout(t._t);t._t=setTimeout(()=>t.style.display='none',2600);
  }

  function renderLogin(){
    app.innerHTML=`<div class="auth-page"><div class="auth-card">
      <div class="brand-row"><div class="logo">RZ</div><div><h1>Reportform ZM</h1><p>Simple class teacher report app</p></div></div>
      <div class="welcome-box"><b>Enter results. Generate reports. Send on WhatsApp.</b><span>Simple class teacher mode with CBC and OBC grading.</span></div>
      <form id="loginForm" class="stack">
        <label>Staff ID / Username<input id="loginId" autocomplete="username" placeholder="e.g. kamanga" required></label>
        <label>PIN<input id="loginPin" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="current-password" placeholder="At least 4 numbers" required></label>
        <button class="btn primary big" type="submit">Sign in</button>
      </form>
      <button id="showRegister" class="btn ghost full" type="button">Create class teacher account</button>
      <p class="micro">Your PIN can be numbers only, with a minimum of 4 digits.</p>
    </div></div>`;
    byId('showRegister').onclick=renderRegister;
    byId('loginForm').onsubmit=async e=>{e.preventDefault();const pin=byId('loginPin').value.trim();if(!/^\d{4,}$/.test(pin)){toast('PIN must be at least 4 numbers',true);return;}const btn=e.submitter;btn.disabled=true;btn.textContent='Opening…';try{const d=await api('/api/login',{method:'POST',body:{identifier:byId('loginId').value,pin}});state.token=d.token;localStorage.setItem('reportform_token',state.token);await bootstrap();}catch(err){toast(err.message,true)}finally{btn.disabled=false;btn.textContent='Sign in';}};
  }

  function renderRegister(){
    app.innerHTML=`<div class="auth-page"><div class="auth-card wide-auth">
      <button class="back-link" id="backLogin">← Back</button>
      <div class="brand-row"><div class="logo">RZ</div><div><h1>Create account</h1><p>Class teacher only</p></div></div>
      <form id="registerForm" class="stack">
        <label>Full name<input id="regName" placeholder="e.g. Pearson Kamanga" required></label>
        <label>Staff ID / Username<input id="regId" placeholder="e.g. kamanga" required></label>
        <label>School name<input id="regSchool" value="Lumezi Boarding Secondary School" required></label>
        <label>Class<input id="regClass" placeholder="e.g. 12L" required></label>
        <label>Grading system<select id="regGrade"><option value="CBC">CBC (Grades 1–5)</option><option value="OBC">OBC (Grades 1–9)</option></select></label>
        <label>PIN<input id="regPin" type="password" inputmode="numeric" pattern="[0-9]*" placeholder="At least 4 numbers" required></label>
        <label>Confirm PIN<input id="regPin2" type="password" inputmode="numeric" pattern="[0-9]*" placeholder="Repeat PIN" required></label>
        <button class="btn primary big" type="submit">Create account</button>
      </form>
    </div></div>`;
    byId('backLogin').onclick=renderLogin;
    byId('registerForm').onsubmit=async e=>{e.preventDefault();const p=byId('regPin').value.trim(),p2=byId('regPin2').value.trim();if(!/^\d{4,}$/.test(p)){toast('PIN must contain numbers only and be at least 4 digits',true);return;}if(p!==p2){toast('PINs do not match',true);return;}const btn=e.submitter;btn.disabled=true;btn.textContent='Creating…';try{const d=await api('/api/register',{method:'POST',body:{name:byId('regName').value,identifier:byId('regId').value,pin:p,schoolName:byId('regSchool').value,className:byId('regClass').value,gradingSystem:byId('regGrade').value}});state.token=d.token;localStorage.setItem('reportform_token',state.token);await bootstrap();}catch(err){toast(err.message,true)}finally{btn.disabled=false;btn.textContent='Create account';}};
  }

  async function bootstrap(){state.me=await api('/api/me');renderShell();const first=(state.me?.subjects?.length||0)>0?((state.me?.pupils?.length||0)>0?'home':'pupils'):'setup';navigate(first);}
  function setupComplete(){return (state.me?.subjects?.length||0)>0&&(state.me?.pupils?.length||0)>0;}

  function renderShell(){
    const d=state.me;app.innerHTML=`<div class="shell"><header class="topbar"><div><div class="app-title">Reportform ZM</div><div class="subtle">${esc(d.class?.name||'My Class')} • ${esc(d.user?.name||'')}</div></div><button id="signout" class="btn ghost">Sign out</button></header><main id="content" class="content"></main><nav class="bottom-nav"><button data-nav="home">⌂<span>Home</span></button><button data-nav="pupils">👥<span>Pupils</span></button><button data-nav="results">✎<span>Results</span></button><button data-nav="reports">▤<span>Reports</span></button></nav></div>`;
    document.querySelectorAll('[data-nav]').forEach(b=>b.onclick=()=>navigate(b.dataset.nav));byId('signout').onclick=()=>{state.token='';state.me=null;localStorage.removeItem('reportform_token');renderLogin();};
  }

  async function refresh(){state.me=await api('/api/class-data');}
  async function navigate(page){state.page=page;document.querySelectorAll('[data-nav]').forEach(b=>b.classList.toggle('active',b.dataset.nav===page));const c=byId('content');c.innerHTML='<div class="card">Loading…</div>';try{await refresh();if(page==='home')renderHome(c);else if(page==='pupils')renderPupils(c);else if(page==='results')renderResults(c);else if(page==='reports')renderReports(c);else renderSetup(c);}catch(e){c.innerHTML=`<div class="error-card">${esc(e.message)}</div>`;}}

  function stats(){const d=state.me,total=(d.pupils?.length||0)*(d.subjects?.length||0);let entered=0;for(const p of d.pupils||[])for(const s of d.subjects||[])if(d.marks?.[p.id]?.[s.id]!==null&&d.marks?.[p.id]?.[s.id]!==undefined)entered++;return{total,entered};}

  function renderHome(c){const d=state.me,{total,entered}=stats(),pct=total?Math.round(entered/total*100):0;c.innerHTML=`<section class="hero"><span class="eyebrow">CLASS TEACHER MODE</span><h1>${esc(d.class?.name||'My Class')}</h1><p>${d.pupils?.length||0} pupils • ${esc(d.class?.gradingSystem==='CBC'?'CBC':'OBC')} grading</p><div class="progress"><span style="width:${pct}%"></span></div><small>${entered}/${total} marks entered</small></section>
    ${(d.subjects?.length||0)===0?'<div class="notice">First add your subjects in Class Setup.</div>':(d.pupils?.length||0)===0?'<div class="notice">Now add the pupils in your class. Tap the + Add Pupil button.</div>':''}
    <div class="action-grid"><button class="action-card pupil-action" data-go="pupils"><b>👥 Pupils</b><span>Add pupils one by one using first name and surname.</span></button><button class="action-card" data-go="results"><b>✎ Enter Results</b><span>Enter marks for all pupils and subjects.</span></button><button class="action-card" data-go="reports"><b>▤ Generate Reports</b><span>Preview, download or send pupil reports on WhatsApp.</span></button><button class="action-card" data-go="setup"><b>⚙ Class Setup</b><span>Change school, class, assessment, grading system or subjects.</span></button></div>`;c.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>navigate(b.dataset.go));}

  function splitStoredName(p){
    const first=String(p.firstName||'').trim();
    const surname=String(p.surname||'').trim();
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
    const form=byId('singlePupilForm');
    setTimeout(()=>byId('pupilFirstName')?.focus(),60);
    form.onsubmit=async e=>{
      e.preventDefault();
      const firstName=byId('pupilFirstName').value.trim(),surname=byId('pupilSurname').value.trim();
      if(!firstName||!surname){toast('Enter both first name and surname',true);return;}
      const body={firstName,surname,sex:byId('pupilSex').value,examNo:byId('pupilExamNo').value.trim(),parentPhone:byId('pupilPhone').value.trim()};
      const btn=e.submitter;btn.disabled=true;btn.textContent=pupil?'Saving…':'Adding…';
      try{
        await api(pupil?`/api/pupils/${encodeURIComponent(pupil.id)}`:'/api/pupils',{method:pupil?'PUT':'POST',body});
        closeModal();toast(pupil?'Pupil updated':'Pupil added');await navigate('pupils');
      }catch(err){toast(err.message,true);btn.disabled=false;btn.textContent=pupil?'Save Changes':'Save Pupil';}
    };
  }

  async function removePupil(p){
    if(!confirm(`Remove ${p.name} from this class?`))return;
    try{await api(`/api/pupils/${encodeURIComponent(p.id)}`,{method:'DELETE'});toast('Pupil removed');await navigate('pupils');}catch(err){toast(err.message,true);}
  }

  function renderPupils(c){
    const d=state.me, pupils=d.pupils||[];
    const list=pupils.length?pupils.map((p,i)=>{const n=splitStoredName(p);return `<article class="pupil-row">
      <div class="pupil-number">${i+1}</div>
      <div class="pupil-name-block"><b>${esc(n.firstName)} ${esc(n.surname)}</b><span>${esc(p.examNo||'')}</span></div>
      <div class="pupil-row-actions"><button class="icon-btn" type="button" data-edit-pupil="${p.id}" title="Edit pupil">✎</button><button class="icon-btn danger-icon" type="button" data-delete-pupil="${p.id}" title="Remove pupil">×</button></div>
    </article>`}).join(''):`<div class="empty-pupils"><div class="empty-plus">＋</div><h3>No pupils added yet</h3><p>Tap <b>+ Add Pupil</b> and enter the learner's first name and surname.</p></div>`;
    c.innerHTML=`<div class="page-head row-head pupils-head"><div><h2>Pupils</h2><p>${esc(d.class?.name||'Your class')} • ${pupils.length} ${pupils.length===1?'pupil':'pupils'}</p></div><button id="addPupil" class="btn primary add-pupil-btn" type="button"><span class="plus-symbol">＋</span> Add Pupil</button></div>
      <div class="pupil-list">${list}</div>
      ${pupils.length?'<button id="addAnotherPupil" class="btn ghost full add-another" type="button">＋ Add another pupil</button>':''}`;
    byId('addPupil').onclick=()=>openPupilForm();
    if(byId('addAnotherPupil'))byId('addAnotherPupil').onclick=()=>openPupilForm();
    c.querySelectorAll('[data-edit-pupil]').forEach(b=>b.onclick=()=>openPupilForm(pupils.find(p=>p.id===b.dataset.editPupil)));
    c.querySelectorAll('[data-delete-pupil]').forEach(b=>b.onclick=()=>removePupil(pupils.find(p=>p.id===b.dataset.deletePupil)));
  }

  function renderSetup(c){const d=state.me;const subjects=(d.subjects||[]).map(s=>s.name).join('\n');const grading=d.class?.gradingSystem==='CBC'?'CBC':'OBC';c.innerHTML=`<div class="page-head"><h2>Class Setup</h2><p>Set the class details, grading system and subjects. After saving, add pupils with the + button.</p></div><form id="setupForm" class="card stack">
    <label>School name<input id="schoolName" value="${esc(d.class?.schoolName||'')}"></label>
    <label>Class<input id="className" value="${esc(d.class?.name||'')}"></label>
    <label>Assessment name<input id="assessmentName" value="${esc(d.assessment?.name||'Current Assessment')}" placeholder="e.g. Term 2 Examination 2026"></label>
    <label>Grading system<select id="grading"><option value="CBC" ${grading==='CBC'?'selected':''}>CBC (Grades 1–5)</option><option value="OBC" ${grading==='OBC'?'selected':''}>OBC (Grades 1–9)</option></select></label>
    <label>Subjects <span class="hint">One subject per line</span><textarea id="subjects" rows="10" placeholder="English\nMathematics\nScience">${esc(subjects)}</textarea></label>
    <button class="btn primary big" type="submit">Save Class Setup</button>
  </form>`;
    byId('setupForm').onsubmit=async e=>{e.preventDefault();const subjects=byId('subjects').value.split(/\n/).map(x=>x.trim()).filter(Boolean);if(!subjects.length){toast('Enter at least one subject',true);return;}const btn=e.submitter;btn.disabled=true;btn.textContent='Saving…';try{state.me=await api('/api/setup',{method:'PUT',body:{schoolName:byId('schoolName').value,className:byId('className').value,assessmentName:byId('assessmentName').value,gradingSystem:byId('grading').value,subjects}});toast('Class setup saved');renderShell();navigate((state.me.pupils?.length||0)?'home':'pupils');}catch(err){toast(err.message,true)}finally{btn.disabled=false;btn.textContent='Save Class Setup';}};
  }

  function renderResults(c){const d=state.me;if(!setupComplete()){c.innerHTML='<div class="notice">Add subjects in Class Setup and add at least one pupil under Pupils first.</div>';return;}const heads=d.subjects.map(s=>`<th>${esc(s.name)}</th>`).join('');const rows=d.pupils.map((p,i)=>`<tr><th class="pupil-cell"><span>${i+1}. ${esc(p.name)}</span><small>${esc(p.examNo||'')}</small></th>${d.subjects.map(s=>{const v=d.marks?.[p.id]?.[s.id];return `<td><input class="mark-box" data-pupil="${p.id}" data-subject="${s.id}" type="number" min="0" max="100" step="0.1" value="${v??''}" placeholder="—"></td>`}).join('')}</tr>`).join('');c.innerHTML=`<div class="page-head row-head"><div><h2>Enter Results</h2><p>${esc(d.assessment?.name||'Current Assessment')}</p></div><div id="saveState" class="save-state">✓ Saved</div></div><div class="marks-wrap"><table class="marks-table"><thead><tr><th class="pupil-cell">Pupil</th>${heads}</tr></thead><tbody>${rows}</tbody></table></div><p class="helper">Blank means no mark entered. Marks save automatically.</p>`;
    c.querySelectorAll('.mark-box').forEach(input=>input.addEventListener('input',()=>scheduleSave()));}

  function scheduleSave(){const status=byId('saveState');if(status){status.textContent='Saving…';status.classList.add('saving');}clearTimeout(state.saveTimer);state.saveTimer=setTimeout(saveResults,700);}
  async function saveResults(){const inputs=[...document.querySelectorAll('.mark-box')];if(!inputs.length)return;const rows=inputs.map(x=>({pupilId:x.dataset.pupil,subjectId:x.dataset.subject,mark:x.value===''?null:Number(x.value)}));try{await api('/api/results',{method:'PUT',body:{rows}});const status=byId('saveState');if(status){status.textContent='✓ Saved';status.classList.remove('saving');}}catch(e){const status=byId('saveState');if(status){status.textContent='Not saved';status.classList.remove('saving');}toast(e.message,true);}}

  function gradeOBC(mark){const n=Number(mark);return n>=75?1:n>=70?2:n>=65?3:n>=60?4:n>=55?5:n>=50?6:n>=45?7:n>=40?8:9;}
  function remarkOBC(g){return g===1?'EXCELLENT':g===2?'VERY GOOD':g<=4?'GOOD':g<=6?'SATISFACTORY':g<=8?'FAIR':'FAIL';}
  function gradeCBC(mark){const n=Number(mark);return n>=70?1:n>=60?2:n>=50?3:n>=40?4:5;}
  function remarkCBC(g){return ['','OUTSTANDING','ADVANCED','BASIC','SATISFACTORY','UNSATISFACTORY'][g];}

  function reportModel(d,p){const isCBC=d.class.gradingSystem==='CBC';const rows=d.subjects.map(s=>{const raw=d.marks?.[p.id]?.[s.id];const has=raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(Number(raw));const mark=has?Number(raw):null;const grade=has?(isCBC?gradeCBC(mark):gradeOBC(mark)):null;return{subject:s.name,mark,grade,remark:has?(isCBC?remarkCBC(grade):remarkOBC(grade)):'PENDING'};});const entered=rows.filter(r=>r.mark!==null),complete=entered.length===rows.length;let summary={complete,entered:entered.length,total:rows.length};if(complete&&isCBC&&entered.length)summary.average=Math.round(entered.reduce((n,x)=>n+x.mark,0)/entered.length*10)/10;if(complete&&!isCBC&&entered.length>=6){const best=[...entered].sort((a,b)=>b.mark-a.mark).slice(0,6);const points=best.reduce((n,x)=>n+x.grade,0);summary.best6=best.reduce((n,x)=>n+x.mark,0);summary.points=points;summary.division=points<=12?'I':points<=17?'II':points<=24?'III':points<=35?'IV':'FAIL';}return{rows,summary};}
  function teacherComment(d,p,m){const entered=m.rows.filter(x=>x.mark!==null).sort((a,b)=>b.mark-a.mark);if(!entered.length)return 'Results have not yet been entered.';const first=(p.name||'The learner').split(' ')[0],best=entered[0],weak=entered[entered.length-1];if(!m.summary.complete)return `${first}'s report is incomplete because some subject results are still pending.`;return `${first} performed best in ${best.subject}. More attention should be given to ${weak.subject}. Continued effort and regular revision are encouraged.`;}

  function renderReports(c){const d=state.me;if(!setupComplete()){c.innerHTML='<div class="notice">Add subjects in Class Setup and add at least one pupil under Pupils first.</div>';return;}const cards=d.pupils.map(p=>{const m=reportModel(d,p);return `<article class="report-card"><div><b>${esc(p.name)}</b><small>${esc(p.examNo||'No exam number')}</small><span class="status ${m.summary.complete?'ready':'pending'}">${m.summary.complete?'Ready for WhatsApp':`${m.summary.entered}/${m.summary.total} subjects`}</span></div><div class="report-actions"><button class="btn ghost" data-preview="${p.id}">Preview</button><button class="btn primary" data-pdf="${p.id}">PDF</button><button class="btn whatsapp" data-share="${p.id}">WhatsApp</button></div></article>`}).join('');c.innerHTML=`<div class="page-head row-head"><div><h2>Reports</h2><p>Each pupil report is prepared as a PDF ready to share on WhatsApp.</p></div><button id="allPdf" class="btn primary">Download All</button></div><div class="report-list">${cards}</div>`;c.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>previewReport(b.dataset.preview));c.querySelectorAll('[data-pdf]').forEach(b=>b.onclick=()=>downloadOne(b.dataset.pdf));c.querySelectorAll('[data-share]').forEach(b=>b.onclick=()=>shareOne(b.dataset.share));byId('allPdf').onclick=downloadAll;}

  function reportHtml(d,p){const m=reportModel(d,p);return `<div class="report-sheet"><div class="report-head"><div>REPUBLIC OF ZAMBIA<br><b>MINISTRY OF EDUCATION</b></div><h2>${esc(d.class.schoolName)}</h2><h3>PUPIL'S PROGRESS REPORT</h3>${!m.summary.complete?'<div class="incomplete">INCOMPLETE REPORT — SOME RESULTS PENDING</div>':''}</div><div class="meta"><span><b>Name:</b> ${esc(p.name)}</span><span><b>Class:</b> ${esc(d.class.name)}</span><span><b>Assessment:</b> ${esc(d.assessment.name)}</span><span><b>Grading:</b> ${esc(d.class.gradingSystem==='CBC'?'CBC':'OBC')}</span><span><b>Exam No:</b> ${esc(p.examNo||'—')}</span></div><table class="report-table"><thead><tr><th>Subject</th><th>Mark</th><th>Grade</th><th>Remark</th></tr></thead><tbody>${m.rows.map(r=>`<tr><td>${esc(r.subject)}</td><td>${r.mark??'—'}</td><td>${r.grade??'—'}</td><td>${esc(r.remark)}</td></tr>`).join('')}</tbody></table><div class="summary">${!m.summary.complete?`Subjects entered: <b>${m.summary.entered}/${m.summary.total}</b>`:d.class.gradingSystem==='CBC'?`Average: <b>${m.summary.average}%</b>`:`Best 6 Total: <b>${m.summary.best6}</b> • Points: <b>${m.summary.points}</b> • Division: <b>${m.summary.division}</b>`}</div><div class="comment"><b>Class Teacher's Comment</b><p>${esc(teacherComment(d,p,m))}</p></div><div class="teacher-line">Class Teacher: ${esc(d.user.name)}</div></div>`;}

  function showModal(inner){closeModal();const x=document.createElement('div');x.id='modal';x.className='modal-backdrop';x.innerHTML=`<div class="modal"><button class="modal-close" data-close>×</button>${inner}</div>`;document.body.appendChild(x);x.addEventListener('click',e=>{if(e.target===x||e.target.matches('[data-close]'))closeModal();});}
  function closeModal(){byId('modal')?.remove();}
  function previewReport(pupilId){const p=state.me.pupils.find(x=>x.id===pupilId);if(p){showModal(`<div class="modal-scroll">${reportHtml(state.me,p)}</div><div class="modal-actions"><button class="btn ghost" data-close>Close</button><button class="btn primary" id="modalPdf">Download PDF</button><button class="btn whatsapp" id="modalWhatsApp">WhatsApp</button></div>`);byId('modalPdf').onclick=()=>downloadOne(pupilId);byId('modalWhatsApp').onclick=()=>shareOne(pupilId);}}

  async function ensurePdf(){if(window.jspdf?.jsPDF)return window.jspdf.jsPDF;await new Promise((ok,fail)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';s.onload=ok;s.onerror=()=>fail(new Error('PDF library could not load. Check internet connection.'));document.head.appendChild(s);});return window.jspdf.jsPDF;}
  function drawPdf(doc,d,p,pageNo){const m=reportModel(d,p),blue=[11,47,107];doc.setDrawColor(...blue);doc.rect(8,8,194,281);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('REPUBLIC OF ZAMBIA',105,20,{align:'center'});doc.text('MINISTRY OF EDUCATION',105,25,{align:'center'});doc.setTextColor(...blue);doc.setFontSize(14);doc.text(String(d.class.schoolName||'').toUpperCase(),105,33,{align:'center'});doc.setTextColor(0);doc.setFontSize(11);doc.text("PUPIL'S PROGRESS REPORT",105,40,{align:'center'});let y=48;if(!m.summary.complete){doc.setTextColor(185,40,40);doc.setFontSize(9);doc.text('INCOMPLETE REPORT — SOME RESULTS PENDING',105,y,{align:'center'});doc.setTextColor(0);y+=8;}doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(`Name: ${p.name}`,14,y);doc.text(`Class: ${d.class.name}`,112,y);y+=6;doc.text(`Assessment: ${d.assessment.name}`,14,y);doc.text(`Exam No: ${p.examNo||'—'}`,112,y);y+=8;doc.setFont('helvetica','bold');doc.text('SUBJECT',16,y);doc.text('MARK',88,y);doc.text('GRADE',116,y);doc.text('REMARK',140,y);y+=4;doc.setFont('helvetica','normal');for(const r of m.rows){doc.rect(14,y,182,7);doc.text(String(r.subject).slice(0,30),16,y+4.8);doc.text(r.mark===null?'—':String(r.mark),89,y+4.8);doc.text(r.grade===null?'—':String(r.grade),118,y+4.8);doc.text(String(r.remark).slice(0,28),140,y+4.8);y+=7;}y+=7;doc.setFont('helvetica','bold');if(!m.summary.complete)doc.text(`Subjects entered: ${m.summary.entered}/${m.summary.total}`,14,y);else if(d.class.gradingSystem==='CBC')doc.text(`Average: ${m.summary.average}%`,14,y);else doc.text(`Best 6 Total: ${m.summary.best6}    Points: ${m.summary.points}    Division: ${m.summary.division}`,14,y);y+=8;doc.text("Class Teacher's Comment:",14,y);y+=5;doc.setFont('helvetica','normal');doc.text(doc.splitTextToSize(teacherComment(d,p,m),180),14,y);doc.setFontSize(8);doc.text(`Class Teacher: ${d.user.name}`,14,276);doc.text(`Reportform ZM • ${pageNo}`,196,276,{align:'right'});}
  async function buildDoc(pupils){const JsPDF=await ensurePdf(),doc=new JsPDF({unit:'mm',format:'a4'});pupils.forEach((p,i)=>{if(i)doc.addPage();drawPdf(doc,state.me,p,i+1);});return doc;}
  async function downloadOne(id){try{const p=state.me.pupils.find(x=>x.id===id),doc=await buildDoc([p]);doc.save(`${state.me.class.name}_${p.name.replace(/\s+/g,'_')}.pdf`);}catch(e){toast(e.message,true);}}
  async function downloadAll(){try{const doc=await buildDoc(state.me.pupils);doc.save(`${state.me.class.name}_${state.me.assessment.name.replace(/\s+/g,'_')}_Reports.pdf`);}catch(e){toast(e.message,true);}}
  function normalizeWhatsAppPhone(value){let x=String(value||'').replace(/\D/g,'');if(x.startsWith('00'))x=x.slice(2);if(x.startsWith('0'))x='260'+x.slice(1);return x;}
  async function shareOne(id){const p=state.me.pupils.find(x=>x.id===id);if(!p)return;try{const doc=await buildDoc([p]),blob=doc.output('blob'),file=new File([blob],`${state.me.class.name}_${p.name.replace(/\s+/g,'_')}.pdf`,{type:'application/pdf'}),message=`${state.me.class.schoolName} — ${state.me.assessment.name} report for ${p.name}.`;if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){await navigator.share({files:[file],title:`${p.name} - Pupil Report`,text:message});return;}doc.save(file.name);const phone=normalizeWhatsAppPhone(p.parentPhone),url=`https://wa.me/${phone}?text=${encodeURIComponent(message+' The PDF has been downloaded; please attach it to this WhatsApp message.')}`;const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';document.body.appendChild(link);link.click();link.remove();toast('PDF downloaded. WhatsApp opened — attach the downloaded report.');}catch(e){if(e.name!=='AbortError')toast(e.message,true);}}

  if(state.token)bootstrap().catch(()=>renderLogin());else renderLogin();
})();
