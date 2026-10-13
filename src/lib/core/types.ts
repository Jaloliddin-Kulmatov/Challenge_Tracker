import type { ISODate } from "./dates";

export const CATEGORIES = [
  "fitness",
  "study",
  "work",
  "health",
  "mindfulness",
  "creative",
  "finance",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** `completion`: done / not done (no number). `quantity`: a measured value in `unit`. */
export const TRACKING_METHODS = ["completion", "quantity"] as const;
export type TrackingMethod = (typeof TRACKING_METHODS)[number];

/**
 * daily            – the same target every day
 * weekly_days      – chosen weekdays; a weekly total split across them, or a custom target per weekday
 * weekly_flexible  – a weekly target that can be fulfilled on any day of the week
 * total            – one overall target for the whole challenge, no fixed schedule
 */
export const FREQUENCIES = ["daily", "weekly_days", "weekly_flexible", "total"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const CHALLENGE_STATUSES = ["active", "paused", "completed", "archived"] as const;
export type ChallengeStatus = (typeof CHALLENGE_STATUSES)[number];

/** A schedule slot: a single `session` (one day), a `week` window, or one `total` window. */
export type SlotKind = "session" | "week" | "total";
export type SlotStatus = "planned" | "skipped" | "cancelled";

/**
 * One versioned set of target rules (the "challenge configuration").
 * A challenge has one or more of these; the latest whose `effectiveFrom` is on or before
 * a date governs that date. Editing a target never rewrites history – it adds a new rule.
 */
export interface TargetRule {
  effectiveFrom: ISODate;
  frequency: Frequency;
  /** ISO weekdays (Mon = 1 … Sun = 7); used by `weekly_days`. */
  weekdays: number[];
  /** `daily`: target per day. */
  sessionTarget: number | null;
  /** `weekly_days` (split evenly over `weekdays`) and `weekly_flexible`. */
  weeklyTarget: number | null;
  /** `weekly_days` only: explicit target per weekday (keys "1".."7"); overrides `weeklyTarget`. */
  weekdayTargets: Record<string, number> | null;
  /** `total`: overall target. */
  totalTarget: number | null;
}

export interface PlannedSlot {
  kind: SlotKind;
  windowStart: ISODate;
  windowEnd: ISODate;
  targetValue: number;
}

export interface SlotRecord extends PlannedSlot {
  id: string;
  naturalStart: ISODate;
  status: SlotStatus;
  isCustomized: boolean;
  label: string | null;
  timeOfDay: string | null;
}

export interface LogRecord {
  id: string;
  value: number;
  localDate: ISODate;
  occurredAt: Date;
  scheduledActivityId: string | null;
  notes?: string | null;
}

export interface PauseRecord {
  startDate: ISODate;
  /** null while the challenge is still paused. */
  endDate: ISODate | null;
}

export interface ChallengeCore {
  startDate: ISODate;
  endDate: ISODate;
  status: ChallengeStatus;
  trackingMethod: TrackingMethod;
  valueDecimals: number;
  /** Local date on which the challenge was completed (set when status = completed). */
  completedLocalDate: ISODate | null;
}
