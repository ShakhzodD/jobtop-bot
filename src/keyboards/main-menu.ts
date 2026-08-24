import { Keyboard } from "grammy";

export function getWorkerMainMenu() {
  return new Keyboard()
    .text("🔍 Ishlarni ko‘rish")
    .text("📄 Mening arizalarim")
    .row()
    .text("👤 Mening profilim")
    .text("👥 Sherikni taklif qilish")
    .row()
    .text("❓ Qanday ishlaydi?")
    .text("✍️ Murojaat va takliflar")
    .row()
    .text("🔄 Ish beruvchi rejimiga o‘tish")
    .resized();
}

export function getEmployerMainMenu() {
  return new Keyboard()
    .text("➕ Yangi e’lon berish")
    .text("📋 Mening e’lonlarim")
    .row()
    .text("👥 Do‘stlarni taklif qilish")
    .text("❓ Qanday ishlaydi?")
    .row()
    .text("✍️ Murojaat va takliflar")
    .text("🔄 Ishchi rejimiga o‘tish")
    .resized();
}
