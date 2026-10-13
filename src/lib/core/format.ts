import { formatDateShort } from "./dates";
import { roundTo } from "./schedule";
import type { TargetRule, TrackingMethod } from "./types";

export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const WEEKDAY_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

export function weekdayShort(isoWeekday: number): string {
  return WEEKDAY_SHORT[isoWeekday - 1] ?? "";
}

export function formatNumber(value: number, decimals = 2): string {
  const rounded = roundTo(value, decimals);
  return rounded.toLocaleString("en-US", { maximumFractionDigits: Math.max(decimals, 0) });
}

/** "12.5 km", "3 pages", or "Done" for completion challenges. */
export function formatValue(value: number, unit: string | null, tracking: TrackingMethod, decimals = 2): string {
  if (tracking === "completion") return value === 1 ? "1 time" : `${formatNumber(value, 0)} times`;
  return `${formatNumber(value, decimals)}${unit ? ` ${unit}` : ""}`;
}

export function describeRule(rule: TargetRule, unit: string | null, tracking: TrackingMethod, decimals = 2): string {
  const v = (n: number | null) => formatValue(n ?? 0, unit, tracking, decimals);
  switch (rule.frequency) {
    case "daily":
      return tracking === "completion" ? "Every day" : `${v(rule.sessionTarget)} every day`;
    case "weekly_days": {
      const days = [...new Set(rule.weekdays)].sort((a, b) => a - b).map(weekdayShort).join(", ");
      if (rule.weekdayTargets && Object.keys(rule.weekdayTargets).length > 0 && tracking !== "completion") {
        const parts = Object.entries(rule.weekdayTargets)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([d, t]) => `${weekdayShort(Number(d))} ${v(t)}`);
        return parts.join(" · ");
      }
      return tracking === "completion" ? days : `${days} · ${v(rule.weeklyTarget)} per week`;
    }
    case "weekly_flexible":
      return `${v(rule.weeklyTarget)} per week, any days`;
    case "total":
      return `${v(rule.totalTarget)} in total, at your own pace`;
  }
}

export function describeRange(start: string, end: string): string {
  return `${formatDateShort(start)} → ${formatDateShort(end)}`;
}
