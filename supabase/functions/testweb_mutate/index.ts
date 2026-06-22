import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")              ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SYSTEM_KEY                = Deno.env.get("system_key")                ?? "";
const WAHA_URL                  = Deno.env.get("waha_url")                  ?? "";
const WAHA_API_KEY              = Deno.env.get("waha_api_key")              ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

function jsonResponse(payload: any, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function normalizePhone(p: string): string {
  const s = String(p ?? "").trim().replace(/\s+/g, "");
  if (s.startsWith("+964")) return s.slice(1);
  if (s.startsWith("964"))  return s;
  if (s.startsWith("0"))    return "964" + s.slice(1);
  return s;
}

async function sendWaha(phone: string, text: string): Promise<boolean> {
  const num = normalizePhone(phone);
  if (!num || !WAHA_URL || !WAHA_API_KEY) return false;
  try {
    const res = await fetch(WAHA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": WAHA_API_KEY },
      body: JSON.stringify({ chatId: `${num}@c.us`, text, session: "default" }),
    });
    return res.ok;
  } catch { return false; }
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
    case "reject":    return "رسوب";
    case "good":      return "جيد جداً";
    case "very_good": return "إمتياز";
    case "perfect":   return isFU ? "مُتقِنة" : "مُتقِن";
    default:          return ps;
  }
}

// إيجاد معرّف حساب المصادقة عبر الإيميل (للمشرفين)
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

const STUDENT_FIELDS = new Set([
  "full_name", "gender", "date_of_brith", "user_location", "auto_user_location",
  "email", "joined", "profile_incomplete", "save_id", "teacher_id",
]);
const STUDENT_PHONE_FIELDS = new Set(["user_phone_number", "father_phone_number"]);

