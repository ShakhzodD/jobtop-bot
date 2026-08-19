import { Bot, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { run } from "@grammyjs/runner";
import { config, validateEnv } from "./config/env.js";
import { MyContext, SessionData } from "./types/context.js";
import { createJobConversation } from "./conversations/create-job.conversation.js";
import { editProfileConversation } from "./conversations/edit-profile.conversation.js";
import { registerStartHandlers } from "./handlers/start.handler.js";
import { registerWorkerHandlers } from "./handlers/worker.handler.js";
import { registerEmployerHandlers } from "./handlers/employer.handler.js";
import { registerAdminHandlers } from "./handlers/admin.handler.js";

// Validate environment
validateEnv();

if (!config.telegramBotToken) {
  console.error("❌ Xatolik: TELEGRAM_BOT_TOKEN topilmadi. .env faylini to'ldiring.");
  process.exit(1);
}

export const bot = new Bot<MyContext>(config.telegramBotToken);

// Setup session middleware
function initialSession(): SessionData {
  return {};
}

bot.use(session({ initial: initialSession }));

// Setup conversations plugin
bot.use(conversations());
bot.use(createConversation(createJobConversation));
bot.use(createConversation(editProfileConversation));

// Register Handlers
registerAdminHandlers(bot);
registerStartHandlers(bot);
registerWorkerHandlers(bot);
registerEmployerHandlers(bot);

// Catch errors
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  const e = err.error;
  console.error(e);
});

// Start bot
console.log("🚀 JobTop Telegram Bot ishga tushirilmoqda...");
const runner = run(bot);

const stopRunner = () => {
  if (runner.isRunning()) {
    console.log("Bot to'xtatilmoqda...");
    runner.stop();
  }
};

process.once("SIGINT", stopRunner);
process.once("SIGTERM", stopRunner);
