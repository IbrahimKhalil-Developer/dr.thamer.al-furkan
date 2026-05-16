import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// دالة مساعدة لعمل هاش SHA-256 للنص
async function hashOtp(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input + "IbrahimKhalil@Thamer@Hash.2026");
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: true, errors: 'الطريقة غير مسموح بها' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 405,
    });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: true, errors: 'بيانات غير صالحة' }), { status: 400 });
  }

  const { otp, otp_id } = body;

  const { data: otpRecord, error: otpError } = await supabaseAdmin
    .from('otps')
    .select('*')
    .eq('otp_id', otp_id)
    .single();

  if (otpError || !otpRecord) {
    return new Response(JSON.stringify({ error: true, errors: 'الرمز غير موجود' }), { status: 404 });
  }

  const now = new Date();

  // ── 1. التحقق من الاستخدام المسبق ───────────────────────────────
  if (otpRecord.otp_logined === true) {
    await supabaseAdmin
      .from('otps')
      .update({ otp_expired: true })
      .eq('otp_id', otp_id);
    return new Response(JSON.stringify({ error: true, errors: 'انتهت صلاحية رمز التحقق.' }), { status: 410 });
  }

  // ── 2. التحقق من انتهاء الصلاحية ────────────────────────────────
  if (otpRecord.otp_expired === true) {
    return new Response(JSON.stringify({ error: true, errors: 'انتهت صلاحية رمز التحقق.' }), { status: 410 });
  }

  // ── 3. التحقق من الوقت عبر otp_date ─────────────────────────────
  const otpDate     = new Date(otpRecord.otp_date);
  const diffMinutes = (now.getTime() - otpDate.getTime()) / 1000 / 60;

  if (diffMinutes > 2) {
    await supabaseAdmin
      .from('otps')
      .update({ otp_expired: true })
      .eq('otp_id', otp_id);

    return new Response(JSON.stringify({ error: true, errors: 'انتهت صلاحية رمز التحقق.' }), { status: 410 });
  }

  // ── 4. التحقق من صحة الرمز (مقارنة الهاش) ───────────────────────
  const otpHashInput = await hashOtp(otp);
  if (otpHashInput !== otpRecord.otp_hash) {

    const currentTries = otpRecord.otp_allow_trying ?? 0;

    if (currentTries <= 0) {
      await supabaseAdmin
        .from('otps')
        .update({ otp_expired: true })
        .eq('otp_id', otp_id);

      return new Response(JSON.stringify({
        error: true,
        errors: 'انتهت صلاحية رمز التحقق.',
      }), { status: 410 });
    }

    const remainingAfter = currentTries - 1;

    if (remainingAfter <= 0) {
      await supabaseAdmin
        .from('otps')
        .update({ otp_allow_trying: remainingAfter, otp_expired: true })
        .eq('otp_id', otp_id);

      return new Response(JSON.stringify({
        error: true,
        errors: 'رمز التحقق غير صحيح. لقد استنفدت جميع المحاولات المتاحة.',
      }), { status: 400 });
    }

    await supabaseAdmin
      .from('otps')
      .update({ otp_allow_trying: remainingAfter })
      .eq('otp_id', otp_id);

    let attemptsMsg: string;
    if (remainingAfter === 1) {
      attemptsMsg = 'تبقّت لك محاولة واحدة فقط.';
    } else if (remainingAfter === 2) {
      attemptsMsg = 'تبقّت لك محاولتان.';
    } else {
      attemptsMsg = `تبقّت لك ${remainingAfter} محاولات.`;
    }

    return new Response(JSON.stringify({
      error: true,
      errors: `رمز التحقق غير صحيح. ${attemptsMsg}`,
    }), { status: 400 });
  }

  // ── 5. الرمز صحيح — تحديث OTP ───────────────────────────────────
  await supabaseAdmin
    .from('otps')
    .update({ otp_verified: true, otp_expired: true, otp_logined: true })
    .eq('otp_id', otp_id);

  // ── 6. جلب بيانات المستخدم ───────────────────────────────────────
  const { data: userAuthData, error: userAuthError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('user_phone_number', otpRecord.otp_phone_number)
    .single();

  if (userAuthError || !userAuthData) {
    return new Response(JSON.stringify({ error: true, errors: 'المستخدم غير موجود' }), { status: 404 });
  }

  // ── 7. تسجيل الدخول ──────────────────────────────────────────────
  const { data: authSession, error: authError } = await supabaseAuth.auth.signInWithPassword({
    email: userAuthData.email,
    password: userAuthData.password,
  });

  if (authError || !authSession.session) {
    return new Response(JSON.stringify({ error: true, errors: 'فشل المصادقة' }), { status: 401 });
  }

  // ── 8. استخراج الـ IP من الطلب ───────────────────────────────────
  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  // ── 9. تحديث بيانات المستخدم ─────────────────────────────────────
  const updateFields: any = {};

  if (!userAuthData.joined) {
    updateFields.joined      = true;
    updateFields.joined_in   = now.toISOString();
    updateFields.joined_ip   = clientIp;
  } else {
    updateFields.last_logined_in = now.toISOString();
    updateFields.logined_ip      = clientIp;
  }

  await supabaseAdmin.from('users').update(updateFields).eq('user_id', userAuthData.user_id);

  // ── 10. تجهيز الرد ────────────────────────────────────────────────
  const responsePayload: any = {
    error: false,
    account: {
      access_token:  authSession.session.access_token,
      refresh_token: authSession.session.refresh_token,
    },
    user: {}
  };

  if (userAuthData.profile_incomplete) {
    responsePayload.user = {
      profile_incomplete: true,
      gender: userAuthData.gender
    };
  } else {
    const fullUserData = { ...userAuthData, ...updateFields };
    const keysToRemove = [
      'email', 'password', 'last_logined_in', 'last_opened_in',
      'joined', 'joined_in', 'user_location', 'auto_user_location',
      'user_phone_number', 'father_phone_number', 'user_id',
      'teacher_id', 'created_at', 'date_of_brith', 'joined_ip', 'logined_ip', 'opened_ip', 'photo_url'
    ];
    keysToRemove.forEach(key => delete fullUserData[key]);

    // ── توليد رابط مؤقت للصورة الشخصية (60 ثانية) ──────────────────
    let tempPhotoUrl: string | null = null;
    if (userAuthData.photo_url) {
      const bucket = userAuthData.gender === "female"
        ? "female_profiles_pictures"
        : "male_profiles_pictures";

      const { data: signedData, error: signedError } = await supabaseAdmin
        .storage
        .from(bucket)
        .createSignedUrl(userAuthData.photo_url, 60); // 60 ثانية فقط

      if (!signedError && signedData?.signedUrl) {
        tempPhotoUrl = signedData.signedUrl;
      }
    }

    responsePayload.user = {
      ...fullUserData,
      temp_photo_url: tempPhotoUrl,
    };

    const { data: userPages } = await supabaseAdmin
      .from('users_pages')
      .select('*')
      .eq('user_id', userAuthData.user_id);

    if (userPages && userPages.length > 0) {
      responsePayload.pages = {};
      userPages.forEach((p: any) => {
        const { user_id, teacher_id, created_at, ...filteredPage } = p;
        if (p?.id) responsePayload.pages[p.id] = filteredPage;
      });
    }

    const { data: userTests } = await supabaseAdmin
      .from('users_tests')
      .select('*')
      .eq('user_id', userAuthData.user_id);

    if (userTests && userTests.length > 0) {
      responsePayload.tests = {};
      userTests.forEach((t: any) => {
        const { user_id, teacher_id, created_at, ...filteredTest } = t;
        if (t?.id) responsePayload.tests[t.id] = filteredTest;
      });
    }
  }

  return new Response(JSON.stringify(responsePayload), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
});