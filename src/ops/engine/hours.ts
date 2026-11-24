/* Timesheet approval (supervisor, then office), Sage payroll export and the
   simulated Bullhorn sync. */

import type { OpsState, Result } from "../model";
import { asg, client, line, nameOf, worker, type Line } from "../selectors";
import { decHours, dayKey, fmtDay, fmtHM, fmtMoney, fmtTime } from "../time";
import { actorId, actorName, audit, denied, nid, no, ok } from "./core";

export function approveSupervisor(d: OpsState, asgIds: string[]): Result {
  const x = denied(d, "supervise", "approve timesheets"); if (x) return x;
  let n = 0; const skipped: string[] = [];
  for (const id of asgIds) {
    const l = line(d, id);
    if (!l) continue;
    if (l.status !== "supervisor") { if (l.status === "missing" || l.status === "review") skipped.push(l.w.name + " (" + (l.status === "missing" ? "missing clock" : "needs review") + ")"); continue; }
    d.approvals.push({ id: nid(d, "AP"), asgId: id, stage: "supervisor", by: actorId(d), at: d.clock, version: l.version });
    n++;
  }
  if (!n) return no(skipped.length ? "Nothing approved. Fix first: " + skipped.join(", ") + "." : "Nothing waiting for your approval.");
  audit(d, "hours.supervisor_approved", actorName(d) + " approved " + n + " timesheet" + (n === 1 ? "" : "s") + (skipped.length ? "; not included: " + skipped.join(", ") : ""));
  return ok("Approved " + n + ". The office reviews next." + (skipped.length ? " Not included: " + skipped.join(", ") + "." : ""));
}

export function approveOffice(d: OpsState, asgIds: string[]): Result {
  const x = denied(d, "approve_hours", "approve hours for payroll"); if (x) return x;
  let n = 0, mins = 0, noSup = 0; const skipped: string[] = [];
  for (const id of asgIds) {
    const l = line(d, id);
    if (!l) continue;
    if (l.status !== "office" && l.status !== "supervisor") { if (l.status === "missing" || l.status === "review") skipped.push(l.w.name); continue; }
    if (l.status === "supervisor") noSup++;
    d.approvals.push({ id: nid(d, "AP"), asgId: id, stage: "office", by: actorId(d), at: d.clock, version: l.version });
    n++; mins += l.payableMin;
  }
  if (!n) return no(skipped.length ? "Nothing approved. Needs fixing first: " + skipped.join(", ") + "." : "Nothing waiting for approval.");
  audit(d, "hours.office_approved", actorName(d) + " approved " + n + " timesheet" + (n === 1 ? "" : "s") + " for payroll, " + fmtHM(mins) + " payable" + (noSup ? " (" + noSup + " without supervisor sign-off)" : ""));
  return ok("Approved " + n + " for payroll (" + fmtHM(mins) + " payable)." + (skipped.length ? " Not included: " + skipped.join(", ") + "." : ""));
}

export function reopenLine(d: OpsState, asgId: string, reason: string): Result {
  const x = denied(d, "approve_hours", "reopen a timesheet"); if (x) return x;
  if (!reason.trim()) return no("Give a reason.");
  const l = line(d, asgId);
  if (!l || !(l.sup || l.office)) return no("Only an approved timesheet can be reopened.");
  for (const a of d.approvals) if (a.asgId === asgId && a.version === l.version && !a.reopened) a.reopened = d.clock;
  d.approvals.push({ id: nid(d, "AP"), asgId, stage: "office", by: actorId(d), at: d.clock, version: l.version, reopened: d.clock });
  audit(d, "hours.reopened", actorName(d) + " reopened " + l.w.name + "'s timesheet (" + reason.trim() + "); it needs approval again", { type: "assignment", id: asgId });
  return ok("Reopened. It goes back to the supervisor for approval.");
}

/* ── Sage export ────────────────────────────────────────────────────────── */
export const SAGE_HEADER = ["Payroll ref", "Employee", "Work date", "Client", "Event", "Role", "Scheduled", "Clock in", "Clock out",
  "Break (h)", "Worked (h)", "Minimum top-up (h)", "Payable (h)", "Rate (EUR)", "Gross (EUR)", "Overtime flag", "Approved by", "Approved", "Export"];
