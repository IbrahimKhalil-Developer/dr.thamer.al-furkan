import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import * as XLSX from "npm:xlsx";

// ════════════════════════════════════════════════════════════════════
//  ثوابت النصوص الثابتة
// ════════════════════════════════════════════════════════════════════
const T = {
  HEADER : "📖 *مشروع التحفيظ الدائم*",
  FOOTER : "_مع أطيب تحيات مركز الشيخ الدكتور *عمر الصميدعي* رحمه الله_",
  SEP    : "─────────────────",
  BAYT   : "🎉✨🌟 *وَتَمَّ ذَا الحِفْظُ بِحَمْدِ اللَّهِ ... عَلَى تَمَامِهِ بِلَا تَنَاهِي* 🌟✨🎉",
  ADMIN  : "07705440095",
  COPIES : ["  — الأساتذة الكِرام أعضاء إدارة المركز.", "  — الشيخ الدكتور ثامر الصميدعي."],
};

// ════════════════════════════════════════════════════════════════════
//  Interfaces & Types
// ════════════════════════════════════════════════════════════════════
interface AbsenceData {
  total            : number;
  last_check       : number | null;
  last_stopped_at  : string | null;
  stopped_abs_total: number;
}
interface TripleResult { isTriple: boolean; dates: string[]; }
interface AdminSummaryRow {
  studentName  : string;
  teacherName  : string;
  typeLabel    : string;
  pageDisp     : string;
  resultLabel  : string;
  sowad        : number;
  nisyan       : number;
  fateh        : string;
  readyAt      : string;
  finishedAt   : string;
  studentPhone : string;
  teacherPhone : string;
}

type SaveStatus  = "ACTIVE"|"SUSPENDED"|"TERMINATED"|"FINISHED"|"IN_EXAM1"|"IN_EXAM2";
type StopVariant = "absence" | "reject";
type ExamType    = "EXAM1"  | "EXAM2";
type StopTarget  = "student"| "father" | "teacher" | "admin";
type PageVariant = "absence"|"holiday"|"teacher_holiday"|"public_holiday"|"teacher_absence";
type ExamVariant = "teacher_absence"|"user_absence"|"reject";

// ════════════════════════════════════════════════════════════════════
//  قاموس التأنيث / التذكير
// ════════════════════════════════════════════════════════════════════
const G = {
  student   : (f:boolean) => f ? "الطالبة"          : "الطالب",
  guardian  : (f:boolean) => f ? "ولي أمر الطالبة"  : "ولي أمر الطالب",
  teacherLbl: (f:boolean) => f ? "المشرفة"           : "المشرف",
  his       : (f:boolean) => f ? "حفظها"             : "حفظه",
  hisSelf   : (f:boolean) => f ? "حفظكِ"             : "حفظكَ",
  him       : (f:boolean) => f ? "لها"               : "له",
  toHim     : (f:boolean) => f ? "لكِ"               : "لكَ",
  inHim     : (f:boolean) => f ? "فيكِ"              : "فيكَ",
  makeHim   : (f:boolean) => f ? "وجعلكِ"            : "وجعلكَ",
  withHim   : (f:boolean) => f ? "معها"              : "معه",
  hasExam   : (f:boolean) => f ? "لديها"             : "لديه",
  testHim   : (f:boolean) => f ? "واختبارها"         : "واختباره",
  forHer    : (f:boolean) => f ? "أمرها"             : "أمره",
  himGuard  : (f:boolean) => f ? "منها"              : "منه",
  readySt   : (f:boolean) => f ? "مستعدة"            : "مستعد",
  willTest  : (f:boolean) => f ? "ستُختبرين"         : "ستُختبر",
  passedV   : (f:boolean) => f ? "اجتازت"            : "اجتاز",
  resumedV  : (f:boolean) => f ? "استأنفت"           : "استأنف",
  passedExam: (f:boolean) => f ? "أجزتِ"             : "أجزتَ",
  finished  : (f:boolean) => f ? "أتمت"              : "أتم",
  iElmak    : (tF:boolean) => tF ? "إعلامكِ"         : "إعلامكَ",
  bless     : (tF:boolean) => tF ? "جزاكِ الله خيرًا": "جزاكَ الله خيرًا",
  supAdj    : (tF:boolean) => tF ? "الخاصة"          : "الخاص",
  supPrn    : (sF:boolean) => sF ? "بها"             : "به",
  assigned  : (tF:boolean) => tF ? "تم تكليفكِ"      : "تم تكليفكَ",
  byTeacher : (tF:boolean) => tF ? "قِبَلكِ"          : "قِبَلكَ",
  callWithYou:(tF:boolean) => tF ? "معكِ"            : "معكَ",
  yTeach    : (tF:boolean) => tF ? "وأنتِ"           : "وأنتَ",
  fromYou   : (tF:boolean) => tF ? "منكِ"            : "منكَ",
  mukalaf   : (tF:boolean) => tF ? "مكلفةٌ"          : "مكلفٌ",
  yourEffort: (tF:boolean) => tF ? "جهودكِ"          : "جهودكَ",
  absent    : (f:boolean) => f ? "غائبةٌ"            : "غائبٌ",
  onHoliday : (f:boolean) => f ? "مجازةٌ"            : "مجازٌ",
  teacherHol: (tF:boolean)=> tF? "المشرفةُ مجازةٌ"  : "المشرفُ مجازٌ",
  notEval   : () =>              "لم يتم التقييم",
  perfect   : (f:boolean) => f ? "مُتقنةٌ"           : "مُتقنٌ",
  good      : () =>              "إمتياز",
  veryGood  : () =>              "جيد جداً",
  rejectDay : (tomorrow:boolean) =>
    `رسوبٌ — يُعاد التسميع ${tomorrow ? "بعد غدٍ" : "ليوم غدٍ"}`,
  rejectDayExam: (tomorrow:boolean) =>
    `رسوبٌ — يُعاد الاختبار ${tomorrow ? "بعد غدٍ" : "ليوم غدٍ"}`,
};

// ════════════════════════════════════════════════════════════════════
//  دوال مساعدة عامة
// ════════════════════════════════════════════════════════════════════
function todayStr(): string {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Baghdad" }))
    .toISOString().split("T")[0];
}
function addDays(d: string, n: number): string {
  const dt = new Date(d); dt.setDate(dt.getDate() + n);
  return dt.toISOString().split("T")[0];
}
function diffDays(a: string, b: string): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000);
}
function convertPhone(p: string): string {
  const s = String(p ?? "").trim();
  if (s.startsWith("964"))  return "0" + s.slice(3);
  if (s.startsWith("+964")) return "0" + s.slice(4);
  return s;
}
function parseAbsence(raw: any): AbsenceData {
  if (typeof raw === "number")
    return { total: raw, last_check: null, last_stopped_at: null, stopped_abs_total: 0 };
  if (typeof raw === "object" && raw !== null)
    return {
      total:             Number(raw.total             ?? 0),
      last_check:        raw.last_check      != null ? Number(raw.last_check)      : null,
      last_stopped_at:   raw.last_stopped_at != null ? String(raw.last_stopped_at) : null,
      stopped_abs_total: Number(raw.stopped_abs_total ?? 0),
    };
  return { total: 0, last_check: null, last_stopped_at: null, stopped_abs_total: 0 };
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
    const { data } = await supabase.from("quran_index")
      .select("page_number, page_name").in("page_number", pages);
    const map: Record<number, string> = {};
    for (const r of data ?? []) map[r.page_number] = r.page_name;
    return [...new Set(pages.map(p => map[p] ?? String(p)))].join(" & ");
  } catch { return String(page); }
}
function untilDate(base: string, shift: boolean): string {
  return addDays(base, 1 + (shift ? 1 : 0));
}
function fmtBaghdadTime(ts: string | null | undefined): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    const local = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Baghdad" }));
    let h = local.getHours();
    const m = String(local.getMinutes()).padStart(2, "0");
    const ampm = h >= 12 ? "م" : "ص";
    h = h % 12 || 12;
    return `${h}:${m}${ampm}`;
  } catch { return ""; }
}

// ════════════════════════════════════════════════════════════════════
//  نظام الإجازات
// ════════════════════════════════════════════════════════════════════
function resolveNewStatus(
  userId: string, teacherId: string,
  isPublicHol: boolean,
  teacherHols: Set<string>,
  userHols: Set<string>
): string {
  if (isPublicHol)                return "public_holiday";
  if (teacherHols.has(teacherId)) return "teacher_holiday";
  if (userHols.has(userId))       return "holiday";
  return "not_ready";
}

function holidayNoteByStatus(
  newSt: string, isPage: boolean,
  isFU: boolean, iFT: boolean
): string {
  const typeWord = isPage ? "الحفظ" : "الاختبار";
  if (newSt === "holiday")
    return `*(يوم غد ${isFU ? "مجازة" : "مجاز"} يؤجل ${typeWord} لليوم الذي يليه)*`;
  if (newSt === "public_holiday")
    return `*(يوم غد إجازة عامة يؤجل ${typeWord} لليوم الذي يليه)*`;
  if (newSt === "teacher_holiday")
    return `*(يوم غد ${iFT ? "المشرفة مجازة" : "المشرف مجاز"} يؤجل ${typeWord} لليوم الذي يليه)*`;
  return "";
}

function translateResult(status: string, pageStatus: string, isFU: boolean, iFT: boolean): string {
  if (status === "not_ready" || status === "user_absence") return isFU ? "غائبة" : "غائب";
  if (status === "ready" || status === "teacher_absence")  return iFT ? "المشرفة غائبة" : "المشرف غائب";
  if (status === "finished" && pageStatus === "reject")    return "رسوب";
  if (status === "finished" && pageStatus === "good")      return "إمتياز";
  if (status === "finished" && pageStatus === "very_good") return "جيد جداً";
  if (status === "finished" && pageStatus === "perfect")   return isFU ? "مُتقِنة" : "مُتقِن";
  if (status === "holiday")        return isFU ? "مجازة" : "مجاز";
  if (status === "public_holiday") return "إجازة عامة";
  if (status === "teacher_holiday")return iFT ? "المشرفة مجازة" : "المشرف مجاز";
  return status;
}

