const $ = (s, r = document) => r.querySelector(s);
const view = () => document.getElementById('view');

const APP = { admin: null, dash: null };

const TITLES = {
  overview: 'النظرة العامة', students: 'الطلاب', teachers: 'المشرفون',
  messages: 'الرسائل', otps: 'رموز الدخول', holidays: 'الإجازات',
  logs: 'سجل العمليات', admins: 'الإداريون', 'today-log': 'سجل الطلاب لليوم',
  'full-log': 'سجل الطلاب', 'add-student': 'إضافة طالب', 'add-teacher': 'إضافة مشرف',
};

const NAV_ITEMS = [
  { id: 'overview', label: 'النظرة العامة', ic: 'grid' },
  { id: 'today-log', label: 'سجل اليوم', ic: 'today' },
  { id: 'full-log', label: 'سجل الطلاب', ic: 'records' },
  { id: 'students', label: 'الطلاب', ic: 'students' },
  { id: 'teachers', label: 'المشرفون', ic: 'teacher' },
  { id: 'messages', label: 'الرسائل', ic: 'message' },
  { id: 'otps', label: 'رموز الدخول', ic: 'key' },
  { id: 'holidays', label: 'الإجازات', ic: 'holiday' },
  { id: 'logs', label: 'سجل العمليات', ic: 'logs', ownerOnly: true },
  { id: 'admins', label: 'الإداريون', ic: 'admins', ownerOnly: true },
];

/* ================= الإقلاع وتسجيل الدخول ================= */
async function boot() {
  if (TW.accessToken) {
    const v = await TW.verify();
    if (v && v.error === false) { enterApp(v.admin); return; }
  }
  $('#boot').classList.add('hidden');
  $('#login').classList.remove('hidden');
}

function wireLogin() {
  const doLogin = async () => {
    const email = $('#lg-email').value.trim();
    const pass = $('#lg-pass').value;
    const err = $('#lg-err'); err.classList.add('hidden');
    if (!email || !pass) { err.textContent = 'أدخل البريد وكلمة المرور'; err.classList.remove('hidden'); return; }
    const btn = $('#lg-btn'); const orig = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      const admin = await TW.login(email, pass);
      enterApp(admin);
    } catch (e) {
      err.textContent = e.message; err.classList.remove('hidden');
      btn.disabled = false; btn.innerHTML = orig;
    }
  };
  $('#lg-btn').onclick = doLogin;
  $('#lg-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  $('#lg-email').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

function adminTitleText(a) {
  const isF = a.gender === 'female';
  if (a.type === 'owner') return isF ? 'المسؤولة الإدارية' : 'المسؤول الإداري';
  return isF ? 'الإدارية' : 'الإداري';
}

function enterApp(admin) {
  APP.admin = admin;
  $('#boot').classList.add('hidden');
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  $('#admin-line').textContent = `${adminTitleText(admin)} ${admin.name}`;
  buildNav();
  wireShell();
  router();
}

function buildNav() {
  const nav = $('#nav');
  nav.innerHTML = NAV_ITEMS
    .filter(n => !n.ownerOnly || APP.admin.type === 'owner')
    .map(n => `<a href="#/${n.id}" data-id="${n.id}">${icon(n.ic, 18)}<span>${n.label}</span></a>`)
    .join('');
}

function wireShell() {
  $('#menu-toggle').innerHTML = icon('menu', 22);
  $('#btn-logout').onclick = () => { TW.logout(); location.reload(); };
  $('#btn-refresh').onclick = async () => { APP.dash = null; await getDash(true); router(true); UI.toast('تم تحديث البيانات', 'ok', 1500); };
  $('#menu-toggle').onclick = () => $('#app').classList.add('nav-open');
  $('#scrim').onclick = () => $('#app').classList.remove('nav-open');
  $('#nav').addEventListener('click', () => $('#app').classList.remove('nav-open'));
  window.addEventListener('hashchange', () => router());
}

function setActiveNav(page) {
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.getAttribute('data-id') === page));
  $('#page-title').textContent = TITLES[page] || '';
}

/* ================= بيانات اللوحة (مخزّنة محلياً) ================= */
async function getDash(force) {
  if (APP.dash && !force) return APP.dash;
  APP.dash = await TW.call('testweb_dashboard');
  return APP.dash;
}

/* ================= التوجيه ================= */
const DASH_PAGES = new Set(['overview', 'students', 'teachers', 'messages', 'add-student', 'add-teacher']);

async function router() {
  const parts = (location.hash || '#/overview').slice(2).split('/').filter(Boolean);
  const page = parts[0] || 'overview';
  const id = parts[1] ? decodeURIComponent(parts[1]) : null;
  setActiveNav(page);

  if (page === 'admins' && APP.admin.type !== 'owner') { location.hash = '#/overview'; return; }
  if (page === 'logs' && APP.admin.type !== 'owner') { location.hash = '#/overview'; return; }

  if (DASH_PAGES.has(page) && !APP.dash) {
    view().innerHTML = `<div class="empty-state"><span class="spinner lg"></span></div>`;
    try { await getDash(false); } catch (e) { view().innerHTML = UI.errorBox(e.message); return; }
  }

  try {
    switch (page) {
      case 'overview': return pageOverview();
      case 'students': return id ? pageStudentDetail(id) : pageStudents();
      case 'teachers': return id ? pageTeacherDetail(id) : pageTeachers();
      case 'messages': return pageMessages();
      case 'otps': return pageOtps();
      case 'holidays': return pageHolidays();
      case 'logs': return pageLogs();
      case 'admins': return pageAdmins();
      case 'today-log': return pageTodayLog();
      case 'full-log': return id ? pageFullLogStudent(id) : pageFullLog();
      case 'add-student': return pageAddStudent();
      case 'add-teacher': return pageAddTeacher();
      default: return pageOverview();
    }
  } catch (e) {
    view().innerHTML = UI.errorBox(e.message);
  }
}

/* ================= أدوات نماذج ومودالات ================= */
function fieldHtml(label, name, value, type = 'text') {
  return `<div class="field"><label>${UI.esc(label)}</label><input class="f-input" data-k="${name}" type="${type}" value="${UI.esc(value ?? '')}"></div>`;
}
function selectHtml(label, name, value, options) {
  const opts = options.map(([v, l]) => `<option value="${UI.esc(v)}" ${String(value) === String(v) ? 'selected' : ''}>${UI.esc(l)}</option>`).join('');
  return `<div class="field"><label>${UI.esc(label)}</label><select class="f-input" data-k="${name}">${opts}</select></div>`;
}
function textareaHtml(label, name, value, placeholder = '') {
  return `<div class="field"><label>${UI.esc(label)}</label><textarea class="f-input" data-k="${name}" placeholder="${UI.attr(placeholder)}" rows="4">${UI.esc(value ?? '')}</textarea></div>`;
}
function collectFields(root) {
  const o = {};
  root.querySelectorAll('.f-input').forEach(el => { o[el.getAttribute('data-k')] = el.value; });
  return o;
}
function teacherOptions() {
  return (APP.dash?.teachers ?? []).map(t => [t.teacher_id, t.full_name]);
}
const NOTIFY_OPTS = [['both', 'الطالب والمشرف'], ['student', 'الطالب فقط'], ['teacher', 'المشرف فقط'], ['none', 'بدون إبلاغ']];

async function runAction(btn, fn, opts = {}) {
  const orig = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
  try {
    const res = await fn();
    if (opts.okMsg) UI.toast(opts.okMsg, 'ok');
    if (opts.modal) opts.modal.close();
    if (opts.refreshDash !== false) await getDash(true);
    if (opts.after) await opts.after(res);
    return res;
  } catch (e) {
    UI.toast(e.message, 'err', 4500);
    btn.disabled = false; btn.innerHTML = orig;
    throw e;
  }
}

function kvGrid(pairs) {
  return `<div class="kv" style="margin-top:14px">${pairs.map(([k, v]) => `<b>${UI.esc(k)}</b><span>${v}</span>`).join('')}</div>`;
}
function flexRow(html, justify = 'flex-start') {
  return `<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:${justify}">${html}</div>`;
}

/* ================= النظرة العامة ================= */
function pageOverview() {
  const s = APP.dash.stats;
  const statCard = (ic, num, lbl) => `<div class="stat-card">${icon(ic, 22)}<div class="num" style="margin-top:10px">${num}</div><div class="lbl">${UI.esc(lbl)}</div></div>`;
  const cards = [
    statCard('students', s.students_total, 'إجمالي الطلاب'),
    statCard('teacher', s.teachers_total, 'المشرفون'),
    statCard('check', s.active_saves, 'عمليات حفظ نشطة'),
    statCard('exam', s.in_exam, 'في الاختبار'),
    statCard('star', s.finished_saves, 'عمليات حفظ مكتملة'),
    statCard('ban', s.suspended_saves, 'عمليات حفظ موقوفة'),
    statCard('clock', s.not_joined, 'لم ينضمّوا بعد'),
    statCard('alert', s.profile_incomplete, 'ملفات ناقصة'),
    statCard('holiday', s.with_absence, 'لديهم غياب'),
    statCard('records', s.avg_progress + '%', 'متوسط التقدّم'),
  ].join('');

  const topT = [...APP.dash.teachers].sort((a, b) => b.students_count - a.students_count).slice(0, 6).map(t => `
    <div class="entity-card" onclick="location.hash='#/teachers/${UI.attr(t.teacher_id)}'">
      <div class="avatar">${icon('teacher', 20)}</div>
      <div class="entity-info"><div class="name">${UI.esc(t.full_name)}</div><div class="sub">${UI.esc(t.gender_label)}</div></div>
      ${UI.badge('blue', t.students_count + ' طالب')}
    </div>`).join('') || UI.empty('لا مشرفين', 'teacher');

  const rankPanel = (title, list) => {
    if (!list || !list.length) return `<div class="panel"><div class="panel-head"><h2>${UI.esc(title)}</h2></div>${UI.empty('لا بيانات', 'records')}</div>`;
    const rows = list.map(r => {
      const max = r.max > 0 ? r.max : 1;
      const w = Math.max(0, Math.min(100, (r.value / max) * 100));
      const g = r.gender === 'female' ? 'أنثى' : 'ذكر';
      return `<div class="rank-row" onclick="location.hash='#/students/${UI.attr(r.user_id)}'" style="cursor:pointer">
        <span class="rank-name">${UI.esc(r.name)} <span class="muted" style="font-weight:400">— ${g}</span></span>
        <div class="rank-bar"><div style="width:${w}%"></div></div>
        <span class="rank-val">${UI.esc(r.value)}</span>
      </div>`;
    }).join('');
    return `<div class="panel"><div class="panel-head"><h2>${UI.esc(title)}</h2></div><div>${rows}</div></div>`;
  };

  // ── تقدّم ذكي (حلقة) + إحصائيات عمودية لتوزيع حالات الحفظ ──
  const avg = Math.max(0, Math.min(100, Number(s.avg_progress) || 0));
  const dist = [
    { lbl: 'نشط', val: s.active_saves, c: 'var(--teal)' },
    { lbl: 'اختبار', val: s.in_exam, c: 'var(--blue)' },
    { lbl: 'مكتمل', val: s.finished_saves, c: 'var(--green)' },
    { lbl: 'موقوف', val: s.suspended_saves, c: 'var(--gold)' },
    { lbl: 'لم ينضم', val: s.not_joined, c: 'var(--gray)' },
    { lbl: 'غياب', val: s.with_absence, c: 'var(--red)' },
  ];
  const vmax = Math.max(1, ...dist.map(d => Number(d.val) || 0));
  const vbars = dist.map(d => {
    const v = Number(d.val) || 0;
    const h = Math.max(4, Math.round((v / vmax) * 100));
    return `<div class="vcol">
      <div class="vnum">${v}</div>
      <div class="vbar-track"><div class="vbar-fill" style="height:${h}%;background:${d.c}"></div></div>
      <div class="vlabel">${d.lbl}</div>
    </div>`;
  }).join('');
  const hero = `<div class="hero-stats">
    <div class="panel ring-panel">
      <div class="ring" style="--val:${avg}"><div class="ring-in"><div class="ring-val">${avg}%</div><div class="ring-lbl">متوسط التقدّم</div></div></div>
      <div class="muted" style="font-size:12.5px;text-align:center">${s.students_total} طالب · ${s.active_saves} حفظ نشط</div>
    </div>
    <div class="panel">
      <div class="panel-head"><h2>توزيع حالات الحفظ</h2></div>
      <div class="vchart">${vbars}</div>
    </div>
  </div>`;

  view().innerHTML = `
    ${hero}
    <div class="cards-grid">${cards}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px">
      ${rankPanel('الأكثر نجاحاً', APP.dash.top_success)}
      ${rankPanel('الأكثر غياباً', APP.dash.top_absence)}
    </div>
    <div class="panel">
      <div class="panel-head"><h2>أكثر المشرفين طلاباً</h2></div>
      <div style="display:grid;gap:10px">${topT}</div>
    </div>`;
}

