import {
  supabaseAdmin, requireAdmin, requireOwner, jsonResponse, preflight,
  sendWaha, wrapMsg, writeLog, g, baghdadDate, nowIso,
} from "../_shared/guard.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return jsonResponse({ error: true, errors: "الطريقة غير مسموح بها" }, 405);

  const { admin, response } = await requireAdmin(req);
  if (response) return response;
  const A = admin!;

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "list");

    if (action === "list") {
      const { data, error } = await supabaseAdmin.from("holidays")
        .select("*").order("for_date", { ascending: false }).limit(300);
      if (error) return jsonResponse({ error: true, errors: error.message }, 400);

      const userIds = [...new Set((data ?? []).filter((h: any) => h.for_user_id).map((h: any) => h.for_user_id))];
      const teacherIds = [...new Set((data ?? []).filter((h: any) => h.for_teacher_id).map((h: any) => h.for_teacher_id))];
      const [{ data: users }, { data: teachers }] = await Promise.all([
        userIds.length ? supabaseAdmin.from("users").select("user_id, full_name, gender").in("user_id", userIds) : Promise.resolve({ data: [] }),
        teacherIds.length ? supabaseAdmin.from("teachers").select("teacher_id, full_name, gender").in("teacher_id", teacherIds) : Promise.resolve({ data: [] }),
      ]);
      const uMap = new Map((users ?? []).map((u: any) => [String(u.user_id), u]));
      const tMap = new Map((teachers ?? []).map((t: any) => [String(t.teacher_id), t]));

      const list = (data ?? []).map((h: any) => ({
        id: h.id, type: h.type, for_date: h.for_date, processed: h.processed === true,
        created_at: h.created_at,
        target_name: h.type === "FOR_USER" ? (uMap.get(String(h.for_user_id))?.full_name ?? "—")
          : h.type === "FOR_TEACHER" ? (tMap.get(String(h.for_teacher_id))?.full_name ?? "—") : "الجميع",
        target_gender: h.type === "FOR_USER" ? (uMap.get(String(h.for_user_id))?.gender ?? "male")
          : h.type === "FOR_TEACHER" ? (tMap.get(String(h.for_teacher_id))?.gender ?? "male") : "male",
      }));
      return jsonResponse({ error: false, holidays: list });
    }

    /* ── إضافة عطلة (للجميع / لطالب / لمشرف) ─────────────────────── */
    if (action === "add") {
      const r = requireOwner(A); if (r) return r;
      const type = String(body?.type ?? "");
      const forDate = String(body?.for_date ?? "");
      const forUserId = body?.for_user_id ? String(body.for_user_id) : null;
      const forTeacherId = body?.for_teacher_id ? String(body.for_teacher_id) : null;
      if (!["ALL", "FOR_USER", "FOR_TEACHER"].includes(type)) return jsonResponse({ error: true, errors: "نوع العطلة غير صحيح" }, 400);
      if (!forDate) return jsonResponse({ error: true, errors: "التاريخ مطلوب" }, 400);
      const today = baghdadDate(0);
      if (forDate < today) return jsonResponse({ error: true, errors: "لا يمكن إضافة عطلة لتاريخ ماضٍ" }, 400);
      if (type === "FOR_USER" && !forUserId) return jsonResponse({ error: true, errors: "الطالب مطلوب" }, 400);
      if (type === "FOR_TEACHER" && !forTeacherId) return jsonResponse({ error: true, errors: "المشرف مطلوب" }, 400);

      const { data: row, error } = await supabaseAdmin.from("holidays").insert({
        type, for_date: forDate, for_user_id: forUserId, for_teacher_id: forTeacherId,
        processed: false, created_admin_phone_nuumber: A.phone_number ?? "", requested_from_app: false,
      }).select("id").single();
      if (error) return jsonResponse({ error: true, errors: error.message }, 400);

      const isToday = forDate === today;
      let label = "";
      if (type === "ALL") label = "جميع الطلاب والمشرفين";
      else if (type === "FOR_USER") {
        const { data: u } = await supabaseAdmin.from("users").select("full_name, gender, user_phone_number").eq("user_id", forUserId).maybeSingle();
        label = u?.full_name ?? "";
        if (u?.user_phone_number) {
          const txt = `📅 تم تسجيل ${g(u.gender, "عطلة لكَ", "عطلة لكِ")} بتاريخ *${forDate}*.`;
          await sendWaha(u.user_phone_number, wrapMsg(A, txt));
        }
        if (isToday) await cascadeUserHoliday(forUserId!, A);
      } else {
        const { data: t } = await supabaseAdmin.from("teachers").select("full_name, gender, phone_number").eq("teacher_id", forTeacherId).maybeSingle();
        label = t?.full_name ?? "";
        if (t?.phone_number) {
          const txt = `📅 تم تسجيل ${g(t.gender, "عطلة لكَ", "عطلة لكِ")} بتاريخ *${forDate}*.`;
          await sendWaha(t.phone_number, wrapMsg(A, txt));
        }
        if (isToday) await cascadeTeacherHoliday(forTeacherId!, A);
      }

      await writeLog(A, `أضاف عطلة (${type === "ALL" ? "للجميع" : label}) بتاريخ ${forDate}.`);
      return jsonResponse({ error: false, id: row.id });
    }

    if (action === "delete") {
      const r = requireOwner(A); if (r) return r;
      const id = String(body?.id ?? "");
      if (!id) return jsonResponse({ error: true, errors: "id مطلوب" }, 400);
      await supabaseAdmin.from("holidays").delete().eq("id", id);
      await writeLog(A, `حذف عطلة (${id}).`);
      return jsonResponse({ error: false });
    }

    return jsonResponse({ error: true, errors: "إجراء غير معروف" }, 400);
  } catch (e) {
    return jsonResponse({ error: true, errors: String(e) }, 500);
  }
});

