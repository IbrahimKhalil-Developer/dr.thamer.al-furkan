import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")              ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SYSTEM_KEY                = Deno.env.get("system_key")                ?? "";

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

function normalizePhone(p: string): string {
  const s = String(p ?? "").trim();
  if (s.startsWith("0")) return "964" + s.slice(1);
  return s;
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

  const { version, phone_number, password } = body ?? {};

  // ── 1. التحقق من الحقول الأساسية ────────────────────────────────
  if (!version || !phone_number || !password) {
    return jsonResponse({ error: true, errors: "بيانات غير مكتملة" }, 400);
  }

  // ── 2. فحص الإصدار ───────────────────────────────────────────────
  const { data: updateRow, error: updateErr } = await supabaseAdmin
    .from("updates")
    .select("*")
    .eq("version_number", version)
    .maybeSingle();

  if (updateErr || !updateRow) {
    return jsonResponse({ error: true, errors: "هذا الإصدار غير مدعوم، يرجى تحديث التطبيق" }, 426);
  }

  if (updateRow.update === true) {
    return jsonResponse({
      error: false,
      update: true,
      title:         updateRow.title         ?? "",
      message:       updateRow.message       ?? "",
      ok_button:     updateRow.ok_button     ?? "",
      cancel_button: updateRow.cancel_button ?? "",
      url:           updateRow.url           ?? "",
    }, 200);
  }

  // ── 3. تحويل رقم الهاتف ─────────────────────────────────────────
  const normalizedPhone = normalizePhone(phone_number);

  // ── 4. البحث عن المشرف في جدول teachers ─────────────────────────
  const { data: teacher, error: teacherErr } = await supabaseAdmin
    .from("teachers")
    .select("teacher_id, full_name, email, password, joined, joined_in")
    .eq("phone_number", normalizedPhone)
    .maybeSingle();

  if (teacherErr || !teacher) {
    return jsonResponse({ error: true, errors: "رقم الهاتف أو كلمة السر غير صحيحة" }, 401);
  }

  // ── 5. تسجيل الدخول عبر Supabase Auth ───────────────────────────
  const { data: authSession, error: authError } =
    await supabaseAuth.auth.signInWithPassword({
      email:    teacher.email,
      password: password + SYSTEM_KEY,
    });

  if (authError || !authSession?.session) {
    return jsonResponse({ error: true, errors: "رقم الهاتف أو كلمة السر غير صحيحة" }, 401);
  }

  // ── 6. تحديث joined إذا كان أول دخول ────────────────────────────
  if (!teacher.joined) {
    await supabaseAdmin
      .from("teachers")
      .update({ joined: true, joined_in: new Date().toISOString() })
      .eq("teacher_id", teacher.teacher_id);
  }

  // ── 7. الرد ──────────────────────────────────────────────────────
  return jsonResponse({
    error: false,
    update: false,
    account: {
      access_token:  authSession.session.access_token,
      refresh_token: authSession.session.refresh_token,
    },
    user: {
      full_name:  teacher.full_name  ?? "",
      teacher_id: teacher.teacher_id ?? "",
    },
  }, 200);
});
