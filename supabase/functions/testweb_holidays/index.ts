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
      if (forDate < today) return jsonResponse({ error: true, errors: "لا يمكن منح إجازة لتاريخ ماضٍ." }, 400);
      if (type === "FOR_USER" && !forUserId) return jsonResponse({ error: true, errors: "الطالب مطلوب" }, 400);
      if (type === "FOR_TEACHER" && !forTeacherId) return jsonResponse({ error: true, errors: "المشرف مطلوب" }, 400);

      /* ── التحقق من التعارضات على نفس التاريخ ─────────────────────── */
      const { data: sameDate, error: sdErr } = await supabaseAdmin.from("holidays")
        .select("id, type, for_user_id, for_teacher_id").eq("for_date", forDate);
      if (sdErr) return jsonResponse({ error: true, errors: sdErr.message }, 400);
      const existing = sameDate ?? [];

      // 1) إجازة عامة موجودة بالفعل → لا يُسمح بأي نوع آخر
      if (existing.some((h: any) => h.type === "ALL")) {
        return jsonResponse({ error: true, errors: "هنالك إجازة عامة بالفعل في هذا التاريخ، لا يمكن إضافة أي نوع آخر من الإجازات." }, 400);
      }
      // إذا كان المطلوب إضافته إجازة عامة بينما توجد إجازات أخرى لنفس التاريخ → اعتبرها إجازة عامة ستُطبّق فتمنع البقية (نمنع التعارض)
      if (type === "ALL" && existing.length > 0) {
        return jsonResponse({ error: true, errors: "هنالك إجازة عامة بالفعل في هذا التاريخ، لا يمكن إضافة أي نوع آخر من الإجازات." }, 400);
      }

      // 2) منع التكرار لنفس الهدف
      const isDup = existing.some((h: any) => {
        if (type === "ALL") return h.type === "ALL";
        if (type === "FOR_USER") return h.type === "FOR_USER" && String(h.for_user_id) === forUserId;
        return h.type === "FOR_TEACHER" && String(h.for_teacher_id) === forTeacherId;
      });
      if (isDup) return jsonResponse({ error: true, errors: "هذه الإجازة مُسجّلة مسبقاً لنفس التاريخ." }, 400);

      // 3) FOR_USER: إذا كان مشرف هذا الطالب مجازاً في نفس التاريخ → امنع
      if (type === "FOR_USER") {
        const { data: sv } = await supabaseAdmin.from("users_saves")
          .select("teacher_id").eq("user_id", forUserId).eq("status", "ACTIVE")
          .order("id", { ascending: false }).limit(1).maybeSingle();
        const studentTeacherId = sv?.teacher_id ? String(sv.teacher_id) : null;
        if (studentTeacherId && existing.some((h: any) => h.type === "FOR_TEACHER" && String(h.for_teacher_id) === studentTeacherId)) {
          return jsonResponse({ error: true, errors: "المشرف المسؤول عن هذا الطالب مجاز في هذا التاريخ، لا يمكن منح الطالب إجازة منفصلة." }, 400);
        }
      }

      const isToday = forDate === today;

      const { data: row, error } = await supabaseAdmin.from("holidays").insert({
        type, for_date: forDate, for_user_id: forUserId, for_teacher_id: forTeacherId,
        processed: false, created_admin_phone_nuumber: A.phone_number ?? "", requested_from_app: false,
      }).select("id").single();
      if (error) return jsonResponse({ error: true, errors: error.message }, 400);

      let targetName = type === "ALL" ? "الجميع" : "";

      // إذا كان التاريخ في المستقبل: نترك المعالجة لنظام اليوم (processed=false) ولا نُطبّق الآن
      if (isToday) {
        if (type === "ALL") {
          await processPublicHoliday(A);
          targetName = "الجميع";
        } else if (type === "FOR_TEACHER") {
          targetName = await processTeacherHoliday(forTeacherId!, A);
        } else {
          targetName = await processUserHoliday(forUserId!, forDate, A);
        }
        await supabaseAdmin.from("holidays").update({ processed: true, target_name: targetName }).eq("id", row.id);
      } else {
        // فقط نضبط الاسم لعرض اللوحة دون معالجة
        if (type === "FOR_USER") {
          const { data: u } = await supabaseAdmin.from("users").select("full_name").eq("user_id", forUserId).maybeSingle();
          targetName = u?.full_name ?? "";
        } else if (type === "FOR_TEACHER") {
          const { data: t } = await supabaseAdmin.from("teachers").select("full_name").eq("teacher_id", forTeacherId).maybeSingle();
          targetName = t?.full_name ?? "";
        }
        if (targetName) await supabaseAdmin.from("holidays").update({ target_name: targetName }).eq("id", row.id);
      }

      await writeLog(A, `أضاف عطلة (${type === "ALL" ? "للجميع" : targetName}) بتاريخ ${forDate}.`);
      return jsonResponse({ error: false, id: row.id });
    }

    if (action === "delete") {
      const r = requireOwner(A); if (r) return r;
      const id = String(body?.id ?? "");
      if (!id) return jsonResponse({ error: true, errors: "id مطلوب" }, 400);
      const { data: h } = await supabaseAdmin.from("holidays").select("processed").eq("id", id).maybeSingle();
      if (h?.processed === true) return jsonResponse({ error: true, errors: "لا يمكن حذف إجازة تم تنفيذها." }, 400);
      await supabaseAdmin.from("holidays").delete().eq("id", id);
      await writeLog(A, `حذف عطلة (${id}).`);
      return jsonResponse({ error: false });
    }

    return jsonResponse({ error: true, errors: "إجراء غير معروف" }, 400);
  } catch (e) {
    return jsonResponse({ error: true, errors: String(e) }, 500);
  }
});

