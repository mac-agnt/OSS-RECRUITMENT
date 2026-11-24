/* Clients, locations, events and shifts; offers, allocation, standby and replacements. */

import type { Assignment, DocType, Need, Offer, OpsState, Result, Shift } from "../model";
import {
  asg, asgsOfShift, blockers, client, confirmedOf, coverage, eligibility, event, isOpenOffer, need, okClock, offer, offersOfShift,
  offersOfWorker, shift, shiftsOf, standbyOf, venue, worker
} from "../selectors";
import { addMin, fmtDate, fmtTime, minutesBetween, ms, span, zoned } from "../time";
import { actorId, actorName, audit, denied, directThread, eventThread, nid, no, offerBody, ok, post, shiftWhen } from "./core";

/* ── clients and locations ──────────────────────────────────────────────── */
export interface ClientForm { name: string; contact: string; email: string; phone: string }
export function createClient(d: OpsState, f: ClientForm): Result {
  const x = denied(d, "allocate", "add a client"); if (x) return x;
  const name = f.name.trim();
  if (!name) return no("Enter the client's name.");
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) return no("That email address doesn't look right.");
  const dup = d.clients.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (dup) return no(dup.name + " is already a client.", { existing: dup.id });
  const id = "C" + String(d.clients.length + 1).padStart(2, "0") + "-" + d.seq;
  d.clients.push({ id, name, contact: f.contact.trim(), email: f.email.trim(), phone: f.phone.trim(), bullhornId: null, createdAt: d.clock });
  audit(d, "client.created", "Added client " + name, { type: "client", id });
  return ok("Client " + name + " added.", { id });
}
export function updateClient(d: OpsState, id: string, f: ClientForm): Result {
  const x = denied(d, "allocate", "edit a client"); if (x) return x;
  const c = client(d, id);
  if (!f.name.trim()) return no("Enter the client's name.");
  Object.assign(c, { name: f.name.trim(), contact: f.contact.trim(), email: f.email.trim(), phone: f.phone.trim() });
  audit(d, "client.updated", "Updated " + c.name + "'s details", { type: "client", id });
  return ok("Saved.");
}
const COUNTY_PIN: Record<string, [number, number]> = {
  Dublin: [53.3498, -6.2603], Cork: [51.8985, -8.4756], Limerick: [52.6638, -8.6267], Galway: [53.2707, -9.0568], Kildare: [53.1589, -6.9096],
  Laois: [53.0344, -7.3006], Wicklow: [52.9808, -6.0446], Meath: [53.6055, -6.6564], Louth: [53.9508, -6.5406], Kerry: [52.0599, -9.5044]
};
export function createVenue(d: OpsState, f: { name: string; address: string; county: string; meeting?: string }): Result {
  const x = denied(d, "allocate", "add a location"); if (x) return x;
  if (!f.name.trim() || !f.address.trim()) return no("Enter the location name and address.");
  const dup = d.venues.find((v) => v.name.toLowerCase() === f.name.trim().toLowerCase());
  if (dup) return no(dup.name + " already exists.", { existing: dup.id });
  const id = "V-" + d.seq + "-" + (d.venues.length + 1);
  const [lat, lng] = COUNTY_PIN[f.county] || COUNTY_PIN.Dublin;
  d.venues.push({ id, name: f.name.trim(), address: f.address.trim(), county: f.county || "Dublin", lat, lng, radiusM: d.rules.radiusM,
    meeting: f.meeting?.trim() || "Meeting point to be confirmed", qr: true });
  audit(d, "venue.created", "Added location " + f.name.trim() + " (map pin approximate, simulated)", { type: "venue", id });
  return ok("Location added.", { id });
}
export function setVenue(d: OpsState, id: string, patch: { radiusM?: number; meeting?: string }): Result {
  const x = denied(d, "allocate", "change a location"); if (x) return x;
  const v = venue(d, id);
  if (patch.radiusM !== undefined) {
    if (!(patch.radiusM >= 10 && patch.radiusM <= 1000)) return no("Radius must be between 10 m and 1,000 m.");
    audit(d, "venue.radius", v.name + " clock-in radius " + v.radiusM + " m to " + patch.radiusM + " m", { type: "venue", id });
    v.radiusM = Math.round(patch.radiusM);
  }
  if (patch.meeting !== undefined) { v.meeting = patch.meeting.trim(); audit(d, "venue.meeting", "Updated the meeting point for " + v.name, { type: "venue", id }); }
  return ok("Saved.");
}

