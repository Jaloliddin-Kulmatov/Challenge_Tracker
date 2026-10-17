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

export interface ScheduleDay {
  weekday: number;
  classes: ClassSession[];
  free: string[];
  exercise?: { time: string; what: string };
  note?: string;
}

export interface MonthPlan {
  key: string;
  name: string;
  /** Calendar year and month (1–12) the month covers. */
  year: number;
  month: number;
  focus: string;
  youtube: number;
  instagram: number;
  longRunKm: number;
  results: { id: string; text: string }[];
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

export interface PlanTemplate {
  key: string;
  title: string;
  subtitle: string;
  startDate: ISODate;
  endDate: ISODate;
  intro: string;
  goals: PlanGoal[];
  dailyTasks: DailyTask[];
  weeklyGoals: WeeklyGoal[];
  schedule: ScheduleDay[];
  months: MonthPlan[];
  weeks: WeekPlan[];
  keyDates: KeyDate[];
}
