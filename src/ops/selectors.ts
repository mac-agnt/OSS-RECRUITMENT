/* Every derived number in the app. Office, supervisor and crew screens read only
   through these, so they can never disagree. */

import type {
  Approval, Assignment, Avail, ClockEvent, Doc, DocType, Event, Exception, Message, Offer, OpsState, Shift, Standby,
  Thread, Update, User, Venue, Worker
} from "./model";
import { CODE_LABEL, DOC_LABEL, needsRtw } from "./model";
import {
  addDays, addMin, dayKey, daysBetween, fmtDay, fmtDayY, fmtHM, fmtTime, isoWeekday, localMin, minutesBetween, ms, weekStartKey, zoned
} from "./time";

/* ── indexes (cached per array; engine drafts push in place, so length invalidates) ── */
const idx = new WeakMap<object, { n: number; m: Map<string, unknown> }>();
function index<T extends { id: string }>(list: T[]): Map<string, T> {
  let c = idx.get(list);
  if (!c || c.n !== list.length) { c = { n: list.length, m: new Map(list.map((x) => [x.id, x])) }; idx.set(list, c); }
  return c.m as Map<string, T>;
}
const grp = new WeakMap<object, Map<string, { n: number; m: Map<string, unknown[]> }>>();
function groups<T>(list: T[], field: string, key: (x: T) => string): Map<string, T[]> {
  let f = grp.get(list);
  if (!f) { f = new Map(); grp.set(list, f); }
  let c = f.get(field);
  if (!c || c.n !== list.length) {
    const m = new Map<string, unknown[]>();
    for (const x of list) { const k = key(x); const a = m.get(k); if (a) a.push(x); else m.set(k, [x]); }
    c = { n: list.length, m }; f.set(field, c);
  }
  return c.m as Map<string, T[]>;
}
const NONE: never[] = [];
export const rowsBy = <T>(list: T[], field: string, key: (x: T) => string, value: string): T[] =>
  groups(list, field, key).get(value) || (NONE as T[]);

/* ── lookups ────────────────────────────────────────────────────────────── */
export const worker = (s: OpsState, id: string) => index(s.workers).get(id) as Worker;
export const user = (s: OpsState, id: string) => index(s.users).get(id) as User | undefined;
export const client = (s: OpsState, id: string) => index(s.clients).get(id)!;
export const venue = (s: OpsState, id: string) => index(s.venues).get(id) as Venue;
export const event = (s: OpsState, id: string) => index(s.events).get(id) as Event;
export const shift = (s: OpsState, id: string) => index(s.shifts).get(id) as Shift;
export const asg = (s: OpsState, id: string) => index(s.assignments).get(id) as Assignment;
export const offer = (s: OpsState, id: string) => index(s.offers).get(id) as Offer;
export const exceptionById = (s: OpsState, id: string) => index(s.exceptions).get(id) as Exception;
export const docById = (s: OpsState, id: string) => index(s.docs).get(id) as Doc;
export const threadById = (s: OpsState, id: string) => index(s.threads).get(id) as Thread | undefined;
export function nameOf(s: OpsState, id: string): string {
  if (id === "office") return "OSS office";
  if (id === "system") return "OSS automatic";
  return (id.startsWith("W") ? worker(s, id)?.name : user(s, id)?.name) || id;
}
export const firstName = (name: string) => name.split(" ")[0];

const byStart = (a: Shift, b: Shift) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id);
export const shiftsOf = (s: OpsState, eventId: string) => rowsBy(s.shifts, "event", (x) => x.eventId, eventId).slice().sort(byStart);
export const asgsOfShift = (s: OpsState, shiftId: string) => rowsBy(s.assignments, "shift", (a) => a.shiftId, shiftId);
export const asgsOfWorker = (s: OpsState, workerId: string) => rowsBy(s.assignments, "worker", (a) => a.workerId, workerId);
export const offersOfShift = (s: OpsState, shiftId: string) => rowsBy(s.offers, "shift", (o) => o.shiftId, shiftId);
export const offersOfWorker = (s: OpsState, workerId: string) => rowsBy(s.offers, "worker", (o) => o.workerId, workerId);
export const standbyOf = (s: OpsState, shiftId: string) => rowsBy(s.standby, "shift", (b) => b.shiftId, shiftId).slice().sort((a, b) => a.order - b.order);
export const standbyOfWorker = (s: OpsState, workerId: string) => rowsBy(s.standby, "worker", (b) => b.workerId, workerId);
export const docsOf = (s: OpsState, workerId: string) => rowsBy(s.docs, "worker", (d) => d.workerId, workerId);
export const updatesOf = (s: OpsState, asgId: string) => rowsBy(s.updates, "asg", (u) => u.asgId, asgId).slice().sort((a, b) => a.at.localeCompare(b.at));
export const clocksOf = (s: OpsState, asgId: string) => rowsBy(s.clocks, "asg", (c) => c.asgId, asgId).slice().sort((a, b) => a.at.localeCompare(b.at));
export const exceptionsOf = (s: OpsState, asgId: string) => rowsBy(s.exceptions, "asg", (e) => e.asgId, asgId);
export const approvalsOf = (s: OpsState, asgId: string) => rowsBy(s.approvals, "asg", (a) => a.asgId, asgId);
export const messagesOf = (s: OpsState, threadId: string) => rowsBy(s.messages, "thread", (m) => m.threadId, threadId);
export const eventsOfClient = (s: OpsState, clientId: string) => rowsBy(s.events, "client", (e) => e.clientId, clientId);

export const shiftVenue = (s: OpsState, sh: Shift) => venue(s, sh.venueId || event(s, sh.eventId).venueId);
export const shiftSupervisor = (s: OpsState, sh: Shift) => sh.supervisorId || event(s, sh.eventId).supervisorId;
export const confirmedOf = (s: OpsState, shiftId: string, role?: string) =>
  asgsOfShift(s, shiftId).filter((a) => a.status === "confirmed" && (!role || a.role === role));
export const isOpenOffer = (s: OpsState, o: Offer) => o.status === "sent" && ms(o.expiresAt) > ms(s.clock);
export const openOffersOf = (s: OpsState, shiftId: string, role?: string) =>
  offersOfShift(s, shiftId).filter((o) => isOpenOffer(s, o) && (!role || o.role === role));