/* ── events and shifts ──────────────────────────────────────────────────── */
export interface ShiftForm { id?: string; label: string; date: string; start: string; end: string; needs: Need[]; supervisorId?: string; venueId?: string }
export interface EventForm {
  id?: string; name: string; clientId: string; venueId: string; supervisorId: string;
  instructions: string; ppe: string[]; quals: DocType[]; shifts: ShiftForm[];
}
function shiftTimes(f: ShiftForm): { start: string; end: string } | string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return "Pick a date for \"" + (f.label || "shift") + "\".";
  if (!/^\d{2}:\d{2}$/.test(f.start) || !/^\d{2}:\d{2}$/.test(f.end)) return "Enter start and finish times for \"" + (f.label || "shift") + "\".";
  const start = zoned(f.date, f.start);
  let end = zoned(f.date, f.end);
  if (ms(end) <= ms(start)) end = addMin(end, 24 * 60);
  const len = minutesBetween(start, end);
  if (len < 60) return "\"" + f.label + "\" must be at least one hour.";
  if (len > 16 * 60) return "\"" + f.label + "\" is longer than 16 hours. Split it into two shifts.";
  return { start, end };
}
export function saveEvent(d: OpsState, f: EventForm): Result {
  const x = denied(d, "allocate", (f.id ? "edit" : "create") + " an event"); if (x) return x;
  if (!f.name.trim()) return no("Give the event a name.");
  if (!f.clientId) return no("Choose a client.");
  if (!f.venueId) return no("Choose a location.");
  if (!f.supervisorId) return no("Assign a supervisor.");
  if (!f.shifts.length) return no("Add at least one shift.");
  const times: { start: string; end: string }[] = [];
  for (const s of f.shifts) {
    if (!s.label.trim()) return no("Every shift needs a name, for example Set-up crew.");
    const needs = s.needs.filter((n) => n.role && n.count > 0);
    if (!needs.length) return no("\"" + s.label + "\" needs at least one role with a number of workers.");
    if (new Set(needs.map((n) => n.role)).size !== needs.length) return no("\"" + s.label + "\" lists the same role twice.");
    const t = shiftTimes(s);
    if (typeof t === "string") return no(t);
    if (!s.id && ms(t.end) <= ms(d.clock)) return no("\"" + s.label + "\" is already over. Check the date.");
    times.push(t);
  }
  const isNew = !f.id;
  const eventId = f.id || "E-" + d.seq + "-" + (d.events.length + 1);
  if (f.id) {
    const ev = event(d, f.id);
    // Removing a shift or reducing a role below the confirmed crew is refused.
    for (const old of shiftsOf(d, f.id)) {
      const kept = f.shifts.find((s) => s.id === old.id);
      const conf = confirmedOf(d, old.id);
      if (!kept && conf.length) return no("\"" + old.label + "\" has " + conf.length + " confirmed workers. Remove them before deleting the shift.");
      if (kept) for (const r of new Set(conf.map((a) => a.role))) {
        const n = kept.needs.find((z) => z.role === r)?.count || 0;
        const have = conf.filter((a) => a.role === r).length;
        if (n < have) return no("\"" + old.label + "\" has " + have + " confirmed " + r.toLowerCase() + (have === 1 ? "" : "s") + ". Remove workers before reducing it to " + n + ".");
      }
    }
    Object.assign(ev, { name: f.name.trim(), clientId: f.clientId, venueId: f.venueId, supervisorId: f.supervisorId, instructions: f.instructions.trim(), ppe: f.ppe, quals: f.quals });
    for (const old of shiftsOf(d, f.id)) if (!f.shifts.find((s) => s.id === old.id)) {
      d.shifts = d.shifts.filter((s) => s.id !== old.id);
      for (const o of offersOfShift(d, old.id)) if (o.status === "sent") { o.status = "withdrawn"; o.respondedAt = d.clock; }
      d.standby = d.standby.filter((b) => b.shiftId !== old.id);
    }
  } else {
    d.events.push({ id: eventId, name: f.name.trim(), clientId: f.clientId, venueId: f.venueId, supervisorId: f.supervisorId, status: "confirmed",
      instructions: f.instructions.trim(), ppe: f.ppe, quals: f.quals, createdAt: d.clock, createdBy: actorId(d) });
  }
  f.shifts.forEach((s, i) => {
    const t = times[i];
    const needs = s.needs.filter((n) => n.role && n.count > 0).map((n) => ({ role: n.role, count: Math.round(n.count) }));
    const existing = s.id ? d.shifts.find((z) => z.id === s.id) : undefined;
    if (existing) {
      const moved = existing.start !== t.start || existing.end !== t.end;
      Object.assign(existing, { label: s.label.trim(), needs, supervisorId: s.supervisorId || undefined, venueId: s.venueId || undefined });
      if (moved) {
        const before = span(existing.start, existing.end);
        existing.start = t.start; existing.end = t.end; existing.version += 1;
        const crew = confirmedOf(d, existing.id);
        for (const a of crew) a.reconfirmedAt = undefined;
        if (crew.length) post(d, { threadId: eventThread(d, eventId).id, kind: "reconfirm", to: crew.map((a) => a.workerId), asks: ["confirmed", "cant_make"],
          body: "Time change for " + existing.label.toLowerCase() + ": now " + fmtDate(t.start) + ", " + span(t.start, t.end) + " (was " + before + "). Please confirm you can still do it.",
          ref: { type: "shift", id: existing.id } });
        audit(d, "shift.moved", existing.label + " moved from " + before + " to " + span(t.start, t.end) + "; " + crew.length + " asked to reconfirm", { type: "shift", id: existing.id });
      }
    } else {
      d.shifts.push({ id: "S-" + d.seq + "-" + (d.shifts.length + 1), eventId, label: s.label.trim(), start: t.start, end: t.end, needs,
        supervisorId: s.supervisorId || undefined, venueId: s.venueId || undefined, version: 1 });
    }
  });
  const total = f.shifts.reduce((n, s) => n + s.needs.reduce((m, z) => m + (z.count || 0), 0), 0);
  audit(d, isNew ? "event.created" : "event.updated", (isNew ? "Created " : "Updated ") + f.name.trim() + ": " + f.shifts.length + " shift" + (f.shifts.length === 1 ? "" : "s") + ", " + total + " positions", { type: "event", id: eventId });
  return ok(isNew ? "Event created. Next, find crew for each shift." : "Event saved.", { id: eventId });
}
export function cancelEvent(d: OpsState, eventId: string, reason: string): Result {
  const x = denied(d, "allocate", "cancel an event"); if (x) return x;
  if (!reason.trim()) return no("Give a reason. The crew will see it.");
  const ev = event(d, eventId);
  let offers = 0, crew = new Set<string>();
  for (const sh of shiftsOf(d, eventId)) {
    for (const o of offersOfShift(d, sh.id)) if (o.status === "sent") { o.status = "withdrawn"; o.respondedAt = d.clock; offers++; }
    for (const a of asgsOfShift(d, sh.id)) if (a.status === "confirmed" && !okClock(d, a.id, "in")) { a.status = "removed"; a.endedAt = d.clock; a.endReason = "Event cancelled: " + reason.trim(); crew.add(a.workerId); }
  }
  ev.status = "cancelled"; ev.cancelReason = reason.trim();
  if (crew.size) post(d, { threadId: eventThread(d, eventId).id, kind: "message", to: [...crew], body: ev.name + " has been cancelled (" + reason.trim() + "). You are no longer booked. Sorry for the change." });
  audit(d, "event.cancelled", "Cancelled " + ev.name + ": " + crew.size + " crew released, " + offers + " offers withdrawn", { type: "event", id: eventId });
  return ok("Cancelled. " + crew.size + " crew told, " + offers + " offers withdrawn.");
}

