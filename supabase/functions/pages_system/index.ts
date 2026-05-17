import { createClient } from "npm:@supabase/supabase-js@2.49.8";

// ════════════════════════════════════════════════════════════════════
//  ثوابت النصوص الثابتة
// ════════════════════════════════════════════════════════════════════
const T = {
  HEADER : "📖 *مشروع التحفيظ الدائم*\n",
  FOOTER : "_مع أطيب تحيات مركز الشيخ الدكتور *عمر الصميدعي* رحمه الله_",
  SEP    : "\n─────────────────\n",
  BAYT   : "\n🎉✨🌟 *وَتَمَّ ذَا الحِفْظُ بِحَمْدِ اللَّهِ ... عَلَى تَمَامِهِ بِلَا تَنَاهِي* 🌟✨🎉\n",
  ADMIN  : "07705440095",
  COPIES : ["  — الأساتذة الكِرام أعضاء إدارة المركز.", "  — الشيخ الدكتور ثامر الصميدعي."],
};

// ════════════════════════════════════════════════════════════════════
//  قاموس التأنيث / التذكير الشامل والدقيق لغوياً
// ════════════════════════════════════════════════════════════════════
const G = {
  student   : (f: boolean) => f ? "الطالبة" : "الطالب",
  guardian  : (f: boolean) => f ? "ولي أمر الطالبة" : "ولي أمر الطالب",
  teacherLbl: (f: boolean) => f ? "المشرفة" : "المشرف",

  his       : (f: boolean) => f ? "حفظها" : "حفظه",
  hisSelf   : (f: boolean) => f ? "حفظكِ" : "حفظكَ",
  him       : (f: boolean) => f ? "لها" : "له",
  toHim     : (f: boolean) => f ? "لكِ" : "لكَ",
  inHim     : (f: boolean) => f ? "فيكِ" : "فيكَ",
  makeHim   : (f: boolean) => f ? "وجعلكِ" : "وجعلكَ",
  withHim   : (f: boolean) => f ? "معها" : "معه",
  hasExam   : (f: boolean) => f ? "لديها" : "لديه",
  testHim   : (f: boolean) => f ? "واختبارها" : "واختباره",
  testHimHer: (f: boolean) => f ? "اختبارها" : "اختباره",
  forHer    : (f: boolean) => f ? "أمرها" : "أمره",
  himGuard  : (f: boolean) => f ? "منها" : "منه",
  readySt   : (f: boolean) => f ? "مستعدة" : "مستعد",
  willTest  : (f: boolean) => f ? "ستُختبرين" : "ستُختبر",
  willTest3 : (f: boolean) => f ? "ستُختبر" : "سيُختبر",
  passedV   : (f: boolean) => f ? "اجتازت" : "اجتاز",
  resumedV  : (f: boolean) => f ? "استأنفت" : "استأنف",
  passedExam: (f: boolean) => f ? "أجزتِ" : "أجزتَ",
  finished  : (f: boolean) => f ? "أتمت" : "أتم",
  absent    : (f: boolean) => f ? "غائبةٌ" : "غائبٌ",
  onHoliday : (f: boolean) => f ? "مجازةٌ" : "مجازٌ",
  teacherHol: (f: boolean) => f ? "المشرفةُ مجازةٌ" : "المشرفُ مجازٌ",
  perfect   : (f: boolean) => f ? "مُتقنةٌ" : "مُتقنٌ",
  good      : () => "إمتياز",
  notEval   : () => "لم يتم التقييم",

  iElmak    : (tF: boolean) => tF ? "إعلامكِ" : "إعلامكَ",
  bless     : (tF: boolean) => tF ? "جزاكِ الله خيرًا" : "جزاكَ الله خيرًا",
  supAdj    : (tF: boolean) => tF ? "الخاصة" : "الخاص",
  supPrn    : (sF: boolean) => sF ? "بها" : "به",
  assigned  : (tF: boolean) => tF ? "تم تكليفكِ" : "تم تكليفكَ",
  byTeacher : (tF: boolean) => tF ? "قِبَلكِ" : "قِبَلكَ",
  callWithYou: (tF: boolean) => tF ? "معكِ" : "معكَ",
  yTeach    : (tF: boolean) => tF ? "وأنتِ" : "وأنتَ",
  fromYou   : (tF: boolean) => tF ? "منكِ" : "منكَ",
  mukalaf   : (tF: boolean) => tF ? "مكلفةٌ" : "مكلفٌ",
  yourEffort: (tF: boolean) => tF ? "جهودكِ" : "جهودكَ",
  anotherTeacher: (tF: boolean) => tF ? "مشرفة أخرى" : "مشرف آخر",

  rejectDay : (tomorrow: boolean) => `رسوبٌ — يُعاد التسميع ${tomorrow ? "بعد غدٍ" : "ليوم غدٍ"}`,
  rejectDayExam: (tomorrow: boolean) => `رسوبٌ — يُعاد الاختبار ${tomorrow ? "بعد غدٍ" : "ليوم غدٍ"}`,

  supNoteP: (tF: boolean, sF: boolean) => {
    const l = tF ? (sF ? "المشرفةُ الخاصة بكِ مجازةٌ ليوم غدٍ" : "المشرفةُ الخاصة بكَ مجازةٌ ليوم غدٍ")
                 : (sF ? "المشرفُ الخاص بكِ مجازٌ ليوم غدٍ" : "المشرفُ الخاص بكَ مجازٌ ليوم غدٍ");
    return `_(${l} — يُؤجَّل الحفظ إلى ما بعد الغد)_`;
  },
  userHolNoteP: (sF: boolean) => sF ? "_(أنتِ مجازةٌ ليوم غدٍ — يُؤجَّل الحفظ إلى ما بعد الغد)_" : "_(أنتَ مجازٌ ليوم غدٍ — يُؤجَّل الحفظ إلى ما بعد الغد)_",
  pubNoteP: () => "_(يوم غدٍ إجازةٌ عامة — يُؤجَّل الموعد إلى ما بعد الغد 🌙)_",

  supNoteE: (tF: boolean, sF: boolean) => {
    const l = tF ? (sF ? "المشرفةُ المسؤولة عن اختبارِكِ مجازةٌ ليوم غدٍ" : "المشرفةُ المسؤولة عن اختبارِكَ مجازةٌ ليوم غدٍ")
                 : (sF ? "المشرفُ المسؤول عن اختبارِكِ مجازٌ ليوم غدٍ" : "المشرفُ المسؤول عن اختبارِكَ مجازٌ ليوم غدٍ");
    return `_(${l} — يُؤجَّل الاختبار إلى ما بعد الغد)_`;
  },
  userHolNoteE: (sF: boolean) => sF ? "_(أنتِ مجازةٌ ليوم غدٍ — يُؤجَّل الاختبار إلى ما بعد الغد)_" : "_(أنتَ مجازٌ ليوم غدٍ — يُؤجَّل الاختبار إلى ما بعد الغد)_",
  pubNoteE: () => "_(يوم غدٍ إجازةٌ عامة — يُؤجَّل الاختبار إلى ما بعد الغد 🌙)_",
};

