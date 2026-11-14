/* Actions. Each one mutates a draft copy of the state, records an audit event
   and returns a result the UI can show. Rejections are recorded as rejections. */

import type {
  AgentProposal, AgentRun, AuditEvent, AvailabilityException, AvailabilityRule, ClockEntry, DocType, EventBooking, ExceptionType,
  HandoverItem, Invitation, Message, OssState, Rules, Shift, StoryKey, Worker, WorkflowTask
} from "./model";
import {
  asgOf, availability, batchSummary, can, eligibility, eventCoverage, eventOf, isActiveInvite, lineFor, lines, nameOf, openExceptions,
  persona, shiftCoverage, shiftOf, shiftsOfEvent, userOf, venueOf, verifiedIn, verifiedOut, windowTotals, worker, candidates, expiringDocs,
  replacementQueue, docState
} from "./selectors";
import { CLIENT_REMOTE, docLabel } from "./seed";
import { addMin, dayKey, fmtDate, fmtDayMonth, fmtHM, fmtTime, minutesBetween, ms, zoned } from "./time";

export interface Result { ok: boolean; message: string; data?: any }
const ok = (message: string, data?: any): Result => ({ ok: true, message, data });
const no = (message: string, data?: any): Result => ({ ok: false, message, data });

export function nid(d: OssState, prefix: string) { d.seq += 1; return prefix + "-" + String(d.seq).padStart(4, "0"); }

export function audit(d: OssState, actor: string, action: string, entity: AuditEvent["entity"], summary: string,
  category: AuditEvent["category"], result: AuditEvent["result"] = "ok", story?: StoryKey, before?: string, after?: string) {
  d.audit.push({ id: nid(d, "AUD"), at: d.clock, actor, action, entity, summary, category, result, story, before, after });
}
const me = (d: OssState) => persona(d).name;
const deny = (d: OssState, perm: string, what: string): Result => {
  const holders = d.users.filter((u) => (u.perms as string[]).includes(perm)).map((u) => u.name);
  audit(d, me(d), "permission.denied", { type: "permission", id: perm, label: what }, me(d) + " tried to " + what + "; not permitted in the demo role model", "approvals", "rejected");
  return no("Needs " + holders.join(" or ") + " in this demo's role model. Use the button, or switch persona in the side panel.", { needs: perm, holders });
};
const shiftLabel = (d: OssState, sh: Shift) => eventOf(d, sh.eventId).name + ", " + sh.label.toLowerCase();
const storyOf = (sh: Shift): StoryKey | undefined => (sh.eventId === "EVT-001" ? "A" : undefined);

/* ── messaging ───────────────────────────────────────────────────────────── */
export function threadFor(d: OssState, workerId: string) {
  let t = d.threads.find((x) => x.kind === "direct" && x.workerId === workerId);
  if (!t) { t = { id: "TH-" + workerId, kind: "direct", workerId, title: worker(d, workerId).name }; d.threads.push(t); }
  return t;
}
export function postMessage(d: OssState, m: Omit<Message, "id" | "at" | "receipts" | "from"> & { from?: Message["from"] }): Message {
  const msg: Message = {
    id: nid(d, "MSG"), at: d.clock, from: m.from || { kind: "office", id: d.ui.personaId }, receipts: {}, ...m
  } as Message;
  for (const r of m.recipients) if (r !== "office") msg.receipts[r] = { delivered: d.clock };
  d.messages.push(msg);
  return msg;
}

export function sendBulk(d: OssState, args: { workerIds: string[]; body: string; eventId?: string; audience: string; kind?: Message["kind"] }): Result {
  if (!can(d, "message") && !can(d, "supervise")) return deny(d, "message", "send a message");
  if (!args.workerIds.length) return no("No recipients match that audience.");
  if (!args.body.trim()) return no("Write a message first.");
  let threadId: string;
  if (args.eventId) {
    let t = d.threads.find((x) => x.kind === "event" && x.eventId === args.eventId);
    if (!t) { t = { id: "TH-" + args.eventId, kind: "event", eventId: args.eventId, title: eventOf(d, args.eventId).name }; d.threads.push(t); }
    threadId = t.id;
  } else if (args.workerIds.length === 1) threadId = threadFor(d, args.workerIds[0]).id;
  else { threadId = "TH-BULK"; if (!d.threads.find((t) => t.id === threadId)) d.threads.push({ id: threadId, kind: "event", title: "Bulk messages" }); }
  const msg = postMessage(d, { threadId, kind: args.kind || (args.workerIds.length > 1 ? "bulk" : "direct"), body: args.body.trim(), recipients: args.workerIds, audience: args.audience });
  audit(d, me(d), "message.sent", { type: "message", id: msg.id, label: args.audience }, "Sent a simulated in-app message to " + args.workerIds.length + (args.workerIds.length === 1 ? " person" : " people") + " (" + args.audience + ")", "operations", "simulated");
  return ok("Message delivered in-app to " + args.workerIds.length + (args.workerIds.length === 1 ? " person" : " people") + ". Simulated: no SMS, push or email sent.", { id: msg.id });
}
export function markRead(d: OssState, workerId: string, messageIds: string[]): Result {
  for (const m of d.messages) if (messageIds.includes(m.id) && m.receipts[workerId] && !m.receipts[workerId].read) m.receipts[workerId].read = d.clock;
  return ok("Read");
}
export function acknowledge(d: OssState, workerId: string, messageId: string): Result {
  const m = d.messages.find((x) => x.id === messageId);
  if (!m || !m.receipts[workerId]) return no("Message not found");
  if (m.receipts[workerId].ack) return ok("Already acknowledged");
  m.receipts[workerId].read = m.receipts[workerId].read || d.clock;
  m.receipts[workerId].ack = d.clock;
  audit(d, worker(d, workerId).name, "message.acknowledged", { type: "message", id: m.id, label: m.audience || "Message" }, worker(d, workerId).name + " acknowledged: \"" + m.body.slice(0, 60) + (m.body.length > 60 ? "…" : "") + "\"", "operations");
  return ok("Acknowledged. OSS can see this.");
}
export function workerReply(d: OssState, workerId: string, body: string): Result {
  if (!body.trim()) return no("Write a reply first.");
  const t = threadFor(d, workerId);
  postMessage(d, { threadId: t.id, kind: "reply", body: body.trim(), recipients: ["office"], from: { kind: "worker", id: workerId } });
  audit(d, worker(d, workerId).name, "message.reply", { type: "worker", id: workerId, label: worker(d, workerId).name }, worker(d, workerId).name + " replied to OSS (a reply is not a shift decision)", "operations");
  return ok("Sent to OSS.");
}

/* ── tasks ───────────────────────────────────────────────────────────────── */
export function addTask(d: OssState, t: Omit<WorkflowTask, "id" | "createdAt" | "status"> & { status?: WorkflowTask["status"] }): WorkflowTask {
  const task: WorkflowTask = { id: nid(d, "TSK"), createdAt: d.clock, status: "open", ...t } as WorkflowTask;
  d.tasks.push(task);
  return task;
}
function closeTask(d: OssState, t: WorkflowTask, reason: string) {
  if (t.status === "done") return;
  t.status = "done"; t.doneAt = d.clock; t.doneReason = reason;
  audit(d, "Workflow", "task.closed", { type: "task", id: t.id, label: t.title }, "Closed \"" + t.title + "\": " + reason, "operations");
}
/** Tasks close only when their underlying prerequisite is actually met. */
export function reconcileTasks(d: OssState) {
  for (const t of d.tasks) {
    if (t.status === "done" || !t.related) continue;
    if (t.kind === "fill_gaps") { const c = eventCoverage(d, t.related.id); if (c.confirmed >= c.required) closeTask(d, t, "all " + c.required + " positions confirmed"); }
    if (t.kind === "doc_review") { const doc = d.documents.find((x) => x.id === t.related!.id); if (doc && doc.review !== "pending") closeTask(d, t, "evidence " + doc.review); }
    if (t.kind === "mapping") { const m = d.mappings.find((x) => x.localId === t.related!.id); if (m?.status === "mapped") closeTask(d, t, "mapped to " + m.remoteId); }
    if (t.kind === "venue") { const v = venueOf(d, t.related.id); if (v?.meetingConfirmed) closeTask(d, t, "meeting point confirmed"); }
    if (t.kind === "chase") { const c = eventCoverage(d, t.related.id); if (c.awaiting === 0) closeTask(d, t, "no replies outstanding"); }
    if (t.kind === "replacement") {
      const r = replacementQueue(d).find((x) => x.asg.id === t.related!.id);
      if (r?.replacement) closeTask(d, t, worker(d, r.replacement.workerId).name + " accepted; coverage " + shiftCoverage(d, r.shift.id).confirmed + "/" + r.shift.required);
    }
    if (t.kind === "attendance") { const e = d.exceptions.find((x) => x.id === t.related!.id); if (e?.status === "resolved") closeTask(d, t, e.resolution || "resolved"); }
  }
}
export function setTaskStatus(d: OssState, id: string, status: WorkflowTask["status"]): Result {
  const t = d.tasks.find((x) => x.id === id);
  if (!t) return no("Task not found");
  if (status === "done" && t.kind !== "general") {
    reconcileTasks(d);
    if (t.status !== "done") return no("This task closes itself when its prerequisite is met. Open the related record to finish it.");
    return ok("Done");
  }
  const before = t.status;
  t.status = status;
  if (status === "done") t.doneAt = d.clock;
  audit(d, me(d), "task.status", { type: "task", id, label: t.title }, "Moved \"" + t.title + "\" to " + status.replace("_", " "), "operations", "ok", undefined, before, status);
  return ok("Moved to " + status.replace("_", " "));
}

