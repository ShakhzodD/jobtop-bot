# 🚀 JobTop Platform — To‘liq Loyiha Arxitekturasi va Holati (Master Documentation for AI & Developers)

> **Hujjat yangilangan sana:** 2026-08-24  
> **Loyiha maqsadi:** O‘zbekiston (Toshkent) bo‘yicha kunlik, soatbay va tezkor ishlarni topish hamda xizmatlarga ishchi yollashning 2 tomonlama avtomatlashtirilgan marketplace ekotizimi.  
> **Asosiy qoida:** Foydalanuvchilar bazasini hech qachon tozalamaslik (no truncate/wipe), barcha ma'lumotlar real-vaqtda saqlanadi. Til: O'zbek tili.

---

## 📌 1. Ekotizim Tarkibi va Havolalar

| Komponent | Tavsif | Havola / Token / Username |
| :--- | :--- | :--- |
| **🤖 Asosiy Bot** | Ishchilar va Buyurtmachilar uchun asosiy Telegram bot | `@jobtopuzbot` (`8995693178:AAGcgGQTYIhxrsYR1cIQGpLuaFciDU2EFEA`) |
| **🛡 Moderatsiya Boti** | Admin paneli, Jonli statistika, Foydalanuvchilar brauzeri, E'lon moderatsiyasi | `@jobtopmoderationbot` (`8037368717:AAG0fjAbDAVABLOFi9gUUM0seaQCfEw77B4`) |
| **📢 Rasmiy Kanal** | Yangi e'lonlar avtomatik post bo'lib tushadigan ommaviy kanal | `@jobtopuzz` (Jobtop kunlik ish elonlari, ID: `-1003947859078`) |
| **☁️ Backend Hosting** | 24/7 Railway Container Hosting (Deploy via GitHub) | Railway Project: `hospitable-rejoicing`, Service: `jobtop-bot` |
| **🐙 GitHub Repo** | Bot manba kodi | `https://github.com/ShakhzodD/jobtop-bot.git` |
| **🗄 Ma'lumotlar Bazasi** | Supabase PostgreSQL + Realtime | `https://gzmmlrzqzblykvsxnows.supabase.co` |
| **👑 Bosh Admin** | Admin Telegram ID va egasi | ShahzoD (`445057374`, `@shakhzod7037`, `+998 99 802 70 37`) |

---

## 🏗 2. Arxitektura va Texnologik Stek

* **Runtime & Til:** Node.js v20+ / TypeScript / ESM.
* **Telegram Framework:** `grammY` + `@grammyjs/conversations` + `@grammyjs/runner` + `@grammyjs/types`.
* **AI & Parsing:** Google Gemini AI Flash (`@google/genai` / `gemini-2.5-flash` / `gemini-3.5-flash`) + Smart Regex Fallback.
* **Database & Auth:** Supabase Client (`@supabase/supabase-js`).
* **Deployment:** Railway Nixpacks container, 24/7 background worker, Healthcheck server (`0.0.0.0:8080`).

---

## 🗄 3. Ma'lumotlar Bazasi Sxemasi (Supabase Tables)

### `users`
* `id` (UUID, Primary Key)
* `telegram_id` (BIGINT, Unique) — Foydalanuvchining Telegram ID si
* `phone` (TEXT) — Telefon raqami (`998901234567`)
* `telegram_username` (TEXT, Nullable)
* `full_name` (TEXT)
* `avatar_url` (TEXT, Nullable)
* `district` (TEXT, Nullable) — Yashash tumani
* `birth_date` (DATE, Nullable)
* `experience_years` (INT, Nullable) — Tajribasi
* `about` (TEXT, Nullable) — O'zi haqida ma'lumot
* `worker_categories` (TEXT[], default: `[]`) — Qiziqqan sohalari (`Yuk tashish`, `Tozalash`, `Kuryer`, `Xizmat`)
* `active_role` (TEXT) — `'worker'` yoki `'employer'`
* `bot_state` (JSONB) — Moslashuvchan metadata:
  * `gender`: `'male'` | `'female'` (Ishchining jinsi)
  * `is_pro`: boolean (PRO akkaunt holati)
  * `pro_plan`: string (`🥉 1 haftalik PRO`, `🥈 1 oylik PRO`, `🥇 3 oylik PRO`)
  * `pro_until`: ISO Timestamp (PRO tugash vaqti)
  * `last_active_at`: ISO Timestamp (Oxirgi marta botdan foydalangan vaqti)
