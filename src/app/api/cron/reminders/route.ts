import { timingSafeEqual } from "node:crypto";
import { authBaseUrl } from "@/lib/auth/origins";
import { getDb } from "@/lib/db/client";
import { emailConfigured, sendEmail } from "@/lib/email";
import { sendDueReminders } from "@/lib/services/reminders";
import { sendDueTelegramReminders } from "@/lib/services/telegram";
import { ensureWebhook, telegramApi, telegramConfigured } from "@/lib/telegram";

export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const given = req.headers.get("authorization") ?? "";
  const want = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Called every ~15 minutes by a scheduler (GitHub Actions, see .github/workflows/reminders.yml) with
 * `Authorization: Bearer $CRON_SECRET`. Sends the email and Telegram reminders that are due and keeps the Telegram
 * webhook pointed at this app; safe to call as often as you like.
 */
async function handle(req: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return Response.json({ status: "cron_secret_missing", hint: "Set CRON_SECRET in the environment and redeploy." }, { status: 503 });
  }
  if (!authorized(req)) return Response.json({ status: "unauthorized" }, { status: 401 });
  const email = emailConfigured();
  const telegram = telegramConfigured();
  if (!email && !telegram) {
    return Response.json({ status: "nothing_configured", hint: "Set RESEND_API_KEY (email) and/or TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME and TELEGRAM_WEBHOOK_SECRET (Telegram)." }, { status: 503 });
  }
  const now = process.env.E2E_FIXED_NOW ? new Date(process.env.E2E_FIXED_NOW) : new Date();
  const db = getDb();
  const result: Record<string, unknown> = { status: "ok" };
  if (email) result.email = await sendDueReminders(db, now, sendEmail, authBaseUrl());
  if (telegram) {
    try {
      await ensureWebhook(authBaseUrl());
    } catch (err) {
      result.webhook = err instanceof Error ? err.message : "failed";
    }
    result.telegram = await sendDueTelegramReminders(db, now, telegramApi);
  }
  return Response.json(result);
}

export const GET = handle;
export const POST = handle;
