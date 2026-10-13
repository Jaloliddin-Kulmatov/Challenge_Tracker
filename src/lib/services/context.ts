import type { Db } from "@/lib/db/client";
import { localDateIn, type ISODate } from "@/lib/core/dates";

/** Everything a use-case needs: who is acting, where to write, and what time it is. */
export interface Ctx {
  db: Db;
  user: { id: string; timezone: string };
  now: Date;
}

export function todayOf(ctx: Pick<Ctx, "user" | "now">): ISODate {
  return localDateIn(ctx.now, ctx.user.timezone);
}
