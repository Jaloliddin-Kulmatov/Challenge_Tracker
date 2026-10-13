/**
 * Schedule generation: turns versioned target rules into concrete schedule slots,
 * and computes the minimal set of database changes when rules or the duration change.
 * Everything here is pure (no I/O) so it can be unit tested exhaustively.
 */
import {
  addDays,
  compareDates,
  daysInclusive,
  eachDay,
  endOfIsoWeek,
  isoWeekday,
  maxDate,
  minDate,
  nextMondayOnOrAfter,
  startOfIsoWeek,
  type ISODate,
} from "./dates";
import type { PlannedSlot, SlotRecord, TargetRule, TrackingMethod } from "./types";

// ---------------------------------------------------------------------------
// Number helpers
// ---------------------------------------------------------------------------

export function roundTo(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export function stepFor(decimals: number): number {
  return 1 / 10 ** decimals;
}

/** Split `total` into `parts` values that sum exactly to `total` (earlier parts get the remainder). */
export function splitEvenly(total: number, parts: number, decimals: number): number[] {
  if (parts <= 0) return [];
  const f = 10 ** decimals;
  const units = Math.round(total * f);
  const base = Math.floor(units / parts);
  const remainder = units - base * parts;
  return Array.from({ length: parts }, (_, i) => (base + (i < remainder ? 1 : 0)) / f);
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

export function sortRules(rules: readonly TargetRule[]): TargetRule[] {
  return [...rules].sort((a, b) => compareDates(a.effectiveFrom, b.effectiveFrom));
}

export function ruleAt(rules: readonly TargetRule[], date: ISODate): TargetRule | null {
  let found: TargetRule | null = null;
  for (const r of sortRules(rules)) {
    if (r.effectiveFrom <= date) found = r;
    else break;
  }
  return found;
}

/** Per-weekday session targets for a `weekly_days` rule (weekday → target). */
export function weekdayTargetsFor(rule: TargetRule, decimals: number): Map<number, number> {
  const out = new Map<number, number>();
  if (rule.weekdayTargets && Object.keys(rule.weekdayTargets).length > 0) {
    for (const [k, v] of Object.entries(rule.weekdayTargets)) out.set(Number(k), v);
    return out;
  }
  const days = [...new Set(rule.weekdays)].sort((a, b) => a - b);
  const parts = splitEvenly(rule.weeklyTarget ?? 0, days.length, decimals);
  days.forEach((d, i) => out.set(d, parts[i] ?? 0));
  return out;
}

/** Target of a clipped (shorter than 7 days) weekly window. */
export function prorateWeekly(weeklyTarget: number, days: number, decimals: number): number {
  if (days >= 7) return weeklyTarget;
  return Math.max(stepFor(decimals), roundTo((weeklyTarget * days) / 7, decimals));
}

/** Validate a rule; returns human-readable problems (empty when valid). */
export function validateRule(rule: TargetRule, decimals: number, tracking: TrackingMethod): string[] {
  const errors: string[] = [];
  const step = stepFor(decimals);
  const positive = (v: number | null | undefined) => typeof v === "number" && Number.isFinite(v) && v >= step - 1e-9;
  const MAX = 1_000_000;

  switch (rule.frequency) {
    case "daily":
      if (!positive(rule.sessionTarget)) errors.push("Enter a daily target greater than zero.");
      else if (rule.sessionTarget! > MAX) errors.push("The daily target is too large.");
      break;
    case "weekly_days": {
      const days = new Set(rule.weekdays);
      if (days.size === 0) errors.push("Choose at least one day of the week.");
      if ([...days].some((d) => !Number.isInteger(d) || d < 1 || d > 7)) errors.push("Weekdays must be between 1 and 7.");
      if (rule.weekdayTargets && Object.keys(rule.weekdayTargets).length > 0) {
        const keys = Object.keys(rule.weekdayTargets).map(Number);
        if (keys.some((k) => !days.has(k)) || [...days].some((d) => !keys.includes(d)))
          errors.push("Set a target for every selected day.");
        if (Object.values(rule.weekdayTargets).some((v) => !positive(v) || v > MAX))
          errors.push("Every day's target must be greater than zero.");
      } else if (!positive(rule.weeklyTarget) || rule.weeklyTarget! > MAX) {
        errors.push("Enter a weekly target greater than zero.");
      } else if (days.size > 0 && rule.weeklyTarget! + 1e-9 < days.size * step) {
        errors.push("The weekly target is too small to split across the selected days.");
      }
      break;
    }
    case "weekly_flexible":
      if (!positive(rule.weeklyTarget) || rule.weeklyTarget! > MAX) errors.push("Enter a weekly target greater than zero.");
      break;
    case "total":
      if (!positive(rule.totalTarget) || rule.totalTarget! > MAX * 100) errors.push("Enter an overall target greater than zero.");
      break;
  }
  if (tracking === "completion" && rule.frequency === "weekly_flexible" && rule.weeklyTarget! > 7 * 10)
    errors.push("That is more completions per week than is realistic.");
  return errors;
}

/**
 * Completion challenges count whole "done" marks, so their rules are normalised:
 * a daily target is 1, and weekly day-sets get one completion per chosen day.
 */
export function normalizeRule(rule: TargetRule, tracking: TrackingMethod): TargetRule {
  const weekdays = [...new Set(rule.weekdays)].sort((a, b) => a - b);
  const base = { ...rule, weekdays };
  if (tracking !== "completion") return base;
  switch (rule.frequency) {
    case "daily":
      return { ...base, sessionTarget: 1, weeklyTarget: null, weekdayTargets: null, totalTarget: null };
    case "weekly_days":
      return { ...base, sessionTarget: null, weeklyTarget: weekdays.length, weekdayTargets: null, totalTarget: null };
    case "weekly_flexible":
      return { ...base, sessionTarget: null, weekdayTargets: null, totalTarget: null };
    case "total":
      return { ...base, sessionTarget: null, weeklyTarget: null, weekdayTargets: null };
  }
}

/**
 * Weekly-window and total schedules cannot be split mid-week, so a rule that starts or
 * follows a weekly-flexible rule takes effect from the next Monday.
 */
export function snapEffectiveFrom(
  rules: readonly TargetRule[],
  newRule: Pick<TargetRule, "frequency">,
  requested: ISODate,
): ISODate {
  const previous = ruleAt(rules, requested);
  const touchesWeekly = newRule.frequency === "weekly_flexible" || previous?.frequency === "weekly_flexible";
  return touchesWeekly ? nextMondayOnOrAfter(requested) : requested;
}

// ---------------------------------------------------------------------------
// Slot generation
// ---------------------------------------------------------------------------

/**
 * Generate every slot with `windowStart >= from` and `windowStart <= to` implied by the rules.
 * `to` is the (inclusive) last day of the challenge.
 */
export function generateSlots(rules: readonly TargetRule[], from: ISODate, to: ISODate, decimals: number): PlannedSlot[] {
  const sorted = sortRules(rules);
  const slots: PlannedSlot[] = [];

  sorted.forEach((rule, i) => {
    const next = sorted[i + 1];
    const segStart = maxDate(rule.effectiveFrom, from);
    const segEnd = minDate(next ? addDays(next.effectiveFrom, -1) : to, to);
    if (compareDates(segStart, segEnd) > 0) return;

    switch (rule.frequency) {
      case "daily": {
        for (const day of eachDay(segStart, segEnd))
          slots.push({ kind: "session", windowStart: day, windowEnd: day, targetValue: rule.sessionTarget ?? 0 });
        break;
      }
      case "weekly_days": {
        const targets = weekdayTargetsFor(rule, decimals);
        for (const day of eachDay(segStart, segEnd)) {
          const t = targets.get(isoWeekday(day));
          if (t !== undefined) slots.push({ kind: "session", windowStart: day, windowEnd: day, targetValue: t });
        }
        break;
      }
      case "weekly_flexible": {
        for (let ws = startOfIsoWeek(segStart); compareDates(ws, segEnd) <= 0; ws = addDays(ws, 7)) {
          const start = maxDate(ws, segStart);
          const end = minDate(endOfIsoWeek(ws), segEnd);
          slots.push({
            kind: "week",
            windowStart: start,
            windowEnd: end,
            targetValue: prorateWeekly(rule.weeklyTarget ?? 0, daysInclusive(start, end), decimals),
          });
        }
        break;
      }
      case "total": {
        slots.push({ kind: "total", windowStart: segStart, windowEnd: segEnd, targetValue: rule.totalTarget ?? 0 });
        break;
      }
    }
  });

  return slots.sort((a, b) => compareDates(a.windowStart, b.windowStart));
}

// ---------------------------------------------------------------------------
// Incremental changes
// ---------------------------------------------------------------------------

export interface ExistingSlot extends SlotRecord {
  hasLogs: boolean;
}

export interface SchedulePlan {
  deleteIds: string[];
  insert: PlannedSlot[];
  update: { id: string; windowEnd?: ISODate; targetValue?: number }[];
}

/**
 * Work out what to delete / insert / update after the rules or the end date changed.
 *
 *  – Slots before `regenerateFrom` are never touched (history is immutable).
 *  – Slots the user customised, skipped, or logged against are kept as they are.
 *  – Everything else from `regenerateFrom` on is regenerated from the rules.
 */
export function planScheduleChange(input: {
  existing: readonly ExistingSlot[];
  rules: readonly TargetRule[];
  newEnd: ISODate;
  regenerateFrom: ISODate;
  decimals: number;
}): SchedulePlan {
  const { existing, rules, newEnd, regenerateFrom, decimals } = input;
  const deleteIds: string[] = [];
  const update: SchedulePlan["update"] = [];
  const kept: ExistingSlot[] = [];

  for (const s of existing) {
    if (s.status === "cancelled") continue;
    const regenerable = s.status === "planned" && !s.isCustomized && !s.hasLogs && s.kind !== "total";
    const beyondEnd = s.windowStart > newEnd;
    if (beyondEnd && !s.hasLogs && s.kind !== "total") deleteIds.push(s.id);
    else if (regenerable && s.naturalStart >= regenerateFrom) deleteIds.push(s.id);
    else kept.push(s);
  }

  const latest = sortRules(rules).at(-1);
  const keptTotal = kept.find((s) => s.kind === "total");
  if (keptTotal) {
    const patch: SchedulePlan["update"][number] = { id: keptTotal.id };
    if (keptTotal.windowEnd !== newEnd) patch.windowEnd = newEnd;
    if (latest?.frequency === "total" && !keptTotal.isCustomized && latest.totalTarget !== keptTotal.targetValue)
      patch.targetValue = latest.totalTarget ?? keptTotal.targetValue;
    if (patch.windowEnd !== undefined || patch.targetValue !== undefined) update.push(patch);
  }

  // Weekly windows that now run past the end are clipped and re-prorated.
  for (const s of kept) {
    if (s.kind === "week" && s.windowStart <= newEnd && s.windowEnd > newEnd) {
      const patch: SchedulePlan["update"][number] = { id: s.id, windowEnd: newEnd };
      const rule = ruleAt(rules, s.windowStart);
      if (!s.isCustomized && rule?.frequency === "weekly_flexible")
        patch.targetValue = prorateWeekly(rule.weeklyTarget ?? 0, daysInclusive(s.windowStart, newEnd), decimals);
      update.push(patch);
    }
  }

  const blocked = new Set(kept.filter((s) => s.naturalStart >= regenerateFrom).map((s) => s.naturalStart));
  const insert = generateSlots(rules, regenerateFrom, newEnd, decimals).filter(
    (p) => !(p.kind === "total" && keptTotal) && !blocked.has(p.windowStart),
  );

  return { deleteIds, insert, update };
}
