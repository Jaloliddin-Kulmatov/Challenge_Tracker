/**
 * Progress, adherence, pace and series calculations.
 *
 * Nothing about "completed / missed" is stored: it is derived from the schedule, the logs,
 * the pauses and today's date. That is what keeps every statistic correct when a log is
 * deleted, a target is edited, a challenge is paused, or the user changes time zone.
 */
import {
  addDays,
  compareDates,
  daysInclusive,
  eachDay,
  maxDate,
  minDate,
  startOfIsoWeek,
  toEpochDay,
  type ISODate,
} from "./dates";
import { roundTo, stepFor } from "./schedule";
import type { ChallengeCore, Frequency, LogRecord, PauseRecord, SlotKind, SlotRecord } from "./types";
import { computeStreaks, type StreakInfo } from "./streaks";

export type SlotState = "completed" | "missed" | "due" | "upcoming" | "skipped" | "excused" | "cancelled";
export type Phase = "upcoming" | "running" | "paused" | "ended" | "completed" | "archived";
export type Pace = "ahead" | "on_track" | "behind";

export interface SlotEvaluation {
  id: string;
  kind: SlotKind;
  windowStart: ISODate;
  windowEnd: ISODate;
  label: string | null;
  timeOfDay: string | null;
  isCustomized: boolean;
  /** Effective target after pause / early-completion proration (0 when not counted). */
  target: number;
  rawTarget: number;
  achieved: number;
  /** achieved / target × 100, uncapped (so exceeding a target shows > 100). */
  percent: number;
  exceeded: boolean;
  state: SlotState;
}

export interface DayPoint {
  date: ISODate;
  logged: number;
  planned: number;
  /** null for days after "as of". */
  cumulativeLogged: number | null;
  cumulativePlanned: number;
}

export interface WeekPoint {
  weekStart: ISODate;
  logged: number;
  planned: number;
  sessionsCompleted: number;
  sessionsCounted: number;
}

export interface ChallengeProgress {
  phase: Phase;
  today: ISODate;
  /** Last day included in "so far" figures; null before the challenge starts. */
  asOf: ISODate | null;
  daysTotal: number;
  daysElapsed: number;
  daysRemaining: number;
  daysUntilStart: number;

  totalTarget: number;
  totalLogged: number;
  /** Uncapped: 120 means 20 % over target. */
  goalPercent: number;
  goalPercentCapped: number;
  targetReached: boolean;
  exceededBy: number;
  remainingToTarget: number;
  requiredPerDay: number | null;

  expectedToDate: number;
  pace: Pace | null;

  sessionsCompleted: number;
  sessionsMissed: number;
  sessionsDue: number;
  sessionsUpcoming: number;
  sessionsSkipped: number;
  sessionsCounted: number;
  /** completed ÷ (completed + missed); null when nothing has come due yet. */
  adherencePercent: number | null;

  logCount: number;
  activeDays: number;
  averagePerActiveDay: number | null;
  bestDay: { date: ISODate; value: number } | null;

  streak: StreakInfo;
  slots: SlotEvaluation[];
  daily: DayPoint[];
  weekly: WeekPoint[];
}

export interface ProgressInput {
  challenge: ChallengeCore;
  /** Frequency of the rule currently in force (used for the streak unit). */
  frequency: Frequency | null;
  slots: readonly SlotRecord[];
  logs: readonly LogRecord[];
  pauses: readonly PauseRecord[];
  today: ISODate;
}

const EPS = 1e-9;

/** Days of [start, end] that fall inside any pause (open pauses run to `today`). */
function pausedDayCounter(pauses: readonly PauseRecord[], today: ISODate) {
  const intervals = pauses
    .map((p) => [toEpochDay(p.startDate), toEpochDay(p.endDate ? addDays(p.endDate, -1) : today)] as const)
    .filter(([s, e]) => e >= s);
  return (start: ISODate, end: ISODate): number => {
    const s0 = toEpochDay(start);
    const e0 = toEpochDay(end);
    let n = 0;
    for (const [s, e] of intervals) {
      const lo = Math.max(s, s0);
      const hi = Math.min(e, e0);
      if (hi >= lo) n += hi - lo + 1;
    }
    return n;
  };
}

export function phaseOf(challenge: ChallengeCore, today: ISODate): Phase {
  if (challenge.status === "archived") return "archived";
  if (challenge.status === "completed") return "completed";
  if (challenge.status === "paused") return "paused";
  if (compareDates(today, challenge.startDate) < 0) return "upcoming";
  if (compareDates(today, challenge.endDate) > 0) return "ended";
  return "running";
}

/**
 * Pick the slot a new log should count towards: the earliest *unfinished* slot whose window
 * contains the date; failing that the earliest slot in range (so extra effort shows as
 * "exceeded"); failing that none (an extra, unscheduled session).
 */
export function chooseSlotForLog(
  slots: readonly (Pick<SlotRecord, "id" | "windowStart" | "windowEnd" | "status" | "targetValue"> & { achieved: number })[],
  date: ISODate,
): string | null {
  const candidates = slots
    .filter((s) => s.status === "planned" && s.windowStart <= date && date <= s.windowEnd)
    .sort((a, b) => compareDates(a.windowStart, b.windowStart));
  const open = candidates.find((s) => s.achieved + EPS < s.targetValue);
  return (open ?? candidates[0])?.id ?? null;
}

