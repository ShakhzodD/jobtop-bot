
function renderAdminUserCard(user: any, index: number, total: number) {
  const isWorker = user.active_role === "worker";
  const roleLabel = isWorker ? "👷 Ishchi" : "💼 Ish beruvchi";
  const tgLink = user.telegram_username
    ? `<a href="https://t.me/${user.telegram_username}">@${user.telegram_username}</a>`
    : `<a href="tg://user?id=${user.telegram_id}">Profilga o‘tish</a>`;

  const regDate = new Date(user.created_at).toLocaleDateString("uz-UZ", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const lines = [
    `👤 <b>${user.full_name}</b> (${index + 1}/${total})`,
    `🔄 <b>Roli:</b> ${roleLabel}`,
    "",
    `📱 <b>Telefon:</b> <code>${user.phone || "Kiritilmagan"}</code>`,
    `💬 <b>Telegram:</b> ${tgLink}`,
    `🆔 <b>Telegram ID:</b> <code>${user.telegram_id}</code>`,
    `📍 <b>Tuman:</b> ${user.district || "Kiritilmagan"}`,
    user.experience_years ? `💼 <b>Tajriba:</b> ${user.experience_years} yil` : "",
    user.worker_categories && user.worker_categories.length > 0
      ? `📂 <b>Sohalar:</b> ${user.worker_categories.join(", ")}`
      : "",
    user.about ? `📝 <b>Haqida:</b> <i>${user.about}</i>` : "",
    "",
    `📅 <b>Ro‘yxatdan o‘tgan:</b> ${regDate}`,
  ].filter(Boolean);

  return lines.join("\n");
}

import { activateProSubscription, boostJob, PRO_PLANS, JOB_BOOST_PLANS } from "../services/payment.service.js";
import { Bot, InlineKeyboard, Keyboard } from "grammy";
import { MyContext } from "../types/context.js";
import { config } from "../config/env.js";
import {
  moderateJob,
  broadcastJobToMatchingWorkers,
} from "../services/moderation.service.js";
import { importTelegramChannelPost } from "../services/import.service.js";
import { getJobById, getPendingModerationJobs, DBJob } from "../services/job.service.js";
import { supabase } from "../core/supabase.js";

export const moderationMenuKeyboard = new Keyboard()
  .text("📋 Moderatsiyadagi e’lonlar")
  .row()
  .text("👥 Foydalanuvchilar")
  .text("📊 Statistika")
  .resized();

function renderModerationCard(job: DBJob) {
  const lines = [
    `🔔 <b>Moderatsiyadagi e’lon:</b>`,
    "",
    `📌 <b>Sarlavha:</b> ${job.title}`,
    `📂 <b>Kategoriya:</b> ${job.category}`,
    `📍 <b>Tuman / Manzil:</b> ${job.district}, ${job.address}`,
    `💰 <b>Ish haqi:</b> ${job.pay_amount.toLocaleString()} so‘m`,
    `👥 <b>Kerakli ishchilar:</b> ${job.openings} ta`,
    `🕒 <b>Vaqti:</b> ${new Date(job.starts_at).toLocaleString("uz-UZ")}`,
    `📝 <b>Tavsif:</b>\n${job.description}`,
    job.source_name ? `\n🔗 <b>Manba:</b> ${job.source_name}` : "",
    job.employer ? `\n👤 <b>Ish beruvchi:</b> ${job.employer.full_name} (${job.employer.phone || "Telefon yo'q"})` : "",
  ];

  return lines.filter(Boolean).join("\n");
}

export function registerAdminHandlers(modBot: Bot<MyContext>, mainBot: Bot<MyContext>) {
  // 6. "👥 Foydalanuvchilar" Button
  modBot.hears("👥 Foydalanuvchilar", async (ctx) => {
    await ctx.replyWithChatAction("typing").catch(() => {});
    const filter = "all";
    const offset = 0;

    const { data: users, count, error } = await supabase
      .from("users")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset);

    if (error || !users || users.length === 0 || count === 0) {
      await ctx.reply("Hozircha foydalanuvchilar topilmadi.", {
        reply_markup: moderationMenuKeyboard,
      });
      return;
    }

    const user = users[0];
    const total = count ?? 0;
    const text = renderAdminUserCard(user, offset, total);

    const keyboard = new InlineKeyboard();
    if (user.telegram_username) {
      keyboard.url("💬 Telegramdan yozish", `https://t.me/${user.telegram_username}`).row();
    }

    // Pagination
    if (offset > 0) {
      keyboard.text("◀️ Oldingi", `admin:users:${filter}:${offset - 1}`);
    }
    keyboard.text(`${offset + 1} / ${total}`, "admin:noop");
    if (offset + 1 < total) {
      keyboard.text("Keyingi ▶️", `admin:users:${filter}:${offset + 1}`);
    }

    keyboard.row();
    keyboard.text("🔍 Hammasi", "admin:users:all:0")
      .text("👷 Ishchilar", "admin:users:worker:0")
      .text("💼 Ish beruvchilar", "admin:users:employer:0");

    await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  // Users Pagination & Filter Callback
  modBot.callbackQuery(/^admin:users:(all|worker|employer):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const filter = ctx.match[1];
    const offset = parseInt(ctx.match[2], 10);

    let query = supabase
      .from("users")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });

    if (filter !== "all") {
      query = query.eq("active_role", filter);
    }

    const { data: users, count, error } = await query.range(offset, offset);

    if (error || !users || users.length === 0 || !count) {
      await ctx.editMessageText("Ushbu filtr bo‘yicha foydalanuvchilar topilmadi.");
      return;
    }

    const user = users[0];
    const total = count ?? 0;
    const text = renderAdminUserCard(user, offset, total);

    const keyboard = new InlineKeyboard();
    if (user.telegram_username) {
      keyboard.url("💬 Telegramdan yozish", `https://t.me/${user.telegram_username}`).row();
    }

    // Pagination
    if (offset > 0) {
      keyboard.text("◀️ Oldingi", `admin:users:${filter}:${offset - 1}`);
    }
    keyboard.text(`${offset + 1} / ${total}`, "admin:noop");
    if (offset + 1 < total) {
      keyboard.text("Keyingi ▶️", `admin:users:${filter}:${offset + 1}`);
    }

    keyboard.row();
    keyboard.text(filter === "all" ? "🔘 Hammasi" : "Hammasi", "admin:users:all:0")
      .text(filter === "worker" ? "🔘 Ishchilar" : "👷 Ishchilar", "admin:users:worker:0")
      .text(filter === "employer" ? "🔘 Ish beruvchilar" : "💼 Ish beruvchilar", "admin:users:employer:0");

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  modBot.callbackQuery("admin:noop", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
  });

  // Admin Confirm Payment & Activate Service
  modBot.callbackQuery(/^admin:pay_app:(pro|boost):(.+):(.+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const paymentType = ctx.match[1];
    const targetId = ctx.match[2];
    const planId = ctx.match[3];
    const userTelegramId = parseInt(ctx.match[4], 10);

    if (paymentType === "pro") {
      const plan = PRO_PLANS[planId];
      const result = await activateProSubscription(userTelegramId, planId);

      await ctx.editMessageCaption({
        caption: (ctx.msg?.caption || "") + "\n\n✅ <b>TO‘LOV TASDIQLANDI VA PRO FAOLLASHTIRILDI!</b>",
        parse_mode: "HTML",
      }).catch(() => {});

      // Notify User on Main Bot
      try {
        await mainBot.api.sendMessage(
          userTelegramId,
          `🎉 <b>To‘lovingiz tasdiqlandi!</b>\n\nSizning <b>${plan?.name || "PRO"}</b> obunangiz muvaffaqiyatli faollashtirildi!\n\nEndi barcha arizalaringiz <b>⭐️ PRO Ishonchli Usta</b> nishoni bilan eng yuqorida chiqadi. Omad!`,
          { parse_mode: "HTML" }
        );
      } catch (e) {}
    } else if (paymentType === "boost") {
      const plan = JOB_BOOST_PLANS[planId];
      const result = await boostJob(targetId, planId);

      await ctx.editMessageCaption({
        caption: (ctx.msg?.caption || "") + "\n\n✅ <b>TO‘LOV TASDIQLANDI VA E’LON TOP QILINDI!</b>",
        parse_mode: "HTML",
      }).catch(() => {});

      // Notify Employer on Main Bot
      try {
        await mainBot.api.sendMessage(
          userTelegramId,
          `🎉 <b>To‘lovingiz tasdiqlandi!</b>\n\nSizning e’loningiz uchun <b>${plan?.name || "Kuchaytirish"}</b> xizmati faollashtirildi va TOP ga chiqarildi!`,
          { parse_mode: "HTML" }
        );
      } catch (e) {}
    }
  });

  // Admin Reject Payment
  modBot.callbackQuery(/^admin:pay_rej:(\d+):(pro|boost)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const userTelegramId = parseInt(ctx.match[1], 10);

    await ctx.editMessageCaption({
      caption: (ctx.msg?.caption || "") + "\n\n❌ <b>TO‘LOV RAD ETILDI!</b>",
      parse_mode: "HTML",
    }).catch(() => {});

    try {
      await mainBot.api.sendMessage(
        userTelegramId,
        "❌ <b>Kechirasiz, to‘lov chekingiz tasdiqlanmadi.</b>\n\nIltimos, to‘lov ma’lumotlarini tekshirib qayta urinib ko‘ring yoki yordam uchun <b>✍️ Murojaat va takliflar</b> bo‘limiga yozing.",
        { parse_mode: "HTML" }
      );
    } catch (e) {}
  });

  // 1. Strict Security Guard: Only ADMIN_TELEGRAM_IDS can interact with Moderation Bot
  modBot.use(async (ctx, next) => {
    const telegramId = ctx.from?.id;
    if (!telegramId || !config.adminTelegramIds.includes(telegramId)) {
      if (ctx.message || ctx.callbackQuery) {
        await ctx.reply(
          "⛔️ <b>Ruxsat yo‘q!</b>\n\nUshbu bot faqat JobTop platformasi adminlari uchun mo‘ljallangan.",
          { parse_mode: "HTML" }
        ).catch(() => {});
      }
      return;
    }
    return next();
  });

  // 2. /start Command for Moderation Bot
  modBot.command("start", async (ctx) => {
    await ctx.reply(
      `👋 Assalomu alaykum, <b>Admin ${ctx.from?.first_name || ""}</b>!\n\n` +
        `Siz <b>JobTop Moderatsiya Boti</b>dasiz.\n\n` +
        `• Barcha yangi e’lonlar to‘g‘ridan-to‘g‘ri shu yerga keladi.\n` +
        `• <b>📋 Moderatsiyadagi e’lonlar</b> tugmasi orqali ko‘rib chiqilmagan e’lonlar ro‘yxatini olishingiz mumkin.\n` +
        `• Boshqa kanallardan postlarni shu botga <b>forward</b> qilsangiz, tizim uni avtomatik tahlil qilib import qiladi.`,
      {
        parse_mode: "HTML",
        reply_markup: moderationMenuKeyboard,
      }
    );
  });

  // 3. "📋 Moderatsiyadagi e’lonlar" Button
  modBot.hears("📋 Moderatsiyadagi e’lonlar", async (ctx) => {
    const pendingJobs = await getPendingModerationJobs();

    if (pendingJobs.length === 0) {
      await ctx.reply(
        "✅ <b>Hozircha moderatsiyada kutilayotgan e’lonlar yo‘q!</b>\n\nBarcha e’lonlar ko‘rib chiqilgan.",
        { parse_mode: "HTML", reply_markup: moderationMenuKeyboard }
      );
      return;
    }

    await ctx.reply(
      `📥 <b>Moderatsiyada kutilayotgan e’lonlar soni: ${pendingJobs.length} ta</b>\n\nHar birini tasdiqlashingiz yoki rad etishingiz mumkin:`,
      { parse_mode: "HTML" }
    );

    for (const job of pendingJobs) {
      const text = renderModerationCard(job);
      const keyboard = new InlineKeyboard()
        .text("✅ Tasdiqlash", `admin:mod:${job.id}:publish`)
        .text("❌ Rad etish", `admin:mod:${job.id}:reject`);

      await ctx.reply(text, {
        parse_mode: "HTML",
        reply_markup: keyboard,
      });
    }
  });

  // 4. "📊 Statistika" Button
  modBot.hears("📊 Statistika", async (ctx) => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [
      { count: usersCount },
      { count: newUsers24h },
      { count: publishedJobsCount },
      { count: newJobs24h },
      { count: pendingJobsCount },
      { count: applicationsCount },
      { count: newApps24h },
    ] = await Promise.all([
      supabase.from("users").select("*", { count: "exact", head: true }),
      supabase.from("users").select("*", { count: "exact", head: true }).gte("created_at", oneDayAgo),
      supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "published"),
      supabase.from("jobs").select("*", { count: "exact", head: true }).gte("created_at", oneDayAgo),
      supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "pending_moderation"),
      supabase.from("applications").select("*", { count: "exact", head: true }),
      supabase.from("applications").select("*", { count: "exact", head: true }).gte("created_at", oneDayAgo),
    ]);

    const statsText = [
      "📊 <b>JobTop Jonli Tizim Statistikasi:</b>",
      "",
      `👥 <b>Foydalanuvchilar:</b> ${usersCount ?? 0} ta <i>(+ ${newUsers24h ?? 0} ta so‘nggi 24 soatda)</i>`,
      `🟢 <b>Faol e’lonlar:</b> ${publishedJobsCount ?? 0} ta <i>(+ ${newJobs24h ?? 0} ta yangi)</i>`,
      `⏳ <b>Kutilayotgan moderatsiya:</b> ${pendingJobsCount ?? 0} ta`,
      `📄 <b>Jami arizalar:</b> ${applicationsCount ?? 0} ta <i>(+ ${newApps24h ?? 0} ta so‘nggi 24 soatda)</i>`,
      "",
      "🟢 <i>Server va barcha kanallar avtomatik monitoringi faol!</i>",
    ].join("\n");

    await ctx.reply(statsText, {
      parse_mode: "HTML",
      reply_markup: moderationMenuKeyboard,
    });
  });

  // 5. Moderation Callback (Approve / Reject)
  modBot.callbackQuery(/^admin:mod:(.+):(publish|reject)$/, async (ctx) => {
    const telegramId = ctx.from.id;
    if (!config.adminTelegramIds.includes(telegramId)) {
      await ctx.answerCallbackQuery({
        text: "Bu amal faqat adminlar uchun!",
        show_alert: true,
      });
      return;
    }

    const jobId = ctx.match[1];
    const action = ctx.match[2] as "publish" | "reject";

    const res = await moderateJob(jobId, action);
    await ctx.answerCallbackQuery({ text: res.message });

    if (res.success && res.job) {
      const statusIcon = action === "publish" ? "✅ Tasdiqlandi (E’lon faol)" : "❌ Rad etildi";
      await ctx.editMessageText(
        `${ctx.callbackQuery.message?.text}\n\n──────────────────\n<b>${statusIcon} (Admin: ${ctx.from.first_name})</b>`,
        { parse_mode: "HTML" }
      );

      // If approved, broadcast to matching workers via Main Bot
      if (action === "publish") {
        await broadcastJobToMatchingWorkers(mainBot.api, res.job);

        // Notify employer via Main Bot
        if (res.job.employer_id) {
          try {
            const { data: emp } = await supabase
              .from("users")
              .select("telegram_id")
              .eq("id", res.job.employer_id)
              .single();

            if (emp?.telegram_id) {
              await mainBot.api.sendMessage(
                emp.telegram_id,
                `✅ <b>E’loningiz tasdiqlandi!</b>\n\n“${res.job.title}” e’loningiz muvaffaqiyatli platformaga chiqarildi. Arizalar kelishi bilan sizga xabar beramiz.`,
                { parse_mode: "HTML" }
              );
            }
          } catch (e) {
            console.error("Failed to notify employer about approval:", e);
          }
        }
      }
    }
  });

  // 6. Admin Forward Import
  modBot.on("message", async (ctx, next) => {
    const telegramId = ctx.from?.id;
    if (!telegramId || !config.adminTelegramIds.includes(telegramId)) {
      return next();
    }

    const msg = ctx.message;
    const text = msg.text?.trim() || msg.caption?.trim();

    // Check if forwarded
    const isForwarded = Boolean(
      (msg as any).forward_origin ||
      (msg as any).forward_from_chat ||
      (msg as any).forward_from
    );

    if (!isForwarded || !text) {
      return next();
    }

    let sourceName = "Forwarded Telegram Channel";
    let sourceUrl: string | undefined = undefined;
    let messageId: number | undefined = undefined;

    const forwardOrigin = (msg as any).forward_origin;
    if (forwardOrigin?.type === "channel") {
      sourceName = forwardOrigin.chat.title || `@${forwardOrigin.chat.username || "channel"}`;
      if (forwardOrigin.chat.username && forwardOrigin.message_id) {
        sourceUrl = `https://t.me/${forwardOrigin.chat.username}/${forwardOrigin.message_id}`;
        messageId = forwardOrigin.message_id;
      }
    } else if ((msg as any).forward_from_chat) {
      const chat = (msg as any).forward_from_chat;
      sourceName = chat.title || `@${chat.username || "channel"}`;
      if (chat.username && (msg as any).forward_from_message_id) {
        sourceUrl = `https://t.me/${chat.username}/${(msg as any).forward_from_message_id}`;
        messageId = (msg as any).forward_from_message_id;
      }
    }

    await ctx.reply("⏳ <i>Forward qilingan e’lon tahlil qilinmoqda...</i>", {
      parse_mode: "HTML",
    });

    try {
      const result = await importTelegramChannelPost(text, sourceName, sourceUrl, messageId);

      if (result.status === "queued" && result.jobId) {
        const keyboard = new InlineKeyboard()
          .text("✅ Tasdiqlash", `admin:mod:${result.jobId}:publish`)
          .text("❌ Rad etish", `admin:mod:${result.jobId}:reject`);

        await ctx.reply(
          `🎉 <b>E’lon muvaffaqiyatli import qilindi!</b>\n\n${result.details}\n\nQuyidagi tugmalar orqali tasdiqlang:`,
          {
            parse_mode: "HTML",
            reply_markup: keyboard,
          }
        );
      } else if (result.status === "duplicate") {
        await ctx.reply(`ℹ️ <b>Dublikat:</b> Bu e’lon avval bazaga kiritilgan.`, {
          parse_mode: "HTML",
        });
      } else {
        await ctx.reply(
          `⚠️ <b>Ma’lumot to‘liq emas:</b> ${result.details}\n(E’lon <i>ai_job_imports</i> jadvaliga saqlandi).`,
          { parse_mode: "HTML" }
        );
      }
    } catch (error: any) {
      console.error("Forward import error:", error);
      await ctx.reply(`❌ Importda xatolik yuz berdi.`);
    }
  });
}
