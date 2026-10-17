import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { AppError } from "@/lib/services/errors";
import { getPlanData, hasPlan, saveMetrics, setCheck, startPlan } from "@/lib/services/plan";
import { at, client, db, makeUser } from "./helpers";

afterAll(async () => {
  await client.end();
});

const rejects = async (p: Promise<unknown>, code: string, msg?: RegExp) => {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe(code);
  if (msg) expect((err as AppError).message).toMatch(msg);
};

const WED = "2026-10-21T10:00:00Z"; // Wednesday of week 1 (UTC)

describe("semester plan", () => {
  it("starts once (idempotent) and survives a fresh read", async () => {
    const u = await makeUser();
    expect(await hasPlan(at(u, WED))).toBe(false);
    expect(await getPlanData(at(u, WED))).toBeNull();
    const a = await startPlan(at(u, WED));
    const b = await startPlan(at(u, WED));
    expect(a.startDate).toBe("2026-10-19");
    expect(a.endDate).toBe("2027-02-28");
    expect(b.checks).toEqual([]);
    expect(await db.select().from(s.plans).where(eq(s.plans.ownerId, u.id))).toHaveLength(1);
    expect(await hasPlan(at(u, WED))).toBe(true);
  });

  it("ticks and unticks idempotently, and stores nothing for rejected ticks", async () => {
    const u = await makeUser();
    const ctx = at(u, WED);
    await startPlan(ctx);
    await setCheck(ctx, { taskKey: "daily:exercise", period: "2026-10-21", checked: true });
    await setCheck(ctx, { taskKey: "daily:exercise", period: "2026-10-21", checked: true });
    await Promise.all([1, 2, 3].map(() => setCheck(ctx, { taskKey: "daily:german", period: "2026-10-21", checked: true })));
    let d = (await getPlanData(ctx))!;
    expect(d.checks.sort()).toEqual(["daily:exercise|2026-10-21", "daily:german|2026-10-21"]);

    await setCheck(ctx, { taskKey: "daily:exercise", period: "2026-10-21", checked: false });
    await setCheck(ctx, { taskKey: "daily:exercise", period: "2026-10-21", checked: false }); // already gone: fine
    d = (await getPlanData(ctx))!;
    expect(d.checks).toEqual(["daily:german|2026-10-21"]);

    await rejects(setCheck(ctx, { taskKey: "daily:german", period: "2026-10-22", checked: true }), "VALIDATION", /hasn't happened/);
    await rejects(setCheck(ctx, { taskKey: "daily:exercise", period: "2026-10-20", checked: true }), "VALIDATION", /isn't scheduled/);
    await rejects(setCheck(ctx, { taskKey: "daily:german", period: "2026-10-10", checked: true }), "VALIDATION", /outside/);
    await rejects(setCheck(ctx, { taskKey: "made:up", period: "once", checked: true }), "VALIDATION");
    await rejects(setCheck(ctx, { taskKey: "x".repeat(200), period: "once", checked: true }), "VALIDATION");
    expect((await getPlanData(ctx))!.checks).toEqual(["daily:german|2026-10-21"]);
  });

  it("covers goals, weekly goals, week tasks and monthly key results", async () => {
    const u = await makeUser();
    const ctx = at(u, WED);
    await startPlan(ctx);
    await setCheck(ctx, { taskKey: "goal:grades", period: "once", checked: true });
    await setCheck(ctx, { taskKey: "weekly:youtube", period: "W1", checked: true });
    await setCheck(ctx, { taskKey: "wtask:w1t1", period: "W1", checked: true });
    await setCheck(ctx, { taskKey: "wtask:w9t1", period: "W9", checked: true }); // finishing a later week's task early is allowed
    await setCheck(ctx, { taskKey: "mres:oct:r1", period: "once", checked: true });
    await rejects(setCheck(ctx, { taskKey: "weekly:youtube", period: "W2", checked: true }), "VALIDATION", /hasn't started/);
    await rejects(setCheck(ctx, { taskKey: "wtask:w1t1", period: "W2", checked: true }), "VALIDATION");
    expect((await getPlanData(ctx))!.checks).toHaveLength(5);
  });

  it("uses the user's own time zone for 'today'", async () => {
    const kl = await makeUser("Asia/Kuala_Lumpur");
    const utc = await makeUser("UTC");
    const instant = "2026-10-20T17:00:00Z"; // Oct 21 01:00 in Kuala Lumpur, Oct 20 17:00 in UTC
    await startPlan(at(kl, instant));
    await startPlan(at(utc, instant));
    await setCheck(at(kl, instant), { taskKey: "daily:german", period: "2026-10-21", checked: true });
    await rejects(setCheck(at(utc, instant), { taskKey: "daily:german", period: "2026-10-21", checked: true }), "VALIDATION", /hasn't happened/);
  });

  it("keeps each user's plan private", async () => {
    const a = await makeUser();
    const b = await makeUser();
    await startPlan(at(a, WED));
    await setCheck(at(a, WED), { taskKey: "goal:grades", period: "once", checked: true });
    // b has no plan: cannot tick, and sees nothing of a's
    await rejects(setCheck(at(b, WED), { taskKey: "goal:grades", period: "once", checked: true }), "NOT_FOUND");
    await rejects(saveMetrics(at(b, WED), { period: "W1", weightKg: 70 }), "NOT_FOUND");
    expect(await getPlanData(at(b, WED))).toBeNull();
    await startPlan(at(b, WED));
    expect((await getPlanData(at(b, WED)))!.checks).toEqual([]);
    expect((await getPlanData(at(a, WED)))!.checks).toEqual(["goal:grades|once"]);
  });

  it("saves the Sunday numbers: partial updates, clearing, validation", async () => {
    const u = await makeUser();
    const ctx = at(u, "2026-10-26T10:00:00Z"); // Monday of week 2
    await startPlan(ctx);
    await saveMetrics(ctx, { period: "W1", weightKg: 71.26, youtubeSubs: 12 });
    await saveMetrics(ctx, { period: "W1", instagramSubs: 9, longRunKm: 15 }); // adds, doesn't wipe
    let m = (await getPlanData(ctx))!.metrics;
    expect(m).toEqual([{ week: 1, weightKg: 71.3, youtubeSubs: 12, instagramSubs: 9, longRunKm: 15 }]);
    await saveMetrics(ctx, { period: "W1", weightKg: null });
    m = (await getPlanData(ctx))!.metrics;
    expect(m[0]!.weightKg).toBeNull();
    expect(m[0]!.youtubeSubs).toBe(12);

    await rejects(saveMetrics(ctx, { period: "W1" }), "VALIDATION", /at least one/i);
    await rejects(saveMetrics(ctx, { period: "W1", weightKg: 5 }), "VALIDATION");
    await rejects(saveMetrics(ctx, { period: "W1", youtubeSubs: -3 }), "VALIDATION");
    await rejects(saveMetrics(ctx, { period: "W1", youtubeSubs: 1.5 }), "VALIDATION");
    await rejects(saveMetrics(ctx, { period: "W1", longRunKm: 5000 }), "VALIDATION");
    await rejects(saveMetrics(ctx, { period: "W3", weightKg: 70 }), "VALIDATION", /hasn't started/);
    await rejects(saveMetrics(ctx, { period: "W99", weightKg: 70 }), "VALIDATION");
    expect((await getPlanData(ctx))!.metrics).toHaveLength(1);
  });

  it("removes everything when the user is deleted", async () => {
    const u = await makeUser();
    const { startDate } = await startPlan(at(u, WED));
    await setCheck(at(u, WED), { taskKey: "goal:grades", period: "once", checked: true });
    await saveMetrics(at(u, WED), { period: "W1", weightKg: 70 });
    const [plan] = await db.select().from(s.plans).where(eq(s.plans.ownerId, u.id));
    expect(plan!.startDate).toBe(startDate);
    await db.delete(s.user).where(eq(s.user.id, u.id));
    expect(await db.select().from(s.plans).where(eq(s.plans.ownerId, u.id))).toEqual([]);
    expect(await db.select().from(s.planChecks).where(eq(s.planChecks.planId, plan!.id))).toEqual([]);
    expect(await db.select().from(s.planMetrics).where(eq(s.planMetrics.planId, plan!.id))).toEqual([]);
  });
});