// ════════════════════════════════════════════════════════════════════
//  فحص الرسوب / الغياب المتتالي
// ════════════════════════════════════════════════════════════════════
const SKIP_ST = new Set([
  "holiday","public_holiday","teacher_holiday","in_test","user_absence","teacher_absence","sus_to_act"
]);
async function checkTriple(
  supabase: any, userId: string, saveId: string,
  table: "users_pages" | "users_pages_tests",
  kind: "absence" | "reject",
  examType?: ExamType
): Promise<TripleResult> {
  let q = supabase.from(table).select("status, page_status, date")
    .eq("user_id", userId).eq("save_id", saveId)
    .order("id", { ascending: false }).limit(60);
  if (examType) q = q.eq("type", examType);
  const { data } = await q;
  if (!data?.length) return { isTriple: false, dates: [] };
  let cnt = 0; const dates: string[] = [];
  for (const r of data) {
    const st = String(r.status ?? ""); const pst = String(r.page_status ?? "");
    if (SKIP_ST.has(st) && st !== "user_absence") continue;
    if (st === "sus_to_act") break;
    if (st === "finished" && (pst === "good" || pst === "perfect" || pst === "very_good")) break;
    if (kind === "reject" && st === "finished" && pst === "reject") {
      cnt++; dates.push(String(r.date ?? "").split("T")[0]); if (cnt >= 3) return { isTriple: true, dates };
      continue;
    }
    if (kind === "absence" && st === "user_absence") {
      cnt++; dates.push(String(r.date ?? "").split("T")[0]); if (cnt >= 3) return { isTriple: true, dates };
      continue;
    }
    if (SKIP_ST.has(st)) continue;
    break;
  }
  return { isTriple: false, dates };
}

// ════════════════════════════════════════════════════════════════════
//  تعليق الحفظ
// ════════════════════════════════════════════════════════════════════
async function suspendSave(
  supabase: any, saveId: string, kind: StopVariant,
  dates: string[], saveName: string, currentStatus: string, isExam = false
): Promise<void> {
  const ctx = isExam ? `لاختبار الحفظ (${saveName})` : "";
  const reason = kind === "absence"
    ? [`الغياب لثلاثة أيام ${ctx}`,
       `الغياب الأول: ${dates[0] ?? "—"}`,
       `الغياب الثاني: ${dates[1] ?? "—"}`,
       `الغياب الثالث: ${dates[2] ?? "—"}`].join("\n")
    : [`الرسوب لثلاث مرات متتالية ${ctx}:`,
       `الرسوب الأول: ${dates[0] ?? "—"}`,
       `الرسوب الثاني: ${dates[1] ?? "—"}`,
       `الرسوب الثالث: ${dates[2] ?? "—"}`].join("\n");
  const upd: any = { status: "SUSPENDED", old_status: currentStatus, status_reason: reason };
  if (isExam) {
    const eType = currentStatus === "IN_EXAM1" ? "EXAM1" : "EXAM2";
    if (eType === "EXAM1") { upd.exam1_status = "SUSPENDED"; upd.exam1_status_page = "SUSPENDED"; }
    else                   { upd.exam2_status = "SUSPENDED"; upd.exam2_status_page = "SUSPENDED"; }
  }
  await supabase.from("users_saves").update(upd).eq("id", saveId);
}

// ════════════════════════════════════════════════════════════════════
//  إنشاء الصفوف
// ════════════════════════════════════════════════════════════════════
async function createPageRow(
  supabase: any, userId: string, saveId: string,
  teacherId: string, teacherName: string, teacherPhoto: string,
  page: number, edp: number, fields: Record<string, any>
): Promise<boolean> {
  try {
    const pageName = await getPageNames(supabase, page, edp);
    const { data, error } = await supabase.from("users_pages").insert([{
      user_id: userId, save_id: saveId,
      teacher_id: teacherId, teacher_name: teacherName, teacher_photo: teacherPhoto,
      status: "not_ready", page_status: "not_ready",
      errors_number: { sowad: 0, nisyan: 0 },
      created_at: new Date().toISOString(),
      page, page_name: pageName, ...fields,
    }]).select("*");
    if (error) { console.error("[PAGE INSERT]:", JSON.stringify(error, Object.getOwnPropertyNames(error))); return false; }
    if (data?.length > 0) { console.log(`[PAGE INSERT OK] id=${data[0].id}`); return true; }
    return false;
  } catch (e) { console.error("[PAGE INSERT EXCEPTION]:", e); return false; }
}

async function createTestRow(
  supabase: any, userId: string, saveId: string,
  examTId: string, examTName: string,
  examType: ExamType, startPage: number, endPage: number,
  fields: Record<string, any>
): Promise<boolean> {
  try {
    const { data, error } = await supabase.from("users_pages_tests").insert([{
      user_id: userId, save_id: saveId,
      teacher_id: examTId, teacher_name: examTName,
      status: "not_ready", page_status: "not_ready",
      errors_number: { sowad: 0, nisyan: 0, fateh: 0 },
      type: examType, start_page: startPage, end_page: endPage,
      created_at: new Date().toISOString(),
      date: todayStr(), ...fields,
    }]).select("*");
    if (error) { console.error("[TEST ROW INSERT]:", JSON.stringify(error, Object.getOwnPropertyNames(error))); return false; }
    if (data?.length > 0) { console.log(`[TEST ROW INSERT OK] id=${data[0].id}`); return true; }
    return false;
  } catch (e) { console.error("[TEST ROW INSERT EXCEPTION]:", e); return false; }
}

async function updateTeacherAbsence(supabase: any, teacherId: string, dateVal: string, userName: string) {
  try {
    const { data: t } = await supabase.from("teachers").select("absence").eq("teacher_id", teacherId).maybeSingle();
    let aj: any = t?.absence ?? {};
    if (typeof aj === "string") { try { aj = JSON.parse(aj); } catch { aj = {}; } }
    const dk = String(dateVal ?? todayStr()).split("T")[0];
    if (!aj[dk]) aj[dk] = { users_names: userName };
    else { const n = aj[dk].users_names ?? ""; aj[dk].users_names = n ? `${n}, ${userName}` : userName; }
    await supabase.from("teachers").update({ absence: aj }).eq("teacher_id", teacherId);
  } catch (e) { console.error(`[updateTeacherAbsence]:`, e); }
}

async function updateSaveExamFields(
  supabase: any, saveId: string, examType: ExamType, status: string, statusPage: string
) {
  const upd: Record<string, string> = {};
  if (examType === "EXAM1") { upd.exam1_status = status; upd.exam1_status_page = statusPage; }
  else                      { upd.exam2_status = status; upd.exam2_status_page = statusPage; }
  await supabase.from("users_saves").update(upd).eq("id", saveId);
}

// ════════════════════════════════════════════════════════════════════
//  رسائل الحفظ اليومي
// ════════════════════════════════════════════════════════════════════
function msgAbsence(
  saveName: string, pageDisp: string,
  absCount: number, isFU: boolean, iFT: boolean, forFather: boolean,
  variant: PageVariant, holNote: string, fullName: string
): string {
  const nameLbl = forFather ? G.guardian(isFU) : G.student(isFU);
  let sLbl: string; let sEmoji: string;
  if (variant === "absence")         { sLbl = G.absent(isFU); sEmoji = "🔴"; }
  else if (variant === "teacher_absence") { sLbl = G.notEval(); sEmoji = "🔔"; }
  else                               { sLbl = G.notEval(); sEmoji = "🔔"; }
  const today = todayStr();
  const lines = [
    ...hdr(nameLbl, fullName), T.SEP,
    `📚 الحفظ: *${saveName}*`,
    `📄 الصفحة:   *${pageDisp}*`,
    `${sEmoji} الحالة:    *${sLbl}*`,
    `📅 النتيجة: *يُؤجَّل الحفظ من ${today} إلى ${addDays(today, 1)}*`,
  ];
  if (holNote) lines.push(holNote);
  if (variant === "absence") lines.push(`🔢 عدد الغيابات: *${absCount}*`);
  lines.push(T.SEP, ``, T.FOOTER);
  return lines.join("\n");
}

function msgFinished(
  saveName: string, pageDisp: string, ps: string, errors: any,
  nextPagesText: string, isFU: boolean, iFT: boolean, forFather: boolean,
  inTest: boolean, holNote: string, fullName: string, tomorrowIsHol: boolean
): string {
  const nameLbl = forFather ? G.guardian(isFU) : G.student(isFU);
  let rLbl: string; let rEmoji: string;
  if      (ps === "perfect")   { rLbl = G.perfect(isFU);            rEmoji = "🌟"; }
  else if (ps === "good")      { rLbl = G.good();                   rEmoji = "✅"; }
  else if (ps === "very_good") { rLbl = G.veryGood();               rEmoji = "✅"; }
  else                         { rLbl = G.rejectDay(tomorrowIsHol); rEmoji = "❌"; }
  const lines = [
    ...hdr(nameLbl, fullName), T.SEP,
    `📚 الحفظ:       *${saveName}*`,
    `📄 الصفحة:       *${pageDisp}*`,
    `🔖 الحالة:       *تم التقييم*`,
    `${rEmoji} النتيجة:     *${rLbl}*`,
    T.SEP,
    `🔴 أخطاء السواد: *${errors?.sowad  ?? 0}*`,
    `💭 النسيان:      *${errors?.nisyan ?? 0}*`,
    T.SEP,
    `📝 حفظ الغد:     *${nextPagesText}*`,
  ];
  if (inTest) lines.push(`⚠️ _يتوقف الحفظ مؤقتًا ويُستأنف بعد إكمال الاختبار_`);
  if (holNote) lines.push(holNote);
  lines.push(T.SEP, ``, T.FOOTER);
  return lines.join("\n");
}

