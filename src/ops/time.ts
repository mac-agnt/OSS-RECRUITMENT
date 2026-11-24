/* Time helpers. Everything is stored as an ISO instant and calculated in minutes;
   display is always Europe/Dublin, 24-hour. Builds on the shared helpers. */

import { addDays, dayKey, fmtDate, fmtTime, ms, weekday, zoned } from "../oss/time";

export {
  TZ, ms, zoned, addMin, minutesBetween, fmtTime, fmtDate, fmtDateLong, fmtDayMonth, fmtDateTime,
  dayKey, weekday, hourOf, fmtHM, DAY_NAMES, relTime, addDays
} from "../oss/time";

/** Today's date key in Dublin for a real-world instant. */
export const todayKey = (now: Date = new Date()) => dayKey(now.toISOString());

/** ISO instant for a wall-clock time on a day, optionally a number of days later. */
export const atDay = (day: string, time: string, plusDays = 0) => zoned(plusDays ? addDays(day, plusDays) : day, time);

/** Monday = 0 ... Sunday = 6, in Dublin. */
export const isoWeekday = (iso: string) => (weekday(iso) + 6) % 7;
/** Same, for a date key. */
export const isoWeekdayOfDay = (day: string) => isoWeekday(zoned(day, "12:00"));

/** Monday of the week containing the instant, as a date key. */
export const weekStartKey = (iso: string) => addDays(dayKey(iso), -isoWeekday(iso));

/** Whole days from a to b (date keys). */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split("-").map(Number), [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
}

/** Minutes past midnight of the instant's own Dublin day. */
export function localMin(iso: string): number {
  const [h, m] = fmtTime(iso).split(":").map(Number);
  return h * 60 + m;
}

/** "Tue 24 Nov" for a date key. */
export const fmtDay = (day: string) => fmtDate(zoned(day, "12:00"));

/** Euro with cents, for pay. */
export const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

/** Decimal hours for exports (5.5), never for display. */
export const decHours = (min: number) => Math.round((min / 60) * 100) / 100;

/** "08:30-14:30", adding "+1" when the end is on the next day. */
export function span(start: string, end: string): string {
  return fmtTime(start) + "-" + fmtTime(end) + (dayKey(end) !== dayKey(start) ? " +1" : "");
}

/** True if the two instants are in the same Dublin day. */
export const sameDay = (a: string, b: string) => dayKey(a) === dayKey(b);

export const nowMs = (iso: string) => ms(iso);
