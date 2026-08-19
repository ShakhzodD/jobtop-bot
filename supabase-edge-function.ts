import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  Bot,
  Context,
  InlineKeyboard,
  Keyboard,
  SessionFlavor,
  session,
  webhookCallback,
} from "npm:grammy@^1.34.0";
import {
  type Conversation,
  type ConversationFlavor,
  conversations,
  createConversation,
} from "npm:@grammyjs/conversations@^2.1.1";
import { createClient } from "npm:@supabase/supabase-js@^2.49.1";

// 1. Environments & Config
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://gzmmlrzqzblykvsxnows.supabase.co";
const SUPABASE_API_KEY = Deno.env.get("SUPABASE_API_KEY") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6bW1scnpxemJseWt2c3hub3dzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAxNjE2ODMsImV4cCI6MjA1NTczNzY4M30.3j-QdE4z1e_1e68sPzTzL_82m2N8pZ0w";
const MAIN_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const MOD_BOT_TOKEN = Deno.env.get("MODERATION_BOT_TOKEN") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const ADMIN_IDS = (Deno.env.get("ADMIN_TELEGRAM_IDS") || "445057374")
  .split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => !isNaN(n));

export const supabase = createClient(SUPABASE_URL, SUPABASE_API_KEY);

// Types
export type UserRole = "worker" | "employer";
export interface SessionData {
  role?: UserRole;
}
export type MyContext = Context & SessionFlavor<SessionData> & ConversationFlavor;
export type MyConversation = Conversation<MyContext>;

export const JOB_CATEGORIES = ["Kuryer", "Xizmat", "Yuk tashish", "Tozalash"] as const;
export type JobCategory = (typeof JOB_CATEGORIES)[number];

// Smart Gemini / Regex Parser
function smartRegexFallback(rawText: string) {
  const lower = rawText.toLowerCase();
  let category: JobCategory = "Xizmat";
  if (lower.includes("yuk") || lower.includes("mebel") || lower.includes("tashish") || lower.includes("gruzchik")) {
    category = "Yuk tashish";
  } else if (lower.includes("kuryer") || lower.includes("yetkaz") || lower.includes("dostavka")) {
    category = "Kuryer";
  } else if (lower.includes("tozala") || lower.includes("uborka") || lower.includes("farrosh") || lower.includes("moyka")) {
    category = "Tozalash";
  }

  let payAmount = 200000;
  const thousandMatch = rawText.match(/(\d+)\s*(ming|k)/i);
  if (thousandMatch) {
    payAmount = parseInt(thousandMatch[1], 10) * 1000;
  } else {
    const fullNumMatch = rawText.match(/(\d[\d\s]{3,})\s*(so['‘`]?m|sum)?/i);
    if (fullNumMatch) {
      const num = parseInt(fullNumMatch[1].replace(/\s+/g, ""), 10);
      if (num >= 10000 && num <= 100000000) payAmount = num;
    }
  }

  let openings = 1;
  const openingsMatch = rawText.match(/(\d+)\s*(ta|nafar|kishi|yigit|ayol|ishchi)/i);
  if (openingsMatch) openings = parseInt(openingsMatch[1], 10);

  const districts = ["Chilonzor", "Yunusobod", "Mirzo Ulug‘bek", "Mirobod", "Shayxontohur", "Yakkasaroy", "Olmazor", "Uchtepa", "Sergeli", "Yangihayot", "Bektemir", "Yashnobod"];
  let district: string | null = null;
  for (const d of districts) {
    if (lower.includes(d.toLowerCase())) {
      district = d;
      break;
    }
  }

  return {
    isVacancy: true,
    category,
    title: rawText.slice(0, 50).trim() || "Kunlik ish",
    description: rawText,
    district: district || "Toshkent",
    address: district ? `${district} tumani` : "Toshkent shahri",
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    payAmount,
    openings,
    confidence: 0.7,
  };
}

async function parseJobWithAI(rawText: string): Promise<any> {
  const models = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite", "gemini-flash-latest"];
  const prompt = `Sen JobTop tizimi uchun e’lon tahlilchisisan. Foydalanuvchi yozgan matnni tahlil qilib, FAQAT bitta toza JSON obyekt qaytar.
Kategoriyalar: "Kuryer", "Xizmat", "Yuk tashish", "Tozalash".
Vaqt zonasi: Asia/Tashkent (+05:00).
JSON sxemasi:
{
  "isVacancy": true,
  "category": "Kuryer" | "Xizmat" | "Yuk tashish" | "Tozalash",
  "title": string,
  "description": string,
  "district": string,
  "address": string,
  "startsAt": string,
  "endsAt": string,
  "payAmount": number,
  "openings": number,
  "confidence": number
}
E’lon matni: ${rawText}`;

  for (const model of models) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0 },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const jsonStr = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (jsonStr) {
          const parsed = JSON.parse(jsonStr);
          return {
            ...parsed,
            category: JOB_CATEGORIES.includes(parsed.category) ? parsed.category : "Xizmat",
            payAmount: Number(parsed.payAmount) || 200000,
            openings: Number(parsed.openings) || 1,
          };
        }
      }
    } catch (_) {}
  }
  return smartRegexFallback(rawText);
}

// User Services
async function getUserByTelegramId(telegramId: number) {
  const { data } = await supabase.from("users").select("*").eq("telegram_id", telegramId).maybeSingle();
  return data;
}

async function upsertUser(userData: { telegram_id: number; full_name: string; telegram_username?: string | null; phone?: string | null; active_role?: UserRole }) {
  const { data, error } = await supabase.from("users").upsert(userData, { onConflict: "telegram_id" }).select("*").single();
  if (error) throw error;
  if (userData.active_role) {
    await supabase.from("user_roles").upsert({ user_id: data.id, role: userData.active_role }, { onConflict: "user_id,role" });
  }
  return data;
}