export const can = (s: OpsState, userId: string, perm: string) => !!user(s, userId)?.perms.includes(perm as never);

/* ── shift and event timing ─────────────────────────────────────────────── */
export const netMinutes = (s: OpsState, sh: Shift) => {
  const m = minutesBetween(sh.start, sh.end);
  return m > s.rules.breakAfterMin ? m - s.rules.breakMin : m;
};
export function eventSpan(s: OpsState, eventId: string): { start: string; end: string } {
  const list = shiftsOf(s, eventId);
  if (!list.length) return { start: s.clock, end: s.clock };
  return { start: list[0].start, end: list.reduce((m, x) => (x.end > m ? x.end : m), list[0].end) };
}
export type Phase = "upcoming" | "live" | "done";
export function shiftPhase(s: OpsState, sh: Shift): Phase {
  const now = ms(s.clock);
  return now < ms(sh.start) ? "upcoming" : now >= ms(sh.end) ? "done" : "live";
}
export function eventPhase(s: OpsState, eventId: string): Phase {
  const sp = eventSpan(s, eventId);
  const now = ms(s.clock);
  return now < ms(sp.start) ? "upcoming" : now >= ms(sp.end) ? "done" : "live";
}
/** Firm events with a shift starting on the given Dublin day, earliest first. */
export function eventsOnDay(s: OpsState, day: string): Event[] {
  const firstOn = (e: Event) => shiftsOf(s, e.id).find((x) => dayKey(x.start) === day);
  return s.events.filter((e) => e.status === "confirmed" && firstOn(e))
    .sort((a, b) => firstOn(a)!.start.localeCompare(firstOn(b)!.start));
}
export const shiftsOnDay = (s: OpsState, eventId: string, day: string) => shiftsOf(s, eventId).filter((x) => dayKey(x.start) === day);

/* ── coverage ───────────────────────────────────────────────────────────── */
export interface Cov { required: number; confirmed: number; outstanding: number; offered: number; standby: number; flagged: number }
export const need = (sh: Shift, role?: string) => sh.needs.filter((n) => !role || n.role === role).reduce((t, n) => t + n.count, 0);
export function coverage(s: OpsState, shiftId: string, role?: string): Cov {
  const sh = shift(s, shiftId);
  const required = need(sh, role);
  const conf = confirmedOf(s, shiftId, role);
  return {
    required, confirmed: conf.length, outstanding: Math.max(0, required - conf.length),
    offered: openOffersOf(s, shiftId, role).length,
    standby: standbyOf(s, shiftId).filter((b) => !role || b.role === role).length,
    flagged: conf.filter((a) => a.flaggedAt).length
  };
}
const ZERO: Cov = { required: 0, confirmed: 0, outstanding: 0, offered: 0, standby: 0, flagged: 0 };
export function sumCov(list: Cov[]): Cov {
  return list.reduce((t, c) => ({
    required: t.required + c.required, confirmed: t.confirmed + c.confirmed, outstanding: t.outstanding + c.outstanding,
    offered: t.offered + c.offered, standby: t.standby + c.standby, flagged: t.flagged + c.flagged
  }), ZERO);
}
export const eventCov = (s: OpsState, eventId: string, shifts?: Shift[]) => sumCov((shifts || shiftsOf(s, eventId)).map((x) => coverage(s, x.id)));

export type Tone = "ok" | "warn" | "bad" | "grey" | "info";
export interface StatusView { tone: Tone; label: string; detail: string }
/** Staffing status for an event (or a subset of its shifts): green, amber, red or grey, always with text. */
export function staffStatus(s: OpsState, eventId: string, shifts?: Shift[]): StatusView {
  const ev = event(s, eventId);
  if (ev.status === "cancelled") return { tone: "grey", label: "Cancelled", detail: ev.cancelReason || "Booking cancelled" };
  const now = ms(s.clock);
  const all = shifts || shiftsOf(s, eventId);
  const open = all.filter((x) => ms(x.end) > now);
  if (!all.length) return { tone: "grey", label: "No shifts", detail: "Add a shift" };
  if (!open.length) { const c = eventCov(s, eventId, all); return { tone: "grey", label: "Completed", detail: c.confirmed + " worked" }; }
  const c = eventCov(s, eventId, open);
  const firstStart = Math.min(...open.map((x) => ms(x.start)));
  const days = (firstStart - now) / 864e5;
  const soonShort = open.some((x) => ms(x.start) - now < 3 * 3600e3 && coverage(s, x.id).outstanding > 0);
  if (c.flagged > 0) return { tone: "bad", label: "Needs attention", detail: c.flagged + " not responding" };
  if (c.outstanding === 0) return { tone: "ok", label: "Fully staffed", detail: c.confirmed + " of " + c.required };
  if ((c.confirmed === 0 && days < 14) || (c.confirmed / c.required < 0.5 && days < 7) || soonShort)
    return { tone: "bad", label: c.confirmed === 0 ? "Unstaffed" : "Short staffed", detail: c.outstanding + " to fill" };
  return { tone: "warn", label: "Partially staffed", detail: c.outstanding + " to fill" };
}