// ════════════════════════════════════════════════════════════════════
//  Interfaces
// ════════════════════════════════════════════════════════════════════
interface HolidayContext {
  isPublicHoliday   : boolean;
  teacherHolidayMap : Map<string, string>;
  userHolidaySet    : Set<string>;
}

interface HolidayInfo {
  tomorrowIsHoliday : boolean;
  type              : "none" | "public" | "teacher" | "user";
  teacherIsFemale   : boolean;
  userIsFemale      : boolean;
}

interface AbsenceData {
  total            : number;
  last_check       : number | null;
  last_stopped_at  : string | null;
  stopped_abs_total: number;
}

interface TripleResult {
  isTriple : boolean;
  dates    : string[];
}

type SaveStatus  = "ACTIVE" | "SUSPENDED" | "TERMINATED" | "FINISHED" | "IN_EXAM1" | "IN_EXAM2";
type StopVariant = "absence" | "reject";
type ExamType    = "EXAM1" | "EXAM2";
type StopTarget  = "student" | "father" | "teacher" | "admin";
type PageVariant = "absence" | "holiday" | "teacher_holiday" | "public_holiday" | "teacher_absence";
type ExamVariant = "teacher_absence" | "user_absence" | "reject";

// ════════════════════════════════════════════════════════════════════
//  دوال مساعدة عامة والتعامل مع توقيت بغداد
// ════════════════════════════════════════════════════════════════════
function todayStr(): string {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Baghdad" }))
    .toISOString().split("T")[0];
}

function addDays(d: string, n: number): string {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().split("T")[0];
}

function diffDays(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}

function convertPhone(p: string): string {
  const s = String(p ?? "").trim();
  if (s.startsWith("964")) return "0" + s.slice(3);
  if (s.startsWith("+964")) return "0" + s.slice(4);
  return s;
}

function parseAbsence(raw: any): AbsenceData {
  if (typeof raw === "number") return { total: raw, last_check: null, last_stopped_at: null, stopped_abs_total: 0 };
  if (typeof raw === "object" && raw !== null) {
    return {
      total:             Number(raw.total             ?? 0),
      last_check:        raw.last_check      != null ? Number(raw.last_check)      : null,
      last_stopped_at:   raw.last_stopped_at != null ? String(raw.last_stopped_at) : null,
      stopped_abs_total: Number(raw.stopped_abs_total ?? 0),
    };
  }
  return { total: 0, last_check: null, last_stopped_at: null, stopped_abs_total: 0 };
}

function holNoteP(hi: HolidayInfo): string {
  if (!hi.tomorrowIsHoliday) return "";
  if (hi.type === "public")  return G.pubNoteP();
  if (hi.type === "teacher") return G.supNoteP(hi.teacherIsFemale, hi.userIsFemale);
  if (hi.type === "user")    return G.userHolNoteP(hi.userIsFemale);
  return "";
}

function holNoteE(hi: HolidayInfo): string {
  if (!hi.tomorrowIsHoliday) return "";
  if (hi.type === "public")  return G.pubNoteE();
  if (hi.type === "teacher") return G.supNoteE(hi.teacherIsFemale, hi.userIsFemale);
  if (hi.type === "user")    return G.userHolNoteE(hi.userIsFemale);
  return "";
}

function untilDate(base: string, shift: boolean): string {
  return addDays(base, 1 + (shift ? 1 : 0));
}

function hdr(label: string, name: string): string[] {
  return [T.HEADER, ``, `👤 ${label}: *${name}*`, ``];
}

function buildPageDisplay(page: number, edp: number): string {
  const count = edp < 1 ? 1 : Math.ceil(edp);
  return Array.from({ length: count }, (_, i) => String(page - (count - 1 - i))).join(" و ");
}

async function getPageNames(supabase: any, page: number, edp: number): Promise<string> {
  try {
    const count = edp < 1 ? 1 : Math.ceil(edp);
    const pages = Array.from({ length: count }, (_, i) => page - (count - 1 - i));
    const { data } = await supabase.from("quran_index").select("page_number, page_name").in("page_number", pages);
    const map: Record<number, string> = {};
    for (const r of data ?? []) map[r.page_number] = r.page_name;
    return [...new Set(pages.map(p => map[p] ?? String(p)))].join(" & ");
  } catch {
    return String(page);
  }
}

// ════════════════════════════════════════════════════════════════════
//  نظام الإجازات وفحص الغياب/الرسوب المتتالي والإيقاف
// ════════════════════════════════════════════════════════════════════
async function buildHolidayContext(supabase: any, holidays: any[]): Promise<HolidayContext> {
  const ctx: HolidayContext = { isPublicHoliday: false, teacherHolidayMap: new Map(), userHolidaySet: new Set() };
  for (const h of holidays) {
    if (h.type === "ALL") {
      ctx.isPublicHoliday = true;
    } else if (h.type === "FOR_TEACHER" && h.for_teacher_id) {
      const { data: t } = await supabase.from("teachers").select("gender").eq("teacher_id", h.for_teacher_id).maybeSingle();
      ctx.teacherHolidayMap.set(String(h.for_teacher_id), t?.gender ?? "male");
    } else if (h.type === "FOR_USER" && h.for_user_id) {
      ctx.userHolidaySet.add(String(h.for_user_id));
    }
  }
  return ctx;
}

function computeNewPageStatus(uid: string, tid: string, inTest: boolean, ctx: HolidayContext): string {
  if (inTest) return "in_test";
  if (ctx.userHolidaySet.has(uid))    return "holiday";
  if (ctx.teacherHolidayMap.has(tid)) return "teacher_holiday";
  if (ctx.isPublicHoliday)            return "public_holiday";
  return "not_ready";
}