* `created_at` (TIMESTAMPTZ)

### `jobs`
* `id` (UUID, Primary Key)
* `employer_id` (UUID, Nullable, References `users.id`) — Agar botda buyurtmachi yaratgan bo'lsa
* `category` (TEXT) — `'Yuk tashish'`, `'Tozalash'`, `'Kuryer'`, `'Xizmat'`
* `title` (TEXT) — E'lon sarlavhasi
* `description` (TEXT) — To'liq matn va toza tavsif (hech qanday manba havolalarisiz)
* `district` (TEXT) — Tuman nomi
* `address` (TEXT) — Aniq manzil yoki mo'ljal
* `starts_at` (TIMESTAMPTZ) — Boshlanish vaqti
* `ends_at` (TIMESTAMPTZ) — Tugash vaqti
* `pay_amount` (NUMERIC) — To'lanadigan haq (so'mda)
* `openings` (INT) — Kerakli ishchilar soni
* `status` (TEXT) — `'published'` | `'filled'` | `'completed'` | `'cancelled'` | `'pending_moderation'`
* `source_name` (TEXT, Nullable) — Import manbasi
* `source_url` (TEXT, Nullable)
* `created_at` (TIMESTAMPTZ)

### `applications`
* `id` (UUID, Primary Key)
* `job_id` (UUID, References `jobs.id`)
* `worker_id` (UUID, References `users.id`)
* `status` (TEXT) — `'pending'` | `'selected'` | `'rejected'` | `'withdrawn'`
* `party_size` (INT, default: 1) — Jamoa/Brigada hajmi (1-4 kishi)
* `message` (TEXT, Nullable)
* `created_at` (TIMESTAMPTZ)

### `reviews`
* `id` (UUID, Primary Key)
* `reviewer_id` (UUID, References `users.id`)
* `reviewee_id` (UUID, References `users.id`)
* `job_id` (UUID, References `jobs.id`)
* `rating` (INT, 1-5)
* `comment` (TEXT, Nullable)
* `created_at` (TIMESTAMPTZ)

### `ai_job_imports`
* `id` (UUID, Primary Key)
* `content_hash` (TEXT, Unique) — Dublikatlarni oldini oluvchi sha256 xesh
* `source_name` (TEXT)
* `source_url` (TEXT, Nullable)
* `source_external_id` (TEXT, Nullable)
* `raw_text` (TEXT)
* `parsed_job` (JSONB)
* `confidence` (FLOAT)
* `status` (TEXT)
* `job_id` (UUID, Nullable)
* `created_at` (TIMESTAMPTZ)

---

## ⚡️ 4. Amalga Oshirilgan Asosiy Funksional Tizimlar

### A. 23 ta Kanalni Avtomatik Skan Qiluvchi Scraper Engine (`channel-scraper.service.ts`)
* Har **3 daqiqada** Toshkentdagi 23 ta eng yirik va faol kunlik ish kanallarini (`t.me/s/...`) tekshiradi:
  `@kunlikishlaruz24`, `@talabalar_uchun_ishlar`, `@toshkentda_kunlik_ishlar`, `@toshkent_ish_elonlari`, `@kunlik_ishlar_rasmiy`, `@talabalar_uchun_ish`, `@kunlik_ishlar_toshkent`, `@talabalar_ish_bor`, `@toshkentda_ish_bor`, `@toshkent_ishlari`, `@toshkentda_ish`, `@toshkent_ish_bozor`, `@ish_bor_toshkentda`, `@talabalar_uchun_vakansiya`, `@toshkent_kunlik_ish`, `@kunlik_ishlar_toshkent_24`, `@rabota_v_tashkente`, `@Kunlik_ishlar_kunbayToshkentda`, `@kunlik_ishlar_toshkentuz`, `@kunlik_ish_uz`, `@kunlik_ish_toshkent`, `@toshkent_kunlik_ishlar`, `@mardikor_bozor_toshkent`.
