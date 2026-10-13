import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { changeEndDate, changeTargetRule, completeChallenge, createChallenge, getChallengeDetail, getDashboard, pauseChallenge, resumeChallenge, rescheduleUpcoming } from "@/lib/services/challenges";
import { createLog, deleteLog, updateLog } from "@/lib/services/logs";
import { AppError } from "@/lib/services/errors";
import { at, client, db, dailyRunning, makeUser } from "./helpers";

afterAll(async () => {
  await client.end();
});

const rejects = async (p: Promise<unknown>, code?: string, messagePart?: string | RegExp) => {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(AppError);
  if (code) expect((err as AppError).code).toBe(code);
  if (messagePart) expect((err as AppError).message).toMatch(messagePart);
};

describe("creating a challenge", () => {
  it("persists the challenge, its rule, its schedule and default milestones", async () => {
    const u = await makeUser();
    const { id } = await createChallenge(at(u, "2025-03-03T08:00:00Z"), dailyRunning());
    const d = (await getChallengeDetail(at(u, "2025-03-03T08:00:00Z"), id))!;
    expect(d.challenge.title).toBe("Run 5 km a day");
    expect(d.progress.slots).toHaveLength(14);
    expect(d.progress.totalTarget).toBe(70);
    expect(d.rules).toHaveLength(1);
    expect(d.milestones.map((m) => m.thresholdPercent)).toEqual([25, 50, 75, 100]);
    expect(d.milestones.find((m) => m.thresholdPercent === 50)?.resolvedValue).toBe(35);
    expect(d.progress.phase).toBe("running");
  });

  it("rejects invalid input with field errors and writes nothing", async () => {
    const u = await makeUser();
    const ctx = at(u, "2025-03-03T08:00:00Z");
    await rejects(createChallenge(ctx, dailyRunning({ title: "   " })), "VALIDATION");
    await rejects(createChallenge(ctx, dailyRunning({ endDate: "2025-03-01" })), "VALIDATION", /end date/i);
    await rejects(createChallenge(ctx, dailyRunning({ unit: null })), "VALIDATION", /unit/i);
    await rejects(createChallenge(ctx, dailyRunning({ rule: { frequency: "daily", sessionTarget: 0 } })), "VALIDATION");
    await rejects(createChallenge(ctx, dailyRunning({ rule: { frequency: "weekly_days", weekdays: [], weeklyTarget: 10 } })), "VALIDATION");
    await rejects(createChallenge(ctx, dailyRunning({ startDate: "2024-01-01" })), "VALIDATION", /past/i);
    await rejects(createChallenge(ctx, dailyRunning({ startDate: "2025-02-30" })), "VALIDATION");
    expect(await db.select().from(s.challenges).where(eq(s.challenges.ownerId, u.id))).toHaveLength(0);
  });

  it("supports a completion (no number) challenge", async () => {
    const u = await makeUser();
    const ctx = at(u, "2025-03-03T08:00:00Z");
    const { id } = await createChallenge(ctx, {
      title: "Meditate", trackingMethod: "completion", startDate: "2025-03-03", endDate: "2025-03-09", rule: { frequency: "daily", sessionTarget: 99 },
    });
    const log = await createLog(ctx, { challengeId: id, value: 42 }); // value is ignored for completion challenges
    expect(log.log.value).toBe(1);
    const d = (await getChallengeDetail(ctx, id))!;
    expect(d.challenge.unit).toBeNull();
    expect(d.progress.totalTarget).toBe(7);
    expect(d.progress.sessionsCompleted).toBe(1);
  });

  it("handles a user with no challenges", async () => {
    const u = await makeUser();
    const dash = await getDashboard(at(u, "2025-03-03T08:00:00Z"));
    expect(dash.challenges).toEqual([]);
    expect(dash.recentAchievements).toEqual([]);
  });
});

