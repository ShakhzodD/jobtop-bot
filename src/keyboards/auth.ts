import { InlineKeyboard, Keyboard } from "grammy";

export const roleSelectionKeyboard = new InlineKeyboard()
  .text("👷 Men Ishchiman", "auth:role:worker")
  .row()
  .text("💼 Men Ish beruvchiman", "auth:role:employer");

export const contactRequestKeyboard = new Keyboard()
  .requestContact("📱 Telefon raqamni yuborish")
  .resized()
  .oneTime();