/* ── offers ─────────────────────────────────────────────────────────────── */
function expiry(d: OpsState, sh: Shift) {
  const now = ms(d.clock);
  let t = Math.min(now + d.rules.offerExpiryH * 3600e3, ms(sh.start) - 30 * 60000);
  if (t < now + 15 * 60000) t = Math.min(now + 15 * 60000, ms(sh.start));
  return new Date(t).toISOString();
}
export function sendOffers(d: OpsState, shiftId: string, role: string, workerIds: string[], opts: { note?: string; replaces?: string } = {}): Result {
  const x = denied(d, "allocate", "send job offers"); if (x) return x;
  const sh = shift(d, shiftId);
  if (ms(sh.start) <= ms(d.clock)) return no("This shift has already started.");
  if (!sh.needs.some((n) => n.role === role)) return no("This shift doesn't need a " + role.toLowerCase() + ".");
  if (!workerIds.length) return no("Select at least one worker.");
  const sent: string[] = [], skipped: string[] = [];
  const batch = nid(d, "B");
  for (const w of [...new Set(workerIds)]) {
    const name = worker(d, w).name;
    if (confirmedOf(d, shiftId).some((a) => a.workerId === w)) { skipped.push(name + " is already confirmed"); continue; }
    if (offersOfShift(d, shiftId).some((o) => o.workerId === w && isOpenOffer(d, o))) { skipped.push(name + " already has an offer"); continue; }
    const e = eligibility(d, w, shiftId, role);
    const hard = blockers(e, "hard");
    if (hard.length) { skipped.push(name + ": " + hard[0].label); continue; }
    const soft = blockers(e, "soft").filter((r) => r.code !== "avail");
    if (soft.length) { skipped.push(name + ": " + soft[0].label + " (assign directly with a reason instead)"); continue; }
    d.offers.push({ id: nid(d, "O"), shiftId, workerId: w, role, status: "sent", sentAt: d.clock, sentBy: actorId(d), expiresAt: expiry(d, sh),
      kind: opts.replaces ? "replacement" : "standard", replaces: opts.replaces, batch, note: opts.note?.trim() || undefined });
    sent.push(w);
  }
  if (!sent.length) return no(skipped.length ? "No offers sent. " + skipped.slice(0, 3).join("; ") + (skipped.length > 3 ? "; and " + (skipped.length - 3) + " more" : "") : "Nobody to offer.", { skipped });
  const open = coverage(d, shiftId, role).outstanding;
  post(d, { threadId: eventThread(d, sh.eventId).id, kind: "offer", to: sent, body: offerBody(d, sh, role, opts.note), ref: { type: "shift", id: shiftId } });
  const fcfs = sent.length > open && !opts.replaces;
  audit(d, opts.replaces ? "offer.replacement" : "offer.sent",
    (opts.replaces ? "Replacement offer to " : "Sent " + sent.length + " job offer" + (sent.length === 1 ? "" : "s") + " for ") + (opts.replaces ? worker(d, sent[0]).name + " for " : "")
    + role.toLowerCase() + ", " + shiftWhen(d, sh) + (fcfs ? " (" + open + " open: first to accept are confirmed, the rest join standby)" : "") + (skipped.length ? "; skipped " + skipped.length : ""),
    { type: "shift", id: shiftId });
  return ok("Sent " + sent.length + " offer" + (sent.length === 1 ? "" : "s") + " by app and WhatsApp (simulated)." + (fcfs ? " " + open + " open: first to accept are confirmed, later acceptances go on standby." : "") + (skipped.length ? " Skipped " + skipped.length + "." : ""), { sent, skipped });
}
export function withdrawOffer(d: OpsState, offerId: string): Result {
  const x = denied(d, "allocate", "withdraw an offer"); if (x) return x;
  const o = offer(d, offerId);
  if (!isOpenOffer(d, o)) return no("Only an open offer can be withdrawn.");
  o.status = "withdrawn"; o.respondedAt = d.clock;
  const sh = shift(d, o.shiftId);
  post(d, { threadId: directThread(d, o.workerId).id, kind: "message", to: [o.workerId], body: "The offer for " + shiftWhen(d, sh) + " has been withdrawn. No action needed." });
  audit(d, "offer.withdrawn", "Withdrew " + worker(d, o.workerId).name + "'s offer for " + shiftWhen(d, sh), { type: "offer", id: o.id });
  return ok("Offer withdrawn.");
}

