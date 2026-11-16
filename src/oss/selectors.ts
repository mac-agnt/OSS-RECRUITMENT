/* Derived numbers. Every total in the product comes from here, so the Home rail,
   dashboards, drawers, agents and the phone views can never disagree. */

import type { Assignment, AttendanceException, ClockEntry, DocType, EventBooking, EventKind, HandoverItem, Invitation, OssState, Region, Shift, Worker, WorkerDocument } from "./model";
import { WINDOW, docLabel } from "./seed";
import { addDays, dayKey, fmtDayMonth, fmtTime, minutesBetween, ms, weekday, zoned } from "./time";

/* ── lookups (memoised per state object) ─────────────────────────────────── */
const idx = new WeakMap<object, { n: number; m: Map<string, any> }>();
const grp = new WeakMap<object, Map<string, { n: number; m: Map<string, unknown[]> }>>();
/** Rows grouped by a field, cached per array like `index`. Hot paths at company scale (thousands of rows) use this instead of filter. */
function groups<T>(list: T[], field: string, key: (x: T) => string): Map<string, T[]> {
  let byField = grp.get(list);
  if (!byField) { byField = new Map(); grp.set(list, byField); }
  let c = byField.get(field);
  if (!c || c.n !== list.length) {
    const m = new Map<string, unknown[]>();
    for (const x of list) { const k = key(x); const a = m.get(k); if (a) a.push(x); else m.set(k, [x]); }
    c = { n: list.length, m }; byField.set(field, c);
  }
  return c.m as Map<string, T[]>;
}
const NONE: never[] = [];
export const rowsBy = <T>(list: T[], field: string, key: (x: T) => string, value: string): T[] => groups(list, field, key).get(value) || (NONE as T[]);
const asgByShift = (s: OssState, id: string) => rowsBy(s.assignments, "shift", (a) => a.shiftId, id);
export const asgByWorker = (s: OssState, id: string) => rowsBy(s.assignments, "worker", (a) => a.workerId, id);
const invByShift = (s: OssState, id: string) => rowsBy(s.invitations, "shift", (i) => i.shiftId, id);
const perAsg = <T extends { assignmentId: string }>(list: T[], id: string) => rowsBy(list, "asg", (x) => x.assignmentId, id);
function index<T extends { id: string }>(list: T[]): Map<string, T> {
  let c = idx.get(list);
  // Engine drafts push into arrays in place, so a length change invalidates the index.
  if (!c || c.n !== list.length) { c = { n: list.length, m: new Map(list.map((x) => [x.id, x])) }; idx.set(list, c); }
  return c.m as Map<string, T>;
}
export const worker = (s: OssState, id: string) => index(s.workers).get(id) as Worker;
export const shiftOf = (s: OssState, id: string) => index(s.shifts).get(id) as Shift;
export const eventOf = (s: OssState, id: string) => index(s.events).get(id) as EventBooking;
export const userOf = (s: OssState, id: string) => index(s.users).get(id);
export const venueOf = (s: OssState, id: string | null) => (id ? index(s.venues).get(id) : undefined);
export const clientOf = (s: OssState, id: string) => index(s.clients).get(id)!;
export const asgOf = (s: OssState, id: string) => index(s.assignments).get(id) as Assignment;
export const invOf = (s: OssState, id: string) => index(s.invitations).get(id) as Invitation;
export const shiftsOfEvent = (s: OssState, eventId: string) => s.shifts.filter((x) => x.eventId === eventId);
export const persona = (s: OssState) => userOf(s, s.ui.personaId)!;
export const can = (s: OssState, perm: string) => (persona(s).perms as string[]).includes(perm);
export const nameOf = (s: OssState, id: string) => (id.startsWith("W") ? worker(s, id)?.name : userOf(s, id)?.name) || id;

/* ── invitations and coverage ────────────────────────────────────────────── */
export const isActiveInvite = (s: OssState, i: Invitation) => i.status === "sent" && ms(i.expiresAt) > ms(s.clock);
export function inviteLabel(s: OssState, i: Invitation): "Awaiting reply" | "Accepted" | "Declined" | "Expired" | "Withdrawn" {
  if (i.status === "sent") return ms(i.expiresAt) > ms(s.clock) ? "Awaiting reply" : "Expired";
  return i.status === "accepted" ? "Accepted" : i.status === "declined" ? "Declined" : "Withdrawn";
}

