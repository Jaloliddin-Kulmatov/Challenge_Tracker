import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import {
  addMilestone, archiveChallenge, changeEndDate, changeTargetRule, completeChallenge, createChallenge, deleteChallenge,
  deleteMilestone, getChallengeDetail, getDashboard, pauseChallenge, updateChallengeDetails,
} from "@/lib/services/challenges";
import { createLog, deleteLog, updateLog } from "@/lib/services/logs";
import { addExtraSession, rescheduleSlot, setSlotSkipped, setSlotTarget } from "@/lib/services/slots";
import { createShare, getSharedChallenge, revokeShare } from "@/lib/services/shares";
import { exportUserData, getNotificationPrefs, updateNotificationPrefs, updateProfile } from "@/lib/services/profile";
import { AppError } from "@/lib/services/errors";
import { at, client, db, dailyRunning, makeUser } from "./helpers";

afterAll(async () => {
  await client.end();
});

const NOW = "2025-03-05T08:00:00Z";

async function setup() {
  const alice = await makeUser("UTC", "Alice");
  const mallory = await makeUser("UTC", "Mallory");
  const ctxA = at(alice, NOW);
  const ctxM = at(mallory, NOW);
  const { id } = await createChallenge(ctxA, dailyRunning());
  const log = await createLog(ctxA, { challengeId: id, value: 5, notes: "private note" });
  const detail = (await getChallengeDetail(ctxA, id))!;
  return { alice, mallory, ctxA, ctxM, id, log, slotId: slotIdOf(detail.progress.slots[3]!.id) };
}
const slotIdOf = (x: string) => x;

const denied = async (p: Promise<unknown>) => {
  const err = await p.then(() => null, (e) => e);
  expect(err).toBeInstanceOf(AppError);
  expect((err as AppError).code).toBe("NOT_FOUND"); // existence is never revealed
};

describe("data authorization", () => {
  it("another user cannot read a challenge, and it does not appear in their dashboard", async () => {
    const { ctxM, id } = await setup();
    expect(await getChallengeDetail(ctxM, id)).toBeNull();
    expect((await getDashboard(ctxM)).challenges).toEqual([]);
  });

  it("another user cannot modify, log into, or delete someone else's challenge", async () => {
    const { ctxA, ctxM, id, log } = await setup();
    await denied(updateChallengeDetails(ctxM, id, { title: "pwned", category: "other", color: "rose" }));
    await denied(changeTargetRule(ctxM, id, { rule: { frequency: "daily", sessionTarget: 1 } }));
    await denied(changeEndDate(ctxM, id, "2025-04-01"));
    await denied(pauseChallenge(ctxM, id));
    await denied(completeChallenge(ctxM, id));
    await denied(archiveChallenge(ctxM, id));
    await denied(createLog(ctxM, { challengeId: id, value: 10 }));
    await denied(addMilestone(ctxM, id, { title: "x", thresholdValue: 5 }));
    await denied(createShare(ctxM, id, {}));
    await denied(addExtraSession(ctxM, id, { date: "2025-03-07", target: 5 }));
    await denied(updateLog(ctxM, { logId: log.log.id, value: 99 }));
    await denied(deleteLog(ctxM, log.log.id));
    await denied(deleteChallenge(ctxM, id));

    const d = (await getChallengeDetail(ctxA, id))!;
    expect(d.challenge.title).toBe("Run 5 km a day");
    expect(d.logs).toHaveLength(1);
    expect(d.logs[0]!.value).toBe(5);
  });

  it("another user cannot touch someone else's schedule slots, milestones or shares", async () => {
    const { ctxA, ctxM, id, slotId } = await setup();
    await denied(rescheduleSlot(ctxM, slotId, "2025-03-12"));
    await denied(setSlotTarget(ctxM, slotId, 1));
    await denied(setSlotSkipped(ctxM, slotId, true));
    const d = (await getChallengeDetail(ctxA, id))!;
    await denied(deleteMilestone(ctxM, id, d.milestones[0]!.id));
    const share = await createShare(ctxA, id, {});
    await denied(revokeShare(ctxM, id, share.id));
    expect((await getSharedChallenge(db, share.token, new Date(NOW)))).not.toBeNull();
  });

  it("a user cannot attach a log to a slot from another user's challenge", async () => {
    const { ctxM, slotId } = await setup();
    const mine = await createChallenge(ctxM, dailyRunning());
    await denied(createLog(ctxM, { challengeId: mine.id, value: 2, scheduledActivityId: slotId }));
  });

  it("deleting a user removes all of their data (cascade) and leaves other users' data", async () => {
    const { alice, mallory, ctxM, id } = await setup();
    const keep = await createChallenge(ctxM, dailyRunning());
    await db.delete(s.user).where(eq(s.user.id, alice.id));
    expect(await db.select().from(s.challenges).where(eq(s.challenges.id, id))).toEqual([]);
    expect(await db.select().from(s.activityLogs).where(eq(s.activityLogs.challengeId, id))).toEqual([]);
    expect(await db.select().from(s.scheduledActivities).where(eq(s.scheduledActivities.challengeId, id))).toEqual([]);
    expect((await getChallengeDetail(ctxM, keep.id))!.challenge.id).toBe(keep.id);
    expect(mallory.id).toBeTruthy();
  });
});