function newAssignment(d: OpsState, sh: Shift, workerId: string, role: string, source: Assignment["source"], extra: Partial<Assignment> = {}): Assignment {
  const a: Assignment = { id: nid(d, "A"), shiftId: sh.id, workerId, role, status: "confirmed", source, at: d.clock, by: actorId(d), ...extra };
  d.assignments.push(a);
  d.standby = d.standby.filter((b) => !(b.shiftId === sh.id && b.workerId === workerId));
  // Any other open offer that now overlaps is withdrawn, so the worker can't be double booked.
  for (const o of offersOfWorker(d, workerId)) {
    if (!isOpenOffer(d, o) || o.shiftId === sh.id) continue;
    const other = shift(d, o.shiftId);
    if (ms(other.start) < ms(sh.end) && ms(other.end) > ms(sh.start)) { o.status = "withdrawn"; o.respondedAt = d.clock; o.note = "Withdrawn: booked on an overlapping shift"; }
  }
  for (const o of offersOfShift(d, sh.id)) if (o.workerId === workerId && o.status === "sent") { o.status = "accepted"; o.respondedAt = d.clock; }
  return a;
}
/** Stand down an assignment that is being replaced (no reply, or a confirmed replacement). */
function standDown(d: OpsState, a: Assignment, reason: string, by: string) {
  a.status = "stood_down"; a.endedAt = d.clock; a.endReason = reason; a.replacedBy = by;
  for (const e of d.exceptions) if (e.asgId === a.id && e.status === "open") { e.status = "resolved"; e.resolvedAt = d.clock; e.note = "Replaced"; }
  post(d, { threadId: directThread(d, a.workerId).id, kind: "message", to: [a.workerId],
    body: "We didn't hear from you, so you've been stood down from " + shiftWhen(d, shift(d, a.shiftId)) + ". Call the office if this is wrong." });
}

