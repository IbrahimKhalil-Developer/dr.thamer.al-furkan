import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")              ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const SYSTEM_KEY                = Deno.env.get("system_key")                ?? "";

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function jsonResponse(payload: any, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// 077... → 96477...
function normalizePhone(p: string): string {
  const s = String(p ?? "").trim();
  if (s.startsWith("0")) return "964" + s.slice(1);
  return s;
}

function randomPassword(): string {
  const upper  = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower  = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "#$@&";
  const all = upper + lower + digits + symbols;

  const pick = (chars: string) => chars[Math.floor(Math.random() * chars.length)];

  const required = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  const rest = Array.from({ length: 6 }, () => pick(all));

  const passwordChars = [...required, ...rest];
  // shuffle
  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]];
  }
  return passwordChars.join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const {
      stu_name, stu_phone, teacher_phone, gender,
      save_name, save_start_page, save_end_page, every_day,
    } = body ?? {};

    // ── تجهيز الأرقام ──────────────────────────────────────────────
    const emailPhone   = "00" + normalizePhone(stu_phone);   // 0096477...
    const userPhone    = normalizePhone(stu_phone);          // 96477...
    const teacherPhone = normalizePhone(teacher_phone);       // 96477...

    const email = `${emailPhone}@thamer-project.com`;
    const basePassword = randomPassword();
    const authPassword = basePassword + SYSTEM_KEY;

    // ── إنشاء المستخدم في auth ────────────────────────────────────
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: authPassword,
      email_confirm: true,
    });

    if (authErr || !authData?.user?.id) {
      return jsonResponse({ error: true, errors: authErr?.message ?? "فشل إنشاء الحساب" }, 400);
    }

    const authId = authData.user.id;

    // ── جلب بيانات المشرف ─────────────────────────────────────────
    const { data: teacher, error: teacherErr } = await supabaseAdmin
      .from("teachers")
      .select("teacher_id, full_name")
      .eq("phone_number", teacherPhone)
      .maybeSingle();

    if (teacherErr || !teacher) {
      return jsonResponse({ error: true, errors: "لم يتم إيجاد المشرف برقم الهاتف المرسل" }, 404);
    }

    const nowIso = new Date().toISOString();

    // ── إضافة صف الحفظ users_saves ──────────────────────────────
    const { data: saveRow, error: saveErr } = await supabaseAdmin
      .from("users_saves")
      .insert({
        user_id        : authId,
        teacher_id     : teacher.teacher_id,
        name           : save_name,
        number         : 1,
        start_page     : save_start_page,
        end_page       : save_end_page,
        page_current   : save_start_page,
        every_day_page : every_day,
        created_at     : nowIso,
        finished_at    : null,
        status         : "ACTIVE",
        exam1          : false,
        exam2          : false,
        teacher_name   : teacher.full_name,
        started_at     : nowIso,
        db_created_at  : nowIso,
      })
      .select("id")
      .single();

    if (saveErr || !saveRow) {
      return jsonResponse({ error: true, errors: saveErr?.message ?? "فشل إضافة صف الحفظ" }, 400);
    }

    // ── إضافة صف الطالب users ──────────────────────────────────────
    const { error: userErr } = await supabaseAdmin
      .from("users")
      .insert({
        user_id                  : authId,
        full_name                : stu_name,
        user_phone_number        : userPhone,
        email                    : email,
        password                 : basePassword,
        teacher_id               : teacher.teacher_id,
        gender                   : gender,
        added_admin_phone_number : "Ibrahim Khalil",
        edited_admin_phone_number: "Ibrahim Khalil",
        save_id                  : saveRow.id,
      });

    if (userErr) {
      return jsonResponse({ error: true, errors: userErr.message }, 400);
    }

    return jsonResponse({ error: false, user_id: authId, save_id: saveRow.id });
  } catch (e) {
    return jsonResponse({ error: true, errors: String(e) }, 500);
  }
});