function msgFatherReject(saveName: string, pageDisp: string, fullName: string, isFU: boolean): string {
  return [
    ...hdr(G.guardian(isFU), fullName), T.SEP,
    `📚 الحفظ: *${saveName}*`,
    `📄 الصفحة: *${pageDisp}*`,
    `❌ الحالة: *رسوب*`,
    `📞 يُرجى التواصل مع إدارة المركز على الرقم: *${T.ADMIN}*`,
    T.SEP, ``, T.FOOTER,
  ].join("\n");
}

function msgNewSave(saveName: string, fullName: string, isFU: boolean, pageDisp: string, forFather: boolean): string {
  const nameLbl = forFather ? G.guardian(isFU) : G.student(isFU);
  return [
    ...hdr(nameLbl, fullName), T.SEP,
    `📚 الحفظ: *${saveName}*`,
    `📝 حفظ الغد: *${pageDisp}*`,
    T.SEP, ``, T.FOOTER,
  ].join("\n");
}

function msgSuspend(
  saveName: string, kind: StopVariant,
  fullName: string, isFU: boolean, iFT: boolean,
  target: StopTarget, fatherPhone: string,
  absData?: AbsenceData
): string {
  const reason = kind === "absence"
    ? "كثرة الغيابات أثناء فترة الحفظ"
    : "الرسوب المتكرر في التسميع";
  if (target === "admin") {
    const lines = [
      T.HEADER, ``, T.SEP, `🔴 *تنبيه إداري — إيقاف حفظ*`, T.SEP, ``,
      `📚 الحفظ: *${saveName}*`, `${G.student(isFU)}: *${fullName}*`, ``,
      `تم إيقاف ${G.his(isFU)} بسبب ${reason}.`,
    ];
    if (kind === "absence" && absData) {
      lines.push(`📊 عدد الغيابات الكلي: *${absData.total}*`);
      if (absData.last_stopped_at) lines.push(`📅 آخر إيقاف: *${absData.last_stopped_at}*`);
    }
    lines.push(
      ``, `✅ تم إبلاغ ولي ${G.forHer(isFU)} وطُلب منه التواصل معكم.`,
      `✅ تم إبلاغ ${G.teacherLbl(iFT)} ${G.supAdj(iFT)} ${G.supPrn(isFU)} بإيقاف الحفظ.`, ``,
      `📞 إذا لم يتم التواصل خلال 24 ساعة يُرجى الاتصال على ولي ${G.forHer(isFU)}:`,
      `*${fatherPhone}*`, ``,
      T.SEP, ``, `نسخة منها إلى:`, ...T.COPIES, T.SEP,
    );
    return lines.join("\n");
  }
  if (target === "teacher") {
    return [
      T.HEADER, ``, T.SEP, `🔴 *إشعار إيقاف حفظ*`, T.SEP, ``,
      `📚 الحفظ: *${saveName}*`, `${G.student(isFU)}: *${fullName}*`, ``,
      `تم إيقاف ${G.his(isFU)} بسبب ${reason}.`,
      `📌 في حال استئناف ${G.his(isFU)} سيتم ${G.iElmak(iFT)} بذلك.`, T.SEP,
    ].join("\n");
  }
  const nameLbl = target === "father" ? G.guardian(isFU) : G.student(isFU);
  const his     = target === "father" ? G.his(isFU) : G.hisSelf(isFU);
  return [
    ...hdr(nameLbl, fullName), T.SEP,
    `📚 الحفظ: *${saveName}*`,
    `❌ تم إيقاف ${his} بسبب ${reason}.`,
    `📞 يُرجى التواصل مع إدارة المركز على الرقم: *${T.ADMIN}*`,
    T.SEP, ``, T.FOOTER,
  ].join("\n");
}

// ════════════════════════════════════════════════════════════════════
//  رسائل اكتمال الحفظ
// ════════════════════════════════════════════════════════════════════
function msgCompletionStudent(
  saveName: string, fullName: string, isFU: boolean,
  exam1Req: boolean, exam1TName: string, exam2Req: boolean, examDate: string
): string {
  const lines = [...hdr(G.student(isFU), fullName), T.SEP, `📚 الحفظ: *${saveName}*`, ``, T.BAYT, ``];
  if (!exam1Req && !exam2Req) {
    lines.push(
      `سيتم إبلاغ الإدارة بذلك وسيتم إضافة حفظ جديد ${G.toHim(isFU)}.`,
      `بارك الله ${G.inHim(isFU)} ${G.makeHim(isFU)} من الحفاظ والمداوميين على كتاب الله تعالى.`,
    );
  } else if (exam1Req) {
    lines.push(`بعد غدٍ (${examDate}) سيكون ${G.toHim(isFU)} اختبار بكامل ${G.hisSelf(isFU)}.`);
    if (exam1TName) lines.push(`🎓 ${G.willTest(isFU)} عند: *${exam1TName}*`);
    lines.push(`بارك الله ${G.inHim(isFU)} ${G.makeHim(isFU)} من الحفاظ والمداوميين على كتاب الله تعالى.`);
  }
  if (exam2Req) lines.push(``, `📌 يُرجى التجهز للاختبار التراكمي — يوم غدٍ استراحة وبعده اختبار تراكمي بكل ${G.hisSelf(isFU)} خلال فترة الحفظ.`);
  lines.push(T.SEP, ``, T.FOOTER);
  return lines.join("\n");
}

function msgCompletionGuardian(
  saveName: string, fullName: string, isFU: boolean,
  exam1Req: boolean, exam2Req: boolean, examDate: string
): string {
  const lines = [
    ...hdr(G.guardian(isFU), fullName), T.SEP,
    `📚 الحفظ: *${saveName}*`, ``, T.BAYT, ``,
    `أتمَّ ${G.student(isFU)} *${fullName}* ${G.his(isFU)} بحمد الله.`,
  ];
  if (!exam1Req && !exam2Req) lines.push(`سيتم التواصل معكم من قِبَل الإدارة لتحديد حفظ جديد ${G.him(isFU)}.`);
  else if (exam1Req)           lines.push(`بعد غدٍ (${examDate}) سيكون ${G.him(isFU)} اختبار بكامل ${G.his(isFU)}.`);
  if (exam2Req)                lines.push(`📌 وبعد الاختبار سيكون اختبار تراكمي بكامل ${G.his(isFU)} خلال فترة الحفظ.`);
  lines.push(T.SEP, ``, T.FOOTER);
  return lines.join("\n");
}

function msgCompletionTeacher(
  saveName: string, fullName: string, isFU: boolean, iFT: boolean,
  exam1Req: boolean, exam2Req: boolean, exam2TName: string, examDate: string
): string {
  const lines = [
    T.HEADER, ``, T.SEP,
    `📚 الحفظ: *${saveName}*`, `${G.student(isFU)}: *${fullName}*`, ``,
    `أتمَّ ${G.his(isFU)} بحمد الله.`, ``,
  ];
  if (!exam1Req && !exam2Req) lines.push(`تم إبلاغ الإدارة وسيتم تحديد حفظ جديد ${G.him(isFU)}.`);
  else if (exam1Req)           lines.push(`بعد غدٍ (${examDate}) ${G.willTest(isFU)} بكامل ${G.his(isFU)}.`);
  if (exam2Req && exam2TName)  lines.push(`📌 بعد الاختبار سيكون اختبار تراكمي — عند *${exam2TName}*`);
  lines.push(``, G.bless(iFT) + ` على حسن التعاون والتزامك في نشر هذا العلم.`, T.SEP);
  return lines.join("\n");
}

function msgCompletionAdmin(saveName: string, fullName: string, isFU: boolean, exam1Req: boolean): string {
  return [
    T.HEADER, ``, T.SEP, `📋 *إتمام حفظ*`, T.SEP, ``,
    `📚 الحفظ: *${saveName}*`, `${G.student(isFU)}: *${fullName}*`, ``,
    `أتمَّ ${G.his(isFU)} بحمد الله.`,
    exam1Req ? `📌 ${G.willTest(isFU)} بعد غدٍ — يُرجى المتابعة.` : `📌 يُرجى تحديد حفظ جديد ${G.him(isFU)} ليبدأ به.`,
    T.SEP,
  ].join("\n");
}

// ════════════════════════════════════════════════════════════════════
//  رسائل الاختبارات
// ════════════════════════════════════════════════════════════════════
function msgExamAssignTeacher(
  saveName: string, fullName: string, isFU: boolean, iFT: boolean,
  startPage: number, endPage: number, examType: ExamType,
  studentPhone: string, examDate: string
): string {
  const isCumul  = examType === "EXAM2";
  const examDesc = isCumul
    ? `الاختبار التراكمي الكلي للحفظ (${saveName})`
    : `اختبار الحفظ الكلي لـ(${saveName}) من الصفحة *${startPage}* إلى *${endPage}*`;
  return [
    T.HEADER, ``, T.SEP, `📋 *تكليف اختبار*`, T.SEP, ``,
    `${G.student(isFU)}: *${fullName}*`,
    `📚 الحفظ: *${saveName}*`, ``,
    `سيكون بعد غدٍ (${examDate}) ${examDesc}.`,
    `${G.assigned(iFT)} لاختباره — يُرجى التواصل ${G.callWithYou(iFT)} على الرقم: *${convertPhone(studentPhone)}*`,
    T.SEP,
  ].join("\n");
}

function msgExamDayStudent(
  saveName: string, fullName: string, isFU: boolean,
  examTName: string, examTPhone: string, examType: ExamType,
  startPage: number, endPage: number, iEFT: boolean
): string {
  const isCumul  = examType === "EXAM2";
  const examDesc = isCumul
    ? `اختبار تراكمي بكامل ${G.hisSelf(isFU)} خلال فترة الحفظ`
    : `اختبار بالحفظ الكلي لـ(${saveName}) من الصفحة *${startPage}* إلى *${endPage}*`;
  return [
    ...hdr(G.student(isFU), fullName), T.SEP,
    `📚 الحفظ: *${saveName}*`,
    `🗒️ يوم غدٍ ${G.toHim(isFU)} ${examDesc}`,
    `🎓 ${G.teacherLbl(iEFT)} على الاختبار: *${examTName}*`,
    `📞 رقم ${G.teacherLbl(iEFT)}: *${convertPhone(examTPhone)}*`,
    T.SEP, ``, T.FOOTER,
  ].join("\n");
}

