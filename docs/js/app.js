/* ============ التطبيق الرئيسي — التوجيه والصفحات ============ */
const APP = {
  data: null,          // ناتج testweb_dashboard
  loading: false,
  current: null,       // الطالب/المشرف المفتوح حالياً
  filters: { stStatus:'all', stGender:'all', stSort:'name', stQ:'',
             tQ:'', tSort:'students' },
};

const $ = (s,r=document)=>r.querySelector(s);
const view = ()=>document.getElementById('view');

/* ---------- الإقلاع ---------- */
window.addEventListener('DOMContentLoaded', ()=>{
  // أزرار الإعداد
  $('#cfg-save').onclick = ()=>{
    const url=$('#cfg-url').value.trim(), key=$('#cfg-key').value.trim();
    if(!/^https?:\/\/.+/.test(url)){ showCfgErr('أدخل رابط Supabase صحيحاً يبدأ بـ https://'); return; }
    TW.save(url,key); boot();
  };
  $('#cfg-url').addEventListener('keydown',e=>{if(e.key==='Enter')$('#cfg-save').click();});
  $('#cfg-key').addEventListener('keydown',e=>{if(e.key==='Enter')$('#cfg-save').click();});

  $('#btn-logout').onclick = ()=>{ if(confirm('تغيير بيانات الاتصال؟')){ TW.clear(); location.reload(); } };
  $('#btn-refresh').onclick = ()=>loadData(true);
  $('#menu-toggle').onclick = ()=>toggleSidebar(true);
  $('#scrim').onclick = ()=>toggleSidebar(false);
  $('#nav').addEventListener('click', ()=>{ if(window.innerWidth<=860) toggleSidebar(false); });

  window.addEventListener('hashchange', route);
  boot();
});

function showCfgErr(m){ const e=$('#cfg-err'); e.textContent=m; e.classList.remove('hidden'); }
function toggleSidebar(open){ $('#sidebar').classList.toggle('open',open); $('#scrim').classList.toggle('show',open); }

function boot(){
  if(!TW.configured){ $('#setup').classList.remove('hidden'); $('#app').classList.add('hidden'); return; }
  $('#setup').classList.add('hidden'); $('#app').classList.remove('hidden');
  if(!location.hash) location.hash='#/';
  loadData(false).then(()=>route());
}

/* ---------- تحميل بيانات اللوحة ---------- */
async function loadData(refresh){
  if(APP.loading) return;
  APP.loading=true; $('#conn-dot').classList.remove('bad');
  if(refresh){ view().innerHTML = UI.skeletonCards(8); }
  try{
    APP.data = await TW.call('testweb_dashboard');
    $('#conn-dot').classList.remove('bad');
    if(refresh){ UI.toast('تم تحديث البيانات','ok',1600); route(); }
  }catch(e){
    $('#conn-dot').classList.add('bad');
    if(refresh) UI.toast(e.message,'err');
    view().innerHTML = UI.errorBox(e.message + ' — تأكد من رفع دوال testweb_ وصحة الرابط');
  }finally{ APP.loading=false; }
}

/* ---------- التوجيه ---------- */
function route(){
  const h = (location.hash||'#/').slice(1);
  const [path, id] = [ h.split('/').slice(0,2).join('/'), h.split('/')[2] ];
  // تفعيل عنصر القائمة
  document.querySelectorAll('#nav a').forEach(a=>{
    const r=a.getAttribute('data-route');
    a.classList.toggle('active', r===h || (r!=='/' && h.startsWith(r)) );
  });
  const titles={ '/':'النظرة العامة','/students':'الطلاب','/teachers':'المشرفون','/messages':'الرسائل','/otps':'رموز الدخول','/student':'ملف الطالب','/teacher':'ملف المشرف' };
  $('#page-title').textContent = titles[path] || 'لوحة التحكم';

  if(!APP.data && path!=='/otps'){ view().innerHTML=UI.skeletonCards(8); return; }

  if(h==='/' || h===''){ pageOverview(); }
  else if(h==='/students'){ pageStudents(); }
  else if(h==='/teachers'){ pageTeachers(); }
  else if(h==='/messages'){ pageMessages(); }
  else if(h==='/otps'){ pageOtps(); }
  else if(path==='/student' && id){ pageStudentDetail(id); }
  else if(path==='/teacher' && id){ pageTeacherDetail(id); }
  else pageOverview();
  window.scrollTo(0,0);
}

/* ================= النظرة العامة ================= */
function pageOverview(){
  const s = APP.data.stats;
  const stat=(cls,ic,val,lbl)=>`<div class="stat ${cls}"><div class="ic">${ic}</div><div class="v" data-count="${val}">0</div><div class="l">${lbl}</div></div>`;
  const cards = [
    stat('a','🎓',s.students_total,'إجمالي الطلاب'),
    stat('b','👤',s.teachers_total,'المشرفون'),
    stat('g','✅',s.active_saves,'حفظات نشطة'),
    stat('gold','📝',s.in_exam,'في الاختبار'),
    stat('t','🏆',s.finished_saves,'حفظات مكتملة'),
    stat('r','⛔',s.suspended_saves,'حفظات موقوفة'),
    stat('p','⏳',s.not_joined,'لم ينضمّوا بعد'),
    stat('r','⚠️',s.profile_incomplete,'ملفات ناقصة'),
    stat('gold','🚫',s.with_absence,'لديهم غياب'),
    stat('t','📊',s.avg_progress,'متوسط التقدّم %'),
  ].join('');

  // توزيع الطلاب حسب حالة الحفظة
  const byStatus = {};
  APP.data.students.forEach(st=>{ const k = st.save? st.save.status_label : 'بدون حفظة'; byStatus[k]=(byStatus[k]||0)+1; });
  const maxS = Math.max(1, ...Object.values(byStatus));
  const distRows = Object.entries(byStatus).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`
    <div class="mb"><div class="flex between" style="font-size:13px;margin-bottom:5px"><b>${UI.esc(k)}</b><span class="muted">${v}</span></div>
    <div class="progress"><i data-w="${Math.round(v/maxS*100)}"></i></div></div>`).join('');

  // أعلى المشرفين بعدد الطلاب
  const topT = [...APP.data.teachers].sort((a,b)=>b.students_count-a.students_count).slice(0,6).map(t=>`
    <div class="mini-row"><div class="flex center gap"><div class="avatar ${t.gender==='female'?'female':''}" style="width:36px;height:36px;font-size:14px">${UI.esc(UI.initials(t.full_name))}</div>
    <b style="font-size:14px">${UI.esc(t.full_name)}</b></div><span class="badge info">${t.students_count} طالب</span></div>`).join('') || UI.empty('لا مشرفين');

  // نسبة الانضمام
  const joinPct = s.students_total? Math.round((s.students_total-s.not_joined)/s.students_total*100):0;

  view().innerHTML = `
    <div class="stats-grid">${cards}</div>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">
      <div class="card card-pad">
        <div class="section-head" style="margin-top:0"><h2>توزيع الطلاب حسب الحالة</h2></div>
        ${distRows||UI.empty('لا بيانات')}
      </div>
      <div class="card card-pad" style="text-align:center">
        <div class="section-head" style="margin-top:0"><h2>نسبة الانضمام للتطبيق</h2></div>
        <div class="ring" style="--p:${joinPct};margin:10px auto"><div class="hole"><div><b>${joinPct}%</b><br><span>انضمّوا</span></div></div></div>
        <div class="muted" style="font-size:13px">${s.students_total - s.not_joined} من ${s.students_total} طالب فعّلوا حساباتهم</div>
      </div>
      <div class="card card-pad">
        <div class="section-head" style="margin-top:0"><h2>أكثر المشرفين طلاباً</h2></div>
        <div class="pill-list">${topT}</div>
      </div>
    </div>`;
  // عدّادات + أشرطة
  view().querySelectorAll('.stat .v[data-count]').forEach(el=>UI.countUp(el, Number(el.getAttribute('data-count'))));
  UI.animateBars(view());
  view().querySelectorAll('.stat').forEach((s,i)=>s.style.animationDelay=(i*0.04)+'s');
}