* **Xavfsizlik va 18+ filtri:** Qimor, stavka, massaj, intim, piramida xabarlarini to'liq filtrlaydi, ammo ayollar uchun halol tozalash/oshxona ishlarini o'tkazadi.
* **3 Bosqichli Dublikatga Qarshi Tizim (Deduplication):**
  1. Content hash tekshiruvi;
  2. 48 soatlik barcha e'lonlar bilan telefon raqam va telegram username solishtiruvi;
  3. Jaccard matn o'xshashlik tahlili (`> 0.55`).
* **Avtomatik Yopilish Tizimi (Auto-Close):** Kanallarda `@toldi`, `TO'LDI`, `To‘ldi`, `odam bo‘ldi`, `odam topildi`, `ish yopildi`, `band qilindi` xabarlari chiqishi bilanoq, tizim o'sha e'lonni bazadan topib statusini `'filled'` ga o'tkazadi va umumiy qidiruv lentasidan darhol yashiradi!

### B. Rasmiy Kanalga Avto-Broadcaster (`@jobtopuzz` — `channel-publisher.service.ts`)
* Har qanday yangi tasdiqlangan yoki skreperdan o'tgan e'lon **o'sha soniyaning o'zida `@jobtopuzz` kanaliga post qilinadi**.
* **Post tarkibi:** Sarlavha, Kategoriya, Jins talabi (`👤 Kimlar uchun: 👨 Erkaklar / 👩 Ayollar / 👥 Barchaga`), Tuman, Manzil, Maosh, Ishchilar soni, Tavsif, Heshteglar (`#YukTashish`, `#Tozalash`, `#ErkaklarUchun`, `#AyollarUchun`, `#Toshkent`, `#JobTop`).
* **1-Bosishda Botga O'tish Tugmasi:** `[🤖 Bog‘lanish / Ariza topshirish]` tugmasi to'g'ridan-to'g'ri `https://t.me/jobtopuzbot?start=job_${job.id}` havolasi bilan ulanadi.

### C. Toshkent Tumanlari Bo'yicha Qidiruv va Smart Geolokatsiya (`TASHKENT_DISTRICTS`)
* Toshkentning **12 ta tumani** to'liq integratsiya qilindi: *Chilonzor, Yunusobod, Mirzo Ulug‘bek, Mirobod, Shayxontohur, Yakkasaroy, Olmazor, Uchtepa, Sergeli, Yangihayot, Bektemir, Yashnobod*.
* **Jonli Sonlar bilan Tumanlar Menyusi (`worker:districts:menu`):** `📍 Chilonzor (6)`, `📍 Yunusobod (4)`, `📍 Mirobod (3)` va h.k.
* **Shaxsiy Tuman Tavsiyasi:** Agar ishchi profilida tuman kiritilgan bo'lsa, menyuda eng yuqorida `📍 Mening tumanim: Chilonzor` chiqadi va 1 bosishda o'z uyiga yaqin ishlarni ochadi.
* **Smart District Push:** Yangi e'lon chiqqanda o'sha tumandagi ishchilarga: `📍 Sizning tumaningizda (Chilonzor) yangi ish!` deb maqsadli xabarnoma yuboriladi.

