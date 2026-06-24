import {
  supabaseAdmin, requireAdmin, jsonResponse, preflight, sendWaha, wrapMsg, writeLog,
} from "../_shared/guard.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return jsonResponse({ error: true, errors: "الطريقة غير مسموح بها" }, 405);

  const { admin, response } = await requireAdmin(req);
  if (response) return response;

  try {
    const body = await req.json().catch(() => ({}));
    const target = String(body?.target ?? "");
    const rawMsg = String(body?.msg ?? "").trim();
    const ids    = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    const phone  = String(body?.phone ?? "");
    const alsoFather = body?.also_father === true;

    if (!rawMsg)  return jsonResponse({ error: true, errors: "نص الرسالة مطلوب" }, 400);
    if (!target)  return jsonResponse({ error: true, errors: "نوع المستهدف مطلوب" }, 400);

    const msg = wrapMsg(admin!, rawMsg);

    // المستلمون: [{ phone, name, father }]
    let recipients: { phone: string; name: string; father?: string }[] = [];

    if (target === "phone") {
      if (!phone) return jsonResponse({ error: true, errors: "رقم الهاتف مطلوب" }, 400);
      recipients = [{ phone, name: phone }];
    } else if (target === "all_students" || target === "students") {
      let q = supabaseAdmin.from("users").select("user_id, full_name, user_phone_number, father_phone_number");
      if (target === "students") {
        if (!ids.length) return jsonResponse({ error: true, errors: "لم يتم تحديد طلاب" }, 400);
        q = q.in("user_id", ids);
      }
      const { data, error } = await q;
      if (error) return jsonResponse({ error: true, errors: error.message }, 400);
      recipients = (data ?? []).map((u: any) => ({ phone: u.user_phone_number ?? "", name: u.full_name ?? "", father: u.father_phone_number ?? "" }));
    } else if (target === "all_teachers" || target === "teachers") {
      let q = supabaseAdmin.from("teachers").select("teacher_id, full_name, phone_number");
      if (target === "teachers") {
        if (!ids.length) return jsonResponse({ error: true, errors: "لم يتم تحديد مشرفين" }, 400);
        q = q.in("teacher_id", ids);
      }
      const { data, error } = await q;
      if (error) return jsonResponse({ error: true, errors: error.message }, 400);
      recipients = (data ?? []).map((t: any) => ({ phone: t.phone_number ?? "", name: t.full_name ?? "" }));
    } else {
      return jsonResponse({ error: true, errors: "نوع مستهدف غير معروف" }, 400);
    }

    recipients = recipients.filter((r) => r.phone);
    if (!recipients.length) return jsonResponse({ error: true, errors: "لا يوجد مستلمون" }, 400);

    let sent = 0, failed = 0, fatherSent = 0;
    const sentList: string[] = [];
    const failedList: string[] = [];
    for (const r of recipients) {
      const ok = await sendWaha(r.phone, msg);
      if (ok) { sent++; sentList.push(r.name || r.phone); } else { failed++; failedList.push(r.name || r.phone); }
      if (alsoFather && r.father) { if (await sendWaha(r.father, msg)) fatherSent++; }
    }

    const scope = target === "phone" ? `رقم ${phone}`
      : target.includes("student") ? `${recipients.length} طالب${alsoFather ? " + أولياء الأمور" : ""}`
      : `${recipients.length} مشرف`;
    const sentNames = sentList.length ? sentList.join("، ") : "لا يوجد";
    const failedNames = failedList.length ? failedList.join("، ") : "لا يوجد";
    await writeLog(admin!, `أرسل رسالة واتساب إلى ${scope}.\nنص الرسالة: "${rawMsg}"\nالمستلمون الناجحون (${sent}): ${sentNames}.\nالمستلمون الفاشلون (${failed}): ${failedNames}.`);

    return jsonResponse({ error: false, total: recipients.length, sent, failed, father_sent: fatherSent, failed_names: failedList.slice(0, 50) });
  } catch (e) {
    return jsonResponse({ error: true, errors: String(e) }, 500);
  }
});
