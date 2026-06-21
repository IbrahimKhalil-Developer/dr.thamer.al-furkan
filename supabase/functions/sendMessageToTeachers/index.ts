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

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: true, errors: "الطريقة غير مسموح بها" }, 405);
  }

  const { msg } = (await req.json().catch(() => ({}))) ?? {};

  if (!msg) {
    return jsonResponse({ error: true, errors: "المفتاح msg مطلوب" }, 400);
  }

  const { data: teachers, error: teachersErr } = await supabaseAdmin
    .from("teachers")
    .select("phone_number");

  if (teachersErr) {
    return jsonResponse({ error: true, errors: teachersErr.message }, 400);
  }

  let sent = 0;
  let failed = 0;

  for (const t of teachers ?? []) {
    const ok = await sendWahaMessage(t.phone_number, msg);
    if (ok) sent++; else failed++;
  }

  return jsonResponse({ error: false, total: (teachers ?? []).length, sent, failed });
});
