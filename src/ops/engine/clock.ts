/* Demo time. Moving the clock runs the automations (24 h reconfirmation, 2 h
   travel check, 45 min no-reply check, missed clock-out, document expiry) and,
   when enabled, simulated activity from crew who aren't being played on a phone.
   Everything is deterministic: the same moves give the same results. */

import type { Code, OpsState, Result, Rules } from "../model";
import { DOC_LABEL } from "../model";
import {
  asgsOfShift, confirmedOf, docState, event, isOpenOffer, okClock, clocksOf, replacementFor, replacementsFor, shift, shiftVenue, updatesOf, worker
} from "../selectors";
import { roll } from "../rand";
import { addDays, dayKey, fmtDay, fmtTime, ms, zoned } from "../time";
import { audit, directThread, eventThread, no, nid, ok, post } from "./core";
import { clockIn, clockOut, syncOffline } from "./attendance";
import { replyCode, TRAVEL_ASKS } from "./comms";
import { cancelByWorker, offerReplacement, promoteStandby, respondOffer } from "./staffing";

const H = 3600e3, M = 60000;
const iso = (t: number) => new Date(t).toISOString();

/** Run fn as another actor (system or a worker), then restore. */
function as<T>(d: OpsState, actor: string, fn: () => T): T {
  const prev = d.actor;
  d.actor = actor;
  try { return fn(); } finally { d.actor = prev; }
}
const once = (d: OpsState, key: string) => !d.autoRuns.some((r) => r.key === key);
const mark = (d: OpsState, key: string, kind: string, summary: string) => d.autoRuns.push({ id: nid(d, "R"), key, at: d.clock, kind, summary });