export function sageRow(d: OpsState, l: Line, exportId: string): (string | number)[] {
  return [l.w.bullhornId || l.w.id, l.w.name, l.day, client(d, l.ev.clientId).name, l.ev.name, l.a.role,
    fmtTime(l.sh.start) + "-" + fmtTime(l.sh.end), l.inAt ? fmtTime(l.inAt) : "", l.outAt ? fmtTime(l.outAt) : "",
    decHours(l.breakMin), decHours(l.workedMin), decHours(l.topupMin), decHours(l.payableMin), l.rate.toFixed(2), l.pay.toFixed(2),
    l.ot.join("; "), l.office ? nameOf(d, l.office.by) : "", l.office ? dayKey(l.office.at) : "", exportId];
}
export function exportSage(d: OpsState, asgIds: string[]): Result {
  const x = denied(d, "payroll", "export payroll"); if (x) return x;
  const ls = asgIds.map((id) => line(d, id)).filter((l): l is Line => !!l && l.status === "approved");
  if (!ls.length) return no("No approved timesheets to export. Approve them first.");
  const id = "PX-" + dayKey(d.clock).replace(/-/g, "").slice(2) + "-" + (d.exports.length + 1);
  const days = ls.map((l) => l.day).sort();
  const period = days[0] === days[days.length - 1] ? fmtDay(days[0]) : fmtDay(days[0]) + " to " + fmtDay(days[days.length - 1]);
  const minutes = ls.reduce((t, l) => t + l.payableMin, 0);
  const amount = Math.round(ls.reduce((t, l) => t + l.pay, 0) * 100) / 100;
  d.exports.push({ id, at: d.clock, by: actorId(d), asgIds: ls.map((l) => l.a.id + ":" + l.version), period, minutes, amount, file: "oss-sage-payroll-" + id.toLowerCase() + ".csv" });
  const rows = ls.map((l) => sageRow(d, l, id));
  audit(d, "payroll.exported", actorName(d) + " exported " + ls.length + " approved timesheets to the Sage file " + id + " (" + period + ", " + fmtHM(minutes) + ", " + fmtMoney(amount) + "); file only, not sent to Sage", { type: "export", id }, true);
  return ok("Exported " + ls.length + " lines (" + fmtHM(minutes) + ", " + fmtMoney(amount) + "). Download the CSV to import into Sage.", { id, rows, header: SAGE_HEADER, file: "oss-sage-payroll-" + id.toLowerCase() + ".csv" });
}

/* ── Bullhorn (simulated two-way sync) ──────────────────────────────────── */
export function syncBullhorn(d: OpsState): Result {
  const x = denied(d, "payroll", "run the Bullhorn sync");
  if (x && denied(d, "manage", "run the Bullhorn sync")) return x;
  const pending = d.workers.filter((w) => w.bullhornState === "pending");
  const unlinked = d.workers.filter((w) => w.bullhornState === "not_linked" && w.status === "active");
  for (const w of pending) w.bullhornState = "synced";
  // New active workers get a Bullhorn candidate record (simulated).
  for (const w of unlinked) { w.bullhornId = "BH-" + (40000 + Number(w.id.slice(1)) * 7); w.bullhornState = "synced"; }
  // Inbound changes made in Bullhorn are applied here once per day (simulated).
  const inbound: string[] = [];
  if (!d.syncs.some((s) => dayKey(s.at) === dayKey(d.clock))) {
    const w1 = d.workers.find((w) => w.id === "W0123"), w2 = d.workers.find((w) => w.id === "W0456");
    if (w1) { w1.mobile = "087 555 7731"; inbound.push(w1.name + ": mobile updated in Bullhorn"); }
    if (w2) { w2.area = "Drumcondra"; inbound.push(w2.name + ": address area updated in Bullhorn"); }
  }
  const lines = d.exports.reduce((t, e) => t + e.asgIds.length, 0);
  const summary = pending.length + " worker update" + (pending.length === 1 ? "" : "s") + " sent, " + unlinked.length + " new candidate" + (unlinked.length === 1 ? "" : "s") + " created, " + inbound.length + " change" + (inbound.length === 1 ? "" : "s") + " received";
  d.syncs.push({ id: nid(d, "SY"), at: d.clock, by: actorId(d), scope: "Workers and approved hours", rows: pending.length + unlinked.length + inbound.length, summary: summary + (inbound.length ? " (" + inbound.join("; ") + ")" : "") });
  audit(d, "bullhorn.sync", actorName(d) + " ran the Bullhorn sync: " + summary + "; " + lines + " exported timesheet lines available as placement hours (simulated, not connected)", undefined, true);
  return ok("Bullhorn sync complete (simulated): " + summary + ".", { inbound });
}

export { asg, worker };
