import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")              ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

function jsonResponse(payload: any, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function toLocalPhone(p: string): string {
  const s = String(p ?? "").trim();
  if (s.startsWith("964"))  return "0" + s.slice(3);
  if (s.startsWith("+964")) return "0" + s.slice(4);
  return s;
}

function genderLabel(g: string): string {
  return g === "female" ? "أنثى" : "ذكر";
}

function saveStatusLabel(s: string): string {
  switch (s) {
    case "ACTIVE":     return "نشط";
    case "IN_EXAM1":   return "في الاختبار الجزئي";
    case "IN_EXAM2":   return "في الاختبار التراكمي";
    case "FINISHED":   return "مكتمل";
    case "SUSPENDED":  return "موقوف";
    case "TERMINATED": return "منهي";
    default:           return s || "—";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    let teacherId = "";
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      teacherId = String(body?.teacher_id ?? "");
    } else {
      teacherId = new URL(req.url).searchParams.get("id") ?? "";
    }

    if (!teacherId) return jsonResponse({ error: true, errors: "المفتاح teacher_id مطلوب" }, 400);

    const [tRes, savesRes, usersRes] = await Promise.all([
      supabaseAdmin.from("teachers").select("*").eq("teacher_id", teacherId).maybeSingle(),
      supabaseAdmin.from("users_saves")
        .select("id, user_id, name, status, start_page, end_page, teacher_id, exam1_teacher_id, exam2_teacher_id"),
      supabaseAdmin.from("users")
        .select("user_id, full_name, gender, user_phone_number, save_id, joined"),
    ]);

    if (tRes.error)  return jsonResponse({ error: true, errors: tRes.error.message }, 400);
    if (!tRes.data)  return jsonResponse({ error: true, errors: "المشرف غير موجود" }, 404);

    const t     = tRes.data;
    const saves = savesRes.data ?? [];
    const users = usersRes.data ?? [];

    // صورة المشرف (الذكور فقط)
    let photoUrl: string | null = null;
    if (t.photo_url && t.gender === "male") {
      const { data: ph } = await supabaseAdmin.storage
        .from("male_profiles_pictures")
        .createSignedUrl(String(t.photo_url), 300);
      photoUrl = ph?.signedUrl ?? null;
    }

    const saveMap = new Map<string, any>(saves.map((s: any) => [String(s.id), s]));

    // طلاب هذا المشرف (الحفظة الحالية للطالب يشرف عليها هذا المشرف أصلاً أو اختباراً)
    const myStudents: any[] = [];
    const examStudents: any[] = [];
    for (const u of users) {
      const save = u.save_id ? saveMap.get(String(u.save_id)) : null;
      if (!save) continue;
      const out = {
        user_id:      u.user_id,
        full_name:    u.full_name ?? "",
        gender_label: genderLabel(u.gender ?? ""),
        phone:        toLocalPhone(u.user_phone_number ?? ""),
        joined:       u.joined === true,
        save_name:    save.name ?? "",
        save_status:  saveStatusLabel(save.status ?? ""),
      };
      if (String(save.teacher_id ?? "") === teacherId) myStudents.push(out);
      else if (String(save.exam1_teacher_id ?? "") === teacherId || String(save.exam2_teacher_id ?? "") === teacherId)
        examStudents.push({ ...out, exam_kind: String(save.exam1_teacher_id ?? "") === teacherId ? "اختبار جزئي" : "اختبار تراكمي" });
    }

    const teacherOut = {
      teacher_id:      t.teacher_id ?? "",
      full_name:       t.full_name ?? "",
      gender:          t.gender ?? "",
      gender_label:    genderLabel(t.gender ?? ""),
      phone:           toLocalPhone(t.phone_number ?? ""),
      email:           t.email ?? "—",
      password:        t.password ?? "",
      date_of_brith:   t.date_of_brith ?? "—",
      location:        t.teacher_location ?? "—",
      gps:             t.auto_teacher_location ?? "—",
      photo_url:       photoUrl,
      uploaded_photo:  t.uploaded_photo === true,
      joined:          t.joined === true,
      joined_in:       t.joined_in ?? null,
      absence_total:   (typeof t.absence === "number") ? t.absence : Number(t.absence?.total ?? 0),
      absence_raw:     t.absence ?? null,
      added_admin:     toLocalPhone(t.added_admin_phone_number ?? ""),
      edited_admin:    toLocalPhone(t.edited_admin_phone_number ?? ""),
      created_at:      t.created_at ?? null,
    };

    return jsonResponse({
      error: false,
      teacher: teacherOut,
      my_students: myStudents,
      exam_students: examStudents,
      counts: { my: myStudents.length, exam: examStudents.length },
    });
  } catch (e) {
    return jsonResponse({ error: true, errors: String(e) }, 500);
  }
});
