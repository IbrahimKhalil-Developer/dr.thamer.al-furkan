import { createClient } from "npm:@supabase/supabase-js@2.49.8";

// ════════════════════════════════════════════════════════════════════
//  ثوابت النصوص الأساسية والتذييل المشترك
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
//  قاموس التذكير والتأنيث والمسميات الرسمية المعدلة
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
  finished  : (f: boolean) => f ? "أمت" : "أتم",
  absent    : (f: boolean) => f ? "غائبةٌ" : "غائبٌ",
  willTest  : (f: boolean) => f ? "ستُختبرين" : "ستُختبر",
  willTest3 : (f: boolean) => f ? "ستُختبر" : "سيُختبر",

  // مسميات الاختبارات الرسمية الجديدة
  exam1Name : "الإختبار الجزئي",
  exam2Name : "الإختبار التراكمي",

  formatCountStudent: (cnt: number): string => {
    if (cnt === 0) return "لا يوجد";
    if (cnt === 1) return "طالب واحد";
    if (cnt === 2) return "طالبين";
    if (cnt >= 3 && cnt <= 10) return `${cnt} طلاب`;
    return `${cnt} طالب`;
  },

  formatCountTeacher: (cnt: number): string => {
    if (cnt === 0) return "لا يوجد";
    if (cnt === 1) return "مشرف واحد";
    if (cnt === 2) return "مشرفين";
    if (cnt >= 3 && cnt <= 10) return `${cnt} مشرفين`;
    return `${cnt} مشرف`;
  }
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

interface LogEntry {
  studentName : string;
  typeLabel   : string; // الحفظ اليومي ، الإختبار الجزئي ، الإختبار التراكمي
  resultLabel : string; // إتقان ، إمتياز ، رسوب ، غياب ، مشرف غائب ، إجازة خاصة ، اجازة عامة ، المشرف مجاز
}

// ════════════════════════════════════════════════════════════════════
//  دوال الوقت والتواريخ (توقيت بغداد الصارم)
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

// ════════════════════════════════════════════════════════════════════
//  نظام المحاكاة والارسال للرسائل و قنوات الاتصال
// ════════════════════════════════════════════════════════════════════
async function sendNotificationLog(supabase: any, phone: string, text: string) {
  try {
    if (!phone) return;
    await supabase.from("notification_logs").insert([{
      phone_number: convertPhone(phone),
      message_text: text,
      sent_at: new Date().toISOString()
    }]);
  } catch (e) {
    console.error("[NOTIFICATION LOG ERROR]:", e);
  }
}

// ════════════════════════════════════════════════════════════════════
//  بناء وفحص الإجازات والتعطيل والغيابات المتتالية
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

function computeNewRowStatus(uid: string, tid: string, ctx: HolidayContext): string {
  if (ctx.userHolidaySet.has(uid))    return "holiday";
  if (ctx.teacherHolidayMap.has(tid)) return "teacher_holiday";
  if (ctx.isPublicHoliday)            return "public_holiday";
  return "not_ready";
}

async function checkTripleSequence(
  supabase: any, userId: string, saveId: string, table: "users_pages" | "users_pages_tests", kind: "absence" | "reject", examType?: "EXAM1" | "EXAM2"
): Promise<{ isTriple: boolean; dates: string[] }> {
  let q = supabase.from(table).select("status, page_status, date")
    .eq("user_id", userId).eq("save_id", saveId)
    .order("id", { ascending: false }).limit(40);
  
  if (examType) q = q.eq("type", examType);
  const { data } = await q;
  if (!data?.length) return { isTriple: false, dates: [] };

  let count = 0;
  const dates: string[] = [];
  const SKIP_STATES = new Set(["holiday", "public_holiday", "teacher_holiday", "teacher_absence", "sus_to_act"]);

  for (const r of data) {
    const st = String(r.status ?? "");
    const pst = String(r.page_status ?? "");

    if (SKIP_STATES.has(st) && st !== "user_absence") continue;
    if (st === "sus_to_act") break;

    if (kind === "reject" && st === "finished" && pst === "reject") {
      count++;
      dates.push(String(r.date ?? "").split("T")[0]);
      if (count >= 3) return { isTriple: true, dates };
      continue;
    }
    if (kind === "absence" && st === "user_absence") {
      count++;
      dates.push(String(r.date ?? "").split("T")[0]);
      if (count >= 3) return { isTriple: true, dates };
      continue;
    }
    if (st === "finished" && (pst === "good" || pst === "perfect")) break;
  }
  return { isTriple: false, dates };
}

// ════════════════════════════════════════════════════════════════════
//  دوال صياغة رسائل المتابعة اليومية الفردية (بدون القرآن الكريم)
// ════════════════════════════════════════════════════════════════════
function buildHeader(label: string, name: string): string {
  return `${T.HEADER}\n👤 ${label}: *${name}*\n`;
}