describe("logging activity", () => {
  it("sums multiple sessions in one day and awards milestones/achievements", async () => {
    const u = await makeUser();
    const { id } = await createChallenge(at(u, "2025-03-03T06:00:00Z"), dailyRunning());
    const a = await createLog(at(u, "2025-03-03T07:00:00Z"), { challengeId: id, value: 2 });
    const b = await createLog(at(u, "2025-03-03T18:00:00Z"), { challengeId: id, value: 3.5, notes: "evening jog" });
    expect(a.newAchievements).toContain("first_log");
    expect(b.progress.totalLogged).toBe(5.5);
    const d = (await getChallengeDetail(at(u, "2025-03-03T19:00:00Z"), id))!;
    expect(d.progress.slots[0]!.achieved).toBe(5.5);
    expect(d.progress.slots[0]!.state).toBe("completed");
    expect(d.progress.slots[0]!.exceeded).toBe(true);
    expect(d.logs).toHaveLength(2);
    expect(d.logs.map((l) => l.value).sort()).toEqual([2, 3.5]);
  });

  it("is idempotent for retried requests (double tap)", async () => {
    const u = await makeUser();
    const ctx = at(u, "2025-03-03T07:00:00Z");
    const { id } = await createChallenge(ctx, dailyRunning());
    const req = { challengeId: id, value: 4, clientRequestId: "req-abcdef123456" };
    const results = await Promise.all([createLog(ctx, req), createLog(ctx, req), createLog(ctx, req)]);
    expect(results.filter((r) => !r.deduplicated)).toHaveLength(1);
    const d = (await getChallengeDetail(ctx, id))!;
    expect(d.logs).toHaveLength(1);
    expect(d.progress.totalLogged).toBe(4);
  });

  it("rejects future dates, dates outside the challenge and bad values", async () => {
    const u = await makeUser();
    const ctx = at(u, "2025-03-05T07:00:00Z");
    const { id } = await createChallenge(ctx, dailyRunning());
    await rejects(createLog(ctx, { challengeId: id, value: 3, localDate: "2025-03-06" }), "VALIDATION", /future/i);
    await rejects(createLog(ctx, { challengeId: id, value: 3, localDate: "2025-03-01" }), "VALIDATION", /starts on/i);
    await rejects(createLog(ctx, { challengeId: id, value: 3, time: "23:59" }), "VALIDATION", /future/i);
    await rejects(createLog(ctx, { challengeId: id, value: 0 }), "VALIDATION");
    await rejects(createLog(ctx, { challengeId: id, value: -2 }), "VALIDATION");
    await rejects(createLog(ctx, { challengeId: id }), "VALIDATION", /how much/i);
    await rejects(createLog(ctx, { challengeId: id, value: 3, notes: "x".repeat(2001) }), "VALIDATION");
    await rejects(createLog(at(u, "2025-03-20T07:00:00Z"), { challengeId: id, value: 3 }), "VALIDATION", /ended/i);
    expect((await getChallengeDetail(ctx, id))!.logs).toHaveLength(0);
  });

  it("allows back-dated logs within the challenge", async () => {
    const u = await makeUser("Asia/Seoul");
    const ctx = at(u, "2025-03-05T07:00:00Z"); // 16:00 in Seoul
    const { id } = await createChallenge(ctx, dailyRunning());
    const r = await createLog(ctx, { challengeId: id, value: 5, localDate: "2025-03-04", time: "06:30" });
    expect(r.log.localDate).toBe("2025-03-04");
    expect(r.log.time).toBe("06:30");
    const d = (await getChallengeDetail(ctx, id))!;
    expect(d.progress.slots[1]!.state).toBe("completed");
  });

  it("a challenge that starts in the future cannot be logged yet and shows a countdown", async () => {
    const u = await makeUser();
    const ctx = at(u, "2025-03-01T10:00:00Z");
    const { id } = await createChallenge(ctx, dailyRunning());
    const d = (await getChallengeDetail(ctx, id))!;
    expect(d.progress.phase).toBe("upcoming");
    expect(d.progress.daysUntilStart).toBe(2);
    expect(d.progress.sessionsMissed).toBe(0);
    await rejects(createLog(ctx, { challengeId: id, value: 5 }), "VALIDATION", /starts on/i);
  });

  it("deleting a log restores 'missed', un-reaches milestones and revokes achievements", async () => {
    const u = await makeUser();
    const { id } = await createChallenge(at(u, "2025-03-03T06:00:00Z"), dailyRunning());
    const first = await createLog(at(u, "2025-03-03T07:00:00Z"), { challengeId: id, value: 5 });
    const second = await createLog(at(u, "2025-03-04T07:00:00Z"), { challengeId: id, value: 30 }); // 35 of 70: crosses 25% and 50%
    expect(second.reachedMilestones).toEqual(expect.arrayContaining(["A quarter of the way", "Halfway there"]));

    const ctx = at(u, "2025-03-06T07:00:00Z");
    let d = (await getChallengeDetail(ctx, id))!;
    expect(d.milestones.filter((m) => m.reachedLocalDate).length).toBe(2);
    expect(d.achievements.map((a) => a.type)).toEqual(expect.arrayContaining(["first_log", "halfway", "overachiever"]));

    await deleteLog(ctx, second.log.id);
    d = (await getChallengeDetail(ctx, id))!;
    expect(d.progress.totalLogged).toBe(5);
    expect(d.progress.slots[1]!.state).toBe("missed");
    expect(d.milestones.filter((m) => m.reachedLocalDate).length).toBe(0);
    expect(d.achievements.map((a) => a.type)).toEqual(["first_log"]);

    await deleteLog(ctx, first.log.id);
    d = (await getChallengeDetail(ctx, id))!;
    expect(d.achievements).toEqual([]);
    expect(d.logs).toEqual([]);
  });

  it("edits a log's value and date", async () => {
    const u = await makeUser();
    const { id } = await createChallenge(at(u, "2025-03-03T06:00:00Z"), dailyRunning());
    const r = await createLog(at(u, "2025-03-04T07:00:00Z"), { challengeId: id, value: 2 });
    const ctx = at(u, "2025-03-04T09:00:00Z");
    await updateLog(ctx, { logId: r.log.id, value: 6, notes: "felt great" });
    await updateLog(ctx, { logId: r.log.id, localDate: "2025-03-03" });
    const d = (await getChallengeDetail(ctx, id))!;
    expect(d.logs[0]).toMatchObject({ value: 6, localDate: "2025-03-03", notes: "felt great" });
    expect(d.progress.slots[0]!.state).toBe("completed");
    expect(d.progress.slots[1]!.achieved).toBe(0);
  });
});

