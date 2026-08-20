import { Keyboard } from "grammy";

export function getWorkerMainMenu() {
  return new Keyboard()
    .text("🔍 Ishlarni ko‘rish")
    .text("📄 Mening arizalarim")
    .row()
    .text("👤 Mening profilim")
    .text("🔄 Ish beruvchi rejimiga o‘tish")
    .row()
    .text("✍️ Murojaat va takliflar")
    .resized();
}

export function getEmployerMainMenu() {
  return new Keyboard()
    .text("➕ Yangi e’lon berish")
    .text("📋 Mening e’lonlarim")
    .row()
    .text("🔄 Ishchi rejimiga o‘tish")
    .text("✍️ Murojaat va takliflar")
    .resized();
}
