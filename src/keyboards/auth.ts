import { InlineKeyboard, Keyboard } from "grammy";

export const roleSelectionKeyboard = new InlineKeyboard()
  .text("👷 Ish qidiruvchiman (Pul ishlash)", "auth:role:worker")
  .row()
  .text("💼 Buyurtmachiman (Ishchi / Usta kerak)", "auth:role:employer");

export const contactRequestKeyboard = new Keyboard()
  .requestContact("📱 Telefon raqamni yuborish")
  .resized()
  .oneTime();