/* ── replies and attendance ─────────────────────────────────────────────── */
export type Travel = "none" | "on_way" | "late" | "arrived" | "lost";
export type AttState = "upcoming" | "no_reply" | "on_way" | "late" | "lost" | "arrived" | "in" | "out" | "pending" | "missing" | "ended";
export interface AsgView {
  a: Assignment; w: Worker; sh: Shift;
  reconfirmed: boolean; travel: Travel; eta?: string; last?: Update;
  inAt?: string; outAt?: string; pendingSync: boolean;
  flagged: boolean; openEx: Exception[]; state: AttState; label: string; tone: Tone;
}
const TRAVEL_CODES = ["on_way", "late", "arrived", "lost"];
export function okClock(s: OpsState, asgId: string, kind: "in" | "out"): ClockEvent | undefined {
  const list = clocksOf(s, asgId).filter((c) => c.kind === kind && c.result === "ok");
  return list[list.length - 1];
}
export function asgView(s: OpsState, asgId: string): AsgView {
  const a = asg(s, asgId), w = worker(s, a.workerId), sh = shift(s, a.shiftId);
  const ups = updatesOf(s, asgId);
  const last = ups[ups.length - 1];
  const tr = ups.filter((u) => TRAVEL_CODES.includes(u.code)).pop();
  const travel = (tr?.code as Travel) || "none";
  const inC = okClock(s, asgId, "in"), outC = okClock(s, asgId, "out");
  const pendingSync = clocksOf(s, asgId).some((c) => c.result === "pending_sync");
  const openEx = exceptionsOf(s, asgId).filter((e) => e.status === "open");
  const now = ms(s.clock);
  const started = now >= ms(sh.start);
  const etaLater = travel === "late" && tr?.eta && ms(tr.eta) > now;
  let state: AttState; let label: string; let tone: Tone;
  if (a.status !== "confirmed") { state = "ended"; label = a.status === "cancelled" ? "Cancelled" : a.status === "stood_down" ? "Stood down" : "Removed"; tone = "grey"; }
  else if (outC) { state = "out"; label = "Clocked out " + fmtTime(outC.at); tone = "grey"; }
  else if (inC) { state = "in"; label = "Clocked in " + fmtTime(inC.at); tone = "ok"; }
  else if (pendingSync) { state = "pending"; label = "Clock-in waiting to sync"; tone = "warn"; }
  else if (started && now >= ms(sh.end)) { state = "missing"; label = "Did not clock in"; tone = "bad"; }
  else if (started && !etaLater && now - ms(sh.start) > 10 * 60000) { state = "missing"; label = travel === "late" ? "Late, past ETA" : "Not clocked in"; tone = "bad"; }
  else if (travel === "arrived") { state = "arrived"; label = "Arrived " + fmtTime(tr!.at); tone = "ok"; }
  else if (travel === "lost") { state = "lost"; label = "Cannot find the location"; tone = "bad"; }
  else if (travel === "late") { state = "late"; label = "Running late" + (tr?.eta ? ", ETA " + fmtTime(tr.eta) : ""); tone = "warn"; }
  else if (travel === "on_way") { state = "on_way"; label = "On the way"; tone = "info"; }
  else if (a.flaggedAt) { state = "no_reply"; label = "No reply"; tone = "bad"; }
  else { state = "upcoming"; label = a.reconfirmedAt ? "Confirmed" : "Booked"; tone = "grey"; }
  return { a, w, sh, reconfirmed: !!a.reconfirmedAt, travel, eta: tr?.eta, last, inAt: inC?.at, outAt: outC?.at, pendingSync, flagged: !!a.flaggedAt, openEx, state, label, tone };
}
export interface AttCounts { confirmed: number; noReply: number; onWay: number; late: number; lost: number; arrived: number; in: number; out: number; missing: number; pending: number; standby: number }
export function attendance(s: OpsState, shifts: Shift[]): AttCounts {
  const c: AttCounts = { confirmed: 0, noReply: 0, onWay: 0, late: 0, lost: 0, arrived: 0, in: 0, out: 0, missing: 0, pending: 0, standby: 0 };
  for (const sh of shifts) {
    c.standby += standbyOf(s, sh.id).length;
    for (const a of confirmedOf(s, sh.id)) {
      c.confirmed++;
      const v = asgView(s, a.id);
      if (v.state === "no_reply") c.noReply++; else if (v.state === "on_way") c.onWay++; else if (v.state === "late") c.late++;
      else if (v.state === "lost") c.lost++; else if (v.state === "arrived") c.arrived++; else if (v.state === "in") c.in++;
      else if (v.state === "out") c.out++; else if (v.state === "missing") c.missing++; else if (v.state === "pending") c.pending++;
    }
  }
  return c;
}
/** Which request a confirmed worker still owes a reply to, if any. */
export function owedReply(s: OpsState, a: Assignment): "travel" | "reconfirm" | null {
  if (a.status !== "confirmed") return null;
  const sh = shift(s, a.shiftId);
  if (ms(s.clock) >= ms(sh.start)) return null;
  const v = sh.version;
  if (s.autoRuns.some((r) => r.key === "travel:" + sh.id + ":v" + v)) {
    const since = ms(sh.start) - s.rules.travelH * 3600e3;
    return updatesOf(s, a.id).some((u) => TRAVEL_CODES.includes(u.code) && ms(u.at) >= since) ? null : "travel";
  }
  if (s.autoRuns.some((r) => r.key === "reconfirm:" + sh.id + ":v" + v)) return a.reconfirmedAt ? null : "reconfirm";
  return null;
}

