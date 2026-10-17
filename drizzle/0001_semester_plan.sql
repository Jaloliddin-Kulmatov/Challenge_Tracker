CREATE TABLE "plan_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"task_key" text NOT NULL,
	"period_key" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_checks_len" CHECK (char_length("plan_checks"."task_key") between 1 and 80 and char_length("plan_checks"."period_key") between 1 and 20)
);
--> statement-breakpoint
CREATE TABLE "plan_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"week" smallint NOT NULL,
	"weight_kg" numeric(4, 1),
	"youtube_subs" integer,
	"instagram_subs" integer,
	"long_run_km" numeric(4, 1),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pm_week" CHECK ("plan_metrics"."week" between 1 and 60),
	CONSTRAINT "pm_weight" CHECK ("plan_metrics"."weight_kg" is null or "plan_metrics"."weight_kg" between 30 and 250),
	CONSTRAINT "pm_subs" CHECK (("plan_metrics"."youtube_subs" is null or "plan_metrics"."youtube_subs" between 0 and 100000000) and ("plan_metrics"."instagram_subs" is null or "plan_metrics"."instagram_subs" between 0 and 100000000)),
	CONSTRAINT "pm_run" CHECK ("plan_metrics"."long_run_km" is null or "plan_metrics"."long_run_km" between 0 and 200)
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"template_key" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plans_dates" CHECK ("plans"."end_date" >= "plans"."start_date")
);
--> statement-breakpoint
ALTER TABLE "plan_checks" ADD CONSTRAINT "plan_checks_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_metrics" ADD CONSTRAINT "plan_metrics_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "plan_checks_uq" ON "plan_checks" USING btree ("plan_id","task_key","period_key");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_metrics_uq" ON "plan_metrics" USING btree ("plan_id","week");--> statement-breakpoint
CREATE UNIQUE INDEX "plans_owner_template_uq" ON "plans" USING btree ("owner_id","template_key");