
export async function processReferralJoin(
  newTelegramId: number,
  inviterTelegramId: number,
  mainBotApi?: any
): Promise<void> {
  try {
    if (!inviterTelegramId || newTelegramId === inviterTelegramId) return;

    const inviter = await getUserByTelegramId(inviterTelegramId);
    if (!inviter) return;

    const newUser = await getUserByTelegramId(newTelegramId);
    const newUserBotState = (newUser as any)?.bot_state || {};
    
    // Check if new user was already referred by someone before
    if (newUserBotState.referred_by) return;

    // 1. Mark new user as referred
    if (newUser) {
      await supabase
        .from("users")
        .update({
          bot_state: {
            ...newUserBotState,
            referred_by: inviterTelegramId,
            utm_source: "referral",
            referred_at: new Date().toISOString(),
          },
        })
        .eq("id", newUser.id);
    }

    // 2. Update inviter's referral list
    const inviterBotState = (inviter as any)?.bot_state || {};
    const existingReferred: number[] = Array.isArray(inviterBotState.referred_users)
      ? inviterBotState.referred_users
      : [];

    if (existingReferred.includes(newTelegramId)) return;

    const updatedReferred = [...existingReferred, newTelegramId];
    const newCount = updatedReferred.length;

    // Check if threshold (3 invites) reached and 1-week PRO should be awarded
    let shouldAwardPro = false;
    const lastProAwardCount = inviterBotState.last_referral_pro_at_count || 0;

    if (newCount >= 3 && newCount >= lastProAwardCount + 3) {
      shouldAwardPro = true;
    }

    let proExpiryDateStr = "";
    let updatedProUntil = inviterBotState.pro_until;

    if (shouldAwardPro) {
      const days = 7; // 1 week
      const currentExpiry = inviterBotState.pro_until ? new Date(inviterBotState.pro_until).getTime() : Date.now();
      const baseTime = currentExpiry > Date.now() ? currentExpiry : Date.now();
      const proUntilMs = baseTime + days * 24 * 60 * 60 * 1000;
      updatedProUntil = new Date(proUntilMs).toISOString();

      proExpiryDateStr = new Date(proUntilMs).toLocaleDateString("uz-UZ", {
        timeZone: "Asia/Tashkent",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }

    await supabase
      .from("users")
      .update({
        bot_state: {
          ...inviterBotState,
          referred_users: updatedReferred,
          referral_count: newCount,
          is_pro: shouldAwardPro ? true : inviterBotState.is_pro,
          pro_until: shouldAwardPro ? updatedProUntil : inviterBotState.pro_until,
          pro_plan: shouldAwardPro ? "🥉 1 haftalik PRO (Referral Sovg‘asi)" : inviterBotState.pro_plan,
          last_referral_pro_at_count: shouldAwardPro ? newCount : lastProAwardCount,
        },
      })
      .eq("id", inviter.id);

    console.log(`🎉 User ${inviterTelegramId} invited ${newTelegramId}. Total referrals: ${newCount}`);

    // 3. Send real-time notification to inviter via bot API
    if (mainBotApi) {
      if (shouldAwardPro) {
        const rewardMsg = [
          "🎉 <b>TABRIKLAYMIZ! 1 HAFTALIK BEPUL PRO YUTIB OLDINGIZ!</b> 🎁⭐️",
          "",
          `Sizning taklif havolangiz orqali <b>${newCount} ta do‘stingiz</b> botga qo‘shildi!`,
          "",
          "⭐️ <b>Sizga berilgan imtiyozlar:</b>",
          "• Arizalarda har doim <b>1-o‘rinda ko‘rinish</b>;",
          "• Profilingizda <b>⭐️ PRO USTA</b> ishonch nishoni;",
          "• Eng yangi qaynoq ishlarga <b>tezkor VIP xabarnoma</b>!",
          "",
          `📅 <b>Amal qilish muddati:</b> ${proExpiryDateStr} gacha (7 kun)...`,
        ].join("\n");

        await mainBotApi.sendMessage(inviterTelegramId, rewardMsg, { parse_mode: "HTML" }).catch(() => {});
      } else {
        const remaining = 3 - (newCount % 3);
        const progressMsg = [
          "👋 <b>Yangi do‘stingiz botga qo‘shildi!</b>",
          "",
          `📊 Jami taklif qilgan do‘stlaringiz: <b>${newCount} ta</b>`,
          `⏳ Yana <b>${remaining} ta</b> do‘stingiz qo‘shilsa — sizga <b>1 haftalik ⭐️ PRO Akkaunt</b> bepul beriladi!`,
        ].join("\n");

        await mainBotApi.sendMessage(inviterTelegramId, progressMsg, { parse_mode: "HTML" }).catch(() => {});
      }
    }
  } catch (err) {
    console.error("Error processing referral join:", err);
  }
}

export async function getReferralLeaderboard(): Promise<Array<{
  name: string;
  username: string | null;
  phone: string | null;
  referralCount: number;
  isPro: boolean;
  proUntil: string | null;
}>> {
  const { data: users, error } = await supabase
    .from("users")
    .select("full_name, telegram_username, phone, bot_state");

  if (error || !users) return [];

  const list = users
    .map((u) => {
      const state = (u as any)?.bot_state || {};
      const count = Number(state.referral_count || (Array.isArray(state.referred_users) ? state.referred_users.length : 0));
      const proUntil = state.pro_until || null;
      const isPro = Boolean(state.is_pro && proUntil && new Date(proUntil).getTime() > Date.now());

      return {
        name: u.full_name,
        username: u.telegram_username ? "@" + u.telegram_username : null,
        phone: u.phone,
        referralCount: count,
        isPro,
        proUntil,
      };
    })
    .filter((u) => u.referralCount > 0)
    .sort((a, b) => b.referralCount - a.referralCount);

  return list;
}


export async function recordUserTrafficSource(
  telegramId: number,
  source: string,
  referredBy?: number | null
): Promise<void> {
  try {
    const user = await getUserByTelegramId(telegramId);
    if (!user) return;

    const currentBotState = (user as any)?.bot_state || {};
    if (!currentBotState.utm_source) {
      await supabase
        .from("users")
        .update({
          bot_state: {
            ...currentBotState,
            utm_source: source,
            referred_by: referredBy || currentBotState.referred_by || null,
            source_recorded_at: new Date().toISOString(),
          },
        })
        .eq("id", user.id);
    }
  } catch (err) {
    console.error("Error recording user traffic source:", err);
  }
}

export async function getTrafficSourcesAnalytics(): Promise<{
  breakdown: Array<{ name: string; count: number; percent: number }>;
  total: number;
}> {
  const { data: users, error } = await supabase
    .from("users")
    .select("bot_state");

  if (error || !users) return { breakdown: [], total: 0 };

  const counts: Record<string, number> = {
    "📸 Instagram": 0,
    "📢 @jobtopuzz kanali": 0,
    "🎓 Talabalar guruhlari": 0,
    "🎵 TikTok": 0,
    "👥 Do‘stlar taklifi (Referral)": 0,
    "🔍 Telegram qidiruv (Organik)": 0,
  };

  let total = users.length;

  for (const u of users) {
    const src = String((u as any)?.bot_state?.utm_source || "organic_search").toLowerCase();
    if (src.includes("insta")) {
      counts["📸 Instagram"]++;
    } else if (src.includes("tik")) {
      counts["🎵 TikTok"]++;
    } else if (src.includes("chan") || src.includes("job_")) {
      counts["📢 @jobtopuzz kanali"]++;
    } else if (src.includes("stud") || src.includes("tatu") || src.includes("group")) {
      counts["🎓 Talabalar guruhlari"]++;
    } else if (src.includes("ref")) {
      counts["👥 Do‘stlar taklifi (Referral)"]++;
    } else {
      counts["🔍 Telegram qidiruv (Organik)"]++;
    }
  }

  const breakdown = Object.entries(counts)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
    }));

  return { breakdown, total };
}

