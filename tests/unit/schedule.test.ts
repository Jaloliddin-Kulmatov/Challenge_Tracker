import { describe, expect, it } from "vitest";
import { generateSlots, normalizeRule, planScheduleChange, snapEffectiveFrom, splitEvenly, validateRule, type ExistingSlot } from "@/lib/core/schedule";
import { rule, slotsFrom } from "./helpers";

const START = "2025-03-03"; // Monday

describe("splitEvenly", () => {
  it("sums exactly and gives the remainder to earlier parts", () => {
    expect(splitEvenly(20, 3, 2)).toEqual([6.67, 6.67, 6.66]);
    expect(splitEvenly(10, 4, 0)).toEqual([3, 3, 2, 2]);
    expect(splitEvenly(0.3, 3, 1)).toEqual([0.1, 0.1, 0.1]);
    expect(splitEvenly(5, 0, 1)).toEqual([]);
  });
});

describe("generateSlots – daily", () => {
  it("creates one session slot per day with the daily target", () => {
    const slots = generateSlots([rule({ frequency: "daily", effectiveFrom: START, sessionTarget: 5 })], START, "2025-03-09", 1);
    expect(slots).toHaveLength(7);
    expect(slots.every((s) => s.kind === "session" && s.targetValue === 5 && s.windowStart === s.windowEnd)).toBe(true);
  });
});

describe("generateSlots – weekly days", () => {
  const weekly = rule({ frequency: "weekly_days", effectiveFrom: START, weekdays: [1, 3, 6], weeklyTarget: 20 });
  it("generates only the selected weekdays and splits the weekly target", () => {
    const slots = generateSlots([weekly], START, "2025-03-16", 2);
    expect(slots.map((s) => s.windowStart)).toEqual(["2025-03-03", "2025-03-05", "2025-03-08", "2025-03-10", "2025-03-12", "2025-03-15"]);
    expect(slots.slice(0, 3).map((s) => s.targetValue)).toEqual([6.67, 6.67, 6.66]);
    expect(slots.slice(0, 3).reduce((n, s) => n + s.targetValue, 0)).toBeCloseTo(20, 5);
  });
  it("supports custom per-weekday targets", () => {
    const custom = rule({ frequency: "weekly_days", effectiveFrom: START, weekdays: [2, 6], weekdayTargets: { "2": 5, "6": 15 } });
    const slots = generateSlots([custom], START, "2025-03-09", 1);
    expect(slots.map((s) => [s.windowStart, s.targetValue])).toEqual([["2025-03-04", 5], ["2025-03-08", 15]]);
  });
  it("starting mid-week only produces the remaining sessions of that week", () => {
    const slots = generateSlots([{ ...weekly, effectiveFrom: "2025-03-06" }], "2025-03-06", "2025-03-09", 2);
    expect(slots.map((s) => s.windowStart)).toEqual(["2025-03-08"]);
  });
});

describe("generateSlots – flexible weekly and total", () => {
  it("creates one window per ISO week and prorates partial weeks", () => {
    const flex = rule({ frequency: "weekly_flexible", effectiveFrom: "2025-03-06", weeklyTarget: 70 }); // Thursday start
    const slots = generateSlots([flex], "2025-03-06", "2025-03-18", 0);
    expect(slots.map((s) => [s.windowStart, s.windowEnd, s.targetValue])).toEqual([
      ["2025-03-06", "2025-03-09", 40], // 4 of 7 days
      ["2025-03-10", "2025-03-16", 70],
      ["2025-03-17", "2025-03-18", 20], // 2 of 7 days
    ]);
    expect(slots.every((s) => s.kind === "week")).toBe(true);
  });
  it("creates a single window for a total goal", () => {
    const slots = generateSlots([rule({ frequency: "total", effectiveFrom: START, totalTarget: 1000 })], START, "2025-03-30", 0);
    expect(slots).toEqual([{ kind: "total", windowStart: START, windowEnd: "2025-03-30", targetValue: 1000 }]);
  });
});

describe("versioned rules (changing a future target)", () => {
  it("applies each rule to its own date range", () => {
    const rules = [
      rule({ frequency: "daily", effectiveFrom: START, sessionTarget: 5 }),
      rule({ frequency: "daily", effectiveFrom: "2025-03-10", sessionTarget: 8 }),
    ];
    const slots = generateSlots(rules, START, "2025-03-12", 1);
    expect(slots.map((s) => s.targetValue)).toEqual([5, 5, 5, 5, 5, 5, 5, 8, 8, 8]);
  });
  it("snaps rule changes touching weekly windows to the next Monday", () => {
    const rules = [rule({ frequency: "weekly_flexible", effectiveFrom: START, weeklyTarget: 30 })];
    expect(snapEffectiveFrom(rules, { frequency: "weekly_flexible" }, "2025-03-05")).toBe("2025-03-10");
    expect(snapEffectiveFrom(rules, { frequency: "daily" }, "2025-03-05")).toBe("2025-03-10");
    expect(snapEffectiveFrom([rule({ frequency: "daily", effectiveFrom: START, sessionTarget: 1 })], { frequency: "daily" }, "2025-03-05")).toBe("2025-03-05");
  });
});