function msgExamDayGuardian(
  saveName: string, fullName: string, isFU: boolean,
  examTName: string, examType: ExamType, iEFT: boolean
): string {
  const isCumul  = examType === "EXAM2";
  const examDesc = isCumul
    ? `اختبار تراكمي بكامل ${G.his(isFU)}`
    : `اختبار بالحفظ الكلي لـ(${saveName})`;
  return [
    ...hdr(G.guardian(isFU), fullName), T.SEP,
    `📚 الحفظ: *${saveName}*`,
    `🗒️ ${G.hasExam(isFU)} ${G.student(isFU)} *${fullName}* يوم غدٍ ${examDesc}`,
    `🎓 ${G.teacherLbl(iEFT)} على الاختبار: *${examTName}*`,
    T.SEP, ``, T.FOOTER,
  ].join("\n");
}

function msgExamDayExamTeacher(
  saveName: string, fullName: string, isFU: boolean, iFT: boolean,
  studentPhone: string, examType: ExamType,
  startPage: number, endPage: number
): string {
  const isCumul  = examType === "EXAM2";
  const examDesc = isCumul
    ? `اختبار تراكمي بكامل ${G.his(isFU)}`
    : `اختبار بالحفظ الكلي لـ(${saveName}) من الصفحة *${startPage}* إلى *${endPage}*`;
  return [
    T.HEADER, ``, T.SEP, `📋 *تذكير اختبار اليوم*`, T.SEP, ``,
    `${G.student(isFU)}: *${fullName}*`,
    `📚 الحفظ: *${saveName}*`, ``,
    `${G.hasExam(isFU)} يوم غدٍ ${examDesc}`,
    `${G.yTeach(iFT)} ${G.teacherLbl(iFT)} المكلَّف باختباره.`,
    `📞 رقم ${G.student(isFU)}: *${convertPhone(studentPhone)}*`,
    T.SEP,
  ].join("\n");
}

function msgExamSessionResult(
  saveName: string, fullName: string, isFU: boolean, iFT: boolean,
  target: "student" | "father" | "examTeacher",
  variant: ExamVariant, delayDate: string,
  holNote: string, examType: ExamType, absCount?: number
): string {
  const isCumul   = examType === "EXAM2";
  const examLabel = isCumul ? "الاختبار التراكمي" : `اختبار الحفظ (${saveName})`;
  const delayTxt  = `ليوم غدٍ (${delayDate})`;
  const today     = todayStr();

  if (target === "examTeacher") {
    let txt: string;
    if (variant === "teacher_absence")
      txt = `لم يتم إجراء اختبار ${G.student(isFU)} *${fullName}* — يُؤجَّل ${examLabel} ${delayTxt}.`;
    else if (variant === "user_absence")
      txt = `${G.student(isFU)} *${fullName}* ${G.absent(isFU)} — يُؤجَّل ${examLabel} ${delayTxt}.`;
    else
      txt = `رسب ${G.student(isFU)} *${fullName}* في ${examLabel} — يُعاد ${delayTxt}.`;
    const lines = [T.HEADER, ``, T.SEP, txt];
    if (holNote) lines.push(holNote);
    lines.push(T.SEP);
    return lines.join("\n");
  }

  const nameLbl = target === "father" ? G.guardian(isFU) : G.student(isFU);
  const lines   = [
    ...hdr(nameLbl, fullName), T.SEP,
    `📚 الحفظ: *${saveName}*`,
    `🗒️ ${examLabel}`,
  ];
  if (variant === "teacher_absence") {
    lines.push(`🔔 الحالة: *${G.notEval()}*`, `📅 يُؤجَّل الاختبار من ${today} إلى ${addDays(today, 1)}`);
  } else if (variant === "user_absence") {
    lines.push(`🔴 الحالة: *${G.absent(isFU)}*`, `📅 يُؤجَّل الاختبار من ${today} إلى ${addDays(today, 1)}`);
    if (absCount != null) lines.push(`🔢 عدد الغيابات: *${absCount}*`);
  } else {
    lines.push(`❌ النتيجة: *رسوبٌ — يُعاد الاختبار ${delayTxt}*`);
  }
  if (holNote) lines.push(holNote);
  lines.push(T.SEP, ``, T.FOOTER);
  return lines.join("\n");
}

function msgExamSessionFinished(
  saveName: string, fullName: string, isFU: boolean, iFT: boolean,
  target: "student" | "father", ps: string, errors: any, examType: ExamType
): string {
  const examLabel = examType === "EXAM2" ? "الاختبار التراكمي" : "اختبار الحفظ";
  const nameLbl   = target === "father" ? G.guardian(isFU) : G.student(isFU);
  let rLbl: string; let rEmoji: string;
  if      (ps === "perfect")   { rLbl = G.perfect(isFU);        rEmoji = "🌟"; }
  else if (ps === "good")      { rLbl = G.good();               rEmoji = "✅"; }
  else if (ps === "very_good") { rLbl = G.veryGood();           rEmoji = "✅"; }
  else                         { rLbl = G.rejectDayExam(false); rEmoji = "❌"; }
  return [
    ...hdr(nameLbl, fullName), T.SEP,
    `📚 الحفظ:       *${saveName}*`,
    `📝 النوع:        *${examLabel}*`,
    `🔖 الحالة:       *تم التقييم*`,
    `${rEmoji} النتيجة:     *${rLbl}*`,
    T.SEP,
    `🔴 أخطاء السواد: *${errors?.sowad  ?? 0}*`,
    `💭 النسيان:      *${errors?.nisyan ?? 0}*`,
    T.SEP, ``, T.FOOTER,
  ].join("\n");
}

function msgExam1PassStudent(
  saveName: string, fullName: string, isFU: boolean,
  exam2Req: boolean, exam2TName: string, exam2TPhone: string,
  iE2FT: boolean, exam2Date: string
): string {
  const lines = [
    ...hdr(G.student(isFU), fullName), T.SEP, `📚 الحفظ: *${saveName}*`, ``,
    `🎉✨ ${G.passedExam(isFU)} اختبار ${G.hisSelf(isFU)} بحمد الله! مبارك ${G.toHim(isFU)} ✨🎉`, ``,
  ];
  if (exam2Req) {
    lines.push(`📌 يُرجى التجهز للاختبار التراكمي — يوم غدٍ استراحة وبعد غدٍ (${exam2Date}) اختبار تراكمي بكل ${G.hisSelf(isFU)} خلال فترة الحفظ.`);
    if (exam2TName) lines.push(`🎓 ${G.teacherLbl(iE2FT)} على الاختبار التراكمي: *${exam2TName}*`, `📞 للتواصل: *${convertPhone(exam2TPhone)}*`);
  } else {
    lines.push(
      `سيتم إبلاغ الإدارة بذلك وسيتم إضافة حفظ جديد ${G.toHim(isFU)}.`,
      `بارك الله ${G.inHim(isFU)} ${G.makeHim(isFU)} من الحفاظ والمداوميين على كتاب الله تعالى.`,
    );
  }
  lines.push(T.SEP, ``, T.FOOTER);
  return lines.join("\n");
}

function msgExam1PassGuardian(
  saveName: string, fullName: string, isFU: boolean,
  exam2Req: boolean, exam2Date: string
): string {
  const lines = [
    ...hdr(G.guardian(isFU), fullName), T.SEP,
    `📚 الحفظ: *${saveName}*`, ``,
    `🎉 ${G.student(isFU)} *${fullName}* ${G.passedV(isFU)} اختبار ${G.his(isFU)} بحمد الله.`, ``,
  ];
  if (exam2Req) lines.push(`📌 وبعد غدٍ (${exam2Date}) سيكون ${G.him(isFU)} اختبار تراكمي بكامل ${G.his(isFU)} خلال فترة الحفظ.`);
  else          lines.push(`سيتم التواصل معكم من قِبَل الإدارة لتحديد حفظ جديد ${G.him(isFU)}.`);
  lines.push(T.SEP, ``, T.FOOTER);
  return lines.join("\n");
}

function msgExam2PassStudent(saveName: string, fullName: string, isFU: boolean): string {
  return [
    ...hdr(G.student(isFU), fullName), T.SEP, `📚 الحفظ: *${saveName}*`, ``, T.BAYT, ``,
    `🎉 اجتزت الاختبار التراكمي بحمد الله! مبارك ${G.toHim(isFU)}.`,
    `سيتم إبلاغ الإدارة وسيتم إضافة حفظ جديد ${G.toHim(isFU)}.`,
    `بارك الله ${G.inHim(isFU)} ${G.makeHim(isFU)} من الحفاظ والمداوميين على كتاب الله تعالى.`,
    T.SEP, ``, T.FOOTER,
  ].join("\n");
}

function msgExam2PassGuardian(saveName: string, fullName: string, isFU: boolean): string {
  return [
    ...hdr(G.guardian(isFU), fullName), T.SEP, `📚 الحفظ: *${saveName}*`, ``, T.BAYT, ``,
    `🎉 ${G.student(isFU)} *${fullName}* ${G.passedV(isFU)} الاختبار التراكمي للحفظ بحمد الله.`,
    `سيتم التواصل معكم من قِبَل الإدارة لتحديد حفظ جديد ${G.him(isFU)}.`,
    T.SEP, ``, T.FOOTER,
  ].join("\n");
}

function msgExam2PassAdmin(saveName: string, fullName: string, isFU: boolean): string {
  return [
    T.HEADER, ``, T.SEP, `📋 *إتمام الاختبار التراكمي*`, T.SEP, ``,
    `📚 الحفظ: *${saveName}*`, `${G.student(isFU)}: *${fullName}*`, ``,
    `اجتاز الاختبار التراكمي بحمد الله.`,
    `📌 يُرجى تحديد حفظ جديد ${G.him(isFU)} ليبدأ به.`,
    T.SEP,
  ].join("\n");
}