describe("editing a running challenge", () => {
  it("changing a future target keeps past sessions and logged sessions untouched", async () => {
    const u = await makeUser();
    const { id } = await createChallenge(at(u, "2025-03-03T06:00:00Z"), dailyRunning());
    await createLog(at(u, "2025-03-03T07:00:00Z"), { challengeId: id, value: 5 });
    await createLog(at(u, "2025-03-05T07:00:00Z"), { challengeId: id, value: 4 });
    const ctx = at(u, "2025-03-05T08:00:00Z");
    await changeTargetRule(ctx, id, { rule: { frequency: "daily", sessionTarget: 8 }, effectiveFrom: "2025-03-07" });
    const d = (await getChallengeDetail(ctx, id))!;
    const targets = Object.fromEntries(d.progress.slots.map((x) => [x.windowStart, x.rawTarget]));
    expect(targets["2025-03-03"]).toBe(5);
    expect(targets["2025-03-05"]).toBe(5);
    expect(targets["2025-03-06"]).toBe(5);
    expect(targets["2025-03-07"]).toBe(8);
    expect(targets["2025-03-16"]).toBe(8);
    expect(d.rules).toHaveLength(2);
    expect(d.progress.slots).toHaveLength(14);
    expect(d.progress.totalTarget).toBe(5 * 4 + 8 * 10);
    await rejects(changeTargetRule(ctx, id, { rule: { frequency: "daily", sessionTarget: 8 }, effectiveFrom: "2025-03-01" }), "VALIDATION", /today/i);
  });

  it("cannot switch to/from an overall-goal schedule once started, but can before", async () => {
    const u = await makeUser();
    const ctx = at(u, "2025-03-05T08:00:00Z");
    const { id } = await createChallenge(ctx, dailyRunning());
    await rejects(changeTargetRule(ctx, id, { rule: { frequency: "total", totalTarget: 100 } }), "STATE");

    const future = await createChallenge(ctx, dailyRunning({ startDate: "2025-03-10", endDate: "2025-03-16" }));
    await changeTargetRule(ctx, future.id, { rule: { frequency: "total", totalTarget: 100 } });
    const d = (await getChallengeDetail(ctx, future.id))!;
    expect(d.progress.slots).toHaveLength(1);
    expect(d.progress.totalTarget).toBe(100);
  });

  it("switching to a weekly schedule mid-way applies from the next Monday for weekly windows", async () => {
    const u = await makeUser();
    const ctx = at(u, "2025-03-05T08:00:00Z"); // Wednesday
    const { id } = await createChallenge(ctx, dailyRunning());
    await changeTargetRule(ctx, id, { rule: { frequency: "weekly_flexible", weeklyTarget: 30 } });
    const d = (await getChallengeDetail(ctx, id))!;
    expect(d.rules.map((r) => r.effectiveFrom)).toEqual(["2025-03-03", "2025-03-10"]);
    const weeks = d.progress.slots.filter((x) => x.kind === "week");
    expect(weeks).toHaveLength(1);
    expect(weeks[0]!.rawTarget).toBe(30);
    expect(d.progress.slots.filter((x) => x.kind === "session")).toHaveLength(7);
  });

  it("extends and shortens the duration without losing history", async () => {
    const u = await makeUser();
    const ctx = at(u, "2025-03-10T08:00:00Z");
    const { id } = await createChallenge(at(u, "2025-03-03T06:00:00Z"), dailyRunning());
    await createLog(at(u, "2025-03-04T07:00:00Z"), { challengeId: id, value: 5 });
    await createLog(at(u, "2025-03-10T07:00:00Z"), { challengeId: id, value: 5 });

    await changeEndDate(ctx, id, "2025-03-23");
    let d = (await getChallengeDetail(ctx, id))!;
    expect(d.progress.daysTotal).toBe(21);
    expect(d.progress.slots).toHaveLength(21);
    expect(d.progress.totalTarget).toBe(105);
    expect(d.challenge.originalEndDate).toBe("2025-03-16");

    await changeEndDate(ctx, id, "2025-03-12");
    d = (await getChallengeDetail(ctx, id))!;
    expect(d.progress.slots).toHaveLength(10);
    expect(d.progress.totalLogged).toBe(10);

    await rejects(changeEndDate(ctx, id, "2025-03-09"), "VALIDATION", /logged/i);
    await rejects(changeEndDate(ctx, id, "2025-03-01"), "VALIDATION");
  });

  it("rescheduling an upcoming challenge regenerates the plan", async () => {
    const u = await makeUser();
    const ctx = at(u, "2025-03-01T08:00:00Z");
    const { id } = await createChallenge(ctx, dailyRunning({ startDate: "2025-03-10", endDate: "2025-03-16" }));
    await rescheduleUpcoming(ctx, id, { startDate: "2025-03-12", endDate: "2025-03-25" });
    const d = (await getChallengeDetail(ctx, id))!;
    expect(d.progress.slots).toHaveLength(14);
    expect(d.progress.slots[0]!.windowStart).toBe("2025-03-12");
    expect(d.rules[0]!.effectiveFrom).toBe("2025-03-12");
  });
});

