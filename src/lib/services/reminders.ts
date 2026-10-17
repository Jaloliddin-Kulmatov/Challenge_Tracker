import { and, eq } from "drizzle-orm";
import type { Mailer } from "@/lib/email";
import type { Db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { localDateIn, localTimeIn } from "@/lib/core/dates";
import { applyContent } from "@/lib/plan/content";
import { checkKey } from "@/lib/plan/logic";
import { composeReminder, reminderDue } from "@/lib/plan/reminder";
import { getTemplate } from "@/lib/plan/templates";
import { z } from "zod";
import { parseInput } from "@/lib/validation";
import type { Ctx } from "./context";
import { badState, invalid, notFound } from "./errors";

const KIND = "plan-daily";

export interface ReminderRun {
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
}

/**
 * Send every plan reminder that is due right now. Meant to be called every ~15 minutes: it is idempotent
 * (one email per user per local day) and catches up for a few hours if a run was missed.
 */
export async function sendDueReminders(db: Db, now: Date, send: Mailer, appUrl: string): Promise<ReminderRun> {
  const rows = await db
    .select({
      userId: s.user.id,
      email: s.user.email,
      timezone: s.user.timezone,
      reminderTime: s.notificationPreferences.reminderTime,
      planId: s.plans.id,
      templateKey: s.plans.templateKey,
      content: s.plans.content,
    })
    .from(s.notificationPreferences)
    .innerJoin(s.user, eq(s.user.id, s.notificationPreferences.userId))
    .innerJoin(s.plans, eq(s.plans.ownerId, s.user.id))
    .where(and(eq(s.notificationPreferences.dailyReminderEnabled, true), eq(s.notificationPreferences.channel, "email")));

  const run: ReminderRun = { considered: rows.length, sent: 0, skipped: 0, failed: 0 };
  for (const r of rows) {
    try {
      const base = getTemplate(r.templateKey);
      if (!base || !reminderDue(localTimeIn(now, r.timezone), r.reminderTime)) {
        run.skipped += 1;
        continue;
      }
      const today = localDateIn(now, r.timezone);
      const checks = await db.select().from(s.planChecks).where(eq(s.planChecks.planId, r.planId));
      const mail = composeReminder(applyContent(base, r.content), new Set(checks.map((c) => checkKey(c.taskKey, c.periodKey))), today, appUrl);
      if (!mail) {
        run.skipped += 1;
        continue;
      }
      // Claim first: whoever inserts the row sends the email, a concurrent run sees a conflict and skips.
      const claimed = await db.insert(s.reminderLog).values({ userId: r.userId, kind: KIND, localDate: today }).onConflictDoNothing().returning({ id: s.reminderLog.id });
      if (claimed.length === 0) {
        run.skipped += 1;
        continue;
      }
      try {
        await send({ to: r.email, subject: mail.subject, text: mail.text, html: mail.html });
        run.sent += 1;
      } catch (err) {
        // give the claim back so the next run retries
        await db.delete(s.reminderLog).where(eq(s.reminderLog.id, claimed[0]!.id));
        throw err;
      }
    } catch (err) {
      run.failed += 1;
      console.error("[reminder failed]", r.userId, err instanceof Error ? err.message : err);
    }
  }
  return run;
}

const settingSchema = z.object({
  enabled: z.boolean(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 23:30."),
});

/** One-tap switch for the plan's reminder email (keeps the weekly-summary choice). */
export async function setPlanReminder(ctx: Ctx, raw: unknown): Promise<void> {
  const input = parseInput(settingSchema, raw);
  const values = { dailyReminderEnabled: input.enabled, reminderTime: input.time, channel: "email" };
  await ctx.db
    .insert(s.notificationPreferences)
    .values({ userId: ctx.user.id, ...values })
    .onConflictDoUpdate({ target: s.notificationPreferences.userId, set: { ...values, updatedAt: new Date() } });
}

/** Send the signed-in user a reminder right now (so they can check email works). At most one a minute. */
export async function sendTestReminder(ctx: Ctx, send: Mailer, appUrl: string): Promise<{ email: string }> {
  const [u] = await ctx.db.select({ email: s.user.email }).from(s.user).where(eq(s.user.id, ctx.user.id)).limit(1);
  if (!u) throw notFound("Your account");
  const [plan] = await ctx.db.select().from(s.plans).where(eq(s.plans.ownerId, ctx.user.id)).limit(1);
  const base = plan && getTemplate(plan.templateKey);
  if (!plan || !base) throw notFound("Your plan");

  const today = localDateIn(ctx.now, ctx.user.timezone);
  const claimed = await ctx.db
    .insert(s.reminderLog)
    .values({ userId: ctx.user.id, kind: `test-${Math.floor(ctx.now.getTime() / 60_000)}`, localDate: today })
    .onConflictDoNothing()
    .returning({ id: s.reminderLog.id });
  if (claimed.length === 0) throw invalid("A test email was just sent. Wait a minute and try again.");

  const checks = await ctx.db.select().from(s.planChecks).where(eq(s.planChecks.planId, plan.id));
  const mail = composeReminder(applyContent(base, plan.content), new Set(checks.map((c) => checkKey(c.taskKey, c.periodKey))), today, appUrl);
  const body = mail ?? {
    subject: "Your plan reminder works",
    text: "This is a test. Nothing is open today (or the plan isn't running), so a real reminder would stay quiet.",
    html: "<p>This is a test. Nothing is open today (or the plan isn't running), so a real reminder would stay quiet.</p>",
  };
  try {
    await send({ to: u.email, subject: `[Test] ${body.subject}`, text: body.text, html: body.html });
  } catch (err) {
    await ctx.db.delete(s.reminderLog).where(eq(s.reminderLog.id, claimed[0]!.id));
    throw badState(`The email couldn't be sent: ${err instanceof Error ? err.message : "unknown error"}`);
  }
  return { email: u.email };
}