export interface Coverage { required: number; confirmed: number; awaiting: number; allocated: number; unfilled: number; notInvited: number; standby: number; activeInvites: number }
const zero = (): Coverage => ({ required: 0, confirmed: 0, awaiting: 0, allocated: 0, unfilled: 0, notInvited: 0, standby: 0, activeInvites: 0 });

export function shiftCoverage(s: OssState, shiftId: string): Coverage {
  const sh = shiftOf(s, shiftId);
  const confirmed = asgByShift(s, shiftId).filter((a) => a.status === "confirmed").length;
  const active = invByShift(s, shiftId).filter((i) => isActiveInvite(s, i)).length;
  const awaiting = Math.min(active, Math.max(0, sh.required - confirmed));
  const allocated = confirmed + awaiting;
  return {
    required: sh.required, confirmed, awaiting, allocated, activeInvites: active,
    unfilled: Math.max(0, sh.required - confirmed), notInvited: Math.max(0, sh.required - allocated),
    standby: s.standby.filter((b) => b.shiftId === shiftId).length
  };
}
export function sumCov(list: Coverage[]): Coverage {
  return list.reduce((t, c) => {
    (Object.keys(t) as (keyof Coverage)[]).forEach((k) => (t[k] += c[k]));
    return t;
  }, zero());
}
export const eventCoverage = (s: OssState, eventId: string) => sumCov(shiftsOfEvent(s, eventId).map((x) => shiftCoverage(s, x.id)));
export const pct = (c: Coverage) => (c.required ? Math.round((c.confirmed / c.required) * 1000) / 10 : 0);
export const pctLabel = (c: Coverage) => pct(c).toFixed(1) + "%";

export function windowEvents(s: OssState, opts: { pending?: boolean; from?: string; to?: string; desk?: string } = {}): EventBooking[] {
  const from = opts.from || WINDOW.from, to = opts.to || WINDOW.to;
  return s.events
    .filter((e) => !e.historical && e.date >= from && e.date <= to && (!opts.desk || (e.desk || "Dublin events desk") === opts.desk))
    .filter((e) => (opts.pending ? e.status === "pending" : e.status === "confirmed"))
    .sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
}
export function windowTotals(s: OssState, opts: { pending?: boolean; from?: string; to?: string; desk?: string } = {}) {
  const events = windowEvents(s, opts);
  const cov = sumCov(events.map((e) => eventCoverage(s, e.id)));
  return { events, ...cov, coverage: pct(cov), coverageLabel: pctLabel(cov) };
}
export function pendingDemand(s: OssState) {
  const events = s.events.filter((e) => e.status === "pending");
  return { events, positions: events.reduce((n, e) => n + (e.indicativePositions || 0), 0) };
}
export function windowLabel(s: OssState): string {
  const range = fmtDayMonth(zoned(WINDOW.from, "12:00")).replace(/ .*/, "") + "-" + fmtDayMonth(zoned(WINDOW.to, "12:00"));
  return (dayKey(s.clock) === WINDOW.from ? "Next seven days · " : "Demo reporting window · ") + range;
}
export function eventPhase(s: OssState, e: EventBooking): "upcoming" | "live" | "completed" {
  const shifts = shiftsOfEvent(s, e.id);
  if (!shifts.length) return "upcoming";
  const start = Math.min(...shifts.map((x) => ms(x.start))), end = Math.max(...shifts.map((x) => ms(x.end)));
  const now = ms(s.clock);
  return now < start ? "upcoming" : now > end ? "completed" : "live";
}

/* ── availability, documents, conflicts, eligibility ─────────────────────── */
const toMin = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };
const localMin = (iso: string) => toMin(fmtTime(iso));

