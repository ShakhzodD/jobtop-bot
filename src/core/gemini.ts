import { containsPromptInjection } from "./security.js";
export const TASHKENT_DISTRICTS = [
  "Chilonzor",
  "Yunusobod",
  "Mirzo Ulug‘bek",
  "Mirobod",
  "Shayxontohur",
  "Yakkasaroy",
  "Olmazor",
  "Uchtepa",
  "Sergeli",
  "Yangihayot",
  "Bektemir",
  "Yashnobod",
] as const;

export type TashkentDistrict = (typeof TASHKENT_DISTRICTS)[number];

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
  isAppropriate: boolean;
  category: JobCategory | null;
  title: string | null;
  description: string | null;
  district: string | null;
  address: string | null;
  startsAt: string | null;
  endsAt: string | null;
  payAmount: number | null;
  openings: number | null;
  contactPhone?: string | null;
  confidence: number;
}

const FALLBACK_MODELS = [
  config.geminiModel,
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
].filter(Boolean);

const MODELS_TO_TRY = [...new Set(FALLBACK_MODELS)];

// Inappropriate words & spam filter
const INAPPROPRIATE_WORDS = [
  "massaj",
  "intim",
  "18+",
  "sauna",
  "relax",
  "body massaj",
  "tungi klub",
  "striptiz",
  "qimor",
  "kazino",
  "casino",
  "1xbet",
  "melbet",
  "mostbet",
  "stavka",
  "kripto",
  "crypto",
  "investitsiya",
  "oson daromad",
  "piramida",
  "karta sotiladi",
  "tanishuv",
  "homiylik",
  "sponsor",
];

export function containsInappropriateContent(text: string): boolean {
  const lower = text.toLowerCase();
  for (const word of INAPPROPRIATE_WORDS) {
    if (lower.includes(word)) {
      return true;
    }
  }
  return false;
}

function smartRegexFallback(rawText: string): ParsedJob {
  if (containsInappropriateContent(rawText)) {
    return {
      isVacancy: false,
      isAppropriate: false,
      category: null,
      title: null,
      description: null,
      district: null,
      address: null,
      startsAt: null,
      endsAt: null,
      payAmount: null,
      openings: null,
      confidence: 0,
    };
  }

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

  // 2. Detect Salary
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

  // 3. Detect Openings
  let openings = 1;
  const openingsMatch = rawText.match(/(\d+)\s*(ta|nafar|kishi|yigit|ayol|ishchi)/i);
  if (openingsMatch) {
    openings = parseInt(openingsMatch[1], 10);
  }

  // 4. Detect District
  const districts = TASHKENT_DISTRICTS;
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
    isAppropriate: true,
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
  // Pre-filter inappropriate content and prompt injection
  if (containsInappropriateContent(rawText) || containsPromptInjection(rawText)) {
    console.warn("🚫 Taqiqlangan / 18+ / Spam so‘zlar aniqlandi, bekor qilindi:", rawText.slice(0, 50));
    return {
      isVacancy: false,
      isAppropriate: false,
      category: null,
      title: null,
      description: null,
      district: null,
      address: null,
      startsAt: null,
      endsAt: null,
      payAmount: null,
      openings: null,
      confidence: 0,
    };
  }

  if (!config.geminiApiKey) {
    return smartRegexFallback(rawText);
  }

  const prompt = `Sen JobTop tizimi uchun KUNLIK ISHLAR tahlilchisi va XAVFSIZLIK FILTRIsisan. JobTop — FAQAT KUNLIK, KUNBAY, SOATBAY va TEZKOR BIR MARTALIK ISHLAR platformasi. Foydalanuvchi yozgan matnni tahlil qilib, FAQAT bitta toza JSON obyekt qaytar. Hech qanday Markdown yoki tushuntirish yozma.

QAT'IY QOIDALAR:
1. XAVFSIZLIK: Agar e'lon 18+, intim, massaj, tungi klub, qimor/stavka (1xbet), moliyaviy piramida, noqonuniy yoki shubhali bo'lsa -> "isAppropriate": false va "isVacancy": false qilib qaytar.
2. HUDUD: Faqat Toshkent shahri va Toshkent viloyatidagi ishlar qabul qilinadi. Boshqa viloyatlar (Farg'ona, Samarqand, Andijon va h.k.) -> "isVacancy": false.
3. KORPORATIV AGREGATORLAR VA OYLIK ISHLAR BLOKI:
   - BEKOR QIL (isVacancy: false): Uzum Tezkor, Yandex Eats, Yandex Delivery kabi ommaviy korporativ kuryerlikka chaqiruvchi e'lonlar hamda 30 kunlik doimiy shtatdagi oylik ofis ishlari (buxgalter, menejer).
   - QABUL QIL (isVacancy: true): Haqiqiy KUNLIK, KUNBAY, SOATBAY, SMENALIK yoki BIR MARTALIK BUYURTMA/BRIGADA ishlari (yuk tashish, mebel ko‘chirish, tozalash/uborka, stroyka, fura tushirish, 1 kunlik shaxsiy buyurtmalar).
4. Ruxsat etilgan kategoriyalar (category): "Kuryer", "Xizmat", "Yuk tashish", "Tozalash".

Kutilgan JSON sxemasi:
{
  "isVacancy": boolean,
  "isAppropriate": boolean,
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
        lastError = new Error(`${model} (${response.status})`);
        continue;
      }

      const result = (await response.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const jsonStr = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!jsonStr) continue;

      const data = JSON.parse(jsonStr);

      if (data.isAppropriate === false || data.isVacancy === false) {
        return {
          isVacancy: false,
          isAppropriate: false,
          category: null,
          title: null,
          description: null,
          district: null,
          address: null,
          startsAt: null,
          endsAt: null,
          payAmount: null,
          openings: null,
          confidence: 0,
        };
      }

      const category = JOB_CATEGORIES.includes(data.category)
        ? data.category
        : null;

      return {
        isVacancy: true,
        isAppropriate: true,
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
    }
  }

  return smartRegexFallback(rawText);
}
