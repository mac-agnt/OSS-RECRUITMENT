/* Time helpers. Everything is stored as a full ISO timestamp and calculated in
   minutes; display is always Europe/Dublin, 24-hour. */

export const TZ = "Europe/Dublin";

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat("en-IE", { timeZone: TZ, ...opts });
    cache.set(key, f);
  }
  return f;
}

export const ms = (iso: string): number => Date.parse(iso);

/** A wall-clock time in Dublin, as an ISO instant. */
export function zoned(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const parts = fmt({ year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(guess));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return new Date(guess - (local - guess)).toISOString();
}

export const addMin = (iso: string, m: number): string => new Date(ms(iso) + m * 60000).toISOString();
export const minutesBetween = (a: string, b: string): number => Math.round((ms(b) - ms(a)) / 60000);

export const fmtTime = (iso: string): string =>
  fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
export const fmtDate = (iso: string): string =>
  fmt({ weekday: "short", day: "numeric", month: "short" }).format(new Date(iso)).replace(",", "");
export const fmtDateLong = (iso: string): string =>
  fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso)).replace(",", "");
export const fmtDayMonth = (iso: string): string => fmt({ day: "numeric", month: "short" }).format(new Date(iso));
export const fmtDateTime = (iso: string): string => fmtDate(iso) + ", " + fmtTime(iso);

/** "2026-11-14" in Dublin. */
export function dayKey(iso: string): string {
  const p = fmt({ year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(iso));
  const g = (t: string) => p.find((x) => x.type === t)?.value;
  return g("year") + "-" + g("month") + "-" + g("day");
}
/** Day of week in Dublin, 0 = Sunday. */
export function weekday(iso: string): number {
  const name = fmt({ weekday: "short" }).format(new Date(iso));
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}
export const hourOf = (iso: string): number => Number(fmtTime(iso).slice(0, 2));

/** Minutes as "5h40m", "6h", "171h10m". Never as a decimal. */
export function fmtHM(min: number): string {
  const neg = min < 0;
  const m = Math.abs(Math.round(min));
  const h = Math.floor(m / 60), r = m % 60;
  return (neg ? "-" : "") + (r ? h + "h" + String(r).padStart(2, "0") + "m" : h + "h");
}
export const fmtEuro = (n: number): string =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function relTime(iso: string, now: string): string {
  const d = minutesBetween(iso, now);
  if (Math.abs(d) < 1) return "now";
  if (d > 0 && d < 60) return d + "m ago";
  if (d < 0 && d > -60) return "in " + -d + "m";
  if (d > 0 && d < 60 * 24 && dayKey(iso) === dayKey(now)) return fmtTime(iso);
  return fmtDateTime(iso);
}

/** Add whole days to a date key. */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
