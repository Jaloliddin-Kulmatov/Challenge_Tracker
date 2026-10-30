import { and, eq } from "drizzle-orm";
import { z } from "zod";
import * as s from "@/lib/db/schema";
import { compareDates, type ISODate } from "@/lib/core/dates";
import { applyContent, parsePlanContent } from "@/lib/plan/content";
import { parseWeekPeriod, validateCheck, weekRange, checkKey } from "@/lib/plan/logic";
import { DEFAULT_PLAN_KEY, getTemplate } from "@/lib/plan/templates";
import type { PlanTemplate } from "@/lib/plan/types";
import { parseInput } from "@/lib/validation";
import type { Ctx } from "./context";
import { todayOf } from "./context";
import { badState, invalid, notFound } from "./errors";

export interface MetricView {
  week: number;
  weightKg: number | null;
  longRunKm: number | null;
}

export interface PlanData {
  templateKey: string;
  /** The plan as this user sees it: the default template with their edits laid over it. */
  template: PlanTemplate;
  /** True once the user has changed anything. */
  edited: boolean;
  startDate: ISODate;
  endDate: ISODate;
  /** Every ticked item as "taskKey|period". */
  checks: string[];
  metrics: MetricView[];
}

const baseOf = (key: string) => {
  const t = getTemplate(key);
  if (!t) throw invalid("Unknown plan.");
  return t;
};

async function findPlan(ctx: Ctx, templateKey: string) {
  const [row] = await ctx.db
    .select()
    .from(s.plans)
    .where(and(eq(s.plans.ownerId, ctx.user.id), eq(s.plans.templateKey, templateKey)))
    .limit(1);
  return row ?? null;
}

const num = (v: string | null) => (v === null ? null : Number(v));

export async function hasPlan(ctx: Ctx): Promise<boolean> {
  const rows = await ctx.db.select({ id: s.plans.id }).from(s.plans).where(eq(s.plans.ownerId, ctx.user.id)).limit(1);
  return rows.length > 0;
}

export async function getPlanData(ctx: Ctx, templateKey = DEFAULT_PLAN_KEY): Promise<PlanData | null> {
  const plan = await findPlan(ctx, templateKey);
  if (!plan) return null;
  const [checks, metrics] = await Promise.all([
    ctx.db.select().from(s.planChecks).where(eq(s.planChecks.planId, plan.id)),
    ctx.db.select().from(s.planMetrics).where(eq(s.planMetrics.planId, plan.id)),
  ]);
  return {
    templateKey: plan.templateKey,
    template: applyContent(baseOf(plan.templateKey), plan.content),
    edited: plan.content !== null,
    startDate: plan.startDate,
    endDate: plan.endDate,
    checks: checks.map((c) => checkKey(c.taskKey, c.periodKey)),
    metrics: metrics
      .map((m) => ({ week: m.week, weightKg: num(m.weightKg), longRunKm: num(m.longRunKm) }))
      .sort((a, b) => a.week - b.week),
  };
}

/** Start the plan (idempotent: starting twice returns the same plan). */
export async function startPlan(ctx: Ctx, templateKey = DEFAULT_PLAN_KEY): Promise<PlanData> {
  const t = baseOf(templateKey);
  await ctx.db
    .insert(s.plans)
    .values({ ownerId: ctx.user.id, templateKey: t.key, startDate: t.startDate, endDate: t.endDate })
    .onConflictDoNothing();
  const data = await getPlanData(ctx, t.key);
  if (!data) throw badState("The plan could not be started. Please try again.");
  return data;
}

const checkSchema = z.object({
  templateKey: z.string().max(60).default(DEFAULT_PLAN_KEY),
  taskKey: z.string().min(1).max(80),
  period: z.string().min(1).max(20),
  checked: z.boolean(),
});

