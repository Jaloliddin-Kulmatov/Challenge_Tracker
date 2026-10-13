import { describe, expect, it } from "vitest";
import { evaluateMilestones } from "@/lib/core/milestones";
import { evaluateAchievements } from "@/lib/core/achievements";
import { log, progress, rule } from "./helpers";

describe("milestones", () => {
  const logs = [log("2025-03-03", 30), log("2025-03-04", 30), log("2025-03-05", 45)];
  it("finds when each cumulative threshold was first crossed", () => {
    const res = evaluateMilestones(
      [
        { id: "a", thresholdPercent: 25, thresholdValue: null },
        { id: "b", thresholdPercent: 100, thresholdValue: null },
        { id: "c", thresholdPercent: null, thresholdValue: 60 },
        { id: "d", thresholdPercent: null, thresholdValue: 500 },
      ],
      logs,
      100,
    );
    expect(res.get("a")?.reachedLocalDate).toBe("2025-03-03");
    expect(res.get("b")?.reachedLocalDate).toBe("2025-03-05");
    expect(res.get("c")?.reachedLocalDate).toBe("2025-03-04");
    expect(res.get("d")).toBeNull();
  });
  it("un-reaches a milestone when the crossing log is removed", () => {
    const defs = [{ id: "b", thresholdPercent: 100, thresholdValue: null }];
    expect(evaluateMilestones(defs, logs.slice(0, 2), 100).get("b")).toBeNull();
  });
  it("cannot resolve percentage milestones when there is no target", () => {
    expect(evaluateMilestones([{ id: "a", thresholdPercent: 50, thresholdValue: null }], logs, 0).get("a")).toBeNull();
  });
});

describe("achievements", () => {
  it("awards badges from the current state only", () => {
    const daily = [rule({ frequency: "daily", effectiveFrom: "2025-03-03", sessionTarget: 5 })];
    const { progress: p } = progress({
      rules: daily, today: "2025-03-10",
      logs: (s) => [0, 1, 2].map((i) => log(s[i]!.windowStart, i === 1 ? 9 : 5, s[i]!.id)),
    });
    const earned = evaluateAchievements({ status: "active", endDate: "2025-03-16", completedLocalDate: null }, p);
    expect(earned).toEqual(expect.arrayContaining(["first_log", "streak_bronze", "overachiever"]));
    expect(earned).not.toContain("streak_silver");
    expect(earned).not.toContain("challenge_completed");

    const none = progress({ rules: daily, today: "2025-03-10" }).progress;
    expect(evaluateAchievements({ status: "active", endDate: "2025-03-16", completedLocalDate: null }, none)).toEqual([]);
  });
  it("awards early_finish only when completed before the end date", () => {
    const daily = [rule({ frequency: "daily", effectiveFrom: "2025-03-03", sessionTarget: 5 })];
    const { progress: p } = progress({ c: { status: "completed", completedLocalDate: "2025-03-06" }, rules: daily, today: "2025-03-20", logs: (s) => [log("2025-03-03", 5, s[0]!.id)] });
    const earned = evaluateAchievements({ status: "completed", endDate: "2025-03-16", completedLocalDate: "2025-03-06" }, p);
    expect(earned).toEqual(expect.arrayContaining(["challenge_completed", "early_finish"]));
  });
});
