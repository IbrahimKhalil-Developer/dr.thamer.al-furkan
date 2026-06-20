import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")              ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const WAHA_URL                  = Deno.env.get("waha_url")                  ?? "";
const WAHA_API_KEY              = Deno.env.get("waha_api_key")              ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function jsonResponse(payload: any, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// 964xxxxxxxxx → 0xxxxxxxxx
function toLocalPhone(p: string): string {
  const s = String(p ?? "").trim();
  if (s.startsWith("964")) return "0" + s.slice(3);
  return s;
}

async function sendWahaMessage(phone: string, text: string): Promise<boolean> {
  if (!phone || !WAHA_URL || !WAHA_API_KEY) return false;
  try {
    const res = await fetch(WAHA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": WAHA_API_KEY },
      body: JSON.stringify({ chatId: `${phone}@c.us`, text, session: "default" }),
    });
    return res.ok;
  } catch (err) {
    console.error(`[WAHA] → ${phone}:`, err);
    return false;
  }
}

function buildMessage(fullName: string, localPhone: string, password: string): string {
  return [
    `📖 *مشروع التحفيظ المُتقِن*`, ``,
    `👤 المشرف: *${fullName}*`, ``,
    `السلام عليكم ورحمة الله وبركاته`, ``,
    `معلومات تسجيل الدخول:`,
    `📱 رقم الهاتف: *${localPhone}*`,
    `🔑 كلمة السر: *${password}*`, ``,
    `تُستخدم هذه المعلومات لتسجيل الدخول إلى تطبيق "تحفيظ" الخاص بمركز الشيخ الدكتور *عمر الصميدعي* (رحمه الله).`, ``,
    `ملاحظة: هذه رسالة تلقائية ولا يمكن الرد عليها، وستُرسل النسخة الخاصة بالمشرفين إلى جميع المشرفين من قبل الشيخ الدكتور *ثامر الصميدعي*.`,
  ].join("\n");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: true, errors: "الطريقة غير مسموح بها" }, 405);
  }

  const { data: teachers, error: teachersErr } = await supabaseAdmin
    .from("teachers")
    .select("full_name, phone_number, password");

  if (teachersErr) {
    return jsonResponse({ error: true, errors: teachersErr.message }, 400);
  }

  let sent = 0;
  let failed = 0;

  for (const t of teachers ?? []) {
    const localPhone = toLocalPhone(t.phone_number);
    const message     = buildMessage(t.full_name ?? "", localPhone, t.password ?? "");
    const ok = await sendWahaMessage(t.phone_number, message);
    if (ok) sent++; else failed++;
  }

  return jsonResponse({ error: false, total: (teachers ?? []).length, sent, failed });
});
