import { describe, expect, it } from "vitest";
import { log, progress, rule } from "./helpers";

const START = "2025-03-03";
const daily = [rule({ frequency: "daily", effectiveFrom: START, sessionTarget: 5 })];

describe("streaks", () => {
  it("counts consecutive completed days and reports the longest run", () => {
    const { progress: p } = progress({
      rules: daily, today: "2025-03-09",
      logs: (s) => [0, 1, 2, 4, 5, 6].map((i) => log(s[i]!.windowStart, 5, s[i]!.id)),
    });
    expect(p.streak).toEqual({ current: 3, longest: 3, unit: "days" });
  });

  it("keeps the streak alive while today's session is still open", () => {
    const { progress: p } = progress({ rules: daily, today: "2025-03-05", logs: (s) => [0, 1].map((i) => log(s[i]!.windowStart, 5, s[i]!.id)) });
    expect(p.streak.current).toBe(2);
  });

  it("breaks the current streak on a missed day but remembers the longest", () => {
    const { progress: p } = progress({ rules: daily, today: "2025-03-08", logs: (s) => [0, 1, 2, 4].map((i) => log(s[i]!.windowStart, 5, s[i]!.id)) });
    expect(p.streak.current).toBe(1);
    expect(p.streak.longest).toBe(3);
  });

  it("a partial session does not count", () => {
    const { progress: p } = progress({ rules: daily, today: "2025-03-05", logs: (s) => [log(s[0]!.windowStart, 4.9, s[0]!.id)] });
    expect(p.streak.current).toBe(0);
  });

  it("skipped days are neutral", () => {
    const { progress: p } = progress({
      rules: daily, today: "2025-03-06", slotStatus: { 1: "skipped" },
      logs: (s) => [0, 2].map((i) => log(s[i]!.windowStart, 5, s[i]!.id)),
    });
    expect(p.streak.current).toBe(2);
  });

  it("only scheduled weekdays matter for weekly-day challenges", () => {
    const { progress: p } = progress({
      rules: [rule({ frequency: "weekly_days", effectiveFrom: START, weekdays: [1, 3, 5], weeklyTarget: 3 })],
      c: { trackingMethod: "completion", valueDecimals: 0 },
      today: "2025-03-11",
      logs: (s) => [0, 1, 2, 3].map((i) => log(s[i]!.windowStart, 1, s[i]!.id)),
    });
    expect(p.streak).toEqual({ current: 4, longest: 4, unit: "sessions" });
  });

  it("counts weeks for weekly-flexible challenges", () => {
    const { progress: p } = progress({
      c: { valueDecimals: 0 },
      rules: [rule({ frequency: "weekly_flexible", effectiveFrom: START, weeklyTarget: 20 })],
      today: "2025-03-14",
      logs: (s) => [log("2025-03-04", 20, s[0]!.id), log("2025-03-11", 25, s[1]!.id)],
    });
    expect(p.streak).toEqual({ current: 2, longest: 2, unit: "weeks" });
  });

  it("uses consecutive logged days for total-goal challenges", () => {
    const { progress: p } = progress({
      rules: [rule({ frequency: "total", effectiveFrom: START, totalTarget: 100 })],
      today: "2025-03-08",
      logs: (s) => ["2025-03-03", "2025-03-04", "2025-03-06", "2025-03-07"].map((d) => log(d, 3, s[0]!.id)),
    });
    expect(p.streak).toEqual({ current: 2, longest: 2, unit: "days" });
  });
});
