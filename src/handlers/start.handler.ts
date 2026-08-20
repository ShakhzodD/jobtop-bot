import { Bot, InlineKeyboard } from "grammy";
import { MyContext } from "../types/context.js";
import {
  getUserByTelegramId,
  upsertUser,
  setActiveRole,
  getProfileCompletionStatus,
} from "../services/user.service.js";
import { roleSelectionKeyboard, contactRequestKeyboard } from "../keyboards/auth.js";
import { getWorkerMainMenu, getEmployerMainMenu } from "../keyboards/main-menu.js";

export function registerStartHandlers(bot: Bot<MyContext>) {
  // Support & Feedback
  bot.hears("✍️ Murojaat va takliflar", async (ctx) => {
    await ctx.conversation.enter("feedbackConversation");
  });

  bot.command("start", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await getUserByTelegramId(telegramId);

    if (user && user.phone) {
      ctx.session.role = user.active_role;
      const menu =
        user.active_role === "employer"
          ? getEmployerMainMenu()
          : getWorkerMainMenu();

      await ctx.reply(
        `Xush kelibsiz, <b>${user.full_name}</b>! 👋\n\n` +
          `Siz <b>${
            user.active_role === "employer" ? "💼 Ish beruvchi" : "👷 Ishchi"
          }</b> rejimidasiz.\n` +
          `Quyidagi menyudan kerakli bo‘limni tanlang:`,
        { parse_mode: "HTML", reply_markup: menu }
      );
      return;
    }

    const fullName = [ctx.from?.first_name, ctx.from?.last_name]
      .filter(Boolean)
      .join(" ");

    await ctx.reply(
      `Assalomu alaykum, <b>${fullName || "Foydalanuvchi"}</b>! 👋\n\n` +
        `<b>JobTop</b> — O‘zbekistondagi bir kunlik ishlar platformasiga xush kelibsiz.\n\n` +
        `Davom etish uchun o‘z rolingizni tanlang:`,
      {
        parse_mode: "HTML",
        reply_markup: roleSelectionKeyboard,
      }
    );
  });

  // Handle role selection callbacks
  bot.callbackQuery(/^auth:role:(worker|employer)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const role = ctx.match[1] as "worker" | "employer";
    ctx.session.role = role;

    const telegramId = ctx.from.id;
    const fullName = [ctx.from.first_name, ctx.from.last_name]
      .filter(Boolean)
      .join(" ") || "Foydalanuvchi";

    await upsertUser({
      telegram_id: telegramId,
      full_name: fullName,
      telegram_username: ctx.from.username ?? null,
      active_role: role,
    });

    await ctx.editMessageText(
      `✅ Rolingiz tanlandi: <b>${
        role === "employer" ? "💼 Ish beruvchi" : "👷 Ishchi"
      }</b>.\n\n` +
        `Endi ro‘yxatdan o‘tishni yakunlash uchun <b>telefon raqamingizni</b> yuboring:`,
      {
        parse_mode: "HTML",
      }
    );

    await ctx.reply("Pastdagi tugmani bosing 👇", {
      reply_markup: contactRequestKeyboard,
    });
  });

  // Handle contact sharing
  bot.on("message:contact", async (ctx) => {
    const contact = ctx.message.contact;
    const telegramId = ctx.from?.id;
    if (!telegramId || !contact) return;

    if (contact.user_id && contact.user_id !== telegramId) {
      await ctx.reply(
        "Iltimos, faqat o‘z telefon raqamingizni pastdagi tugma orqali yuboring.",
        { reply_markup: contactRequestKeyboard }
      );
      return;
    }

    const fullName = [ctx.from?.first_name, ctx.from?.last_name]
      .filter(Boolean)
      .join(" ") || "Foydalanuvchi";

    const user = await upsertUser({
      telegram_id: telegramId,
      full_name: fullName,
      telegram_username: ctx.from?.username ?? null,
      phone: contact.phone_number,
      active_role: ctx.session.role ?? "worker",
    });

    ctx.session.role = user.active_role;
    const menu =
      user.active_role === "employer"
        ? getEmployerMainMenu()
        : getWorkerMainMenu();

    await ctx.reply(
      `🎉 <b>Tabriklaymiz, siz JobTop platformasida muvaffaqiyatli ro‘yxatdan o‘tdingiz!</b>\n\n` +
        `Siz hozir <b>${
          user.active_role === "employer" ? "💼 Ish beruvchi" : "👷 Ishchi"
        }</b> rejimidasiz.`,
      {
        parse_mode: "HTML",
        reply_markup: menu,
      }
    );

    // Profile Completion Prompt for Workers
    if (user.active_role === "worker") {
      const { percent } = getProfileCompletionStatus(user);
      if (percent < 100) {
        const promptKeyboard = new InlineKeyboard().text(
          "✏️ Profilni to‘ldirish",
          "worker:edit_profile"
        );

        await ctx.reply(
          `💡 <b>Muhim maslahat:</b>\n\n` +
            `Ish beruvchilar sizni tezroq tanlashi uchun profilingizni to‘ldiring (yashash tumani, ish tajribangiz va o‘zingiz haqingizda ma’lumot).\n\n` +
            `To‘liq profilli ishchilar <b>3 barobar tezroq</b> ishga tanlanadi! 🚀`,
          {
            parse_mode: "HTML",
            reply_markup: promptKeyboard,
          }
        );
      }
    }
  });

  // Switch role to Employer
  bot.hears("🔄 Ish beruvchi rejimiga o‘tish", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    await setActiveRole(telegramId, "employer");
    ctx.session.role = "employer";

    await ctx.reply("Siz <b>💼 Ish beruvchi</b> rejimiga o‘tdingiz!", {
      parse_mode: "HTML",
      reply_markup: getEmployerMainMenu(),
    });
  });

  // Switch role to Worker
  bot.hears("🔄 Ishchi rejimiga o‘tish", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    await setActiveRole(telegramId, "worker");
    ctx.session.role = "worker";

    await ctx.reply("Siz <b>👷 Ishchi</b> rejimiga o‘tdingiz!", {
      parse_mode: "HTML",
      reply_markup: getWorkerMainMenu(),
    });
  });
}