export type Avail = "available" | "unavailable" | "unknown";
export function availability(s: OssState, workerId: string, start: string, end: string): { state: Avail; detail: string } {
  const exs = rowsBy(s.availExceptions, "worker", (x) => x.workerId, workerId);
  const block = exs.find((x) => (x.kind === "unavailable" || x.kind === "holiday") && ms(x.start) < ms(end) && ms(x.end) > ms(start));
  if (block) return { state: "unavailable", detail: (block.kind === "holiday" ? "Holiday: " : "Unavailable: ") + (block.note || fmtDayMonth(block.start)) };
  const cover = exs.find((x) => x.kind === "available" && ms(x.start) <= ms(start) && ms(x.end) >= ms(end));
  if (cover) return { state: "available", detail: "Available " + fmtTime(cover.start) + " to " + fmtTime(cover.end) };
  const wd = weekday(start);
  const sMin = localMin(start);
  let eMin = localMin(end);
  if (dayKey(end) !== dayKey(start)) eMin = 24 * 60;
  const rule = rowsBy(s.availRules, "worker", (r) => r.workerId, workerId).find((r) => r.weekday === wd && toMin(r.start) <= sMin && (toMin(r.end) >= eMin || (r.end === "23:59" && eMin >= 23 * 60 + 59)));
  if (rule) return { state: "available", detail: "Recurring " + ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][wd] + " " + rule.start + " to " + rule.end };
  return { state: "unknown", detail: "No availability recorded for this time" };
}
export const hasSubmittedAvailability = (s: OssState, workerId: string) =>
  rowsBy(s.availRules, "worker", (r) => r.workerId, workerId).length > 0 || rowsBy(s.availExceptions, "worker", (x) => x.workerId, workerId).some((x) => !/^Confirmed availability/.test(x.note || ""));

export type DocState = "valid" | "expiring" | "expired" | "pending" | "missing" | "rejected";
export const docEnd = (d: WorkerDocument) => zoned(addDays(d.expires, 1), "00:00");
export function docState(s: OssState, workerId: string, type: DocType, at: string): { state: DocState; doc?: WorkerDocument; label: string } {
  const docs = rowsBy(s.documents, "worker", (d) => d.workerId, workerId).filter((d) => d.type === type).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const approved = docs.filter((d) => d.review === "approved").sort((a, b) => b.expires.localeCompare(a.expires))[0];
  const pending = docs.find((d) => d.review === "pending");
  if (approved && ms(docEnd(approved)) >= ms(at)) {
    const warnBy = zoned(addDays(dayKey(at), s.rules.renewalWarnDays), "00:00");
    const expiring = ms(docEnd(approved)) <= ms(warnBy);
    return { state: expiring ? "expiring" : "valid", doc: approved, label: docLabel(type) + (expiring ? " expires " + fmtDayMonth(zoned(approved.expires, "12:00")) : " valid") };
  }
  if (pending) return { state: "pending", doc: pending, label: docLabel(type) + " uploaded, awaiting review" };
  if (approved) return { state: "expired", doc: approved, label: docLabel(type) + " valid through " + fmtDayMonth(zoned(approved.expires, "12:00")) + " only" };
  if (docs.find((d) => d.review === "rejected")) return { state: "rejected", doc: docs[0], label: docLabel(type) + " rejected at review" };
  return { state: "missing", label: docLabel(type) + " not on file" };
}
export function docStatusToday(s: OssState, d: WorkerDocument): DocState {
  if (d.review === "pending") return "pending";
  if (d.review === "rejected") return "rejected";
  if (ms(docEnd(d)) < ms(s.clock)) return "expired";
  const warnBy = zoned(addDays(dayKey(s.clock), s.rules.renewalWarnDays), "00:00");
  return ms(docEnd(d)) <= ms(warnBy) ? "expiring" : "valid";
}

