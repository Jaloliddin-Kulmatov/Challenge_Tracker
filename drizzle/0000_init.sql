CREATE TYPE "public"."challenge_category" AS ENUM('fitness', 'study', 'work', 'health', 'mindfulness', 'creative', 'finance', 'other');--> statement-breakpoint
CREATE TYPE "public"."challenge_status" AS ENUM('active', 'paused', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."target_frequency" AS ENUM('daily', 'weekly_days', 'weekly_flexible', 'total');--> statement-breakpoint
CREATE TYPE "public"."slot_kind" AS ENUM('session', 'week', 'total');--> statement-breakpoint
CREATE TYPE "public"."slot_status" AS ENUM('planned', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."tracking_method" AS ENUM('completion', 'quantity');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"challenge_id" uuid NOT NULL,
	"type" text NOT NULL,
	"earned_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"scheduled_activity_id" uuid,
	"value" numeric(14, 2) NOT NULL,
	"unit" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"local_date" date NOT NULL,
	"timezone" text NOT NULL,
	"notes" text,
	"client_request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "al_value" CHECK ("activity_logs"."value" > 0),
	CONSTRAINT "al_notes_len" CHECK ("activity_logs"."notes" is null or char_length("activity_logs"."notes") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "challenge_configurations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"frequency" "target_frequency" NOT NULL,
	"weekdays" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
	"session_target" numeric(14, 2),
	"weekly_target" numeric(14, 2),
	"weekday_targets" jsonb,
	"total_target" numeric(14, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cc_session_target" CHECK ("challenge_configurations"."session_target" is null or "challenge_configurations"."session_target" > 0),
	CONSTRAINT "cc_weekly_target" CHECK ("challenge_configurations"."weekly_target" is null or "challenge_configurations"."weekly_target" > 0),
	CONSTRAINT "cc_total_target" CHECK ("challenge_configurations"."total_target" is null or "challenge_configurations"."total_target" > 0),
	CONSTRAINT "cc_weekdays" CHECK ("challenge_configurations"."weekdays" <@ array[1,2,3,4,5,6,7]::smallint[]),
	CONSTRAINT "cc_frequency_fields" CHECK (("challenge_configurations"."frequency" <> 'daily' or "challenge_configurations"."session_target" is not null)
        and ("challenge_configurations"."frequency" <> 'weekly_flexible' or "challenge_configurations"."weekly_target" is not null)
        and ("challenge_configurations"."frequency" <> 'total' or "challenge_configurations"."total_target" is not null)
        and ("challenge_configurations"."frequency" <> 'weekly_days' or (cardinality("challenge_configurations"."weekdays") > 0 and ("challenge_configurations"."weekly_target" is not null or "challenge_configurations"."weekday_targets" is not null))))
);
--> statement-breakpoint
CREATE TABLE "challenge_pauses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cp_dates" CHECK ("challenge_pauses"."end_date" is null or "challenge_pauses"."end_date" >= "challenge_pauses"."start_date")
);
--> statement-breakpoint
CREATE TABLE "challenge_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"token" text NOT NULL,
	"show_notes" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenge_shares_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" "challenge_category" DEFAULT 'other' NOT NULL,
	"tracking_method" "tracking_method" NOT NULL,
	"unit" text,
	"value_decimals" smallint DEFAULT 0 NOT NULL,
	"color" text DEFAULT 'emerald' NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"original_end_date" date NOT NULL,
	"status" "challenge_status" DEFAULT 'active' NOT NULL,
	"completed_at" timestamp with time zone,
	"completed_local_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "challenges_title_len" CHECK (char_length("challenges"."title") between 1 and 120),
	CONSTRAINT "challenges_description_len" CHECK ("challenges"."description" is null or char_length("challenges"."description") <= 2000),
	CONSTRAINT "challenges_dates" CHECK ("challenges"."end_date" >= "challenges"."start_date"),
	CONSTRAINT "challenges_duration" CHECK ("challenges"."end_date" - "challenges"."start_date" < 800),
	CONSTRAINT "challenges_unit" CHECK (("challenges"."tracking_method" = 'quantity') = ("challenges"."unit" is not null)),
	CONSTRAINT "challenges_decimals" CHECK ("challenges"."value_decimals" between 0 and 2),
	CONSTRAINT "challenges_completed" CHECK ("challenges"."status" <> 'completed' or "challenges"."completed_at" is not null)
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"title" text NOT NULL,
	"threshold_percent" numeric(5, 2),
	"threshold_value" numeric(14, 2),
	"is_custom" boolean DEFAULT false NOT NULL,
	"reached_at" timestamp with time zone,
	"reached_local_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ms_one_threshold" CHECK (("milestones"."threshold_percent" is null) <> ("milestones"."threshold_value" is null)),
	CONSTRAINT "ms_percent_range" CHECK ("milestones"."threshold_percent" is null or "milestones"."threshold_percent" between 1 and 100),
	CONSTRAINT "ms_value_pos" CHECK ("milestones"."threshold_value" is null or "milestones"."threshold_value" > 0),
	CONSTRAINT "ms_title_len" CHECK (char_length("milestones"."title") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"user_id" text PRIMARY KEY NOT NULL,
	"daily_reminder_enabled" boolean DEFAULT false NOT NULL,
	"reminder_time" text DEFAULT '08:00' NOT NULL,
	"weekly_summary_enabled" boolean DEFAULT false NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "np_time_format" CHECK ("notification_preferences"."reminder_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "np_channel" CHECK ("notification_preferences"."channel" in ('email', 'push', 'none'))
);
--> statement-breakpoint
CREATE TABLE "scheduled_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge_id" uuid NOT NULL,
	"kind" "slot_kind" NOT NULL,
	"window_start" date NOT NULL,
	"window_end" date NOT NULL,
	"natural_start" date NOT NULL,
	"target_value" numeric(14, 2) NOT NULL,
	"status" "slot_status" DEFAULT 'planned' NOT NULL,
	"is_customized" boolean DEFAULT false NOT NULL,
	"label" text,
	"time_of_day" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sa_window" CHECK ("scheduled_activities"."window_end" >= "scheduled_activities"."window_start"),
	CONSTRAINT "sa_target" CHECK ("scheduled_activities"."target_value" > 0),
	CONSTRAINT "sa_label_len" CHECK ("scheduled_activities"."label" is null or char_length("scheduled_activities"."label") <= 80),
	CONSTRAINT "sa_time" CHECK ("scheduled_activities"."time_of_day" is null or "scheduled_activities"."time_of_day" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_scheduled_activity_id_scheduled_activities_id_fk" FOREIGN KEY ("scheduled_activity_id") REFERENCES "public"."scheduled_activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_configurations" ADD CONSTRAINT "challenge_configurations_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_pauses" ADD CONSTRAINT "challenge_pauses_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenge_shares" ADD CONSTRAINT "challenge_shares_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_activities" ADD CONSTRAINT "scheduled_activities_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ach_challenge_type_uq" ON "achievements" USING btree ("challenge_id","type");--> statement-breakpoint
CREATE INDEX "ach_user_idx" ON "achievements" USING btree ("user_id","earned_at");--> statement-breakpoint
CREATE INDEX "al_challenge_date_idx" ON "activity_logs" USING btree ("challenge_id","local_date");--> statement-breakpoint
CREATE INDEX "al_slot_idx" ON "activity_logs" USING btree ("scheduled_activity_id");--> statement-breakpoint
CREATE INDEX "al_user_date_idx" ON "activity_logs" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE UNIQUE INDEX "al_request_uq" ON "activity_logs" USING btree ("user_id","client_request_id") WHERE "activity_logs"."client_request_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "cc_challenge_effective_uq" ON "challenge_configurations" USING btree ("challenge_id","effective_from");--> statement-breakpoint
CREATE INDEX "cp_challenge_idx" ON "challenge_pauses" USING btree ("challenge_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cp_one_open_uq" ON "challenge_pauses" USING btree ("challenge_id") WHERE "challenge_pauses"."end_date" is null;--> statement-breakpoint
CREATE INDEX "cs_challenge_idx" ON "challenge_shares" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "challenges_owner_status_idx" ON "challenges" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "challenges_owner_start_idx" ON "challenges" USING btree ("owner_id","start_date");--> statement-breakpoint
CREATE INDEX "ms_challenge_idx" ON "milestones" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX "sa_challenge_window_idx" ON "scheduled_activities" USING btree ("challenge_id","window_start");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");