### D. Jins Bo'yicha Filtrlash va Smart Push (`detectJobGender`)
* Sun'iy intellekt har bir ishni `male` (erkaklar), `female` (ayollar) yoki `any` (barchaga) toifasiga ajratadi.
* Ishchi profilida `👨 Erkak (Yigit)` yoki `👩 Ayol (Qiz bola)` jinsi saqlanadi.
* Yangi e'lon chiqqanda Push-xabar **faqat o'sha jinsdagi ishchilarga maqsadli (Smart Push)** yuboriladi (ayollarga og'ir yuk kabi keraksiz xabarlar bormaydi).
* Qidiruv lentasida `👨 Erkaklar uchun` va `👩 Ayollar uchun` alohida filtr tugmalari mavjud.

### E. 2 Tomonlama Onboarding & "Qanday ishlaydi?" Yo'riqnomasi
* Ro'yxatdan o'tishda aniq 2 ta tanlov:
  * `👷 Ish qidiruvchiman (Pul ishlash)`
  * `💼 Buyurtmachiman (Ishchi / Usta kerak)`
* `❓ Qanday ishlaydi?` bo'limi foydalanuvchining roliga qarab shaxsiy 3 qadamli yo'riqnomani ko'rsatadi:
  * **Ishchilar uchun:** Ish ko'rish ➡️ Tanlash ➡️ Bog'lanish;
  * **Buyurtmachilar / Uy egalari uchun:** Ovozli/matnli e'lon berish ➡️ AI tahlili ➡️ Ustalarni tanlash.

### F. Moderatsiya Boti (`@jobtopmoderationbot` — `admin.handler.ts`)
* **`👥 Foydalanuvchilar`**: Barcha foydalanuvchilarni interaktiv sahifalash (pagination) va rol filtrlari (`Hammasi`, `Ishchilar`, `Ish beruvchilar`) bilan ko'rish, Telegram profiliga to'g'ridan-to'g'ri havola.
* **`📊 Statistika`**: Real-vaqtli tahlil (Jami userlar, Ishchilar, Ish beruvchilar, 24 soatlik oqim, Faol e'lonlar, Moderatsiyadagi ishlar, Sohalar ulushi, Arizalar soni, Ishga joylashish konversiyasi).
* **To'g'ridan-to'g'ri E'lon Importi**: Admin istalgan guruhdan matnni forward qilsa yoki tashlasa, AI uni darhol tahlil qilib tasdiqlash uchun chiqaradi.
* **Ertalabki Avto-Hisobot**: Har kuni soat **09:00 da** adminga kunlik hisobot yuboriladi.

### G. PRO Akkaunt va Monetizatsiya Tizimi (`payment.service.ts`)
* Ta'riflar: 🥉 1 hafta (29 000 so'm), 🥈 1 oy (79 000 so'm), 🥇 3 oy (189 000 so'm).
* To'lov: Humo / Milliy Bank (`9860350149328659`, SHAHZOD URINBOYEV) + Click / Payme havolalari.
* PRO ustalarga arizalarda 1-o'rinda chiqish, ko'k tasdiqlangan belgi va yangi ishlarga tezkor xabarnomalar beriladi.

---

## 🎨 5. Marketing, Reklama va Tarqatish Materiallari

1. **Reels & TikTok Video Plani (25 soniya):**
   * Mavzusi: *"Toshkentda 1 kunda 300 000 so‘m naqd pul ishlash siri"* va *"Uyni tozalashga 10 soniyada ishchi topish"*.
   * AI Ovoz (ElevenLabs): O'zbekcha professional diktor matnlari tayyorlandi.
   * AI Video Kadrlar (Kling AI / Runway): Tayyor inglizcha 4K promptlar saqlandi.
2. **Instagram 3D Storytelling Karuseli (2 Slayd):**
   * 1-Slayd: Tartibsizlik ichida boshi qotib turgan uy egasi (*"Qayerdan ishchi topsam ekan? 🤔"*).
   * 2-Slayd: Divanda xotirjam o'tirib, `@jobtopuzbot` ga 10 soniyalik ovozli e'lon berishi va tayyor ustalar arizalari kelishi.
3. **Telegram Guruhlari uchun Tayyor Matnlar:**
   * Talabalar guruhlari (TATU, Politex, O'zMU, Nizomiy) uchun;
   * Ishchilar va Ustalar guruhlari uchun;
   * Buyurtmachilar va Uy egalari (Remont, Arenda) uchun.

---

## 📁 6. Kod Fayllari Xaritasi (`telegrambot/src/`)

```
telegrambot/
├── src/
│   ├── bot.ts                                  # Asosiy bot runner, middleware (touchUserActivity), healthcheck server
│   ├── config/
│   │   └── env.ts                              # Muhit o'zgaruvchilari (Tokens, API Keys, DB config)
│   ├── core/
│   │   ├── bots.ts                             # MainBot va ModBot instansiyalari
│   │   ├── gemini.ts                           # Gemini AI job parser, TASHKENT_DISTRICTS va xavfsizlik filtri
│   │   └── supabase.ts                         # Supabase database client
│   ├── services/
│   │   ├── user.service.ts                     # User CRUD, profillar, retention va gender boshqaruvi
│   │   ├── job.service.ts                      # E'lonlar CRUD, getDistrictJobCounts, gender klassifikatori (detectJobGender)
│   │   ├── channel-scraper.service.ts          # 23 ta kanalni 3 minutlik skaneri, dublikat va auto-close filtri
│   │   ├── channel-publisher.service.ts        # @jobtopuzz rasmiy kanaliga avto-post yuboruvchi
│   │   ├── moderation.service.ts               # Moderatsiya, admin notifikatsiyalari, Smart District & Gender Push
│   │   ├── application.service.ts              # Arizalar, tanlash (selectCandidate), avto-to'lish (filled)
│   │   ├── payment.service.ts                  # PRO ta'riflar, to'lov kartasi, Click/Payme integratsiyasi
│   │   └── review.service.ts                   # Reyting va yulduzlar
│   ├── handlers/
│   │   ├── start.handler.ts                    # /start, /help, deeplinklar (job_<id>, ref_<id>), 2 tomonlama yo'riqnoma
│   │   ├── worker.handler.ts                   # Ishchi menyusi, tumanlar va jins bo'yicha qidiruv, PRO menyusi, profil
│   │   ├── employer.handler.ts                 # Buyurtmachi menyusi, e'lonlarni boshqarish, nomzodlarni tanlash
│   │   └── admin.handler.ts                    # Moderatsiya boti menyusi, Foydalanuvchilar brauzeri, Statistika, Forward importer
│   ├── conversations/
│   │   ├── create-job.conversation.ts          # Ish beruvchi e'lon yaratish suhbati (AI text/audio)
│   │   ├── edit-profile.conversation.ts        # Ishchi profilini to'ldirish (Ism, Jins, Tuman, Tajriba, Soha, Haqida)
│   │   └── feedback.conversation.ts            # Murojaat va takliflar
│   └── keyboards/
│       ├── auth.js                             # Rol tanlash va kontakt so'rash tugmalari
│       └── main-menu.js                        # Ishchi va Ish beruvchi bosh menyusi
```

---

## 🚀 7. Keyingi Rivojlanish Bosqichlari (Next Steps & Roadmap)

1. **📢 Moderatsiya Botida Ommaviy Xabar (Broadcast / Rassilka) Paneli:**
   * Adminga bitta tugma orqali barcha ro'yxatdan o'tgan foydalanuvchilarga xabar/reklama yuborish imkoniyatini qo'shish.
2. **💰 Maosh Bo'yicha Filtrlash (`🔥 300 000+ so‘mlik ishlar`):**
   * Yuqori haq to'lanadigan ishlarni saralash.
3. **🎁 Do'stni taklif qilganga Bepul PRO Sovg'a Qilish (Referral Gamifikatsiya):**
   * 3 ta do'stini olib kelgan foydalanuvchiga avtomatik 1 haftalik PRO berish.
4. **Telegram UserBot (Method 2 — Supergroup Listener):**
   * `@kunlikishlartoshkent1_chat` kabi ochiq/yopiq superguruhlardan ham e'lonlarni 24/7 avtomat o'qiydigan MTProto tinglovchisini ulash.

---
*Ushbu hujjat har qanday yangi dasturchi yoki AI agent JobTop tizimini darhol to'liq tushunib, ishni davom ettirishi uchun barcha arxitektura, yangilanishlar va rejalarni to'liq qamrab olgan.*
