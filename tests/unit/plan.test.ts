import { describe, expect, it } from "vitest";
import { addDays, isoWeekday } from "@/lib/core/dates";
import { MALAYSIA_SEM4 as T } from "@/lib/plan/malaysia-semester4";
import {
  checkKey, currentWeek, dailyTasksFor, dayCount, dayNumber, goalsCount, monthCount, monthFor, nextMonth, perfectDays,
  planPhase, validateCheck, weekCount, weekOf, weekRange,
} from "@/lib/plan/logic";

describe("plan calendar", () => {
  it("starts on a Monday and ends on a Sunday, 19 weeks later", () => {
    expect(isoWeekday(T.startDate)).toBe(1);
    expect(isoWeekday(T.endDate)).toBe(7);
    expect(T.weeks).toHaveLength(19);
    expect(weekRange(T, 19)).toEqual({ start: "2027-02-22", end: "2027-02-28" });
    expect(dayNumber(T, T.endDate)).toEqual({ day: 133, total: 133 });
  });

  it("week date ranges match the document", () => {
    const expected: Record<number, [string, string]> = {
      1: ["2026-10-19", "2026-10-25"], 2: ["2026-10-26", "2026-11-01"], 3: ["2026-11-02", "2026-11-08"],
      4: ["2026-11-09", "2026-11-15"], 5: ["2026-11-16", "2026-11-22"], 6: ["2026-11-23", "2026-11-29"],
      7: ["2026-11-30", "2026-12-06"], 8: ["2026-12-07", "2026-12-13"], 9: ["2026-12-14", "2026-12-20"],
      10: ["2026-12-21", "2026-12-27"], 11: ["2026-12-28", "2027-01-03"], 12: ["2027-01-04", "2027-01-10"],
      13: ["2027-01-11", "2027-01-17"], 14: ["2027-01-18", "2027-01-24"], 15: ["2027-01-25", "2027-01-31"],
      16: ["2027-02-01", "2027-02-07"], 17: ["2027-02-08", "2027-02-14"], 18: ["2027-02-15", "2027-02-21"],
      19: ["2027-02-22", "2027-02-28"],
    };
    for (const [n, [start, end]] of Object.entries(expected)) expect(weekRange(T, Number(n))).toEqual({ start, end });
  });

  it("finds the week of a date and clamps before/after the plan", () => {
    expect(weekOf(T, "2026-10-19")).toBe(1);
    expect(weekOf(T, "2026-10-25")).toBe(1);
    expect(weekOf(T, "2026-10-26")).toBe(2);
    expect(weekOf(T, "2026-10-18")).toBeNull();
    expect(currentWeek(T, "2026-10-17")).toBe(1);
    expect(currentWeek(T, "2027-03-05")).toBe(19);
    expect(planPhase(T, "2026-10-17")).toBe("upcoming");
    expect(planPhase(T, "2026-12-01")).toBe("running");
    expect(planPhase(T, "2027-03-01")).toBe("finished");
  });

  it("picks the month card by calendar month, clamped to the plan", () => {
    expect(monthFor(T, "2026-10-17").key).toBe("oct");
    expect(monthFor(T, "2026-12-31").key).toBe("dec");
    expect(monthFor(T, "2027-02-10").key).toBe("feb");
    expect(monthFor(T, "2027-06-01").key).toBe("feb");
    expect(nextMonth(T, monthFor(T, "2026-11-20"))!.key).toBe("dec");
    expect(nextMonth(T, monthFor(T, "2027-02-10"))).toBeNull();
  });

  it("the monthly long-run targets agree with the long runs in the weekly plan", () => {
    expect(T.months.map((m) => m.longRunKm)).toEqual([15, 17, 20, 21, 25]);
    expect(T.weeks[0]!.longRun).toBe("long run 15 km");
    expect(T.weeks[18]!.longRun).toBe("long run 25 km");
  });
});

