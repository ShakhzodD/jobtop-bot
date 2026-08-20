import https from "node:https";
import { createHash } from "node:crypto";
import { supabase } from "../core/supabase.js";
import { parseJobWithGemini } from "../core/gemini.js";
import { createJob } from "./job.service.js";
import { modBot } from "../core/bots.js";
import { config } from "../config/env.js";

const DEFAULT_CHANNELS = [
  "kunlikishlaruz24",
  "kunlik_ish_uz",
  "kunlik_ishlar_toshkentuz",
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

function contentHash(sourceName: string, text: string): string {
  return createHash("sha256")
    .update(`${sourceName}\n${text.trim()}`)
    .digest("hex");
}

function hasJobKeywords(text: string): boolean {
  if (text.length < 30) return false;
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

  // Match widget messages
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

    // Extract message ID from data-post
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

    // Process most recent 5 posts
    for (const post of posts.slice(-5)) {
      if (!hasJobKeywords(post.text)) {
        continue;
      }

      const hash = contentHash(sourceName, post.text);

      // Check if already processed
      const { data: existing } = await supabase
        .from("ai_job_imports")
        .select("id")
        .eq("content_hash", hash)
        .maybeSingle();

      if (existing) {
        continue;
      }

      console.log(`🤖 Yangi e'lon tahlil qilinmoqda (@${cleanName}): ${post.text.slice(0, 50)}...`);

      // Parse with Gemini Flash
      const parsed = await parseJobWithGemini(post.text, sourceName);

      if (!parsed.isVacancy) {
        // Record non-vacancy to avoid re-parsing
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
      const description = `${post.text}\n\n🔗 Manba: @${cleanName}`;

      // Create directly as published external job
      const job = await createJob({
        employer_id: null,
        category,
        title,
        description,
        district,
        address,
        starts_at: parsed.startsAt || new Date().toISOString(),
        ends_at: parsed.endsAt || new Date(Date.now() + 86400000).toISOString(),
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
      console.log(`✅ Yangi e'lon bazaga qo'shildi: "${title}" (${district}, ${payAmount} so'm)`);

      // Notify Admins via Moderation Bot
      const adminIds = config.adminTelegramIds.length > 0 ? config.adminTelegramIds : [445057374];
      const notifyText = [
        "⚡️ <b>Kanaldan yangi e’lon avtomatik import qilindi!</b>",
        "",
        `📌 <b>${job.title}</b>`,
        `📂 Kategoriya: ${job.category}`,
        `📍 Manzil: ${job.district}, ${job.address}`,
        `💰 Ish haqi: ${job.pay_amount.toLocaleString()} so‘m`,
        `👥 Bo‘sh o‘rin: ${job.openings} ta`,
        `🌐 Manba: @${cleanName}`,
        "",
        `<i>E’lon to‘g‘ridan-to‘g‘ri bot foydalanuvchilariga chiqarildi.</i>`,
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

export function startChannelScraperCron(intervalMinutes = 15): void {
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
