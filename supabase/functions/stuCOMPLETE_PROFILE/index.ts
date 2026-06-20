import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.40.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey);

const MAX_IMAGE_SIZE_BYTES = 1 * 1024 * 1024; // 2MB

// WebP magic bytes: 52 49 46 46 ... 57 45 42 50
// RIFF....WEBP
async function isRealWebP(file: File): Promise<boolean> {
  const buffer = await file.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // RIFF
  if (bytes[0] !== 0x52 || bytes[1] !== 0x49 || bytes[2] !== 0x46 || bytes[3] !== 0x46) return false;
  // WEBP
  if (bytes[8] !== 0x57 || bytes[9] !== 0x45 || bytes[10] !== 0x42 || bytes[11] !== 0x50) return false;

  return true;
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: true, errors: "طريقة الطلب غير مدعومة. يُرجى استخدام طريقة POST." }, 405);
  }

  try {
    // ── 1. التحقق من التوكن ──────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: true, errors: "رمز التفويض مفقود. يُرجى تقديم رمز Bearer صالح." }, 401);
    }

    const accessToken = authHeader.replace("Bearer ", "").trim();
    const { data: userData, error: userErr } =
      await supabase.auth.getUser(accessToken);

    if (userErr || !userData.user) {
      return json({
        error: true,
        errors: "رمز التفويض غير صالح أو منتهي الصلاحية. يُرجى تسجيل الدخول مجدداً.",
      }, 401);
    }

    const user_id = userData.user.id;

    // ── 2. جلب بيانات المستخدم ───────────────────────────────────────
    const { data: userRow } = await supabase
      .from("users")
      .select("*")
      .eq("user_id", user_id)
      .single();

    if (!userRow) {
      return json({ error: true, errors: "الحساب غير موجود. يُرجى التواصل مع الدعم الفني." }, 404);
    }

    // ── 3. التحقق من حالة الملف الشخصي ─────────────────────────────
    if (userRow.profile_incomplete !== true) {
      return json({
        error: true,
        errors: "تم استكمال معلومات الملف الشخصي مسبقاً ولا يمكن تعديلها.",
      }, 400);
    }

    // ── 4. قراءة الـ formData ────────────────────────────────────────
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (_) {
      return json({ error: true, errors: "تعذّر قراءة بيانات الطلب. يُرجى التحقق من صحة البيانات المُرسلة." }, 400);
    }

    const f_phone_number = formData.get("f_phone_number")?.toString().trim() || "";
    const brith          = formData.get("brith")?.toString().trim()          || "";
    const location       = formData.get("location")?.toString().trim()       || "";
    const gps            = formData.get("gps")?.toString().trim()            || "";
    const picture        = formData.get("picture") as File | null;

    // ── 5. التحقق من وجود الحقول المطلوبة ───────────────────────────
    const requiredFields: Record<string, string | File | null> = {
      f_phone_number,
      brith,
      location,
      picture,
    };

    for (const [key, value] of Object.entries(requiredFields)) {
      if (!value) {
        return json({
          error: true,
          errors: `الحقل المطلوب غائب: "${key}". يُرجى التأكد من إرسال جميع البيانات المطلوبة.`,
        }, 400);
      }
    }

    // ── 6. التحقق من حجم الصورة (الحد 2MB) ─────────────────────────
    if (picture!.size > MAX_IMAGE_SIZE_BYTES) {
      return json({
        error: true,
        errors: "حجم الصورة يتجاوز الحد المسموح به (1 ميجابايت). يُرجى اختيار صورة أصغر حجماً.",
      }, 400);
    }

    // ── 7. التحقق من MIME type ───────────────────────────────────────
    if (picture!.type !== "image/webp") {
      return json({
        error: true,
        errors: "صيغة الصورة غير مدعومة. الصيغة المقبولة هي WebP فقط.",
      }, 400);
    }

    // ── 8. التحقق من magic bytes (WebP حقيقي وليس مجرد اسم) ────────
    const realWebP = await isRealWebP(picture!);
    if (!realWebP) {
      return json({
        error: true,
        errors: "الملف المُرسل ليس صورة WebP حقيقية. يُرجى التأكد من صحة الملف.",
      }, 400);
    }

    // ── 9. التحقق من رقم الهاتف ─────────────────────────────────────
    if (!/^964\d{10}$/.test(f_phone_number)) {
      return json({
        error: true,
        errors: "رقم الهاتف غير صالح. يجب أن يبدأ بـ 964 ويتكون من 13 رقماً إجمالاً.",
      }, 400);
    }

    // ── 10. التحقق من تاريخ الميلاد (YYYY/MM/DD) ────────────────────
    const parts = brith.split("/").map(Number);
    if (parts.length !== 3) {
      return json({ error: true, errors: "صيغة تاريخ الميلاد غير صحيحة. يُرجى استخدام الصيغة: YYYY/MM/DD." }, 400);
    }

    const [year, month, day] = parts;
    const maxDaysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const isLeap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const maxDay = month === 2 && isLeap ? 29 : maxDaysInMonth[month - 1];
    const currentYear = new Date().getFullYear();

    if (
      !year || !month || !day      ||
      month < 1 || month > 12      ||
      day < 1   || day > maxDay    ||
      year < 1900 || year > currentYear
    ) {
      return json({ error: true, errors: "تاريخ الميلاد غير صالح. يُرجى إدخال تاريخ ميلاد حقيقي بالصيغة YYYY/MM/DD." }, 400);
    }

    // ── 11. التحقق من العنوان ────────────────────────────────────────
    if (location.length < 10) {
      return json({ error: true, errors: "العنوان المُدخل قصير جداً. يجب أن يحتوي على 10 أحرف على الأقل." }, 400);
    }

    if (location.length > 100) {
      return json({ error: true, errors: "العنوان المُدخل طويل جداً. يجب ألا يتجاوز 100 حرف." }, 400);
    }

    // ── 12. التحقق من إحداثيات GPS (اختياري) ────────────────────────
    if (gps && !/^-?[0-9]{1,3}(\.[0-9]+)?,\s*-?[0-9]{1,3}(\.[0-9]+)?$/.test(gps)) {
      return json({
        error: true,
        errors: "إحداثيات GPS غير صالحة. يُرجى إرسالها بالصيغة: latitude,longitude (مثال: 33.3152,44.3661).",
      }, 400);
    }

    const finalGps = gps || "00.0000, 00.0000";

    // ── 13. تحديد bucket حسب الجنس ──────────────────────────────────
    const bucketName = userRow.gender === "male"
      ? "male_profiles_pictures"
      : "female_profiles_pictures";

    const namePrefix = `${user_id}:::${userRow.joined_in}`;
    const fileName   = `${namePrefix}.webp`;

    // ── 14. حذف الصور القديمة إن وُجدت ─────────────────────────────
    const { data: existingFiles } = await supabase.storage
      .from(bucketName)
      .list("", { search: namePrefix });

    if (existingFiles && existingFiles.length > 0) {
      await supabase.storage
        .from(bucketName)
        .remove(existingFiles.map((f) => f.name));
    }

    // ── 15. رفع الصورة مباشرة بدون أي معالجة ───────────────────────
    const fileBytes = new Uint8Array(await picture!.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(fileName, fileBytes, {
        contentType: "image/webp",
        upsert: true,
      });

    if (uploadError) {
      return json({ error: true, errors: "حدث خطأ أثناء رفع الصورة. يُرجى المحاولة مرة أخرى." }, 500);
    }

    // ── 16. تحديث بيانات المستخدم ────────────────────────────────────
    const { error: updateError } = await supabase
      .from("users")
      .update({
        photo_url:           fileName,
        father_phone_number: f_phone_number,
        user_location:       location,
        date_of_brith:       brith,
        auto_user_location:  finalGps,
        profile_incomplete:  false,
      })
      .eq("user_id", user_id);

    if (updateError) {
      return json({ error: true, errors: "حدث خطأ أثناء حفظ البيانات. يُرجى المحاولة مرة أخرى." }, 500);
    }

    return json({ error: false, message: "تم استكمال معلومات الملف الشخصي بنجاح." }, 200);

  } catch (err) {
    console.error("[complete-profile] Unexpected error:", err);
    return json({
      error: true,
      errors: "حدث خطأ داخلي غير متوقع. يُرجى المحاولة لاحقاً أو التواصل مع الدعم الفني.",
    }, 500);
  }
});