export function conflicts(s: OssState, workerId: string, sh: Shift): { shift: Shift; reason: string }[] {
  const out: { shift: Shift; reason: string }[] = [];
  const myVenue = eventOf(s, sh.eventId).venueId;
  for (const a of asgByWorker(s, workerId)) {
    if (a.status !== "confirmed" || a.shiftId === sh.id) continue;
    const other = shiftOf(s, a.shiftId);
    const sameVenue = eventOf(s, other.eventId).venueId === myVenue;
    const buf = sameVenue ? 0 : s.rules.travelBufferMin;
    if (ms(other.start) < ms(sh.end) + buf * 60000 && ms(other.end) + buf * 60000 > ms(sh.start)) {
      const overlap = ms(other.start) < ms(sh.end) && ms(other.end) > ms(sh.start);
      out.push({ shift: other, reason: overlap ? "Overlaps " + eventOf(s, other.eventId).name + " " + fmtTime(other.start) + " to " + fmtTime(other.end)
        : "Inside the " + buf + "-minute travel buffer from " + eventOf(s, other.eventId).name });
    }
  }
  return out;
}

export interface Reason { code: string; label: string; level: "ok" | "warn" | "block" | "unknown" }
export interface Eligibility { status: "eligible" | "warning" | "unknown" | "blocked"; reasons: Reason[]; avail: Avail }
export function eligibility(s: OssState, workerId: string, shiftId: string): Eligibility {
  const w = worker(s, workerId), sh = shiftOf(s, shiftId);
  const reasons: Reason[] = [];
  const roleOk = w.roles.some((r) => sh.roles.includes(r));
  reasons.push(roleOk ? { code: "role", label: "Role: " + w.roles.filter((r) => sh.roles.includes(r))[0], level: "ok" } : { code: "role", label: "Role not suited to " + sh.label.toLowerCase(), level: "block" });
  const av = availability(s, workerId, sh.start, sh.end);
  reasons.push({ code: "avail", label: av.detail, level: av.state === "available" ? "ok" : av.state === "unknown" ? "unknown" : "block" });
  for (const t of sh.requiredDocs) {
    const d = docState(s, workerId, t, sh.end);
    reasons.push({ code: "doc", label: d.label, level: d.state === "valid" ? "ok" : d.state === "expiring" ? "warn" : "block" });
  }
  for (const c of conflicts(s, workerId, sh)) reasons.push({ code: "conflict", label: c.reason, level: "block" });
  if (w.status === "pending_compliance") reasons.push({ code: "status", label: "New profile, compliance pending", level: "block" });
  const status = reasons.some((r) => r.level === "block") ? "blocked" : reasons.some((r) => r.level === "unknown") ? "unknown" : reasons.some((r) => r.level === "warn") ? "warning" : "eligible";
  return { status, reasons, avail: av.state };
}

export interface Candidate { worker: Worker; elig: Eligibility; score: number; venueHistory: boolean; upcoming: number; standby?: number }
export function candidates(s: OssState, shiftId: string): { eligible: Candidate[]; unknown: Candidate[]; blocked: Candidate[] } {
  const sh = shiftOf(s, shiftId);
  const venue = venueOf(s, eventOf(s, sh.eventId).venueId);
  const taken = new Set(
    asgByShift(s, shiftId).filter((a) => a.status === "confirmed").map((a) => a.workerId)
      .concat(invByShift(s, shiftId).filter((i) => isActiveInvite(s, i)).map((i) => i.workerId))
  );
  const out = { eligible: [] as Candidate[], unknown: [] as Candidate[], blocked: [] as Candidate[] };
  for (const w of s.workers) {
    if (taken.has(w.id)) continue;
    if (!w.roles.some((r) => sh.roles.includes(r))) continue;
    const elig = eligibility(s, w.id, shiftId);
    const venueHistory = !!venue && w.priorVenues.includes(venue.name);
    const upcoming = asgByWorker(s, w.id).filter((a) => a.status === "confirmed" && ms(shiftOf(s, a.shiftId).start) > ms(s.clock)).length;
    const sb = s.standby.find((b) => b.shiftId === shiftId && b.workerId === w.id);
    // Standby workers are the fallback: they rank below fresh candidates here and are
    // used in order from the Replacements queue instead.
    const sbElsewhere = s.standby.some((b) => b.workerId === w.id && b.shiftId !== shiftId && shiftOf(s, b.shiftId).eventId === sh.eventId);
    const day = dayKey(sh.start);
    const sameDay = asgByWorker(s, w.id).some((a) => a.status === "confirmed" && dayKey(shiftOf(s, a.shiftId).start) === day)
      || rowsBy(s.invitations, "worker", (i) => i.workerId, w.id).some((i) => isActiveInvite(s, i) && dayKey(shiftOf(s, i.shiftId).start) === day);
    const score = (venueHistory ? 30 : 0) - upcoming * 5 + Math.min(20, w.priorShifts / 2) - (sb ? 20 : 0) - (sbElsewhere ? 25 : 0) - (sameDay ? 12 : 0);
    const c: Candidate = { worker: w, elig, score, venueHistory, upcoming, standby: sb?.order };
    if (elig.status === "eligible" || elig.status === "warning") out.eligible.push(c);
    else if (elig.status === "unknown") out.unknown.push(c);
    else out.blocked.push(c);
  }
  const sort = (a: Candidate, b: Candidate) => b.score - a.score || a.worker.id.localeCompare(b.worker.id);
  out.eligible.sort(sort); out.unknown.sort(sort); out.blocked.sort(sort);
  return out;
}

