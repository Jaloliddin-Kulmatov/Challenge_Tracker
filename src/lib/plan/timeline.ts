/**
 * The day as a timeline: the university classes (fixed) plus the user's own blocks (study, meals, exercise, rest…),
 * and a small analysis of the week built from it. Pure; everything is derived from the template.
 */
import { addDays, isoWeekday, type ISODate } from "@/lib/core/dates";
import { WEEKDAY_LONG } from "@/lib/core/format";
import { dailyTasksFor, type ResolvedDaily } from "./logic";
import type { BlockKind, PlanTemplate } from "./types";

export const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/;

/** "HH:MM" → minutes since midnight ("24:00" = 1440). */
export const toMin = (hhmm: string): number => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const fromMin = (min: number): string => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export type ItemKind = BlockKind | "class";

export interface TimelineItem {
  id: string;
  start: string;
  end: string;
  kind: ItemKind;
  title: string;
  detail?: string;
  /** Full tick key ("daily:dl") when the item is a daily task. */
  taskKey?: string;
}

/** "09:00–10:00" (or with a hyphen) → ["09:00", "10:00"]. */
export function parseRange(range: string): [string, string] {
  const [a, b] = range.split(/[–-]/);
  return [a!.trim(), b!.trim()];
}

function classItems(t: PlanTemplate, weekday: number): TimelineItem[] {
  return (t.schedule.find((d) => d.weekday === weekday)?.classes ?? []).map((c, i) => {
    const [start, end] = parseRange(c.time);
    return { id: `class-${weekday}-${i}`, start, end, kind: "class" as const, title: `${c.code} ${c.course}`, detail: `${c.type} · ${c.place}` };
  });
}

const byStart = (a: { start: string; end: string }, b: { start: string; end: string }) => toMin(a.start) - toMin(b.start) || toMin(a.end) - toMin(b.end);

/** A representative date for a weekday (the first one in the plan), for wording that depends on the date. */
export function dateOfWeekday(t: PlanTemplate, weekday: number): ISODate {
  return addDays(t.startDate, (weekday - isoWeekday(t.startDate) + 7) % 7);
}

function build(t: PlanTemplate, weekday: number, tasks: Map<string, ResolvedDaily>): TimelineItem[] {
  const own: TimelineItem[] = [];
  for (const b of t.timeline.find((d) => d.weekday === weekday)?.blocks ?? []) {
    if (b.taskKey) {
      const task = tasks.get(`daily:${b.taskKey}`);
      if (!task) continue; // the task doesn't happen that day
      own.push({ id: b.id, start: b.start, end: b.end, kind: b.kind, title: task.title, detail: task.detail, taskKey: task.taskKey });
    } else {
      own.push({ id: b.id, start: b.start, end: b.end, kind: b.kind, title: b.title });
    }
  }
  return [...classItems(t, weekday), ...own].sort(byStart);
}

/** The timeline of one calendar day, with the day's tasks worded for that date (e.g. "Long run · 17 km"). */
export function timelineFor(t: PlanTemplate, date: ISODate): TimelineItem[] {
  return build(t, isoWeekday(date), new Map(dailyTasksFor(t, date).map((d) => [d.taskKey, d])));
}

/** Daily tasks of a date that the timeline has no block for (and that need one). */
export function untimedTasks(t: PlanTemplate, date: ISODate): ResolvedDaily[] {
  const placed = new Set(timelineFor(t, date).map((i) => i.taskKey));
  const needs = new Set(t.dailyTasks.filter((d) => !d.anytime).map((d) => `daily:${d.key}`));
  return dailyTasksFor(t, date).filter((d) => !placed.has(d.taskKey) && needs.has(d.taskKey));
}

// ---------------------------------------------------------------------------
// Validation (used when the user saves edits)
// ---------------------------------------------------------------------------