async function getUserRating(userId: string) {
  const { data } = await supabase.from("reviews").select("rating").eq("recipient_id", userId);
  if (!data || data.length === 0) return { starsStr: "⭐️ Yangi (Baholanmagan)", count: 0, average: 5.0 };
  const sum = data.reduce((acc, r) => acc + (r.rating || 0), 0);
  const avg = Number((sum / data.length).toFixed(1));
  return { starsStr: `⭐️ ${avg} (${data.length} ta baho)`, count: data.length, average: avg };
}

function getProfileCompletion(user: any) {
  const fields = [
    { name: "Telefon", val: Boolean(user?.phone) },
    { name: "Tuman", val: Boolean(user?.district) },
    { name: "Tajriba", val: typeof user?.experience_years === "number" },
    { name: "Haqida", val: Boolean(user?.about) },
  ];
  const percent = fields.filter((f) => f.val).length * 25;
  return { percent, isComplete: percent === 100 };
}

// Keyboards
const roleSelectionKeyboard = new InlineKeyboard()
  .text("👷 Men Ishchiman", "auth:role:worker")
  .row()
  .text("💼 Men Ish beruvchiman", "auth:role:employer");

const contactRequestKeyboard = new Keyboard()
  .requestContact("📱 Telefon raqamni yuborish")
  .resized()
  .oneTime();

function getWorkerMainMenu() {
  return new Keyboard()
    .text("🔍 Ishlarni ko‘rish")
    .text("📄 Mening arizalarim")
    .row()
    .text("👤 Mening profilim")
    .text("🔄 Ish beruvchi rejimiga o‘tish")
    .resized();
}

function getEmployerMainMenu() {
  return new Keyboard()
    .text("➕ Yangi e’lon berish")
    .text("📋 Mening e’lonlarim")
    .row()
    .text("🔄 Ishchi rejimiga o‘tish")
    .resized();
}

// Bot Instances
export const bot = new Bot<MyContext>(MAIN_BOT_TOKEN);
export const modBot = new Bot<MyContext>(MOD_BOT_TOKEN);

// Sessions & Middleware
bot.use(session({ initial: () => ({}) }));
bot.use(conversations());

// Instant callback response
bot.on("callback_query", async (ctx, next) => {
  ctx.answerCallbackQuery().catch(() => {});
  return next();
});
modBot.on("callback_query", async (ctx, next) => {
  ctx.answerCallbackQuery().catch(() => {});
  return next();
});

// Conversations
async function createJobConv(conversation: MyConversation, ctx: MyContext) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;
  const user = await conversation.external(() => getUserByTelegramId(telegramId));
  if (!user) return;

  await ctx.reply(
    `📝 <b>Yangi e’lon yaratish</b>\n\nE’lon haqida barcha ma’lumotlarni bitta xabarda erkin matn bilan yozing:\n<i>Masalan: “Ertaga Chilonzorda 2 ta yuk tashuvchi kerak, 250 mingdan”</i>\n\n✨ Tizimimiz uni avtomatik tarzda tayyor e’longa aylantiradi!`,
    { parse_mode: "HTML", reply_markup: { keyboard: [[{ text: "❌ Bekor qilish" }]], resize_keyboard: true } }
  );

  const msg = await conversation.waitFor("message:text");
  const text = msg.message.text.trim();
  if (text === "❌ Bekor qilish" || text === "/cancel") {
    await ctx.reply("Bekor qilindi.", { reply_markup: getEmployerMainMenu() });
    return;
  }

  await ctx.reply("⏳ <i>E’loningiz tahlil qilinmoqda...</i>", { parse_mode: "HTML" });
  const parsed = await conversation.external(() => parseJobWithAI(text));

  const summary = [
    `📋 <b>E’lon ko‘rinishi:</b>`,
    "",
    `📌 <b>Sarlavha:</b> ${parsed.title}`,
    `📂 <b>Kategoriya:</b> ${parsed.category}`,
    `📍 <b>Tuman / Manzil:</b> ${parsed.district}, ${parsed.address}`,
    `💰 <b>Ish haqi:</b> ${parsed.payAmount.toLocaleString()} so‘m`,
    `👥 <b>Ishchilar soni:</b> ${parsed.openings} ta`,
    `📝 <b>Tavsif:</b> ${parsed.description}`,
    "",
    "E’lonni tasdiqlab moderatsiyaga yuborasizmi?",
  ].join("\n");

  const kb = new InlineKeyboard().text("✅ Tasdiqlash", "job:confirm").row().text("❌ Bekor qilish", "job:cancel");
  const preview = await ctx.reply(summary, { parse_mode: "HTML", reply_markup: kb });

  const act = await conversation.waitFor("callback_query:data");
  await act.answerCallbackQuery().catch(() => {});

  if (act.callbackQuery.data === "job:confirm") {
    const { data: newJob } = await conversation.external(() =>
      supabase.from("jobs").insert({
        employer_id: user.id,
        category: parsed.category,
        title: parsed.title,
        description: parsed.description,
        district: parsed.district,
        address: parsed.address,
        starts_at: parsed.startsAt,
        ends_at: parsed.endsAt,
        pay_amount: parsed.payAmount,
        openings: parsed.openings,
        status: "pending_moderation",
      }).select().single()
    );

    // Notify moderation bot
    if (newJob) {
      const adminText = `🔔 <b>Yangi e’lon (Moderatsiya):</b>\n\n📌 <b>Sarlavha:</b> ${newJob.title}\n📂 <b>Kategoriya:</b> ${newJob.category}\n📍 <b>Manzil:</b> ${newJob.district}, ${newJob.address}\n💰 <b>Haq:</b> ${newJob.pay_amount.toLocaleString()} so‘m\n👥 <b>Ishchilar:</b> ${newJob.openings} ta\n👤 <b>Ish beruvchi:</b> ${user.full_name} (${user.phone || ""})\n\n📝 <b>Tavsif:</b>\n${newJob.description}`;
      const modKb = new InlineKeyboard().text("✅ Tasdiqlash", `admin:mod:${newJob.id}:publish`).text("❌ Rad etish", `admin:mod:${newJob.id}:reject`);
      for (const adminId of ADMIN_IDS) {
        await modBot.api.sendMessage(adminId, adminText, { parse_mode: "HTML", reply_markup: modKb }).catch(() => {});
      }
    }

    await ctx.api.deleteMessage(ctx.chat!.id, preview.message_id).catch(() => {});
    await ctx.reply("🎉 <b>E’loningiz moderatsiyaga yuborildi!</b>\n\nAdmin tasdiqlashi bilan ishchilarga ko‘rinadi.", {
      parse_mode: "HTML",
      reply_markup: getEmployerMainMenu(),
    });
  } else {
    await ctx.api.deleteMessage(ctx.chat!.id, preview.message_id).catch(() => {});
    await ctx.reply("E’lon bekor qilindi.", { reply_markup: getEmployerMainMenu() });
  }
}

