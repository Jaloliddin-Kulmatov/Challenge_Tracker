import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/lib/db/client";
import { handleUpdate } from "@/lib/services/telegram-bot";
import { telegramApi, type TelegramUpdate } from "@/lib/telegram";

export const dynamic = "force-dynamic";

/** Telegram proves a call is its own by echoing the secret we gave it in this header. */
function fromTelegram(req: Request): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("x-telegram-bot-api-secret-token") ?? "");
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!fromTelegram(req)) return Response.json({ status: "unauthorized" }, { status: 401 });
  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  if (!update || typeof update.update_id !== "number") return Response.json({ status: "bad_request" }, { status: 400 });
  const now = process.env.E2E_FIXED_NOW ? new Date(process.env.E2E_FIXED_NOW) : new Date();
  await handleUpdate(getDb(), telegramApi, update, now); // never throws
  return Response.json({ status: "ok" });
}