function computeHolidayInfo(uid: string, tid: string, isFU: boolean, iFT: boolean, ctx: HolidayContext): HolidayInfo {
  const b: HolidayInfo = { tomorrowIsHoliday: false, type: "none", teacherIsFemale: iFT, userIsFemale: isFU };
  if (ctx.userHolidaySet.has(uid))    return { ...b, tomorrowIsHoliday: true, type: "user" };
  if (ctx.teacherHolidayMap.has(tid)) return { ...b, tomorrowIsHoliday: true, type: "teacher" };
  if (ctx.isPublicHoliday)            return { ...b, tomorrowIsHoliday: true, type: "public" };
  return b;
}

const SKIP_ST = new Set([ "holiday", "public_holiday", "teacher_holiday", "in_test", "user_absence", "teacher_absence", "sus_to_act" ]);

async function checkTriple(
  supabase: any, userId: string, saveId: string, table: "users_pages" | "users_pages_tests", kind: "absence" | "reject", examType?: ExamType
): Promise<TripleResult> {
  let q = supabase.from(table).select("status, page_status, date")
    .eq("user_id", userId).eq("save_id", saveId)
    .order("id", { ascending: false }).limit(60);
  
  if (examType) q = q.eq("type", examType);
  const { data } = await q;
  if (!data?.length) return { isTriple: false, dates: [] };

  let cnt = 0;
  const dates: string[] = [];
  for (const r of data) {
    const st = String(r.status ?? "");
    const pst = String(r.page_status ?? "");

    if (SKIP_ST.has(st) && st !== "user_absence") continue;
    if (st === "sus_to_act") break;
    if (st === "finished" && (pst === "good" || pst === "perfect")) break;

    if (kind === "reject" && st === "finished" && pst === "reject") {
      cnt++;
      dates.push(String(r.date ?? "").split("T")[0]);
      if (cnt >= 3) return { isTriple: true, dates };
      continue;
    }
    if (kind === "absence" && st === "user_absence") {
      cnt++;
      dates.push(String(r.date ?? "").split("T")[0]);
      if (cnt >= 3) return { isTriple: true, dates };
      continue;
    }
    if (SKIP_ST.has(st)) continue;
    break;
  }
  return { isTriple: false, dates };
}

async function suspendSave(
  supabase: any, saveId: string, kind: StopVariant, dates: string[], saveName: string, currentStatus: string, isExam = false
): Promise<void> {
  const ctx = isExam ? `لاختبار الحفظ (${saveName})` : "";
  const reason = kind === "absence"
    ? [`الغياب لثلاثة أيام ${ctx}`, `الغياب الأول: ${dates[0] ?? "—"}`, `الغياب الثاني: ${dates[1] ?? "—"}`, `الغياب الثالث: ${dates[2] ?? "—"}`].join("\n")
    : [`الرسوب لثلاث مرات متتالية ${ctx}:`, `الرسوب الأول: ${dates[0] ?? "—"}`, `الرسوب الثاني: ${dates[1] ?? "—"}`, `الرسوب الثالث: ${dates[2] ?? "—"}`].join("\n");

  const upd: any = { status: "SUSPENDED", old_status: currentStatus, status_reason: reason };
  if (isExam) {
    const eType = currentStatus === "IN_EXAM1" ? "EXAM1" : "EXAM2";
    if (eType === "EXAM1") {
      upd.exam1_status = "SUSPENDED";
      upd.exam1_status_page = "SUSPENDED";
    } else {
      upd.exam2_status = "SUSPENDED";
      upd.exam2_status_page = "SUSPENDED";
    }
  }
  await supabase.from("users_saves").update(upd).eq("id", saveId);
}

// ════════════════════════════════════════════════════════════════════
//  دوال إنشاء الصفوف في قاعدة البيانات
// ════════════════════════════════════════════════════════════════════
async function createPageRow(
  supabase: any, userId: string, saveId: string, teacherId: string, teacherName: string, teacherPhoto: string, page: number, edp: number, fields: Record<string, any>
): Promise<boolean> {
  try {
    const pageName = await getPageNames(supabase, page, edp);
    const { data, error } = await supabase.from("users_pages").insert([{
      user_id: userId, save_id: saveId, teacher_id: teacherId, teacher_name: teacherName, teacher_photo: teacherPhoto,
      status: "not_ready", page_status: "not_ready", errors_number: { sowad: 0, nisyan: 0 },
      created_at: new Date().toISOString(), page, page_name: pageName, ...fields,
    }]).select("*");
    if (error) { console.error("[PAGE INSERT ERROR]:", JSON.stringify(error)); return false; }
    return data && data.length > 0;
  } catch (e) { console.error("[PAGE INSERT EXCEPTION]:", e); return false; }
}

async function createTestRow(
  supabase: any, userId: string, saveId: string, examTId: string, examTName: string, examType: ExamType, startPage: number, endPage: number, fields: Record<string, any>
): Promise<boolean> {
  try {
    const { data, error } = await supabase.from("users_pages_tests").insert([{
      user_id: userId, save_id: saveId, teacher_id: examTId, teacher_name: examTName,
      status: "not_ready", page_status: "not_ready", errors_number: { sowad: 0, nisyan: 0 },
      type: examType, start_page: startPage, end_page: endPage, created_at: new Date().toISOString(), date: todayStr(), ...fields,
    }]).select("*");
    if (error) { console.error("[TEST ROW INSERT ERROR]:", JSON.stringify(error)); return false; }
    return data && data.length > 0;
  } catch (e) { console.error("[TEST ROW INSERT EXCEPTION]:", e); return false; }
}

async function updateTeacherAbsence(supabase: any, teacherId: string, dateVal: string, userName: string) {
  try {
    const { data: t } = await supabase.from("teachers").select("absence").eq("teacher_id", teacherId).maybeSingle();
    let aj: any = t?.absence ?? {};
    if (typeof aj === "string") { try { aj = JSON.parse(aj); } catch { aj = {}; } }
    const dk = String(dateVal ?? todayStr()).split("T")[0];
    if (!aj[dk]) aj[dk] = { users_names: userName };
    else {
      const n = aj[dk].users_names ?? "";
      aj[dk].users_names = n ? `${n}, ${userName}` : userName;
    }
    await supabase.from("teachers").update({ absence: aj }).eq("teacher_id", teacherId);
  } catch (e) { console.error(`[updateTeacherAbsence ERROR]:`, e); }
}