/* ================= الطلاب ================= */
const stFilters = { status: 'all', gender: 'all', q: '', sort: 'name' };
const ST_STATUS = [
  ['all', 'الكل'], ['active', 'نشط'], ['in_exam', 'في الاختبار'], ['finished', 'مكتمل'],
  ['suspended', 'موقوف'], ['terminated', 'منهي'], ['not_joined', 'لم ينضمّوا'],
  ['no_save', 'بدون حفظ'], ['incomplete', 'ملف ناقص'], ['absence', 'لديهم غياب'],
];
const ST_PRED = {
  active: s => s.save && s.save.status === 'ACTIVE',
  in_exam: s => s.save && (s.save.status === 'IN_EXAM1' || s.save.status === 'IN_EXAM2'),
  finished: s => s.save && s.save.status === 'FINISHED',
  suspended: s => s.save && s.save.status === 'SUSPENDED',
  terminated: s => s.save && s.save.status === 'TERMINATED',
  not_joined: s => !s.joined, no_save: s => !s.save,
  incomplete: s => s.profile_incomplete, absence: s => s.absence_total > 0,
};

function pageStudents() {
  const counts = { all: APP.dash.students.length };
  for (const k in ST_PRED) counts[k] = APP.dash.students.filter(ST_PRED[k]).length;
  const chips = ST_STATUS.map(([k, l]) => `<button class="btn btn-sm ${stFilters.status === k ? 'btn-primary' : 'btn-ghost'}" onclick="setStFilter('${k}')">${l} (${counts[k] ?? 0})</button>`).join('');

  view().innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <div class="search-box">${icon('search', 16)}<input id="st-q" placeholder="ابحث بالاسم أو الهاتف" value="${UI.esc(stFilters.q)}"></div>
        <select class="f-input" id="st-gender" style="width:auto"><option value="all">كل الأجناس</option><option value="male">ذكور</option><option value="female">إناث</option></select>
        <select class="f-input" id="st-sort" style="width:auto">
          <option value="name">ترتيب: الاسم</option><option value="progress">الأعلى تقدّماً</option>
          <option value="absence">الأكثر غياباً</option><option value="newest">الأحدث تسجيلاً</option>
        </select>
        <a class="btn btn-primary" href="#/add-student">${icon('plus', 15)} إضافة طالب</a>
      </div>
      <div class="quick-states" style="margin-top:14px">${chips}</div>
    </div>
    <div id="st-list"></div>`;

  $('#st-gender').value = stFilters.gender; $('#st-sort').value = stFilters.sort;
  $('#st-q').addEventListener('input', e => { stFilters.q = e.target.value; renderStudentList(); });
  $('#st-gender').addEventListener('change', e => { stFilters.gender = e.target.value; renderStudentList(); });
  $('#st-sort').addEventListener('change', e => { stFilters.sort = e.target.value; renderStudentList(); });
  renderStudentList();
}
function setStFilter(k) { stFilters.status = k; pageStudents(); }

function filteredStudents() {
  let list = [...APP.dash.students];
  const pred = ST_PRED[stFilters.status];
  if (pred) list = list.filter(pred);
  if (stFilters.gender !== 'all') list = list.filter(s => s.gender === stFilters.gender);
  const q = stFilters.q.trim().toLowerCase();
  if (q) list = list.filter(s => (s.full_name || '').toLowerCase().includes(q) || (s.phone || '').includes(q));
  const sorters = {
    name: (a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'ar'),
    progress: (a, b) => (b.save?.progress_pct || 0) - (a.save?.progress_pct || 0),
    absence: (a, b) => b.absence_total - a.absence_total,
    newest: (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
  };
  list.sort(sorters[stFilters.sort] || sorters.name);
  return list;
}

function renderStudentList() {
  const list = filteredStudents();
  const wrap = $('#st-list'); if (!wrap) return;
  if (!list.length) { wrap.innerHTML = UI.empty('لا يوجد طلاب مطابقون', 'search'); return; }
  wrap.innerHTML = `<div class="panel"><div style="display:grid;gap:10px">${list.map(studentRow).join('')}</div></div>`;
}

function studentRow(s) {
  const badges = [];
  if (!s.joined) badges.push(UI.badge('gold', 'لم ينضمّ'));
  if (s.profile_incomplete) badges.push(UI.badge('red', 'ملف ناقص'));
  if (s.absence_total > 0) badges.push(UI.badge('gray', 'غياب ' + s.absence_total));
  const statusB = s.save ? UI.badge('blue', s.save.status_label) : UI.badge('gray', 'بدون حفظ');
  const prog = s.save ? `<div class="progress-bar" style="width:150px"><div style="width:${s.save.progress_pct}%"></div></div>` : '';
  return `<div class="entity-card" onclick="location.hash='#/students/${UI.attr(s.user_id)}'">
    <div class="avatar">${icon('students', 20)}</div>
    <div class="entity-info">
      <div class="name">${UI.esc(s.full_name || '—')} <span style="color:var(--muted);font-weight:400">— ${UI.esc(s.gender_label)}</span></div>
      <div class="sub" dir="ltr">${UI.esc(s.phone || '—')} <span dir="rtl">• المشرف: ${UI.esc(s.teacher_name || '—')}</span></div>
      ${prog}
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${statusB}${badges.join('')}</div>
  </div>`;
}

/* ================= ملف الطالب ================= */
async function pageStudentDetail(id) {
  view().innerHTML = `<div class="empty-state"><span class="spinner lg"></span></div>`;
  let res;
  try { res = await TW.call('testweb_student', { user_id: id }); }
  catch (e) { view().innerHTML = UI.errorBox(e.message); return; }
  APP.current = res;
  const u = res.user, saves = res.saves;

  const avatar = u.photo_url
    ? `<div class="avatar" style="width:78px;height:78px"><img src="${UI.esc(u.photo_url)}" style="cursor:zoom-in" onclick="UI.imageViewer('${UI.attr(u.photo_url)}')"></div>`
    : `<div class="avatar" style="width:78px;height:78px">${icon('students', 30)}</div>`;

  const badges = [];
  badges.push(u.joined ? UI.badge('green', 'منضمّ') : UI.badge('gold', 'لم ينضمّ بعد'));
  if (u.profile_incomplete) badges.push(UI.badge('red', 'ملف ناقص'));
  if (u.absence_total > 0) badges.push(UI.badge('gray', 'غياب: ' + u.absence_total));

  const info = kvGrid([
    ['رقم الهاتف', UI.copyField(u.phone)],
    ['هاتف ولي الأمر', UI.copyField(u.father_phone)],
    ['البريد', UI.copyField(u.email)],
    ['الجنس', UI.esc(u.gender_label)],
    ['تاريخ الميلاد', UI.esc(u.date_of_brith)],
    ['المشرف', UI.esc(u.teacher_name)],
    ['العنوان', UI.esc(u.location)],
    ['الموقع (GPS)', UI.copyField(u.gps)],
    ['آخر دخول', UI.fmtDate(u.last_logined_in)],
    ['تاريخ التسجيل', UI.fmtDate(u.created_at)],
    ['معرّف الطالب', UI.copyField(u.user_id)],
  ]);

  const savesHtml = saves.length ? saves.map(saveBlock).join('') : `<div class="panel">${UI.empty('لا توجد سيرة حفظية لهذا الطالب', 'records')}</div>`;

  const absenceInfo = (Array.isArray(u.absence_info) && u.absence_info.length)
    ? `<div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--border)">
        <h3 style="font-size:14px;font-weight:700;margin-bottom:8px">تفاصيل الغياب</h3>
        ${kvGrid(u.absence_info.map(([k, v]) => [k, UI.esc(v)]))}
      </div>` : '';

  view().innerHTML = `
    <button class="btn btn-ghost btn-sm" onclick="history.back()" style="margin-bottom:14px">→ رجوع</button>
    <div class="panel">
      <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:16px">
          ${avatar}
          <div><div style="font-size:22px;font-weight:800">${UI.esc(u.full_name || '—')}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${badges.join('')}</div></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-self:flex-start">
          <button class="btn btn-ghost btn-sm" onclick="openEditStudentModal()">${icon('edit', 14)} تعديل الملف</button>
          <button class="btn btn-ghost btn-sm" onclick="openSetPasswordModal('student','${UI.attr(u.user_id)}','${UI.attr(u.full_name)}')">${icon('key', 14)} كلمة المرور</button>
          <button class="btn btn-ghost btn-sm" onclick="openSendPasswordModal('student','${UI.attr(u.user_id)}')">${icon('send', 14)} إرسال كلمة السر</button>
          <button class="btn btn-ghost btn-sm" onclick="openAddSaveModal()">${icon('plus', 14)} حفظ جديد</button>
          <button class="btn btn-ghost btn-sm" onclick="openProfileIncompleteModal()">${icon('alert', 14)} ملف غير مكتمل</button>
          <button class="btn btn-ghost btn-sm" onclick="clearStudentAbsence()">${icon('holiday', 14)} حذف الغيابات</button>
          <button class="btn btn-primary btn-sm" onclick="openQuickMessageModal('${UI.attr(u.phone)}','${UI.attr(u.full_name)}')">${icon('message', 14)} رسالة</button>
          <button class="btn btn-danger btn-sm" onclick="openDeleteStudentModal()">${icon('trash', 14)} حذف</button>
        </div>
      </div>
      ${info}
      ${absenceInfo}
    </div>
    <div class="panel-head" style="margin:18px 4px 12px"><h2>السيرة الحفظية (${saves.length})</h2></div>
    ${savesHtml}`;
}

function saveBlock(s) {
  const cur = s.is_current ? UI.badge('green', 'الحفظ الحالي') : '';
  const examInfo = (s.exam1 || s.exam2) ? `<div class="muted" style="font-size:12.5px;margin-top:6px">
    ${s.exam1 ? `جزئي: ${UI.esc(s.exam1_teacher_name)}` : ''} ${s.exam2 ? ` • تراكمي: ${UI.esc(s.exam2_teacher_name)}` : ''}</div>` : '';
  const grid = kvGrid([
    ['الحالة', UI.badge('blue', s.status_label)],
    ['من صفحة', UI.esc(s.start_page)], ['إلى صفحة', UI.esc(s.end_page)],
    ['الورد اليومي', UI.esc(s.every_day_page)],
    ['المُنجز', `${s.saved_pages} / ${s.total_pages} صفحة`],
    ['المشرف', UI.esc(s.teacher_name)],
    ['بدأت', UI.fmtDateShort(s.started_at)], ['اكتملت', UI.fmtDateShort(s.finished_at)],
  ]);
  const sid = UI.attr(String(s.id));
  return `<div class="panel">
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <b style="font-size:15px">${UI.esc(s.name || 'حفظ')}</b>${cur}
      <span style="flex:1"></span>
      ${UI.badge('blue', s.progress_pct + '%')}
      ${s.status === 'ACTIVE' ? UI.badge('green', s.status_label) : s.status === 'SUSPENDED' ? UI.badge('red', s.status_label) : UI.badge('gray', s.status_label)}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;gap:14px;flex-wrap:wrap;margin-top:10px">
      <div class="progress-bar" style="flex:1;min-width:160px"><div style="width:${s.progress_pct}%"></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-ghost btn-sm" onclick="openEditSaveModal('${sid}')">${icon('edit', 13)} تعديل</button>
        <button class="btn btn-ghost btn-sm" onclick="openRebuildSaveModal('${sid}')">${icon('edit', 13)} تعديل من الصفر</button>
        <button class="btn btn-ghost btn-sm" onclick="openExamControlModal('${sid}','EXAM1')">${icon('exam', 13)} الاختبار الجزئي</button>
        <button class="btn btn-ghost btn-sm" onclick="openExamControlModal('${sid}','EXAM2')">${icon('exam', 13)} الاختبار التراكمي</button>
      </div>
    </div>
    ${examInfo}${grid}
    <div class="tabs" style="margin-top:16px">
      <button class="tab active" onclick="switchSaveTab(this,'pg-${sid}')">الحفظ اليومي (${s.pages.length})</button>
      <button class="tab" onclick="switchSaveTab(this,'ts-${sid}')">الاختبارات (${s.tests.length})</button>
    </div>
    <div id="pg-${sid}">${pagesTable(s.pages, false)}</div>
    <div id="ts-${sid}" class="hidden">${pagesTable(s.tests, true)}</div>
  </div>`;
}

function pagesTable(rows, isExam) {
  if (!rows.length) return UI.empty(isExam ? 'لا اختبارات' : 'لا صفحات بعد', 'page');
  const head = isExam
    ? `<tr><th>النوع</th><th>الصفحات</th><th>الحالة</th><th>الأخطاء</th><th>المشرف</th><th>التاريخ</th><th></th></tr>`
    : `<tr><th>الصفحة</th><th>الاسم</th><th>الحالة</th><th>الأخطاء</th><th>المشرف</th><th>التاريخ</th><th></th></tr>`;
  const body = rows.map((r, idx) => {
    const errors = errorsText(r.errors_number, isExam);
    const cells = isExam
      ? `<td>${UI.esc(r.type_label)}</td><td>${UI.esc(r.start_page)}—${UI.esc(r.end_page)}</td>`
      : `<td><b>${UI.esc(r.page_display)}</b></td><td class="muted">${UI.esc(r.page_name || '—')}</td>`;
    const tbl = isExam ? 'tests' : 'pages';
    return `<tr>${cells}
      <td>${UI.gradeBadge(r.grade_kind, r.status_label)}</td>
      <td class="muted">${errors}</td>
      <td>${UI.esc(r.teacher_name)}</td>
      <td class="muted">${UI.fmtDateShort(r.date || r.created_at)}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="openGradeModal('${tbl}',${r.id},${isExam},${!isExam && idx < rows.length - 2})">${icon('check', 13)} تقييم</button></td>
    </tr>`;
  }).join('');
  return `<div class="tbl-wrap" style="margin-top:14px"><table><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}
