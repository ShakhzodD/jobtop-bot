# 🚀 JobTop Platform — To‘liq Loyiha Arxitekturasi va Holati (Master Documentation for AI & Developers)

> **Hujjat so‘nggi yangilangan sana:** 2026-09-17  
> **Loyiha maqsadi:** O‘zbekiston (Toshkent shahri va viloyati) bo‘yicha KUNLIK, SOATBAY va TEZKOR jismoniy ishlarni topish hamda xizmatlarga ishchi yollashning 2 tomonlama avtomatlashtirilgan marketplace ekotizimi.  
> **Asosiy qoida:** Foydalanuvchilar bazasini hech qachon tozalamaslik (no truncate/wipe), barcha ma'lumotlar real-vaqtda saqlanadi. 100% O'zbek tili.

---

## 📌 1. Ekotizim Tarkibi va Havolalar

| Komponent | Tavsif | Havola / Token / Username |
| :--- | :--- | :--- |
| **🤖 Asosiy Bot** | Ishchilar va Buyurtmachilar uchun asosiy Telegram bot | `@jobtopuzbot` (`[PROTECTED_ENV_VARIABLE]`) |
| **🛡 Moderatsiya Boti** | Admin paneli, Jonli statistika, Broadcast, Foydalanuvchilar brauzeri, E'lon moderatsiyasi | `@jobtopmoderationbot` (`[PROTECTED_ENV_VARIABLE]`) |
| **📢 Rasmiy Kanal** | Yangi e'lonlar avtomatik post bo'lib tushadigan ommaviy kanal | `@jobtopuzz` (Jobtop kunlik ish elonlari, ID: `-1003947859078`) |
| **☁️ Backend Hosting** | 24/7 Railway Container Hosting (Deploy via GitHub) | Railway Project: `hospitable-rejoicing`, Service: `jobtop-bot` |
| **🐙 GitHub Repo** | Bot manba kodi | `https://github.com/ShakhzodD/jobtop-bot.git` |
| **🗄 Ma'lumotlar Bazasi** | Supabase PostgreSQL + Realtime | `https://gzmmlrzqzblykvsxnows.supabase.co` |
| **👑 Bosh Admin** | Admin Telegram ID va egasi | ShahzoD (`445057374`, `@shakhzod7037`, `+998 99 802 70 37`) |

---

## 📊 2. Real-Vaqtdagi Jonli Statistika (2026-yil 17-sentyabr holatiga)

* **Jami ro‘yxatdan o‘tgan foydalanuvchilar:** **29 nafar**
* **Telefon raqami tasdiqlanganlar:** **25 nafar (86.2%)** *(profilini to‘liq to‘ldirgan)*
* **Jami ishlar bazasi:** **272 ta ish** *(shundan **258 tasi faol/published** holatda)*
* **Kategoriya taqsimoti:**
  * 🛠 Xizmat & Usta yordamchisi: ~140 ta
  * 🧹 Tozalash & Uborka: ~75 ta
  * 📦 Yuk tashish & Fura/Mebel: ~50 ta
* **Eng faol sodiq foydalanuvchilar (Retention):**
  * **Mamajonov** (*Beruniy tumani*) — Ketma-ket 25+ kundan beri deyarli har kuni faol
  * **Ibragimov Begzod** (*Yunusobod*) — Profil to‘ldirgan, 2 yil tajriba
  * **Karamanova Oygul** (*Chilonzor*) — Tozalash/uborka
  * **Oxunjon, Azimjon, Shohruh Mirzayev, Nuriddin Xoliqov, Zairov Komol**

---

## 🏗 3. Arxitektura va Texnologik Stek

