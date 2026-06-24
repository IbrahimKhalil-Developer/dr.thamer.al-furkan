import {
  supabaseAdmin, requireAdmin, requireOwner, SYSTEM_KEY,
  jsonResponse, preflight, writeLog, toLocalPhone, normalizePhone,
  g, sendWaha, wrapMsg,
} from "../_shared/guard.ts";

function adminPublic(a: any, selfId: string) {
  return {
    id: a.id, name: a.name ?? "", type: a.type === "owner" ? "owner" : "admin",
    phone: toLocalPhone(a.phone_number ?? ""), active: a.active === true,
    gender: a.gender === "female" ? "female" : "male",
    is_self: String(a.id) === String(selfId),
    last_opened_in: a.last_opened_in ?? null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return jsonResponse({ error: true, errors: "الطريقة غير مسموح بها" }, 405);

  const { admin, response } = await requireAdmin(req);
  if (response) return response;
  const A = admin!;

  const ownerErr = requireOwner(A);
  if (ownerErr) return ownerErr;

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "list");

    if (action === "list") {
      const { data, error } = await supabaseAdmin.from("admins").select("*").order("name");
      if (error) return jsonResponse({ error: true, errors: error.message }, 400);
      return jsonResponse({ error: false, admins: (data ?? []).map((a: any) => adminPublic(a, A.id)) });
    }

    if (action === "add") {
      const f = body?.fields ?? {};
      const name = String(f.name ?? "").trim();
      const phone = String(f.phone ?? "").trim();
      const email = String(f.email ?? "").trim().toLowerCase();
      const password = String(f.password ?? "");
      const type = f.type === "owner" ? "owner" : "admin";
      const gender = f.gender === "female" ? "female" : "male";
      if (!name || !phone || !email || !password) return jsonResponse({ error: true, errors: "جميع الحقول مطلوبة" }, 400);

      // يوجد مسؤول إداري (owner) واحد فقط في كل النظام — يُمنع إضافة ثانٍ
      if (type === "owner") {
        const { count } = await supabaseAdmin.from("admins").select("id", { count: "exact", head: true }).eq("type", "owner");
        if ((count ?? 0) > 0) {
          return jsonResponse({ error: true, errors: "يوجد مسؤول إداري واحد فقط مسموح به في النظام، لا يمكن إضافة مسؤول إداري آخر." }, 403);
        }
      }

      const { data: row, error } = await supabaseAdmin.from("admins").insert({
        name, phone_number: normalizePhone(phone), email, password, type, gender, active: true,
      }).select("id").single();
      if (error) return jsonResponse({ error: true, errors: error.message }, 400);

      await writeLog(A, `أضاف حساب إداري جديد (${name}) بصلاحية ${type === "owner" ? "مسؤول إداري" : "إداري"}.`);
      return jsonResponse({ error: false, id: row.id });
    }

    if (action === "edit") {
      const id = String(body?.id ?? "");
      const f = body?.fields ?? {};
      if (!id) return jsonResponse({ error: true, errors: "id مطلوب" }, 400);
      if (String(id) === String(A.id)) return jsonResponse({ error: true, errors: "لا يمكنك تعديل حسابك الخاص من هنا" }, 400);

      const { data: target } = await supabaseAdmin.from("admins").select("name, email, type, gender").eq("id", id).maybeSingle();
      if (!target) return jsonResponse({ error: true, errors: "الحساب غير موجود" }, 404);

      // يوجد مسؤول إداري (owner) واحد فقط — يُمنع ترفيع أي حساب آخر إلى هذه الرتبة
      if (f.type === "owner" && target.type !== "owner") {
        const { count } = await supabaseAdmin.from("admins").select("id", { count: "exact", head: true }).eq("type", "owner");
        if ((count ?? 0) > 0) {
          return jsonResponse({ error: true, errors: "يوجد مسؤول إداري واحد فقط مسموح به في النظام، لا يمكن ترفيع حساب آخر لهذه الرتبة." }, 403);
        }
      }

      const patch: Record<string, any> = {};
      if (f.name != null) patch.name = String(f.name).trim();
      // رقم الهاتف لا يُعدّل أبداً — نتجاهل أي phone/phone_number وارد
      if (f.gender != null) patch.gender = f.gender === "female" ? "female" : "male";
      // لا يمكن تعديل صلاحية حساب بنفس رتبة "مسؤول إداري" (نظير في الرتبة) — يمنع الالتفاف على حماية toggle_active
      if (f.type != null && target.type !== "owner") patch.type = f.type === "owner" ? "owner" : "admin";
      if (f.password) patch.password = String(f.password);
      if (!Object.keys(patch).length) return jsonResponse({ error: true, errors: "لا توجد تعديلات" }, 400);

      const { error } = await supabaseAdmin.from("admins").update(patch).eq("id", id);
      if (error) return jsonResponse({ error: true, errors: error.message }, 400);

      if (f.password) {
        const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const hit = (list?.users ?? []).find((u: any) => (u.email ?? "").toLowerCase() === target.email.toLowerCase());
        if (hit) await supabaseAdmin.auth.admin.updateUserById(hit.id, { password: String(f.password) + SYSTEM_KEY });
      }

      // فرق دقيق (قديم → جديد) لكل حقل مُعدَّل، لسجل العمليات
      const diffs: string[] = [];
      if (patch.name != null && patch.name !== target.name) diffs.push(`الاسم: "${target.name ?? ""}" ← "${patch.name}"`);
      if (patch.gender != null && patch.gender !== target.gender) {
        diffs.push(`الجنس: ${target.gender === "female" ? "أنثى" : "ذكر"} ← ${patch.gender === "female" ? "أنثى" : "ذكر"}`);
      }
      if (patch.type != null && patch.type !== target.type) {
        const lbl = (t: string) => (t === "owner" ? "مسؤول إداري" : "إداري");
        diffs.push(`الصلاحية: ${lbl(target.type)} ← ${lbl(patch.type)}`);
      }
      if (f.password) diffs.push("تم تغيير كلمة المرور");

      await writeLog(A, `عدّل بيانات حساب إداري (${target.name ?? target.email}). التغييرات: ${diffs.length ? diffs.join("، ") : "لا تغييرات فعلية"}.`);
      return jsonResponse({ error: false });
    }

    if (action === "toggle_active") {
      const id = String(body?.id ?? "");
      if (!id) return jsonResponse({ error: true, errors: "id مطلوب" }, 400);
      if (String(id) === String(A.id)) return jsonResponse({ error: true, errors: "لا يمكنك إلغاء تفعيل حسابك الخاص" }, 400);

      const { data: target } = await supabaseAdmin.from("admins").select("*").eq("id", id).maybeSingle();
      if (!target) return jsonResponse({ error: true, errors: "الحساب غير موجود" }, 404);

      // لا يمكن إيقاف/تفعيل حساب بصلاحية مسؤول إداري (نظير في الرتبة)
      if (target.type === "owner") {
        return jsonResponse({ error: true, errors: "لا يمكن إيقاف أو تفعيل حساب بصلاحية مسؤول إداري." }, 403);
      }

      const newActive = target.active !== true;
      await supabaseAdmin.from("admins").update({ active: newActive }).eq("id", id);

      // إشعار واتساب — أفضل جهد، لا يفشل العملية
      const acc = g(target.gender, "حسابكَ", "حسابكِ");
      const msg = newActive
        ? `تمت إعادة تفعيل ${acc} في لوحة التحكم لقاعدة بيانات طلاب تحفيظ من قبل إدارة مركز مشروع التحفيظ.`
        : `تم إلغاء تفعيل ${acc} في لوحة التحكم لقاعدة بيانات طلاب تحفيظ من قبل إدارة مركز مشروع التحفيظ.`;
      try {
        await sendWaha(target.phone_number ?? "", wrapMsg(target, msg));
      } catch (_e) { /* تجاهل */ }

      await writeLog(A, `${newActive ? "أعاد تفعيل" : "ألغى تفعيل"} حساب إداري (${target.name}).`);
      return jsonResponse({ error: false, active: newActive });
    }

    return jsonResponse({ error: true, errors: "إجراء غير معروف" }, 400);
  } catch (e) {
    return jsonResponse({ error: true, errors: String(e) }, 500);
  }
});
