/* Everything waiting for the OSS office, by area, most urgent first. Each item
   carries the one action that clears it, so the control panel can do the work
   in place. Counts here drive the Dashboard band too. */

import type { OssState } from "./model";
import * as E from "./engine";
import * as Q from "./selectors";
import { advanceApplicant, profile, restPairs, stamp2Check, STAMP2_CAP_MIN } from "./industry";
import { navigate, openDrawer, run } from "./store";
import { fmtDate, fmtHM, fmtTime, minutesBetween, ms } from "./time";

export type Area = "staffing" | "eventday" | "hours" | "crew";
export interface Todo { area: Area; urgent: boolean; title: string; sub: string; tag?: string; who?: string; actions: { label: string; primary?: boolean; go: () => void }[] }
export const AREAS: { id: Area; label: string; blurb: string }[] = [
  { id: "staffing", label: "Staffing", blurb: "Gaps, replies and cover" },
  { id: "eventday", label: "Event day", blurb: "Arrivals, check-ins, exceptions" },
  { id: "hours", label: "Hours", blurb: "Approvals, corrections, Bullhorn" },
  { id: "crew", label: "Crew & compliance", blurb: "Right to work, documents, recruits" }
];
const CODE: Record<string, string> = { C01: "AIKEN", C02: "LES", C03: "NSES", C04: "QSE", C05: "DPS" };
const tagOf = (s: OssState, eventId: string) => CODE[Q.eventOf(s, eventId).clientId] || "OSS";

