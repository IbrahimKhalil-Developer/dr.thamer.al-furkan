import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")              ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

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

function formatTimeBaghdad(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const baghdadDate = new Date(date.getTime() + (3 * 60 * 60 * 1000));
  let hours = baghdadDate.getUTCHours();
  const minutes = baghdadDate.getUTCMinutes();
  const ampm = hours >= 12 ? "م" : "ص";
  hours = hours % 12 || 12;
  const strMinutes = minutes < 10 ? "0" + minutes : String(minutes);
  return `${hours}:${strMinutes}${ampm}`;
}

function calcTimeReadyIsEnded(): boolean {
  const baghdad = new Date(new Date().getTime() + 3 * 60 * 60 * 1000);
  const h = baghdad.getUTCHours(), m = baghdad.getUTCMinutes();
  return h === 22 || (h === 23 && m <= 45);
}

function calcShouldRequest45min(): boolean {
  const baghdad = new Date(new Date().getTime() + 3 * 60 * 60 * 1000);
  const h = baghdad.getUTCHours(), m = baghdad.getUTCMinutes();
  return h === 23 && m <= 45;
}

function n(v: any): any {
  return v === null || v === undefined ? "" : v;
}

// شكل الرد المشترك للصفوف
function buildRowResponse(row: any, extraFields: Record<string, any> = {}): any {
  return {
    error                : false,
    id                   : n(row.id),
    page_name            : n(row.page_name),
    status               : n(row.status),
    page_status          : n(row.page_status),
    ready_at             : formatTimeBaghdad(row.ready_at),
    finished_at          : formatTimeBaghdad(row.finished_at),
    is_45min_requested   : n(row.is_45min_requested),
    MePageArabic         : n(row.MePageArabic),
    custom_info          : n(row.custom_info),
    ...extraFields,
    time_ready_is_ended  : calcTimeReadyIsEnded(),
    should_request_45min : calcShouldRequest45min(),
  };
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

  const { user_id, save_id, req_type } = body ?? {};

  if (!user_id || !save_id || !req_type) {
    return jsonResponse({ error: true, errors: "بيانات غير مكتملة" }, 400);
  }

  if (!VALID_TYPES.includes(req_type)) {
    return jsonResponse({ error: true, errors: "نوع الطلب غير صحيح، القيم المقبولة: NOT_EXAM, EXAM" }, 400);
  }

  // ── 3. التحقق من users: save_id يخص user_id ─────────────────────
  const { data: userRow, error: userErr } = await supabaseAdmin
    .from("users")
    .select("save_id")
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

  // ── 5-أ. مسار NOT_EXAM ───────────────────────────────────────────
  if (req_type === "NOT_EXAM") {
    if (String(saveRow.teacher_id ?? "") !== authId) {
      return jsonResponse({ error: true, errors: "أنت لست المشرف المسؤول عن هذا الحفظ، يرجى التواصل مع إدارة المركز" }, 403);
    }

    if (saveRow.status !== "ACTIVE") {
      return jsonResponse({ error: true, errors: "حالة الحفظ الحالية لا تسمح بهذه العملية، يرجى التواصل مع إدارة المركز" }, 403);
    }

    const { data: pages, error: pagesErr } = await supabaseAdmin
      .from("users_pages")
      .select("id, page_name, status, page_status, ready_at, finished_at, is_45min_requested, MePageArabic, custom_info, teacher_id")
      .eq("save_id", save_id)
      .order("id", { ascending: false })
      .limit(1);

    if (pagesErr || !pages || pages.length === 0) {
      return jsonResponse({ error: true, errors: "لم يتم إيجاد أي صفحة حفظ لهذا الحفظ، يرجى التواصل مع إدارة المركز" }, 404);
    }

    const pageRow = pages[0];

    if (String(pageRow.teacher_id ?? "") !== authId) {
      return jsonResponse({ error: true, errors: "لا تملك صلاحية الوصول لهذا الصف، يرجى التواصل مع إدارة المركز" }, 403);
    }

    return jsonResponse(buildRowResponse(pageRow));
  }

  // ── 5-ب. مسار EXAM (يُحدَّد نوع الاختبار من حالة الحفظ) ──────────
  // status = IN_EXAM1 → اختبار جزئي EXAM1 | status = IN_EXAM2 → اختبار تراكمي EXAM2
  let examType: "EXAM1" | "EXAM2";
  let examTeacherId: string;
  let examNotAllowedMsg: string;

  if (saveRow.status === "IN_EXAM1") {
    examType         = "EXAM1";
    examTeacherId    = String(saveRow.exam1_teacher_id ?? "");
    examNotAllowedMsg = "أنت لست المشرف المكلّف بالاختبار الجزئي لهذا الحفظ، يرجى التواصل مع إدارة المركز";
  } else if (saveRow.status === "IN_EXAM2") {
    examType         = "EXAM2";
    examTeacherId    = String(saveRow.exam2_teacher_id ?? "");
    examNotAllowedMsg = "أنت لست المشرف المكلّف بالاختبار التراكمي لهذا الحفظ، يرجى التواصل مع إدارة المركز";
  } else {
    return jsonResponse({ error: true, errors: "حالة الحفظ الحالية لا تسمح بعملية الاختبار، يرجى التواصل مع إدارة المركز" }, 403);
  }

  if (examTeacherId !== authId) {
    return jsonResponse({ error: true, errors: examNotAllowedMsg }, 403);
  }

  const { data: tests, error: testsErr } = await supabaseAdmin
    .from("users_pages_tests")
    .select("id, page_name, status, page_status, ready_at, finished_at, is_45min_requested, MePageArabic, custom_info, type, teacher_id")
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

  const testRow = tests[0];

  if (String(testRow.teacher_id ?? "") !== authId) {
    return jsonResponse({ error: true, errors: "لا تملك صلاحية الوصول لهذا الصف، يرجى التواصل مع إدارة المركز" }, 403);
  }

  return jsonResponse(buildRowResponse(testRow, { type: n(testRow.type) }));
});
