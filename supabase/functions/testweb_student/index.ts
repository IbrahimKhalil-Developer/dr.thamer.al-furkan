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

// نفس قاموس pages_system: status + page_status → نص عربي (مع تبادل good/very_good)
function rowStatusLabel(status: string, pageStatus: string, isFU: boolean, iFT: boolean): string {
  switch (status) {
    case "not_ready":       return "لم يُسمّع بعد";
    case "ready":           return "بانتظار تقييم المشرف";
    case "user_absence":    return isFU ? "غائبة" : "غائب";
    case "teacher_absence": return iFT ? "المشرفة غائبة" : "المشرف غائب";
    case "holiday":         return isFU ? "مجازة" : "مجاز";
    case "public_holiday":  return "إجازة عامة";
    case "teacher_holiday": return iFT ? "المشرفة مجازة" : "المشرف مجاز";
    case "sus_to_act":      return "استئناف بعد إيقاف";
    case "finished":
      switch (pageStatus) {
        case "reject":    return "رسوب";
        case "good":      return "جيد جداً";
        case "very_good": return "إمتياز";
        case "perfect":   return isFU ? "مُتقِنة" : "مُتقِن";
        default:          return "منجز";
      }
    default: return status || "—";
  }
}

function gradeKind(status: string, pageStatus: string): string {
  if (status === "user_absence" || status === "teacher_absence" || status === "not_ready") return "absent";
  if (status === "holiday" || status === "public_holiday" || status === "teacher_holiday") return "holiday";
  if (status === "ready") return "waiting";
  if (status === "finished") {
    if (pageStatus === "reject")    return "reject";
    if (pageStatus === "good")      return "good";
    if (pageStatus === "very_good") return "very_good";
    if (pageStatus === "perfect")   return "perfect";
  }
  return "neutral";
}

function examTypeLabel(t: string): string {
  if (t === "EXAM1") return "اختبار جزئي";
  if (t === "EXAM2") return "اختبار تراكمي";
  return t || "—";
}

function calcProgress(save: any, pagesForSave: any[]): { pct: number; saved: number; total: number } {
  const start = Number(save.start_page);
  const end   = Number(save.end_page);
  const total = (end - start) + 1;
  if (!(total > 0)) return { pct: 0, saved: 0, total: 0 };
  const finished = pagesForSave.filter(
    (p) => p.status === "finished" && p.page_status !== "reject"
  );
  if (!finished.length) return { pct: 0, saved: 0, total };
  const maxPage = Math.max(...finished.map((p) => Number(p.page) || 0));
  const saved   = Math.max(0, (maxPage - start) + 1);
  const pct     = Math.max(0, Math.min(100, Math.round((saved / total) * 100)));
  return { pct, saved, total };
}

