/* Shared engine helpers: results, ids, audit, permissions, threads and posting. */

import type { Message, OpsState, Perm, Result, Shift } from "../model";
import { event, nameOf, shiftVenue, user } from "../selectors";
import { fmtDate, fmtTime, span } from "../time";

export const ok = (msg: string, data?: any): Result => ({ ok: true, msg, data });
export const no = (msg: string, data?: any): Result => ({ ok: false, msg, data });

export function nid(d: OpsState, prefix: string) {
  d.seq += 1;
  return prefix + "-" + d.seq;
}

/** Who is acting: the store sets d.actor; office screens default to the signed-in office user. */
export const actorId = (d: OpsState) => d.actor || d.ui.officeId;
export const actorName = (d: OpsState) => nameOf(d, actorId(d));
export const isWorker = (id: string) => id.startsWith("W");

export function audit(d: OpsState, action: string, summary: string, ref?: { type: string; id: string }, sim?: boolean) {
  d.audit.push({ id: nid(d, "L"), at: d.clock, actor: actorName(d), action, summary, ref, sim: sim || undefined });
}

/** Permission check for office and supervisor users. Returns a refusal, or null when allowed. */
export function denied(d: OpsState, perm: Perm, what: string): Result | null {
  const id = actorId(d);
  if (id === "system") return null;
  const u = user(d, id);
  if (u && u.perms.includes(perm)) return null;
  const holders = d.users.filter((x) => x.perms.includes(perm) && x.kind === "office").map((x) => x.name);
  audit(d, "permission.denied", actorName(d) + " tried to " + what + " without permission");
  return no(actorName(d) + " can't " + what + ". " + (holders.length ? "Ask " + holders.slice(0, 2).join(" or ") + "." : ""));
}

/* ── threads and messages ───────────────────────────────────────────────── */
export function eventThread(d: OpsState, eventId: string) {
  const id = "T-" + eventId;
  let t = d.threads.find((x) => x.id === id);
  if (!t) { t = { id, kind: "event", eventId, title: event(d, eventId).name }; d.threads.push(t); }
  return t;
}
export function directThread(d: OpsState, workerId: string) {
  const id = "T-" + workerId;
  let t = d.threads.find((x) => x.id === id);
  if (!t) { t = { id, kind: "direct", workerId, title: nameOf(d, workerId) }; d.threads.push(t); }
  return t;
}
/** Replies that only confirm the plan don't need the office to read them; problems do. */
const ROUTINE = new Set(["confirmed", "on_way", "arrived", "declined"]);
export function post(d: OpsState, m: Omit<Message, "id" | "at" | "read" | "from" | "channels"> & { from?: Message["from"]; channels?: Message["channels"] }): Message {
  const id = actorId(d);
  const from: Message["from"] = m.from || (id === "system" ? { kind: "system", id: "system" }
    : isWorker(id) ? { kind: "worker", id } : { kind: user(d, id)?.kind === "supervisor" ? "supervisor" : "office", id });
  const msg: Message = { id: nid(d, "M"), at: d.clock, read: {}, channels: m.channels || ["app", "whatsapp"], ...m, from };
  if (from.kind === "office" || from.kind === "system" || (m.kind === "reply" && m.code && ROUTINE.has(m.code))) msg.read.office = d.clock;
  d.messages.push(msg);
  return msg;
}

/** "3Arena, Tue 24 Nov, 17:30-23:30" */
export function shiftWhen(d: OpsState, sh: Shift) {
  return event(d, sh.eventId).name.split(":")[0] + ", " + fmtDate(sh.start) + ", " + span(sh.start, sh.end);
}
export function offerBody(d: OpsState, sh: Shift, role: string, note?: string) {
  const ev = event(d, sh.eventId);
  const v = shiftVenue(d, sh);
  return "Job offer: " + role + " at " + ev.name + ". " + fmtDate(sh.start) + ", " + fmtTime(sh.start) + " to " + fmtTime(sh.end) + ", " + v.name + ". "
    + (ev.ppe.length ? "Bring " + ev.ppe.join(", ").toLowerCase() + ". " : "") + (note ? note + " " : "") + "Accept or decline in the app.";
}