/** Tick or untick one item. Idempotent; only valid items can be stored. */
export async function setCheck(ctx: Ctx, raw: unknown): Promise<void> {
  const input = parseInput(checkSchema, raw);
  const base = baseOf(input.templateKey);
  const plan = await findPlan(ctx, base.key);
  if (!plan) throw notFound("Your plan");
  const t = applyContent(base, plan.content);
  const problem = validateCheck(t, input.taskKey, input.period, todayOf(ctx));
  if (problem) throw invalid(problem);

  if (input.checked) {
    await ctx.db.insert(s.planChecks).values({ planId: plan.id, taskKey: input.taskKey, periodKey: input.period }).onConflictDoNothing();
  } else {
    await ctx.db
      .delete(s.planChecks)
      .where(and(eq(s.planChecks.planId, plan.id), eq(s.planChecks.taskKey, input.taskKey), eq(s.planChecks.periodKey, input.period)));
  }
}

const metricsSchema = z.object({
  templateKey: z.string().max(60).default(DEFAULT_PLAN_KEY),
  period: z.string().max(20),
  weightKg: z.number().finite().min(30, "Weight must be between 30 and 250 kg.").max(250, "Weight must be between 30 and 250 kg.").nullable().optional(),
  longRunKm: z.number().finite().min(0).max(200, "That long run is too far to be true.").nullable().optional(),
});

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Save the Sunday-review numbers for a week. Omitted fields are left alone; `null` clears a field. */
export async function saveMetrics(ctx: Ctx, raw: unknown): Promise<void> {
  const input = parseInput(metricsSchema, raw);
  const base = baseOf(input.templateKey);
  const plan = await findPlan(ctx, base.key);
  if (!plan) throw notFound("Your plan");
  const t = applyContent(base, plan.content);
  const week = parseWeekPeriod(t, input.period);
  if (week === null) throw invalid("Invalid week.");
  if (compareDates(weekRange(t, week).start, todayOf(ctx)) > 0) throw invalid("That week hasn't started yet.");

  const values: Partial<typeof s.planMetrics.$inferInsert> = {};
  if (input.weightKg !== undefined) values.weightKg = input.weightKg === null ? null : round1(input.weightKg).toFixed(1);
  if (input.longRunKm !== undefined) values.longRunKm = input.longRunKm === null ? null : round1(input.longRunKm).toFixed(1);
  if (Object.keys(values).length === 0) throw invalid("Enter at least one number.");

  await ctx.db
    .insert(s.planMetrics)
    .values({ planId: plan.id, week, ...values })
    .onConflictDoUpdate({ target: [s.planMetrics.planId, s.planMetrics.week], set: { ...values, updatedAt: new Date() } });
}

const contentInput = z.object({ templateKey: z.string().max(60).default(DEFAULT_PLAN_KEY), content: z.unknown() });

/** Replace the user's edits (goals, tasks, targets…). Ticks of removed items stay stored but no longer count. */
export async function savePlanContent(ctx: Ctx, raw: unknown): Promise<void> {
  const input = parseInput(contentInput, raw);
  const base = baseOf(input.templateKey);
  const plan = await findPlan(ctx, base.key);
  if (!plan) throw notFound("Your plan");
  const parsed = parsePlanContent(input.content, base);
  if (!parsed.ok) throw invalid(parsed.error);
  await ctx.db.update(s.plans).set({ content: parsed.content }).where(and(eq(s.plans.id, plan.id), eq(s.plans.ownerId, ctx.user.id)));
}

/** Go back to the default plan (ticks and numbers are kept). */
export async function resetPlanContent(ctx: Ctx, templateKey = DEFAULT_PLAN_KEY): Promise<void> {
  const base = baseOf(templateKey);
  const plan = await findPlan(ctx, base.key);
  if (!plan) throw notFound("Your plan");
  await ctx.db.update(s.plans).set({ content: null }).where(and(eq(s.plans.id, plan.id), eq(s.plans.ownerId, ctx.user.id)));
}
