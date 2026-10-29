import type { ISODate } from "@/lib/core/dates";

/** An overall goal, ticked once ("by Feb 28"). */
export interface PlanGoal {
  key: string;
  area: string;
  target: string;
}

/** A task that repeats on certain weekdays (ISO: Mon = 1 … Sun = 7) and is ticked per day. */
export interface DailyTask {
  key: string;
  title: string;
  weekdays: number[];
  /** Wall-clock time shown next to the task, e.g. "19:00". */
  time?: string;
  /** Per-weekday sub-label (e.g. which workout it is). */
  detailByWeekday?: Record<number, string>;
  /** Append the week's long-run target on this weekday (e.g. Thursday). */
  appendLongRunOn?: number;
  /** True when the task needs no slot in the timeline (e.g. "talk to one new person"). */
  anytime?: boolean;
  /** Label for the monthly "habits" count, e.g. "German days". Tasks without one aren't counted monthly. */
  habit?: string;
}

/** A task that repeats every week and is ticked per week. */
export interface WeeklyGoal {
  key: string;
  area: string;
  target: string;
}

export interface ClassSession {
  time: string;
  code: string;
  course: string;
  type: "Lecture" | "Tutorial";
  place: string;
}

/** The university timetable for one weekday (fixed by the faculty, not editable). */
export interface ScheduleDay {
  weekday: number;
  classes: ClassSession[];
}

export const BLOCK_KINDS = ["study", "meal", "exercise", "travel", "social", "rest", "sleep"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];

/**
 * One block of a day's timeline, "HH:MM" to "HH:MM" ("24:00" = midnight). A block linked to a daily task (`taskKey`)
 * is ticked there and takes the task's wording; any other block has its own title.
 */
export interface TimelineBlock {
  id: string;
  start: string;
  end: string;
  kind: BlockKind;
  title: string;
  taskKey?: string;
}

export interface TimelineDay {
  weekday: number;
  blocks: TimelineBlock[];
}

export interface MonthPlan {
  key: string;
  name: string;
  /** Calendar year and month (1–12) the month covers. */
  year: number;
  month: number;
  focus: string;
  longRunKm: number;
  /** Target weight at the end of the month; null = a straight line from the first logged weight to the goal. */
  weightKg: number | null;
  /** How many of the plan's books should be finished by the end of the month. */
  books: number;
  results: { id: string; text: string }[];
}

/** A book to finish, ticked once. */
export interface PlanBook {
  id: string;
  title: string;
}

export interface WeekPlan {
  n: number;
  /** Long-run target / running note for the week. */
  longRun: string;
  tasks: { id: string; text: string }[];
}

export interface KeyDate {
  when: string;
  what: string;
}

/** The parts of a plan the user can edit; stored per user, the template's own copy is the default. */
export type PlanContent = Pick<PlanTemplate, "goals" | "dailyTasks" | "weeklyGoals" | "books" | "months" | "weeks" | "timeline">;

export interface PlanTemplate {
  key: string;
  title: string;
  subtitle: string;
  startDate: ISODate;
  endDate: ISODate;
  /** The weight goal at the end of the plan; monthly weight targets are a straight line to it. */
  weightGoalKg: number;
  intro: string;
  goals: PlanGoal[];
  dailyTasks: DailyTask[];
  weeklyGoals: WeeklyGoal[];
  books: PlanBook[];
  schedule: ScheduleDay[];
  /** The hour-by-hour plan of each weekday; classes come from `schedule`. */
  timeline: TimelineDay[];
  months: MonthPlan[];
  weeks: WeekPlan[];
  keyDates: KeyDate[];
}
