import { JOB_BOOST_PLANS, boostJob, PAYMENT_CARD } from "../services/payment.service.js";
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
  getSelectedWorkersForJob,
} from "../services/application.service.js";
import { createReview, getUserRating } from "../services/review.service.js";

export function registerEmployerHandlers(mainBot: Bot<MyContext>) {
  // Employer Job Boost Menu
  mainBot.callbackQuery(/^emp:boost_menu:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const jobId = ctx.match[1];
    const job = await getJobById(jobId);
    if (!job) return;

    const text = [
      `🚀 <b>"${job.title}" e’lonini kuchaytirish</b>`,
      "",
      "Ishchilarni bir necha daqiqada topish uchun xizmat turini tanlang:",
      "",
      `🔥 <b>1. TOP E’lon (24 soat) — ${JOB_BOOST_PLANS.boost_top.price.toLocaleString()} so‘m</b>`,
      "• E’lon 24 soat davomida lentaning eng yuqori qismida olovli nishon bilan turadi.",
      "",
      `⚡️ <b>2. Tezkor Broadcast — ${JOB_BOOST_PLANS.boost_broadcast.price.toLocaleString()} so‘m</b>`,
      "• Mos sohadagi barcha 500+ ishchilarga shaxsiy Push-signal boradi.",
      "",
      `💎 <b>3. Super Paket — ${JOB_BOOST_PLANS.boost_super.price.toLocaleString()} so‘m</b>`,
      "• Ham 24 soat TOP’da turish, ham barcha ishchilarga tezkor push-signal yuborish!",
    ].join("\n");

    const keyboard = new InlineKeyboard()
      .text(`🔥 TOP E’lon (${JOB_BOOST_PLANS.boost_top.price.toLocaleString()} so‘m)`, `emp:pay_boost:${job.id}:boost_top`)
      .row()
      .text(`⚡️ Tezkor Broadcast (${JOB_BOOST_PLANS.boost_broadcast.price.toLocaleString()} so‘m)`, `emp:pay_boost:${job.id}:boost_broadcast`)
      .row()
      .text(`💎 Super Paket (${JOB_BOOST_PLANS.boost_super.price.toLocaleString()} so‘m)`, `emp:pay_boost:${job.id}:boost_super`)
      .row()
      .text("🔙 Bekor qilish", "emp:back_jobs");

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  // Choose payment method for Boost
  mainBot.callbackQuery(/^emp:pay_boost:(.+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const jobId = ctx.match[1];
    const planId = ctx.match[2];
    const plan = JOB_BOOST_PLANS[planId];
    if (!plan) return;

    const text = [
      `🚀 <b>${plan.name}</b>`,
      "",
      `💰 To‘lov summasi: <b>${plan.price.toLocaleString()} so‘m</b>`,
      `📝 ${plan.description}`,
      "",
      "💳 <b>To‘lov uchun karta ma’lumotlari:</b>",
      `💳 Karta raqami: <code>${PAYMENT_CARD.number}</code> <i>(bosilsa nusxalanadi)</i>`,
      `👤 Karta egasi: <b>${PAYMENT_CARD.holder}</b>`,
      `🏦 Bank: ${PAYMENT_CARD.bank}`,
      "",
      "To‘lovni amalga oshirgach, pastdagi <b>“📸 Chekni yuborish”</b> tugmasini bosing 👇",
    ].join("\n");

    const keyboard = new InlineKeyboard()
      .text("📸 To‘lov chekini yuborish", `emp:upload_receipt:${jobId}:${planId}`)
      .row()
      .text("⚡️ Test to‘lov (Darhol faollashtirish)", `emp:exec_boost:${jobId}:${planId}:test`)
      .row()
      .text("🔙 Ortga", `emp:boost_menu:${jobId}`);

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  // Execute Boost
  mainBot.callbackQuery(/^emp:exec_boost:(.+):(.+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const jobId = ctx.match[1];
    const planId = ctx.match[2];

    const result = await boostJob(jobId, planId);
    if (!result.success) {
      await ctx.reply(result.message);
      return;
    }

    await ctx.editMessageText(
      result.message + "\n\nE’loningiz muvaffaqiyatli kuchaytirildi va nomzodlar oqimi boshlandi! 🎉",
      { parse_mode: "HTML" }
    );
  });

  // 1. Create Job
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

  // 2. My Jobs
  mainBot.hears("📋 Mening e’lonlarim", async (ctx) => {
    await ctx.replyWithChatAction("typing").catch(() => {});
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
      filled: "✅ To‘ldi (Barcha ishchilar tanlandi)",
      completed: "🏁 Yakunlangan",
      cancelled: "❌ Bekor qilingan",
    };

    for (const job of jobs.slice(0, 10)) {
      const applications = await getJobApplications(job.id);
      const pendingCount = applications.filter((a) => a.status === "pending").length;
      const selectedApps = applications.filter((a) => a.status === "selected");
      const selectedCount = selectedApps.reduce((acc, a) => acc + (a.party_size || 1), 0);

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

      if (job.status === "published" || job.status === "filled") {
        if (selectedCount > 0) {
          keyboard.text("🏁 Ishni yakunlash va baholash", `emp:finish:${job.id}`).row();
        }
        keyboard.text("⏹ E’lonni to‘xtatish", `emp:close:${job.id}`);
      }

      await ctx.reply(jobCard, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    }
  });

  // 3. View Applicants with Group Info
  mainBot.callbackQuery(/^emp:apps:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const jobId = ctx.match[1];
    const job = await getJobById(jobId);
    const applications = await getJobApplications(jobId);

    if (applications.length === 0) {
      await ctx.reply("Ushbu e’longa hali arizalar kelmagan.");
      return;
    }

    for (const app of applications) {
      const worker = app.worker;
      const workerRating = worker ? await getUserRating(worker.id) : null;
      const partySize = app.party_size || 1;
      const totalPay = job ? job.pay_amount * partySize : null;

      const appText = [
        `👤 <b>Nomzod:</b> ${worker?.full_name || "Noma'lum"}`,
        partySize > 1
          ? `👥 <b>Keluvchilar soni:</b> <b>${partySize} kishi</b> (Sheriklari bilan)`
          : `👥 <b>Keluvchilar soni:</b> 1 kishi`,
        totalPay && partySize > 1
          ? `💰 <b>Jami to‘lov:</b> ${totalPay.toLocaleString()} so‘m`
          : "",
        workerRating ? `⭐️ <b>Reytingi:</b> ${workerRating.starsStr}` : "",
        worker?.phone ? `📞 <b>Telefon:</b> <code>${worker.phone}</code>` : "",
        worker?.telegram_username ? `💬 <b>Telegram:</b> @${worker.telegram_username}` : "",
        worker?.district ? `📍 <b>Tuman:</b> ${worker.district}` : "",
        typeof worker?.experience_years === "number" ? `💼 <b>Tajriba:</b> ${worker.experience_years} yil` : "",
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
          .text(
            partySize > 1 ? `✅ ${partySize} kishini qabul qilish` : "✅ Qabul qilish",
            `emp:select:${app.id}`
          )
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

  // 4. Select Candidate with Group & Share Button
  mainBot.callbackQuery(/^emp:select:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const appId = ctx.match[1];
    const { application: app, isJobFilled, selectedCount, openings } =
      await selectApplication(appId);

    if (!app) {
      await ctx.reply("Nomzodni tanlashda xatolik yuz berdi.");
      return;
    }

    const worker = app.worker;
    const job = app.job;
    const partySize = app.party_size || 1;
    const workerName = worker?.full_name || "Nomzod";

    let responseMsg =
      `🎉 <b>Siz ${partySize > 1 ? `${workerName} boshchiligidagi ${partySize} kishini` : workerName} ishga tanladingiz!</b>\n\n` +
      `👤 <b>Mas’ul ishchi:</b> ${workerName}\n` +
      `📞 <b>Telefon raqami:</b> <code>${worker?.phone || "Mavjud emas"}</code>\n` +
      (worker?.telegram_username ? `💬 <b>Telegram:</b> @${worker.telegram_username}\n` : "") +
      `\nTanlangan jami ishchilar: <b>${selectedCount}/${openings} ta</b>.`;

    if (isJobFilled) {
      responseMsg += `\n\n🎊 <b>Barcha kerakli ishchilar soni to‘ldi!</b> E’lon avtomatik ravishda to‘lganlar qatoriga o‘tkazildi va qidiruvdan olindi.`;
    }

    await ctx.reply(responseMsg, { parse_mode: "HTML" });

    // Notify Worker with details & Share Button for their crew!
    if (worker?.telegram_id) {
      try {
        const employer = (job as any)?.employer;
        const totalPay = (job?.pay_amount || 0) * partySize;
        const startsAtFormatted = job?.starts_at
          ? new Date(job.starts_at).toLocaleString("uz-UZ", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "Kelishilgan vaqtda";

        const workerNotifyText = [
          `🎉 <b>Xushxabar! Ish beruvchi sizni ${partySize > 1 ? `(${partySize} kishi uchun)` : ""} ishga qabul qildi!</b>`,
          "",
          `📌 <b>E’lon:</b> ${job?.title}`,
          `📍 <b>Manzil:</b> ${job?.district || ""}, ${job?.address || ""}`,
          `🕒 <b>Vaqt:</b> ${startsAtFormatted}`,
          `💰 <b>Haq:</b> ${job?.pay_amount.toLocaleString()} so‘m (bir kishi uchun)` +
            (partySize > 1 ? ` (Jami ${partySize} kishi uchun: <b>${totalPay.toLocaleString()} so‘m</b>)` : ""),
          `🏢 <b>Ish beruvchi:</b> ${employer?.full_name || "Ish beruvchi"}`,
          `📞 <b>Telefon raqami:</b> <code>${employer?.phone || "Mavjud emas"}</code>`,
          employer?.telegram_username ? `💬 <b>Telegram:</b> @${employer.telegram_username}` : "",
          "",
          partySize > 1
            ? `💡 <i>Pastdagi tugma orqali ish manzili va vaqtini Telegramdagi sheriklaringizga darhol yuborishingiz mumkin:</i>`
            : `Ish beruvchi siz bilan bog‘lanadi yoki siz unga qo‘ng‘iroq qilishingiz mumkin. Omad! 🤝`,
        ]
          .filter(Boolean)
          .join("\n");

        const workerKb = new InlineKeyboard();

        if (partySize > 1) {
          const shareText = `JobTop orqali ish topildi:\n📌 Ish: ${job?.title}\n📍 Manzil: ${job?.district}, ${job?.address}\n🕒 Vaqt: ${startsAtFormatted}\n💰 Kunlik haq: ${job?.pay_amount.toLocaleString()} so‘mdan\n👤 Ish beruvchi: ${employer?.full_name} (${employer?.phone || ""})`;
          const shareUrl = `https://t.me/share/url?url=${encodeURIComponent("https://t.me/jobtopuzbot")}&text=${encodeURIComponent(shareText)}`;
          workerKb.url("📤 Manzilni sheriklarga yuborish", shareUrl);
        }

        await mainBot.api.sendMessage(worker.telegram_id, workerNotifyText, {
          parse_mode: "HTML",
          reply_markup: partySize > 1 ? workerKb : undefined,
        });
      } catch (e) {
        console.error("Failed to notify worker:", e);
      }
    }
  });

  // 5. Reject Candidate
  mainBot.callbackQuery(/^emp:reject:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const appId = ctx.match[1];
    const app = await rejectApplication(appId);

    if (!app) {
      return;
    }

    await ctx.editMessageText("❌ Ushbu nomzod arizasi rad etildi.");

    const worker = app.worker;
    const job = app.job;

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

  // 6. Complete Job & Rate Workers
  mainBot.callbackQuery(/^emp:finish:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const jobId = ctx.match[1];
    const job = await getJobById(jobId);

    if (!job) {
      await ctx.reply("E’lon topilmadi.");
      return;
    }

    await updateJobStatus(jobId, "completed");

    const selectedApps = await getSelectedWorkersForJob(jobId);

    await ctx.editMessageText(
      `🏁 <b>“${job.title}” e’loni yakunlandi!</b>\n\n` +
        `Quyida qatnashgan ishchilarni baholang:`,
      { parse_mode: "HTML" }
    );

    if (selectedApps.length === 0) {
      await ctx.reply("Ushbu ish uchun tanlangan ishchilar topilmadi.");
      return;
    }

    for (const app of selectedApps) {
      const worker = app.worker;
      if (!worker) continue;

      const rateKeyboard = new InlineKeyboard()
        .text("⭐️ 1", `emp:rate:${jobId}:${worker.id}:1`)
        .text("⭐️ 2", `emp:rate:${jobId}:${worker.id}:2`)
        .text("⭐️ 3", `emp:rate:${jobId}:${worker.id}:3`)
        .text("⭐️ 4", `emp:rate:${jobId}:${worker.id}:4`)
        .text("⭐️ 5", `emp:rate:${jobId}:${worker.id}:5`);

      await ctx.reply(
        `👤 <b>Ishchi:</b> ${worker.full_name} (${app.party_size || 1} kishi)\n\nUshbu ishchining faoliyatini 1 dan 5 gacha baholang:`,
        {
          parse_mode: "HTML",
          reply_markup: rateKeyboard,
        }
      );
    }
  });

  // 7. Handle Star Rating
  mainBot.callbackQuery(/^emp:rate:(.+):(.+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const telegramId = ctx.from.id;
    const employer = await getUserByTelegramId(telegramId);
    if (!employer) return;

    const jobId = ctx.match[1];
    const workerUserId = ctx.match[2];
    const rating = parseInt(ctx.match[3], 10);

    await createReview({
      jobId,
      authorId: employer.id,
      recipientId: workerUserId,
      rating,
    });

    await ctx.editMessageText(
      `✅ <b>Ishchiga ${"⭐️".repeat(rating)} (${rating} ball) baho berildi!</b>\nRahmat, sizning bahoyingiz platforma sifatini oshirishga yordam beradi.`,
      { parse_mode: "HTML" }
    );

    // Notify Worker about their new rating!
    try {
      const { data: workerUser } = await (await import("../core/supabase.js")).supabase
        .from("users")
        .select("telegram_id")
        .eq("id", workerUserId)
        .single();

      if (workerUser?.telegram_id) {
        await mainBot.api.sendMessage(
          workerUser.telegram_id,
          `🎉 <b>Ish beruvchi sizni baholadi!</b>\n\n` +
            `Sizga <b>${"⭐️".repeat(rating)} (${rating} ball)</b> reyting berildi.\n` +
            `Profilingizdagi umumiy reyting yangilandi!`,
          { parse_mode: "HTML" }
        );
      }
    } catch (e) {
      console.error("Failed to notify worker about rating:", e);
    }
  });

  // 8. Close / Stop Job
  mainBot.callbackQuery(/^emp:close:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const jobId = ctx.match[1];
    await updateJobStatus(jobId, "cancelled");
    await ctx.editMessageText("⏹ E’lon to‘xtatildi va qidiruvdan olindi.");
  });
}