function errorsText(e, isExam) {
  if (!e || typeof e !== 'object') return '—';
  const p = [];
  if (e.sowad != null) p.push('سواد ' + e.sowad);
  if (e.nisyan != null) p.push('نسيان ' + e.nisyan);
  if (isExam && e.fateh != null) p.push('فتح ' + e.fateh);
  return p.join('، ') || '—';
}
function switchSaveTab(btn, targetId) {
  const tabs = btn.parentElement;
  tabs.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  const panel = tabs.closest('.panel');
  panel.querySelectorAll('[id^="pg-"],[id^="ts-"]').forEach(d => d.classList.add('hidden'));
  panel.querySelector('#' + targetId).classList.remove('hidden');
}

/* ---------- نوافذ الطالب ---------- */
function openEditStudentModal() {
  const u = APP.current.user;
  const body = `<div class="form-grid">
    ${fieldHtml('الاسم الكامل', 'full_name', u.full_name)}
    ${selectHtml('الجنس', 'gender', u.gender, [['male', 'ذكر'], ['female', 'أنثى']])}
    ${fieldHtml('تاريخ الميلاد', 'date_of_brith', u.date_of_brith === '—' ? '' : u.date_of_brith)}
    ${fieldHtml('العنوان', 'user_location', u.location === '—' ? '' : u.location)}
  </div>`;
  const foot = `<button class="btn btn-primary" id="md-ok">حفظ التعديلات</button><button class="btn btn-ghost" id="md-cancel">إلغاء</button>`;
  const m = UI.modal('تعديل ملف الطالب', body, foot);
  m.el.querySelector('#md-cancel').onclick = m.close;
  m.el.querySelector('#md-ok').onclick = async ev => {
    const f = collectFields(m.el);
    await runAction(ev.target, () => TW.call('testweb_mutate', { action: 'update_student', user_id: u.user_id, fields: f }),
      { okMsg: 'تم حفظ بيانات الطالب', modal: m, after: () => pageStudentDetail(u.user_id) });
  };
}

function openSetPasswordModal(kind, id, name) {
  const body = `<p class="muted" style="margin-bottom:14px">تعيين كلمة مرور جديدة لـ <b>${UI.esc(name)}</b>.</p>
    ${fieldHtml('كلمة المرور الجديدة', 'password', '')}
    <button class="btn btn-ghost btn-sm" id="md-gen">🎲 توليد كلمة قوية</button>`;
  const foot = `<button class="btn btn-primary" id="md-ok">تعيين</button><button class="btn btn-ghost" id="md-cancel">إلغاء</button>`;
  const m = UI.modal('تغيير كلمة المرور', body, foot);
  m.el.querySelector('#md-cancel').onclick = m.close;
  m.el.querySelector('#md-gen').onclick = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let p = ''; for (let i = 0; i < 10; i++) p += chars[Math.floor(Math.random() * chars.length)];
    m.el.querySelector('.f-input').value = p;
  };
  m.el.querySelector('#md-ok').onclick = async ev => {
    const f = collectFields(m.el);
    if (!f.password || f.password.length < 4) { UI.toast('كلمة المرور قصيرة جداً', 'err'); return; }
    await runAction(ev.target, () => TW.call('testweb_mutate', { action: 'set_password', kind, id, password: f.password }),
      { okMsg: 'تم تغيير كلمة المرور', modal: m, refreshDash: false });
  };
}

function openSendPasswordModal(kind, id) {
  const body = `<p class="muted" style="margin-bottom:14px">سيتم إرسال كلمة المرور عبر واتساب. أدخل كلمة مرور حسابك للتأكيد.</p>
    ${fieldHtml('كلمة مرور حسابك', 'admin_password', '', 'password')}`;
  const foot = `<button class="btn btn-primary" id="md-ok">إرسال</button><button class="btn btn-ghost" id="md-cancel">إلغاء</button>`;
  const m = UI.modal('إرسال كلمة السر', body, foot);
  m.el.querySelector('#md-cancel').onclick = m.close;
  m.el.querySelector('#md-ok').onclick = async ev => {
    const f = collectFields(m.el);
    if (!f.admin_password) { UI.toast('أدخل كلمة المرور', 'err'); return; }
    await runAction(ev.target, () => TW.call('testweb_mutate', { action: 'send_password', kind, id, admin_password: f.admin_password }),
      { okMsg: 'تم إرسال كلمة السر', modal: m, refreshDash: false });
  };
}

function openDeleteStudentModal() {
  const u = APP.current.user;
  const body = `<p style="color:var(--red);font-weight:700;margin-bottom:14px">سيتم حذف الطالب <b>${UI.esc(u.full_name)}</b> نهائياً مع كامل سيرته الحفظية وصفحاته. هذا الإجراء لا يمكن التراجع عنه.</p>
    ${fieldHtml('كلمة مرور حسابك للتأكيد', 'admin_password', '', 'password')}`;
  const foot = `<button class="btn btn-danger" id="md-ok">حذف نهائياً</button><button class="btn btn-ghost" id="md-cancel">إلغاء</button>`;
  const m = UI.modal('حذف الطالب', body, foot);
  m.el.querySelector('#md-cancel').onclick = m.close;
  m.el.querySelector('#md-ok').onclick = async ev => {
    const f = collectFields(m.el);
    if (!f.admin_password) { UI.toast('أدخل كلمة المرور', 'err'); return; }
    await runAction(ev.target, () => TW.call('testweb_mutate', { action: 'delete_student', user_id: u.user_id, admin_password: f.admin_password }),
      { okMsg: 'تم حذف الطالب', modal: m, after: () => { location.hash = '#/students'; } });
  };
}

function openProfileIncompleteModal() {
  const u = APP.current.user;
  const body = `<p class="muted" style="margin-bottom:14px">سيتم تعيين ملف <b>${UI.esc(u.full_name)}</b> كملف غير مكتمل. يمكنك إضافة سبب (اختياري) يظهر للطالب.</p>
    ${textareaHtml('السبب (اختياري)', 'reason', '', 'مثال: يرجى استكمال الصورة الشخصية...')}`;
  const foot = `<button class="btn btn-primary" id="md-ok">تعيين كملف ناقص</button><button class="btn btn-ghost" id="md-cancel">إلغاء</button>`;
  const m = UI.modal('ملف غير مكتمل', body, foot);
  m.el.querySelector('#md-cancel').onclick = m.close;
  m.el.querySelector('#md-ok').onclick = async ev => {
    const f = collectFields(m.el);
    await runAction(ev.target, () => TW.call('testweb_mutate', { action: 'set_profile_incomplete', user_id: u.user_id, reason: f.reason || '' }),
      { okMsg: 'تم تعيين الملف كغير مكتمل', modal: m, after: () => pageStudentDetail(u.user_id) });
  };
}