/* ── attendance ──────────────────────────────────────────────────────────── */
export const clocksOf = (s: OssState, asgId: string) => perAsg(s.clocks, asgId).slice().sort((a, b) => a.at.localeCompare(b.at));
export const verifiedIn = (s: OssState, asgId: string): ClockEntry | undefined => clocksOf(s, asgId).find((c) => c.kind === "in" && c.result === "verified");
export const verifiedOut = (s: OssState, asgId: string): ClockEntry | undefined => clocksOf(s, asgId).filter((c) => c.kind === "out" && c.result === "verified").pop();
export const journeyOf = (s: OssState, asgId: string) => perAsg(s.journeys, asgId).slice().sort((a, b) => a.at.localeCompare(b.at)).pop();
export const openExceptions = (s: OssState, asgId?: string): AttendanceException[] => (asgId ? perAsg(s.exceptions, asgId) : s.exceptions).filter((e) => e.status === "open");

export function arrivalState(s: OssState, asgId: string): "Not reported" | "On the way" | "Running late" | "On site" | "Issue reported" {
  const j = journeyOf(s, asgId);
  if (!j) return "Not reported";
  return ({ on_the_way: "On the way", running_late: "Running late", on_site: "On site", issue: "Issue reported" } as const)[j.status];
}
export function attendanceState(s: OssState, asgId: string): "Not clocked in" | "Clocked in" | "Clocked out" | "Review required" | "Awaiting sync" {
  const cl = clocksOf(s, asgId);
  if (cl.some((c) => c.result === "awaiting_sync")) return "Awaiting sync";
  const vin = verifiedIn(s, asgId), vout = verifiedOut(s, asgId);
  if (vout) return "Clocked out";
  if (vin) return "Clocked in";
  if (cl.some((c) => c.result === "review")) return "Review required";
  return "Not clocked in";
}