/* ── availability ────────────────────────────────────────────────────────── */
export function setAvailability(d: OssState, workerId: string, add: Omit<AvailabilityException, "id" | "workerId" | "createdAt">[], removeIds: string[] = [], rules?: { add?: Omit<AvailabilityRule, "id" | "workerId">[]; remove?: string[] }, actor?: string): Result {
  d.availExceptions = d.availExceptions.filter((x) => !(x.workerId === workerId && removeIds.includes(x.id)));
  for (const a of add) d.availExceptions.push({ id: nid(d, "AX"), workerId, createdAt: d.clock, ...a });
  if (rules?.remove) d.availRules = d.availRules.filter((r) => !(r.workerId === workerId && rules.remove!.includes(r.id)));
  for (const r of rules?.add || []) d.availRules.push({ id: nid(d, "AR"), workerId, ...r });
  const w = worker(d, workerId);
  const desc = add.map((a) => (a.kind === "available" ? "available " : a.kind === "holiday" ? "holiday " : "unavailable ") + fmtDate(a.start) + " " + fmtTime(a.start) + " to " + fmtTime(a.end)).join("; ");
  audit(d, actor || w.name, "availability.updated", { type: "worker", id: workerId, label: w.name }, w.name + " updated availability" + (desc ? ": " + desc : ""), "operations", "ok", workerId === "W009" ? "A" : undefined);
  // An availability change never cancels confirmed work; flag active invitations it now contradicts.
  for (const i of d.invitations) if (i.workerId === workerId && isActiveInvite(d, i)) {
    const sh = shiftOf(d, i.shiftId);
    const av = availability(d, workerId, sh.start, sh.end);
    i.flags = i.flags.filter((f) => f !== "worker-unavailable");
    if (av.state === "unavailable") i.flags.push("worker-unavailable");
  }
  return ok("Availability saved. Confirmed shifts are unchanged.");
}
export function requestAvailability(d: OssState, shiftId: string, workerIds: string[]): Result {
  if (!can(d, "allocate")) return deny(d, "allocate", "request availability");
  const sh = shiftOf(d, shiftId);
  for (const w of workerIds) {
    postMessage(d, { threadId: threadFor(d, w).id, kind: "direct", recipients: [w], body: "Are you available " + fmtDate(sh.start) + ", " + fmtTime(sh.start) + " to " + fmtTime(sh.end) + " at " + venueOf(d, eventOf(d, sh.eventId).venueId)?.name + "? Please update your availability in OSS Crew. This is not a shift offer." });
  }
  audit(d, me(d), "availability.requested", { type: "shift", id: shiftId, label: shiftLabel(d, sh) }, "Asked " + workerIds.length + " workers to confirm availability for " + shiftLabel(d, sh), "operations", "simulated");
  return ok("Availability request sent to " + workerIds.length + ". Not an invitation; they are not counted as allocated.");
}

/* ── invitations ─────────────────────────────────────────────────────────── */
export const inviteBody = (d: OssState, sh: Shift) =>
  (venueOf(d, eventOf(d, sh.eventId).venueId)?.name || eventOf(d, sh.eventId).name) + ", " + fmtDate(sh.start).replace(/^(\w+)/, (m) => ({ Sat: "Saturday", Sun: "Sunday", Fri: "Friday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday" } as any)[m] || m)
  + ", " + fmtTime(sh.start) + "–" + fmtTime(sh.end) + ". " + (sh.ppe.length ? sh.ppe.join(", ").replace("High-visibility jacket", "hi-vis").replace(/, ([^,]*)$/, " and $1").replace(/^./, (c) => c.toUpperCase()) + " required. " : "") + "Please accept or decline this shift.";

export function sendInvitations(d: OssState, shiftId: string, workerIds: string[], opts: { kind?: "standard" | "replacement"; replaces?: string; actor?: string } = {}): Result {
  if (!can(d, "allocate")) return deny(d, "allocate", "send invitations");
  const sh = shiftOf(d, shiftId);
  const cov = shiftCoverage(d, shiftId);
  let room = opts.kind === "replacement" ? Math.max(1, cov.notInvited) : cov.notInvited;
  const sent: string[] = [], skipped: string[] = [];
  for (const w of workerIds) {
    const name = worker(d, w).name;
    if (d.assignments.some((a) => a.shiftId === shiftId && a.workerId === w && a.status === "confirmed") || d.invitations.some((i) => i.shiftId === shiftId && i.workerId === w && isActiveInvite(d, i))) { skipped.push(name + " already invited"); continue; }
    const el = eligibility(d, w, shiftId);
    if (el.status === "blocked") { skipped.push(name + ": " + el.reasons.filter((r) => r.level === "block").map((r) => r.label).join("; ")); continue; }
    if (el.status === "unknown") { skipped.push(name + ": availability unknown, request it first"); continue; }
    if (room <= 0) { skipped.push(name + ": no uninvited positions left; add to standby instead"); continue; }
    room--;
    // 24 hours or two hours before start, whichever is sooner; short-notice offers stay open an hour (never past start).
    const expiry = Math.max(Math.min(ms(addMin(d.clock, d.rules.inviteExpiryH * 60)), ms(addMin(sh.start, -120))), Math.min(ms(addMin(d.clock, 60)), ms(sh.start)));
    const inv: Invitation = {
      id: nid(d, "INV"), shiftId, workerId: w, sentAt: d.clock, sentBy: d.ui.personaId, version: sh.version, status: "sent",
      expiresAt: new Date(expiry).toISOString(), flags: [], kind: opts.kind || "standard", replacesAssignmentId: opts.replaces, reminders: []
    };
    d.invitations.push(inv);
    postMessage(d, { threadId: threadFor(d, w).id, kind: "invitation", recipients: [w], body: inviteBody(d, sh), related: { type: "invitation", id: inv.id } });
    sent.push(name);
    audit(d, opts.actor || me(d), "invitation.sent", { type: "invitation", id: inv.id, label: name + ", " + sh.label.toLowerCase() },
      (opts.kind === "replacement" ? "Sent replacement invitation to " : "Invited ") + name + " to " + shiftLabel(d, sh) + " (simulated in-app delivery)", "operations", "simulated", opts.kind === "replacement" ? "B" : storyOf(sh));
  }
  if (!sent.length) return no(skipped.join(". ") || "Nobody to invite.", { skipped });
  return ok("Invited " + sent.join(", ") + (skipped.length ? ". Skipped: " + skipped.join("; ") : "") + ". Positions count as allocated until they reply.", { sent, skipped });
}

export function respond(d: OssState, invId: string, answer: "accept" | "decline", reason = ""): Result {
  const inv = d.invitations.find((i) => i.id === invId);
  if (!inv) return no("Invitation not found");
  const w = worker(d, inv.workerId), sh = shiftOf(d, inv.shiftId);
  if (inv.status === "accepted" && answer === "accept") return ok("Already accepted.");
  if (inv.status !== "sent") return no("This invitation is " + inv.status + ".");
  if (!isActiveInvite(d, inv)) return no("This invitation expired at " + fmtDate(inv.expiresAt) + " " + fmtTime(inv.expiresAt) + ".");
  if (answer === "decline") {
    inv.status = "declined"; inv.respondedAt = d.clock;
    audit(d, w.name, "invitation.declined", { type: "invitation", id: inv.id, label: w.name + ", " + sh.label.toLowerCase() },
      w.name + " declined " + shiftLabel(d, sh) + (reason ? " (" + reason + ")" : "") + "; coverage " + shiftCoverage(d, sh.id).confirmed + "/" + sh.required + ", position released", "operations", "ok", inv.kind === "replacement" ? "B" : storyOf(sh));
    reconcileTasks(d);
    return ok("Declined. Only this shift changed.");
  }
  if (d.assignments.some((a) => a.shiftId === sh.id && a.workerId === w.id && a.status === "confirmed")) return ok("Already confirmed.");
  const el = eligibility(d, w.id, sh.id);
  const blocks = el.reasons.filter((r) => r.level === "block");
  if (blocks.length) {
    audit(d, w.name, "invitation.accept_rejected", { type: "invitation", id: inv.id, label: w.name }, w.name + " tried to accept " + shiftLabel(d, sh) + "; rejected on re-check: " + blocks.map((b) => b.label).join("; "), "operations", "rejected", storyOf(sh));
    return no("Can't confirm: " + blocks.map((b) => b.label).join("; ") + ". OSS has been told.");
  }
  const cov = shiftCoverage(d, sh.id);
  if (cov.confirmed >= sh.required) {
    if (!d.standby.some((b) => b.shiftId === sh.id && b.workerId === w.id)) d.standby.push({ id: nid(d, "SB"), shiftId: sh.id, workerId: w.id, order: d.standby.filter((b) => b.shiftId === sh.id).length + 1, willing: true, note: "Accepted after the shift filled", contact: "Auto-added " + fmtTime(d.clock) });
    audit(d, w.name, "invitation.full", { type: "invitation", id: inv.id, label: w.name }, w.name + " accepted after " + shiftLabel(d, sh) + " filled; offered standby, not booked", "operations", "rejected", storyOf(sh));
    return no("This shift filled before you replied. You're on standby; you are not booked.");
  }
  if (el.avail === "unknown") d.availExceptions.push({ id: nid(d, "AX"), workerId: w.id, start: sh.start, end: sh.end, kind: "available", note: "Confirmed by accepting the shift", createdAt: d.clock });
  inv.status = "accepted"; inv.respondedAt = d.clock;
  const asg = { id: "ASG-" + sh.id.slice(3) + "-" + w.id, shiftId: sh.id, workerId: w.id, invitationId: inv.id, status: "confirmed" as const, acceptedAt: d.clock, shiftVersion: sh.version, replacementFor: inv.replacesAssignmentId };
  const old = d.assignments.findIndex((a) => a.id === asg.id);
  if (old > -1) asg.id = asg.id + "-" + d.seq;
  d.assignments.push(asg);
  const c = shiftCoverage(d, sh.id);
  audit(d, w.name, "invitation.accepted", { type: "assignment", id: asg.id, label: w.name + ", " + sh.label.toLowerCase() },
    w.name + " accepted " + sh.label.toLowerCase() + " (" + eventOf(d, sh.eventId).name + "); coverage " + c.confirmed + "/" + sh.required, "operations", "ok", inv.kind === "replacement" ? "B" : storyOf(sh));
  reconcileTasks(d);
  return ok("Accepted. You're confirmed for " + sh.label.toLowerCase() + ".");
}
export function withdrawInvitation(d: OssState, invId: string): Result {
  if (!can(d, "allocate")) return deny(d, "allocate", "withdraw an invitation");
  const inv = d.invitations.find((i) => i.id === invId);
  if (!inv || inv.status !== "sent") return no("Only an open invitation can be withdrawn.");
  inv.status = "withdrawn"; inv.respondedAt = d.clock;
  postMessage(d, { threadId: threadFor(d, inv.workerId).id, kind: "direct", recipients: [inv.workerId], body: "The invitation for " + shiftLabel(d, shiftOf(d, inv.shiftId)) + " has been withdrawn. No action needed." });
  audit(d, me(d), "invitation.withdrawn", { type: "invitation", id: inv.id, label: nameOf(d, inv.workerId) }, "Withdrew " + nameOf(d, inv.workerId) + "'s invitation for " + shiftLabel(d, shiftOf(d, inv.shiftId)), "operations");
  return ok("Withdrawn; the position is no longer reserved.");
}
export function remind(d: OssState, invId: string): Result {
  if (!can(d, "allocate") && !can(d, "message")) return deny(d, "allocate", "send a reminder");
  const inv = d.invitations.find((i) => i.id === invId);
  if (!inv || !isActiveInvite(d, inv)) return no("Only an open invitation can be reminded.");
  const sh = shiftOf(d, inv.shiftId);
  inv.reminders.push(d.clock);
  postMessage(d, { threadId: threadFor(d, inv.workerId).id, kind: "reminder", recipients: [inv.workerId], related: { type: "invitation", id: inv.id }, body: "Reminder: please accept or decline " + shiftLabel(d, sh) + ", " + fmtDate(sh.start) + " " + fmtTime(sh.start) + ". Offer open until " + fmtDate(inv.expiresAt) + " " + fmtTime(inv.expiresAt) + "." });
  audit(d, me(d), "invitation.reminded", { type: "invitation", id: inv.id, label: nameOf(d, inv.workerId) }, "Reminded " + nameOf(d, inv.workerId) + " about " + shiftLabel(d, sh), "operations", "simulated");
  return ok("Reminder delivered in-app (simulated).");
}

