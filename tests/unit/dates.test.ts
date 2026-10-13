import { describe, expect, it } from "vitest";
import {
  addDays, daysInclusive, diffDays, eachDay, endOfIsoWeek, instantFromLocal, isValidISODate, isValidTimeZone,
  isoWeekday, localDateIn, nextMondayOnOrAfter, startOfIsoWeek,
} from "@/lib/core/dates";

describe("calendar dates", () => {
  it("validates ISO dates strictly", () => {
    expect(isValidISODate("2024-02-29")).toBe(true);
    expect(isValidISODate("2025-02-29")).toBe(false);
    expect(isValidISODate("2025-13-01")).toBe(false);
    expect(isValidISODate("25-1-1")).toBe(false);
  });
  it("does date arithmetic across month and year boundaries", () => {
    expect(addDays("2024-12-31", 1)).toBe("2025-01-01");
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(diffDays("2025-03-01", "2025-03-31")).toBe(30);
    expect(daysInclusive("2025-03-01", "2025-03-07")).toBe(7);
    expect(daysInclusive("2025-03-07", "2025-03-01")).toBe(0);
    expect(eachDay("2025-12-30", "2026-01-02")).toEqual(["2025-12-30", "2025-12-31", "2026-01-01", "2026-01-02"]);
  });
  it("uses ISO weeks (Mon–Sun)", () => {
    expect(isoWeekday("2025-03-03")).toBe(1);
    expect(isoWeekday("2025-03-09")).toBe(7);
    expect(startOfIsoWeek("2025-03-09")).toBe("2025-03-03");
    expect(endOfIsoWeek("2025-03-03")).toBe("2025-03-09");
    expect(nextMondayOnOrAfter("2025-03-03")).toBe("2025-03-03");
    expect(nextMondayOnOrAfter("2025-03-04")).toBe("2025-03-10");
  });
});

describe("time zones", () => {
  it("maps one instant to different local dates", () => {
    const instant = new Date("2025-03-10T16:30:00Z"); // 01:30 next day in Seoul
    expect(localDateIn(instant, "UTC")).toBe("2025-03-10");
    expect(localDateIn(instant, "Asia/Seoul")).toBe("2025-03-11");
    expect(localDateIn(instant, "America/Los_Angeles")).toBe("2025-03-10");
  });
  it("handles the last minute before and the first minute after local midnight", () => {
    expect(localDateIn(new Date("2025-03-10T14:59:59Z"), "Asia/Seoul")).toBe("2025-03-10");
    expect(localDateIn(new Date("2025-03-10T15:00:00Z"), "Asia/Seoul")).toBe("2025-03-11");
  });
  it("handles daylight-saving transitions", () => {
    // US spring forward 2025-03-09: 02:00 local does not exist
    expect(localDateIn(new Date("2025-03-09T07:59:00Z"), "America/New_York")).toBe("2025-03-09");
    expect(localDateIn(new Date("2025-11-02T05:30:00Z"), "America/New_York")).toBe("2025-11-02");
  });
  it("round-trips a local date/time to an instant", () => {
    const inst = instantFromLocal("2025-03-11", "06:30", "Asia/Seoul");
    expect(inst.toISOString()).toBe("2025-03-10T21:30:00.000Z");
    expect(localDateIn(inst, "Asia/Seoul")).toBe("2025-03-11");
  });
  it("validates zone names", () => {
    expect(isValidTimeZone("Asia/Tashkent")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
  });
});