describe("pause, resume and complete", () => {
  it("pausing excuses days, blocks logging, and resuming extends the end date", async () => {
    const u = await makeUser();
    const { id } = await createChallenge(at(u, "2025-03-03T06:00:00Z"), dailyRunning());
    await createLog(at(u, "2025-03-03T07:00:00Z"), { challengeId: id, value: 5 });

    await pauseChallenge(at(u, "2025-03-05T07:00:00Z"), id);
    await rejects(pauseChallenge(at(u, "2025-03-05T08:00:00Z"), id), "STATE", /already paused/);
    await rejects(createLog(at(u, "2025-03-06T07:00:00Z"), { challengeId: id, value: 5 }), "STATE", /paused/i);
    let d = (await getChallengeDetail(at(u, "2025-03-07T07:00:00Z"), id))!;
    expect(d.progress.phase).toBe("paused");
    expect(d.progress.sessionsMissed).toBe(1); // 03-04 was missed before the pause
    expect(d.progress.slots.find((x) => x.windowStart === "2025-03-06")!.state).toBe("excused");

    await resumeChallenge(at(u, "2025-03-08T07:00:00Z"), id); // paused 05, 06, 07 => 3 days
    d = (await getChallengeDetail(at(u, "2025-03-08T08:00:00Z"), id))!;
    expect(d.challenge.status).toBe("active");
    expect(d.challenge.endDate).toBe("2025-03-19");
    expect(d.progress.daysTotal).toBe(17);
    expect(d.progress.slots).toHaveLength(17);
    expect(d.progress.sessionsMissed).toBe(1);
    expect(d.progress.slots.filter((x) => x.state === "excused")).toHaveLength(3);
    expect(d.progress.totalTarget).toBe(14 * 5);
    await rejects(resumeChallenge(at(u, "2025-03-08T09:00:00Z"), id), "STATE");
    await createLog(at(u, "2025-03-08T10:00:00Z"), { challengeId: id, value: 5 });
  });

  it("completing early locks the history and records the results", async () => {
    const u = await makeUser();
    const { id } = await createChallenge(at(u, "2025-03-03T06:00:00Z"), dailyRunning({ rule: { frequency: "total", totalTarget: 20 } }));
    await createLog(at(u, "2025-03-04T07:00:00Z"), { challengeId: id, value: 12 });
    const last = await createLog(at(u, "2025-03-06T07:00:00Z"), { challengeId: id, value: 9 });
    expect(last.progress.targetReached).toBe(true);
    expect(last.reachedMilestones).toContain("Goal reached");

    const ctx = at(u, "2025-03-06T09:00:00Z");
    await completeChallenge(ctx, id);
    const d = (await getChallengeDetail(ctx, id))!;
    expect(d.challenge.status).toBe("completed");
    expect(d.challenge.completedEarly).toBe(true);
    expect(d.progress.phase).toBe("completed");
    expect(d.progress.goalPercent).toBe(105);
    expect(d.achievements.map((a) => a.type)).toEqual(expect.arrayContaining(["challenge_completed", "early_finish", "target_reached"]));

    await rejects(completeChallenge(ctx, id), "STATE");
    await rejects(createLog(ctx, { challengeId: id, value: 1 }), "STATE", /completed/i);
    await rejects(deleteLog(ctx, last.log.id), "STATE", /locked/i);
    await rejects(changeEndDate(ctx, id, "2025-04-01"), "STATE");
  });

  it("completes a paused challenge without extending it", async () => {
    const u = await makeUser();
    const { id } = await createChallenge(at(u, "2025-03-03T06:00:00Z"), dailyRunning());
    await pauseChallenge(at(u, "2025-03-05T07:00:00Z"), id);
    await completeChallenge(at(u, "2025-03-06T07:00:00Z"), id);
    const d = (await getChallengeDetail(at(u, "2025-03-06T08:00:00Z"), id))!;
    expect(d.challenge.status).toBe("completed");
    expect(d.challenge.endDate).toBe("2025-03-16");
    expect(d.pauses[0]!.endDate).toBe("2025-03-06");
  });
});

