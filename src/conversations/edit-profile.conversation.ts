import { MyConversation, MyContext } from "../types/context.js";
import { updateWorkerProfile, getUserByTelegramId } from "../services/user.service.js";
import { getWorkerMainMenu } from "../keyboards/main-menu.js";
import { JOB_CATEGORIES, JobCategory } from "../core/gemini.js";

export async function editProfileConversation(
  conversation: MyConversation,
  ctx: MyContext
) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const user = await conversation.external(() => getUserByTelegramId(telegramId));
  if (!user) {
    await ctx.reply("Foydalanuvchi topilmadi. /start bosing.");
    return;
  }

  // 1. Full Name
  await ctx.reply(
    `👤 <b>Profilni tahrirlash</b>\n\nIsm va familiyangizni kiriting (hozirgi: <i>${user.full_name}</i>):`,
    {
      parse_mode: "HTML",
      reply_markup: {
        keyboard: [[{ text: "❌ Bekor qilish" }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );

  const nameMsg = await conversation.waitFor("message:text");
  const name = nameMsg.message.text.trim();
  if (name === "❌ Bekor qilish" || name === "/cancel") {
    await ctx.reply("Tahrirlash bekor qilindi.", { reply_markup: getWorkerMainMenu() });
    return;
  }

  // 2. Gender Selection
  await ctx.reply(
    "👤 <b>Jinsingizni tanlang:</b>\n\n<i>(Bu sizga faqat o‘zingizga mos bo‘lgan kunlik ishlarni yuborishimiz uchun kerak)</i>",
    {
      parse_mode: "HTML",
      reply_markup: {
        keyboard: [
          [{ text: "👨 Erkak (Yigit)" }, { text: "👩 Ayol (Qiz bola)" }],
          [{ text: "❌ Bekor qilish" }],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );

  const genderMsg = await conversation.waitFor("message:text");
  const genderText = genderMsg.message.text.trim();
  if (genderText === "❌ Bekor qilish" || genderText === "/cancel") {
    await ctx.reply("Tahrirlash bekor qilindi.", { reply_markup: getWorkerMainMenu() });
    return;
  }

  let selectedGender: "male" | "female" = "male";
  if (genderText.toLowerCase().includes("ayol") || genderText.toLowerCase().includes("qiz")) {
    selectedGender = "female";
  } else {
    selectedGender = "male";
  }

  // 3. District
  await ctx.reply(
    "Yashash tumaningizni kiriting (Masalan: <i>Chilonzor, Yunusobod, Sergeli...</i>):",
    {
      parse_mode: "HTML",
      reply_markup: {
        keyboard: [[{ text: "❌ Bekor qilish" }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    }
  );
  const districtMsg = await conversation.waitFor("message:text");
  const district = districtMsg.message.text.trim();
  if (district === "❌ Bekor qilish") {
    await ctx.reply("Tahrirlash bekor qilindi.", { reply_markup: getWorkerMainMenu() });
    return;
  }

  // 3. Experience
  await ctx.reply("Ish tajribangiz (necha yil, masalan: <i>2</i>):", {
    parse_mode: "HTML",
  });
  const expMsg = await conversation.waitFor("message:text");
  const expText = expMsg.message.text.trim();
  if (expText === "❌ Bekor qilish") {
    await ctx.reply("Tahrirlash bekor qilindi.", { reply_markup: getWorkerMainMenu() });
    return;
  }
  const experienceYears = Number.parseInt(expText, 10) || 0;

  // 4. Categories Selection
  const categoriesList = JOB_CATEGORIES.map((cat, i) => `${i + 1}. ${cat}`).join("\n");
  await ctx.reply(
    `📂 <b>Qaysi sohalarda ishlamoqchisiz?</b>\n\n` +
      `Quyidagi sohalardan moslarini raqamlarini vergul bilan yozing (masalan: <i>1, 3</i>) yoki <i>Barchasi</i> deb yozing:\n\n` +
      `${categoriesList}`,
    { parse_mode: "HTML" }
  );

  const catMsg = await conversation.waitFor("message:text");
  const catInput = catMsg.message.text.trim();
  if (catInput === "❌ Bekor qilish") {
    await ctx.reply("Tahrirlash bekor qilindi.", { reply_markup: getWorkerMainMenu() });
    return;
  }

  let selectedCategories: string[] = [];
  if (catInput.toLowerCase().includes("barchas") || catInput.toLowerCase().includes("hamma")) {
    selectedCategories = [...JOB_CATEGORIES];
  } else {
    const indices = catInput
      .split(/[,;\s]+/)
      .map((s) => parseInt(s.trim(), 10) - 1)
      .filter((idx) => idx >= 0 && idx < JOB_CATEGORIES.length);

    selectedCategories = indices.map((idx) => JOB_CATEGORIES[idx]);
    if (selectedCategories.length === 0) {
      // Check if wrote category names directly
      selectedCategories = JOB_CATEGORIES.filter((c) =>
        catInput.toLowerCase().includes(c.toLowerCase())
      );
    }
  }

  if (selectedCategories.length === 0) {
    selectedCategories = ["Xizmat"];
  }

  // 5. About
  await ctx.reply("O‘zingiz haqingizda qisqacha ma’lumot (qanday ishlarni bajara olasiz, ko‘nikmalaringiz):", {
    parse_mode: "HTML",
  });
  const aboutMsg = await conversation.waitFor("message:text");
  const about = aboutMsg.message.text.trim();
  if (about === "❌ Bekor qilish") {
    await ctx.reply("Tahrirlash bekor qilindi.", { reply_markup: getWorkerMainMenu() });
    return;
  }

  await conversation.external(() =>
    updateWorkerProfile(telegramId, {
      full_name: name,
      gender: selectedGender,
      district,
      experience_years: experienceYears,
      worker_categories: selectedCategories,
      about,
    })
  );

  const genderLabel = selectedGender === "female" ? "👩 Ayol (Qiz bola)" : "👨 Erkak (Yigit)";

  await ctx.reply(
    `✅ <b>Profilingiz muvaffaqiyatli yangilandi!</b>\n\n` +
      `📌 <b>Ism:</b> ${name}\n` +
      `👤 <b>Jinsi:</b> ${genderLabel}\n` +
      `📍 <b>Tuman:</b> ${district}\n` +
      `💼 <b>Tajriba:</b> ${experienceYears} yil\n` +
      `📂 <b>Tanlangan sohalar:</b> ${selectedCategories.join(", ")}\n` +
      `📝 <b>Ma’lumot:</b> ${about}`,
    {
      parse_mode: "HTML",
      reply_markup: getWorkerMainMenu(),
    }
  );
}
