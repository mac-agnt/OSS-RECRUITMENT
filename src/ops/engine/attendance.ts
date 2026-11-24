/* Clock-in and clock-out (location, QR or supervisor), offline capture, exceptions
   and supervisor corrections. Location is only checked at the moment of clocking. */

import type { ClockEvent, ExType, OpsState, Result } from "../model";
import { asg, clocksOf, exceptionById, line, okClock, shift, shiftVenue, worker } from "../selectors";
import { addDays, addMin, dayKey, fmtTime, minutesBetween, ms, zoned } from "../time";
import { actorId, actorName, audit, denied, isWorker, nid, no, ok } from "./core";

export const qrToken = (shiftId: string, version: number) => "OSS-" + shiftId + "-v" + version;

export interface ClockOpts { method: "gps" | "qr" | "supervisor"; distanceM?: number; offline?: boolean; token?: string; at?: string; note?: string }

function openException(d: OpsState, asgId: string, type: ExType, detail: string, key: string) {
  if (d.exceptions.some((e) => e.key === key)) return;
  d.exceptions.push({ id: nid(d, "X"), asgId, type, status: "open", at: d.clock, detail, key });
}
export function resolveExceptions(d: OpsState, asgId: string, types: ExType[], note: string) {
  for (const e of d.exceptions) if (e.asgId === asgId && e.status === "open" && types.includes(e.type)) {
    e.status = "resolved"; e.resolvedAt = d.clock; e.resolvedBy = actorId(d); e.note = note;
  }
}

function capture(d: OpsState, asgId: string, kind: "in" | "out", o: ClockOpts): Result {
  const a = asg(d, asgId);
  if (a.status !== "confirmed") return no("Not booked on this shift.");
  const w = worker(d, a.workerId), sh = shift(d, a.shiftId), v = shiftVenue(d, sh);
  if (w.status !== "active") return no(w.name + " isn't verified yet, so can't clock in.");
  const by = actorId(d);
  if (!isWorker(by) && by !== "system" && o.method !== "supervisor") return no("Use supervisor attendance to record for someone else.");
  if (o.method === "supervisor") { const x = denied(d, "supervise", "record attendance"); if (x) return x; }
  const at = o.at || d.clock;
  const inC = okClock(d, asgId, "in");
  if (kind === "in") {
    if (inC) return ok("Already clocked in at " + fmtTime(inC.at) + ".");
    if (ms(at) < ms(sh.start) - d.rules.clockOpenMin * 60000) return no("Clock-in opens at " + fmtTime(addMin(sh.start, -d.rules.clockOpenMin)) + ".");
    if (ms(at) > ms(sh.end)) return no("This shift has ended. Ask your supervisor to record your hours.");
  } else {
    if (!inC && !clocksOf(d, asgId).some((c) => c.kind === "in" && c.result === "pending_sync")) return no("Clock in first.");
    if (okClock(d, asgId, "out")) return ok("Already clocked out.");
    if (o.method !== "supervisor" && ms(at) > ms(sh.end) + d.rules.missedOutMin * 60000)
      return no("Your shift finished at " + fmtTime(sh.end) + ". Ask your supervisor to record your finish time.");
  }
  const word = kind === "in" ? "Clock-in" : "Clock-out";
  const entry: ClockEvent = { id: nid(d, "K"), asgId, kind, at, method: o.method, distanceM: o.distanceM, result: "ok", reason: "", by, note: o.note?.trim() || undefined };
  if (o.method === "qr" && o.token !== qrToken(sh.id, sh.version)) {
    entry.result = "rejected"; entry.reason = "QR code is for a different shift or out of date";
    d.clocks.push(entry);
    audit(d, "clock.rejected", word + " for " + w.name + " rejected: " + entry.reason, { type: "assignment", id: asgId }, true);
    return no("That QR code isn't for this shift. Scan the code at today's check-in point.");
  }
  if (o.offline) {
    entry.result = "pending_sync"; entry.reason = "Captured with no signal; waiting to sync";
    d.clocks.push(entry);
    openException(d, asgId, "offline", word + " at " + fmtTime(at) + " captured offline", "offline:" + entry.id);
    audit(d, "clock.offline", word + " for " + w.name + " captured offline at " + fmtTime(at) + " (simulated no signal)", { type: "assignment", id: asgId }, true);
    return ok("No signal. Saved on this phone and will sync when you're back online.");
  }
  if (o.method === "gps") {
    const dist = o.distanceM ?? 20;
    if (dist > v.radiusM) {
      entry.result = "rejected"; entry.reason = dist + " m from " + v.name + "; limit " + v.radiusM + " m";
      d.clocks.push(entry);
      openException(d, asgId, "outside", word + " attempt " + dist + " m from " + v.name + " at " + fmtTime(at), "outside:" + entry.id);
      audit(d, "clock.rejected", word + " for " + w.name + " rejected: " + entry.reason + " (simulated location)", { type: "assignment", id: asgId }, true);
      return no("You're " + dist + " m from " + v.name + ". " + word + " works within " + v.radiusM + " m of the meeting point.");
    }
    entry.reason = dist + " m from " + v.name + " (simulated location)";
  } else if (o.method === "qr") {
    if (o.token !== qrToken(sh.id, sh.version)) {
      entry.result = "rejected"; entry.reason = "QR code is for a different shift or out of date";
      d.clocks.push(entry);
      audit(d, "clock.rejected", word + " for " + w.name + " rejected: " + entry.reason, { type: "assignment", id: asgId }, true);
      return no("That QR code isn't for this shift. Scan the code at today's check-in point.");
    }
    entry.reason = "Venue QR code scanned (simulated)";
  } else {
    entry.reason = "Recorded by " + actorName(d) + (o.note ? ": " + o.note.trim() : "");
  }
  d.clocks.push(entry);
  a.flaggedAt = undefined;
  if (kind === "in") resolveExceptions(d, asgId, ["outside", "late", "lost", "no_show", "no_response"], "Clocked in " + fmtTime(at));
  else resolveExceptions(d, asgId, ["missing_out", "outside"], "Clocked out " + fmtTime(at));
  const lateBy = kind === "in" ? minutesBetween(sh.start, at) : 0;
  const early = kind === "out" ? minutesBetween(at, sh.end) : 0;
  audit(d, "clock." + kind, word + " " + fmtTime(at) + " for " + w.name + (lateBy > 5 ? ", " + lateBy + " min late" : "") + (early > 15 ? ", " + early + " min before scheduled finish" : "") + "; " + entry.reason,
    { type: "assignment", id: asgId }, o.method !== "supervisor");
  return ok((kind === "in" ? "Clocked in at " : "Clocked out at ") + fmtTime(at) + ".");
}
export const clockIn = (d: OpsState, asgId: string, o: ClockOpts) => capture(d, asgId, "in", o);
export const clockOut = (d: OpsState, asgId: string, o: ClockOpts) => capture(d, asgId, "out", o);

