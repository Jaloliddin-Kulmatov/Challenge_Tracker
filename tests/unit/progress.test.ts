import { describe, expect, it } from "vitest";
import { chooseSlotForLog } from "@/lib/core/progress";
import { log, progress, rule } from "./helpers";

const START = "2025-03-03"; // Monday; challenge runs 03-03 … 03-16 (14 days)
const daily5 = [rule({ frequency: "daily", effectiveFrom: START, sessionTarget: 5 })];

describe("progress percentages and targets", () => {
  it("computes totals and percentages for a daily challenge", () => {
    const { progress: p } = progress({
      rules: daily5,
      today: "2025-03-06",
      logs: (s) => [log("2025-03-03", 5, s[0]!.id), log("2025-03-04", 2.5, s[1]!.id)],
    });
    expect(p.totalTarget).toBe(70);
    expect(p.totalLogged).toBe(7.5);
    expect(p.goalPercent).toBe(10.7);
    expect(p.phase).toBe("running");
    expect(p.daysTotal).toBe(14);
    expect(p.daysElapsed).toBe(4);
    expect(p.daysRemaining).toBe(11);
  });

  it("reports exceeding a target without capping the percentage", () => {
    const { progress: p } = progress({
      rules: daily5,
      today: "2025-03-03",
      logs: (s) => [log("2025-03-03", 8, s[0]!.id)],
    });
    expect(p.slots[0]!.percent).toBe(160);
    expect(p.slots[0]!.exceeded).toBe(true);
    expect(p.slots[0]!.state).toBe("completed");
    expect(p.sessionsCompleted).toBe(1);
  });

  it("flags target reached only when the overall total is met", () => {
    const { progress: p } = progress({
      rules: [rule({ frequency: "total", effectiveFrom: START, totalTarget: 50 })],
      today: "2025-03-10",
      logs: (s) => [log("2025-03-04", 30, s[0]!.id), log("2025-03-09", 25, s[0]!.id)],
    });
    expect(p.targetReached).toBe(true);
    expect(p.exceededBy).toBe(5);
    expect(p.goalPercentCapped).toBe(100);
    expect(p.goalPercent).toBe(110);
  });
});

describe("multiple logs in one day", () => {
  it("sums sessions logged against the same slot", () => {
    const { progress: p } = progress({
      rules: daily5,
      today: "2025-03-03",
      logs: (s) => [log("2025-03-03", 2, s[0]!.id, 7), log("2025-03-03", 3.5, s[0]!.id, 18)],
    });
    expect(p.slots[0]!.achieved).toBe(5.5);
    expect(p.slots[0]!.state).toBe("completed");
    expect(p.logCount).toBe(2);
    expect(p.activeDays).toBe(1);
    expect(p.bestDay).toEqual({ date: "2025-03-03", value: 5.5 });
    expect(p.daily[0]!.logged).toBe(5.5);
  });

  it("counts unscheduled extra logs towards the total but not towards a slot", () => {
    const { progress: p } = progress({
      rules: [rule({ frequency: "weekly_days", effectiveFrom: START, weekdays: [1], weeklyTarget: 10 })],
      today: "2025-03-05",
      logs: () => [log("2025-03-05", 4, null)],
    });
    expect(p.totalLogged).toBe(4);
    expect(p.slots[0]!.achieved).toBe(0);
  });
});

