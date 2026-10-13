/** Loading a challenge with everything needed to compute its progress, and mapping rows to core types. */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Executor } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import { computeProgress, type ChallengeProgress } from "@/lib/core/progress";
import { sortRules } from "@/lib/core/schedule";
import type { ChallengeCore, LogRecord, PauseRecord, SlotRecord, TargetRule } from "@/lib/core/types";
import type { ISODate } from "@/lib/core/dates";

export const num = (v: string | number | null | undefined): number => (v === null || v === undefined ? 0 : Number(v));
export const numOrNull = (v: string | number | null | undefined): number | null => (v === null || v === undefined ? null : Number(v));
export const money = (v: number): string => v.toFixed(2);

export interface Bundle {
  challenge: s.ChallengeRow;
  rules: TargetRule[];
  slots: SlotRecord[];
  logs: (LogRecord & { notes: string | null; timezone: string; unit: string | null; createdAt: Date })[];
  pauses: PauseRecord[];
  milestones: s.MilestoneRow[];
  achievements: s.AchievementRow[];
}

export function toCore(c: s.ChallengeRow): ChallengeCore {
  return {
    startDate: c.startDate,
    endDate: c.endDate,
    status: c.status,
    trackingMethod: c.trackingMethod,
    valueDecimals: c.valueDecimals,
    completedLocalDate: c.completedLocalDate,
  };
}

export function toRule(r: s.ConfigurationRow): TargetRule {
  return {
    effectiveFrom: r.effectiveFrom,
    frequency: r.frequency,
    weekdays: r.weekdays ?? [],
    sessionTarget: numOrNull(r.sessionTarget),
    weeklyTarget: numOrNull(r.weeklyTarget),
    weekdayTargets: r.weekdayTargets && Object.keys(r.weekdayTargets).length > 0 ? r.weekdayTargets : null,
    totalTarget: numOrNull(r.totalTarget),
  };
}

export function toSlot(r: s.ScheduledActivityRow): SlotRecord & { id: string } {
  return {
    id: r.id,
    kind: r.kind,
    windowStart: r.windowStart,
    windowEnd: r.windowEnd,
    naturalStart: r.naturalStart,
    targetValue: num(r.targetValue),
    status: r.status,
    isCustomized: r.isCustomized,
    label: r.label,
    timeOfDay: r.timeOfDay,
  };
}

export async function loadBundles(ex: Executor, challengeIds: string[]): Promise<Map<string, Bundle>> {
  const out = new Map<string, Bundle>();
  if (challengeIds.length === 0) return out;

  const [chs, cfgs, slots, logs, pauses, mss, achs] = await Promise.all([
    ex.select().from(s.challenges).where(inArray(s.challenges.id, challengeIds)),
    ex.select().from(s.challengeConfigurations).where(inArray(s.challengeConfigurations.challengeId, challengeIds)),
    ex.select().from(s.scheduledActivities).where(inArray(s.scheduledActivities.challengeId, challengeIds)).orderBy(asc(s.scheduledActivities.windowStart)),
    ex.select().from(s.activityLogs).where(inArray(s.activityLogs.challengeId, challengeIds)).orderBy(asc(s.activityLogs.occurredAt)),
    ex.select().from(s.challengePauses).where(inArray(s.challengePauses.challengeId, challengeIds)).orderBy(asc(s.challengePauses.startDate)),
    ex.select().from(s.milestones).where(inArray(s.milestones.challengeId, challengeIds)).orderBy(asc(s.milestones.createdAt)),
    ex.select().from(s.achievements).where(inArray(s.achievements.challengeId, challengeIds)).orderBy(asc(s.achievements.earnedAt)),
  ]);

  for (const c of chs) {
    out.set(c.id, { challenge: c, rules: [], slots: [], logs: [], pauses: [], milestones: [], achievements: [] });
  }
  for (const r of cfgs) out.get(r.challengeId)?.rules.push(toRule(r));
  for (const r of slots) out.get(r.challengeId)?.slots.push(toSlot(r));
  for (const r of logs)
    out.get(r.challengeId)?.logs.push({
      id: r.id,
      value: num(r.value),
      localDate: r.localDate,
      occurredAt: r.occurredAt,
      scheduledActivityId: r.scheduledActivityId,
      notes: r.notes,
      timezone: r.timezone,
      unit: r.unit,
      createdAt: r.createdAt,
    });
  for (const r of pauses) out.get(r.challengeId)?.pauses.push({ startDate: r.startDate, endDate: r.endDate });
  for (const r of mss) out.get(r.challengeId)?.milestones.push(r);
  for (const r of achs) out.get(r.challengeId)?.achievements.push(r);
  for (const b of out.values()) b.rules = sortRules(b.rules);
  return out;
}

/** The rule in force on `date` (falls back to the first rule). */
export function currentRule(b: Pick<Bundle, "rules">, today: ISODate): TargetRule | null {
  let found: TargetRule | null = null;
  for (const r of b.rules) if (r.effectiveFrom <= today) found = r;
  return found ?? b.rules[0] ?? null;
}

export function progressOf(b: Bundle, today: ISODate): ChallengeProgress {
  return computeProgress({
    challenge: toCore(b.challenge),
    frequency: currentRule(b, today)?.frequency ?? null,
    slots: b.slots,
    logs: b.logs,
    pauses: b.pauses,
    today,
  });
}

/** Load one challenge owned by `userId`, or null. Optionally locks the challenge row for the transaction. */
export async function findOwnedChallenge(ex: Executor, userId: string, challengeId: string, opts: { lock?: boolean } = {}) {
  const q = ex
    .select()
    .from(s.challenges)
    .where(and(eq(s.challenges.id, challengeId), eq(s.challenges.ownerId, userId)))
    .limit(1);
  const rows = opts.lock ? await q.for("update") : await q;
  return rows[0] ?? null;
}
