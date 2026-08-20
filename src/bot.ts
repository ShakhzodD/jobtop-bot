import { feedbackConversation } from "./conversations/feedback.conversation.js";
import { startChannelScraperCron } from "./services/channel-scraper.service.js";
import http from "node:http";

// Global uncaught exception protection
process.on("uncaughtException", (err) => {
  console.error("Global uncaughtException:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("Global unhandledRejection:", reason);
});

// 1. Immediate Health Check Server for Cloud Hosting (Render / Railway / Koyeb)
const PORT = Number(process.env.PORT) || 10000;
const server = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ status: "ok", service: "JobTop Telegram Bot", uptime: process.uptime() }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`📡 Health check server listening on 0.0.0.0:${PORT}`);
});

import { conversations, createConversation } from "@grammyjs/conversations";
import { run } from "@grammyjs/runner";
import { bot, modBot } from "./core/bots.js";
import { createJobConversation } from "./conversations/create-job.conversation.js";
import { editProfileConversation } from "./conversations/edit-profile.conversation.js";
import { registerStartHandlers } from "./handlers/start.handler.js";
import { registerWorkerHandlers } from "./handlers/worker.handler.js";
import { registerEmployerHandlers } from "./handlers/employer.handler.js";
import { registerAdminHandlers } from "./handlers/admin.handler.js";

// Instant callback query response & loading state middleware
bot.on("callback_query", async (ctx, next) => {
  ctx.answerCallbackQuery().catch(() => {});
  return next();
});

if (modBot !== bot) {
  modBot.on("callback_query", async (ctx, next) => {
    ctx.answerCallbackQuery().catch(() => {});
    return next();
  });
}

// Setup conversations plugin on main bot
bot.use(conversations());
bot.use(createConversation(createJobConversation));
bot.use(createConversation(editProfileConversation));
bot.use(createConversation(feedbackConversation));

// Register User Handlers (on Main Bot)
registerStartHandlers(bot);
registerWorkerHandlers(bot);
registerEmployerHandlers(bot);

// Register Moderation / Admin Handlers (on Moderation Bot)
registerAdminHandlers(modBot, bot);

// Catch errors safely without crashing
bot.catch((err) => {
  console.error("Main Bot error:", err.message || err.error || err);
});

if (modBot !== bot) {
  modBot.catch((err) => {
    console.error("Moderation Bot error:", err.message || err.error || err);
  });
}

// Start bot runners safely with automatic webhook cleanup
async function startBots() {
  try {
    await bot.api.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
    if (modBot !== bot) {
      await modBot.api.deleteWebhook({ drop_pending_updates: false }).catch(() => {});
    }

    console.log("🚀 JobTop Asosiy Bot va Moderatsiya Boti ishga tushirilmoqda...");
    startChannelScraperCron(3);
    const runner1 = run(bot);
    const runner2 = modBot !== bot ? run(modBot) : null;

    const stopRunners = () => {
      if (runner1 && runner1.isRunning()) runner1.stop();
      if (runner2 && runner2.isRunning()) runner2.stop();
      server.close();
      console.log("Botlar to'xtatildi.");
    };

    process.once("SIGINT", stopRunners);
    process.once("SIGTERM", stopRunners);
  } catch (err) {
    console.error("Bot start error:", err);
  }
}

startBots();
