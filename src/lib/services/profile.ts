import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { notificationSchema, parseInput, profileSchema } from "@/lib/validation";
import { loadBundles } from "./bundle";
import type { Ctx } from "./context";
import { notFound } from "./errors";

/**
 * Changing time zone only affects what counts as "today" from now on.
 * Logged activity keeps the local date it was recorded with, and schedules are plain calendar dates,
 * so nothing already recorded moves.
 */
export async function updateProfile(ctx: Ctx, raw: unknown) {
  const input = parseInput(profileSchema, raw);
  const res = await ctx.db
    .update(s.user)
    .set({ name: input.name, timezone: input.timezone, updatedAt: new Date() })
    .where(eq(s.user.id, ctx.user.id))
    .returning({ id: s.user.id });
  if (res.length === 0) throw notFound("Your account");
}

export interface NotificationPrefs {
  dailyReminderEnabled: boolean;
  reminderTime: string;
  weeklySummaryEnabled: boolean;
  channel: "email" | "push" | "none";
}

export async function getNotificationPrefs(ctx: Ctx): Promise<NotificationPrefs> {
  const [row] = await ctx.db.select().from(s.notificationPreferences).where(eq(s.notificationPreferences.userId, ctx.user.id)).limit(1);
  return {
    dailyReminderEnabled: row?.dailyReminderEnabled ?? false,
    reminderTime: row?.reminderTime ?? "08:00",
    weeklySummaryEnabled: row?.weeklySummaryEnabled ?? false,
    channel: (row?.channel as NotificationPrefs["channel"]) ?? "email",
  };
}

export async function updateNotificationPrefs(ctx: Ctx, raw: unknown) {
  const input = parseInput(notificationSchema, raw);
  await ctx.db
    .insert(s.notificationPreferences)
    .values({ userId: ctx.user.id, ...input })
    .onConflictDoUpdate({ target: s.notificationPreferences.userId, set: { ...input, updatedAt: new Date() } });
}

/** Everything the user owns, as plain JSON (for the "download my data" feature). */
export async function exportUserData(ctx: Ctx) {
  const ids = (await ctx.db.select({ id: s.challenges.id }).from(s.challenges).where(eq(s.challenges.ownerId, ctx.user.id))).map((r) => r.id);
  const bundles = await loadBundles(ctx.db, ids);
  return {
    exportedAt: ctx.now.toISOString(),
    timezone: ctx.user.timezone,
    challenges: [...bundles.values()].map((b) => ({
      id: b.challenge.id,
      title: b.challenge.title,
      description: b.challenge.description,
      category: b.challenge.category,
      trackingMethod: b.challenge.trackingMethod,
      unit: b.challenge.unit,
      startDate: b.challenge.startDate,
      endDate: b.challenge.endDate,
      status: b.challenge.status,
      rules: b.rules,
      schedule: b.slots,
      pauses: b.pauses,
      logs: b.logs.map((l) => ({ id: l.id, value: l.value, unit: l.unit, localDate: l.localDate, occurredAt: l.occurredAt.toISOString(), timezone: l.timezone, notes: l.notes })),
    })),
  };
}
