import { getJobById } from "../services/job.service.js";
import { extractContactInfo } from "./worker.handler.js";
import { Bot, InlineKeyboard } from "grammy";
import { MyContext } from "../types/context.js";
import {
  getUserByTelegramId,
  upsertUser,
  setActiveRole,
  getProfileCompletionStatus,
  recordUserTrafficSource,
  processReferralJoin,
} from "../services/user.service.js";
import { roleSelectionKeyboard, contactRequestKeyboard } from "../keyboards/auth.js";
import { getWorkerMainMenu, getEmployerMainMenu } from "../keyboards/main-menu.js";

export function registerStartHandlers(bot: Bot<MyContext>) {
  // Help & Onboarding Guide
  bot.command("help", async (ctx) => {
    await sendHelpGuide(ctx);
  });

  bot.hears(["❓ Qanday ishlaydi?", "ℹ️ Yordam", "/help"], async (ctx) => {
    await sendHelpGuide(ctx);
  });

  async function sendHelpGuide(ctx: MyContext) {
    const role = ctx.session.role;

    if (role === "employer") {
      const employerGuide = [
        "💼 <b>JobTop — Ishchi va Usta topish bo‘yicha qo‘llanma:</b>",
        "",
        "Uy tozalatish, mebel ko‘chirish, usta yoki har qanday yordamchi kerakmi? 🏠📦",
        "",
        "1️⃣ <b>➕ Yangi e’lon berish:</b>",
        "Menyudagi <b>“➕ Yangi e’lon berish”</b> tugmasini bosing va qanday ishchi kerakligini oddiy matn yoki ovozli xabar (audio) qilib yuboring.",
        "<i>Masalan: “Ertaga Yunusobodda 3 xonali uyni tozalashga 2 ta ayol kerak, 200 mingdan beraman”.</i>",
        "",
        "2️⃣ <b>⚡️ AI orqali tezkor e’lon:</b>",
        "Sun’iy intellekt e’loningizni 1 soniyada chiroyli formatlab, tasdiqlashingiz bilan minglab ishchilarga tarqatadi.",
        "",
        "3️⃣ <b>📞 Nomzodlarni tanlash:</b>",
        "Kelgan arizalarni ko‘ring, eng yaxshi ustalarni tanlang va to‘g‘ridan-to‘g‘ri telefon qilib chaqiring!",
        "",
        "🛡 <b>Muhim eslatma:</b> Ish haqini faqat ish to‘liq bajarilgach to‘lang!",
      ].join("\n");

      await ctx.reply(employerGuide, { parse_mode: "HTML" });
      return;
    }

    const workerGuide = [
      "👷 <b>JobTop — Kunlik ish topish bo‘yicha qo‘llanma:</b>",
      "",
      "1️⃣ <b>🔍 Ishlarni ko‘rish:</b>",
      "Menyudagi <b>“🔍 Ishlarni ko‘rish”</b> tugmasini bosing va o‘zingizga mos bo‘limni (<i>👨 Erkaklar, 👩 Ayollar, Yuk tashish, Tozalash, Kuryer</i>) tanlang.",
      "",
      "2️⃣ <b>📋 E’lonni tanlash:</b>",
      "O‘zingizga yaqin tuman va maoshi ma’qul kelgan ishni tanlang.",
      "",
      "3️⃣ <b>📞 Bog‘lanish va Pul ishlash:</b>",
      "<b>“📞 Bog‘lanish”</b> yoki <b>“💬 Telegram”</b> tugmasini bosib, to‘g‘ridan-to‘g‘ri buyurtmachi bilan bog‘laning va o‘sha kuniyoq pulingizni oling!",
      "",
      "💡 <i>Agar sizga ham uyingizga ishchi yoki usta kerak bo‘lsa — pastdagi <b>“🔄 Ish beruvchi rejimiga o‘tish”</b> tugmasini bosib, bepul e’lon berishingiz mumkin!</i>",
    ].join("\n");

    await ctx.reply(workerGuide, { parse_mode: "HTML" });
  }

  // Referral & Invite Friends
  bot.hears(["👥 Sherikni taklif qilish", "👥 Do‘stlarni taklif qilish"], async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await getUserByTelegramId(telegramId);
    const botState = (user as any)?.bot_state || {};
    const count = Number(botState.referral_count || (Array.isArray(botState.referred_users) ? botState.referred_users.length : 0));
    const remaining = count === 0 ? 3 : (count % 3 === 0 ? 0 : 3 - (count % 3));
    const isPro = Boolean(botState.is_pro && botState.pro_until && new Date(botState.pro_until).getTime() > Date.now());

    let proStatusText = "⏳ <i>Yana 3 ta do‘stingiz qo‘shilsa yoqiladi</i>";
    if (isPro) {
      const expStr = new Date(botState.pro_until).toLocaleDateString("uz-UZ", {
        timeZone: "Asia/Tashkent",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      proStatusText = `⭐️ <b>PRO FAOL</b> (Muddati: ${expStr} gacha)`;
    } else if (count > 0 && remaining > 0) {
      proStatusText = `⏳ <i>Yana <b>${remaining} ta</b> do‘stingiz qo‘shilsa yoqiladi!</i>`;
    }

    const botInfo = await bot.api.getMe();
    const refLink = `https://t.me/${botInfo.username}?start=ref_${telegramId}`;
    const shareText = encodeURIComponent(
      `Toshkentda talabalar va ustalar uchun bir kunlik naqd pulli ishlar boti! Har kuni yangi ishlar chiqadi:`
    );

    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${shareText}`;

    const keyboard = new InlineKeyboard()
      .url("📤 1 Bosishda Do‘stlarga / Guruhga Ulashish", shareUrl)
      .row()
      .text("🔄 Ma’lumotni yangilash", "ref:refresh");

    await ctx.reply(
      "👥 <b>Do‘stlarni Taklif Qilish — 1 Haftalik Bepul PRO Oling! 🎁</b>\n\n" +
      "Har <b>3 ta do‘stingiz</b> sizning taklif havolangiz orqali botga qo‘shilganda — sizga <b>1 haftalik ⭐️ PRO Akkaunt (Arizalarda 1-o‘rin va VIP xabarnoma) mutlaqo BEPUL</b> beriladi!\n\n" +
      `📊 <b>Sizning ko‘rsatkichingiz:</b>\n` +
      `• Taklif qilingan do‘stlar: <b>${count} ta</b>\n` +
      `• PRO holati: ${proStatusText}\n\n` +
      `🔗 <b>Sizning shaxsiy taklif havolangiz:</b>\n` +
      `<code>${refLink}</code>\n\n` +
      "Pastdagi tugma orqali ushbu havolani do‘stlaringiz yoki guruhlarga bitta bosishda yuborishingiz mumkin 👇",
      {
        parse_mode: "HTML",
        reply_markup: keyboard,
      }
    );
  });

  bot.callbackQuery("ref:refresh", async (ctx) => {
    await ctx.answerCallbackQuery({ text: "Ma’lumotlar yangilandi!" }).catch(() => {});
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await getUserByTelegramId(telegramId);
    const botState = (user as any)?.bot_state || {};
    const count = Number(botState.referral_count || (Array.isArray(botState.referred_users) ? botState.referred_users.length : 0));
    const remaining = count === 0 ? 3 : (count % 3 === 0 ? 0 : 3 - (count % 3));
    const isPro = Boolean(botState.is_pro && botState.pro_until && new Date(botState.pro_until).getTime() > Date.now());

    let proStatusText = "⏳ <i>Yana 3 ta do‘stingiz qo‘shilsa yoqiladi</i>";
    if (isPro) {
      const expStr = new Date(botState.pro_until).toLocaleDateString("uz-UZ", {
        timeZone: "Asia/Tashkent",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      proStatusText = `⭐️ <b>PRO FAOL</b> (Muddati: ${expStr} gacha)`;
    } else if (count > 0 && remaining > 0) {
      proStatusText = `⏳ <i>Yana <b>${remaining} ta</b> do‘stingiz qo‘shilsa yoqiladi!</i>`;
    }

    const botInfo = await bot.api.getMe();
    const refLink = `https://t.me/${botInfo.username}?start=ref_${telegramId}`;
    const shareText = encodeURIComponent(
      `Toshkentda talabalar va ustalar uchun bir kunlik naqd pulli ishlar boti! Har kuni yangi ishlar chiqadi:`
    );
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${shareText}`;

    const keyboard = new InlineKeyboard()
      .url("📤 1 Bosishda Do‘stlarga / Guruhga Ulashish", shareUrl)
      .row()
      .text("🔄 Ma’lumotni yangilash", "ref:refresh");

    await ctx.editMessageText(
      "👥 <b>Do‘stlarni Taklif Qilish — 1 Haftalik Bepul PRO Oling! 🎁</b>\n\n" +
      "Har <b>3 ta do‘stingiz</b> sizning taklif havolangiz orqali botga qo‘shilganda — sizga <b>1 haftalik ⭐️ PRO Akkaunt (Arizalarda 1-o‘rin va VIP xabarnoma) mutlaqo BEPUL</b> beriladi!\n\n" +
      `📊 <b>Sizning ko‘rsatkichingiz:</b>\n` +
      `• Taklif qilingan do‘stlar: <b>${count} ta</b>\n` +
      `• PRO holati: ${proStatusText}\n\n` +
      `🔗 <b>Sizning shaxsiy taklif havolangiz:</b>\n` +
      `<code>${refLink}</code>\n\n` +
      "Pastdagi tugma orqali ushbu havolani do‘stlaringiz yoki guruhlarga bitta bosishda yuborishingiz mumkin 👇",
      {
        parse_mode: "HTML",
        reply_markup: keyboard,
      }
    ).catch(() => {});
  });

  // Support & Feedback
  bot.hears("✍️ Murojaat va takliflar", async (ctx) => {
    await ctx.conversation.enter("feedbackConversation");
  });

  bot.command("start", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const payload = ctx.match?.trim() || "";

    let trafficSource = "organic_search";
    let referredBy: number | null = null;

    if (payload.startsWith("src_")) {
      trafficSource = payload.replace("src_", "");
    } else if (payload.startsWith("ref_")) {
      trafficSource = "referral";
      referredBy = parseInt(payload.replace("ref_", ""), 10) || null;
      if (referredBy) {
        processReferralJoin(telegramId, referredBy, bot.api).catch((err: any) =>
          console.error("Error processing referral:", err)
        );
      }
    } else if (payload.startsWith("job_")) {
      trafficSource = "channel_job_button";
    }

    // Record acquisition source
    recordUserTrafficSource(telegramId, trafficSource, referredBy).catch(() => {});

    // Check if user came from @jobtopuzz channel deeplink: /start job_<id>
    if (payload && payload.startsWith("job_")) {
      const jobId = payload.replace("job_", "");
      const job = await getJobById(jobId);
      if (job && job.status === "published") {
        const contacts = extractContactInfo(job.description);
        let contactLine = "";
        if (contacts.phone && contacts.telegram) {
          contactLine = `📞 <b>Aloqa:</b> <code>${contacts.phone}</code> (${contacts.telegram})`;
        } else if (contacts.phone) {
          contactLine = `📞 <b>Aloqa / Tel:</b> <code>${contacts.phone}</code>`;
        } else if (contacts.telegram) {
          contactLine = `💬 <b>Aloqa (Telegram):</b> ${contacts.telegram}`;
        }

        const cleanDescription = job.description
          .replace(/🔗\s*Manba:[^\n]+/gi, "")
          .replace(/🌐\s*Manba:[^\n]+/gi, "")
          .trim();

        const cardText = [
          `📋 <b>${job.title}</b>`,
          "",
          `📂 <b>Kategoriya:</b> ${job.category}`,
          `📍 <b>Tuman:</b> ${job.district}`,
          `🏢 <b>Manzil:</b> ${job.address}`,
          `💰 <b>Ish haqi:</b> ${job.pay_amount.toLocaleString()} so‘m`,
          `👥 <b>Bo‘sh o‘rinlar:</b> ${job.openings} ta`,
          contactLine,
          `🕒 <b>Boshlanish vaqti:</b> ${new Date(job.starts_at).toLocaleString("uz-UZ", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}`,
          "",
          `📝 <b>Tavsif:</b>\n${cleanDescription}`,
        ].filter(Boolean).join("\n");

        const kb = new InlineKeyboard();
        if (contacts.telegram) {
          kb.url("💬 Telegramdan yozish", "https://t.me/" + contacts.telegram.replace("@", "")).row();
        }
        kb.text("📞 Bog‘lanish ma’lumotlari", `worker:contact_ext:${job.id}`).row();
        kb.text("🔍 Barcha ishlarni ko‘rish", "worker:feed:all:0");

        await ctx.reply(cardText, {
          parse_mode: "HTML",
          reply_markup: kb,
        });
        return;
      }
    }

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
        `<b>JobTop</b> — Toshkentdagi tezkor kunlik ishlar va xizmatlar platformasiga xush kelibsiz.\n\n` +
        `Sizga nima kerak? O‘z maqsadingizni tanlang 👇`,
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
