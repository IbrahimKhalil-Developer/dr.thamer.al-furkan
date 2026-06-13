import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")              ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function jsonResponse(payload: any, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: true, errors: "الطريقة غير مسموح بها" }, 405);
  }

  // ── 1. التحقق من التوكن عبر Authorization header ─────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token      = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  if (!token) {
    return jsonResponse({ error: true, errors: "يجب إرسال رمز المصادقة" }, 401);
  }

  const { data: authData, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !authData?.user?.email) {
    return jsonResponse({ error: true, errors: "رمز المصادقة غير صالح" }, 401);
  }

  // ── 2. جلب teacher_id من جدول teachers بالإيميل ─────────────────
  const { data: teacher, error: teacherErr } = await supabaseAdmin
    .from("teachers")
    .select("teacher_id")
    .eq("email", authData.user.email)
    .maybeSingle();

  if (teacherErr || !teacher) {
    return jsonResponse({ error: true, errors: "الحساب غير موجود" }, 401);
  }

  const teacherId = String(teacher.teacher_id);

  // ── 3. قراءة الـ body ─────────────────────────────────────────────
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: true, errors: "بيانات غير صالحة" }, 400);
  }

  const { user_id } = body ?? {};

  if (!user_id) {
    return jsonResponse({ error: true, errors: "بيانات غير مكتملة" }, 400);
  }

  // ── 4. جلب save_id الحالي للطالب ────────────────────────────────
  const { data: userRow, error: userRowErr } = await supabaseAdmin
    .from("users")
    .select("save_id")
    .eq("user_id", user_id)
    .maybeSingle();

  if (userRowErr || !userRow) {
    return jsonResponse({ error: true, errors: "الطالب غير موجود" }, 404);
  }

  const currentSaveId = userRow.save_id;

  if (!currentSaveId) {
    return jsonResponse({ error: true, errors: "لا توجد حفظة نشطة لهذا الطالب" }, 404);
  }

  // ── 5. جلب الحفظة الحالية للتحقق من الملكية والحالة ─────────────
  const { data: currentSave, error: saveErr } = await supabaseAdmin
    .from("users_saves")
    .select("teacher_id, exam1_teacher_id, exam2_teacher_id, status")
    .eq("id", currentSaveId)
    .maybeSingle();

  if (saveErr || !currentSave) {
    return jsonResponse({ error: true, errors: "لا توجد حفظة نشطة لهذا الطالب" }, 404);
  }

  const isMainTeacher  = String(currentSave.teacher_id       ?? "") === teacherId;
  const isExam1Teacher = String(currentSave.exam1_teacher_id ?? "") === teacherId;
  const isExam2Teacher = String(currentSave.exam2_teacher_id ?? "") === teacherId;

  if (!isMainTeacher && !isExam1Teacher && !isExam2Teacher) {
    return jsonResponse({ error: true, errors: "غير مصرح لك بعرض بيانات هذا الطالب" }, 403);
  }

  // ── 6-أ. المدرس الأصلي — كل حفظات الطالب بشرط أن تكون الحالية ACTIVE
  if (isMainTeacher) {
    if (currentSave.status !== "ACTIVE") {
      return jsonResponse({ error: false, saves: [] });
    }

    const { data: allSaves } = await supabaseAdmin
      .from("users_saves")
      .select("id, name, teacher_name, status, start_page, end_page")
      .eq("user_id", user_id)
      .order("id", { ascending: true });

    const saves = (allSaves ?? []).map((s: any) => ({
      id          : s.id           ?? "",
      name        : s.name         ?? "",
      teacher_name: s.teacher_name ?? "",
      status      : s.status       ?? "",
      start_page  : s.start_page   ?? "",
      end_page    : s.end_page     ?? "",
      its_now_save: s.id === currentSaveId,
    }));

    return jsonResponse({ error: false, saves });
  }

  // ── 6-ب. مكلَّف — الحفظة الحالية فقط بشرط تطابق الحالة ووجود صف اختبار
  let examType: 1 | 2 | null = null;
  if (isExam1Teacher && currentSave.status === "IN_EXAM1") {
    examType = 1;
  } else if (isExam2Teacher && currentSave.status === "IN_EXAM2") {
    examType = 2;
  }

  if (!examType) {
    return jsonResponse({ error: false, saves: [] });
  }

  const { data: testRows } = await supabaseAdmin
    .from("users_pages_tests")
    .select("id")
    .eq("save_id", currentSaveId)
    .eq("type", examType === 1 ? "EXAM1" : "EXAM2")
    .limit(1);

  if (!testRows || testRows.length === 0) {
    return jsonResponse({ error: false, saves: [] });
  }

  const { data: saveRow } = await supabaseAdmin
    .from("users_saves")
    .select("id, name, teacher_name, status, start_page, end_page")
    .eq("id", currentSaveId)
    .maybeSingle();

  const saves = saveRow ? [{
    id          : saveRow.id           ?? "",
    name        : saveRow.name         ?? "",
    teacher_name: saveRow.teacher_name ?? "",
    status      : saveRow.status       ?? "",
    start_page  : saveRow.start_page   ?? "",
    end_page    : saveRow.end_page     ?? "",
    its_now_save: true,
    exam_type   : examType,
  }] : [];

  return jsonResponse({ error: false, saves });
});
