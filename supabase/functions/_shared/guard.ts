import { createClient } from "npm:@supabase/supabase-js@2.49.8";

export const SUPABASE_URL              = Deno.env.get("SUPABASE_URL")              ?? "";
export const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
export const SYSTEM_KEY                = Deno.env.get("system_key")                ?? "";
export const WAHA_URL                  = Deno.env.get("waha_url")                  ?? "";
export const WAHA_API_KEY              = Deno.env.get("waha_api_key")              ?? "";

export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// عميل منفصل لعمليات المصادقة (تسجيل دخول/تحقق من توكن)
export const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

export function jsonResponse(payload: any, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

// 0xxxxxxxxx → 964xxxxxxxxx
export function normalizePhone(p: string): string {
  const s = String(p ?? "").trim().replace(/\s+/g, "");
  if (s.startsWith("+964")) return s.slice(1);
  if (s.startsWith("964"))  return s;
  if (s.startsWith("0"))    return "964" + s.slice(1);
  return s;
}

// 964xxxxxxxxx → 0xxxxxxxxx
export function toLocalPhone(p: string): string {
  const s = String(p ?? "").trim();
  if (s.startsWith("964"))  return "0" + s.slice(3);
  if (s.startsWith("+964")) return "0" + s.slice(4);
  return s;
}

export function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
      || req.headers.get("x-real-ip") || "—";
}

// نص حسب الجنس
export function g(gender: string, male: string, female: string): string {
  return gender === "female" ? female : male;
}

