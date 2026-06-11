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

async function enrichWithPhoto(student: any): Promise<any> {
  const { _rawPhoto, ...rest } = student;
  if (!_rawPhoto) return rest;
  const { data } = await supabaseAdmin.storage
    .from("male_profiles_pictures")
    .createSignedUrl(_rawPhoto, 60);
  if (data?.signedUrl) return { ...rest, photo_url: data.signedUrl };
  return rest;
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
    .select("teacher_id, full_name, email, password, joined, joined_in, gender")
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

  // ── 6. تحديث joined + جلب البيانات (كلها بالتوازي) ─────────────
  const teacherId = String(teacher.teacher_id);

  const [, savesResult, usersResult, testsResult] = await Promise.all([
    // تحديث joined إذا كان أول دخول (fire-and-forget مع الباقي)
    teacher.joined
      ? Promise.resolve()
      : supabaseAdmin
          .from("teachers")
          .update({ joined: true, joined_in: new Date().toISOString() })
          .eq("teacher_id", teacherId),

    // save_ids التابعة لهذا المشرف
    supabaseAdmin
      .from("users_saves")
      .select("id")
      .eq("teacher_id", teacherId),

    // كل المستخدمين (أعمدة ضرورية فقط)
    supabaseAdmin
      .from("users")
      .select("user_id, full_name, gender, save_id, photo_url"),

    // آخر صف لكل user_id في users_pages_tests (أعمدة ضرورية فقط)
    supabaseAdmin
      .from("users_pages_tests")
      .select("id, user_id, teacher_id")
      .order("id", { ascending: false }),
  ]);

  // ── بناء الهياكل المساعدة (O(n) في الذاكرة) ─────────────────────
  const teacherSaveIds = new Set((savesResult.data ?? []).map((s: any) => s.id));

  // userMap مشترك لـ my_students و taklif_students — يُبنى مرة واحدة
  const userMap = new Map<string, any>(
    (usersResult.data ?? []).map((u: any) => [String(u.user_id), u])
  );

  // ── my_students ───────────────────────────────────────────────────
  const myStudentsRaw = (usersResult.data ?? [])
    .filter((u: any) => u.save_id && teacherSaveIds.has(u.save_id))
    .map((u: any) => ({
      user_id    : u.user_id   ?? "",
      full_name  : u.full_name ?? "",
      gender     : u.gender    ?? "",
      now_save_id: u.save_id   ?? "",
      _rawPhoto  : u.gender === "male" ? (u.photo_url ?? "") : "",
    }));

  // ── taklif_students ───────────────────────────────────────────────
  // آخر صف لكل user_id (الأول بالترتيب التنازلي = الأحدث)
  const lastRowPerUser = new Map<string, any>();
  for (const row of testsResult.data ?? []) {
    const uid = String(row.user_id);
    if (!lastRowPerUser.has(uid)) lastRowPerUser.set(uid, row);
  }

  const taklifStudentsRaw = [...lastRowPerUser.values()]
    .filter((r: any) => String(r.teacher_id) === teacherId)
    .map((r: any) => {
      const u = userMap.get(String(r.user_id)) ?? {};
      return {
        exam_row_id: r.id                 ?? "",
        user_id    : r.user_id            ?? "",
        full_name  : (u as any).full_name ?? "",
        gender     : (u as any).gender    ?? "",
        now_save_id: (u as any).save_id   ?? "",
        _rawPhoto  : (u as any).gender === "male" ? ((u as any).photo_url ?? "") : "",
      };
    });

  const [myStudents, taklifStudents] = await Promise.all([
    Promise.all(myStudentsRaw.map(enrichWithPhoto)),
    Promise.all(taklifStudentsRaw.map(enrichWithPhoto)),
  ]);

  // ── الرد ─────────────────────────────────────────────────────────
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
      gender:     teacher.gender     ?? "",
    },
    my_students    : myStudents,
    taklif_students: taklifStudents,
  }, 200);
});