/* ── timesheets ──────────────────────────────────────────────────────────── */
export type LineStatus = "in_progress" | "incomplete" | "needs_review" | "ready" | "approved" | "exported";
export interface Line {
  id: string; asg: Assignment; worker: Worker; shift: Shift; event: EventBooking; workDate: string;
  scheduledMin: number; rawIn?: string; rawOut?: string; approvedStart?: string; approvedEnd?: string;
  breakMin: number; workedMin: number; topupMin: number; payableMin: number; extraMin: number;
  complete: boolean; status: LineStatus; version: number; pendingCorrection: boolean; correctionNote: string | null;
  approval?: { by: string; at: string }; item?: HandoverItem; mapped: boolean;
}
export function lineFor(s: OssState, asg: Assignment): Line | null {
  if (asg.status !== "confirmed") return null;
  const sh = shiftOf(s, asg.shiftId);
  const cl = clocksOf(s, asg.id);
  if (ms(s.clock) < ms(sh.start) && !cl.length) return null;
  const ev = eventOf(s, sh.eventId);
  const vin = verifiedIn(s, asg.id), vout = verifiedOut(s, asg.id);
  const corr = perAsg(s.corrections, asg.id);
  const appIn = corr.filter((c) => c.field === "in" && c.status === "approved").pop();
  const appOut = corr.filter((c) => c.field === "out" && c.status === "approved").pop();
  const approvedStart = appIn?.proposed || vin?.at;
  const approvedEnd = appOut?.proposed || vout?.at;
  const complete = !!approvedStart && !!approvedEnd;
  const breakMin = complete ? s.rules.breakMin : 0;
  const workedMin = complete ? Math.max(0, minutesBetween(approvedStart!, approvedEnd!) - breakMin) : 0;
  const topupMin = complete && s.rules.minimumOn ? Math.max(0, s.rules.minimumMin - workedMin) : 0;
  const apps = perAsg(s.approvals, asg.id);
  const reopens = apps.filter((a) => a.status === "reopened").length;
  const version = 1 + corr.filter((c) => c.status === "approved").length + reopens;
  const approval = apps.find((a) => a.version === version && a.status === "approved");
  const item = perAsg(s.items, asg.id).filter((i) => i.version === version).pop();
  const pendingCorrection = corr.some((c) => c.status === "proposed");
  let status: LineStatus;
  if (!complete) status = ms(s.clock) < ms(sh.end) + s.rules.missedClockMin * 60000 && !!vin ? "in_progress" : "incomplete";
  else if (item?.state === "accepted") status = "exported";
  else if (approval) status = "approved";
  else if (pendingCorrection || openExceptions(s, asg.id).length) status = "needs_review";
  else status = "ready";
  const m = rowsBy(s.mappings, "local", (x) => x.localId, asg.workerId).find((x) => x.entityType === "worker");
  return {
    id: "TS-" + asg.id, asg, worker: worker(s, asg.workerId), shift: sh, event: ev, workDate: dayKey(sh.start),
    scheduledMin: minutesBetween(sh.start, sh.end), rawIn: vin?.at, rawOut: vout?.at, approvedStart, approvedEnd,
    breakMin, workedMin, topupMin, payableMin: workedMin + topupMin,
    extraMin: complete ? Math.max(0, minutesBetween(sh.end, approvedEnd!)) : 0,
    complete, status, version, pendingCorrection,
    correctionNote: appOut ? "Clock-out corrected to " + fmtTime(appOut.proposed) + " (" + appOut.reason + ")" : appIn ? "Clock-in corrected to " + fmtTime(appIn.proposed) : null,
    approval: approval ? { by: approval.approvedBy, at: approval.approvedAt } : undefined, item, mapped: m?.status === "mapped"
  };
}
export function lines(s: OssState, f: { eventId?: string; shiftId?: string; workerId?: string; clientId?: string; weekOf?: string } = {}): Line[] {
  const out: Line[] = [];
  for (const a of s.assignments) {
    if (f.shiftId && a.shiftId !== f.shiftId) continue;
    if (f.workerId && a.workerId !== f.workerId) continue;
    const sh = shiftOf(s, a.shiftId);
    if (f.eventId && sh.eventId !== f.eventId) continue;
    if (f.clientId && eventOf(s, sh.eventId).clientId !== f.clientId) continue;
    if (f.weekOf) { const d = dayKey(sh.start); if (d < f.weekOf || d > addDays(f.weekOf, 6)) continue; }
    const l = lineFor(s, a);
    if (l) out.push(l);
  }
  return out.sort((a, b) => (a.shift.start + a.shift.id + a.worker.id).localeCompare(b.shift.start + b.shift.id + b.worker.id));
}
export function totals(ls: Line[]) {
  const done = ls.filter((l) => l.complete);
  const sum = (k: "scheduledMin" | "workedMin" | "topupMin" | "payableMin" | "extraMin" | "breakMin") => done.reduce((n, l) => n + l[k], 0);
  return {
    count: ls.length, complete: done.length, incomplete: ls.length - done.length,
    scheduled: ls.reduce((n, l) => n + l.scheduledMin, 0), worked: sum("workedMin"), topup: sum("topupMin"), payable: sum("payableMin"), extra: sum("extraMin"), breaks: sum("breakMin")
  };
}