/* ── automations ────────────────────────────────────────────────────────── */
function autoReconfirm(d: OpsState, shiftId: string) {
  const sh = shift(d, shiftId);
  const key = "reconfirm:" + sh.id + ":v" + sh.version;
  if (!once(d, key)) return;
  const to = confirmedOf(d, sh.id).filter((a) => !a.reconfirmedAt).map((a) => a.workerId);
  mark(d, key, "reconfirm", to.length + " asked to reconfirm");
  if (!to.length) return;
  const ev = event(d, sh.eventId);
  as(d, "system", () => {
    post(d, { threadId: eventThread(d, ev.id).id, kind: "reconfirm", to, asks: ["confirmed", "cant_make"], ref: { type: "shift", id: sh.id },
      body: "Reminder: you're booked for " + ev.name.split(":")[0] + " tomorrow, " + fmtTime(sh.start) + " to " + fmtTime(sh.end) + ". Please confirm you're still available." });
    audit(d, "auto.reconfirm", "24 h reconfirmation sent to " + to.length + " crew, " + ev.name + " " + sh.label.toLowerCase(), { type: "shift", id: sh.id }, true);
  });
}
function autoTravel(d: OpsState, shiftId: string) {
  const sh = shift(d, shiftId);
  const key = "travel:" + sh.id + ":v" + sh.version;
  if (!once(d, key)) return;
  const to = confirmedOf(d, sh.id).filter((a) => !okClock(d, a.id, "in")).map((a) => a.workerId);
  mark(d, key, "travel", to.length + " asked for travel status");
  if (!to.length) return;
  const ev = event(d, sh.eventId), v = shiftVenue(d, sh);
  as(d, "system", () => {
    post(d, { threadId: eventThread(d, ev.id).id, kind: "travel", to, asks: TRAVEL_ASKS, ref: { type: "shift", id: sh.id },
      body: ev.name.split(":")[0] + " starts at " + fmtTime(sh.start) + ". Meeting point: " + v.meeting + ". Are you on your way?" });
    audit(d, "auto.travel", "2 h travel check sent to " + to.length + " crew, " + ev.name + " " + sh.label.toLowerCase(), { type: "shift", id: sh.id }, true);
  });
}
function autoNoReply(d: OpsState, shiftId: string) {
  const sh = shift(d, shiftId);
  const key = "noreply:" + sh.id + ":v" + sh.version;
  if (!once(d, key)) return;
  const prompt = d.autoRuns.find((r) => r.key === "travel:" + sh.id + ":v" + sh.version);
  if (!prompt) { mark(d, key, "noreply", "No travel check was sent"); return; }
  const flagged = confirmedOf(d, sh.id).filter((a) => !okClock(d, a.id, "in") && !updatesOf(d, a.id).some((u) => ms(u.at) >= ms(prompt.at) && u.code !== "confirmed"));
  mark(d, key, "noreply", flagged.length + " flagged");
  if (!flagged.length) return;
  const ev = event(d, sh.eventId);
  as(d, "system", () => {
    for (const a of flagged) {
      a.flaggedAt = d.clock;
      d.exceptions.push({ id: nid(d, "X"), asgId: a.id, type: "no_response", status: "open", at: d.clock, key: "noreply:" + a.id,
        detail: worker(d, a.workerId).name + " hasn't replied " + d.rules.noReplyMin + " min before start; potentially unavailable" });
    }
    const sug = replacementsFor(d, flagged.map((a) => a.id));
    const recs = flagged.map((a) => ({ a, r: sug.get(a.id) }));
    audit(d, "auto.no_reply", flagged.length + " not replying " + d.rules.noReplyMin + " min before " + ev.name + " " + sh.label.toLowerCase() + ": "
      + recs.map((x) => worker(d, x.a.workerId).name + (x.r ? " (suggest " + worker(d, x.r.workerId).name + (x.r.from === "standby" ? ", standby" : "") + ")" : " (no replacement available)")).join("; "),
      { type: "shift", id: sh.id }, true);
    if (d.rules.autoReassign) {
      const used = new Set<string>();
      for (const { a } of recs) {
        const r = replacementFor(d, a.id);
        if (!r || used.has(r.workerId)) continue;
        used.add(r.workerId);
        const res = r.from === "standby" && r.standbyId ? promoteStandby(d, r.standbyId, a.id) : offerReplacement(d, a.id, r.workerId);
        audit(d, "auto.reassign", "Automatic reassignment for " + worker(d, a.workerId).name + ": " + res.msg, { type: "assignment", id: a.id }, true);
      }
    }
  });
}
function autoMissedOut(d: OpsState, shiftId: string) {
  const sh = shift(d, shiftId);
  const key = "missedout:" + sh.id;
  if (!once(d, key)) return;
  const missing = confirmedOf(d, sh.id).filter((a) => okClock(d, a.id, "in") && !okClock(d, a.id, "out") && !clocksOf(d, a.id).some((c) => c.kind === "out" && c.result === "pending_sync"));
  mark(d, key, "missedout", missing.length + " missing clock-outs");
  if (!missing.length) return;
  as(d, "system", () => {
    for (const a of missing) {
      d.exceptions.push({ id: nid(d, "X"), asgId: a.id, type: "missing_out", status: "open", at: d.clock, key: "missedout:" + a.id,
        detail: "No clock-out " + d.rules.missedOutMin + " min after the " + fmtTime(sh.end) + " finish" });
      post(d, { threadId: directThread(d, a.workerId).id, kind: "reminder", to: [a.workerId], body: "You didn't clock out of " + event(d, sh.eventId).name.split(":")[0] + ". Your supervisor will confirm your finish time." });
    }
    audit(d, "auto.missed_out", missing.length + " missing clock-out" + (missing.length === 1 ? "" : "s") + " after " + event(d, sh.eventId).name + " " + sh.label.toLowerCase(), { type: "shift", id: sh.id }, true);
  });
}
function autoExpiry(d: OpsState, day: string) {
  const days = new Set(d.rules.expiryReminders);
  let n = 0;
  as(d, "system", () => {
    for (const doc of d.docs) {
      if (doc.status !== "verified" || !doc.expires) continue;
      const left = Math.round((Date.UTC(+doc.expires.slice(0, 4), +doc.expires.slice(5, 7) - 1, +doc.expires.slice(8, 10)) - Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10))) / 864e5);
      if (!days.has(left)) continue;
      if (docState(d, doc.workerId, doc.type).doc?.id !== doc.id) continue;
      const key = "expiry:" + doc.id + ":" + left;
      if (!once(d, key)) continue;
      mark(d, key, "expiry", worker(d, doc.workerId).name + " " + DOC_LABEL[doc.type]);
      post(d, { threadId: directThread(d, doc.workerId).id, kind: "reminder", to: [doc.workerId], body: "Your " + DOC_LABEL[doc.type].toLowerCase() + " expires on " + fmtDay(doc.expires) + ". Upload the renewed document in the app so you can keep getting shifts." });
      n++;
    }
    if (n) audit(d, "auto.expiry", "Expiry reminders sent to " + n + " worker" + (n === 1 ? "" : "s") + " (" + [...days].join(", ") + " days before)", undefined, true);
  });
}