/* تحديث صف اليوم الحالي للطالب إلى "عطلة" */
async function cascadeUserHoliday(userId: string, A: any) {
  const { data: u } = await supabaseAdmin.from("users").select("save_id, full_name, gender, user_phone_number").eq("user_id", userId).maybeSingle();
  if (!u?.save_id) return;
  const ts = nowIso();
  for (const tbl of ["users_pages", "users_pages_tests"] as const) {
    const { data: row } = await supabaseAdmin.from(tbl).select("id").eq("save_id", u.save_id)
      .order("id", { ascending: false }).limit(1).maybeSingle();
    if (row) {
      await supabaseAdmin.from(tbl).update({ status: "holiday", page_status: "holiday", finished_at: ts }).eq("id", row.id);
    }
  }
}

/* تحديث صفوف اليوم الحالي لكل طلاب المشرف إلى "عطلة المشرف" */
async function cascadeTeacherHoliday(teacherId: string, A: any) {
  const { data: saves } = await supabaseAdmin.from("users_saves")
    .select("id, user_id").eq("teacher_id", teacherId).eq("status", "ACTIVE");
  if (!saves?.length) return;
  const ts = nowIso();
  for (const s of saves) {
    for (const tbl of ["users_pages", "users_pages_tests"] as const) {
      const { data: row } = await supabaseAdmin.from(tbl).select("id").eq("save_id", s.id)
        .order("id", { ascending: false }).limit(1).maybeSingle();
      if (row) {
        await supabaseAdmin.from(tbl).update({ status: "teacher_holiday", page_status: "teacher_holiday", finished_at: ts }).eq("id", row.id);
      }
    }
    const { data: u } = await supabaseAdmin.from("users").select("gender, user_phone_number").eq("user_id", s.user_id).maybeSingle();
    if (u?.user_phone_number) {
      const txt = `📅 ${g(u.gender, "تم تسجيلك", "تم تسجيلكِ")} (عطلة مشرف) لليوم بسبب عطلة المشرف المسؤول.`;
      await sendWaha(u.user_phone_number, wrapMsg(A, txt));
    }
  }
}