/* ── documents and compliance ───────────────────────────────────────────── */
export type DocKey = "valid" | "expiring" | "expired" | "missing" | "pending" | "rejected" | "not_required";
export interface DocView { state: DocKey; doc?: Doc; label: string; daysLeft?: number }
export function docState(s: OpsState, workerId: string, type: DocType, at: string = s.clock): DocView {
  const w = worker(s, workerId);
  if (type === "RTW" && !needsRtw(w.rtw)) return { state: "not_required", label: "Not required (" + w.rtw + ")" };
  const docs = docsOf(s, workerId).filter((d) => d.type === type);
  const verified = docs.filter((d) => d.status === "verified").sort((a, b) => (b.expires || "9999").localeCompare(a.expires || "9999"))[0];
  const pending = docs.filter((d) => d.status === "pending").sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0];
  const day = dayKey(at);
  if (verified && (!verified.expires || verified.expires >= day)) {
    const daysLeft = verified.expires ? daysBetween(dayKey(s.clock), verified.expires) : undefined;
    const expiring = daysLeft !== undefined && daysLeft <= s.rules.expiryWarnDays;
    return { state: expiring ? "expiring" : "valid", doc: verified, daysLeft, label: expiring ? "Expires " + fmtDayY(verified.expires!, dayKey(s.clock)) : "Valid" + (verified.expires ? " to " + fmtDayY(verified.expires, dayKey(s.clock)) : "") };
  }
  if (pending) return { state: "pending", doc: pending, label: "Uploaded, awaiting verification" };
  if (verified) {
    const before = verified.expires! >= dayKey(s.clock);
    return { state: "expired", doc: verified, daysLeft: daysBetween(dayKey(s.clock), verified.expires!), label: before ? "Expires " + fmtDayY(verified.expires!, dayKey(s.clock)) + ", before this shift" : "Expired " + fmtDayY(verified.expires!, dayKey(s.clock)) };
  }
  const rej = docs.find((d) => d.status === "rejected");
  if (rej) return { state: "rejected", doc: rej, label: "Rejected" + (rej.note ? ": " + rej.note : "") };
  return { state: "missing", label: "Not on file" };
}
export const mandatoryTypes = (w: Worker): DocType[] => (needsRtw(w.rtw) ? ["ID", "RTW"] : ["ID"]);
export function skillQuals(s: OpsState, w: Worker): DocType[] {
  const out = new Set<DocType>();
  for (const r of w.roles) for (const t of s.rules.roleQuals[r] || []) out.add(t);
  return [...out];
}
export interface CompItem { type: DocType; view: DocView; mandatory: boolean }
export interface CompView { level: "ok" | "expiring" | "action"; items: CompItem[]; summary: string }
export function compliance(s: OpsState, workerId: string): CompView {
  const w = worker(s, workerId);
  const types = new Set<DocType>([...mandatoryTypes(w), ...skillQuals(s, w)]);
  for (const d of docsOf(s, workerId)) types.add(d.type);
  const items: CompItem[] = [...types].map((t) => ({ type: t, view: docState(s, workerId, t), mandatory: mandatoryTypes(w).includes(t) }));
  const bad = items.filter((i) => i.mandatory && ["expired", "missing", "rejected"].includes(i.view.state));
  const pend = items.filter((i) => i.view.state === "pending");
  const exp = items.filter((i) => i.view.state === "expiring" || (!i.mandatory && ["expired", "missing", "rejected"].includes(i.view.state) && skillQuals(s, w).includes(i.type)));
  if (w.status === "pending_verification") return { level: "action", items, summary: "Registered, documents not yet verified" };
  if (bad.length) return { level: "action", items, summary: bad.map((i) => DOC_LABEL[i.type] + " " + (i.view.state === "missing" ? "missing" : i.view.state)).join(", ") };
  if (pend.length) return { level: "expiring", items, summary: pend.length + " awaiting verification" };
  if (exp.length) return { level: "expiring", items, summary: exp.map((i) => DOC_LABEL[i.type] + (i.view.state === "expiring" ? " expiring" : " " + i.view.state)).join(", ") };
  return { level: "ok", items, summary: "All documents valid" };
}

/* ── availability and weekly hours ──────────────────────────────────────── */
const WIN: Record<Avail, [number, number] | null> = { a: [0, 1800], d: [300, 1140], e: [900, 1590], x: null, "?": null };
export const AVAIL_LABEL: Record<Avail, string> = { a: "All day", d: "Daytime", e: "Evenings", x: "Not available", "?": "Not set" };
const WD = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
export function availabilityAt(s: OpsState, workerId: string, start: string, end: string): { state: "available" | "unavailable" | "unknown"; detail: string } {
  const w = worker(s, workerId);
  const day = dayKey(start);
  const off = w.off.find((o) => day >= o.from && day <= o.to);
  if (off) return { state: "unavailable", detail: (off.note || "Away") + " " + fmtDay(off.from) + (off.to !== off.from ? " to " + fmtDay(off.to) : "") };
  // Weekly patterns describe the next few weeks; further ahead, accepting the offer confirms availability.
  if (ms(start) - ms(s.clock) > 28 * 864e5) return { state: "unknown", detail: "More than four weeks ahead: accepting the offer confirms availability" };
  const wd = isoWeekday(start);
  const c = (w.week[wd] || "?") as Avail;
  if (c === "?") return { state: "unknown", detail: "Availability not set for " + WD[wd] };
  if (c === "x") return { state: "unavailable", detail: "Not available " + WD[wd] };
  const [a, b] = WIN[c]!;
  const sMin = localMin(start), eMin = sMin + minutesBetween(start, end);
  if (sMin >= a && eMin <= b) return { state: "available", detail: AVAIL_LABEL[c] + " on " + WD[wd] };
  return { state: "unavailable", detail: AVAIL_LABEL[c] + " only on " + WD[wd] };
}
/** Minutes booked or worked in the Monday-to-Sunday week containing the instant. */
export function weekMinutes(s: OpsState, workerId: string, anyIso: string, exceptShift?: string): number {
  const from = weekStartKey(anyIso), to = addDays(from, 6);
  let t = 0;
  for (const a of asgsOfWorker(s, workerId)) {
    if (a.status !== "confirmed" || a.shiftId === exceptShift) continue;
    const sh = shift(s, a.shiftId);
    const d = dayKey(sh.start);
    if (d < from || d > to) continue;
    const l = line(s, a.id);
    t += l && l.inAt && l.outAt ? l.workedMin : netMinutes(s, sh);
  }
  return t;
}
export function isStamp2Holiday(day: string): boolean {
  const m = Number(day.slice(5, 7)), d = Number(day.slice(8, 10));
  return (m >= 6 && m <= 9) || (m === 12 && d >= 15) || (m === 1 && d <= 15);
}
export function weekLimit(s: OpsState, w: Worker, day: string = dayKey(s.clock)): { min: number; strict: boolean; label: string } {
  if (w.rtw === "Stamp 2") {
    const hol = isStamp2Holiday(day);
    return { min: hol ? s.rules.stamp2HolidayMin : s.rules.stamp2WeekMin, strict: true, label: "Stamp 2 " + (hol ? "holiday" : "term-time") + " limit" };
  }
  return { min: s.rules.weekWarnMin, strict: false, label: "weekly hours warning" };
}

