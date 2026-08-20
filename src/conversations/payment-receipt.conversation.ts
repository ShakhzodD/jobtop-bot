import { InlineKeyboard } from "grammy";
import { MyConversation, MyContext } from "../types/context.js";
import { getUserByTelegramId } from "../services/user.service.js";
import { PAYMENT_CARD, PRO_PLANS, JOB_BOOST_PLANS } from "../services/payment.service.js";
import { getWorkerMainMenu, getEmployerMainMenu } from "../keyboards/main-menu.js";
import { modBot } from "../core/bots.js";
import { config } from "../config/env.js";

export async function paymentReceiptConversation(
  conversation: MyConversation,
  ctx: MyContext
) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const session = ctx.session as any;
  const paymentType: "pro" | "boost" = session.pendingPaymentType || "pro";
  const planId: string = session.pendingPlanId || "pro_1week";
  const targetId: string = session.pendingTargetId || String(telegramId);

  const plan = paymentType === "pro" ? PRO_PLANS[planId] : JOB_BOOST_PLANS[planId];
  const user = await conversation.external(() => getUserByTelegramId(telegramId));
  const activeRole = user?.active_role || "worker";
  const defaultMenu = activeRole === "employer" ? getEmployerMainMenu() : getWorkerMainMenu();

  if (!plan) {
    await ctx.reply("To‘lov ma’lumotlarida xatolik yuz berdi. Qaytadan urinib ko‘ring.", {
      reply_markup: defaultMenu,
    });
    return;
  }

  const promptText = [
    "💳 <b>To‘lov ma’lumotlari:</b>",
    "",
    `💎 <b>Xizmat:</b> ${plan.name}`,
    `💰 <b>To‘lov summasi:</b> <b>${plan.price.toLocaleString()} so‘m</b>`,
    "",
    `💳 <b>Karta raqami:</b> <code>${PAYMENT_CARD.number}</code> <i>(bosilsa nusxalanadi)</i>`,
    `👤 <b>Karta egasi:</b> <b>${PAYMENT_CARD.holder}</b>`,
    `🏦 <b>Turi:</b> ${PAYMENT_CARD.bank}`,
    "",
    "📸 To‘lovni amalga oshirgach, to‘lov chekini (skrinshotini) <b>shu yerga rasm ko‘rinishida yuboring:</b>",
  ].join("\n");

  await ctx.reply(promptText, {
    parse_mode: "HTML",
    reply_markup: {
      keyboard: [[{ text: "❌ Bekor qilish" }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  });

  const messageCtx = await conversation.waitFor("message");
  const msg = messageCtx.message;
  const text = msg.text?.trim() || "";

  if (text === "❌ Bekor qilish" || text === "/cancel") {
    await ctx.reply("To‘lov jarayoni bekor qilindi.", {
      reply_markup: defaultMenu,
    });
    return;
  }

  const photoId = msg.photo && msg.photo.length > 0 ? msg.photo[msg.photo.length - 1].file_id : null;
  const docId = msg.document?.file_id;

  if (!photoId && !docId) {
    await ctx.reply("Iltimos, to‘lov skrinshotini (rasm yoki fayl ko‘rinishida) yuboring. Jarayon bekor qilindi.", {
      reply_markup: defaultMenu,
    });
    return;
  }

  // Forward to Moderation Bot with 1-tap confirmation button
  const adminIds = config.adminTelegramIds.length > 0 ? config.adminTelegramIds : [445057374];
  const userName = user?.full_name || ctx.from?.first_name || "Foydalanuvchi";
  const userPhone = user?.phone ? `<code>${user.phone}</code>` : "Kiritilmagan";
  const userTg = ctx.from?.username ? `@${ctx.from.username}` : "Username yo‘q";

  const adminCaption = [
    "💰 <b>Yangi to‘lov cheki qabul qilindi!</b>",
    "",
    `👤 <b>Foydalanuvchi:</b> ${userName} (${userTg})`,
    `📱 <b>Telefon:</b> ${userPhone}`,
    `🆔 <b>Telegram ID:</b> <code>${telegramId}</code>`,
    "",
    `💎 <b>Xizmat:</b> ${plan.name}`,
    `💵 <b>Kutilgan summa:</b> <b>${plan.price.toLocaleString()} so‘m</b>`,
    "",
    "<i>Quyidagi tugma orqali to‘lovni tekshirib, xizmatni 1 bosishda faollashtiring:</i>",
  ].join("\n");

  const adminKb = new InlineKeyboard()
    .text("✅ Tasdiqlash va faollashtirish", `admin:pay_app:${paymentType}:${targetId}:${planId}:${telegramId}`)
    .row()
    .text("❌ Rad etish", `admin:pay_rej:${telegramId}:${paymentType}`);

  await conversation.external(async () => {
    for (const adminId of adminIds) {
      try {
        if (photoId) {
          await modBot.api.sendPhoto(adminId, photoId, {
            caption: adminCaption,
            parse_mode: "HTML",
            reply_markup: adminKb,
          });
        } else if (docId) {
          await modBot.api.sendDocument(adminId, docId, {
            caption: adminCaption,
            parse_mode: "HTML",
            reply_markup: adminKb,
          });
        }
      } catch (e) {
        console.error(`Failed to forward receipt to admin ${adminId}:`, e);
      }
    }
  });

  await ctx.reply(
    "✅ <b>To‘lov chekingiz muvaffaqiyatli qabul qilindi!</b>\n\n" +
      "Adminlarimiz to‘lovni tekshirib, 5–15 daqiqa ichida xizmatni faollashtiradilar va sizga xabar yuboriladi.",
    {
      parse_mode: "HTML",
      reply_markup: defaultMenu,
    }
  );
}
