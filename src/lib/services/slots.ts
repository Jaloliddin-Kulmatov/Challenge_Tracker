import { and, eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { compareDates, isValidISODate, type ISODate } from "@/lib/core/dates";
import { roundTo, stepFor } from "@/lib/core/schedule";
import { z } from "zod";
import { parseInput } from "@/lib/validation";
import { money } from "./bundle";
import { lockOwned, requireEditable } from "./challenges";
import type { Ctx } from "./context";
import { todayOf } from "./context";
import { recomputeDerived } from "./derived";
import { badState, invalid, notFound } from "./errors";

async function findOwnedSlot(ctx: Ctx, slotId: string) {
  const [row] = await ctx.db
    .select({ slot: s.scheduledActivities })
    .from(s.scheduledActivities)
    .innerJoin(s.challenges, eq(s.challenges.id, s.scheduledActivities.challengeId))
    .where(and(eq(s.scheduledActivities.id, slotId), eq(s.challenges.ownerId, ctx.user.id)))
    .limit(1);
  if (!row) throw notFound("That session");
  return row.slot;
}

async function withSlot<T>(ctx: Ctx, slotId: string, fn: (a: { tx: Parameters<Parameters<Ctx["db"]["transaction"]>[0]>[0]; ch: typeof s.challenges.$inferSelect; slot: typeof s.scheduledActivities.$inferSelect; today: ISODate; hasLogs: boolean }) => Promise<T>) {
  const found = await findOwnedSlot(ctx, slotId);
  const today = todayOf(ctx);
  return ctx.db.transaction(async (tx) => {
    const ch = await lockOwned(tx, ctx, found.challengeId);
    requireEditable(ch, "change its schedule");
    const [slot] = await tx.select().from(s.scheduledActivities).where(eq(s.scheduledActivities.id, slotId)).limit(1);
    if (!slot) throw notFound("That session");
    const logged = await tx.select({ id: s.activityLogs.id }).from(s.activityLogs).where(eq(s.activityLogs.scheduledActivityId, slotId)).limit(1);
    return fn({ tx, ch, slot, today, hasLogs: logged.length > 0 });
  });
}

const dateSchema = z.string().refine(isValidISODate, "Enter a valid date.");

/** Move a single-day session to another day (e.g. make up for a missed workout). */
export async function rescheduleSlot(ctx: Ctx, slotId: string, rawDate: unknown) {
  const date = parseInput(dateSchema, rawDate);
  return withSlot(ctx, slotId, async ({ tx, ch, slot, today, hasLogs }) => {
    if (slot.kind !== "session") throw badState("Only single-day sessions can be moved.");
    if (hasLogs) throw badState("This session already has activity logged against it. Delete or edit that activity instead.");
    if (compareDates(date, today) < 0) throw invalid("Sessions can only be moved to today or a later day.", { date: "Pick today or later." });
    if (compareDates(date, ch.startDate) < 0 || compareDates(date, ch.endDate) > 0)
      throw invalid(`Pick a day between ${ch.startDate} and ${ch.endDate}.`, { date: "Outside the challenge." });
    await tx
      .update(s.scheduledActivities)
      .set({ windowStart: date, windowEnd: date, isCustomized: true, status: "planned", updatedAt: new Date() })
      .where(eq(s.scheduledActivities.id, slotId));
    return recomputeDerived(tx, ch.id, today);
  });
}

export async function setSlotTarget(ctx: Ctx, slotId: string, rawValue: unknown) {
  const value = parseInput(z.number({ error: "Enter a number." }).finite().positive("Must be greater than zero.").max(1_000_000), rawValue);
  return withSlot(ctx, slotId, async ({ tx, ch, slot, today }) => {
    if (slot.kind === "total") throw badState("Change the overall target from the challenge's target settings.");
    if (compareDates(slot.windowEnd, today) < 0) throw badState("Past sessions are locked – they keep the target they had.");
    if (ch.trackingMethod === "completion") throw badState("Done / not-done challenges don't have numeric targets.");
    const v = roundTo(value, ch.valueDecimals);
    if (v < stepFor(ch.valueDecimals) - 1e-9) throw invalid("That target is too small.");
    await tx.update(s.scheduledActivities).set({ targetValue: money(v), isCustomized: true, updatedAt: new Date() }).where(eq(s.scheduledActivities.id, slotId));
    return recomputeDerived(tx, ch.id, today);
  });
}

/** Skip (excuse) a session – it no longer counts as missed or towards the target. */
export async function setSlotSkipped(ctx: Ctx, slotId: string, skipped: boolean) {
  return withSlot(ctx, slotId, async ({ tx, ch, slot, today, hasLogs }) => {
    if (slot.kind === "total") throw badState("An overall goal can't be skipped.");
    if (skipped && hasLogs) throw badState("This session already has activity logged against it.");
    await tx
      .update(s.scheduledActivities)
      .set({ status: skipped ? "skipped" : "planned", isCustomized: true, updatedAt: new Date() })
      .where(eq(s.scheduledActivities.id, slotId));
    return recomputeDerived(tx, ch.id, today);
  });
}

const extraSchema = z.object({
  date: dateSchema,
  target: z.number().finite().positive("Must be greater than zero.").max(1_000_000).optional(),
  label: z.string().trim().max(80).optional().nullable(),
});

/** Add an extra one-off session on a day the rules didn't schedule. */
export async function addExtraSession(ctx: Ctx, challengeId: string, raw: unknown) {
  const input = parseInput(extraSchema, raw);
  const today = todayOf(ctx);
  return ctx.db.transaction(async (tx) => {
    const ch = await lockOwned(tx, ctx, challengeId);
    requireEditable(ch, "change its schedule");
    if (compareDates(input.date, today) < 0) throw invalid("Extra sessions must be today or later.", { date: "Pick today or later." });
    if (compareDates(input.date, ch.startDate) < 0 || compareDates(input.date, ch.endDate) > 0)
      throw invalid(`Pick a day between ${ch.startDate} and ${ch.endDate}.`, { date: "Outside the challenge." });
    const target = ch.trackingMethod === "completion" ? 1 : roundTo(input.target ?? 0, ch.valueDecimals);
    if (target < stepFor(ch.valueDecimals) - 1e-9) throw invalid("Enter a target for the session.", { target: "Required." });
    await tx.insert(s.scheduledActivities).values({
      challengeId,
      kind: "session",
      windowStart: input.date,
      windowEnd: input.date,
      naturalStart: input.date,
      targetValue: money(target),
      isCustomized: true,
      label: input.label || null,
    });
    return recomputeDerived(tx, ch.id, today);
  });
}