/* ── cancellation, standby, replacement ──────────────────────────────────── */
export function cancelAssignment(d: OssState, asgId: string, reason: string, byWorker = true): Result {
  const a = d.assignments.find((x) => x.id === asgId);
  if (!a || a.status !== "confirmed") return no("Nothing to cancel.");
  if (!reason.trim()) return no("Please give a reason so OSS can plan.");
  const sh = shiftOf(d, a.shiftId), w = worker(d, a.workerId), ev = eventOf(d, sh.eventId);
  if (verifiedIn(d, a.id)) return no("Already clocked in. Contact your supervisor instead.");
  a.status = "cancelled"; a.cancelledAt = d.clock; a.cancelReason = reason.trim();
  const c = shiftCoverage(d, sh.id);
  audit(d, byWorker ? w.name : me(d), "assignment.cancelled", { type: "assignment", id: a.id, label: w.name + ", " + sh.label.toLowerCase() },
    w.name + " cancelled " + sh.label.toLowerCase() + " (" + reason.trim() + "); " + sh.label.toLowerCase() + " coverage " + c.confirmed + "/" + sh.required, "operations", "ok", "B");
  postMessage(d, { threadId: threadFor(d, w.id).id, kind: "cancellation", recipients: ["office"], from: { kind: "worker", id: w.id }, body: "Cancelled " + shiftLabel(d, sh) + ". Reason: " + reason.trim() });
  addTask(d, { title: "Replace " + w.name + " on " + ev.name.split(":")[0] + " " + sh.label.toLowerCase(), ownerId: ev.ownerId, due: addMin(sh.start, -60), priority: "High", dept: "Events",
    related: { type: "assignment", id: a.id, label: w.name + " cancelled" }, kind: "replacement", source: "Ops Watchdog" });
  return ok("Cancelled. OSS has a replacement task; your history keeps this record.");
}
export function addStandby(d: OssState, shiftId: string, workerId: string): Result {
  if (!can(d, "allocate")) return deny(d, "allocate", "change standby");
  if (d.standby.some((b) => b.shiftId === shiftId && b.workerId === workerId)) return no("Already on standby.");
  d.standby.push({ id: nid(d, "SB"), shiftId, workerId, order: d.standby.filter((b) => b.shiftId === shiftId).length + 1, willing: false, note: "Added by " + me(d), contact: "Not yet contacted" });
  audit(d, me(d), "standby.added", { type: "shift", id: shiftId, label: shiftLabel(d, shiftOf(d, shiftId)) }, "Added " + nameOf(d, workerId) + " to standby (does not count as confirmed or allocated)", "operations");
  return ok("Added to standby. Standby never counts toward confirmed headcount.");
}
export function moveStandby(d: OssState, id: string, dir: -1 | 1): Result {
  const e = d.standby.find((b) => b.id === id); if (!e) return no("Not found");
  const list = d.standby.filter((b) => b.shiftId === e.shiftId).sort((a, b) => a.order - b.order);
  const i = list.indexOf(e), j = i + dir;
  if (j < 0 || j >= list.length) return no("Already at the edge");
  const o = list[j].order; list[j].order = e.order; e.order = o;
  return ok("Order updated");
}
export function removeStandby(d: OssState, id: string): Result {
  const e = d.standby.find((b) => b.id === id); if (!e) return no("Not found");
  d.standby = d.standby.filter((b) => b.id !== id);
  d.standby.filter((b) => b.shiftId === e.shiftId).sort((a, b) => a.order - b.order).forEach((b, i) => (b.order = i + 1));
  audit(d, me(d), "standby.removed", { type: "shift", id: e.shiftId, label: nameOf(d, e.workerId) }, "Removed " + nameOf(d, e.workerId) + " from standby", "operations");
  return ok("Removed from standby");
}
export function markStandbyWilling(d: OssState, id: string): Result {
  const e = d.standby.find((b) => b.id === id); if (!e) return no("Not found");
  e.willing = true; e.contact = "Confirmed willing " + fmtDate(d.clock) + " " + fmtTime(d.clock);
  return ok("Marked willing");
}

/* ── documents and registration ──────────────────────────────────────────── */
export function reviewDocument(d: OssState, docId: string, decision: "approved" | "rejected"): Result {
  if (!can(d, "approve_docs")) return deny(d, "approve_docs", "review a document");
  const doc = d.documents.find((x) => x.id === docId);
  if (!doc || doc.review !== "pending") return no("Only evidence awaiting review can be decided.");
  doc.review = decision; doc.reviewer = d.ui.personaId; doc.reviewedAt = d.clock;
  audit(d, me(d), "document." + decision, { type: "document", id: doc.id, label: nameOf(d, doc.workerId) + ", " + docLabel(doc.type) },
    me(d) + " " + decision + " " + nameOf(d, doc.workerId) + "'s " + docLabel(doc.type) + " (review checks the record, not authenticity)", "approvals", "ok", "D");
  reconcileTasks(d);
  return ok(decision === "approved" ? "Approved. Eligibility updates immediately." : "Rejected. The worker will be asked for new evidence.");
}
export function uploadDocument(d: OssState, workerId: string, type: DocType, expires: string, by: string): Result {
  const id = nid(d, "DOC");
  d.documents.push({ id, workerId, type, issuer: "Sample upload (synthetic placeholder)", file: "sample-upload-" + id.toLowerCase() + ".pdf", issued: dayKey(d.clock), expires, review: "pending", uploadedAt: d.clock });
  audit(d, by, "document.uploaded", { type: "document", id, label: nameOf(d, workerId) + ", " + docLabel(type) }, by + " uploaded a synthetic " + docLabel(type) + " placeholder; awaiting review (uploaded is not approved)", "approvals", "ok", "D");
  addTask(d, { title: "Review " + nameOf(d, workerId) + "'s " + docLabel(type), ownerId: "U06", due: addMin(d.clock, 24 * 60), priority: "Medium", dept: "Compliance", related: { type: "document", id, label: docLabel(type) }, kind: "doc_review", source: "Upload" });
  return ok("Uploaded as a labelled sample. Compliance must review it before it counts.");
}

export const normEmail = (e: string) => e.trim().toLowerCase();
export const normPhone = (p: string) => { let x = p.replace(/\D/g, ""); if (x.startsWith("353")) x = "0" + x.slice(3); return x; };
export function findDuplicates(d: OssState, f: { name: string; email: string; mobile: string }) {
  const e = normEmail(f.email), p = normPhone(f.mobile);
  const exact = d.workers.find((w) => (e && normEmail(w.email) === e) || (p.length >= 9 && normPhone(w.mobile) === p));
  const tokens = f.name.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  const similar = tokens.length ? d.workers.filter((w) => w !== exact && tokens.filter((t) => w.name.toLowerCase().includes(t)).length >= Math.min(2, tokens.length)) : [];
  return { exact, similar };
}
export function registerWorker(d: OssState, f: { name: string; email: string; mobile: string; role: string; locality: string }, by: string, confirmNew = false): Result {
  if (!f.name.trim() || (!f.email.trim() && !f.mobile.trim())) return no("Name and an email or mobile are needed.");
  const { exact, similar } = findDuplicates(d, f);
  if (exact) {
    audit(d, by, "registration.duplicate", { type: "worker", id: exact.id, label: exact.name }, "Registration matched existing profile " + exact.id + " on " + (normEmail(exact.email) === normEmail(f.email) ? "email" : "mobile") + "; no new record created", "operations", "rejected");
    return no("Existing profile found: " + exact.name + " (" + exact.id + ").", { existing: exact.id });
  }
  if (similar.length && !confirmNew) return no("Possible name match. Review before creating.", { similar: similar.map((w) => w.id) });
  const id = "W" + String(d.workers.length + 1).padStart(3, "0");
  const w: Worker = { id, name: f.name.trim(), roles: [f.role], locality: f.locality, email: normEmail(f.email), mobile: f.mobile.trim(), joined: dayKey(d.clock), status: "pending_compliance", priorShifts: 0, priorVenues: [], registeredBy: by, registeredAt: d.clock };
  d.workers.push(w);
  d.mappings.push({ id: "MAP-" + id, entityType: "worker", localId: id, remoteId: null, status: "missing", note: "Mapping pending: new local worker" });
  addTask(d, { title: "Draft Bullhorn mapping for " + w.name, ownerId: "U07", due: addMin(d.clock, 48 * 60), priority: "Low", dept: "Hours", related: { type: "worker", id, label: w.name }, kind: "mapping", source: "Registration" });
  audit(d, by, "worker.registered", { type: "worker", id, label: w.name }, by + " registered " + w.name + " (" + id + "): pending compliance, mapping pending", "operations");
  return ok("Created " + w.name + " (" + id + "), pending compliance.", { created: id });
}
export function bulkUpdateWorkers(d: OssState, ids: string[], patch: { locality?: string; addRole?: string }): Result {
  if (!can(d, "allocate") && !can(d, "approve_docs")) return deny(d, "allocate", "bulk edit workers");
  if (!ids.length) return no("Select workers first.");
  let n = 0;
  for (const id of ids) {
    const w = worker(d, id); const before: string[] = [], after: string[] = [];
    if (patch.locality && w.locality !== patch.locality) { before.push(w.locality); w.locality = patch.locality; after.push(w.locality); }
    if (patch.addRole && !w.roles.includes(patch.addRole)) { before.push(w.roles.join(", ")); w.roles = w.roles.concat([patch.addRole]); after.push(w.roles.join(", ")); }
    if (after.length) { n++; audit(d, me(d), "worker.bulk_updated", { type: "worker", id, label: w.name }, me(d) + " updated " + w.name + " in a bulk edit", "operations", "ok", undefined, before.join("; "), after.join("; ")); }
  }
  return n ? ok("Updated " + n + " worker" + (n === 1 ? "" : "s") + ". Each change is in the audit trail.") : no("Nothing to change for the selected workers.");
}
export function setWorkerStatus(d: OssState, workerId: string, status: Worker["status"]): Result {
  if (!can(d, "approve_docs")) return deny(d, "approve_docs", "clear a new profile");
  const w = worker(d, workerId); w.status = status;
  audit(d, me(d), "worker.status", { type: "worker", id: workerId, label: w.name }, me(d) + " set " + w.name + " to " + status.replace("_", " "), "approvals");
  return ok("Updated");
}

