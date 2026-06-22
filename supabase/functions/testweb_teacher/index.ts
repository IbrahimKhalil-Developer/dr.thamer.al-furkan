import {
  supabaseAdmin, requireAdmin, jsonResponse, preflight, toLocalPhone,
  genderLabel, saveStatusLabel,
} from "../_shared/guard.ts";

async function signPhoto(path: string, gender: string): Promise<string | null> {
  if (!path || gender !== "male") return null;
  const { data } = await supabaseAdmin.storage.from("male_profiles_pictures").createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const { response } = await requireAdmin(req);
  if (response) return response;

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
      supabaseAdmin.from("users_saves").select("id, user_id, name, status, teacher_id, exam1_teacher_id, exam2_teacher_id"),
      supabaseAdmin.from("users").select("user_id, full_name, gender, user_phone_number, save_id, joined, photo_url"),
    ]);

    if (tRes.error)  return jsonResponse({ error: true, errors: tRes.error.message }, 400);
    if (!tRes.data)  return jsonResponse({ error: true, errors: "المشرف غير موجود" }, 404);

    const t     = tRes.data;
    const saves = savesRes.data ?? [];
    const users = usersRes.data ?? [];
    const saveMap = new Map<string, any>(saves.map((s: any) => [String(s.id), s]));

    const myStudents: any[] = [];
    const examStudents: any[] = [];
    for (const u of users) {
      const save = u.save_id ? saveMap.get(String(u.save_id)) : null;
      if (!save) continue;
      const base = {
        user_id: u.user_id, full_name: u.full_name ?? "",
        gender: u.gender ?? "", gender_label: genderLabel(u.gender ?? ""),
        phone: toLocalPhone(u.user_phone_number ?? ""), joined: u.joined === true,
        save_name: save.name ?? "", save_status: saveStatusLabel(save.status ?? ""),
        photo_url: await signPhoto(String(u.photo_url ?? ""), u.gender ?? ""),
      };
      if (String(save.teacher_id ?? "") === teacherId) myStudents.push(base);
      else if (String(save.exam1_teacher_id ?? "") === teacherId || String(save.exam2_teacher_id ?? "") === teacherId)
        examStudents.push({ ...base, exam_kind: String(save.exam1_teacher_id ?? "") === teacherId ? "اختبار جزئي" : "اختبار تراكمي" });
    }

    const photoUrl = await signPhoto(String(t.photo_url ?? ""), t.gender ?? "");

    const teacherOut = {
      teacher_id: t.teacher_id ?? "", full_name: t.full_name ?? "",
      gender: t.gender ?? "", gender_label: genderLabel(t.gender ?? ""),
      phone: toLocalPhone(t.phone_number ?? ""), password: t.password ?? "",
      date_of_brith: t.date_of_brith ?? "—", location: t.teacher_location ?? "—",
      gps: t.auto_teacher_location ?? "—", photo_url: photoUrl,
      joined: t.joined === true, joined_in: t.joined_in ?? null,
      absence_total: (typeof t.absence === "number") ? t.absence : Number(t.absence?.total ?? 0),
      created_at: t.created_at ?? null,
    };

    return jsonResponse({
      error: false, teacher: teacherOut,
      my_students: myStudents, exam_students: examStudents,
      counts: { my: myStudents.length, exam: examStudents.length },
    });
  } catch (e) {
    return jsonResponse({ error: true, errors: String(e) }, 500);
  }
});
