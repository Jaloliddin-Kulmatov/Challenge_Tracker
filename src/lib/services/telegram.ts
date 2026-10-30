import { createHash, randomBytes } from "node:crypto";
import { eq, lt } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { localDateIn, localTimeIn } from "@/lib/core/dates";
import { applyContent } from "@/lib/plan/content";
import { checkKey } from "@/lib/plan/logic";
import { composeTelegram, reminderDue } from "@/lib/plan/reminder";
import { getTemplate } from "@/lib/plan/templates";
import { TelegramError, type TelegramApi } from "@/lib/telegram";
import { parseInput } from "@/lib/validation";
import type { Ctx } from "./context";
import { badState } from "./errors";

const KIND = "plan-daily-telegram";
const TOKEN_TTL_MS = 15 * 60_000;
export const DEFAULT_TIME = "23:30";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

// ---------------------------------------------------------------------------
// Settings (the signed-in user, from the website)
// ---------------------------------------------------------------------------

export interface TelegramState {
  linked: boolean;
  enabled: boolean;
  time: string;
}

export async function getTelegramState(ctx: Ctx): Promise<TelegramState> {
  const [[link], [prefs]] = await Promise.all([
    ctx.db.select().from(s.telegramLinks).where(eq(s.telegramLinks.userId, ctx.user.id)).limit(1),
    ctx.db.select().from(s.notificationPreferences).where(eq(s.notificationPreferences.userId, ctx.user.id)).limit(1),
  ]);
  return { linked: Boolean(link), enabled: Boolean(link) && (prefs?.telegramEnabled ?? false), time: prefs?.reminderTime ?? DEFAULT_TIME };
}

/** A one-time link that opens the bot with a code; pressing Start there connects this account. */
export async function createLinkToken(ctx: Ctx, username: string): Promise<{ url: string }> {
  const token = randomBytes(24).toString("base64url"); // 32 characters, which is what a /start payload allows
  await ctx.db.delete(s.telegramLinkTokens).where(eq(s.telegramLinkTokens.userId, ctx.user.id));
  await ctx.db.delete(s.telegramLinkTokens).where(lt(s.telegramLinkTokens.expiresAt, ctx.now));
  await ctx.db.insert(s.telegramLinkTokens).values({ tokenHash: hash(token), userId: ctx.user.id, expiresAt: new Date(ctx.now.getTime() + TOKEN_TTL_MS) });
  return { url: `https://t.me/${username}?start=${token}` };
}

