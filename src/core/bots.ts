import { Bot, session } from "grammy";
import { config, validateEnv } from "../config/env.js";
import { MyContext, SessionData } from "../types/context.js";

validateEnv();

const token = config.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN || "8995693178:AAGcgGQTYIhxrsYR1cIQGpLuaFciDU2EFEA";
const modToken = config.moderationBotToken || process.env.MODERATION_BOT_TOKEN || "8037368717:AAG0fjAbDAVABLOFi9gUUM0seaQCfEw77B4";

// 1. Main User Bot (@jobtopuzbot)
export const bot = new Bot<MyContext>(token);

// 2. Dedicated Moderation Bot (@jobtopmoderationbot)
export const modBot = modToken && modToken !== token ? new Bot<MyContext>(modToken) : bot;

function initialSession(): SessionData {
  return {};
}

bot.use(session({ initial: initialSession }));
if (modBot !== bot) {
  modBot.use(session({ initial: initialSession }));
}
