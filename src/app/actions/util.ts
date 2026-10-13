import "server-only";
import { revalidatePath } from "next/cache";
import { requireActionCtx } from "@/lib/auth/session";
import type { Ctx } from "@/lib/services/context";
import { toAppError } from "@/lib/services/errors";

export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string>; unauthenticated?: boolean };

/**
 * Wraps every server action: authenticates, runs the use-case, and converts *any* failure into an
 * `{ ok: false }` result. The UI only ever shows success after receiving `{ ok: true }`.
 */
export async function run<T>(fn: (ctx: Ctx) => Promise<T>): Promise<ActionResult<T>> {
  try {
    const ctx = await requireActionCtx();
    const data = await fn(ctx);
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (err) {
    const e = toAppError(err);
    if (e.code === "INTERNAL") console.error("[action failed]", err);
    return { ok: false, error: e.message, fieldErrors: e.fieldErrors, unauthenticated: e.code === "UNAUTHENTICATED" };
  }
}