async function updateSaveExamFields(supabase: any, saveId: string, examType: ExamType, status: string, statusPage: string) {
  const upd: Record<string, string> = {};
  if (examType === "EXAM1") {
    upd.exam1_status = status;
    upd.exam1_status_page = statusPage;
  } else {
    upd.exam2_status = status;
    upd.exam2_status_page = statusPage;
  }
  await supabase.from("users_saves").update(upd).eq("id", saveId);
}

// ════════════════════════════════════════════════════════════════════
//  صياغة نصوص رسائل الحفظ اليومي والاكتمال والاختبارات
// ════════════════════════════════════════════════════════════════════
function msgAbsence(
  saveName: string, pageDisp: string, dateStr: string, untilStr: string, absCount: number, isFU: boolean, iFT: boolean, forFather: boolean, variant: PageVariant, hi: HolidayInfo, fullName: string
): string {
  const nameLbl = forFather ? G.guardian(isFU) : G.student(isFU);
  let sLbl: string; let sEmoji: string;
  if (variant === "absence") { sLbl = G.absent(isFU); sEmoji = "🔴"; }
  else if (variant === "holiday") { sLbl = G.onHoliday(isFU); sEmoji = "🟡"; }
  else if (variant === "teacher_holiday") { sLbl = G.teacherHol(iFT); sEmoji = "🟡"; }
  else if (variant === "public_holiday") { sLbl = "إجازةٌ عامة"; sEmoji = "🟢"; }
  else { sLbl = G.notEval(); sEmoji = "🔔"; }

  const lines = [
    ...hdr(nameLbl, fullName), T.SEP,
    `📚 الحفظ: *${saveName}*`,
    `📄 الصفحة: *${pageDisp}*`,
    `${sEmoji} الحالة: *${sLbl}*`,
    `📅 النتيجة: *يُؤجَّل الحفظ من ${dateStr} إلى ${untilStr}*`,
  ];
  const note = holNoteP(hi);
  if (note) lines.push(note);
  if (variant === "absence") lines.push(`🔢 عدد الغيابات: *${absCount}*`);
  lines.push(T.SEP, ``, T.FOOTER);
  return lines.join("\n");
}

function msgFinished(
  saveName: string, pageDisp: string, ps: string, errors: any, nextPagesText: string, isFU: boolean, iFT: boolean, forFather: boolean, inTest: boolean, hi: HolidayInfo, fullName: string
): string {
  const nameLbl = forFather ? G.guardian(isFU) : G.student(isFU);
  let rLbl: string; let rEmoji: string;
  if (ps === "perfect") { rLbl = G.perfect(isFU); rEmoji = "🌟"; }
  else if (ps === "good") { rLbl = G.good(); rEmoji = "✅"; }
  else { rLbl = G.rejectDay(hi.tomorrowIsHoliday); rEmoji = "❌"; }

  const note = holNoteP(hi);
  const lines = [
    ...hdr(nameLbl, fullName), T.SEP,
    `📚 الحفظ: *${saveName}*`,
    `📄 الصفحة: *${pageDisp}*`,
    `🔖 الحالة: *تم التقييم*`,
    `${rEmoji} النتيجة: *${rLbl}*`, T.SEP,
    `🔴 أخطاء السواد: *${errors?.sowad ?? 0}*`,
    `💭 النسيان: *${errors?.nisyan ?? 0}*`, T.SEP,
    `📝 حفظ الغد: *${nextPagesText}*`,
  ];
  if (inTest) lines.push(`⚠️ _يتوقف الحفظ مؤقتًا ويُستأنف بعد إكمال الاختبار_`);
  if (note) lines.push(note);
  lines.push(T.SEP, ``, T.FOOTER);
  return lines.join("\n");
}

function msgSuspend(
  saveName: string, kind: StopVariant, fullName: string, isFU: boolean, iFT: boolean, target: StopTarget, fatherPhone: string, absData?: AbsenceData
): string {
  const reason = kind === "absence" ? "كثرة الغيابات أثناء فترة الحفظ" : "الرسوب المتكرر في التسميع";
  if (target === "admin") {
    const lines = [
      T.HEADER, ``, T.SEP, `🔴 *تنبيه إداري — إيقاف حفظ*`, T.SEP, ``,
      `📚 الحفظ: *${saveName}*`,
      `${G.student(isFU)}: *${fullName}*`, ``,
      `تم إيقاف ${G.his(isFU)} بسبب ${reason}.`,
    ];
    if (kind === "absence" && absData) {
      lines.push(`📊 عدد الغيابات الكلي: *${absData.total}*`);
      if (absData.last_stopped_at) lines.push(`📅 آخر إيقاف: *${absData.last_stopped_at}*`);
    }
    lines.push(
      ``, `✅ تم إبلاغ ولي ${G.forHer(isFU)} وطُلب منه التواصل معكم.`,
      `✅ تم إبلاغ ${G.teacherLbl(iFT)} ${G.supAdj(iFT)} ${G.supPrn(isFU)} بإيقاف الحفظ.`,
      ``, `📞 إذا لم يتم التواصل خلال 24 ساعة يُرجى الاتصال على ولي ${G.forHer(isFU)}:`,
      `*${fatherPhone}*`, ``, T.SEP, ``, `نسخة منها إلى:`, ...T.COPIES, T.SEP
    );
    return lines.join("\n");
  }
  if (target === "teacher") {
    return [
      T.HEADER, ``, T.SEP, `🔴 *إشعار إيقاف حفظ*`, T.SEP, ``,
      `📚 الحفظ: *${saveName}*`, `${G.student(isFU)}: *${fullName}*`, ``,
      `تم إيقاف ${G.his(isFU)} بسبب ${reason}.`,
      `📌 في حال استئناف ${G.his(isFU)} سيتم ${G.iElmak(iFT)} بذلك.`, T.SEP
    ].join("\n");
  }
  const nameLbl = target === "father" ? G.guardian(isFU) : G.student(isFU);
  const his = target === "father" ? G.his(isFU) : G.hisSelf(isFU);
  return [
    ...hdr(nameLbl, fullName), T.SEP,
    `📚 الحفظ: *${saveName}*`,
    `❌ تم إيقاف ${his} بسبب ${reason}.`,
    `📞 يُرجى التواصل مع إدارة المركز على الرقم: *${T.ADMIN}*`, T.SEP, ``, T.FOOTER
  ].join("\n");
}