const SAVE_FIELDS = new Set([
  "name", "status", "start_page", "end_page", "every_day_page", "number",
  "teacher_id", "teacher_name", "exam1", "exam2",
  "exam1_teacher_id", "exam2_teacher_id", "exam1_date", "exam2_date",
  "started_at", "finished_at",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST")    return jsonResponse({ error: true, errors: "الطريقة غير مسموح بها" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    // ── تعديل بيانات الطالب ───────────────────────────────────────
    if (action === "update_student") {
      const userId = String(body?.user_id ?? "");
      const fields = body?.fields ?? {};
      if (!userId) return jsonResponse({ error: true, errors: "user_id مطلوب" }, 400);
      const patch: Record<string, any> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (STUDENT_FIELDS.has(k)) patch[k] = v;
        else if (STUDENT_PHONE_FIELDS.has(k)) patch[k] = normalizePhone(String(v));
      }
      if (!Object.keys(patch).length) return jsonResponse({ error: true, errors: "لا توجد حقول صالحة للتعديل" }, 400);
      const { error } = await supabaseAdmin.from("users").update(patch).eq("user_id", userId);
      if (error) return jsonResponse({ error: true, errors: error.message }, 400);
      return jsonResponse({ error: false, updated: Object.keys(patch) });
    }

    // ── تعديل بيانات الحفظة ───────────────────────────────────────
    if (action === "update_save") {
      const saveId = String(body?.save_id ?? "");
      const fields = body?.fields ?? {};
      if (!saveId) return jsonResponse({ error: true, errors: "save_id مطلوب" }, 400);
      const patch: Record<string, any> = {};
      for (const [k, v] of Object.entries(fields)) {
        if (SAVE_FIELDS.has(k)) patch[k] = v === "" ? null : v;
      }
      if (!Object.keys(patch).length) return jsonResponse({ error: true, errors: "لا توجد حقول صالحة للتعديل" }, 400);
      const { error } = await supabaseAdmin.from("users_saves").update(patch).eq("id", saveId);
      if (error) return jsonResponse({ error: true, errors: error.message }, 400);
      return jsonResponse({ error: false, updated: Object.keys(patch) });
    }

    // ── إعادة تعيين كلمة المرور ───────────────────────────────────
    if (action === "set_password") {
      const kind     = String(body?.kind ?? "student"); // student | teacher
      const id       = String(body?.id ?? "");
      const password = String(body?.password ?? "");
      if (!id || !password) return jsonResponse({ error: true, errors: "id و password مطلوبان" }, 400);

      let authId = id;
      if (kind === "teacher") {
        const { data: t } = await supabaseAdmin.from("teachers").select("email").eq("teacher_id", id).maybeSingle();
        if (!t?.email) return jsonResponse({ error: true, errors: "تعذّر إيجاد إيميل المشرف" }, 400);
        const found = await findAuthIdByEmail(t.email);
        if (!found) return jsonResponse({ error: true, errors: "تعذّر إيجاد حساب المصادقة للمشرف" }, 400);
        authId = found;
      }

      const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(authId, {
        password: password + SYSTEM_KEY,
      });
      if (authErr) return jsonResponse({ error: true, errors: authErr.message }, 400);

      // مزامنة العمود النصي ليطابق المعروض
      const table = kind === "teacher" ? "teachers" : "users";
      const col   = kind === "teacher" ? "teacher_id" : "user_id";
      await supabaseAdmin.from(table).update({ password }).eq(col, id);

      return jsonResponse({ error: false });
    }

    // ── تقييم صفحة / اختبار ───────────────────────────────────────
    if (action === "grade_page") {
      const table   = String(body?.table ?? "pages"); // pages | tests
      const rowId   = body?.row_id;
      const sowad   = Math.max(0, Math.min(999, Number(body?.sowad ?? 0)));
      const nisyan  = Math.max(0, Math.min(999, Number(body?.nisyan ?? 0)));
      const fateh   = Math.max(0, Math.min(999, Number(body?.fateh ?? 0)));
      const custom  = String(body?.custom_info_text ?? "");
      const notify  = body?.notify !== false;
      if (rowId == null) return jsonResponse({ error: true, errors: "row_id مطلوب" }, 400);

      const tbl = table === "tests" ? "users_pages_tests" : "users_pages";
      const { data: row, error: rowErr } = await supabaseAdmin.from(tbl).select("*").eq("id", rowId).maybeSingle();
      if (rowErr || !row) return jsonResponse({ error: true, errors: "الصف غير موجود" }, 404);

      const isExam = table === "tests";
      const pageStatus = isExam ? calcExam(sowad, nisyan, fateh) : calcNotExam(sowad, nisyan);
      const errorsNumber: Record<string, number> = isExam ? { sowad, nisyan, fateh } : { sowad, nisyan };

      const patch: Record<string, any> = {
        status:        "finished",
        page_status:   pageStatus,
        takeem_status: pageStatus,
        errors_number: errorsNumber,
        finished_at:   new Date().toISOString(),
      };
      if (custom) patch.custom_info = custom;

      const { error: upErr } = await supabaseAdmin.from(tbl).update(patch).eq("id", rowId);
      if (upErr) return jsonResponse({ error: true, errors: upErr.message }, 400);

      // إشعارات
      let notified = { student: false, teacher: false };
      if (notify) {
        const { data: stu } = await supabaseAdmin.from("users")
          .select("full_name, gender, user_phone_number").eq("user_id", row.user_id).maybeSingle();
        const isFU = stu?.gender === "female";
        const label = psLabel(pageStatus, isFU);
        const ctx = isExam ? (row.type === "EXAM2" ? "الاختبار التراكمي" : "الاختبار الجزئي") : "حفظ اليوم";
        if (stu?.user_phone_number) {
          const hifdh = isFU ? "حفظكِ" : "حفظكَ";
          const can   = isFU ? "يمكنكِ" : "يمكنكَ";
          const txt = `تم تعديل نتيجة ${hifdh} (${ctx}) من قبل الإدارة.\nالنتيجة الجديدة: *${label}*\n${can} الإطلاع على التفاصيل من تطبيق تحفيظ.`;
          notified.student = await sendWaha(stu.user_phone_number, txt);
        }
        if (row.teacher_id) {
          const { data: tch } = await supabaseAdmin.from("teachers")
            .select("phone_number, gender").eq("teacher_id", row.teacher_id).maybeSingle();
          if (tch?.phone_number) {
            const iFT = tch.gender === "female";
            const greet = iFT ? "عزيزتي المشرفة" : "عزيزي المشرف";
            const txt = `${greet}،\nتم تعديل نتيجة الطالب *${stu?.full_name ?? ""}* (${ctx}) من قبل الإدارة إلى: *${label}*`;
            notified.teacher = await sendWaha(tch.phone_number, txt);
          }
        }
      }

      return jsonResponse({ error: false, page_status: pageStatus, label: psLabel(pageStatus, false), notified });
    }

    // ── التحكم بالاختبار (تفعيل/إيقاف + تعيين مشرف) ────────────────
    if (action === "exam_control") {
      const saveId   = String(body?.save_id ?? "");
      const examType = String(body?.exam_type ?? "EXAM1"); // EXAM1 | EXAM2
      const enable   = body?.enable === true;
      const teacherId= body?.teacher_id ? String(body.teacher_id) : null;
      const notify   = body?.notify !== false;
      if (!saveId) return jsonResponse({ error: true, errors: "save_id مطلوب" }, 400);

      const isE2 = examType === "EXAM2";
      const patch: Record<string, any> = {};
      patch[isE2 ? "exam2" : "exam1"] = enable;
      if (teacherId) patch[isE2 ? "exam2_teacher_id" : "exam1_teacher_id"] = teacherId;

      const { data: save, error: sErr } = await supabaseAdmin.from("users_saves")
        .update(patch).eq("id", saveId).select("*").maybeSingle();
      if (sErr) return jsonResponse({ error: true, errors: sErr.message }, 400);

      let notified = { student: false, teacher: false };
      if (notify && enable && save) {
        const examLabel = isE2 ? "الاختبار التراكمي" : "الاختبار الجزئي";
        const { data: stu } = await supabaseAdmin.from("users")
          .select("full_name, gender, user_phone_number").eq("user_id", save.user_id).maybeSingle();
        const isFU = stu?.gender === "female";
        if (stu?.user_phone_number) {
          const txt = `تم تفعيل *${examLabel}* لحفظتك (*${save.name ?? ""}*) من قبل الإدارة.\nسيتم إعلامك بموعده قريباً.`;
          notified.student = await sendWaha(stu.user_phone_number, txt);
        }
        if (teacherId) {
          const { data: tch } = await supabaseAdmin.from("teachers")
            .select("phone_number, gender").eq("teacher_id", teacherId).maybeSingle();
          if (tch?.phone_number) {
            const iFT = tch.gender === "female";
            const assigned = iFT ? "تم تكليفكِ" : "تم تكليفكَ";
            const txt = `${assigned} بإجراء *${examLabel}* للطالب *${stu?.full_name ?? ""}* (حفظة: ${save.name ?? ""}).`;
            notified.teacher = await sendWaha(tch.phone_number, txt);
          }
        }
      }

      return jsonResponse({ error: false, notified });
    }

    return jsonResponse({ error: true, errors: "إجراء غير معروف" }, 400);
  } catch (e) {
    return jsonResponse({ error: true, errors: String(e) }, 500);
  }
});
