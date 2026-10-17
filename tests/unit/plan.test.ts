import { describe, expect, it } from "vitest";
import { addDays, isoWeekday } from "@/lib/core/dates";
import { MALAYSIA_SEM4 as T } from "@/lib/plan/malaysia-semester4";
import {
  booksCount, checkKey, currentWeek, dailyTasksFor, dayCount, dayNumber, goalsCount, monthCount, monthFor, monthKeyOfWeek, monthRange,
  monthStats, nextMonth, perfectDays, planPhase, validateCheck, weekCount, weekOf, weekRange, weightTarget,
} from "@/lib/plan/logic";
import { applyContent, contentOf, newId, parsePlanContent } from "@/lib/plan/content";

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

  it("gives Mon–Sat ten tasks (nine without exercise) and Sunday a short rest-day list", () => {
    expect(keys(monday)).toHaveLength(10);
    expect(keys(tuesday)).toHaveLength(9);
    expect(keys(saturday)).toHaveLength(10);
    expect(keys(sunday)).toEqual(["nutrition", "german", "reading", "sleep", "weekly-review"]);
  });

  it("has German and reading every single day", () => {
    for (let i = 0; i < 7; i++) {
      const d = addDays(monday, i);
      expect(keys(d)).toEqual(expect.arrayContaining(["german", "reading"]));
    }
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
    expect(v("book:b1", "once")).toBeNull();
    expect(v("book:b9", "once")).toMatch(/Unknown/);
    expect(v("book:b1", "W1")).toMatch(/Invalid/);
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
    expect(dayCount(T, checks, monday)).toEqual({ done: 2, total: 10 });
    // week 1: Mon–Sat 10+9+10+10+9+10 = 58, Sunday 5, weekly goals 8, week tasks 3
    expect(weekCount(T, checks, 1)).toEqual({ done: 4, total: 58 + 5 + 8 + 3 });
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

describe("monthly numbers", () => {
  const oct = T.months[0]!, nov = T.months[1]!, feb = T.months[4]!;
  const m = (week: number, o: Partial<{ weightKg: number; youtubeSubs: number; instagramSubs: number; longRunKm: number }> = {}) => ({
    week, weightKg: null, youtubeSubs: null, instagramSubs: null, longRunKm: null, ...o,
  });

  it("clips months to the plan and puts each week in the month its Sunday falls in", () => {
    expect(monthRange(T, oct)).toEqual({ start: "2026-10-19", end: "2026-10-31" });
    expect(monthRange(T, T.months[2]!)).toEqual({ start: "2026-12-01", end: "2026-12-31" });
    expect(monthRange(T, feb)).toEqual({ start: "2027-02-01", end: "2027-02-28" });
    expect(monthKeyOfWeek(T, 1)).toBe("oct");
    expect(monthKeyOfWeek(T, 2)).toBe("nov"); // Oct 26 – Nov 1
    expect(monthKeyOfWeek(T, 19)).toBe("feb");
  });

  it("has a target for every number in every month, and books that reach three", () => {
    expect(T.months.map((x) => x.books)).toEqual([0, 1, 1, 2, 3]);
    expect(T.months.map((x) => x.youtube)).toEqual([100, 300, 550, 750, 1000]);
    expect(T.books).toHaveLength(3);
  });

  it("draws a straight weight line from the first logged weight to the goal, unless a month sets its own", () => {
    expect(weightTarget(T, oct, [])).toBeNull();
    const logged = [m(1, { weightKg: 75 })];
    expect(weightTarget(T, feb, logged)).toBe(65);
    const octTarget = weightTarget(T, oct, logged)!;
    const novTarget = weightTarget(T, nov, logged)!;
    expect(octTarget).toBeLessThan(75);
    expect(novTarget).toBeLessThan(octTarget);
    expect(novTarget).toBeGreaterThan(65);
    expect(weightTarget(T, nov, logged)).toBe(novTarget);
    expect(weightTarget(T, { ...nov, weightKg: 70 }, logged)).toBe(70);
  });

  it("reports actual vs target per month", () => {
    const metrics = [m(1, { youtubeSubs: 20, weightKg: 70, longRunKm: 10 }), m(2, { youtubeSubs: 40, longRunKm: 12 }), m(3, { youtubeSubs: 55, instagramSubs: 31, longRunKm: 9 })];
    const checks = new Set([checkKey("book:b1", "once"), checkKey("daily:german", "2026-10-19"), checkKey("daily:german", "2026-10-20")]);
    const o = monthStats(T, oct, metrics, checks, "2026-10-21");
    expect(o.youtube).toEqual({ target: 100, actual: 20 }); // week 2 ends in November
    expect(o.longRun).toEqual({ target: 15, actual: 10 });
    expect(o.weight.actual).toBe(70);
    expect(o.books).toEqual({ target: 0, actual: 1 });
    expect(o.habits.find((h) => h.label === "German days")).toEqual({ label: "German days", done: 2, total: 3 }); // Oct 19–21 so far
    const n = monthStats(T, nov, metrics, checks, "2026-11-30");
    expect(n.youtube.actual).toBe(55); // latest logged by the end of November
    expect(n.instagram.actual).toBe(31);
    expect(n.longRun.actual).toBe(12);
    expect(monthStats(T, feb, [], new Set(), "2026-10-21").habits).toEqual([]); // nothing to count in a month that hasn't started
  });

  it("counts books", () => {
    expect(booksCount(T, new Set([checkKey("book:b1", "once"), checkKey("book:b3", "once")]))).toEqual({ done: 2, total: 3 });
  });
});

describe("editing the plan", () => {
  const edited = () => {
    const c = structuredClone(contentOf(T));
    c.goals[0]!.target = "A in every course";
    c.goals.push({ key: newId("g"), area: "Sleep", target: "8 hours" });
    c.dailyTasks = c.dailyTasks.filter((d) => d.key !== "post");
    c.dailyTasks.push({ key: "walk", title: "Walk 20 min", weekdays: [7, 1] });
    c.books[0]!.title = "Deep Work";
    return c;
  };

  it("accepts the defaults and sensible edits (weekdays are sorted, duplicates dropped)", () => {
    expect(parsePlanContent(contentOf(T), T).ok).toBe(true);
    const r = parsePlanContent(edited(), T);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.content.dailyTasks.at(-1)!.weekdays).toEqual([1, 7]);
  });

  it("lays the edits over the template, and ticks follow the keys", () => {
    const r = parsePlanContent(edited(), T);
    if (!r.ok) throw new Error(r.error);
    const t2 = applyContent(T, r.content);
    expect(t2.goals[0]!.target).toBe("A in every course");
    expect(t2.goals.at(-1)!.area).toBe("Sleep");
    expect(t2.startDate).toBe(T.startDate);
    expect(dailyTasksFor(t2, "2026-10-19").map((x) => x.taskKey)).toContain("daily:walk");
    expect(dailyTasksFor(t2, "2026-10-20").map((x) => x.taskKey)).not.toContain("daily:walk");
    expect(dailyTasksFor(t2, "2026-10-19").map((x) => x.taskKey)).not.toContain("daily:post");
    // a removed task can't be ticked any more; a new one can
    expect(validateCheck(t2, "daily:post", "2026-10-19", "2026-10-21")).toMatch(/Unknown/);
    expect(validateCheck(t2, "daily:walk", "2026-10-19", "2026-10-21")).toBeNull();
    expect(validateCheck(t2, "goal:grades", "once", "2026-10-21")).toBeNull();
    expect(applyContent(T, null)).toBe(T);
    // the old tick of the removed task no longer counts
    const checks = new Set([checkKey("daily:post", "2026-10-19"), checkKey("daily:german", "2026-10-19")]);
    expect(dayCount(t2, checks, "2026-10-19")).toEqual({ done: 1, total: 10 }); // post removed, walk added
  });

  it("rejects bad edits with a clear message", () => {
    const bad = (mut: (c: ReturnType<typeof edited>) => void) => {
      const c = edited();
      mut(c);
      const r = parsePlanContent(c, T);
      return r.ok ? null : r.error;
    };
    expect(bad((c) => (c.goals[0]!.area = "   "))).toMatch(/can't be empty/);
    expect(bad((c) => (c.dailyTasks[0]!.weekdays = []))).toMatch(/at least one day/);
    expect(bad((c) => (c.dailyTasks[0]!.time = "7pm"))).toMatch(/time like/);
    expect(bad((c) => (c.goals[1]!.key = c.goals[0]!.key))).toMatch(/Duplicate/);
    expect(bad((c) => (c.months[0]!.youtube = Number.NaN))).toMatch(/must be a number/);
    expect(bad((c) => (c.months[0]!.youtube = -5))).toMatch(/negative/);
    expect(bad((c) => (c.months[0]!.weightKg = 5))).toMatch(/between 30 and 250/);
    expect(bad((c) => c.months.pop())).toMatch(/can't be added or removed/);
    expect(bad((c) => c.weeks.pop())).toMatch(/can't be added or removed/);
    expect(bad((c) => (c.months[0]!.month = 3))).toMatch(/can't be moved/);
    expect(bad((c) => (c.weeks[0]!.tasks[0]!.id = "oops"))).not.toBeNull();
    expect(parsePlanContent("nonsense", T).ok).toBe(false);
  });
});
