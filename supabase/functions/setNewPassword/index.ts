import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")              ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SYSTEM_KEY                = Deno.env.get("system_key")                ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function jsonResponse(payload: any, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: true, errors: "الطريقة غير مسموح بها" }, 405);
  }

  const { id, password } = (await req.json().catch(() => ({}))) ?? {};

  if (!id || !password) {
    return jsonResponse({ error: true, errors: "المفتاحان id و password مطلوبان" }, 400);
  }

  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(id, {
    password: password + SYSTEM_KEY,
  });

  if (updateErr) {
    return jsonResponse({ error: true, errors: updateErr.message }, 400);
  }

  return jsonResponse({ error: false });
});
