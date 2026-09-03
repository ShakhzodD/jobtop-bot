import { Api, InlineKeyboard } from "grammy";
import { supabase } from "../core/supabase.js";

export async function sendDailyMorningDigest(api: Api): Promise<void> {
  try {
    console.log("⏰ [Smart Digest] Ertalabki Smart Job Digest xabarnomasi tayyorlanmoqda...");

    // 1. Fetch top 3 highest paying recent published jobs
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: topJobs, error: jobErr } = await supabase
      .from("jobs")
      .select("id, title, district, pay_amount, category")
      .eq("status", "published")
      .gte("created_at", oneDayAgo)
      .order("pay_amount", { ascending: false })
      .limit(3);

    if (jobErr || !topJobs || topJobs.length === 0) {
      console.log("⏰ [Smart Digest] Bugun uchun yangi e’lonlar topilmadi.");
      return;
    }

    // 2. Fetch all registered users
    const { data: users, error: userErr } = await supabase
      .from("users")
      .select("telegram_id, full_name")
      .not("telegram_id", "is", null);

    if (userErr || !users || users.length === 0) {
      console.log("⏰ [Smart Digest] Foydalanuvchilar topilmadi.");
      return;
    }

    const jobLines = topJobs.map((j, i) => {
      return `${i + 1}️⃣ <b>[${j.district}]</b> ${j.title} — <b>${j.pay_amount.toLocaleString()} so‘m</b>`;
    }).join("\n");

    const message = [
      "☀️ <b>HAYRLI TONG! BUGUNGI ENG QAYNOQ KUNLIK ISHLAR:</b> 💸",
      "",
      jobLines,
      "",
      "⚡️ <i>Shoshiling, joylar soni cheklangan! Birinchilardan bo‘lib buyurtmachi bilan bog‘laning yoki sherigingiz bilan birga borish uchun do‘stlaringizga yuboring:</i>",
    ].join("\n");

    const shareText = encodeURIComponent(
      "Toshkentda bugungi eng qaynoq kunlik naqd pulli ishlar chiqdi! Birga boramizmi? 👇"
    );

    let sent = 0;
    let failed = 0;

    for (const u of users) {
      const refLink = `https://t.me/jobtopuzbot?start=ref_${u.telegram_id}`;
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${shareText}`;

      const keyboard = new InlineKeyboard()
        .text("🔍 Ishlarni ko‘rish", "worker:feed:all:0")
        .url("📤 Do‘stlarga ulashish", shareUrl);

      try {
        await api.sendMessage(u.telegram_id, message, {
          parse_mode: "HTML",
          reply_markup: keyboard,
        });
        sent++;
      } catch (e) {
        failed++;
      }
      await new Promise((r) => setTimeout(r, 60)); // Rate limit protection
    }

    console.log(`⏰ [Smart Digest] Yuborildi: ${sent} ta foydalanuvchiga (Muvaffaqiyatsiz: ${failed} ta)`);
  } catch (err) {
    console.error("❌ [Smart Digest] Xatolik:", err);
  }
}

// Scheduled check for 08:30 AM Tashkent time
export function startDailyDigestCron(api: Api): void {
  setInterval(async () => {
    const now = new Date();
    // Get Tashkent time (UTC+5)
    const tashkentTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tashkent" }));
    const hours = tashkentTime.getHours();
    const minutes = tashkentTime.getMinutes();

    // Check if it is exactly 08:30 AM
    if (hours === 8 && minutes === 30) {
      await sendDailyMorningDigest(api);
    }
  }, 60 * 1000); // Check every minute
}