describe("time zones", () => {
  it("assigns a log to the user's local calendar day, and keeps it when they later change zone", async () => {
    const u = await makeUser("Asia/Seoul");
    const created = at(u, "2025-03-03T00:00:00Z");
    const { id } = await createChallenge(created, dailyRunning());
    // 2025-03-10T16:30Z is 01:30 on the 11th in Seoul, but still the 10th in UTC/LA
    const r = await createLog(at(u, "2025-03-10T16:30:00Z"), { challengeId: id, value: 5 });
    expect(r.log.localDate).toBe("2025-03-11");
    expect(r.log.timezone).toBe("Asia/Seoul");
    expect(r.log.time).toBe("01:30");

    await db.update(s.user).set({ timezone: "America/Los_Angeles" }).where(eq(s.user.id, u.id));
    const la = { id: u.id, timezone: "America/Los_Angeles" };
    const d = (await getChallengeDetail(at(la, "2025-03-10T16:45:00Z"), id))!;
    expect(d.logs[0]!.localDate).toBe("2025-03-11"); // history does not move
    expect(d.logs[0]!.time).toBe("01:30"); // still shown in the zone it was logged in
    expect(d.progress.today).toBe("2025-03-10"); // but "today" follows the new zone
    expect(d.progress.slots.find((x) => x.windowStart === "2025-03-11")!.state).toBe("completed");
    // logging now (09:45 on the 10th in LA) belongs to the 10th
    const r2 = await createLog(at(la, "2025-03-10T16:45:00Z"), { challengeId: id, value: 5 });
    expect(r2.log.localDate).toBe("2025-03-10");
  });

  it("just before and just after local midnight land on different days", async () => {
    const u = await makeUser("Asia/Tashkent"); // UTC+5
    const { id } = await createChallenge(at(u, "2025-03-03T00:00:00Z"), dailyRunning());
    const before = await createLog(at(u, "2025-03-04T18:59:00Z"), { challengeId: id, value: 1 }); // 23:59 on the 4th
    const after = await createLog(at(u, "2025-03-04T19:00:00Z"), { challengeId: id, value: 1 }); // 00:00 on the 5th
    expect(before.log.localDate).toBe("2025-03-04");
    expect(after.log.localDate).toBe("2025-03-05");
  });
});