describe("planScheduleChange", () => {
  const dailyRules = [rule({ frequency: "daily", effectiveFrom: START, sessionTarget: 5 })];
  const existing = (): ExistingSlot[] => slotsFrom(dailyRules, START, "2025-03-16", 1).map((s) => ({ ...s, hasLogs: false }));

  it("regenerates only from the change date and leaves history alone", () => {
    const slots = existing();
    const rules = [...dailyRules, rule({ frequency: "daily", effectiveFrom: "2025-03-10", sessionTarget: 8 })];
    const plan = planScheduleChange({ existing: slots, rules, newEnd: "2025-03-16", regenerateFrom: "2025-03-10", decimals: 1 });
    expect(plan.deleteIds).toHaveLength(7);
    expect(plan.insert).toHaveLength(7);
    expect(plan.insert.every((s) => s.targetValue === 8)).toBe(true);
    const deleted = new Set(plan.deleteIds);
    expect(slots.filter((s) => s.windowStart < "2025-03-10").every((s) => !deleted.has(s.id))).toBe(true);
  });
  it("keeps logged, customised and skipped slots", () => {
    const slots = existing();
    slots[8]!.hasLogs = true; // 03-11
    slots[9]!.isCustomized = true; // 03-12
    slots[10]!.status = "skipped"; // 03-13
    const rules = [...dailyRules, rule({ frequency: "daily", effectiveFrom: "2025-03-10", sessionTarget: 8 })];
    const plan = planScheduleChange({ existing: slots, rules, newEnd: "2025-03-16", regenerateFrom: "2025-03-10", decimals: 1 });
    expect(plan.deleteIds).not.toContain(slots[8]!.id);
    expect(plan.deleteIds).not.toContain(slots[9]!.id);
    expect(plan.deleteIds).not.toContain(slots[10]!.id);
    expect(plan.insert.map((s) => s.windowStart)).toEqual(["2025-03-10", "2025-03-14", "2025-03-15", "2025-03-16"]);
  });
  it("extends the schedule when the end date moves later", () => {
    const plan = planScheduleChange({ existing: existing(), rules: dailyRules, newEnd: "2025-03-20", regenerateFrom: "2025-03-17", decimals: 1 });
    expect(plan.deleteIds).toEqual([]);
    expect(plan.insert.map((s) => s.windowStart)).toEqual(["2025-03-17", "2025-03-18", "2025-03-19", "2025-03-20"]);
  });
  it("shortens the schedule, removing unlogged slots past the new end", () => {
    const slots = existing();
    const plan = planScheduleChange({ existing: slots, rules: dailyRules, newEnd: "2025-03-12", regenerateFrom: "2025-03-13", decimals: 1 });
    expect(plan.deleteIds).toHaveLength(4);
    expect(plan.insert).toEqual([]);
  });
  it("moves the end of a total-goal window and clips weekly windows", () => {
    const totalRules = [rule({ frequency: "total", effectiveFrom: START, totalTarget: 100 })];
    const total = slotsFrom(totalRules, START, "2025-03-16", 0).map((s) => ({ ...s, hasLogs: false }));
    const p1 = planScheduleChange({ existing: total, rules: totalRules, newEnd: "2025-03-30", regenerateFrom: "2025-03-17", decimals: 0 });
    expect(p1.update).toEqual([{ id: total[0]!.id, windowEnd: "2025-03-30" }]);
    expect(p1.insert).toEqual([]);

    const flexRules = [rule({ frequency: "weekly_flexible", effectiveFrom: START, weeklyTarget: 70 })];
    const weeks = slotsFrom(flexRules, START, "2025-03-16", 0).map((s) => ({ ...s, hasLogs: false }));
    const p2 = planScheduleChange({ existing: weeks, rules: flexRules, newEnd: "2025-03-12", regenerateFrom: "2025-03-13", decimals: 0 });
    expect(p2.update).toEqual([{ id: weeks[1]!.id, windowEnd: "2025-03-12", targetValue: 30 }]);
  });
});

describe("rule validation and normalisation", () => {
  it("rejects missing or non-positive targets", () => {
    expect(validateRule(rule({ frequency: "daily", effectiveFrom: START, sessionTarget: 0 }), 1, "quantity")).not.toEqual([]);
    expect(validateRule(rule({ frequency: "weekly_days", effectiveFrom: START, weekdays: [], weeklyTarget: 5 }), 1, "quantity")).not.toEqual([]);
    expect(validateRule(rule({ frequency: "weekly_days", effectiveFrom: START, weekdays: [1, 2], weeklyTarget: 0.1 }), 1, "quantity")).not.toEqual([]);
    expect(validateRule(rule({ frequency: "total", effectiveFrom: START, totalTarget: -3 }), 0, "quantity")).not.toEqual([]);
    expect(validateRule(rule({ frequency: "daily", effectiveFrom: START, sessionTarget: 2.5 }), 1, "quantity")).toEqual([]);
  });
  it("normalises completion rules to counts of one", () => {
    const n = normalizeRule(rule({ frequency: "weekly_days", effectiveFrom: START, weekdays: [5, 1, 3], weeklyTarget: 99 }), "completion");
    expect(n.weekdays).toEqual([1, 3, 5]);
    expect(n.weeklyTarget).toBe(3);
    expect(normalizeRule(rule({ frequency: "daily", effectiveFrom: START, sessionTarget: 50 }), "completion").sessionTarget).toBe(1);
  });
});
