import { Bot, session } from "grammy";
import { config, validateEnv } from "../config/env.js";
import { MyContext, SessionData } from "../types/context.js";

validateEnv();

if (!config.telegramBotToken) {
  console.error("❌ Xatolik: TELEGRAM_BOT_TOKEN topilmadi. .env faylini to'ldiring.");
  process.exit(1);
}

// 1. Main User Bot (@jobtopuzbot)
export const bot = new Bot<MyContext>(config.telegramBotToken);

// 2. Dedicated Moderation Bot (@jobtopmoderationbot)
export const modBot =
  config.moderationBotToken && config.moderationBotToken !== config.telegramBotToken
    ? new Bot<MyContext>(config.moderationBotToken)
    : bot;

function initialSession(): SessionData {
  return {};
}

bot.use(session({ initial: initialSession }));
if (modBot !== bot) {
  modBot.use(session({ initial: initialSession }));
}