async function clearStudentAbsence() {
  const u = APP.current.user;
  if (!await UI.confirm('حذف الغيابات', `هل تريد حذف جميع غيابات الطالب ${u.full_name}؟`, 'حذف')) return;
  try {
    await TW.call('testweb_mutate', { action: 'clear_absence', user_id: u.user_id });
    UI.toast('تم حذف الغيابات', 'ok');
    await getDash(true);
    pageStudentDetail(u.user_id);
  } catch (e) { UI.toast(e.message, 'err'); }
}

function openAddSaveModal() {
  const u = APP.current.user;
  const activeSave = APP.current.saves.find(s => s.is_current && (s.status === 'ACTIVE' || s.status === 'SUSPENDED'));
  const warn = activeSave ? `<p style="color:var(--gold);margin-bottom:14px">${icon('alert', 14)} يوجد حفظ نشط حالياً (${UI.esc(activeSave.name)})، سيتم إنهاؤه تلقائياً عند إضافة حفظ جديد.</p>` : '';
  const tOpts = [['', '—']].concat(teacherOptions());
  const yesNo = [['false', 'لا'], ['true', 'نعم']];
  const body = `${warn}<div class="form-grid">
    ${fieldHtml('اسم الحفظ', 'save_name', '')}
    ${selectHtml('المشرف', 'teacher_id', u.teacher_id, teacherOptions())}
    ${fieldHtml('من صفحة', 'start_page', '', 'number')}
    ${fieldHtml('إلى صفحة', 'end_page', '', 'number')}
    ${fieldHtml('الورد اليومي', 'every_day_page', '1', 'number')}
    ${selectHtml('يقيّم اليوم؟', 'evaluate_today', 'false', yesNo)}
    ${selectHtml('تفعيل الاختبار الجزئي', 'exam1', 'false', yesNo)}
    ${selectHtml('مشرف الاختبار الجزئي', 'exam1_teacher_id', '', tOpts)}
    ${selectHtml('تفعيل الاختبار التراكمي', 'exam2', 'false', yesNo)}
    ${selectHtml('مشرف الاختبار التراكمي', 'exam2_teacher_id', '', tOpts)}
    ${selectHtml('الإبلاغ', 'notify_target', 'both', NOTIFY_OPTS)}
  </div>`;
  const foot = `<button class="btn btn-primary" id="md-ok">إضافة الحفظ</button><button class="btn btn-ghost" id="md-cancel">إلغاء</button>`;
  const m = UI.modal('حفظ جديد', body, foot);
  m.el.querySelector('#md-cancel').onclick = m.close;
  m.el.querySelector('#md-ok').onclick = async ev => {
    const f = collectFields(m.el);
    const notify_target = f.notify_target; delete f.notify_target;
    await runAction(ev.target, () => TW.call('testweb_mutate', {
      action: 'add_save', user_id: u.user_id, replace_save_id: activeSave ? activeSave.id : null, fields: f, notify_target,
    }), { okMsg: 'تم إضافة الحفظ', modal: m, after: () => pageStudentDetail(u.user_id) });
  };
}

function openEditSaveModal(saveId) {
  const s = APP.current.saves.find(x => String(x.id) === String(saveId)); if (!s) return;
  const tOpts = [['', '—']].concat(teacherOptions());
  const isTerminated = s.status === 'TERMINATED';
  const statusField = isTerminated
    ? `<div class="field"><label>الحالة</label><input class="f-input" data-k="status_display" value="إلغاء الحفظ نهائياً" disabled>
       <input class="f-input" data-k="status" type="hidden" value="TERMINATED">
       <p class="muted" style="margin-top:4px;color:var(--danger,#e55)">هذا الحفظ منهي نهائياً ولا يمكن إعادة تفعيله إلا من قبل المطوّر.</p></div>`
    : selectHtml('الحالة', 'status', s.status, [['ACTIVE', 'نشط'], ['SUSPENDED', 'موقوف مؤقتاً'], ['TERMINATED', 'إلغاء الحفظ نهائياً']]);
  const body = `<div class="form-grid">
    ${fieldHtml('من صفحة (البداية)', 'start_page', s.start_page, 'number')}
    ${fieldHtml('إلى صفحة (النهاية)', 'end_page', s.end_page, 'number')}
    ${fieldHtml('الصفحة الحالية', 'page_current', s.page_current, 'number')}
    ${statusField}
    ${selectHtml('المشرف', 'teacher_id', s.teacher_id, tOpts)}
    ${selectHtml('الإبلاغ (الحالة/المشرف)', 'notify_target', 'both', NOTIFY_OPTS)}
  </div>
  <p class="muted" style="margin-top:6px">تعديل «الصفحة الحالية» يحذف صفوف الأيام الأحدث ويعيد بناء صف اليوم للمراجعة. «من صفحة» لا يُرسل أي إشعار. لتصفير الحفظ بالكامل استخدم زر «تعديل من الصفر».</p>
  <div class="field"><label><input type="checkbox" id="es-notify" style="width:auto;margin-left:6px">إرسال إشعار للطالب بالتعديل (مطفأ افتراضياً)</label></div>
  ${textareaHtml('سبب التعديل (اختياري)', 'status_reason', '', 'سبب التعديل أو التوقيف...')}`;
  const foot = `<button class="btn btn-primary" id="md-ok">حفظ</button><button class="btn btn-ghost" id="md-cancel">إلغاء</button>`;
  const m = UI.modal('تعديل الحفظ', body, foot);
  m.el.querySelector('#md-cancel').onclick = m.close;
  m.el.querySelector('#md-ok').onclick = async ev => {
    const f = collectFields(m.el);
    const notify_student = m.el.querySelector('#es-notify')?.checked === true;
    const notify_target = f.notify_target;
    const fields = { end_page: f.end_page, status: f.status, teacher_id: f.teacher_id, status_reason: f.status_reason || '' };
    // أرسل صفحة البداية/الحالية فقط عند تغييرها فعلياً (تجنّب إعادة بناء غير مقصودة)
    if (String(f.start_page) !== String(s.start_page ?? '')) fields.start_page = f.start_page;
    if (String(f.page_current) !== String(s.page_current ?? '')) fields.page_current = f.page_current;
    await runAction(ev.target, () => TW.call('testweb_mutate', { action: 'update_save', save_id: s.id, fields, notify_target, notify_student }),
      { okMsg: 'تم حفظ بيانات الحفظ', modal: m, after: () => pageStudentDetail(APP.current.user.user_id) });
  };
}

function openRebuildSaveModal(saveId) {
  const s = APP.current.saves.find(x => String(x.id) === String(saveId)); if (!s) return;
  const body = `<p class="muted" style="margin-bottom:12px">إعادة بناء الحفظ <b>${UI.esc(s.name || '')}</b> من الصفر: تُحذف كل صفوف الحفظ ويبدأ صف اليوم من جديد (غير مستعد)، ويُحوّل الحفظ إلى «نشط»، ويُبلَّغ الطالب بحفظ اليوم.</p>
  <div class="form-grid">
    ${fieldHtml('من صفحة (البداية)', 'start_page', s.start_page, 'number')}
    ${fieldHtml('إلى صفحة (النهاية)', 'end_page', s.end_page, 'number')}
    ${fieldHtml('عدد الصفحات يومياً', 'every_day_page', s.every_day_page, 'number')}
  </div>`;
  const foot = `<button class="btn btn-primary" id="md-ok">حفظ وإعادة البناء</button><button class="btn btn-ghost" id="md-cancel">إلغاء</button>`;
  const m = UI.modal('تعديل الحفظ من الصفر', body, foot);
  m.el.querySelector('#md-cancel').onclick = m.close;
  m.el.querySelector('#md-ok').onclick = async ev => {
    const f = collectFields(m.el);
    if (!f.start_page || !f.end_page || !f.every_day_page) { UI.toast('جميع الحقول مطلوبة', 'err'); return; }
    if (Number(f.end_page) <= Number(f.start_page)) { UI.toast('صفحة النهاية يجب أن تكون أكبر من البداية', 'err'); return; }
    if (!confirm('سيتم حذف كل صفوف هذا الحفظ نهائياً وإعادة بنائه من الصفر وإبلاغ الطالب. متابعة؟')) return;
    const fields = { start_page: f.start_page, end_page: f.end_page, every_day_page: f.every_day_page };
    await runAction(ev.target, () => TW.call('testweb_mutate', { action: 'rebuild_save', save_id: s.id, fields }),
      { okMsg: 'تمت إعادة بناء الحفظ', modal: m, after: () => pageStudentDetail(APP.current.user.user_id) });
  };
}

function openExamControlModal(saveId, type) {
  const s = APP.current.saves.find(x => String(x.id) === String(saveId)); if (!s) return;
  const isE2 = type === 'EXAM2';
  const enabled = isE2 ? s.exam2 : s.exam1;
  const curTeacher = isE2 ? s.exam2_teacher_id : s.exam1_teacher_id;
  const tOpts = [['', '— اختر مشرفاً —']].concat(teacherOptions());
  const body = `<p class="muted" style="margin-bottom:14px">${isE2 ? 'الاختبار التراكمي (كامل الحفظ)' : 'الاختبار الجزئي'} للحفظ: <b>${UI.esc(s.name)}</b></p>
    <div class="form-grid">
      ${selectHtml('الحالة', 'enable', String(enabled), [['true', 'مُفعّل'], ['false', 'مُوقَف']])}
      ${selectHtml('مشرف الاختبار', 'teacher_id', curTeacher || '', tOpts)}
    </div>`;
  const foot = `<button class="btn btn-primary" id="md-ok">حفظ</button><button class="btn btn-ghost" id="md-cancel">إلغاء</button>`;
  const m = UI.modal(isE2 ? 'التحكم بالاختبار التراكمي' : 'التحكم بالاختبار الجزئي', body, foot);
  m.el.querySelector('#md-cancel').onclick = m.close;
  m.el.querySelector('#md-ok').onclick = async ev => {
    const f = collectFields(m.el);
    await runAction(ev.target, () => TW.call('testweb_mutate', {
      action: 'exam_control', save_id: s.id, exam_type: type, enable: f.enable === 'true', teacher_id: f.teacher_id || null, notify: true,
    }), { okMsg: 'تم تحديث إعدادات الاختبار', modal: m, after: () => pageStudentDetail(APP.current.user.user_id) });
  };
}

