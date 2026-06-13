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

function toLocalPhone(phone: string | null): string {
  const p = String(phone ?? "");
  if (p.startsWith("964")) return "0" + p.slice(3);
  return p;
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

  // ── 5. جلب بيانات الطالب من جدول users ──────────────────────────
  const { data: userRow, error: userErr } = await supabaseAdmin
    .from("users")
    .select("full_name, date_of_brith, user_phone_number, father_phone_number, gender, absence")
    .eq("user_id", user_id)
    .maybeSingle();

  if (userErr || !userRow) {
    return jsonResponse({ error: true, errors: "الطالب غير موجود" }, 404);
  }

  // absence هو JSON يحتوي على total — نُرجع قيمة total فقط
  const absenceTotal = userRow.absence?.total ?? 0;

  return jsonResponse({
    error              : false,
    full_name          : userRow.full_name           ?? "",
    date_of_brith      : userRow.date_of_brith       ?? "",
    user_phone_number  : toLocalPhone(userRow.user_phone_number),
    father_phone_number: toLocalPhone(userRow.father_phone_number),
    gender             : userRow.gender              ?? "",
    absence            : absenceTotal,
  });
});
