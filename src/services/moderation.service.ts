import { publishJobToPublicChannel } from "./channel-publisher.service.js";
import { Api, InlineKeyboard } from "grammy";
import { supabase } from "../core/supabase.js";
import { config } from "../config/env.js";
import { DBJob, updateJobStatus, detectJobGender } from "./job.service.js";

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
  modBotApi: Api,
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
  const admins = config.adminTelegramIds.length > 0 ? config.adminTelegramIds : [445057374];
  console.log(`📢 Yangi e’lon uchun ${admins.length} ta adminga xabar yuborilmoqda:`, admins);

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
      await modBotApi.sendMessage(adminId, text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
      console.log(`✅ Adminga (${adminId}) moderatsiya xabari muvaffaqiyatli yuborildi.`);
    } catch (e) {
      console.error(`❌ Adminga (${adminId}) xabar yuborishda xatolik:`, e);
    }
  }
}

export async function broadcastJobToMatchingWorkers(
  mainBotApi: Api,
  job: DBJob
) {
  // 1. Automatically post to official public channel @jobtopuzz
  publishJobToPublicChannel(mainBotApi, job).catch((err) =>
    console.error("Error auto-publishing to public channel:", err)
  );
  const jobGender = detectJobGender(job);

  const { data: workers } = await supabase
    .from("users")
    .select("telegram_id, district, worker_categories, bot_state")
    .not("telegram_id", "is", null);

  if (!workers || !workers.length) return;

  const matchingWorkers = workers.filter((w) => {
    // 1. Category check
    const catMatch =
      !w.worker_categories ||
      !Array.isArray(w.worker_categories) ||
      w.worker_categories.length === 0 ||
      w.worker_categories.includes(job.category);
    if (!catMatch) return false;

    // 2. Gender targeted push check
    const workerGender = (w as any)?.bot_state?.gender;
    if (workerGender && jobGender !== "any") {
      if (jobGender !== workerGender) {
        return false; // Don't spam female jobs to male workers or male jobs to female workers!
      }
    }
    return true;
  });
  console.log(`📢 "${job.title}" e’loni uchun ${matchingWorkers.length} ta mos ishchiga xabar yuborilmoqda...`);

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
      const isMyDistrict =
        worker.district &&
        job.district &&
        job.district.toLowerCase().includes(worker.district.toLowerCase());

      const header = isMyDistrict
        ? `📍 <b>Sizning tumaningizda (${job.district}) yangi ish!</b>`
        : "⚡️ <b>Siz uchun yangi mos ish e’loni!</b>";

      const personalizedText = [
        header,
        "",
        `📌 <b>${job.title}</b>`,
        `📂 Kategoriya: ${job.category}`,
        `📍 Tuman / Manzil: ${job.district}, ${job.address}`,
        `💰 Ish haqi: ${job.pay_amount.toLocaleString()} so‘m`,
        `👥 Bo‘sh o‘rinlar: ${job.openings} ta`,
      ].join("\n");

      await mainBotApi.sendMessage(worker.telegram_id, personalizedText, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    } catch (err) {
      // Worker may have blocked bot
    }
  }
}
