import {
  supabaseAdmin, requireAdmin, requireOwner, SYSTEM_KEY, jsonResponse, preflight,
  sendWaha, wrapMsg, writeLog, g, toLocalPhone, normalizePhone, nowIso, baghdadDate,
} from "../_shared/guard.ts";

/* ── مساعد إشعارات: يحدد لمن تُرسل رسائل الواتساب ──────────────────────
   notify_target ∈ "student" | "teacher" | "both" | "none" (افتراضي "both").
   توافق خلفي: إن مُرّر notify===false اعتبره "none". */
type NotifyTarget = "student" | "teacher" | "both" | "none";
function resolveNotifyTarget(body: any): NotifyTarget {
  if (body?.notify === false) return "none";
  const nt = String(body?.notify_target ?? "both");
  if (nt === "student" || nt === "teacher" || nt === "both" || nt === "none") return nt;
  return "both";
}
function notifyStudent(nt: NotifyTarget): boolean { return nt === "student" || nt === "both"; }
function notifyTeacher(nt: NotifyTarget): boolean { return nt === "teacher" || nt === "both"; }

// بناء سلسلة عرض الصفحات بالعربية مثل "50 و 51 و 52" (مطابق لـ pages_system)
function buildPageDisplay(page: number, edp: number): string {
  const count = edp < 1 ? 1 : Math.ceil(edp);
  return Array.from({ length: count }, (_, i) => String(page - (count - 1 - i))).join(" و ");
}

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

      const { data: before } = await supabaseAdmin.from("users")
        .select("full_name, gender, date_of_brith, user_location").eq("user_id", userId).maybeSingle();

      patch.edited_admin_phone_number = A.phone_number ? toLocalPhone(A.phone_number) : A.name;
      const { error } = await supabaseAdmin.from("users").update(patch).eq("user_id", userId);
      if (error) return jsonResponse({ error: true, errors: error.message }, 400);

      const FIELD_LABEL: Record<string, string> = {
        full_name: "الاسم", gender: "الجنس", date_of_brith: "تاريخ الميلاد", user_location: "السكن",
      };
      const diffs = ALLOWED.filter((k) => k in f).map((k) => {
        const oldV = k === "gender" ? (before?.gender === "female" ? "أنثى" : "ذكر") : ((before as any)?.[k] ?? "—");
        const newV = k === "gender" ? (patch.gender === "female" ? "أنثى" : "ذكر") : patch[k];
        return `${FIELD_LABEL[k]}: "${oldV}" ← "${newV}"`;
      });
      await writeLog(A, `عدّل بيانات الطالب (${patch.full_name ?? before?.full_name ?? userId}). التغييرات: ${diffs.join("، ")}.`);
      return jsonResponse({ error: false });
    }

    /* ── طلب من الطالب إكمال ملفه ───────────────────────────────── */
    if (action === "set_profile_incomplete") {
      const userId = String(body?.user_id ?? "");
      const reason = body?.reason != null ? String(body.reason) : "";
      if (!userId) return jsonResponse({ error: true, errors: "user_id مطلوب" }, 400);
      const { data: u } = await supabaseAdmin.from("users")
        .select("full_name, gender, user_phone_number").eq("user_id", userId).maybeSingle();
      const { error } = await supabaseAdmin.from("users").update({ profile_incomplete: true }).eq("user_id", userId);
      if (error) return jsonResponse({ error: true, errors: error.message }, 400);
      let notified = false;
      if (u?.user_phone_number) {
        const txt = `تم تحويل ${g(u.gender, "ملفكَ", "ملفكِ")} الشخصي إلى غير مكتمل، يرجى ${g(u.gender, "منكَ", "منكِ")} الدخول إلى تطبيق تحفيظ وملء المعلومات مرة أُخرى.\nالسبب: ${reason.trim() ? reason.trim() : "لا يوجد"}`;
        notified = await sendWaha(u.user_phone_number, wrapMsg(A, txt));
      }
      await writeLog(A, `طلب من الطالب (${u?.full_name ?? userId}) إكمال ملفه الشخصي.${reason.trim() ? ` السبب: ${reason.trim()}.` : ""}`);
      return jsonResponse({ error: false, notified });
    }

    /* ── تصفير غيابات الطالب ───────────────────────────────────────── */
    if (action === "clear_absence") {
      const userId = String(body?.user_id ?? "");
      if (!userId) return jsonResponse({ error: true, errors: "user_id مطلوب" }, 400);
      const { data: u } = await supabaseAdmin.from("users")
        .select("full_name, gender").eq("user_id", userId).maybeSingle();
      if (!u) return jsonResponse({ error: true, errors: "الطالب غير موجود" }, 404);
      const { error } = await supabaseAdmin.from("users")
        .update({ absence: { total: 0, last_check: 0, last_stopped_at: 0, stopped_abs_total: 0 } })
        .eq("user_id", userId);
      if (error) return jsonResponse({ error: true, errors: error.message }, 400);
      await writeLog(A, `صفّر غيابات ${g(u.gender, "الطالب", "الطالبة")} (${u.full_name ?? userId}).`);
      return jsonResponse({ error: false });
    }

    /* ── إرسال كلمة السر عبر واتساب (يتطلب كلمة مرور الإداري) ───────── */
    if (action === "send_password") {
      const kind = String(body?.kind ?? "student");
      const id = String(body?.id ?? "");
      const adminPassword = String(body?.admin_password ?? "");
      if (!id) return jsonResponse({ error: true, errors: "id مطلوب" }, 400);
      if (String(A.password) !== String(adminPassword)) {
        return jsonResponse({ error: true, errors: "كلمة المرور غير صحيحة." }, 401);
      }

      let password = "", phone = "", targetGender = "male", who = "";
      if (kind === "teacher") {
        const { data: t } = await supabaseAdmin.from("teachers")
          .select("full_name, gender, password, phone_number").eq("teacher_id", id).maybeSingle();
        if (!t) return jsonResponse({ error: true, errors: "المشرف غير موجود" }, 404);
        password = String(t.password ?? ""); phone = String(t.phone_number ?? "");
        targetGender = t.gender ?? "male"; who = t.full_name ?? "";
      } else if (kind === "admin") {
        // إدارة الحسابات الإدارية متاحة للمسؤول الإداري (owner) فقط
        const ownerErr = requireOwner(A);
        if (ownerErr) return ownerErr;
        const { data: ad } = await supabaseAdmin.from("admins")
          .select("name, gender, password, phone_number").eq("id", id).maybeSingle();
        if (!ad) return jsonResponse({ error: true, errors: "الحساب الإداري غير موجود" }, 404);
        password = String(ad.password ?? ""); phone = String(ad.phone_number ?? "");
        targetGender = ad.gender ?? "male"; who = ad.name ?? "";
      } else {
        const { data: u } = await supabaseAdmin.from("users")
          .select("full_name, gender, password, user_phone_number").eq("user_id", id).maybeSingle();
        if (!u) return jsonResponse({ error: true, errors: "الطالب غير موجود" }, 404);
        password = String(u.password ?? ""); phone = String(u.user_phone_number ?? "");
        targetGender = u.gender ?? "male"; who = u.full_name ?? "";
      }

      let notified = false;
      if (phone && password) {
        const txt = `كلمة السر الخاصة ${g(targetGender, "بحسابكَ", "بحسابكِ")} هي: ${password}`;
        notified = await sendWaha(phone, wrapMsg(A, txt));
      }
      const kindLbl = kind === "teacher" ? "مشرف" : kind === "admin" ? "إداري" : "طالب";
      await writeLog(A, `أرسل كلمة سر (${kindLbl}) (${who} — ${phone || "—"}) عبر واتساب. ${notified ? "تم التسليم." : "فشل التسليم."}`);
      return jsonResponse({ error: false, notified });
    }

    /* ── تعديل الحفظ (إلى الصفحة + الحالة + تبديل المشرف) ────────── */
    if (action === "update_save") {
      const saveId = String(body?.save_id ?? "");
      const f = body?.fields ?? {};
      if (!saveId) return jsonResponse({ error: true, errors: "save_id مطلوب" }, 400);

      const notifyTarget = resolveNotifyTarget(body);

      const { data: save } = await supabaseAdmin.from("users_saves").select("*").eq("id", saveId).maybeSingle();
      if (!save) return jsonResponse({ error: true, errors: "الحفظ غير موجود" }, 404);

      const { data: stu } = await supabaseAdmin.from("users")
        .select("full_name, gender, user_phone_number").eq("user_id", save.user_id).maybeSingle();
      const isFU = stu?.gender === "female";
      const sg = stu?.gender;
      const patch: Record<string, any> = {};
      const notes: string[] = [];

      // إلى الصفحة فقط (صفحة البداية محميّة)
      if (f.end_page != null && f.end_page !== "") {
        const ep = Number(f.end_page);
        if (ep > Number(save.start_page)) { patch.end_page = ep; notes.push(`إلى الصفحة ${ep}`); }
      }

      // ── تغيير حالة الحفظ: ثلاث حالات + رسائل كاملة ──────────────────
      // الانتقالات المسموحة: ACTIVE↔SUSPENDED، ACTIVE→TERMINATED، SUSPENDED→TERMINATED
      if (f.status && f.status !== save.status) {
        // حفظ منهي نهائياً: لا يُسمح بأي تغيير
        if (save.status === "TERMINATED") {
          return jsonResponse({ error: true, errors: "هذا الحفظ منهي نهائياً، لا يمكن إعادة تفعيله. يمكن للمطور فقط إعادة تفعيله." }, 400);
        }
        const allowed =
          (save.status === "ACTIVE" && f.status === "SUSPENDED") ||
          (save.status === "SUSPENDED" && f.status === "ACTIVE") ||
          (save.status === "ACTIVE" && f.status === "TERMINATED") ||
          (save.status === "SUSPENDED" && f.status === "TERMINATED");
        if (!allowed) {
          return jsonResponse({ error: true, errors: "انتقال حالة غير مسموح به" }, 400);
        }

        const reason = f.status_reason != null ? String(f.status_reason).trim() : "";
        // جلب بيانات المشرف الحالي للرسائل
        const { data: tch } = save.teacher_id
          ? await supabaseAdmin.from("teachers").select("full_name, gender, phone_number").eq("teacher_id", save.teacher_id).maybeSingle()
          : { data: null as any };
        const tg = tch?.gender;
        const teacher_name = tch?.full_name ?? save.teacher_name ?? "—";

        let stuMsg = "", tchMsg = "";

        if (f.status === "SUSPENDED") {
          patch.status = "SUSPENDED";
          patch.status_reason = reason || null;
          patch.old_status = save.status;
          stuMsg = `تم إيقاف ${g(sg, "حفظكَ", "حفظكِ")} (*${save.name}*) بشكل مؤقت.\nالسبب: ${reason || "لا يوجد"}`;
          tchMsg = `تم إيقاف حفظ ${g(sg, "الطالب", "الطالبة")} *${stu?.full_name ?? ""}* (*${save.name}*) مؤقتاً من قبل الإدارة.\nالسبب: ${reason || "لا يوجد"}`;
          notes.push(`الحالة: "${save.status}" ← "SUSPENDED" (السبب: ${reason || "لا يوجد"})`);
        } else if (f.status === "ACTIVE") {
          patch.status = "ACTIVE";
          patch.status_reason = null;
          patch.old_status = null;
          // الحفظ المطلوب لليوم من آخر صف
          const { data: lastRow } = await supabaseAdmin.from("users_pages")
            .select("MePageArabic").eq("save_id", saveId).order("id", { ascending: false }).limit(1).maybeSingle();
          const mePage = lastRow?.MePageArabic;
          stuMsg = `تمت إعادة تفعيل ${g(sg, "حفظكَ", "حفظكِ")} (*${save.name}*).\nالحفظ المطلوب لليوم: *ص${mePage || "—"}*\nعند ${g(tg, "المشرف", "المشرفة")}: *${teacher_name}*`;
          tchMsg = `تمت إعادة تفعيل حفظ ${g(sg, "الطالب", "الطالبة")} *${stu?.full_name ?? ""}* (*${save.name}*).\nحفظ${g(sg, "ه", "ها")} لليوم: *ص${mePage || "—"}*\nسيتم إعلامك عند ${g(sg, "استعداده", "استعدادها")}.`;
          notes.push(`الحالة: "${save.status}" ← "ACTIVE"`);
        } else { // TERMINATED
          patch.status = "TERMINATED";
          patch.status_reason = reason || null;
          stuMsg = `تم إنهاء ${g(sg, "حفظكَ", "حفظكِ")} الحالي (*${save.name}*).\nالسبب: ${reason || "لا يوجد"}\nإن كان هذا عن طريق الخطأ يُرجى التواصل مع إدارة المركز.`;
          tchMsg = `تم إنهاء حفظ ${g(sg, "الطالب", "الطالبة")} *${stu?.full_name ?? ""}* (*${save.name}*) من قبل الإدارة.\nالسبب: ${reason || "لا يوجد"}\nإن كان هذا عن طريق الخطأ يُرجى التواصل مع إدارة المركز.`;
          notes.push(`الحالة: "${save.status}" ← "TERMINATED" (السبب: ${reason || "لا يوجد"})`);
        }

        if (notifyStudent(notifyTarget) && stu?.user_phone_number) {
          await sendWaha(stu.user_phone_number, wrapMsg(A, stuMsg));
        }
        if (notifyTeacher(notifyTarget) && tch?.phone_number) {
          await sendWaha(tch.phone_number, wrapMsg(A, tchMsg));
        }
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
        notes.push(`المشرف: "${oldT?.full_name ?? "—"}" ← "${newT.full_name}"`);
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
      const notifyTarget = resolveNotifyTarget(body);
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
      const sg = stu?.gender;

      // ── تحديد موقع الصف ضمن صفوف حفظه (للصفحات فقط) ─────────────────
      // isLast = آخر صف، isSecondLast = الصف قبل الأخير، isOld = أقدم من ذلك.
      let isLast = true, isSecondLast = false, isOld = false;
      let orderedRows: any[] = [];
      if (!isExam && row.save_id) {
        const { data: rows } = await supabaseAdmin.from("users_pages")
          .select("id, page, MePageArabic, status, page_status, date")
          .eq("save_id", row.save_id).order("id", { ascending: true });
        orderedRows = rows ?? [];
        const idx = orderedRows.findIndex((r) => String(r.id) === String(rowId));
        const lastIdx = orderedRows.length - 1;
        isLast = idx === lastIdx;
        isSecondLast = idx === lastIdx - 1;
        isOld = idx >= 0 && idx < lastIdx - 1;
      }

      const patch: Record<string, any> = { finished_at: nowIso() };
      let resultText = "";
      let resultPs = ""; // نتيجة التقييم الخام (reject/good/very_good/perfect)

      if (state === "finished") {
        const sowad = num(body?.sowad), nisyan = num(body?.nisyan), fateh = num(body?.fateh);
        const ps = isExam ? calcExam(sowad, nisyan, fateh) : calcNotExam(sowad, nisyan);
        resultPs = ps;
        // قاعدة الصف القديم: لا يُسمح بجعله راسباً، فقط ضمن نطاق النجاح.
        if (!isExam && isOld && ps === "reject") {
          return jsonResponse({ error: true, errors: "لا يمكن جعل صف قديم راسباً، يُسمح فقط بتعديل الأخطاء ضمن نطاق النجاح (٠ إلى ٢)." }, 400);
        }
        patch.status = "finished"; patch.page_status = ps; patch.takeem_status = ps;
        patch.errors_number = isExam ? { sowad, nisyan, fateh } : { sowad, nisyan };
        if (body?.custom_info_text) patch.custom_info = String(body.custom_info_text);
        resultText = psLabel(ps, isFU);
      } else if (["user_absence", "teacher_absence", "holiday"].includes(state)) {
        // الغياب/الإجازة على صف قديم لا يُسمح به (يكسر التقدم)
        if (!isExam && isOld) {
          return jsonResponse({ error: true, errors: "لا يمكن جعل صف قديم راسباً، يُسمح فقط بتعديل الأخطاء ضمن نطاق النجاح (٠ إلى ٢)." }, 400);
        }
        patch.status = state; patch.page_status = state;
        resultText = stateLabel(state, isFU, iFT);
      } else {
        return jsonResponse({ error: true, errors: "حالة غير معروفة" }, 400);
      }

      const { error } = await supabaseAdmin.from(tbl).update(patch).eq("id", rowId);
      if (error) return jsonResponse({ error: true, errors: error.message }, 400);

      // ── الترحيل (cascade): إعادة مزامنة الصفوف التالية إن لم يكن الصف الأخير ─
      // عند تعديل صف ليس الأخير، نُعيد حساب أرقام صفحات الصفوف التالية بناءً على
      // التقدم الجاري (آخر صفحة ناجحة + every_day_page) ونُعيدها إلى not_ready.
      // ملاحظة (قيد): القاعدة مبسّطة — تفترض أن كل صف ناجح يتقدم بمقدار edp،
      // وتعتبر الرسوب/الغياب توقفاً (بقاء على نفس الصفحة). لا تعالج فترات
      // الإجازات/التعليق بنفس تعقيد pages_system؛ الهدف إبقاء سلسلة الصفحات
      // متّسقة فقط، وتُعاد الصفوف اللاحقة إلى not_ready ليُعاد تقييمها.
      let cascaded = false;
      if (!isExam && !isLast && row.save_id && orderedRows.length) {
        const { data: saveRow } = await supabaseAdmin.from("users_saves")
          .select("start_page, every_day_page").eq("id", row.save_id).maybeSingle();
        const edpRaw = Number(saveRow?.every_day_page) || 1;
        const edpStep = edpRaw < 1 ? 1 : Math.ceil(edpRaw);
        const startPage = Number(saveRow?.start_page) || 1;

        const idx = orderedRows.findIndex((r) => String(r.id) === String(rowId));
        // الصفحة الناجحة الجارية حتى الصف المُعدَّل (شاملاً):
        // نمشي من البداية ونحسب آخر صفحة "ناجحة".
        const isSuccess = (st: string, ps: string) =>
          st === "finished" && (ps === "good" || ps === "very_good" || ps === "perfect");

        // أعد بناء التقدم حتى الصف المعدّل باستخدام قيمته الجديدة
        let lastSuccessPage = startPage - edpStep;
        for (let i = 0; i <= idx; i++) {
          const r = orderedRows[i];
          const st = i === idx ? (state === "finished" ? "finished" : state) : String(r.status ?? "");
          const ps = i === idx ? resultPs : String(r.page_status ?? "");
          if (isSuccess(st, ps)) lastSuccessPage = lastSuccessPage + edpStep;
          // وإلا توقف: تبقى الصفحة كما هي (لا تقدم)
        }

        // أعد مزامنة الصفوف التالية: كل صف لاحق = آخر صفحة ناجحة + edp.
        // نفترض أن كل صف سيُسمَّع بنجاح عند إعادة تقييمه فيتقدم بمقدار edp.
        for (let i = idx + 1; i < orderedRows.length; i++) {
          const r = orderedRows[i];
          const nextPage = lastSuccessPage + edpStep;
          lastSuccessPage = nextPage;
          const disp = buildPageDisplay(nextPage, edpRaw);
          await supabaseAdmin.from("users_pages").update({
            status: "not_ready", page_status: "not_ready",
            page: nextPage, MePageArabic: disp,
          }).eq("id", r.id);
          cascaded = true;
        }
      }

      const rowDate = String(row.date ?? "").split("T")[0] || "—";
      let notified = { student: false, teacher: false };
      if (notifyStudent(notifyTarget) && stu?.user_phone_number) {
        let txt = `تم تعديل نتيجة حفظك بتاريخ ${rowDate}: أصبح *${resultText}*.`;
        if (cascaded) txt += `\nوقد تم تحديث حفظ الأيام التالية تلقائياً.`;
        notified.student = await sendWaha(stu.user_phone_number, wrapMsg(A, txt));
      }
      if (notifyTeacher(notifyTarget) && tch?.phone_number) {
        let txt = `تم تعديل نتيجة ${g(sg, "الطالب", "الطالبة")} *${stu?.full_name ?? ""}* بتاريخ ${rowDate}: أصبحت *${resultText}*.`;
        if (cascaded) txt += `\nوقد تم تحديث حفظ الأيام التالية تلقائياً.`;
        notified.teacher = await sendWaha(tch.phone_number, wrapMsg(A, txt));
      }
      const oldStatusRaw = String(row.status ?? "");
      const oldResultText = oldStatusRaw === "finished" ? psLabel(String(row.page_status ?? ""), isFU)
        : ["user_absence", "teacher_absence", "holiday"].includes(oldStatusRaw) ? stateLabel(oldStatusRaw, isFU, iFT)
        : (oldStatusRaw || "بلا تقييم سابق");
      await writeLog(A, `قيّم ${isExam ? "اختبار" : "صفحة"} ${g(sg, "الطالب", "الطالبة")} (${stu?.full_name ?? ""}) بتاريخ ${rowDate}. النتيجة: "${oldResultText}" ← "${resultText}".${cascaded ? " وتمت إعادة مزامنة الصفوف التالية." : ""}`);
      return jsonResponse({ error: false, result: resultText, notified, cascaded });
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
        absence: { total: 0, last_check: 0, last_stopped_at: 0, stopped_abs_total: 0 },
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
      const notifyTarget = resolveNotifyTarget(body);
      const replaceSaveId = body?.replace_save_id ? String(body.replace_save_id) : null;
      const saveName = String(f.save_name ?? "").trim();
      const teacherId = String(f.teacher_id ?? "");
      const startPage = Number(f.start_page), endPage = Number(f.end_page), everyDay = Number(f.every_day_page);
      if (!userId || !saveName || !teacherId || !startPage || !endPage || !everyDay) {
        return jsonResponse({ error: true, errors: "جميع الحقول مطلوبة" }, 400);
      }
      if (endPage <= startPage) return jsonResponse({ error: true, errors: "صفحة النهاية يجب أن تكون أكبر من البداية" }, 400);

      // حقول إضافية
      const evaluateToday = String(f.evaluate_today ?? "false") === "true";
      const exam1 = String(f.exam1 ?? "false") === "true";
      const exam2 = String(f.exam2 ?? "false") === "true";
      const exam1TeacherId = exam1 && f.exam1_teacher_id ? String(f.exam1_teacher_id) : null;
      const exam2TeacherId = exam2 && f.exam2_teacher_id ? String(f.exam2_teacher_id) : null;

      const [{ data: stu }, { data: teacher }] = await Promise.all([
        supabaseAdmin.from("users").select("full_name, gender, user_phone_number").eq("user_id", userId).maybeSingle(),
        supabaseAdmin.from("teachers").select("teacher_id, full_name, gender, phone_number, photo_url").eq("teacher_id", teacherId).maybeSingle(),
      ]);
      if (!stu) return jsonResponse({ error: true, errors: "الطالب غير موجود" }, 404);
      if (!teacher) return jsonResponse({ error: true, errors: "المشرف غير موجود" }, 404);
      const sg = stu.gender, tg = teacher.gender;

      if (replaceSaveId) {
        await supabaseAdmin.from("users_saves").update({ status: "TERMINATED" }).eq("id", replaceSaveId);
      }

      const ts = nowIso();
      const { data: saveRow, error: saveErr } = await supabaseAdmin.from("users_saves").insert({
        user_id: userId, teacher_id: teacher.teacher_id, name: saveName, number: 1,
        start_page: startPage, end_page: endPage, page_current: startPage, every_day_page: everyDay,
        created_at: ts, finished_at: null, status: "ACTIVE",
        exam1, exam2, exam1_teacher_id: exam1TeacherId, exam2_teacher_id: exam2TeacherId,
        teacher_name: teacher.full_name, started_at: ts, db_created_at: ts,
      }).select("id").single();
      if (saveErr || !saveRow) return jsonResponse({ error: true, errors: saveErr?.message ?? "فشل إضافة الحفظ" }, 400);

      await supabaseAdmin.from("users").update({ teacher_id: teacher.teacher_id, save_id: saveRow.id }).eq("user_id", userId);

      // ── التقييم اليوم: إنشاء صف users_pages أول (مطابق لـ pages_system) ──
      let pageDisp = "";
      if (evaluateToday) {
        const edp = everyDay < 1 ? 1 : Math.ceil(everyDay);
        const firstPageNum = startPage + edp - 1;
        pageDisp = buildPageDisplay(firstPageNum, everyDay);
        await supabaseAdmin.from("users_pages").insert([{
          user_id: userId, save_id: saveRow.id,
          teacher_id: teacher.teacher_id, teacher_name: teacher.full_name, teacher_photo: teacher.photo_url ?? "",
          status: "not_ready", page_status: "not_ready",
          errors_number: { sowad: 0, nisyan: 0 },
          created_at: ts,
          page: firstPageNum, MePageArabic: pageDisp,
          date: baghdadDate(0),
        }]);
      }

      // ── رسالة الطالب ──────────────────────────────────────────────
      let stuMsg: string;
      if (evaluateToday) {
        stuMsg = `📖 حفظ اليوم\nالحفظ المطلوب: *${pageDisp}*\nعند ${g(tg, "المشرف", "المشرفة")}: *${teacher.full_name}*\n\nتم تسجيل حفظ جديد ${g(sg, "لكَ", "لكِ")}: *${saveName}*`;
      } else {
        stuMsg = `📖 حفظ جديد\nتم تسجيل حفظ جديد ${g(sg, "لكَ", "لكِ")}: *${saveName}*\nيبدأ التسميع اعتباراً من الغد إن شاء الله.\n${g(tg, "المشرف", "المشرفة")}: *${teacher.full_name}*`;
      }
      if (replaceSaveId) {
        stuMsg += `\nنشكر ${g(sg, "لكَ", "لكِ")} إتمام حفظك السابق، وقد تم إنهاؤه نهائياً.`;
      }

      // ── رسالة المشرف ──────────────────────────────────────────────
      let tchMsg = `تم تكليفك بمتابعة حفظ جديد ${g(sg, "للطالب", "للطالبة")} *${stu.full_name}* (*${saveName}*).`;
      if (evaluateToday) tchMsg += `\nالحفظ المطلوب اليوم: *${pageDisp}*`;

      if (notifyStudent(notifyTarget) && stu.user_phone_number) {
        await sendWaha(stu.user_phone_number, wrapMsg(A, stuMsg));
      }
      if (notifyTeacher(notifyTarget) && teacher.phone_number) {
        await sendWaha(teacher.phone_number, wrapMsg(A, tchMsg));
      }
      await writeLog(A, `أضاف حفظ جديد (${saveName}) ${g(sg, "للطالب", "للطالبة")} (${stu.full_name}).${evaluateToday ? " مع تقييم اليوم." : ""}`);
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
      const teacherAuthId = authData.user.id;

      const { data: teacherRow, error: tErr } = await supabaseAdmin.from("teachers").insert({
        teacher_id: teacherAuthId, full_name: fullName, phone_number: teacherPhone, email, password: basePassword,
        gender, joined: false,
      }).select("teacher_id").single();
      if (tErr || !teacherRow) {
        await supabaseAdmin.auth.admin.deleteUser(teacherAuthId).catch(() => {});
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
