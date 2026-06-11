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

  const teacherId = String(teacher.teacher_id);

  // ── 7. my_students — طلاب المشرف الحالي ─────────────────────────
  // جلب كل الـ save_ids التابعة لهذا المشرف
  const { data: teacherSaves } = await supabaseAdmin
    .from("users_saves")
    .select("id")
    .eq("teacher_id", teacherId);

  const teacherSaveIds = new Set((teacherSaves ?? []).map((s: any) => s.id));

  // جلب كل المستخدمين وتصفية من يملك save_id تابع لهذا المشرف
  const { data: allUsers } = await supabaseAdmin
    .from("users")
    .select("user_id, full_name, gender, save_id");

  const myStudents = (allUsers ?? [])
    .filter((u: any) => u.save_id && teacherSaveIds.has(u.save_id))
    .map((u: any) => ({
      user_id    : u.user_id    ?? "",
      full_name  : u.full_name  ?? "",
      gender     : u.gender     ?? "",
      now_save_id: u.save_id    ?? "",
    }));

  // ── 8. taklif_students — طلاب الاختبار المكلَّف بهم ─────────────
  // جلب كل صفوف users_pages_tests مرتبة تنازلياً للحصول على آخر صف لكل user_id
  const { data: allTests } = await supabaseAdmin
    .from("users_pages_tests")
    .select("id, user_id, teacher_id")
    .order("id", { ascending: false });

  // آخر صف لكل user_id
  const lastRowPerUser = new Map<string, any>();
  for (const row of allTests ?? []) {
    const uid = String(row.user_id);
    if (!lastRowPerUser.has(uid)) lastRowPerUser.set(uid, row);
  }

  // تصفية: آخر صف فيه teacher_id = teacherId
  const taklifRows = [...lastRowPerUser.values()].filter(
    (r: any) => String(r.teacher_id) === teacherId
  );

  // جلب بيانات المستخدمين المرتبطين
  const taklifUserIds = taklifRows.map((r: any) => r.user_id);
  let taklifStudents: any[] = [];

  if (taklifUserIds.length > 0) {
    const { data: taklifUsers } = await supabaseAdmin
      .from("users")
      .select("user_id, full_name, gender, save_id")
      .in("user_id", taklifUserIds);

    const taklifUserMap = new Map(
      (taklifUsers ?? []).map((u: any) => [String(u.user_id), u])
    );

    taklifStudents = taklifRows.map((r: any) => {
      const u = taklifUserMap.get(String(r.user_id)) ?? {};
      return {
        exam_row_id: r.id          ?? "",
        user_id    : r.user_id     ?? "",
        full_name  : (u as any).full_name  ?? "",
        gender     : (u as any).gender     ?? "",
        now_save_id: (u as any).save_id    ?? "",
      };
    });
  }

  // ── 9. الرد ──────────────────────────────────────────────────────
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
    my_students    : myStudents,
    taklif_students: taklifStudents,
  }, 200);
});
