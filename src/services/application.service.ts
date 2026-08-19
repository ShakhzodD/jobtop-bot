import { supabase } from "../core/supabase.js";
import { DBUser } from "./user.service.js";
import { DBJob, updateJobStatus } from "./job.service.js";

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
    if (existing.status === "rejected") {
      return {
        success: false,
        message: "Ushbu e’longa arizangiz avval rad etilgan. Iltimos, boshqa ishlarga ariza yuboring.",
      };
    }
    if (existing.status === "selected") {
      return {
        success: false,
        message: "Siz ushbu ishga allaqachon qabul qilingansiz!",
      };
    }
    if (existing.status === "withdrawn") {
      // Re-apply if previously withdrawn
      const { data: updated, error: updateError } = await supabase
        .from("applications")
        .update({ status: "pending", note: note ?? null })
        .eq("id", existing.id)
        .select("*, worker:users!worker_id(*), job:jobs!job_id(*)")
        .single();

      if (updateError) {
        return { success: false, message: "Arizani qayta yuborishda xatolik." };
      }
      return {
        success: true,
        message: "Arizangiz muvaffaqiyatli qayta yuborildi!",
        application: updated as DBApplication,
      };
    }
    return {
      success: false,
      message: "Siz ushbu e’longa allaqachon ariza topshirgansiz (ko‘rib chiqilmoqda).",
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

export async function withdrawApplication(
  applicationId: string,
  workerUserId: string
): Promise<{ success: boolean; message: string }> {
  const { error } = await supabase
    .from("applications")
    .update({ status: "withdrawn" })
    .eq("id", applicationId)
    .eq("worker_id", workerUserId);

  if (error) {
    console.error("Error withdrawing application:", error);
    return { success: false, message: "Arizani bekor qilishda xatolik yuz berdi." };
  }

  return { success: true, message: "Arizangiz muvaffaqiyatli bekor qilindi." };
}

export async function getJobApplications(jobId: string): Promise<DBApplication[]> {
  const { data, error } = await supabase
    .from("applications")
    .select("*, worker:users!worker_id(*)")
    .eq("job_id", jobId)
    .neq("status", "withdrawn")
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

export async function selectApplication(
  applicationId: string
): Promise<{ application: DBApplication | null; isJobFilled: boolean; selectedCount: number; openings: number }> {
  const { data, error } = await supabase
    .from("applications")
    .update({ status: "selected" })
    .eq("id", applicationId)
    .select("*, worker:users!worker_id(*), job:jobs!job_id(*, employer:users!employer_id(*))")
    .single();

  if (error || !data) {
    console.error("Error selecting application:", error);
    return { application: null, isJobFilled: false, selectedCount: 0, openings: 1 };
  }

  const app = data as DBApplication;
  const jobId = app.job_id;
  const openings = app.job?.openings || 1;

  // Count total selected workers for this job
  const { count: selectedCount } = await supabase
    .from("applications")
    .select("*", { count: "exact", head: true })
    .eq("job_id", jobId)
    .eq("status", "selected");

  const totalSelected = selectedCount ?? 1;
  const isJobFilled = totalSelected >= openings;

  // If openings reached, auto-update job status to 'filled'!
  if (isJobFilled) {
    await updateJobStatus(jobId, "filled");
  }

  return {
    application: app,
    isJobFilled,
    selectedCount: totalSelected,
    openings,
  };
}

export async function rejectApplication(applicationId: string): Promise<DBApplication | null> {
  const { data, error } = await supabase
    .from("applications")
    .update({ status: "rejected" })
    .eq("id", applicationId)
    .select("*, worker:users!worker_id(*), job:jobs!job_id(*)")
    .single();

  if (error) {
    console.error("Error rejecting application:", error);
    return null;
  }
  return data as DBApplication;
}

export async function getSelectedWorkersForJob(jobId: string): Promise<DBApplication[]> {
  const { data, error } = await supabase
    .from("applications")
    .select("*, worker:users!worker_id(*)")
    .eq("job_id", jobId)
    .eq("status", "selected");

  if (error) {
    console.error("Error fetching selected workers for job:", error);
    return [];
  }
  return (data as DBApplication[]) || [];
}