function pageDisp(row: any, edp: number): string {
  if (row.MePageArabic) return String(row.MePageArabic);
  const page = Number(row.page);
  if (!page) return "—";
  const count = edp < 1 ? 1 : Math.ceil(edp);
  return Array.from({ length: count }, (_, i) => String(page - (count - 1 - i))).join(" و ");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

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
    const teacherGender = new Map<string, boolean>(
      teachers.map((t: any) => [String(t.teacher_id), t.gender === "female"])
    );
    const teacherName = new Map<string, string>(
      teachers.map((t: any) => [String(t.teacher_id), t.full_name ?? ""])
    );

    // صورة الطالب (الذكور فقط، عبر رابط موقّت)
    let photoUrl: string | null = null;
    if (u.photo_url && u.gender === "male") {
      const { data: ph } = await supabaseAdmin.storage
        .from("male_profiles_pictures")
        .createSignedUrl(String(u.photo_url), 300);
      photoUrl = ph?.signedUrl ?? null;
    }

    const pagesBySave = new Map<string, any[]>();
    for (const p of pages) {
      const k = String(p.save_id);
      if (!pagesBySave.has(k)) pagesBySave.set(k, []);
      pagesBySave.get(k)!.push(p);
    }
    const testsBySave = new Map<string, any[]>();
    for (const t of tests) {
      const k = String(t.save_id);
      if (!testsBySave.has(k)) testsBySave.set(k, []);
      testsBySave.get(k)!.push(t);
    }

    const userOut = {
      user_id:            u.user_id ?? "",
      full_name:          u.full_name ?? "",
      gender:             u.gender ?? "",
      gender_label:       genderLabel(u.gender ?? ""),
      phone:              toLocalPhone(u.user_phone_number ?? ""),
      father_phone:       toLocalPhone(u.father_phone_number ?? ""),
      email:              u.email ?? "—",
      password:           u.password ?? "",
      date_of_brith:      u.date_of_brith ?? "—",
      location:           u.user_location ?? "—",
      gps:                u.auto_user_location ?? "—",
      photo_url:          photoUrl,
      joined:             u.joined === true,
      joined_in:          u.joined_in ?? null,
      joined_ip:          u.joined_ip ?? null,
      logined_ip:         u.logined_ip ?? null,
      opened_ip:          u.opened_ip ?? null,
      last_logined_in:    u.last_logined_in ?? null,
      last_opened_in:     u.last_opened_in ?? null,
      profile_incomplete: u.profile_incomplete === true,
      absence_total:      (typeof u.absence === "number") ? u.absence : Number(u.absence?.total ?? 0),
      absence_raw:        u.absence ?? null,
      teacher_id:         u.teacher_id ?? "",
      teacher_name:       teacherName.get(String(u.teacher_id)) ?? "—",
      save_id:            u.save_id ?? null,
      added_admin:        toLocalPhone(u.added_admin_phone_number ?? ""),
      edited_admin:       toLocalPhone(u.edited_admin_phone_number ?? ""),
      created_at:         u.created_at ?? null,
    };

    const savesSorted = [...saves].sort((a: any, b: any) =>
      (Number(a.number ?? 0) - Number(b.number ?? 0)) || (Number(a.id ?? 0) - Number(b.id ?? 0))
    );

    const savesOut = savesSorted.map((s: any) => {
      const edp = Number(s.every_day_page) || 1;
      const savePages = (pagesBySave.get(String(s.id)) ?? [])
        .sort((a: any, b: any) => (Number(a.id ?? 0) - Number(b.id ?? 0)));
      const saveTests = (testsBySave.get(String(s.id)) ?? [])
        .sort((a: any, b: any) => (Number(a.id ?? 0) - Number(b.id ?? 0)));

      const pagesOut = savePages.map((p: any) => {
        const iFT = teacherGender.get(String(p.teacher_id)) ?? false;
        return {
          id:            p.id,
          date:          p.date ?? null,
          page:          p.page ?? null,
          page_display:  pageDisp(p, edp),
          page_name:     p.page_name ?? "",
          status:        p.status ?? "",
          page_status:   p.page_status ?? "",
          status_label:  rowStatusLabel(p.status ?? "", p.page_status ?? "", isFU, iFT),
          grade_kind:    gradeKind(p.status ?? "", p.page_status ?? ""),
          errors_number: p.errors_number ?? null,
          teacher_name:  p.teacher_name ?? "—",
          created_at:    p.created_at ?? null,
          finished_at:   p.finished_at ?? null,
          custom_info:   p.custom_info ?? "",
        };
      });

      const testsOut = saveTests.map((t: any) => {
        const iFT = teacherGender.get(String(t.teacher_id)) ?? false;
        return {
          id:            t.id,
          type:          t.type ?? "",
          type_label:    examTypeLabel(t.type ?? ""),
          date:          t.date ?? null,
          status:        t.status ?? "",
          page_status:   t.page_status ?? "",
          status_label:  rowStatusLabel(t.status ?? "", t.page_status ?? "", isFU, iFT),
          grade_kind:    gradeKind(t.status ?? "", t.page_status ?? ""),
          errors_number: t.errors_number ?? null,
          teacher_name:  t.teacher_name ?? "—",
          start_page:    t.start_page ?? null,
          end_page:      t.end_page ?? null,
          created_at:    t.created_at ?? null,
          finished_at:   t.finished_at ?? null,
          custom_info:   t.custom_info ?? "",
        };
      });

      const pr = calcProgress(s, savePages);

      return {
        id:                 s.id,
        name:               s.name ?? "",
        number:             s.number ?? null,
        status:             s.status ?? "",
        status_label:       saveStatusLabel(s.status ?? ""),
        teacher_id:         s.teacher_id ?? "",
        teacher_name:       s.teacher_name ?? "—",
        start_page:         s.start_page ?? null,
        end_page:           s.end_page ?? null,
        every_day_page:     s.every_day_page ?? null,
        started_at:         s.started_at ?? null,
        finished_at:        s.finished_at ?? null,
        exam1:              s.exam1 === true,
        exam2:              s.exam2 === true,
        exam1_teacher_id:   s.exam1_teacher_id ?? null,
        exam2_teacher_id:   s.exam2_teacher_id ?? null,
        exam1_teacher_name: teacherName.get(String(s.exam1_teacher_id)) ?? "—",
        exam2_teacher_name: teacherName.get(String(s.exam2_teacher_id)) ?? "—",
        exam1_date:         s.exam1_date ?? null,
        exam2_date:         s.exam2_date ?? null,
        progress_pct:       pr.pct,
        saved_pages:        pr.saved,
        total_pages:        pr.total,
        is_current:         String(u.save_id ?? "") === String(s.id),
        pages:              pagesOut,
        tests:              testsOut,
      };
    });

    return jsonResponse({ error: false, user: userOut, saves: savesOut });
  } catch (e) {
    return jsonResponse({ error: true, errors: String(e) }, 500);
  }
});