/* ================= الطلاب ================= */
function pageStudents(){
  const f=APP.filters;
  const statusChips=[
    ['all','الكل'],['active','نشط'],['in_exam','في الاختبار'],['finished','مكتمل'],
    ['suspended','موقوف'],['terminated','منهي'],['not_joined','لم ينضمّوا'],
    ['no_save','بدون حفظة'],['incomplete','ملف ناقص'],['absence','لديهم غياب'],
  ];
  const counts = countStudents();
  const chips = statusChips.map(([k,l])=>`<button class="chip ${f.stStatus===k?'active':''}" onclick="setStFilter('${k}')">${l} <span class="n">${counts[k]??0}</span></button>`).join('');

  view().innerHTML = `
    <div class="toolbar">
      <div class="search"><input id="st-q" placeholder="ابحث بالاسم أو رقم الهاتف (٠٧٧...)" value="${UI.esc(f.stQ)}"></div>
      <select class="input" id="st-gender">
        <option value="all">كل الأجناس</option><option value="male">ذكور</option><option value="female">إناث</option>
      </select>
      <select class="input" id="st-sort">
        <option value="name">ترتيب: الاسم</option><option value="progress">الأعلى تقدّماً</option>
        <option value="absence">الأكثر غياباً</option><option value="newest">الأحدث تسجيلاً</option>
      </select>
      <button class="btn btn-soft" onclick="location.hash='#/messages'">✉ رسالة جماعية</button>
    </div>
    <div class="chips">${chips}</div>
    <div id="st-grid"></div>`;

  $('#st-gender').value=f.stGender; $('#st-sort').value=f.stSort;
  $('#st-q').addEventListener('input', e=>{ f.stQ=e.target.value; renderStudentGrid(); });
  $('#st-gender').addEventListener('change', e=>{ f.stGender=e.target.value; renderStudentGrid(); });
  $('#st-sort').addEventListener('change', e=>{ f.stSort=e.target.value; renderStudentGrid(); });
  renderStudentGrid();
}

function countStudents(){
  const c={all:APP.data.students.length};
  const test={
    active:s=>s.save&&s.save.status==='ACTIVE', in_exam:s=>s.save&&(s.save.status==='IN_EXAM1'||s.save.status==='IN_EXAM2'),
    finished:s=>s.save&&s.save.status==='FINISHED', suspended:s=>s.save&&s.save.status==='SUSPENDED',
    terminated:s=>s.save&&s.save.status==='TERMINATED', not_joined:s=>!s.joined,
    no_save:s=>!s.save, incomplete:s=>s.profile_incomplete, absence:s=>s.absence_total>0,
  };
  for(const k in test) c[k]=APP.data.students.filter(test[k]).length;
  return c;
}
function setStFilter(k){ APP.filters.stStatus=k; pageStudents(); }

function filteredStudents(){
  const f=APP.filters; let list=[...APP.data.students];
  const pred={
    active:s=>s.save&&s.save.status==='ACTIVE', in_exam:s=>s.save&&(s.save.status==='IN_EXAM1'||s.save.status==='IN_EXAM2'),
    finished:s=>s.save&&s.save.status==='FINISHED', suspended:s=>s.save&&s.save.status==='SUSPENDED',
    terminated:s=>s.save&&s.save.status==='TERMINATED', not_joined:s=>!s.joined,
    no_save:s=>!s.save, incomplete:s=>s.profile_incomplete, absence:s=>s.absence_total>0,
  }[f.stStatus];
  if(pred) list=list.filter(pred);
  if(f.stGender!=='all') list=list.filter(s=>s.gender===f.stGender);
  const q=f.stQ.trim();
  if(q){ const ql=q.toLowerCase(); list=list.filter(s=>
    (s.full_name||'').toLowerCase().includes(ql) || (s.phone||'').includes(q) || (s.father_phone||'').includes(q)); }
  const sorters={
    name:(a,b)=>(a.full_name||'').localeCompare(b.full_name||'','ar'),
    progress:(a,b)=>(b.save?.progress_pct||0)-(a.save?.progress_pct||0),
    absence:(a,b)=>b.absence_total-a.absence_total,
    newest:(a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0),
  };
  list.sort(sorters[f.stSort]||sorters.name);
  return list;
}

function renderStudentGrid(){
  const list=filteredStudents();
  const wrap=$('#st-grid'); if(!wrap) return;
  if(!list.length){ wrap.innerHTML=UI.empty('لا يوجد طلاب مطابقون','🔍'); return; }
  wrap.innerHTML=`<div class="section-head"><span class="sub">${list.length} طالب</span></div><div class="grid">${list.map(studentCard).join('')}</div>`;
  UI.animateBars(wrap);
  wrap.querySelectorAll('.pcard').forEach((c,i)=>c.style.animationDelay=(Math.min(i,20)*0.02)+'s');
}

