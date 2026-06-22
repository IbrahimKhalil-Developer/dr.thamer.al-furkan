import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")              ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SYSTEM_KEY                = Deno.env.get("system_key")                ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

function jsonResponse(payload: any, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function toLocalPhone(p: string): string {
  const s = String(p ?? "").trim();
  if (s.startsWith("964"))  return "0" + s.slice(3);
  if (s.startsWith("+964")) return "0" + s.slice(4);
  return s;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf  = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// جدول عكسي لكل الأرقام الممكنة (10000-99999) → الرمز الأصلي. يُبنى مرة واحدة لكل طلب.
let RAINBOW: Map<string, string> | null = null;
async function buildRainbow(): Promise<Map<string, string>> {
  if (RAINBOW) return RAINBOW;
  const map = new Map<string, string>();
  for (let n = 10000; n <= 99999; n++) {
    const otp = String(n);
    map.set(await sha256Hex(otp + SYSTEM_KEY), otp);
  }
  RAINBOW = map;
  return map;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    let limit = 40;
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body?.limit) limit = Math.min(200, Math.max(1, Number(body.limit)));
    } else {
      const q = new URL(req.url).searchParams.get("limit");
      if (q) limit = Math.min(200, Math.max(1, Number(q)));
    }

    const { data: otps, error } = await supabaseAdmin
      .from("otps")
      .select("*")
      .order("otp_date", { ascending: false })
      .limit(limit);

    if (error) return jsonResponse({ error: true, errors: error.message }, 400);

    const rows = otps ?? [];

    // اجمع أرقام الهواتف لربطها بالأسماء
    const phones = [...new Set(rows.map((r: any) => String(r.otp_phone_number ?? "")).filter(Boolean))];
    let nameByPhone = new Map<string, string>();
    if (phones.length) {
      const { data: us } = await supabaseAdmin
        .from("users").select("full_name, user_phone_number").in("user_phone_number", phones);
      nameByPhone = new Map((us ?? []).map((u: any) => [String(u.user_phone_number), u.full_name ?? ""]));
    }

    const rainbow = await buildRainbow();
    const now = Date.now();

    const out = rows.map((r: any) => {
      const code = rainbow.get(String(r.otp_hash)) ?? null;
      const dateMs = r.otp_date ? new Date(r.otp_date).getTime() : null;
      const ageSec = dateMs ? Math.floor((now - dateMs) / 1000) : null;
      // صلاحية الرمز دقيقتان من otp_date
      const expiresInSec = dateMs ? Math.max(0, 120 - Math.floor((now - dateMs) / 1000)) : 0;
      const isExpired = r.otp_expired === true || expiresInSec <= 0;
      return {
        otp_id:        r.otp_id,
        code,                                   // الرمز الأصلي بعد فك التشفير
        phone:         toLocalPhone(r.otp_phone_number ?? ""),
        student_name:  nameByPhone.get(String(r.otp_phone_number)) ?? "—",
        user_ip:       r.otp_user_ip ?? "—",
        verified:      r.otp_verified === true,
        logined:       r.otp_logined === true,
        expired:       isExpired,
        allow_trying:  r.otp_allow_trying ?? 0,
        age_seconds:   ageSec,
        expires_in_sec: isExpired ? 0 : expiresInSec,
        otp_date:      r.otp_date ?? null,
      };
    });

    return jsonResponse({ error: false, otps: out, total: out.length });
  } catch (e) {
    return jsonResponse({ error: true, errors: String(e) }, 500);
  }
});