/* ── eligibility ────────────────────────────────────────────────────────── */
export type Level = "ok" | "warn" | "soft" | "hard";
export interface Reason { code: string; label: string; level: Level }
export interface Elig { status: "eligible" | "warning" | "soft" | "hard"; reasons: Reason[]; avail: "available" | "unavailable" | "unknown"; weekMin: number; weekAfter: number; limit: number }
export const requiredQuals = (s: OpsState, ev: Event, role: string): DocType[] => [...new Set([...(s.rules.roleQuals[role] || []), ...ev.quals])];
function docReason(s: OpsState, w: Worker, t: DocType, at: string, prefix: string): Reason {
  const v = docState(s, w.id, t, at);
  const name = DOC_LABEL[t];
  if (v.state === "valid" || v.state === "not_required") return { code: "doc", label: prefix + name + " valid", level: "ok" };
  if (v.state === "expiring") return { code: "doc", label: name + " expires " + fmtDayY(v.doc!.expires!, dayKey(s.clock)), level: "warn" };
  const validNow = v.state === "expired" && v.doc!.expires! >= dayKey(s.clock);
  // A document that is valid today but runs out before a shift far ahead is a renewal warning, not a block (yet).
  if (validNow && ms(at) - ms(s.clock) > s.rules.expiryWarnDays * 864e5)
    return { code: "doc", label: name + " expires " + fmtDayY(v.doc!.expires!, dayKey(s.clock)) + ", before this shift: renewal needed", level: "warn" };
  const what = v.state === "pending" ? "awaiting verification" : v.state === "missing" ? "not on file" : v.state === "rejected" ? "rejected" :
    validNow ? "expires before this shift" : "expired " + fmtDayY(v.doc!.expires!, dayKey(s.clock));
  return { code: "doc:" + t, label: prefix + name + " " + what, level: "hard" };
}
export function eligibility(s: OpsState, workerId: string, shiftId: string, role: string): Elig {
  const w = worker(s, workerId), sh = shift(s, shiftId), ev = event(s, sh.eventId);
  const reasons: Reason[] = [];
  if (!w.roles.includes(role)) reasons.push({ code: "role", label: "Not registered as " + role.toLowerCase(), level: "hard" });
  if (w.status === "pending_verification") reasons.push({ code: "status", label: "Registered, not yet verified by the office", level: "hard" });
  for (const t of mandatoryTypes(w)) reasons.push(docReason(s, w, t, sh.end, ""));
  for (const t of requiredQuals(s, ev, role)) reasons.push(docReason(s, w, t, sh.end, "Requires "));
  const v = shiftVenue(s, sh);
  for (const a of asgsOfWorker(s, w.id)) {
    if (a.status !== "confirmed") continue;
    if (a.shiftId === shiftId) { reasons.push({ code: "dup", label: "Already confirmed on this shift", level: "hard" }); continue; }
    const o = shift(s, a.shiftId);
    if (ms(o.start) < ms(sh.end) && ms(o.end) > ms(sh.start)) {
      reasons.push({ code: "overlap", label: "Booked at " + event(s, o.eventId).name.split(":")[0] + " " + fmtTime(o.start) + "-" + fmtTime(o.end), level: "hard" });
      continue;
    }
    const ov = shiftVenue(s, o);
    const buf = ov.id === v.id ? 0 : s.rules.travelBufferMin * 60000;
    if (buf && ms(o.start) < ms(sh.end) + buf && ms(o.end) + buf > ms(sh.start))
      reasons.push({ code: "buffer", label: "Less than " + s.rules.travelBufferMin + " min from " + ov.name + " (" + fmtTime(o.start) + "-" + fmtTime(o.end) + ")", level: "soft" });
  }
  const av = availabilityAt(s, w.id, sh.start, sh.end);
  reasons.push({ code: "avail", label: av.detail, level: av.state === "available" ? "ok" : av.state === "unknown" ? "warn" : "soft" });
  const weekMin = weekMinutes(s, w.id, sh.start, sh.id);
  const add = netMinutes(s, sh);
  const lim = weekLimit(s, w, dayKey(sh.start));
  if (weekMin + add > lim.min)
    reasons.push({ code: "hours", label: "Would reach " + fmtHM(weekMin + add) + " this week (" + lim.label + " " + fmtHM(lim.min) + ")", level: lim.strict ? "soft" : "warn" });
  const has = (l: Level) => reasons.some((r) => r.level === l);
  return { status: has("hard") ? "hard" : has("soft") ? "soft" : has("warn") ? "warning" : "eligible", reasons, avail: av.state, weekMin, weekAfter: weekMin + add, limit: lim.min };
}
export const blockers = (e: Elig, level: Level) => e.reasons.filter((r) => r.level === level);

export interface Cand { w: Worker; e: Elig; offered: boolean; standby?: number; local: boolean; upcoming: number; score: number }
export interface CandFilter { q?: string; available?: boolean; validDocs?: boolean; county?: string; noAssignments?: boolean; maxWeekH?: number; showBlocked?: boolean }
const RANK = { eligible: 0, warning: 0, soft: 1, hard: 2 };
export function candidates(s: OpsState, shiftId: string, role: string, f: CandFilter = {}): Cand[] {
  const sh = shift(s, shiftId);
  const v = shiftVenue(s, sh);
  const conf = new Set(confirmedOf(s, shiftId).map((a) => a.workerId));
  const offered = new Set(openOffersOf(s, shiftId).map((o) => o.workerId));
  const sb = new Map(standbyOf(s, shiftId).filter((b) => b.role === role).map((b) => [b.workerId, b.order]));
  const q = (f.q || "").trim().toLowerCase();
  const out: Cand[] = [];
  for (const w of s.workers) {
    if (!w.roles.includes(role) || conf.has(w.id)) continue;
    if (q && !(w.name.toLowerCase().includes(q) || w.area.toLowerCase().includes(q))) continue;
    if (f.county && w.county !== f.county) continue;
    const e = eligibility(s, w.id, shiftId, role);
    if (f.available && e.avail !== "available") continue;
    if (f.validDocs && e.reasons.some((r) => r.code.startsWith("doc:"))) continue;
    if (f.maxWeekH && e.weekAfter > f.maxWeekH * 60) continue;
    const upcoming = asgsOfWorker(s, w.id).filter((a) => a.status === "confirmed" && ms(shift(s, a.shiftId).start) > ms(s.clock)).length;
    if (f.noAssignments && upcoming) continue;
    if (!f.showBlocked && e.status === "hard") continue;
    const local = w.county === v.county;
    const score = (e.avail === "available" ? 40 : e.avail === "unknown" ? 12 : 0) + (local ? 20 : 0) + (sb.has(w.id) ? 30 : 0)
      - Math.min(10, upcoming) * 2 - e.weekMin / 120 + (hashScore(w.id + shiftId) % 7);
    out.push({ w, e, offered: offered.has(w.id), standby: sb.get(w.id), local, upcoming, score });
  }
  return out.sort((a, b) => RANK[a.e.status] - RANK[b.e.status] || Number(a.offered) - Number(b.offered) || b.score - a.score || a.w.id.localeCompare(b.w.id));
}
function hashScore(k: string) { let h = 0; for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0; return h; }
/** Eligible workers with availability confirmed and no open offer for this shift. */
export const eligibleAvailable = (s: OpsState, shiftId: string, role: string) =>
  candidates(s, shiftId, role).filter((c) => (c.e.status === "eligible" || c.e.status === "warning") && c.e.avail === "available" && !c.offered);