* **Runtime & Til:** Node.js v20+ / TypeScript / ESM.
* **Telegram Framework:** `grammY` + `@grammyjs/conversations` + `@grammyjs/runner` + `@grammyjs/types`.
* **AI & Parsing:** Google Gemini AI Flash (`@google/genai` / `gemini-2.5-flash` / `gemini-3.5-flash`) + Smart Regex Fallback.
* **Xavfsizlik & Anti-DDoS:** Sliding-window in-memory rate limiter (5 req/2s), Admin-only guard, HTML sanitization, Prompt-injection shield.
* **Avtomatik Skronlar:**
  * Har 2 daqiqada: 32 ta Toshkent guruhlaridan kunlik ishlarni skanerlash.
  * Har kuni soat 08:30 da: Smart Morning Digest (barcha foydalanuvchilarga top-3 ish).
  * Har 30 daqiqada: Bot identity auto-lock va runner auto-recovery watchdog.
* **Database & Auth:** Supabase Client (`@supabase/supabase-js`).
* **Deployment:** Railway Nixpacks container, 24/7 background worker, Healthcheck server (`0.0.0.0:8080`).

---

## 🗄 4. Ma'lumotlar Bazasi Sxemasi (Supabase Tables)

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
  * `gender`: `'male'` | `'female'`
  * `is_pro`: boolean (PRO akkaunt holati)
  * `pro_until`: string (PRO tugash vaqti)
  * `referral_count`: number
  * `referred_users`: number[]
  * `last_active_at`: timestamp

### `jobs`
* `id` (UUID, Primary Key)
* `title` (TEXT) — Ish sarlavhasi
* `description` (TEXT) — Ish tavsifi va aloqa ma'lumotlari
* `pay_amount` (NUMERIC) — Kunlik ish haqi
* `district` (TEXT) — Tuman (faqat Toshkent shahri va viloyati)
* `category` (TEXT) — `Xizmat`, `Yuk tashish`, `Tozalash`, `Kuryerlik`
* `status` (TEXT) — `'published'`, `'active'`, `'cancelled'`, `'filled'`
* `source_name` (TEXT) — Manba (Telegram kanal yoki OLX.uz)
* `source_url` (TEXT, Nullable)
* `created_at` (TIMESTAMPTZ)

---

## ⚡️ 5. Amalga Oshirilgan Asosiy Modullar

1. **🛡 Xavfsizlik Qatlami (`core/security.ts`):**
   - Sliding-window rate limiter — flood va spamdan himoya;
   - Strict `adminOnlyGuard` — moderatsiya botiga begona kirishini 100% to'sadi;
   - HTML Sanitizer va Prompt Injection Shield.
2. **🤖 2 Daqiqalik Avtomatik Skraper (`services/channel-scraper.service.ts`):**
   - 32 ta tasdiqlangan Toshkent guruhlari va kanallarini doimiy kuzatib boradi;
   - Qat'iy Toshkent-only filtr: Boshqa viloyatlar, oylik 30 kunlik ofis ishlari va korporativ agregatorlar (Uzum Tezkor, Yandex Eats) qat'iy bloklanadi.
3. **📢 Avto-Kanal Publisher (`services/channel-publisher.service.ts`):**
   - Har bir e'lon ostida 2 ta yuqori konversiyali virusli tugma:
     - `[🤖 Bog‘lanish / Ariza topshirish]`
     - `[📤 Ushbu ishni do‘stga / guruhga ulashish]`
4. **☀️ Smart Morning Digest (`services/digest.service.ts`):**
   - Har kuni ertalab soat 08:30 da barcha 29 ta ro'yxatdan o'tgan foydalanuvchiga kunning eng yuqori haq to'lanadigan 3 ta sara ishi bitta chiroyli xabarda yetkaziladi.
5. **📍 Tumanlar Bo'yicha Tezkor Xabarnomalar (District Geo-Alerts):**
   - Ishchi o'z tumanini tanlaganida (masalan, Chilonzor yoki Yunusobod), o'sha tumanda yangi ish chiqishi bilan darhol VIP Push xabar boradi.
6. **🎁 "3 ta Do'st = 1 Hafta Bepul PRO" Referal Dvigateli (`services/user.service.ts`):**
   - 3 ta do'st taklif qilgan foydalanuvchiga tizim avtomatik 168 soatlik PRO yoqadi va muddati tugagach avtomat o'chiradi.
