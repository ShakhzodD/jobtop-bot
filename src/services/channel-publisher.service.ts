import { Api, InlineKeyboard } from "grammy";
import { DBJob } from "./job.service.js";

export const PUBLIC_CHANNEL_USERNAME = "@jobtopuzz";

export async function publishJobToPublicChannel(api: Api, job: DBJob): Promise<number | null> {
  try {
    const cleanDescription = job.description
      .replace(/🔗\s*Manba:[^\n]+/gi, "")
      .replace(/🌐\s*Manba:[^\n]+/gi, "")
      .trim();

    const categoryTags: Record<string, string> = {
      "Yuk tashish": "#YukTashish",
      "Tozalash": "#Tozalash",
      "Kuryer": "#Kuryer",
      "Xizmat": "#Xizmat",
    };

    const catTag = categoryTags[job.category] || `#${job.category.replace(/\s+/g, "")}`;
    const districtTag = `#${job.district.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, "")}`;

    const dateStr = new Date(job.starts_at).toLocaleString("uz-UZ", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const lines = [
      `💼 <b>${job.title}</b>`,
      "",
      `📂 <b>Kategoriya:</b> ${job.category}`,
      `📍 <b>Tuman:</b> ${job.district}`,
      `🏢 <b>Manzil:</b> ${job.address}`,
      `💰 <b>Ish haqi:</b> <b>${job.pay_amount.toLocaleString()} so‘m</b>`,
      `👥 <b>Bo‘sh o‘rinlar:</b> ${job.openings} ta`,
      `🕒 <b>Boshlanish vaqti:</b> ${dateStr}`,
      "",
      `📝 <b>Tavsif:</b>\n${cleanDescription}`,
      "",
      `──────────────`,
      `🤖 <b>Bog‘lanish va to‘liq ma’lumot olish uchun:</b>`,
      `👇 Pastdagi tugmani bosing:`,
      "",
      `${catTag} ${districtTag} #KunlikIsh #Toshkent #JobTop`,
    ];

    const keyboard = new InlineKeyboard().url(
      "🤖 Bog‘lanish / Ariza topshirish",
      `https://t.me/jobtopuzbot?start=job_${job.id}`
    );

    const sent = await api.sendMessage(PUBLIC_CHANNEL_USERNAME, lines.join("\n"), {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });

    console.log(`📢 [Channel Publisher] Successfully posted job "${job.title}" to ${PUBLIC_CHANNEL_USERNAME} (Msg ID: ${sent.message_id})`);
    return sent.message_id;
  } catch (err: any) {
    console.error(`❌ [Channel Publisher] Failed to post job to ${PUBLIC_CHANNEL_USERNAME}:`, err.message);
    return null;
  }
}