describe("share links", () => {
  it("expose statistics only – never notes by default, email, or other challenges – and can be revoked or expire", async () => {
    const { ctxA, id } = await setup();
    await createChallenge(ctxA, dailyRunning({ title: "Secret other challenge" }));
    const share = await createShare(ctxA, id, {});
    const shared = (await getSharedChallenge(db, share.token, new Date(NOW)))!;
    expect(shared.challenge.title).toBe("Run 5 km a day");
    expect(shared.ownerName).toBe("Alice");
    expect(shared.notes).toEqual([]);
    expect(shared.progress.totalLogged).toBe(5);
    const json = JSON.stringify(shared);
    expect(json).not.toContain("private note");
    expect(json).not.toContain("example.test");
    expect(json).not.toContain("Secret other challenge");

    const withNotes = await createShare(ctxA, id, { showNotes: true });
    expect((await getSharedChallenge(db, withNotes.token, new Date(NOW)))!.notes).toEqual([{ date: "2025-03-05", text: "private note" }]);

    await revokeShare(ctxA, id, share.id);
    expect(await getSharedChallenge(db, share.token, new Date(NOW))).toBeNull();

    const expiring = await createShare(ctxA, id, { expiresInDays: 1 });
    expect(await getSharedChallenge(db, expiring.token, new Date("2025-03-05T09:00:00Z"))).not.toBeNull();
    expect(await getSharedChallenge(db, expiring.token, new Date("2025-03-07T09:00:00Z"))).toBeNull();
    expect(await getSharedChallenge(db, "short", new Date(NOW))).toBeNull();
    expect(await getSharedChallenge(db, "x".repeat(32), new Date(NOW))).toBeNull();
  });
});

