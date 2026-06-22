import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")              ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(payload: any, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// 964xxxxxxxxxx → 0xxxxxxxxxx
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

function absenceTotal(raw: any): number {
  if (typeof raw === "number") return raw;
  if (raw && typeof raw === "object") return Number(raw.total ?? 0);
  return 0;
}

function calcProgress(save: any, pagesForSave: any[]): number {
  const start = Number(save.start_page);
  const end   = Number(save.end_page);
  const total = (end - start) + 1;
  if (!(total > 0)) return 0;
  const finished = pagesForSave.filter(
    (p) => p.status === "finished" && p.page_status !== "reject"
  );
  if (!finished.length) return 0;
  const maxPage = Math.max(...finished.map((p) => Number(p.page) || 0));
  const saved   = (maxPage - start) + 1;
  return Math.max(0, Math.min(100, Math.round((saved / total) * 100)));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const [usersRes, savesRes, teachersRes, pagesRes] = await Promise.all([
      supabaseAdmin.from("users")
        .select("user_id, full_name, gender, user_phone_number, father_phone_number, save_id, teacher_id, joined, profile_incomplete, absence, created_at"),
      supabaseAdmin.from("users_saves")
        .select("id, user_id, teacher_id, name, status, start_page, end_page, every_day_page, teacher_name"),
      supabaseAdmin.from("teachers")
        .select("teacher_id, full_name, gender, phone_number, joined, joined_in"),
      supabaseAdmin.from("users_pages")
        .select("save_id, status, page_status, page"),
    ]);

    if (usersRes.error)    return jsonResponse({ error: true, errors: usersRes.error.message }, 400);
    if (savesRes.error)    return jsonResponse({ error: true, errors: savesRes.error.message }, 400);
    if (teachersRes.error) return jsonResponse({ error: true, errors: teachersRes.error.message }, 400);

    const users    = usersRes.data    ?? [];
    const saves    = savesRes.data    ?? [];
    const teachers = teachersRes.data ?? [];
    const pages    = pagesRes.data    ?? [];

    // maps
    const teacherMap = new Map<string, any>(teachers.map((t: any) => [String(t.teacher_id), t]));
    const saveMap    = new Map<string, any>(saves.map((s: any) => [String(s.id), s]));

    // pages grouped by save_id (for progress)
    const pagesBySave = new Map<string, any[]>();
    for (const p of pages) {
      const k = String(p.save_id);
      if (!pagesBySave.has(k)) pagesBySave.set(k, []);
      pagesBySave.get(k)!.push(p);
    }

    // students count per teacher (by current save's teacher)
    const studentsPerTeacher = new Map<string, number>();

    const students = users.map((u: any) => {
      const save = u.save_id ? saveMap.get(String(u.save_id)) : null;
      const teacherId = String(save?.teacher_id ?? u.teacher_id ?? "");
      const teacher = teacherMap.get(teacherId);
      if (teacherId) studentsPerTeacher.set(teacherId, (studentsPerTeacher.get(teacherId) ?? 0) + 1);

      let saveOut: any = null;
      if (save) {
        saveOut = {
          name:          save.name ?? "",
          status:        save.status ?? "",
          status_label:  saveStatusLabel(save.status ?? ""),
          start_page:    save.start_page ?? null,
          end_page:      save.end_page ?? null,
          every_day_page: save.every_day_page ?? null,
          progress_pct:  calcProgress(save, pagesBySave.get(String(save.id)) ?? []),
        };
      }

      return {
        user_id:           u.user_id ?? "",
        full_name:         u.full_name ?? "",
        gender:            u.gender ?? "",
        gender_label:      genderLabel(u.gender ?? ""),
        phone:             toLocalPhone(u.user_phone_number ?? ""),
        father_phone:      toLocalPhone(u.father_phone_number ?? ""),
        joined:            u.joined === true,
        profile_incomplete: u.profile_incomplete === true,
        absence_total:     absenceTotal(u.absence),
        teacher_name:      teacher?.full_name ?? save?.teacher_name ?? "—",
        save:              saveOut,
      };
    });

    const teachersOut = teachers.map((t: any) => ({
      teacher_id:     t.teacher_id ?? "",
      full_name:      t.full_name ?? "",
      gender:         t.gender ?? "",
      gender_label:   genderLabel(t.gender ?? ""),
      phone:          toLocalPhone(t.phone_number ?? ""),
      joined:         t.joined === true,
      joined_in:      t.joined_in ?? null,
      students_count: studentsPerTeacher.get(String(t.teacher_id)) ?? 0,
    }));

    const stats = {
      students_total: students.length,
      teachers_total: teachersOut.length,
      active_saves:   saves.filter((s: any) => s.status === "ACTIVE").length,
      in_exam:        saves.filter((s: any) => s.status === "IN_EXAM1" || s.status === "IN_EXAM2").length,
      finished_saves: saves.filter((s: any) => s.status === "FINISHED").length,
      not_joined:     students.filter((s: any) => !s.joined).length,
    };

    return jsonResponse({ error: false, stats, students, teachers: teachersOut });
  } catch (e) {
    return jsonResponse({ error: true, errors: String(e) }, 500);
  }
});
