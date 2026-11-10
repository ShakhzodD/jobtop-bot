import { Bot, InlineKeyboard } from "grammy";
import { MyContext } from "../types/context.js";
import { DBJob, getJobById } from "./job.service.js";
import { getUserByTelegramId } from "./user.service.js";
import { applyForJob } from "./application.service.js";
import {
  sendWidgetMessage,
  answerWidgetQuery,
  editMessageWidgetData,
  WidgetQueryUpdate,
} from "../core/bot-api-10-4.js";

/**
 * Extracts phone or telegram contact safely from description
 */
function extractContacts(text: string) {
  const phoneRegex = /(?:\+?998[\s-]*)?(?:90|91|93|94|95|97|98|99|88|33|77|20)[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}|\b\d{2}[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b/;
  const phoneMatch = text.match(phoneRegex);
  const tgRegex = /@([a-zA-Z0-9_]{4,})/;
  const tgMatch = text.match(tgRegex);

  let phone = phoneMatch ? phoneMatch[0] : "";
  let tg = tgMatch ? tgMatch[0] : "";
  return { phone, tg };
}

/**
 * Builds responsive, lightweight HTML Widget conforming to Telegram Bot API 10.4
 * Under 32KB raw and under 4KB compressed.
 */
export function buildJobWidgetHtml(job: DBJob, options?: { applied?: boolean }) {
  const safeTitle = (job.title || "Kunlik ish")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const safeDistrict = (job.district || "Toshkent shahri")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const safeCategory = (job.category || "Xizmat")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const payFormatted = (Number(job.pay_amount) || 0).toLocaleString();
  const openings = job.openings || 1;
  const jobId = job.id;
  const address = (job.address || "Toshkent")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
body{background:var(--tg-theme-secondary-bg-color,#f1f5f9);color:var(--tg-theme-text-color,#0f172a);padding:10px;font-size:14px}
.card{background:var(--tg-theme-bg-color,#ffffff);border-radius:14px;padding:14px;border:1px solid rgba(0,0,0,0.06);box-shadow:0 2px 8px rgba(0,0,0,0.04)}
.badge-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.badge{background:var(--tg-theme-button-color,#2563eb);color:var(--tg-theme-button-text-color,#ffffff);font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;text-transform:uppercase}
.dist{color:var(--tg-theme-hint-color,#64748b);font-size:12px;font-weight:600}
.title{font-size:16px;font-weight:700;line-height:1.3;margin-bottom:8px}
.pay-box{background:rgba(37,99,235,0.08);border-left:4px solid var(--tg-theme-button-color,#2563eb);padding:8px 10px;border-radius:6px;margin-bottom:10px}
.pay-amount{font-size:18px;font-weight:800;color:var(--tg-theme-button-color,#2563eb)}
.pay-unit{font-size:12px;color:var(--tg-theme-hint-color,#64748b);font-weight:500}
.meta{display:flex;flex-wrap:wrap;gap:10px;color:var(--tg-theme-hint-color,#64748b);font-size:12px;margin-bottom:12px}
.actions{display:flex;gap:8px}
button{flex:1;background:var(--tg-theme-button-color,#2563eb);color:var(--tg-theme-button-text-color,#ffffff);border:none;border-radius:8px;padding:10px 8px;font-size:13px;font-weight:600;cursor:pointer}
button:active{opacity:0.8}
button.sec{background:var(--tg-theme-secondary-bg-color,#e2e8f0);color:var(--tg-theme-text-color,#0f172a)}
button:disabled{opacity:0.6;cursor:not-allowed}
#status{margin-top:8px;font-size:12px;text-align:center;color:#16a34a;font-weight:600;min-height:16px}
</style>
</head>
<body>
<div class="card">
  <div class="badge-row">
    <span class="badge">${safeCategory}</span>
    <span class="dist">📍 ${safeDistrict}</span>
  </div>
  <h2 class="title">${safeTitle}</h2>
  <div class="pay-box">
    <div class="pay-amount">${payFormatted} so‘m <span class="pay-unit">/ kunlik</span></div>
  </div>
  <div class="meta">
    <span>👥 ${openings} ta joy</span>
    <span>🏢 ${address}</span>
  </div>
  <div class="actions">
    <button id="applyBtn" onclick="doApply()">⚡️ Ariza berish</button>
    <button class="sec" id="contactBtn" onclick="doContact()">📞 Kontakt</button>
  </div>
  <div id="status"></div>
</div>
<script>
const TW = window.TelegramWidget;
const jobId = "${jobId}";
function updateFromChatData() {
  if (!TW || !TW.chatData) return;
  try {
    const data = JSON.parse(TW.chatData);
    if (data.applied) {
      const btn = document.getElementById("applyBtn");
      if (btn) {
        btn.textContent = "✅ Ariza yuborilgan";
        btn.disabled = true;
      }
      const st = document.getElementById("status");
      if (st) st.textContent = "Siz ushbu ishga ariza topshirdingiz!";
    }
  } catch(e){}
}
if (TW) {
  TW.onEvent("chatDataChanged", updateFromChatData);
  updateFromChatData();
}
function doApply() {
  if (!TW) return;
  const st = document.getElementById("status");
  st.textContent = "Yuborilmoqda...";
  st.style.color = "var(--tg-theme-hint-color, #64748b)";
  TW.request("apply:" + jobId).then((res) => {
    const btn = document.getElementById("applyBtn");
    if (btn) {
      btn.textContent = "✅ Ariza yuborilgan";
      btn.disabled = true;
    }
    st.style.color = "#16a34a";
    st.textContent = res && res.result ? res.result : "Arizangiz qabul qilindi!";
  }).catch((err) => {
    st.style.color = "#dc2626";
    st.textContent = err.code === "NOT_ALLOWED" ? "Botga kiring" : "Xatolik: " + err.code;
  });
}
function doContact() {
  if (!TW) return;
  const st = document.getElementById("status");
  st.textContent = "Yuklanmoqda...";
  TW.request("contact:" + jobId).then((res) => {
    st.style.color = "var(--tg-theme-text-color, #0f172a)";
    st.textContent = res && res.result ? res.result : "Kontakt olindi!";
  }).catch((err) => {
    st.style.color = "#dc2626";
    st.textContent = "Xatolik: " + err.code;
  });
}
</script>
</body>
</html>`;
}

/**
 * Sends a job as an interactive Telegram Bot API 10.4 Widget.
 */
export async function sendJobAsWidget(
  bot: Bot<MyContext>,
  chatId: number | string,
  job: DBJob
) {
  const html = buildJobWidgetHtml(job);
  const contacts = extractContacts(job.description);

  const caption = [
    `📋 <b>${job.title}</b>`,
    `💰 <b>Ish haqi:</b> ${job.pay_amount.toLocaleString()} so‘m`,
    `📍 <b>Manzil:</b> ${job.district}, ${job.address}`,
    `👥 <b>Bo‘sh o‘rinlar:</b> ${job.openings} ta`,
    "",
    "<i>📱 Agar Telegram ilovangiz eng so‘nggi versiyaga yangilangan bo‘lsa, xabar ichida interaktiv HTML vidjet ko‘rinadi. Boshqa holatda quyidagi tugmalar orqali foydalanishingiz mumkin:</i>",
  ].join("\n");

  const kb = new InlineKeyboard();
  if (contacts.phone || contacts.tg) {
    if (contacts.tg) {
      kb.url("💬 Telegramdan yozish", "https://t.me/" + contacts.tg.replace("@", "")).row();
    }
    kb.text("📞 Bog‘lanish ma’lumotlari", `worker:contact_ext:${job.id}`).row();
  } else {
    kb.text("✋ Ariza yuborish", `worker:apply:${job.id}:all:0`).row();
  }
  kb.text("🔍 Barcha ishlarni ko‘rish", "worker:feed:all:0");

  return await sendWidgetMessage(bot, chatId, html, {
    caption,
    parseMode: "HTML",
    allowQueries: true,
    chatData: JSON.stringify({ jobId: job.id, applied: false }),
    replyMarkup: kb,
  });
}

/**
 * Central handler for incoming Bot API 10.4 Widget Queries (widget_query updates).
 */
export async function handleWidgetQuery(
  bot: Bot<MyContext>,
  query: WidgetQueryUpdate
) {
  try {
    const telegramId = query.from?.id;
    const queryData = query.data || "";

    if (queryData.startsWith("apply:")) {
      const jobId = queryData.replace("apply:", "").trim();
      const job = await getJobById(jobId);

      if (!job) {
        await answerWidgetQuery(bot, query.id, "❌ E’lon topilmadi yoki yakunlangan.");
        return;
      }

      if (!telegramId) {
        await answerWidgetQuery(bot, query.id, "❌ Foydalanuvchi aniqlanmadi.");
        return;
      }

      const user = await getUserByTelegramId(telegramId);
      if (!user) {
        await answerWidgetQuery(
          bot,
          query.id,
          "Iltimos, avval botda /start orqali ro‘yxatdan o‘ting!"
        );
        return;
      }

      // Submit application
      const res = await applyForJob(jobId, user.id);
      if (!res.success) {
        await answerWidgetQuery(bot, query.id, res.message || "Arizada xatolik yuz berdi.");
        return;
      }

      // Update widget's chatData to persist state inside the message bubble
      if (query.chat?.id && query.message_id) {
        await editMessageWidgetData(bot, {
          chatId: query.chat.id,
          messageId: query.message_id,
          chatData: JSON.stringify({ jobId, applied: true }),
        }).catch(() => {});
      }

      await answerWidgetQuery(bot, query.id, "✅ Arizangiz muvaffaqiyatli qabul qilindi!");
      return;
    }

    if (queryData.startsWith("contact:")) {
      const jobId = queryData.replace("contact:", "").trim();
      const job = await getJobById(jobId);

      if (!job) {
        await answerWidgetQuery(bot, query.id, "❌ E’lon topilmadi.");
        return;
      }

      const contacts = extractContacts(job.description);
      const answer = contacts.phone
        ? `📞 Tel: ${contacts.phone} ${contacts.tg ? "(" + contacts.tg + ")" : ""}`
        : "📞 Aloqa ma’lumoti tavsifda keltirilgan.";

      await answerWidgetQuery(bot, query.id, answer);
      return;
    }

    // Default response for unhandled queries
    await answerWidgetQuery(bot, query.id, "Qabul qilindi.");
  } catch (err: any) {
    console.error("handleWidgetQuery exception:", err);
    await answerWidgetQuery(bot, query.id, "Xatolik yuz berdi").catch(() => {});
  }
}

