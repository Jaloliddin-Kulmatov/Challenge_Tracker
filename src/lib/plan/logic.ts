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
 *   book:<id>              period "once"          books to finish
 */
import { addDays, compareDates, diffDays, isoWeekday, isValidISODate, maxDate, minDate, type ISODate } from "@/lib/core/dates";
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
    if (lr) {
      // "long run 15 km" → "Long run · 15 km"; notes like "light runs only" replace the label ("Light runs only")
      const km = /^long run (.+)$/i.exec(lr)?.[1];
      detail = km ? `${detail ?? "Long run"} · ${km}` : lr.charAt(0).toUpperCase() + lr.slice(1);
    }
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
    case "book":
      if (!t.books.some((b) => b.id === id)) return "Unknown book.";
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

export function booksCount(t: PlanTemplate, checks: CheckSet): Count {
  return count(checks, t.books.map((b) => checkKey(`book:${b.id}`, "once")));
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

// ---------------------------------------------------------------------------
// Monthly numbers
// ---------------------------------------------------------------------------

/** The numbers logged in a week's Sunday review (a subset of `MetricView`, so the logic stays free of the database). */
export interface WeekNumbers {
  week: number;
  weightKg: number | null;
  youtubeSubs: number | null;
  instagramSubs: number | null;
  longRunKm: number | null;
}

/** First and last day of the month, clipped to the plan. */
export function monthRange(t: PlanTemplate, month: MonthPlan): { start: ISODate; end: ISODate } {
  const mm = String(month.month).padStart(2, "0");
  const first = `${month.year}-${mm}-01`;
  const last = addDays(month.month === 12 ? `${month.year + 1}-01-01` : `${month.year}-${String(month.month + 1).padStart(2, "0")}-01`, -1);
  return { start: maxDate(first, t.startDate), end: minDate(last, t.endDate) };
}

/** A week counts towards the month its last day is in (that is when its Sunday review is done). */
export function monthKeyOfWeek(t: PlanTemplate, n: number): string {
  return monthFor(t, weekRange(t, n).end).key;
}

/** The first logged weight, which the straight-line weight path starts from. */
export function startWeight(metrics: readonly WeekNumbers[]): number | null {
  return [...metrics].sort((a, b) => a.week - b.week).find((m) => m.weightKg !== null)?.weightKg ?? null;
}

/** Target weight at the end of a month: the month's own target, else a straight line from the first logged weight to the goal. */
export function weightTarget(t: PlanTemplate, month: MonthPlan, metrics: readonly WeekNumbers[]): number | null {
  if (month.weightKg !== null) return month.weightKg;
  const from = startWeight(metrics);
  if (from === null) return null;
  const first = [...metrics].sort((a, b) => a.week - b.week).find((m) => m.weightKg !== null)!;
  const startDay = weekRange(t, first.week).start;
  const span = diffDays(startDay, t.endDate);
  if (span <= 0) return t.weightGoalKg;
  const done = Math.min(span, Math.max(0, diffDays(startDay, monthRange(t, month).end)));
  return Math.round((from + ((t.weightGoalKg - from) * done) / span) * 10) / 10;
}

export interface Target {
  /** What the plan asks for by the end of the month (null when not computable yet). */
  target: number | null;
  /** What you have logged so far (null when nothing is logged). */
  actual: number | null;
}

export interface HabitStat {
  label: string;
  done: number;
  total: number;
}

export interface MonthStats {
  youtube: Target;
  instagram: Target;
  weight: Target;
  longRun: Target;
  books: Target;
  habits: HabitStat[];
}

const lastOf = (values: (number | null)[]) => [...values].reverse().find((v): v is number => v !== null) ?? null;

/**
 * Where you stand in a month. Subscribers and weight are "latest logged by the end of the month";
 * the long run is the best one logged in the month; books is how many are ticked (only meaningful from the month on).
 */
export function monthStats(t: PlanTemplate, month: MonthPlan, metrics: readonly WeekNumbers[], checks: CheckSet, today: ISODate): MonthStats {
  const sorted = [...metrics].sort((a, b) => a.week - b.week);
  const upTo = sorted.filter((m) => m.week <= t.weeks.length && compareDates(weekRange(t, m.week).end, monthRange(t, month).end) <= 0);
  const inMonth = sorted.filter((m) => m.week <= t.weeks.length && monthKeyOfWeek(t, m.week) === month.key);
  const { start, end } = monthRange(t, month);
  const last = minDate(end, today);

  const habits: HabitStat[] = [];
  for (const task of t.dailyTasks) {
    if (!task.habit) continue;
    let done = 0;
    let total = 0;
    for (let d = start; compareDates(d, last) <= 0; d = addDays(d, 1)) {
      if (!task.weekdays.includes(isoWeekday(d))) continue;
      total += 1;
      if (checks.has(checkKey(`daily:${task.key}`, d))) done += 1;
    }
    if (total > 0) habits.push({ label: task.habit, done, total });
  }

  const bestRun = inMonth.reduce<number | null>((m, x) => (x.longRunKm !== null && (m === null || x.longRunKm > m) ? x.longRunKm : m), null);
  return {
    youtube: { target: month.youtube, actual: lastOf(upTo.map((m) => m.youtubeSubs)) },
    instagram: { target: month.instagram, actual: lastOf(upTo.map((m) => m.instagramSubs)) },
    weight: { target: weightTarget(t, month, metrics), actual: lastOf(upTo.map((m) => m.weightKg)) },
    longRun: { target: month.longRunKm, actual: bestRun },
    books: { target: month.books, actual: booksCount(t, checks).done },
    habits,
  };
}
