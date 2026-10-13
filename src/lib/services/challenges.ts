import { and, count, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import type { Executor, Tx } from "@/lib/db/client";
import { addDays, compareDates, daysInclusive, diffDays, maxDate, minDate, type ISODate } from "@/lib/core/dates";
import { DEFAULT_MILESTONE_PERCENTS, defaultMilestoneTitle, milestoneThreshold } from "@/lib/core/milestones";
import { phaseOf, type SlotEvaluation } from "@/lib/core/progress";
import {
  generateSlots,
  normalizeRule,
  planScheduleChange,
  roundTo,
  ruleAt,
  snapEffectiveFrom,
  validateRule,
  type ExistingSlot,
  type SchedulePlan,
} from "@/lib/core/schedule";
import type { TargetRule, TrackingMethod } from "@/lib/core/types";
import { changeRuleSchema, createChallengeSchema, datesSchema, endDateSchema, milestoneSchema, parseInput, updateDetailsSchema, type RuleInput } from "@/lib/validation";
import { loadBundles, currentRule, findOwnedChallenge, money, num, progressOf, type Bundle } from "./bundle";
import type { Ctx } from "./context";
import { todayOf } from "./context";
import { recomputeDerived } from "./derived";
import { AppError, badState, invalid, notFound } from "./errors";
import type { AchievementView, ChallengeDetail, ChallengeSummary, ChallengeView, DashboardData, LogView, MilestoneView } from "./types";
import { localTimeIn } from "@/lib/core/dates";
import { ACHIEVEMENT_TYPES, type AchievementType } from "@/lib/core/achievements";

export const MAX_CHALLENGES_PER_USER = 200;
export const MAX_DURATION_DAYS = 730;
const MAX_PAST_START_DAYS = 31;
const MAX_FUTURE_START_DAYS = 366;

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

export function toChallengeView(c: s.ChallengeRow): ChallengeView {
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    category: c.category,
    trackingMethod: c.trackingMethod,
    unit: c.unit,
    valueDecimals: c.valueDecimals,
    color: c.color,
    startDate: c.startDate,
    endDate: c.endDate,
    originalEndDate: c.originalEndDate,
    status: c.status,
    completedLocalDate: c.completedLocalDate,
    completedEarly: c.status !== "active" && c.completedLocalDate !== null && c.completedLocalDate < c.endDate,
  };
}

function toLogView(l: Bundle["logs"][number]): LogView {
  return {
    id: l.id,
    value: l.value,
    localDate: l.localDate,
    time: localTimeIn(l.occurredAt, l.timezone),
    timezone: l.timezone,
    notes: l.notes,
    scheduledActivityId: l.scheduledActivityId,
  };
}

function toMilestoneView(m: s.MilestoneRow, totalTarget: number): MilestoneView {
  const pct = m.thresholdPercent === null ? null : Number(m.thresholdPercent);
  const val = m.thresholdValue === null ? null : num(m.thresholdValue);
  return {
    id: m.id,
    title: m.title,
    thresholdPercent: pct,
    thresholdValue: val,
    resolvedValue: milestoneThreshold({ thresholdPercent: pct, thresholdValue: val }, totalTarget),
    isCustom: m.isCustom,
    reachedLocalDate: m.reachedLocalDate,
  };
}

function isAchievementType(t: string): t is AchievementType {
  return (ACHIEVEMENT_TYPES as readonly string[]).includes(t);
}

function toAchievementViews(rows: s.AchievementRow[], titles?: Map<string, string>): AchievementView[] {
  return rows
    .filter((a) => isAchievementType(a.type))
    .map((a) => ({
      type: a.type as AchievementType,
      earnedAt: a.earnedAt.toISOString(),
      challengeId: a.challengeId,
      challengeTitle: titles?.get(a.challengeId),
    }));
}