describe("editing the schedule", () => {
  it("reschedules, retargets and skips sessions; regeneration then leaves them alone", async () => {
    const { ctxA, id } = await setup();
    const d0 = (await getChallengeDetail(ctxA, id))!;
    const by = (date: string, d = d0) => d.progress.slots.find((x) => x.windowStart === date)!;

    await rescheduleSlot(ctxA, by("2025-03-07").id, "2025-03-15");
    await setSlotTarget(ctxA, by("2025-03-09").id, 12);
    await setSlotSkipped(ctxA, by("2025-03-10").id, true);
    await addExtraSession(ctxA, id, { date: "2025-03-08", target: 3, label: "Recovery jog" });

    let d = (await getChallengeDetail(ctxA, id))!;
    expect(d.progress.slots.filter((x) => x.windowStart === "2025-03-15").some((x) => x.isCustomized)).toBe(true);
    expect(d.progress.slots.filter((x) => x.windowStart === "2025-03-15")).toHaveLength(2);
    expect(by("2025-03-09", d).rawTarget).toBe(12);
    expect(by("2025-03-10", d).state).toBe("skipped");
    expect(d.progress.slots.find((x) => x.label === "Recovery jog")!.rawTarget).toBe(3);

    // a later target change must not clobber the user's manual edits
    await changeTargetRule(ctxA, id, { rule: { frequency: "daily", sessionTarget: 9 }, effectiveFrom: "2025-03-06" });
    d = (await getChallengeDetail(ctxA, id))!;
    expect(by("2025-03-09", d).rawTarget).toBe(12);
    expect(by("2025-03-10", d).state).toBe("skipped");
    expect(by("2025-03-11", d).rawTarget).toBe(9);
    expect(by("2025-03-06", d).rawTarget).toBe(9);
    expect(d.progress.slots.find((x) => x.label === "Recovery jog")).toBeDefined();
    // the user moved Friday's session to the 15th, so regeneration does not put one back on the 7th …
    expect(d.progress.slots.filter((x) => x.windowStart === "2025-03-07")).toHaveLength(0);
    // … and the 15th has both its own regenerated session and the moved one
    expect(d.progress.slots.filter((x) => x.windowStart === "2025-03-15").map((x) => x.rawTarget).sort()).toEqual([5, 9]);

    await setSlotSkipped(ctxA, by("2025-03-10", d).id, false);
    expect(by("2025-03-10", (await getChallengeDetail(ctxA, id))!).state).toBe("upcoming");
  });

  it("refuses edits that would rewrite history or break rules", async () => {
    const { ctxA, id } = await setup();
    const d = (await getChallengeDetail(ctxA, id))!;
    const logged = d.progress.slots.find((x) => x.windowStart === "2025-03-05")!;
    const past = d.progress.slots.find((x) => x.windowStart === "2025-03-03")!;
    const err = async (p: Promise<unknown>, code: string) => expect(await p.then(() => null, (e: AppError) => e.code)).toBe(code);
    await err(rescheduleSlot(ctxA, logged.id, "2025-03-12"), "STATE"); // has activity
    await err(rescheduleSlot(ctxA, d.progress.slots[8]!.id, "2025-03-01"), "VALIDATION");
    await err(rescheduleSlot(ctxA, d.progress.slots[8]!.id, "2025-04-01"), "VALIDATION");
    await err(setSlotTarget(ctxA, past.id, 9), "STATE"); // past session
    await err(setSlotTarget(ctxA, d.progress.slots[8]!.id, -1), "VALIDATION");
    await err(setSlotSkipped(ctxA, logged.id, true), "STATE");
    await err(addExtraSession(ctxA, id, { date: "2025-03-01", target: 3 }), "VALIDATION");
  });

  it("custom milestones resolve and are reached by logs", async () => {
    const { ctxA, id } = await setup();
    await addMilestone(ctxA, id, { title: "First 8 km", thresholdValue: 8 });
    const r = await createLog(at(ctxA.user, "2025-03-05T18:00:00Z"), { challengeId: id, value: 4 });
    expect(r.reachedMilestones).toContain("First 8 km");
    await expect(addMilestone(ctxA, id, { title: "", thresholdValue: 8 })).rejects.toBeInstanceOf(AppError);
  });
});

describe("profile and settings", () => {
  it("validates and saves the time zone and notification preferences", async () => {
    const { ctxA, alice } = await setup();
    await expect(updateProfile(ctxA, { name: "Alice", timezone: "Mars/Base" })).rejects.toBeInstanceOf(AppError);
    await updateProfile(ctxA, { name: "Alice B.", timezone: "Europe/London" });
    const [row] = await db.select().from(s.user).where(eq(s.user.id, alice.id));
    expect(row).toMatchObject({ name: "Alice B.", timezone: "Europe/London" });

    expect((await getNotificationPrefs(ctxA)).dailyReminderEnabled).toBe(false);
    await updateNotificationPrefs(ctxA, { dailyReminderEnabled: true, reminderTime: "06:45", weeklySummaryEnabled: false, channel: "email" });
    await updateNotificationPrefs(ctxA, { dailyReminderEnabled: true, reminderTime: "07:15", weeklySummaryEnabled: true, channel: "none" });
    expect(await getNotificationPrefs(ctxA)).toEqual({ dailyReminderEnabled: true, reminderTime: "07:15", weeklySummaryEnabled: true, channel: "none" });
    await expect(updateNotificationPrefs(ctxA, { dailyReminderEnabled: true, reminderTime: "25:00", weeklySummaryEnabled: true, channel: "email" })).rejects.toBeInstanceOf(AppError);
  });

  it("exports only the requesting user's data", async () => {
    const { ctxA, ctxM } = await setup();
    const a = await exportUserData(ctxA);
    expect(a.challenges).toHaveLength(1);
    expect(a.challenges[0]!.logs).toHaveLength(1);
    expect((await exportUserData(ctxM)).challenges).toEqual([]);
  });
});

describe("concurrency", () => {
  it("parallel logs for one challenge are all recorded exactly once", async () => {
    const { ctxA, id } = await setup();
    await Promise.all(Array.from({ length: 8 }, (_, i) => createLog(ctxA, { challengeId: id, value: 1, clientRequestId: `parallel-req-${i}` })));
    const d = (await getChallengeDetail(ctxA, id))!;
    expect(d.logs).toHaveLength(9);
    expect(d.progress.totalLogged).toBe(13);
  });
});