function studentCard(s){
  const sv=s.save;
  const badges=[];
  if(!s.joined) badges.push(UI.badge('warn','لم ينضمّ'));
  if(s.profile_incomplete) badges.push(UI.badge('no','ملف ناقص'));
  if(s.absence_total>0) badges.push(UI.badge('absent','غياب '+s.absence_total));
  const statusB = sv? UI.badge('info', sv.status_label) : UI.badge('neutral','بدون حفظة');
  const prog = sv? `<div class="mt">${UI.progress(sv.progress_pct)}<div class="muted" style="font-size:12px;margin-top:4px">${UI.esc(sv.name)} • ${sv.saved_pages}/${sv.total_pages} صفحة</div></div>` : '';
  return `<div class="pcard" onclick="location.hash='#/student/${UI.attr(s.user_id)}'">
    <div class="pcard-top">
      <div class="avatar ${s.gender==='female'?'female':''}">${UI.esc(UI.initials(s.full_name))}</div>
      <div class="pcard-id"><div class="nm">${UI.esc(s.full_name||'—')}</div>
        <div class="mt"><span>${UI.esc(s.gender_label)}</span> • <span dir="ltr">${UI.esc(s.phone||'—')}</span></div></div>
    </div>
    <div class="flex wrap gap" style="gap:6px">${statusB}${badges.join('')}</div>
    ${prog}
    <div class="pcard-foot"><span>المشرف: ${UI.esc(s.teacher_name)}</span><span>↩ التفاصيل</span></div>
  </div>`;
}

/* ================= المشرفون ================= */
function pageTeachers(){
  const f=APP.filters;
  view().innerHTML=`
    <div class="toolbar">
      <div class="search"><input id="t-q" placeholder="ابحث باسم المشرف أو رقم الهاتف" value="${UI.esc(f.tQ)}"></div>
      <select class="input" id="t-sort">
        <option value="students">ترتيب: عدد الطلاب</option><option value="name">الاسم</option>
        <option value="absence">الأكثر غياباً</option>
      </select>
      <button class="btn btn-soft" onclick="location.hash='#/messages'">✉ رسالة للمشرفين</button>
    </div>
    <div id="t-grid"></div>`;
  $('#t-sort').value=f.tSort;
  $('#t-q').addEventListener('input',e=>{f.tQ=e.target.value;renderTeacherGrid();});
  $('#t-sort').addEventListener('change',e=>{f.tSort=e.target.value;renderTeacherGrid();});
  renderTeacherGrid();
}
function renderTeacherGrid(){
  const f=APP.filters; let list=[...APP.data.teachers];
  const q=f.tQ.trim();
  if(q){const ql=q.toLowerCase();list=list.filter(t=>(t.full_name||'').toLowerCase().includes(ql)||(t.phone||'').includes(q));}
  const sorters={students:(a,b)=>b.students_count-a.students_count,name:(a,b)=>(a.full_name||'').localeCompare(b.full_name||'','ar'),absence:(a,b)=>b.absence_total-a.absence_total};
  list.sort(sorters[f.tSort]||sorters.students);
  const wrap=$('#t-grid');
  if(!list.length){wrap.innerHTML=UI.empty('لا مشرفين مطابقين','🔍');return;}
  wrap.innerHTML=`<div class="section-head"><span class="sub">${list.length} مشرف</span></div><div class="grid">${list.map(teacherCard).join('')}</div>`;
  wrap.querySelectorAll('.pcard').forEach((c,i)=>c.style.animationDelay=(Math.min(i,20)*0.02)+'s');
}
function teacherCard(t){
  return `<div class="pcard" onclick="location.hash='#/teacher/${UI.attr(t.teacher_id)}'">
    <div class="pcard-top">
      <div class="avatar ${t.gender==='female'?'female':''}">${UI.esc(UI.initials(t.full_name))}</div>
      <div class="pcard-id"><div class="nm">${UI.esc(t.full_name||'—')}</div>
        <div class="mt"><span>${UI.esc(t.gender_label)}</span> • <span dir="ltr">${UI.esc(t.phone||'—')}</span></div></div>
    </div>
    <div class="flex wrap gap" style="gap:6px">
      ${UI.badge('info',t.students_count+' طالب')}
      ${t.joined?UI.badge('ok','منضمّ'):UI.badge('warn','لم ينضمّ')}
      ${t.absence_total>0?UI.badge('absent','غياب '+t.absence_total):''}
    </div>
    <div class="pcard-foot"><span>انضمّ: ${UI.fmtDateShort(t.joined_in)}</span><span>↩ التفاصيل</span></div>
  </div>`;
}