/* ── bookings ────────────────────────────────────────────────────────────── */
export interface BookingForm {
  name: string; clientId: string; venueId: string | null; date: string; status: "confirmed" | "pending"; ownerId: string; ppe: string[]; docs: DocType[];
  shifts: { label: string; roles: string[]; start: string; end: string; required: number }[]; brief: string;
}
export function bookingDuplicates(d: OssState, f: BookingForm) {
  return d.events.filter((e) => e.clientId === f.clientId && e.date === f.date && e.status !== "cancelled" && (!f.venueId || e.venueId === f.venueId));
}
export function createBooking(d: OssState, f: BookingForm): Result {
  if (!can(d, "allocate")) return deny(d, "allocate", "create a booking");
  if (!f.name.trim()) return no("Give the booking a name.");
  if (!f.shifts.length) return no("Add at least one shift.");
  for (const s of f.shifts) {
    if (!s.label.trim() || s.required < 1) return no("Every shift needs a name and at least one position.");
    if (s.end <= s.start && !(s.end < "06:00")) return no("Shift \"" + s.label + "\" ends before it starts.");
  }
  const n = d.events.filter((e) => !e.historical).length + 1;
  const id = "EVT-" + String(n).padStart(3, "0");
  const ev: EventBooking = { id, name: f.name.trim(), clientId: f.clientId, venueId: f.venueId, date: f.date, status: f.status, ownerId: f.ownerId, approverId: "U02", supervisorId: "U05",
    ppe: f.ppe, brief: f.brief, createdAt: d.clock, indicativePositions: f.status === "pending" ? f.shifts.reduce((t, s) => t + s.required, 0) : undefined, pendingNote: f.status === "pending" ? "Saved as pending in the workshop" : undefined };
  d.events.push(ev);
  f.shifts.forEach((s, i) => {
    const start = zoned(f.date, s.start);
    let end = zoned(f.date, s.end);
    if (ms(end) <= ms(start)) end = addMin(end, 24 * 60);
    d.shifts.push({ id: "SH-" + String(n).padStart(3, "0") + String.fromCharCode(65 + i), eventId: id, label: s.label.trim(), roles: s.roles, start, end, required: s.required, requiredDocs: f.docs, ppe: f.ppe, version: 1 });
  });
  audit(d, me(d), "booking.created", { type: "event", id, label: ev.name }, "Created " + (f.status === "pending" ? "pending" : "confirmed") + " booking " + id + " with " + f.shifts.length + " shifts, " + f.shifts.reduce((t, s) => t + s.required, 0) + " positions", "operations");
  return ok("Booking " + id + " saved as " + f.status + ".", { id });
}
export function setBookingStatus(d: OssState, eventId: string, status: "confirmed" | "pending"): Result {
  if (!can(d, "allocate")) return deny(d, "allocate", "change a booking");
  const e = eventOf(d, eventId); const before = e.status; e.status = status;
  if (status === "confirmed") e.pendingNote = undefined;
  audit(d, me(d), "booking.status", { type: "event", id: eventId, label: e.name }, "Moved " + e.name + " from " + before + " to " + status, "operations", "ok", undefined, before, status);
  return ok(status === "confirmed" ? "Confirmed: now counts in firm demand." : "Pending: excluded from firm demand.");
}
export function shiftChangeImpact(d: OssState, shiftId: string) {
  return {
    accepted: d.assignments.filter((a) => a.shiftId === shiftId && a.status === "confirmed"),
    invites: d.invitations.filter((i) => i.shiftId === shiftId && isActiveInvite(d, i))
  };
}
export function changeShiftTimes(d: OssState, shiftId: string, startHM: string, endHM: string): Result {
  if (!can(d, "allocate")) return deny(d, "allocate", "change shift times");
  const sh = shiftOf(d, shiftId);
  const date = dayKey(sh.start);
  const start = zoned(date, startHM);
  let end = zoned(date, endHM);
  if (ms(end) <= ms(start)) end = addMin(end, 24 * 60);
  if (minutesBetween(start, end) > 16 * 60) return no("End must be after start (and within 16 hours).");
  const before = fmtTime(sh.start) + "–" + fmtTime(sh.end);
  sh.start = start; sh.end = end; sh.version += 1;
  const imp = shiftChangeImpact(d, shiftId);
  const ids = imp.accepted.map((a) => a.workerId).concat(imp.invites.map((i) => i.workerId));
  for (const i of imp.invites) i.version = sh.version;
  for (const w of ids) postMessage(d, { threadId: threadFor(d, w).id, kind: "direct", recipients: [w], body: shiftLabel(d, sh) + " has moved to " + fmtTime(start) + "–" + fmtTime(end) + ". Please reconfirm in OSS Crew." });
  audit(d, me(d), "shift.changed", { type: "shift", id: shiftId, label: shiftLabel(d, sh) }, "Changed " + shiftLabel(d, sh) + " times; " + imp.accepted.length + " accepted workers need to reconfirm", "operations", "ok", undefined, before, fmtTime(start) + "–" + fmtTime(end));
  return ok("Saved. " + imp.accepted.length + " accepted workers asked to reconfirm.");
}
export function reconfirm(d: OssState, asgId: string): Result {
  const a = asgOf(d, asgId); const sh = shiftOf(d, a.shiftId);
  a.shiftVersion = sh.version;
  audit(d, nameOf(d, a.workerId), "assignment.reconfirmed", { type: "assignment", id: a.id, label: nameOf(d, a.workerId) }, nameOf(d, a.workerId) + " reconfirmed the changed times for " + shiftLabel(d, sh), "operations");
  return ok("Reconfirmed");
}
export function cancelBooking(d: OssState, eventId: string): Result {
  if (!can(d, "manage")) return deny(d, "manage", "cancel a booking");
  const e = eventOf(d, eventId);
  let inv = 0, asg = 0;
  for (const sh of shiftsOfEvent(d, eventId)) {
    for (const i of d.invitations) if (i.shiftId === sh.id && i.status === "sent") { i.status = "withdrawn"; i.respondedAt = d.clock; inv++; }
    for (const a of d.assignments) if (a.shiftId === sh.id && a.status === "confirmed" && !verifiedIn(d, a.id)) { a.status = "withdrawn"; a.cancelledAt = d.clock; a.cancelReason = "Booking cancelled"; asg++; }
  }
  e.status = "cancelled";
  audit(d, me(d), "booking.cancelled", { type: "event", id: eventId, label: e.name }, "Cancelled " + e.name + ": withdrew " + inv + " invitations and " + asg + " assignments; attendance history kept", "operations");
  return ok("Cancelled. " + inv + " invitations and " + asg + " assignments withdrawn.");
}
export function confirmMeetingPoint(d: OssState, venueId: string, text: string): Result {
  if (!can(d, "manage") && !can(d, "allocate")) return deny(d, "manage", "confirm a meeting point");
  const v = venueOf(d, venueId)!;
  const before = v.meetingPoint;
  v.meetingPoint = text.trim() || v.meetingPoint; v.meetingConfirmed = true;
  audit(d, me(d), "venue.meeting_confirmed", { type: "venue", id: v.id, label: v.name }, me(d) + " confirmed the " + v.name + " meeting point", "operations", "ok", "A", before, v.meetingPoint);
  reconcileTasks(d);
  return ok("Meeting point confirmed.");
}

export const qrFor = (venueId: string, sh: Shift) => "QR-" + venueId + "-" + sh.id.replace("-", "") + "-v" + sh.version;