import { supabase } from "../core/supabase.js";
import { UserRole } from "../types/context.js";

export interface DBUser {
  id: string;
  telegram_id: number;
  phone: string | null;
  telegram_username: string | null;
  full_name: string;
  avatar_url?: string | null;
  district?: string | null;
  birth_date?: string | null;
  experience_years?: number | null;
  about?: string | null;
  worker_categories?: string[];
  active_role: UserRole;
  created_at: string;
}

export function getProfileCompletionStatus(user: DBUser) {
  const gender = (user as any).bot_state?.gender;
  const fields = [
    { name: "Telefon", value: Boolean(user.phone), weight: 20 },
    { name: "Jinsi (Erkak/Ayol)", value: Boolean(gender), weight: 20 },
    { name: "Yashash tumani", value: Boolean(user.district), weight: 20 },
    {
      name: "Ish tajribasi",
      value: user.experience_years !== null && user.experience_years !== undefined,
      weight: 20,
    },
    { name: "O‘zingiz haqingizda ma’lumot", value: Boolean(user.about), weight: 20 },
  ];

  const percent = fields.reduce((acc, f) => acc + (f.value ? f.weight : 0), 0);
  const missing = fields.filter((f) => !f.value).map((f) => f.name);

  return {
    percent,
    isComplete: percent === 100,
    missing,
  };
}

