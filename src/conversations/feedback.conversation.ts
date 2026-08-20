import { InlineKeyboard } from "grammy";
import { MyConversation, MyContext } from "../types/context.js";
import { getUserByTelegramId } from "../services/user.service.js";
import { getWorkerMainMenu, getEmployerMainMenu } from "../keyboards/main-menu.js";
import { modBot } from "../core/bots.js";
import { config } from "../config/env.js";

export async function feedbackConversation(
  conversation: MyConversation,
  ctx: MyContext
) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = await conversation.external(() => getUserByTelegramId(telegramId));
  const activeRole = user?.active_role || "worker";
  const defaultMenu = activeRole === "employer" ? getEmployerMainMenu() : getWorkerMainMenu();

  await ctx.reply(
    "✍️ <b>Murojaat, taklif yoki xatolik haqida xabar berish</b>\n\n" +
      "Botda qandaydir muammoga duch keldingizmi yoki yaxshilash bo‘yicha taklifingiz bormi?\n\n" +
      "Iltimos, barcha fikrlaringizni <b>bitta xabarda yozib yuboring</b> (skrinshot yoki matn ko‘rinishida).\n\n" +
      "Biz uni zudlik bilan texnik guruhimiz va adminlarga yetkazamiz!",
    {
      parse_mode: "HTML",
      reply_markup: {
        keyboard: [[{ text: "❌ Bekor qilish" }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );

  const messageCtx = await conversation.waitFor("message");
  const msg = messageCtx.message;
  const text = msg.text?.trim() || msg.caption?.trim() || "";

  if (text === "❌ Bekor qilish" || text === "/cancel") {
    await ctx.reply("Murojaat bekor qilindi.", {
      reply_markup: defaultMenu,
    });
    return;
  }

  // Forward or send to admin via Moderation Bot
  const adminIds = config.adminTelegramIds.length > 0 ? config.adminTelegramIds : [445057374];
  const userName = user?.full_name || ctx.from?.first_name || "Foydalanuvchi";
  const userPhone = user?.phone ? `<code>${user.phone}</code>` : "Kiritilmagan";
  const userRoleStr = activeRole === "employer" ? "💼 Ish beruvchi" : "👷 Ishchi";
  const userTg = ctx.from?.username ? `@${ctx.from.username}` : "Mavjud emas";

  const adminAlertText = [
    "📬 <b>Yangi foydalanuvchi murojaati / Taklif:</b>",
    "",
    `👤 <b>Foydalanuvchi:</b> ${userName} (${userTg})`,
    `📱 <b>Telefon:</b> ${userPhone}`,
    `🆔 <b>Telegram ID:</b> <code>${telegramId}</code>`,
    `🔄 <b>Roli:</b> ${userRoleStr}`,
    "",
    `📝 <b>Xabar matni:</b>\n${text || "(Rasm yoki fayl yuborildi)"}`,
  ].join("\n");

  const replyKb = new InlineKeyboard().url(
    "💬 Telegramdan yozish",
    ctx.from?.username
      ? `https://t.me/${ctx.from.username}`
      : `tg://user?id=${telegramId}`
  );

  for (const adminId of adminIds) {
    try {
      await modBot.api.sendMessage(adminId, adminAlertText, {
        parse_mode: "HTML",
        reply_markup: replyKb,
      });

      // If photo was sent, forward it too
      if (msg.photo && msg.photo.length > 0) {
        const photoId = msg.photo[msg.photo.length - 1].file_id;
        await modBot.api.sendPhoto(adminId, photoId, {
          caption: `📸 Murojaatga biriktirilgan rasm (Kimdan: ${userName})`,
        });
      }
    } catch (e) {
      console.error(`Failed to send feedback to admin ${adminId}:`, e);
    }
  }

  await ctx.reply(
    "✅ <b>Murojaatingiz qabul qilindi!</b>\n\nFikr va taklifingiz uchun katta rahmat. Adminlarimiz uni albatta ko‘rib chiqishadi.",
    {
      parse_mode: "HTML",
      reply_markup: defaultMenu,
    }
  );
}
