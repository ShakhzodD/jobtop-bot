
function safeIsoTimestamp(dateStr?: string | null, fallbackOffsetHours = 0): string {
  if (!dateStr) {
    return new Date(Date.now() + fallbackOffsetHours * 3600 * 1000).toISOString();
  }
  const parsed = Date.parse(dateStr);
  if (isNaN(parsed)) {
    const timeMatch = dateStr.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      const d = new Date();
      d.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
      return d.toISOString();
    }
    return new Date(Date.now() + fallbackOffsetHours * 3600 * 1000).toISOString();
  }
  return new Date(parsed).toISOString();
}

import { broadcastJobToMatchingWorkers } from "./moderation.service.js";
import { bot } from "../core/bots.js";
import https from "node:https";
import { createHash } from "node:crypto";
import { supabase } from "../core/supabase.js";
import { parseJobWithGemini, containsInappropriateContent } from "../core/gemini.js";
import { createJob } from "./job.service.js";
import { modBot } from "../core/bots.js";
import { config } from "../config/env.js";

const DEFAULT_CHANNELS = [
  "Kunlik_ishlar_kunbayToshkentda",
  "kunlik_ishlar_toshkentuz",
  "kunlikishlaruz24",
  "kunlik_ish_uz",
];

const JOB_KEYWORDS = [
  "kerak",
  "ishchi",
  "bola",
  "yigit",
  "ayol",
  "ming",
  "som",
  "so'm",
  "soat",
  "kunlik",
  "uborka",
  "tushlik",
  "aloqa",
  "telefon",
  "dokon",
  "magazin",
  "ombor",
  "gruzchik",
  "mebel",
  "qurilish",
];

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "")
    .slice(0, 150);
}

function contentHash(sourceName: string, text: string): string {
  const norm = normalizeText(text);
  return createHash("sha256")
    .update(norm)
    .digest("hex");
}

function hasJobKeywords(text: string): boolean {
  if (text.length < 30) return false;
  if (containsInappropriateContent(text)) return false;

  const lower = text.toLowerCase();
  let matches = 0;
  for (const kw of JOB_KEYWORDS) {
    if (lower.includes(kw)) matches++;
  }
  return matches >= 2;
}

function fetchChannelHtml(channelUsername: string): Promise<string> {
  return new Promise((resolve) => {
    const url = `https://t.me/s/${channelUsername.replace("@", "")}`;
    const req = https.get(
      url,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      },
      (res) => {
        let html = "";
        res.on("data", (chunk) => (html += chunk));
        res.on("end", () => resolve(html));
      }
    );
    req.on("error", (e) => {
      console.error(`Error fetching channel ${channelUsername}:`, e.message);
      resolve("");
    });
    req.setTimeout(10000, () => {
      req.destroy();
      resolve("");
    });
  });
}

interface ScrapedPost {
  messageId?: number;
  text: string;
  sourceUrl?: string;
}

function extractPostsFromHtml(html: string, channelUsername: string): ScrapedPost[] {
  const posts: ScrapedPost[] = [];
  const cleanUsername = channelUsername.replace("@", "");

  const messageRegex =
    /<div class="tgme_widget_message_wrap[^"]*"[^>]*>[\s\S]*?<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<\/div>/g;

  let match: RegExpExecArray | null;
  while ((match = messageRegex.exec(html)) !== null) {
    const fullBlock = match[0];
    const textRaw = match[1];

    const cleanText = textRaw
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
      .replace(/<[^>]+>/g, "")
      .trim();

    const dataPostMatch = fullBlock.match(/data-post="[^/]+\/(\d+)"/);
    const messageId = dataPostMatch ? parseInt(dataPostMatch[1], 10) : undefined;
    const sourceUrl = messageId
      ? `https://t.me/${cleanUsername}/${messageId}`
      : `https://t.me/${cleanUsername}`;

    if (cleanText) {
      posts.push({ messageId, text: cleanText, sourceUrl });
    }
  }

  return posts;
}