function msgCompletionStudent(
  saveName: string, fullName: string, isFU: boolean, exam1Req: boolean, exam1TName: string, exam2Req: boolean, exam1TIsFemale: boolean
): string {
  const lines = [...hdr(G.student(isFU), fullName), T.SEP, `📚 الحفظ: *${saveName}*`, ``, T.BAYT, ``];
  if (!exam1Req && !exam2Req) {
    lines.push(
      `سيتم إبلاغ الإدارة بذلك وسيتم إضافة حفظ جديد ${G.toHim(isFU)}.`,
      `بارك الله ${G.inHim(isFU)} ${G.makeHim(isFU)} من الحفاظ والمداوميين على كتاب الله تعالى.`
    );
  } else if (exam1Req) {
    lines.push(`بعد غدٍ سيكون ${G.toHim(isFU)} اختبار بكامل ${G.hisSelf(isFU)}.`);
    if (exam1TName) lines.push(`🎓 ${G.willTest(isFU)} عند ${G.teacherLbl(exam1TIsFemale)}: *${exam1TName}*`);
    lines.push(`بارك الله ${G.inHim(isFU)} ${G.makeHim(isFU)} من الحفاظ والمداوميين على كتاب الله تعالى.`);
  }
  if (exam2Req) lines.push(``, `📌 يُرجى التجهز للاختبار التراكمي — يوم غدٍ استراحة وبعده اختبار تراكمي بكل ${G.hisSelf(isFU)} خلال فترة الحفظ.`);
  lines.push(T.SEP, ``, T.FOOTER);
  return lines.join("\n");
}

function msgCompletionGuardian(
  saveName: string, fullName: string, isFU: boolean, exam1Req: boolean, exam2Req: boolean
): string {
  const lines = [ ...hdr(G.guardian(isFU), fullName), T.SEP, `📚 الحفظ: *${saveName}*`, ``, T.BAYT, ``, `أتمَّ ${G.student(isFU)} *${fullName}* ${G.his(isFU)} بحمد الله.`, ];
  if (!exam1Req && !exam2Req) lines.push(`سيتم التواصل معكم من قِبَل الإدارة لتحديد حفظ جديد ${G.him(isFU)}.`);
  else if (exam1Req) lines.push(`بعد غدٍ سيكون ${G.him(isFU)} اختبار بكامل ${G.his(isFU)}.`);
  if (exam2Req) lines.push(`📌 وبعد الاختبار سيكون اختبار تراكمي بكامل ${G.his(isFU)} خلال فترة الحفظ.`);
  lines.push(T.SEP, ``, T.FOOTER);
  return lines.join("\n");
}

function msgCompletionTeacher(
  saveName: string, fullName: string, isFU: boolean, iFT: boolean, exam1Active: boolean, exam2Active: boolean, activeExamTeacherName: string, activeExamTeacherIsFemale: boolean
): string {
  const lines = [ T.HEADER, ``, T.SEP, `📚 الحفظ: *${saveName}*`, `${G.student(isFU)}: *${fullName}*`, ``, `أتمَّ ${G.his(isFU)} بحمد الله.`, `` ];
  if (exam1Active || exam2Active) {
    lines.push(`وسوف يتم ${G.testHimHer(isFU)} عند ${G.anotherTeacher(activeExamTeacherIsFemale)} (*${activeExamTeacherName}*).`);
  } else {
    lines.push(`تم إبلاغ الإدارة وسيتم تحديد حفظ جديد ${G.him(isFU)}.`);
  }
  lines.push(``, G.bless(iFT) + ` على حسن التعاون والتزامك في نشر هذا العلم.`, T.SEP);
  return lines.join("\n");
}

function msgCompletionAdmin(saveName: string, fullName: string, isFU: boolean, exam1Req: boolean): string {
  return [ T.HEADER, ``, T.SEP, `📋 *إتمام حفظ*`, T.SEP, ``, `📚 الحفظ: *${saveName}*`, `${G.student(isFU)}: *${fullName}*`, ``, `أتمَّ ${G.his(isFU)} بحمد الله.`, exam1Req ? `📌 ${G.willTest3(isFU)} بعد غدٍ — يُرجى المتابعة.` : `📌 يُرجى تحديد حفظ جديد ${G.him(isFU)} ليبدأ به.`, T.SEP ].join("\n");
}

function msgExamAssignTeacher(
  saveName: string, fullName: string, isFU: boolean, iFT: boolean, startPage: number, endPage: number, examType: ExamType, studentPhone: string
): string {
  const isCumul = examType === "EXAM2";
  const examDesc = isCumul ? `الاختبار التراكمي الكلي للحفظ (${saveName})` : `اختبار الحفظ الكلي لـ(${saveName}) من الصفحة *${startPage}* إلى *${endPage}*`;
  return [ T.HEADER, ``, T.SEP, `📋 *تكليف اختبار*`, T.SEP, ``, `${G.student(isFU)}: *${fullName}*`, `📚 الحفظ: *${saveName}*`, ``, `سيكون بعد غدٍ ${examDesc}.`, `${G.assigned(iFT)} لاختباره — يُرجى التواصل ${G.callWithYou(iFT)} على الرقم: *${convertPhone(studentPhone)}*`, T.SEP ].join("\n");
}

function msgExamDayStudent(
  saveName: string, fullName: string, isFU: boolean, examTName: string, examTPhone: string, examType: ExamType, startPage: number, endPage: number, iEFT: boolean
): string {
  const isCumul = examType === "EXAM2";
  const examDesc = isCumul ? `اختبار تراكمي بكامل ${G.hisSelf(isFU)} خلال فترة الحفظ` : `اختبار بالحفظ الكلي لـ(${saveName}) من الصفحة *${startPage}* إلى *${endPage}*`;
  return [ ...hdr(G.student(isFU), fullName), T.SEP, `📚 الحفظ: *${saveName}*`, `🗒️ يوم غدٍ اختبار ${examDesc}`, `🎓 ${G.teacherLbl(iEFT)} على الاختبار: *${examTName}*`, `📞 رقم ${G.teacherLbl(iEFT)}: *${convertPhone(examTPhone)}*`, T.SEP, ``, T.FOOTER ].join("\n");
}

function msgExamDayGuardian(
  saveName: string, fullName: string, isFU: boolean, examTName: string, examType: ExamType, iEFT: boolean
): string {
  const isCumul = examType === "EXAM2";
  const examDesc = isCumul ? `اختبار تراكمي بكامل ${G.his(isFU)}` : `اختبار بالحفظ الكلي لـ(${saveName})`;
  return [ ...hdr(G.guardian(isFU), fullName), T.SEP, `📚 الحفظ: *${saveName}*`, `🗒️ ${G.hasExam(isFU)} ${G.student(isFU)} *${fullName}* يوم غدٍ اختبار ${examDesc}`, `🎓 ${G.teacherLbl(iEFT)} على الاختبار: *${examTName}*`, T.SEP, ``, T.FOOTER ].join("\n");
}

