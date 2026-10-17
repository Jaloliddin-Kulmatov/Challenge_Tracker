/**
 * Pure plan logic (no I/O): weeks and months, which tasks apply on which day, validating a tick, and
 * progress counts. The database only stores ticks as "taskKey|period" strings, so everything else is derived.
 *
 * Tick keys
 *   goal:<goal>            period "once"          overall goals
 *   daily:<task>           period "YYYY-MM-DD"    daily tasks (not in the future, and only on their weekdays)
 *   weekly:<goal>          period "W<n>"          recurring weekly goals (week must have started)
 *   wtask:<w3t1>           period "W<n>"          tasks specific to one week (may be ticked early)
 *   mres:<month>:<id>      period "once"          monthly key results
 */
import { addDays, compareDates, diffDays, isoWeekday, isValidISODate, minDate, type ISODate } from "@/lib/core/dates";
import type { DailyTask, MonthPlan, PlanTemplate, WeekPlan } from "./types";

export type CheckSet = ReadonlySet<string>;
export const checkKey = (taskKey: string, period: string) => `${taskKey}|${period}`;

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export type PlanPhase = "upcoming" | "running" | "finished";

export function planPhase(t: PlanTemplate, today: ISODate): PlanPhase {
  if (compareDates(today, t.startDate) < 0) return "upcoming";
  if (compareDates(today, t.endDate) > 0) return "finished";
  return "running";
}

export function weekRange(t: PlanTemplate, n: number): { start: ISODate; end: ISODate } {
  const start = addDays(t.startDate, 7 * (n - 1));
  return { start, end: minDate(addDays(start, 6), t.endDate) };
}

/** Week number (1-based) a date falls in, or null outside the plan. */
export function weekOf(t: PlanTemplate, date: ISODate): number | null {
  if (compareDates(date, t.startDate) < 0 || compareDates(date, t.endDate) > 0) return null;
  return Math.floor(diffDays(t.startDate, date) / 7) + 1;
}

/** The week to show "now": week 1 before the plan, the last week after it. */
export function currentWeek(t: PlanTemplate, today: ISODate): number {
  return weekOf(t, today) ?? (compareDates(today, t.startDate) < 0 ? 1 : t.weeks.length);
}

/** 1-based day of the plan, clamped to [1, total]. */
export function dayNumber(t: PlanTemplate, today: ISODate): { day: number; total: number } {
  const total = diffDays(t.startDate, t.endDate) + 1;
  return { day: Math.min(total, Math.max(1, diffDays(t.startDate, today) + 1)), total };
}

export function weekPlan(t: PlanTemplate, n: number): WeekPlan | undefined {
  return t.weeks.find((w) => w.n === n);
}

/** The month card to treat as "this month": by calendar month, clamped to the plan's first/last. */
export function monthFor(t: PlanTemplate, date: ISODate): MonthPlan {
  const [y, m] = date.split("-").map(Number) as [number, number];
  const idx = t.months.findIndex((mo) => mo.year === y && mo.month === m);
  if (idx !== -1) return t.months[idx]!;
  return compareDates(date, t.startDate) < 0 ? t.months[0]! : t.months.at(-1)!;
}

export function nextMonth(t: PlanTemplate, month: MonthPlan): MonthPlan | null {
  const i = t.months.findIndex((m) => m.key === month.key);
  return t.months[i + 1] ?? null;
}

// ---------------------------------------------------------------------------
// Daily tasks
// ---------------------------------------------------------------------------

export interface ResolvedDaily {
  /** Full tick key, e.g. "daily:exercise". */
  taskKey: string;
  title: string;
  time?: string;
  detail?: string;
}

function resolveDaily(t: PlanTemplate, task: DailyTask, date: ISODate): ResolvedDaily {
  const wd = isoWeekday(date);
  let detail = task.detailByWeekday?.[wd];
  if (task.appendLongRunOn === wd) {
    const week = weekOf(t, date);
    const lr = week ? weekPlan(t, week)?.longRun : undefined;
    if (lr) detail = `${detail ?? ""}${detail ? " · " : ""}${lr}`;
  }
  return { taskKey: `daily:${task.key}`, title: task.title, time: task.time, detail };
}

export function dailyTasksFor(t: PlanTemplate, date: ISODate): ResolvedDaily[] {
  const wd = isoWeekday(date);
  return t.dailyTasks.filter((task) => task.weekdays.includes(wd)).map((task) => resolveDaily(t, task, date));
}