/** A user-facing problem with the timeline, or null. */
export function validateTimeline(t: PlanTemplate): string | null {
  const seen = new Set<string>();
  const days = new Set<number>();
  for (const day of t.timeline) {
    const name = WEEKDAY_LONG[day.weekday - 1] ?? `Day ${day.weekday}`;
    if (!Number.isInteger(day.weekday) || day.weekday < 1 || day.weekday > 7 || days.has(day.weekday)) return "The timeline has an invalid day.";
    days.add(day.weekday);
    const taskKeys = new Set(t.dailyTasks.filter((d) => d.weekdays.includes(day.weekday)).map((d) => d.key));
    for (const b of day.blocks) {
      if (seen.has(b.id)) return "The timeline has a duplicate block.";
      seen.add(b.id);
      const label = b.taskKey ? (t.dailyTasks.find((d) => d.key === b.taskKey)?.title ?? b.taskKey) : b.title;
      if (!TIME_RE.test(b.start) || !TIME_RE.test(b.end) || toMin(b.start) >= toMin(b.end)) return `${name}: “${label}” needs a start time before its end time.`;
      if (b.taskKey && !t.dailyTasks.some((d) => d.key === b.taskKey)) return `${name}: a block is linked to a task that no longer exists.`;
      if (b.taskKey && !taskKeys.has(b.taskKey)) return `${name}: “${label}” isn't scheduled on ${name}s, so it can't have a time slot there.`;
      if (!b.taskKey && !b.title.trim()) return `${name}: every block needs a title.`;
    }
    const all = [...classItems(t, day.weekday), ...day.blocks.map((b) => ({ ...b, title: b.title || t.dailyTasks.find((d) => d.key === b.taskKey)?.title || "" }))].sort(byStart);
    for (let i = 1; i < all.length; i++) {
      if (toMin(all[i]!.start) < toMin(all[i - 1]!.end)) return `${name}: “${all[i - 1]!.title}” and “${all[i]!.title}” overlap.`;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

export type Bucket = ItemKind;

export interface DayAnalysis {
  weekday: number;
  /** Minutes per kind of activity; gaps in the awake window that nothing is planned in count as rest (free time). */
  minutes: Record<Bucket, number>;
  wake: string;
  /** Lights out (start of the sleep block, 23:30 if there is none). */
  sleepAt: string;
  /** Previous night's lights out, and the hours of sleep it gives before this day's wake-up. */
  prevSleepAt: string;
  sleepBefore: number;
}

export interface Insight {
  level: "warn" | "info";
  weekday?: number;
  text: string;
}

export interface WeekAnalysis {
  days: DayAnalysis[];
  /** Weekly hours per bucket. */
  hours: Record<Bucket, number>;
  insights: Insight[];
}

const BUCKETS: Bucket[] = ["class", "study", "exercise", "meal", "travel", "social", "rest", "sleep"];
const zero = (): Record<Bucket, number> => Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>;
const round1 = (n: number) => Math.round(n * 10) / 10;
const hrs = (min: number) => `${round1(min / 60)} h`;

export function analyzeWeek(t: PlanTemplate): WeekAnalysis {
  const items = new Map<number, TimelineItem[]>();
  const tasksOn = new Map<number, ResolvedDaily[]>();
  for (let wd = 1; wd <= 7; wd++) {
    const date = dateOfWeekday(t, wd);
    items.set(wd, timelineFor(t, date));
    tasksOn.set(wd, dailyTasksFor(t, date));
  }

  const sleepAtOf = (wd: number) => items.get(wd)!.find((i) => i.kind === "sleep")?.start ?? "23:30";
  const days: DayAnalysis[] = [];
  for (let wd = 1; wd <= 7; wd++) {
    const list = items.get(wd)!;
    const minutes = zero();
    for (const i of list) minutes[i.kind] += toMin(i.end) - toMin(i.start);
    const wake = list[0]?.start ?? "08:00";
    const sleepAt = sleepAtOf(wd);
    const awake = Math.max(0, toMin(sleepAt) - toMin(wake));
    const planned = list.filter((i) => i.kind !== "sleep").reduce((n, i) => n + (Math.min(toMin(i.end), toMin(sleepAt)) - toMin(i.start)), 0);
    minutes.rest += Math.max(0, awake - planned);
    const prevSleepAt = sleepAtOf(wd === 1 ? 7 : wd - 1);
    days.push({ weekday: wd, minutes, wake, sleepAt, prevSleepAt, sleepBefore: round1((24 * 60 - toMin(prevSleepAt) + toMin(wake)) / 60) });
  }

  const hours = zero();
  for (const d of days) for (const b of BUCKETS) hours[b] += d.minutes[b] / 60;
  for (const b of BUCKETS) hours[b] = round1(hours[b]);

  const insights: Insight[] = [];
  const name = (wd: number) => WEEKDAY_LONG[wd - 1]!;
  for (const d of days) {
    const list = items.get(d.weekday)!;
    const date = dateOfWeekday(t, d.weekday);
    for (const task of untimedTasks(t, date)) insights.push({ level: "warn", weekday: d.weekday, text: `${name(d.weekday)}: “${task.title}” has no time slot.` });
    if (d.sleepBefore < 7) insights.push({ level: "warn", weekday: d.weekday, text: `${name(d.weekday)}: only ${d.sleepBefore} h of sleep before it (lights out ${d.prevSleepAt}, up at ${d.wake}).` });
    const ex = list.filter((i) => i.kind === "exercise").at(-1);
    if (ex && toMin(ex.end) > toMin("21:30")) insights.push({ level: "warn", weekday: d.weekday, text: `${name(d.weekday)}: exercise ends at ${ex.end}, late for a 23:30 bedtime.` });
    const firstClass = list.find((i) => i.kind === "class");
    if (firstClass && toMin(firstClass.start) - toMin(d.wake) < 60) insights.push({ level: "warn", weekday: d.weekday, text: `${name(d.weekday)}: only ${toMin(firstClass.start) - toMin(d.wake)} min between waking up and the first class.` });
    const busy = d.minutes.class + d.minutes.study + d.minutes.exercise;
    if (busy > 600) insights.push({ level: "warn", weekday: d.weekday, text: `${name(d.weekday)}: ${hrs(busy)} of classes, study and exercise – a very full day.` });
    if (d.minutes.rest < 90) insights.push({ level: "warn", weekday: d.weekday, text: `${name(d.weekday)}: only ${hrs(d.minutes.rest)} of free time.` });
  }
  const weekday = days.filter((d) => d.weekday <= 5);
  const heaviest = [...days].sort((a, b) => b.minutes.class + b.minutes.study + b.minutes.exercise - (a.minutes.class + a.minutes.study + a.minutes.exercise))[0]!;
  insights.push({ level: "info", text: `${hours.class} h of classes a week; ${hours.study} h of planned study and ${hours.exercise} h of exercise.` });
  insights.push({ level: "info", text: `Busiest day: ${name(heaviest.weekday)} (${hrs(heaviest.minutes.class + heaviest.minutes.study + heaviest.minutes.exercise)} of classes, study and exercise).` });
  const lightest = [...weekday].sort((a, b) => b.minutes.rest - a.minutes.rest)[0]!;
  insights.push({ level: "info", text: `Most free time on a class day: ${name(lightest.weekday)} (${hrs(lightest.minutes.rest)}) – the best slot for a club or friends.` });
  return { days, hours, insights };
}
