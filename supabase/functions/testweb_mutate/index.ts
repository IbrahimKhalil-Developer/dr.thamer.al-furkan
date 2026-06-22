import {
  supabaseAdmin, requireAdmin, SYSTEM_KEY, jsonResponse, preflight,
  sendWaha, wrapMsg, writeLog, g, toLocalPhone, normalizePhone, nowIso,
} from "../_shared/guard.ts";

function randomPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ", lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789", symbols = "#$@&";
  const all = upper + lower + digits + symbols;
  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols), ...Array.from({ length: 6 }, () => pick(all))];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function calcNotExam(sowad: number, nisyan: number): string {
  const sum = sowad + nisyan;
  if (sum >= 3) return "reject";
  if (sum === 2) return "good";
  if (sum === 1) return "very_good";
  return "perfect";
}
function calcExam(sowad: number, nisyan: number, fateh: number): string {
  const sum = sowad + nisyan + (fateh * 2);
  if (sum >= 6) return "reject";
  if (sum >= 3) return "good";
  if (sum >= 1) return "very_good";
  return "perfect";
}
function psLabel(ps: string, isFU: boolean): string {
  switch (ps) {
    case "reject": return "رسوب";
    case "good": return "جيد جداً";
    case "very_good": return "إمتياز";
    case "perfect": return isFU ? "مُتقِنة" : "مُتقِن";
    default: return ps;
  }
}
function stateLabel(state: string, isFU: boolean, iFT: boolean): string {
  switch (state) {
    case "user_absence":    return isFU ? "غائبة" : "غائب";
    case "teacher_absence": return iFT ? "المشرفة غائبة" : "المشرف غائب";
    case "holiday":         return isFU ? "مجازة" : "مجاز";
    default: return state;
  }
}
const num = (v: any) => Math.max(0, Math.min(999, Number(v) || 0));

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return jsonResponse({ error: true, errors: "الطريقة غير مسموح بها" }, 405);

  const { admin, response } = await requireAdmin(req);
  if (response) return response;
  const A = admin!;

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    /* ── تعديل بيانات الطالب (الهاتف والبريد محميّان) ────────────── */
    if (action === "update_student") {
      const userId = String(body?.user_id ?? "");
      const f = body?.fields ?? {};
      if (!userId) return jsonResponse({ error: true, errors: "user_id مطلوب" }, 400);
      const ALLOWED = ["full_name", "gender", "date_of_brith", "user_location"];
      const patch: Record<string, any> = {};
      for (const k of ALLOWED) if (k in f) patch[k] = f[k];
      if (!Object.keys(patch).length) return jsonResponse({ error: true, errors: "لا توجد حقول صالحة" }, 400);
      patch.edited_admin_phone_number = A.phone_number ? toLocalPhone(A.phone_number) : A.name;
      const { error } = await supabaseAdmin.from("users").update(patch).eq("user_id", userId);
      if (error) return jsonResponse({ error: true, errors: error.message }, 400);
      await writeLog(A, `عدّل بيانات الطالب (${patch.full_name ?? userId}). الحقول: ${Object.keys(patch).join("، ")}.`);
      return jsonResponse({ error: false });
    }

    /* ── طلب من الطالب إكمال ملفه ───────────────────────────────── */
    if (action === "set_profile_incomplete") {
      const userId = String(body?.user_id ?? "");
      if (!userId) return jsonResponse({ error: true, errors: "user_id مطلوب" }, 400);
      const { data: u } = await supabaseAdmin.from("users")
        .select("full_name, gender, user_phone_number").eq("user_id", userId).maybeSingle();
      const { error } = await supabaseAdmin.from("users").update({ profile_incomplete: true }).eq("user_id", userId);
      if (error) return jsonResponse({ error: true, errors: error.message }, 400);
      const isFU = u?.gender === "female";
      let notified = false;
      if (u?.user_phone_number) {
        const txt = `${g(u.gender, "عزيزي الطالب", "عزيزتي الطالبة")}،\nيُرجى ${g(u.gender, "تحديثك", "تحديثكِ")} لمعلومات ملفك الشخصي في تطبيق تحفيظ، فبعض البيانات غير مكتملة.`;
        notified = await sendWaha(u.user_phone_number, wrapMsg(A, txt));
      }
      await writeLog(A, `طلب من الطالب (${u?.full_name ?? userId}) إكمال ملفه الشخصي.`);
      return jsonResponse({ error: false, notified });
    }

    /* ── تعديل الحفظ (إلى الصفحة + الحالة + تبديل المشرف) ────────── */
    if (action === "update_save") {
      const saveId = String(body?.save_id ?? "");
      const f = body?.fields ?? {};
      if (!saveId) return jsonResponse({ error: true, errors: "save_id مطلوب" }, 400);

      const { data: save } = await supabaseAdmin.from("users_saves").select("*").eq("id", saveId).maybeSingle();
      if (!save) return jsonResponse({ error: true, errors: "الحفظ غير موجود" }, 404);
      if (save.status === "TERMINATED") return jsonResponse({ error: true, errors: "لا يمكن تعديل حفظ منهي" }, 400);

      const { data: stu } = await supabaseAdmin.from("users")
        .select("full_name, gender, user_phone_number").eq("user_id", save.user_id).maybeSingle();
      const isFU = stu?.gender === "female";
      const patch: Record<string, any> = {};
      const notes: string[] = [];

      // إلى الصفحة فقط (صفحة البداية محميّة)
      if (f.end_page != null && f.end_page !== "") {
        const ep = Number(f.end_page);
        if (ep > Number(save.start_page)) { patch.end_page = ep; notes.push(`إلى الصفحة ${ep}`); }
      }

      // الحالة: ACTIVE ↔ SUSPENDED فقط
      if (f.status && f.status !== save.status) {
        if (!["ACTIVE", "SUSPENDED"].includes(f.status) || !["ACTIVE", "SUSPENDED"].includes(save.status)) {
          return jsonResponse({ error: true, errors: "لا يمكن تغيير الحالة إلا بين (نشط) و(موقوف مؤقتاً)" }, 400);
        }
        patch.status = f.status;
        if (f.status === "ACTIVE") { patch.status_reason = null; patch.old_status = null; }
        if (stu?.user_phone_number) {
          const txt = f.status === "SUSPENDED"
            ? `تم إيقاف ${g(stu.gender, "حفظكَ", "حفظكِ")} (*${save.name}*) مؤقتاً من قبل الإدارة.`
            : `تمت إعادة تفعيل ${g(stu.gender, "حفظكَ", "حفظكِ")} (*${save.name}*) من جديد.`;
          await sendWaha(stu.user_phone_number, wrapMsg(A, txt));
        }
        notes.push(f.status === "SUSPENDED" ? "إيقاف مؤقت" : "إعادة تفعيل");
      }

      // تبديل المشرف المسؤول
      if (f.teacher_id && String(f.teacher_id) !== String(save.teacher_id ?? "")) {
        if (save.status === "IN_EXAM1" || save.status === "IN_EXAM2") {
          return jsonResponse({ error: true, errors: "لا يمكن تبديل المشرف أثناء فترة الاختبار" }, 400);
        }
        const [{ data: oldT }, { data: newT }] = await Promise.all([
          supabaseAdmin.from("teachers").select("full_name, gender, phone_number").eq("teacher_id", save.teacher_id).maybeSingle(),
          supabaseAdmin.from("teachers").select("full_name, gender, phone_number").eq("teacher_id", f.teacher_id).maybeSingle(),
        ]);
        if (!newT) return jsonResponse({ error: true, errors: "المشرف الجديد غير موجود" }, 400);
        patch.teacher_id = f.teacher_id;
        patch.teacher_name = newT.full_name ?? "";
        await supabaseAdmin.from("users").update({ teacher_id: f.teacher_id }).eq("user_id", save.user_id);

        // الحفظ المطلوب حالياً
        const { data: lastRow } = await supabaseAdmin.from("users_pages")
          .select("MePageArabic, status").eq("save_id", saveId).order("id", { ascending: false }).limit(1).maybeSingle();
        const reqLine = lastRow?.MePageArabic ? `الحفظ المطلوب حالياً: *${lastRow.MePageArabic}*` : "";

        if (oldT?.phone_number) {
          const txt = `${g(stu?.gender, "الطالب", "الطالبة")} *${stu?.full_name ?? ""}* تم ${g(stu?.gender, "تحويله", "تحويلها")} إلى ${g(newT.gender, "المشرف", "المشرفة")} *${newT.full_name}*، وتم إخلاء مسؤوليتك من ${g(stu?.gender, "متابعته", "متابعتها")}.`;
          await sendWaha(oldT.phone_number, wrapMsg(A, txt));
        }
        if (newT.phone_number) {
          const txt = `تم تكليفك بمتابعة حفظ ${g(stu?.gender, "الطالب", "الطالبة")} *${stu?.full_name ?? ""}* (الحفظ: *${save.name}*).\n${reqLine}`;
          await sendWaha(newT.phone_number, wrapMsg(A, txt));
        }
        if (stu?.user_phone_number) {
          const txt = `تم تحويل المشرف الخاص بحفظك (*${save.name}*) من *${oldT?.full_name ?? "—"}* إلى *${newT.full_name}*.\n${reqLine}`;
          await sendWaha(stu.user_phone_number, wrapMsg(A, txt));
        }
        notes.push(`تبديل المشرف إلى ${newT.full_name}`);
      }

      if (!Object.keys(patch).length) return jsonResponse({ error: true, errors: "لا توجد تعديلات" }, 400);
      const { error } = await supabaseAdmin.from("users_saves").update(patch).eq("id", saveId);
      if (error) return jsonResponse({ error: true, errors: error.message }, 400);
      await writeLog(A, `عدّل حفظ (${save.name}) للطالب (${stu?.full_name ?? save.user_id}): ${notes.join("، ")}.`);
      return jsonResponse({ error: false });
    }

    /* ── تعيين كلمة المرور (+ system_key) ───────────────────────── */
    if (action === "set_password") {
      const kind = String(body?.kind ?? "student");
      const id = String(body?.id ?? "");
      const password = String(body?.password ?? "");
      if (!id || !password) return jsonResponse({ error: true, errors: "id و password مطلوبان" }, 400);

      let authId = id, who = "";
      if (kind === "teacher") {
        const { data: t } = await supabaseAdmin.from("teachers").select("email, full_name").eq("teacher_id", id).maybeSingle();
        if (!t?.email) return jsonResponse({ error: true, errors: "تعذّر إيجاد إيميل المشرف" }, 400);
        who = t.full_name ?? "";
        const found = await findAuthIdByEmail(t.email);
        if (!found) return jsonResponse({ error: true, errors: "تعذّر إيجاد حساب المصادقة للمشرف" }, 400);
        authId = found;
      } else {
        const { data: u } = await supabaseAdmin.from("users").select("full_name").eq("user_id", id).maybeSingle();
        who = u?.full_name ?? "";
      }

      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(authId, { password: password + SYSTEM_KEY });
      if (authErr) return jsonResponse({ error: true, errors: authErr.message }, 400);
      await supabaseAdmin.from(kind === "teacher" ? "teachers" : "users")
        .update({ password }).eq(kind === "teacher" ? "teacher_id" : "user_id", id);
      await writeLog(A, `غيّر كلمة مرور ${kind === "teacher" ? "المشرف" : "الطالب"} (${who}).`);
      return jsonResponse({ error: false });
    }

    /* ── تقييم صفحة/اختبار (مع حالات جاهزة) ─────────────────────── */
    if (action === "grade_page") {
      const table = String(body?.table ?? "pages");
      const rowId = body?.row_id;
      const state = String(body?.state ?? "finished");
      const notify = body?.notify !== false;
      if (rowId == null) return jsonResponse({ error: true, errors: "row_id مطلوب" }, 400);

      const tbl = table === "tests" ? "users_pages_tests" : "users_pages";
      const isExam = table === "tests";
      const { data: row } = await supabaseAdmin.from(tbl).select("*").eq("id", rowId).maybeSingle();
      if (!row) return jsonResponse({ error: true, errors: "الصف غير موجود" }, 404);

      const { data: stu } = await supabaseAdmin.from("users")
        .select("full_name, gender, user_phone_number").eq("user_id", row.user_id).maybeSingle();
      const { data: tch } = row.teacher_id
        ? await supabaseAdmin.from("teachers").select("full_name, gender, phone_number").eq("teacher_id", row.teacher_id).maybeSingle()
        : { data: null };
      const isFU = stu?.gender === "female";
      const iFT = tch?.gender === "female";

      const patch: Record<string, any> = { finished_at: nowIso() };
      let resultText = "";

      if (state === "finished") {
        const sowad = num(body?.sowad), nisyan = num(body?.nisyan), fateh = num(body?.fateh);
        const ps = isExam ? calcExam(sowad, nisyan, fateh) : calcNotExam(sowad, nisyan);
        patch.status = "finished"; patch.page_status = ps; patch.takeem_status = ps;
        patch.errors_number = isExam ? { sowad, nisyan, fateh } : { sowad, nisyan };
        if (body?.custom_info_text) patch.custom_info = String(body.custom_info_text);
        resultText = psLabel(ps, isFU);
      } else if (["user_absence", "teacher_absence", "holiday"].includes(state)) {
        patch.status = state; patch.page_status = state;
        resultText = stateLabel(state, isFU, iFT);
      } else {
        return jsonResponse({ error: true, errors: "حالة غير معروفة" }, 400);
      }

      const { error } = await supabaseAdmin.from(tbl).update(patch).eq("id", rowId);
      if (error) return jsonResponse({ error: true, errors: error.message }, 400);

      let notified = { student: false, teacher: false };
      if (notify) {
        const ctx = isExam ? (row.type === "EXAM2" ? "الاختبار التراكمي" : "الاختبار الجزئي") : "حفظ اليوم";
        if (stu?.user_phone_number) {
          const txt = `تم تعديل نتيجة ${g(stu.gender, "حفظكَ", "حفظكِ")} (${ctx}) من قبل الإدارة.\nالنتيجة الجديدة: *${resultText}*\n${g(stu.gender, "يمكنكَ", "يمكنكِ")} الإطلاع على التفاصيل من تطبيق تحفيظ.`;
          notified.student = await sendWaha(stu.user_phone_number, wrapMsg(A, txt));
        }
        if (tch?.phone_number) {
          const txt = `${g(tch.gender, "عزيزي المشرف", "عزيزتي المشرفة")},\nتم تعديل نتيجة ${g(stu?.gender, "الطالب", "الطالبة")} *${stu?.full_name ?? ""}* (${ctx}) من قبل الإدارة إلى: *${resultText}*`;
          notified.teacher = await sendWaha(tch.phone_number, wrapMsg(A, txt));
        }
      }
      await writeLog(A, `قيّم ${isExam ? "اختبار" : "صفحة"} ${g(stu?.gender, "الطالب", "الطالبة")} (${stu?.full_name ?? ""}). النتيجة: ${resultText}.`);
      return jsonResponse({ error: false, result: resultText, notified });
    }

    /* ── التحكم بالاختبار (تفعيل/إيقاف + تعيين مشرف) ─────────────── */
    if (action === "exam_control") {
      const saveId = String(body?.save_id ?? "");
      const examType = String(body?.exam_type ?? "EXAM1");
      const enable = body?.enable === true;
      const teacherId = body?.teacher_id ? String(body.teacher_id) : null;
      if (!saveId) return jsonResponse({ error: true, errors: "save_id مطلوب" }, 400);

      const { data: save } = await supabaseAdmin.from("users_saves").select("*").eq("id", saveId).maybeSingle();
      if (!save) return jsonResponse({ error: true, errors: "الحفظ غير موجود" }, 404);
      if (save.status === "IN_EXAM1" || save.status === "IN_EXAM2") {
        return jsonResponse({ error: true, errors: "لا يمكن تعديل إعدادات الاختبار أثناء فترة الاختبار" }, 400);
      }
      if (save.status === "TERMINATED") return jsonResponse({ error: true, errors: "لا يمكن تعديل حفظ منهي" }, 400);

      const isE2 = examType === "EXAM2";
      const curTeacher = isE2 ? save.exam2_teacher_id : save.exam1_teacher_id;
      const patch: Record<string, any> = {};
      patch[isE2 ? "exam2" : "exam1"] = enable;
      // المشرف يُعيَّن مرة واحدة فقط؛ لا يُغيَّر بعد تعيينه
      if (teacherId && !curTeacher) patch[isE2 ? "exam2_teacher_id" : "exam1_teacher_id"] = teacherId;
      else if (teacherId && curTeacher && String(teacherId) !== String(curTeacher)) {
        return jsonResponse({ error: true, errors: "لا يمكن تغيير مشرف الاختبار بعد تعيينه" }, 400);
      }

      const { error } = await supabaseAdmin.from("users_saves").update(patch).eq("id", saveId);
      if (error) return jsonResponse({ error: true, errors: error.message }, 400);

      const { data: stu } = await supabaseAdmin.from("users")
        .select("full_name, gender, user_phone_number").eq("user_id", save.user_id).maybeSingle();
      const examLabel = isE2 ? "الاختبار التراكمي" : "الاختبار الجزئي";
      let notified = { student: false, teacher: false };
      if (enable) {
        if (stu?.user_phone_number) {
          const txt = `تم تفعيل *${examLabel}* ${g(stu.gender, "لحفظكَ", "لحفظكِ")} (*${save.name}*) من قبل الإدارة. ${g(stu.gender, "ستُعلَم", "ستُعلَمين")} بموعده قريباً.`;
          notified.student = await sendWaha(stu.user_phone_number, wrapMsg(A, txt));
        }
        const useT = teacherId || curTeacher;
        if (useT) {
          const { data: tch } = await supabaseAdmin.from("teachers").select("full_name, gender, phone_number").eq("teacher_id", useT).maybeSingle();
          if (tch?.phone_number) {
            const txt = `${g(tch.gender, "تم تكليفكَ", "تم تكليفكِ")} بإجراء *${examLabel}* ${g(stu?.gender, "للطالب", "للطالبة")} *${stu?.full_name ?? ""}* (الحفظ: ${save.name}).`;
            notified.teacher = await sendWaha(tch.phone_number, wrapMsg(A, txt));
          }
        }
      }
      await writeLog(A, `${enable ? "فعّل" : "أوقف"} ${examLabel} لحفظ (${save.name}) للطالب (${stu?.full_name ?? ""}).`);
      return jsonResponse({ error: false, notified });
    }

    /* ── إضافة طالب جديد + حفظه الأول ─────────────────────────────── */
    if (action === "add_student") {
      const f = body?.fields ?? {};
      const fullName = String(f.full_name ?? "").trim();
      const phone = String(f.phone ?? "").trim();
      const gender = f.gender === "female" ? "female" : "male";
      const teacherId = String(f.teacher_id ?? "");
      const saveName = String(f.save_name ?? "").trim();
      const startPage = Number(f.start_page), endPage = Number(f.end_page), everyDay = Number(f.every_day_page);
      if (!fullName || !phone || !teacherId || !saveName || !startPage || !endPage || !everyDay) {
        return jsonResponse({ error: true, errors: "جميع الحقول مطلوبة" }, 400);
      }
      if (endPage <= startPage) return jsonResponse({ error: true, errors: "صفحة النهاية يجب أن تكون أكبر من البداية" }, 400);

      const { data: teacher } = await supabaseAdmin.from("teachers")
        .select("teacher_id, full_name, gender, phone_number").eq("teacher_id", teacherId).maybeSingle();
      if (!teacher) return jsonResponse({ error: true, errors: "المشرف غير موجود" }, 404);

      const userPhone = normalizePhone(phone);
      const email = `00${userPhone}@thamer-project.com`;
      const basePassword = randomPassword();
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email, password: basePassword + SYSTEM_KEY, email_confirm: true,
      });
      if (authErr || !authData?.user?.id) return jsonResponse({ error: true, errors: authErr?.message ?? "فشل إنشاء الحساب" }, 400);
      const userId = authData.user.id;

      const ts = nowIso();
      const { data: saveRow, error: saveErr } = await supabaseAdmin.from("users_saves").insert({
        user_id: userId, teacher_id: teacher.teacher_id, name: saveName, number: 1,
        start_page: startPage, end_page: endPage, page_current: startPage, every_day_page: everyDay,
        created_at: ts, finished_at: null, status: "ACTIVE", exam1: false, exam2: false,
        teacher_name: teacher.full_name, started_at: ts, db_created_at: ts,
      }).select("id").single();
      if (saveErr || !saveRow) {
        await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
        return jsonResponse({ error: true, errors: saveErr?.message ?? "فشل إضافة الحفظ" }, 400);
      }

      const myPhone = toLocalPhone(A.phone_number ?? "");
      const { error: userErr } = await supabaseAdmin.from("users").insert({
        user_id: userId, full_name: fullName, user_phone_number: userPhone, email,
        password: basePassword, teacher_id: teacher.teacher_id, gender,
        added_admin_phone_number: myPhone, edited_admin_phone_number: myPhone, save_id: saveRow.id,
      });
      if (userErr) {
        await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
        return jsonResponse({ error: true, errors: userErr.message }, 400);
      }

      await writeLog(A, `أضاف طالب${gender === "female" ? "ة" : ""} جديد${gender === "female" ? "ة" : ""} (${fullName}) بحفظ (${saveName}).`);
      return jsonResponse({ error: false, user_id: userId, save_id: saveRow.id, password: basePassword });
    }

    /* ── إضافة حفظ جديد لطالب موجود (مع إنهاء الحفظ الحالي اختيارياً) ── */
    if (action === "add_save") {
      const userId = String(body?.user_id ?? "");
      const f = body?.fields ?? {};
      const replaceSaveId = body?.replace_save_id ? String(body.replace_save_id) : null;
      const saveName = String(f.save_name ?? "").trim();
      const teacherId = String(f.teacher_id ?? "");
      const startPage = Number(f.start_page), endPage = Number(f.end_page), everyDay = Number(f.every_day_page);
      if (!userId || !saveName || !teacherId || !startPage || !endPage || !everyDay) {
        return jsonResponse({ error: true, errors: "جميع الحقول مطلوبة" }, 400);
      }
      if (endPage <= startPage) return jsonResponse({ error: true, errors: "صفحة النهاية يجب أن تكون أكبر من البداية" }, 400);

      const [{ data: stu }, { data: teacher }] = await Promise.all([
        supabaseAdmin.from("users").select("full_name, gender, user_phone_number").eq("user_id", userId).maybeSingle(),
        supabaseAdmin.from("teachers").select("teacher_id, full_name, gender, phone_number").eq("teacher_id", teacherId).maybeSingle(),
      ]);
      if (!stu) return jsonResponse({ error: true, errors: "الطالب غير موجود" }, 404);
      if (!teacher) return jsonResponse({ error: true, errors: "المشرف غير موجود" }, 404);

      if (replaceSaveId) {
        await supabaseAdmin.from("users_saves").update({ status: "TERMINATED" }).eq("id", replaceSaveId);
      }

      const ts = nowIso();
      const { data: saveRow, error: saveErr } = await supabaseAdmin.from("users_saves").insert({
        user_id: userId, teacher_id: teacher.teacher_id, name: saveName, number: 1,
        start_page: startPage, end_page: endPage, page_current: startPage, every_day_page: everyDay,
        created_at: ts, finished_at: null, status: "ACTIVE", exam1: false, exam2: false,
        teacher_name: teacher.full_name, started_at: ts, db_created_at: ts,
      }).select("id").single();
      if (saveErr || !saveRow) return jsonResponse({ error: true, errors: saveErr?.message ?? "فشل إضافة الحفظ" }, 400);

      await supabaseAdmin.from("users").update({ teacher_id: teacher.teacher_id, save_id: saveRow.id }).eq("user_id", userId);

      const isFU = stu.gender === "female";
      if (stu.user_phone_number) {
        const txt = `📖 *حفظ جديد*\n${replaceSaveId ? `تم إنهاء حفظك السابق وبدء ` : `تم تسجيل `}حفظ جديد ${g(stu.gender, "لكَ", "لكِ")}: *${saveName}*\nالمشرف${g(teacher.gender, "", "ة")} المسؤول${g(teacher.gender, "", "ة")}: *${teacher.full_name}*`;
        await sendWaha(stu.user_phone_number, wrapMsg(A, txt));
      }
      if (teacher.phone_number) {
        const txt = `تم تكليفك بمتابعة حفظ جديد ${g(stu.gender, "للطالب", "للطالبة")} *${stu.full_name}* (${saveName}).`;
        await sendWaha(teacher.phone_number, wrapMsg(A, txt));
      }
      await writeLog(A, `أضاف حفظ جديد (${saveName}) ${isFU ? "للطالبة" : "للطالب"} (${stu.full_name}).`);
      return jsonResponse({ error: false, save_id: saveRow.id });
    }

    /* ── حذف طالب (يتطلب تأكيد كلمة مرور الإداري) ─────────────────── */
    if (action === "delete_student") {
      const userId = String(body?.user_id ?? "");
      const password = String(body?.admin_password ?? "");
      if (!userId || !password) return jsonResponse({ error: true, errors: "user_id وكلمة المرور مطلوبان" }, 400);
      if (String(A.password ?? "") !== password) return jsonResponse({ error: true, errors: "كلمة المرور غير صحيحة" }, 401);

      const { data: stu } = await supabaseAdmin.from("users").select("full_name, gender, user_id").eq("user_id", userId).maybeSingle();
      if (!stu) return jsonResponse({ error: true, errors: "الطالب غير موجود" }, 404);

      await supabaseAdmin.from("users_pages").delete().eq("user_id", userId);
      await supabaseAdmin.from("users_pages_tests").delete().eq("user_id", userId);
      await supabaseAdmin.from("users_saves").delete().eq("user_id", userId);
      await supabaseAdmin.from("users").delete().eq("user_id", userId);
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});

      await writeLog(A, `حذف ${g(stu.gender, "الطالب", "الطالبة")} (${stu.full_name}) نهائياً من النظام.`);
      return jsonResponse({ error: false });
    }

    /* ── إضافة مشرف جديد ───────────────────────────────────────────── */
    if (action === "add_teacher") {
      const f = body?.fields ?? {};
      const fullName = String(f.full_name ?? "").trim();
      const phone = String(f.phone ?? "").trim();
      const gender = f.gender === "female" ? "female" : "male";
      if (!fullName || !phone) return jsonResponse({ error: true, errors: "الاسم والهاتف مطلوبان" }, 400);

      const teacherPhone = normalizePhone(phone);
      const email = `00${teacherPhone}@thamer-teacher.com`;
      const basePassword = randomPassword();
      const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
        email, password: basePassword + SYSTEM_KEY, email_confirm: true,
      });
      if (authErr || !authData?.user?.id) return jsonResponse({ error: true, errors: authErr?.message ?? "فشل إنشاء الحساب" }, 400);

      const { data: teacherRow, error: tErr } = await supabaseAdmin.from("teachers").insert({
        full_name: fullName, phone_number: teacherPhone, email, password: basePassword,
        gender, joined: false,
      }).select("teacher_id").single();
      if (tErr || !teacherRow) {
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => {});
        return jsonResponse({ error: true, errors: tErr?.message ?? "فشل إضافة المشرف" }, 400);
      }

      await writeLog(A, `أضاف مشرف${gender === "female" ? "ة" : ""} جديد${gender === "female" ? "ة" : ""} (${fullName}).`);
      return jsonResponse({ error: false, teacher_id: teacherRow.teacher_id, password: basePassword });
    }

    return jsonResponse({ error: true, errors: "إجراء غير معروف" }, 400);
  } catch (e) {
    return jsonResponse({ error: true, errors: String(e) }, 500);
  }
});

async function findAuthIdByEmail(email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u: any) => (u.email ?? "").toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 1000) return null;
  }
  return null;
}
