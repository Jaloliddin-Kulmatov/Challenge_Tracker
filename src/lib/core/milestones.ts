import type { ISODate } from "./dates";
import type { LogRecord } from "./types";

export interface MilestoneDef {
  id: string;
  thresholdPercent: number | null;
  thresholdValue: number | null;
}

export interface MilestoneResult {
  reachedAt: Date;
  reachedLocalDate: ISODate;
}

export const DEFAULT_MILESTONE_PERCENTS = [25, 50, 75, 100] as const;

export function defaultMilestoneTitle(percent: number): string {
  switch (percent) {
    case 25:
      return "A quarter of the way";
    case 50:
      return "Halfway there";
    case 75:
      return "Three quarters done";
    case 100:
      return "Goal reached";
    default:
      return `${percent}% of the goal`;
  }
}

export function milestoneThreshold(def: Pick<MilestoneDef, "thresholdPercent" | "thresholdValue">, totalTarget: number): number | null {
  if (def.thresholdValue !== null) return def.thresholdValue;
  if (def.thresholdPercent !== null && totalTarget > 0) return (totalTarget * def.thresholdPercent) / 100;
  return null;
}

/**
 * When was each milestone first reached, given the cumulative total of all logs?
 * Re-evaluated after every log change, so deleting a log can "un-reach" a milestone.
 */
export function evaluateMilestones(
  defs: readonly MilestoneDef[],
  logs: readonly Pick<LogRecord, "value" | "localDate" | "occurredAt">[],
  totalTarget: number,
): Map<string, MilestoneResult | null> {
  const ordered = [...logs].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const out = new Map<string, MilestoneResult | null>();
  for (const def of defs) {
    const threshold = milestoneThreshold(def, totalTarget);
    if (threshold === null || threshold <= 0) {
      out.set(def.id, null);
      continue;
    }
    let sum = 0;
    let reached: MilestoneResult | null = null;
    for (const l of ordered) {
      sum += l.value;
      if (sum + 1e-9 >= threshold) {
        reached = { reachedAt: l.occurredAt, reachedLocalDate: l.localDate };
        break;
      }
    }
    out.set(def.id, reached);
  }
  return out;
}