async function editProfileConv(conversation: MyConversation, ctx: MyContext) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  await ctx.reply("Ism va familiyangizni kiriting:", { parse_mode: "HTML", reply_markup: { keyboard: [[{ text: "❌ Bekor qilish" }]], resize_keyboard: true } });
  const nameMsg = await conversation.waitFor("message:text");
  const name = nameMsg.message.text.trim();
  if (name === "❌ Bekor qilish") return ctx.reply("Bekor qilindi.", { reply_markup: getWorkerMainMenu() });

  await ctx.reply("Yashash tumaningizni kiriting (Masalan: <i>Chilonzor</i>):", { parse_mode: "HTML" });
  const distMsg = await conversation.waitFor("message:text");
  const district = distMsg.message.text.trim();

  await ctx.reply("Ish tajribangiz (necha yil, masalan: <i>2</i>):", { parse_mode: "HTML" });
  const expMsg = await conversation.waitFor("message:text");
  const expYears = parseInt(expMsg.message.text.trim(), 10) || 0;

  const categoriesList = JOB_CATEGORIES.map((c, i) => `${i + 1}. ${c}`).join("\n");
  await ctx.reply(`Qaysi sohalarda ishlamoqchisiz? Raqamlarini yozing (masalan: <i>1, 3</i>) yoki <i>Barchasi</i>:\n\n${categoriesList}`, { parse_mode: "HTML" });
  const catMsg = await conversation.waitFor("message:text");
  const catInput = catMsg.message.text.trim();
  let cats: string[] = ["Xizmat"];
  if (catInput.toLowerCase().includes("barchas")) {
    cats = [...JOB_CATEGORIES];
  } else {
    const indices = catInput.split(/[,;\s]+/).map((s) => parseInt(s.trim(), 10) - 1).filter((i) => i >= 0 && i < JOB_CATEGORIES.length);
    if (indices.length > 0) cats = indices.map((i) => JOB_CATEGORIES[i]);
  }

  await ctx.reply("O‘zingiz haqingizda qisqacha ma’lumot yozing:", { parse_mode: "HTML" });
  const aboutMsg = await conversation.waitFor("message:text");
  const about = aboutMsg.message.text.trim();

  await conversation.external(() =>
    supabase.from("users").update({ full_name: name, district, experience_years: expYears, worker_categories: cats, about }).eq("telegram_id", telegramId)
  );

  await ctx.reply(`✅ <b>Profilingiz muvaffaqiyatli yangilandi!</b>\n\n📌 <b>Ism:</b> ${name}\n📍 <b>Tuman:</b> ${district}\n💼 <b>Tajriba:</b> ${expYears} yil\n📂 <b>Sohalar:</b> ${cats.join(", ")}`, {
    parse_mode: "HTML",
    reply_markup: getWorkerMainMenu(),
  });
}

bot.use(createConversation(createJobConv));
bot.use(createConversation(editProfileConv));

// Main Bot Handlers
bot.command("start", async (ctx) => {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;
  const user = await getUserByTelegramId(telegramId);
  if (user && user.phone) {
    const menu = user.active_role === "employer" ? getEmployerMainMenu() : getWorkerMainMenu();
    return ctx.reply(`Xush kelibsiz, <b>${user.full_name}</b>! 👋\n\nSiz <b>${user.active_role === "employer" ? "💼 Ish beruvchi" : "👷 Ishchi"}</b> rejimidasiz.`, {
      parse_mode: "HTML",
      reply_markup: menu,
    });
  }
  await ctx.reply(`Assalomu alaykum! 👋\n\n<b>JobTop</b> — bir kunlik ishlar platformasiga xush kelibsiz.\n\nDavom etish uchun o‘z rolingizni tanlang:`, {
    parse_mode: "HTML",
    reply_markup: roleSelectionKeyboard,
  });
});

bot.callbackQuery(/^auth:role:(worker|employer)$/, async (ctx) => {
  const role = ctx.match[1] as UserRole;
  const telegramId = ctx.from.id;
  const fullName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") || "Foydalanuvchi";
  await upsertUser({ telegram_id: telegramId, full_name: fullName, telegram_username: ctx.from.username ?? null, active_role: role });
  await ctx.editMessageText(`✅ Rolingiz tanlandi: <b>${role === "employer" ? "💼 Ish beruvchi" : "👷 Ishchi"}</b>.\n\nEndi telefon raqamingizni yuboring:`, { parse_mode: "HTML" });
  await ctx.reply("Pastdagi tugmani bosing 👇", { reply_markup: contactRequestKeyboard });
});