export async function checkChannelForNewJobs(channelUsername: string): Promise<number> {
  const cleanName = channelUsername.replace("@", "");
  const sourceName = `Telegram / @${cleanName}`;

  try {
    const html = await fetchChannelHtml(cleanName);
    if (!html) return 0;

    const posts = extractPostsFromHtml(html, cleanName);
    if (!posts.length) return 0;

    let importedCount = 0;

    for (const post of posts.slice(-5)) {
      // 1. Inappropriate & 18+ content check
      if (containsInappropriateContent(post.text)) {
        console.log(`🚫 18+ / Taqiqlangan post filtrlandi (@${cleanName}): ${post.text.slice(0, 40)}...`);
        continue;
      }

      // 2. Keyword relevance check
      if (!hasJobKeywords(post.text)) {
        continue;
      }

      // 3. Strict Deduplication check by hash
      const hash = contentHash(sourceName, post.text);
      const { data: existing } = await supabase
        .from("ai_job_imports")
        .select("id")
        .eq("content_hash", hash)
        .maybeSingle();

      if (existing) {
        continue; // Already processed
      }

      // 4. Also check if a job with similar description already exists in `jobs`
      const first50 = post.text.slice(0, 50).trim();
      const { data: similarJob } = await supabase
        .from("jobs")
        .select("id")
        .ilike("description", `%${first50}%`)
        .limit(1)
        .maybeSingle();

      if (similarJob) {
        // Record as duplicate in imports table to avoid re-checking
        await supabase.from("ai_job_imports").insert({
          source_name: sourceName,
          source_url: post.sourceUrl ?? null,
          source_external_id: post.messageId ? String(post.messageId) : null,
          raw_text: post.text,
          content_hash: hash,
          confidence: 0,
          status: "duplicate",
        });
        continue;
      }

      console.log(`🤖 Yangi e'lon tahlil qilinmoqda (@${cleanName}): ${post.text.slice(0, 50)}...`);

      // 5. Parse with Gemini AI with strict safety validation
      const parsed = await parseJobWithGemini(post.text, sourceName);

      if (!parsed.isVacancy || !parsed.isAppropriate) {
        await supabase.from("ai_job_imports").insert({
          source_name: sourceName,
          source_url: post.sourceUrl ?? null,
          source_external_id: post.messageId ? String(post.messageId) : null,
          raw_text: post.text,
          content_hash: hash,
          confidence: parsed.confidence || 0,
          status: "needs_details",
        });
        continue;
      }

      const title = parsed.title || "Kunlik ish e’loni";
      const category = parsed.category || "Xizmat";
      const district = parsed.district || "Toshkent";
      const address = parsed.address || district;
      const payAmount = parsed.payAmount || 200000;
      const openings = parsed.openings || 1;
      const description = post.text;

      // 6. Create clean published job
      const job = await createJob({
        employer_id: null,
        category,
        title,
        description,
        district,
        address,
        starts_at: safeIsoTimestamp(parsed.startsAt, 0),
        ends_at: safeIsoTimestamp(parsed.endsAt, 24),
        pay_amount: payAmount,
        openings,
        source_name: sourceName,
        source_url: post.sourceUrl,
        status: "published",
      });

      // Save import record
      await supabase.from("ai_job_imports").insert({
        source_name: sourceName,
        source_url: post.sourceUrl ?? null,
        source_external_id: post.messageId ? String(post.messageId) : null,
        raw_text: post.text,
        content_hash: hash,
        parsed_job: parsed,
        confidence: parsed.confidence || 0.9,
        status: "published",
        job_id: job.id,
      });

      importedCount++;
      console.log(`✅ Toza e'lon bazaga qo'shildi: "${title}" (${district}, ${payAmount} so'm)`);
      await broadcastJobToMatchingWorkers(bot.api, job).catch(() => {});

      // Notify Admins via Moderation Bot
      const adminIds = config.adminTelegramIds.length > 0 ? config.adminTelegramIds : [445057374];
      const notifyText = [
        "⚡️ <b>Yangi e’lon avtomatik import qilindi!</b>",
        "",
        `📌 <b>${job.title}</b>`,
        `📂 Kategoriya: ${job.category}`,
        `📍 Manzil: ${job.district}, ${job.address}`,
        `💰 Ish haqi: ${job.pay_amount.toLocaleString()} so‘m`,
        `👥 Bo‘sh o‘rin: ${job.openings} ta`,
        `🌐 Manba: @${cleanName}`,
        "",
        `<i>E’lon tekshirildi va xavfsiz deb topildi.</i>`,
      ].join("\n");

      for (const adminId of adminIds) {
        try {
          await modBot.api.sendMessage(adminId, notifyText, { parse_mode: "HTML" });
        } catch (e) {
          // ignore
        }
      }
    }

    return importedCount;
  } catch (err: any) {
    console.error(`Scrape error for @${cleanName}:`, err.message);
    return 0;
  }
}

export async function runAllChannelScrapers(): Promise<void> {
  console.log("🔍 [Channel Scraper] Telegram kanallari tekshirilmoqda...");
  const channels = DEFAULT_CHANNELS;

  for (const ch of channels) {
    const count = await checkChannelForNewJobs(ch);
    if (count > 0) {
      console.log(`🎉 @${ch} kanalidan ${count} ta yangi e’lon import qilindi!`);
    }
  }
}

let scraperInterval: NodeJS.Timeout | null = null;

export function startChannelScraperCron(intervalMinutes = 3): void {
  if (scraperInterval) return;

  console.log(`⏰ [Channel Scraper] Har ${intervalMinutes} daqiqada kanallar avtomatik tekshiriladi.`);

  // Run initial check after 10 seconds of startup
  setTimeout(() => {
    runAllChannelScrapers().catch(console.error);
  }, 10000);

  // Set recurring interval
  scraperInterval = setInterval(() => {
    runAllChannelScrapers().catch(console.error);
  }, intervalMinutes * 60 * 1000);
}