describe("missed sessions and adherence", () => {
  it("marks past incomplete slots as missed and today's open slot as due", () => {
    const { progress: p } = progress({
      rules: daily5,
      today: "2025-03-05",
      logs: (s) => [log("2025-03-03", 5, s[0]!.id), log("2025-03-04", 1, s[1]!.id)],
    });
    expect(p.slots.map((s) => s.state).slice(0, 4)).toEqual(["completed", "missed", "due", "upcoming"]);
    expect(p.sessionsMissed).toBe(1);
    expect(p.sessionsDue).toBe(1);
    expect(p.adherencePercent).toBe(50);
  });

  it("has no adherence before anything has come due", () => {
    const { progress: p } = progress({ rules: daily5, today: "2025-03-03" });
    expect(p.adherencePercent).toBeNull();
    expect(p.sessionsMissed).toBe(0);
  });

  it("excludes skipped sessions from the target and from adherence", () => {
    const { progress: p } = progress({
      rules: daily5,
      today: "2025-03-05",
      slotStatus: { 1: "skipped" },
      logs: (s) => [log("2025-03-03", 5, s[0]!.id)],
    });
    expect(p.slots[1]!.state).toBe("skipped");
    expect(p.sessionsSkipped).toBe(1);
    expect(p.sessionsMissed).toBe(0);
    expect(p.totalTarget).toBe(65);
    expect(p.adherencePercent).toBe(100);
  });

  it("un-misses a session when a missing log is added later and re-misses when deleted", () => {
    const withLog = progress({ rules: daily5, today: "2025-03-05", logs: (s) => [log("2025-03-03", 5, s[0]!.id)] });
    const without = progress({ rules: daily5, today: "2025-03-05", logs: () => [] });
    expect(withLog.progress.slots[0]!.state).toBe("completed");
    expect(without.progress.slots[0]!.state).toBe("missed");
    expect(without.progress.totalLogged).toBe(0);
  });
});

describe("pace", () => {
  it("compares logged volume with the plan through yesterday (today's session is not due yet)", () => {
    const logsFor = (...vals: number[]) => (s: ReturnType<typeof progress>["slots"]) => vals.map((v, i) => log(s[i]!.windowStart, v, s[i]!.id));
    const ahead = progress({ rules: daily5, today: "2025-03-05", logs: logsFor(12, 5) });
    expect(ahead.progress.expectedToDate).toBe(10);
    expect(ahead.progress.pace).toBe("ahead");
    expect(progress({ rules: daily5, today: "2025-03-05", logs: logsFor(5) }).progress.pace).toBe("behind");
    expect(progress({ rules: daily5, today: "2025-03-05", logs: logsFor(5, 5) }).progress.pace).toBe("on_track");
  });

  it("has no pace on the first day, before any session could have been missed", () => {
    const { progress: p } = progress({ rules: daily5, today: "2025-03-03" });
    expect(p.expectedToDate).toBe(0);
    expect(p.pace).toBeNull();
  });

  it("spreads a total goal evenly across the days for planned pace", () => {
    const { progress: p } = progress({
      rules: [rule({ frequency: "total", effectiveFrom: START, totalTarget: 140 })],
      today: "2025-03-09",
    });
    expect(p.expectedToDate).toBe(60); // 6 full days (03-03 … 03-08) × 10
    expect(p.pace).toBe("behind");
  });
});

describe("challenges that have not started, have no history, or have no numbers", () => {
  it("shows an upcoming challenge with zeroes and a countdown", () => {
    const { progress: p } = progress({ rules: daily5, today: "2025-02-28" });
    expect(p.phase).toBe("upcoming");
    expect(p.daysUntilStart).toBe(3);
    expect(p.asOf).toBeNull();
    expect(p.totalLogged).toBe(0);
    expect(p.expectedToDate).toBe(0);
    expect(p.pace).toBeNull();
    expect(p.sessionsMissed).toBe(0);
    expect(p.slots.every((s) => s.state === "upcoming")).toBe(true);
    expect(p.streak.current).toBe(0);
  });

  it("works for completion (non-numeric) challenges", () => {
    const { progress: p } = progress({
      c: { trackingMethod: "completion", valueDecimals: 0 },
      rules: [rule({ frequency: "weekly_days", effectiveFrom: START, weekdays: [1, 3, 5], weeklyTarget: 3 })],
      today: "2025-03-08",
      logs: (s) => [log("2025-03-03", 1, s[0]!.id), log("2025-03-05", 1, s[1]!.id)],
    });
    expect(p.totalTarget).toBe(6);
    expect(p.sessionsCompleted).toBe(2);
    expect(p.sessionsMissed).toBe(1);
    expect(p.adherencePercent).toBe(67);
  });

  it("handles a challenge with no logs at all", () => {
    const { progress: p } = progress({ rules: daily5, today: "2025-03-16" });
    expect(p.logCount).toBe(0);
    expect(p.averagePerActiveDay).toBeNull();
    expect(p.bestDay).toBeNull();
    expect(p.phase).toBe("running");
    expect(p.sessionsMissed).toBe(13);
  });

  it("reports the ended phase after the end date until it is completed", () => {
    expect(progress({ rules: daily5, today: "2025-03-20" }).progress.phase).toBe("ended");
  });
});