function msgDailyAbsence(saveName: string, pageDisp: string, dateStr: string, untilStr: string, isFU: boolean, forFather: boolean, variant: string): string {
  const nameLbl = forFather ? G.guardian(isFU) : G.student(isFU);
  let statusText = "غياب";
  let emoji = "🔴";
  if (variant === "holiday") { statusText = "إجازة خاصة"; emoji = "🟡"; }
  else if (variant === "teacher_holiday") { statusText = "المشرف مجاز"; emoji = "🟡"; }
  else if (variant === "public_holiday") { statusText = "اجازة عامة"; emoji = "🟢"; }

  return [
    buildHeader(nameLbl, saveName), T.SEP,
    `📚 الحفظ: *${saveName}*`,
    `📄 الصفحة: *${pageDisp}*`,
    `${emoji} الحالة: *${statusText}*`,
    `📅 التوجيه: *يُؤجَّل الحفظ من ${dateStr} إلى ${untilStr}*`,
    T.SEP, ``, T.FOOTER
  ].join("\n");
}

function msgDailyFinished(saveName: string, pageDisp: string, ps: string, errors: any, nextPagesText: string, isFU: boolean, forFather: boolean): string {
  const nameLbl = forFather ? G.guardian(isFU) : G.student(isFU);
  let resultText = ps === "perfect" ? "إتقان" : "إمتياز";
  let emoji = ps === "perfect" ? "🌟" : "✅";

  return [
    buildHeader(nameLbl, saveName), T.SEP,
    `📚 الحفظ: *${saveName}*`,
    `📄 الصفحة: *${pageDisp}*`,
    `${emoji} النتيجة: *${resultText}*`,
    `🔴 أخطاء السواد: *${errors?.sowad ?? 0}*`,
    `💭 النسيان: *${errors?.nisyan ?? 0}*`, T.SEP,
    `📝 حفظ الغد: *${nextPagesText}*`,
    T.SEP, ``, T.FOOTER
  ].join("\n");
}

function msgDailyFinishedReject(saveName: string, pageDisp: string, errors: any, isFU: boolean, forFather: boolean): string {
  const nameLbl = forFather ? G.guardian(isFU) : G.student(isFU);
  return [
    buildHeader(nameLbl, saveName), T.SEP,
    `📚 الحفظ: *${saveName}*`,
    `📄 الصفحة: *${pageDisp}*`,
    `❌ النتيجة: *رسوبٌ — يُعاد التسميع ليوم غدٍ*`,
    `🔴 أخطاء السواد: *${errors?.sowad ?? 0}*`,
    `💭 النسيان: *${errors?.nisyan ?? 0}*`,
    T.SEP, ``, T.FOOTER
  ].join("\n");
}

// ════════════════════════════════════════════════════════════════════
//  دوال صياغة رسائل الحفظ النهائي والاكتمال والاختبارات المخصصة
// ════════════════════════════════════════════════════════════════════
function msgAdminSuspension(saveName: string, kind: "absence" | "reject", fullName: string, isFU: boolean, fatherPhone: string): string {
  const reason = kind === "absence" ? "كثرة الغيابات المتتالية" : "الرسوب المتكرر في التسميع";
  return [
    T.HEADER, T.SEP, `🔴 *تنبيه إداري — إيقاف بسبب ${kind === "absence" ? "الغياب" : "الرسوب"}*`, T.SEP, ``,
    `📚 الحفظ: *${saveName}*`,
    `${G.student(isFU)}: *${fullName}*`,
    `تم إيقاف حساب ${G.his(isFU)} بسبب ${reason}.`,
    `📞 هاتف ولي الأمر للتواصل خلال 24 ساعة: *${convertPhone(fatherPhone)}*`,
    T.SEP, `نسخة منها إلى:`, ...T.COPIES, T.SEP
  ].join("\n");
}

function msgAdminFinishedNoExams(saveName: string, fullName: string, isFU: boolean): string {
  return [
    T.HEADER, T.SEP, `📋 *إشعار إداري — إتمام الحفظ بنجاح*`, T.SEP, ``,
    `📚 الحفظ: *${saveName}*`,
    `${G.student(isFU)}: *${fullName}*`,
    `أتمَّ ${G.his(isFU)} بنجاح وليس لديه أي اختبارات متبقية حالياً.`,
    `📌 يُرجى إدراج وتحديد خطة حفظ جديدة للطالب.`,
    T.SEP, `نسخة منها إلى:`, ...T.COPIES, T.SEP
  ].join("\n");
}