export async function getUserByTelegramId(telegramId: number): Promise<DBUser | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching user by telegram_id:", error);
    return null;
  }
  return data;
}

export async function upsertUser(userData: {
  telegram_id: number;
  full_name: string;
  telegram_username?: string | null;
  phone?: string | null;
  active_role?: UserRole;
}): Promise<DBUser> {
  const { data, error } = await supabase
    .from("users")
    .upsert(
      {
        telegram_id: userData.telegram_id,
        full_name: userData.full_name,
        telegram_username: userData.telegram_username ?? null,
        phone: userData.phone ?? null,
        active_role: userData.active_role ?? "worker",
      },
      { onConflict: "telegram_id" }
    )
    .select("*")
    .single();

  if (error) {
    console.error("Error upserting user:", error);
    throw error;
  }

  // Ensure role is recorded in user_roles table
  if (userData.active_role) {
    await supabase
      .from("user_roles")
      .upsert(
        { user_id: data.id, role: userData.active_role },
        { onConflict: "user_id,role" }
      );
  }

  return data;
}

export async function setActiveRole(telegramId: number, role: UserRole): Promise<void> {
  const user = await getUserByTelegramId(telegramId);
  if (!user) return;

  await supabase
    .from("users")
    .update({ active_role: role })
    .eq("id", user.id);

  await supabase
    .from("user_roles")
    .upsert({ user_id: user.id, role }, { onConflict: "user_id,role" });
}

export async function updateWorkerProfile(
  telegramId: number,
  profile: Partial<{
    district: string;
    birth_date: string;
    experience_years: number;
    about: string;
    worker_categories: string[];
    full_name: string;
    gender: "male" | "female";
  }>
): Promise<void> {
  const user = await getUserByTelegramId(telegramId);
  const currentBotState = (user as any)?.bot_state || {};

  const updateData: any = {
    district: profile.district,
    birth_date: profile.birth_date,
    experience_years: profile.experience_years,
    about: profile.about,
    worker_categories: profile.worker_categories,
    full_name: profile.full_name,
  };

  if (profile.gender) {
    updateData.bot_state = {
      ...currentBotState,
      gender: profile.gender,
    };
  }

  // Remove undefined fields
  Object.keys(updateData).forEach(
    (key) => updateData[key] === undefined && delete updateData[key]
  );

  const { error } = await supabase
    .from("users")
    .update(updateData)
    .eq("telegram_id", telegramId);

  if (error) {
    console.error("Error updating worker profile:", error);
    throw error;
  }
}

const userLastSeenCache = new Map<number, number>();

export async function touchUserActivity(telegramId: number): Promise<void> {
  const now = Date.now();
  const last = userLastSeenCache.get(telegramId) || 0;
  // Update at most once every 5 minutes per user to save DB writes
  if (now - last < 5 * 60 * 1000) return;
  userLastSeenCache.set(telegramId, now);

  try {
    const user = await getUserByTelegramId(telegramId);
    if (!user) return;

    const currentBotState = (user as any).bot_state || {};
    await supabase
      .from("users")
      .update({
        bot_state: {
          ...currentBotState,
          last_active_at: new Date().toISOString(),
        },
      })
      .eq("id", user.id);
  } catch (err) {
    // ignore background error
  }
}
