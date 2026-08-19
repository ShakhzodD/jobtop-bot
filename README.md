# JobTop — Telegram Bot (grammY)

O‘zbekistondagi bir kunlik ishlar uchun to‘liq Telegram Bot platformasi.

## 🚀 Texnologiyalar
- **Node.js & TypeScript**
- **grammY Framework** (eng zamonaviy Telegram bot kutubxonasi)
- **@grammyjs/conversations** — Bosqichma-bosqich FSM dialoglar
- **Supabase** — Ma’lumotlar bazasi (`users`, `jobs`, `applications`, `ai_job_imports`)
- **Google Gemini API** — Erkin matnli e’lonlarni avtomatik strukturalash

---

## 📦 O‘rnatish va Ishga tushirish

1. **Kutubxonalarni o‘rnatish:**
   ```bash
   pnpm install
   # yoki
   npm install
   ```

2. **Muhit o‘zgaruvchilari (`.env`):**
   `.env` faylini quyidagilar bilan to‘ldiring:
   ```env
   TELEGRAM_BOT_TOKEN=123456789:ABCdef...
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_API_KEY=your_supabase_service_role_key
   ADMIN_TELEGRAM_IDS=123456789,987654321
   GEMINI_API_KEY=your_gemini_api_key
   GEMINI_MODEL=gemini-2.5-flash
   ```

3. **Ishga tushirish:**
   ```bash
   # Development rejimida:
   pnpm dev

   # Production build va start:
   pnpm build
   pnpm start
   ```

---

## ✨ Imkoniyatlar

### 👷 Ishchi (Worker)
- `/start` orqali ro‘yxatdan o‘tish va telefon raqamini yuborish.
- **🔍 Ishlarni ko‘rish:** Kategoriyalar bo‘yicha e’lonlar lentasi (sahifalangan interaktiv kartochkalar).
- **✋ Ariza yuborish:** Bitta tugma bilan e’longa ariza jo‘natish.
- **📄 Mening arizalarim:** Kutilayotgan va qabul qilingan arizalar ro‘yxati (ish beruvchi tanlaganida uning telefoni ko‘rinadi).
- **👤 Profil:** Ma’lumotlar, tajriba va kategoriyalarni tahrirlash.
- **⚡️ Bildirishnomalar:** Mos sohada yangi e’lon chiqqanda avtomatik xabar keladi.

### 💼 Ish beruvchi (Employer)
- **➕ Yangi e’lon berish (AI tezkor to‘ldirish):** Shunchaki oddiy matnda yozing (masalan: *"Ertaga Chilonzorda 2 ta yuk tashuvchi kerak, 200 mingdan"*), Gemini AI uni darhol e’longa aylantiradi va tasdiqlash uchun chiqaradi.
- **📋 Mening e’lonlarim:** Faol e’lonlar va arizalar soni.
- **👥 Nomzodlarni ko‘rish va tanlash:** Nomzod tanlanganda ishchining telefon raqami darhol ochiladi va ishchiga ham ish beruvchi telefoni yuboriladi.

### 👑 Admin / Moderatsiya
- Har bir yangi e’lon uchun inline `✅ Tasdiqlash` va `❌ Rad etish` tugmalari.
- **Kanal postlarini forward import qilish:** Admin boshqa kanaldan postni botga forward qilganda, Gemini AI uni tahlil qilib, moderatsiyaga tayyorlab beradi.
