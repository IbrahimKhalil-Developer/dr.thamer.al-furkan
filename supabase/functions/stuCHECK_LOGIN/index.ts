import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function buildPageDisplay(page: number, edp: number): string {
  if (edp < 1) {
    const start = Math.floor(page);
    const fraction = page % 1;
    if (fraction === 0) return `${start}`;
    if (fraction === 0.25) return `الربع الأول من ص${start}`;
    if (fraction === 0.5) return `النصف الأول من ص${start}`;
    if (fraction === 0.75) return `الربع الثالث من ص${start}`;
    return `${page}`;
  } else {
    const end = Math.floor(page);
    const start = end - Math.ceil(edp) + 1;
    return start === end ? `${start}` : `${start} إلى ${end}`;
  }
}

function formatTimeBaghdad(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const baghdadDate = new Date(date.getTime() + (3 * 60 * 60 * 1000));
  let hours = baghdadDate.getUTCHours();
  const minutes = baghdadDate.getUTCMinutes();
  const ampm = hours >= 12 ? 'م' : 'ص';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const strMinutes = minutes < 10 ? '0' + minutes : minutes;
  return `${hours}:${strMinutes}${ampm}`;
}

function checkTimeEndedBaghdad(): string {
  const now = new Date();
  const baghdadDate = new Date(now.getTime() + (3 * 60 * 60 * 1000));
  const hours = baghdadDate.getUTCHours();
  const minutes = baghdadDate.getUTCMinutes();
  if (hours === 22 || (hours === 23 && minutes <= 45)) return "yes";
  return "no";
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return dateStr.split('T')[0];
}

function formatRequestDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr);
  const bd = new Date(date.getTime() + (3 * 60 * 60 * 1000));
  const month = bd.getUTCMonth() + 1;
  const day   = bd.getUTCDate();
  let h = bd.getUTCHours();
  const m = bd.getUTCMinutes();
  const ampm = h >= 12 ? 'م' : 'ص';
  h = h % 12 || 12;
  return `${month}/${day} ${h}:${m < 10 ? '0' + m : m}${ampm}`;
}

function deepNullToEmpty(val: any): any {
  if (val === null) return "";
  if (Array.isArray(val)) return val.map(deepNullToEmpty);
  if (typeof val === "object" && val !== undefined) {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(val)) result[k] = deepNullToEmpty(v);
    return result;
  }
  return val;
}

function jsonResponse(payload: any, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status, headers: { "Content-Type": "application/json" },
  });
}

