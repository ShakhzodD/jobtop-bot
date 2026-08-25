import { createHash } from "node:crypto";
import { supabase } from "../core/supabase.js";
import { parseJobWithGemini } from "../core/gemini.js";
import { createJob } from "./job.service.js";

function contentHash(url: string, text: string): string {
  return createHash("sha256")
    .update(`${url}\n${text.trim()}`)
    .digest("hex");
}

function cleanHtmlToText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function importJobFromWebUrl(
  url: string,
  customSourceName?: string
): Promise<{
  success: boolean;
  jobId?: string;
  title?: string;
  message: string;
  parsed?: any;
}> {
  try {
    const domain = new URL(url).hostname.replace("www.", "");
    const sourceName = customSourceName || `Veb-sayt: ${domain}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "uz-UZ,uz;q=0.9,ru;q=0.8,en;q=0.7",
      },
    });

    if (!res.ok) {
      return {
        success: false,
        message: `Saytga ulanishda xatolik: HTTP ${res.status} (${res.statusText})`,
      };
    }

    const html = await res.text();
    const cleanText = cleanHtmlToText(html).slice(0, 4000);

    if (cleanText.length < 50) {
      return {
        success: false,
        message: "Saytdan e’lon matnini o‘qib bo‘lmadi yoki sahifa bo‘sh.",
      };
    }

    const hash = contentHash(url, cleanText.slice(0, 500));

    // Check if already imported
    const { data: existing } = await supabase
      .from("ai_job_imports")
      .select("id")
      .eq("content_hash", hash)
      .maybeSingle();

    if (existing) {
      return {
        success: false,
        message: "Ushbu havola bo‘yicha e’lon avval import qilingan (dublikat).",
      };
    }

    // Parse with Gemini AI
    const parsed = await parseJobWithGemini(cleanText, sourceName);

    if (!parsed.isVacancy || !parsed.isAppropriate) {
      return {
        success: false,
        message:
          "Ushbu sahifada haqiqiy kunlik ish e’loni topilmadi yoki bu oylik ofis vakansiyasi.",
      };
    }

    const job = await createJob({
      employer_id: null,
      category: parsed.category || "Xizmat",
      title: parsed.title || "Veb-saytdan kunlik ish",
      description: parsed.description || cleanText.slice(0, 1000),
      district: parsed.district || "Toshkent",
      address: parsed.address || "Toshkent shahri",
      starts_at: parsed.startsAt || new Date().toISOString(),
      ends_at: parsed.endsAt || new Date(Date.now() + 86400000).toISOString(),
      pay_amount: parsed.payAmount || 200000,
      openings: parsed.openings || 1,
      source_name: sourceName,
      source_url: url,
      status: "pending_moderation",
    });

    await supabase.from("ai_job_imports").insert({
      source_name: sourceName,
      source_url: url,
      raw_text: cleanText.slice(0, 2000),
      content_hash: hash,
      parsed_job: parsed,
      confidence: parsed.confidence,
      status: "queued_for_moderation",
      job_id: job.id,
    });

    return {
      success: true,
      jobId: job.id,
      title: job.title,
      parsed,
      message: `✅ “${job.title}” — Veb-saytdan muvaffaqiyatli o‘qib olindi va moderatsiyaga yuborildi!`,
    };
  } catch (err: any) {
    console.error("Error importing job from web URL:", err);
    return {
      success: false,
      message: `Xatolik yuz berdi: ${err.message || "Saytni o‘qib bo‘lmadi"}`,
    };
  }
}