/* ── attendance ──────────────────────────────────────────────────────────── */
function openException(d: OssState, asgId: string, type: ExceptionType, reason: string, nextAction: string, key: string) {
  if (d.exceptions.some((e) => e.key === key)) return;
  d.exceptions.push({ id: nid(d, "EXC"), assignmentId: asgId, type, status: "open", ownerId: "U05", reason, nextAction, createdAt: d.clock, key });
}
function resolveExceptions(d: OssState, asgId: string, types: ExceptionType[], resolution: string) {
  for (const e of d.exceptions) if (e.assignmentId === asgId && e.status === "open" && types.includes(e.type)) { e.status = "resolved"; e.resolvedAt = d.clock; e.resolution = resolution; }
}
export function journey(d: OssState, asgId: string, status: "on_the_way" | "running_late" | "on_site" | "issue", eta?: string, message?: string): Result {
  const a = asgOf(d, asgId);
  d.journeys.push({ id: nid(d, "JRN"), assignmentId: asgId, status, at: d.clock, eta, message });
  const label = { on_the_way: "on the way", running_late: "running late", on_site: "on site (self-reported)", issue: "reported an issue" }[status];
  audit(d, nameOf(d, a.workerId), "journey." + status, { type: "assignment", id: asgId, label: nameOf(d, a.workerId) }, nameOf(d, a.workerId) + " reported " + label + (eta ? ", ETA " + fmtTime(eta) : "") + (message ? ": \"" + message + "\"" : "") + ". Not a clock event.", "operations", "ok", a.workerId === "W021" ? "C" : undefined);
  return ok("OSS can see your update. This does not clock you in.");
}
export interface ClockInput { kind: "in" | "out"; method: "gps" | "qr" | "supervisor"; distanceM?: number; accuracyM?: number; denied?: boolean; offline?: boolean; token?: string; at?: string; actor?: string }
export function clock(d: OssState, asgId: string, inp: ClockInput): Result {
  const a = asgOf(d, asgId);
  if (a.status !== "confirmed") return no("Not on this shift.");
  const sh = shiftOf(d, a.shiftId), v = venueOf(d, eventOf(d, sh.eventId).venueId)!;
  const w = worker(d, a.workerId);
  if (inp.kind === "in" && verifiedIn(d, asgId)) return ok("Already clocked in at " + fmtTime(verifiedIn(d, asgId)!.at) + ".");
  if (inp.kind === "out" && !verifiedIn(d, asgId)) return no("Clock in first, or ask your supervisor to record a correction.");
  if (inp.kind === "out" && verifiedOut(d, asgId)) return ok("Already clocked out.");
  if (ms(d.clock) < ms(sh.start) - 60 * 60000 && inp.kind === "in") return no("Clock-in opens one hour before the shift starts (" + fmtTime(addMin(sh.start, -60)) + ").");
  const at = inp.at || d.clock;
  const key = "clk-" + asgId + "-" + inp.kind + "-" + d.seq;
  const entry: ClockEntry = { id: nid(d, "CLK"), assignmentId: asgId, kind: inp.kind, at, method: inp.offline ? "offline" : inp.method, distanceM: inp.distanceM, accuracyM: inp.accuracyM, token: inp.token, result: "verified", reason: "", eventKey: key };
  const word = inp.kind === "in" ? "Check-in" : "Check-out";
  if (inp.offline) {
    entry.result = "awaiting_sync"; entry.reason = "Captured on this device, awaiting verification";
    d.clocks.push(entry);
    openException(d, asgId, "offline", "Clock " + inp.kind + " captured offline at " + fmtTime(at), "Sync when signal returns; supervisor reviews if needed", "offline-" + entry.id);
    audit(d, w.name, "clock.offline", { type: "clock", id: entry.id, label: w.name }, word + " captured offline for " + w.name + " at " + fmtTime(at) + "; not verified, not payroll evidence", "operations", "simulated", "C");
    return ok("Saved on this device. Awaiting verification when you're back online.");
  }
  if (inp.method === "qr") {
    const valid = inp.token === qrFor(v.id, sh);
    if (!valid) {
      entry.result = "rejected"; entry.reason = /v0$/.test(inp.token || "") ? "QR token expired" : "QR token is for a different venue or shift";
      d.clocks.push(entry);
      openException(d, asgId, "bad_token", entry.reason, "Scan the current shift code or ask the supervisor", "tok-" + entry.id);
      audit(d, w.name, "clock.rejected", { type: "clock", id: entry.id, label: w.name }, word + " rejected for " + w.name + ": " + entry.reason, "operations", "rejected", "C");
      return no(entry.reason + ". Not clocked " + inp.kind + ".");
    }
    entry.reason = "Valid shift QR (a shared code does not prove presence on its own)";
  } else if (inp.method === "gps") {
    if (inp.denied) {
      entry.result = "review"; entry.reason = "Location permission denied";
      d.clocks.push(entry);
      openException(d, asgId, "denied", "Location permission denied at " + fmtTime(at), "Supervisor confirms presence or worker scans QR", "den-" + entry.id);
      audit(d, w.name, "clock.review", { type: "clock", id: entry.id, label: w.name }, word + " for " + w.name + " sent to supervisor review: location permission denied", "operations", "rejected", "C");
      return no("Location unavailable. Sent to your supervisor for review; you are not clocked " + inp.kind + " yet.");
    }
    const dist = inp.distanceM ?? 0, acc = inp.accuracyM ?? 10;
    if (acc > d.rules.maxAccuracyM) {
      entry.result = "review"; entry.reason = "Location accuracy " + acc + " m is worse than the " + d.rules.maxAccuracyM + " m limit";
      d.clocks.push(entry);
      openException(d, asgId, "poor_accuracy", entry.reason, "Supervisor confirms presence", "acc-" + entry.id);
      audit(d, w.name, "clock.review", { type: "clock", id: entry.id, label: w.name }, word + " for " + w.name + " sent to review: " + entry.reason, "operations", "rejected", "C");
      return no("Location too imprecise (" + acc + " m). Sent to supervisor review.");
    }
    if (dist > v.geofenceM) {
      entry.result = "rejected"; entry.reason = dist + " m from " + v.name + "; limit " + v.geofenceM + " m (sample radius)";
      d.clocks.push(entry);
      openException(d, asgId, "outside", "Attempt " + dist + " m from venue at " + fmtTime(at), "Move closer to the meeting point and try again", "out-" + entry.id);
      audit(d, w.name, "clock.rejected", { type: "clock", id: entry.id, label: w.name }, "Rejected " + word.toLowerCase() + " for " + w.name + ": " + dist + " m outside the " + v.geofenceM + " m sample radius", "operations", "rejected", "C");
      return no("You're " + dist + " m away. Clock-" + inp.kind + " needs you within " + v.geofenceM + " m.");
    }
    entry.reason = dist + " m from venue, accuracy " + acc + " m";
  } else {
    entry.reason = "Recorded by " + (inp.actor || me(d));
  }
  d.clocks.push(entry);
  if (inp.kind === "in") resolveExceptions(d, asgId, ["missing_in", "outside", "poor_accuracy", "denied", "bad_token"], "Verified check-in at " + fmtTime(at) + (inp.distanceM !== undefined ? " (" + inp.distanceM + " m)" : ""));
  else resolveExceptions(d, asgId, ["missing_out", "outside", "poor_accuracy", "denied", "bad_token"], "Verified check-out at " + fmtTime(at));
  const late = inp.kind === "in" && ms(at) > ms(sh.start) ? " (" + minutesBetween(sh.start, at) + " min after start)" : "";
  audit(d, inp.actor || w.name, "clock." + inp.kind, { type: "clock", id: entry.id, label: w.name }, "Verified " + word.toLowerCase() + " for " + w.name + " at " + fmtTime(at) + late + "; " + entry.reason, "operations", "ok", a.workerId === "W021" ? "C" : undefined);
  reconcileTasks(d);
  return ok("Clocked " + inp.kind + " at " + fmtTime(at) + ".");
}
export function syncOffline(d: OssState, asgId: string, distanceM = 30, accuracyM = 15): Result {
  const pending = d.clocks.filter((c) => c.assignmentId === asgId && c.result === "awaiting_sync");
  if (!pending.length) return ok("Nothing waiting to sync.");
  const a = asgOf(d, asgId); const v = venueOf(d, eventOf(d, shiftOf(d, a.shiftId).eventId).venueId)!;
  for (const c of pending) {
    if (d.clocks.some((x) => x !== c && x.eventKey === c.eventKey && x.syncedAt)) continue;
    c.syncedAt = d.clock; c.distanceM = distanceM; c.accuracyM = accuracyM;
    if (distanceM <= v.geofenceM && accuracyM <= d.rules.maxAccuracyM) { c.result = "review"; c.reason = "Synced " + fmtTime(d.clock) + "; location within radius, captured offline so supervisor confirms"; }
    else { c.result = "review"; c.reason = "Synced; outside radius or imprecise"; }
  }
  resolveExceptions(d, asgId, ["offline"], "Synced once at " + fmtTime(d.clock));
  openException(d, asgId, "offline", "Offline capture synced; needs supervisor confirmation", "Supervisor confirms or rejects", "sync-review-" + asgId);
  audit(d, nameOf(d, a.workerId), "clock.synced", { type: "assignment", id: asgId, label: nameOf(d, a.workerId) }, "Offline capture synced once (stable event ID); awaiting supervisor confirmation", "operations", "simulated", "C");
  return ok("Synced once. Awaiting supervisor confirmation.");
}
export function reviewClock(d: OssState, clockId: string, accept: boolean, reason: string): Result {
  if (!can(d, "supervise") && !can(d, "manage")) return deny(d, "supervise", "review a clock record");
  const c = d.clocks.find((x) => x.id === clockId);
  if (!c || c.result !== "review") return no("Only a record in review can be decided.");
  if (!reason.trim()) return no("Give a reason.");
  c.result = accept ? "verified" : "rejected";
  c.reason += "; " + (accept ? "confirmed" : "rejected") + " by " + me(d) + ": " + reason.trim();
  if (accept) resolveExceptions(d, c.assignmentId, c.kind === "in" ? ["missing_in", "outside", "poor_accuracy", "denied", "offline", "bad_token"] : ["missing_out", "offline", "poor_accuracy", "denied"], "Confirmed by " + me(d));
  audit(d, me(d), "clock.reviewed", { type: "clock", id: c.id, label: nameOf(d, asgOf(d, c.assignmentId).workerId) }, me(d) + " " + (accept ? "confirmed" : "rejected") + " a " + c.method + " clock-" + c.kind + " (" + reason.trim() + "); original record kept", "approvals", accept ? "ok" : "rejected", "C");
  return ok(accept ? "Confirmed. Original capture kept." : "Rejected. Original capture kept.");
}
export function resolveException(d: OssState, excId: string, resolution: string): Result {
  if (!can(d, "supervise") && !can(d, "manage")) return deny(d, "supervise", "resolve an exception");
  const e = d.exceptions.find((x) => x.id === excId);
  if (!e || e.status !== "open") return no("Already resolved.");
  if ((e.type === "missing_out" || e.type === "missing_in") && !lineFor(d, asgOf(d, e.assignmentId))?.complete) return no("A missing clock needs an approved correction, not a note.");
  e.status = "resolved"; e.resolvedAt = d.clock; e.resolution = resolution + " (" + me(d) + ")";
  audit(d, me(d), "exception.resolved", { type: "exception", id: e.id, label: nameOf(d, asgOf(d, e.assignmentId).workerId) }, "Resolved " + e.type.replace("_", " ") + ": " + resolution, "operations");
  return ok("Resolved.");
}