/* ── simulated crew (never the phone personas) ──────────────────────────── */
const sims = (d: OpsState, workerId: string) => { const w = worker(d, workerId); return !w.persona && w.status === "active"; };
interface Due { at: number; key: string; run: () => void }

function arrivalFor(d: OpsState, asgId: string, start: number): number | null {
  const ups = updatesOf(d, asgId);
  const tr = ups.filter((u) => u.code !== "confirmed").pop();
  const a = d.assignments.find((x) => x.id === asgId)!;
  const r = roll("arr" + asgId, 100);
  if (tr?.code === "late") return (tr.eta ? ms(tr.eta) : start + 20 * M) + roll("eta" + asgId, 5) * M;
  if (tr?.code === "lost") return start + (6 + roll("lost" + asgId, 10)) * M;
  if (tr?.code === "on_way" || tr?.code === "arrived") return start + (roll("ow" + asgId, 16) - 12) * M;
  if (a.flaggedAt) return r < 50 ? start + (14 + roll("fl" + asgId, 16)) * M : null;
  return r < 93 ? start + (roll("nn" + asgId, 16) - 12) * M : null;
}

function dueCrew(d: OpsState, t0: number, t1: number, shifts: string[]): Due[] {
  const out: Due[] = [];
  const inWin = (t: number) => t > t0 && t <= t1;
  // Replies to reminders, travel checks and status requests.
  for (const m of d.messages) {
    if (!m.asks || ms(m.at) < t0 - 30 * H || ms(m.at) > t1) continue;
    if (m.kind !== "reconfirm" && m.kind !== "travel" && m.kind !== "status") continue;
    const evId = m.threadId.startsWith("T-E") || m.threadId.startsWith("T-") ? d.threads.find((x) => x.id === m.threadId)?.eventId : undefined;
    if (!evId) continue;
    for (const w of m.to) {
      if (!sims(d, w)) continue;
      const k = "rep" + m.id + w;
      const delay = m.kind === "reconfirm" ? 5 + roll(k, 240) : 2 + roll(k, 55);
      const at = ms(m.at) + delay * M;
      if (!inWin(at)) continue;
      const r = roll(k + "b", 100);
      const code: Code | null = m.kind === "reconfirm" ? (r < 95 ? "confirmed" : null) : r < 85 ? "on_way" : r < 91 ? "late" : null;
      if (!code) continue;
      out.push({ at, key: k, run: () => {
        const a = d.assignments.find((x) => x.workerId === w && x.status === "confirmed" && shift(d, x.shiftId).eventId === evId && ms(shift(d, x.shiftId).end) > at);
        if (!a) return;
        const sh = shift(d, a.shiftId);
        if (at >= ms(sh.start) || okClock(d, a.id, "in")) return;
        if (updatesOf(d, a.id).some((u) => ms(u.at) >= ms(m.at) && (m.kind === "reconfirm" ? u.code === "confirmed" : u.code !== "confirmed"))) return;
        as(d, w, () => replyCode(d, w, a.id, code, { eta: code === "late" ? iso(ms(sh.start) + (10 + roll(k + "e", 20)) * M) : undefined, via: roll(k + "v", 2) ? "whatsapp" : "app" }));
      } });
    }
  }
  // Replies to job offers.
  for (const o of d.offers) {
    if (o.status !== "sent" || !sims(d, o.workerId)) continue;
    const at = ms(o.sentAt) + (o.kind === "replacement" ? 4 + roll("off" + o.id, 20) : 10 + roll("off" + o.id, 150)) * M;
    if (!inWin(at) || at >= ms(o.expiresAt)) continue;
    const r = roll("offr" + o.id, 100);
    if (r >= 86) continue;
    out.push({ at, key: "off" + o.id, run: () => { if (isOpenOffer(d, o)) as(d, o.workerId, () => respondOffer(d, o.id, r < 72 ? "accept" : "decline", roll("ov" + o.id, 2) ? "whatsapp" : "app")); } });
  }
  // Arrivals and departures.
  for (const shId of shifts) {
    const sh = shift(d, shId);
    const st = ms(sh.start), en = ms(sh.end);
    if (st > t1 + 15 * M || en + 15 * M < t0) continue;
    for (const a of asgsOfShift(d, shId)) {
      if (a.status !== "confirmed" || !sims(d, a.workerId)) continue;
      const inC = okClock(d, a.id, "in");
      if (!inC) {
        if (clocksOf(d, a.id).some((c) => c.result === "pending_sync")) continue;
        const at = arrivalFor(d, a.id, st);
        if (at !== null && inWin(at) && at < en) out.push({ at, key: "in" + a.id, run: () => {
          if (a.status === "confirmed" && !okClock(d, a.id, "in")) as(d, "system", () => clockIn(d, a.id, { method: roll("m" + a.id, 4) ? "gps" : "qr", distanceM: 6 + roll("dist" + a.id, 38), token: "OSS-" + sh.id + "-v" + sh.version }));
        } });
      } else if (!okClock(d, a.id, "out")) {
        if (roll("forget" + a.id, 100) < 3) continue;
        const at = en + roll("out" + a.id, 13) * M;
        if (inWin(at)) out.push({ at, key: "out" + a.id, run: () => { if (!okClock(d, a.id, "out")) as(d, "system", () => clockOut(d, a.id, { method: "gps", distanceM: 8 + roll("od" + a.id, 30) })); } });
      }
    }
  }
  // Offline captures sync after a while.
  for (const c of d.clocks) if (c.result === "pending_sync" && sims(d, d.assignments.find((a) => a.id === c.asgId)!.workerId)) {
    const at = ms(c.at) + 20 * M;
    if (inWin(at)) out.push({ at, key: "sync" + c.id, run: () => as(d, "system", () => syncOffline(d, c.asgId)) });
  }
  return out;
}