function msgExamDayExamTeacher(
  saveName: string, fullName: string, isFU: boolean, iFT: boolean, studentPhone: string, examType: ExamType, startPage: number, endPage: number
): string {
  const isCumul = examType === "EXAM2";
  const examDesc = isCumul ? `اختبار تراكمي بكامل ${G.his(isFU)}` : `اختبار بالحفظ الكلي لـ(${saveName}) من الصفحة *${startPage}* إلى *${endPage}*`;
  return [ T.HEADER, ``, T.SEP, `📋 *تذكير موعد اختبار*`, T.SEP, ``, `${G.student(isFU)}: *${fullName}*`, `📚 الحفظ: *${saveName}*`, ``, `${G.hasExam(isFU)} يوم غدٍ اختبار ${examDesc}`, `${G.yTeach(iFT)} ${G.teacherLbl(iFT)} المكلَّف باختباره.`, `📞 رقم ${G.student(isFU)}: *${convertPhone(studentPhone)}*`, T.SEP ].join("\n");
}

function msgExamSessionResult(
  saveName: string, fullName: string, isFU: boolean, iFT: boolean, target: "student" | "father" | "examTeacher", variant: ExamVariant, delayDate: string, hi: HolidayInfo, examType: ExamType, absCount?: number
): string {
  const isCumul = examType === "EXAM2";
  const examLabel = isCumul ? "الاختبار التراكمي" : `اختبار الحفظ (${saveName})`;
  const note = holNoteE(hi);
  const delayTxt = `ليوم غدٍ (${delayDate})`;
  if (target === "examTeacher") {
    let txt: string;
    if (variant === "teacher_absence") txt = `لم يتم إجراء اختبار ${G.student(isFU)} *${fullName}* — يُؤجَّل ${examLabel} ${delayTxt}.`;
    else if (variant === "user_absence") txt = `${G.student(isFU)} *${fullName}* ${G.absent(isFU)} — يُؤجَّل ${examLabel} ${delayTxt}.`;
    else txt = `رسب ${G.student(isFU)} *${fullName}* في ${examLabel} — يُعاد ${delayTxt}.`;
    const lines = [T.HEADER, ``, T.SEP, txt];
    if (note) lines.push(note);
    lines.push(T.SEP);
    return lines.join("\n");
  }
  const nameLbl = target === "father" ? G.guardian(isFU) : G.student(isFU);
  const lines = [ ...hdr(nameLbl, fullName), T.SEP, `📚 الحفظ: *${saveName}*`, `🗒️ ${examLabel}`, ];
  if (variant === "teacher_absence") {
    lines.push(`🔔 الحالة: *${G.notEval()}*`, `📅 يُؤجَّل الاختبار ${delayTxt}`);
  } else if (variant === "user_absence") {
    lines.push(`🔴 الحالة: *${G.absent(isFU)}*`, `📅 يُؤجَّل الاختبار ${delayTxt}`);
    if (absCount != null) lines.push(`🔢 عدد الغيابات: *${absCount}*`);
  } else {
    lines.push(`❌ النتيجة: *رسوبٌ — يُعاد الاختبار ${delayTxt}*`);
  }
  if (note) lines.push(note);
  lines.push(T.SEP, ``, T.FOOTER);
  return lines.join("\n");
}

