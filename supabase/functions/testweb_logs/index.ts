import { supabaseAdmin, requireAdmin, requireOwner, jsonResponse, preflight } from "../_shared/guard.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return jsonResponse({ error: true, errors: "الطريقة غير مسموح بها" }, 405);

  const { admin, response } = await requireAdmin(req);
  if (response) return response;

  // سجل العمليات: يُعرض فقط لمسؤول إداري (owner)، يُمنع عن باقي الإداريين حتى عبر api
  const ownerErr = requireOwner(admin!);
  if (ownerErr) return ownerErr;

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body?.limit) || 200, 1), 500);

    const { data, error } = await supabaseAdmin.from("logs")
      .select("*").order("created_at", { ascending: false }).limit(limit);
    if (error) return jsonResponse({ error: true, errors: error.message }, 400);

    const adminIds = [...new Set((data ?? []).filter((l: any) => l.type !== "teacher").map((l: any) => l.type_id))];
    const teacherIds = [...new Set((data ?? []).filter((l: any) => l.type === "teacher").map((l: any) => l.type_id))];
    const [{ data: admins }, { data: teachers }] = await Promise.all([
      adminIds.length ? supabaseAdmin.from("admins").select("id, name, type, gender").in("id", adminIds) : Promise.resolve({ data: [] }),
      teacherIds.length ? supabaseAdmin.from("teachers").select("teacher_id, full_name, gender").in("teacher_id", teacherIds) : Promise.resolve({ data: [] }),
    ]);
    const aMap = new Map((admins ?? []).map((a: any) => [String(a.id), a]));
    const tMap = new Map((teachers ?? []).map((t: any) => [String(t.teacher_id), t]));

    const logs = (data ?? []).map((l: any) => {
      const actor = l.type === "teacher" ? tMap.get(String(l.type_id)) : aMap.get(String(l.type_id));
      return {
        id: l.id, created_at: l.created_at, message: l.message ?? "",
        actor_name: actor?.full_name ?? actor?.name ?? "—",
        actor_role: l.type === "teacher" ? "مشرف" : l.type === "owner" ? "مسؤول إداري" : "إداري",
        actor_gender: actor?.gender === "female" ? "female" : "male",
      };
    });
    return jsonResponse({ error: false, logs });
  } catch (e) {
    return jsonResponse({ error: true, errors: String(e) }, 500);
  }
});
