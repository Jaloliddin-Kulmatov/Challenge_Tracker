import { describe, expect, it } from "vitest";
import { MALAYSIA_SEM4 as T } from "@/lib/plan/malaysia-semester4";
import { checkKey, dailyTasksFor } from "@/lib/plan/logic";
import { composeReminder, reminderDue } from "@/lib/plan/reminder";

const WED = "2026-10-21";
const URL = "https://tracker.example.com/";

describe("reminder email", () => {
  it("lists what is still open today, with the 19:00 workout detail and a link to today", () => {
    const m = composeReminder(T, new Set([checkKey("daily:german", WED)]), WED, URL)!;
    expect(m.total).toBe(9);
    expect(m.left).toBe(8);
    expect(m.subject).toBe("Tick your day: 8 of 9 still open");
    expect(m.text).toContain("Exercise (Strength)");
    expect(m.text).not.toContain("German");
    expect(m.text).toContain("https://tracker.example.com/plan#today");
    expect(m.html).toContain('href="https://tracker.example.com/plan#today"');
  });

  it("stays quiet when the day is fully ticked, before the plan, and after it", () => {
    const all = new Set(dailyTasksFor(T, WED).map((d) => checkKey(d.taskKey, WED)));
    expect(composeReminder(T, all, WED, URL)).toBeNull();
    expect(composeReminder(T, new Set(), "2026-10-18", URL)).toBeNull();
    expect(composeReminder(T, new Set(), "2027-03-01", URL)).toBeNull();
  });

  it("escapes task text in the HTML part", () => {
    const t = { ...T, dailyTasks: [{ key: "x", title: "<b>Read</b> & \"write\"", weekdays: [1, 2, 3, 4, 5, 6, 7] }] };
    const m = composeReminder(t, new Set(), WED, URL)!;
    expect(m.html).toContain("&lt;b&gt;Read&lt;/b&gt; &amp; &quot;write&quot;");
    expect(m.html).not.toContain("<b>Read</b>");
  });

  it("is due from the reminder time for three hours, never before", () => {
    expect(reminderDue("23:29", "23:30")).toBe(false);
    expect(reminderDue("23:30", "23:30")).toBe(true);
    expect(reminderDue("23:45", "23:30")).toBe(true);
    expect(reminderDue("08:00", "23:30")).toBe(false);
    expect(reminderDue("11:00", "08:00")).toBe(true);
    expect(reminderDue("11:01", "08:00")).toBe(false);
  });
});