// ════════════════════════════════════════════════════════════════════
//  الدالة المركزية لمعالجة ومتابعة النظام اليومي للتحفيظ والاختبارات
// ════════════════════════════════════════════════════════════════════
export async function handleDailySaves() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseKey);

  const today = todayStr();
  const tomorrow = addDays(today, 1);
  console.log(`[DAILY SYSTEM RUNNING] GMT+3 Baghdad. Today: ${today}, Tomorrow: ${tomorrow}`);

  // جلب كافة الحفظ المفتوح أو الواقع تحت الاختبار
  const { data: saves, error: sErr } = await supabase
    .from("users_saves")
    .select(`
      *,
      user:users!user_id(*),
      teacher:teachers!teacher_id(*),
      exam1_teacher:teachers!exam1_teacher_id(*),
      exam2_teacher:teachers!exam2_teacher_id(*)
    `)
    .in("status", ["ACTIVE", "IN_EXAM1", "IN_EXAM2"]);

  if (sErr || !saves) {
    console.error("[FETCH SAVES ERROR]:", sErr);
    return;
  }


  // جلب إجازات الغد المسبقة للجدولة والتحقق
  const { data: tomHolidays } = await supabase
    .from("holidays")
    .select("*")
    .eq("date", tomorrow);
  const tomCtx = await buildHolidayContext(supabase, tomHolidays ?? []);

  // جلب إجازات اليوم لمعالجة الغيابات والإجراءات الحالية
  const { data: todayHolidays } = await supabase
    .from("holidays")
    .select("*")
    .eq("date", today);
  const todCtx = await buildHolidayContext(supabase, todayHolidays ?? []);

  for (const s of saves) {
    const uid = s.user_id;
    const tid = s.teacher_id;
    if (!s.user || !s.teacher) continue;

    const isFU  = s.user.gender === "female";
    const iFT  = s.teacher.gender === "female";
    const fName = s.user.full_name ?? "طالب غير مسمى";
    const sName = s.name ?? "حفظ";
    const fPhone = s.user.father_phone ?? "";
    const sPhone = s.user.phone ?? "";

    // ─────────────────────────────────────────────────────────────────
    //  الحالة الأولى: الطالب في وضع الحفظ اليومي النشط (ACTIVE)
    // ─────────────────────────────────────────────────────────────────
    if (s.status === "ACTIVE") {
      const { data: pageRow } = await supabase
        .from("users_pages")
        .select("*")
        .eq("save_id", s.id)
        .eq("date", today)
        .maybeSingle();

      if (!pageRow) continue; // لم يقم المعلم بأي ترحيل أو تقييم بعد لليوم

      const pStatus = pageRow.status; // not_ready, user_absence, teacher_absence, finished
      const pEval   = pageRow.page_status; // perfect, good, reject, not_ready
      const pageNum = pageRow.page ?? 1;
      const edp     = s.every_day_pages ?? 1;
      const pageDisp = buildPageDisplay(pageNum, edp);

      // 1. معالجة الغياب اليومي (سواء غياب الطالب أو المعلم أو وجود إجازة)
      if (pStatus === "user_absence" || pStatus === "teacher_absence" || pStatus === "holiday" || pStatus === "public_holiday" || pStatus === "teacher_holiday") {
        const tripleAbs = await checkTriple(supabase, uid, s.id, "users_pages", "absence");
        if (tripleAbs.isTriple && pStatus === "user_absence") {
          await suspendSave(supabase, s.id, "absence", tripleAbs.dates, sName, "ACTIVE");
          const mAdmin   = msgSuspend(sName, "absence", fName, isFU, iFT, "admin", fPhone, { total: tripleAbs.dates.length, last_check: null, last_stopped_at: null, stopped_abs_total: 0 });
          const mTeacher = msgSuspend(sName, "absence", fName, isFU, iFT, "teacher", fPhone);
          const mStudent = msgSuspend(sName, "absence", fName, isFU, iFT, "student", fPhone);
          const mFather  = msgSuspend(sName, "absence", fName, isFU, iFT, "father", fPhone);
          // إرسال الرسائل عبر الـ Queue أو الـ API الخاص بالمركز
          continue;
        }

        const isShift = (pStatus === "user_absence" || pStatus === "teacher_absence");
        const nextDate = untilDate(today, isShift);
        const tomHi = computeHolidayInfo(uid, tid, isFU, iFT, tomCtx);
        const pageStatusTom = computeNewPageStatus(uid, tid, false, tomCtx);

        // إنشاء صف اليوم التالي للحفظ بناءً على التعديلات والجدولة
        await createPageRow(supabase, uid, s.id, tid, s.teacher.full_name, s.teacher.photo_url, pageNum, edp, {
          date: tomorrow, status: pageStatusTom, page_status: "not_ready"
        });

        const mSt = msgAbsence(sName, pageDisp, today, nextDate, 0, isFU, iFT, false, pStatus as PageVariant, tomHi, fName);
        const mFa = msgAbsence(sName, pageDisp, today, nextDate, 0, isFU, iFT, true, pStatus as PageVariant, tomHi, fName);
        if (pStatus === "teacher_absence") {
          await updateTeacherAbsence(supabase, tid, today, fName);
        }
        continue;
      }

      // 2. معالجة إكمال صفحة التسميع بنجاح أو رسوب اليوم
      if (pStatus === "finished") {
        if (pEval === "reject") {
          const tripleRej = await checkTriple(supabase, uid, s.id, "users_pages", "reject");
          if (tripleRej.isTriple) {
            await suspendSave(supabase, s.id, "reject", tripleRej.dates, sName, "ACTIVE");
            const mAdmin   = msgSuspend(sName, "reject", fName, isFU, iFT, "admin", fPhone);
            const mTeacher = msgSuspend(sName, "reject", fName, isFU, iFT, "teacher", fPhone);
            const mStudent = msgSuspend(sName, "reject", fName, isFU, iFT, "student", fPhone);
            const mFather  = msgSuspend(sName, "reject", fName, isFU, iFT, "father", fPhone);
            continue;
          }

          const tomHi = computeHolidayInfo(uid, tid, isFU, iFT, tomCtx);
          const pageStatusTom = computeNewPageStatus(uid, tid, false, tomCtx);
          await createPageRow(supabase, uid, s.id, tid, s.teacher.full_name, s.teacher.photo_url, pageNum, edp, {
            date: tomorrow, status: pageStatusTom, page_status: "not_ready"
          });

          const mSt = msgFinished(sName, pageDisp, pEval, pageRow.errors_number, pageDisp, isFU, iFT, false, false, tomHi, fName);
          const mFa = msgFinished(sName, pageDisp, pEval, pageRow.errors_number, pageDisp, isFU, iFT, true, false, tomHi, fName);
          continue;
        }

        // النجاح والعبور للصفحة التالية
        if (pEval === "perfect" || pEval === "good") {
          const isCompleted = (pageNum >= (s.end_page ?? 604));

          if (isCompleted) {
            // الطالب أتم كامل الخطة المقررة للحفظ بنجاح مبهر
            await supabase.from("users_saves").update({ status: "FINISHED" }).eq("id", s.id);
            
            const e1Req = !!s.exam1_active;
            const e2Req = !!s.exam2_active;
            const activeExamTeacherName = s.exam1_teacher?.full_name ?? s.exam2_teacher?.full_name ?? "";
            const activeExamTeacherIsFemale = s.exam1_teacher?.gender === "female" || s.exam2_teacher?.gender === "female";

            const mSt = msgCompletionStudent(sName, fName, isFU, e1Req, s.exam1_teacher?.full_name ?? "", e2Req, s.exam1_teacher?.gender === "female");
            const mFa = msgCompletionGuardian(sName, fName, isFU, e1Req, e2Req);
            const mAd = msgCompletionAdmin(sName, fName, isFU, e1Req);
            // إرسال إشعار لمعلم الحفظ وتنبيهه بأن الطالب سينتقل لمشرف آخر للاختبار
            const mTe = msgCompletionTeacher(sName, fName, isFU, iFT, e1Req, e2Req, activeExamTeacherName, activeExamTeacherIsFemale);
            
            // عند اكتمال الحفظ، إذا كان هناك اختبار فعال، يتم جدولة التكليف بعد غد تلقائياً
            if (e1Req && s.exam1_teacher_id) {
              await updateSaveExamFields(supabase, s.id, "EXAM1", "PENDING", "PENDING");
              const mAssign = msgExamAssignTeacher(sName, fName, isFU, s.exam1_teacher.gender === "female", s.start_page, s.end_page, "EXAM1", sPhone);
            }
          } else {
            // الاستمرار اليومي الطبيعي - الانتقال للصفحات التالية
            const nextPage = pageNum + edp;
            const nextDisp = buildPageDisplay(nextPage, edp);
            const tomHi = computeHolidayInfo(uid, tid, isFU, iFT, tomCtx);
            const pageStatusTom = computeNewPageStatus(uid, tid, false, tomCtx);

            await createPageRow(supabase, uid, s.id, tid, s.teacher.full_name, s.teacher.photo_url, nextPage, edp, {
              date: tomorrow, status: pageStatusTom, page_status: "not_ready"
            });

            const nextNames = await getPageNames(supabase, nextPage, edp);
            const mSt = msgFinished(sName, pageDisp, pEval, pageRow.errors_number, nextNames, isFU, iFT, false, false, tomHi, fName);
            const mFa = msgFinished(sName, pageDisp, pEval, pageRow.errors_number, nextNames, isFU, iFT, true, false, tomHi, fName);
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────
    //  الحالة الثانية والثالثة: الطالب في مرحلة الاختبارات (EXAM1 / EXAM2)
    // ─────────────────────────────────────────────────────────────────
    const isInExam = s.status === "IN_EXAM1" || s.status === "IN_EXAM2";
    if (isInExam) {
      const eType: ExamType = s.status === "IN_EXAM1" ? "EXAM1" : "EXAM2";
      const eTeacher = eType === "EXAM1" ? s.exam1_teacher : s.exam2_teacher;
      if (!eTeacher) continue;

      const iEFT = eTeacher.gender === "female";

      // جلب صف الاختبار الحالي لليوم للتحقق من النتيجة أو الحالة المقيدة
      const { data: testRow } = await supabase
        .from("users_pages_tests")
        .select("*")
        .eq("save_id", s.id)
        .eq("type", eType)
        .eq("date", today)
        .maybeSingle();

      // جدولة وتأكيد إشعار "يوم غدٍ الاختبار" عند فحص الفروق بمرور 24 ساعة
      // يتم الفحص استناداً لتاريخ إنشاء أو تفعيل الاختبار الفعال للـ exam_number
      const { data: prevTestRow } = await supabase
        .from("users_pages_tests")
        .select("date")
        .eq("save_id", s.id)
        .eq("type", eType)
        .order("id", { ascending: false })
        .limit(1);

      if (prevTestRow && prevTestRow.length > 0) {
        const lastTestDate = prevTestRow[0].date;
        const daysDiff = diffDays(lastTestDate, today);

        // إذا كان الفارق يوماً واحداً وغداً هو الموعد النهائي للاختبار الفعلي، نقوم بإضافة الصف وإرسال التذكير فوراً الساعة 11:45
        if (daysDiff === 1) {
          const examStatusTom = computeNewPageStatus(uid, eTeacher.teacher_id, false, tomCtx);
          // إضافة صف الاختبار المجهز للغد مسبقاً في قاعدة البيانات لمنع أي تأخير صباحي
          await createTestRow(supabase, uid, s.id, eTeacher.teacher_id, eTeacher.full_name, eType, s.start_page ?? 1, s.end_page ?? 604, {
            date: tomorrow, status: examStatusTom, page_status: "not_ready"
          });

          // صياغة وإرسال رسائل التذكير الصريحة حسب رقم ورقم مشرف الاختبار المخصص
          const mStudentDay = msgExamDayStudent(sName, fName, isFU, eTeacher.full_name, eTeacher.phone ?? "", eType, s.start_page ?? 1, s.end_page ?? 604, iEFT);
          const mGuardianDay = msgExamDayGuardian(sName, fName, isFU, eTeacher.full_name, eType, iEFT);
          const mTeacherDay = msgExamDayExamTeacher(sName, fName, isFU, iEFT, sPhone, eType, s.start_page ?? 1, s.end_page ?? 604);
        }
      }

      if (!testRow) continue;

      const tStatus = testRow.status; // finished, user_absence, teacher_absence
      const tEval   = testRow.page_status; // perfect, good, reject

      if (tStatus === "user_absence" || tStatus === "teacher_absence") {
        const tripleAbsTest = await checkTriple(supabase, uid, s.id, "users_pages_tests", "absence", eType);
        if (tripleAbsTest.isTriple && tStatus === "user_absence") {
          await suspendSave(supabase, s.id, "absence", tripleAbsTest.dates, sName, s.status, true);
          continue;
        }

        const isShift = (tStatus === "user_absence" || tStatus === "teacher_absence");
        const nextTestDate = addDays(today, 1);
        const tomHi = computeHolidayInfo(uid, eTeacher.teacher_id, isFU, iEFT, tomCtx);

        const mExT = msgExamSessionResult(sName, fName, isFU, iFT, "examTeacher", tStatus as ExamVariant, nextTestDate, tomHi, eType);
        const mSt  = msgExamSessionResult(sName, fName, isFU, iFT, "student", tStatus as ExamVariant, nextTestDate, tomHi, eType);
        const mFa  = msgExamSessionResult(sName, fName, isFU, iFT, "father", tStatus as ExamVariant, nextTestDate, tomHi, eType);
        
        if (tStatus === "teacher_absence") {
          await updateTeacherAbsence(supabase, eTeacher.teacher_id, today, fName);
        }
        continue;
      }

      if (tStatus === "finished") {
        if (tEval === "reject") {
          const tripleRejTest = await checkTriple(supabase, uid, s.id, "users_pages_tests", "reject", eType);
          if (tripleRejTest.isTriple) {
            await suspendSave(supabase, s.id, "reject", tripleRejTest.dates, sName, s.status, true);
            continue;
          }

          const nextTestDate = addDays(today, 1);
          const tomHi = computeHolidayInfo(uid, eTeacher.teacher_id, isFU, iEFT, tomCtx);

          const mExT = msgExamSessionResult(sName, fName, isFU, iFT, "examTeacher", "reject", nextTestDate, tomHi, eType);
          const mSt  = msgExamSessionResult(sName, fName, isFU, iFT, "student", "reject", nextTestDate, tomHi, eType);
          const mFa  = msgExamSessionResult(sName, fName, isFU, iFT, "father", "reject", nextTestDate, tomHi, eType);
          continue;
        }

        // نجاح في الاختبار الكلي للـ Exam
        if (tEval === "perfect" || tEval === "good") {
          if (eType === "EXAM1") {
            // الانتقال للاختبار التراكمي الثاني إذا كان مسجلاً ومفعلاً
            if (s.exam2_active && s.exam2_teacher_id) {
              await supabase.from("users_saves").update({ status: "IN_EXAM2" }).eq("id", s.id);
              await updateSaveExamFields(supabase, s.id, "EXAM2", "PENDING", "PENDING");
            } else {
              // انتهاء كافة الاختبارات بنجاح والعودة للحفظ أو الاكتمال النهائي
              await supabase.from("users_saves").update({ status: "FINISHED" }).eq("id", s.id);
            }
          } else {
            // اجتياز الاختبار التراكمي بنجاح تام
            await supabase.from("users_saves").update({ status: "FINISHED" }).eq("id", s.id);
          }
        }
      }
    }
  }
}
