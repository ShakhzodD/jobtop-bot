import { supabase } from "../core/supabase.js";

export interface DBReview {
  id: string;
  job_id: string;
  author_id: string;
  recipient_id: string;
  rating: number;
  comment?: string | null;
  created_at: string;
}

export async function createReview(data: {
  jobId: string;
  authorId: string;
  recipientId: string;
  rating: number;
  comment?: string;
}): Promise<{ success: boolean; message: string }> {
  const { error } = await supabase
    .from("reviews")
    .upsert(
      {
        job_id: data.jobId,
        author_id: data.authorId,
        recipient_id: data.recipientId,
        rating: Math.min(Math.max(data.rating, 1), 5),
        comment: data.comment ?? null,
      },
      { onConflict: "job_id,author_id" }
    );

  if (error) {
    console.error("Error creating review:", error);
    return { success: false, message: "Baholashda xatolik yuz berdi." };
  }

  return { success: true, message: "Baho muvaffaqiyatli saqlandi!" };
}

export async function getUserRating(
  userId: string
): Promise<{ average: number; count: number; starsStr: string }> {
  const { data, error } = await supabase
    .from("reviews")
    .select("rating")
    .eq("recipient_id", userId);

  if (error || !data || data.length === 0) {
    return { average: 5.0, count: 0, starsStr: "⭐️ Yangi (Baholanmagan)" };
  }

  const sum = data.reduce((acc, r) => acc + (r.rating || 0), 0);
  const avg = Number((sum / data.length).toFixed(1));

  return {
    average: avg,
    count: data.length,
    starsStr: `⭐️ ${avg} (${data.length} ta baho)`,
  };
}
