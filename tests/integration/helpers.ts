import { randomUUID } from "node:crypto";
import { createDb } from "@/lib/db/client";
import * as s from "@/lib/db/schema";
import type { Ctx } from "@/lib/services/context";

const url = process.env.TEST_DATABASE_URL ?? "postgres://app:app@127.0.0.1:5432/challenges_test";
export const { db, client } = createDb(url, { max: 5 });

export async function makeUser(timezone = "UTC", name = "Test User") {
  const id = randomUUID();
  await db.insert(s.user).values({ id, name, email: `${id}@example.test`, timezone });
  return { id, timezone };
}

/** A request context at a fixed instant – lets tests move through time. */
export function at(user: { id: string; timezone: string }, iso: string): Ctx {
  return { db, user, now: new Date(iso) };
}

export const dailyRunning = (over: Record<string, unknown> = {}) => ({
  title: "Run 5 km a day",
  category: "fitness",
  trackingMethod: "quantity",
  unit: "km",
  valueDecimals: 1,
  startDate: "2025-03-03",
  endDate: "2025-03-16",
  rule: { frequency: "daily", sessionTarget: 5 },
  ...over,
});