/* ================= ملف الطالب ================= */
async function pageStudentDetail(id){
  view().innerHTML=`<div class="skeleton sk-card" style="height:200px;margin-bottom:14px"></div>${UI.skeletonCards(3)}`;
  let res;
  try{ res=await TW.call('testweb_student',{user_id:id}); }
  catch(e){ view().innerHTML=UI.errorBox(e.message); return; }
  APP.current={type:'student',data:res};
  const u=res.user, saves=res.saves;

  const avatar = u.photo_url
    ? `<div class="avatar" style="width:78px;height:78px"><img src="${UI.esc(u.photo_url)}" alt=""></div>`
    : `<div class="avatar ${u.gender==='female'?'female':''}" style="width:78px;height:78px;font-size:28px">${UI.esc(UI.initials(u.full_name))}</div>`;

  const tags=[];
  tags.push(u.joined?UI.badge('ok','منضمّ'):UI.badge('warn','لم ينضمّ بعد'));
  if(u.profile_incomplete) tags.push(UI.badge('no','ملف ناقص'));
  if(u.absence_total>0) tags.push(UI.badge('absent','غياب: '+u.absence_total));

  const info=(k,v)=>`<div class="info"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const profileInfo=`<div class="info-grid mt">
    ${info('رقم الهاتف', UI.copyField(u.phone))}
    ${info('هاتف ولي الأمر', UI.copyField(u.father_phone))}
    ${info('كلمة المرور', UI.pwField(u.password))}
    ${info('البريد', UI.copyField(u.email))}
    ${info('الجنس', u.gender_label)}
    ${info('تاريخ الميلاد', UI.esc(u.date_of_brith))}
    ${info('المشرف', UI.esc(u.teacher_name))}
    ${info('العنوان', UI.esc(u.location))}
    ${info('الموقع (GPS)', UI.copyField(u.gps))}
    ${info('آخر دخول', UI.fmtDate(u.last_logined_in))}
    ${info('تاريخ التسجيل', UI.fmtDate(u.created_at))}
    ${info('معرّف الطالب', UI.copyField(u.user_id))}
  </div>`;

  const head=`<div class="card card-pad mb">
    <div class="flex between wrap gap">
      <div class="flex center gap" style="gap:16px">
        ${avatar}
        <div><div style="font-size:22px;font-weight:800">${UI.esc(u.full_name||'—')}</div>
        <div class="flex wrap gap mt" style="gap:6px">${tags.join('')}</div></div>
      </div>
      <div class="row-actions">
        <button class="btn btn-soft btn-sm" onclick="openEditStudent()">✎ تعديل الملف</button>
        <button class="btn btn-soft btn-sm" onclick="openSetPassword('student','${UI.attr(u.user_id)}','${UI.attr(u.full_name)}')">🔒 كلمة المرور</button>
        <button class="btn btn-primary btn-sm" onclick="openSendOne('${UI.attr(u.phone)}','${UI.attr(u.full_name)}')">✉ رسالة</button>
      </div>
    </div>
    ${profileInfo}
  </div>`;

  const savesHtml = saves.length
    ? saves.map(saveBlock).join('')
    : `<div class="card card-pad">${UI.empty('لا توجد حفظات لهذا الطالب','📚')}</div>`;

  view().innerHTML = `<button class="btn btn-ghost btn-sm mb" onclick="history.back()">→ رجوع</button>${head}
    <div class="section-head"><h2>الحفظات (${saves.length})</h2></div>${savesHtml}`;
  UI.animateBars(view());
}

function saveBlock(s){
  const cur = s.is_current ? UI.badge('ok','الحفظة الحالية') : '';
  const examInfo = (s.exam1||s.exam2) ? `<div class="muted" style="font-size:12px">
    ${s.exam1?`جزئي: ${UI.esc(s.exam1_teacher_name)}`:''} ${s.exam2?` • تراكمي: ${UI.esc(s.exam2_teacher_name)}`:''}</div>`:'';
  const info=(k,v)=>`<div class="info"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const grid=`<div class="info-grid mt">
    ${info('الحالة', UI.badge('info',s.status_label))}
    ${info('من صفحة', UI.esc(s.start_page))}
    ${info('إلى صفحة', UI.esc(s.end_page))}
    ${info('الورد اليومي', UI.esc(s.every_day_page))}
    ${info('المُنجز', s.saved_pages+' / '+s.total_pages+' صفحة')}
    ${info('المشرف', UI.esc(s.teacher_name))}
    ${info('بدأت', UI.fmtDateShort(s.started_at))}
    ${info('اكتملت', UI.fmtDateShort(s.finished_at))}
  </div>`;
  const pagesTab = pagesTable(s.pages, false, s.id);
  const testsTab = pagesTable(s.tests, true, s.id);
  const sid=UI.attr(String(s.id));
  return `<div class="save-block" id="sb-${sid}">
    <div class="save-head" onclick="toggleSave('${sid}')">
      <span class="caret">▼</span>
      <span class="nm">${UI.esc(s.name||'حفظة')}</span>
      ${cur}
      <span class="sp"></span>
      <span class="badge info">${s.progress_pct}%</span>
      <span class="badge ${s.status==='ACTIVE'?'ok':s.status==='SUSPENDED'?'no':'neutral'}">${UI.esc(s.status_label)}</span>
    </div>
    <div class="save-body">
      <div class="flex between center wrap gap mt">
        <div style="flex:1;min-width:200px">${UI.progress(s.progress_pct)}</div>
        <div class="row-actions">
          <button class="btn btn-soft btn-sm" onclick="openEditSave('${sid}')">✎ تعديل الحفظة</button>
          <button class="btn btn-soft btn-sm" onclick="openExam('${sid}','EXAM1')">📝 الاختبار الجزئي</button>
          <button class="btn btn-soft btn-sm" onclick="openExam('${sid}','EXAM2')">📚 الاختبار التراكمي</button>
        </div>
      </div>
      ${examInfo}
      ${grid}
      <div class="tabs"><button class="tab active" onclick="switchTab(this,'pg-${sid}')">الحفظ اليومي (${s.pages.length})</button>
        <button class="tab" onclick="switchTab(this,'ts-${sid}')">الاختبارات (${s.tests.length})</button></div>
      <div id="pg-${sid}">${pagesTab}</div>
      <div id="ts-${sid}" class="hidden">${testsTab}</div>
    </div>
  </div>`;
}

