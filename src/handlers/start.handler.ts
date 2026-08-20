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
  // Help & Onboarding Guide
  bot.command("help", async (ctx) => {
    const helpText = [
      "ℹ️ <b>JobTop — Foydalanish bo‘yicha qo‘llanma</b>",
      "",
      "👷 <b>Ishchilar uchun:</b>",
      "1. <b>🔍 Ishlarni ko‘rish</b> — Toshkentdagi barcha yangi bir kunlik va soatbay ishlarni ko‘ring.",
      "2. <b>✋ Ariza yuborish</b> — Yoqqan ishga bitta yoki sheriklaringiz bilan 2-4 kishilik brigada bo‘lib ariza topshiring.",
      "3. <b>👤 Profilni to‘ldirish</b> — Reytingingiz va tajribangiz qancha yuqori bo‘lsa, sizni shuncha tez ishga tanlashadi.",
      "",
      "💼 <b>Ish beruvchilar uchun:</b>",
      "1. <b>➕ Yangi e’lon berish</b> — Qanday ishchi kerakligini erkin matn yoki ovoz bilan yozing, AI uni darhol e’longa aylantiradi.",
      "2. <b>📋 Nomzodlarni ko‘rish</b> — Kelgan arizalarni tekshiring, eng yaxshi ustalarni tanlang va to‘g‘ridan-to‘g‘ri telefon qiling.",
      "",
      "🛡 <b>Xavfsizlik qoidalari:</b>",
      "• Ish boshlanmasidan oldin <b>hech kimga oldindan pul o‘tkazmang!</b>",
      "• Ish haqini faqat ish to‘liq bajarilgach to‘lang.",
      "",
      "Savol yoki muammo bo‘lsa: <b>✍️ Murojaat va takliflar</b> bo‘limiga yozing!",
    ].join("\n");

    await ctx.reply(helpText, { parse_mode: "HTML" });
  });

  bot.hears(["❓ Qanday ishlaydi?", "ℹ️ Yordam", "/help"], async (ctx) => {
    const helpText = [
      "ℹ️ <b>JobTop — Foydalanish bo‘yicha qo‘llanma</b>",
      "",
      "👷 <b>Ishchilar uchun:</b>",
      "1. <b>🔍 Ishlarni ko‘rish</b> — Toshkentdagi barcha yangi bir kunlik va soatbay ishlarni ko‘ring.",
      "2. <b>✋ Ariza yuborish</b> — Yoqqan ishga bitta yoki sheriklaringiz bilan 2-4 kishilik brigada bo‘lib ariza topshiring.",
      "3. <b>👤 Profilni to‘ldirish</b> — Reytingingiz va tajribangiz qancha yuqori bo‘lsa, sizni shuncha tez ishga tanlashadi.",
      "",
      "💼 <b>Ish beruvchilar uchun:</b>",
      "1. <b>➕ Yangi e’lon berish</b> — Qanday ishchi kerakligini erkin matn yoki ovoz bilan yozing, AI uni darhol e’longa aylantiradi.",
      "2. <b>📋 Nomzodlarni ko‘rish</b> — Kelgan arizalarni tekshiring, eng yaxshi ustalarni tanlang va to‘g‘ridan-to‘g‘ri telefon qiling.",
      "",
      "🛡 <b>Xavfsizlik qoidalari:</b>",
      "• Ish boshlanmasidan oldin <b>hech kimga oldindan pul o‘tkazmang!</b>",
      "• Ish haqini faqat ish to‘liq bajarilgach to‘lang.",
      "",
      "Savol yoki muammo bo‘lsa: <b>✍️ Murojaat va takliflar</b> bo‘limiga yozing!",
    ].join("\n");

    await ctx.reply(helpText, { parse_mode: "HTML" });
  });

  // Referral & Invite Friends
  bot.hears(["👥 Sherikni taklif qilish", "👥 Do‘stlarni taklif qilish"], async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const botInfo = await bot.api.getMe();
    const refLink = `https://t.me/${botInfo.username}?start=ref_${telegramId}`;
    const shareText = encodeURIComponent(
      `Toshkentda bir kunlik va kunbay ishlarni topish uchun JobTop botiga kiring! Do‘stlar va brigadalar uchun juda qulay:\n${refLink}`
    );

    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${shareText}`;

    const keyboard = new InlineKeyboard().url(
      "📤 Do‘stlarga / Guruhga ulashish",
      shareUrl
    );

    await ctx.reply(
      "👥 <b>Do‘stlaringiz va sheriklaringizni taklif qiling!</b>\n\n" +
        "JobTop botini do‘stlaringiz, tanishlaringiz va brigadangizga yuboring. Birgalikda jamoaviy ishlarga oson ariza topshiring va daromad qiling!\n\n" +
        `🔗 <b>Sizning shaxsiy taklif havolangiz:</b>\n<code>${refLink}</code>\n\n` +
        "Pastdagi tugma orqali havolani to‘g‘ridan-to‘g‘ri Telegramdagi do‘stlaringiz yoki guruhlarga bitta bosishda yuborishingiz mumkin 👇",
      {
        parse_mode: "HTML",
        reply_markup: keyboard,
      }
    );
  });

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
