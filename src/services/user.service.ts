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
  const fields = [
    { name: "Telefon", value: Boolean(user.phone), weight: 25 },
    { name: "Yashash tumani", value: Boolean(user.district), weight: 25 },
    {
      name: "Ish tajribasi",
      value: user.experience_years !== null && user.experience_years !== undefined,
      weight: 25,
    },
    { name: "O‘zingiz haqingizda ma’lumot", value: Boolean(user.about), weight: 25 },
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
  }>
): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update(profile)
    .eq("telegram_id", telegramId);

  if (error) {
    console.error("Error updating worker profile:", error);
    throw error;
  }
}