function msgSuspendExam(
  saveName: string, kind: StopVariant,
  fullName: string, isFU: boolean, iFT: boolean,
  target: StopTarget, fatherPhone: string,
  absData?: AbsenceData
): string {
  const reason = kind === "absence"
    ? "كثرة الغيابات أثناء فترة الاختبار"
    : "الرسوب المتكرر في الاختبار";
  if (target === "admin") {
    const lines = [
      T.HEADER, ``, T.SEP, `🔴 *تنبيه إداري — إيقاف اختبار حفظ*`, T.SEP, ``,
      `📚 الحفظ: *${saveName}*`, `${G.student(isFU)}: *${fullName}*`, ``,
      `تم إيقاف اختبار ${G.his(isFU)} بسبب ${reason}.`,
    ];
    if (kind === "absence" && absData) {
      lines.push(`📊 عدد الغيابات الكلي: *${absData.total}*`);
      if (absData.last_stopped_at) lines.push(`📅 آخر إيقاف: *${absData.last_stopped_at}*`);
    }
    lines.push(
      ``, `✅ تم إبلاغ ولي ${G.forHer(isFU)} وطُلب منه التواصل معكم.`,
      `✅ تم إبلاغ ${G.teacherLbl(iFT)} ${G.supAdj(iFT)} ${G.supPrn(isFU)} بإيقاف الاختبار.`, ``,
      `📞 إذا لم يتم التواصل خلال 24 ساعة يُرجى الاتصال على ولي ${G.forHer(isFU)}:`,
      `*${fatherPhone}*`, ``, T.SEP, ``, `نسخة منها إلى:`, ...T.COPIES, T.SEP,
    );
    return lines.join("\n");
  }
  if (target === "teacher") {
    return [
      T.HEADER, ``, T.SEP, `🔴 *إشعار إيقاف اختبار حفظ*`, T.SEP, ``,
      `📚 الحفظ: *${saveName}*`, `${G.student(isFU)}: *${fullName}*`, ``,
      `تم إيقاف اختبار ${G.his(isFU)} بسبب ${reason}.`,
      `📌 في حال استئنافه سيتم ${G.iElmak(iFT)} بذلك.`, T.SEP,
    ].join("\n");
  }
  const nameLbl = target === "father" ? G.guardian(isFU) : G.student(isFU);
  const his     = target === "father" ? G.his(isFU) : `اختبار ${G.hisSelf(isFU)}`;
  return [
    ...hdr(nameLbl, fullName), T.SEP,
    `📚 الحفظ: *${saveName}*`,
    `❌ تم إيقاف ${his} بسبب ${reason}.`,
    `📞 يُرجى التواصل مع إدارة المركز على الرقم: *${T.ADMIN}*`,
    T.SEP, ``, T.FOOTER,
  ].join("\n");
}

// ════════════════════════════════════════════════════════════════════
//  رسائل استئناف الحفظ
// ════════════════════════════════════════════════════════════════════
function msgResumeStudent(saveName: string, fullName: string, isFU: boolean, nextPageDisp: string): string {
  return [
    ...hdr(G.student(isFU), fullName), T.SEP,
    `📚 الحفظ: *${saveName}*`,
    `✨ مبارك استئناف ${G.hisSelf(isFU)} — حفظ (${saveName})`,
    `📝 حفظ الغد: *${nextPageDisp}*`,
    T.SEP, ``, T.FOOTER,
  ].join("\n");
}

function msgResumeTeacher(saveName: string, studentName: string, isFU: boolean, iFT: boolean): string {
  return [
    T.HEADER, ``, T.SEP, `✨ *إشعار استئناف حفظ*`, T.SEP, ``,
    `📚 الحفظ: *${saveName}*`, `${G.student(isFU)}: *${studentName}*`, ``,
    `نود ${G.iElmak(iFT)} بأن ${G.student(isFU)} قد ${G.resumedV(isFU)} ${G.his(isFU)} بنجاح.`,
    `📌 سيتم ${G.iElmak(iFT)} بمجرد جاهزية ${G.student(isFU)} للتسميع.`, ``,
    T.SEP, ``, T.FOOTER,
  ].join("\n");
}

function msgResumeExamStudent(
  saveName: string, fullName: string, isFU: boolean,
  examTName: string, examTPhone: string, iEFT: boolean, examDate: string
): string {
  return [
    ...hdr(G.student(isFU), fullName), T.SEP,
    `📚 الحفظ: *${saveName}*`,
    `✨ تم استئناف ${G.hisSelf(isFU)} بنجاح.`,
    `📅 ستختبر يوم (${examDate}) بكامل (${saveName}).`,
    `🎓 عند ${G.teacherLbl(iEFT)}: *${examTName}*`,
    `📞 للتواصل: *${convertPhone(examTPhone)}*`,
    T.SEP, ``, T.FOOTER,
  ].join("\n");
}

