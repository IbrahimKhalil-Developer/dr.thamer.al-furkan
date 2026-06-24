import {
  supabaseAdmin, requireAdmin, jsonResponse, preflight,
  rowStatusLabel, gradeKind, examTypeLabel, pageDisp, baghdadDate,
} from "../_shared/guard.ts";

function errCols(row: any): { sowad: string; nisyan: string; fateh: string } {
  const e = row.errors_number;
  if (!e || typeof e !== "object") return { sowad: "-", nisyan: "-", fateh: "-" };
  return {
    sowad: e.sowad != null ? String(e.sowad) : "-",
    nisyan: e.nisyan != null ? String(e.nisyan) : "-",
    fateh: e.fateh != null ? String(e.fateh) : "-",
  };
}

function rangeDisp(row: any): string {
  if (row.start_page != null && row.end_page != null) return `${row.start_page} - ${row.end_page}`;
  return "-";
}

function reviewKind(takeemStatus: any): "reject" | "good" | "very_good" | "perfect" | "" {
  switch (takeemStatus) {
    case "reject":    return "reject";
    case "good":      return "good";
    case "very_good": return "very_good";
    case "perfect":   return "perfect";
    default:          return "";
  }
}

function reviewLabel(takeemStatus: any, isFU: boolean): string {
  switch (takeemStatus) {
    case "reject":    return "رسوب";
    case "good":      return "جيد جداً";
    case "very_good": return "إمتياز";
    case "perfect":   return isFU ? "مُتقِنة" : "مُتقِن";
    default:          return "—";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return jsonResponse({ error: true, errors: "الطريقة غير مسموح بها" }, 405);

  const { response } = await requireAdmin(req);
  if (response) return response;

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "today");

    const [{ data: users }, { data: teachers }, { data: saves }] = await Promise.all([
      supabaseAdmin.from("users").select("user_id, full_name, gender"),
      supabaseAdmin.from("teachers").select("teacher_id, full_name, gender"),
      supabaseAdmin.from("users_saves").select("id, name, user_id"),
    ]);
    const uMap = new Map((users ?? []).map((u: any) => [String(u.user_id), u]));
    const tMap = new Map((teachers ?? []).map((t: any) => [String(t.teacher_id), t]));
    const sMap = new Map((saves ?? []).map((s: any) => [String(s.id), s]));

    function buildRow(row: any, isExam: boolean) {
      const u = uMap.get(String(row.user_id));
      const t = tMap.get(String(row.teacher_id));
      const sv = sMap.get(String(row.save_id));
      const isFU = u?.gender === "female";
      const iFT = t?.gender === "female";
      return {
        id: row.id, table: isExam ? "tests" : "pages",
        date: row.date ?? row.created_at ?? null,
        student_name: u?.full_name ?? "—", student_gender: u?.gender ?? "male",
        teacher_name: t?.full_name ?? row.teacher_name ?? "—",
        save_name: sv?.name ?? "—",
        page_label: isExam ? `${examTypeLabel(row.type ?? "")} (${rangeDisp(row)})` : pageDisp(row, 1),
        status_label: rowStatusLabel(row.status ?? "", row.page_status ?? "", isFU, iFT),
        grade_kind: gradeKind(row.status ?? "", row.page_status ?? ""),
        sowad: errCols(row).sowad, nisyan: errCols(row).nisyan,
        fateh: isExam ? errCols(row).fateh : "-",
        takeem: row.takeem ?? null,
        review_kind: reviewKind(row.takeem_status),
        review_label: reviewLabel(row.takeem_status, isFU),
      };
    }

    if (action === "today") {
      const reqDate = String(body?.date ?? "").trim();
      const today = /^\d{4}-\d{2}-\d{2}$/.test(reqDate) ? reqDate : baghdadDate(0);
      const [{ data: pages }, { data: tests }] = await Promise.all([
        supabaseAdmin.from("users_pages").select("*").eq("date", today),
        supabaseAdmin.from("users_pages_tests").select("*").eq("date", today),
      ]);
      const rows = [
        ...(pages ?? []).map((r: any) => buildRow(r, false)),
        ...(tests ?? []).map((r: any) => buildRow(r, true)),
      ].sort((a, b) => a.student_name.localeCompare(b.student_name, "ar"));
      return jsonResponse({ error: false, date: today, count: rows.length, rows });
    }

    if (action === "student_full") {
      const userId = String(body?.user_id ?? "");
      if (!userId) return jsonResponse({ error: true, errors: "user_id مطلوب" }, 400);
      const [{ data: pages }, { data: tests }] = await Promise.all([
        supabaseAdmin.from("users_pages").select("*").eq("user_id", userId),
        supabaseAdmin.from("users_pages_tests").select("*").eq("user_id", userId),
      ]);
      const rows = [
        ...(pages ?? []).map((r: any) => buildRow(r, false)),
        ...(tests ?? []).map((r: any) => buildRow(r, true)),
      ].sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
      const u = uMap.get(userId);
      return jsonResponse({ error: false, student_name: u?.full_name ?? "—", rows });
    }

    if (action === "all_students") {
      const list = [...uMap.values()]
        .map((u: any) => ({ user_id: u.user_id, full_name: u.full_name ?? "", gender: u.gender ?? "male" }))
        .sort((a, b) => a.full_name.localeCompare(b.full_name, "ar"));
      return jsonResponse({ error: false, students: list });
    }

    if (action === "full_all") {
      const [{ data: pages }, { data: tests }] = await Promise.all([
        supabaseAdmin.from("users_pages").select("*"),
        supabaseAdmin.from("users_pages_tests").select("*"),
      ]);
      const byStudent = new Map<string, any[]>();
      for (const r of (pages ?? [])) {
        const k = String(r.user_id); if (!byStudent.has(k)) byStudent.set(k, []);
        byStudent.get(k)!.push(buildRow(r, false));
      }
      for (const r of (tests ?? [])) {
        const k = String(r.user_id); if (!byStudent.has(k)) byStudent.set(k, []);
        byStudent.get(k)!.push(buildRow(r, true));
      }
      const students = [...byStudent.entries()].map(([userId, rows]) => ({
        user_id: userId, student_name: uMap.get(userId)?.full_name ?? "—",
        rows: rows.sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? ""))),
      })).sort((a, b) => a.student_name.localeCompare(b.student_name, "ar"));
      return jsonResponse({ error: false, students });
    }

    return jsonResponse({ error: true, errors: "إجراء غير معروف" }, 400);
  } catch (e) {
    return jsonResponse({ error: true, errors: String(e) }, 500);
  }
});
