import { config } from "../config/env.js";

export const JOB_CATEGORIES = [
  "Kuryer",
  "Xizmat",
  "Yuk tashish",
  "Tozalash",
] as const;

export type JobCategory = (typeof JOB_CATEGORIES)[number];

export interface ParsedJob {
  isVacancy: boolean;
  category: JobCategory | null;
  title: string | null;
  description: string | null;
  district: string | null;
  address: string | null;
  startsAt: string | null;
  endsAt: string | null;
  payAmount: number | null;
  openings: number | null;
  confidence: number;
}

const FALLBACK_MODELS = [
  config.geminiModel,
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
].filter(Boolean);

// Unique models list
const MODELS_TO_TRY = [...new Set(FALLBACK_MODELS)];

function smartRegexFallback(rawText: string): ParsedJob {
  const lower = rawText.toLowerCase();

  // 1. Detect Category
  let category: JobCategory = "Xizmat";
  if (lower.includes("yuk") || lower.includes("mebel") || lower.includes("tashish") || lower.includes("gruzchik")) {
    category = "Yuk tashish";
  } else if (lower.includes("kuryer") || lower.includes("yetkaz") || lower.includes("dostavka")) {
    category = "Kuryer";
  } else if (lower.includes("tozala") || lower.includes("uborka") || lower.includes("farrosh") || lower.includes("moyka")) {
    category = "Tozalash";
  }

  // 2. Detect Salary (e.g. 200 000, 250000, 200 ming, 300k)
  let payAmount: number | null = null;
  const thousandMatch = rawText.match(/(\d+)\s*(ming|k)/i);
  if (thousandMatch) {
    payAmount = parseInt(thousandMatch[1], 10) * 1000;
  } else {
    const fullNumMatch = rawText.match(/(\d[\d\s]{3,})\s*(so['‘`]?m|sum)?/i);
    if (fullNumMatch) {
      const num = parseInt(fullNumMatch[1].replace(/\s+/g, ""), 10);
      if (num >= 10000 && num <= 100000000) {
        payAmount = num;
      }
    }
  }

  // 3. Detect Openings (e.g. 2 ta, 3 nafar)
  let openings = 1;
  const openingsMatch = rawText.match(/(\d+)\s*(ta|nafar|kishi|yigit|ayol|ishchi)/i);
  if (openingsMatch) {
    openings = parseInt(openingsMatch[1], 10);
  }

  // 4. Detect District
  const districts = [
    "Chilonzor", "Yunusobod", "Mirzo Ulug‘bek", "Mirobod", "Shayxontohur",
    "Yakkasaroy", "Olmazor", "Uchtepa", "Sergeli", "Yangihayot", "Bektemir", "Yashnobod"
  ];
  let district: string | null = null;
  for (const d of districts) {
    if (lower.includes(d.toLowerCase())) {
      district = d;
      break;
    }
  }

  const title = rawText.slice(0, 50).trim();

  return {
    isVacancy: true,
    category,
    title: title || "Kunlik ish",
    description: rawText,
    district: district || "Toshkent",
    address: district ? `${district} tumani` : "Toshkent shahri",
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString(),
    payAmount: payAmount || 200000,
    openings: openings || 1,
    confidence: 0.7,
  };
}

export async function parseJobWithGemini(
  rawText: string,
  sourceName = "Telegram Bot"
): Promise<ParsedJob> {
  if (!config.geminiApiKey) {
    return smartRegexFallback(rawText);
  }

  const prompt = `Sen JobTop tizimi uchun e’lon tahlilchisisan. Foydalanuvchi yozgan matnni tahlil qilib, FAQAT bitta toza JSON obyekt qaytar. Hech qanday Markdown yoki tushuntirish yozma.

Hozirgi sana-vaqt: ${new Date().toISOString()}. Vaqt zonasi: Asia/Tashkent (+05:00).
Ruxsat etilgan kategoriyalar (category): "Kuryer", "Xizmat", "Yuk tashish", "Tozalash".
Agar matn ish/vakansiya haqida bo‘lsa isVacancy=true qil, aks holda false.
Matnda aniq bo‘lmagan maydonlarga null qo‘y, o‘zingdan to‘qima.
Sana-vaqtlar ISO 8601 formatida bo‘lsin.
payAmount butun son (so‘mda), openings butun son bo‘lsin.

Kutilgan JSON sxemasi:
{
  "isVacancy": true,
  "category": "Kuryer" | "Xizmat" | "Yuk tashish" | "Tozalash" | null,
  "title": string | null,
  "description": string | null,
  "district": string | null,
  "address": string | null,
  "startsAt": string | null,
  "endsAt": string | null,
  "payAmount": number | null,
  "openings": number | null,
  "confidence": number
}

Manba: ${sourceName}
E’lon matni:
${rawText}`;

  let lastError: any = null;

  // Try models in sequence with fallback
  for (const model of MODELS_TO_TRY) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model
        )}:generateContent?key=${encodeURIComponent(config.geminiApiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0,
            },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`Gemini model ${model} returned ${response.status}: ${errText}`);
        lastError = new Error(`${model} (${response.status})`);
        continue; // Try next fallback model
      }

      const result = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const jsonStr = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!jsonStr) continue;

      const data = JSON.parse(jsonStr);
      const category = JOB_CATEGORIES.includes(data.category)
        ? data.category
        : null;

      return {
        isVacancy: data.isVacancy === true,
        category,
        title: data.title ? String(data.title).slice(0, 140) : null,
        description: data.description ? String(data.description).slice(0, 2000) : null,
        district: data.district ? String(data.district).slice(0, 100) : null,
        address: data.address ? String(data.address).slice(0, 300) : null,
        startsAt: data.startsAt || null,
        endsAt: data.endsAt || null,
        payAmount:
          Number.isInteger(Number(data.payAmount)) && Number(data.payAmount) > 0
            ? Number(data.payAmount)
            : null,
        openings:
          Number.isInteger(Number(data.openings)) && Number(data.openings) > 0
            ? Number(data.openings)
            : 1,
        confidence: typeof data.confidence === "number" ? data.confidence : 0.8,
      };
    } catch (err) {
      lastError = err;
      console.warn(`Gemini model ${model} failed, trying next...`, err);
    }
  }

  // If all AI models fail (e.g. 503 high load or connection timeout), use smart regex fallback!
  console.warn("All Gemini models failed or busy. Using smart regex fallback.", lastError);
  return smartRegexFallback(rawText);
}
