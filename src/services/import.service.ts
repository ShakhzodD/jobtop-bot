import { createHash } from "node:crypto";
import { supabase } from "../core/supabase.js";
import { parseJobWithGemini } from "../core/gemini.js";
import { createJob } from "./job.service.js";

function contentHash(sourceName: string, text: string) {
  return createHash("sha256")
    .update(`${sourceName}\n${text.trim()}`)
    .digest("hex");
}

export async function importTelegramChannelPost(
  text: string,
  sourceName: string,
  sourceUrl?: string,
  messageId?: number
): Promise<{ status: "queued" | "needs_details" | "duplicate"; jobId?: string; details?: string }> {
  const hash = contentHash(sourceName, text);

  // Check duplicate
  const { data: existing } = await supabase
    .from("ai_job_imports")
    .select("id")
    .eq("content_hash", hash)
    .maybeSingle();

  if (existing) {
    return { status: "duplicate", details: "Bu e’lon avval import qilingan." };
  }

  // Parse with Gemini
  const parsed = await parseJobWithGemini(text, sourceName);

  const isComplete = Boolean(
    parsed.isVacancy &&
      parsed.category &&
      parsed.title &&
      parsed.description &&
      parsed.district &&
      parsed.address &&
      parsed.payAmount &&
      parsed.openings
  );

  if (!isComplete) {
    await supabase.from("ai_job_imports").insert({
      source_name: sourceName,
      source_url: sourceUrl ?? null,
      source_external_id: messageId ? String(messageId) : null,
      listing_url: sourceUrl ?? null,
      raw_text: text,
      content_hash: hash,
      parsed_job: parsed,
      confidence: parsed.confidence,
      status: "needs_details",
    });

    return {
      status: "needs_details",
      details: "E’lon ma’lumotlari to‘liq emas (masalan: ish haqi, tuman yoki vaqt yo‘q).",
    };
  }

  // Create job
  const job = await createJob({
    employer_id: null,
    category: parsed.category!,
    title: parsed.title!,
    description: parsed.description!,
    district: parsed.district!,
    address: parsed.address!,
    starts_at: parsed.startsAt || new Date().toISOString(),
    ends_at: parsed.endsAt || new Date(Date.now() + 86400000).toISOString(),
    pay_amount: parsed.payAmount!,
    openings: parsed.openings!,
    source_name: sourceName,
    source_url: sourceUrl || undefined,
    status: "pending_moderation",
  });

  // Save import
  await supabase.from("ai_job_imports").insert({
    source_name: sourceName,
    source_url: sourceUrl ?? null,
    source_external_id: messageId ? String(messageId) : null,
    listing_url: sourceUrl ?? null,
    raw_text: text,
    content_hash: hash,
    parsed_job: parsed,
    confidence: parsed.confidence,
    status: "queued_for_moderation",
    job_id: job.id,
  });

  return {
    status: "queued",
    jobId: job.id,
    details: `“${job.title}” — muvaffaqiyatli tahlil qilindi va moderatsiyaga yuborildi.`,
  };
}
