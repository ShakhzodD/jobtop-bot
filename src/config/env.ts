import dotenv from "dotenv";
dotenv.config();

export const config = {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabaseApiKey: process.env.SUPABASE_API_KEY || "",
  adminTelegramIds: (process.env.ADMIN_TELEGRAM_IDS || "")
    .split(",")
    .map((id) => Number(id.trim()))
    .filter(Number.isSafeInteger),
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.6-flash",
};

export function validateEnv() {
  if (!config.telegramBotToken) {
    console.warn("⚠️ Ogohlantirish: TELEGRAM_BOT_TOKEN .env faylda ko'rsatilmagan.");
  }
  if (!config.supabaseUrl || !config.supabaseApiKey) {
    console.warn("⚠️ Ogohlantirish: SUPABASE_URL yoki SUPABASE_API_KEY sozlanmagan.");
  }
}
