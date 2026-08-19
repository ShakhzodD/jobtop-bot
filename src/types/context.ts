import { Context, SessionFlavor } from "grammy";
import { Conversation, ConversationFlavor } from "@grammyjs/conversations";

export type UserRole = "worker" | "employer";

export interface SessionData {
  role?: UserRole;
  filterCategory?: string;
  filterDistrict?: string;
  feedIndex?: number;
}

export type MyContext = ConversationFlavor<Context & SessionFlavor<SessionData>>;
export type MyConversation = Conversation<MyContext, MyContext>;
