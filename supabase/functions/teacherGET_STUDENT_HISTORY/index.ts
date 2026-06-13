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

  // ── 4. طبقات التحقق الأربع ───────────────────────────────────────
  const { data: saveRow, error: saveErr } = await supabaseAdmin
    .from("users_saves")
    .select("id, user_id, teacher_id, status")
    .eq("id", now_save_id)
    .maybeSingle();

  if (saveErr || !saveRow) {
    return jsonResponse(UNAUTHORIZED, 403);
  }

  if (String(saveRow.user_id) !== String(user_id)) {
    return jsonResponse(UNAUTHORIZED, 403);
  }

  if (saveRow.status !== "ACTIVE") {
    return jsonResponse(UNAUTHORIZED, 403);
  }

  if (String(saveRow.teacher_id ?? "") !== teacherId) {
    return jsonResponse(UNAUTHORIZED, 403);
  }

  // ── 5. جلب جميع حفظات الطالب ─────────────────────────────────────
  const { data: allSaves } = await supabaseAdmin
    .from("users_saves")
    .select("id, name, start_page, end_page, teacher_name, every_day_page, started_at")
    .eq("user_id", user_id)
    .order("id", { ascending: true });

  const history = (allSaves ?? []).map((s: any) => ({
    name          : s.name           ?? "",
    start_page    : s.start_page     ?? "",
    end_page      : s.end_page       ?? "",
    teacher_name  : s.teacher_name   ?? "",
    every_day_page: s.every_day_page ?? "",
    started_at    : s.started_at     ?? "",
    its_now_save  : s.id === now_save_id,
  }));

  return jsonResponse({ error: false, history });
});