/* ── corrections and approvals ───────────────────────────────────────────── */
export function proposeCorrection(d: OssState, asgId: string, field: "in" | "out", hm: string, reason: string, note = ""): Result {
  if (!can(d, "supervise") && !can(d, "edit_hours") && !can(d, "manage")) return deny(d, "supervise", "propose a correction");
  if (!reason.trim()) return no("A reason is required.");
  const a = asgOf(d, asgId), sh = shiftOf(d, a.shiftId);
  if (d.corrections.some((c) => c.assignmentId === asgId && c.field === field && c.status === "proposed")) return no("A correction is already waiting for approval.");
  let at = zoned(dayKey(sh.start), hm);
  if (field === "out" && ms(at) <= ms(sh.start)) at = addMin(at, 24 * 60);
  const original = field === "out" ? verifiedOut(d, asgId)?.at || null : verifiedIn(d, asgId)?.at || null;
  const c = { id: nid(d, "COR"), assignmentId: asgId, field, original, proposed: at, reason: reason.trim(), note, requestedBy: d.ui.personaId, requestedAt: d.clock, status: "proposed" as const };
  d.corrections.push(c);
  audit(d, me(d), "correction.proposed", { type: "correction", id: c.id, label: nameOf(d, a.workerId) }, me(d) + " proposed clock-" + field + " " + fmtTime(at) + " for " + nameOf(d, a.workerId) + " (" + reason.trim() + "); routed for approval", "approvals", "ok", "E", original ? fmtTime(original) : "missing", fmtTime(at));
  return ok("Proposed. It needs approval by someone else before it changes hours.");
}
export function decideCorrection(d: OssState, id: string, approve: boolean): Result {
  if (!can(d, "approve_hours")) return deny(d, "approve_hours", "approve a correction");
  const c = d.corrections.find((x) => x.id === id);
  if (!c || c.status !== "proposed") return no("Nothing to decide.");
  if (c.requestedBy === d.ui.personaId) return no("You proposed this correction, so someone else must approve it.");
  c.status = approve ? "approved" : "rejected"; c.decidedBy = d.ui.personaId; c.decidedAt = d.clock;
  const a = asgOf(d, c.assignmentId);
  if (approve) resolveExceptions(d, c.assignmentId, c.field === "out" ? ["missing_out"] : ["missing_in"], "Correction " + c.id + " approved by " + me(d));
  // A correction after export reopens the line as a new version.
  const l = lineFor(d, a);
  audit(d, me(d), "correction." + (approve ? "approved" : "rejected"), { type: "correction", id: c.id, label: nameOf(d, a.workerId) },
    me(d) + " " + (approve ? "approved" : "rejected") + " clock-" + c.field + " " + fmtTime(c.proposed) + " for " + nameOf(d, a.workerId) + (approve && l ? "; payable " + fmtHM(l.payableMin) + ", version " + l.version : ""), "approvals", approve ? "ok" : "rejected", "E", c.original ? fmtTime(c.original) : "missing", fmtTime(c.proposed));
  reconcileTasks(d);
  return ok(approve ? "Approved. Original clock record kept; line is now version " + (l?.version || 1) + "." : "Rejected.");
}
export function approveLines(d: OssState, asgIds: string[]): Result {
  if (!can(d, "approve_hours")) return deny(d, "approve_hours", "approve hours");
  let n = 0, mins = 0; const skipped: string[] = [];
  for (const id of asgIds) {
    const l = lineFor(d, asgOf(d, id));
    if (!l) continue;
    if (l.status !== "ready") { if (l.status !== "approved" && l.status !== "exported") skipped.push(l.worker.name + " (" + l.status.replace("_", " ") + ")"); continue; }
    d.approvals.push({ id: nid(d, "APR"), assignmentId: id, version: l.version, approvedBy: d.ui.personaId, approvedAt: d.clock, status: "approved" });
    n++; mins += l.payableMin;
  }
  if (!n) return no(skipped.length ? "Nothing approvable. Blocked: " + skipped.join(", ") : "Nothing waiting for approval.");
  audit(d, me(d), "hours.approved", { type: "timesheet", id: asgIds[0], label: n + " lines" }, me(d) + " approved " + n + " timesheet lines, " + fmtHM(mins) + " payable" + (skipped.length ? "; not included: " + skipped.join(", ") : ""), "approvals", "ok", "E");
  return ok("Approved " + n + " lines (" + fmtHM(mins) + " payable)." + (skipped.length ? " Not included: " + skipped.join(", ") + "." : ""));
}
export function reopenLine(d: OssState, asgId: string, reason: string): Result {
  if (!can(d, "approve_hours")) return deny(d, "approve_hours", "reopen hours");
  if (!reason.trim()) return no("A reason is required.");
  const l = lineFor(d, asgOf(d, asgId));
  if (!l || (l.status !== "approved" && l.status !== "exported")) return no("Only approved lines can be reopened.");
  d.approvals.push({ id: nid(d, "APR"), assignmentId: asgId, version: l.version, approvedBy: d.ui.personaId, approvedAt: d.clock, status: "reopened", reopenReason: reason });
  audit(d, me(d), "hours.reopened", { type: "timesheet", id: l.id, label: l.worker.name }, me(d) + " reopened " + l.worker.name + "'s line as version " + (l.version + 1) + " (" + reason + "); the sent receipt is unchanged", "approvals", "ok", "E");
  return ok("Reopened as version " + (l.version + 1) + ". The earlier handover receipt stays in history.");
}

/* ── Bullhorn handover (simulated) ───────────────────────────────────────── */
export function createBatch(d: OssState, asgIds: string[], label: string, scope: string): Result {
  if (!can(d, "handover")) return deny(d, "handover", "create a handover batch");
  const ready = asgIds.map((id) => lineFor(d, asgOf(d, id))).filter((l) => l && l.status === "approved" && !l.item) as NonNullable<ReturnType<typeof lineFor>>[];
  if (!ready.length) return no("No approved lines waiting for handover.");
  const dk = ready[0].workDate.slice(5).replace("-", "");
  let n = 1; while (d.batches.some((b) => b.id === "BH-" + dk + "-" + String(n).padStart(2, "0"))) n++;
  const id = "BH-" + dk + "-" + String(n).padStart(2, "0");
  d.batches.push({ id, label, createdAt: d.clock, createdBy: d.ui.personaId, scope });
  for (const l of ready) {
    const key = l.asg.id + ":" + l.workDate + ":v" + l.version;
    const m = d.mappings.find((x) => x.entityType === "worker" && x.localId === l.worker.id);
    const item: HandoverItem = {
      id: nid(d, "HO"), batchId: id, assignmentId: l.asg.id, version: l.version, transferKey: key, state: "queued", attempts: [],
      snapshot: { timesheetId: l.id, version: l.version, workerId: l.worker.id, candidateId: m?.remoteId || null, clientId: l.event.clientId, clientRemoteId: CLIENT_REMOTE[l.event.clientId] || null,
        eventId: l.event.id, shiftId: l.shift.id, workDate: l.workDate, scheduledStart: l.shift.start, scheduledEnd: l.shift.end, approvedStart: l.approvedStart!, approvedEnd: l.approvedEnd!,
        workedMin: l.workedMin, breakMin: l.breakMin, topupMin: l.topupMin, payableMin: l.payableMin, extraMin: l.extraMin, approvedBy: l.approval!.by, approvedAt: l.approval!.at,
        correction: l.correctionNote, transferKey: key }
    };
    d.items.push(item);
  }
  audit(d, me(d), "handover.batch_created", { type: "batch", id, label: id }, "Created simulated batch " + id + " with " + ready.length + " approved lines, " + fmtHM(ready.reduce((t, l) => t + l.payableMin, 0)) + " payable", "systems", "simulated", "F");
  return ok("Batch " + id + " queued with " + ready.length + " lines.", { id });
}
function attempt(d: OssState, item: HandoverItem): string {
  if (item.state === "accepted") { item.attempts.push({ at: d.clock, result: "already accepted; existing receipt " + item.receipt + " returned" }); return "kept"; }
  const m = d.mappings.find((x) => x.entityType === "worker" && x.localId === item.snapshot.workerId);
  const cm = CLIENT_REMOTE[item.snapshot.clientId];
  if (!m || m.status !== "mapped") { item.state = "blocked"; item.error = "Worker mapping missing: no Bullhorn candidate ID for " + item.snapshot.workerId; item.attempts.push({ at: d.clock, result: "blocked: mapping missing" }); return "blocked"; }
  if (!cm) { item.state = "blocked"; item.error = "Client mapping missing"; item.attempts.push({ at: d.clock, result: "blocked: client mapping missing" }); return "blocked"; }
  item.snapshot.candidateId = m.remoteId;
  const already = d.items.find((x) => x !== item && x.transferKey === item.transferKey && x.state === "accepted");
  if (already) { item.state = "accepted"; item.receipt = already.receipt; item.attempts.push({ at: d.clock, result: "duplicate transfer key; existing receipt returned" }); return "kept"; }
  const n = d.items.filter((x) => x.batchId === item.batchId && x.receipt).length + 1;
  item.state = "accepted"; item.error = undefined; item.receipt = "SIM-RCPT-" + item.batchId.slice(3, 7) + "-" + String(n).padStart(2, "0") + (item.batchId.endsWith("01") ? "" : item.batchId.slice(-2));
  item.attempts.push({ at: d.clock, result: "accepted (simulated)" });
  return "accepted";
}
export function sendBatch(d: OssState, batchId: string): Result {
  if (!can(d, "handover")) return deny(d, "handover", "send a handover batch");
  const items = d.items.filter((i) => i.batchId === batchId && i.state === "queued");
  if (!items.length) return no("Nothing queued in this batch.");
  items.forEach((i) => attempt(d, i));
  const s = batchSummary(d, batchId);
  audit(d, "Bullhorn adapter (simulated)", "handover.sent", { type: "batch", id: batchId, label: batchId }, "Demo handover " + batchId + ": " + s.accepted + " accepted (" + fmtHM(s.acceptedMin) + ")" + (s.blocked ? ", " + s.blocked + " blocked (" + fmtHM(s.blockedMin) + ")" : ""), "systems", "simulated", "F");
  return ok(s.accepted + " accepted, " + s.blocked + " blocked. Simulated receipts; nothing was paid or invoiced.");
}
export function retryItems(d: OssState, itemIds: string[]): Result {
  if (!can(d, "handover")) return deny(d, "handover", "retry a handover row");
  const res: string[] = [];
  for (const id of itemIds) {
    const it = d.items.find((x) => x.id === id); if (!it) continue;
    const r = attempt(d, it);
    res.push(r);
    audit(d, "Bullhorn adapter (simulated)", "handover.retry", { type: "item", id: it.id, label: nameOf(d, it.snapshot.workerId) + ", " + it.snapshot.workDate },
      r === "kept" ? "Retry on accepted row " + it.transferKey + " returned existing receipt " + it.receipt + "; nothing resent" : r === "accepted" ? "Retried " + nameOf(d, it.snapshot.workerId) + "'s row: accepted, receipt " + it.receipt : "Retried " + nameOf(d, it.snapshot.workerId) + "'s row: still blocked, " + it.error,
      "systems", r === "blocked" ? "rejected" : "simulated", "F");
  }
  const acc = res.filter((r) => r === "accepted").length, kept = res.filter((r) => r === "kept").length, bl = res.filter((r) => r === "blocked").length;
  return acc || kept ? ok((acc ? acc + " accepted. " : "") + (kept ? kept + " already accepted; existing receipts returned. " : "") + (bl ? bl + " still blocked." : "")) : no(bl + " still blocked. Resolve the mapping first.");
}
export function resolveMapping(d: OssState, workerId: string, remoteId: string): Result {
  if (!can(d, "handover")) return deny(d, "handover", "confirm a mapping");
  const m = d.mappings.find((x) => x.entityType === "worker" && x.localId === workerId);
  if (!m) return no("No mapping record");
  if (!/^BH-CAND-\d+$/.test(remoteId)) return no("That doesn't look like a candidate reference.");
  const before = m.remoteId;
  m.remoteId = remoteId; m.status = "mapped"; m.confirmedBy = d.ui.personaId; m.confirmedAt = d.clock; m.note = "Matched by " + me(d) + " on email and mobile; confirmed by a person";
  audit(d, me(d), "mapping.confirmed", { type: "worker", id: workerId, label: nameOf(d, workerId) }, me(d) + " confirmed Bullhorn candidate " + remoteId + " for " + nameOf(d, workerId) + " (no Bullhorn master data overwritten)", "systems", "ok", "F", before || "none", remoteId);
  reconcileTasks(d);
  return ok("Mapping confirmed. Retry the blocked row to send it.");
}