const ACTIVE_ROW_STATUSES = ["not_ready", "ready"];

/* تحديث صفوف اليوم الحالي لصاحب الحفظ (save) إلى حالة الإجازة المحددة */
async function applyHolidayToSave(saveId: string, newStatus: string) {
  const ts = nowIso();
  for (const tbl of ["users_pages", "users_pages_tests"] as const) {
    await supabaseAdmin.from(tbl)
      .update({ status: newStatus, page_status: newStatus, takeem_status: newStatus, finished_at: ts })
      .eq("save_id", saveId)
      .in("status", ACTIVE_ROW_STATUSES);
  }
}

/* تحديث صفوف اليوم الحالي لمشرف معيّن (حسب teacher_id على الصفوف) إلى حالة الإجازة */
async function applyHolidayToTeacherRows(teacherId: string, newStatus: string) {
  const ts = nowIso();
  for (const tbl of ["users_pages", "users_pages_tests"] as const) {
    await supabaseAdmin.from(tbl)
      .update({ status: newStatus, page_status: newStatus, takeem_status: newStatus, finished_at: ts })
      .eq("teacher_id", teacherId)
      .in("status", ACTIVE_ROW_STATUSES);
  }
}

/* إجازة عامة لليوم: تحديث كل الحفظ النشط + إشعار كل طالب */
async function processPublicHoliday(A: any) {
  const { data: saves } = await supabaseAdmin.from("users_saves")
    .select("id, user_id").eq("status", "ACTIVE");
  for (const s of saves ?? []) {
    await applyHolidayToSave(String(s.id), "public_holiday");
    const { data: u } = await supabaseAdmin.from("users")
      .select("gender, user_phone_number").eq("user_id", s.user_id).maybeSingle();
    if (u?.user_phone_number) {
      const txt = "📅 تم منح إجازة عامة اليوم لكافة الطلاب، يُؤجَّل حفظ اليوم إلى الغد.";
      await sendWaha(u.user_phone_number, wrapMsg(A, txt));
    }
  }
}

/* إجازة مشرف لليوم: تحديث صفوف المشرف + إشعار كل طالب متأثر + إشعار المشرف */
async function processTeacherHoliday(teacherId: string, A: any): Promise<string> {
  const { data: t } = await supabaseAdmin.from("teachers")
    .select("full_name, gender, phone_number").eq("teacher_id", teacherId).maybeSingle();

  await applyHolidayToTeacherRows(teacherId, "teacher_holiday");

  const { data: saves } = await supabaseAdmin.from("users_saves")
    .select("user_id").eq("teacher_id", teacherId).eq("status", "ACTIVE");
  const seen = new Set<string>();
  for (const s of saves ?? []) {
    const uid = String(s.user_id);
    if (seen.has(uid)) continue;
    seen.add(uid);
    const { data: u } = await supabaseAdmin.from("users")
      .select("gender, user_phone_number").eq("user_id", uid).maybeSingle();
    if (u?.user_phone_number) {
      const teacherWord = g(t?.gender ?? "male", "المشرف المسؤول عنك مجاز", "المشرفة المسؤولة عنك مجازة");
      const hifz = g(u.gender, "يُؤجَّل حفظك إلى الغد", "يُؤجَّل حفظكِ إلى الغد");
      const txt = `📅 ${teacherWord} اليوم، ${hifz}.`;
      await sendWaha(u.user_phone_number, wrapMsg(A, txt));
    }
  }

  if (t?.phone_number) {
    const txt = "📅 تم منحك إجازة اليوم من قبل إدارة مركز مشروع التحفيظ.";
    await sendWaha(t.phone_number, wrapMsg(A, txt));
  }
  return t?.full_name ?? "";
}

/* إجازة طالب لليوم: تحديث صف الطالب + إشعار الطالب + إشعار مشرفه */
async function processUserHoliday(userId: string, forDate: string, A: any): Promise<string> {
  const { data: u } = await supabaseAdmin.from("users")
    .select("full_name, gender, user_phone_number, save_id").eq("user_id", userId).maybeSingle();
  if (u?.save_id) await applyHolidayToSave(String(u.save_id), "holiday");

  if (u?.user_phone_number) {
    const hifz = g(u.gender, "يُؤجَّل حفظك إلى اليوم التالي", "يُؤجَّل حفظكِ إلى اليوم التالي");
    const txt = `📅 تم منحك إجازة بتاريخ *${forDate}*، ${hifz}.`;
    await sendWaha(u.user_phone_number, wrapMsg(A, txt));
  }

  // إشعار المشرف المسؤول
  const { data: sv } = await supabaseAdmin.from("users_saves")
    .select("teacher_id").eq("user_id", userId).eq("status", "ACTIVE")
    .order("id", { ascending: false }).limit(1).maybeSingle();
  if (sv?.teacher_id) {
    const { data: t } = await supabaseAdmin.from("teachers")
      .select("phone_number").eq("teacher_id", sv.teacher_id).maybeSingle();
    if (t?.phone_number) {
      const stWord = g(u?.gender ?? "male", "للطالب", "للطالبة");
      const txt = `📅 تم منح إجازة ${stWord} *${u?.full_name ?? ""}* بتاريخ *${forDate}* من قبل الإدارة.`;
      await sendWaha(t.phone_number, wrapMsg(A, txt));
    }
  }

  return u?.full_name ?? "";
}