bot.on("message:contact", async (ctx) => {
  const contact = ctx.message.contact;
  const telegramId = ctx.from?.id;
  if (!telegramId || !contact) return;
  const user = await upsertUser({
    telegram_id: telegramId,
    full_name: [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ") || "Foydalanuvchi",
    telegram_username: ctx.from?.username ?? null,
    phone: contact.phone_number,
  });
  const menu = user.active_role === "employer" ? getEmployerMainMenu() : getWorkerMainMenu();
  await ctx.reply(`🎉 <b>Tabriklaymiz, ro‘yxatdan o‘tdingiz!</b>`, { parse_mode: "HTML", reply_markup: menu });
  if (user.active_role === "worker") {
    await ctx.reply(`💡 <b>Maslahat:</b> Profilingizni to‘ldiring — to‘liq profilli nomzodlar 3 barobar tezroq ishga tanlanadi! 🚀`, {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().text("✏️ Profilni to‘ldirish", "worker:edit_profile"),
    });
  }
});

// Role Switch
bot.hears("🔄 Ish beruvchi rejimiga o‘tish", async (ctx) => {
  if (ctx.from?.id) {
    await supabase.from("users").update({ active_role: "employer" }).eq("telegram_id", ctx.from.id);
    await ctx.reply("Siz <b>💼 Ish beruvchi</b> rejimiga o‘tdingiz!", { parse_mode: "HTML", reply_markup: getEmployerMainMenu() });
  }
});
bot.hears("🔄 Ishchi rejimiga o‘tish", async (ctx) => {
  if (ctx.from?.id) {
    await supabase.from("users").update({ active_role: "worker" }).eq("telegram_id", ctx.from.id);
    await ctx.reply("Siz <b>👷 Ishchi</b> rejimiga o‘tdingiz!", { parse_mode: "HTML", reply_markup: getWorkerMainMenu() });
  }
});

// Employer Handlers
bot.hears("➕ Yangi e’lon berish", async (ctx) => {
  if (ctx.from?.id) {
    const user = await getUserByTelegramId(ctx.from.id);
    if (!user || !user.phone) return ctx.reply("Avval ro‘yxatdan o‘ting (/start).");
    await ctx.conversation.enter("createJobConv");
  }
});

bot.hears("📋 Mening e’lonlarim", async (ctx) => {
  if (!ctx.from?.id) return;
  const user = await getUserByTelegramId(ctx.from.id);
  if (!user) return;
  const { data: jobs } = await supabase.from("jobs").select("*").eq("employer_id", user.id).order("created_at", { ascending: false });
  if (!jobs || jobs.length === 0) return ctx.reply("Sizda hali e’lonlar yo‘q.");

  for (const j of jobs.slice(0, 10)) {
    const { data: apps } = await supabase.from("applications").select("party_size, status").eq("job_id", j.id);
    const selectedCount = (apps || []).filter((a) => a.status === "selected").reduce((acc, a) => acc + (a.party_size || 1), 0);
    const text = `📌 <b>${j.title}</b>\n📂 Kategoriya: ${j.category}\n📍 Manzil: ${j.district}, ${j.address}\n💰 Haq: ${j.pay_amount.toLocaleString()} so‘m\n👥 Kerak: ${j.openings} ta | Tanlandi: ${selectedCount} ta\nHolati: <b>${j.status}</b>`;
    const kb = new InlineKeyboard();
    if (apps && apps.length > 0) kb.text(`👥 Nomzodlar (${apps.length})`, `emp:apps:${j.id}`).row();
    if (j.status === "published" || j.status === "filled") {
      if (selectedCount > 0) kb.text("🏁 Ishni yakunlash va baholash", `emp:finish:${j.id}`).row();
      kb.text("⏹ To‘xtatish", `emp:close:${j.id}`);
    }
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
});

// View Applicants
bot.callbackQuery(/^emp:apps:(.+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  const { data: job } = await supabase.from("jobs").select("*").eq("id", jobId).single();
  const { data: apps } = await supabase.from("applications").select("*, worker:users!worker_id(*)").eq("job_id", jobId).neq("status", "withdrawn");
  if (!apps || apps.length === 0) return ctx.reply("Arizalar yo‘q.");

  for (const app of apps) {
    const worker = app.worker;
    const partySize = app.party_size || 1;
    const userRating = worker ? await getUserRating(worker.id) : null;
    const totalPay = job ? job.pay_amount * partySize : 0;

    const text = [
      `👤 <b>Nomzod:</b> ${worker?.full_name || "Noma'lum"}`,
      partySize > 1 ? `👥 <b>Ishchilar soni:</b> <b>${partySize} kishi</b> (Sheriklari bilan)` : `👥 <b>Ishchilar soni:</b> 1 kishi`,
      partySize > 1 ? `💰 <b>Jami haq:</b> ${totalPay.toLocaleString()} so‘m` : "",
      userRating ? `⭐️ <b>Reytingi:</b> ${userRating.starsStr}` : "",
      worker?.phone ? `📞 <b>Telefon:</b> <code>${worker.phone}</code>` : "",
      worker?.telegram_username ? `💬 <b>Telegram:</b> @${worker.telegram_username}` : "",
      worker?.district ? `📍 <b>Tuman:</b> ${worker.district}` : "",
      typeof worker?.experience_years === "number" ? `💼 <b>Tajriba:</b> ${worker.experience_years} yil` : "",
      worker?.about ? `📝 <b>Ma’lumot:</b> ${worker.about}` : "",
      `Holati: <b>${app.status}</b>`,
    ].filter(Boolean).join("\n");

    const kb = new InlineKeyboard();
    if (app.status === "pending") {
      kb.text(partySize > 1 ? `✅ ${partySize} kishini qabul qilish` : "✅ Qabul qilish", `emp:select:${app.id}`).text("❌ Rad etish", `emp:reject:${app.id}`);
    }
    if (worker?.telegram_username) kb.row().url("✉️ Nomzodga yozish", `https://t.me/${worker.telegram_username}`);
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
});

// Select Application
bot.callbackQuery(/^emp:select:(.+)$/, async (ctx) => {
  const appId = ctx.match[1];
  const { data: app } = await supabase.from("applications").update({ status: "selected" }).eq("id", appId).select("*, worker:users!worker_id(*), job:jobs!job_id(*, employer:users!employer_id(*))").single();
  if (!app) return;

  const partySize = app.party_size || 1;
  const job = app.job;
  const worker = app.worker;
  const employer = job?.employer;

  const { data: allSel } = await supabase.from("applications").select("party_size").eq("job_id", app.job_id).eq("status", "selected");
  const totalSel = (allSel || []).reduce((acc, a) => acc + (a.party_size || 1), 0);
  const isFilled = totalSel >= (job?.openings || 1);
  if (isFilled) await supabase.from("jobs").update({ status: "filled" }).eq("id", app.job_id);

  let msg = `🎉 <b>Siz ${partySize > 1 ? `${worker?.full_name} boshchiligidagi ${partySize} kishini` : worker?.full_name} ishga qabul qildingiz!</b>\n\n📞 <b>Telefon:</b> <code>${worker?.phone || ""}</code>\nTanlanganlar: <b>${totalSel}/${job?.openings || 1} ta</b>.`;
  if (isFilled) msg += `\n\n🎊 <b>Barcha o‘rinlar to‘ldi!</b> E’lon qidiruvdan olindi.`;
  await ctx.reply(msg, { parse_mode: "HTML" });

  // Notify Worker with Share button
  if (worker?.telegram_id) {
    const totalPay = (job?.pay_amount || 0) * partySize;
    const workerText = `🎉 <b>Xushxabar! Ish beruvchi sizni ${partySize > 1 ? `(${partySize} kishi uchun)` : ""} ishga qabul qildi!</b>\n\n📌 <b>E’lon:</b> ${job?.title}\n📍 <b>Manzil:</b> ${job?.district}, ${job?.address}\n💰 <b>Haq:</b> ${job?.pay_amount.toLocaleString()} so‘m (Jami: ${totalPay.toLocaleString()} so‘m)\n🏢 <b>Ish beruvchi:</b> ${employer?.full_name} (<code>${employer?.phone || ""}</code>)`;
    const kb = new InlineKeyboard();
    if (partySize > 1) {
      const shareText = `JobTop orqali ish:\n📌 Ish: ${job?.title}\n📍 Manzil: ${job?.district}, ${job?.address}\n💰 Haq: ${job?.pay_amount.toLocaleString()} so‘mdan\n👤 Ish beruvchi: ${employer?.full_name} (${employer?.phone || ""})`;
      kb.url("📤 Manzilni sheriklarga yuborish", `https://t.me/share/url?url=https://t.me/jobtopuzbot&text=${encodeURIComponent(shareText)}`);
    }
    await bot.api.sendMessage(worker.telegram_id, workerText, { parse_mode: "HTML", reply_markup: partySize > 1 ? kb : undefined }).catch(() => {});
  }
});

// Reject Application
bot.callbackQuery(/^emp:reject:(.+)$/, async (ctx) => {
  const appId = ctx.match[1];
  const { data: app } = await supabase.from("applications").update({ status: "rejected" }).eq("id", appId).select("*, worker:users!worker_id(*), job:jobs!job_id(*)").single();
  await ctx.editMessageText("❌ Ushbu nomzod arizasi rad etildi.");
  if (app?.worker?.telegram_id) {
    const rejText = `ℹ️ Hurmatli <b>${app.worker.full_name}</b>, sizning <b>“${app.job?.title || "E’lon"}”</b> bo‘yicha arizangiz rad etildi.\n\nXafa bo‘lmang, boshqa ishlar ko‘p! 👇`;
    await bot.api.sendMessage(app.worker.telegram_id, rejText, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("🔍 Boshqa ishlarni ko‘rish", "worker:feed:all:0") }).catch(() => {});
  }
});

// Finish Job & Rate
bot.callbackQuery(/^emp:finish:(.+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  await supabase.from("jobs").update({ status: "completed" }).eq("id", jobId);
  const { data: apps } = await supabase.from("applications").select("*, worker:users!worker_id(*)").eq("job_id", jobId).eq("status", "selected");
  await ctx.editMessageText("🏁 <b>Ish yakunlandi!</b> Qatnashgan ishchilarni baholang:", { parse_mode: "HTML" });
  for (const app of apps || []) {
    if (app.worker) {
      const kb = new InlineKeyboard().text("⭐️ 1", `emp:rate:${jobId}:${app.worker.id}:1`).text("⭐️ 2", `emp:rate:${jobId}:${app.worker.id}:2`).text("⭐️ 3", `emp:rate:${jobId}:${app.worker.id}:3`).text("⭐️ 4", `emp:rate:${jobId}:${app.worker.id}:4`).text("⭐️ 5", `emp:rate:${jobId}:${app.worker.id}:5`);
      await ctx.reply(`👤 <b>Ishchi:</b> ${app.worker.full_name} (${app.party_size || 1} kishi)\nBaholang:`, { parse_mode: "HTML", reply_markup: kb });
    }
  }
});

bot.callbackQuery(/^emp:rate:(.+):(.+):(\d+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  const workerUserId = ctx.match[2];
  const rating = parseInt(ctx.match[3], 10);
  const user = await getUserByTelegramId(ctx.from.id);
  if (user) {
    await supabase.from("reviews").upsert({ job_id: jobId, author_id: user.id, recipient_id: workerUserId, rating }, { onConflict: "job_id,author_id" });
    await ctx.editMessageText(`✅ <b>Ishchiga ${"⭐️".repeat(rating)} baho berildi!</b>`, { parse_mode: "HTML" });
    const { data: worker } = await supabase.from("users").select("telegram_id").eq("id", workerUserId).single();
    if (worker?.telegram_id) {
      await bot.api.sendMessage(worker.telegram_id, `🎉 <b>Ish beruvchi sizga ${"⭐️".repeat(rating)} baho berdi!</b>`, { parse_mode: "HTML" }).catch(() => {});
    }
  }
});

// Worker Feed
bot.hears("🔍 Ishlarni ko‘rish", async (ctx) => {
  const kb = new InlineKeyboard().text("🌐 Barcha kategoriyalar", "worker:feed:all:0").row();
  JOB_CATEGORIES.forEach((cat, idx) => {
    kb.text(cat, `worker:feed:${cat}:0`);
    if (idx % 2 === 1) kb.row();
  });
  await ctx.reply("Qaysi sohadagi ishlarni ko‘rmoqchisiz?", { reply_markup: kb });
});

bot.callbackQuery(/^worker:feed:(.+):(\d+)$/, async (ctx) => {
  const categoryParam = ctx.match[1];
  const offset = parseInt(ctx.match[2], 10);
  let q = supabase.from("jobs").select("*, employer:users!employer_id(*)", { count: "exact" }).eq("status", "published").order("created_at", { ascending: false });
  if (categoryParam !== "all") q = q.eq("category", categoryParam);
  const { data: jobs, count } = await q.range(offset, offset);
  const total = count || 0;

  if (total === 0 || !jobs || jobs.length === 0) {
    return ctx.editMessageText("Hozircha e’lonlar yo‘q.", { reply_markup: new InlineKeyboard().text("🔙 Kategoriyalar", "worker:back_categories") });
  }

  const job = jobs[0];
  const lines = [
    `📋 <b>${job.title}</b> (${offset + 1}/${total})`,
    "",
    `📂 <b>Kategoriya:</b> ${job.category}`,
    `📍 <b>Tuman:</b> ${job.district}, ${job.address}`,
    `💰 <b>Haq:</b> ${job.pay_amount.toLocaleString()} so‘m`,
    `👥 <b>Bo‘sh o‘rinlar:</b> ${job.openings} ta`,
    `🕒 <b>Vaqt:</b> ${new Date(job.starts_at).toLocaleString("uz-UZ")}`,
    `\n📝 <b>Tavsif:</b>\n${job.description}`,
  ];

  const kb = new InlineKeyboard();
  kb.text("✋ Ariza yuborish", `worker:apply:${job.id}:${categoryParam}:${offset}`).row();

  if (offset > 0) kb.text("⬅️ Oldingisi", `worker:feed:${categoryParam}:${offset - 1}`);
  if (offset + 1 < total) kb.text("Keyingisi ➡️", `worker:feed:${categoryParam}:${offset + 1}`);
  kb.row().text("📂 Kategoriyalar", "worker:back_categories");

  await ctx.editMessageText(lines.join("\n"), { parse_mode: "HTML", reply_markup: kb });
});

bot.callbackQuery("worker:back_categories", async (ctx) => {
  const kb = new InlineKeyboard().text("🌐 Barcha kategoriyalar", "worker:feed:all:0").row();
  JOB_CATEGORIES.forEach((c, idx) => {
    kb.text(c, `worker:feed:${c}:0`);
    if (idx % 2 === 1) kb.row();
  });
  await ctx.editMessageText("Kategoriyani tanlang:", { reply_markup: kb });
});

// Worker Apply with Group Support
bot.callbackQuery(/^worker:apply:(.+):(.+):(\d+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  const categoryParam = ctx.match[2];
  const offset = ctx.match[3];
  const user = await getUserByTelegramId(ctx.from.id);
  if (!user) return ctx.reply("Avval ro‘yxatdan o‘ting (/start).");

  const { data: job } = await supabase.from("jobs").select("*").eq("id", jobId).single();
  if (!job) return ctx.reply("E’lon topilmadi.");

  const { data: selApps } = await supabase.from("applications").select("party_size").eq("job_id", jobId).eq("status", "selected");
  const filled = (selApps || []).reduce((acc, a) => acc + (a.party_size || 1), 0);
  const remaining = Math.max(job.openings - filled, 1);

  if (job.openings > 1 && remaining > 1) {
    const pKb = new InlineKeyboard().text("👤 Faqat o‘zim (1 kishi)", `worker:apply_p:${jobId}:1:${categoryParam}:${offset}`).row();
    for (let count = 2; count <= Math.min(remaining, 6); count++) {
      pKb.text(`👥 ${count} kishi`, `worker:apply_p:${jobId}:${count}:${categoryParam}:${offset}`);
      if (count % 2 === 1) pKb.row();
    }
    pKb.row().text("🔙 Ortga", `worker:feed:${categoryParam}:${offset}`);
    return ctx.editMessageText(`👥 <b>Necha kishi bo‘lib ishlamoqchisiz?</b>\nE’londa <b>${remaining} ta</b> o‘rin mavjud:\nKunlik haq: ${job.pay_amount.toLocaleString()} so‘mdan`, {
      parse_mode: "HTML",
      reply_markup: pKb,
    });
  }

  await applyWithParty(ctx, job, user, 1);
});

bot.callbackQuery(/^worker:apply_p:(.+):(\d+):(.+):(\d+)$/, async (ctx) => {
  const jobId = ctx.match[1];
  const partySize = parseInt(ctx.match[2], 10) || 1;
  const user = await getUserByTelegramId(ctx.from.id);
  const { data: job } = await supabase.from("jobs").select("*").eq("id", jobId).single();
  if (user && job) await applyWithParty(ctx, job, user, partySize);
});

async function applyWithParty(ctx: any, job: any, user: any, partySize: number) {
  const { data: existing } = await supabase.from("applications").select("id, status").eq("job_id", job.id).eq("worker_id", user.id).maybeSingle();
  if (existing && existing.status !== "withdrawn") {
    return ctx.reply("Siz ushbu e’longa allaqachon ariza yuborgansiz.");
  }

  let appData;
  if (existing && existing.status === "withdrawn") {
    const { data } = await supabase.from("applications").update({ status: "pending", party_size: partySize }).eq("id", existing.id).select().single();
    appData = data;
  } else {
    const { data } = await supabase.from("applications").insert({ job_id: job.id, worker_id: user.id, party_size: partySize, status: "pending" }).select().single();
    appData = data;
  }

  await ctx.reply(`✅ <b>Arizangiz (${partySize} kishi uchun) ish beruvchiga yuborildi!</b>`, { parse_mode: "HTML" });

  // Notify Employer
  if (job.employer_id && appData) {
    const { data: emp } = await supabase.from("users").select("telegram_id").eq("id", job.employer_id).single();
    if (emp?.telegram_id) {
      const userRating = await getUserRating(user.id);
      const totalPay = job.pay_amount * partySize;
      const empText = [
        "🔔 <b>E’loningizga yangi ariza tushdi!</b>",
        "",
        `📌 <b>E’lon:</b> ${job.title}`,
        `👤 <b>Nomzod:</b> ${user.full_name}`,
        partySize > 1 ? `👥 <b>Ishchilar soni:</b> <b>${partySize} kishi</b> (Sheriklar bilan)` : `👥 <b>Ishchilar soni:</b> 1 kishi`,
        partySize > 1 ? `💰 <b>Jami haq:</b> ${totalPay.toLocaleString()} so‘m` : "",
        `⭐️ <b>Reytingi:</b> ${userRating.starsStr}`,
        user.phone ? `📞 <b>Telefon:</b> <code>${user.phone}</code>` : "",
        user.telegram_username ? `💬 <b>Telegram:</b> @${user.telegram_username}` : "",
        user.district ? `📍 <b>Tuman:</b> ${user.district}` : "",
      ].filter(Boolean).join("\n");

      const empKb = new InlineKeyboard()
        .text(partySize > 1 ? `✅ ${partySize} kishini qabul qilish` : "✅ Qabul qilish", `emp:select:${appData.id}`)
        .text("❌ Rad etish", `emp:reject:${appData.id}`);
      if (user.telegram_username) empKb.row().url("✉️ Telegramdan yozish", `https://t.me/${user.telegram_username}`);

      await bot.api.sendMessage(emp.telegram_id, empText, { parse_mode: "HTML", reply_markup: empKb }).catch(() => {});
    }
  }
}

// Worker Applications
bot.hears("📄 Mening arizalarim", async (ctx) => {
  if (!ctx.from?.id) return;
  const user = await getUserByTelegramId(ctx.from.id);
  if (!user) return;
  const { data: apps } = await supabase.from("applications").select("*, job:jobs!job_id(*, employer:users!employer_id(*))").eq("worker_id", user.id).neq("status", "withdrawn").order("created_at", { ascending: false });
  if (!apps || apps.length === 0) return ctx.reply("Topshirilgan arizalar yo‘q.");

  await ctx.reply(`📄 <b>Mening arizalarim (${apps.length} ta):</b>`, { parse_mode: "HTML" });
  for (let i = 0; i < apps.length; i++) {
    const app = apps[i];
    const job = app.job;
    let msg = `<b>${i + 1}. ${job?.title}</b>\n👥 Ishchilar: ${app.party_size || 1} kishi\n💰 Haq: ${job?.pay_amount.toLocaleString()} so‘m\nHolati: <b>${app.status}</b>\n`;
    if (app.status === "selected" && job?.employer?.phone) msg += `📞 Ish beruvchi: ${job.employer.phone}\n`;
    const kb = new InlineKeyboard();
    if (app.status === "pending") kb.text("❌ Arizani bekor qilish", `worker:withdraw:${app.id}`);
    if (app.status === "selected") kb.text("🚫 Borolmayman (Bekor qilish)", `worker:cancel_acc_prompt:${app.id}`);
    await ctx.reply(msg, { parse_mode: "HTML", reply_markup: app.status === "pending" || app.status === "selected" ? kb : undefined });
  }
});

bot.callbackQuery(/^worker:withdraw:(.+)$/, async (ctx) => {
  const appId = ctx.match[1];
  await supabase.from("applications").update({ status: "withdrawn" }).eq("id", appId);
  await ctx.editMessageText("❌ Ushbu arizangiz bekor qilindi.");
});

bot.callbackQuery(/^worker:cancel_acc_prompt:(.+)$/, async (ctx) => {
  const appId = ctx.match[1];
  const kb = new InlineKeyboard()
    .text("🤒 Sog‘lig‘im to‘g‘ri kelmadi", `worker:cancel_acc_do:${appId}:Sog'liq sababli`)
    .row()
    .text("🚗 Boshqa reja chiqib qoldi", `worker:cancel_acc_do:${appId}:Boshqa reja`)
    .row()
    .text("🔙 Ortga", "worker:cancel_acc_back");
  await ctx.editMessageText("⚠️ Ishga bora olmasligingiz sababini tanlang (ish beruvchiga xabar boradi):", { parse_mode: "HTML", reply_markup: kb });
});

bot.callbackQuery(/^worker:cancel_acc_do:(.+):(.+)$/, async (ctx) => {
  const appId = ctx.match[1];
  const reason = ctx.match[2];
  const { data: app } = await supabase.from("applications").update({ status: "withdrawn", note: `Bekor qilindi: ${reason}` }).eq("id", appId).select("*, worker:users!worker_id(*), job:jobs!job_id(*, employer:users!employer_id(*))").single();
  await ctx.editMessageText(`🚫 <b>Bekor qilindi.</b> Sabab: <i>${reason}</i>\nIsh beruvchiga xabar berildi.`, { parse_mode: "HTML" });

  if (app?.job?.status === "filled") {
    await supabase.from("jobs").update({ status: "published" }).eq("id", app.job.id);
  }

  if (app?.job?.employer?.telegram_id) {
    const text = `⚠️ <b>Diqqat! Ishchi bora olmasligini bildirdi:</b>\n📌 <b>E’lon:</b> ${app.job.title}\n👤 <b>Ishchi:</b> ${app.worker.full_name} (${app.worker.phone || ""})\n📝 <b>Sabab:</b> ${reason}\n\n💡 <i>Bo‘sh o‘rin qayta ochildi.</i>`;
    await bot.api.sendMessage(app.job.employer.telegram_id, text, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("👥 Nomzodlarni ko‘rish", `emp:apps:${app.job.id}`) }).catch(() => {});
  }
});

bot.callbackQuery("worker:cancel_acc_back", async (ctx) => {
  await ctx.editMessageText("Bekor qilish bekor qilindi.");
});

// Profile View
bot.hears("👤 Mening profilim", async (ctx) => {
  if (!ctx.from?.id) return;
  const user = await getUserByTelegramId(ctx.from.id);
  if (!user) return;
  const rating = await getUserRating(user.id);
  const { percent } = getProfileCompletion(user);

  const text = [
    `👤 <b>Mening profilim:</b>`,
    "",
    `⭐️ <b>Reyting:</b> ${rating.starsStr}`,
    `📊 <b>To‘liqlik:</b> ${percent}%`,
    `📛 <b>Ism:</b> ${user.full_name}`,
    `📱 <b>Telefon:</b> ${user.phone || "Kiritilmagan"}`,
    `📍 <b>Tuman:</b> ${user.district || "Kiritilmagan"}`,
    `💼 <b>Tajriba:</b> ${user.experience_years ? `${user.experience_years} yil` : "Kiritilmagan"}`,
    `📂 <b>Sohalar:</b> ${user.worker_categories?.join(", ") || "Belgilanmagan"}`,
    `📝 <b>Haqida:</b> ${user.about || "Kiritilmagan"}`,
  ].join("\n");

  await ctx.reply(text, { parse_mode: "HTML", reply_markup: new InlineKeyboard().text("✏️ Profilni tahrirlash", "worker:edit_profile") });
});

bot.callbackQuery("worker:edit_profile", async (ctx) => {
  await ctx.conversation.enter("editProfileConv");
});

// MODERATION BOT HANDLERS
modBot.use(async (ctx, next) => {
  const telegramId = ctx.from?.id;
  if (!telegramId || !ADMIN_IDS.includes(telegramId)) {
    if (ctx.message || ctx.callbackQuery) {
      await ctx.reply("⛔️ Ushbu bot faqat JobTop adminlari uchun.", { parse_mode: "HTML" }).catch(() => {});
    }
    return;
  }
  return next();
});

modBot.command("start", async (ctx) => {
  await ctx.reply(`👋 Assalomu alaykum, <b>Admin</b>!\n\nJobTop Moderatsiya botidasiz.\n• Yangi e’lonlar shu yerga keladi.\n• <b>📋 Moderatsiyadagi e’lonlar</b> orqali ko‘rib chiqishingiz mumkin.`, {
    parse_mode: "HTML",
    reply_markup: new Keyboard().text("📋 Moderatsiyadagi e’lonlar").text("📊 Statistika").resized(),
  });
});

modBot.hears("📋 Moderatsiyadagi e’lonlar", async (ctx) => {
  const { data: jobs } = await supabase.from("jobs").select("*, employer:users!employer_id(*)").eq("status", "pending_moderation").order("created_at", { ascending: false });
  if (!jobs || jobs.length === 0) return ctx.reply("✅ Moderatsiyada kutilayotgan e’lonlar yo‘q!");

  await ctx.reply(`📥 <b>Kutilayotgan e’lonlar soni: ${jobs.length} ta</b>:`, { parse_mode: "HTML" });
  for (const j of jobs) {
    const text = `🔔 <b>Moderatsiyadagi e’lon:</b>\n\n📌 <b>Sarlavha:</b> ${j.title}\n📂 <b>Kategoriya:</b> ${j.category}\n📍 <b>Manzil:</b> ${j.district}, ${j.address}\n💰 <b>Haq:</b> ${j.pay_amount.toLocaleString()} so‘m\n👥 <b>Ishchilar:</b> ${j.openings} ta\n👤 <b>Ish beruvchi:</b> ${j.employer?.full_name} (${j.employer?.phone || ""})\n\n📝 <b>Tavsif:</b>\n${j.description}`;
    const kb = new InlineKeyboard().text("✅ Tasdiqlash", `admin:mod:${j.id}:publish`).text("❌ Rad etish", `admin:mod:${j.id}:reject`);
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: kb });
  }
});