function openGradeModal(table, rowId, isExam, isOld) {
  const oldNote = isOld
    ? `<p class="muted" style="margin-bottom:14px;color:var(--danger,#e55)">صف قديم: يُسمح فقط بتعديل الأخطاء ضمن نطاق النجاح (٠ إلى ٢)، لا يمكن جعله راسباً.</p>`
    : `<p class="muted" style="margin-bottom:14px">اختر نتيجة التقييم، وسيُرسل إشعار للطالب ومشرفه تلقائياً.</p>`;
  const body = `${oldNote}
    <div class="form-grid">${fieldHtml('السواد (0-999)', 'sowad', 0, 'number')}${fieldHtml('النسيان (0-999)', 'nisyan', 0, 'number')}${isExam ? fieldHtml('الفتح (0-999)', 'fateh', 0, 'number') : ''}</div>
    <div class="form-grid">${fieldHtml('مقدار المراجعة (اختياري)', 'takeem', '', 'text')}${selectHtml('تقييم المراجعة', 'takeem_status', '', [['', '—'], ['perfect', 'مُتقِن'], ['good', 'جيد جداً'], ['very_good', 'إمتياز'], ['reject', 'رسوب']])}</div>
    ${textareaHtml('ملاحظة (اختياري)', 'custom_info_text', '', 'ملاحظة تظهر للطالب...')}
    ${selectHtml('الإبلاغ', 'notify_target', 'both', NOTIFY_OPTS)}
    <div style="display:flex;align-items:center;gap:8px;margin-top:6px"><span class="muted">التقدير المتوقّع:</span><span id="g-pv">—</span></div>`;
  const foot = `<button class="btn btn-primary" id="md-ok">حفظ التقييم</button><button class="btn btn-ghost" id="md-cancel">إلغاء</button>`;
  const m = UI.modal(isExam ? 'تقييم اختبار' : 'تقييم حفظ اليوم', body, foot);
  m.el.querySelector('#md-cancel').onclick = m.close;
  let willReject = false;
  const calc = () => {
    const g = collectFields(m.el); const so = +g.sowad || 0, ni = +g.nisyan || 0, fa = +g.fateh || 0;
    let ps; if (isExam) { const sum = so + ni + fa * 2; ps = sum >= 6 ? 'reject' : sum >= 3 ? 'good' : sum >= 1 ? 'very_good' : 'perfect'; }
    else { const sum = so + ni; ps = sum >= 3 ? 'reject' : sum === 2 ? 'good' : sum === 1 ? 'very_good' : 'perfect'; }
    willReject = ps === 'reject';
    const lbl = { reject: 'رسوب', good: 'جيد جداً', very_good: 'إمتياز', perfect: 'مُتقِن' }[ps];
    const badge = UI.gradeBadge(ps, lbl);
    m.el.querySelector('#g-pv').innerHTML = (isOld && willReject)
      ? badge + ' <span style="color:var(--danger,#e55)">— غير مسموح لصف قديم</span>' : badge;
  };
  m.el.querySelectorAll('.f-input').forEach(i => i.addEventListener('input', calc)); calc();
  m.el.querySelector('#md-ok').onclick = async ev => {
    if (isOld && willReject) { UI.toast('لا يمكن جعل صف قديم راسباً، عدّل الأخطاء ضمن نطاق النجاح (٠ إلى ٢).', 'err'); return; }
    const g = collectFields(m.el);
    const payload = {
      action: 'grade_page', table, row_id: rowId, state: 'finished',
      sowad: +g.sowad || 0, nisyan: +g.nisyan || 0, fateh: +g.fateh || 0,
      takeem: g.takeem || '', takeem_status: g.takeem_status || '',
      custom_info_text: g.custom_info_text || '', notify_target: g.notify_target || 'both',
    };
    await runAction(ev.target, () => TW.call('testweb_mutate', payload),
      { okMsg: 'تم حفظ التقييم وإرسال الإشعار', modal: m, refreshDash: false, after: () => pageStudentDetail(APP.current.user.user_id) });
  };
}

function openQuickMessageModal(phone, name) {
  const body = `<p class="muted" style="margin-bottom:14px">إرسال رسالة واتساب إلى <b>${UI.esc(name)}</b> (<span dir="ltr">${UI.esc(phone)}</span>).</p>${textareaHtml('نص الرسالة', 'msg', '', 'اكتب رسالتك هنا...')}`;
  const foot = `<button class="btn btn-primary" id="md-ok">إرسال</button><button class="btn btn-ghost" id="md-cancel">إلغاء</button>`;
  const m = UI.modal('رسالة مباشرة', body, foot);
  m.el.querySelector('#md-cancel').onclick = m.close;
  m.el.querySelector('#md-ok').onclick = async ev => {
    const msg = collectFields(m.el).msg;
    if (!msg.trim()) { UI.toast('اكتب نص الرسالة', 'err'); return; }
    await runAction(ev.target, () => TW.call('testweb_message', { target: 'phone', phone, msg }),
      { okMsg: 'تم إرسال الرسالة', modal: m, refreshDash: false });
  };
}

