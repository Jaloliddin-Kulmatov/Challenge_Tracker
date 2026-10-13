import { addDays, toEpochDay, type ISODate } from "./dates";
import type { Frequency, LogRecord } from "./types";
import type { SlotEvaluation } from "./progress";

export interface StreakInfo {
  current: number;
  longest: number;
  unit: "days" | "sessions" | "weeks";
}

/**
 * Streaks count consecutive *completed* schedule slots.
 *  – A missed slot ends the run.
 *  – Skipped, excused (paused) and cancelled slots are neutral: they neither extend nor break it.
 *  – A slot that is still open today (due) or in the future never breaks a streak.
 * For "total goal" challenges, which have no slots, a streak is consecutive days with a log.
 */
export function computeStreaks(input: {
  evaluations: readonly SlotEvaluation[];
  logs: readonly Pick<LogRecord, "localDate">[];
  today: ISODate;
  frequency: Frequency | null;
}): StreakInfo {
  const { evaluations, logs, today, frequency } = input;
  const scheduled = evaluations.filter((e) => e.kind !== "total" && ["completed", "missed", "due", "upcoming"].includes(e.state));

  if (scheduled.length === 0) return dayStreak(logs, today);

  let run = 0;
  let longest = 0;
  for (const e of scheduled) {
    if (e.state === "completed") {
      run += 1;
      longest = Math.max(longest, run);
    } else if (e.state === "missed") {
      run = 0;
    }
  }
  const unit: StreakInfo["unit"] =
    scheduled.some((e) => e.kind === "week") && frequency === "weekly_flexible"
      ? "weeks"
      : frequency === "daily"
        ? "days"
        : "sessions";
  return { current: run, longest, unit };
}

function dayStreak(logs: readonly Pick<LogRecord, "localDate">[], today: ISODate): StreakInfo {
  const days = [...new Set(logs.map((l) => l.localDate))].sort();
  if (days.length === 0) return { current: 0, longest: 0, unit: "days" };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    run = toEpochDay(days[i]!) - toEpochDay(days[i - 1]!) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
  }
  const set = new Set(days);
  let cursor = set.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (set.has(cursor)) {
    current += 1;
    cursor = addDays(cursor, -1);
  }
  return { current, longest, unit: "days" };
}
