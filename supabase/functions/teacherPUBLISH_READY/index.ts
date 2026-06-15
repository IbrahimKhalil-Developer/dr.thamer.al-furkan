import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")              ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WAHA_URL                  = Deno.env.get("waha_url")                  ?? "";
const WAHA_API_KEY              = Deno.env.get("waha_api_key")              ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const VALID_TYPES = ["NOT_EXAM", "EXAM"] as const;

function jsonResponse(payload: any, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// تحويل string أو number إلى عدد صحيح، أو null لو غير صالح
function parseCount(v: any): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > 999) return null;
  return n;
}

// هل الوقت الآن بين 11:00 و 11:45 مساءً بتوقيت بغداد
function isIn45MinWindow(): boolean {
  const baghdad = new Date(new Date().getTime() + 3 * 60 * 60 * 1000);
  const h = baghdad.getUTCHours(), m = baghdad.getUTCMinutes();
  return h === 23 && m <= 45;
}

// إرسال رسالة واتساب عبر WAHA
async function sendWahaMessage(phone: string, text: string): Promise<void> {
  if (!phone || !WAHA_URL || !WAHA_API_KEY) return;
  try {
    await fetch(WAHA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": WAHA_API_KEY },
      body: JSON.stringify({ chatId: `${phone}@c.us`, text, session: "default" }),
    });
  } catch (err) {
    console.error(`[WAHA] → ${phone}:`, err);
  }
}

// صياغة رسالة الطالب حسب الجنس ونوع التقييم
function buildStudentMessage(isFemale: boolean, teacherName: string, examType?: "EXAM1" | "EXAM2"): string {
  const hifdh = isFemale ? "حفظكِ"   : "حفظكَ";
  const sup   = isFemale ? "المشرفة" : "المشرف";
  const can   = isFemale ? "يمكنكِ"  : "يمكنكَ";
  let context: string;
  if (examType === "EXAM1")      context = "للإختبار الجزئي";
  else if (examType === "EXAM2") context = "للإختبار التراكمي";
  else                           context = "لهذا اليوم";
  return `تم تقييم ${hifdh} ${context} من قبل ${sup} *${teacherName}* ${can} الإطلاع على النتيجة من تطبيق تحفيظ`;
}

// حساب page_status لصفوف الحفظ اليومي (users_pages): sowad + nisyan
function calcPageStatusNotExam(sowad: number, nisyan: number): string {
  const sum = sowad + nisyan;
  if (sum >= 3) return "reject";
  if (sum === 2) return "good";
  if (sum === 1) return "very_good";
  return "perfect";
}