/* ================= المشرفون ================= */
const tFilters = { q: '', sort: 'students' };
function pageTeachers() {
  view().innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <div class="search-box">${icon('search', 16)}<input id="t-q" placeholder="ابحث باسم المشرف أو الهاتف" value="${UI.esc(tFilters.q)}"></div>
        <select class="f-input" id="t-sort" style="width:auto">
          <option value="students">ترتيب: عدد الطلاب</option><option value="name">الاسم</option><option value="absence">الأكثر غياباً</option>
        </select>
        <a class="btn btn-primary" href="#/add-teacher">${icon('plus', 15)} إضافة مشرف</a>
      </div>
    </div>
    <div id="t-list"></div>`;
  $('#t-sort').value = tFilters.sort;
  $('#t-q').addEventListener('input', e => { tFilters.q = e.target.value; renderTeacherList(); });
  $('#t-sort').addEventListener('change', e => { tFilters.sort = e.target.value; renderTeacherList(); });
  renderTeacherList();
}
function renderTeacherList() {
  let list = [...APP.dash.teachers];
  const q = tFilters.q.trim().toLowerCase();
  if (q) list = list.filter(t => (t.full_name || '').toLowerCase().includes(q) || (t.phone || '').includes(q));
  const sorters = {
    students: (a, b) => b.students_count - a.students_count,
    name: (a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'ar'),
    absence: (a, b) => b.absence_total - a.absence_total,
  };
  list.sort(sorters[tFilters.sort] || sorters.students);
  const wrap = $('#t-list');
  if (!list.length) { wrap.innerHTML = UI.empty('لا مشرفين مطابقين', 'search'); return; }
  wrap.innerHTML = `<div class="panel"><div style="display:grid;gap:10px">${list.map(teacherRow).join('')}</div></div>`;
}
function teacherRow(t) {
  return `<div class="entity-card" onclick="location.hash='#/teachers/${UI.attr(t.teacher_id)}'">
    <div class="avatar">${icon('teacher', 20)}</div>
    <div class="entity-info">
      <div class="name">${UI.esc(t.full_name || '—')} <span style="color:var(--muted);font-weight:400">— ${UI.esc(t.gender_label)}</span></div>
      <div class="sub" dir="ltr">${UI.esc(t.phone || '—')}</div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
      ${UI.badge('blue', t.students_count + ' طالب')}
      ${t.joined ? UI.badge('green', 'منضمّ') : UI.badge('gold', 'لم ينضمّ')}
      ${t.absence_total > 0 ? UI.badge('gray', 'غياب ' + t.absence_total) : ''}
    </div>
  </div>`;
}

async function pageTeacherDetail(id) {
  view().innerHTML = `<div class="empty-state"><span class="spinner lg"></span></div>`;
  let res;
  try { res = await TW.call('testweb_teacher', { teacher_id: id }); }
  catch (e) { view().innerHTML = UI.errorBox(e.message); return; }
  const t = res.teacher;
  const avatar = t.photo_url
    ? `<div class="avatar" style="width:78px;height:78px"><img src="${UI.esc(t.photo_url)}" style="cursor:zoom-in" onclick="UI.imageViewer('${UI.attr(t.photo_url)}')"></div>`
    : `<div class="avatar" style="width:78px;height:78px">${icon('teacher', 30)}</div>`;
  const info = kvGrid([
    ['رقم الهاتف', UI.copyField(t.phone)],
    ['كلمة المرور', UI.pwField(t.password)],
    ['الجنس', UI.esc(t.gender_label)],
    ['تاريخ الميلاد', UI.esc(t.date_of_brith)],
    ['العنوان', UI.esc(t.location)],
    ['الموقع (GPS)', UI.copyField(t.gps)],
    ['عدد الغيابات', String(t.absence_total)],
    ['انضمّ في', UI.fmtDate(t.joined_in)],
    ['تاريخ الإنشاء', UI.fmtDate(t.created_at)],
    ['معرّف المشرف', UI.copyField(t.teacher_id)],
  ]);
  const stuRow = s => `<div class="entity-card" onclick="location.hash='#/students/${UI.attr(s.user_id)}'">
    <div class="avatar">${icon('students', 18)}</div>
    <div class="entity-info"><div class="name">${UI.esc(s.full_name)}</div><div class="sub">${UI.esc(s.save_name)} • ${UI.esc(s.save_status)}</div></div>
  </div>`;
  const my = res.my_students.length ? res.my_students.map(stuRow).join('') : UI.empty('لا طلاب', 'students');
  const ex = res.exam_students.length ? res.exam_students.map(s => `<div class="entity-card" onclick="location.hash='#/students/${UI.attr(s.user_id)}'">
    <div class="avatar">${icon('exam', 18)}</div>
    <div class="entity-info"><div class="name">${UI.esc(s.full_name)}</div><div class="sub">${UI.esc(s.exam_kind)} • ${UI.esc(s.save_name)}</div></div>
  </div>`).join('') : UI.empty('لا تكليفات اختبار', 'exam');

  view().innerHTML = `
    <button class="btn btn-ghost btn-sm" onclick="history.back()" style="margin-bottom:14px">→ رجوع</button>
    <div class="panel">
      <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:16px">
          ${avatar}
          <div><div style="font-size:22px;font-weight:800">${UI.esc(t.full_name || '—')}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${t.joined ? UI.badge('green', 'منضمّ') : UI.badge('gold', 'لم ينضمّ')}${UI.badge('blue', res.counts.my + ' طالب')}</div></div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-self:flex-start">
          <button class="btn btn-ghost btn-sm" onclick="openSetPasswordModal('teacher','${UI.attr(t.teacher_id)}','${UI.attr(t.full_name)}')">${icon('key', 14)} كلمة المرور</button>
          <button class="btn btn-ghost btn-sm" onclick="openSendPasswordModal('teacher','${UI.attr(t.teacher_id)}')">${icon('send', 14)} إرسال كلمة السر</button>
          <button class="btn btn-primary btn-sm" onclick="openQuickMessageModal('${UI.attr(t.phone)}','${UI.attr(t.full_name)}')">${icon('message', 14)} رسالة</button>
        </div>
      </div>
      ${info}
    </div>
    <div class="panel"><div class="panel-head"><h2>طلابه (${res.counts.my})</h2></div><div style="display:grid;gap:8px">${my}</div></div>
    <div class="panel"><div class="panel-head"><h2>تكليفات الاختبار (${res.counts.exam})</h2></div><div style="display:grid;gap:8px">${ex}</div></div>`;
}

/* ================= الرسائل ================= */
function pageMessages() {
  const card = (ic, title, desc, onclick) => `<div class="entity-card" style="align-items:flex-start" onclick="${onclick}">
    <div class="avatar">${icon(ic, 20)}</div>
    <div class="entity-info"><div class="name">${UI.esc(title)}</div><div class="sub">${UI.esc(desc)}</div></div>
  </div>`;
  view().innerHTML = `<div class="cards-grid" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">
    ${card('message', 'رسالة لكل الطلاب', 'إرسال رسالة واتساب لجميع الطلاب المسجّلين.', "openBroadcastModal('all_students')")}
    ${card('message', 'رسالة لكل المشرفين', 'إرسال رسالة واتساب لجميع المشرفين.', "openBroadcastModal('all_teachers')")}
    ${card('students', 'تحديد طلاب', 'اختيار عدد من الطلاب وإرسال رسالة لهم.', "openPickModal('students')")}
    ${card('teacher', 'تحديد مشرفين', 'اختيار عدد من المشرفين وإرسال رسالة لهم.', "openPickModal('teachers')")}
    ${card('phone', 'رسالة لرقم هاتف', 'إرسال لرقم ٠٧٧... (يُحوَّل تلقائياً إلى صيغة واتساب).', 'openPhoneMsgModal()')}
  </div>`;
}
function msgComposerHtml() { return textareaHtml('نص الرسالة', 'msg', '', 'اكتب رسالتك هنا...'); }

function openBroadcastModal(target) {
  const count = target === 'all_students' ? APP.dash.stats.students_total : APP.dash.stats.teachers_total;
  const who = target === 'all_students' ? 'جميع الطلاب' : 'جميع المشرفين';
  const fatherChk = target === 'all_students' ? `<div class="field"><label><input type="checkbox" id="bc-father" style="width:auto;margin-left:6px">إرسال أيضاً لأولياء الأمور</label></div>` : '';
  const body = `<p class="muted" style="margin-bottom:14px">سترسل إلى <b>${who}</b> (${count} مستلم).</p>${msgComposerHtml()}${fatherChk}`;
  const foot = `<button class="btn btn-primary" id="md-ok">إرسال للجميع</button><button class="btn btn-ghost" id="md-cancel">إلغاء</button>`;
  const m = UI.modal('رسالة جماعية', body, foot);
  m.el.querySelector('#md-cancel').onclick = m.close;
  m.el.querySelector('#md-ok').onclick = ev => {
    const msg = collectFields(m.el).msg;
    if (!msg.trim()) { UI.toast('اكتب نص الرسالة', 'err'); return; }
    const alsoFather = m.el.querySelector('#bc-father')?.checked === true;
    sendBulkMsg(ev.target, { target, msg, also_father: alsoFather }, m);
  };
}
function openPhoneMsgModal() {
  const body = `${fieldHtml('رقم الهاتف', 'phone', '', 'tel')}${msgComposerHtml()}`;
  const foot = `<button class="btn btn-primary" id="md-ok">إرسال</button><button class="btn btn-ghost" id="md-cancel">إلغاء</button>`;
  const m = UI.modal('رسالة إلى رقم', body, foot);
  m.el.querySelector('#md-cancel').onclick = m.close;
  m.el.querySelector('#md-ok').onclick = ev => {
    const f = collectFields(m.el);
    if (!f.phone || !f.msg.trim()) { UI.toast('أدخل الهاتف ونص الرسالة', 'err'); return; }
    sendBulkMsg(ev.target, { target: 'phone', phone: f.phone, msg: f.msg }, m);
  };
}
function openPickModal(kind) {
  const items = kind === 'students'
    ? APP.dash.students.map(s => ({ id: s.user_id, nm: s.full_name, mt: s.phone }))
    : APP.dash.teachers.map(t => ({ id: t.teacher_id, nm: t.full_name, mt: t.phone }));
  const list = items.map(i => `<label style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid var(--border)">
    <input type="checkbox" class="pick-chk" value="${UI.attr(i.id)}" style="width:auto">
    <span><b>${UI.esc(i.nm)}</b><br><span class="muted" dir="ltr" style="font-size:12px">${UI.esc(i.mt)}</span></span>
  </label>`).join('');
  const body = `<div class="search-box" style="margin-bottom:10px;width:100%">${icon('search', 16)}<input id="pick-q" placeholder="بحث..."></div>
    <div style="display:flex;justify-content:space-between;margin-bottom:8px">
      <button class="btn btn-ghost btn-sm" id="pick-all">تحديد الكل</button>
      <span class="muted" id="pick-n">0 محدد</span>
      <button class="btn btn-ghost btn-sm" id="pick-none">إلغاء التحديد</button>
    </div>
    <div id="pick-list" style="max-height:240px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius-sm)">${list}</div>
    <div style="margin-top:14px">${msgComposerHtml()}</div>`;
  const foot = `<button class="btn btn-primary" id="md-ok">إرسال للمحدّدين</button><button class="btn btn-ghost" id="md-cancel">إلغاء</button>`;
  const m = UI.modal(kind === 'students' ? 'تحديد طلاب' : 'تحديد مشرفين', body, foot);
  m.el.querySelector('#md-cancel').onclick = m.close;
  const upd = () => { m.el.querySelector('#pick-n').textContent = m.el.querySelectorAll('.pick-chk:checked').length + ' محدد'; };
  m.el.querySelectorAll('.pick-chk').forEach(c => c.addEventListener('change', upd));
  m.el.querySelector('#pick-all').onclick = () => { m.el.querySelectorAll('.pick-chk').forEach(c => { if (c.closest('label').style.display !== 'none') c.checked = true; }); upd(); };
  m.el.querySelector('#pick-none').onclick = () => { m.el.querySelectorAll('.pick-chk').forEach(c => c.checked = false); upd(); };
  m.el.querySelector('#pick-q').addEventListener('input', e => {
    const q = e.target.value.toLowerCase();
    m.el.querySelectorAll('#pick-list label').forEach(l => { l.style.display = l.textContent.toLowerCase().includes(q) ? '' : 'none'; });
  });
  m.el.querySelector('#md-ok').onclick = ev => {
    const ids = [...m.el.querySelectorAll('.pick-chk:checked')].map(c => c.value);
    if (!ids.length) { UI.toast('لم تحدّد أحداً', 'err'); return; }
    const msg = collectFields(m.el).msg;
    if (!msg.trim()) { UI.toast('اكتب نص الرسالة', 'err'); return; }
    sendBulkMsg(ev.target, { target: kind, ids, msg }, m);
  };
}
async function sendBulkMsg(btn, payload, modal) {
  await runAction(btn, () => TW.call('testweb_message', payload), {
    modal, refreshDash: false,
    after: r => UI.toast(`تم الإرسال: ${r.sent} ناجحة${r.failed ? ` • ${r.failed} فاشلة` : ''} من ${r.total}`, r.failed ? 'info' : 'ok', 4500),
  });
}

/* ================= رموز الدخول (OTP) ================= */
let otpTimer = null;
function pageOtps() {
  if (otpTimer) { clearInterval(otpTimer); otpTimer = null; }
  view().innerHTML = `<div class="panel">
    <div class="panel-head"><h2>آخر رموز الدخول المُرسَلة</h2></div>
    <p class="muted" style="margin-bottom:14px">لعرض الرموز يجب إدخال كلمة مرور حسابك للتأكيد.</p>
    <div style="max-width:360px">
      ${fieldHtml('كلمة مرور حسابك', 'otp-pw', '', 'password')}
      <p id="otp-err" class="err-text hidden"></p>
      <button class="btn btn-primary btn-block" id="otp-show" style="margin-top:6px">${icon('key', 15)} عرض الرموز</button>
    </div>
  </div>`;
  const pwEl = $('#view [data-k="otp-pw"]');
  const errEl = $('#otp-err');
  const submit = async ev => {
    const pw = pwEl.value;
    errEl.classList.add('hidden');
    if (!pw) { errEl.textContent = 'أدخل كلمة المرور'; errEl.classList.remove('hidden'); return; }
    const btn = ev.target.closest('button'); const orig = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      const res = await TW.call('testweb_otps', { limit: 40, admin_password: pw });
      renderOtpsPage(res.otps);
    } catch (e) {
      errEl.textContent = e.message; errEl.classList.remove('hidden');
      btn.disabled = false; btn.innerHTML = orig;
    }
  };
  $('#otp-show').onclick = submit;
  pwEl.addEventListener('keydown', e => { if (e.key === 'Enter') submit(e); });
}
function renderOtpsPage(otps) {
  if (otpTimer) { clearInterval(otpTimer); otpTimer = null; }
  view().innerHTML = `<div class="panel">
    <div class="panel-head"><h2>آخر رموز الدخول المُرسَلة</h2><button class="btn btn-ghost btn-sm" onclick="pageOtps()">${icon('refresh', 14)} تحديث</button></div>
    <p class="muted" style="margin-bottom:14px">يُفكّ تشفير الرمز الأصلي تلقائياً. صلاحية كل رمز دقيقتان من وقت الإرسال.</p>
    <div id="otp-wrap"></div>
  </div>`;
  renderOtps(otps);
  otpTimer = setInterval(() => {
    document.querySelectorAll('[data-exp]').forEach(el => {
      let s = +el.getAttribute('data-exp'); s = Math.max(0, s - 1); el.setAttribute('data-exp', s);
      el.innerHTML = s > 0 ? UI.badge('green', fmtCountdown(s)) : UI.badge('red', 'منتهٍ');
    });
  }, 1000);
}
function fmtCountdown(s) { const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}`; }
function renderOtps(otps) {
  const wrap = $('#otp-wrap'); if (!wrap) return;
  if (!otps.length) { wrap.innerHTML = UI.empty('لا رموز حديثة', 'key'); return; }
  const rows = otps.map(o => {
    const code = o.code ? `<span class="copy-row"><b style="letter-spacing:2px">${UI.esc(o.code)}</b><button class="icon-btn" style="width:26px;height:26px" onclick="UI.copy('${UI.attr(o.code)}')">${icon('copy', 13)}</button></span>` : '<span class="muted">تعذّر فكّه</span>';
    const status = o.verified ? UI.badge('green', 'تم التحقق') : o.logined ? UI.badge('green', 'سجّل الدخول') : o.expired ? UI.badge('red', 'منتهٍ') : UI.badge('gold', 'بانتظار');
    const exp = o.expired ? UI.badge('red', 'منتهٍ') : `<span data-exp="${o.expires_in_sec}">${UI.badge('green', fmtCountdown(o.expires_in_sec))}</span>`;
    return `<tr>
      <td>${code}</td><td><b>${UI.esc(o.student_name)}</b></td><td>${UI.copyField(o.phone)}</td>
      <td>${status}</td><td>${exp}</td><td class="muted">${UI.fmtDate(o.otp_date)}</td><td class="muted">محاولات: ${o.allow_trying}</td>
    </tr>`;
  }).join('');
  wrap.innerHTML = `<div class="tbl-wrap"><table>
    <thead><tr><th>الرمز</th><th>الطالب</th><th>الهاتف</th><th>الحالة</th><th>ينتهي خلال</th><th>منذ</th><th>المحاولات</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

/* ================= الإجازات ================= */
async function pageHolidays() {
  view().innerHTML = `<div class="panel">
    <div class="panel-head"><h2>الإجازات</h2><button class="btn btn-primary btn-sm" onclick="openAddHolidayModal()">${icon('plus', 14)} إضافة إجازة</button></div>
    <div id="hol-wrap"><span class="spinner"></span></div>
  </div>`;
  let res;
  try { res = await TW.call('testweb_holidays', { action: 'list' }); }
  catch (e) { $('#hol-wrap').innerHTML = UI.errorBox(e.message); return; }
  const wrap = $('#hol-wrap');
  if (!res.holidays.length) { wrap.innerHTML = UI.empty('لا إجازات مسجّلة', 'holiday'); return; }
  const typeLabel = { ALL: 'الجميع', FOR_USER: 'طالب', FOR_TEACHER: 'مشرف' };
  const rows = res.holidays.map(h => `<tr>
    <td><b>${UI.esc(h.target_name)}</b></td>
    <td>${UI.badge('blue', typeLabel[h.type] || h.type)}</td>
    <td>${UI.esc(h.for_date)}</td>
    <td>${h.processed ? UI.badge('green', 'مُنفّذة') : UI.badge('gold', 'قادمة')}</td>
    <td class="muted">${UI.fmtDateShort(h.created_at)}</td>
    <td>${!h.processed ? `<button class="icon-btn" onclick="deleteHoliday('${h.id}')">${icon('trash', 14)}</button>` : ''}</td>
  </tr>`).join('');
  wrap.innerHTML = `<div class="tbl-wrap"><table>
    <thead><tr><th>الهدف</th><th>النوع</th><th>التاريخ</th><th>الحالة</th><th>أُضيفت</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}
