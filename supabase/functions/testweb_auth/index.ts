import {
  supabaseAdmin, supabaseAuth, SYSTEM_KEY,
  jsonResponse, preflight, clientIp, toLocalPhone, nowIso,
} from "../_shared/guard.ts";

function adminPublic(a: any) {
  return {
    id: a.id,
    name: a.name ?? "",
    type: a.type === "owner" ? "owner" : "admin",
    phone: toLocalPhone(a.phone_number ?? ""),
    active: a.active === true,
    gender: a.gender === "female" ? "female" : "male",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight();
  if (req.method !== "POST") return jsonResponse({ error: true, errors: "الطريقة غير مسموح بها" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "login");
    const ip = clientIp(req);

    // ── تسجيل الدخول ───────────────────────────────────────────────
    if (action === "login") {
      const email    = String(body?.email ?? "").trim().toLowerCase();
      const password = String(body?.password ?? "");
      if (!email || !password) return jsonResponse({ error: true, errors: "البريد وكلمة المرور مطلوبان" }, 400);

      const { data: admin } = await supabaseAdmin
        .from("admins").select("*").eq("email", email).maybeSingle();

      if (!admin || String(admin.password ?? "") !== password) {
        return jsonResponse({ error: true, errors: "بيانات الدخول غير صحيحة" }, 401);
      }
      if (admin.active !== true) {
        return jsonResponse({ error: true, code: "INACTIVE", errors: "هذا الحساب غير نشط، يرجى مراجعة الإدارة" }, 403);
      }

      const authPassword = password + SYSTEM_KEY;
      let { data: session, error: signErr } = await supabaseAuth.auth.signInWithPassword({ email, password: authPassword });

      // أول دخول: إنشاء حساب المصادقة تلقائياً ما دامت كلمة المرور في الجدول صحيحة
      if (signErr || !session?.session) {
        await supabaseAdmin.auth.admin.createUser({ email, password: authPassword, email_confirm: true }).catch(() => {});
        const retry = await supabaseAuth.auth.signInWithPassword({ email, password: authPassword });
        session = retry.data; signErr = retry.error;
      }
      if (signErr || !session?.session) {
        return jsonResponse({ error: true, errors: "تعذّر إنشاء الجلسة، تأكد من بيانات الحساب" }, 401);
      }

      const patch: Record<string, any> = {
        last_logined_in: nowIso(),
        last_opened_in:  nowIso(),
        logined_ip:      ip,
        opened_ip:       ip,
      };
      if (admin.joined !== true) { patch.joined = true; patch.joined_in = nowIso(); patch.joined_ip = ip; }
      await supabaseAdmin.from("admins").update(patch).eq("id", admin.id);

      return jsonResponse({
        error: false,
        access_token:  session.session.access_token,
        refresh_token: session.session.refresh_token,
        admin: adminPublic(admin),
      });
    }

    // ── التحقق من الجلسة (عند فتح اللوحة وبعد كل عملية) ────────────
    if (action === "verify") {
      const accessToken  = String(body?.access_token ?? "");
      const refreshToken = String(body?.refresh_token ?? "");
      if (!accessToken && !refreshToken) {
        return jsonResponse({ error: true, code: "AUTH", errors: "لا توجد جلسة" }, 401);
      }

      let email = "";
      let outAccess = accessToken, outRefresh = refreshToken;

      const { data: u, error: uErr } = await supabaseAuth.auth.getUser(accessToken);
      if (!uErr && u?.user?.email) {
        email = u.user.email;
      } else if (refreshToken) {
        const { data: r, error: rErr } = await supabaseAuth.auth.refreshSession({ refresh_token: refreshToken });
        if (rErr || !r?.session?.user?.email) {
          return jsonResponse({ error: true, code: "AUTH", errors: "انتهت الجلسة" }, 401);
        }
        email = r.session.user.email;
        outAccess = r.session.access_token;
        outRefresh = r.session.refresh_token;
      } else {
        return jsonResponse({ error: true, code: "AUTH", errors: "انتهت الجلسة" }, 401);
      }

      const { data: admin } = await supabaseAdmin
        .from("admins").select("*").eq("email", email).maybeSingle();
      if (!admin) return jsonResponse({ error: true, code: "FORBIDDEN", errors: "هذا الحساب غير مخوّل" }, 403);
      if (admin.active !== true) {
        return jsonResponse({ error: true, code: "INACTIVE", errors: "تم إلغاء تفعيل هذا الحساب" }, 403);
      }

      await supabaseAdmin.from("admins")
        .update({ last_opened_in: nowIso(), opened_ip: ip }).eq("id", admin.id);

      return jsonResponse({
        error: false,
        access_token: outAccess,
        refresh_token: outRefresh,
        admin: adminPublic(admin),
      });
    }

    return jsonResponse({ error: true, errors: "إجراء غير معروف" }, 400);
  } catch (e) {
    return jsonResponse({ error: true, errors: String(e) }, 500);
  }
});
