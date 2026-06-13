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

const UNAUTHORIZED = { error: true, errors: "غير مصرح بإضهار معلومات الحفظ" };

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

  const { user_id, now_save_id } = body ?? {};

  if (!user_id || !now_save_id) {
    return jsonResponse({ error: true, errors: "بيانات غير مكتملة" }, 400);
  }

  // ── 4. جلب صف الحفظة من users_saves ─────────────────────────────
  const { data: saveRow, error: saveErr } = await supabaseAdmin
    .from("users_saves")
    .select("id, user_id, teacher_id, status, name, teacher_name, exam1_teacher_name, exam2_teacher_name, start_page, end_page, current_page, every_day_page, started_at, exam1, exam2")
    .eq("id", now_save_id)
    .maybeSingle();

  if (saveErr || !saveRow) {
    return jsonResponse(UNAUTHORIZED, 403);
  }

  // ── 5. التحقق: user_id يطابق صاحب الحفظة ────────────────────────
  if (String(saveRow.user_id) !== String(user_id)) {
    return jsonResponse(UNAUTHORIZED, 403);
  }

  // ── 6. التحقق: الحفظة نشطة ───────────────────────────────────────
  if (saveRow.status !== "ACTIVE") {
    return jsonResponse(UNAUTHORIZED, 403);
  }

  // ── 7. التحقق: teacher_id يطابق المشرف في التوكن ────────────────
  if (String(saveRow.teacher_id ?? "") !== teacherId) {
    return jsonResponse(UNAUTHORIZED, 403);
  }

  // ── 7. الرد بمعلومات الحفظة ──────────────────────────────────────
  return jsonResponse({
    error: false,
    save: {
      name               : saveRow.name                ?? "",
      teacher_name       : saveRow.teacher_name        ?? "",
      exam1_teacher_name : saveRow.exam1_teacher_name  ?? "",
      exam2_teacher_name : saveRow.exam2_teacher_name  ?? "",
      start_page         : saveRow.start_page          ?? "",
      end_page           : saveRow.end_page            ?? "",
      current_page       : saveRow.current_page        ?? "",
      every_day_page     : saveRow.every_day_page      ?? "",
      started_at         : saveRow.started_at          ?? "",
      exam1              : saveRow.exam1               ?? "",
      exam2              : saveRow.exam2               ?? "",
    },
  });
});
