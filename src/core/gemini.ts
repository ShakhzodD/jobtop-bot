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

export async function parseJobWithGemini(
  rawText: string,
  sourceName = "Telegram Bot"
): Promise<ParsedJob> {
  if (!config.geminiApiKey) {
    throw new Error("GEMINI_API_KEY sozlanmagan");
  }

  const prompt = `Sen JobTop tizimi uchun e’lon tahlilchisisan. Foydalanuvchi yozgan matnni tahlil qilib, FAQAT bitta toza JSON obyekt qaytar. Hech qanday Markdown yoki tushuntirish yozma.

Hozirgi sana-vaqt: ${new Date().toISOString()}. Vaqt zonasi: Asia/Tashkent (+05:00).
Ruxsat etilgan kategoriyalar (category): "Kuryer", "Xizmat", "Yuk tashish", "Tozalash".
Agar matn ish/vakansiya haqida bo‘lsa isVacancy=true qil, aks holda false.
Matnda aniq bo‘lmagan maydonlarga null qo‘y, o‘zingdan to‘qima.
Sana-vaqtlar ISO 8601 (masalan 2026-08-20T09:00:00+05:00) formatida bo‘lsin.
payAmount butun son (so‘mda), openings ishchilar soni butun son bo‘lsin.

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

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      config.geminiModel
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
    throw new Error(`Gemini API xatosi: ${response.status} - ${errText}`);
  }

  const result = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const jsonStr = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!jsonStr) {
    throw new Error("Gemini javob bermadi");
  }

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
    payAmount: Number.isInteger(Number(data.payAmount)) && Number(data.payAmount) > 0 ? Number(data.payAmount) : null,
    openings: Number.isInteger(Number(data.openings)) && Number(data.openings) > 0 ? Number(data.openings) : 1,
    confidence: typeof data.confidence === "number" ? data.confidence : 0.8,
  };
}
