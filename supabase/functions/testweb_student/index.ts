import {
  supabaseAdmin, requireAdmin, jsonResponse, preflight, toLocalPhone,
  genderLabel, saveStatusLabel, rowStatusLabel, gradeKind, examTypeLabel, calcProgress, pageDisp,
} from "../_shared/guard.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const { response } = await requireAdmin(req);
  if (response) return response;

  try {
    let userId = "";
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      userId = String(body?.user_id ?? "");
    } else {
      userId = new URL(req.url).searchParams.get("id") ?? "";
    }
    if (!userId) return jsonResponse({ error: true, errors: "المفتاح user_id مطلوب" }, 400);

    const [userRes, savesRes, pagesRes, testsRes, teachersRes] = await Promise.all([
      supabaseAdmin.from("users").select("*").eq("user_id", userId).maybeSingle(),
      supabaseAdmin.from("users_saves").select("*").eq("user_id", userId),
      supabaseAdmin.from("users_pages").select("*").eq("user_id", userId),
      supabaseAdmin.from("users_pages_tests").select("*").eq("user_id", userId),
      supabaseAdmin.from("teachers").select("teacher_id, full_name, gender, phone_number"),
    ]);

    if (userRes.error)  return jsonResponse({ error: true, errors: userRes.error.message }, 400);
    if (!userRes.data)  return jsonResponse({ error: true, errors: "الطالب غير موجود" }, 404);

    const u        = userRes.data;
    const saves    = savesRes.data ?? [];
    const pages    = pagesRes.data ?? [];
    const tests    = testsRes.data ?? [];
    const teachers = teachersRes.data ?? [];

    const isFU = u.gender === "female";
    const teacherGender = new Map<string, boolean>(teachers.map((t: any) => [String(t.teacher_id), t.gender === "female"]));
    const teacherName   = new Map<string, string>(teachers.map((t: any) => [String(t.teacher_id), t.full_name ?? ""]));

    let photoUrl: string | null = null;
    if (u.photo_url && u.gender === "male") {
      const { data: ph } = await supabaseAdmin.storage
        .from("male_profiles_pictures").createSignedUrl(String(u.photo_url), 600);
      photoUrl = ph?.signedUrl ?? null;
    }

    const pagesBySave = new Map<string, any[]>();
    for (const p of pages) { const k = String(p.save_id); if (!pagesBySave.has(k)) pagesBySave.set(k, []); pagesBySave.get(k)!.push(p); }
    const testsBySave = new Map<string, any[]>();
    for (const t of tests) { const k = String(t.save_id); if (!testsBySave.has(k)) testsBySave.set(k, []); testsBySave.get(k)!.push(t); }

    const userOut = {
      user_id: u.user_id ?? "", full_name: u.full_name ?? "",
      gender: u.gender ?? "", gender_label: genderLabel(u.gender ?? ""),
      phone: toLocalPhone(u.user_phone_number ?? ""),
      father_phone: toLocalPhone(u.father_phone_number ?? ""),
      email: u.email ?? "", password: u.password ?? "",
      date_of_brith: u.date_of_brith ?? "—",
      location: u.user_location ?? "—", gps: u.auto_user_location ?? "—",
      photo_url: photoUrl,
      joined: u.joined === true, joined_in: u.joined_in ?? null,
      last_logined_in: u.last_logined_in ?? null, last_opened_in: u.last_opened_in ?? null,
      profile_incomplete: u.profile_incomplete === true,
      absence_total: (typeof u.absence === "number") ? u.absence : Number(u.absence?.total ?? 0),
      teacher_id: u.teacher_id ?? "", teacher_name: teacherName.get(String(u.teacher_id)) ?? "—",
      save_id: u.save_id ?? null,
      added_admin: u.added_admin_phone_number ?? "",
      edited_admin: u.edited_admin_phone_number ?? "",
      created_at: u.created_at ?? null,
    };

    const savesSorted = [...saves].sort((a: any, b: any) =>
      (Number(a.number ?? 0) - Number(b.number ?? 0)) || (Number(a.id ?? 0) - Number(b.id ?? 0)));

    const savesOut = savesSorted.map((s: any) => {
      const edp = Number(s.every_day_page) || 1;
      const savePages = (pagesBySave.get(String(s.id)) ?? []).sort((a: any, b: any) => (Number(a.id ?? 0) - Number(b.id ?? 0)));
      const saveTests = (testsBySave.get(String(s.id)) ?? []).sort((a: any, b: any) => (Number(a.id ?? 0) - Number(b.id ?? 0)));

      const pagesOut = savePages.map((p: any) => {
        const iFT = teacherGender.get(String(p.teacher_id)) ?? false;
        return {
          id: p.id, date: p.date ?? null, page: p.page ?? null,
          page_display: pageDisp(p, edp), page_name: p.page_name ?? "",
          status: p.status ?? "", page_status: p.page_status ?? "",
          status_label: rowStatusLabel(p.status ?? "", p.page_status ?? "", isFU, iFT),
          grade_kind: gradeKind(p.status ?? "", p.page_status ?? ""),
          errors_number: p.errors_number ?? null, teacher_name: p.teacher_name ?? "—",
          created_at: p.created_at ?? null, finished_at: p.finished_at ?? null, custom_info: p.custom_info ?? "",
        };
      });

      const testsOut = saveTests.map((t: any) => {
        const iFT = teacherGender.get(String(t.teacher_id)) ?? false;
        return {
          id: t.id, type: t.type ?? "", type_label: examTypeLabel(t.type ?? ""),
          date: t.date ?? null, status: t.status ?? "", page_status: t.page_status ?? "",
          status_label: rowStatusLabel(t.status ?? "", t.page_status ?? "", isFU, iFT),
          grade_kind: gradeKind(t.status ?? "", t.page_status ?? ""),
          errors_number: t.errors_number ?? null, teacher_name: t.teacher_name ?? "—",
          start_page: t.start_page ?? null, end_page: t.end_page ?? null,
          created_at: t.created_at ?? null, finished_at: t.finished_at ?? null, custom_info: t.custom_info ?? "",
        };
      });

      const pr = calcProgress(s, savePages);
      return {
        id: s.id, name: s.name ?? "", number: s.number ?? null,
        status: s.status ?? "", status_label: saveStatusLabel(s.status ?? ""),
        status_reason: s.status_reason ?? "", old_status: s.old_status ?? "",
        teacher_id: s.teacher_id ?? "", teacher_name: s.teacher_name ?? "—",
        start_page: s.start_page ?? null, end_page: s.end_page ?? null,
        every_day_page: s.every_day_page ?? null,
        started_at: s.started_at ?? null, finished_at: s.finished_at ?? null,
        exam1: s.exam1 === true, exam2: s.exam2 === true,
        exam1_teacher_id: s.exam1_teacher_id ?? null, exam2_teacher_id: s.exam2_teacher_id ?? null,
        exam1_teacher_name: teacherName.get(String(s.exam1_teacher_id)) ?? "—",
        exam2_teacher_name: teacherName.get(String(s.exam2_teacher_id)) ?? "—",
        exam1_date: s.exam1_date ?? null, exam2_date: s.exam2_date ?? null,
        progress_pct: pr.pct, saved_pages: pr.saved, total_pages: pr.total,
        is_current: String(u.save_id ?? "") === String(s.id),
        pages: pagesOut, tests: testsOut,
      };
    });

    return jsonResponse({ error: false, user: userOut, saves: savesOut });
  } catch (e) {
    return jsonResponse({ error: true, errors: String(e) }, 500);
  }
});