export function syncOffline(d: OpsState, asgId: string): Result {
  const pending = clocksOf(d, asgId).filter((c) => c.result === "pending_sync");
  if (!pending.length) return ok("Nothing waiting to sync.");
  const a = asg(d, asgId), v = shiftVenue(d, shift(d, a.shiftId));
  let rejected = 0;
  for (const c of pending) {
    if (c.kind === "out" && !okClock(d, asgId, "in") && !pending.some((p) => p.kind === "in")) continue;
    c.syncedAt = d.clock; c.distanceM = c.distanceM ?? 25;
    if (c.method === "gps" && c.distanceM > v.radiusM) {
      // The location captured offline is checked against the radius once it syncs.
      c.result = "rejected"; rejected++;
      c.reason = "Synced " + fmtTime(d.clock) + "; captured " + c.distanceM + " m from " + v.name + ", outside the " + v.radiusM + " m radius";
      openException(d, asgId, "outside", "Offline " + c.kind + " at " + fmtTime(c.at) + " was " + c.distanceM + " m from " + v.name, "outside:" + c.id);
    } else {
      c.result = "ok";
      c.reason = "Synced " + fmtTime(d.clock) + "; " + (c.method === "qr" ? "venue QR code" : "location " + c.distanceM + " m from " + v.name) + " at capture (simulated)";
    }
  }
  resolveExceptions(d, asgId, ["offline"], "Synced " + fmtTime(d.clock));
  if (!rejected) resolveExceptions(d, asgId, ["no_show", "late"], "Synced " + fmtTime(d.clock));
  audit(d, "clock.synced", worker(d, a.workerId).name + "'s offline record synced" + (rejected ? "; outside the radius, not accepted" : "; original capture time kept"), { type: "assignment", id: asgId }, true);
  return rejected ? no("Synced, but you were outside the " + v.radiusM + " m radius when you clocked. Your supervisor has been told.") : ok("Synced. Your original time is kept.");
}

