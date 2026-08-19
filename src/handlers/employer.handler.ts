import { Bot, InlineKeyboard } from "grammy";
import { MyContext } from "../types/context.js";
import { getUserByTelegramId } from "../services/user.service.js";
import {
  getEmployerJobs,
  getJobById,
  updateJobStatus,
} from "../services/job.service.js";
import {
  getJobApplications,
  selectApplication,
  rejectApplication,
} from "../services/application.service.js";
import { bot } from "../core/bots.js";

export function registerEmployerHandlers(mainBot: Bot<MyContext>) {
  // Create Job
  mainBot.hears("➕ Yangi e’lon berish", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await getUserByTelegramId(telegramId);
    if (!user || !user.phone) {
      await ctx.reply("E’lon berish uchun avval /start orqali ro‘yxatdan o‘ting.");
      return;
    }

    await ctx.conversation.enter("createJobConversation");
  });

  // My Jobs
  mainBot.hears("📋 Mening e’lonlarim", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply("Iltimos, avval /start buyrug‘ini bosing.");
      return;
    }

    const jobs = await getEmployerJobs(user.id);
    if (jobs.length === 0) {
      await ctx.reply(
        "Sizda hali yaratilgan e’lonlar mavjud emas.\n\n➕ <b>Yangi e’lon berish</b> tugmasi orqali tezkor e’lon yarata olasiz!",
        { parse_mode: "HTML" }
      );
      return;
    }

    const statusLabels: Record<string, string> = {
      pending_moderation: "⏳ Moderatsiyada",
      published: "🟢 Faol (Ishchilar ko‘rmoqda)",
      filled: "✅ To‘ldi (Nomzodlar tanlandi)",
      completed: "🏁 Yakunlangan",
      cancelled: "❌ Bekor qilingan",
    };

    for (const job of jobs.slice(0, 10)) {
      const applications = await getJobApplications(job.id);
      const pendingCount = applications.filter((a) => a.status === "pending").length;
      const selectedCount = applications.filter((a) => a.status === "selected").length;

      const jobCard = [
        `📌 <b>${job.title}</b>`,
        `📂 Kategoriya: ${job.category}`,
        `📍 Manzil: ${job.district}, ${job.address}`,
        `💰 Haq: ${job.pay_amount.toLocaleString()} so‘m`,
        `👥 Kerak: ${job.openings} ta | Tanlandi: ${selectedCount} ta`,
        `Holati: <b>${statusLabels[job.status] || job.status}</b>`,
        `📥 Kelgan arizalar: <b>${applications.length} ta</b> (Kutilmoqda: ${pendingCount})`,
      ].join("\n");

      const keyboard = new InlineKeyboard();
      if (applications.length > 0) {
        keyboard.text(
          `👥 Nomzodlarni ko‘rish (${applications.length})`,
          `emp:apps:${job.id}`
        ).row();
      }

      if (job.status === "published") {
        keyboard.text("⏹ E’lonni to‘xtatish", `emp:close:${job.id}`);
      }

      await ctx.reply(jobCard, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    }
  });

  // View Applicants
  mainBot.callbackQuery(/^emp:apps:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const jobId = ctx.match[1];
    const applications = await getJobApplications(jobId);

    if (applications.length === 0) {
      await ctx.reply("Ushbu e’longa hali arizalar kelmagan.");
      return;
    }

    for (const app of applications) {
      const worker = app.worker;
      const appText = [
        `👤 <b>Nomzod:</b> ${worker?.full_name || "Noma'lum"}`,
        worker?.phone ? `📞 <b>Telefon:</b> <code>${worker.phone}</code>` : "",
        worker?.telegram_username ? `💬 <b>Telegram:</b> @${worker.telegram_username}` : "",
        worker?.district ? `📍 <b>Tuman:</b> ${worker.district}` : "",
        worker?.experience_years ? `💼 <b>Tajriba:</b> ${worker.experience_years} yil` : "",
        worker?.about ? `📝 <b>Ma’lumot:</b> ${worker.about}` : "",
        app.note ? `💬 <b>Izoh:</b> ${app.note}` : "",
        `Holati: <b>${
          app.status === "selected"
            ? "✅ Tanlangan (Qabul qilingan)"
            : app.status === "rejected"
            ? "❌ Rad etilgan"
            : "⏳ Kutilmoqda"
        }</b>`,
      ]
        .filter(Boolean)
        .join("\n");

      const keyboard = new InlineKeyboard();
      if (app.status === "pending") {
        keyboard
          .text("✅ Tanlash", `emp:select:${app.id}`)
          .text("❌ Rad etish", `emp:reject:${app.id}`);
      }

      if (worker?.telegram_username) {
        keyboard.row().url(
          "✉️ Nomzodga yozish",
          `https://t.me/${worker.telegram_username}`
        );
      }

      await ctx.reply(appText, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    }
  });

  // Select Candidate
  mainBot.callbackQuery(/^emp:select:(.+)$/, async (ctx) => {
    const appId = ctx.match[1];
    const app = await selectApplication(appId);

    if (!app) {
      await ctx.answerCallbackQuery({
        text: "Nomzodni tanlashda xatolik yuz berdi",
        show_alert: true,
      });
      return;
    }

    await ctx.answerCallbackQuery({
      text: "✅ Nomzod tanlandi!",
      show_alert: true,
    });

    const worker = app.worker;
    const job = app.job;

    await ctx.reply(
      `🎉 <b>Siz nomzodni ishga tanladingiz!</b>\n\n` +
        `👤 <b>Ishchi:</b> ${worker?.full_name}\n` +
        `📞 <b>Telefon raqami:</b> <code>${worker?.phone || "Mavjud emas"}</code>\n` +
        (worker?.telegram_username ? `💬 <b>Telegram:</b> @${worker.telegram_username}\n` : "") +
        `\nIshchi bilan bog‘lanib, ish vaqtini kelishishingiz mumkin.`,
      { parse_mode: "HTML" }
    );

    // Notify Worker
    if (worker?.telegram_id) {
      try {
        const employer = (job as any)?.employer;
        await mainBot.api.sendMessage(
          worker.telegram_id,
          `🎉 <b>Xushxabar! Ish beruvchi sizni ishga tanladi!</b>\n\n` +
            `📌 <b>E’lon:</b> ${job?.title}\n` +
            `🏢 <b>Ish beruvchi:</b> ${employer?.full_name || "Ish beruvchi"}\n` +
            `📞 <b>Telefon raqami:</b> <code>${employer?.phone || "Mavjud emas"}</code>\n` +
            (employer?.telegram_username ? `💬 <b>Telegram:</b> @${employer.telegram_username}\n` : "") +
            `\nIsh beruvchi siz bilan bog‘lanadi yoki siz unga qo‘ng‘iroq qilishingiz mumkin. Omad! 🤝`,
          { parse_mode: "HTML" }
        );
      } catch (e) {
        console.error("Failed to notify worker:", e);
      }
    }
  });

  // Reject Candidate: Rejection handling with polite worker notification & redirection
  mainBot.callbackQuery(/^emp:reject:(.+)$/, async (ctx) => {
    const appId = ctx.match[1];
    const app = await rejectApplication(appId);

    if (!app) {
      await ctx.answerCallbackQuery({
        text: "Nomzodni rad etishda xatolik yuz berdi",
        show_alert: true,
      });
      return;
    }

    await ctx.answerCallbackQuery({ text: "Nomzod rad etildi" });
    await ctx.editMessageText("❌ Ushbu nomzod arizasi rad etildi.");

    const worker = app.worker;
    const job = app.job;

    // Send polite and encouraging notification to worker with direct button to view other jobs!
    if (worker?.telegram_id) {
      try {
        const rejectText = [
          `ℹ️ <b>Ariza holati:</b>`,
          "",
          `Hurmatli <b>${worker.full_name}</b>, sizning <b>“${job?.title || "E’lon"}”</b> bo‘yicha yuborgan arizangiz ish beruvchi tomonidan ko‘rib chiqildi va rad etildi.`,
          "",
          `Xafa bo‘lmang, JobTop platformasida siz uchun boshqa qulay va yaxshi ishlar juda ko‘p! 👇`,
        ].join("\n");

        const exploreKeyboard = new InlineKeyboard().text(
          "🔍 Boshqa ishlarni ko‘rish",
          "worker:feed:all:0"
        );

        await mainBot.api.sendMessage(worker.telegram_id, rejectText, {
          parse_mode: "HTML",
          reply_markup: exploreKeyboard,
        });
      } catch (e) {
        console.error("Failed to notify worker about rejection:", e);
      }
    }
  });

  // Close / Stop Job
  mainBot.callbackQuery(/^emp:close:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const jobId = ctx.match[1];
    await updateJobStatus(jobId, "cancelled");
    await ctx.editMessageText("⏹ E’lon to‘xtatildi va qidiruvdan olindi.");
  });
}