7. **📢 Moderatsiya Botida Ommaviy Xabar (/broadcast) Paneli (`handlers/admin.handler.ts`):**
   - Adminga barcha foydalanuvchilarga bir zumda ommaviy e'lon yuborish imkonini beradi.

---

## 🎨 6. Marketing va Instagram Reels Strategiyasi

1. **1-Format: "Top-3 Noodatiy Kunlik Ishlar" (Eng yuqori qiziqish):**
   - Hook: *"Toshkentda 1 kunga 650 000 so‘m to‘laydigan qanaqa ishlar borligini bilasizmi?"*
   - Real e'lonlar: Chinni buyumlari (200k), Mebel sex (250k), Qo'yxona tozalash (650k).
2. **2-Format: "Real Eksperiment" (1 kunda 300 000 so'm topish mumkinmi?):**
   - Jonli sinov, botdan ish topish va kechqurun naqd pulni ko'rsatish.
3. **3-Format: "Student Layfxaki" (Sentyabr talabalari uchun):**
   - Darsdan keyingi erkin grafikdagi yengil ishlar.

---

## 📁 7. Kod Fayllari Xaritasi (`telegrambot/src/`)

```
telegrambot/
├── src/
│   ├── bot.ts                                  # Asosiy bot runner, middleware, 08:30 Digest cron, watchdog
│   ├── config/
│   │   └── env.ts                              # Muhit o'zgaruvchilari (Tokens, API Keys, DB config)
│   ├── core/
│   │   ├── bots.ts                             # MainBot va ModBot instansiyalari
│   │   ├── security.ts                         # Rate limiter, admin guard, prompt shield, sanitizer
│   │   ├── gemini.ts                           # Gemini AI job parser, TASHKENT_DISTRICTS va filtrlash
│   │   └── supabase.ts                         # Supabase database client
│   ├── services/
│   │   ├── digest.service.ts                   # 08:30 AM Smart Morning Job Digest cron
│   │   ├── web-scraper.service.ts              # OLX, Ish.uz, Ustabor scraper va URL importeri
│   │   ├── user.service.ts                     # User CRUD, referral dvigateli, retention va pro muddatlari
│   │   ├── job.service.ts                      # E'lonlar CRUD, getDistrictJobCounts, maosh saralash
│   │   ├── channel-scraper.service.ts          # 32 ta kanalni 2 minutlik skaneri, qat'iy Toshkent-only filtr
│   │   ├── channel-publisher.service.ts        # @jobtopuzz rasmiy kanaliga dual viral tugmali avto-post
│   │   ├── moderation.service.ts               # Moderatsiya, admin notifikatsiyalari, District Push
│   │   ├── application.service.ts              # Arizalar boshqaruvi
│   │   ├── payment.service.ts                  # PRO ta'riflar, to'lov kartasi, Click/Payme
│   │   └── review.service.ts                   # Reyting va baholash
│   ├── handlers/
│   │   ├── start.handler.ts                    # /start, /help, deeplinklar, 2 tomonlama yo'riqnoma
│   │   ├── worker.handler.ts                   # Ishchi menyusi, tumanlar va xabarnomalar, 1-tap do'stga ulashish
│   │   ├── employer.handler.ts                 # Buyurtmachi menyusi, nomzodlarni tanlash
│   │   └── admin.handler.ts                    # Moderatsiya boti, /broadcast, jonli statistika, watchdog
│   ├── conversations/
│   │   ├── create-job.conversation.ts          # Ish beruvchi e'lon yaratish suhbati (AI text/audio)
│   │   ├── edit-profile.conversation.ts        # Ishchi profilini to'ldirish
│   │   └── feedback.conversation.ts            # Murojaat va takliflar
│   └── keyboards/
│       ├── auth.js                             # Rol tanlash va kontakt so'rash tugmalari
│       └── main-menu.js                        # Ishchi va Ish beruvchi bosh menyusi
```

---
*Ushbu hujjat JobTop tizimining eng so‘nggi holati, arxitekturasi va strategiyasini to‘liq aks ettiradi.*
