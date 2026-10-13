/**
 * Database schema (PostgreSQL via Drizzle).
 *
 * Auth tables (user/session/account/verification) follow Better Auth's expected shape.
 * Domain tables hang off `challenges`; every row is reachable from exactly one owner, which is
 * what the service layer's authorization checks rely on.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const day = (name: string) => date(name, { mode: "string" });
const amount = (name: string) => numeric(name, { precision: 14, scale: 2 });

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------
export const categoryEnum = pgEnum("challenge_category", [
  "fitness", "study", "work", "health", "mindfulness", "creative", "finance", "other",
]);
export const trackingMethodEnum = pgEnum("tracking_method", ["completion", "quantity"]);
export const frequencyEnum = pgEnum("target_frequency", ["daily", "weekly_days", "weekly_flexible", "total"]);
export const challengeStatusEnum = pgEnum("challenge_status", ["active", "paused", "completed", "archived"]);
export const slotKindEnum = pgEnum("slot_kind", ["session", "week", "total"]);
export const slotStatusEnum = pgEnum("slot_status", ["planned", "skipped", "cancelled"]);

// ---------------------------------------------------------------------------
// Auth (Better Auth) + profile
// ---------------------------------------------------------------------------
export const user = pgTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  /** IANA zone used to decide which calendar day "today" is. */
  timezone: text().notNull().default("UTC"),
  /** True only for the clearly labelled demo account created by the seed script. */
  isDemo: boolean().notNull().default(false),
});

