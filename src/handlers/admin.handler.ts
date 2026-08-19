import { Bot, InlineKeyboard } from "grammy";
import { MyContext } from "../types/context.js";
import { config } from "../config/env.js";
import {
  moderateJob,
  broadcastJobToMatchingWorkers,
} from "../services/moderation.service.js";
import { importTelegramChannelPost } from "../services/import.service.js";
import { getJobById } from "../services/job.service.js";

export function registerAdminHandlers(bot: Bot<MyContext>) {
  // Moderation Callback (Approve / Reject)
  bot.callbackQuery(/^admin:mod:(.+):(publish|reject)$/, async (ctx) => {
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
      const statusIcon = action === "publish" ? "✅ Tasdiqlandi" : "❌ Rad etildi";
      await ctx.editMessageText(
        `${ctx.callbackQuery.message?.text}\n\n──────────────────\n<b>${statusIcon} (Admin tomonidan)</b>`,
        { parse_mode: "HTML" }
      );

      // If approved, broadcast to workers
      if (action === "publish") {
        await broadcastJobToMatchingWorkers(bot, res.job);

        // Notify employer if not external
        if (res.job.employer_id) {
          try {
            const { supabase } = await import("../core/supabase.js");
            const { data: emp } = await supabase
              .from("users")
              .select("telegram_id")
              .eq("id", res.job.employer_id)
              .single();

            if (emp?.telegram_id) {
              await bot.api.sendMessage(
                emp.telegram_id,
                `✅ <b>E’loningiz tasdiqlandi!</b>\n\n“${res.job.title}” e’loningiz platformaga chiqarildi. Arizalar tushganda sizga xabar beramiz.`,
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

  // Admin Direct View Single Job
  bot.callbackQuery(/^job:view:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const jobId = ctx.match[1];
    const job = await getJobById(jobId);

    if (!job || job.status !== "published") {
      await ctx.reply("Ushbu e’lon endi faol emas.");
      return;
    }

    const text = [
      `📋 <b>${job.title}</b>`,
      "",
      `📂 <b>Kategoriya:</b> ${job.category}`,
      `📍 <b>Tuman:</b> ${job.district}`,
      `🏢 <b>Manzil:</b> ${job.address}`,
      `💰 <b>Ish haqi:</b> ${job.pay_amount.toLocaleString()} so‘m`,
      `👥 <b>Bo‘sh o‘rinlar:</b> ${job.openings} ta`,
      `🕒 <b>Boshlanish vaqti:</b> ${new Date(job.starts_at).toLocaleString("uz-UZ")}`,
      "",
      `📝 <b>Tavsif:</b>\n${job.description}`,
    ].join("\n");

    const keyboard = new InlineKeyboard();
    if (job.source_url) {
      keyboard.url("🌐 Asl manba", job.source_url);
    } else {
      keyboard.text("✋ Ariza yuborish", `worker:apply:${job.id}:all:0`);
    }

    await ctx.reply(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  // Admin Forward Import: When an admin forwards a message from a channel
  bot.on("message", async (ctx, next) => {
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

    // Determine channel / source details
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

    await ctx.reply("🤖 <i>Forward qilingan e’lon Gemini AI orqali tahlil qilinmoqda...</i>", {
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
      await ctx.reply(`❌ Importda xatolik: ${error?.message || "Noma'lum xatolik"}`);
    }
  });
}