export function buildDetail(b: Bundle, today: ISODate): ChallengeDetail {
  const progress = progressOf(b, today);
  return {
    challenge: toChallengeView(b.challenge),
    progress,
    rules: b.rules,
    currentRule: currentRule(b, today),
    pauses: b.pauses,
    milestones: b.milestones.map((m) => toMilestoneView(m, progress.totalTarget)),
    achievements: toAchievementViews(b.achievements),
    shares: [],
    logs: [...b.logs].sort((a, c) => c.occurredAt.getTime() - a.occurredAt.getTime()).map(toLogView),
  };
}

function summarize(b: Bundle, today: ISODate): ChallengeSummary {
  const p = progressOf(b, today);
  const open = (e: SlotEvaluation) => e.state === "due";
  return {
    challenge: toChallengeView(b.challenge),
    phase: p.phase,
    today,
    goalPercent: p.goalPercent,
    goalPercentCapped: p.goalPercentCapped,
    totalLogged: p.totalLogged,
    totalTarget: p.totalTarget,
    pace: p.pace,
    streak: p.streak,
    adherencePercent: p.adherencePercent,
    daysRemaining: p.daysRemaining,
    daysUntilStart: p.daysUntilStart,
    targetReached: p.targetReached,
    rule: currentRule(b, today),
    due: p.phase === "running" ? p.slots.filter(open) : [],
    doneToday: p.phase === "running" ? p.slots.filter((e) => e.state === "completed" && e.windowStart <= today && today <= e.windowEnd) : [],
    next: p.slots.find((e) => e.state === "upcoming") ?? null,
  };
}

// ---------------------------------------------------------------------------
// Rule helpers
// ---------------------------------------------------------------------------

function buildRule(input: RuleInput, effectiveFrom: ISODate, tracking: TrackingMethod, decimals: number): TargetRule {
  const r = (v: number | null | undefined) => (v === null || v === undefined ? null : roundTo(v, decimals));
  const weekdayTargets = input.weekdayTargets
    ? Object.fromEntries(Object.entries(input.weekdayTargets).map(([k, v]) => [k, roundTo(v, decimals)]))
    : null;
  const rule = normalizeRule(
    {
      effectiveFrom,
      frequency: input.frequency,
      weekdays: input.weekdays ?? [],
      sessionTarget: r(input.sessionTarget),
      weeklyTarget: r(input.weeklyTarget),
      weekdayTargets,
      totalTarget: r(input.totalTarget),
    },
    tracking,
  );
  const problems = validateRule(rule, decimals, tracking);
  if (problems.length > 0) throw invalid(problems[0]!, { rule: problems[0]! });
  return rule;
}

async function insertRule(tx: Executor, challengeId: string, rule: TargetRule) {
  await tx.insert(s.challengeConfigurations).values({
    challengeId,
    effectiveFrom: rule.effectiveFrom,
    frequency: rule.frequency,
    weekdays: rule.weekdays,
    sessionTarget: rule.sessionTarget === null ? null : money(rule.sessionTarget),
    weeklyTarget: rule.weeklyTarget === null ? null : money(rule.weeklyTarget),
    weekdayTargets: rule.weekdayTargets,
    totalTarget: rule.totalTarget === null ? null : money(rule.totalTarget),
  });
}

export function existingSlots(b: Bundle): ExistingSlot[] {
  const logged = new Set(b.logs.map((l) => l.scheduledActivityId).filter((x): x is string => !!x));
  return b.slots.map((sl) => ({ ...sl, hasLogs: logged.has((sl as { id: string }).id) })) as ExistingSlot[];
}

async function applyPlan(tx: Executor, challengeId: string, plan: SchedulePlan) {
  if (plan.deleteIds.length > 0) await tx.delete(s.scheduledActivities).where(inArray(s.scheduledActivities.id, plan.deleteIds));
  for (const u of plan.update) {
    await tx
      .update(s.scheduledActivities)
      .set({
        ...(u.windowEnd !== undefined ? { windowEnd: u.windowEnd } : {}),
        ...(u.targetValue !== undefined ? { targetValue: money(u.targetValue) } : {}),
        updatedAt: new Date(),
      })
      .where(eq(s.scheduledActivities.id, u.id));
  }
  for (let i = 0; i < plan.insert.length; i += 400) {
    await tx.insert(s.scheduledActivities).values(
      plan.insert.slice(i, i + 400).map((p) => ({
        challengeId,
        kind: p.kind,
        windowStart: p.windowStart,
        windowEnd: p.windowEnd,
        naturalStart: p.windowStart,
        targetValue: money(p.targetValue),
      })),
    );
  }
}