// ════════════════════════════════════════════════════════════════════
//  الدالة الرئيسية
// ════════════════════════════════════════════════════════════════════
Deno.serve(async (req: Request) => {
  console.log("--- Pages System Function Started ---");

  const systemKeySecret = Deno.env.get("system_key") ?? "";
  if (req.headers.get("system_key") !== systemKeySecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl        = Deno.env.get("SUPABASE_URL")              ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const wahaUrl            = Deno.env.get("waha_url")                  ?? "";
  const wahaApiKey         = Deno.env.get("waha_api_key")              ?? "";

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const waha = async (phone: string, text: string) => {
    if (!phone || !wahaUrl || !wahaApiKey) { console.warn(`[WAHA] Skip phone="${phone}"`); return; }
    try {
      const res = await fetch(wahaUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": wahaApiKey },
        body: JSON.stringify({ chatId: `${phone}@c.us`, text, session: "default" }),
      });
      console.log(`[WAHA] → ${phone} HTTP ${res.status}`);
    } catch (err) { console.error(`[WAHA] → ${phone}:`, err); }
  };

  try {
    const today    = todayStr();
    const tomorrow = addDays(today, 1);

    // ── 1. إجازات الغد — جلب processed=false وتحديد ما ينطبق على الغد ──
    const { data: unprocessedHols } = await supabase
      .from("holidays").select("*").eq("processed", false);

    let isPublicHoliday             = false;
    const teacherHolidayIds         = new Set<string>();
    const userHolidayIds            = new Set<string>();
    const processedHolIds: number[] = [];

    const publicHolRow = (unprocessedHols ?? []).find(
      (h: any) => h.type === "ALL" && h.for_date === tomorrow
    );

    if (publicHolRow) {
      isPublicHoliday = true;
      processedHolIds.push(...(unprocessedHols ?? []).map((h: any) => h.id));
    } else {
      for (const h of unprocessedHols ?? []) {
        if (h.for_date !== tomorrow) continue;
        if (h.type === "FOR_TEACHER" && h.for_teacher_id) {
          teacherHolidayIds.add(String(h.for_teacher_id));
          processedHolIds.push(h.id);
        } else if (h.type === "FOR_USER" && h.for_user_id) {
          userHolidayIds.add(String(h.for_user_id));
          processedHolIds.push(h.id);
        }
      }
    }

    if (processedHolIds.length > 0) {
      await supabase.from("holidays").update({ processed: true }).in("id", processedHolIds);
    }

    // ── 2. أرقام الإدارة ──────────────────────────────────────────────────
    const { data: adminRows } = await supabase
      .from("admins").select("phone_number").eq("active", true);
    const adminPhones: string[] = (adminRows ?? []).map((a: any) => a.phone_number).filter(Boolean);

    // ── 3. الطلاب ──────────────────────────────────────────────────────────
    const { data: users, error: usersErr } = await supabase.from("users").select("*");
    if (usersErr) throw usersErr;

    const adminSummary: AdminSummaryRow[] = [];

    for (const user of users ?? []) {
      if (!user?.user_id || !user.save_id) continue;

      try {
        const { data: saveRow } = await supabase
          .from("users_saves").select("*").eq("id", user.save_id).maybeSingle();
        if (!saveRow) continue;

        let saveStatus = String(saveRow.status ?? "") as SaveStatus;
        if (["TERMINATED","FINISHED"].includes(saveStatus)) continue;

        const userId   = String(user.user_id);
        const saveId   = String(user.save_id);
        const isFU     = user.gender === "female";
        const edp      = Number(saveRow.every_day_page) || 1;
        const saveName = String(saveRow.name ?? "");

        const tIds = [saveRow.teacher_id, saveRow.exam1_teacher_id, saveRow.exam2_teacher_id].filter(Boolean);
        const { data: tRecs } = await supabase.from("teachers").select("*").in("teacher_id", tIds);
        const tMap: Record<string, any> = {};
        for (const r of tRecs ?? []) tMap[String(r.teacher_id)] = r;

        // ── استئناف SUSPENDED ─────────────────────────────────────────────
        if (saveStatus === "SUSPENDED") {
          const { data: lastP } = await supabase.from("users_pages")
            .select("status").eq("save_id", saveId).order("id", { ascending: false }).limit(1);
          const { data: lastT } = await supabase.from("users_pages_tests")
            .select("status").eq("save_id", saveId).order("id", { ascending: false }).limit(1);
          if (lastP?.[0]?.status === "sus_to_act" || lastT?.[0]?.status === "sus_to_act") {
            const oldSt = String(saveRow.old_status ?? "ACTIVE");
            await supabase.from("users_saves").update({ status: oldSt, old_status: null }).eq("id", saveId);
            saveStatus = oldSt as SaveStatus;
          } else { continue; }
        }

        const teacherId = String(saveRow.teacher_id ?? "");
        const tRec      = tMap[teacherId];
        const iFT       = (tRec?.gender ?? "male") === "female";
        const tPhone    = String(tRec?.phone_number ?? "");

        const newSt       = resolveNewStatus(userId, teacherId, isPublicHoliday, teacherHolidayIds, userHolidayIds);
        const holNote     = holidayNoteByStatus(newSt, true, isFU, iFT);
        const tomorrowIsHol = newSt !== "not_ready";

        // ════════════════════════════════════════════════════════
        //  ACTIVE — الحفظ اليومي
        // ════════════════════════════════════════════════════════
        if (saveStatus === "ACTIVE") {
          const { data: lPages } = await supabase.from("users_pages").select("*")
            .eq("user_id", userId).eq("save_id", saveId)
            .order("id", { ascending: false }).limit(1);
          const lastRow = lPages?.[0] ?? null;
          const inTest  = user.in_test === true;

          // ── لا يوجد صف — حفظ جديد بدون سجل ─────────────────────────────
          if (!lastRow) {
            const firstPage    = edp < 1 ? 1 : Math.ceil(edp);
            const firstPageNum = Number(saveRow.start_page) + firstPage - 1;
            const pageDisp     = buildPageDisplay(firstPageNum, edp);
            await createPageRow(supabase, userId, saveId, teacherId, tRec?.full_name ?? "", tRec?.photo_url ?? "", firstPageNum, edp,
              { status: newSt, page_status: newSt, date: tomorrow, MePageArabic: pageDisp });
            await waha(user.user_phone_number, msgNewSave(saveName, user.full_name, isFU, pageDisp, false));
            if (user.father_phone_number) await waha(user.father_phone_number, msgNewSave(saveName, user.full_name, isFU, pageDisp, true));
            continue;
          }

          const lastStatus = String(lastRow.status ?? "");
          const lastPage   = Number(lastRow.page);
          const lastDate   = String(lastRow.date ?? today).split("T")[0];

          // ── استئناف ───────────────────────────────────────────────────────
          if (lastStatus === "sus_to_act") {
            const nextPage = lastPage + Math.ceil(edp);
            const pageDisp = buildPageDisplay(nextPage, edp);
            await createPageRow(supabase, userId, saveId, teacherId, tRec?.full_name ?? "", tRec?.photo_url ?? "", nextPage, edp,
              { status: newSt, page_status: newSt, date: tomorrow, MePageArabic: pageDisp });
            await waha(user.user_phone_number, msgResumeStudent(saveName, user.full_name, isFU, pageDisp));
            if (tPhone) await waha(tPhone, msgResumeTeacher(saveName, user.full_name, isFU, iFT));
            adminSummary.push({ studentName: user.full_name, teacherName: tRec?.full_name ?? "", typeLabel: "حفظي",
              pageDisp: `ص${lastRow.MePageArabic ?? buildPageDisplay(lastPage, edp)}`,
              resultLabel: translateResult(lastStatus, lastRow.page_status, isFU, iFT),
              sowad: 0, nisyan: 0, fateh: "", readyAt: "", finishedAt: "",
              studentPhone: convertPhone(user.user_phone_number ?? ""), teacherPhone: convertPhone(tPhone) });
            continue;
          }

          let nextPageToAdd = lastPage + Math.ceil(edp);
          let sendStudent   = false;
          let studentMsg    = "";

          // ── الطالب غائب ───────────────────────────────────────────────────
          if (lastStatus === "not_ready") {
            await supabase.from("users_pages")
              .update({ status: "user_absence", page_status: "user_absence" }).eq("id", lastRow.id);
            const absData = parseAbsence(user.absence); absData.total += 1;
            await supabase.from("users").update({ absence: absData }).eq("user_id", userId);
            const { isTriple, dates } = await checkTriple(supabase, userId, saveId, "users_pages", "absence");
            if (isTriple) {
              await suspendSave(supabase, saveId, "absence", dates, saveName, "ACTIVE", false);
              const lf = convertPhone(user.father_phone_number ?? "");
              await waha(user.user_phone_number, msgSuspend(saveName,"absence",user.full_name,isFU,iFT,"student",lf,absData));
              if (user.father_phone_number) await waha(user.father_phone_number, msgSuspend(saveName,"absence",user.full_name,isFU,iFT,"father",lf,absData));
              if (tPhone) await waha(tPhone, msgSuspend(saveName,"absence",user.full_name,isFU,iFT,"teacher",lf,absData));
              for (const ap of adminPhones) await waha(ap, msgSuspend(saveName,"absence",user.full_name,isFU,iFT,"admin",lf,absData));
              adminSummary.push({ studentName: user.full_name, teacherName: tRec?.full_name ?? "", typeLabel: "حفظي",
                pageDisp: `ص${lastRow.MePageArabic ?? buildPageDisplay(lastPage, edp)}`,
                resultLabel: translateResult("user_absence","",isFU,iFT), sowad: 0, nisyan: 0, fateh: "", readyAt: "", finishedAt: "",
                studentPhone: convertPhone(user.user_phone_number ?? ""), teacherPhone: convertPhone(tPhone) });
              continue;
            }
            sendStudent = true; nextPageToAdd = lastPage;
            studentMsg = msgAbsence(saveName, buildPageDisplay(lastPage,edp), absData.total, isFU, iFT, false, "absence", holNote, user.full_name);
            adminSummary.push({ studentName: user.full_name, teacherName: tRec?.full_name ?? "", typeLabel: "حفظي",
              pageDisp: `ص${lastRow.MePageArabic ?? buildPageDisplay(lastPage, edp)}`,
              resultLabel: translateResult("user_absence","",isFU,iFT), sowad: 0, nisyan: 0, fateh: "", readyAt: "", finishedAt: "",
              studentPhone: convertPhone(user.user_phone_number ?? ""), teacherPhone: convertPhone(tPhone) });

          // ── المشرف غائب ───────────────────────────────────────────────────
          } else if (lastStatus === "ready") {
            await supabase.from("users_pages")
              .update({ status: "teacher_absence", page_status: "teacher_absence" }).eq("id", lastRow.id);
            await updateTeacherAbsence(supabase, teacherId, lastDate, user.full_name);
            sendStudent = true; nextPageToAdd = lastPage;
            studentMsg = msgAbsence(saveName, buildPageDisplay(lastPage,edp), 0, isFU, iFT, false, "teacher_absence", holNote, user.full_name);
            adminSummary.push({ studentName: user.full_name, teacherName: tRec?.full_name ?? "", typeLabel: "حفظي",
              pageDisp: `ص${lastRow.MePageArabic ?? buildPageDisplay(lastPage, edp)}`,
              resultLabel: translateResult("teacher_absence","",isFU,iFT), sowad: 0, nisyan: 0, fateh: "",
              readyAt: fmtBaghdadTime(lastRow.ready_at), finishedAt: "",
              studentPhone: convertPhone(user.user_phone_number ?? ""), teacherPhone: convertPhone(tPhone) });

          // ── صف إجازة ─────────────────────────────────────────────────────
          } else if (["holiday","teacher_holiday","public_holiday"].includes(lastStatus)) {
            sendStudent = true; nextPageToAdd = lastPage;
            studentMsg = msgAbsence(saveName, buildPageDisplay(lastPage,edp), 0, isFU, iFT, false, lastStatus as PageVariant, holNote, user.full_name);
            adminSummary.push({ studentName: user.full_name, teacherName: tRec?.full_name ?? "", typeLabel: "حفظي",
              pageDisp: `ص${lastRow.MePageArabic ?? buildPageDisplay(lastPage, edp)}`,
              resultLabel: translateResult(lastStatus,"",isFU,iFT), sowad: 0, nisyan: 0, fateh: "", readyAt: "", finishedAt: "",
              studentPhone: convertPhone(user.user_phone_number ?? ""), teacherPhone: convertPhone(tPhone) });

          // ── تم التقييم ────────────────────────────────────────────────────
          } else if (lastStatus === "finished") {
            const ps     = String(lastRow.page_status ?? "");
            const errors = lastRow.errors_number ?? { sowad: 0, nisyan: 0 };
            sendStudent  = true;

            if (ps === "reject") {
              const { isTriple, dates } = await checkTriple(supabase, userId, saveId, "users_pages", "reject");
              if (isTriple) {
                await suspendSave(supabase, saveId, "reject", dates, saveName, "ACTIVE", false);
                const lf = convertPhone(user.father_phone_number ?? "");
                await waha(user.user_phone_number, msgSuspend(saveName,"reject",user.full_name,isFU,iFT,"student",lf));
                if (user.father_phone_number) await waha(user.father_phone_number, msgSuspend(saveName,"reject",user.full_name,isFU,iFT,"father",lf));
                if (tPhone) await waha(tPhone, msgSuspend(saveName,"reject",user.full_name,isFU,iFT,"teacher",lf));
                for (const ap of adminPhones) await waha(ap, msgSuspend(saveName,"reject",user.full_name,isFU,iFT,"admin",lf));
                adminSummary.push({ studentName: user.full_name, teacherName: tRec?.full_name ?? "", typeLabel: "حفظي",
                  pageDisp: `ص${lastRow.MePageArabic ?? buildPageDisplay(lastPage, edp)}`,
                  resultLabel: translateResult("finished","reject",isFU,iFT),
                  sowad: errors?.sowad ?? 0, nisyan: errors?.nisyan ?? 0, fateh: "",
                  readyAt: fmtBaghdadTime(lastRow.ready_at), finishedAt: fmtBaghdadTime(lastRow.finished_at),
                  studentPhone: convertPhone(user.user_phone_number ?? ""), teacherPhone: convertPhone(tPhone) });
                continue;
              }
              nextPageToAdd = lastPage;
              studentMsg = msgFinished(saveName,buildPageDisplay(lastPage,edp),ps,errors,
                `يبقى كما هو ${buildPageDisplay(lastPage,edp)}`,isFU,iFT,false,inTest,holNote,user.full_name,tomorrowIsHol);
              // رسالة الأب فقط عند الرسوب
              if (user.father_phone_number)
                await waha(user.father_phone_number, msgFatherReject(saveName,buildPageDisplay(lastPage,edp),user.full_name,isFU));
              adminSummary.push({ studentName: user.full_name, teacherName: tRec?.full_name ?? "", typeLabel: "حفظي",
                pageDisp: `ص${lastRow.MePageArabic ?? buildPageDisplay(lastPage, edp)}`,
                resultLabel: translateResult("finished","reject",isFU,iFT),
                sowad: errors?.sowad ?? 0, nisyan: errors?.nisyan ?? 0, fateh: "",
                readyAt: fmtBaghdadTime(lastRow.ready_at), finishedAt: fmtBaghdadTime(lastRow.finished_at),
                studentPhone: convertPhone(user.user_phone_number ?? ""), teacherPhone: convertPhone(tPhone) });

            } else if (lastPage >= Number(saveRow.end_page)) {
              // ── أتم الحفظ ───────────────────────────────────────────────
              const e1Req    = saveRow.exam1 === true;
              const e2Req    = saveRow.exam2 === true;
              const examDate = addDays(today, 2);
              let e1TName = ""; let e1TPhone = ""; let e1TiFT = false;
              let e2TName = ""; let e2TPhone = ""; let iE2FT  = false;

              if (e1Req && saveRow.exam1_teacher_id) {
                const e1t = tMap[String(saveRow.exam1_teacher_id)];
                e1TName = e1t?.full_name ?? ""; e1TPhone = e1t?.phone_number ?? "";
                e1TiFT  = (e1t?.gender ?? "male") === "female";
                await waha(e1TPhone, msgExamAssignTeacher(saveName,user.full_name,isFU,e1TiFT,
                  saveRow.start_page,saveRow.end_page,"EXAM1",user.user_phone_number,examDate));
              }
              if (e2Req && saveRow.exam2_teacher_id) {
                const e2t = tMap[String(saveRow.exam2_teacher_id)];
                e2TName = e2t?.full_name ?? ""; e2TPhone = e2t?.phone_number ?? "";
                iE2FT   = (e2t?.gender ?? "male") === "female";
              }
              await waha(user.user_phone_number, msgCompletionStudent(saveName,user.full_name,isFU,e1Req,e1TName,e2Req,examDate));
              if (user.father_phone_number) await waha(user.father_phone_number, msgCompletionGuardian(saveName,user.full_name,isFU,e1Req,e2Req,examDate));
              if (tPhone) await waha(tPhone, msgCompletionTeacher(saveName,user.full_name,isFU,iFT,e1Req,e2Req,e2TName,examDate));

              if (!e1Req) {
                for (const ap of adminPhones) await waha(ap, msgCompletionAdmin(saveName,user.full_name,isFU,false));
                await supabase.from("users_saves").update({ status: "FINISHED", finished_at: today }).eq("id", saveId);
              } else {
                await supabase.from("users_saves")
                  .update({ status: "IN_EXAM1", exam1_date: examDate }).eq("id", saveId);
                await supabase.from("users").update({ in_test: true }).eq("user_id", userId);
              }
              adminSummary.push({ studentName: user.full_name, teacherName: tRec?.full_name ?? "", typeLabel: "حفظي",
                pageDisp: `ص${lastRow.MePageArabic ?? buildPageDisplay(lastPage, edp)}`,
                resultLabel: translateResult("finished",ps,isFU,iFT),
                sowad: errors?.sowad ?? 0, nisyan: errors?.nisyan ?? 0, fateh: "",
                readyAt: fmtBaghdadTime(lastRow.ready_at), finishedAt: fmtBaghdadTime(lastRow.finished_at),
                studentPhone: convertPhone(user.user_phone_number ?? ""), teacherPhone: convertPhone(tPhone) });
              continue;

            } else {
              nextPageToAdd = lastPage + Math.ceil(edp);
              studentMsg = msgFinished(saveName,buildPageDisplay(lastPage,edp),ps,errors,
                buildPageDisplay(nextPageToAdd,edp),isFU,iFT,false,inTest,holNote,user.full_name,tomorrowIsHol);
              adminSummary.push({ studentName: user.full_name, teacherName: tRec?.full_name ?? "", typeLabel: "حفظي",
                pageDisp: `ص${lastRow.MePageArabic ?? buildPageDisplay(lastPage, edp)}`,
                resultLabel: translateResult("finished",ps,isFU,iFT),
                sowad: errors?.sowad ?? 0, nisyan: errors?.nisyan ?? 0, fateh: "",
                readyAt: fmtBaghdadTime(lastRow.ready_at), finishedAt: fmtBaghdadTime(lastRow.finished_at),
                studentPhone: convertPhone(user.user_phone_number ?? ""), teacherPhone: convertPhone(tPhone) });
            }
          }

          if (sendStudent && studentMsg) await waha(user.user_phone_number, studentMsg);

          const isProgress = lastStatus === "finished"
            && (lastRow.page_status === "good" || lastRow.page_status === "perfect" || lastRow.page_status === "very_good")
            && nextPageToAdd > lastPage;
          const mePageArabic = isProgress
            ? buildPageDisplay(nextPageToAdd, edp)
            : (lastRow?.MePageArabic ?? buildPageDisplay(nextPageToAdd, edp));

          await createPageRow(supabase, userId, saveId, teacherId, tRec?.full_name ?? "", tRec?.photo_url ?? "",
            nextPageToAdd, edp, { status: newSt, page_status: newSt, date: tomorrow, MePageArabic: mePageArabic });

        // ════════════════════════════════════════════════════════
        //  IN_EXAM1 / IN_EXAM2
        // ════════════════════════════════════════════════════════
        } else if (saveStatus === "IN_EXAM1" || saveStatus === "IN_EXAM2") {
          const eType   = saveStatus === "IN_EXAM1" ? "EXAM1" : "EXAM2";
          const isCumul = eType === "EXAM2";
          const curETId = String(eType === "EXAM1" ? saveRow.exam1_teacher_id : saveRow.exam2_teacher_id);
          const curET   = tMap[curETId];
          const iEFT    = (curET?.gender ?? "male") === "female";
          const ePhone  = String(curET?.phone_number ?? "");

          const examNewSt   = resolveNewStatus(userId, curETId, isPublicHoliday, teacherHolidayIds, userHolidayIds);
          const examHolNote = holidayNoteByStatus(examNewSt, false, isFU, iEFT);

          const { data: lTests } = await supabase.from("users_pages_tests").select("*")
            .eq("user_id", userId).eq("save_id", saveId)
            .eq("type", eType).order("id", { ascending: false }).limit(1);
          const lastTest = lTests?.[0] ?? null;

          const examDateField = eType === "EXAM1" ? saveRow.exam1_date : saveRow.exam2_date;

          // ── لا يوجد صف اختبار — ننتظر حتى يوم الاختبار ─────────────────
          if (!lastTest) {
            if (examDateField !== tomorrow) continue;
            await createTestRow(supabase, userId, saveId, curETId, curET?.full_name ?? "", eType,
              isCumul ? 9999 : Number(saveRow.start_page),
              isCumul ? 9999 : Number(saveRow.end_page),
              { date: tomorrow, status: examNewSt, page_status: examNewSt });
            await updateSaveExamFields(supabase, saveId, eType, "not_ready", "not_ready");
            await waha(user.user_phone_number, msgExamDayStudent(saveName,user.full_name,isFU,curET?.full_name ?? "",ePhone,eType,saveRow.start_page,saveRow.end_page,iEFT));
            if (user.father_phone_number) await waha(user.father_phone_number, msgExamDayGuardian(saveName,user.full_name,isFU,curET?.full_name ?? "",eType,iEFT));
            await waha(ePhone, msgExamDayExamTeacher(saveName,user.full_name,isFU,iEFT,user.user_phone_number,eType,saveRow.start_page,saveRow.end_page));
            adminSummary.push({ studentName: user.full_name, teacherName: curET?.full_name ?? "",
              typeLabel: eType === "EXAM1" ? "اختبار جزئي" : "اختبار تراكمي", pageDisp: "",
              resultLabel: isFU ? "غائبة" : "غائب", sowad: 0, nisyan: 0, fateh: "", readyAt: "", finishedAt: "",
              studentPhone: convertPhone(user.user_phone_number ?? ""), teacherPhone: convertPhone(ePhone) });
            continue;
          }

          const ltSt     = String(lastTest.status ?? "");
          const ltPageSt = String(lastTest.page_status ?? "");
          const ltDate   = String(lastTest.date ?? today).split("T")[0];
          const delayDate = addDays(today, 1);

          if (ltSt === "sus_to_act") {
            const newExamDate = addDays(today, 2);
            await supabase.from("users_saves")
              .update(eType === "EXAM1" ? { exam1_date: newExamDate } : { exam2_date: newExamDate })
              .eq("id", saveId);
            await waha(user.user_phone_number, msgResumeExamStudent(saveName,user.full_name,isFU,curET?.full_name ?? "",ePhone,iEFT,newExamDate));
            if (ePhone) await waha(ePhone, msgExamAssignTeacher(saveName,user.full_name,isFU,iEFT,saveRow.start_page,saveRow.end_page,eType,user.user_phone_number,newExamDate));
            continue;
          }

          if (ltSt === "ready" || ltSt === "not_ready") {
            const variant: ExamVariant = ltSt === "ready" ? "teacher_absence" : "user_absence";
            const newPageSt = ltSt === "ready" ? "teacher_absence" : "user_absence";
            await supabase.from("users_pages_tests")
              .update({ status: newPageSt, page_status: newPageSt }).eq("id", lastTest.id);
            if (ltSt === "ready") await updateTeacherAbsence(supabase, curETId, ltDate, user.full_name);

            let absData: AbsenceData | undefined;
            if (ltSt === "not_ready") {
              const ab = parseAbsence(user.absence); ab.total += 1; absData = ab;
              await supabase.from("users").update({ absence: ab }).eq("user_id", userId);
              const { isTriple, dates } = await checkTriple(supabase, userId, saveId, "users_pages_tests", "absence", eType);
              if (isTriple) {
                await suspendSave(supabase, saveId, "absence", dates, saveName, saveStatus, true);
                const lf = convertPhone(user.father_phone_number ?? "");
                await waha(user.user_phone_number, msgSuspendExam(saveName,"absence",user.full_name,isFU,iEFT,"student",lf,ab));
                if (user.father_phone_number) await waha(user.father_phone_number, msgSuspendExam(saveName,"absence",user.full_name,isFU,iEFT,"father",lf,ab));
                await waha(ePhone, msgSuspendExam(saveName,"absence",user.full_name,isFU,iEFT,"teacher",lf,ab));
                for (const ap of adminPhones) await waha(ap, msgSuspendExam(saveName,"absence",user.full_name,isFU,iEFT,"admin",lf,ab));
                adminSummary.push({ studentName: user.full_name, teacherName: curET?.full_name ?? "",
                  typeLabel: eType === "EXAM1" ? "اختبار جزئي" : "اختبار تراكمي", pageDisp: "",
                  resultLabel: isFU ? "غائبة" : "غائب", sowad: 0, nisyan: 0, fateh: "", readyAt: "", finishedAt: "",
                  studentPhone: convertPhone(user.user_phone_number ?? ""), teacherPhone: convertPhone(ePhone) });
                continue;
              }
            }
            await updateSaveExamFields(supabase, saveId, eType, newPageSt, newPageSt);
            const nextExamDate = addDays(today, 2);
            await supabase.from("users_saves")
              .update(eType === "EXAM1" ? { exam1_date: nextExamDate } : { exam2_date: nextExamDate })
              .eq("id", saveId);
            await waha(user.user_phone_number, msgExamSessionResult(saveName,user.full_name,isFU,iEFT,"student",variant,delayDate,examHolNote,eType,absData?.total));
            if (user.father_phone_number) await waha(user.father_phone_number, msgExamSessionResult(saveName,user.full_name,isFU,iEFT,"father",variant,delayDate,examHolNote,eType,absData?.total));
            await waha(ePhone, msgExamSessionResult(saveName,user.full_name,isFU,iEFT,"examTeacher",variant,delayDate,examHolNote,eType));
            adminSummary.push({ studentName: user.full_name, teacherName: curET?.full_name ?? "",
              typeLabel: eType === "EXAM1" ? "اختبار جزئي" : "اختبار تراكمي", pageDisp: "",
              resultLabel: translateResult(newPageSt,"",isFU,iEFT), sowad: 0, nisyan: 0, fateh: "",
              readyAt: fmtBaghdadTime(lastTest.ready_at), finishedAt: "",
              studentPhone: convertPhone(user.user_phone_number ?? ""), teacherPhone: convertPhone(ePhone) });

          } else if (ltSt === "finished") {
            const errs = lastTest.errors_number ?? { sowad: 0, nisyan: 0, fateh: 0 };
            await waha(user.user_phone_number, msgExamSessionFinished(saveName,user.full_name,isFU,iEFT,"student",ltPageSt,errs,eType));
            if (user.father_phone_number) await waha(user.father_phone_number, msgExamSessionFinished(saveName,user.full_name,isFU,iEFT,"father",ltPageSt,errs,eType));
            adminSummary.push({ studentName: user.full_name, teacherName: curET?.full_name ?? "",
              typeLabel: eType === "EXAM1" ? "اختبار جزئي" : "اختبار تراكمي", pageDisp: "",
              resultLabel: translateResult("finished",ltPageSt,isFU,iEFT),
              sowad: errs?.sowad ?? 0, nisyan: errs?.nisyan ?? 0, fateh: String(errs?.fateh ?? 0),
              readyAt: fmtBaghdadTime(lastTest.ready_at), finishedAt: fmtBaghdadTime(lastTest.finished_at),
              studentPhone: convertPhone(user.user_phone_number ?? ""), teacherPhone: convertPhone(ePhone) });

            if (ltPageSt === "good" || ltPageSt === "perfect" || ltPageSt === "very_good") {
              await updateSaveExamFields(supabase, saveId, eType, "finished", ltPageSt);
              if (eType === "EXAM1") {
                const e2Req = saveRow.exam2 === true;
                if (e2Req) {
                  const exam2Date = addDays(today, 2);
                  await supabase.from("users_saves")
                    .update({ status: "IN_EXAM2", exam2_date: exam2Date }).eq("id", saveId);
                  const e2t = tMap[String(saveRow.exam2_teacher_id)];
                  const e2TName = e2t?.full_name ?? ""; const e2TPhone = e2t?.phone_number ?? "";
                  const iE2FT  = (e2t?.gender ?? "male") === "female";
                  await waha(user.user_phone_number, msgExam1PassStudent(saveName,user.full_name,isFU,true,e2TName,e2TPhone,iE2FT,exam2Date));
                  if (user.father_phone_number) await waha(user.father_phone_number, msgExam1PassGuardian(saveName,user.full_name,isFU,true,exam2Date));
                  await waha(e2TPhone, msgExamAssignTeacher(saveName,user.full_name,isFU,iE2FT,9999,9999,"EXAM2",user.user_phone_number,exam2Date));
                } else {
                  await supabase.from("users_saves").update({ status: "FINISHED", finished_at: today }).eq("id", saveId);
                  await supabase.from("users").update({ in_test: false }).eq("user_id", userId);
                  await waha(user.user_phone_number, msgExam1PassStudent(saveName,user.full_name,isFU,false,"","",false,today));
                  if (user.father_phone_number) await waha(user.father_phone_number, msgExam1PassGuardian(saveName,user.full_name,isFU,false,today));
                  for (const ap of adminPhones) await waha(ap, msgCompletionAdmin(saveName,user.full_name,isFU,false));
                }
              } else {
                await supabase.from("users_saves").update({ status: "FINISHED", finished_at: today }).eq("id", saveId);
                await supabase.from("users").update({ in_test: false }).eq("user_id", userId);
                await waha(user.user_phone_number, msgExam2PassStudent(saveName,user.full_name,isFU));
                if (user.father_phone_number) await waha(user.father_phone_number, msgExam2PassGuardian(saveName,user.full_name,isFU));
                for (const ap of adminPhones) await waha(ap, msgExam2PassAdmin(saveName,user.full_name,isFU));
              }

            } else if (ltPageSt === "reject") {
              const { isTriple, dates } = await checkTriple(supabase, userId, saveId, "users_pages_tests", "reject", eType);
              if (isTriple) {
                await suspendSave(supabase, saveId, "reject", dates, saveName, saveStatus, true);
                const lf = convertPhone(user.father_phone_number ?? "");
                await waha(user.user_phone_number, msgSuspendExam(saveName,"reject",user.full_name,isFU,iEFT,"student",lf));
                if (user.father_phone_number) await waha(user.father_phone_number, msgSuspendExam(saveName,"reject",user.full_name,isFU,iEFT,"father",lf));
                await waha(ePhone, msgSuspendExam(saveName,"reject",user.full_name,isFU,iEFT,"teacher",lf));
                continue;
              }
              await updateSaveExamFields(supabase, saveId, eType, "reject", "reject");
              const nextExamDate = addDays(today, 2);
              await supabase.from("users_saves")
                .update(eType === "EXAM1" ? { exam1_date: nextExamDate } : { exam2_date: nextExamDate })
                .eq("id", saveId);
              await waha(user.user_phone_number, msgExamSessionResult(saveName,user.full_name,isFU,iEFT,"student","reject",delayDate,examHolNote,eType));
              if (user.father_phone_number) await waha(user.father_phone_number, msgExamSessionResult(saveName,user.full_name,isFU,iEFT,"father","reject",delayDate,examHolNote,eType));
              await waha(ePhone, msgExamSessionResult(saveName,user.full_name,isFU,iEFT,"examTeacher","reject",delayDate,examHolNote,eType));
            }
          }
        }

      } catch (e) { console.error(`[User Loop Error] ${user.user_id}:`, e); }
    }

    // ════════════════════════════════════════════════════════════════
    //  ملخص المشرفين + Excel
    // ════════════════════════════════════════════════════════════════
    if (adminSummary.length > 0 && adminPhones.length > 0) {
      const dayNames = ["الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة","السبت"];
      const dayName  = dayNames[new Date(today + "T00:00:00").getDay()] ?? "";

      let summaryMsg = `${today} ${dayName}\n\n`;
      adminSummary.forEach((r, i) => {
        summaryMsg += `${i + 1}- ${r.studentName} | ${r.typeLabel} | ${r.resultLabel}\n`;
      });
      for (const ap of adminPhones) await waha(ap, summaryMsg);

      try {
        const headers = [
          "إسم الطالب الكامل","إسم المشرف المسؤول","نوع التسميع",
          "الصفحة","النتيجة","أخطاء السواد","النسيان","الفتح",
          "وقت الإستعداد","وقت التسميع","رقم هاتف الطالب","رقم هاتف المشرف",
        ];
        const rows = adminSummary.map(r => [
          r.studentName, r.teacherName, r.typeLabel,
          r.pageDisp, r.resultLabel,
          r.sowad, r.nisyan, r.fateh,
          r.readyAt, r.finishedAt,
          r.studentPhone, r.teacherPhone,
        ]);
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws["!dir"] = "rtl";
        XLSX.utils.book_append_sheet(wb, ws, "السجل");
        const buffer: Uint8Array = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
        const fileName = `${today.replace(/-/g, "_")}.xlsx`;
        await supabase.storage.from("Excels").upload(fileName, buffer, {
          contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          upsert: true,
        });
        const { data: urlData } = supabase.storage.from("Excels").getPublicUrl(fileName);
        const publicUrl = urlData?.publicUrl ?? "";
        if (publicUrl) {
          const excelMsg = [
            `سجل الطلاب بصيغة إكسل للتاريخ ${today}`,
            `الرابط: ${publicUrl}`,
            ``,
            `_يرجى التحفظ على الرابط وعدم مشاركته مع أي أحد خارج إدارة المركز._`,
          ].join("\n");
          for (const ap of adminPhones) await waha(ap, excelMsg);
        }
      } catch (excelErr) {
        console.error("[EXCEL ERROR]:", excelErr);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("[FATAL ERROR]:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