function pagesTable(rows, isExam, saveId){
  if(!rows.length) return UI.empty(isExam?'لا اختبارات':'لا صفحات بعد','📄');
  const head = isExam
    ? `<tr><th>النوع</th><th>الصفحات</th><th>الحالة</th><th>الأخطاء</th><th>المشرف</th><th>التاريخ</th><th></th></tr>`
    : `<tr><th>الصفحة</th><th>الاسم</th><th>الحالة</th><th>الأخطاء</th><th>المشرف</th><th>التاريخ</th><th></th></tr>`;
  const body = rows.map(r=>{
    const errors = errorsText(r.errors_number);
    const cells = isExam
      ? `<td>${UI.esc(r.type_label)}</td><td>${UI.esc(r.start_page)}—${UI.esc(r.end_page)}</td>`
      : `<td><b>${UI.esc(r.page_display)}</b></td><td class="muted">${UI.esc(r.page_name||'—')}</td>`;
    const tbl = isExam?'tests':'pages';
    return `<tr>${cells}
      <td>${UI.badge(r.grade_kind, r.status_label)}</td>
      <td class="muted">${errors}</td>
      <td>${UI.esc(r.teacher_name)}</td>
      <td class="muted">${UI.fmtDateShort(r.date||r.created_at)}</td>
      <td><button class="btn btn-soft btn-sm" onclick="openGrade('${tbl}',${r.id},${isExam})">⚖ تقييم</button></td>
    </tr>`;
  }).join('');
  return `<div class="tbl-wrap"><table class="tbl"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}
function errorsText(e){
  if(!e||typeof e!=='object') return '—';
  const p=[]; if(e.sowad!=null)p.push('تسويد '+e.sowad); if(e.nisyan!=null)p.push('نسيان '+e.nisyan); if(e.fateh!=null)p.push('فتح '+e.fateh);
  return p.join('، ')||'—';
}
function toggleSave(id){ document.getElementById('sb-'+id)?.classList.toggle('open'); }
function switchTab(btn,target){
  btn.parentElement.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  const cont=btn.closest('.save-body');
  cont.querySelectorAll('[id^="pg-"],[id^="ts-"]').forEach(d=>d.classList.add('hidden'));
  document.getElementById(target).classList.remove('hidden');
}

/* ================= ملف المشرف ================= */
async function pageTeacherDetail(id){
  view().innerHTML=`<div class="skeleton sk-card" style="height:200px;margin-bottom:14px"></div>${UI.skeletonCards(3)}`;
  let res;
  try{ res=await TW.call('testweb_teacher',{teacher_id:id}); }
  catch(e){ view().innerHTML=UI.errorBox(e.message); return; }
  const t=res.teacher;
  const avatar=t.photo_url?`<div class="avatar" style="width:78px;height:78px"><img src="${UI.esc(t.photo_url)}"></div>`
    :`<div class="avatar ${t.gender==='female'?'female':''}" style="width:78px;height:78px;font-size:28px">${UI.esc(UI.initials(t.full_name))}</div>`;
  const info=(k,v)=>`<div class="info"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const grid=`<div class="info-grid mt">
    ${info('رقم الهاتف',UI.copyField(t.phone))}
    ${info('البريد',UI.copyField(t.email))}
    ${info('كلمة المرور',UI.pwField(t.password))}
    ${info('الجنس',t.gender_label)}
    ${info('تاريخ الميلاد',UI.esc(t.date_of_brith))}
    ${info('العنوان',UI.esc(t.location))}
    ${info('الموقع (GPS)',UI.copyField(t.gps))}
    ${info('عدد الغيابات',String(t.absence_total))}
    ${info('انضمّ في',UI.fmtDate(t.joined_in))}
    ${info('تاريخ الإنشاء',UI.fmtDate(t.created_at))}
    ${info('معرّف المشرف',UI.copyField(t.teacher_id))}
  </div>`;
  const stuRow=s=>`<div class="mini-row"><div><b>${UI.esc(s.full_name)}</b>
    <div class="mt" style="font-size:12px" class="muted"><span class="muted">${UI.esc(s.save_name)} • ${UI.esc(s.save_status)}</span></div></div>
    <button class="btn btn-soft btn-sm" onclick="location.hash='#/student/${UI.attr(s.user_id)}'">عرض</button></div>`;
  const my=res.my_students.length?res.my_students.map(stuRow).join(''):UI.empty('لا طلاب','🎓');
  const ex=res.exam_students.length?res.exam_students.map(s=>`<div class="mini-row"><div><b>${UI.esc(s.full_name)}</b>
    <div class="muted" style="font-size:12px">${UI.esc(s.exam_kind)} • ${UI.esc(s.save_name)}</div></div>
    <button class="btn btn-soft btn-sm" onclick="location.hash='#/student/${UI.attr(s.user_id)}'">عرض</button></div>`).join(''):UI.empty('لا تكليفات اختبار','📝');

  view().innerHTML=`<button class="btn btn-ghost btn-sm mb" onclick="history.back()">→ رجوع</button>
    <div class="card card-pad mb">
      <div class="flex between wrap gap">
        <div class="flex center gap" style="gap:16px">${avatar}
          <div><div style="font-size:22px;font-weight:800">${UI.esc(t.full_name||'—')}</div>
          <div class="flex wrap gap mt" style="gap:6px">${t.joined?UI.badge('ok','منضمّ'):UI.badge('warn','لم ينضمّ')}${UI.badge('info',res.counts.my+' طالب')}</div></div>
        </div>
        <div class="row-actions">
          <button class="btn btn-soft btn-sm" onclick="openSetPassword('teacher','${UI.attr(t.teacher_id)}','${UI.attr(t.full_name)}')">🔒 كلمة المرور</button>
          <button class="btn btn-primary btn-sm" onclick="openSendOne('${UI.attr(t.phone)}','${UI.attr(t.full_name)}')">✉ رسالة</button>
        </div>
      </div>${grid}
    </div>
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(330px,1fr))">
      <div class="card card-pad"><div class="section-head" style="margin-top:0"><h2>طلابه (${res.counts.my})</h2></div><div class="pill-list">${my}</div></div>
      <div class="card card-pad"><div class="section-head" style="margin-top:0"><h2>تكليفات الاختبار (${res.counts.exam})</h2></div><div class="pill-list">${ex}</div></div>
    </div>`;
}

/* ================= نوافذ الإجراءات ================= */
function field(label,name,value,type='text'){
  return `<div class="field"><label>${label}</label><input class="f" data-k="${name}" type="${type}" value="${UI.esc(value??'')}"></div>`;
}
function selField(label,name,value,options){
  const opts=options.map(([v,l])=>`<option value="${UI.esc(v)}" ${String(value)===String(v)?'selected':''}>${UI.esc(l)}</option>`).join('');
  return `<div class="field"><label>${label}</label><select class="f" data-k="${name}">${opts}</select></div>`;
}
function collect(modalEl){
  const o={}; modalEl.querySelectorAll('.f').forEach(i=>{ o[i.getAttribute('data-k')]=i.value; }); return o;
}

