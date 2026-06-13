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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: true, errors: "بيانات غير صالحة" }, 400);
  }

  const { access_token, refresh_token, user_id } = body ?? {};

  // ── 1. التحقق من الحقول الأساسية ────────────────────────────────
  if (!access_token || !refresh_token || !user_id) {
    return jsonResponse({ error: true, errors: "بيانات غير مكتملة" }, 400);
  }

  // ── 2. التحقق من توكن الأستاذ ───────────────────────────────────
  let authEmail: string;

  const { data: userData, error: userError } =
    await supabaseAuth.auth.getUser(access_token);

  if (!userError && userData?.user?.email) {
    authEmail = userData.user.email;
  } else {
    const { data: refreshData, error: refreshError } =
      await supabaseAuth.auth.refreshSession({ refresh_token });

    if (refreshError || !refreshData?.session?.user?.email) {
      return jsonResponse({ error: true, errors: "انتهت الجلسة، يرجى تسجيل الدخول مجدداً" }, 401);
    }

    authEmail = refreshData.session.user.email;
  }

  // ── 3. جلب teacher_id من جدول teachers ──────────────────────────
  const { data: teacher, error: teacherErr } = await supabaseAdmin
    .from("teachers")
    .select("teacher_id")
    .eq("email", authEmail)
    .maybeSingle();

  if (teacherErr || !teacher) {
    return jsonResponse({ error: true, errors: "الحساب غير موجود" }, 401);
  }

  const teacherId = String(teacher.teacher_id);

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

  // ── 5. جلب الحفظة الحالية للتحقق من الملكية ─────────────────────
  const { data: currentSave, error: saveErr } = await supabaseAdmin
    .from("users_saves")
    .select("teacher_id, exam1_teacher_id, exam2_teacher_id")
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

  // ── 6-أ. المدرس الأصلي — كل حفظات الطالب ───────────────────────
  if (isMainTeacher) {
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

  // ── 6-ب. مكلَّف — الحفظة الحالية فقط مع exam_type ──────────────
  const { data: saveRow } = await supabaseAdmin
    .from("users_saves")
    .select("id, name, teacher_name, status, start_page, end_page")
    .eq("id", currentSaveId)
    .maybeSingle();

  const examType = isExam1Teacher ? 1 : 2;

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