function msgAdminExam1PassedNoExam2(saveName: string, fullName: string, isFU: boolean): string {
  return [
    T.HEADER, T.SEP, `📋 *إشعار إداري — اجتياز ${G.exam1Name}*`, T.SEP, ``,
    `📚 الحفظ: *${saveName}*`,
    `${G.student(isFU)}: *${fullName}*`,
    `اجتَازَ بنجاح *${G.exam1Name}*، وليس لديه اختبار تراكمي ثانٍ مقرر.`,
    `📌 يُرجى مراجعة ملف الطالب لتحديد التكليفات القادمة.`,
    T.SEP, `نسخة منها إلى:`, ...T.COPIES, T.SEP
  ].join("\n");
}

function msgAdminExam2Passed(saveName: string, fullName: string, isFU: boolean): string {
  return [
    T.HEADER, T.SEP, `📋 *إشعار إداري — اجتياز ${G.exam2Name}*`, T.SEP, ``,
    `📚 الحفظ: *${saveName}*`,
    `${G.student(isFU)}: *${fullName}*`,
    `اجتَازَ بنجاح وبشكل نهائي كامل *${G.exam2Name}*.`,
    `📌 تم إغلاق الحفظ الحالي واكتماله بالكامل في النظام.`,
    T.SEP, `نسخة منها إلى:`, ...T.COPIES, T.SEP
  ].join("\n");
}

function msgStudentCompletion(saveName: string, isFU: boolean, e1Req: boolean, exam1TName: string, e2Req: boolean, iEFT: boolean): string {
  const lines = [T.HEADER, T.SEP, `📚 الحفظ: *${saveName}*`, T.BAYT];
  if (!e1Req && !e2Req) {
    lines.push(`سيتم إبلاغ الإدارة لجدولة خطة جديدة ${G.toHim(isFU)}.`);
  } else if (e1Req) {
    lines.push(`بعد غدٍ سيكون موعد اختبارك في *${G.exam1Name}*.`);
    if (exam1TName) lines.push(`🎓 ${G.willTest(isFU)} عند ${G.teacherLbl(iEFT)}: *${exam1TName}*`);
  }
  if (e2Req) lines.push(`📌 يليه لاحقاً الاستعداد لـ *${G.exam2Name}* بكل حفظك.`);
  lines.push(T.SEP, ``, T.FOOTER);
  return lines.join("\n");
}

function msgExamDayStudent(saveName: string, isFU: boolean, eTName: string, eTPhone: string, isExam2: boolean, iEFT: boolean): string {
  const exLabel = isExam2 ? G.exam2Name : G.exam1Name;
  return [
    T.HEADER, T.SEP, `📚 الحفظ: *${saveName}*`,
    `🗒️ يوم غدٍ موعد اختبارك في: *${exLabel}*`,
    `🎓 ${G.teacherLbl(iEFT)} على الاختبار: *${eTName}*`,
    `📞 رقم الهاتف للتواصل: *${convertPhone(eTPhone)}*`,
    T.SEP, ``, T.FOOTER
  ].join("\n");
}

function msgExamDayGuardian(saveName: string, fullName: string, isFU: boolean, eTName: string, isExam2: boolean, iEFT: boolean): string {
  const exLabel = isExam2 ? G.exam2Name : G.exam1Name;
  return [
    T.HEADER, T.SEP, `👤 ${G.guardian(isFU)}: *${fullName}*`, T.SEP,
    `📚 الحفظ: *${saveName}*`,
    `🗒️ نود إعلامكم بأن يوم غدٍ هو موعد اختبار الطالب في *${exLabel}*`,
    `🎓 ${G.teacherLbl(iEFT)} المسؤول: *${eTName}*`,
    T.SEP, ``, T.FOOTER
  ].join("\n");
}

function msgExamDayTeacher(saveName: string, fullName: string, isFU: boolean, iFT: boolean, sPhone: string, isExam2: boolean): string {
  const exLabel = isExam2 ? G.exam2Name : G.exam1Name;
  return [
    T.HEADER, T.SEP, `📋 *تذكير بجدولة اختبار*`, T.SEP, ``,
    `الطالب: *${fullName}*`,
    `📚 الحفظ: *${saveName}*`,
    `لديه يوم غدٍ اختبار في *${exLabel}*.`,
    `وأنتَ ${G.teacherLbl(iFT)} المكلف بإجراء الاختبار ورصد الدرجة.`,
    `📞 رقم الطالب: *${convertPhone(sPhone)}*`,
    T.SEP
  ].join("\n");
}

function msgExamSessionResult(saveName: string, fullName: string, isFU: boolean, variant: "user_absence" | "teacher_absence" | "reject", isExam2: boolean): string {
  const exLabel = isExam2 ? G.exam2Name : G.exam1Name;
  let resStr = "نجاح";
  if (variant === "user_absence") resStr = "غياب الطالب";
  else if (variant === "teacher_absence") resStr = "مشرف غائب";
  else if (variant === "reject") resStr = "رسوب";

  return [
    T.HEADER, T.SEP,
    `👤 الطالب: *${fullName}*`,
    `📚 الحفظ: *${saveName}*`,
    `🗒️ نوع الاختبار: *${exLabel}*`,
    `📌 النتيجة الموثقة: *${resStr}* — يُعاد جدولة الموعد آلياً.`,
    T.SEP, ``, T.FOOTER
  ].join("\n");
}

