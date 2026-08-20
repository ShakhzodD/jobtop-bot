
export function extractContactInfo(text: string): { phone?: string; telegram?: string; rawDigits?: string } {
  const phoneRegex = /(?:\+?998[\s-]*)?(?:90|91|93|94|95|97|98|99|88|33|77|20)[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}|\b\d{2}[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b/;
  const phoneMatch = text.match(phoneRegex);

  const tgRegex = /@([a-zA-Z0-9_]{4,})/;
  const tgMatch = text.match(tgRegex);

  let formattedPhone: string | undefined = undefined;
  let rawDigits: string | undefined = undefined;

  if (phoneMatch) {
    const digits = phoneMatch[0].replace(/\D/g, "");
    if (digits.length === 9) {
      rawDigits = "998" + digits;
      formattedPhone = `+998 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)}`;
    } else if (digits.length === 12 && digits.startsWith("998")) {
      rawDigits = digits;
      formattedPhone = `+998 ${digits.slice(3, 5)} ${digits.slice(5, 8)} ${digits.slice(8, 10)} ${digits.slice(10, 12)}`;
    }
  }

  return {
    phone: formattedPhone,
    telegram: tgMatch ? tgMatch[0] : undefined,
    rawDigits,
  };
}

import { Bot, InlineKeyboard } from "grammy";
import { MyContext } from "../types/context.js";
import {
  getUserByTelegramId,
  getProfileCompletionStatus,
} from "../services/user.service.js";
import { getPublishedJobs, getJobById, DBJob } from "../services/job.service.js";
import {
  applyForJob,
  getWorkerApplications,
  withdrawApplication,
  cancelAcceptedApplication,
} from "../services/application.service.js";
import { getUserRating } from "../services/review.service.js";
import { JOB_CATEGORIES } from "../core/gemini.js";
import { supabase } from "../core/supabase.js";

function renderJobCard(job: DBJob, index: number, total: number) {
  const isExternal = Boolean(job.source_name || job.source_url || !job.employer_id);
  const contacts = extractContactInfo(job.description);

  let contactLine = "";
  if (isExternal) {
    if (contacts.phone && contacts.telegram) {
      contactLine = `📞 <b>Aloqa:</b> <code>${contacts.phone}</code> (${contacts.telegram})`;
    } else if (contacts.phone) {
      contactLine = `📞 <b>Aloqa / Tel:</b> <code>${contacts.phone}</code>`;
    } else if (contacts.telegram) {
      contactLine = `💬 <b>Aloqa (Telegram):</b> ${contacts.telegram}`;
    }
  }

  const lines = [
    `📋 <b>${job.title}</b> (${index + 1}/${total})`,
    isExternal ? `🌐 <i>(Tashqi e’lon — ${job.source_name || "Agregator"})</i>` : `✨ <i>(JobTop orqali to‘g‘ridan-to‘g‘ri)</i>`,
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
    `📝 <b>Tavsif:</b>\n${job.description}`,
  ];

  return lines.filter(Boolean).join("\n");
}

export function registerWorkerHandlers(mainBot: Bot<MyContext>) {
  // Handle external job contact info
  mainBot.callbackQuery(/^worker:contact_ext:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const jobId = ctx.match[1];
    const job = await getJobById(jobId);
    if (!job) {
      await ctx.reply("E’lon topilmadi.");
      return;
    }

    const contactMsg = [
      "📞 <b>Ish beruvchi bilan bog‘lanish:</b>",
      "",
      `📌 <b>E’lon:</b> ${job.title}`,
      `💰 <b>Ish haqi:</b> ${job.pay_amount.toLocaleString()} so‘m`,
      `📍 <b>Manzil:</b> ${job.district}, ${job.address}`,
      job.source_name ? `🌐 <b>Manba:</b> ${job.source_name}` : "",
      "",
      `📝 <b>Tavsif va aloqa ma’lumoti:</b>\n${job.description}`,
      "",
      "💡 <i>Qo‘ng‘iroq qilib JobTop orqali ko‘rganingizni aytsangiz bo‘ladi!</i>",
    ]
      .filter(Boolean)
      .join("\n");

    const kb = new InlineKeyboard();
    if (job.source_url && job.source_url.startsWith("http")) {
      kb.url("🌐 Asl sahifani ochish", job.source_url);
    }

    await ctx.reply(contactMsg, {
      parse_mode: "HTML",
      reply_markup: kb.inline_keyboard.length > 0 ? kb : undefined,
    });
  });

  // Feed / Ishlarni ko'rish
  mainBot.hears("🔍 Ishlarni ko‘rish", async (ctx) => {
    await ctx.replyWithChatAction("typing").catch(() => {});
    const keyboard = new InlineKeyboard();
    keyboard.text("🌐 Barcha kategoriyalar", "worker:feed:all:0").row();

    JOB_CATEGORIES.forEach((cat, idx) => {
      keyboard.text(cat, `worker:feed:${cat}:0`);
      if (idx % 2 === 1) keyboard.row();
    });

    await ctx.reply("Qaysi sohadagi ishlarni ko‘rmoqchisiz? Tanlang 👇", {
      reply_markup: keyboard,
    });
  });

  // Browse Jobs Callback
  mainBot.callbackQuery(/^worker:feed:(.+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const categoryParam = ctx.match[1];
    const offset = parseInt(ctx.match[2], 10);
    const category = categoryParam === "all" ? undefined : categoryParam;

    const { jobs, total } = await getPublishedJobs({
      category,
      offset,
      limit: 1,
    });

    if (total === 0 || jobs.length === 0) {
      await ctx.editMessageText(
        "Hozircha ushbu kategoriya bo‘yicha e’lonlar mavjud emas. 😔\n\nYangi e’lonlar chiqishi bilan sizga xabar beramiz!",
        {
          reply_markup: new InlineKeyboard().text(
            "🔙 Boshqa kategoriyalar",
            "worker:back_categories"
          ),
        }
      );
      return;
    }

    const job = jobs[0];
    const text = renderJobCard(job, offset, total);

    const isExternal = Boolean(job.source_name || job.source_url || !job.employer_id);
    const keyboard = new InlineKeyboard();

    if (isExternal) {
      const contacts = extractContactInfo(job.description);
      if (contacts.telegram) {
        keyboard.url("💬 Telegramdan yozish", "https://t.me/" + contacts.telegram.replace("@", "")).row();
      }
      if (job.source_url && job.source_url.startsWith("http")) {
        keyboard.url("🔗 Asl manbaga o‘tish", job.source_url).row();
      }
      keyboard.text("📞 Bog‘lanish ma’lumotlari", `worker:contact_ext:${job.id}`).row();
    } else {
      keyboard.text("✋ Ariza yuborish", `worker:apply:${job.id}:${categoryParam}:${offset}`).row();
    }

    const navRow: Array<{ text: string; callback_data: string }> = [];
    if (offset > 0) {
      navRow.push({
        text: "⬅️ Oldingisi",
        callback_data: `worker:feed:${categoryParam}:${offset - 1}`,
      });
    }
    if (offset + 1 < total) {
      navRow.push({
        text: "Keyingisi ➡️",
        callback_data: `worker:feed:${categoryParam}:${offset + 1}`,
      });
    }

    if (navRow.length > 0) {
      navRow.forEach((btn) => keyboard.text(btn.text, btn.callback_data));
      keyboard.row();
    }

    keyboard.text("📂 Kategoriyalar", "worker:back_categories");

    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  mainBot.callbackQuery("worker:back_categories", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const keyboard = new InlineKeyboard();
    keyboard.text("🌐 Barcha kategoriyalar", "worker:feed:all:0").row();

    JOB_CATEGORIES.forEach((cat, idx) => {
      keyboard.text(cat, `worker:feed:${cat}:0`);
      if (idx % 2 === 1) keyboard.row();
    });

    await ctx.editMessageText("Qaysi sohadagi ishlarni ko‘rmoqchisiz? Tanlang 👇", {
      reply_markup: keyboard,
    });
  });

  // Apply for job: If openings > 1, prompt for party size (Solo vs Group)
  mainBot.callbackQuery(/^worker:apply:(.+):(.+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const jobId = ctx.match[1];
    const categoryParam = ctx.match[2];
    const offset = ctx.match[3];
    const telegramId = ctx.from.id;

    const user = await getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.answerCallbackQuery({
        text: "Avval /start orqali ro‘yxatdan o‘ting",
        show_alert: true,
      });
      return;
    }

    const job = await getJobById(jobId);
    if (!job) {
      await ctx.answerCallbackQuery({
        text: "Bu e’lon endi mavjud emas",
        show_alert: true,
      });
      return;
    }

    // Check remaining open spots
    const { data: selectedApps } = await supabase
      .from("applications")
      .select("party_size")
      .eq("job_id", jobId)
      .eq("status", "selected");

    const filledCount = (selectedApps || []).reduce((acc, a) => acc + (a.party_size || 1), 0);
    const remainingSpots = Math.max(job.openings - filledCount, 1);

    // If job has 2+ open spots, ask how many workers they are applying for!
    if (job.openings > 1 && remainingSpots > 1) {
      const partyKeyboard = new InlineKeyboard();
      partyKeyboard.text("👤 Faqat o‘zim (1 kishi)", `worker:apply_p:${jobId}:1:${categoryParam}:${offset}`).row();

      for (let count = 2; count <= Math.min(remainingSpots, 6); count++) {
        partyKeyboard.text(
          `👥 ${count} kishi (${count === job.openings ? "To‘liq guruh" : "Sheriklarim bilan"})`,
          `worker:apply_p:${jobId}:${count}:${categoryParam}:${offset}`
        );
        if (count % 2 === 1) partyKeyboard.row();
      }

      if (!partyKeyboard.inline_keyboard[partyKeyboard.inline_keyboard.length - 1].some(b => b.text.includes("Ortga"))) {
        partyKeyboard.row();
      }
      partyKeyboard.text("🔙 Ortga", `worker:feed:${categoryParam}:${offset}`);

      await ctx.editMessageText(
        `👥 <b>Necha kishi bo‘lib ishlamoqchisiz?</b>\n\n` +
          `📌 <b>E’lon:</b> ${job.title}\n` +
          `🏢 <b>Bo‘sh o‘rinlar:</b> ${remainingSpots} ta\n` +
          `💰 <b>Kunlik haq:</b> ${job.pay_amount.toLocaleString()} so‘m (har bir kishi uchun)\n\n` +
          `O‘zingiz yolg‘iz yoki sheriklaringiz bilan birga ariza topshirishingiz mumkin:`,
        {
          parse_mode: "HTML",
          reply_markup: partyKeyboard,
        }
      );
      return;
    }

    // If 1 opening, apply directly as 1 person
    await applyWorkerWithPartySize(ctx, job, user, 1);
  });

  // Apply with specified party size
  mainBot.callbackQuery(/^worker:apply_p:(.+):(\d+):(.+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const jobId = ctx.match[1];
    const partySize = parseInt(ctx.match[2], 10) || 1;
    const telegramId = ctx.from.id;

    const user = await getUserByTelegramId(telegramId);
    if (!user) return;

    const job = await getJobById(jobId);
    if (!job) {
      await ctx.answerCallbackQuery({ text: "E’lon topilmadi." });
      return;
    }

    await applyWorkerWithPartySize(ctx, job, user, partySize);
  });

  async function applyWorkerWithPartySize(
    ctx: any,
    job: DBJob,
    user: any,
    partySize: number
  ) {
    const res = await applyForJob(job.id, user.id, partySize);
    if (!res.success) {
      await ctx.answerCallbackQuery({ text: res.message, show_alert: true }).catch(() => {});
      await ctx.reply(`⚠️ ${res.message}`);
      return;
    }

    const partyText = partySize > 1 ? ` (${partySize} kishilik guruh)` : "";
    await ctx.reply(
      `✅ <b>Arizangiz muvaffaqiyatli qabul qilindi!</b>${partyText}\n\nIsh beruvchi arizangizni ko‘rib chiqib, javob berishi bilan sizga xabar beramiz.`,
      { parse_mode: "HTML" }
    );

    // Profile Completion Tip
    const { percent, isComplete } = getProfileCompletionStatus(user);
    if (!isComplete && percent < 75) {
      const tipKeyboard = new InlineKeyboard().text(
        "✏️ Profilni to‘ldirish",
        "worker:edit_profile"
      );
      await ctx.reply(
        `💡 <b>Maslahat:</b> Profilingiz faqat <b>${percent}%</b> to‘ldirilgan.\n` +
          `Ish beruvchilar to‘liq ma’lumotli nomzodlarni ancha ko‘proq tanlashadi!`,
        {
          parse_mode: "HTML",
          reply_markup: tipKeyboard,
        }
      );
    }

    // Notify Employer in Telegram
    if (job.employer_id) {
      try {
        const { data: empData } = await supabase
          .from("users")
          .select("telegram_id")
          .eq("id", job.employer_id)
          .single();

        if (empData?.telegram_id) {
          const userRating = await getUserRating(user.id);
          const usernameStr = ctx.from.username
            ? `@${ctx.from.username}`
            : user.telegram_username
            ? `@${user.telegram_username}`
            : null;

          const totalPay = job.pay_amount * partySize;

          const applicantText = [
            "🔔 <b>E’loningizga yangi ariza tushdi!</b>",
            "",
            `📌 <b>E’lon:</b> ${job.title}`,
            `👤 <b>Mas’ul nomzod:</b> ${user.full_name}`,
            partySize > 1
              ? `👥 <b>Ishchilar soni:</b> <b>${partySize} kishi</b> (Sheriklari / Guruh bilan)`
              : `👥 <b>Ishchilar soni:</b> 1 kishi (Yakkaxon)`,
            partySize > 1 ? `💰 <b>Jami to‘lov:</b> ${totalPay.toLocaleString()} so‘m (${job.pay_amount.toLocaleString()} so‘mdan)` : "",
            `⭐️ <b>Reytingi:</b> ${userRating.starsStr}`,
            user.phone ? `📞 <b>Telefon:</b> <code>${user.phone}</code>` : "",
            usernameStr ? `💬 <b>Telegram:</b> ${usernameStr}` : "",
            user.district ? `📍 <b>Tuman:</b> ${user.district}` : "",
            typeof user.experience_years === "number" ? `💼 <b>Tajriba:</b> ${user.experience_years} yil` : "",
            user.about ? `📝 <b>Ma’lumot:</b> ${user.about}` : "",
            "",
            `Nomzodni (${partySize} kishini) ishga qabul qilasizmi?`,
          ]
            .filter(Boolean)
            .join("\n");

          const empKeyboard = new InlineKeyboard()
            .text(
              partySize > 1 ? `✅ ${partySize} kishini qabul qilish` : "✅ Qabul qilish",
              `emp:select:${res.application!.id}`
            )
            .text("❌ Rad etish", `emp:reject:${res.application!.id}`);

          if (usernameStr) {
            const rawUsername = usernameStr.replace(/^@/, "");
            empKeyboard.row().url("✉️ Mas’ulga Telegramdan yozish", `https://t.me/${rawUsername}`);
          }

          await mainBot.api.sendMessage(empData.telegram_id, applicantText, {
            parse_mode: "HTML",
            reply_markup: empKeyboard,
          });
        }
      } catch (e) {
        console.error("Failed to notify employer about applicant:", e);
      }
    }
  }

  // View my applications
  mainBot.hears("📄 Mening arizalarim", async (ctx) => {
    await ctx.replyWithChatAction("typing").catch(() => {});
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply("Iltimos, avval /start buyrug‘ini bosing.");
      return;
    }

    const applications = await getWorkerApplications(user.id);
    const activeApps = applications.filter((a) => a.status !== "withdrawn");

    if (activeApps.length === 0) {
      await ctx.reply(
        "Sizda hali topshirilgan arizalar yo‘q.\n\n🔍 <i>Ishlarni ko‘rish</i> tugmasi orqali qulay ishlarga ariza yuborishingiz mumkin!",
        { parse_mode: "HTML" }
      );
      return;
    }

    const statusLabels: Record<string, string> = {
      pending: "⏳ Ko‘rib chiqilmoqda",
      selected: "🎉 Qabul qilindi (Ish beruvchi sizni tanladi!)",
      rejected: "❌ Rad etildi",
      withdrawn: "Bekor qilingan",
    };

    await ctx.reply(`📄 <b>Mening arizalarim (${activeApps.length} ta):</b>`, {
      parse_mode: "HTML",
    });

    for (let i = 0; i < activeApps.length; i++) {
      const app = activeApps[i];
      const job = app.job;
      const status = statusLabels[app.status] || app.status;
      const partySize = (app as any).party_size || 1;

      let msg = `<b>${i + 1}. ${job?.title || "E’lon"}</b>\n`;
      msg += `👥 <b>Arizadagi ishchilar soni:</b> ${partySize} kishi\n`;
      msg += `💰 Haq: ${job?.pay_amount ? `${job.pay_amount.toLocaleString()} so‘m` : "Kelishilgan"}\n`;
      msg += `📍 Manzil: ${job?.district || ""}, ${job?.address || ""}\n`;
      msg += `Holati: <b>${status}</b>\n`;

      if (app.status === "selected" && (job as any)?.employer?.phone) {
        msg += `📞 <b>Ish beruvchi telefoni:</b> ${(job as any).employer.phone}\n`;
      }

      const keyboard = new InlineKeyboard();
      if (app.status === "pending") {
        keyboard.text("❌ Arizani bekor qilish", `worker:withdraw:${app.id}`);
      } else if (app.status === "selected") {
        keyboard.text("🚫 Borolmayman (Bekor qilish)", `worker:cancel_acc_prompt:${app.id}`);
      }

      await ctx.reply(msg, {
        parse_mode: "HTML",
        reply_markup: app.status === "pending" || app.status === "selected" ? keyboard : undefined,
      });
    }
  });

  // Withdraw pending application
  mainBot.callbackQuery(/^worker:withdraw:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const appId = ctx.match[1];
    const telegramId = ctx.from.id;
    const user = await getUserByTelegramId(telegramId);
    if (!user) return;

    const res = await withdrawApplication(appId, user.id);
    if (res.success) {
      await ctx.editMessageText("❌ Ushbu arizangiz bekor qilindi.");
    }
  });

  // Prompt for cancellation reason when accepted
  mainBot.callbackQuery(/^worker:cancel_acc_prompt:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const appId = ctx.match[1];

    const keyboard = new InlineKeyboard()
      .text("🤒 Sog‘lig‘im to‘g‘ri kelmadi", `worker:cancel_acc_do:${appId}:Sog'liq sababli`)
      .row()
      .text("🚗 Boshqa reja chiqib qoldi", `worker:cancel_acc_do:${appId}:Boshqa reja chiqdi`)
      .row()
      .text("⏳ Ulgurmay qoldim", `worker:cancel_acc_do:${appId}:Ulgura olmadi`)
      .row()
      .text("🔙 Ortga qaytish", "worker:cancel_acc_back");

    await ctx.editMessageText(
      "⚠️ <b>Ish beruvchi sizni kutmoqda!</b>\n\nAgar rostdan ham ishga bora olmasangiz, iltimos, sababini tanlang (ish beruvchiga darhol xabar yuboriladi):",
      {
        parse_mode: "HTML",
        reply_markup: keyboard,
      }
    );
  });

  // Execute cancellation of accepted application
  mainBot.callbackQuery(/^worker:cancel_acc_do:(.+):(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    const appId = ctx.match[1];
    const reason = ctx.match[2];
    const telegramId = ctx.from.id;

    const user = await getUserByTelegramId(telegramId);
    if (!user) return;

    const res = await cancelAcceptedApplication(appId, user.id, reason);

    await ctx.editMessageText(
      `🚫 <b>Ishga bora olmasligingiz belgilandi.</b>\nSabab: <i>${reason}</i>\nIsh beruvchiga bu haqda xabar yuborildi.`,
      { parse_mode: "HTML" }
    );

    // Notify Employer in Telegram urgently!
    const app = res.application;
    const job = app?.job;
    const employer = job?.employer;

    if (employer && (employer as any).telegram_id) {
      try {
        const notifyText = [
          "⚠️ <b>Diqqat! Tanlangan ishchi qatnasha olmasligini bildirdi:</b>",
          "",
          `📌 <b>E’lon:</b> ${job?.title}`,
          `👤 <b>Ishchi:</b> ${user.full_name}`,
          user.phone ? `📞 <b>Telefon:</b> <code>${user.phone}</code>` : "",
          `📝 <b>Sabab:</b> ${reason}`,
          "",
          "💡 <i>Ushbu bo‘sh o‘rin qayta ochildi va boshqa nomzodlar yana ariza yuborishi mumkin.</i>",
        ]
          .filter(Boolean)
          .join("\n");

        const empKb = new InlineKeyboard().text(
          "👥 Boshqa nomzodlarni ko‘rish",
          `emp:apps:${job!.id}`
        );

        await mainBot.api.sendMessage((employer as any).telegram_id, notifyText, {
          parse_mode: "HTML",
          reply_markup: empKb,
        });
      } catch (e) {
        console.error("Failed to notify employer about worker cancellation:", e);
      }
    }
  });

  // Cancel back
  mainBot.callbackQuery("worker:cancel_acc_back", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.editMessageText("Bekor qilish bekor qilindi. Omad!");
  });

  // View Profile: Shows rating, completion bar & categories
  mainBot.hears("👤 Mening profilim", async (ctx) => {
    await ctx.replyWithChatAction("typing").catch(() => {});
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply("Foydalanuvchi topilmadi. /start bosing.");
      return;
    }

    const { percent, isComplete, missing } = getProfileCompletionStatus(user);
    const userRating = await getUserRating(user.id);

    const totalBars = 4;
    const filledBars = Math.round((percent / 100) * totalBars);
    const barStr = "🟩".repeat(filledBars) + "⬜️".repeat(totalBars - filledBars);

    const profileText = [
      `👤 <b>Mening profilim:</b>`,
      "",
      `⭐️ <b>Reyting:</b> ${userRating.starsStr}`,
      `📊 <b>Profil to‘liqligi:</b> [${barStr}] <b>${percent}%</b>`,
      !isComplete
        ? `⚠️ <i>To‘ldirilmagan: ${missing.join(", ")}</i>`
        : "✅ <i>Profilingiz to‘liq to‘ldirilgan!</i>",
      "",
      `📛 <b>Ism:</b> ${user.full_name}`,
      `📱 <b>Telefon:</b> ${user.phone || "Kiritilmagan"}`,
      `📍 <b>Tuman:</b> ${user.district || "Kiritilmagan"}`,
      `💼 <b>Tajriba:</b> ${
        typeof user.experience_years === "number"
          ? `${user.experience_years} yil`
          : "Kiritilmagan"
      }`,
      `📂 <b>Tanlangan sohalar:</b> ${
        user.worker_categories && user.worker_categories.length > 0
          ? user.worker_categories.join(", ")
          : "Belgilanmagan"
      }`,
      `📝 <b>Haqida:</b> ${user.about || "Kiritilmagan"}`,
      `🔄 <b>Faol rol:</b> ${
        user.active_role === "employer" ? "💼 Ish beruvchi" : "👷 Ishchi"
      }`,
    ].join("\n");

    const keyboard = new InlineKeyboard().text(
      "✏️ Profilni tahrirlash",
      "worker:edit_profile"
    );

    await ctx.reply(profileText, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });

  mainBot.callbackQuery("worker:edit_profile", async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    await ctx.conversation.enter("editProfileConversation");
  });
}