export function respondOffer(d: OpsState, offerId: string, answer: "accept" | "decline", via: "app" | "whatsapp" | "office" = "app", note = ""): Result {
  const o = offer(d, offerId);
  const w = worker(d, o.workerId), sh = shift(d, o.shiftId);
  if (o.status === "accepted" && answer === "accept") return ok("Already accepted.");
  if (o.status !== "sent") return no("This offer is " + (o.status === "filled" ? "closed (you're on standby)" : o.status) + ".");
  if (!isOpenOffer(d, o)) return no("This offer expired at " + fmtTime(o.expiresAt) + ".");
  if (answer === "decline") {
    o.status = "declined"; o.respondedAt = d.clock;
    post(d, { threadId: eventThread(d, sh.eventId).id, kind: "reply", to: ["office"], from: { kind: "worker", id: w.id }, code: "declined", body: "Declined the offer" + (note ? ": " + note : "") + ".", ref: { type: "offer", id: o.id } });
    audit(d, "offer.declined", w.name + " declined " + o.role.toLowerCase() + ", " + shiftWhen(d, sh) + (via === "whatsapp" ? " (WhatsApp, simulated)" : ""), { type: "offer", id: o.id });
    return ok("Declined. Thanks for letting us know.");
  }
  const e = eligibility(d, w.id, sh.id, o.role);
  const stop = blockers(e, "hard").concat(blockers(e, "soft").filter((r) => r.code !== "avail"));
  if (stop.length) {
    audit(d, "offer.accept_refused", w.name + " tried to accept " + shiftWhen(d, sh) + ": " + stop[0].label, { type: "offer", id: o.id });
    return no("Can't confirm this shift: " + stop[0].label + ". The office has been told.");
  }
  const original = o.replaces ? asg(d, o.replaces) : undefined;
  const swap = original && original.status === "confirmed" && !okClock(d, original.id, "in");
  if (!swap && coverage(d, sh.id, o.role).outstanding === 0) {
    o.status = "filled"; o.respondedAt = d.clock;
    if (!d.standby.some((b) => b.shiftId === sh.id && b.workerId === w.id))
      d.standby.push({ id: nid(d, "SB"), shiftId: sh.id, workerId: w.id, role: o.role, order: standbyOf(d, sh.id).length + 1, at: d.clock, source: "accepted_full" });
    post(d, { threadId: directThread(d, w.id).id, kind: "message", to: [w.id], body: "Thanks. " + shiftWhen(d, sh) + " filled before you replied, so you're on the standby list. We'll message you if a place opens." });
    audit(d, "offer.standby", w.name + " accepted after the " + o.role.toLowerCase() + " places filled: added to standby, not booked", { type: "offer", id: o.id });
    return ok("This shift has just filled. You're on the standby list.", { standby: true });
  }
  const a = newAssignment(d, sh, w.id, o.role, o.kind === "replacement" ? "replacement" : "offer", { offerId: o.id, by: w.id, replaces: swap ? original!.id : undefined });
  o.status = "accepted"; o.respondedAt = d.clock;
  if (swap) standDown(d, original!, "Replaced by " + w.name + " after no reply", a.id);
  // Other open replacement offers for the same original are no longer needed.
  if (o.replaces) for (const z of d.offers) if (z.id !== o.id && z.replaces === o.replaces && z.status === "sent") { z.status = "withdrawn"; z.respondedAt = d.clock; z.note = "Filled by another worker"; }
  const c = coverage(d, sh.id, o.role);
  post(d, { threadId: eventThread(d, sh.eventId).id, kind: "reply", to: ["office"], from: { kind: "worker", id: w.id }, code: "confirmed", body: "Accepted the offer.", ref: { type: "assignment", id: a.id } });
  audit(d, "offer.accepted", w.name + " accepted " + o.role.toLowerCase() + ", " + shiftWhen(d, sh) + "; " + c.confirmed + "/" + c.required + " confirmed"
    + (swap ? "; " + worker(d, original!.workerId).name + " stood down" : "") + (via === "whatsapp" ? " (WhatsApp, simulated)" : ""), { type: "assignment", id: a.id });
  return ok("You're confirmed for " + shiftWhen(d, sh) + ".", { asgId: a.id });
}

