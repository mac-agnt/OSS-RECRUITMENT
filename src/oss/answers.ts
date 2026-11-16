/* Deterministic Home chat answers grounded in the store. No model call; an
   unsupported question gets an honest answer rather than an invented one. */

import type { OssState } from "./model";
import * as Q from "./selectors";
import { docLabel } from "./seed";
import { profile, stamp2Check, STAMP2_CAP_MIN } from "./industry";
import { fmtDate, fmtDayMonth, fmtHM, fmtTime, zoned } from "./time";

export interface Go { page: string; tab?: string; focus?: { kind: string; id: string } | null; drawer?: { kind: string; id: string } }
export interface Answer { text: string; tool: string; effect: "read" | "write"; cols?: string[]; rows?: string[][]; actions: { label: string; primary: boolean; go?: Go; ask?: string }[] }

export const SEEDED_QUESTIONS = [
  "What needs attention before Saturday?",
  "Who can cover the 3Arena evening shift?",
  "Which Stamp 2 students are close to 20 hours?",
  "Who hasn't answered their offer yet?",
  "Which hours haven't reached Bullhorn?",
  "Why is Eoin unavailable for this shift?"
];

export function briefing(s: OssState): string {
  const h = Q.eventCoverage(s, "EVT-001"), t = Q.windowTotals(s);
  const desks = new Set(t.events.map((e) => Q.deskOf(e))).size;
  const parts = [
    "Across " + desks + " desks this week, " + t.events.length + " events need " + t.required.toLocaleString("en-IE") + " positions and " + t.coverageLabel + " are confirmed.",
    "Saturday's 3Arena booking has " + h.confirmed + " of " + h.required + " positions confirmed." + (h.awaiting ? " " + words(h.awaiting) + " invitation" + (h.awaiting > 1 ? "s are" : " is") + " awaiting a reply." : ""),
    "Company-wide, " + t.unfilled + " position" + (t.unfilled === 1 ? "" : "s") + " remain" + (t.unfilled === 1 ? "s" : "") + " unfilled in the " + (Q.windowLabel(s).startsWith("Next") ? "next seven days" : "reporting window") + "."
  ];
  const blocked = s.items.filter((i) => i.state === "blocked");
  if (blocked.length) parts.push(blocked.map((i) => Q.nameOf(s, i.snapshot.workerId) + "'s " + words(i.snapshot.payableMin / 60).toLowerCase() + " approved hours are blocked by a missing Bullhorn mapping.").join(" "));
  const eo = Q.eligibility(s, "W033", "SH-001A");
  if (eo.status === "blocked" && Q.docState(s, "W033", "MH", Q.shiftOf(s, "SH-001A").end).state === "expired") parts.push("Eoin's certificate expires before Saturday, so he is excluded from that shift.");
  const rq = Q.replacementQueue(s).filter((r) => r.open);
  rq.forEach((r) => parts.push(r.worker.name + " cancelled " + r.shift.label.toLowerCase() + "; " + (r.pendingInv.length ? "a replacement invitation is out." : "no replacement invited yet.")));
  const inc = Q.lines(s).filter((l) => l.status === "incomplete");
  if (inc.length) parts.push(inc.map((l) => l.worker.name).join(", ") + (inc.length > 1 ? " have" : " has") + " a missing clock to correct before hours can be approved.");
  return parts.join(" ");
}
const W = ["no", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
function words(n: number) { return Number.isInteger(n) && n < W.length ? (n === 0 ? "No" : W[n]) : String(n); }

export function answer(q: string, s: OssState): Answer {
  const t = q.toLowerCase();
  if (/attention|before saturday|what matters|today|briefing|what changed/.test(t)) return attention(s);
  if (/stamp 2|student|20 hours|hours cap/.test(t)) return stamp2(s);
  if (/hasn't answered|not answered|no reply|waiting.*(reply|answer)|outstanding/.test(t)) return noReply(s);
  if (/cover|who can|replace|evening shift|available for/.test(t)) return cover(s);
  if (/eoin|why.*(unavailable|excluded|blocked)|eligib/.test(t)) return why(s, /tomas/.test(t) ? "W035" : /maeve/.test(t) ? "W034" : "W033");
  if (/bullhorn|handover|hours.*(reach|sent)|blocked hours|jamie/.test(t)) return handover(s);
  if (/niamh|correction|missing clock|timesheet|payable/.test(t)) return hours(s);
  if (/coverage|unfilled|positions|gap/.test(t)) return attention(s);
  return {
    tool: "pulse_search", effect: "read",
    text: "I answer from OSS Pulse records: bookings, rosters, availability, documents, attendance, hours and the Bullhorn handover. I don't have anything that answers that question, and I won't guess. Try one of the questions below, or search the records.",
    actions: [{ label: "What needs attention before Saturday?", primary: true, ask: "What needs attention before Saturday?" }, { label: "Search records", primary: false, go: { page: "Records", tab: "directory" } }]
  };
}

function attention(s: OssState): Answer {
  const rows: string[][] = [];
  const h = Q.eventCoverage(s, "EVT-001");
  if (h.unfilled) rows.push(["3Arena, Sat 14 Nov", "Coverage", h.confirmed + "/" + h.required, h.awaiting + " awaiting, " + h.notInvited + " not invited"]);
  Q.replacementQueue(s).filter((r) => r.open).forEach((r) => rows.push([r.worker.name, "Cancelled", r.shift.label, r.pendingInv.length ? "Replacement invited" : "Needs replacement"]));
  const eo = Q.docState(s, "W033", "MH", Q.shiftOf(s, "SH-001A").end);
  if (eo.state === "expired") rows.push(["Eoin Brennan", "Evidence", "Manual Handling", "Valid through 13 Nov only"]);
  if (s.documents.some((d) => d.workerId === "W035" && d.review === "pending")) rows.push(["Tomas Nowak", "Evidence", "Manual Handling", "Uploaded, not reviewed"]);
  const v = Q.venueOf(s, "V01")!;
  if (!v.meetingConfirmed) rows.push(["3Arena", "Venue", "Meeting point", "Awaiting confirmation"]);
  s.items.filter((i) => i.state === "blocked").forEach((i) => rows.push([Q.nameOf(s, i.snapshot.workerId), "Handover", fmtHM(i.snapshot.payableMin), "Mapping missing"]));
  const t = Q.windowTotals(s);
  return {
    tool: "pulse_briefing", effect: "read", text: briefing(s) + " Firm demand in the window is " + t.required + " positions with " + t.confirmed + " confirmed (" + t.coverageLabel + ").",
    cols: ["Item", "Area", "Detail", "State"], rows,
    actions: [{ label: "Open 3Arena staffing", primary: true, go: { page: "Staffing", tab: "allocation", focus: { kind: "event", id: "EVT-001" } } }, { label: "Bullhorn handover", primary: false, go: { page: "Timesheets", tab: "handover" } }]
  };
}

function cover(s: OssState): Answer {
  const sh = Q.shiftOf(s, "SH-001B");
  const c = Q.candidates(s, sh.id);
  const cov = Q.shiftCoverage(s, sh.id);
  const top = c.eligible.slice(0, 5);
  return {
    tool: "staffing_shortlist", effect: "read",
    text: "Evening crew is at " + cov.confirmed + "/" + cov.required + " with " + cov.awaiting + " awaiting reply and " + cov.notInvited + " not yet invited. " + (top.length ? top.length + " people are available and eligible now; the best fits have worked at 3Arena before." : "Nobody else is both available and eligible right now.")
      + " " + c.unknown.length + " more have no availability recorded for Saturday evening. I can't invite anyone for you; a coordinator sends invitations from Allocation.",
    cols: ["Worker", "Availability", "Manual Handling", "History"],
    rows: top.map((x) => [x.worker.name, x.elig.reasons.find((r) => r.code === "avail")?.label || "", x.elig.reasons.find((r) => r.code === "doc")?.label.replace("Manual Handling ", "") || "", x.venueHistory ? "3Arena before" : x.worker.priorShifts + " shifts"]),
    actions: [{ label: "Open evening allocation", primary: true, go: { page: "Staffing", tab: "allocation", focus: { kind: "shift", id: "SH-001B" } } }, { label: "Standby list", primary: false, go: { page: "Staffing", tab: "standby" } }]
  };
}

function why(s: OssState, wid: string): Answer {
  const w = Q.worker(s, wid);
  const rows = ["SH-001A", "SH-001B"].map((sid) => { const e = Q.eligibility(s, wid, sid); return [Q.shiftOf(s, sid).label, e.status, e.reasons.filter((r) => r.level !== "ok").map((r) => r.label).join("; ") || "All checks pass", ""]; });
  const d = Q.docState(s, wid, "MH", Q.shiftOf(s, "SH-001A").end);
  const text = wid === "W033"
    ? w.name + " is excluded from both Saturday 3Arena shifts. The shifts require approved Manual Handling evidence valid through the end of the shift; his certificate is valid through " + (d.doc ? fmtDayMonth(zoned(d.doc.expires, "12:00")) : "an earlier date") + " only, one day before. Availability isn't the issue. Once a renewal is uploaded and approved by compliance, he becomes eligible."
    : w.name + ": " + rows.map((r) => r[0] + ", " + r[2]).join(". ") + ".";
  return { tool: "eligibility_check", effect: "read", text, cols: ["Shift", "Status", "Reasons", ""], rows,
    actions: [{ label: "Open " + w.name.split(" ")[0] + "'s profile", primary: true, go: { page: "Workforce", tab: "documents", drawer: { kind: "worker", id: wid } } }, { label: "Documents queue", primary: false, go: { page: "Workforce", tab: "documents" } }] };
}

function handover(s: OssState): Answer {
  const blocked = s.items.filter((i) => i.state === "blocked");
  const waiting = Q.lines(s).filter((l) => l.status === "approved" && !l.item);
  const notApproved = Q.lines(s).filter((l) => ["ready", "needs_review", "incomplete"].includes(l.status));
  const rows: string[][] = blocked.map((i) => [Q.nameOf(s, i.snapshot.workerId), i.batchId, fmtHM(i.snapshot.payableMin), "Blocked: mapping missing"]);
  waiting.forEach((l) => rows.push([l.worker.name, "Not batched", fmtHM(l.payableMin), "Approved, waiting to send"]));
  const text = (blocked.length ? blocked.length + " approved line" + (blocked.length > 1 ? "s are" : " is") + " blocked: " + blocked.map((i) => Q.nameOf(s, i.snapshot.workerId) + " (" + fmtHM(i.snapshot.payableMin) + ", " + i.batchId + ")").join(", ") + ". The worker has no Bullhorn candidate mapping, so the simulated adapter held the row back rather than sending it wrongly. " : "No approved lines are blocked. ")
    + (waiting.length ? waiting.length + " approved lines are waiting to be batched. " : "")
    + (notApproved.length ? notApproved.length + " lines are not approved yet, so they can't be sent. " : "")
    + "Accepted receipts are simulated and do not mean anyone has been paid.";
  return { tool: "handover_status", effect: "read", text, cols: ["Worker", "Batch", "Payable", "State"], rows,
    actions: [{ label: "Open Bullhorn handover", primary: true, go: { page: "Timesheets", tab: "handover" } }].concat(blocked[0] ? [{ label: "Resolve " + Q.nameOf(s, blocked[0].snapshot.workerId).split(" ")[0] + "'s mapping", primary: false, go: { page: "Timesheets", tab: "handover", drawer: { kind: "mapping", id: blocked[0].snapshot.workerId } } } as any] : []) };
}

function hours(s: OssState): Answer {
  const ls = Q.lines(s, { eventId: "EVT-001" });
  if (!ls.length) return { tool: "timesheet_status", effect: "read", text: "No 3Arena hours exist yet in this scenario: the shifts are on " + fmtDate(Q.shiftOf(s, "SH-001A").start) + ". Load the Hours review stage from Demo controls to see them.", actions: [{ label: "Timesheets", primary: true, go: { page: "Timesheets", tab: "review" } }] };
  const t = Q.totals(ls);
  const inc = ls.filter((l) => l.status === "incomplete");
  return {
    tool: "timesheet_status", effect: "read",
    text: "3Arena has " + ls.length + " lines. Worked " + fmtHM(t.worked) + (t.incomplete ? " on the " + t.complete + " complete lines" : "") + ", payable " + fmtHM(t.payable) + " including a " + fmtHM(t.topup) + " minimum top-up; " + fmtHM(t.extra) + " past scheduled finish is flagged for review. "
      + (inc.length ? inc.map((l) => l.worker.name + "'s clock-" + (l.rawIn ? "out" : "in") + " is missing").join("; ") + ", so " + (inc.length > 1 ? "those lines stay" : "that line stays") + " out of the final total until a correction is approved." : "All lines are complete."),
    cols: ["Worker", "Worked", "Payable", "Note"],
    rows: ls.filter((l) => l.topupMin || l.extraMin || !l.complete || l.correctionNote).map((l) => [l.worker.name, l.complete ? fmtHM(l.workedMin) : "-", l.complete ? fmtHM(l.payableMin) : "-", !l.complete ? "Missing clock" : l.correctionNote ? "Corrected" : l.topupMin ? "Minimum top-up" : "Past finish " + fmtHM(l.extraMin) + (l.approvedEnd ? " (out " + fmtTime(l.approvedEnd) + ")" : "")]),
    actions: [{ label: "Corrections", primary: true, go: { page: "Timesheets", tab: "corrections" } }, { label: "Review all lines", primary: false, go: { page: "Timesheets", tab: "review", focus: { kind: "event", id: "EVT-001" } } }]
  };
}
export { docLabel };

function stamp2(s: OssState): Answer {
  const list = s.workers.filter((w) => profile(w).rtw.startsWith("Stamp 2")).map((w) => ({ w, c: stamp2Check(s, w.id)! })).sort((a, b) => b.c.total - a.c.total);
  const close = list.filter((x) => x.c.total > STAMP2_CAP_MIN - 240);
  return {
    tool: "compliance_rtw", effect: "read",
    text: list.length + " crew are on Stamp 2 student permission, capped at 20 hours a week in term time. " + (close.length ? close.length + " are within four hours of the cap this week; any new offer to them is checked first." : "None are close to the cap this week."),
    cols: ["Crew", "Mon to Thu", "Booked Fri to Sun", "Week"], rows: list.slice(0, 6).map((x) => [x.w.name, fmtHM(x.c.earlier), fmtHM(x.c.booked), fmtHM(x.c.total) + " of 20h"]),
    actions: [{ label: "Open right to work", primary: true, go: { page: "Compliance", tab: "rtw" } }]
  };
}
function noReply(s: OssState): Answer {
  const open = s.invitations.filter((i) => Q.isActiveInvite(s, i)).sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  return {
    tool: "staffing_responses", effect: "read",
    text: open.length ? open.length + " offers are still open. The oldest went out " + fmtDate(open[0].sentAt) + " at " + fmtTime(open[0].sentAt) + ". Each one expires on its own and the position goes back to invite." : "Everyone has answered.",
    cols: ["Crew", "Shift", "Sent", "Reminded"], rows: open.map((i) => [Q.nameOf(s, i.workerId), Q.eventOf(s, Q.shiftOf(s, i.shiftId).eventId).name.split(":")[0] + ", " + Q.shiftOf(s, i.shiftId).label.toLowerCase(), fmtDate(i.sentAt) + " " + fmtTime(i.sentAt), i.reminders.length ? "Yes" : "No"]),
    actions: [{ label: "Open responses", primary: true, go: { page: "Staffing", tab: "responses" } }]
  };
}
