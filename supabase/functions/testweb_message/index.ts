import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")              ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
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

// 0xxxxxxxxx → 964xxxxxxxxx (صيغة واتساب)
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
  } catch (err) {
    console.error(`[WAHA] → ${num}:`, err);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: true, errors: "الطريقة غير مسموح بها" }, 405);
  }

  try {
    const body = await req.json().catch(() => ({}));
    const target = String(body?.target ?? "");
    const msg    = String(body?.msg ?? "").trim();
    const ids    = Array.isArray(body?.ids) ? body.ids.map(String) : [];
    const phone  = String(body?.phone ?? "");

    if (!msg)    return jsonResponse({ error: true, errors: "نص الرسالة مطلوب" }, 400);
    if (!target) return jsonResponse({ error: true, errors: "نوع المستهدف مطلوب" }, 400);

    // قائمة المستلمين: [{ phone, name }]
    let recipients: { phone: string; name: string }[] = [];

    if (target === "phone") {
      if (!phone) return jsonResponse({ error: true, errors: "رقم الهاتف مطلوب" }, 400);
      recipients = [{ phone, name: phone }];
    } else if (target === "all_students" || target === "students") {
      let q = supabaseAdmin.from("users").select("user_id, full_name, user_phone_number");
      if (target === "students") {
        if (!ids.length) return jsonResponse({ error: true, errors: "لم يتم تحديد طلاب" }, 400);
        q = q.in("user_id", ids);
      }
      const { data, error } = await q;
      if (error) return jsonResponse({ error: true, errors: error.message }, 400);
      recipients = (data ?? []).map((u: any) => ({ phone: u.user_phone_number ?? "", name: u.full_name ?? "" }));
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

    let sent = 0, failed = 0;
    const failedList: string[] = [];
    for (const r of recipients) {
      const ok = await sendWaha(r.phone, msg);
      if (ok) sent++;
      else { failed++; failedList.push(r.name || r.phone); }
    }

    return jsonResponse({
      error: false,
      total: recipients.length,
      sent,
      failed,
      failed_names: failedList.slice(0, 50),
    });
  } catch (e) {
    return jsonResponse({ error: true, errors: String(e) }, 500);
  }
});