// ════════════════════════════════════════════════════════════════════
//  إضافة أول صف حفظ للـ save_id الذي لا يملك أي صفوف في users_pages
// ════════════════════════════════════════════════════════════════════
async function initMissingPages(supabase: any, saves: any[], today: string) {
  console.log("[initMissingPages] التحقق من الحفظات التي لا تملك صفوف...");

  for (const s of saves) {
    if (s.status !== "ACTIVE") continue;
    if (!s.user || !s.teacher) continue;

    // تحقق هل يوجد أي صف في users_pages لهذا الـ save_id
    const { data: existingRows } = await supabase
      .from("users_pages")
      .select("id")
      .eq("save_id", s.id)
      .limit(1);

    // إذا يوجد صف → تخطى
    if (existingRows && existingRows.length > 0) continue;

    // لا يوجد أي صف → احسب قيمة page الأولى
    const currentPage   = s.current_page   ?? s.start_page ?? 1;
    const everyDayPages = s.every_day_pages ?? 1;
    const firstPage     = currentPage + everyDayPages;

    // أضف الصف الأول بـ status و page_status = not_ready ولا تعالجه
    const { error: insErr } = await supabase
      .from("users_pages")
      .insert([{
        user_id      : s.user_id,
        save_id      : s.id,
        teacher_id   : s.teacher_id,
        teacher_name : s.teacher.full_name,
        page         : firstPage,
        status       : "not_ready",
        page_status  : "not_ready",
        date         : today,
      }]);

    if (insErr) {
      console.error(`[initMissingPages ERROR] save_id=${s.id}:`, insErr);
    } else {
      console.log(`[initMissingPages] أُضيف أول صف لـ save_id=${s.id} | user=${s.user.full_name} | page=${firstPage}`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════
//  الدالة المركزية والمحرك الأساسي للنظام
// ════════════════════════════════════════════════════════════════════
export async function handleDailySaves() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(supabaseUrl, supabaseKey);

  const today = todayStr();
  const tomorrow = addDays(today, 1);
  console.log(`[SYSTEM STARTED AT 23:45 BAGHDAD] Today: ${today}, Tomorrow: ${tomorrow}`);

  // الحفاظ على مصفوفات لتجميع سجلات الإحصائيات الشاملة للرسالتين الإداريتين في النهاية
  const logEntries: LogEntry[] = [];
  const absentTeachersNames: string[] = [];

  // عدادات الرسالة الأولى لقاعدة البيانات الحالية لليوم
  let countSuccessSave = 0;
  let countSuccessTest = 0;
  let countRejectSave = 0;
  let countRejectTest = 0;
  let countPerfectSave = 0;
  let countGoodSave = 0;
  let countAbsenceUser = 0;
  let countAbsenceTeacher = 0;

  // جلب كافة صفوف الحفظ المفتوحة والنشطة والواقعة تحت قيد الاختبار المجدول
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
    console.error("[CRITICAL ERROR FETCHING SAVES]:", sErr);
    return;
  }

  // ── تعديل: إضافة أول صف لأي save_id لا يملك صفوفاً في users_pages ──
  await initMissingPages(supabase, saves, today);

  // بناء سياق الإجازات لليوم وللغد
  const { data: tomHolidays } = await supabase.from("holidays").select("*").eq("date", tomorrow);
  const tomCtx = await buildHolidayContext(supabase, tomHolidays ?? []);

  for (const s of saves) {
    if (!s.user || !s.teacher) continue;
    const uid = s.user_id;
    const tid = s.teacher_id;
    const isFU = s.user.gender === "female";
    const iFT = s.teacher.gender === "female";
    const fName = s.user.full_name ?? "طالب";
    const sName = s.name ?? "خطة الحفظ";
    const fPhone = s.user.father_phone ?? "";
    const sPhone = s.user.phone ?? "";

    // ─────────────────────────────────────────────────────────────────
    //  أولاً: معالجة حالة الحفظ اليومي النشط (ACTIVE)
    // ─────────────────────────────────────────────────────────────────
    if (s.status === "ACTIVE") {
      const { data: pageRow } = await supabase
        .from("users_pages")
        .select("*")
        .eq("save_id", s.id)
        .eq("date", today)
        .maybeSingle();

      if (!pageRow) continue;

      const pStatus = pageRow.status; // finished, user_absence, teacher_absence, holiday, public_holiday, teacher_holiday
      const pEval = pageRow.page_status; // perfect, good, reject, not_ready
      const pageNum = pageRow.page ?? 1;
      const edp = s.every_day_pages ?? 1;
      const pageDisp = Array.from({ length: Math.ceil(edp) }, (_, i) => String(pageNum - (Math.ceil(edp) - 1 - i))).join(" و ");

      // أ. معالجة حالات الغيابات أو الإجازات لليوم الحالي
      if (pStatus === "user_absence" || pStatus === "teacher_absence" || pStatus === "holiday" || pStatus === "public_holiday" || pStatus === "teacher_holiday") {
        let resultLogText = "غياب";
        if (pStatus === "user_absence") {
          countAbsenceUser++;
          const tripleAbs = await checkTripleSequence(supabase, uid, s.id, "users_pages", "absence");
          if (tripleAbs.isTriple) {
            await supabase.from("users_saves").update({ status: "SUSPENDED", status_reason: "إيقاف بسبب الغياب المتكرر للحفظ" }).eq("id", s.id);
            // إرسال فوري للادارة بسبب الإيقاف بالغياب كما هو مطلوب بالشرط الأول للادارة
            const mAdm = msgAdminSuspension(sName, "absence", fName, isFU, fPhone);
            await sendNotificationLog(supabase, T.ADMIN, mAdm);
            logEntries.push({ studentName: fName, typeLabel: "الحفظ اليومي", resultLabel: "غياب" });
            continue;
          }
        } else if (pStatus === "teacher_absence") {
          countAbsenceTeacher++;
          resultLogText = "مشرف غائب";
          if (!absentTeachersNames.includes(s.teacher.full_name)) absentTeachersNames.push(s.teacher.full_name);
        } else if (pStatus === "holiday") resultLogText = "إجازة خاصة";
        else if (pStatus === "public_holiday") resultLogText = "اجازة عامة";
        else if (pStatus === "teacher_holiday") resultLogText = "المشرف مجاز";

        logEntries.push({ studentName: fName, typeLabel: "الحفظ اليومي", resultLabel: resultLogText });

        const tomStatus = computeNewRowStatus(uid, tid, tomCtx);
        await supabase.from("users_pages").insert([{
          user_id: uid, save_id: s.id, teacher_id: tid, teacher_name: s.teacher.full_name,
          page: pageNum, status: tomStatus, page_status: "not_ready", date: tomorrow
        }]);

        const mSt = msgDailyAbsence(sName, pageDisp, today, tomorrow, isFU, false, pStatus);
        const mFa = msgDailyAbsence(sName, pageDisp, today, tomorrow, isFU, true, pStatus);
        await sendNotificationLog(supabase, sPhone, mSt);
        await sendNotificationLog(supabase, fPhone, mFa);
        continue;
      }

      // ب. معالجة حالات انتهاء التقييم (finished) بنجاح أو رسوب
      if (pStatus === "finished") {
        if (pEval === "reject") {
          countRejectSave++;
          logEntries.push({ studentName: fName, typeLabel: "الحفظ اليومي", resultLabel: "رسوب" });

          const tripleRej = await checkTripleSequence(supabase, uid, s.id, "users_pages", "reject");
          if (tripleRej.isTriple) {
            await supabase.from("users_saves").update({ status: "SUSPENDED", status_reason: "إيقاف بسبب الرسوب المتكرر في الحفظ" }).eq("id", s.id);
            const mAdm = msgAdminSuspension(sName, "reject", fName, isFU, fPhone);
            await sendNotificationLog(supabase, T.ADMIN, mAdm);
            continue;
          }

          const tomStatus = computeNewRowStatus(uid, tid, tomCtx);
          await supabase.from("users_pages").insert([{
            user_id: uid, save_id: s.id, teacher_id: tid, teacher_name: s.teacher.full_name,
            page: pageNum, status: tomStatus, page_status: "not_ready", date: tomorrow
          }]);

          const mSt = msgDailyFinishedReject(sName, pageDisp, pageRow.errors_number, isFU, false);
          const mFa = msgDailyFinishedReject(sName, pageDisp, pageRow.errors_number, isFU, true);
          await sendNotificationLog(supabase, sPhone, mSt);
          await sendNotificationLog(supabase, fPhone, mFa);
          continue;
        }

        if (pEval === "perfect" || pEval === "good") {
          countSuccessSave++;
          if (pEval === "perfect") { countPerfectSave++; logEntries.push({ studentName: fName, typeLabel: "الحفظ اليومي", resultLabel: "إتقان" }); }
          else { countGoodSave++; logEntries.push({ studentName: fName, typeLabel: "الحفظ اليومي", resultLabel: "إمتياز" }); }

          const isFinalPage = pageNum >= (s.end_page ?? 604);
          if (isFinalPage) {
            // اكتمال خطة الحفظ تماماً والتحول لمرحلة الاختبارات الجزئية أو التراكمية
            const e1Active = !!s.exam1_active;
            const e2Active = !!s.exam2_active;

            if (e1Active) {
              await supabase.from("users_saves").update({ status: "IN_EXAM1" }).eq("id", s.id);
              // جدولة وتكليف المشرف الأول بعد غد
              const testDate = addDays(today, 2);
              await supabase.from("users_pages_tests").insert([{
                user_id: uid, save_id: s.id, teacher_id: s.exam1_teacher_id ?? tid,
                teacher_name: s.exam1_teacher?.full_name ?? s.teacher.full_name,
                status: "not_ready", page_status: "not_ready", type: "EXAM1",
                start_page: s.start_page ?? 1, end_page: s.end_page ?? 604, date: testDate
              }]);

              if (s.exam1_teacher?.phone) {
                const mAss = msgExamDayTeacher(sName, fName, isFU, s.exam1_teacher.gender === "female", sPhone, false);
                await sendNotificationLog(supabase, s.exam1_teacher.phone, mAss);
              }
            } else if (e2Active) {
              await supabase.from("users_saves").update({ status: "IN_EXAM2" }).eq("id", s.id);
              const testDate = addDays(today, 2);
              await supabase.from("users_pages_tests").insert([{
                user_id: uid, save_id: s.id, teacher_id: s.exam2_teacher_id ?? tid,
                teacher_name: s.exam2_teacher?.full_name ?? s.teacher.full_name,
                status: "not_ready", page_status: "not_ready", type: "EXAM2",
                start_page: s.start_page ?? 1, end_page: s.end_page ?? 604, date: testDate
              }]);
            } else {
              // نجح وليس له أي اختبارات حالية مطلقة
              await supabase.from("users_saves").update({ status: "FINISHED" }).eq("id", s.id);
              const mAdm = msgAdminFinishedNoExams(sName, fName, isFU);
              await sendNotificationLog(supabase, T.ADMIN, mAdm);
            }

            const mSt = msgStudentCompletion(sName, isFU, e1Active, s.exam1_teacher?.full_name ?? "", e2Active, s.exam1_teacher?.gender === "female");
            await sendNotificationLog(supabase, sPhone, mSt);
            continue;
          } else {
            // الانتقال والمتابعة لصفحة الحفظ التالية في خطة التسميع اليومية المستمرة
            const nextPage = pageNum + edp;
            const tomStatus = computeNewRowStatus(uid, tid, tomCtx);
            await supabase.from("users_pages").insert([{
              user_id: uid, save_id: s.id, teacher_id: tid, teacher_name: s.teacher.full_name,
              page: nextPage, status: tomStatus, page_status: "not_ready", date: tomorrow
            }]);

            const mSt = msgDailyFinished(sName, pageDisp, pEval, pageRow.errors_number, String(nextPage), isFU, false);
            const mFa = msgDailyFinished(sName, pageDisp, pEval, pageRow.errors_number, String(nextPage), isFU, true);
            await sendNotificationLog(supabase, sPhone, mSt);
            await sendNotificationLog(supabase, fPhone, mFa);
          }
        }
      }
    }

    // ─────────────────────────────────────────────────────────────────
    //  ثانياً: معالجة حالة الاختبارات الجزئية والتراكمية (EXAM1 / EXAM2)
    // ─────────────────────────────────────────────────────────────────
    const isInExamMode = s.status === "IN_EXAM1" || s.status === "IN_EXAM2";
    if (isInExamMode) {
      const isExam2 = s.status === "IN_EXAM2";
      const exType = isExam2 ? "EXAM2" : "EXAM1";
      const exLabel = isExam2 ? G.exam2Name : G.exam1Name;
      const currentExamTeacher = isExam2 ? s.exam2_teacher : s.exam1_teacher;

      if (!currentExamTeacher) continue;
      const iEFT = currentExamTeacher.gender === "female";

      // 1. منطق التنبيه والجدولة الآلية المسبقة بـ 24 ساعة (عند الفارق diffDays === 1 للتاريخ المسجل)
      const { data: latestTestRow } = await supabase
        .from("users_pages_tests")
        .select("date, status")
        .eq("save_id", s.id)
        .eq("type", exType)
        .order("id", { ascending: false })
        .limit(1);

      if (latestTestRow && latestTestRow.length > 0) {
        const targetDateStr = latestTestRow[0].date;
        if (diffDays(today, targetDateStr) === 1) {
          // غداً هو يوم الاختبار الفعلي المجدول، ننشئ صف الغد مسبقاً لمنع التأخير التوثيقي
          const tomStatus = computeNewRowStatus(uid, currentExamTeacher.teacher_id, tomCtx);
          const hasTomorrowRow = await supabase.from("users_pages_tests").select("id").eq("save_id", s.id).eq("type", exType).eq("date", tomorrow).maybeSingle();
          
          if (!hasTomorrowRow.data) {
            await supabase.from("users_pages_tests").insert([{
              user_id: uid, save_id: s.id, teacher_id: currentExamTeacher.teacher_id,
              teacher_name: currentExamTeacher.full_name, status: tomStatus, page_status: "not_ready",
              type: exType, start_page: s.start_page ?? 1, end_page: s.end_page ?? 604, date: tomorrow
            }]);
          }

          const mSt = msgExamDayStudent(sName, isFU, currentExamTeacher.full_name, currentExamTeacher.phone ?? "", isExam2, iEFT);
          const mFa = msgExamDayGuardian(sName, fName, isFU, currentExamTeacher.full_name, isExam2, iEFT);
          const mTe = msgExamDayTeacher(sName, fName, isFU, iEFT, sPhone, isExam2);

          await sendNotificationLog(supabase, sPhone, mSt);
          await sendNotificationLog(supabase, fPhone, mFa);
          if (currentExamTeacher.phone) await sendNotificationLog(supabase, currentExamTeacher.phone, mTe);
        }
      }

      // 2. التحقق من رصد النتيجة والتقييم لليوم الحالي ومعالجة الإجراء المترتب عليها
      const { data: currentDayTest } = await supabase
        .from("users_pages_tests")
        .select("*")
        .eq("save_id", s.id)
        .eq("type", exType)
        .eq("date", today)
        .maybeSingle();

      if (!currentDayTest) continue;

      const tStatus = currentDayTest.status;
      const tEval = currentDayTest.page_status;

      if (tStatus === "user_absence" || tStatus === "teacher_absence" || tStatus === "holiday" || tStatus === "public_holiday" || tStatus === "teacher_holiday") {
        let resLogText = "غياب";
        if (tStatus === "user_absence") {
          countAbsenceUser++;
          const tripleAbsTest = await checkTripleSequence(supabase, uid, s.id, "users_pages_tests", "absence", exType);
          if (tripleAbsTest.isTriple) {
            await supabase.from("users_saves").update({ status: "SUSPENDED", status_reason: `إيقاف بسبب الغياب المتكرر في ${exLabel}` }).eq("id", s.id);
            const mAdm = msgAdminSuspension(sName, "absence", fName, isFU, fPhone);
            await sendNotificationLog(supabase, T.ADMIN, mAdm);
            logEntries.push({ studentName: fName, typeLabel: exLabel, resultLabel: "غياب" });
            continue;
          }
        } else if (tStatus === "teacher_absence") {
          countAbsenceTeacher++;
          resLogText = "مشرف غائب";
          if (!absentTeachersNames.includes(currentExamTeacher.full_name)) absentTeachersNames.push(currentExamTeacher.full_name);
        } else if (tStatus === "holiday") resLogText = "إجازة خاصة";
        else if (tStatus === "public_holiday") resLogText = "اجازة عامة";
        else if (tStatus === "teacher_holiday") resLogText = "المشرف مجاز";

        logEntries.push({ studentName: fName, typeLabel: exLabel, resultLabel: resLogText });

        const tomStatus = computeNewRowStatus(uid, currentExamTeacher.teacher_id, tomCtx);
        await supabase.from("users_pages_tests").insert([{
          user_id: uid, save_id: s.id, teacher_id: currentExamTeacher.teacher_id,
          teacher_name: currentExamTeacher.full_name, status: tomStatus, page_status: "not_ready",
          type: exType, start_page: s.start_page ?? 1, end_page: s.end_page ?? 604, date: tomorrow
        }]);

        const variantKey = (tStatus === "user_absence" || tStatus === "teacher_absence") ? tStatus : "user_absence";
        const mResult = msgExamSessionResult(sName, fName, isFU, variantKey as any, isExam2);
        await sendNotificationLog(supabase, sPhone, mResult);
        await sendNotificationLog(supabase, fPhone, mResult);
        continue;
      }

      if (tStatus === "finished") {
        if (tEval === "reject") {
          countRejectTest++;
          logEntries.push({ studentName: fName, typeLabel: exLabel, resultLabel: "رسوب" });

          const tripleRejTest = await checkTripleSequence(supabase, uid, s.id, "users_pages_tests", "reject", exType);
          if (tripleRejTest.isTriple) {
            await supabase.from("users_saves").update({ status: "SUSPENDED", status_reason: `إيقاف بسبب الرسوب المتكرر في ${exLabel}` }).eq("id", s.id);
            const mAdm = msgAdminSuspension(sName, "reject", fName, isFU, fPhone);
            await sendNotificationLog(supabase, T.ADMIN, mAdm);
            continue;
          }

          const tomStatus = computeNewRowStatus(uid, currentExamTeacher.teacher_id, tomCtx);
          await supabase.from("users_pages_tests").insert([{
            user_id: uid, save_id: s.id, teacher_id: currentExamTeacher.teacher_id,
            teacher_name: currentExamTeacher.full_name, status: tomStatus, page_status: "not_ready",
            type: exType, start_page: s.start_page ?? 1, end_page: s.end_page ?? 604, date: tomorrow
          }]);

          const mResult = msgExamSessionResult(sName, fName, isFU, "reject", isExam2);
          await sendNotificationLog(supabase, sPhone, mResult);
          await sendNotificationLog(supabase, fPhone, mResult);
          continue;
        }

        if (tEval === "perfect" || tEval === "good") {
          countSuccessTest++;
          logEntries.push({ studentName: fName, typeLabel: exLabel, resultLabel: "نجاح" });

          if (!isExam2) {
            // اجتياز الاختبار الجزئي الأول
            const hasE2 = !!s.exam2_active;
            if (hasE2) {
              await supabase.from("users_saves").update({ status: "IN_EXAM2" }).eq("id", s.id);
              const testDate = addDays(today, 2);
              await supabase.from("users_pages_tests").insert([{
                user_id: uid, save_id: s.id, teacher_id: s.exam2_teacher_id ?? tid,
                teacher_name: s.exam2_teacher?.full_name ?? s.teacher.full_name,
                status: "not_ready", page_status: "not_ready", type: "EXAM2",
                start_page: s.start_page ?? 1, end_page: s.end_page ?? 604, date: testDate
              }]);
            } else {
              // نجح من الاختبار الأول وليس له اختبار ثانٍ تراكمي مطلقاً
              await supabase.from("users_saves").update({ status: "FINISHED" }).eq("id", s.id);
              const mAdm = msgAdminExam1PassedNoExam2(sName, fName, isFU);
              await sendNotificationLog(supabase, T.ADMIN, mAdm);
            }
          } else {
            // اجتياز الاختبار التراكمي الثاني والنهائي بنجاح تام واكتمال الخطة كاملة
            await supabase.from("users_saves").update({ status: "FINISHED" }).eq("id", s.id);
            const mAdm = msgAdminExam2Passed(sName, fName, isFU);
            await sendNotificationLog(supabase, T.ADMIN, mAdm);
          }

          const customPassedText = [
            T.HEADER, T.SEP, `🎉 مبارك النتيجة المشرفة للطالب: *${fName}*`,
            `📚 الحفظ: *${sName}*`, `🏅 نوع الاختبار: *${exLabel}*`,
            `✨ النتيجة النهائية: *نجاح*`, T.SEP, ``, T.FOOTER
          ].join("\n");
          
          await sendNotificationLog(supabase, sPhone, customPassedText);
          await sendNotificationLog(supabase, fPhone, customPassedText);
        }
      }
    }
  }

  // ════════════════════════════════════════════════════════════════════
  //  ثالثاً: توليد وإرسال الرسائل الإحصائية الإدارية الشاملة للـ Admins
  // ════════════════════════════════════════════════════════════════════
  
  // بناء نص الرسالة الأولى: الإحصائيات والأرقام العامة بصيغ لغوية دقيقة
  const msg1Lines = [
    `إحصائيات (${today})`,
    `النجاح في الحفظ: ${G.formatCountStudent(countSuccessSave)}`,
    `النجاح في الإختبار: ${G.formatCountStudent(countSuccessTest)}`,
    `الرسوب في الحفظ: ${G.formatCountStudent(countRejectSave)}`,
    `الرسوب في الإختبار: ${G.formatCountStudent(countRejectTest)}`,
    `المتقنين: ${G.formatCountStudent(countPerfectSave)}`,
    `الإمتياز: ${G.formatCountStudent(countGoodSave)}`,
    `عدد غيابات الطلاب الكلي: ${G.formatCountStudent(countAbsenceUser)}`,
    `عدد غيابات المشرفيين الكلي: ${G.formatCountTeacher(countAbsenceTeacher)}`
  ];

  if (absentTeachersNames.length > 0) {
    msg1Lines.push(`المشرفين: ${absentTeachersNames.join(" ، ")}`);
  }

  const finalAdminMessage1 = msg1Lines.join("\n");
  await sendNotificationLog(supabase, T.ADMIN, finalAdminMessage1);

  // بناء نص الرسالة الثانية: سجل بيانات الطلاب التفصيلي الشامل لكافة التعديلات
  const msg2Lines = [`إحصائيات (${today}) لبيانات الطلاب:`];
  
  if (logEntries.length === 0) {
    msg2Lines.push("لا يوجد أي تعديلات أو نشاطات مسجلة ومعدلة لهذا اليوم.");
  } else {
    for (const log of logEntries) {
      msg2Lines.push(`${log.studentName} / ${log.typeLabel} / ${log.resultLabel}`);
    }
  }

  const finalAdminMessage2 = msg2Lines.join("\n");
  await sendNotificationLog(supabase, T.ADMIN, finalAdminMessage2);

  console.log("[DAILY SYSTEM LOGS COMPLETED] All messages processed and archived successfully.");
}