function openEditStudent(){
  const u=APP.current.data.user;
  const body=`
    ${field('الاسم الكامل','full_name',u.full_name)}
    <div class="field-row">${field('رقم الهاتف','user_phone_number',u.phone)}${field('هاتف ولي الأمر','father_phone_number',u.father_phone)}</div>
    <div class="field-row">${selField('الجنس','gender',u.gender,[['male','ذكر'],['female','أنثى']])}${field('تاريخ الميلاد','date_of_brith',u.date_of_brith)}</div>
    ${field('العنوان','user_location',u.location)}
    ${field('البريد الإلكتروني','email',u.email==='—'?'':u.email)}
    <div class="field-row">
      ${selField('منضمّ؟','joined',String(u.joined),[['true','نعم'],['false','لا']])}
      ${selField('الملف ناقص؟','profile_incomplete',String(u.profile_incomplete),[['true','نعم'],['false','لا']])}
    </div>`;
  const foot=`<button class="btn btn-primary" id="md-save">حفظ التعديلات</button><button class="btn btn-ghost" onclick="closeTopModal()">إلغاء</button>`;
  const m=UI.modal('تعديل ملف الطالب',body,foot);
  m.el.querySelector('#md-save').onclick=async(ev)=>{
    const f=collect(m.el); f.joined=f.joined==='true'; f.profile_incomplete=f.profile_incomplete==='true';
    await doMutate(ev.target,{action:'update_student',user_id:u.user_id,fields:f},m,'تم حفظ بيانات الطالب');
  };
}

function openEditSave(saveId){
  const s=APP.current.data.saves.find(x=>String(x.id)===String(saveId)); if(!s) return;
  const teachers=APP.data.teachers.map(t=>[t.teacher_id,t.full_name]);
  const tOpts=[['','—']].concat(teachers);
  const body=`
    ${field('اسم الحفظة','name',s.name)}
    <div class="field-row">${field('من صفحة','start_page',s.start_page,'number')}${field('إلى صفحة','end_page',s.end_page,'number')}</div>
    <div class="field-row">${field('الورد اليومي','every_day_page',s.every_day_page,'number')}${selField('الحالة','status',s.status,[['ACTIVE','نشط'],['IN_EXAM1','في الاختبار الجزئي'],['IN_EXAM2','في الاختبار التراكمي'],['FINISHED','مكتمل'],['SUSPENDED','موقوف'],['TERMINATED','منهي']])}</div>
    ${selField('المشرف','teacher_id',s.teacher_id,tOpts)}
    <div class="field-row">${selField('مشرف الاختبار الجزئي','exam1_teacher_id',s.exam1_teacher_id||'',tOpts)}${selField('مشرف الاختبار التراكمي','exam2_teacher_id',s.exam2_teacher_id||'',tOpts)}</div>`;
  const foot=`<button class="btn btn-primary" id="md-save">حفظ</button><button class="btn btn-ghost" onclick="closeTopModal()">إلغاء</button>`;
  const m=UI.modal('تعديل الحفظة',body,foot);
  m.el.querySelector('#md-save').onclick=async(ev)=>{
    const f=collect(m.el);
    await doMutate(ev.target,{action:'update_save',save_id:s.id,fields:f},m,'تم حفظ بيانات الحفظة',true);
  };
}

function openGrade(table,rowId,isExam){
  const body=`
    <p class="muted mb">حدّد عدد الأخطاء، وسيُحتسب التقدير تلقائياً وتُرسل النتيجة للطالب ومشرفه.</p>
    <div class="field-row">
      ${field('التسويد (0-999)','sowad',0,'number')}
      ${field('النسيان (0-999)','nisyan',0,'number')}
    </div>
    ${isExam?field('الفتح (0-999)','fateh',0,'number'):''}
    <div class="field"><label>ملاحظة (اختياري)</label><textarea class="f" data-k="custom_info_text" placeholder="ملاحظة تظهر للطالب..."></textarea></div>
    <div class="field"><label><input type="checkbox" id="g-notify" checked style="width:auto;margin-left:6px">إرسال إشعار واتساب للطالب والمشرف</label></div>
    <div id="g-preview" class="mini-row"><span>التقدير المتوقّع</span><span id="g-pv">—</span></div>`;
  const foot=`<button class="btn btn-primary" id="md-save">حفظ التقييم</button><button class="btn btn-ghost" onclick="closeTopModal()">إلغاء</button>`;
  const m=UI.modal(isExam?'تقييم اختبار':'تقييم حفظ اليوم',body,foot);
  const calc=()=>{
    const g=collect(m.el); const so=+g.sowad||0,ni=+g.nisyan||0,fa=+g.fateh||0;
    let ps; if(isExam){const s=so+ni+fa*2; ps=s>=6?'reject':s>=3?'good':s>=1?'very_good':'perfect';}
    else{const s=so+ni; ps=s>=3?'reject':s===2?'good':s===1?'very_good':'perfect';}
    const lbl={reject:'رسوب',good:'جيد جداً',very_good:'إمتياز',perfect:'مُتقِن'}[ps];
    m.el.querySelector('#g-pv').innerHTML=UI.badge(ps,lbl);
  };
  m.el.querySelectorAll('.f').forEach(i=>i.addEventListener('input',calc)); calc();
  m.el.querySelector('#md-save').onclick=async(ev)=>{
    const g=collect(m.el);
    const payload={action:'grade_page',table,row_id:rowId,sowad:+g.sowad||0,nisyan:+g.nisyan||0,fateh:+g.fateh||0,
      custom_info_text:g.custom_info_text||'',notify:m.el.querySelector('#g-notify').checked};
    await doMutate(ev.target,payload,m,'تم حفظ التقييم وإرسال الإشعار',true);
  };
}

function openExam(saveId,type){
  const s=APP.current.data.saves.find(x=>String(x.id)===String(saveId)); if(!s) return;
  const isE2=type==='EXAM2';
  const enabled=isE2?s.exam2:s.exam1;
  const curTeacher=isE2?s.exam2_teacher_id:s.exam1_teacher_id;
  const tOpts=[['','— اختر مشرفاً —']].concat(APP.data.teachers.map(t=>[t.teacher_id,t.full_name]));
  const body=`
    <p class="muted mb">${isE2?'الاختبار التراكمي (كامل الحفظ)':'الاختبار الجزئي'} للحفظة: <b>${UI.esc(s.name)}</b></p>
    ${selField('الحالة','enable',String(enabled),[['true','مُفعّل'],['false','مُوقَف']])}
    ${selField('مشرف الاختبار','teacher_id',curTeacher||'',tOpts)}
    <div class="field"><label><input type="checkbox" id="e-notify" checked style="width:auto;margin-left:6px">إشعار الطالب والمشرف عند التفعيل</label></div>`;
  const foot=`<button class="btn btn-primary" id="md-save">حفظ</button><button class="btn btn-ghost" onclick="closeTopModal()">إلغاء</button>`;
  const m=UI.modal(isE2?'التحكم بالاختبار التراكمي':'التحكم بالاختبار الجزئي',body,foot);
  m.el.querySelector('#md-save').onclick=async(ev)=>{
    const f=collect(m.el);
    const payload={action:'exam_control',save_id:s.id,exam_type:type,enable:f.enable==='true',
      teacher_id:f.teacher_id||null,notify:m.el.querySelector('#e-notify').checked};
    await doMutate(ev.target,payload,m,'تم تحديث إعدادات الاختبار',true);
  };
}