export function computeProgress(input: ProgressInput): ChallengeProgress {
  const { challenge, slots, logs, pauses, today } = input;
  const decimals = challenge.valueDecimals;
  const step = stepFor(decimals);
  const phase = phaseOf(challenge, today);
  const completedOn = challenge.completedLocalDate;
  const started = compareDates(today, challenge.startDate) >= 0;
  const asOf: ISODate | null = completedOn
    ? minDate(completedOn, challenge.endDate)
    : started
      ? minDate(today, challenge.endDate)
      : null;
  const pausedDays = pausedDayCounter(pauses, today);

  // ---- attach logs to slots ------------------------------------------------
  const achievedBySlot = new Map<string, number>();
  for (const l of logs) {
    if (l.scheduledActivityId)
      achievedBySlot.set(l.scheduledActivityId, (achievedBySlot.get(l.scheduledActivityId) ?? 0) + l.value);
  }

  // ---- evaluate each slot --------------------------------------------------
  const evaluations: SlotEvaluation[] = [...slots]
    .sort((a, b) => compareDates(a.windowStart, b.windowStart))
    .map((s) => {
      const achieved = roundTo(achievedBySlot.get(s.id) ?? 0, decimals);
      const base = {
        id: s.id,
        kind: s.kind,
        windowStart: s.windowStart,
        windowEnd: s.windowEnd,
        label: s.label,
        timeOfDay: s.timeOfDay,
        isCustomized: s.isCustomized,
        rawTarget: s.targetValue,
        achieved,
      };
      const inert = (state: SlotState): SlotEvaluation => ({
        ...base,
        target: 0,
        percent: 0,
        exceeded: false,
        state,
      });

      if (s.status === "cancelled") return inert("cancelled");
      if (s.status === "skipped") return inert("skipped");

      if (completedOn && s.windowStart > completedOn) return inert("cancelled");

      const effectiveEnd = completedOn ? minDate(s.windowEnd, completedOn) : s.windowEnd;
      let target = s.targetValue;
      let excused = false;

      if (s.kind !== "total") {
        const windowDays = daysInclusive(s.windowStart, s.windowEnd);
        const activeDays = Math.max(0, daysInclusive(s.windowStart, effectiveEnd) - pausedDays(s.windowStart, effectiveEnd));
        if (s.kind === "session") {
          excused = activeDays === 0 && achieved + EPS < target;
        } else if (activeDays === 0) {
          excused = true;
        } else if (activeDays < windowDays) {
          target = Math.max(step, roundTo((s.targetValue * activeDays) / windowDays, decimals));
        }
      }
      if (excused) return inert("excused");

      const done = achieved + EPS >= target;
      let state: SlotState;
      if (done) state = "completed";
      else if (completedOn && s.windowStart >= completedOn) state = "cancelled";
      else if (compareDates(effectiveEnd, today) < 0 || completedOn) state = "missed";
      else if (compareDates(s.windowStart, today) > 0) state = "upcoming";
      else state = "due";
      if (state === "cancelled") return inert("cancelled");

      return {
        ...base,
        target,
        percent: target > 0 ? (achieved / target) * 100 : 0,
        exceeded: achieved > target + EPS,
        state,
      };
    });

  const counted = evaluations.filter((e) => !["cancelled", "skipped", "excused"].includes(e.state));
  const scheduled = counted.filter((e) => e.kind !== "total");

  // ---- totals --------------------------------------------------------------
  const totalTarget = roundTo(counted.reduce((n, e) => n + e.target, 0), decimals);
  const loggedLogs = asOf ? logs : [];
  const totalLogged = roundTo(loggedLogs.reduce((n, l) => n + l.value, 0), decimals);
  const goalPercent = totalTarget > 0 ? (totalLogged / totalTarget) * 100 : 0;

  // ---- daily planned / logged series --------------------------------------
  const plannedByDay = new Map<ISODate, number>();
  const addPlanned = (d: ISODate, v: number) => plannedByDay.set(d, (plannedByDay.get(d) ?? 0) + v);
  for (const e of counted) {
    if (e.kind === "session") {
      addPlanned(e.windowStart, e.target);
      continue;
    }
    const end = completedOn ? minDate(e.windowEnd, completedOn) : e.windowEnd;
    const days = eachDay(e.windowStart, end).filter((d) => pausedDays(d, d) === 0);
    if (days.length === 0) continue;
    for (const d of days) addPlanned(d, e.target / days.length);
  }
  const loggedByDay = new Map<ISODate, number>();
  for (const l of logs) loggedByDay.set(l.localDate, (loggedByDay.get(l.localDate) ?? 0) + l.value);

  const seriesEnd = completedOn ? minDate(maxDate(completedOn, challenge.startDate), challenge.endDate) : challenge.endDate;
  let cumLogged = 0;
  let cumPlanned = 0;
  const daily: DayPoint[] = eachDay(challenge.startDate, maxDate(seriesEnd, challenge.startDate)).map((date) => {
    const logged = loggedByDay.get(date) ?? 0;
    const planned = plannedByDay.get(date) ?? 0;
    cumLogged += logged;
    cumPlanned += planned;
    return {
      date,
      logged: roundTo(logged, decimals),
      planned: roundTo(planned, decimals + 1),
      cumulativeLogged: asOf && compareDates(date, asOf) <= 0 ? roundTo(cumLogged, decimals) : null,
      cumulativePlanned: roundTo(cumPlanned, decimals + 1),
    };
  });

  // While a challenge is still running, today's session isn't "due" yet, so pace is judged against
  // the plan through yesterday. Once it has ended or been completed the full plan applies.
  const paceDate: ISODate | null = !asOf ? null : phase === "running" || phase === "paused" ? addDays(asOf, -1) : asOf;
  const expectedToDate = paceDate ? (daily.find((d) => d.date === paceDate)?.cumulativePlanned ?? 0) : 0;
  let pace: Pace | null = null;
  if (asOf && expectedToDate > 0) {
    const ratio = totalLogged / expectedToDate;
    pace = ratio > 1.05 ? "ahead" : ratio < 0.95 ? "behind" : "on_track";
  }

  // ---- weekly roll-up ------------------------------------------------------
  const weekMap = new Map<ISODate, WeekPoint>();
  for (const d of daily) {
    const ws = startOfIsoWeek(d.date);
    const w = weekMap.get(ws) ?? { weekStart: ws, logged: 0, planned: 0, sessionsCompleted: 0, sessionsCounted: 0 };
    w.logged += d.logged;
    w.planned += d.planned;
    weekMap.set(ws, w);
  }
  for (const e of scheduled) {
    const w = weekMap.get(startOfIsoWeek(e.windowStart));
    if (!w) continue;
    w.sessionsCounted += 1;
    if (e.state === "completed") w.sessionsCompleted += 1;
  }
  const weekly = [...weekMap.values()]
    .map((w) => ({ ...w, logged: roundTo(w.logged, decimals), planned: roundTo(w.planned, decimals) }))
    .sort((a, b) => compareDates(a.weekStart, b.weekStart));

  // ---- session counts ------------------------------------------------------
  const count = (s: SlotState) => scheduled.filter((e) => e.state === s).length;
  const sessionsCompleted = count("completed");
  const sessionsMissed = count("missed");
  const dueOrMissed = sessionsCompleted + sessionsMissed;

  // ---- activity stats ------------------------------------------------------
  const activeDaySet = new Set(logs.map((l) => l.localDate));
  let bestDay: ChallengeProgress["bestDay"] = null;
  for (const [date, value] of loggedByDay) {
    if (!bestDay || value > bestDay.value) bestDay = { date, value: roundTo(value, decimals) };
  }

  // ---- time -----------------------------------------------------------------
  const daysTotal = daysInclusive(challenge.startDate, challenge.endDate);
  const daysElapsed = asOf ? daysInclusive(challenge.startDate, asOf) : 0;
  const running = phase === "running" || phase === "paused" || phase === "ended";
  const daysRemaining =
    phase === "completed" || phase === "archived" || !started ? (started ? 0 : daysTotal) : Math.max(0, daysInclusive(today, challenge.endDate));
  const remainingToTarget = roundTo(Math.max(0, totalTarget - totalLogged), decimals);
  const activeRemaining = running && phase !== "paused" ? Math.max(0, daysInclusive(today, challenge.endDate)) : 0;

  return {
    phase,
    today,
    asOf,
    daysTotal,
    daysElapsed,
    daysRemaining,
    daysUntilStart: started ? 0 : Math.max(0, toEpochDay(challenge.startDate) - toEpochDay(today)),

    totalTarget,
    totalLogged,
    goalPercent: roundTo(goalPercent, 1),
    goalPercentCapped: Math.min(100, roundTo(goalPercent, 1)),
    targetReached: totalTarget > 0 && totalLogged + EPS >= totalTarget,
    exceededBy: roundTo(Math.max(0, totalLogged - totalTarget), decimals),
    remainingToTarget,
    requiredPerDay: activeRemaining > 0 ? roundTo(remainingToTarget / activeRemaining, decimals + 1) : null,

    expectedToDate: roundTo(expectedToDate, decimals),
    pace,

    sessionsCompleted,
    sessionsMissed,
    sessionsDue: count("due"),
    sessionsUpcoming: count("upcoming"),
    sessionsSkipped: evaluations.filter((e) => e.state === "skipped" && e.kind !== "total").length,
    sessionsCounted: scheduled.length,
    adherencePercent: dueOrMissed > 0 ? Math.round((sessionsCompleted / dueOrMissed) * 100) : null,

    logCount: logs.length,
    activeDays: activeDaySet.size,
    averagePerActiveDay: activeDaySet.size > 0 ? roundTo(totalLogged / activeDaySet.size, decimals + 1) : null,
    bestDay,

    streak: computeStreaks({ evaluations, logs, today, frequency: input.frequency }),
    slots: evaluations,
    daily,
    weekly,
  };
}