export async function sendWaha(phone: string, text: string): Promise<boolean> {
  const num = normalizePhone(phone);
  if (!num || !WAHA_URL || !WAHA_API_KEY) return false;
  try {
    const res = await fetch(WAHA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": WAHA_API_KEY },
      body: JSON.stringify({ chatId: `${num}@c.us`, text, session: "default" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface Admin {
  id: string; name: string; type: string; active: boolean;
  email: string; phone_number: string; password: string; gender?: string;
}

export interface GuardResult { admin?: Admin; response?: Response; }

// التحقق من أن الطلب صادر عن حساب إداري فعّال عبر التوكن
export async function requireAdmin(req: Request): Promise<GuardResult> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { response: jsonResponse({ error: true, code: "AUTH", errors: "مطلوب تسجيل الدخول" }, 401) };

  const { data, error } = await supabaseAuth.auth.getUser(token);
  if (error || !data?.user?.email) {
    return { response: jsonResponse({ error: true, code: "AUTH", errors: "انتهت الجلسة" }, 401) };
  }

  const { data: admin } = await supabaseAdmin
    .from("admins").select("*").eq("email", data.user.email).maybeSingle();

  if (!admin) return { response: jsonResponse({ error: true, code: "FORBIDDEN", errors: "هذا الحساب غير مخوّل" }, 403) };
  if (admin.active !== true) {
    return { response: jsonResponse({ error: true, code: "INACTIVE", errors: "تم إلغاء تفعيل هذا الحساب" }, 403) };
  }

  return { admin: admin as Admin };
}

export function requireOwner(admin: Admin): Response | null {
  if (admin.type !== "owner") {
    return jsonResponse({ error: true, code: "FORBIDDEN", errors: "هذه العملية متاحة للمسؤول الإداري فقط" }, 403);
  }
  return null;
}

export function adminTitle(admin: Admin): string {
  const isF = admin.gender === "female";
  if (admin.type === "owner") return isF ? "المسؤولة الإدارية" : "المسؤول الإداري";
  return isF ? "الإدارية" : "الإداري";
}

// أول سطر يُضاف لكل رسالة واتساب صادرة من اللوحة
export function senderLine(_admin: Admin): string {
  return `المرسل: إدارة مركز مشروع التحفيظ`;
}

export function autoReplyFooter(): string {
  return "_هذه رسالة تلقائية من إدارة مشروع التحفيظ المُتقِن، لا يمكن الرد عليها._";
}

// تغليف نص الرسالة بترويسة المرسل وتذييل الرد التلقائي
export function wrapMsg(admin: Admin, body: string): string {
  return `${senderLine(admin)}\n\n${body}\n\n${autoReplyFooter()}`;
}

// تسجيل إجراء إداري في جدول logs
export async function writeLog(admin: Admin, message: string): Promise<void> {
  try {
    await supabaseAdmin.from("logs").insert({
      type: admin.type ?? "admin",
      type_id: admin.id,
      message,
    });
  } catch (e) {
    console.error("[log]", e);
  }
}

export function genderLabel(gv: string): string { return gv === "female" ? "أنثى" : "ذكر"; }

export function saveStatusLabel(s: string): string {
  switch (s) {
    case "ACTIVE":     return "نشط";
    case "IN_EXAM1":   return "في الاختبار الجزئي";
    case "IN_EXAM2":   return "في الاختبار التراكمي";
    case "FINISHED":   return "مكتمل";
    case "SUSPENDED":  return "موقوف مؤقتاً";
    case "TERMINATED": return "منهي";
    default:           return s || "—";
  }
}

export function rowStatusLabel(status: string, pageStatus: string, isFU: boolean, iFT: boolean): string {
  switch (status) {
    case "not_ready":       return "لم يُسمّع بعد";
    case "ready":           return "بانتظار التقييم";
    case "user_absence":    return isFU ? "غائبة" : "غائب";
    case "teacher_absence": return iFT ? "المشرفة غائبة" : "المشرف غائب";
    case "holiday":         return isFU ? "مجازة" : "مجاز";
    case "public_holiday":  return "إجازة عامة";
    case "teacher_holiday": return iFT ? "المشرفة مجازة" : "المشرف مجاز";
    case "sus_to_act":      return "استئناف بعد إيقاف";
    case "finished":
      switch (pageStatus) {
        case "reject":    return "رسوب";
        case "good":      return "جيد جداً";
        case "very_good": return "إمتياز";
        case "perfect":   return isFU ? "مُتقِنة" : "مُتقِن";
        default:          return "منجز";
      }
    default: return status || "—";
  }
}

export function gradeKind(status: string, pageStatus: string): string {
  if (status === "user_absence" || status === "teacher_absence" || status === "not_ready") return "absent";
  if (status === "holiday" || status === "public_holiday" || status === "teacher_holiday") return "holiday";
  if (status === "ready") return "waiting";
  if (status === "finished") {
    if (pageStatus === "reject")    return "reject";
    if (pageStatus === "good")      return "good";
    if (pageStatus === "very_good") return "very_good";
    if (pageStatus === "perfect")   return "perfect";
  }
  return "neutral";
}

export function examTypeLabel(t: string): string {
  if (t === "EXAM1") return "اختبار جزئي";
  if (t === "EXAM2") return "اختبار تراكمي";
  return t || "—";
}

export function calcProgress(save: any, pagesForSave: any[]): { pct: number; saved: number; total: number } {
  const start = Number(save.start_page);
  const end   = Number(save.end_page);
  const total = (end - start) + 1;
  if (!(total > 0)) return { pct: 0, saved: 0, total: 0 };
  const finished = pagesForSave.filter((p) => p.status === "finished" && p.page_status !== "reject");
  if (!finished.length) return { pct: 0, saved: 0, total };
  const maxPage = Math.max(...finished.map((p) => Number(p.page) || 0));
  const saved   = Math.max(0, (maxPage - start) + 1);
  return { pct: Math.max(0, Math.min(100, Math.round((saved / total) * 100))), saved, total };
}

export function pageDisp(row: any, edp: number): string {
  if (row.MePageArabic) return String(row.MePageArabic);
  const page = Number(row.page);
  if (!page) return "—";
  const count = edp < 1 ? 1 : Math.ceil(edp);
  return Array.from({ length: count }, (_, i) => String(page - (count - 1 - i))).join(" و ");
}

export function nowIso(): string { return new Date().toISOString(); }

// التاريخ بتوقيت بغداد بصيغة YYYY-MM-DD
export function baghdadDate(offsetDays = 0): string {
  const now = new Date(Date.now() + 3 * 3600 * 1000 + offsetDays * 86400 * 1000);
  return now.toISOString().slice(0, 10);
}