describe("pausing", () => {
  const pauses = [{ startDate: "2025-03-05", endDate: "2025-03-08" }]; // paused 03-05, 03-06, 03-07

  it("excuses paused days instead of counting them as missed", () => {
    const { progress: p } = progress({ rules: daily5, today: "2025-03-10", pauses, logs: (s) => [log("2025-03-03", 5, s[0]!.id), log("2025-03-04", 5, s[1]!.id)] });
    expect(p.slots.slice(2, 5).map((s) => s.state)).toEqual(["excused", "excused", "excused"]);
    expect(p.sessionsMissed).toBe(2); // 03-08 and 03-09
    expect(p.totalTarget).toBe(55);
  });

  it("does not break a streak across a pause", () => {
    const { progress: p } = progress({
      rules: daily5, today: "2025-03-09", pauses,
      logs: (s) => [log("2025-03-03", 5, s[0]!.id), log("2025-03-04", 5, s[1]!.id), log("2025-03-08", 5, s[5]!.id)],
    });
    expect(p.streak.current).toBe(3);
  });

  it("treats an open pause as covering today", () => {
    const { progress: p } = progress({ c: { status: "paused" }, rules: daily5, today: "2025-03-06", pauses: [{ startDate: "2025-03-05", endDate: null }] });
    expect(p.phase).toBe("paused");
    expect(p.slots[3]!.state).toBe("excused");
    expect(p.slots[2]!.state).toBe("excused");
  });

  it("prorates a weekly window by its active days", () => {
    const { progress: p } = progress({
      c: { valueDecimals: 0 },
      rules: [rule({ frequency: "weekly_flexible", effectiveFrom: START, weeklyTarget: 70 })],
      today: "2025-03-12",
      pauses: [{ startDate: "2025-03-05", endDate: "2025-03-08" }],
    });
    expect(p.slots[0]!.target).toBe(40); // 4 of 7 days active
  });
});

describe("completing early", () => {
  it("stops counting sessions after the completion date", () => {
    const { progress: p } = progress({
      c: { status: "completed", completedLocalDate: "2025-03-05" },
      rules: daily5,
      today: "2025-03-20",
      logs: (s) => [log("2025-03-03", 5, s[0]!.id), log("2025-03-04", 5, s[1]!.id), log("2025-03-05", 5, s[2]!.id)],
    });
    expect(p.phase).toBe("completed");
    expect(p.sessionsCompleted).toBe(3);
    expect(p.sessionsMissed).toBe(0);
    expect(p.totalTarget).toBe(15);
    expect(p.targetReached).toBe(true);
    expect(p.daily.at(-1)!.date).toBe("2025-03-05");
    expect(p.slots.slice(3).every((s) => s.state === "cancelled")).toBe(true);
  });
});

describe("chooseSlotForLog", () => {
  const slot = (id: string, d: string, achieved: number, t = 5) => ({ id, windowStart: d, windowEnd: d, status: "planned" as const, targetValue: t, achieved });
  it("prefers the unfinished slot, then any slot in range, then none", () => {
    expect(chooseSlotForLog([slot("a", "2025-03-03", 5), slot("b", "2025-03-04", 0)], "2025-03-03")).toBe("a");
    expect(chooseSlotForLog([{ ...slot("w", "2025-03-03", 5, 5), windowEnd: "2025-03-09" }, { ...slot("w2", "2025-03-04", 0), windowEnd: "2025-03-09" }], "2025-03-05")).toBe("w2");
    expect(chooseSlotForLog([slot("a", "2025-03-03", 0)], "2025-03-04")).toBeNull();
    expect(chooseSlotForLog([{ ...slot("a", "2025-03-03", 0), status: "skipped" as never }], "2025-03-03")).toBeNull();
  });
});
