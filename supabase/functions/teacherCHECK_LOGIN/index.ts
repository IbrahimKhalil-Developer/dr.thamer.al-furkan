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

async function enrichWithPhoto(student: any): Promise<any> {
  const { _rawPhoto, ...rest } = student;
  if (!_rawPhoto) return rest;
  const { data } = await supabaseAdmin.storage
    .from("male_profiles_pictures")
    .createSignedUrl(_rawPhoto, 60);
  if (data?.signedUrl) return { ...rest, photo_url: data.signedUrl };
  return rest;
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

  const { version, access_token, refresh_token } = body ?? {};

  // ── 1. التحقق من الحقول الأساسية ────────────────────────────────
  if (!version || !access_token || !refresh_token) {
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

  // ── 3. التحقق من التوكن (access أولاً، ثم refresh) ──────────────
  let authEmail: string;
  let finalAccessToken  = access_token  as string;
  let finalRefreshToken = refresh_token as string;

  const { data: userData, error: userError } =
    await supabaseAuth.auth.getUser(access_token);

  if (!userError && userData?.user?.email) {
    authEmail = userData.user.email;
  } else {
    // access_token انتهت صلاحيته — نجرب refresh
    const { data: refreshData, error: refreshError } =
      await supabaseAuth.auth.refreshSession({ refresh_token });

    if (refreshError || !refreshData?.session?.user?.email) {
      return jsonResponse({ error: true, errors: "انتهت الجلسة، يرجى تسجيل الدخول مجدداً" }, 401);
    }

    authEmail         = refreshData.session.user.email;
    finalAccessToken  = refreshData.session.access_token;
    finalRefreshToken = refreshData.session.refresh_token;
  }

  // ── 4. البحث عن المشرف في جدول teachers بالإيميل ────────────────
  const { data: teacher, error: teacherErr } = await supabaseAdmin
    .from("teachers")
    .select("teacher_id, full_name, joined, joined_in, gender")
    .eq("email", authEmail)
    .maybeSingle();

  if (teacherErr || !teacher) {
    return jsonResponse({ error: true, errors: "الحساب غير موجود" }, 401);
  }

  // ── 5. تحديث joined + جلب البيانات (كلها بالتوازي) ─────────────
  const teacherId = String(teacher.teacher_id);

  const [, savesResult, usersResult, testsResult] = await Promise.all([
    // تحديث joined إذا كان أول دخول
    teacher.joined
      ? Promise.resolve()
      : supabaseAdmin
          .from("teachers")
          .update({ joined: true, joined_in: new Date().toISOString() })
          .eq("teacher_id", teacherId),

    // الحفظات المرتبطة بهذا المشرف (أصلي أو مكلّف اختبار)
    supabaseAdmin
      .from("users_saves")
      .select("id, status, teacher_id, exam1_teacher_id, exam2_teacher_id")
      .or(`teacher_id.eq.${teacherId},exam1_teacher_id.eq.${teacherId},exam2_teacher_id.eq.${teacherId}`),

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
  const savesRows = savesResult.data ?? [];

  // حفظات المشرف الأصلي بشرط أن تكون الحالة ACTIVE
  const teacherSaveIds = new Set(
    savesRows
      .filter((s: any) => String(s.teacher_id ?? "") === teacherId && s.status === "ACTIVE")
      .map((s: any) => s.id)
  );

  // saveMap للتحقق من حالة الحفظة في taklif_students
  const saveMap = new Map<string, any>(
    savesRows.map((s: any) => [String(s.id), s])
  );

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
  const lastRowPerUser = new Map<string, any>();
  for (const row of testsResult.data ?? []) {
    const uid = String(row.user_id);
    if (!lastRowPerUser.has(uid)) lastRowPerUser.set(uid, row);
  }

  const taklifStudentsRaw = [...lastRowPerUser.values()]
    .filter((r: any) => {
      if (String(r.teacher_id) !== teacherId) return false;
      // التحقق من حالة الحفظة الحالية للطالب حسب نوع التكليف
      const u = userMap.get(String(r.user_id));
      const save = u?.save_id ? saveMap.get(String(u.save_id)) : undefined;
      if (!save) return false;
      if (String(save.exam1_teacher_id ?? "") === teacherId) return save.status === "IN_EXAM1";
      if (String(save.exam2_teacher_id ?? "") === teacherId) return save.status === "IN_EXAM2";
      return false;
    })
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
      access_token:  finalAccessToken,
      refresh_token: finalRefreshToken,
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