const settingSchema = z.object({
  enabled: z.boolean(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 23:30."),
});

/** Turn the Telegram reminder on/off and choose its time (shared with the email reminder). */
export async function setTelegramReminder(ctx: Ctx, raw: unknown): Promise<void> {
  const input = parseInput(settingSchema, raw);
  const [link] = await ctx.db.select({ id: s.telegramLinks.userId }).from(s.telegramLinks).where(eq(s.telegramLinks.userId, ctx.user.id)).limit(1);
  if (!link) throw badState("Connect Telegram first.");
  const values = { telegramEnabled: input.enabled, reminderTime: input.time };
  await ctx.db
    .insert(s.notificationPreferences)
    .values({ userId: ctx.user.id, ...values })
    .onConflictDoUpdate({ target: s.notificationPreferences.userId, set: { ...values, updatedAt: new Date() } });
}

export async function disconnectTelegram(ctx: Ctx): Promise<void> {
  await ctx.db.delete(s.telegramLinks).where(eq(s.telegramLinks.userId, ctx.user.id));
  await ctx.db.delete(s.telegramLinkTokens).where(eq(s.telegramLinkTokens.userId, ctx.user.id));
  await ctx.db.update(s.notificationPreferences).set({ telegramEnabled: false, updatedAt: new Date() }).where(eq(s.notificationPreferences.userId, ctx.user.id));
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

export async function loadDay(db: Db, userId: string, now: Date) {
  const [row] = await db
    .select({ timezone: s.user.timezone, planId: s.plans.id, templateKey: s.plans.templateKey, content: s.plans.content })
    .from(s.user)
    .leftJoin(s.plans, eq(s.plans.ownerId, s.user.id))
    .where(eq(s.user.id, userId))
    .limit(1);
  const base = row?.templateKey ? getTemplate(row.templateKey) : null;
  if (!row || !row.planId || !base) return null;
  const checks = await db.select().from(s.planChecks).where(eq(s.planChecks.planId, row.planId));
  return {
    timezone: row.timezone,
    today: localDateIn(now, row.timezone),
    t: applyContent(base, row.content),
    checks: new Set(checks.map((c) => checkKey(c.taskKey, c.periodKey))),
  };
}

/** Send the day's message to the user's chat. Returns false when there is nothing to say. */
export async function sendDay(db: Db, api: TelegramApi, userId: string, chatId: string, now: Date): Promise<boolean> {
  const day = await loadDay(db, userId, now);
  const msg = day && composeTelegram(day.t, day.checks, day.today);
  if (!msg) return false;
  await api.sendMessage(chatId, msg.text, msg.keyboard);
  return true;
}

/** "Send me a test message": today's tasks right now. */
export async function sendTelegramTest(ctx: Ctx, api: TelegramApi): Promise<void> {
  const [link] = await ctx.db.select().from(s.telegramLinks).where(eq(s.telegramLinks.userId, ctx.user.id)).limit(1);
  if (!link) throw badState("Connect Telegram first.");
  try {
    const sent = await sendDay(ctx.db, api, ctx.user.id, link.chatId, ctx.now);
    if (!sent) await api.sendMessage(link.chatId, "✅ Telegram is connected. There is nothing to tick today (the plan isn't running).");
  } catch (err) {
    throw badState(`The message couldn't be sent: ${err instanceof Error ? err.message : "unknown error"}`);
  }
}

// ---------------------------------------------------------------------------
// Scheduled reminders (cron → Telegram)
// ---------------------------------------------------------------------------

export interface TelegramRun {
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
}

/** Message everyone whose Telegram reminder is due. Once per user per local day, like the email one. */
export async function sendDueTelegramReminders(db: Db, now: Date, api: TelegramApi): Promise<TelegramRun> {
  const rows = await db
    .select({ userId: s.user.id, timezone: s.user.timezone, chatId: s.telegramLinks.chatId, reminderTime: s.notificationPreferences.reminderTime })
    .from(s.telegramLinks)
    .innerJoin(s.user, eq(s.user.id, s.telegramLinks.userId))
    .innerJoin(s.notificationPreferences, eq(s.notificationPreferences.userId, s.user.id))
    .where(eq(s.notificationPreferences.telegramEnabled, true));

  const run: TelegramRun = { considered: rows.length, sent: 0, skipped: 0, failed: 0 };
  for (const r of rows) {
    try {
      if (!reminderDue(localTimeIn(now, r.timezone), r.reminderTime)) {
        run.skipped += 1;
        continue;
      }
      const day = await loadDay(db, r.userId, now);
      const msg = day && composeTelegram(day.t, day.checks, day.today);
      if (!day || !msg || msg.keyboard.length === 0) {
        run.skipped += 1;
        continue;
      }
      const claimed = await db.insert(s.reminderLog).values({ userId: r.userId, kind: KIND, localDate: day.today }).onConflictDoNothing().returning({ id: s.reminderLog.id });
      if (claimed.length === 0) {
        run.skipped += 1;
        continue;
      }
      try {
        await api.sendMessage(r.chatId, msg.text, msg.keyboard);
        run.sent += 1;
      } catch (err) {
        await db.delete(s.reminderLog).where(eq(s.reminderLog.id, claimed[0]!.id));
        if (err instanceof TelegramError && err.status === 403) {
          // the person blocked the bot or deleted the chat: stop trying
          await db.delete(s.telegramLinks).where(eq(s.telegramLinks.userId, r.userId));
          await db.update(s.notificationPreferences).set({ telegramEnabled: false }).where(eq(s.notificationPreferences.userId, r.userId));
          run.skipped += 1;
          continue;
        }
        throw err;
      }
    } catch (err) {
      run.failed += 1;
      console.error("[telegram reminder failed]", r.userId, err instanceof Error ? err.message : err);
    }
  }
  return run;
}
