import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { isValidISODate, type ISODate } from "@/lib/core/dates";
import * as s from "@/lib/db/schema";
import { parseInput } from "@/lib/validation";
import type { Ctx } from "./context";
import { invalid, notFound } from "./errors";

export interface Todo {
  id: string;
  title: string;
  dueDate: ISODate | null;
  done: boolean;
}

const MAX_OPEN = 200;

const toTodo = (r: typeof s.todos.$inferSelect): Todo => ({ id: r.id, title: r.title, dueDate: r.dueDate, done: r.doneAt !== null });

/** Open to-dos: the ones with a due date first (soonest first), then the rest, oldest first. */
export async function listOpenTodos(ctx: Ctx): Promise<Todo[]> {
  const rows = await ctx.db
    .select()
    .from(s.todos)
    .where(and(eq(s.todos.userId, ctx.user.id), isNull(s.todos.doneAt)))
    .orderBy(sql`${s.todos.dueDate} asc nulls last`, asc(s.todos.createdAt));
  return rows.map(toTodo);
}

/** The few most recently completed ones (so a mistaken tap can be undone). */
export async function listRecentDone(ctx: Ctx, limit = 5): Promise<Todo[]> {
  const rows = await ctx.db
    .select()
    .from(s.todos)
    .where(and(eq(s.todos.userId, ctx.user.id), sql`${s.todos.doneAt} is not null`))
    .orderBy(desc(s.todos.doneAt))
    .limit(limit);
  return rows.map(toTodo);
}

const addSchema = z.object({
  title: z.string().trim().min(1, "A to-do can't be empty.").max(200, "That to-do is too long (max 200 characters)."),
  dueDate: z.string().nullable().optional(),
});

export async function addTodo(ctx: Ctx, raw: unknown): Promise<Todo> {
  const input = parseInput(addSchema, raw);
  if (input.dueDate != null && !isValidISODate(input.dueDate)) throw invalid("That date isn't valid.");
  const [counted] = await ctx.db.select({ n: sql<number>`count(*)::int` }).from(s.todos).where(and(eq(s.todos.userId, ctx.user.id), isNull(s.todos.doneAt)));
  if ((counted?.n ?? 0) >= MAX_OPEN) throw invalid("You have 200 open to-dos. Finish or delete some first.");
  const [row] = await ctx.db.insert(s.todos).values({ userId: ctx.user.id, title: input.title, dueDate: input.dueDate ?? null }).returning();
  return toTodo(row!);
}

/** Done / not done again. Only your own to-dos exist for you: anything else is "not found". */
export async function setTodoDone(ctx: Ctx, id: string, done: boolean): Promise<Todo> {
  const [row] = await ctx.db
    .update(s.todos)
    .set({ doneAt: done ? new Date() : null })
    .where(and(eq(s.todos.id, id), eq(s.todos.userId, ctx.user.id)))
    .returning();
  if (!row) throw notFound("That to-do");
  return toTodo(row);
}

export async function deleteTodo(ctx: Ctx, id: string): Promise<Todo> {
  const [row] = await ctx.db.delete(s.todos).where(and(eq(s.todos.id, id), eq(s.todos.userId, ctx.user.id))).returning();
  if (!row) throw notFound("That to-do");
  return toTodo(row);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isTodoId = (id: string) => UUID.test(id);

/** Open to-dos due today or earlier (what the evening reminder should mention). */
export async function listDueTodos(ctx: Ctx, today: ISODate): Promise<Todo[]> {
  return (await listOpenTodos(ctx)).filter((t) => t.dueDate !== null && t.dueDate <= today);
}
