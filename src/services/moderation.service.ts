import { Bot, InlineKeyboard } from "grammy";
import { supabase } from "../core/supabase.js";
import { config } from "../config/env.js";
import { DBJob, updateJobStatus } from "./job.service.js";
import { MyContext } from "../types/context.js";

export async function moderateJob(
  jobId: string,
  action: "publish" | "reject"
): Promise<{ success: boolean; job?: DBJob; message: string }> {
  const { data: job, error } = await supabase
    .from("jobs")
    .select("*, employer:users!employer_id(*)")
    .eq("id", jobId)
    .single();

  if (error || !job) {
    return { success: false, message: "E’lon topilmadi." };
  }

  const nextStatus = action === "publish" ? "published" : "cancelled";
  await updateJobStatus(jobId, nextStatus);

  return {
    success: true,
    job: { ...job, status: nextStatus },
    message:
      action === "publish"
        ? `“${job.title}” e’loni tasdiqlandi va ishchilarga e’lon qilindi.`
        : `“${job.title}” e’loni rad etildi.`,
  };
}

export async function notifyAdminsAboutJob(
  bot: Bot<MyContext>,
  job: {
    id: string;
    title: string;
    category: string;
    pay_amount: number;
    district: string;
    address: string;
    description: string;
    openings: number;
    source_name?: string | null;
  }
) {
  const admins = config.adminTelegramIds;
  if (!admins.length) return;

  const text = [
    "🔔 <b>Yangi e’lon moderatsiyaga tushdi:</b>",
    "",
    `📌 <b>Sarlavha:</b> ${job.title}`,
    `📂 <b>Kategoriya:</b> ${job.category}`,
    `📍 <b>Tuman / Manzil:</b> ${job.district}, ${job.address}`,
    `💰 <b>Ish haqi:</b> ${job.pay_amount.toLocaleString()} so‘m`,
    `👥 <b>Kerakli ishchilar:</b> ${job.openings} ta`,
    `📝 <b>Tavsif:</b> ${job.description}`,
    job.source_name ? `🔗 <b>Manba:</b> ${job.source_name}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const keyboard = new InlineKeyboard()
    .text("✅ Tasdiqlash", `admin:mod:${job.id}:publish`)
    .text("❌ Rad etish", `admin:mod:${job.id}:reject`);

  for (const adminId of admins) {
    try {
      await bot.api.sendMessage(adminId, text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } catch (e) {
      console.error(`Failed to send moderation message to admin ${adminId}:`, e);
    }
  }
}

export async function broadcastJobToMatchingWorkers(
  bot: Bot<MyContext>,
  job: DBJob
) {
  // Find workers interested in this category
  const { data: workers } = await supabase
    .from("users")
    .select("telegram_id, worker_categories")
    .not("telegram_id", "is", null);

  if (!workers || !workers.length) return;

  const matchingWorkers = workers.filter((w) =>
    Array.isArray(w.worker_categories) && w.worker_categories.includes(job.category)
  );

  const text = [
    "⚡️ <b>Siz uchun yangi mos ish e’loni!</b>",
    "",
    `📌 <b>${job.title}</b>`,
    `📂 Kategoriya: ${job.category}`,
    `📍 Tuman: ${job.district}`,
    `💰 Ish haqi: ${job.pay_amount.toLocaleString()} so‘m`,
    `👥 Bo‘sh o‘rinlar: ${job.openings} ta`,
  ].join("\n");

  const keyboard = new InlineKeyboard().text("🔍 E’lonni ochish", `job:view:${job.id}`);

  for (const worker of matchingWorkers) {
    try {
      await bot.api.sendMessage(worker.telegram_id, text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } catch (err) {
      // Worker may have blocked bot
    }
  }
}
