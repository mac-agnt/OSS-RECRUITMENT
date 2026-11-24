/* Messages and structured replies. Messages go out in the app and, simulated,
   by WhatsApp; replies update the roster and attendance straight away. */

import type { Code, MsgKind, OpsState, Result } from "../model";
import { CODE_LABEL } from "../model";
import {
  asg, confirmedOf, event, isOpenOffer, okClock, openOffersOf, owedReply, shift, shiftsOf, shiftVenue, worker
} from "../selectors";
import { fmtTime, ms } from "../time";
import { actorId, actorName, audit, denied, directThread, eventThread, nid, no, ok, post, shiftWhen } from "./core";
import { cancelByWorker } from "./staffing";

export type Audience = "worker" | "selected" | "event" | "shift" | "unconfirmed";
export interface MsgForm { audience: Audience; workerIds?: string[]; eventId?: string; shiftId?: string; body: string; kind?: MsgKind; asks?: Code[]; whatsapp?: boolean }

export function recipients(d: OpsState, f: Pick<MsgForm, "audience" | "workerIds" | "eventId" | "shiftId">): string[] {
  const now = ms(d.clock);
  const live = (eventId: string) => shiftsOf(d, eventId).filter((x) => ms(x.end) > now);
  if (f.audience === "worker" || f.audience === "selected") return [...new Set(f.workerIds || [])];
  if (f.audience === "shift" && f.shiftId) return confirmedOf(d, f.shiftId).map((a) => a.workerId);
  if (f.audience === "event" && f.eventId) return [...new Set(live(f.eventId).flatMap((x) => confirmedOf(d, x.id).map((a) => a.workerId)))];
  if (f.audience === "unconfirmed" && f.eventId) {
    const out = new Set<string>();
    for (const sh of live(f.eventId)) {
      for (const o of openOffersOf(d, sh.id)) out.add(o.workerId);
      for (const a of confirmedOf(d, sh.id)) if (a.flaggedAt || owedReply(d, a)) out.add(a.workerId);
    }
    return [...out];
  }
  return [];
}

export function sendMessage(d: OpsState, f: MsgForm): Result {
  const x = denied(d, "message", "send messages"); if (x) return x;
  const to = recipients(d, f);
  if (!to.length) return no("Nobody matches that audience.");
  if (!f.body.trim()) return no("Write a message first.");
  const eventId = f.eventId || (f.shiftId ? shift(d, f.shiftId).eventId : undefined);
  const base = { kind: f.kind || "message", body: f.body.trim(), asks: f.asks?.length ? f.asks : undefined,
    channels: (f.whatsapp === false ? ["app"] : ["app", "whatsapp"]) as ("app" | "whatsapp")[], ref: eventId ? { type: "event" as const, id: eventId } : undefined };
  let thread;
  if (f.audience !== "worker" && eventId) { thread = eventThread(d, eventId); post(d, { ...base, threadId: thread.id, to }); }
  else for (const w of to) { thread = directThread(d, w); post(d, { ...base, threadId: thread.id, to: [w] }); }
  const label = f.audience === "worker" ? worker(d, to[0]).name : to.length + " workers (" + (f.audience === "unconfirmed" ? "unconfirmed" : f.audience === "event" ? "event crew" : f.audience === "shift" ? "shift crew" : "selected") + ")";
  audit(d, "message.sent", actorName(d) + " messaged " + label + (f.whatsapp === false ? " in the app" : " by app and WhatsApp (simulated)"), { type: "thread", id: thread!.id }, true);
  return ok("Sent to " + (to.length === 1 ? worker(d, to[0]).name : to.length + " workers") + (f.whatsapp === false ? " in the app." : " by app and WhatsApp (simulated)."), { threadId: thread!.id, count: to.length });
}

export const TRAVEL_ASKS: Code[] = ["on_way", "late", "arrived", "lost", "cant_make"];
/** Ask the crew on an event (not yet clocked in) for their travelling status. */
export function requestStatus(d: OpsState, eventId: string, shiftIds?: string[]): Result {
  const x = denied(d, "message", "request a status update"); if (x) return x;
  const now = ms(d.clock);
  const shs = shiftsOf(d, eventId).filter((s) => ms(s.end) > now && ms(s.start) - now < 24 * 3600e3 && (!shiftIds || shiftIds.includes(s.id)));
  const to = [...new Set(shs.flatMap((s) => confirmedOf(d, s.id).filter((a) => !okClock(d, a.id, "in")).map((a) => a.workerId)))];
  if (!to.length) return no("No one to ask: the crew are clocked in or there's no shift in the next 24 hours.");
  post(d, { threadId: eventThread(d, eventId).id, kind: "status", to, asks: TRAVEL_ASKS, ref: { type: "event", id: eventId },
    body: "Status check for " + event(d, eventId).name.split(":")[0] + " (" + fmtTime(shs[0].start) + " start). Tap one: on my way, running late, arrived, can't find it or can't make it." });
  audit(d, "message.status_request", actorName(d) + " asked " + to.length + " crew for a status update, " + event(d, eventId).name, { type: "event", id: eventId }, true);
  return ok("Status request sent to " + to.length + ".");
}

