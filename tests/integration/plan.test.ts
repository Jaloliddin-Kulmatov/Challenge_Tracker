import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@/lib/db/schema";
import { AppError } from "@/lib/services/errors";
import { contentOf } from "@/lib/plan/content";
import { MALAYSIA_SEM4 } from "@/lib/plan/malaysia-semester4";
import type { Email } from "@/lib/email";
import { sendDueReminders, sendTestReminder, setPlanReminder } from "@/lib/services/reminders";
import { getPlanData, hasPlan, resetPlanContent, saveMetrics, savePlanContent, setCheck, startPlan } from "@/lib/services/plan";
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
    await setCheck(ctx, { taskKey: "weekly:dl", period: "W1", checked: true });
    await setCheck(ctx, { taskKey: "wtask:w1t1", period: "W1", checked: true });
    await setCheck(ctx, { taskKey: "wtask:w9t1", period: "W9", checked: true }); // finishing a later week's task early is allowed
    await setCheck(ctx, { taskKey: "mres:oct:r1", period: "once", checked: true });
    await rejects(setCheck(ctx, { taskKey: "weekly:dl", period: "W2", checked: true }), "VALIDATION", /hasn't started/);
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
    await saveMetrics(ctx, { period: "W1", weightKg: 71.26 });
    await saveMetrics(ctx, { period: "W1", longRunKm: 15 }); // adds, doesn't wipe
    let m = (await getPlanData(ctx))!.metrics;
    expect(m).toEqual([{ week: 1, weightKg: 71.3, longRunKm: 15 }]);
    await saveMetrics(ctx, { period: "W1", weightKg: null });
    m = (await getPlanData(ctx))!.metrics;
    expect(m[0]!.weightKg).toBeNull();
    expect(m[0]!.longRunKm).toBe(15);

    await rejects(saveMetrics(ctx, { period: "W1" }), "VALIDATION", /at least one/i);
    await rejects(saveMetrics(ctx, { period: "W1", weightKg: 5 }), "VALIDATION");
    await rejects(saveMetrics(ctx, { period: "W1", longRunKm: 5000 }), "VALIDATION");
    await rejects(saveMetrics(ctx, { period: "W3", weightKg: 70 }), "VALIDATION", /hasn't started/);
    await rejects(saveMetrics(ctx, { period: "W99", weightKg: 70 }), "VALIDATION");
    expect((await getPlanData(ctx))!.metrics).toHaveLength(1);
  });

  it("lets the user edit every part of the plan, and ticks follow their tasks", async () => {
    const u = await makeUser();
    const ctx = at(u, WED);
    await startPlan(ctx);
    expect((await getPlanData(ctx))!.edited).toBe(false);
    await setCheck(ctx, { taskKey: "daily:newperson", period: "2026-10-21", checked: true });
    await setCheck(ctx, { taskKey: "book:b1", period: "once", checked: true });

    const c = structuredClone(contentOf(MALAYSIA_SEM4));
    c.dailyTasks = c.dailyTasks.filter((d) => d.key !== "newperson");
    c.dailyTasks.push({ key: "walk", title: "Walk 20 min", weekdays: [1, 2, 3, 4, 5, 6, 7] });
    c.books[0]!.title = "Deep Work";
    c.goals.push({ key: "sleep8", area: "Sleep", target: "8 hours" });
    c.weeks[0]!.tasks.push({ id: "w1t777", text: "Buy a SIM card" });
    c.months[0]!.books = 1;
    await savePlanContent(ctx, { content: c });

    const d = (await getPlanData(ctx))!;
    expect(d.edited).toBe(true);
    expect(d.template.books[0]!.title).toBe("Deep Work");
    expect(d.template.months[0]!.books).toBe(1);
    expect(d.checks).toContain("book:b1|once"); // the ticked book keeps its tick after the rename

    await setCheck(ctx, { taskKey: "daily:walk", period: "2026-10-21", checked: true });
    await setCheck(ctx, { taskKey: "goal:sleep8", period: "once", checked: true });
    await setCheck(ctx, { taskKey: "wtask:w1t777", period: "W1", checked: true });
    await rejects(setCheck(ctx, { taskKey: "daily:newperson", period: "2026-10-21", checked: false }), "VALIDATION", /Unknown/); // removed

    await resetPlanContent(ctx);
    const r = (await getPlanData(ctx))!;
    expect(r.edited).toBe(false);
    expect(r.template.books[0]!.title).toBe("Book 1");
    await setCheck(ctx, { taskKey: "daily:newperson", period: "2026-10-21", checked: false }); // back again
    await rejects(setCheck(ctx, { taskKey: "daily:walk", period: "2026-10-21", checked: true }), "VALIDATION", /Unknown/);
  });

  it("rejects invalid edits, edits to a plan that doesn't exist, and other people's plans", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const content = contentOf(MALAYSIA_SEM4);
    await rejects(savePlanContent(at(a, WED), { content }), "NOT_FOUND"); // not started
    await startPlan(at(a, WED));
    await rejects(savePlanContent(at(a, WED), { content: { ...content, goals: [{ key: "x", area: "", target: "y" }] } }), "VALIDATION", /can't be empty/);
    await rejects(savePlanContent(at(a, WED), { content: { ...content, months: content.months.slice(1) } }), "VALIDATION");
    await rejects(savePlanContent(at(a, WED), { content: null }), "VALIDATION");
    expect((await getPlanData(at(a, WED)))!.edited).toBe(false);

    await startPlan(at(b, WED));
    const mine = structuredClone(content);
    mine.goals[0]!.area = "Only mine";
    await savePlanContent(at(a, WED), { content: mine });
    expect((await getPlanData(at(b, WED)))!.template.goals[0]!.area).toBe("Grades");
    await resetPlanContent(at(b, WED));
    expect((await getPlanData(at(a, WED)))!.template.goals[0]!.area).toBe("Only mine");
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

describe("evening reminder emails", () => {
  const KL = "Asia/Kuala_Lumpur";
  // 23:30 in Kuala Lumpur on Wed 21 Oct 2026 = 15:30 UTC
  const AT_2330 = new Date("2026-10-21T15:30:00Z");
  const URL = "https://tracker.example.com";

  const collect = () => {
    const sent: Email[] = [];
    return { sent, send: async (e: Email) => void sent.push(e), to: (email: string) => sent.filter((e) => e.to === email) };
  };
  const emailOf = async (id: string) => (await db.select().from(s.user).where(eq(s.user.id, id)))[0]!.email;

  async function planUser(timezone = KL, enable = true) {
    const u = await makeUser(timezone);
    await startPlan(at(u, AT_2330.toISOString()));
    if (enable) await setPlanReminder(at(u, AT_2330.toISOString()), { enabled: true, time: "23:30" });
    return u;
  }

  it("emails the tasks still open at 23:30 local time, exactly once a day", async () => {
    const u = await planUser();
    const email = await emailOf(u.id);
    await setCheck(at(u, AT_2330.toISOString()), { taskKey: "daily:german", period: "2026-10-21", checked: true });
    const m = collect();

    expect((await sendDueReminders(db, new Date("2026-10-21T15:29:00Z"), m.send, URL)).failed).toBe(0);
    expect(m.to(email)).toHaveLength(0); // 23:29: too early

    await sendDueReminders(db, AT_2330, m.send, URL);
    await sendDueReminders(db, new Date("2026-10-21T15:45:00Z"), m.send, URL); // the next cron run
    expect(m.to(email)).toHaveLength(1);
    const mail = m.to(email)[0]!;
    expect(mail.subject).toBe("Tick your day: 8 of 9 still open");
    expect(mail.text).not.toContain("German");

    await sendDueReminders(db, new Date("2026-10-22T15:30:00Z"), m.send, URL); // next evening: another one
    expect(m.to(email)).toHaveLength(2);
  });

  it("catches up after a missed run, but not hours later", async () => {
    const u = await planUser();
    const email = await emailOf(u.id);
    const m = collect();
    await sendDueReminders(db, new Date("2026-10-21T19:00:00Z"), m.send, URL); // 03:00 next day in KL: window over
    expect(m.to(email)).toHaveLength(0);
    await sendDueReminders(db, new Date("2026-10-21T15:50:00Z"), m.send, URL); // 23:50: catch-up
    expect(m.to(email)).toHaveLength(1);
  });

  it("stays quiet when everything is ticked, when switched off, or before the plan starts", async () => {
    const done = await planUser();
    const off = await planUser(KL, false);
    const early = await planUser();
    const ctx = at(done, AT_2330.toISOString());
    const d = (await getPlanData(ctx))!;
    for (const task of d.template.dailyTasks.filter((x) => x.weekdays.includes(3)))
      await setCheck(ctx, { taskKey: `daily:${task.key}`, period: "2026-10-21", checked: true });
    const m = collect();
    await sendDueReminders(db, AT_2330, m.send, URL);
    expect(m.to(await emailOf(done.id))).toHaveLength(0);
    expect(m.to(await emailOf(off.id))).toHaveLength(0);
    expect(m.to(await emailOf(early.id))).toHaveLength(1);

    const before = collect();
    await sendDueReminders(db, new Date("2026-10-17T15:30:00Z"), before.send, URL); // plan hasn't started
    expect(before.to(await emailOf(early.id))).toHaveLength(0);
  });

  it("uses each person's own time zone", async () => {
    const kl = await planUser(KL);
    const utc = await planUser("UTC");
    const m = collect();
    await sendDueReminders(db, AT_2330, m.send, URL); // 15:30 UTC: 23:30 in KL only
    expect(m.to(await emailOf(kl.id))).toHaveLength(1);
    expect(m.to(await emailOf(utc.id))).toHaveLength(0);
  });

  it("gives the claim back when sending fails, so the next run retries", async () => {
    const u = await planUser();
    const email = await emailOf(u.id);
    const err = console.error;
    console.error = () => {};
    const failing = await sendDueReminders(db, AT_2330, async (e) => { if (e.to === email) throw new Error("provider down"); }, URL);
    console.error = err;
    expect(failing.failed).toBeGreaterThanOrEqual(1);
    const m = collect();
    await sendDueReminders(db, new Date("2026-10-21T15:45:00Z"), m.send, URL);
    expect(m.to(email)).toHaveLength(1);
  });

  it("the one-tap switch saves the choice; a test email goes only to the signed-in user, at most once a minute", async () => {
    const u = await planUser(KL, false);
    const ctx = at(u, AT_2330.toISOString());
    await setPlanReminder(ctx, { enabled: true, time: "22:15" });
    const [row] = await db.select().from(s.notificationPreferences).where(eq(s.notificationPreferences.userId, u.id));
    expect(row).toMatchObject({ dailyReminderEnabled: true, reminderTime: "22:15", channel: "email" });
    await rejects(setPlanReminder(ctx, { enabled: true, time: "25:99" }), "VALIDATION");

    const m = collect();
    const res = await sendTestReminder(ctx, m.send, URL);
    expect(res.email).toBe(await emailOf(u.id));
    expect(m.sent).toHaveLength(1);
    expect(m.sent[0]!.subject).toMatch(/^\[Test\]/);
    await rejects(sendTestReminder(ctx, m.send, URL), "VALIDATION", /just sent/);
    await sendTestReminder(at(u, "2026-10-21T15:31:30Z"), m.send, URL); // a minute later: fine
    expect(m.sent).toHaveLength(2);

    const failing = at(u, "2026-10-21T16:00:00Z");
    await rejects(sendTestReminder(failing, async () => { throw new Error("nope"); }, URL), "STATE", /couldn't be sent/);
    await sendTestReminder(failing, m.send, URL); // the failed attempt didn't use up the minute
  });
});