export function todos(s: OssState): Todo[] {
  const out: Todo[] = [];
  const now = ms(s.clock);
  /* staffing */
  Q.replacementQueue(s).filter((r) => r.open).forEach((r) => out.push({ area: "staffing", urgent: true, tag: tagOf(s, r.event.id), title: r.worker.name + " cancelled " + r.shift.label.toLowerCase(), who: r.worker.id,
    sub: r.event.name.split(":")[0] + " · starts " + fmtDate(r.shift.start) + " " + fmtTime(r.shift.start) + (r.pendingInv.length ? " · offer out to " + Q.nameOf(s, r.pendingInv[0].workerId) : " · standby ready"),
    actions: [{ label: r.pendingInv.length ? "Chase" : "Send offer", primary: true, go: () => navigate("Staffing", "replacements") }] }));
  Q.windowEvents(s).filter((e) => Q.eventPhase(s, e) === "upcoming").flatMap((e) => Q.shiftsOfEvent(s, e.id)).forEach((x) => {
    const c = Q.shiftCoverage(s, x.id);
    if (c.notInvited > 0) out.push({ area: "staffing", urgent: ms(x.start) - now < 48 * 3600000, tag: tagOf(s, x.eventId), title: c.notInvited + " to invite: " + Q.eventOf(s, x.eventId).name.split(":")[0] + ", " + x.label.toLowerCase(),
      sub: c.confirmed + "/" + c.required + " confirmed · " + c.awaiting + " awaiting · " + fmtDate(x.start) + " " + fmtTime(x.start), actions: [{ label: "Find crew", primary: true, go: () => navigate("Staffing", "allocate", { kind: "shift", id: x.id }) }] });
  });
  s.invitations.filter((i) => Q.isActiveInvite(s, i) && minutesBetween(i.sentAt, s.clock) > 12 * 60).forEach((i) => out.push({ area: "staffing", urgent: ms(Q.shiftOf(s, i.shiftId).start) - now < 36 * 3600000, tag: tagOf(s, Q.shiftOf(s, i.shiftId).eventId), who: i.workerId,
    title: Q.nameOf(s, i.workerId) + " hasn't answered", sub: Q.shiftOf(s, i.shiftId).label + " · sent " + fmtHM(minutesBetween(i.sentAt, s.clock)) + " ago" + (i.reminders.length ? " · reminded" : ""),
    actions: [{ label: "Remind", primary: true, go: () => run(E.remind, i.id) }, { label: "Withdraw", go: () => run(E.withdrawInvitation, i.id) }] }));
  /* event day */
  Q.openExceptions(s).forEach((x) => { const a = Q.asgOf(s, x.assignmentId); out.push({ area: "eventday", urgent: true, tag: tagOf(s, Q.shiftOf(s, a.shiftId).eventId), who: a.workerId, title: Q.nameOf(s, a.workerId) + ": " + x.reason.replace(/\.$/, "").toLowerCase(), sub: Q.shiftOf(s, a.shiftId).label + " · " + x.nextAction,
    actions: [{ label: x.type.startsWith("missing") ? "Fix time" : "Review", primary: true, go: () => navigate(x.type.startsWith("missing") ? "Timesheets" : "Attendance", x.type.startsWith("missing") ? "corrections" : "exceptions") }] }); });
  s.assignments.filter((a) => a.status === "confirmed" && Q.arrivalState(s, a.id) === "Running late" && !Q.verifiedIn(s, a.id)).forEach((a) => { const j = Q.journeyOf(s, a.id); out.push({ area: "eventday", urgent: true, who: a.workerId, tag: tagOf(s, Q.shiftOf(s, a.shiftId).eventId), title: Q.nameOf(s, a.workerId) + " running late", sub: "ETA " + (j?.eta ? fmtTime(j.eta) : "not given") + (j?.message ? " · \"" + j.message + "\"" : ""), actions: [{ label: "Message", primary: true, go: () => navigate("Messages", "inbox") }] }); });
  const seenVenue = new Set<string>();
  Q.windowEvents(s).filter((e) => Q.venueOf(s, e.venueId) && !Q.venueOf(s, e.venueId)!.meetingConfirmed && Q.eventPhase(s, e) === "upcoming" && !seenVenue.has(e.venueId!) && !!seenVenue.add(e.venueId!)).forEach((e) => out.push({ area: "eventday", urgent: false, tag: tagOf(s, e.id), title: "Confirm the meeting point: " + Q.venueOf(s, e.venueId)!.name, sub: "Goes on the call sheet and every invitation", actions: [{ label: "Open event", primary: true, go: () => navigate("Events", "upcoming", { kind: "event", id: e.id }) }] }));
  /* Call sheets for the other desks go out from those desks; the control panel shows the Dublin desk's own. */
  Q.windowEvents(s).filter((e) => !e.network && Q.eventPhase(s, e) === "upcoming" && ms(Q.shiftsOfEvent(s, e.id)[0]?.start || e.date) - now < 30 * 3600000).forEach((e) => out.push({ area: "eventday", urgent: false, tag: tagOf(s, e.id), title: "Send the call sheet: " + e.name.split(":")[0], sub: "Crew get call times, accreditation and radio channel the day before", actions: [{ label: "Call sheet", primary: true, go: () => navigate("Events", "upcoming", { kind: "event", id: e.id }) }] }));
  /* hours */
  s.corrections.filter((c) => c.status === "proposed").forEach((c) => out.push({ area: "hours", urgent: true, who: Q.asgOf(s, c.assignmentId).workerId, title: "Approve " + Q.nameOf(s, Q.asgOf(s, c.assignmentId).workerId) + "'s clock-" + c.field + " " + fmtTime(c.proposed), sub: "Proposed by " + Q.nameOf(s, c.requestedBy) + ": \"" + c.reason + "\"",
    actions: [{ label: "Approve", primary: true, go: () => run(E.decideCorrection, c.id, true) }, { label: "Reject", go: () => run(E.decideCorrection, c.id, false) }] }));
  const ls = Q.lines(s);
  const ready = ls.filter((l) => l.status === "ready");
  if (ready.length) out.push({ area: "hours", urgent: false, title: ready.length + " timesheet lines ready to approve", sub: fmtHM(ready.reduce((t, l) => t + l.payableMin, 0)) + " payable · drafted from clock records", actions: [{ label: "Review", primary: true, go: () => navigate("Timesheets", "review") }] });
  ls.filter((l) => l.status === "incomplete").forEach((l) => out.push({ area: "hours", urgent: true, who: l.worker.id, title: l.worker.name + ": no clock-" + (l.rawIn ? "out" : "in"), sub: l.event.name.split(":")[0] + ", " + l.shift.label + " · blocks approval", actions: [{ label: "Fix time", primary: true, go: () => navigate("Timesheets", "corrections", { kind: "assignment", id: l.asg.id }) }] }));
  s.items.filter((i) => i.state === "blocked" || i.state === "failed").forEach((i) => out.push({ area: "hours", urgent: true, who: i.snapshot.workerId, title: Q.nameOf(s, i.snapshot.workerId) + "'s " + fmtHM(i.snapshot.payableMin) + " not in Bullhorn", sub: "No Bullhorn candidate match · payroll cut-off Fri 27 Nov", actions: [{ label: "Match", primary: true, go: () => openDrawer("mapping", i.snapshot.workerId) }] }));
  const unsent = ls.filter((l) => l.status === "approved" && !l.item);
  if (unsent.length) out.push({ area: "hours", urgent: false, title: unsent.length + " approved lines not sent to Bullhorn", sub: fmtHM(unsent.reduce((t, l) => t + l.payableMin, 0)) + " approved", actions: [{ label: "Send", primary: true, go: () => navigate("Timesheets", "bullhorn") }] });
  /* crew & compliance */
  s.workers.filter((w) => profile(w).rtw.startsWith("Stamp 2")).forEach((w) => { const c = stamp2Check(s, w.id)!; if (c.total > STAMP2_CAP_MIN - 4 * 60) out.push({ area: "crew", urgent: c.total > STAMP2_CAP_MIN, who: w.id, title: w.name + " at " + fmtHM(c.total) + " of 20h", sub: "Stamp 2 student · " + (c.total > STAMP2_CAP_MIN ? "over the term-time cap" : "no more than " + fmtHM(STAMP2_CAP_MIN - c.total) + " left this week"), actions: [{ label: "Check", primary: true, go: () => navigate("Compliance", "rtw") }] }); });
  restPairs(s).filter((p) => p.restMin < 11 * 60).forEach((p) => out.push({ area: "crew", urgent: true, who: p.workerId, title: Q.nameOf(s, p.workerId) + ": " + fmtHM(p.restMin) + " rest between shifts", sub: "Under the 11 hours in the Working Time Act", actions: [{ label: "Review", primary: true, go: () => navigate("Compliance", "hours") }] }));
  s.documents.filter((d) => d.review === "pending").forEach((d) => out.push({ area: "crew", urgent: false, who: d.workerId, title: "Review " + Q.nameOf(s, d.workerId) + "'s " + ({ MH: "Manual Handling", SP: "Safe Pass", HACCP: "Food Safety", FA: "First Aid" } as Record<string, string>)[d.type], sub: "Uploaded in OSS Crew", actions: [{ label: "Approve", primary: true, go: () => run(E.reviewDocument, d.id, "approved") }, { label: "Open", go: () => openDrawer("worker", d.workerId) }] }));
  Q.expiringDocs(s).slice(0, 3).forEach((d) => out.push({ area: "crew", urgent: false, who: d.workerId, title: Q.nameOf(s, d.workerId) + "'s Manual Handling expires " + fmtDate(d.expires + "T12:00:00Z"), sub: "Blocks shifts after that date", actions: [{ label: "Remind", primary: true, go: () => run(E.sendBulk, { workerIds: [d.workerId], body: "Your certificate expires soon. Please upload the renewal in OSS Crew.", audience: "Renewal reminder" }) }] }));
  s.ext.applicants.filter((a) => a.stage === "docs").slice(0, 3).forEach((a) => out.push({ area: "crew", urgent: false, title: a.name + " inducted, documents outstanding", sub: a.campaign + " · " + a.rtw, actions: [{ label: "Docs received", primary: true, go: () => run(advanceApplicant, a.id) }] }));
  return out.sort((a, b) => Number(b.urgent) - Number(a.urgent));
}
export const areaCount = (t: Todo[], a: Area) => ({ n: t.filter((x) => x.area === a).length, urgent: t.filter((x) => x.area === a && x.urgent).length });
