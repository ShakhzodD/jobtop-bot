import { MiddlewareFn } from "grammy";
import { MyContext } from "../types/context.js";
import { config } from "../config/env.js";

// 1. Sliding Window Rate Limiter (In-Memory Anti-Spam / Anti-DDoS)
interface RateLimitRecord {
  timestamps: number[];
  warningSentAt?: number;
}

const userRateLimits = new Map<number, RateLimitRecord>();

const MAX_REQUESTS_PER_WINDOW = 5; // Max 5 requests
const WINDOW_DURATION_MS = 2000;   // In 2 seconds
const WARNING_COOLDOWN_MS = 10000; // Only warn once every 10 seconds

export const rateLimitMiddleware: MiddlewareFn<MyContext> = async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();

  // Admin is exempt from rate limits
  if (config.adminTelegramIds.includes(userId)) {
    return next();
  }

  const now = Date.now();
  let record = userRateLimits.get(userId);

  if (!record) {
    record = { timestamps: [now] };
    userRateLimits.set(userId, record);
    return next();
  }

  // Filter timestamps within sliding window
  record.timestamps = record.timestamps.filter((ts) => now - ts < WINDOW_DURATION_MS);
  record.timestamps.push(now);

  if (record.timestamps.length > MAX_REQUESTS_PER_WINDOW) {
    console.warn(`🛡 [Anti-Flood] User ${userId} (${ctx.from?.first_name}) throttled for excessive requests.`);
    
    // Only send warning once per cooldown
    if (!record.warningSentAt || now - record.warningSentAt > WARNING_COOLDOWN_MS) {
      record.warningSentAt = now;
      await ctx.reply("⚠️ <b>Xavfsizlik:</b> Iltimos, juda tez xabar yubormang. 2 soniya kuting.", {
        parse_mode: "HTML",
      }).catch(() => {});
    }
    return; // Block execution
  }

  return next();
};

// Periodically clean up old rate limit records (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [userId, record] of userRateLimits.entries()) {
    if (record.timestamps.length === 0 || now - Math.max(...record.timestamps) > 60000) {
      userRateLimits.delete(userId);
    }
  }
}, 10 * 60 * 1000);

// 2. Strict Admin Authorization Guard for Moderation Bot
export const adminOnlyGuard: MiddlewareFn<MyContext> = async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId || !config.adminTelegramIds.includes(userId)) {
    console.warn(`🚨 [Security] Ruxsatsiz shaxs Moderatsiya botiga kirishga urindi: ${userId} (${ctx.from?.username || ctx.from?.first_name})`);
    if (ctx.callbackQuery) {
      await ctx.answerCallbackQuery({
        text: "⛔️ Ruxsat yo‘q! Bu bot faqat adminlar uchun.",
        show_alert: true,
      }).catch(() => {});
    }
    return; // Block completely
  }
  return next();
};

// 3. HTML Escaping Utility (Prevents Telegram Markdown/HTML Parse Crashes)
export function escapeHtml(unsafeText: string): string {
  return unsafeText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// 4. Prompt Injection & Malicious String Detector
const PROMPT_INJECTION_KEYWORDS = [
  "ignore previous instructions",
  "ignore all previous instructions",
  "disregard previous rules",
  "system prompt",
  "you are now in developer mode",
  "jailbreak",
  "override system",
];

export function containsPromptInjection(text: string): boolean {
  const lower = text.toLowerCase();
  return PROMPT_INJECTION_KEYWORDS.some((kw) => lower.includes(kw));
}