/* ── automations (run on scenario-time advance, deduplicated) ────────────── */
export function runAutomations(d: OssState, from: string, to: string) {
  const on = (id: string) => d.automations.find((a) => a.id === id)?.on;
  const once = (autoId: string, key: string, summary: string, targets: number) => {
    if (d.autoRuns.some((r) => r.key === key)) return false;
    d.autoRuns.push({ id: nid(d, "AR"), automationId: autoId, at: d.clock, key, summary, targets });
    return true;
  };
  const inWin = (t: number) => t > ms(from) && t <= ms(to);
  for (const a of d.assignments) {
    if (a.status !== "confirmed") continue;
    const sh = shiftOf(d, a.shiftId);
    const ev = eventOf(d, sh.eventId);
    if (ev.historical) continue;
    const w = worker(d, a.workerId);
    if (on("AU2") && inWin(ms(sh.start) - d.rules.dayBeforeH * 3600000) && once("AU2", "AU2:" + a.id + ":v" + sh.version, "Reconfirmation to " + w.name, 1))
      postMessage(d, { threadId: threadFor(d, w.id).id, kind: "reminder", recipients: [w.id], from: { kind: "system", id: "AU2" }, body: "Please reconfirm your " + fmtTime(sh.start) + " shift tomorrow. Let OSS know if your plans have changed." });
    if (on("AU3") && inWin(ms(sh.start) - d.rules.arrivalPromptH * 3600000) && once("AU3", "AU3:" + a.id + ":v" + sh.version, "Arrival prompt to " + w.name, 1))
      postMessage(d, { threadId: threadFor(d, w.id).id, kind: "reminder", recipients: [w.id], from: { kind: "system", id: "AU3" }, body: "Your shift starts in two hours. Tell us whether you are on the way or running late." });
    if (on("AU4") && inWin(ms(sh.start) + d.rules.missedClockMin * 60000) && !verifiedIn(d, a.id) && once("AU4", "AU4:" + a.id, "Missed clock-in: " + w.name, 1)) {
      openException(d, a.id, "missing_in", "No verified clock-in " + d.rules.missedClockMin + " min after start", "Contact worker; supervisor checks arrival", "AU4:" + a.id);
      audit(d, "Automation", "alert.missed_clock_in", { type: "assignment", id: a.id, label: w.name }, "Missed clock-in alert: " + w.name + ", " + shiftLabel(d, sh), "systems", "simulated", a.workerId === "W021" ? "C" : undefined);
    }
    if (on("AU5") && inWin(ms(sh.end) + d.rules.missedClockMin * 60000) && verifiedIn(d, a.id) && !verifiedOut(d, a.id) && once("AU5", "AU5:" + a.id, "Missed clock-out: " + w.name, 1)) {
      openException(d, a.id, "missing_out", "No clock-out " + d.rules.missedClockMin + " min after scheduled end", "Supervisor proposes a correction", "AU5:" + a.id);
      postMessage(d, { threadId: threadFor(d, w.id).id, kind: "reminder", recipients: [w.id], from: { kind: "system", id: "AU5" }, body: "Your clock-out is missing. Please contact OSS so your hours can be reviewed." });
      audit(d, "Automation", "alert.missed_clock_out", { type: "assignment", id: a.id, label: w.name }, "Missed clock-out alert: " + w.name + ", " + shiftLabel(d, sh), "systems", "simulated", a.workerId === "W025" ? "E" : undefined);
    }
  }
  if (on("AU6") && dayKey(from) !== dayKey(to)) {
    for (const doc of expiringDocs(d, d.rules.renewalWarnDays)) {
      if (once("AU6", "AU6:" + doc.id, "Expiry warning: " + nameOf(d, doc.workerId), 1))
        postMessage(d, { threadId: threadFor(d, doc.workerId).id, kind: "reminder", recipients: [doc.workerId], from: { kind: "system", id: "AU6" }, body: "Your " + docLabel(doc.type) + " expires on " + fmtDayMonth(zoned(doc.expires, "12:00")) + ". Please upload a renewal." });
    }
  }
}
export function setClock(d: OssState, iso: string): Result {
  if (ms(iso) < ms(d.clock)) return no("Scenario time only moves forward. Load a stage to go back.");
  const from = d.clock;
  d.clock = iso;
  runAutomations(d, from, iso);
  reconcileTasks(d);
  return ok("Scenario time " + fmtDate(iso) + " " + fmtTime(iso));
}

/* ── presenter simulations (explicit buttons, labelled as simulated) ─────── */
export function simulateClockIns(d: OssState, shiftId: string): Result {
  const sh = shiftOf(d, shiftId);
  if (ms(d.clock) < ms(sh.start)) setClock(d, sh.start);
  let n = 0;
  for (const a of d.assignments.filter((x) => x.shiftId === shiftId && x.status === "confirmed")) {
    if (verifiedIn(d, a.id)) continue;
    const j = d.journeys.filter((x) => x.assignmentId === a.id).pop();
    if (j && (j.status === "running_late" || j.status === "issue")) continue;
    const k = Number(a.workerId.slice(1));
    clock(d, a.id, { kind: "in", method: "gps", distanceM: 12 + (k * 7) % 34, accuracyM: 8 + (k % 9), at: sh.start, actor: worker(d, a.workerId).name });
    n++;
  }
  audit(d, "Presenter", "demo.simulated", { type: "shift", id: shiftId, label: shiftLabel(d, sh) }, "Simulated " + n + " on-time GPS check-ins at " + fmtTime(sh.start) + " (presenter control)", "systems", "simulated");
  return ok("Simulated " + n + " on-time check-ins. Anyone who reported running late was left out.");
}
/** Fixture end-of-shift: Ciara leaves at 12:00, Brian at 00:00, Niamh's checkout is missing. */
export const FIXTURE_OUT: Record<string, number | null> = { W003: -60, W012: 60, W025: null };
export function simulateClockOuts(d: OssState, shiftId: string): Result {
  const sh = shiftOf(d, shiftId);
  const list = d.assignments.filter((x) => x.shiftId === shiftId && x.status === "confirmed" && verifiedIn(d, x.id) && !verifiedOut(d, x.id));
  const early = list.filter((a) => typeof FIXTURE_OUT[a.workerId] === "number" && (FIXTURE_OUT[a.workerId] as number) < 0);
  const late = list.filter((a) => typeof FIXTURE_OUT[a.workerId] === "number" && (FIXTURE_OUT[a.workerId] as number) > 0);
  const normal = list.filter((a) => !(a.workerId in FIXTURE_OUT));
  const out = (a: typeof list[0], off: number) => { const at = addMin(sh.end, off); if (ms(d.clock) < ms(at)) setClock(d, at); const k = Number(a.workerId.slice(1)); clock(d, a.id, { kind: "out", method: "gps", distanceM: 15 + (k * 5) % 30, accuracyM: 9 + (k % 7), at, actor: worker(d, a.workerId).name }); };
  for (const a of early) out(a, FIXTURE_OUT[a.workerId] as number);
  for (const a of normal) out(a, 0);
  if (late.length) {
    setClock(d, addMin(sh.end, d.rules.missedClockMin));
    for (const a of late) out(a, FIXTURE_OUT[a.workerId] as number);
  } else setClock(d, addMin(sh.end, d.rules.missedClockMin));
  audit(d, "Presenter", "demo.simulated", { type: "shift", id: shiftId, label: shiftLabel(d, sh) }, "Simulated end-of-shift check-outs from the sample fixture (" + (early.length + normal.length + late.length) + " recorded" + (list.some((a) => FIXTURE_OUT[a.workerId] === null) ? "; one checkout deliberately missing" : "") + ")", "systems", "simulated");
  return ok("Recorded " + (early.length + normal.length + late.length) + " check-outs from the fixture.");
}

