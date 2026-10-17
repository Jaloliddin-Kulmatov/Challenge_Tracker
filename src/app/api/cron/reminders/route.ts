import { timingSafeEqual } from "node:crypto";
import { authBaseUrl } from "@/lib/auth/origins";
import { getDb } from "@/lib/db/client";
import { sendEmail } from "@/lib/email";
import { sendDueReminders } from "@/lib/services/reminders";

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
 * `Authorization: Bearer $CRON_SECRET`. Sends the plan reminders that are due; safe to call as often as you like.
 */
async function handle(req: Request) {
  if (!process.env.CRON_SECRET?.trim()) {
    return Response.json({ status: "cron_secret_missing", hint: "Set CRON_SECRET in the environment and redeploy." }, { status: 503 });
  }
  if (!authorized(req)) return Response.json({ status: "unauthorized" }, { status: 401 });
  if (!process.env.RESEND_API_KEY?.trim()) {
    return Response.json({ status: "email_not_configured", hint: "Set RESEND_API_KEY to send reminder emails." }, { status: 503 });
  }
  const now = process.env.E2E_FIXED_NOW ? new Date(process.env.E2E_FIXED_NOW) : new Date();
  const result = await sendDueReminders(getDb(), now, sendEmail, authBaseUrl());
  return Response.json({ status: "ok", ...result });
}

export const GET = handle;
export const POST = handle;
