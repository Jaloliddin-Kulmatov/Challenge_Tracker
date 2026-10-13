import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { isValidTimeZone } from "@/lib/core/dates";
import type { Ctx } from "@/lib/services/context";
import { AppError } from "@/lib/services/errors";
import { getAuth } from "./auth";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  timezone: string;
  isDemo: boolean;
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  // Read the request headers first: that opts the page into dynamic rendering, so nothing here
  // (database, auth secret) is touched while `next build` pre-renders.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const u = session.user as typeof session.user & { timezone?: string; isDemo?: boolean };
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    timezone: u.timezone && isValidTimeZone(u.timezone) ? u.timezone : "UTC",
    isDemo: Boolean(u.isDemo),
  };
});

/** For server components: send signed-out visitors to the login page. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export function ctxFor(user: SessionUser): Ctx {
  return { db: getDb(), user: { id: user.id, timezone: user.timezone }, now: new Date() };
}

/** For server components. */
export async function requireCtx(): Promise<{ ctx: Ctx; user: SessionUser }> {
  const user = await requireUser();
  return { ctx: ctxFor(user), user };
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function requireActionCtx(): Promise<Ctx> {
  const user = await getSessionUser();
  if (!user) throw new AppError("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
  return ctxFor(user);
}
