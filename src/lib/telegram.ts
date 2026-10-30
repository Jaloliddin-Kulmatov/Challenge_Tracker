import "server-only";

/** Telegram Bot API, just the calls the app needs. Injectable so tests never touch the network. */
export interface InlineButton {
  text: string;
  callback_data: string;
}
export type Keyboard = InlineButton[][];

export interface TelegramApi {
  /** `forceReply` makes Telegram open the reply box, so the next message answers this one. */
  sendMessage(chatId: string, text: string, keyboard?: Keyboard, forceReply?: boolean): Promise<void>;
  editMessage(chatId: string, messageId: number, text: string, keyboard?: Keyboard): Promise<void>;
  answerCallback(callbackId: string, text?: string): Promise<void>;
}

/** The pieces of a Telegram update the bot reads. */
export interface TelegramUpdate {
  update_id: number;
  message?: { message_id: number; chat: { id: number; type: string }; from?: { id: number }; text?: string; reply_to_message?: { text?: string } };
  callback_query?: { id: string; from: { id: number }; message?: { message_id: number; chat: { id: number; type: string } }; data?: string };
}

export class TelegramError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type Env = Record<string, string | undefined>;

/** The bot needs its token, its @username (for the connect link) and a secret that proves a webhook call is Telegram's. */
export const telegramConfigured = (env: Env = process.env) =>
  Boolean(env.TELEGRAM_BOT_TOKEN?.trim() && env.TELEGRAM_BOT_USERNAME?.trim() && env.TELEGRAM_WEBHOOK_SECRET?.trim());

export const botUsername = (env: Env = process.env) => env.TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, "") ?? "";

async function call(method: string, body: Record<string, unknown>): Promise<unknown> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new Error("Telegram isn't configured (TELEGRAM_BOT_TOKEN is not set).");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    // The URL contains the token, so never echo it; Telegram's description ("bot was blocked by the user"…) is enough.
    const detail = (await res.json().catch(() => null)) as { description?: string } | null;
    throw new TelegramError(`Telegram ${method} failed (${res.status}): ${detail?.description ?? "no details"}`, res.status);
  }
  return res.json();
}

export const telegramApi: TelegramApi = {
  async sendMessage(chatId, text, keyboard, forceReply) {
    const markup = forceReply ? { force_reply: true } : keyboard && keyboard.length > 0 ? { inline_keyboard: keyboard } : undefined;
    await call("sendMessage", { chat_id: chatId, text, ...(markup && { reply_markup: markup }) });
  },
  async editMessage(chatId, messageId, text, keyboard) {
    await call("editMessageText", { chat_id: chatId, message_id: messageId, text, reply_markup: { inline_keyboard: keyboard ?? [] } });
  },
  async answerCallback(callbackId, text) {
    await call("answerCallbackQuery", { callback_query_id: callbackId, ...(text && { text }) });
  },
};

/** Point Telegram at this app. Idempotent, so it is safe to call on every cron run and after connecting. */
export async function ensureWebhook(appUrl: string): Promise<void> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret) return;
  // the menu that opens when typing "/"
  await call("setMyCommands", {
    commands: [
      { command: "today", description: "Today's tasks (tap to tick)" },
      { command: "timeline", description: "Today hour by hour" },
      { command: "week", description: "How this week is going" },
      { command: "untick", description: "Undo a tick" },
      { command: "add", description: "Add a daily task" },
      { command: "rename", description: "Rename a daily task" },
      { command: "remove", description: "Remove a daily task" },
      { command: "books", description: "Mark a book as finished" },
      { command: "weight", description: "Log this week's weight" },
      { command: "run", description: "Log this week's long run" },
      { command: "time", description: "Change the reminder time" },
      { command: "on", description: "Turn reminders on" },
      { command: "off", description: "Turn reminders off" },
      { command: "help", description: "What I can do" },
    ],
  });
  await call("setWebhook", {
    url: `${appUrl.replace(/\/$/, "")}/api/telegram/webhook`,
    secret_token: secret,
    allowed_updates: ["message", "callback_query"],
  });
}