async function deleteHoliday(id) {
  if (!await UI.confirm('حذف إجازة', 'هل تريد حذف هذه الإجازة؟', 'حذف')) return;
  try { await TW.call('testweb_holidays', { action: 'delete', id }); UI.toast('تم حذف الإجازة', 'ok'); pageHolidays(); }
  catch (e) { UI.toast(e.message, 'err'); }
}
function openAddHolidayModal() {
  const body = `<div class="form-grid">
    ${selectHtml('النوع', 'type', 'ALL', [['ALL', 'الجميع'], ['FOR_USER', 'طالب محدّد'], ['FOR_TEACHER', 'مشرف محدّد']])}
    ${fieldHtml('التاريخ', 'for_date', baghdadDateStr(), 'date')}
  </div>
  <div id="hol-target" style="margin-top:10px"></div>`;
  const foot = `<button class="btn btn-primary" id="md-ok">إضافة</button><button class="btn btn-ghost" id="md-cancel">إلغاء</button>`;
  const m = UI.modal('إضافة إجازة', body, foot);
  m.el.querySelector('#md-cancel').onclick = m.close;
  const typeSel = m.el.querySelector('[data-k="type"]');
  const renderTarget = () => {
    const t = typeSel.value;
    const tgt = m.el.querySelector('#hol-target');
    if (t === 'FOR_USER') tgt.innerHTML = selectHtml('الطالب', 'for_user_id', '', APP.dash.students.map(s => [s.user_id, s.full_name]));
    else if (t === 'FOR_TEACHER') tgt.innerHTML = selectHtml('المشرف', 'for_teacher_id', '', teacherOptions());
    else tgt.innerHTML = '';
  };
  typeSel.addEventListener('change', renderTarget); renderTarget();
  m.el.querySelector('#md-ok').onclick = async ev => {
    const f = collectFields(m.el);
    await runAction(ev.target, () => TW.call('testweb_holidays', {
      action: 'add', type: f.type, for_date: f.for_date, for_user_id: f.for_user_id || null, for_teacher_id: f.for_teacher_id || null,
    }), { okMsg: 'تم إضافة الإجازة', modal: m, refreshDash: false, after: () => pageHolidays() });
  };
}
function baghdadDateStr(offsetDays = 0) {
  const now = new Date(Date.now() + 3 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return now.toISOString().slice(0, 10);
}

/* ================= سجل العمليات ================= */
async function pageLogs() {
  view().innerHTML = `<div class="panel"><div class="panel-head"><h2>سجل العمليات الإدارية</h2></div><div id="logs-wrap"><span class="spinner"></span></div></div>`;
  let res;
  try { res = await TW.call('testweb_logs', { limit: 300 }); }
  catch (e) { $('#logs-wrap').innerHTML = UI.errorBox(e.message); return; }
  const wrap = $('#logs-wrap');
  if (!res.logs.length) { wrap.innerHTML = UI.empty('لا سجلّات', 'logs'); return; }
  const rows = res.logs.map((l, i) => {
    const msg = String(l.message || '');
    let msgCell;
    if (msg.length > 100) {
      const id = 'log' + i;
      msgCell = `<span id="${id}-s">${UI.esc(msg.slice(0, 100))}… <button class="btn btn-ghost btn-sm" onclick="toggleLogMsg('${id}')">عرض التفاصيل</button></span>
        <span id="${id}-f" class="hidden">${UI.esc(msg)} <button class="btn btn-ghost btn-sm" onclick="toggleLogMsg('${id}')">إخفاء</button></span>`;
    } else {
      msgCell = UI.esc(msg);
    }
    return `<tr>
    <td class="muted" style="white-space:nowrap">${UI.fmtDate(l.created_at)}</td>
    <td>${UI.badge(l.actor_role === 'مشرف' ? 'teal' : l.actor_role === 'مسؤول إداري' ? 'purple' : 'blue', l.actor_role)}</td>
    <td><b>${UI.esc(l.actor_name)}</b></td>
    <td style="white-space:normal">${msgCell}</td>
  </tr>`;
  }).join('');
  wrap.innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>الوقت</th><th>الصلاحية</th><th>المنفّذ</th><th>الإجراء</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function toggleLogMsg(id) {
  const s = document.getElementById(id + '-s'); const f = document.getElementById(id + '-f');
  if (!s || !f) return;
  s.classList.toggle('hidden'); f.classList.toggle('hidden');
}

/* ================= الإداريون (مالك فقط) ================= */
let adminsHasOwner = false; // يوجد مسؤول إداري (owner) واحد فقط في النظام
async function pageAdmins() {
  view().innerHTML = `<div class="panel">
    <div class="panel-head"><h2>الحسابات الإدارية</h2><button class="btn btn-primary btn-sm" onclick="openAdminFormModal()">${icon('plus', 14)} إضافة حساب</button></div>
    <div id="admins-wrap"><span class="spinner"></span></div>
  </div>`;
  let res;
  try { res = await TW.call('testweb_admins', { action: 'list' }); }
  catch (e) { $('#admins-wrap').innerHTML = UI.errorBox(e.message); return; }
  adminsHasOwner = res.admins.some(a => a.type === 'owner');
  const wrap = $('#admins-wrap');
  const rows = res.admins.map(a => `<tr>
    <td><b>${UI.esc(a.name)}</b>${a.is_self ? ' <span class="muted">(أنتَ)</span>' : ''}</td>
    <td dir="ltr">${UI.esc(a.phone)}</td>
    <td>${UI.badge(a.type === 'owner' ? 'purple' : 'blue', a.type === 'owner' ? 'مسؤول إداري' : 'إداري')}</td>
    <td>${UI.esc(a.gender === 'female' ? 'أنثى' : 'ذكر')}</td>
    <td>${a.active ? UI.badge('green', 'مُفعّل') : UI.badge('red', 'مُعطّل')}</td>
    <td class="muted">${UI.fmtDate(a.last_opened_in)}</td>
    <td>${a.is_self ? '' : `
      <button class="icon-btn" title="تعديل" onclick='openAdminFormModal(${JSON.stringify(a).replace(/'/g, "&#39;")})'>${icon('edit', 14)}</button>
      ${a.type === 'owner' ? '' : `<button class="icon-btn" title="${a.active ? 'إلغاء التفعيل' : 'إعادة التفعيل'}" onclick="toggleAdmin('${a.id}')">${icon(a.active ? 'ban' : 'check', 14)}</button>`}
      <button class="icon-btn" title="إرسال كلمة السر" onclick="openSendPasswordModal('admin','${UI.attr(a.id)}')">${icon('send', 14)}</button>
    `}</td>
  </tr>`).join('');
  wrap.innerHTML = `<div class="tbl-wrap"><table>
    <thead><tr><th>الاسم</th><th>الهاتف</th><th>الصلاحية</th><th>الجنس</th><th>الحالة</th><th>آخر دخول</th><th></th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}
async function toggleAdmin(id) {
  if (!await UI.confirm('تأكيد', 'هل تريد تغيير حالة تفعيل هذا الحساب؟', 'تأكيد')) return;
  try { await TW.call('testweb_admins', { action: 'toggle_active', id }); UI.toast('تم تحديث الحالة', 'ok'); pageAdmins(); }
  catch (e) { UI.toast(e.message, 'err'); }
}
function openAdminFormModal(admin) {
  const isEdit = !!admin;
  const body = `<div class="form-grid">
    ${fieldHtml('الاسم الكامل', 'name', admin?.name)}
    ${fieldHtml('رقم الهاتف', 'phone', admin?.phone)}
    ${isEdit ? '' : fieldHtml('البريد الإلكتروني', 'email', '', 'email')}
    ${selectHtml('الجنس', 'gender', admin?.gender || 'male', [['male', 'ذكر'], ['female', 'أنثى']])}
    ${(admin?.type === 'owner')
      ? `<div class="field"><label>الصلاحية</label><input class="f-input" value="مسؤول إداري" disabled><input class="f-input" data-k="type" type="hidden" value="owner"></div>`
      : selectHtml('الصلاحية', 'type', admin?.type || 'admin',
          adminsHasOwner ? [['admin', 'إداري']] : [['admin', 'إداري'], ['owner', 'مسؤول إداري']])}
    ${fieldHtml(isEdit ? 'كلمة مرور جديدة (اختياري)' : 'كلمة المرور', 'password', '', 'password')}
  </div>`;
  const foot = `<button class="btn btn-primary" id="md-ok">${isEdit ? 'حفظ التعديلات' : 'إضافة'}</button><button class="btn btn-ghost" id="md-cancel">إلغاء</button>`;
  const m = UI.modal(isEdit ? 'تعديل حساب إداري' : 'إضافة حساب إداري', body, foot);
  m.el.querySelector('#md-cancel').onclick = m.close;
  m.el.querySelector('#md-ok').onclick = async ev => {
    const f = collectFields(m.el);
    if (isEdit) {
      await runAction(ev.target, () => TW.call('testweb_admins', { action: 'edit', id: admin.id, fields: f }),
        { okMsg: 'تم حفظ التعديلات', modal: m, refreshDash: false, after: () => pageAdmins() });
    } else {
      if (!f.name || !f.phone || !f.email || !f.password) { UI.toast('جميع الحقول مطلوبة', 'err'); return; }
      await runAction(ev.target, () => TW.call('testweb_admins', { action: 'add', fields: f }),
        { okMsg: 'تمت إضافة الحساب', modal: m, refreshDash: false, after: () => pageAdmins() });
    }
  };
}

/* ================= سجل الطلاب لليوم ================= */
function recordsTable(rows) {
  if (!rows.length) return UI.empty('لا سجلّات', 'records');
  const body = rows.map(r => `<tr>
    <td class="muted">${UI.fmtDateShort(r.date)}</td>
    <td><b>${UI.esc(r.student_name)}</b></td>
    <td>${UI.esc(r.teacher_name)}</td>
    <td>${UI.esc(r.save_name)}</td>
    <td>${UI.esc(r.page_label)}</td>
    <td>${UI.gradeBadge(r.grade_kind, r.status_label)}</td>
    <td class="muted">${UI.esc(r.sowad)}</td><td class="muted">${UI.esc(r.nisyan)}</td><td class="muted">${UI.esc(r.fateh)}</td>
    <td class="muted">${r.takeem ?? '—'}</td>
    <td>${r.review_kind ? UI.gradeBadge(r.review_kind, r.review_label) : '—'}</td>
  </tr>`).join('');
  return `<div class="tbl-wrap"><table>
    <thead><tr><th>التاريخ</th><th>الطالب</th><th>المشرف</th><th>الحفظ</th><th>الصفحة/النوع</th><th>الحالة</th><th>سواد</th><th>نسيان</th><th>فتح</th><th>مقدار المراجعة</th><th>تقييم المراجعة</th></tr></thead>
    <tbody>${body}</tbody></table></div>`;
}

async function pageTodayLog() {
  const today = baghdadDateStr();
  view().innerHTML = `<div class="panel">
    <div class="panel-head"><h2>سجل الطلاب لليوم</h2>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
        <input type="date" class="f-input" id="tl-date" value="${UI.attr(today)}" style="width:auto">
        <div id="tl-actions"></div>
      </div>
    </div>
    <div id="tl-wrap"><span class="spinner"></span></div>
  </div>`;
  const load = async (date) => {
    $('#tl-wrap').innerHTML = `<span class="spinner"></span>`;
    let res;
    try { res = await TW.call('testweb_records', { action: 'today', date }); }
    catch (e) { $('#tl-wrap').innerHTML = UI.errorBox(e.message); return; }
    $('#tl-actions').innerHTML = `<button class="btn btn-primary btn-sm" id="tl-export">${icon('download', 14)} تصدير Excel</button>`;
    $('#tl-export').onclick = () => exportRowsToExcel(res.rows, `سجل الطلاب ليوم ${res.date}`, `سجل-اليوم-${res.date}.xlsx`);
    $('#tl-wrap').innerHTML = `<p class="muted" style="margin-bottom:10px">التاريخ: ${UI.esc(res.date)} — عدد الصفوف: ${res.count}</p>${recordsTable(res.rows)}`;
  };
  $('#tl-date').addEventListener('change', e => load(e.target.value));
  load(today);
}

/* ================= سجل الطلاب (كامل) ================= */
async function pageFullLog() {
  view().innerHTML = `<div class="panel">
    <div class="panel-head"><h2>سجل الطلاب</h2><button class="btn btn-primary btn-sm" id="fl-export-all">${icon('download', 14)} تصدير الكل (Excel)</button></div>
    <div class="search-box" style="margin-bottom:14px;width:100%">${icon('search', 16)}<input id="fl-q" placeholder="ابحث باسم الطالب"></div>
    <div id="fl-list"><span class="spinner"></span></div>
  </div>`;
  $('#fl-export-all').onclick = () => exportAllStudents();
  let res;
  try { res = await TW.call('testweb_records', { action: 'all_students' }); }
  catch (e) { $('#fl-list').innerHTML = UI.errorBox(e.message); return; }
  const render = q => {
    const list = q ? res.students.filter(s => (s.full_name || '').toLowerCase().includes(q.toLowerCase())) : res.students;
    $('#fl-list').innerHTML = list.length
      ? `<div style="display:grid;gap:8px">${list.map(s => `<div class="entity-card" onclick="location.hash='#/full-log/${UI.attr(s.user_id)}'">
          <div class="avatar">${icon('students', 18)}</div>
          <div class="entity-info"><div class="name">${UI.esc(s.full_name)}</div><div class="sub">${s.gender === 'female' ? 'أنثى' : 'ذكر'}</div></div>
        </div>`).join('')}</div>`
      : UI.empty('لا نتائج', 'search');
  };
  render(''); $('#fl-q').addEventListener('input', e => render(e.target.value));
}
async function pageFullLogStudent(userId) {
  view().innerHTML = `<button class="btn btn-ghost btn-sm" onclick="history.back()" style="margin-bottom:14px">→ رجوع</button>
    <div class="panel"><div class="panel-head"><h2 id="fls-title">سجل الطالب</h2><div id="fls-actions"></div></div><div id="fls-wrap"><span class="spinner"></span></div></div>`;
  let res;
  try { res = await TW.call('testweb_records', { action: 'student_full', user_id: userId }); }
  catch (e) { $('#fls-wrap').innerHTML = UI.errorBox(e.message); return; }
  $('#fls-title').textContent = `سجل الطالب: ${res.student_name}`;
  $('#fls-actions').innerHTML = `<button class="btn btn-primary btn-sm" id="fls-export">${icon('download', 14)} تصدير Excel</button>`;
  $('#fls-export').onclick = () => exportRowsToExcel(res.rows, `سجل الطالب ${res.student_name}`, `سجل-${res.student_name}.xlsx`);
  $('#fls-wrap').innerHTML = recordsTable(res.rows);
}

function exportRowsToExcel(rows, title, fileName) {
  if (!window.XLSX) { UI.toast('مكتبة التصدير غير متوفرة', 'err'); return; }
  const headers = ['التاريخ', 'الطالب', 'المشرف', 'الحفظ', 'الصفحة/النوع', 'الحالة', 'سواد', 'نسيان', 'فتح', 'مقدار المراجعة', 'تقييم المراجعة'];
  const aoa = [[title], [`عدد الصفوف: ${rows.length} — ${new Date().toLocaleString('ar-EG')}`], [], headers];
  rows.forEach(r => aoa.push([UI.fmtDateShort(r.date), r.student_name, r.teacher_name, r.save_name, r.page_label, r.status_label, r.sowad, r.nisyan, r.fateh, r.takeem ?? '', r.review_label ?? '']));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'البيانات');
  XLSX.writeFile(wb, fileName);
}
async function exportAllStudents() {
  if (!window.XLSX) { UI.toast('مكتبة التصدير غير متوفرة', 'err'); return; }
  try {
    UI.toast('جارٍ تجهيز الملف...', 'info', 2000);
    const res = await TW.call('testweb_records', { action: 'full_all' });
    const wb = XLSX.utils.book_new();
    const used = new Set();
    res.students.forEach(st => {
      let name = (st.student_name || 'طالب').replace(/[\\/?*\[\]:]/g, '').slice(0, 28) || 'طالب';
      const base = name; let i = 1; while (used.has(name)) name = `${base}_${i++}`; used.add(name);
      const aoa = [[st.student_name], [], ['التاريخ', 'المشرف', 'الحفظ', 'الصفحة/النوع', 'الحالة', 'سواد', 'نسيان', 'فتح', 'مقدار المراجعة', 'تقييم المراجعة']];
      st.rows.forEach(r => aoa.push([UI.fmtDateShort(r.date), r.teacher_name, r.save_name, r.page_label, r.status_label, r.sowad, r.nisyan, r.fateh, r.takeem ?? '', r.review_label ?? '']));
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      XLSX.utils.book_append_sheet(wb, ws, name);
    });
    XLSX.writeFile(wb, `سجل-جميع-الطلاب-${baghdadDateStr()}.xlsx`);
  } catch (e) { UI.toast(e.message, 'err'); }
}

/* ================= إضافة طالب / مشرف ================= */
function pageAddStudent() {
  view().innerHTML = `<div class="panel" style="max-width:560px">
    <div class="panel-head"><h2>إضافة طالب جديد</h2></div>
    <p class="muted" style="margin-bottom:12px">أضف البيانات الأساسية فقط — الحفظ يُضاف لاحقاً من ملف الطالب. بعد كل إضافة تُفرَّغ الحقول لإضافة طالب آخر مباشرةً.</p>
    <div class="form-grid">
      ${fieldHtml('الاسم الكامل', 'full_name', '')}
      ${fieldHtml('رقم الهاتف', 'phone', '', 'tel')}
      ${selectHtml('الجنس', 'gender', 'male', [['male', 'ذكر'], ['female', 'أنثى']])}
    </div>
    <button class="btn btn-primary btn-block" id="as-submit" style="margin-top:18px">إضافة الطالب</button>
    <div id="as-added" style="margin-top:18px"></div>
  </div>`;
  $('#as-submit').onclick = async ev => {
    const root = ev.target.closest('.panel');
    const f = collectFields(root);
    if (!f.full_name || !f.phone) { UI.toast('الاسم ورقم الهاتف مطلوبان', 'err'); return; }
    const addedName = f.full_name;
    await runAction(ev.target, () => TW.call('testweb_mutate', { action: 'add_student', fields: { full_name: f.full_name, phone: f.phone, gender: f.gender } }), {
      okMsg: 'تمت إضافة الطالب', refreshDash: true,
      after: r => {
        // بطاقة للطالب المُضاف مع كلمة المرور + رابط ملفه
        const wrap = $('#as-added');
        if (wrap) {
          const card = document.createElement('div');
          card.className = 'panel';
          card.style.cssText = 'margin-bottom:10px;padding:12px';
          card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
              <b>${UI.esc(addedName)}</b>
              <a class="btn btn-ghost btn-sm" href="#/students/${r.user_id}">عرض ملف الطالب</a>
            </div>
            <p class="muted" style="margin:8px 0 4px">كلمة المرور:</p>${UI.pwField(r.password)}`;
          wrap.insertBefore(card, wrap.firstChild);
        }
        // تفريغ الحقول والتركيز على الاسم لإضافة التالي
        const nameEl = root.querySelector('[data-k="full_name"]');
        const phoneEl = root.querySelector('[data-k="phone"]');
        if (nameEl) nameEl.value = '';
        if (phoneEl) phoneEl.value = '';
        if (nameEl) nameEl.focus();
      },
    });
  };
}
function pageAddTeacher() {
  view().innerHTML = `<div class="panel" style="max-width:560px">
    <div class="panel-head"><h2>إضافة مشرف جديد</h2></div>
    <div class="form-grid">
      ${fieldHtml('الاسم الكامل', 'full_name', '')}
      ${fieldHtml('رقم الهاتف', 'phone', '', 'tel')}
      ${selectHtml('الجنس', 'gender', 'male', [['male', 'ذكر'], ['female', 'أنثى']])}
    </div>
    <button class="btn btn-primary btn-block" id="at-submit" style="margin-top:18px">إضافة المشرف</button>
  </div>`;
  $('#at-submit').onclick = async ev => {
    const root = ev.target.closest('.panel');
    const f = collectFields(root);
    if (!f.full_name || !f.phone) { UI.toast('الاسم والهاتف مطلوبان', 'err'); return; }
    await runAction(ev.target, () => TW.call('testweb_mutate', { action: 'add_teacher', fields: f }), {
      okMsg: 'تمت إضافة المشرف', refreshDash: true,
      after: r => {
        const m = UI.modal('تمت الإضافة بنجاح', `<p class="muted" style="margin-bottom:10px">كلمة مرور المشرف الجديد:</p>${UI.pwField(r.password)}`,
          `<button class="btn btn-primary" id="md-go">عرض ملف المشرف</button>`);
        m.el.querySelector('#md-go').onclick = () => { m.close(); location.hash = `#/teachers/${r.teacher_id}`; };
      },
    });
  };
}

window.addEventListener('DOMContentLoaded', () => { wireLogin(); boot(); });