/** Best replacement for an assignment: willing standby first, then the best eligible available worker. */
export function replacementFor(s: OpsState, asgId: string, exclude?: Set<string>): { workerId: string; from: "standby" | "eligible"; standbyId?: string } | null {
  const a = asg(s, asgId);
  for (const b of standbyOf(s, a.shiftId).filter((x) => x.role === a.role && !exclude?.has(x.workerId))) {
    const e = eligibility(s, b.workerId, a.shiftId, a.role);
    if (e.status === "eligible" || e.status === "warning") return { workerId: b.workerId, from: "standby", standbyId: b.id };
  }
  const c = eligibleAvailable(s, a.shiftId, a.role).find((x) => !exclude?.has(x.w.id));
  return c ? { workerId: c.w.id, from: "eligible" } : null;
}
/** Distinct replacement suggestions for several assignments on the same shift. */
export function replacementsFor(s: OpsState, asgIds: string[]) {
  const used = new Set<string>();
  const out = new Map<string, ReturnType<typeof replacementFor>>();
  for (const id of asgIds) { const r = replacementFor(s, id, used); if (r) used.add(r.workerId); out.set(id, r); }
  return out;
}

/* ── timesheets ─────────────────────────────────────────────────────────── */
export type LineStatus = "in_progress" | "missing" | "review" | "supervisor" | "office" | "approved" | "exported";
export const LINE_LABEL: Record<LineStatus, string> = {
  in_progress: "In progress", missing: "Missing clock", review: "Needs review", supervisor: "Awaiting supervisor",
  office: "Awaiting office", approved: "Approved for payroll", exported: "Exported to Sage"
};
export interface Line {
  id: string; a: Assignment; w: Worker; sh: Shift; ev: Event; day: string;
  schedMin: number; inAt?: string; outAt?: string; actualMin: number; breakMin: number; workedMin: number;
  topupMin: number; payableMin: number; rate: number; pay: number; ot: string[];
  status: LineStatus; version: number; sup?: Approval; office?: Approval; exportId?: string; corrected: boolean; openEx: Exception[];
}
const BLOCKING: Exception["type"][] = ["missing_out", "outside", "offline", "no_show"];
export function line(s: OpsState, asgId: string): Line | null {
  const a = asg(s, asgId);
  if (a.status !== "confirmed") return null;
  const sh = shift(s, a.shiftId);
  const cl = clocksOf(s, a.id);
  if (ms(s.clock) < ms(sh.start) && !cl.length) return null;
  const ev = event(s, sh.eventId);
  const inAt = okClock(s, a.id, "in")?.at, outAt = okClock(s, a.id, "out")?.at;
  const complete = !!inAt && !!outAt;
  const actualMin = complete ? Math.max(0, minutesBetween(inAt!, outAt!)) : 0;
  const breakMin = complete && actualMin > s.rules.breakAfterMin ? s.rules.breakMin : 0;
  const workedMin = Math.max(0, actualMin - breakMin);
  const topupMin = complete && s.rules.minimumOn ? Math.max(0, s.rules.minimumMin - workedMin) : 0;
  const payableMin = workedMin + topupMin;
  const rate = s.rules.rates[a.role] ?? 14.5;
  const ot: string[] = [];
  if (complete && s.rules.otPastFinish && minutesBetween(sh.end, outAt!) > 15) ot.push(fmtHM(minutesBetween(sh.end, outAt!)) + " past scheduled finish");
  if (complete && s.rules.otDailyMin > 0 && workedMin > s.rules.otDailyMin) ot.push("Over " + fmtHM(s.rules.otDailyMin) + " in a day");
  const corrections = cl.filter((c) => c.method === "correction").length;
  const apps = approvalsOf(s, a.id);
  const reopens = apps.filter((x) => x.reopened).length;
  const version = 1 + corrections + reopens;
  const sup = apps.filter((x) => x.stage === "supervisor" && x.version === version && !x.reopened).pop();
  const office = apps.filter((x) => x.stage === "office" && x.version === version && !x.reopened).pop();
  const exp = s.exports.find((x) => x.asgIds.includes(a.id + ":" + version));
  const openEx = exceptionsOf(s, a.id).filter((e) => e.status === "open");
  let status: LineStatus;
  // Until the missed clock-out check after the finish, an incomplete line is just a shift in progress.
  if (!complete) status = ms(s.clock) < ms(sh.end) + s.rules.missedOutMin * 60000 ? "in_progress" : "missing";
  else if (exp) status = "exported";
  else if (office) status = "approved";
  else if (openEx.some((e) => BLOCKING.includes(e.type))) status = "review";
  else if (sup) status = "office";
  else status = "supervisor";
  return {
    id: "TS-" + a.id, a, w: worker(s, a.workerId), sh, ev, day: dayKey(sh.start), schedMin: minutesBetween(sh.start, sh.end),
    inAt, outAt, actualMin, breakMin, workedMin, topupMin, payableMin, rate, pay: Math.round((payableMin / 60) * rate * 100) / 100,
    ot, status, version, sup, office, exportId: exp?.id, corrected: corrections > 0, openEx
  };
}
export interface LineFilter { eventId?: string; shiftId?: string; workerId?: string; from?: string; to?: string; supervisorId?: string; status?: LineStatus[] }
export function lines(s: OpsState, f: LineFilter = {}): Line[] {
  const shifts = f.shiftId ? [shift(s, f.shiftId)] : f.eventId ? shiftsOf(s, f.eventId) : s.shifts;
  const out: Line[] = [];
  for (const sh of shifts) {
    const d = dayKey(sh.start);
    if (f.from && d < f.from) continue;
    if (f.to && d > f.to) continue;
    if (ms(sh.start) > ms(s.clock)) continue;
    if (f.supervisorId && shiftSupervisor(s, sh) !== f.supervisorId) continue;
    for (const a of asgsOfShift(s, sh.id)) {
      if (f.workerId && a.workerId !== f.workerId) continue;
      const l = line(s, a.id);
      if (l && (!f.status || f.status.includes(l.status))) out.push(l);
    }
  }
  return out.sort((a, b) => a.sh.start.localeCompare(b.sh.start) || a.ev.name.localeCompare(b.ev.name) || a.w.name.localeCompare(b.w.name));
}
export function lineTotals(ls: Line[]) {
  const sum = (k: "schedMin" | "actualMin" | "breakMin" | "workedMin" | "topupMin" | "payableMin" | "pay") => ls.reduce((t, l) => t + l[k], 0);
  return { count: ls.length, sched: sum("schedMin"), actual: sum("actualMin"), breaks: sum("breakMin"), worked: sum("workedMin"), topup: sum("topupMin"), payable: sum("payableMin"), pay: Math.round(sum("pay") * 100) / 100, ot: ls.filter((l) => l.ot.length).length };
}