describe("persistence", () => {
  it("is still there for a brand-new connection (as after logging in later)", async () => {
    const u = await makeUser();
    const ctx = at(u, "2025-03-03T07:00:00Z");
    const { id } = await createChallenge(ctx, dailyRunning());
    await createLog(ctx, { challengeId: id, value: 3 });

    const { createDb } = await import("@/lib/db/client");
    const fresh = createDb(process.env.TEST_DATABASE_URL!, { max: 1 });
    try {
      const d = (await getChallengeDetail({ db: fresh.db, user: u, now: new Date("2025-03-04T07:00:00Z") }, id))!;
      expect(d.progress.totalLogged).toBe(3);
      expect(d.logs).toHaveLength(1);
    } finally {
      await fresh.client.end();
    }
  });
});

describe("database constraints (defence in depth)", () => {
  it("rejects invalid rows even if application code is bypassed", async () => {
    const u = await makeUser();
    const base = { ownerId: u.id, title: "x", trackingMethod: "quantity" as const, unit: "km", startDate: "2025-03-03", endDate: "2025-03-10", originalEndDate: "2025-03-10" };
    await expect(db.insert(s.challenges).values({ ...base, endDate: "2025-03-01" })).rejects.toThrow();
    await expect(db.insert(s.challenges).values({ ...base, unit: null })).rejects.toThrow();
    await expect(db.insert(s.challenges).values({ ...base, title: "" })).rejects.toThrow();
    await expect(db.insert(s.challenges).values({ ...base, endDate: "2030-03-01" })).rejects.toThrow();
    const [c] = await db.insert(s.challenges).values(base).returning();
    await expect(db.insert(s.activityLogs).values({ challengeId: c!.id, userId: u.id, value: "-1", occurredAt: new Date(), localDate: "2025-03-04", timezone: "UTC" })).rejects.toThrow();
    await expect(db.insert(s.challengePauses).values([{ challengeId: c!.id, startDate: "2025-03-04" }, { challengeId: c!.id, startDate: "2025-03-05" }])).rejects.toThrow();
  });
});