/** Move demo time forward, running automations and simulated crew activity in time order. */
export function advance(d: OpsState, toIso: string): Result {
  const from = ms(d.clock), to = ms(toIso);
  if (!(to > from)) return no("Demo time only moves forward. Use Reset demo data to start again.");
  if (to - from > 14 * 864e5) return no("Move up to 14 days at a time.");
  const r: Rules = d.rules;
  const shifts = d.shifts.filter((sh) => {
    if (event(d, sh.eventId).status !== "confirmed") return false;
    const st = ms(sh.start), en = ms(sh.end);
    return st - r.reconfirmH * H <= to && en + (r.missedOutMin + 30) * M >= from;
  }).map((x) => x.id);
  const auditBefore = d.audit.length;
  for (let t0 = from; t0 < to;) {
    const t1 = Math.min(to, t0 + 5 * M);
    const due: Due[] = [];
    const cross = (t: number) => t > t0 && t <= t1;
    for (const id of shifts) {
      const sh = shift(d, id);
      const st = ms(sh.start), en = ms(sh.end);
      if (cross(st - r.reconfirmH * H)) due.push({ at: st - r.reconfirmH * H, key: "a1" + id, run: () => autoReconfirm(d, id) });
      if (cross(st - r.travelH * H)) due.push({ at: st - r.travelH * H, key: "a2" + id, run: () => autoTravel(d, id) });
      if (cross(st - r.noReplyMin * M)) due.push({ at: st - r.noReplyMin * M, key: "a3" + id, run: () => autoNoReply(d, id) });
      if (cross(en + r.missedOutMin * M)) due.push({ at: en + r.missedOutMin * M, key: "a4" + id, run: () => autoMissedOut(d, id) });
    }
    const mid = ms(zoned(dayKey(iso(t1)), "00:00"));
    if (cross(mid)) due.push({ at: mid, key: "exp" + mid, run: () => autoExpiry(d, dayKey(iso(t1))) });
    if (d.ui.crowd) due.push(...dueCrew(d, t0, t1, shifts));
    due.sort((a, b) => a.at - b.at || a.key.localeCompare(b.key));
    for (const j of due) { d.clock = iso(Math.max(j.at, ms(d.clock))); j.run(); }
    d.clock = iso(t1);
    t0 = t1;
  }
  const happened = d.audit.slice(auditBefore).filter((a) => a.action.startsWith("auto.")).length;
  audit(d, "demo.time", "Demo time moved to " + fmtDay(dayKey(toIso)) + " " + fmtTime(toIso), undefined, true);
  return ok("Demo time is now " + fmtDay(dayKey(toIso)) + ", " + fmtTime(toIso) + "." + (happened ? " " + happened + " automatic step" + (happened === 1 ? "" : "s") + " ran." : ""));
}