/* ── handover ────────────────────────────────────────────────────────────── */
export function batchSummary(s: OssState, batchId: string) {
  const items = rowsBy(s.items, "batch", (i) => i.batchId, batchId);
  const by = (st: HandoverItem["state"]) => items.filter((i) => i.state === st);
  const mins = (l: HandoverItem[]) => l.reduce((n, i) => n + i.snapshot.payableMin, 0);
  return { items, accepted: by("accepted").length, blocked: by("blocked").length, queued: by("queued").length, failed: by("failed").length,
    acceptedMin: mins(by("accepted")), blockedMin: mins(by("blocked")), totalMin: mins(items) };
}

/* ── queues ──────────────────────────────────────────────────────────────── */
export function replacementQueue(s: OssState) {
  return s.assignments.filter((a) => a.status === "cancelled").map((a) => {
    const sh = shiftOf(s, a.shiftId);
    const replacement = s.assignments.find((x) => x.replacementFor === a.id && x.status === "confirmed");
    const pendingInv = s.invitations.filter((i) => i.replacesAssignmentId === a.id && isActiveInvite(s, i));
    return { asg: a, shift: sh, event: eventOf(s, sh.eventId), worker: worker(s, a.workerId), replacement, pendingInv, open: !replacement && ms(sh.end) > ms(s.clock) };
  });
}
export function expiringDocs(s: OssState, days = 30) {
  const by = zoned(addDays(dayKey(s.clock), days), "00:00");
  return s.documents.filter((d) => d.review === "approved" && ms(docEnd(d)) >= ms(s.clock) && ms(docEnd(d)) <= ms(by)).sort((a, b) => a.expires.localeCompare(b.expires));
}
export const notSubmitted = (s: OssState) => s.workers.filter((w) => !hasSubmittedAvailability(s, w.id));

export function personaTasks(s: OssState) { return s.tasks.filter((t) => t.ownerId === s.ui.personaId && t.status !== "done"); }

/** Positions vs people. */
export function uniqueWorkers(s: OssState, eventIds: string[]) {
  const shiftIds = new Set(s.shifts.filter((x) => eventIds.includes(x.eventId)).map((x) => x.id));
  return new Set(s.assignments.filter((a) => shiftIds.has(a.shiftId) && a.status === "confirmed").map((a) => a.workerId)).size;
}

export function heroStory(s: OssState) {
  const c = eventCoverage(s, "EVT-001");
  return { cov: c, setup: shiftCoverage(s, "SH-001A"), evening: shiftCoverage(s, "SH-001B") };
}

/* ── kinds, regions, days ────────────────────────────────────────────────── */
export const KINDS: EventKind[] = ["Concert", "Sport", "Corporate", "Conference", "Festival", "Exhibition"];
export const REGIONS: Region[] = ["Dublin", "Leinster", "Munster", "Connacht", "Ulster"];
const SECTOR_KIND: [RegExp, EventKind][] = [[/music|concert|promot/i, "Concert"], [/sport|stadium/i, "Sport"], [/conference|production/i, "Conference"], [/festival/i, "Festival"], [/exhibit/i, "Exhibition"]];
export function kindOf(s: OssState, e: EventBooking): EventKind {
  if (e.kind) return e.kind;
  const sector = s.clients.find((c) => c.id === e.clientId)?.sector || "";
  return SECTOR_KIND.find(([re]) => re.test(sector))?.[1] || "Corporate";
}
export const regionOf = (s: OssState, e: EventBooking): Region => venueOf(s, e.venueId)?.region || "Dublin";
export const deskOf = (e: EventBooking) => e.desk || "Dublin events desk";
/** Firm events with a shift touching the given Dublin calendar day (YYYY-MM-DD). */
export function eventsOnDay(s: OssState, day: string): EventBooking[] {
  return s.events.filter((e) => e.status === "confirmed" && !e.historical && shiftsOfEvent(s, e.id).some((x) => dayKey(x.start) === day || dayKey(x.end) === day))
    .sort((a, b) => ms(shiftsOfEvent(s, a.id)[0]?.start || a.date) - ms(shiftsOfEvent(s, b.id)[0]?.start || b.date));
}
