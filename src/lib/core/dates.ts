/**
 * Calendar-date helpers.
 *
 * The domain works with plain calendar dates ("YYYY-MM-DD") rather than instants,
 * so a plan like "run every Monday" never shifts when the user travels.
 * Instants are converted to the user's local calendar date exactly once, when an
 * activity is logged, and that local date is stored with the log.
 */
import { DateTime } from "luxon";

export type ISODate = string;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export function isValidISODate(value: string): value is ISODate {
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function toEpochDay(date: ISODate): number {
  const m = ISO_DATE_RE.exec(date);
  if (!m) throw new Error(`Invalid ISO date: ${date}`);
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / MS_PER_DAY);
}

export function fromEpochDay(day: number): ISODate {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromEpochDay(toEpochDay(date) + days);
}

/** Whole days from `a` to `b` (positive when b is after a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return toEpochDay(b) - toEpochDay(a);
}

/** Inclusive number of days in [start, end]; 0 when end < start. */
export function daysInclusive(start: ISODate, end: ISODate): number {
  return Math.max(0, diffDays(start, end) + 1);
}

export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a <= b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a >= b ? a : b;
}

/** ISO weekday: Monday = 1 … Sunday = 7. */
export function isoWeekday(date: ISODate): number {
  const dow = new Date(toEpochDay(date) * MS_PER_DAY).getUTCDay(); // 0 = Sunday
  return dow === 0 ? 7 : dow;
}

export function startOfIsoWeek(date: ISODate): ISODate {
  return addDays(date, 1 - isoWeekday(date));
}

export function endOfIsoWeek(date: ISODate): ISODate {
  return addDays(date, 7 - isoWeekday(date));
}

/** The first Monday on or after `date`. */
export function nextMondayOnOrAfter(date: ISODate): ISODate {
  return isoWeekday(date) === 1 ? date : addDays(startOfIsoWeek(date), 7);
}

export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = toEpochDay(start), e = toEpochDay(end); d <= e; d++) out.push(fromEpochDay(d));
  return out;
}

// ---------------------------------------------------------------------------
// Time zones
// ---------------------------------------------------------------------------

export function isValidTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== "string") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return DateTime.now().setZone(tz).isValid;
  } catch {
    return false;
  }
}

/** The calendar date on the wall clock of `timeZone` at the given instant. */
export function localDateIn(instant: Date, timeZone: string): ISODate {
  const dt = DateTime.fromJSDate(instant, { zone: timeZone });
  if (!dt.isValid) throw new Error(`Invalid time zone: ${timeZone}`);
  return dt.toISODate() as ISODate;
}

/** The instant at which the wall clock in `timeZone` reads `date` `time` (HH:mm). */
export function instantFromLocal(date: ISODate, time: string, timeZone: string): Date {
  const dt = DateTime.fromISO(`${date}T${time}`, { zone: timeZone });
  if (!dt.isValid) throw new Error(`Invalid local date-time: ${date} ${time} (${timeZone})`);
  return dt.toJSDate();
}

export function localTimeIn(instant: Date, timeZone: string): string {
  return DateTime.fromJSDate(instant, { zone: timeZone }).toFormat("HH:mm");
}

export function formatDateLong(date: ISODate): string {
  return DateTime.fromISO(date, { zone: "utc" }).toFormat("ccc, LLL d, yyyy");
}

export function formatDateShort(date: ISODate): string {
  return DateTime.fromISO(date, { zone: "utc" }).toFormat("LLL d");
}
