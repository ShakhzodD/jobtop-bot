import { supabase } from "../core/supabase.js";
import { DBUser } from "./user.service.js";
import { DBJob } from "./job.service.js";

export type ApplicationStatus = "pending" | "selected" | "rejected" | "withdrawn";

export interface DBApplication {
  id: string;
  job_id: string;
  worker_id: string;
  note: string | null;
  status: ApplicationStatus;
  created_at: string;
  worker?: DBUser;
  job?: DBJob;
}

export async function applyForJob(
  jobId: string,
  workerUserId: string,
  note?: string
): Promise<{ success: boolean; message: string; application?: DBApplication }> {
  // Check if already applied
  const { data: existing } = await supabase
    .from("applications")
    .select("id, status")
    .eq("job_id", jobId)
    .eq("worker_id", workerUserId)
    .maybeSingle();

  if (existing) {
    return {
      success: false,
      message: "Siz ushbu e’longa allaqachon ariza topshirgansiz.",
    };
  }

  const { data, error } = await supabase
    .from("applications")
    .insert({
      job_id: jobId,
      worker_id: workerUserId,
      note: note ?? null,
      status: "pending",
    })
    .select("*, worker:users!worker_id(*), job:jobs!job_id(*)")
    .single();

  if (error) {
    console.error("Error creating application:", error);
    return {
      success: false,
      message: "Arizani yuborishda xatolik yuz berdi.",
    };
  }

  return {
    success: true,
    message: "Arizangiz muvaffaqiyatli qabul qilindi!",
    application: data as DBApplication,
  };
}

export async function getJobApplications(jobId: string): Promise<DBApplication[]> {
  const { data, error } = await supabase
    .from("applications")
    .select("*, worker:users!worker_id(*)")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching job applications:", error);
    return [];
  }
  return (data as DBApplication[]) || [];
}

export async function getWorkerApplications(workerUserId: string): Promise<DBApplication[]> {
  const { data, error } = await supabase
    .from("applications")
    .select("*, job:jobs!job_id(*, employer:users!employer_id(*))")
    .eq("worker_id", workerUserId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching worker applications:", error);
    return [];
  }
  return (data as DBApplication[]) || [];
}

export async function selectApplication(applicationId: string): Promise<DBApplication | null> {
  const { data, error } = await supabase
    .from("applications")
    .update({ status: "selected" })
    .eq("id", applicationId)
    .select("*, worker:users!worker_id(*), job:jobs!job_id(*, employer:users!employer_id(*))")
    .single();

  if (error) {
    console.error("Error selecting application:", error);
    return null;
  }
  return data as DBApplication;
}

export async function rejectApplication(applicationId: string): Promise<boolean> {
  const { error } = await supabase
    .from("applications")
    .update({ status: "rejected" })
    .eq("id", applicationId);

  if (error) {
    console.error("Error rejecting application:", error);
    return false;
  }
  return true;
}