function openSetPassword(kind,id,name){
  const body=`<p class="muted mb">تعيين كلمة مرور جديدة لـ <b>${UI.esc(name)}</b>. ستُحدَّث في نظام الدخول مباشرة.</p>
    ${field('كلمة المرور الجديدة','password','')}
    <button class="btn btn-ghost btn-sm" onclick="genPw(this)">🎲 توليد كلمة قوية</button>`;
  const foot=`<button class="btn btn-primary" id="md-save">تعيين</button><button class="btn btn-ghost" onclick="closeTopModal()">إلغاء</button>`;
  const m=UI.modal('تغيير كلمة المرور',body,foot);
  m.el.querySelector('#md-save').onclick=async(ev)=>{
    const f=collect(m.el);
    if(!f.password || f.password.length<4){ UI.toast('كلمة المرور قصيرة جداً','err'); return; }
    await doMutate(ev.target,{action:'set_password',kind,id,password:f.password},m,'تم تغيير كلمة المرور');
  };
}
function genPw(btn){
  const chars='abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let p=''; for(let i=0;i<10;i++)p+=chars[Math.floor(Math.random()*chars.length)];
  btn.parentElement.querySelector('.f').value=p; UI.toast('تم توليد كلمة مرور','info',1200);
}

async function doMutate(btn,payload,modal,okMsg,reloadStudent){
  const orig=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spinner"></span>';
  try{
    await TW.call('testweb_mutate',payload);
    UI.toast(okMsg,'ok'); modal.close();
    // تحديث الكاش العام بهدوء ثم إعادة عرض الصفحة الحالية
    await loadDataSilent();
    if(reloadStudent && APP.current?.type==='student'){ pageStudentDetail(APP.current.data.user.user_id); }
    else if(APP.current?.type==='student'){ pageStudentDetail(APP.current.data.user.user_id); }
  }catch(e){ UI.toast(e.message,'err',4500); btn.disabled=false; btn.innerHTML=orig; }
}
async function loadDataSilent(){ try{ APP.data=await TW.call('testweb_dashboard'); }catch{} }
function closeTopModal(){ const all=document.querySelectorAll('.modal-bg'); if(all.length) all[all.length-1].querySelector('.modal-x').click(); }

/* ================= الرسائل ================= */
function pageMessages(){
  view().innerHTML=`
    <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
      ${msgCard('📢','رسالة لكل الطلاب', 'إرسال رسالة واتساب لجميع الطلاب المسجّلين.',"openBroadcast('all_students')")}
      ${msgCard('📣','رسالة لكل المشرفين','إرسال رسالة واتساب لجميع المشرفين.',"openBroadcast('all_teachers')")}
      ${msgCard('☑','تحديد طلاب','اختيار عدد من الطلاب وإرسال رسالة لهم.',"openPick('students')")}
      ${msgCard('☑','تحديد مشرفين','اختيار عدد من المشرفين وإرسال رسالة لهم.',"openPick('teachers')")}
      ${msgCard('📱','رسالة لرقم هاتف','إرسال لرقم ٠٧٧... (يُحوَّل تلقائياً إلى صيغة واتساب).',"openPhoneMsg()")}
    </div>`;
}
function msgCard(ic,title,desc,onclick){
  return `<div class="pcard" onclick="${onclick}">
    <div class="flex center gap"><div class="avatar" style="width:46px;height:46px;font-size:20px">${ic}</div>
    <div class="pcard-id"><div class="nm">${title}</div></div></div>
    <div class="muted" style="font-size:13px">${desc}</div></div>`;
}
function msgComposer(){ return `<div class="field"><label>نص الرسالة</label><textarea class="f" data-k="msg" placeholder="اكتب رسالتك هنا..."></textarea></div>`; }

