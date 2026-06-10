import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")              ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const VALID_TYPES = ["SEND_MESSAGE_TO_DR_THAMER", "APP_SUGGESTION", "APP_ERROR"] as const;

function errorResponse(msg: string, status: number): Response {
  return new Response(JSON.stringify({ error: true, errors: msg }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function successResponse(): Response {
  return new Response(JSON.stringify({ error: false, message: "تم إرسال طلبك بنجاح" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function buildRemainText(ms: number): string {
  const totalMins = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins  = totalMins % 60;
  let parts = "";
  if (hours > 0) parts += `${hours} ساعة `;
  if (mins  > 0) parts += `${mins} دقيقة`;
  return `يمكن إرسال طلب آخر بعد ${parts.trim()}`;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return errorResponse("الطريقة غير مسموح بها", 405);

  // ── 1. التحقق من التوكن ──────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return errorResponse("يجب إرسال رمز المصادقة", 401);

  const { data: authData, error: authError } = await supabaseAuth.auth.getUser(token);
  if (authError || !authData?.user) return errorResponse("رمز المصادقة غير صالح", 401);

  const userId = authData.user.id;

  // ── 2. قراءة الـ body ────────────────────────────────────────────
  let body: any;
  try { body = await req.json(); } catch {
    return errorResponse("بيانات غير صالحة", 400);
  }

  const { type, message } = body ?? {};

  // ── 3. التحقق من الحقول الأساسية ────────────────────────────────
  if (!type || !message) return errorResponse("يجب إرسال نوع الطلب والرسالة", 400);

  // ── 4. التحقق من type enum ───────────────────────────────────────
  if (!VALID_TYPES.includes(type)) return errorResponse("نوع الطلب غير صحيح", 400);

  // ── 5. التحقق من طول الرسالة ────────────────────────────────────
  if (String(message).trim().length < 15)
    return errorResponse("الرسالة قصيرة جداً (15 حرف على الأقل)", 400);

  // ── 6. التحقق من rate-limit (24 ساعة) ───────────────────────────
  const { data: lastReq } = await supabaseAdmin
    .from("users_requests")
    .select("created_at")
    .eq("send_user_id", userId)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastReq?.created_at) {
    const diffMs   = Date.now() - new Date(lastReq.created_at).getTime();
    const remainMs = 24 * 3600 * 1000 - diffMs;
    if (remainMs > 0) return errorResponse(buildRemainText(remainMs), 429);
  }

  // ── 7. جلب اسم المستخدم ─────────────────────────────────────────
  const { data: userRow } = await supabaseAdmin
    .from("users")
    .select("full_name")
    .eq("user_id", userId)
    .single();
  const sendName = userRow?.full_name ?? "";

  // ── 8. تحديد replayed_by_admin_name ─────────────────────────────
  const adminName = type === "SEND_MESSAGE_TO_DR_THAMER"
    ? "إدارة المركز."
    : "مطور التطبيق.";

  // ── 9. إدراج الصف ───────────────────────────────────────────────
  const { error: insertError } = await supabaseAdmin
    .from("users_requests")
    .insert({
      send_user_id          : userId,
      type                  : type,
      send_name             : sendName,
      send_message          : String(message).trim(),
      send_date             : new Date().toISOString(),
      replayed_status       : "APP_RECEIVED",
      replayed_by_admin_name: adminName,
    });

  if (insertError) {
    console.error("[stuSEND_REQUEST INSERT]:", insertError);
    return errorResponse("حدث خطأ أثناء إرسال الطلب، يرجى المحاولة لاحقاً", 500);
  }

  return successResponse();
});
