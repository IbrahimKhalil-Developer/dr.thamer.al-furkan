import {
  supabaseAdmin, requireAdmin, SYSTEM_KEY, jsonResponse, preflight, toLocalPhone,
} from "../_shared/guard.ts";

/* SHA-256 متزامن (أسرع بكثير من 90 ألف نداء غير متزامن لـ crypto.subtle) */
const K = new Uint32Array([
  0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
  0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
  0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
  0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
  0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
  0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
  0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
  0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
]);
function rotr(n: number, x: number) { return (x >>> n) | (x << (32 - n)); }

function sha256hex(msg: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < msg.length; i++) {
    const c = msg.charCodeAt(i);
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) { bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f)); }
    else { bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f)); }
  }
  const l = bytes.length;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const bl = l * 8;
  for (let i = 7; i >= 0; i--) bytes.push((bl / Math.pow(2, i * 8)) & 0xff);

  let h0=0x6a09e667,h1=0xbb67ae85,h2=0x3c6ef372,h3=0xa54ff53a,h4=0x510e527f,h5=0x9b05688c,h6=0x1f83d9ab,h7=0x5be0cd19;
  const w = new Uint32Array(64);
  for (let i = 0; i < bytes.length; i += 64) {
    for (let t = 0; t < 16; t++)
      w[t] = (bytes[i+t*4]<<24) | (bytes[i+t*4+1]<<16) | (bytes[i+t*4+2]<<8) | (bytes[i+t*4+3]);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(7,w[t-15]) ^ rotr(18,w[t-15]) ^ (w[t-15]>>>3);
      const s1 = rotr(17,w[t-2]) ^ rotr(19,w[t-2]) ^ (w[t-2]>>>10);
      w[t] = (w[t-16] + s0 + w[t-7] + s1) | 0;
    }
    let a=h0,b=h1,c=h2,d=h3,e=h4,f=h5,gg=h6,hh=h7;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(6,e) ^ rotr(11,e) ^ rotr(25,e);
      const ch = (e & f) ^ (~e & gg);
      const t1 = (hh + S1 + ch + K[t] + w[t]) | 0;
      const S0 = rotr(2,a) ^ rotr(13,a) ^ rotr(22,a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      hh=gg; gg=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0;
    }
    h0=(h0+a)|0; h1=(h1+b)|0; h2=(h2+c)|0; h3=(h3+d)|0; h4=(h4+e)|0; h5=(h5+f)|0; h6=(h6+gg)|0; h7=(h7+hh)|0;
  }
  const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, "0");
  return toHex(h0)+toHex(h1)+toHex(h2)+toHex(h3)+toHex(h4)+toHex(h5)+toHex(h6)+toHex(h7);
}

let RAINBOW: Map<string, string> | null = null;
function rainbow(): Map<string, string> {
  if (RAINBOW) return RAINBOW;
  const m = new Map<string, string>();
  for (let n = 10000; n <= 99999; n++) { const otp = String(n); m.set(sha256hex(otp + SYSTEM_KEY), otp); }
  RAINBOW = m;
  return m;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();

  const { admin, response } = await requireAdmin(req);
  if (response) return response;

  try {
    let limit = 50;
    let body: any = {};
    if (req.method === "POST") {
      body = await req.json().catch(() => ({}));
      if (body?.limit) limit = Math.min(200, Math.max(1, Number(body.limit)));
    }

    // بوابة كلمة المرور (عملية حساسة): التحقق قبل عرض رموز الدخول
    const submittedPw = typeof body?.admin_password === "string" ? body.admin_password : "";
    if (!submittedPw) {
      return jsonResponse({
        error: true,
        code: "PWNEEDED",
        errors: "يجب إدخال كلمة المرور لعرض رموز الدخول.",
      }, 401);
    }
    if (String(admin?.password ?? "") !== submittedPw) {
      return jsonResponse({
        error: true,
        code: "PWWRONG",
        errors: "كلمة المرور غير صحيحة.",
      }, 401);
    }

    const { data: otps, error } = await supabaseAdmin
      .from("otps").select("*").order("otp_date", { ascending: false }).limit(limit);
    if (error) return jsonResponse({ error: true, errors: error.message }, 400);

    const rows = otps ?? [];
    const phones = [...new Set(rows.map((r: any) => String(r.otp_phone_number ?? "")).filter(Boolean))];
    let nameByPhone = new Map<string, string>();
    if (phones.length) {
      const { data: us } = await supabaseAdmin.from("users")
        .select("full_name, user_phone_number, gender").in("user_phone_number", phones);
      nameByPhone = new Map((us ?? []).map((u: any) => [String(u.user_phone_number), u.full_name ?? ""]));
    }

    const table = rainbow();
    const now = Date.now();
    const out = rows.map((r: any) => {
      const code = table.get(String(r.otp_hash)) ?? null;
      const dateMs = r.otp_date ? new Date(r.otp_date).getTime() : null;
      const ageSec = dateMs ? Math.floor((now - dateMs) / 1000) : null;
      const expiresInSec = dateMs ? Math.max(0, 120 - Math.floor((now - dateMs) / 1000)) : 0;
      const isExpired = r.otp_expired === true || expiresInSec <= 0;
      return {
        otp_id: r.otp_id, code,
        phone: toLocalPhone(r.otp_phone_number ?? ""),
        student_name: nameByPhone.get(String(r.otp_phone_number)) ?? "—",
        user_ip: r.otp_user_ip ?? "—",
        verified: r.otp_verified === true, logined: r.otp_logined === true,
        expired: isExpired, allow_trying: r.otp_allow_trying ?? 0,
        age_seconds: ageSec, expires_in_sec: isExpired ? 0 : expiresInSec,
        otp_date: r.otp_date ?? null,
      };
    });

    return jsonResponse({ error: false, otps: out, total: out.length });
  } catch (e) {
    return jsonResponse({ error: true, errors: String(e) }, 500);
  }
});