/* ── direct allocation and removal ──────────────────────────────────────── */
export function assignManual(d: OpsState, shiftId: string, role: string, workerId: string, reason = ""): Result {
  const x = denied(d, "allocate", "assign workers"); if (x) return x;
  const sh = shift(d, shiftId), w = worker(d, workerId);
  if (ms(sh.end) <= ms(d.clock)) return no("This shift is over.");
  const e = eligibility(d, workerId, shiftId, role);
  const hard = blockers(e, "hard");
  if (hard.length) return no("Can't assign " + w.name + ": " + hard.map((r) => r.label).join("; ") + ". Compliance requirements can't be overridden.");
  const soft = blockers(e, "soft");
  if (soft.length && reason.trim().length < 5) return no("Overriding needs a reason: " + soft.map((r) => r.label).join("; ") + ".", { needsReason: soft.map((r) => r.label) });
  if (coverage(d, shiftId, role).outstanding === 0) return no("All " + need(sh, role) + " " + role.toLowerCase() + " places are filled. Remove someone or add a place first.");
  const a = newAssignment(d, sh, workerId, role, "manual", soft.length ? { override: { reason: reason.trim(), rules: soft.map((r) => r.label) } } : {});
  post(d, { threadId: directThread(d, workerId).id, kind: "message", to: [workerId], body: "You're booked as " + role.toLowerCase() + ": " + shiftWhen(d, sh) + ". Details are in My shifts." });
  audit(d, "assignment.manual", actorName(d) + " assigned " + w.name + " as " + role.toLowerCase() + ", " + shiftWhen(d, sh) + (soft.length ? "; override: " + soft.map((r) => r.label).join("; ") + ". Reason: " + reason.trim() : ""), { type: "assignment", id: a.id });
  return ok(w.name + " assigned" + (soft.length ? " with override recorded." : "."), { asgId: a.id });
}
export function removeAssignment(d: OpsState, asgId: string, reason: string): Result {
  const x = denied(d, "allocate", "remove a worker"); if (x) return x;
  const a = asg(d, asgId);
  if (a.status !== "confirmed") return no("Not on the roster.");
  if (okClock(d, a.id, "in")) return no("Already clocked in. Record a clock-out instead.");
  if (!reason.trim()) return no("Give a reason.");
  a.status = "removed"; a.endedAt = d.clock; a.endReason = reason.trim();
  const sh = shift(d, a.shiftId);
  post(d, { threadId: directThread(d, a.workerId).id, kind: "message", to: [a.workerId], body: "You've been taken off " + shiftWhen(d, sh) + ". " + reason.trim() });
  audit(d, "assignment.removed", "Removed " + worker(d, a.workerId).name + " from " + shiftWhen(d, sh) + ": " + reason.trim(), { type: "assignment", id: a.id });
  return ok("Removed. The place is open again.");
}
/** The worker cancels (or replies "Cannot make the shift"). */
export function cancelByWorker(d: OpsState, asgId: string, reason: string, via: "app" | "whatsapp" | "office" = "app"): Result {
  const a = asg(d, asgId);
  if (a.status !== "confirmed") return no("You're not booked on this shift.");
  if (okClock(d, a.id, "in")) return no("You're already clocked in. Talk to your supervisor.");
  const sh = shift(d, a.shiftId), w = worker(d, a.workerId);
  a.status = "cancelled"; a.endedAt = d.clock; a.endReason = reason.trim() || "No reason given";
  for (const o of d.offers) if (o.replaces === a.id && o.status === "sent") { o.status = "withdrawn"; o.respondedAt = d.clock; o.note = "Original cancelled; place is open"; }
  for (const e of d.exceptions) if (e.asgId === a.id && e.status === "open") { e.status = "resolved"; e.resolvedAt = d.clock; e.note = "Worker cancelled"; }
  post(d, { threadId: eventThread(d, sh.eventId).id, kind: "reply", to: ["office"], from: { kind: "worker", id: w.id }, code: "cant_make", body: "Cannot make the shift: " + a.endReason, ref: { type: "assignment", id: a.id } });
  const c = coverage(d, sh.id, a.role);
  audit(d, "assignment.cancelled", w.name + " cancelled " + shiftWhen(d, sh) + " (" + a.endReason + ")" + (via === "whatsapp" ? " by WhatsApp (simulated)" : "") + "; " + a.role.toLowerCase() + " " + c.confirmed + "/" + c.required, { type: "assignment", id: a.id });
  return ok("Cancelled. The office has been told.");
}

