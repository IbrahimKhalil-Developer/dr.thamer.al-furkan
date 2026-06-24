import {
  supabaseAdmin, requireAdmin, jsonResponse, preflight, toLocalPhone,
  genderLabel, saveStatusLabel, calcProgress,
} from "../_shared/guard.ts";

function absenceTotal(raw: any): number {
  if (typeof raw === "number") return raw;
  if (raw && typeof raw === "object") return Number(raw.total ?? 0);
  return 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const { admin, response } = await requireAdmin(req);
  if (response) return response;

  try {
    const [usersRes, savesRes, teachersRes, pagesRes] = await Promise.all([
      supabaseAdmin.from("users")
        .select("user_id, full_name, gender, user_phone_number, father_phone_number, save_id, teacher_id, joined, profile_incomplete, absence, photo_url, created_at, last_logined_in"),
      supabaseAdmin.from("users_saves")
        .select("id, user_id, teacher_id, name, status, start_page, end_page, every_day_page, teacher_name, exam1, exam2"),
      supabaseAdmin.from("teachers")
        .select("teacher_id, full_name, gender, phone_number, joined, joined_in, absence, created_at"),
      supabaseAdmin.from("users_pages").select("save_id, status, page_status, page"),
    ]);

    if (usersRes.error)    return jsonResponse({ error: true, errors: usersRes.error.message }, 400);
    if (savesRes.error)    return jsonResponse({ error: true, errors: savesRes.error.message }, 400);
    if (teachersRes.error) return jsonResponse({ error: true, errors: teachersRes.error.message }, 400);

    const users    = usersRes.data    ?? [];
    const saves    = savesRes.data    ?? [];
    const teachers = teachersRes.data ?? [];
    const pages    = pagesRes.data    ?? [];

    const teacherMap = new Map<string, any>(teachers.map((t: any) => [String(t.teacher_id), t]));
    const saveMap    = new Map<string, any>(saves.map((s: any) => [String(s.id), s]));

    const pagesBySave = new Map<string, any[]>();
    for (const p of pages) {
      const k = String(p.save_id);
      if (!pagesBySave.has(k)) pagesBySave.set(k, []);
      pagesBySave.get(k)!.push(p);
    }

    const studentsPerTeacher = new Map<string, number>();
    let progressSum = 0, progressCount = 0;

    const students = users.map((u: any) => {
      const save = u.save_id ? saveMap.get(String(u.save_id)) : null;
      const teacherId = String(save?.teacher_id ?? u.teacher_id ?? "");
      const teacher = teacherMap.get(teacherId);
      if (teacherId) studentsPerTeacher.set(teacherId, (studentsPerTeacher.get(teacherId) ?? 0) + 1);

      let saveOut: any = null;
      if (save) {
        const pr = calcProgress(save, pagesBySave.get(String(save.id)) ?? []);
        progressSum += pr.pct; progressCount++;
        saveOut = {
          id: save.id, name: save.name ?? "", status: save.status ?? "",
          status_label: saveStatusLabel(save.status ?? ""),
          start_page: save.start_page ?? null, end_page: save.end_page ?? null,
          every_day_page: save.every_day_page ?? null,
          progress_pct: pr.pct, saved_pages: pr.saved, total_pages: pr.total,
        };
      }

      return {
        user_id: u.user_id ?? "", full_name: u.full_name ?? "",
        gender: u.gender ?? "", gender_label: genderLabel(u.gender ?? ""),
        phone: toLocalPhone(u.user_phone_number ?? ""),
        father_phone: toLocalPhone(u.father_phone_number ?? ""),
        joined: u.joined === true, profile_incomplete: u.profile_incomplete === true,
        absence_total: absenceTotal(u.absence),
        has_photo: !!u.photo_url && u.gender === "male",
        teacher_id: teacherId, teacher_name: teacher?.full_name ?? save?.teacher_name ?? "—",
        last_logined_in: u.last_logined_in ?? null, created_at: u.created_at ?? null,
        save: saveOut,
      };
    });

    const teachersOut = teachers.map((t: any) => ({
      teacher_id: t.teacher_id ?? "", full_name: t.full_name ?? "",
      gender: t.gender ?? "", gender_label: genderLabel(t.gender ?? ""),
      phone: toLocalPhone(t.phone_number ?? ""),
      joined: t.joined === true, joined_in: t.joined_in ?? null,
      absence_total: absenceTotal(t.absence),
      students_count: studentsPerTeacher.get(String(t.teacher_id)) ?? 0,
      created_at: t.created_at ?? null,
    }));

    const stats = {
      students_total: students.length,
      students_male: students.filter((s: any) => s.gender === "male").length,
      students_female: students.filter((s: any) => s.gender === "female").length,
      teachers_total: teachersOut.length,
      teachers_joined: teachersOut.filter((t: any) => t.joined).length,
      active_saves: saves.filter((s: any) => s.status === "ACTIVE").length,
      in_exam: saves.filter((s: any) => s.status === "IN_EXAM1" || s.status === "IN_EXAM2").length,
      finished_saves: saves.filter((s: any) => s.status === "FINISHED").length,
      suspended_saves: saves.filter((s: any) => s.status === "SUSPENDED").length,
      not_joined: students.filter((s: any) => !s.joined).length,
      profile_incomplete: students.filter((s: any) => s.profile_incomplete).length,
      with_absence: students.filter((s: any) => s.absence_total > 0).length,
      avg_progress: progressCount ? Math.round(progressSum / progressCount) : 0,
      total_saves: saves.length,
    };

    // top_success: strongest results per student (finished pages with page_status perfect or very_good)
    const successByUser = new Map<string, number>();
    for (const s of students) {
      const saveId = s.save?.id;
      if (!saveId) continue;
      const savePages = pagesBySave.get(String(saveId)) ?? [];
      let cnt = 0;
      for (const p of savePages) {
        if (p.status === "finished" && (p.page_status === "perfect" || p.page_status === "very_good")) cnt++;
      }
      if (cnt > 0) successByUser.set(String(s.user_id), cnt);
    }

    let topSuccess = students
      .filter((s: any) => (successByUser.get(String(s.user_id)) ?? 0) > 0)
      .map((s: any) => ({
        user_id: s.user_id, name: s.full_name, gender: s.gender,
        value: successByUser.get(String(s.user_id)) ?? 0, max: 0,
      }))
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 8);
    const successMax = topSuccess.length ? Math.max(...topSuccess.map((i: any) => i.value)) : 0;
    const topSuccessMaxVal = successMax > 0 ? successMax : 1;
    topSuccess = topSuccess.map((i: any) => ({ ...i, max: topSuccessMaxVal }));

    // top_absence: students with highest absence totals
    let topAbsence = students
      .filter((s: any) => s.absence_total > 0)
      .map((s: any) => ({
        user_id: s.user_id, name: s.full_name, gender: s.gender,
        value: s.absence_total, max: 0,
      }))
      .sort((a: any, b: any) => b.value - a.value)
      .slice(0, 8);
    const absenceMax = topAbsence.length ? Math.max(...topAbsence.map((i: any) => i.value)) : 0;
    const topAbsenceMaxVal = absenceMax > 0 ? absenceMax : 1;
    topAbsence = topAbsence.map((i: any) => ({ ...i, max: topAbsenceMaxVal }));

    const me = { name: admin!.name, type: admin!.type, gender: (admin as any).gender === "female" ? "female" : "male" };
    return jsonResponse({ error: false, me, stats, students, teachers: teachersOut, top_success: topSuccess, top_absence: topAbsence });
  } catch (e) {
    return jsonResponse({ error: true, errors: String(e) }, 500);
  }
});
