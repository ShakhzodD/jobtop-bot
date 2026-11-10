/**
 * Telegram Bot API 10.4 Support Layer for JobTop
 * 
 * Features:
 * 1. Native HTML Widgets (sendWidget, answerWidgetQuery, editMessageWidgetData)
 * 2. Ephemeral Messages (callback-specific private replies)
 * 3. Disabled Buttons in Inline Keyboards
 * 4. TON Wallet query handling
 */

import { Bot } from "grammy";
import { MyContext } from "../types/context.js";

export interface SendWidgetOptions {
  width?: number;
  height?: number;
  caption?: string;
  parseMode?: "HTML" | "MarkdownV2";
  allowQueries?: boolean;
  isShared?: boolean;
  publicData?: string;
  chatData?: string;
  disableNotification?: boolean;
  protectContent?: boolean;
}

export interface WidgetQueryUpdate {
  id: string;
  from: {
    id: number;
    is_bot: boolean;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
  };
  chat?: {
    id: number;
    type: string;
    title?: string;
    username?: string;
  };
  message_id?: number;
  inline_message_id?: string;
  chat_instance?: string;
  chat_type?: string;
  type?: any;
  data?: string;
  widget_id?: string;
}

/**
 * Sends an interactive HTML widget directly into the message bubble.
 * Production works in private chats with the bot.
 */
export async function sendWidgetMessage(
  bot: Bot<MyContext>,
  chatId: number | string,
  html: string,
  options?: SendWidgetOptions
) {
  try {
    const raw = bot.api.raw as any;
    if (typeof raw.sendWidget === "function") {
      return await raw.sendWidget({
        chat_id: chatId,
        html,
        width: options?.width,
        height: options?.height,
        caption: options?.caption,
        parse_mode: options?.parseMode ?? "HTML",
        allow_queries: options?.allowQueries ?? true,
        is_shared: options?.isShared ?? false,
        public_data: options?.publicData,
        chat_data: options?.chatData,
        disable_notification: options?.disableNotification,
        protect_content: options?.protectContent,
      });
    }

    // Direct HTTP fallback if method not bound on raw instance
    return await (bot.api as any).raw({
      method: "sendWidget",
      payload: {
        chat_id: chatId,
        html,
        width: options?.width,
        height: options?.height,
        caption: options?.caption,
        parse_mode: options?.parseMode ?? "HTML",
        allow_queries: options?.allowQueries ?? true,
        is_shared: options?.isShared ?? false,
        public_data: options?.publicData,
        chat_data: options?.chatData,
      },
    });
  } catch (err: any) {
    console.error("sendWidget API error:", err.message || err);
    throw err;
  }
}

/**
 * Answers an incoming query from an interactive widget.
 */
export async function answerWidgetQuery(
  bot: Bot<MyContext>,
  widgetQueryId: string,
  data?: string
) {
  try {
    const raw = bot.api.raw as any;
    if (typeof raw.answerWidgetQuery === "function") {
      return await raw.answerWidgetQuery({
        widget_query_id: widgetQueryId,
        data: data ? String(data).slice(0, 1024) : undefined,
      });
    }

    return await (bot.api as any).raw({
      method: "answerWidgetQuery",
      payload: {
        widget_query_id: widgetQueryId,
        data: data ? String(data).slice(0, 1024) : undefined,
      },
    });
  } catch (err: any) {
    console.error("answerWidgetQuery error:", err.message || err);
    throw err;
  }
}

/**
 * Edits state data of an existing widget in a message.
 */
export async function editMessageWidgetData(
  bot: Bot<MyContext>,
  params: {
    chatId?: number | string;
    messageId?: number;
    inlineMessageId?: string;
    publicData?: string;
    chatData?: string;
  }
) {
  try {
    const raw = bot.api.raw as any;
    if (typeof raw.editMessageWidgetData === "function") {
      return await raw.editMessageWidgetData({
        chat_id: params.chatId,
        message_id: params.messageId,
        inline_message_id: params.inlineMessageId,
        public_data: params.publicData,
        chat_data: params.chatData,
      });
    }

    return await (bot.api as any).raw({
      method: "editMessageWidgetData",
      payload: {
        chat_id: params.chatId,
        message_id: params.messageId,
        inline_message_id: params.inlineMessageId,
        public_data: params.publicData,
        chat_data: params.chatData,
      },
    });
  } catch (err: any) {
    console.error("editMessageWidgetData error:", err.message || err);
    throw err;
  }
}

/**
 * Sends an ephemeral message visible ONLY to the user who pressed the button.
 * Uses Telegram Bot API 10.4 ephemeral_message_parameters.
 */
export async function sendEphemeralReply(
  bot: Bot<MyContext>,
  callbackQueryId: string,
  text: string,
  options?: {
    chatId?: number | string;
    parseMode?: "HTML" | "MarkdownV2";
    replaceMessage?: boolean;
    replyMarkup?: any;
  }
) {
  try {
    const raw = bot.api.raw as any;
    return await raw.sendMessage({
      chat_id: options?.chatId,
      text,
      parse_mode: options?.parseMode ?? "HTML",
      ephemeral_message_parameters: {
        callback_query_id: callbackQueryId,
        replace_callback_query_message: options?.replaceMessage ?? false,
      },
      reply_markup: options?.replyMarkup,
    });
  } catch (err: any) {
    console.warn("sendEphemeralReply failed, gracefully falling back to standard reply:", err.message || err);
    if (options?.chatId) {
      return await bot.api.sendMessage(options.chatId, text, {
        parse_mode: options?.parseMode ?? "HTML",
        reply_markup: options?.replyMarkup,
      });
    }
  }
}

/**
 * Creates an InlineKeyboardButton with Bot API 10.4 disabled state.
 */
export function makeDisabledButton(text: string, callbackData = "noop") {
  return {
    text,
    callback_data: callbackData,
    disabled: {},
  };
}