/** Supervisor records a clock time with a note (forgotten clock-out, phone issues). Original records are kept. */
export function correctClock(d: OpsState, asgId: string, kind: "in" | "out", hm: string, note: string): Result {
  const id = actorId(d);
  const x = denied(d, ["supervise", "approve_hours"], "correct attendance"); if (x) return x;
  if (!/^\d{2}:\d{2}$/.test(hm)) return no("Enter a time like 23:30.");
  if (note.trim().length < 5) return no("Add an audit note saying how you know the time.");
  const a = asg(d, asgId), sh = shift(d, a.shiftId), w = worker(d, a.workerId);
  if (line(d, asgId)?.status === "exported") return no("These hours were already exported to payroll. Changes after export are a payroll adjustment (to agree with OSS).");
  let at = zoned(dayKey(sh.start), hm);
  if (kind === "out" && ms(at) <= ms(sh.start)) at = zoned(addDays(dayKey(sh.start), 1), hm);
  if (ms(at) > ms(d.clock)) return no("That time is in the future.");
  if (kind === "out") { const inC = okClock(d, asgId, "in"); if (inC && ms(at) <= ms(inC.at)) return no("Clock-out must be after clock-in (" + fmtTime(inC.at) + ")."); }
  if (kind === "in") { const outC = okClock(d, asgId, "out"); if (outC && ms(at) >= ms(outC.at)) return no("Clock-in must be before clock-out (" + fmtTime(outC.at) + ")."); }
  const before = okClock(d, asgId, kind);
  d.clocks.push({ id: nid(d, "K"), asgId, kind, at, method: "correction", result: "ok", reason: "Corrected by " + actorName(d), by: id, note: note.trim() });
  resolveExceptions(d, asgId, kind === "out" ? ["missing_out", "outside", "offline"] : ["outside", "offline", "no_show", "late", "lost"], "Corrected to " + fmtTime(at) + " by " + actorName(d));
  audit(d, "clock.corrected", actorName(d) + " set " + w.name + "'s clock-" + kind + " to " + fmtTime(at) + (before ? " (was " + fmtTime(before.at) + ")" : " (was missing)") + ". Note: " + note.trim(), { type: "assignment", id: asgId });
  return ok("Saved with your note. The original record is kept.");
}

export function resolveException(d: OpsState, exId: string, note: string): Result {
  const x = denied(d, ["supervise", "approve_hours"], "resolve an exception"); if (x) return x;
  const e = exceptionById(d, exId);
  if (!e || e.status !== "open") return no("Already resolved.");
  if (note.trim().length < 3) return no("Add a short note.");
  if (e.type === "missing_out") return no("Record the clock-out time instead, so the hours are right.");
  e.status = "resolved"; e.resolvedAt = d.clock; e.resolvedBy = actorId(d); e.note = note.trim();
  audit(d, "exception.resolved", actorName(d) + " resolved " + e.type.replace("_", " ") + " for " + worker(d, asg(d, e.asgId).workerId).name + ": " + note.trim(), { type: "assignment", id: e.asgId });
  return ok("Resolved.");
}

/** Record that someone didn't turn up, so their line leaves the timesheets instead of needing invented times. */
export function markNoShow(d: OpsState, asgId: string, note: string): Result {
  const x = denied(d, ["supervise", "approve_hours"], "record a no-show"); if (x) return x;
  const a = asg(d, asgId), sh = shift(d, a.shiftId), w = worker(d, a.workerId);
  if (a.status !== "confirmed") return no("They're no longer on this shift.");
  if (ms(d.clock) < ms(sh.start)) return no("The shift hasn't started yet.");
  if (okClock(d, asgId, "in") || clocksOf(d, asgId).some((c) => c.result === "pending_sync")) return no(w.name + " has a clock-in. Set their times instead.");
  a.status = "cancelled"; a.endedAt = d.clock; a.endReason = "No-show" + (note.trim() ? ": " + note.trim() : "");
  resolveExceptions(d, asgId, ["no_show", "no_response", "late", "lost", "outside", "offline", "missing_out"], "Recorded as a no-show");
  audit(d, "attendance.no_show", actorName(d) + " recorded " + w.name + " as a no-show for " + sh.label.toLowerCase() + (note.trim() ? " (" + note.trim() + ")" : ""), { type: "assignment", id: asgId });
  return ok(w.name + " recorded as a no-show. No hours will be paid.");
}