// حساب page_status لصفوف الاختبار (users_pages_tests): sowad + nisyan + (fateh × 2)
function calcPageStatusExam(sowad: number, nisyan: number, fateh: number): string {
  const sum = sowad + nisyan + (fateh * 2);
  if (sum >= 6) return "reject";
  if (sum >= 3) return "good";       // 3 أو 4 أو 5
  if (sum >= 1) return "very_good";  // 1 أو 2
  return "perfect";                  // 0
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: true, errors: "الطريقة غير مسموح بها" }, 405);
  }

  // ── 1. التحقق من التوكن ──────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return jsonResponse({ error: true, errors: "يجب إرسال رمز المصادقة" }, 401);
  }

  const { data: authData, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !authData?.user?.id) {
    return jsonResponse({ error: true, errors: "رمز المصادقة غير صالح" }, 401);
  }

  const authId = authData.user.id;

  // ── 2. قراءة body والتحقق من الحقول ─────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: true, errors: "بيانات غير صالحة" }, 400);
  }

  const { user_id, save_id, req_type, custom_info_text } = body ?? {};
  const rawNisyan = body?.nisyan;
  const rawSowad  = body?.sowad;
  const rawFateh  = body?.fateh;

  // الحقول المطلوبة حصراً في كل الأحوال
  if (
    !user_id || !save_id || !req_type ||
    rawNisyan === undefined || rawNisyan === null ||
    rawSowad  === undefined || rawSowad  === null ||
    custom_info_text === undefined || custom_info_text === null
  ) {
    return jsonResponse({ error: true, errors: "بيانات غير مكتملة" }, 400);
  }

  if (!VALID_TYPES.includes(req_type)) {
    return jsonResponse({ error: true, errors: "نوع الطلب غير صحيح، القيم المقبولة: NOT_EXAM, EXAM" }, 400);
  }

  if (typeof custom_info_text !== "string") {
    return jsonResponse({ error: true, errors: "بيانات غير صالحة" }, 400);
  }

  // تحويل sowad و nisyan من string إلى number والتحقق من صحتهما
  const nisyan = parseCount(rawNisyan);
  const sowad  = parseCount(rawSowad);

  if (nisyan === null || sowad === null) {
    return jsonResponse({ error: true, errors: "قيم الأخطاء يجب أن تكون أرقاماً صحيحة بين 0 و 999" }, 400);
  }

  // fateh مطلوب حصراً في حالة الاختبار EXAM
  let fateh: number | null = null;
  if (req_type === "EXAM") {
    if (rawFateh === undefined || rawFateh === null) {
      return jsonResponse({ error: true, errors: "بيانات غير مكتملة" }, 400);
    }
    fateh = parseCount(rawFateh);
    if (fateh === null) {
      return jsonResponse({ error: true, errors: "قيم الأخطاء يجب أن تكون أرقاماً صحيحة بين 0 و 999" }, 400);
    }
  }

  // ── 3. التحقق من users: save_id يخص user_id + جلب الجنس والهاتف ──
  const { data: userRow, error: userErr } = await supabaseAdmin
    .from("users")
    .select("save_id, gender, user_phone_number")
    .eq("user_id", user_id)
    .maybeSingle();

  if (userErr || !userRow) {
    return jsonResponse({ error: true, errors: "لم يتم إيجاد الطالب، يرجى التواصل مع إدارة المركز" }, 404);
  }

  if (String(userRow.save_id) !== String(save_id)) {
    return jsonResponse({ error: true, errors: "الحفظ المحدد لا يتطابق مع حفظ الطالب الحالي، يرجى التواصل مع إدارة المركز" }, 403);
  }

  // ── 4. جلب صف users_saves ────────────────────────────────────────
  const { data: saveRow, error: saveErr } = await supabaseAdmin
    .from("users_saves")
    .select("teacher_id, exam1_teacher_id, exam2_teacher_id, status")
    .eq("id", save_id)
    .maybeSingle();

  if (saveErr || !saveRow) {
    return jsonResponse({ error: true, errors: "لم يتم إيجاد بيانات الحفظ، يرجى التواصل مع إدارة المركز" }, 404);
  }

  // ── 5. تحديد الجدول المستهدف وجلب آخر صف بعد كل عمليات التحقق ────
  const isFemale  = userRow.gender === "female";
  const inWindow  = isIn45MinWindow();

  let targetTable: "users_pages" | "users_pages_tests";
  let targetRow: any;
  let pageStatus: string;
  let errorsNumber: Record<string, number>;
  let resolvedExamType: "EXAM1" | "EXAM2" | undefined;

  if (req_type === "NOT_EXAM") {
    if (String(saveRow.teacher_id ?? "") !== authId) {
      return jsonResponse({ error: true, errors: "أنت لست المشرف المسؤول عن هذا الحفظ، يرجى التواصل مع إدارة المركز" }, 403);
    }
    if (saveRow.status !== "ACTIVE") {
      return jsonResponse({ error: true, errors: "حالة الحفظ الحالية لا تسمح بهذه العملية، يرجى التواصل مع إدارة المركز" }, 403);
    }

    const { data: pages, error: pagesErr } = await supabaseAdmin
      .from("users_pages")
      .select("id, status, page_status, teacher_id, teacher_name, is_45min_requested")
      .eq("save_id", save_id)
      .order("id", { ascending: false })
      .limit(1);

    if (pagesErr || !pages || pages.length === 0) {
      return jsonResponse({ error: true, errors: "لم يتم إيجاد أي صفحة حفظ لهذا الحفظ، يرجى التواصل مع إدارة المركز" }, 404);
    }

    targetRow    = pages[0];
    targetTable  = "users_pages";

    if (String(targetRow.teacher_id ?? "") !== authId) {
      return jsonResponse({ error: true, errors: "لا تملك صلاحية الوصول لهذا الصف، يرجى التواصل مع إدارة المركز" }, 403);
    }

    pageStatus   = calcPageStatusNotExam(sowad, nisyan);
    errorsNumber = { nisyan, sowad };

  } else {
    // مسار EXAM: نوع الاختبار يُحدَّد من حالة الحفظ
    let examType: "EXAM1" | "EXAM2";
    let examTeacherId: string;
    let examNotAllowedMsg: string;

    if (saveRow.status === "IN_EXAM1") {
      examType          = "EXAM1";
      examTeacherId     = String(saveRow.exam1_teacher_id ?? "");
      examNotAllowedMsg = "أنت لست المشرف المكلّف بالاختبار الجزئي لهذا الحفظ، يرجى التواصل مع إدارة المركز";
    } else if (saveRow.status === "IN_EXAM2") {
      examType          = "EXAM2";
      examTeacherId     = String(saveRow.exam2_teacher_id ?? "");
      examNotAllowedMsg = "أنت لست المشرف المكلّف بالاختبار التراكمي لهذا الحفظ، يرجى التواصل مع إدارة المركز";
    } else {
      return jsonResponse({ error: true, errors: "حالة الحفظ الحالية لا تسمح بعملية الاختبار، يرجى التواصل مع إدارة المركز" }, 403);
    }

    if (examTeacherId !== authId) {
      return jsonResponse({ error: true, errors: examNotAllowedMsg }, 403);
    }

    const { data: tests, error: testsErr } = await supabaseAdmin
      .from("users_pages_tests")
      .select("id, status, page_status, teacher_id, teacher_name, is_45min_requested, type")
      .eq("save_id", save_id)
      .eq("type", examType)
      .order("id", { ascending: false })
      .limit(1);

    if (testsErr || !tests || tests.length === 0) {
      const noRowMsg = examType === "EXAM1"
        ? "وقت الإختبار الجزئي لم يدخل بعد، يرجى التواصل مع إدارة المركز"
        : "وقت الإختبار التراكمي لم يدخل بعد، يرجى التواصل مع إدارة المركز";
      return jsonResponse({ error: true, errors: noRowMsg }, 404);
    }

    targetRow   = tests[0];
    targetTable = "users_pages_tests";

    if (String(targetRow.teacher_id ?? "") !== authId) {
      return jsonResponse({ error: true, errors: "لا تملك صلاحية الوصول لهذا الصف، يرجى التواصل مع إدارة المركز" }, 403);
    }

    resolvedExamType = examType;
    pageStatus       = calcPageStatusExam(sowad, nisyan, fateh as number);
    errorsNumber     = { nisyan, sowad, fateh: fateh as number };
  }

  // ── 7. التحقق من أن الصف في حالة استعداد ────────────────────────
  if (targetRow.status !== "ready" || targetRow.page_status !== "ready") {
    return jsonResponse({ error: true, errors: "لا يمكن نشر التقييم، حالة الصف الحالية لا تسمح بذلك، يرجى التواصل مع إدارة المركز" }, 403);
  }

  // ── 8. بناء التحديث وتنفيذه ──────────────────────────────────────
  const updatePayload: Record<string, any> = {
    status      : "finished",
    page_status : pageStatus,
    errors_number: errorsNumber,
    finished_at : new Date().toISOString(),
  };

  // custom_info: فقط إذا أرسل المشرف نصاً غير فارغ
  if (custom_info_text !== "") {
    updatePayload.custom_info = custom_info_text;
  }

  // is_45min_requested: تُحوَّل إلى true فقط ضمن نافذة 11:00–11:45 مساءً وإذا كانت false
  if (inWindow && targetRow.is_45min_requested === false) {
    updatePayload.is_45min_requested = true;
  }

  const { error: updateErr } = await supabaseAdmin
    .from(targetTable)
    .update(updatePayload)
    .eq("id", targetRow.id);

  if (updateErr) {
    console.error("[PUBLISH UPDATE ERROR]:", updateErr);
    return jsonResponse({ error: true, errors: "حدث خطأ أثناء نشر التقييم، يرجى المحاولة مرة أخرى" }, 500);
  }

  // ── 9. إرسال رسالة واتساب للطالب ─────────────────────────────────
  const studentPhone = String(userRow.user_phone_number ?? "");
  if (studentPhone) {
    const message = buildStudentMessage(isFemale, String(targetRow.teacher_name ?? ""), resolvedExamType);
    await sendWahaMessage(studentPhone, message);
  }

  return jsonResponse({ error: false, message: "تم نشر التقييم بنجاح" });
});