modBot.hears("📊 Statistika", async (ctx) => {
  const [{ count: users }, { count: pubJobs }, { count: pendJobs }, { count: apps }] = await Promise.all([
    supabase.from("users").select("*", { count: "exact", head: true }),
    supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "published"),
    supabase.from("jobs").select("*", { count: "exact", head: true }).eq("status", "pending_moderation"),
    supabase.from("applications").select("*", { count: "exact", head: true }),
  ]);
  await ctx.reply(`📊 <b>Statistika:</b>\n\n👥 Foydalanuvchilar: ${users || 0} ta\n🟢 Faol e’lonlar: ${pubJobs || 0} ta\n⏳ Moderatsiyada: ${pendJobs || 0} ta\n📄 Jami arizalar: ${apps || 0} ta`, { parse_mode: "HTML" });
});

modBot.callbackQuery(/^admin:mod:(.+):(publish|reject)$/, async (ctx) => {
  const jobId = ctx.match[1];
  const action = ctx.match[2];
  const nextStatus = action === "publish" ? "published" : "cancelled";

  const { data: job } = await supabase.from("jobs").update({ status: nextStatus }).eq("id", jobId).select("*, employer:users!employer_id(*)").single();
  const icon = action === "publish" ? "✅ Tasdiqlandi (Faol)" : "❌ Rad etildi";
  await ctx.editMessageText(`${ctx.callbackQuery.message?.text}\n\n───────────────\n<b>${icon} (Admin: ${ctx.from.first_name})</b>`, { parse_mode: "HTML" });

  if (action === "publish" && job) {
    if (job.employer?.telegram_id) {
      await bot.api.sendMessage(job.employer.telegram_id, `✅ <b>E’loningiz tasdiqlandi!</b>\n\n“${job.title}” muvaffaqiyatli chiqardi.`, { parse_mode: "HTML" }).catch(() => {});
    }
  }
});

// WEBHOOK HANDLER
const handleMainWebhook = webhookCallback(bot, "std/http");
const handleModWebhook = webhookCallback(modBot, "std/http");

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const botType = url.searchParams.get("bot");
  const action = url.searchParams.get("action");

  // Webhook registration helper endpoint
  if (action === "set_webhooks") {
    const baseUrl = `${url.origin}${url.pathname}`;
    const mainRes = await fetch(`https://api.telegram.org/bot${MAIN_BOT_TOKEN}/setWebhook?url=${encodeURIComponent(`${baseUrl}?bot=main`)}`);
    const modRes = await fetch(`https://api.telegram.org/bot${MOD_BOT_TOKEN}/setWebhook?url=${encodeURIComponent(`${baseUrl}?bot=mod`)}`);
    const mainJson = await mainRes.json();
    const modJson = await modRes.json();
    return new Response(JSON.stringify({ mainBotWebhook: mainJson, modBotWebhook: modJson }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method === "POST") {
    if (botType === "mod") {
      return handleModWebhook(req);
    }
    return handleMainWebhook(req);
  }

  return new Response(JSON.stringify({ status: "ok", service: "JobTop Supabase Telegram Webhook" }), {
    headers: { "Content-Type": "application/json" },
  });
});