/* ── scenario helpers (labelled as simulated in the UI) ─────────────────── */
const REASONS = ["Family emergency", "Sick this morning", "Lift fell through", "Called in by my other job", "College exam moved"];
export function simulateDropouts(d: OpsState, shiftId: string, n = 3): Result {
  const sh = shift(d, shiftId);
  if (ms(sh.start) <= ms(d.clock)) return no("That shift has started.");
  const list = confirmedOf(d, shiftId).filter((a) => sims(d, a.workerId) && !okClock(d, a.id, "in"));
  const byRole = list.filter((a) => a.role === sh.needs[0].role);
  const pickList = (byRole.length >= n ? byRole : list).slice().sort((a, b) => roll("drop" + a.id, 1000) - roll("drop" + b.id, 1000)).slice(0, n);
  if (!pickList.length) return no("No one to cancel on this shift.");
  const names: string[] = [];
  pickList.forEach((a, i) => { as(d, a.workerId, () => cancelByWorker(d, a.id, REASONS[i % REASONS.length], i % 2 ? "whatsapp" : "app")); names.push(worker(d, a.workerId).name); });
  return ok(names.length + " cancellations (simulated): " + names.join(", ") + ".");
}
/** Replies from offered workers right now, without moving the clock. */
export function simulateReplies(d: OpsState, shiftId: string): Result {
  let acc = 0, dec = 0;
  const offers = d.offers.filter((o) => o.shiftId === shiftId && isOpenOffer(d, o) && sims(d, o.workerId)).sort((a, b) => roll("sr" + a.id, 1000) - roll("sr" + b.id, 1000));
  for (const o of offers) {
    const r = roll("offr" + o.id, 100);
    if (r >= 86) continue;
    const res = as(d, o.workerId, () => respondOffer(d, o.id, r < 72 ? "accept" : "decline", roll("ov" + o.id, 2) ? "whatsapp" : "app"));
    if (r < 72 && res.ok) acc++; else if (r >= 72) dec++;
  }
  if (!acc && !dec) return no("No simulated replies due: offers to phone personas need answering on the phone.");
  return ok(acc + " accepted, " + dec + " declined (simulated). " + (offers.length - acc - dec) + " not replied yet.");
}
export function simulateArrivals(d: OpsState, shiftId: string): Result {
  const sh = shift(d, shiftId);
  if (ms(d.clock) < ms(sh.start) - d.rules.clockOpenMin * M) return no("Clock-in opens " + d.rules.clockOpenMin + " min before the start.");
  let n = 0;
  for (const a of confirmedOf(d, shiftId)) {
    if (!sims(d, a.workerId) || okClock(d, a.id, "in") || a.flaggedAt) continue;
    const res = as(d, "system", () => clockIn(d, a.id, { method: "gps", distanceM: 6 + roll("dist" + a.id, 38) }));
    if (res.ok) n++;
  }
  return n ? ok(n + " crew clocked in (simulated location).") : no("No one left to clock in. Phone personas clock in on the phone.");
}

export { addDays };