function calcExamInfo(examDateStr: string | null, examType: "جزئي" | "تراكمي"): { exam_started: boolean; exam_time_text: string } {
  if (!examDateStr) return { exam_started: false, exam_time_text: "" };

  const now = new Date();
  const baghdadNow = new Date(now.getTime() + (3 * 60 * 60 * 1000));
  const todayStr = baghdadNow.toISOString().split('T')[0];

  const examDate = new Date(examDateStr);
  const baghdadExam = new Date(examDate.getTime() + (3 * 60 * 60 * 1000));
  const examStr = baghdadExam.toISOString().split('T')[0];

  const todayMs = new Date(todayStr).getTime();
  const examMs = new Date(examStr).getTime();
  const diffDays = Math.round((examMs - todayMs) / (1000 * 60 * 60 * 24));

  const label = examType === "جزئي" ? "الجزئي" : "التراكمي";

  if (diffDays <= 0) {
  return { exam_started: true, exam_time_text: "" };
} else if (diffDays === 1) {
  return { exam_started: false, exam_time_text: `يوم غد الإختبار ${label}` };
} else if (diffDays === 2) {
  return { exam_started: false, exam_time_text: `بعد غد يوم الإختبار ${label}` };
}
return { exam_started: false, exam_time_text: "" };
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

  // ── 0. فحص الإصدار (version) — أول خطوة قبل أي تحقق ──────────────
  const { version } = body;
  if (!version) {
    return jsonResponse({ error: true, errors: 'يجب إرسال إصدار التطبيق' }, 400);
  }

  const { data: updateRow, error: updateErr } = await supabaseAdmin
    .from('updates')
    .select('*')
    .eq('version_number', version)
    .maybeSingle();

  if (updateErr || !updateRow) {
    return jsonResponse({ error: true, errors: 'هذا الإصدار غير مدعوم، يرجى تحديث التطبيق' }, 426);
  }

  if (updateRow.update === true) {
    return jsonResponse({
      error: false,
      update: true,
      title:         updateRow.title         ?? "",
      message:       updateRow.message       ?? "",
      ok_button:     updateRow.ok_button     ?? "",
      cancel_button: updateRow.cancel_button ?? "",
      url:           updateRow.url           ?? "",
    }, 200);
  }

  const { access_token, refresh_token } = body;

  if (!access_token || !refresh_token) {
    return new Response(JSON.stringify({ error: true, errors: 'بيانات غير مكتملة' }), { status: 400 });
  }

  const clientIp =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  const now = new Date();

  // ── 1. التحقق من التوكن ──────────────────────────────────────────
  let userId: string | null = null;
  let finalAccessToken = access_token;
  let finalRefreshToken = refresh_token;

  const { data: userData, error: userError } = await supabaseAuth.auth.getUser(access_token);

  if (!userError && userData?.user) {
    userId = userData.user.id;
  } else {
    const { data: refreshData, error: refreshError } = await supabaseAuth.auth.refreshSession({ refresh_token });
    if (refreshError || !refreshData?.session) {
      return new Response(JSON.stringify({ error: true, errors: 'أنتهت الجلسة يرجى تسجيل الدخول مرة أخُرى' }), { status: 401 });
    }
    userId = refreshData.session.user.id;
    finalAccessToken = refreshData.session.access_token;
    finalRefreshToken = refreshData.session.refresh_token;
  }

  if (!userId) {
    return new Response(JSON.stringify({ error: true, errors: 'أنتهت الجلسة يرجى تسجيل الدخول مرة أخُرى' }), { status: 401 });
  }

  // ── 2. جلب بيانات المستخدم ──────────────────────────────────────
  const { data: userAuthData, error: userAuthError } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (userAuthError || !userAuthData) {
    return new Response(JSON.stringify({ error: true, errors: 'المستخدم غير موجود' }), { status: 404 });
  }

  await supabaseAdmin
    .from('users')
    .update({ last_opened_in: now.toISOString(), opened_ip: clientIp })
    .eq('user_id', userId);

  // ── 3. جلب البيانات ──────────────────────────────────────────────
  const { data: userSaves } = await supabaseAdmin
    .from('users_saves')
    .select('*')
    .eq('user_id', userId)
    .order('id', { ascending: true });

  const { data: userPagesRaw } = await supabaseAdmin
    .from('users_pages')
    .select('*')
    .eq('user_id', userId)
    .order('id', { ascending: true });

  const { data: userTestsRaw } = await supabaseAdmin
    .from('users_pages_tests')
    .select('*')
    .eq('user_id', userId)
    .order('id', { ascending: true });

  const { data: userRequestsRaw } = await supabaseAdmin
    .from('users_requests')
    .select('*')
    .eq('send_user_id', userId)
    .order('id', { ascending: true });

  // ── 4. معالجة البيانات ───────────────────────────────────────────
  const processedPages = (userPagesRaw || []).map(p => {
    const { teacher_photo, is_45min_requested, ...rest } = p;
    const save = (userSaves || []).find(s => s.id === p.save_id);
    const edp = save ? (Number(save.every_day_page) || 1) : 1;
    return {
      ...rest,
      page: buildPageDisplay(p.page, edp),
      ready_at: formatTimeBaghdad(p.ready_at),
      finished_at: formatTimeBaghdad(p.finished_at),
      created_at: formatDate(p.created_at),
      date: formatDate(p.date)
    };
  });

  const processedTests = (userTestsRaw || []).map(t => {
    const { teacher_photo, is_45min_requested, ...rest } = t;
    return {
      ...rest,
      ready_at: formatTimeBaghdad(t.ready_at),
      finished_at: formatTimeBaghdad(t.finished_at),
      created_at: formatDate(t.created_at),
      date: formatDate(t.date)
    };
  });

  const processedRequests = (userRequestsRaw || []).map(r => ({
    ...r,
    send_date    : formatRequestDate(r.send_date),
    replayed_date: formatRequestDate(r.replayed_date),
  }));

  // ── 5. information ───────────────────────────────────────────────
  let infoStatus = "";
  let infoSaveText = "";
  let infoExamStatus = "";
  let allPagesSavedNumber = 0;
  let progressNumber: any = 0;
  let infoStartPage = 0;
  let lastSaveReadyAt = "";
  let lastSaveFinishedAt = "";
  let lastSaveTeacherName = "";
  let examStarted = false;
  let examTimeText = "";

  const currentSaveId = userAuthData.save_id;
  const currentSave = (userSaves || []).find(s => s.id === currentSaveId)
    || (userSaves && userSaves.length > 0 ? userSaves[userSaves.length - 1] : null);

  if (currentSave) {
    const status = currentSave.status;
    infoStartPage = Number(currentSave.start_page) || 0;

    // حساب التقدم
    const lastFinishedPageRow = (userPagesRaw || [])
      .filter(p =>
        p.save_id === currentSave.id &&
        p.status === "finished" &&
        p.page_status !== "reject"
      )
      .sort((a, b) => b.id - a.id)[0];

    if (lastFinishedPageRow) {
      allPagesSavedNumber = Number(lastFinishedPageRow.page);
      const startPageVal = Number(currentSave.start_page);
      const endPageVal = Number(currentSave.end_page);
      const total = (endPageVal - startPageVal) + 1;
      const saved = (allPagesSavedNumber - startPageVal) + 1;
      if (total > 0) {
        const rawProgress = (saved / total) * 100;
        progressNumber = parseFloat(Math.max(0, Math.min(100, rawProgress)).toFixed(2));
      }
    }

    let lastRowForInfo = null;

    if (status === "ACTIVE") {
      infoStatus = status;
      lastRowForInfo = (userPagesRaw || [])
        .filter(p => p.save_id === currentSave.id)
        .sort((a, b) => b.id - a.id)[0];

      if (lastRowForInfo) {
        infoStatus = lastRowForInfo.status;
        const edp = Number(currentSave.every_day_page) || 1;
        infoSaveText = buildPageDisplay(lastRowForInfo.page, edp);
      }

    } else if (status === "IN_EXAM1") {
      infoStatus = status;

      // ── آخر صف لـ EXAM1 ← تصحيح الخطأ ──
      lastRowForInfo = (userTestsRaw || [])
        .filter(t => t.save_id === currentSave.id && t.type === "EXAM1")
        .sort((a, b) => b.id - a.id)[0];

      if (lastRowForInfo) {
        infoExamStatus = lastRowForInfo.status;
      }

      // ── exam_started و exam_time_text من exam1_date ──
      const examInfo = calcExamInfo(currentSave.exam1_date, "جزئي");
      examStarted = examInfo.exam_started;
      examTimeText = examInfo.exam_time_text;

    } else if (status === "IN_EXAM2") {
      infoStatus = status;

      // ── آخر صف لـ EXAM2 ← تصحيح الخطأ ──
      lastRowForInfo = (userTestsRaw || [])
        .filter(t => t.save_id === currentSave.id && t.type === "EXAM2")
        .sort((a, b) => b.id - a.id)[0];

      if (lastRowForInfo) {
        infoExamStatus = lastRowForInfo.status;
      }

      // ── exam_started و exam_time_text من exam2_date ──
      const examInfo = calcExamInfo(currentSave.exam2_date, "تراكمي");
      examStarted = examInfo.exam_started;
      examTimeText = examInfo.exam_time_text;

    } else if (["FINISHED", "TERMINATED", "SUSPENDED"].includes(status)) {
      infoStatus = status;
    }

    if (lastRowForInfo) {
      lastSaveReadyAt = formatTimeBaghdad(lastRowForInfo.ready_at);
      lastSaveFinishedAt = formatTimeBaghdad(lastRowForInfo.finished_at);
      lastSaveTeacherName = lastRowForInfo.teacher_name || "";
    }
  }

  // ── 6. بناء الرد ─────────────────────────────────────────────────
  const responsePayload: any = {
    error: false,
    account: {
      access_token: finalAccessToken,
      refresh_token: finalRefreshToken,
    },
    user: {},
    user_saves: userSaves || [],
    user_pages: processedPages,
    user_tests: processedTests,
    information: {
      status: infoStatus,
      save_text: infoSaveText,
      exam_status: infoExamStatus,
      all_pages_saved_number: allPagesSavedNumber,
      progress_number: progressNumber,
      time_ended: checkTimeEndedBaghdad(),
      start_page: infoStartPage,
      last_save_ready_at: lastSaveReadyAt,
      last_save_finished_at: lastSaveFinishedAt,
      last_save_teacher_name: lastSaveTeacherName,
      exam_started: examStarted,
      exam_time_text: examTimeText,
    }
  };

  if (userAuthData.profile_incomplete) {
    responsePayload.user = {
      profile_incomplete: true,
      gender: userAuthData.gender
    };
  } else {
    const fullUserData = { ...userAuthData };
    const keysToRemove = [
      'email', 'password', 'photo_url',
      'edited_admin_phone_number', 'added_admin_phone_number',
      'last_logined_in', 'last_opened_in',
      'joined', 'joined_in', 'auto_user_location',
      'user_id', 'teacher_id', 'created_at',
      'joined_ip', 'logined_ip', 'opened_ip'
    ];
    keysToRemove.forEach(key => delete fullUserData[key]);

    let tempPhotoUrl: string | null = null;
    if (userAuthData.photo_url) {
      const bucket = userAuthData.gender === "female"
        ? "female_profiles_pictures"
        : "male_profiles_pictures";
      const { data: signedData } = await supabaseAdmin.storage
        .from(bucket)
        .createSignedUrl(userAuthData.photo_url, 60);
      if (signedData?.signedUrl) tempPhotoUrl = signedData.signedUrl;
    }

    responsePayload.user = {
      ...fullUserData,
      temp_photo_url: tempPhotoUrl,
    };
  }

  responsePayload.requests = processedRequests;
  responsePayload.update = false;

  const finalPayload = deepNullToEmpty(responsePayload);
  return jsonResponse(finalPayload, 200);
});
