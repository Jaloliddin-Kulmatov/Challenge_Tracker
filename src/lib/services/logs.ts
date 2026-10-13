import { and, eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { instantFromLocal, localDateIn, localTimeIn, type ISODate } from "@/lib/core/dates";
import { chooseSlotForLog } from "@/lib/core/progress";
import { roundTo, stepFor } from "@/lib/core/schedule";
import { logInputSchema, parseInput, updateLogSchema } from "@/lib/validation";
import { loadBundles, money, num } from "./bundle";
import { lockOwned } from "./challenges";
import type { Ctx } from "./context";
import { todayOf } from "./context";
import { recomputeDerived } from "./derived";
import { badState, invalid, notFound } from "./errors";
import type { LogResult, LogView } from "./types";

type Challenge = typeof s.challenges.$inferSelect;

function assertLoggable(ch: Challenge) {
  if (ch.status === "archived") throw badState("This challenge is archived. Restore it to log activity.");
  if (ch.status === "completed") throw badState("This challenge is completed, so its history is locked.");
  if (ch.status === "paused") throw badState("This challenge is paused. Resume it to log activity.");
}

function validateDate(ch: Challenge, date: ISODate, today: ISODate) {
  if (date > today) throw invalid("You can't log activity in the future.", { localDate: "That date is in the future." });
  if (date < ch.startDate) throw invalid(`This challenge starts on ${ch.startDate}.`, { localDate: `Not before ${ch.startDate}.` });
  if (date > ch.endDate)
    throw invalid(`This challenge ended on ${ch.endDate}. Extend its end date to log later activity.`, { localDate: `Not after ${ch.endDate}.` });
}

function resolveValue(ch: Challenge, value: number | undefined): number {
  if (ch.trackingMethod === "completion") return 1;
  if (value === undefined) throw invalid("Enter how much you did.", { value: "Enter a value." });
  const v = roundTo(value, ch.valueDecimals);
  if (v < stepFor(ch.valueDecimals) - 1e-9) throw invalid("That value is too small.", { value: "Too small." });
  return v;
}

function resolveInstant(ctx: Ctx, date: ISODate, today: ISODate, time: string | undefined): Date {
  const tz = ctx.user.timezone;
  if (time) {
    const at = instantFromLocal(date, time, tz);
    if (at.getTime() > ctx.now.getTime()) throw invalid("That time is in the future.", { time: "In the future." });
    if (localDateIn(at, tz) === date) return at;
  }
  if (date === today) return ctx.now;
  return instantFromLocal(date, "12:00", tz);
}

function toView(row: typeof s.activityLogs.$inferSelect): LogView {
  return {
    id: row.id,
    value: num(row.value),
    localDate: row.localDate,
    time: localTimeIn(row.occurredAt, row.timezone),
    timezone: row.timezone,
    notes: row.notes,
    scheduledActivityId: row.scheduledActivityId,
  };
}

export async function createLog(ctx: Ctx, raw: unknown): Promise<LogResult> {
  const input = parseInput(logInputSchema, raw);
  const today = todayOf(ctx);

  return ctx.db.transaction(async (tx) => {
    const ch = await lockOwned(tx, ctx, input.challengeId);

    // Idempotency: a double tap / retried request returns the original log instead of creating another.
    if (input.clientRequestId) {
      const [dup] = await tx
        .select()
        .from(s.activityLogs)
        .where(and(eq(s.activityLogs.userId, ctx.user.id), eq(s.activityLogs.clientRequestId, input.clientRequestId)))
        .limit(1);
      if (dup) {
        const d = await recomputeDerived(tx, ch.id, today);
        return { log: toView(dup), deduplicated: true, reachedMilestones: [], newAchievements: [], progress: d.progress };
      }
    }

    assertLoggable(ch);
    const date = input.localDate ?? today;
    validateDate(ch, date, today);
    const value = resolveValue(ch, input.value);
    const occurredAt = resolveInstant(ctx, date, today, input.time);

    const bundle = (await loadBundles(tx, [ch.id])).get(ch.id)!;
    const achieved = new Map<string, number>();
    for (const l of bundle.logs) if (l.scheduledActivityId) achieved.set(l.scheduledActivityId, (achieved.get(l.scheduledActivityId) ?? 0) + l.value);
    const slots = bundle.slots.map((sl) => ({ ...(sl as typeof sl & { id: string }), achieved: achieved.get((sl as { id: string }).id) ?? 0 }));

    let slotId: string | null;
    if (input.scheduledActivityId) {
      const slot = slots.find((x) => x.id === input.scheduledActivityId);
      if (!slot) throw notFound("That scheduled session");
      if (slot.status !== "planned") throw badState("That session was skipped, so activity can't be logged against it.");
      if (date < slot.windowStart || date > slot.windowEnd)
        throw invalid(`That session is scheduled for ${slot.windowStart}, not ${date}.`, { localDate: "Doesn't match the session." });
      slotId = slot.id;
    } else {
      slotId = chooseSlotForLog(slots, date);
    }

    const [row] = await tx
      .insert(s.activityLogs)
      .values({
        challengeId: ch.id,
        userId: ctx.user.id,
        scheduledActivityId: slotId,
        value: money(value),
        unit: ch.unit,
        occurredAt,
        localDate: date,
        timezone: ctx.user.timezone,
        notes: input.notes || null,
        clientRequestId: input.clientRequestId ?? null,
      })
      .returning();

    const derived = await recomputeDerived(tx, ch.id, today);
    return {
      log: toView(row!),
      deduplicated: false,
      reachedMilestones: derived.reachedMilestones,
      newAchievements: derived.newAchievements,
      progress: derived.progress,
    };
  });
}

async function findOwnedLog(ctx: Ctx, logId: string) {
  const [row] = await ctx.db
    .select()
    .from(s.activityLogs)
    .where(and(eq(s.activityLogs.id, logId), eq(s.activityLogs.userId, ctx.user.id)))
    .limit(1);
  if (!row) throw notFound("That log entry");
  return row;
}

export async function updateLog(ctx: Ctx, raw: unknown): Promise<LogResult> {
  const input = parseInput(updateLogSchema, raw);
  const today = todayOf(ctx);
  const existing = await findOwnedLog(ctx, input.logId);

  return ctx.db.transaction(async (tx) => {
    const ch = await lockOwned(tx, ctx, existing.challengeId);
    assertLoggable(ch);
    const [current] = await tx.select().from(s.activityLogs).where(eq(s.activityLogs.id, input.logId)).limit(1).for("update");
    if (!current) throw notFound("That log entry");

    const date = input.localDate ?? current.localDate;
    validateDate(ch, date, today);
    const value = input.value !== undefined ? resolveValue(ch, input.value) : num(current.value);
    const dateChanged = date !== current.localDate;
    const occurredAt =
      input.time || dateChanged
        ? resolveInstant(ctx, date, today, input.time ?? (dateChanged ? undefined : localTimeIn(current.occurredAt, current.timezone)))
        : current.occurredAt;

    let slotId = current.scheduledActivityId;
    if (dateChanged) {
      const bundle = (await loadBundles(tx, [ch.id])).get(ch.id)!;
      const achieved = new Map<string, number>();
      for (const l of bundle.logs) if (l.scheduledActivityId && l.id !== current.id) achieved.set(l.scheduledActivityId, (achieved.get(l.scheduledActivityId) ?? 0) + l.value);
      slotId = chooseSlotForLog(
        bundle.slots.map((sl) => ({ ...(sl as typeof sl & { id: string }), achieved: achieved.get((sl as { id: string }).id) ?? 0 })),
        date,
      );
    }

    const [row] = await tx
      .update(s.activityLogs)
      .set({
        value: money(value),
        localDate: date,
        occurredAt,
        scheduledActivityId: slotId,
        notes: input.notes === undefined ? current.notes : input.notes || null,
        updatedAt: new Date(),
      })
      .where(eq(s.activityLogs.id, current.id))
      .returning();

    const derived = await recomputeDerived(tx, ch.id, today);
    return { log: toView(row!), deduplicated: false, reachedMilestones: derived.reachedMilestones, newAchievements: derived.newAchievements, progress: derived.progress };
  });
}

export async function deleteLog(ctx: Ctx, logId: string) {
  const existing = await findOwnedLog(ctx, logId);
  const today = todayOf(ctx);
  return ctx.db.transaction(async (tx) => {
    const ch = await lockOwned(tx, ctx, existing.challengeId);
    if (ch.status === "completed") throw badState("This challenge is completed, so its history is locked.");
    if (ch.status === "archived") throw badState("This challenge is archived. Restore it to change its history.");
    const res = await tx
      .delete(s.activityLogs)
      .where(and(eq(s.activityLogs.id, logId), eq(s.activityLogs.userId, ctx.user.id)))
      .returning({ id: s.activityLogs.id });
    if (res.length === 0) throw notFound("That log entry");
    return recomputeDerived(tx, ch.id, today);
  });
}