export const session = pgTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text().notNull().unique(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    ipAddress: text(),
    userAgent: text(),
    userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text(),
    password: text(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
    dailyReminderEnabled: boolean().notNull().default(false),
    /** Local wall-clock time, "HH:MM". */
    reminderTime: text().notNull().default("08:00"),
    weeklySummaryEnabled: boolean().notNull().default(false),
    channel: text().notNull().default("email"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check("np_time_format", sql`${t.reminderTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check("np_channel", sql`${t.channel} in ('email', 'push', 'none')`),
  ],
);

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------
export const challenges = pgTable(
  "challenges",
  {
    id: uuid().primaryKey().defaultRandom(),
    ownerId: text("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    title: text().notNull(),
    description: text(),
    category: categoryEnum().notNull().default("other"),
    trackingMethod: trackingMethodEnum("tracking_method").notNull(),
    /** Unit of measure for quantity challenges (km, pages, min …); null for completion challenges. */
    unit: text(),
    /** How many decimal places values are recorded with (0–2). */
    valueDecimals: smallint("value_decimals").notNull().default(0),
    color: text().notNull().default("emerald"),
    startDate: day("start_date").notNull(),
    endDate: day("end_date").notNull(),
    originalEndDate: day("original_end_date").notNull(),
    status: challengeStatusEnum().notNull().default("active"),
    completedAt: ts("completed_at"),
    completedLocalDate: day("completed_local_date"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("challenges_owner_status_idx").on(t.ownerId, t.status),
    index("challenges_owner_start_idx").on(t.ownerId, t.startDate),
    check("challenges_title_len", sql`char_length(${t.title}) between 1 and 120`),
    check("challenges_description_len", sql`${t.description} is null or char_length(${t.description}) <= 2000`),
    check("challenges_dates", sql`${t.endDate} >= ${t.startDate}`),
    check("challenges_duration", sql`${t.endDate} - ${t.startDate} < 800`),
    check("challenges_unit", sql`(${t.trackingMethod} = 'quantity') = (${t.unit} is not null)`),
    check("challenges_decimals", sql`${t.valueDecimals} between 0 and 2`),
    check("challenges_completed", sql`${t.status} <> 'completed' or ${t.completedAt} is not null`),
  ],
);

/** Versioned target rules ("ChallengeConfiguration"): the latest rule on or before a date governs it. */
export const challengeConfigurations = pgTable(
  "challenge_configurations",
  {
    id: uuid().primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
    effectiveFrom: day("effective_from").notNull(),
    frequency: frequencyEnum().notNull(),
    weekdays: smallint().array().notNull().default(sql`'{}'::smallint[]`),
    sessionTarget: amount("session_target"),
    weeklyTarget: amount("weekly_target"),
    weekdayTargets: jsonb("weekday_targets").$type<Record<string, number>>(),
    totalTarget: amount("total_target"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("cc_challenge_effective_uq").on(t.challengeId, t.effectiveFrom),
    check("cc_session_target", sql`${t.sessionTarget} is null or ${t.sessionTarget} > 0`),
    check("cc_weekly_target", sql`${t.weeklyTarget} is null or ${t.weeklyTarget} > 0`),
    check("cc_total_target", sql`${t.totalTarget} is null or ${t.totalTarget} > 0`),
    check("cc_weekdays", sql`${t.weekdays} <@ array[1,2,3,4,5,6,7]::smallint[]`),
    check(
      "cc_frequency_fields",
      sql`(${t.frequency} <> 'daily' or ${t.sessionTarget} is not null)
        and (${t.frequency} <> 'weekly_flexible' or ${t.weeklyTarget} is not null)
        and (${t.frequency} <> 'total' or ${t.totalTarget} is not null)
        and (${t.frequency} <> 'weekly_days' or (cardinality(${t.weekdays}) > 0 and (${t.weeklyTarget} is not null or ${t.weekdayTargets} is not null)))`,
    ),
  ],
);

/** Concrete schedule: one row per planned session, weekly window, or overall-goal window. */
export const scheduledActivities = pgTable(
  "scheduled_activities",
  {
    id: uuid().primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
    kind: slotKindEnum().notNull(),
    windowStart: day("window_start").notNull(),
    windowEnd: day("window_end").notNull(),
    /** The date the rules generated this slot for (stays put when the user reschedules it). */
    naturalStart: day("natural_start").notNull(),
    targetValue: amount("target_value").notNull(),
    status: slotStatusEnum().notNull().default("planned"),
    /** True once the user moved / retargeted / added it by hand: regeneration leaves it alone. */
    isCustomized: boolean("is_customized").notNull().default(false),
    label: text(),
    /** Preferred wall-clock time "HH:MM" (informational). */
    timeOfDay: text("time_of_day"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("sa_challenge_window_idx").on(t.challengeId, t.windowStart),
    check("sa_window", sql`${t.windowEnd} >= ${t.windowStart}`),
    check("sa_target", sql`${t.targetValue} > 0`),
    check("sa_label_len", sql`${t.label} is null or char_length(${t.label}) <= 80`),
    check("sa_time", sql`${t.timeOfDay} is null or ${t.timeOfDay} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
  ],
);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: uuid().primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    scheduledActivityId: uuid("scheduled_activity_id").references(() => scheduledActivities.id, { onDelete: "set null" }),
    /** 1 for completion challenges; the measured amount otherwise. */
    value: amount("value").notNull(),
    unit: text(),
    occurredAt: ts("occurred_at").notNull(),
    /** Calendar date in `timezone` when the activity happened – frozen, so later time-zone changes never move it. */
    localDate: day("local_date").notNull(),
    timezone: text().notNull(),
    notes: text(),
    /** Client-generated idempotency key so a double tap or retry never logs twice. */
    clientRequestId: text("client_request_id"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("al_challenge_date_idx").on(t.challengeId, t.localDate),
    index("al_slot_idx").on(t.scheduledActivityId),
    index("al_user_date_idx").on(t.userId, t.localDate),
    uniqueIndex("al_request_uq").on(t.userId, t.clientRequestId).where(sql`${t.clientRequestId} is not null`),
    check("al_value", sql`${t.value} > 0`),
    check("al_notes_len", sql`${t.notes} is null or char_length(${t.notes}) <= 2000`),
  ],
);

/** A pause covers [startDate, endDate) – endDate is the day the challenge resumed (null while paused). */
export const challengePauses = pgTable(
  "challenge_pauses",
  {
    id: uuid().primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
    startDate: day("start_date").notNull(),
    endDate: day("end_date"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("cp_challenge_idx").on(t.challengeId),
    uniqueIndex("cp_one_open_uq").on(t.challengeId).where(sql`${t.endDate} is null`),
    check("cp_dates", sql`${t.endDate} is null or ${t.endDate} >= ${t.startDate}`),
  ],
);

export const milestones = pgTable(
  "milestones",
  {
    id: uuid().primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
    title: text().notNull(),
    /** Exactly one of the two thresholds is set. */
    thresholdPercent: numeric("threshold_percent", { precision: 5, scale: 2 }),
    thresholdValue: amount("threshold_value"),
    isCustom: boolean("is_custom").notNull().default(false),
    reachedAt: ts("reached_at"),
    reachedLocalDate: day("reached_local_date"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("ms_challenge_idx").on(t.challengeId),
    check("ms_one_threshold", sql`(${t.thresholdPercent} is null) <> (${t.thresholdValue} is null)`),
    check("ms_percent_range", sql`${t.thresholdPercent} is null or ${t.thresholdPercent} between 1 and 100`),
    check("ms_value_pos", sql`${t.thresholdValue} is null or ${t.thresholdValue} > 0`),
    check("ms_title_len", sql`char_length(${t.title}) between 1 and 80`),
  ],
);

export const achievements = pgTable(
  "achievements",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    challengeId: uuid("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
    type: text().notNull(),
    earnedAt: ts("earned_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ach_challenge_type_uq").on(t.challengeId, t.type),
    index("ach_user_idx").on(t.userId, t.earnedAt),
  ],
);

export const challengeShares = pgTable(
  "challenge_shares",
  {
    id: uuid().primaryKey().defaultRandom(),
    challengeId: uuid("challenge_id").notNull().references(() => challenges.id, { onDelete: "cascade" }),
    token: text().notNull().unique(),
    showNotes: boolean("show_notes").notNull().default(false),
    expiresAt: ts("expires_at"),
    revokedAt: ts("revoked_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("cs_challenge_idx").on(t.challengeId)],
);

export type UserRow = typeof user.$inferSelect;
export type ChallengeRow = typeof challenges.$inferSelect;
export type ConfigurationRow = typeof challengeConfigurations.$inferSelect;
export type ScheduledActivityRow = typeof scheduledActivities.$inferSelect;
export type ActivityLogRow = typeof activityLogs.$inferSelect;
export type MilestoneRow = typeof milestones.$inferSelect;
export type AchievementRow = typeof achievements.$inferSelect;
export type ShareRow = typeof challengeShares.$inferSelect;
