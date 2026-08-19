import { InlineKeyboard } from "grammy";
import { MyConversation, MyContext } from "../types/context.js";
import { parseJobWithGemini, JOB_CATEGORIES, JobCategory } from "../core/gemini.js";
import { createJob } from "../services/job.service.js";
import { getUserByTelegramId } from "../services/user.service.js";
import { notifyAdminsAboutJob } from "../services/moderation.service.js";
import { getEmployerMainMenu } from "../keyboards/main-menu.js";

export async function createJobConversation(
  conversation: MyConversation,
  ctx: MyContext
) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = await conversation.external(() => getUserByTelegramId(telegramId));
  if (!user) {
    await ctx.reply("Iltimos, avval /start buyrug‘ini bosing.");
    return;
  }

  await ctx.reply(
    `📝 <b>Yangi e’lon yaratish</b>\n\n` +
      `E’loningiz haqida barcha ma’lumotlarni <b>bitta xabarda erkin matn bilan yozing</b> (yoki ovozli xabar yuboring).\n\n` +
      `<i>Masalan: “Ertaga Chilonzorda 2 ta baquvvat yigit kerak, mebel ko‘chirishga. Soat 09:00 dan 18:00 gacha. Kunlik haq: 250 000 so‘m. Tushlik beriladi.”</i>\n\n` +
      `🤖 Bizning AI uni avtomatik tarzda chiroyli e’longa aylantiradi!`,
    {
      parse_mode: "HTML",
      reply_markup: {
        keyboard: [[{ text: "❌ Bekor qilish" }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );

  const messageCtx = await conversation.waitFor("message:text");
  const text = messageCtx.message.text.trim();

  if (text === "❌ Bekor qilish" || text === "/cancel") {
    await ctx.reply("E’lon yaratish bekor qilindi.", {
      reply_markup: getEmployerMainMenu(),
    });
    return;
  }

  await ctx.reply("⏳ <i>Gemini AI e’loningizni tahlil qilmoqda...</i>", {
    parse_mode: "HTML",
  });

  try {
    const parsed = await conversation.external(() =>
      parseJobWithGemini(text, `Ish beruvchi: ${user.full_name}`)
    );

    const category: JobCategory = parsed.category || "Xizmat";
    const title = parsed.title || "Kunlik ishchi kerak";
    const district = parsed.district || user.district || "Toshkent";
    const address = parsed.address || "Toshkent shahri";
    const payAmount = parsed.payAmount || 200000;
    const openings = parsed.openings || 1;
    const description = parsed.description || text;
    const startsAt = parsed.startsAt || new Date().toISOString();
    const endsAt =
      parsed.endsAt || new Date(Date.now() + 8 * 3600 * 1000).toISOString();

    const summaryText = [
      "📋 <b>E’lon ko‘rinishi:</b>",
      "",
      `📌 <b>Sarlavha:</b> ${title}`,
      `📂 <b>Kategoriya:</b> ${category}`,
      `📍 <b>Tuman / Manzil:</b> ${district}, ${address}`,
      `💰 <b>Ish haqi:</b> ${payAmount.toLocaleString()} so‘m`,
      `👥 <b>Ishchilar soni:</b> ${openings} ta`,
      `📝 <b>Tavsif:</b> ${description}`,
      "",
      "E’lonni moderatsiyaga yuborishni tasdiqlaysizmi?",
    ].join("\n");

    const confirmKeyboard = new InlineKeyboard()
      .text("✅ Tasdiqlash va yuborish", "job:confirm_create")
      .row()
      .text("❌ Bekor qilish", "job:cancel_create");

    const previewMsg = await ctx.reply(summaryText, {
      parse_mode: "HTML",
      reply_markup: confirmKeyboard,
    });

    const actionCtx = await conversation.waitFor("callback_query:data");
    await actionCtx.answerCallbackQuery();

    if (actionCtx.callbackQuery.data === "job:confirm_create") {
      const createdJob = await conversation.external(() =>
        createJob({
          employer_id: user.id,
          category,
          title,
          description,
          district,
          address,
          starts_at: startsAt,
          ends_at: endsAt,
          pay_amount: payAmount,
          openings,
          status: "pending_moderation",
        })
      );

      // Notify admins
      await conversation.external(() =>
        notifyAdminsAboutJob(ctx.api as any, createdJob)
      );

      await ctx.api.deleteMessage(ctx.chat!.id, previewMsg.message_id).catch(() => {});
      await ctx.reply(
        "🎉 <b>E’loningiz moderatsiyaga yuborildi!</b>\n\nAdmin tasdiqlashi bilan ishchilarga ko‘rinadi va sizga xabar beramiz.",
        {
          parse_mode: "HTML",
          reply_markup: getEmployerMainMenu(),
        }
      );
    } else {
      await ctx.api.deleteMessage(ctx.chat!.id, previewMsg.message_id).catch(() => {});
      await ctx.reply("E’lon bekor qilindi.", {
        reply_markup: getEmployerMainMenu(),
      });
    }
  } catch (err: any) {
    console.error("Error creating job with AI:", err);
    await ctx.reply(
      `❌ E’lonni tahlil qilishda xatolik yuz berdi: ${err?.message || "Noma'lum xatolik"}.\n\nQaytadan urinib ko‘ring.`,
      {
        reply_markup: getEmployerMainMenu(),
      }
    );
  }
}
