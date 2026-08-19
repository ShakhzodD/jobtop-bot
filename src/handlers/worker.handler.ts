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
} from "../services/application.service.js";
import { JOB_CATEGORIES } from "../core/gemini.js";
import { supabase } from "../core/supabase.js";

function renderJobCard(job: DBJob, index: number, total: number) {
  const lines = [
    `📋 <b>${job.title}</b> (${index + 1}/${total})`,
    "",
    `📂 <b>Kategoriya:</b> ${job.category}`,
    `📍 <b>Tuman:</b> ${job.district}`,
    `🏢 <b>Manzil:</b> ${job.address}`,
    `💰 <b>Ish haqi:</b> ${job.pay_amount.toLocaleString()} so‘m`,
    `👥 <b>Bo‘sh o‘rinlar:</b> ${job.openings} ta`,
    `🕒 <b>Boshlanish vaqti:</b> ${new Date(job.starts_at).toLocaleString("uz-UZ", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })}`,
    "",
    `📝 <b>Tavsif:</b>\n${job.description}`,
    job.source_name ? `\n🔗 <i>Manba: ${job.source_name}</i>` : "",
  ];

  return lines.filter(Boolean).join("\n");
}

export function registerWorkerHandlers(bot: Bot<MyContext>) {
  // Feed / Ishlarni ko'rish
  bot.hears("🔍 Ishlarni ko‘rish", async (ctx) => {
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
  bot.callbackQuery(/^worker:feed:(.+):(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
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

    const keyboard = new InlineKeyboard();

    if (job.source_url) {
      keyboard.url("🌐 Asl manba havolasi", job.source_url).row();
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

  bot.callbackQuery("worker:back_categories", async (ctx) => {
    await ctx.answerCallbackQuery();
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

  // Apply for job: Sends candidate info, phone number & username to employer
  bot.callbackQuery(/^worker:apply:(.+):(.+):(\d+)$/, async (ctx) => {
    const jobId = ctx.match[1];
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

    const res = await applyForJob(jobId, user.id);
    if (!res.success) {
      await ctx.answerCallbackQuery({ text: res.message, show_alert: true });
      return;
    }

    await ctx.answerCallbackQuery({
      text: "✅ Arizangiz ish beruvchiga yuborildi!",
      show_alert: true,
    });

    // Check if profile is incomplete and send a friendly tip
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

    // Notify Employer immediately in Telegram with full Candidate info!
    if (job.employer_id) {
      try {
        const { data: empData } = await supabase
          .from("users")
          .select("telegram_id")
          .eq("id", job.employer_id)
          .single();

        if (empData?.telegram_id) {
          const usernameStr = ctx.from.username
            ? `@${ctx.from.username}`
            : user.telegram_username
            ? `@${user.telegram_username}`
            : null;

          const applicantText = [
            "🔔 <b>E’loningizga yangi nomzod qiziqish bildirdi!</b>",
            "",
            `📌 <b>E’lon:</b> ${job.title}`,
            `👤 <b>Nomzod:</b> ${user.full_name}`,
            user.phone ? `📞 <b>Telefon:</b> <code>${user.phone}</code>` : "",
            usernameStr ? `💬 <b>Telegram:</b> ${usernameStr}` : "",
            user.district ? `📍 <b>Tuman:</b> ${user.district}` : "",
            user.experience_years ? `💼 <b>Tajriba:</b> ${user.experience_years} yil` : "",
            user.about ? `📝 <b>Ma’lumot:</b> ${user.about}` : "",
            "",
            "Nomzodni ishga qabul qilasizmi?",
          ]
            .filter(Boolean)
            .join("\n");

          const empKeyboard = new InlineKeyboard()
            .text("✅ Tanlash (Qabul qilish)", `emp:select:${res.application!.id}`)
            .text("❌ Rad etish", `emp:reject:${res.application!.id}`);

          if (usernameStr) {
            const rawUsername = usernameStr.replace(/^@/, "");
            empKeyboard.row().url("✉️ Nomzodga Telegramdan yozish", `https://t.me/${rawUsername}`);
          }

          await bot.api.sendMessage(empData.telegram_id, applicantText, {
            parse_mode: "HTML",
            reply_markup: empKeyboard,
          });
        }
      } catch (e) {
        console.error("Failed to notify employer about applicant:", e);
      }
    }
  });

  // View my applications
  bot.hears("📄 Mening arizalarim", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply("Iltimos, avval /start buyrug‘ini bosing.");
      return;
    }

    const applications = await getWorkerApplications(user.id);
    if (applications.length === 0) {
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

    let msg = `📄 <b>Mening arizalarim (${applications.length} ta):</b>\n\n`;

    applications.forEach((app, i) => {
      const job = app.job;
      const status = statusLabels[app.status] || app.status;
      msg += `<b>${i + 1}. ${job?.title || "E’lon"}</b>\n`;
      msg += `💰 Haq: ${job?.pay_amount ? `${job.pay_amount.toLocaleString()} so‘m` : "Kelishilgan"}\n`;
      msg += `📍 Manzil: ${job?.district || ""}, ${job?.address || ""}\n`;
      msg += `Holati: <b>${status}</b>\n`;

      if (app.status === "selected" && (job as any)?.employer?.phone) {
        msg += `📞 <b>Ish beruvchi telefoni:</b> ${(job as any).employer.phone}\n`;
      }
      msg += `─────────────\n`;
    });

    await ctx.reply(msg, { parse_mode: "HTML" });
  });

  // View Profile: Shows completion bar & missing fields
  bot.hears("👤 Mening profilim", async (ctx) => {
    const telegramId = ctx.from?.id;
    if (!telegramId) return;

    const user = await getUserByTelegramId(telegramId);
    if (!user) {
      await ctx.reply("Foydalanuvchi topilmadi. /start bosing.");
      return;
    }

    const { percent, isComplete, missing } = getProfileCompletionStatus(user);

    // Progress bar visualization: e.g. [🟩🟩⬜️⬜️] 50%
    const totalBars = 4;
    const filledBars = Math.round((percent / 100) * totalBars);
    const barStr = "🟩".repeat(filledBars) + "⬜️".repeat(totalBars - filledBars);

    const profileText = [
      `👤 <b>Mening profilim:</b>`,
      "",
      `📊 <b>Profil to‘liqligi:</b> [${barStr}] <b>${percent}%</b>`,
      !isComplete
        ? `⚠️ <i>To‘ldirilmagan: ${missing.join(", ")}</i>`
        : "✅ <i>Profilingiz to‘liq to‘ldirilgan!</i>",
      "",
      `📛 <b>Ism:</b> ${user.full_name}`,
      `📱 <b>Telefon:</b> ${user.phone || "Kiritilmagan"}`,
      `📍 <b>Tuman:</b> ${user.district || "Kiritilmagan"}`,
      `💼 <b>Tajriba:</b> ${
        user.experience_years !== null && user.experience_years !== undefined
          ? `${user.experience_years} yil`
          : "Kiritilmagan"
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

  bot.callbackQuery("worker:edit_profile", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter("editProfileConversation");
  });
}
