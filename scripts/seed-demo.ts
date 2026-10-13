/**
 * Creates ONE clearly-labelled demo account with sample challenges and back-dated sample logs, so you
 * can explore the app with realistic-looking data. The data is generated here, flagged `is_demo`, and
 * the UI shows a "Demo account" banner for it. It is never mixed with real users' data.
 *
 *   ENABLE_DEMO_SEED=true npm run db:seed
 *   login: demo@example.com / demo-password-123
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";
import { createDb } from "../src/lib/db/client";
import * as s from "../src/lib/db/schema";
import { addDays, localDateIn, type ISODate } from "../src/lib/core/dates";
import { completeChallenge, createChallenge, pauseChallenge, resumeChallenge } from "../src/lib/services/challenges";
import { createLog } from "../src/lib/services/logs";
import type { Ctx } from "../src/lib/services/context";

if (process.env.ENABLE_DEMO_SEED !== "true") {
  console.error("Refusing to seed: set ENABLE_DEMO_SEED=true to confirm you want the demo account created.");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const EMAIL = "demo@example.com";
const PASSWORD = "demo-password-123";
const TZ = "UTC";
const { db, client } = createDb(url, { max: 3 });

// deterministic pseudo-random so the demo looks the same every run
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(42);

async function main() {
  await db.delete(s.user).where(eq(s.user.email, EMAIL)); // cascades to everything the demo owned
  const id = randomUUID();
  await db.insert(s.user).values({ id, name: "Demo Account (sample data)", email: EMAIL, emailVerified: true, timezone: TZ, isDemo: true });
  await db.insert(s.account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: await hashPassword(PASSWORD) });

  const real = new Date();
  const today: ISODate = localDateIn(real, TZ);
  const at = (date: ISODate, hour = 18): Ctx => ({ db, user: { id, timezone: TZ }, now: new Date(`${date}T${String(hour).padStart(2, "0")}:00:00Z`) });
  const ctxNow: Ctx = { db, user: { id, timezone: TZ }, now: real };

  /** Log on past days with a hit-rate and some over/under-achievement. */
  async function backfill(challengeId: string, from: ISODate, to: ISODate, opts: { days?: number[]; target: number; hit: number; quantity: boolean; skip?: (d: ISODate) => boolean }) {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (opts.skip?.(d)) continue;
      const dow = ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
      if (opts.days && !opts.days.includes(dow)) continue;
      if (rnd() > opts.hit) continue;
      const factor = rnd() > 0.2 ? 1 + rnd() * 0.3 : 0.6 + rnd() * 0.3; // mostly hits the target, sometimes falls short
      await createLog(at(d), {
        challengeId,
        value: opts.quantity ? Math.max(0.5, Math.round(opts.target * factor * 2) / 2) : undefined,
        notes: rnd() > 0.85 ? "Sample note" : undefined,
      });
    }
  }

  // 1. Running – in progress, 3 days a week, some misses
  const run = await createChallenge(at(addDays(today, -20), 7), {
    title: "Run 100 km in 30 days (demo)", category: "fitness", trackingMethod: "quantity", unit: "km", valueDecimals: 1, color: "emerald",
    startDate: addDays(today, -20), endDate: addDays(today, 9), rule: { frequency: "weekly_days", weekdays: [2, 4, 6], weeklyTarget: 24 },
  });
  await backfill(run.id, addDays(today, -20), addDays(today, -1), { days: [2, 4, 6], target: 8, hit: 0.8, quantity: true });

  // 2. Study – daily minutes, good streak
  const study = await createChallenge(at(addDays(today, -12), 7), {
    title: "Study 2 hours a day (demo)", category: "study", trackingMethod: "quantity", unit: "min", valueDecimals: 0, color: "violet",
    startDate: addDays(today, -12), endDate: addDays(today, 17), rule: { frequency: "daily", sessionTarget: 120 },
  });
  await backfill(study.id, addDays(today, -12), addDays(today, -1), { target: 120, hit: 0.9, quantity: true });

  // 3. Meditation – no numbers, paused for two days and resumed
  const med = await createChallenge(at(addDays(today, -9), 7), {
    title: "Meditate every day (demo)", category: "mindfulness", trackingMethod: "completion", color: "teal",
    startDate: addDays(today, -9), endDate: addDays(today, 11), rule: { frequency: "daily" },
  });
  await backfill(med.id, addDays(today, -9), addDays(today, -6), { target: 1, hit: 0.9, quantity: false });
  await pauseChallenge(at(addDays(today, -5), 8), med.id);
  await resumeChallenge(at(addDays(today, -3), 8), med.id);
  await backfill(med.id, addDays(today, -3), addDays(today, -1), { target: 1, hit: 0.9, quantity: false });

  // 4. A finished challenge, completed a few days early
  const read = await createChallenge(at(addDays(today, -31), 7), {
    title: "Read 20 pages a day (demo)", category: "study", trackingMethod: "quantity", unit: "pages", valueDecimals: 0, color: "amber",
    startDate: addDays(today, -31), endDate: addDays(today, -7), rule: { frequency: "daily", sessionTarget: 20 },
  });
  await backfill(read.id, addDays(today, -31), addDays(today, -10), { target: 22, hit: 0.95, quantity: true });
  await completeChallenge(at(addDays(today, -10), 21), read.id);

  // 5. Starts in the future
  await createChallenge(ctxNow, {
    title: "Write 30,000 words in 60 days (demo)", category: "creative", trackingMethod: "quantity", unit: "words", valueDecimals: 0, color: "rose",
    startDate: addDays(today, 5), endDate: addDays(today, 64), rule: { frequency: "total", totalTarget: 30000 },
  });

  console.log(`Demo account ready.\n  email:    ${EMAIL}\n  password: ${PASSWORD}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => client.end());