/* ── agents ──────────────────────────────────────────────────────────────── */
export const AGENTS = [
  { id: "briefing", name: "Briefing", job: "Summarises the day and links each point to its record.", inputs: "Bookings, coverage, handover batches, documents", scope: "Read only", shape: "crown-pebble", tint: "#1b2430" },
  { id: "watchdog", name: "Ops Watchdog", job: "Spots cancellations, unanswered invitations, late arrivals and missed clocks; opens or updates tasks without duplicates.", inputs: "Invitations, assignments, journey and clock records", scope: "Creates tasks; never changes rosters", shape: "glass-visor", tint: "#2a2118" },
  { id: "staffing", name: "Staffing Assistant", job: "Shortlists eligible workers with reasons and prepares an invite selection for a coordinator to approve.", inputs: "Availability, documents, conflicts, history", scope: "Proposes only; a coordinator sends", shape: "executive-capsule", tint: "#16241f" },
  { id: "eligibility", name: "Eligibility Assistant", job: "Checks required evidence against each shift date and flags unreviewed documents. Never judges authenticity or approves.", inputs: "Documents, shift requirements", scope: "Flags and drafts reminders", shape: "shield", tint: "#241b2e" },
  { id: "comms", name: "Crew Communications", job: "Drafts targeted reminders and PPE updates with the exact recipient list.", inputs: "Rosters, message templates", scope: "Drafts; a person sends", shape: "rim-capsule", tint: "#191c1f" },
  { id: "timesheet", name: "Timesheet Assistant", job: "Finds incomplete clocks, minimum-hour top-ups and time past scheduled finish; proposes corrections for review.", inputs: "Clock records, corrections, rules", scope: "Proposes; a manager approves", shape: "control-cube", tint: "#2a2118" },
  { id: "handover", name: "Bullhorn Handover Monitor", job: "Finds failed rows and missing mappings and prepares a safe retry. A successful transfer is not a payment.", inputs: "Handover batches, mappings", scope: "Prepares retries; a person confirms mappings", shape: "precision-brow", tint: "#2b1b1e" }
];
export function runAgent(d: OssState, agentId: string): Result {
  if (d.agentsPaused[agentId]) return no("This agent is paused in AI controls.");
  const findings: string[] = []; const evidence: AgentRun["evidence"] = []; const proposalIds: string[] = [];
  const propose = (p: Omit<AgentProposal, "id" | "at" | "status" | "agentId">) => {
    if (d.proposals.some((x) => x.status === "pending" && x.agentId === agentId && x.title === p.title)) return;
    const id = nid(d, "PRP"); d.proposals.push({ id, at: d.clock, status: "pending", agentId, ...p }); proposalIds.push(id);
  };
  const hero = eventCoverage(d, "EVT-001"); const tot = windowTotals(d);
  if (agentId === "briefing") {
    findings.push("3Arena Saturday: " + hero.confirmed + " of " + hero.required + " confirmed, " + hero.awaiting + " awaiting reply.");
    findings.push("Next seven days: " + tot.confirmed + " of " + tot.required + " positions confirmed (" + tot.coverageLabel + "), " + tot.unfilled + " unfilled.");
    const bl = d.items.filter((i) => i.state === "blocked");
    if (bl.length) findings.push(bl.length + " Bullhorn line" + (bl.length > 1 ? "s" : "") + " blocked (" + fmtHM(bl.reduce((t, i) => t + i.snapshot.payableMin, 0)) + ").");
    else findings.push("No blocked Bullhorn lines.");
    evidence.push({ label: "3Arena coverage", page: "Staffing", tab: "allocation", focus: "EVT-001" }, { label: "Bullhorn handover", page: "Timesheets", tab: "handover" });
  }
  if (agentId === "watchdog") {
    const rq = replacementQueue(d).filter((r) => r.open);
    rq.forEach((r) => findings.push(r.worker.name + " cancelled " + r.shift.label.toLowerCase() + "; " + (r.pendingInv.length ? "replacement invitation out" : "no replacement invited yet") + "."));
    const awaiting = d.invitations.filter((i) => isActiveInvite(d, i));
    findings.push(awaiting.length + " invitation" + (awaiting.length === 1 ? "" : "s") + " awaiting reply.");
    const ex = openExceptions(d);
    if (ex.length) findings.push(ex.length + " open attendance exception" + (ex.length === 1 ? "" : "s") + ".");
    for (const e of ex.filter((x) => x.type === "missing_out" || x.type === "missing_in")) {
      if (!d.tasks.some((t) => t.kind === "attendance" && t.related?.id === e.id)) addTask(d, { title: "Resolve " + e.type.replace("_", " ") + ": " + nameOf(d, asgOf(d, e.assignmentId).workerId), ownerId: "U05", due: addMin(d.clock, 12 * 60), priority: "High", dept: "Events", related: { type: "exception", id: e.id, label: e.reason }, kind: "attendance", source: "Ops Watchdog" });
    }
    evidence.push({ label: "Replacements", page: "Staffing", tab: "replacements" }, { label: "Exceptions", page: "Live Operations", tab: "exceptions" });
  }
  if (agentId === "staffing") {
    const picked = new Set<string>();
    for (const sh of shiftsOfEvent(d, "EVT-001")) {
      const c = shiftCoverage(d, sh.id);
      const cand = candidates(d, sh.id).eligible.filter((x) => !picked.has(x.worker.id)).slice(0, Math.max(0, c.notInvited));
      cand.forEach((x) => picked.add(x.worker.id));
      findings.push(sh.label + ": " + c.notInvited + " not yet invited" + (cand.length ? "; shortlist " + cand.map((x) => x.worker.name).join(", ") : "") + ".");
      if (cand.length) propose({ title: "Invite " + cand.map((x) => x.worker.name).join(", ") + " to " + sh.label.toLowerCase(), detail: cand.map((x) => x.worker.name + ": " + x.elig.reasons.filter((r) => r.level === "ok").map((r) => r.label).join("; ")).join(" | "), action: { type: "invite", payload: { invites: cand.map((x) => [sh.id, x.worker.id]) } } });
    }
    evidence.push({ label: "Allocation", page: "Staffing", tab: "allocation", focus: "EVT-001" });
  }
  if (agentId === "eligibility") {
    for (const sh of shiftsOfEvent(d, "EVT-001")) for (const t of sh.requiredDocs) for (const w of ["W033", "W034", "W035"]) {
      const s = docState(d, w, t, sh.end);
      if (s.state !== "valid") findings.push(nameOf(d, w) + " (" + sh.label.toLowerCase() + "): " + s.label + ".");
    }
    const exp = expiringDocs(d).slice(0, 3);
    exp.forEach((x) => findings.push("Expiring: " + nameOf(d, x.workerId) + ", " + docLabel(x.type) + " on " + fmtDayMonth(zoned(x.expires, "12:00")) + "."));
    evidence.push({ label: "Documents", page: "Workforce", tab: "documents" });
  }
  if (agentId === "comms") {
    const roster = d.assignments.filter((a) => a.shiftId === "SH-001B" && a.status === "confirmed").map((a) => a.workerId);
    findings.push("Evening crew roster: " + roster.length + " confirmed recipients.");
    propose({ title: "PPE update to the confirmed 3Arena evening crew (" + roster.length + ")", detail: "Safety boots, hi-vis and gloves are required on Saturday evening. Gloves will not be supplied on site.", action: { type: "message", payload: { workerIds: roster, eventId: "EVT-001", body: "Saturday evening at 3Arena: safety boots, hi-vis and gloves are required. Gloves will not be supplied on site. Please acknowledge." } } });
    evidence.push({ label: "Communications", page: "Work", tab: "comms" });
  }
  if (agentId === "timesheet") {
    const ls = lines(d);
    const inc = ls.filter((l) => l.status === "incomplete");
    inc.forEach((l) => findings.push(l.worker.name + ": " + (l.rawIn ? "clock-out" : "clock-in") + " missing on " + fmtDate(l.shift.start) + "."));
    ls.filter((l) => l.topupMin).forEach((l) => findings.push(l.worker.name + ": worked " + fmtHM(l.workedMin) + "; minimum adds " + fmtHM(l.topupMin) + " payable."));
    ls.filter((l) => l.extraMin).forEach((l) => findings.push(l.worker.name + ": " + fmtHM(l.extraMin) + " past scheduled finish (review, no multiplier)."));
    if (!ls.length) findings.push("No timesheet lines yet in this scenario.");
    evidence.push({ label: "Timesheet review", page: "Timesheets", tab: "review" });
  }
  if (agentId === "handover") {
    const bl = d.items.filter((i) => i.state === "blocked");
    bl.forEach((i) => findings.push(i.batchId + ": " + nameOf(d, i.snapshot.workerId) + " blocked, " + (i.error || "") + "."));
    if (!bl.length) findings.push("No blocked rows. Accepted receipts are simulated and do not mean payment.");
    evidence.push({ label: "Bullhorn handover", page: "Timesheets", tab: "handover" });
  }
  const run: AgentRun = { id: nid(d, "RUN"), agentId, at: d.clock, trigger: "run_now", findings, evidence, proposalIds };
  d.agentRuns.push(run);
  audit(d, AGENTS.find((a) => a.id === agentId)!.name, "agent.run", { type: "agent", id: agentId, label: AGENTS.find((a) => a.id === agentId)!.name }, "Ran on request: " + findings.length + " findings" + (proposalIds.length ? ", " + proposalIds.length + " proposal" + (proposalIds.length > 1 ? "s" : "") + " for a person to decide" : ""), "systems", "simulated");
  return ok(findings.length + " findings" + (proposalIds.length ? "; " + proposalIds.length + " proposal waiting for you" : ""));
}
export function decideProposal(d: OssState, id: string, approve: boolean): Result {
  const p = d.proposals.find((x) => x.id === id);
  if (!p || p.status !== "pending") return no("Already decided.");
  let r: Result = ok("Dismissed");
  if (approve && p.action) {
    if (p.action.type === "invite") {
      if (!can(d, "allocate")) return deny(d, "allocate", "approve an invite proposal");
      const by: Record<string, string[]> = {};
      for (const [s, w] of p.action.payload.invites as [string, string][]) (by[s] = by[s] || []).push(w);
      const msgs: string[] = []; let any = false;
      for (const s of Object.keys(by)) { const x = sendInvitations(d, s, by[s]); msgs.push(x.message); any = any || x.ok; }
      r = any ? ok(msgs.join(" ")) : no(msgs.join(" "));
    } else if (p.action.type === "message") {
      r = sendBulk(d, { workerIds: p.action.payload.workerIds, body: p.action.payload.body, eventId: p.action.payload.eventId, audience: p.title });
    }
    if (!r.ok) return r;
  }
  p.status = approve ? "approved" : "dismissed"; p.decidedBy = d.ui.personaId; p.decidedAt = d.clock; p.result = r.message;
  audit(d, me(d), "agent.proposal_" + p.status, { type: "proposal", id: p.id, label: p.title }, me(d) + " " + p.status + " \"" + p.title + "\"", "approvals");
  return approve ? r : ok("Dismissed; kept in run history.");
}

/* ── settings ────────────────────────────────────────────────────────────── */
export function setRule(d: OssState, key: keyof Rules, value: number | boolean): Result {
  if (!can(d, "manage")) return deny(d, "manage", "change a rule");
  const before = String(d.rules[key]);
  (d.rules as any)[key] = value;
  audit(d, me(d), "rule.changed", { type: "rule", id: key, label: key }, me(d) + " changed " + key + " from " + before + " to " + value + " (demo rule; affects this workshop only)", "systems", "ok", undefined, before, String(value));
  return ok("Rule updated. Every derived number recalculates.");
}
export function setAutomation(d: OssState, id: string, on: boolean): Result {
  if (!can(d, "manage")) return deny(d, "manage", "change an automation");
  const a = d.automations.find((x) => x.id === id)!; a.on = on;
  audit(d, me(d), "automation." + (on ? "enabled" : "paused"), { type: "automation", id, label: a.name }, me(d) + (on ? " enabled " : " paused ") + a.name + " (local simulation)", "systems");
  return ok(on ? "Enabled" : "Paused");
}
export function setAgentPaused(d: OssState, id: string, paused: boolean): Result {
  if (!can(d, "manage")) return deny(d, "manage", "pause an agent");
  d.agentsPaused[id] = paused;
  audit(d, me(d), "agent." + (paused ? "paused" : "resumed"), { type: "agent", id, label: AGENTS.find((a) => a.id === id)!.name }, me(d) + (paused ? " paused " : " resumed ") + AGENTS.find((a) => a.id === id)!.name, "systems");
  return ok(paused ? "Paused" : "Resumed");
}
export function setDecision(d: OssState, id: string, status: any): Result {
  const x = d.decisions.find((z) => z.id === id)!; const before = x.status; x.status = status;
  audit(d, me(d), "decision.updated", { type: "decision", id, label: x.topic }, me(d) + " marked \"" + x.topic + "\" as " + status, "systems", "ok", undefined, before, status);
  return ok("Updated");
}
export function setProgrammeMonth(d: OssState, id: string, month: string, demand: number): Result {
  const p = d.programmes.find((x) => x.id === id)!; const m = p.months.find((x) => x.month === month)!;
  m.demand = Math.max(0, Math.round(demand));
  return ok("Scenario updated");
}
export { userOf };