describe("daily tasks", () => {
  const monday = "2026-10-19", tuesday = "2026-10-20", thursday = "2026-10-22", saturday = "2026-10-24", sunday = "2026-10-25";
  const keys = (d: string) => dailyTasksFor(T, d).map((x) => x.taskKey.replace("daily:", ""));

  it("schedules exercise on Mon, Wed, Thu and Sat – at 19:00, not in the morning", () => {
    for (const d of [monday, "2026-10-21", thursday, saturday]) {
      const ex = dailyTasksFor(T, d).find((x) => x.taskKey === "daily:exercise");
      expect(ex?.time).toBe("19:00");
    }
    expect(keys(tuesday)).not.toContain("exercise");
    expect(keys("2026-10-23")).not.toContain("exercise"); // Friday
    expect(JSON.stringify(T)).not.toContain("06:30");
  });

  it("labels the workout and adds the long-run distance on Thursdays", () => {
    expect(dailyTasksFor(T, monday).find((x) => x.taskKey === "daily:exercise")!.detail).toBe("Easy run");
    expect(dailyTasksFor(T, thursday).find((x) => x.taskKey === "daily:exercise")!.detail).toBe("Long run · 15 km");
    expect(dailyTasksFor(T, "2027-01-21").find((x) => x.taskKey === "daily:exercise")!.detail).toBe("Light runs only");
  });

  it("gives Mon–Sat nine tasks and Sunday a short rest-day list", () => {
    expect(keys(monday)).toHaveLength(9);
    expect(keys(tuesday)).toHaveLength(8);
    expect(keys(saturday)).toHaveLength(9);
    expect(keys(sunday)).toEqual(["nutrition", "sleep", "weekly-review"]);
  });
});

describe("validating ticks", () => {
  const today = "2026-10-21"; // Wednesday of week 1
  const v = (key: string, period: string) => validateCheck(T, key, period, today);

  it("accepts today and past days, rejects future days and days off the schedule", () => {
    expect(v("daily:exercise", "2026-10-21")).toBeNull();
    expect(v("daily:german", "2026-10-19")).toBeNull();
    expect(v("daily:german", "2026-10-22")).toMatch(/hasn't happened/);
    expect(v("daily:exercise", "2026-10-20")).toMatch(/isn't scheduled/); // Tuesday
    expect(v("daily:german", "2026-10-18")).toMatch(/outside/);
    expect(v("daily:german", "not-a-date")).toMatch(/Invalid/);
    expect(v("daily:nope", "2026-10-21")).toMatch(/Unknown/);
  });

  it("weekly goals need a started week; week tasks and goals can be ticked early", () => {
    expect(v("weekly:youtube", "W1")).toBeNull();
    expect(v("weekly:youtube", "W2")).toMatch(/hasn't started/);
    expect(v("weekly:youtube", "W20")).toMatch(/Invalid/);
    expect(v("wtask:w9t1", "W9")).toBeNull();
    expect(v("wtask:w9t1", "W8")).toMatch(/Invalid/);
    expect(v("wtask:w9t9", "W9")).toMatch(/Unknown/);
    expect(v("goal:grades", "once")).toBeNull();
    expect(v("goal:grades", "W1")).toMatch(/Invalid/);
    expect(v("mres:oct:r1", "once")).toBeNull();
    expect(v("mres:oct:r9", "once")).toMatch(/Unknown/);
    expect(v("bogus:thing", "once")).toMatch(/Unknown/);
  });
});

describe("progress counts", () => {
  it("counts a day, a week, the goals and a month", () => {
    const monday = "2026-10-19";
    const checks = new Set<string>([
      checkKey("daily:exercise", monday), checkKey("daily:german", monday), checkKey("weekly:youtube", "W1"),
      checkKey("wtask:w1t1", "W1"), checkKey("goal:grades", "once"), checkKey("mres:oct:r1", "once"),
    ]);
    expect(dayCount(T, checks, monday)).toEqual({ done: 2, total: 9 });
    // week 1: Mon–Sat 9+8+9+9+8+9 = 52, Sunday 3, weekly goals 8, week tasks 3
    expect(weekCount(T, checks, 1)).toEqual({ done: 4, total: 52 + 3 + 8 + 3 });
    expect(goalsCount(T, checks)).toEqual({ done: 1, total: 11 });
    expect(monthCount(T, checks, T.months[0]!)).toEqual({ done: 1, total: 3 });
  });

  it("counts perfect days", () => {
    const sunday = "2026-10-25";
    const checks = new Set(dailyTasksFor(T, sunday).map((d) => checkKey(d.taskKey, sunday)));
    expect(perfectDays(T, checks, "2026-10-26")).toBe(1);
    expect(perfectDays(T, new Set(), "2026-10-26")).toBe(0);
    expect(addDays(sunday, 1)).toBe("2026-10-26");
  });
});
