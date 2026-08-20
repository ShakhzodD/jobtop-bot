import { Api } from "grammy";
import { supabase } from "../core/supabase.js";
import { config } from "../config/env.js";

export async function sendDailyAdminReport(modBotApi: Api): Promise<void> {
  const adminIds = config.adminTelegramIds.length > 0 ? config.adminTelegramIds : [445057374];
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    const [
      { count: totalUsers },
      { count: newUsers24h },
      { count: totalJobs },
      { count: newJobs24h },
      { count: totalApps },
      { count: newApps24h },
    ] = await Promise.all([
      supabase.from("users").select("*", { count: "exact", head: true }),
      supabase.from("users").select("*", { count: "exact", head: true }).gte("created_at", oneDayAgo),
      supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "published"),
      supabase.from("jobs").select("*", { count: "exact", head: true }).gte("created_at", oneDayAgo),
      supabase.from("applications").select("*", { count: "exact", head: true }),
      supabase.from("applications").select("*", { count: "exact", head: true }).gte("created_at", oneDayAgo),
    ]);

    const nowStr = new Date().toLocaleDateString("uz-UZ", {
      timeZone: "Asia/Tashkent",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const reportText = [
      "🌅 <b>Hayrli tong, Admin! Kunlik JobTop Hisoboti</b>",
      `📅 <i>${nowStr} (Toshkent vaqti bilan)</i>`,
      "",
      "👥 <b>Foydalanuvchilar:</b>",
      `• Jami: <b>${totalUsers ?? 0} ta</b>`,
      `• So‘nggi 24 soatda: <b>+${newUsers24h ?? 0} ta yangi</b>`,
      "",
      "💼 <b>E’lonlar:</b>",
      `• Hozir faol: <b>${totalJobs ?? 0} ta</b>`,
      `• So‘nggi 24 soatda: <b>+${newJobs24h ?? 0} ta qo‘shildi</b>`,
      "",
      "📄 <b>Arizalar:</b>",
      `• Jami arizalar: <b>${totalApps ?? 0} ta</b>`,
      `• So‘nggi 24 soatda: <b>+${newApps24h ?? 0} ta</b>`,
      "",
      "🟢 <i>Barcha serverlar va kanallar avtomatik monitoringi uzluksiz ishlamoqda.</i>",
    ].join("\n");

    for (const adminId of adminIds) {
      try {
        await modBotApi.sendMessage(adminId, reportText, { parse_mode: "HTML" });
      } catch (err) {
        console.error(`Failed to send daily report to admin ${adminId}:`, err);
      }
    }

    console.log("📊 Kunlik avto-hisobot adminlarga yuborildi.");
  } catch (error) {
    console.error("Error generating daily admin report:", error);
  }
}

function getMsUntilNext9AM(): number {
  // Tashkent is UTC+5 (300 minutes ahead of UTC)
  const now = new Date();
  const tashkentOffsetMs = 5 * 60 * 60 * 1000;
  const tashkentNow = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + tashkentOffsetMs);

  const next9AM = new Date(tashkentNow);
  next9AM.setHours(9, 0, 0, 0);

  if (tashkentNow.getTime() >= next9AM.getTime()) {
    next9AM.setDate(next9AM.getDate() + 1);
  }

  return next9AM.getTime() - tashkentNow.getTime();
}

export function startDailyReportCron(modBotApi: Api): void {
  const msUntil9AM = getMsUntilNext9AM();
  const hoursUntil9AM = (msUntil9AM / (1000 * 60 * 60)).toFixed(1);

  console.log(`⏰ [Daily Report] Ertalabki hisobot soat 09:00 ga rejalashtirildi (yana ${hoursUntil9AM} soatdan so‘ng).`);

  setTimeout(() => {
    sendDailyAdminReport(modBotApi).catch(console.error);

    // After first run, trigger every 24 hours
    setInterval(() => {
      sendDailyAdminReport(modBotApi).catch(console.error);
    }, 24 * 60 * 60 * 1000);
  }, msUntil9AM);
}
