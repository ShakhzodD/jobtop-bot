import { InlineKeyboard } from "grammy";
import { JOB_CATEGORIES, JobCategory } from "../core/gemini.js";

export function getCategoriesInlineKeyboard(prefix: string) {
  const keyboard = new InlineKeyboard();
  JOB_CATEGORIES.forEach((cat, index) => {
    keyboard.text(cat, `${prefix}:${cat}`);
    if (index % 2 === 1) keyboard.row();
  });
  return keyboard;
}
