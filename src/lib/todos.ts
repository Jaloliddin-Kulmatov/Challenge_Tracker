/** One-off to-dos: reading a due date out of a message ("buy a SIM card tomorrow"). Pure. */
import { addDays, isoWeekday, isValidISODate, type ISODate } from "@/lib/core/dates";

const WEEKDAYS: Record<string, number> = {
  mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5, sat: 6, saturday: 6, sun: 7, sunday: 7,
};

/** A due date from one word, relative to the user's `today`: today, tomorrow, a weekday (the next one), or YYYY-MM-DD. */
export function parseDue(word: string, today: ISODate): ISODate | null {
  const w = word.toLowerCase().replace(/[.,!]+$/, "");
  if (w === "today") return today;
  if (w === "tomorrow" || w === "tmr" || w === "tmrw") return addDays(today, 1);
  if (isValidISODate(w)) return w;
  const wd = WEEKDAYS[w];
  if (wd) return addDays(today, ((wd - isoWeekday(today) + 6) % 7) + 1); // the next such day, never today
  return null;
}

/**
 * "buy a SIM card fri" → { title: "buy a SIM card", due: Friday }. Only a trailing word counts as the date, and
 * never the whole message ("Friday" alone is a title).
 */
export function splitDue(text: string, today: ISODate): { title: string; due: ISODate | null } {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const due = parseDue(words.at(-1)!, today);
    if (due) return { title: words.slice(0, -1).join(" "), due };
  }
  return { title: words.join(" "), due: null };
}