/** A worker's structured reply about one assignment. */
export function replyCode(d: OpsState, workerId: string, asgId: string, code: Code, extra: { eta?: string; note?: string; via?: "app" | "whatsapp" | "supervisor" | "office" } = {}): Result {
  const a = asg(d, asgId);
  if (a.workerId !== workerId) return no("That shift isn't yours.");
  if (a.status !== "confirmed") return no("You're no longer booked on this shift.");
  const via = extra.via || "app";
  if (code === "cant_make" || code === "declined") return cancelByWorker(d, asgId, extra.note || CODE_LABEL[code], via === "supervisor" ? "office" : via);
  const sh = shift(d, a.shiftId), w = worker(d, workerId);
  if (code === "late" && extra.eta && ms(extra.eta) <= ms(d.clock)) return no("The arrival time has to be in the future.");
  d.updates.push({ id: nid(d, "U"), asgId, code, at: d.clock, eta: code === "late" ? extra.eta : undefined, note: extra.note?.trim() || undefined, via });
  if (code === "confirmed") a.reconfirmedAt = d.clock;
  else a.reconfirmedAt = a.reconfirmedAt || d.clock;
  const wasFlagged = !!a.flaggedAt;
  a.flaggedAt = undefined;
  for (const e of d.exceptions) if (e.asgId === asgId && e.status === "open" && (e.type === "no_response" || (e.type === "lost" && code !== "lost") || (e.type === "late" && code !== "late"))) {
    e.status = "resolved"; e.resolvedAt = d.clock; e.note = "Worker replied: " + CODE_LABEL[code];
  }
  // The original replied, so any replacement offer for them is withdrawn: never both confirmed.
  let withdrawn = 0;
  for (const o of d.offers) if (o.replaces === asgId && isOpenOffer(d, o)) { o.status = "withdrawn"; o.respondedAt = d.clock; o.note = "No longer needed: " + w.name + " replied"; withdrawn++; }
  if (code === "lost") d.exceptions.push({ id: nid(d, "X"), asgId, type: "lost", status: "open", at: d.clock, key: "lost:" + asgId + ":" + d.seq, detail: w.name + " can't find " + shiftVenue(d, sh).name + (extra.note ? ": " + extra.note : "") });
  if (code === "late") d.exceptions.push({ id: nid(d, "X"), asgId, type: "late", status: "open", at: d.clock, key: "late:" + asgId + ":" + d.seq, detail: w.name + " running late" + (extra.eta ? ", ETA " + fmtTime(extra.eta) : "") });
  const label = CODE_LABEL[code] + (code === "late" && extra.eta ? ", ETA " + fmtTime(extra.eta) : "") + (extra.note ? ": " + extra.note.trim() : "");
  post(d, { threadId: eventThread(d, sh.eventId).id, kind: "reply", to: ["office"], from: { kind: "worker", id: workerId }, code, body: label, ref: { type: "assignment", id: asgId },
    channels: via === "whatsapp" ? ["whatsapp"] : ["app"] });
  audit(d, "reply." + code, w.name + ": " + label + " (" + shiftWhen(d, sh) + ")" + (via === "whatsapp" ? " by WhatsApp (simulated)" : via === "supervisor" ? " recorded by supervisor" : "")
    + (wasFlagged ? "; no-reply flag cleared" : "") + (withdrawn ? "; " + withdrawn + " replacement offer withdrawn" : ""), { type: "assignment", id: asgId });
  return ok(code === "lost" ? "Your supervisor has been told. Meeting point: " + shiftVenue(d, sh).meeting + "." : "Thanks, the office can see your update.");
}

/** Free-text message from a worker to the office. */
export function workerText(d: OpsState, workerId: string, body: string): Result {
  if (!body.trim()) return no("Write a message first.");
  post(d, { threadId: directThread(d, workerId).id, kind: "reply", to: ["office"], from: { kind: "worker", id: workerId }, body: body.trim() });
  audit(d, "message.reply", worker(d, workerId).name + " messaged the office", { type: "worker", id: workerId });
  return ok("Sent to the OSS office.");
}

export function markRead(d: OpsState, who: string, threadId?: string): Result {
  for (const m of d.messages) if ((!threadId || m.threadId === threadId) && m.to.includes(who) && !m.read[who]) m.read[who] = d.clock;
  return ok("Read");
}

export { actorId };