export async function lockOwned(tx: Tx, ctx: Ctx, id: string) {
  const row = await findOwnedChallenge(tx, ctx.user.id, id, { lock: true });
  if (!row) throw notFound("That challenge");
  return row;
}

export async function loadOwnedBundle(tx: Executor, ctx: Ctx, id: string): Promise<Bundle> {
  const b = (await loadBundles(tx, [id])).get(id);
  if (!b || b.challenge.ownerId !== ctx.user.id) throw notFound("That challenge");
  return b;
}

export function requireEditable(c: s.ChallengeRow, verb: string) {
  if (c.status === "completed") throw badState(`This challenge is completed, so you can't ${verb}.`);
  if (c.status === "archived") throw badState(`This challenge is archived. Restore it before you ${verb}.`);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createChallenge(ctx: Ctx, raw: unknown): Promise<{ id: string }> {
  const input = parseInput(createChallengeSchema, raw);
  const today = todayOf(ctx);
  const tracking = input.trackingMethod;
  const unit = tracking === "quantity" ? (input.unit?.trim() || null) : null;
  if (tracking === "quantity" && !unit) throw invalid("Choose a unit, such as km, pages or minutes.", { unit: "Choose a unit." });
  const decimals = tracking === "completion" ? 0 : input.valueDecimals;

  if (compareDates(input.endDate, input.startDate) < 0) throw invalid("The end date must be on or after the start date.", { endDate: "Must be on or after the start date." });
  const duration = daysInclusive(input.startDate, input.endDate);
  if (duration > MAX_DURATION_DAYS) throw invalid(`Challenges can last up to ${MAX_DURATION_DAYS} days.`, { endDate: "That is too long." });
  if (diffDays(input.startDate, today) > MAX_PAST_START_DAYS) throw invalid(`The start date can be at most ${MAX_PAST_START_DAYS} days in the past.`, { startDate: "Too far in the past." });
  if (diffDays(today, input.startDate) > MAX_FUTURE_START_DAYS) throw invalid("The start date is too far in the future.", { startDate: "Too far in the future." });

  const rule = buildRule(input.rule, input.startDate, tracking, decimals);
  const planned = generateSlots([rule], input.startDate, input.endDate, decimals);
  if (planned.length === 0) throw invalid("That schedule has no sessions between the start and end dates. Pick other days or a longer range.", { rule: "No sessions in this date range." });

  return ctx.db.transaction(async (tx) => {
    const [owned] = await tx.select({ n: count() }).from(s.challenges).where(eq(s.challenges.ownerId, ctx.user.id));
    if ((owned?.n ?? 0) >= MAX_CHALLENGES_PER_USER) throw badState("You've reached the maximum number of challenges. Delete or archive some first.");

    const [row] = await tx
      .insert(s.challenges)
      .values({
        ownerId: ctx.user.id,
        title: input.title,
        description: input.description || null,
        category: input.category,
        trackingMethod: tracking,
        unit,
        valueDecimals: decimals,
        color: input.color,
        startDate: input.startDate,
        endDate: input.endDate,
        originalEndDate: input.endDate,
      })
      .returning({ id: s.challenges.id });
    const id = row!.id;

    await insertRule(tx, id, rule);
    await applyPlan(tx, id, { deleteIds: [], update: [], insert: planned });
    await tx.insert(s.milestones).values([
      ...DEFAULT_MILESTONE_PERCENTS.map((p) => ({ challengeId: id, title: defaultMilestoneTitle(p), thresholdPercent: String(p) })),
      ...input.customMilestones.map((m) => ({ challengeId: id, title: m.title, thresholdValue: money(roundTo(m.thresholdValue, decimals)), isCustom: true })),
    ]);
    await recomputeDerived(tx, id, today);
    return { id };
  });
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getChallengeDetail(ctx: Ctx, id: string): Promise<ChallengeDetail | null> {
  const owned = await findOwnedChallenge(ctx.db, ctx.user.id, id);
  if (!owned) return null;
  const b = (await loadBundles(ctx.db, [id])).get(id);
  if (!b) return null;
  const detail = buildDetail(b, todayOf(ctx));
  const shares = await ctx.db.select().from(s.challengeShares).where(eq(s.challengeShares.challengeId, id)).orderBy(desc(s.challengeShares.createdAt));
  detail.shares = shares
    .filter((sh) => !sh.revokedAt)
    .map((sh) => ({ id: sh.id, token: sh.token, showNotes: sh.showNotes, expiresAt: sh.expiresAt?.toISOString() ?? null, revokedAt: null }));
  return detail;
}

export async function listChallengeSummaries(ctx: Ctx, opts: { includeArchived?: boolean } = {}): Promise<ChallengeSummary[]> {
  const rows = await ctx.db
    .select({ id: s.challenges.id })
    .from(s.challenges)
    .where(opts.includeArchived ? eq(s.challenges.ownerId, ctx.user.id) : and(eq(s.challenges.ownerId, ctx.user.id), ne(s.challenges.status, "archived")))
    .orderBy(desc(s.challenges.createdAt));
  const bundles = await loadBundles(ctx.db, rows.map((r) => r.id));
  const today = todayOf(ctx);
  return rows.map((r) => summarize(bundles.get(r.id)!, today));
}

export async function getDashboard(ctx: Ctx): Promise<DashboardData> {
  const challenges = await listChallengeSummaries(ctx);
  const achievements = await ctx.db
    .select({ a: s.achievements, title: s.challenges.title })
    .from(s.achievements)
    .innerJoin(s.challenges, eq(s.challenges.id, s.achievements.challengeId))
    .where(eq(s.achievements.userId, ctx.user.id))
    .orderBy(desc(s.achievements.earnedAt))
    .limit(6);
  return {
    today: todayOf(ctx),
    timezone: ctx.user.timezone,
    challenges,
    recentAchievements: toAchievementViews(achievements.map((r) => r.a), new Map(achievements.map((r) => [r.a.challengeId, r.title]))),
  };
}

// ---------------------------------------------------------------------------
// Edit: details, rules, dates
// ---------------------------------------------------------------------------

export async function updateChallengeDetails(ctx: Ctx, id: string, raw: unknown) {
  const input = parseInput(updateDetailsSchema, raw);
  await ctx.db.transaction(async (tx) => {
    await lockOwned(tx, ctx, id);
    await tx
      .update(s.challenges)
      .set({ title: input.title, description: input.description || null, category: input.category, color: input.color, updatedAt: new Date() })
      .where(eq(s.challenges.id, id));
  });
}

/**
 * Change the target rules from a given date onwards. History before that date is never rewritten:
 * a new versioned rule is added, and only still-open, un-customised future slots are regenerated.
 */
export async function changeTargetRule(ctx: Ctx, id: string, raw: unknown) {
  const input = parseInput(changeRuleSchema, raw);
  const today = todayOf(ctx);
  return ctx.db.transaction(async (tx) => {
    const ch = await lockOwned(tx, ctx, id);
    requireEditable(ch, "change its targets");
    const b = await loadOwnedBundle(tx, ctx, id);
    const started = compareDates(today, ch.startDate) >= 0;
    const tracking = ch.trackingMethod;

    if (!started) {
      // Not started yet: nothing has happened, so the whole plan can simply be replaced.
      const rule = buildRule(input.rule, ch.startDate, tracking, ch.valueDecimals);
      const planned = generateSlots([rule], ch.startDate, ch.endDate, ch.valueDecimals);
      if (planned.length === 0) throw invalid("That schedule has no sessions between the start and end dates.", { rule: "No sessions in this date range." });
      await tx.delete(s.challengeConfigurations).where(eq(s.challengeConfigurations.challengeId, id));
      await insertRule(tx, id, rule);
      await tx.delete(s.scheduledActivities).where(eq(s.scheduledActivities.challengeId, id));
      await applyPlan(tx, id, { deleteIds: [], update: [], insert: planned });
      return recomputeDerived(tx, id, today);
    }

    const requested = maxDate(input.effectiveFrom ?? today, today);
    if (input.effectiveFrom && compareDates(input.effectiveFrom, today) < 0)
      throw invalid("Targets can only be changed from today onwards – past sessions keep the target they had.", { effectiveFrom: "Pick today or a later date." });

    const probe = buildRule(input.rule, requested, tracking, ch.valueDecimals);
    const previous = ruleAt(b.rules, requested);
    if ((probe.frequency === "total") !== (previous?.frequency === "total"))
      throw badState("An overall-goal schedule can't be switched to or from a day-by-day schedule once the challenge has started. Create a new challenge instead.");

    const effectiveFrom = probe.frequency === "total" ? requested : snapEffectiveFrom(b.rules, probe, requested);
    if (compareDates(effectiveFrom, ch.endDate) > 0) throw invalid("That change would only start after the challenge ends.", { effectiveFrom: "After the end date." });
    const rule: TargetRule = { ...probe, effectiveFrom };

    // The new rule replaces anything already scheduled from that date onwards.
    const kept = b.rules.filter((r) => compareDates(r.effectiveFrom, effectiveFrom) < 0);
    await tx.delete(s.challengeConfigurations).where(and(eq(s.challengeConfigurations.challengeId, id), inArray(s.challengeConfigurations.effectiveFrom, b.rules.filter((r) => compareDates(r.effectiveFrom, effectiveFrom) >= 0).map((r) => r.effectiveFrom))));
    await insertRule(tx, id, rule);

    const plan = planScheduleChange({ existing: existingSlots(b), rules: [...kept, rule], newEnd: ch.endDate, regenerateFrom: effectiveFrom, decimals: ch.valueDecimals });
    await applyPlan(tx, id, plan);
    await tx.update(s.challenges).set({ updatedAt: new Date() }).where(eq(s.challenges.id, id));
    return recomputeDerived(tx, id, today);
  });
}

/** Move the end date (lengthen or shorten the challenge). Existing history is preserved. */
export async function changeEndDate(ctx: Ctx, id: string, rawEnd: unknown) {
  const newEnd = parseInput(endDateSchema, rawEnd);
  const today = todayOf(ctx);
  return ctx.db.transaction(async (tx) => {
    const ch = await lockOwned(tx, ctx, id);
    requireEditable(ch, "change its length");
    const b = await loadOwnedBundle(tx, ctx, id);
    if (compareDates(newEnd, ch.startDate) < 0) throw invalid("The end date can't be before the start date.", { endDate: "Before the start date." });
    if (daysInclusive(ch.startDate, newEnd) > MAX_DURATION_DAYS) throw invalid(`Challenges can last up to ${MAX_DURATION_DAYS} days.`, { endDate: "That is too long." });
    const lastLog = b.logs.reduce<ISODate | null>((m, l) => (m === null || l.localDate > m ? l.localDate : m), null);
    if (lastLog && compareDates(newEnd, lastLog) < 0)
      throw invalid(`You have activity logged on ${lastLog}. The end date can't be earlier than that.`, { endDate: `Not before ${lastLog}.` });
    if (newEnd === ch.endDate) return recomputeDerived(tx, id, today);

    const plan = planScheduleChange({
      existing: existingSlots(b),
      rules: b.rules,
      newEnd,
      regenerateFrom: addDays(minDate(ch.endDate, newEnd), 1),
      decimals: ch.valueDecimals,
    });
    await applyPlan(tx, id, plan);
    await tx.update(s.challenges).set({ endDate: newEnd, updatedAt: new Date() }).where(eq(s.challenges.id, id));
    return recomputeDerived(tx, id, today);
  });
}

/** Before a challenge starts, its dates can be moved freely (the schedule is regenerated). */
export async function rescheduleUpcoming(ctx: Ctx, id: string, raw: unknown) {
  const { startDate, endDate } = parseInput(datesSchema, raw);
  const today = todayOf(ctx);
  return ctx.db.transaction(async (tx) => {
    const ch = await lockOwned(tx, ctx, id);
    requireEditable(ch, "change its dates");
    if (compareDates(today, ch.startDate) >= 0) throw badState("This challenge has already started. You can change its end date instead.");
    if (compareDates(endDate, startDate) < 0) throw invalid("The end date can't be before the start date.", { endDate: "Before the start date." });
    if (daysInclusive(startDate, endDate) > MAX_DURATION_DAYS) throw invalid(`Challenges can last up to ${MAX_DURATION_DAYS} days.`);
    if (compareDates(startDate, today) < 0) throw invalid("An upcoming challenge can't be moved into the past.", { startDate: "Pick today or later." });
    if (diffDays(today, startDate) > MAX_FUTURE_START_DAYS) throw invalid("The start date is too far in the future.", { startDate: "Too far in the future." });

    const b = await loadOwnedBundle(tx, ctx, id);
    const first = b.rules[0];
    if (!first) throw badState("This challenge has no schedule rules.");
    const rule: TargetRule = { ...first, effectiveFrom: startDate };
    const planned = generateSlots([rule], startDate, endDate, ch.valueDecimals);
    if (planned.length === 0) throw invalid("That schedule has no sessions between the start and end dates.");

    await tx.delete(s.challengeConfigurations).where(eq(s.challengeConfigurations.challengeId, id));
    await insertRule(tx, id, rule);
    await tx.delete(s.scheduledActivities).where(eq(s.scheduledActivities.challengeId, id));
    await applyPlan(tx, id, { deleteIds: [], update: [], insert: planned });
    await tx.update(s.challenges).set({ startDate, endDate, originalEndDate: endDate, updatedAt: new Date() }).where(eq(s.challenges.id, id));
    return recomputeDerived(tx, id, today);
  });
}

// ---------------------------------------------------------------------------
// Pause / resume / complete / archive / delete
// ---------------------------------------------------------------------------

export async function pauseChallenge(ctx: Ctx, id: string) {
  const today = todayOf(ctx);
  return ctx.db.transaction(async (tx) => {
    const ch = await lockOwned(tx, ctx, id);
    if (ch.status === "paused") throw badState("This challenge is already paused.");
    requireEditable(ch, "pause it");
    if (compareDates(today, ch.startDate) < 0) throw badState(`This challenge hasn't started yet – it begins on ${ch.startDate}.`);
    if (compareDates(today, ch.endDate) > 0) throw badState("This challenge has already ended, so there is nothing to pause.");
    await tx.insert(s.challengePauses).values({ challengeId: id, startDate: today });
    await tx.update(s.challenges).set({ status: "paused", updatedAt: new Date() }).where(eq(s.challenges.id, id));
    return recomputeDerived(tx, id, today);
  });
}

/**
 * Resume a paused challenge. The days spent paused are added to the end date so the user still
 * gets the full duration, and the schedule is extended to cover them.
 */
export async function resumeChallenge(ctx: Ctx, id: string) {
  const today = todayOf(ctx);
  return ctx.db.transaction(async (tx) => {
    const ch = await lockOwned(tx, ctx, id);
    if (ch.status !== "paused") throw badState("This challenge isn't paused.");
    const b = await loadOwnedBundle(tx, ctx, id);
    const open = b.pauses.find((p) => p.endDate === null);
    if (!open) throw badState("This challenge has no open pause.");

    const resumeOn = maxDate(today, open.startDate);
    const pausedDays = diffDays(open.startDate, resumeOn);
    const newEnd = addDays(ch.endDate, pausedDays);
    if (daysInclusive(ch.startDate, newEnd) > MAX_DURATION_DAYS) throw badState("Resuming would make the challenge longer than the maximum length.");

    if (pausedDays > 0) {
      const plan = planScheduleChange({
        existing: existingSlots(b),
        rules: b.rules,
        newEnd,
        regenerateFrom: addDays(ch.endDate, 1),
        decimals: ch.valueDecimals,
      });
      await applyPlan(tx, id, plan);
    }
    await tx.update(s.challengePauses).set({ endDate: resumeOn }).where(and(eq(s.challengePauses.challengeId, id), isNull(s.challengePauses.endDate)));
    await tx.update(s.challenges).set({ status: "active", endDate: newEnd, updatedAt: new Date() }).where(eq(s.challenges.id, id));
    return recomputeDerived(tx, id, today);
  });
}

/** Finish the challenge (early, on time or late). Remaining future sessions simply stop counting. */
export async function completeChallenge(ctx: Ctx, id: string) {
  const today = todayOf(ctx);
  return ctx.db.transaction(async (tx) => {
    const ch = await lockOwned(tx, ctx, id);
    if (ch.status === "completed") throw badState("This challenge is already completed.");
    requireEditable(ch, "complete it");
    if (compareDates(today, ch.startDate) < 0) throw badState(`This challenge hasn't started yet – it begins on ${ch.startDate}.`);
    if (ch.status === "paused") {
      await tx.update(s.challengePauses).set({ endDate: today }).where(and(eq(s.challengePauses.challengeId, id), isNull(s.challengePauses.endDate)));
    }
    await tx
      .update(s.challenges)
      .set({ status: "completed", completedAt: ctx.now, completedLocalDate: today, updatedAt: new Date() })
      .where(eq(s.challenges.id, id));
    return recomputeDerived(tx, id, today);
  });
}

export async function archiveChallenge(ctx: Ctx, id: string) {
  await ctx.db.transaction(async (tx) => {
    const ch = await lockOwned(tx, ctx, id);
    if (ch.status === "archived") return;
    await tx.update(s.challenges).set({ status: "archived", updatedAt: new Date() }).where(eq(s.challenges.id, id));
  });
}

export async function restoreChallenge(ctx: Ctx, id: string) {
  await ctx.db.transaction(async (tx) => {
    const ch = await lockOwned(tx, ctx, id);
    if (ch.status !== "archived") throw badState("This challenge isn't archived.");
    const b = await loadOwnedBundle(tx, ctx, id);
    const status = ch.completedAt ? "completed" : b.pauses.some((p) => p.endDate === null) ? "paused" : "active";
    await tx.update(s.challenges).set({ status, updatedAt: new Date() }).where(eq(s.challenges.id, id));
  });
}

export async function deleteChallenge(ctx: Ctx, id: string) {
  await ctx.db.transaction(async (tx) => {
    await lockOwned(tx, ctx, id);
    await tx.delete(s.challenges).where(and(eq(s.challenges.id, id), eq(s.challenges.ownerId, ctx.user.id)));
  });
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export async function addMilestone(ctx: Ctx, id: string, raw: unknown) {
  const input = parseInput(milestoneSchema, raw);
  const today = todayOf(ctx);
  return ctx.db.transaction(async (tx) => {
    const ch = await lockOwned(tx, ctx, id);
    const value = roundTo(input.thresholdValue, ch.valueDecimals);
    if (value <= 0) throw invalid("That milestone is too small.");
    const [have] = await tx.select({ n: count() }).from(s.milestones).where(eq(s.milestones.challengeId, id));
    if ((have?.n ?? 0) >= 30) throw badState("A challenge can have at most 30 milestones.");
    await tx.insert(s.milestones).values({ challengeId: id, title: input.title, thresholdValue: money(value), isCustom: true });
    return recomputeDerived(tx, id, today);
  });
}

export async function deleteMilestone(ctx: Ctx, id: string, milestoneId: string) {
  await ctx.db.transaction(async (tx) => {
    await lockOwned(tx, ctx, id);
    const res = await tx.delete(s.milestones).where(and(eq(s.milestones.id, milestoneId), eq(s.milestones.challengeId, id))).returning({ id: s.milestones.id });
    if (res.length === 0) throw notFound("That milestone");
  });
}

export { AppError };