/* ── messages ───────────────────────────────────────────────────────────── */
export const isForWorker = (m: Message, workerId: string) => m.to.includes(workerId) || (m.from.kind === "worker" && m.from.id === workerId);
export function workerMessages(s: OpsState, workerId: string): Message[] {
  return s.messages.filter((m) => isForWorker(m, workerId)).sort((a, b) => a.at.localeCompare(b.at));
}
export const unreadForOffice = (s: OpsState) => s.messages.filter((m) => m.to.includes("office") && !m.read.office);
export const unreadForWorker = (s: OpsState, workerId: string) => s.messages.filter((m) => m.to.includes(workerId) && !m.read[workerId]);
export function threadSummary(s: OpsState, t: Thread) {
  const msgs = messagesOf(s, t.id).slice().sort((a, b) => a.at.localeCompare(b.at));
  const last = msgs[msgs.length - 1];
  return { t, last, count: msgs.length, unread: msgs.filter((m) => m.to.includes("office") && !m.read.office).length };
}
/** Reply tally for a message that asked for structured replies. */
export function tally(s: OpsState, m: Message) {
  const replies = s.messages.filter((x) => x.kind === "reply" && x.ref?.type === "assignment" && x.at >= m.at && x.threadId === m.threadId && x.code);
  const byWorker = new Map<string, string>();
  for (const r of replies) byWorker.set(r.from.id, r.code!);
  const counts: Record<string, number> = {};
  for (const w of m.to) { const c = byWorker.get(w); const k = c ? CODE_LABEL[c as keyof typeof CODE_LABEL] : "No reply yet"; counts[k] = (counts[k] || 0) + 1; }
  return counts;
}

/* ── today and alerts ───────────────────────────────────────────────────── */
export function todayStats(s: OpsState) {
  const day = dayKey(s.clock);
  const evs = eventsOnDay(s, day);
  const shs = evs.flatMap((e) => shiftsOnDay(s, e.id, day));
  const c = sumCov(shs.map((x) => coverage(s, x.id)));
  let noReply = 0;
  for (const sh of shs) for (const a of confirmedOf(s, sh.id)) if (a.flaggedAt || owedReply(s, a)) noReply++;
  const exceptions = s.exceptions.filter((e) => e.status === "open").length;
  return { day, events: evs, shifts: shs, ...c, noReply, exceptions, compliance: urgentCompliance(s).length };
}
/** Rostered workers in the next seven days whose documents block a shift, plus uploads awaiting verification. */
export function urgentCompliance(s: OpsState) {
  const until = ms(s.clock) + 7 * 864e5;
  const out: { workerId: string; shiftId?: string; reason: string }[] = [];
  const seen = new Set<string>();
  for (const a of s.assignments) {
    if (a.status !== "confirmed") continue;
    const sh = shift(s, a.shiftId);
    if (ms(sh.start) < ms(s.clock) || ms(sh.start) > until) continue;
    const e = eligibility(s, a.workerId, a.shiftId, a.role);
    const docs = e.reasons.filter((r) => r.level === "hard" && r.code.startsWith("doc"));
    if (docs.length && !seen.has(a.workerId)) { seen.add(a.workerId); out.push({ workerId: a.workerId, shiftId: sh.id, reason: docs[0].label }); }
  }
  for (const d of s.docs) if (d.status === "pending" && !seen.has(d.workerId)) { seen.add(d.workerId); out.push({ workerId: d.workerId, reason: DOC_LABEL[d.type] + " awaiting verification" }); }
  return out;
}

