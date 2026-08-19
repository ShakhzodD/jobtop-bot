import { MyConversation, MyContext } from "../types/context.js";
import { updateWorkerProfile, getUserByTelegramId } from "../services/user.service.js";
import { getWorkerMainMenu } from "../keyboards/main-menu.js";

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

  await ctx.reply("Yashash tumaningizni kiriting (Masalan: <i>Chilonzor, Yunusobod</i>):", {
    parse_mode: "HTML",
  });
  const districtMsg = await conversation.waitFor("message:text");
  const district = districtMsg.message.text.trim();
  if (district === "❌ Bekor qilish") {
    await ctx.reply("Tahrirlash bekor qilindi.", { reply_markup: getWorkerMainMenu() });
    return;
  }

  await ctx.reply("Ish tajribangiz (necha yil, masalan: <i>2</i>):", {
    parse_mode: "HTML",
  });
  const expMsg = await conversation.waitFor("message:text");
  const expText = expMsg.message.text.trim();
  const experienceYears = Number.parseInt(expText, 10) || 0;

  await ctx.reply("O‘zingiz haqingizda qisqacha ma’lumot (qanday ishlarni bajara olasiz):", {
    parse_mode: "HTML",
  });
  const aboutMsg = await conversation.waitFor("message:text");
  const about = aboutMsg.message.text.trim();

  await conversation.external(() =>
    updateWorkerProfile(telegramId, {
      full_name: name,
      district,
      experience_years: experienceYears,
      about,
    })
  );

  await ctx.reply("✅ <b>Profilingiz muvaffaqiyatli yangilandi!</b>", {
    parse_mode: "HTML",
    reply_markup: getWorkerMainMenu(),
  });
}
