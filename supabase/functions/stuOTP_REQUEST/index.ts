import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.40.0';

interface RequestBody {
  phone_number: string;
}

Deno.serve(async (req) => {
  // 1. التحقق من طريقة الطلب
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({
      error: true,
      errors: 'طريقة الطلب غير مسموح بها'
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 405,
    });
  }

  // 2. إعداد المتغيرات والعملاء
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const wahaUrl = Deno.env.get('waha_url') ?? '';
  const wahaApiKey = Deno.env.get('waha_api_key') ?? '';
  const systemKey = Deno.env.get('system_key') ?? ''; // ← من Supabase Secrets

  const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
    global: { headers: { 'x-my-custom-header': 'generate-otp' } }
  });

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({
      error: true,
      errors: 'بيانات الطلب غير صالحة'
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    });
  }

  const { phone_number } = body;
  if (!phone_number) {
    return new Response(JSON.stringify({
      error: true,
      errors: 'يرجى إدخال رقم الهاتف'
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400,
    });
  }

  // الحصول على IP المستخدم للحماية
  const xForwardedFor = req.headers.get('x-forwarded-for');
  const clientIp = xForwardedFor ? xForwardedFor.split(',')[0].trim() : (req.headers.get('x-real-ip') || 'unknown');

  // 3. جلب بيانات المستخدم
  const { data: userData, error: userError } = await supabaseClient
    .from('users')
    .select('user_id, logined_ip, joined_ip, opened_ip')
    .eq('user_phone_number', phone_number)
    .single();

  if (userError || !userData) {
    return new Response(JSON.stringify({
      error: true,
      errors: 'رقم الهاتف غير مسجل لدينا'
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 404,
    });
  }

  const userId = userData.user_id;
  const userLoginedIp = userData.logined_ip ?? null;
  const userJoinedIp = userData.joined_ip ?? null;
  const userOpenedIp = userData.opened_ip ?? null;

  // 4. إعداد ثوابت الوقت والحدود
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  // 5. تحديد ما إذا كان الـ IP الحالي يطابق أيٍّ من مفاتيح المستخدم الثلاثة
  const ipMatchesUserKey = (
    (userLoginedIp && userLoginedIp === clientIp) ||
    (userJoinedIp && userJoinedIp === clientIp) ||
    (userOpenedIp && userOpenedIp === clientIp)
  );

  // 6. حدود العدّ حسب الحالة
  const ipLimit = ipMatchesUserKey ? 8 : 5;
  const userLimitForNonVerified = 3;
  const dailyVerifiedLimit = 10;

  // 7. حساب عدد سجلات otp_verified = true اليومي لكل حساب
  const { data: verifiedUserToday } = await supabaseClient
    .from('otps')
    .select('otp_id')
    .eq('otp_user_id', userId)
    .eq('otp_verified', true)
    .gte('otp_date', todayStart);

  if (verifiedUserToday && verifiedUserToday.length >= dailyVerifiedLimit) {
    return new Response(JSON.stringify({
      error: true,
      errors: `تجاوزت الحد اليومي المسموح به لإرسال رموز التحقق لهذا الحساب (${dailyVerifiedLimit})`
    }), { headers: { 'Content-Type': 'application/json' }, status: 429 });
  }

  // 8. حساب عدد سجلات otp_verified = true اليومي لنفس الـ IP
  const { data: verifiedIpToday } = await supabaseClient
    .from('otps')
    .select('otp_id')
    .eq('otp_user_ip', clientIp)
    .eq('otp_verified', true)
    .gte('otp_date', todayStart);

  if (verifiedIpToday && verifiedIpToday.length >= dailyVerifiedLimit) {
    return new Response(JSON.stringify({
      error: true,
      errors: `تجاوزت الحد اليومي المسموح به لإرسال رموز التحقق لهذا الجهاز (${dailyVerifiedLimit})`
    }), { headers: { 'Content-Type': 'application/json' }, status: 429 });
  }

  // 9. حساب محاولات الـ IP خلال 24 ساعة
  const { data: ipOtpAttempts } = await supabaseClient
    .from('otps')
    .select('otp_id')
    .eq('otp_user_ip', clientIp)
    .eq('otp_verified', false)
    .gte('otp_date', twentyFourHoursAgo);

  if (ipOtpAttempts && ipOtpAttempts.length >= ipLimit) {
    return new Response(JSON.stringify({
      error: true,
      errors: `لقد تجاوزت الحد المسموح به من المحاولات لهذا الجهاز خلال اليوم (${ipLimit})`
    }), { headers: { 'Content-Type': 'application/json' }, status: 429 });
  }

  // 10. حساب محاولات الحساب خلال 24 ساعة
  let excludedByUserIp = false;
  if (ipMatchesUserKey) {
    excludedByUserIp = true;
  } else {
    const { data: userOtpAttempts } = await supabaseClient
      .from('otps')
      .select('otp_id')
      .eq('otp_user_id', userId)
      .eq('otp_verified', false)
      .eq('excluded_by_user_ip', false)
      .gte('otp_date', twentyFourHoursAgo);

    if (userOtpAttempts && userOtpAttempts.length >= userLimitForNonVerified) {
      return new Response(JSON.stringify({
        error: true,
        errors: `لقد تجاوزت الحد المسموح به من المحاولات لهذا الحساب خلال اليوم (${userLimitForNonVerified})`
      }), { headers: { 'Content-Type': 'application/json' }, status: 429 });
    }
  }

  // 11. التحقق من آخر OTP لتطبيق مهلة الزمن
  const { data: lastOtpData } = await supabaseClient
    .from('otps')
    .select('otp_date')
    .eq('otp_user_id', userId)
    .order('otp_date', { ascending: false })
    .limit(1);

  if (lastOtpData && lastOtpData.length > 0) {
    const lastOtp = lastOtpData[0];
    const otpDate = new Date(lastOtp.otp_date);
    const diffMinutes = (now.getTime() - otpDate.getTime()) / 1000 / 60;

    const waitMinutes = ipMatchesUserKey ? 2 : 3;
    const waitText = ipMatchesUserKey ? 'دقيقتان' : 'ثلاث دقائق';

    if (diffMinutes < waitMinutes) {
      return new Response(JSON.stringify({
        error: true,
        errors: `يرجى الانتظار ${waitText} قبل طلب رمز جديد`
      }), { headers: { 'Content-Type': 'application/json' }, status: 429 });
    }
  }

  // 12. توليد رمز OTP من 5 أرقام
  const otp = Math.floor(10000 + Math.random() * 90000).toString();

  // 13. عمل hash للـ OTP باستخدام system_key من Secrets
  const encoder = new TextEncoder();
  const hashInput = encoder.encode(otp + systemKey); // ← system_key بدل salt ثابت
  const hashBuffer = await crypto.subtle.digest("SHA-256", hashInput);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const otpHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // 14. إدراج السجل في جدول otps
  const { data: newOtpData, error: newOtpError } = await supabaseClient
    .from('otps')
    .insert({
      otp_hash: otpHash,
      otp_phone_number: phone_number,
      otp_user_id: userId,
      otp_user_ip: clientIp,
      otp_verified: false,
      otp_allow_trying: 3,
      otp_logined: false,
      otp_expired: false,
      otp_date: now.toISOString(),
      excluded_by_user_ip: excludedByUserIp
    })
    .select('otp_id')
    .single();

  if (newOtpError || !newOtpData) {
    return new Response(JSON.stringify({
      error: true,
      errors: 'حدث خطأ أثناء إنشاء رمز التحقق، يرجى المحاولة لاحقًا'
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    });
  }

  // 15. إرسال الرسالة عبر WAHA
  const wahaText = `*${otp}* هو رمز التحقق الخاص بك. لأسباب أمنية، لا تشارك هذا الرمز مع أحد.`;
  await sendWahaMessage(wahaUrl, wahaApiKey, phone_number, wahaText);

  // 16. استجابة النجاح
  return new Response(JSON.stringify({
    error: false,
    message: 'تم إرسال رمز التحقق بنجاح',
    otpId: newOtpData.otp_id,
    ex_by_ip: excludedByUserIp
  }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
});

// دالة مساعدة لإرسال رسالة WAHA
async function sendWahaMessage(url: string, apiKey: string, phone: string, text: string) {
  try {
    await fetch(`${url}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey
      },
      body: JSON.stringify({
        chatId: `${phone}@c.us`,
        text: text,
        session: "default"
      })
    });
  } catch (err) {
    console.error("WAHA Delivery Error:", err);
  }
}
