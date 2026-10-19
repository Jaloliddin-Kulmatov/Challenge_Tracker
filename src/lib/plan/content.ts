/**
 * The editable part of a plan. The template in code is the default; a user's edits are stored as one JSON document
 * and laid over it. Keys of goals / tasks / books / results never change once created, so ticks keep pointing at
 * the right item when its text is edited, and a deleted item's old ticks simply stop counting.
 */
import { z } from "zod";
import type { PlanContent, PlanTemplate } from "./types";

const text = (what: string, max = 200) => z.string().trim().min(1, `${what} can't be empty.`).max(max, `${what} is too long (max ${max} characters).`);
const key = z.string().regex(/^[a-z0-9-]{1,30}$/, "Invalid id.");
const weekdays = z
  .array(z.number().int().min(1).max(7))
  .min(1, "Choose at least one day for each daily task.")
  .max(7)
  .transform((d) => [...new Set(d)].sort((a, b) => a - b));
const count = (what: string, max: number) =>
  z.number({ error: `${what} must be a number.` }).finite().int(`${what} must be a whole number.`).min(0, `${what} can't be negative.`).max(max, `${what} is too large.`);

function unique<T>(items: readonly T[], id: (x: T) => string, what: string, ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  for (const x of items) {
    if (seen.has(id(x))) ctx.addIssue({ code: "custom", message: `Duplicate ${what}.` });
    seen.add(id(x));
  }
}

const goal = z.object({ key, area: text("A goal name", 60), target: text("A goal", 200) });
const dailyTask = z.object({
  key,
  title: text("A daily task", 120),
  weekdays,
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 19:00.").optional(),
  detailByWeekday: z.record(z.coerce.number().int().min(1).max(7), z.string().max(60)).optional(),
  appendLongRunOn: z.number().int().min(1).max(7).optional(),
  habit: z.string().trim().max(40).optional(),
});
const result = z.object({ id: z.string().regex(/^[a-z0-9-]{1,30}$/), text: text("A monthly result", 120) });

const month = z.object({
  key,
  name: text("A month name", 30),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  focus: text("A month focus", 60),
  youtube: count("YouTube target", 100_000_000),
  instagram: count("Instagram target", 100_000_000),
  longRunKm: z.number({ error: "Long run must be a number." }).finite().min(0, "Long run can't be negative.").max(200, "That long run is too far to be true."),
  weightKg: z.number().finite().min(30, "Weight must be between 30 and 250 kg.").max(250, "Weight must be between 30 and 250 kg.").nullable(),
  books: count("Books", 100),
  results: z.array(result).max(20, "At most 20 results per month.").superRefine((r, c) => unique(r, (x) => x.id, "result", c)),
});

const week = z.object({
  n: z.number().int().min(1).max(60),
  longRun: z.string().trim().max(60),
  tasks: z.array(z.object({ id: z.string().regex(/^w\d+t\d+$/), text: text("A week task", 160) })).max(30, "At most 30 tasks per week."),
});

export const planContentSchema = z
  .object({
    goals: z.array(goal).max(30, "At most 30 goals."),
    dailyTasks: z.array(dailyTask).max(30, "At most 30 daily tasks."),
    weeklyGoals: z.array(goal).max(30, "At most 30 weekly goals."),
    books: z.array(z.object({ id: key, title: text("A book title", 120) })).max(30, "At most 30 books."),
    months: z.array(month).min(1).max(24),
    weeks: z.array(week).min(1).max(60),
  })
  .superRefine((c, ctx) => {
    unique(c.goals, (x) => x.key, "goal", ctx);
    unique(c.dailyTasks, (x) => x.key, "daily task", ctx);
    unique(c.weeklyGoals, (x) => x.key, "weekly goal", ctx);
    unique(c.books, (x) => x.id, "book", ctx);
    unique(c.months, (x) => x.key, "month", ctx);
    unique(c.weeks, (x) => String(x.n), "week", ctx);
    for (const w of c.weeks) unique(w.tasks, (x) => x.id, "week task", ctx);
  });

/** Validate edited content against the template it edits: the months and weeks themselves are fixed by the dates. */
export function parsePlanContent(raw: unknown, base: PlanTemplate): { ok: true; content: PlanContent } | { ok: false; error: string } {
  const parsed = planContentSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "That doesn't look right." };
  const c = parsed.data as PlanContent;
  const sameKeys = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i]);
  if (!sameKeys(c.months.map((m) => m.key), base.months.map((m) => m.key)) || !sameKeys(c.weeks.map((w) => String(w.n)), base.weeks.map((w) => String(w.n))))
    return { ok: false, error: "The months and weeks of a plan can't be added or removed." };
  const baseMonths = new Map(base.months.map((m) => [m.key, m]));
  if (c.months.some((m) => m.year !== baseMonths.get(m.key)!.year || m.month !== baseMonths.get(m.key)!.month))
    return { ok: false, error: "The months of a plan can't be moved." };
  return { ok: true, content: c };
}

export function contentOf(t: PlanTemplate): PlanContent {
  return { goals: t.goals, dailyTasks: t.dailyTasks, weeklyGoals: t.weeklyGoals, books: t.books, months: t.months, weeks: t.weeks };
}

/** The template with the user's edits laid over it (or the template itself when there are none). */
export function applyContent(base: PlanTemplate, content: PlanContent | null | undefined): PlanTemplate {
  return content ? { ...base, ...content } : base;
}

/** A fresh id that can't collide with an old (possibly ticked) one. */
export function newId(prefix = "x"): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;
}