function openBroadcast(target){
  const count = target==='all_students'?APP.data.stats.students_total:APP.data.stats.teachers_total;
  const who = target==='all_students'?'جميع الطلاب':'جميع المشرفين';
  const body=`<p class="muted mb">سترسل إلى <b>${who}</b> (${count} مستلم).</p>${msgComposer()}`;
  const foot=`<button class="btn btn-primary" id="md-send">إرسال للجميع</button><button class="btn btn-ghost" onclick="closeTopModal()">إلغاء</button>`;
  const m=UI.modal('رسالة جماعية',body,foot);
  m.el.querySelector('#md-send').onclick=ev=>sendMsg(ev.target,{target,msg:collect(m.el).msg},m);
}
function openPhoneMsg(){
  const body=`${field('رقم الهاتف','phone','','tel')}${msgComposer()}`;
  const foot=`<button class="btn btn-primary" id="md-send">إرسال</button><button class="btn btn-ghost" onclick="closeTopModal()">إلغاء</button>`;
  const m=UI.modal('رسالة إلى رقم',body,foot);
  m.el.querySelector('#md-send').onclick=ev=>{const f=collect(m.el);sendMsg(ev.target,{target:'phone',phone:f.phone,msg:f.msg},m);};
}
function openSendOne(phone,name){
  const body=`<p class="muted mb">إرسال رسالة إلى <b>${UI.esc(name)}</b> (<span dir="ltr">${UI.esc(phone)}</span>).</p>${msgComposer()}`;
  const foot=`<button class="btn btn-primary" id="md-send">إرسال</button><button class="btn btn-ghost" onclick="closeTopModal()">إلغاء</button>`;
  const m=UI.modal('رسالة مباشرة',body,foot);
  m.el.querySelector('#md-send').onclick=ev=>sendMsg(ev.target,{target:'phone',phone,msg:collect(m.el).msg},m);
}
function openPick(kind){
  const items = kind==='students'?APP.data.students.map(s=>({id:s.user_id,nm:s.full_name,mt:s.phone})):
    APP.data.teachers.map(t=>({id:t.teacher_id,nm:t.full_name,mt:t.phone}));
  const list=items.map(i=>`<label class="pick"><input type="checkbox" value="${UI.attr(i.id)}">
    <div><div class="nm">${UI.esc(i.nm)}</div><div class="mt" dir="ltr">${UI.esc(i.mt)}</div></div></label>`).join('');
  const body=`<div class="field"><input class="input" placeholder="بحث..." style="width:100%" oninput="filterPick(this)"></div>
    <div class="flex between mb"><button class="btn btn-ghost btn-sm" onclick="pickAll(this,true)">تحديد الكل</button>
    <span class="muted" id="pick-n">0 محدد</span><button class="btn btn-ghost btn-sm" onclick="pickAll(this,false)">إلغاء التحديد</button></div>
    <div class="pick-list" id="pick-list">${list}</div>${msgComposer()}`;
  const foot=`<button class="btn btn-primary" id="md-send">إرسال للمحدّدين</button><button class="btn btn-ghost" onclick="closeTopModal()">إلغاء</button>`;
  const m=UI.modal(kind==='students'?'تحديد طلاب':'تحديد مشرفين',body,foot,{wide:true});
  const upd=()=>{const n=m.el.querySelectorAll('#pick-list input:checked').length;m.el.querySelector('#pick-n').textContent=n+' محدد';};
  m.el.querySelectorAll('#pick-list input').forEach(c=>c.addEventListener('change',upd));
  m.el.querySelector('#md-send').onclick=ev=>{
    const ids=[...m.el.querySelectorAll('#pick-list input:checked')].map(c=>c.value);
    if(!ids.length){UI.toast('لم تحدّد أحداً','err');return;}
    sendMsg(ev.target,{target:kind,ids,msg:collect(m.el).msg},m);
  };
}
function filterPick(inp){
  const q=inp.value.toLowerCase();
  inp.closest('.modal-body').querySelectorAll('#pick-list .pick').forEach(p=>{
    p.style.display=p.querySelector('.nm').textContent.toLowerCase().includes(q)||p.querySelector('.mt').textContent.includes(q)?'':'none';
  });
}
function pickAll(btn,val){ btn.closest('.modal-body').querySelectorAll('#pick-list input').forEach(c=>{if(c.closest('.pick').style.display!=='none')c.checked=val;});
  const m=btn.closest('.modal-body');const n=m.querySelectorAll('#pick-list input:checked').length;m.querySelector('#pick-n').textContent=n+' محدد';}

async function sendMsg(btn,payload,modal){
  if(!payload.msg||!payload.msg.trim()){ UI.toast('اكتب نص الرسالة','err'); return; }
  if(payload.target==='phone' && !payload.phone){ UI.toast('أدخل رقم الهاتف','err'); return; }
  const orig=btn.innerHTML; btn.disabled=true; btn.innerHTML='<span class="spinner"></span> جارٍ الإرسال';
  try{
    const r=await TW.call('testweb_message',payload);
    modal.close();
    UI.toast(`تم الإرسال: ${r.sent} ناجحة${r.failed?` • ${r.failed} فاشلة`:''} من ${r.total}`, r.failed?'info':'ok',4500);
  }catch(e){ UI.toast(e.message,'err',4500); btn.disabled=false; btn.innerHTML=orig; }
}

/* ================= رموز الدخول (OTP) ================= */
let otpTimer=null;
async function pageOtps(){
  if(otpTimer){clearInterval(otpTimer);otpTimer=null;}
  view().innerHTML=`<div class="section-head" style="margin-top:0"><h2>آخر رموز الدخول المُرسَلة</h2>
    <button class="btn btn-ghost btn-sm" onclick="pageOtps()">↻ تحديث</button></div>
    <p class="muted mb">يُفكّ تشفير الرمز الأصلي تلقائياً. صلاحية كل رمز دقيقتان من وقت الإرسال.</p>
    <div id="otp-wrap">${UI.skeletonCards(4)}</div>`;
  let res;
  try{ res=await TW.call('testweb_otps',{limit:40}); }
  catch(e){ $('#otp-wrap').innerHTML=UI.errorBox(e.message); return; }
  renderOtps(res.otps);
  // عدّاد تنازلي حيّ
  otpTimer=setInterval(()=>{ document.querySelectorAll('[data-exp]').forEach(el=>{
    let s=+el.getAttribute('data-exp'); s=Math.max(0,s-1); el.setAttribute('data-exp',s);
    el.innerHTML = s>0 ? `<span class="badge ok">${fmtCountdown(s)}</span>` : `<span class="badge no">منتهٍ</span>`;
  }); },1000);
}
function fmtCountdown(s){ const m=Math.floor(s/60); return `${m}:${String(s%60).padStart(2,'0')}`; }
function renderOtps(otps){
  const wrap=$('#otp-wrap'); if(!wrap)return;
  if(!otps.length){wrap.innerHTML=UI.empty('لا رموز حديثة','🔑');return;}
  const rows=otps.map(o=>{
    const code=o.code?`<span class="copy-field"><span class="val" style="font-size:16px;font-weight:800;letter-spacing:2px">${UI.esc(o.code)}</span><button class="cp" onclick="UI.copy('${UI.attr(o.code)}')">⧉</button></span>`:'<span class="muted">تعذّر فكّه</span>';
    const status=o.verified?UI.badge('ok','تم التحقق'):o.logined?UI.badge('ok','سجّل الدخول'):o.expired?UI.badge('no','منتهٍ'):UI.badge('warn','بانتظار');
    const exp=o.expired?`<span class="badge no">منتهٍ</span>`:`<span data-exp="${o.expires_in_sec}"><span class="badge ok">${fmtCountdown(o.expires_in_sec)}</span></span>`;
    return `<tr>
      <td>${code}</td>
      <td><b>${UI.esc(o.student_name)}</b></td>
      <td>${UI.copyField(o.phone)}</td>
      <td>${status}</td>
      <td>${exp}</td>
      <td class="muted">${UI.ago(o.otp_date)}</td>
      <td class="muted">محاولات: ${o.allow_trying}</td>
    </tr>`;
  }).join('');
  wrap.innerHTML=`<div class="tbl-wrap"><table class="tbl">
    <thead><tr><th>الرمز</th><th>الطالب</th><th>الهاتف</th><th>الحالة</th><th>ينتهي خلال</th><th>منذ</th><th>المحاولات</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}
