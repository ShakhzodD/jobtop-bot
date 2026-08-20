import { supabase } from "../core/supabase.js";
import { DBUser, getUserByTelegramId } from "./user.service.js";
import { getJobById } from "./job.service.js";
import { broadcastJobToMatchingWorkers } from "./moderation.service.js";
import { bot } from "../core/bots.js";

export const PAYMENT_CARD = {
  number: "9860 3501 4932 8659",
  cleanNumber: "9860350149328659",
  holder: "SHAHZOD URINBOYEV",
  bank: "Humo / Milliy Bank",
};

export interface PricingPlan {
  id: string;
  name: string;
  price: number;
  description: string;
}

export const PRO_PLANS: Record<string, PricingPlan> = {
  pro_1week: {
    id: "pro_1week",
    name: "🥉 1 haftalik PRO",
    price: 9000,
    description: "7 kun davomida arizalarda 1-o‘rinda turish va ustuvor bildirishnomalar",
  },
  pro_1month: {
    id: "pro_1month",
    name: "🥈 1 oylik PRO (Chegirma bilan)",
    price: 29000,
    description: "30 kun davomida PRO Usta nishoni, arizalarda 1-o‘rin va barcha imtiyozlar",
  },
};

export const JOB_BOOST_PLANS: Record<string, PricingPlan> = {
  boost_top: {
    id: "boost_top",
    name: "🔥 TOP E’lon (24 soat)",
    price: 15000,
    description: "E’loningiz 24 soat davomida lentaning eng yuqori qismida olovli nishon bilan turadi",
  },
  boost_broadcast: {
    id: "boost_broadcast",
    name: "⚡️ Tezkor Broadcast (Push-Signal)",
    price: 20000,
    description: "Barcha mos sohadagi 500+ ishchilarga zudlik bilan shaxsiy Push-xabarnoma yuboriladi",
  },
  boost_super: {
    id: "boost_super",
    name: "💎 Super Paket (TOP + Broadcast)",
    price: 30000,
    description: "Ham 24 soat TOP’da turish, ham barcha ishchilarga tezkor push-signal yuborish",
  },
};

export function isUserPro(user: DBUser | null | undefined): { isPro: boolean; expiresAt?: string; planName?: string } {
  if (!user) return { isPro: false };

  const botState = (user as any).bot_state;
  if (!botState || !botState.is_pro || !botState.pro_until) {
    return { isPro: false };
  }

  const expiresDate = new Date(botState.pro_until);
  if (expiresDate.getTime() > Date.now()) {
    return {
      isPro: true,
      expiresAt: expiresDate.toLocaleDateString("uz-UZ", {
        timeZone: "Asia/Tashkent",
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
      planName: botState.pro_plan || "PRO Obuna",
    };
  }

  return { isPro: false };
}

export async function activateProSubscription(
  telegramId: number,
  planId: string
): Promise<{ success: boolean; message: string; expiresAt?: string }> {
  const user = await getUserByTelegramId(telegramId);
  if (!user) return { success: false, message: "Foydalanuvchi topilmadi." };

  const plan = PRO_PLANS[planId];
  if (!plan) return { success: false, message: "Noto‘g‘ri tarif tanlandi." };

  const days = planId === "pro_1week" ? 7 : 30;
  const currentBotState = (user as any).bot_state || {};
  const currentExpiry = currentBotState.pro_until ? new Date(currentBotState.pro_until).getTime() : Date.now();
  const baseTime = currentExpiry > Date.now() ? currentExpiry : Date.now();
  const proUntil = new Date(baseTime + days * 24 * 60 * 60 * 1000).toISOString();

  const updatedBotState = {
    ...currentBotState,
    is_pro: true,
    pro_until: proUntil,
    pro_plan: plan.name,
    pro_updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("users")
    .update({ bot_state: updatedBotState })
    .eq("id", user.id);

  if (error) {
    console.error("Error activating PRO subscription:", error);
    return { success: false, message: "Obunani faollashtirishda xatolik yuz berdi." };
  }

  const expiresStr = new Date(proUntil).toLocaleDateString("uz-UZ", {
    timeZone: "Asia/Tashkent",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    success: true,
    message: `🎉 Tabriklaymiz! Sizning <b>${plan.name}</b> obunangiz faollashdi.\n📅 Amal qilish muddati: <b>${expiresStr}</b> gacha.`,
    expiresAt: expiresStr,
  };
}

export async function boostJob(
  jobId: string,
  planId: string
): Promise<{ success: boolean; message: string }> {
  const job = await getJobById(jobId);
  if (!job) return { success: false, message: "E’lon topilmadi." };

  const plan = JOB_BOOST_PLANS[planId];
  if (!plan) return { success: false, message: "Noto‘g‘ri paket tanlandi." };

  let newTitle = job.title;
  if (!newTitle.startsWith("🔥 [TOP]")) {
    newTitle = `🔥 [TOP] ${newTitle}`.slice(0, 140);
  }

  await supabase
    .from("jobs")
    .update({
      title: newTitle,
      status: "published",
    })
    .eq("id", jobId);

  // If Broadcast or Super is included, trigger instant broadcast to matching workers!
  if (planId === "boost_broadcast" || planId === "boost_super") {
    await broadcastJobToMatchingWorkers(bot.api, { ...job, title: newTitle }).catch(() => {});
  }

  return {
    success: true,
    message: `🚀 <b>"${job.title}"</b> e’loni uchun <b>${plan.name}</b> xizmati muvaffaqiyatli yoqildi!`,
  };
}
