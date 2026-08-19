import { supabase } from "../core/supabase.js";
import { JobCategory } from "../core/gemini.js";

export type JobStatus =
  | "draft"
  | "pending_moderation"
  | "published"
  | "filled"
  | "completed"
  | "cancelled"
  | "expired";

export interface DBJob {
  id: string;
  employer_id: string | null;
  category: JobCategory;
  title: string;
  description: string;
  district: string;
  address: string;
  starts_at: string;
  ends_at: string;
  pay_amount: number;
  openings: number;
  status: JobStatus;
  source_name?: string | null;
  source_url?: string | null;
  created_at: string;
  employer?: {
    full_name: string;
    phone: string | null;
    telegram_username: string | null;
  };
}

export async function getPublishedJobs(options: {
  category?: string;
  district?: string;
  limit?: number;
  offset?: number;
}): Promise<{ jobs: DBJob[]; total: number }> {
  let query = supabase
    .from("jobs")
    .select("*, employer:users!employer_id(full_name, phone, telegram_username)", {
      count: "exact",
    })
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (options.category) {
    query = query.eq("category", options.category);
  }
  if (options.district) {
    query = query.ilike("district", `%${options.district}%`);
  }

  const limit = options.limit ?? 5;
  const offset = options.offset ?? 0;
  query = query.range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) {
    console.error("Error fetching published jobs:", error);
    return { jobs: [], total: 0 };
  }

  return {
    jobs: (data as DBJob[]) || [],
    total: count ?? 0,
  };
}

export async function getPendingModerationJobs(): Promise<DBJob[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*, employer:users!employer_id(full_name, phone, telegram_username)")
    .eq("status", "pending_moderation")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching pending moderation jobs:", error);
    return [];
  }
  return (data as DBJob[]) || [];
}

export async function getJobById(id: string): Promise<DBJob | null> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*, employer:users!employer_id(full_name, phone, telegram_username)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Error fetching job by id:", error);
    return null;
  }
  return data as DBJob;
}

export async function getEmployerJobs(employerUserId: string): Promise<DBJob[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("employer_id", employerUserId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching employer jobs:", error);
    return [];
  }
  return (data as DBJob[]) || [];
}

export async function createJob(jobData: {
  employer_id: string | null;
  category: JobCategory;
  title: string;
  description: string;
  district: string;
  address: string;
  starts_at: string;
  ends_at: string;
  pay_amount: number;
  openings: number;
  source_name?: string;
  source_url?: string;
  status?: JobStatus;
}): Promise<DBJob> {
  const { data, error } = await supabase
    .from("jobs")
    .insert({
      employer_id: jobData.employer_id,
      category: jobData.category,
      title: jobData.title,
      description: jobData.description,
      district: jobData.district,
      address: jobData.address,
      starts_at: jobData.starts_at,
      ends_at: jobData.ends_at,
      pay_amount: jobData.pay_amount,
      openings: jobData.openings,
      source_name: jobData.source_name ?? null,
      source_url: jobData.source_url ?? null,
      status: jobData.status ?? "pending_moderation",
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating job:", error);
    throw error;
  }
  return data as DBJob;
}

export async function updateJobStatus(jobId: string, status: JobStatus): Promise<void> {
  const { error } = await supabase
    .from("jobs")
    .update({ status })
    .eq("id", jobId);

  if (error) {
    console.error("Error updating job status:", error);
    throw error;
  }
}