/* ── standby and replacements ───────────────────────────────────────────── */
export function addStandby(d: OpsState, shiftId: string, role: string, workerId: string): Result {
  const x = denied(d, "allocate", "change the standby list"); if (x) return x;
  if (d.standby.some((b) => b.shiftId === shiftId && b.workerId === workerId)) return no("Already on standby.");
  const e = eligibility(d, workerId, shiftId, role);
  const hard = blockers(e, "hard").filter((r) => r.code !== "dup");
  if (hard.length) return no("Can't add: " + hard[0].label + ".");
  d.standby.push({ id: nid(d, "SB"), shiftId, workerId, role, order: standbyOf(d, shiftId).length + 1, at: d.clock, source: "office" });
  audit(d, "standby.added", "Added " + worker(d, workerId).name + " to standby for " + shiftWhen(d, shift(d, shiftId)), { type: "shift", id: shiftId });
  return ok("Added to standby. Standby workers don't count as confirmed.");
}
export function removeStandby(d: OpsState, id: string): Result {
  const x = denied(d, "allocate", "change the standby list"); if (x) return x;
  const b = d.standby.find((z) => z.id === id); if (!b) return no("Not on standby.");
  d.standby = d.standby.filter((z) => z.id !== id);
  standbyOf(d, b.shiftId).forEach((z, i) => (z.order = i + 1));
  audit(d, "standby.removed", "Removed " + worker(d, b.workerId).name + " from standby", { type: "shift", id: b.shiftId });
  return ok("Removed from standby.");
}
export function moveStandby(d: OpsState, id: string, dir: -1 | 1): Result {
  const b = d.standby.find((z) => z.id === id); if (!b) return no("Not on standby.");
  const list = standbyOf(d, b.shiftId);
  const i = list.findIndex((z) => z.id === id), j = i + dir;
  if (j < 0 || j >= list.length) return no("Already at the " + (dir < 0 ? "top" : "bottom") + ".");
  const t = list[j].order; list[j].order = b.order; b.order = t;
  return ok("Order updated.");
}
/** Send a replacement offer for a confirmed worker (no reply) or a cancelled one. */
export function offerReplacement(d: OpsState, asgId: string, workerId: string): Result {
  const a = asg(d, asgId);
  return sendOffers(d, a.shiftId, a.role, [workerId], { replaces: asgId, note: "This is a replacement. Please reply quickly." });
}
/** Confirm a standby worker straight onto the roster, standing down the worker they replace if still booked. */
export function promoteStandby(d: OpsState, standbyId: string, replacesAsgId?: string): Result {
  const x = denied(d, "allocate", "confirm a replacement"); if (x) return x;
  const b = d.standby.find((z) => z.id === standbyId); if (!b) return no("That worker is no longer on standby.");
  const sh = shift(d, b.shiftId), w = worker(d, b.workerId);
  const e = eligibility(d, w.id, sh.id, b.role);
  const hard = blockers(e, "hard");
  if (hard.length) return no("Can't confirm " + w.name + ": " + hard[0].label + ".");
  const original = replacesAsgId ? asg(d, replacesAsgId) : undefined;
  const swap = original && original.status === "confirmed" && !okClock(d, original.id, "in");
  if (!swap && coverage(d, sh.id, b.role).outstanding === 0) return no("No open " + b.role.toLowerCase() + " place to fill.");
  const a = newAssignment(d, sh, w.id, b.role, "replacement", { replaces: swap ? original!.id : replacesAsgId });
  if (swap) standDown(d, original!, "Replaced by " + w.name + " from standby", a.id);
  if (replacesAsgId) for (const o of d.offers) if (o.replaces === replacesAsgId && o.status === "sent") { o.status = "withdrawn"; o.respondedAt = d.clock; o.note = "Filled from standby"; }
  post(d, { threadId: directThread(d, w.id).id, kind: "message", to: [w.id], body: "Good news: you've moved up from standby. You're confirmed for " + shiftWhen(d, sh) + "." });
  const c = coverage(d, sh.id, b.role);
  audit(d, "standby.promoted", actorName(d) + " confirmed " + w.name + " from standby" + (swap ? ", replacing " + worker(d, original!.workerId).name : "") + "; " + c.confirmed + "/" + c.required, { type: "assignment", id: a.id });
  return ok(w.name + " confirmed from standby.", { asgId: a.id });
}

export { offerBody };
