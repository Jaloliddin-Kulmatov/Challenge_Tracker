import { z } from "zod";
import { CATEGORIES, FREQUENCIES, TRACKING_METHODS } from "@/lib/core/types";
import { isValidISODate, isValidTimeZone } from "@/lib/core/dates";
import { AppError } from "@/lib/services/errors";

export { COLORS } from "./colors";
import { COLORS } from "./colors";

const isoDate = z.string().refine(isValidISODate, "Enter a valid date.");
const target = z.number({ error: "Enter a number." }).finite("Enter a number.").positive("Must be greater than zero.").max(100_000_000, "That number is too large.");
const optionalTarget = target.nullable().optional();
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM.");

export const ruleInputSchema = z.object({
  frequency: z.enum(FREQUENCIES),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
  sessionTarget: optionalTarget,
  weeklyTarget: optionalTarget,
  weekdayTargets: z.record(z.string().regex(/^[1-7]$/), target).nullable().optional(),
  totalTarget: optionalTarget,
});
export type RuleInput = z.infer<typeof ruleInputSchema>;

export const createChallengeSchema = z.object({
  title: z.string().trim().min(1, "Give your challenge a name.").max(120, "Keep the name under 120 characters."),
  description: z.string().trim().max(2000, "Keep the description under 2000 characters.").optional().nullable(),
  category: z.enum(CATEGORIES).default("other"),
  trackingMethod: z.enum(TRACKING_METHODS),
  unit: z.string().trim().max(16, "Keep the unit under 16 characters.").optional().nullable(),
  valueDecimals: z.number().int().min(0).max(2).default(0),
  color: z.enum(COLORS).default("emerald"),
  startDate: isoDate,
  endDate: isoDate,
  rule: ruleInputSchema,
  customMilestones: z
    .array(z.object({ title: z.string().trim().min(1).max(80), thresholdValue: target }))
    .max(10)
    .default([]),
});
export type CreateChallengeInput = z.infer<typeof createChallengeSchema>;

export const updateDetailsSchema = z.object({
  title: z.string().trim().min(1, "Give your challenge a name.").max(120),
  description: z.string().trim().max(2000).optional().nullable(),
  category: z.enum(CATEGORIES),
  color: z.enum(COLORS),
});

export const changeRuleSchema = z.object({
  rule: ruleInputSchema,
  /** Defaults to today. Must not be in the past. */
  effectiveFrom: isoDate.optional(),
});

export const logInputSchema = z.object({
  challengeId: z.uuid(),
  value: z.number({ error: "Enter a number." }).finite().positive("Enter a value greater than zero.").max(1_000_000, "That number is too large.").optional(),
  localDate: isoDate.optional(),
  time: hhmm.optional(),
  notes: z.string().trim().max(2000, "Keep notes under 2000 characters.").optional().nullable(),
  scheduledActivityId: z.uuid().optional().nullable(),
  clientRequestId: z.string().min(8).max(64).optional(),
});
export type LogInput = z.infer<typeof logInputSchema>;

export const updateLogSchema = z.object({
  logId: z.uuid(),
  value: z.number().finite().positive("Enter a value greater than zero.").max(1_000_000).optional(),
  localDate: isoDate.optional(),
  time: hhmm.optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80),
  timezone: z.string().refine(isValidTimeZone, "Choose a valid time zone."),
});

export const notificationSchema = z.object({
  dailyReminderEnabled: z.boolean(),
  reminderTime: hhmm,
  weeklySummaryEnabled: z.boolean(),
  channel: z.enum(["email", "push", "none"]),
});

export const shareSchema = z.object({
  showNotes: z.boolean().default(false),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});

/** Parse input with zod and convert failures into a user-facing AppError with per-field messages. */
export function parseInput<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const res = schema.safeParse(raw);
  if (res.success) return res.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of res.error.issues) {
    const key = issue.path.join(".") || "_";
    fieldErrors[key] ??= issue.message;
  }
  const first = Object.values(fieldErrors)[0] ?? "Please check the form and try again.";
  throw new AppError("VALIDATION", first, fieldErrors);
}

export const endDateSchema = isoDate;
export const datesSchema = z.object({ startDate: isoDate, endDate: isoDate });
export const milestoneSchema = z.object({
  title: z.string().trim().min(1, "Give the milestone a name.").max(80),
  thresholdValue: target,
});