export interface Alert {
  id: string; tone: "bad" | "warn" | "info"; area: "staffing" | "attendance" | "compliance" | "hours" | "messages";
  title: string; detail: string; to: string; action: string; eventId?: string;
}
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
export const words = (n: number) => (n >= 0 && n < WORDS.length ? WORDS[n] : String(n));
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
export function alerts(s: OpsState): Alert[] {
  const out: Alert[] = [];
  const now = ms(s.clock);
  const week = now + 7 * 864e5;
  // Attendance today: non-responders, lost and late workers.
  for (const e of eventsOnDay(s, dayKey(s.clock))) {
    const shs = shiftsOnDay(s, e.id, dayKey(s.clock)).filter((x) => ms(x.end) > now);
    const flagged = shs.flatMap((x) => confirmedOf(s, x.id).filter((a) => a.flaggedAt));
    if (flagged.length) out.push({ id: "flag-" + e.id, tone: "bad", area: "attendance", eventId: e.id, to: "/events/" + e.id + "?tab=roster",
      title: e.name.split(":")[0] + ": " + words(flagged.length) + (flagged.length === 1 ? " worker has" : " workers have") + " not replied",
      detail: "Starts " + fmtTime(shs[0].start) + ". Potentially unavailable; replacements recommended.", action: "Review replacements" });
    for (const sh of shs) for (const a of confirmedOf(s, sh.id)) {
      const v = asgView(s, a.id);
      if (v.state === "lost") out.push({ id: "lost-" + a.id, tone: "bad", area: "attendance", eventId: e.id, to: "/comms?worker=" + a.workerId,
        title: v.w.name + " cannot find the location", detail: shiftVenue(s, sh).name + ". Meeting point: " + shiftVenue(s, sh).meeting + ".", action: "Message " + firstName(v.w.name) });
    }
    const late = shs.flatMap((x) => confirmedOf(s, x.id).map((a) => asgView(s, a.id)).filter((v) => v.state === "late"));
    if (late.length) out.push({ id: "late-" + e.id, tone: "info", area: "attendance", eventId: e.id, to: "/events/" + e.id + "?tab=attendance",
      title: e.name.split(":")[0] + ": " + words(late.length) + " running late", detail: late.map((v) => firstName(v.w.name) + (v.eta ? " ETA " + fmtTime(v.eta) : "")).join(", "), action: "View attendance" });
  }
  // Shortfalls in the next seven days, per event.
  for (const e of s.events) {
    if (e.status !== "confirmed") continue;
    const shs = shiftsOf(s, e.id).filter((x) => ms(x.end) > now && ms(x.start) < week);
    if (!shs.length) continue;
    let short = 0;
    let first: Shift | undefined;
    const avail = new Set<string>();
    for (const sh of shs) for (const n of sh.needs) {
      const c = coverage(s, sh.id, n.role);
      if (!c.outstanding) continue;
      short += c.outstanding;
      if (!first || sh.start < first.start) first = sh;
      for (const x of eligibleAvailable(s, sh.id, n.role)) avail.add(x.w.id);
    }
    if (!short) continue;
    const startsIn = (ms(first!.start) - now) / 3600e3;
    out.push({ id: "short-" + e.id, tone: startsIn < 24 ? "bad" : "warn", area: "staffing", eventId: e.id, to: "/events/" + e.id + "?tab=roster&fill=1",
      title: e.name.split(":")[0] + " requires " + words(short) + " additional worker" + (short === 1 ? "" : "s") + ". " + cap(words(avail.size)) + " eligible worker" + (avail.size === 1 ? " is" : "s are") + " currently available.",
      detail: first!.label + ", " + fmtDay(dayKey(first!.start)) + " " + fmtTime(first!.start) + ". " + eventCov(s, e.id, shs).offered + " offer" + (eventCov(s, e.id, shs).offered === 1 ? "" : "s") + " awaiting reply.", action: "Review workers" });
  }
  // Compliance.
  const uc = urgentCompliance(s);
  const rostered = uc.filter((x) => x.shiftId);
  if (rostered.length) out.push({ id: "comp-rostered", tone: "bad", area: "compliance", to: "/compliance?tab=attention",
    title: cap(words(rostered.length)) + " rostered worker" + (rostered.length === 1 ? " has" : "s have") + " a document problem before their shift",
    detail: rostered.slice(0, 2).map((x) => worker(s, x.workerId).name + ": " + x.reason).join("; "), action: "Open compliance" });
  const pend = s.docs.filter((d) => d.status === "pending").length;
  if (pend) out.push({ id: "comp-pending", tone: "warn", area: "compliance", to: "/compliance?tab=pending", title: cap(words(pend)) + " document upload" + (pend === 1 ? "" : "s") + " awaiting verification", detail: "Workers stay blocked until a document is verified.", action: "Verify documents" });
  // Hours.
  const ls = lines(s, { from: addDays(dayKey(s.clock), -14) });
  const missing = ls.filter((l) => l.status === "missing" || l.status === "review").length;
  if (missing) out.push({ id: "hours-missing", tone: "warn", area: "hours", to: "/timesheets?status=attention", title: cap(words(missing)) + " timesheet" + (missing === 1 ? " needs" : "s need") + " a correction", detail: "Missing or rejected clock records.", action: "Fix timesheets" });
  const office = ls.filter((l) => l.status === "office").length;
  if (office) out.push({ id: "hours-office", tone: "info", area: "hours", to: "/timesheets?status=office", title: office + " timesheet" + (office === 1 ? "" : "s") + " ready for office approval", detail: "Approved by the supervisor.", action: "Review timesheets" });
  const unread = unreadForOffice(s).length;
  if (unread) out.push({ id: "msgs", tone: "info", area: "messages", to: "/comms", title: cap(words(unread)) + " unread message" + (unread === 1 ? "" : "s") + " from crew", detail: "Replies and questions.", action: "Open messages" });
  const order = { bad: 0, warn: 1, info: 2 };
  return out.sort((a, b) => order[a.tone] - order[b.tone]);
}

/** Demo jump points in the next 48 hours: reminder checks and shift starts and ends. */
export function milestones(s: OpsState): { at: string; label: string }[] {
  const now = ms(s.clock), until = now + 48 * 3600e3;
  const out = new Map<string, string>();
  const put = (iso: string, label: string) => { const t = ms(iso); if (t > now && t <= until && !out.has(iso)) out.set(iso, label); };
  for (const sh of s.shifts) {
    const st = ms(sh.start);
    if (st < now - 864e5 || st > until + 864e5) continue;
    const ev = event(s, sh.eventId);
    if (ev.status !== "confirmed" || !confirmedOf(s, sh.id).length) continue;
    const name = ev.name.split(":")[0];
    put(addMin(sh.start, -s.rules.reconfirmH * 60), "24 h reconfirmation, " + name);
    put(addMin(sh.start, -s.rules.travelH * 60), "2 h travel check, " + name);
    put(addMin(sh.start, -s.rules.noReplyMin), "45 min no-reply check, " + name);
    put(sh.start, name + " " + sh.label.toLowerCase() + " starts");
    put(sh.end, name + " " + sh.label.toLowerCase() + " ends");
  }
  return [...out.entries()].map(([at, label]) => ({ at, label })).sort((a, b) => a.at.localeCompare(b.at)).slice(0, 10);
}

/* Re-exported for screens. */
export { zoned };
export type { Standby, Thread, Message };
