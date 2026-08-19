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

export function registerEmployerHandlers(bot: Bot<MyContext>) {
  // Create Job
  bot.hears("➕ Yangi e’lon berish", async (ctx) => {
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
  bot.hears("📋 Mening e’lonlarim", async (ctx) => {
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
  bot.callbackQuery(/^emp:apps:(.+)$/, async (ctx) => {
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
        worker?.district ? `📍 Tuman: ${worker.district}` : "",
        worker?.experience_years ? `💼 Tajriba: ${worker.experience_years} yil` : "",
        worker?.about ? `📝 Ma’lumot: ${worker.about}` : "",
        app.note ? `💬 Izoh: ${app.note}` : "",
        `Holati: <b>${app.status === "selected" ? "✅ Tanlangan" : app.status === "rejected" ? "❌ Rad etilgan" : "⏳ Kutilmoqda"}</b>`,
        app.status === "selected" && worker?.phone
          ? `📞 <b>Telefon raqami:</b> ${worker.phone}`
          : "",
      ]
        .filter(Boolean)
        .join("\n");

      const keyboard = new InlineKeyboard();
      if (app.status === "pending") {
        keyboard
          .text("✅ Tanlash", `emp:select:${app.id}`)
          .text("❌ Rad etish", `emp:reject:${app.id}`);
      }

      await ctx.reply(appText, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    }
  });

  // Select Candidate
  bot.callbackQuery(/^emp:select:(.+)$/, async (ctx) => {
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
      `🎉 <b>Siz nomzodni tanladingiz!</b>\n\n` +
        `👤 <b>Ishchi:</b> ${worker?.full_name}\n` +
        `📞 <b>Telefon raqami:</b> <code>${worker?.phone || "Mavjud emas"}</code>\n` +
        `💬 Ishchi bilan bog‘lanib, tafsilotlarni kelishishingiz mumkin.`,
      { parse_mode: "HTML" }
    );

    // Notify Worker
    if (worker?.telegram_id) {
      try {
        const employer = (job as any)?.employer;
        await bot.api.sendMessage(
          worker.telegram_id,
          `🎉 <b>Xushxabar! Sizni ishga tanlashdi!</b>\n\n` +
            `📌 <b>E’lon:</b> ${job?.title}\n` +
            `🏢 <b>Ish beruvchi:</b> ${employer?.full_name || "Ish beruvchi"}\n` +
            `📞 <b>Telefon raqami:</b> <code>${employer?.phone || "Mavjud emas"}</code>\n\n` +
            `Ish beruvchi siz bilan bog‘lanadi yoki siz unga qo‘ng‘iroq qilishingiz mumkin. Omad! 🤝`,
          { parse_mode: "HTML" }
        );
      } catch (e) {
        console.error("Failed to notify worker:", e);
      }
    }
  });

  // Reject Candidate
  bot.callbackQuery(/^emp:reject:(.+)$/, async (ctx) => {
    const appId = ctx.match[1];
    await rejectApplication(appId);
    await ctx.answerCallbackQuery({ text: "Nomzod rad etildi" });
    await ctx.editMessageText("❌ Ushbu nomzod rad etildi.");
  });

  // Close / Stop Job
  bot.callbackQuery(/^emp:close:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const jobId = ctx.match[1];
    await updateJobStatus(jobId, "cancelled");
    await ctx.editMessageText("⏹ E’lon to‘xtatildi va qidiruvdan olindi.");
  });
}