// ---------------------------------------------------------------------------
// Validation of a tick
// ---------------------------------------------------------------------------

/** Returns a user-facing problem, or null when the tick is allowed. */
export function validateCheck(t: PlanTemplate, taskKey: string, period: string, today: ISODate): string | null {
  const [kind, ...rest] = taskKey.split(":");
  const id = rest.join(":");
  switch (kind) {
    case "goal":
      if (!t.goals.some((g) => g.key === id)) return "Unknown goal.";
      return period === "once" ? null : "Invalid period.";
    case "daily": {
      if (!t.dailyTasks.some((d) => d.key === id)) return "Unknown task.";
      if (!isValidISODate(period)) return "Invalid date.";
      if (compareDates(period, t.startDate) < 0 || compareDates(period, t.endDate) > 0) return "That day is outside your plan.";
      if (compareDates(period, today) > 0) return "You can't tick a day that hasn't happened yet.";
      return dailyTasksFor(t, period).some((d) => d.taskKey === taskKey) ? null : "That task isn't scheduled for that day.";
    }
    case "weekly": {
      if (!t.weeklyGoals.some((g) => g.key === id)) return "Unknown weekly goal.";
      const n = parseWeekPeriod(t, period);
      if (n === null) return "Invalid week.";
      return compareDates(weekRange(t, n).start, today) > 0 ? "That week hasn't started yet." : null;
    }
    case "wtask": {
      const m = /^w(\d+)t(\d+)$/.exec(id);
      if (!m) return "Unknown task.";
      const n = Number(m[1]);
      if (!weekPlan(t, n)?.tasks.some((x) => x.id === id)) return "Unknown task.";
      return period === `W${n}` ? null : "Invalid week.";
    }
    case "mres": {
      const [monthKey, resultId] = id.split(":");
      const month = t.months.find((m) => m.key === monthKey);
      if (!month || !month.results.some((r) => r.id === resultId)) return "Unknown key result.";
      return period === "once" ? null : "Invalid period.";
    }
    default:
      return "Unknown task.";
  }
}

export function parseWeekPeriod(t: PlanTemplate, period: string): number | null {
  const m = /^W(\d{1,2})$/.exec(period);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= t.weeks.length ? n : null;
}

// ---------------------------------------------------------------------------
// Progress counts
// ---------------------------------------------------------------------------

export interface Count {
  done: number;
  total: number;
}

const count = (checks: CheckSet, keys: string[]): Count => ({ done: keys.filter((k) => checks.has(k)).length, total: keys.length });

export function dayCount(t: PlanTemplate, checks: CheckSet, date: ISODate): Count {
  return count(checks, dailyTasksFor(t, date).map((d) => checkKey(d.taskKey, date)));
}

export function weekItemKeys(t: PlanTemplate, n: number) {
  const { start } = weekRange(t, n);
  const daily: string[] = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(start, i);
    if (compareDates(date, t.endDate) > 0) break;
    for (const d of dailyTasksFor(t, date)) daily.push(checkKey(d.taskKey, date));
  }
  const weekly = t.weeklyGoals.map((g) => checkKey(`weekly:${g.key}`, `W${n}`));
  const tasks = (weekPlan(t, n)?.tasks ?? []).map((x) => checkKey(`wtask:${x.id}`, `W${n}`));
  return { daily, weekly, tasks };
}

/** Everything ticked / tickable in a week: daily tasks, the recurring weekly goals and the week's own tasks. */
export function weekCount(t: PlanTemplate, checks: CheckSet, n: number): Count {
  const k = weekItemKeys(t, n);
  return count(checks, [...k.daily, ...k.weekly, ...k.tasks]);
}

export function goalsCount(t: PlanTemplate, checks: CheckSet): Count {
  return count(checks, t.goals.map((g) => checkKey(`goal:${g.key}`, "once")));
}

export function monthCount(t: PlanTemplate, checks: CheckSet, month: MonthPlan): Count {
  return count(checks, month.results.map((r) => checkKey(`mres:${month.key}:${r.id}`, "once")));
}

/** Days (up to and including `today`) on which every task was ticked. */
export function perfectDays(t: PlanTemplate, checks: CheckSet, today: ISODate): number {
  let n = 0;
  const last = minDate(today, t.endDate);
  for (let d = t.startDate; compareDates(d, last) <= 0; d = addDays(d, 1)) {
    const c = dayCount(t, checks, d);
    if (c.total > 0 && c.done === c.total) n += 1;
  }
  return n;
}
