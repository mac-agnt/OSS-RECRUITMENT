/* Scenario checks for the simplified OSS app. Run with `npm run verify:ops`.
   Each check drives the same engine actions the screens use. */

import assert from "node:assert/strict";
import type { OpsState, Result } from "../src/ops/model";
import { buildSeed, PERSONAS } from "../src/ops/seed";
import * as E from "../src/ops/engine";
import * as Q from "../src/ops/selectors";
import { addDays, atDay, dayKey } from "../src/ops/time";

let passed = 0, failed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log("  ok   " + name); }
  catch (e) { failed++; console.error("  FAIL " + name + "\n       " + (e as Error).message); process.exitCode = 1; }
}
/** Run an engine action as a given person, like the store does. */
function as<A extends unknown[]>(d: OpsState, actor: string, fn: (d: OpsState, ...a: A) => Result, ...args: A): Result {
  const prev = d.actor; d.actor = actor;
  try { return fn(d, ...args); } finally { d.actor = prev; }
}
const okr = (r: Result) => { assert.ok(r.ok, r.msg); return r; };
const ev = (s: OpsState, prefix: string) => s.events.find((e) => e.name.startsWith(prefix) && Q.eventsOnDay(s, dayKey(s.clock)).includes(e))!;
const shiftOf = (s: OpsState, evId: string, label: string) => s.shifts.find((x) => x.eventId === evId && x.label === label)!;

const DAY = "2026-11-24";
const base = buildSeed(DAY);
const fresh = () => structuredClone(base);

console.log("Seed (" + DAY + ")");
check("about 1,040 crew, nine supervisors, four office users", () => {
  assert.ok(base.workers.length >= 1040 && base.workers.length <= 1050, String(base.workers.length));
  assert.equal(base.users.filter((u) => u.kind === "supervisor").length, 9);
  assert.equal(base.users.filter((u) => u.kind === "office").length, 4);
});
check("six events today, opening at 07:45", () => {
  const today = Q.eventsOnDay(base, DAY).map((e) => e.name.split(":")[0]);
  assert.deepEqual(today, ["RDS", "National Aquatic Centre", "Guinness Storehouse", "3Arena", "Aviva Stadium", "Convention Centre Dublin"]);
  assert.equal(base.clock, atDay(DAY, "07:45"));
});
check("RDS build is completed and waiting for supervisor sign-off", () => {
  const e = ev(base, "RDS");
  assert.equal(Q.staffStatus(base, e.id).label, "Completed");
  const ls = Q.lines(base, { eventId: e.id });
  assert.equal(ls.length, 8);
  assert.ok(ls.every((l) => l.status === "supervisor"));
});
check("National Aquatic Centre: 16/16, 3 not replying, flagged red", () => {
  const e = ev(base, "National Aquatic");
  const c = Q.eventCov(base, e.id);
  assert.deepEqual([c.confirmed, c.required, c.flagged], [16, 16, 3]);
  assert.equal(Q.staffStatus(base, e.id).tone, "bad");
  const a = Q.attendance(base, Q.shiftsOf(base, e.id));
  assert.deepEqual([a.onWay, a.arrived, a.late, a.lost, a.noReply], [9, 1, 2, 1, 3]);
});
check("every flagged NAC worker has a replacement recommendation", () => {
  const sh = Q.shiftsOf(base, ev(base, "National Aquatic").id)[0];
  const flagged = Q.confirmedOf(base, sh.id).filter((a) => a.flaggedAt);
  for (const a of flagged) assert.ok(Q.replacementFor(base, a.id), "no replacement for " + Q.worker(base, a.workerId).name);
});
check("3Arena show crew 19/20 with four on standby (amber)", () => {
  const e = ev(base, "3Arena");
  const show = shiftOf(base, e.id, "Show crew");
  const c = Q.coverage(base, show.id);
  assert.deepEqual([c.confirmed, c.required, c.standby], [19, 20, 4]);
  assert.equal(Q.staffStatus(base, e.id).tone, "warn");
});
check("Aviva alert reads exactly as OSS described", () => {
  const a = Q.alerts(base).find((x) => x.eventId === ev(base, "Aviva").id && x.area === "staffing")!;
  assert.equal(a.title, "Aviva Stadium requires five additional workers. Eight eligible workers are currently available.");
});
check("Convention Centre Dublin dinner is 2/12 and red", () => {
  const e = ev(base, "Convention Centre");
  const c = Q.eventCov(base, e.id);
  assert.deepEqual([c.confirmed, c.required], [2, 12]);
  assert.equal(Q.staffStatus(base, e.id).tone, "bad");
  assert.ok(Q.eligibleAvailable(base, Q.shiftsOf(base, e.id)[0].id, "Catering assistant").length >= 8);
});
check("yesterday: 3 hours worked pays 5, one forgotten clock-out", () => {
  const y = addDays(DAY, -1);
  const box = Q.lines(base, { from: y, to: y }).filter((l) => l.ev.name.includes("corporate box"));
  assert.equal(box.length, 6);
  for (const l of box) { assert.ok(l.workedMin >= 170 && l.workedMin < 240, String(l.workedMin)); assert.equal(l.payableMin, 300); assert.equal(l.status, "office"); }
  const rec = Q.lines(base, { from: y, to: y }).filter((l) => l.ev.name.includes("evening reception"));
  assert.equal(rec.filter((l) => l.status === "missing").length, 1);
});
check("Ryder Cup: 7 days, 4 locations, 8 supervisors, peak day about 860 positions", () => {
  const rc = base.events.find((e) => e.project === "Ryder Cup 2027")!;
  const shs = Q.shiftsOf(base, rc.id);
  assert.equal(new Set(shs.map((x) => dayKey(x.start))).size, 7);
  assert.equal(new Set(shs.map((x) => x.venueId)).size, 4);
  assert.equal(new Set([...shs.map((x) => Q.shiftSupervisor(base, x)), rc.supervisorId]).size, 8);
  const peak = Math.max(...[...new Set(shs.map((x) => dayKey(x.start)))].map((d) => shs.filter((x) => dayKey(x.start) === d).reduce((t, x) => t + Q.need(x), 0)));
  assert.ok(peak >= 820 && peak <= 900, String(peak));
  const c = Q.eventCov(base, rc.id);
  assert.ok(c.confirmed / c.required > 0.5 && c.confirmed / c.required < 0.7, (c.confirmed / c.required).toFixed(2));
});
check("Priya's Stamp 2 permission has expired, so she is hard-blocked", () => {
  const sh = Q.shiftsOf(base, ev(base, "Convention Centre").id)[0];
  const e = Q.eligibility(base, PERSONAS.priya, sh.id, "Catering assistant");
  assert.equal(e.status, "hard");
  assert.ok(e.reasons.some((r) => r.code === "doc:RTW"));
});
check("Maria (Stamp 2) is close to her 20-hour week", () => {
  const m = Q.weekMinutes(base, PERSONAS.maria, base.clock);
  assert.ok(m >= 14 * 60 && m <= 20 * 60, String(m / 60));
});
check("seed works for any weekday", () => {
  for (const day of ["2026-11-28", "2026-11-30", "2027-01-08"]) {
    const s = buildSeed(day);
    assert.equal(Q.eventsOnDay(s, day).length, 6, day);
    const a = Q.alerts(s).find((x) => x.eventId === Q.eventsOnDay(s, day).find((e) => e.name.startsWith("Aviva"))!.id && x.area === "staffing")!;
    assert.match(a.title, /five additional workers\. Eight eligible/, day);
  }
});

console.log("Scenario 1: last-minute request, 10 set-up and 20 event crew");
check("create client, location and a two-shift event; offers fill first come, first served", () => {
  const d = fresh();
  const c = okr(as(d, "U1", E.createClient, { name: "Harbour Lights Productions", contact: "Aine Doyle", email: "aine@example.test", phone: "01 555 0300" }));
  assert.equal(as(d, "U1", E.createClient, { name: "harbour lights productions", contact: "", email: "", phone: "" }).ok, false);
  const v = okr(as(d, "U1", E.createVenue, { name: "Dublin Port Convention Hall", address: "Alexandra Road, Dublin 1", county: "Dublin" }));
  const day = addDays(DAY, 2);
  const r = okr(as(d, "U1", E.saveEvent, { name: "Dublin Port: product launch", clientId: c.data.id, venueId: v.data.id, supervisorId: "S1",
    instructions: "Report to Bianca at the main door.", ppe: ["Black uniform"], quals: [],
    shifts: [{ label: "Set-up crew", date: day, start: "08:00", end: "13:00", needs: [{ role: "Stagehand", count: 4 }, { role: "General operative", count: 6 }] },
      { label: "Event crew", date: day, start: "17:00", end: "23:00", needs: [{ role: "Event crew", count: 20 }] }] }));
  const shs = Q.shiftsOf(d, r.data.id);
  assert.equal(shs.length, 2);
  assert.equal(Q.eventCov(d, r.data.id).required, 30);
  const evShift = shs[1];
  const cands = Q.candidates(d, evShift.id, "Event crew", { available: true });
  assert.ok(cands.length >= 24, String(cands.length));
  const ids = cands.slice(0, 24).map((x) => x.w.id);
  const sent = okr(as(d, "U1", E.sendOffers, evShift.id, "Event crew", ids));
  assert.equal(sent.data.sent.length, 24);
  assert.equal(as(d, "U1", E.sendOffers, evShift.id, "Event crew", [ids[0]]).ok, false, "duplicate offer refused");
  let standby = 0;
  for (const w of ids.slice(0, 22)) {
    const o = d.offers.find((x) => x.shiftId === evShift.id && x.workerId === w && x.status === "sent")!;
    const res = okr(as(d, w, E.respondOffer, o.id, "accept"));
    if (res.data?.standby) standby++;
  }
  const cov = Q.coverage(d, evShift.id);
  assert.deepEqual([cov.confirmed, cov.required, standby, cov.standby], [20, 20, 2, 2]);
  // Set-up crew, two roles.
  for (const role of ["Stagehand", "General operative"]) {
    const need = Q.need(shs[0], role);
    const list = Q.candidates(d, shs[0].id, role, { available: true }).slice(0, need + 1).map((x) => x.w.id);
    okr(as(d, "U1", E.sendOffers, shs[0].id, role, list));
    for (const w of list) { const o = d.offers.find((x) => x.shiftId === shs[0].id && x.workerId === w && x.status === "sent")!; as(d, w, E.respondOffer, o.id, "accept"); }
  }
  assert.equal(Q.eventCov(d, r.data.id).confirmed, 30);
  assert.equal(Q.staffStatus(d, r.data.id).label, "Fully staffed");
});
check("a worker already booked can't take an overlapping shift", () => {
  const d = fresh();
  const show = shiftOf(d, ev(d, "3Arena").id, "Show crew");
  const aviva = Q.shiftsOf(d, ev(d, "Aviva").id)[0];
  const tomasz = Q.eligibility(d, PERSONAS.tomasz, aviva.id, "Steward");
  assert.equal(tomasz.status, "hard");
  assert.ok(tomasz.reasons.some((x) => x.code === "overlap"));
  assert.equal(as(d, "U1", E.assignManual, aviva.id, "Steward", PERSONAS.tomasz, "Needed urgently").ok, false);
  void show;
});
check("overrides need a reason and are recorded; overbooking is refused", () => {
  const d = fresh();
  const ccd = Q.shiftsOf(d, ev(d, "Convention Centre").id)[0];
  const soft = Q.candidates(d, ccd.id, "Catering assistant", { showBlocked: true }).find((c) => c.e.status === "soft" && c.e.reasons.some((r) => r.code === "avail" && r.level === "soft"))!;
  assert.ok(soft, "need a soft-blocked candidate");
  assert.equal(as(d, "U1", E.assignManual, ccd.id, "Catering assistant", soft.w.id).ok, false);
  const r = okr(as(d, "U1", E.assignManual, ccd.id, "Catering assistant", soft.w.id, "Phoned her, she swapped her day off"));
  assert.ok(Q.asg(d, r.data.asgId).override?.reason.includes("Phoned"));
  assert.ok(d.audit.some((a) => a.action === "assignment.manual" && a.summary.includes("override")));
  const aviva = shiftOf(d, ev(d, "Aviva").id, "Turnstiles and concourse");
  const extra = Q.candidates(d, aviva.id, "Accreditation")[0];
  assert.equal(as(d, "U1", E.assignManual, aviva.id, "Accreditation", extra.w.id, "test override").ok, false, "full role refused");
});

console.log("Scenario 2: three dropouts before 3Arena");
check("dropouts raise a shortfall, standby replacements refill the roster", () => {
  const d = fresh();
  const e = ev(d, "3Arena");
  const show = shiftOf(d, e.id, "Show crew");
  const r = okr(as(d, "U1", E.simulateDropouts, show.id, 3));
  assert.match(r.msg, /^3 cancellations/);
  assert.equal(Q.coverage(d, show.id).confirmed, 16);
  const alert = Q.alerts(d).find((a) => a.eventId === e.id && a.area === "staffing")!;
  assert.match(alert.title, /3Arena requires four additional workers/);
  for (const b of Q.standbyOf(d, show.id).filter((x) => x.role === "Event crew")) okr(as(d, "U1", E.promoteStandby, b.id));
  assert.equal(Q.coverage(d, show.id).confirmed, 19);
  const last = Q.eligibleAvailable(d, show.id, "Event crew")[0];
  okr(as(d, "U1", E.sendOffers, show.id, "Event crew", [last.w.id]));
  const o = d.offers.find((x) => x.workerId === last.w.id && x.shiftId === show.id && x.status === "sent")!;
  okr(as(d, last.w.id, E.respondOffer, o.id, "accept"));
  // The seeded open offer may also be accepted later: it then goes to standby, never over capacity.
  const open = d.offers.find((x) => x.shiftId === show.id && x.status === "sent" && x.workerId !== last.w.id);
  if (open) { const res = okr(as(d, open.workerId, E.respondOffer, open.id, "accept")); assert.ok(res.data?.standby); }
  assert.deepEqual([Q.coverage(d, show.id).confirmed, Q.coverage(d, show.id).required], [20, 20]);
});
check("replacing a non-responder stands them down; never both confirmed", () => {
  const d = fresh();
  const sh = Q.shiftsOf(d, ev(d, "National Aquatic").id)[0];
  const flagged = Q.confirmedOf(d, sh.id).filter((a) => a.flaggedAt);
  const ec = flagged.find((a) => a.role === "Event crew")!;
  const sb = Q.standbyOf(d, sh.id).find((b) => b.role === "Event crew")!;
  okr(as(d, "U1", E.promoteStandby, sb.id, ec.id));
  assert.equal(Q.asg(d, ec.id).status, "stood_down");
  assert.equal(Q.coverage(d, sh.id, "Event crew").confirmed, 10);
  assert.equal(as(d, ec.workerId, E.replyCode, ec.workerId, ec.id, "on_way").ok, false, "stood-down worker can't reply onto the roster");
  // A replacement offer is withdrawn if the original replies first.
  const st = flagged.find((a) => a.role === "Steward")!;
  const cand = Q.eligibleAvailable(d, sh.id, "Steward")[0] || Q.candidates(d, sh.id, "Steward").find((c) => c.e.status !== "hard" && c.e.status !== "soft")!;
  okr(as(d, "U1", E.offerReplacement, st.id, cand.w.id));
  okr(as(d, st.workerId, E.replyCode, st.workerId, st.id, "on_way"));
  const rep = d.offers.find((o) => o.replaces === st.id)!;
  assert.equal(rep.status, "withdrawn");
  assert.equal(Q.asg(d, st.id).flaggedAt, undefined);
  // And a replacement accepted before the original replies swaps them.
  const ec2 = flagged.filter((a) => a.role === "Event crew")[1];
  const c2 = Q.candidates(d, sh.id, "Event crew").find((c) => c.e.status === "eligible" || c.e.status === "warning")!;
  okr(as(d, "U1", E.offerReplacement, ec2.id, c2.w.id));
  const o2 = d.offers.find((o) => o.replaces === ec2.id && o.status === "sent")!;
  okr(as(d, c2.w.id, E.respondOffer, o2.id, "accept"));
  assert.equal(Q.asg(d, ec2.id).status, "stood_down");
  assert.ok(Q.coverage(d, sh.id, "Event crew").confirmed <= 10);
});

console.log("Scenario 3: Ryder Cup at scale");
check("totals by day, location and supervisor; bulk offers update the numbers", () => {
  const d = fresh();
  const rc = d.events.find((e) => e.project === "Ryder Cup 2027")!;
  const shs = Q.shiftsOf(d, rc.id);
  const fri = shs.filter((x) => x.start.startsWith("2027-09-17"));
  assert.equal(new Set(fri.map((x) => x.venueId)).size, 4);
  const pr = fri.find((x) => x.label === "Park and ride, early")!;
  const before = Q.coverage(d, pr.id, "Car park marshal");
  const list = Q.candidates(d, pr.id, "Car park marshal").filter((c) => c.e.status !== "hard" && c.e.status !== "soft" && !c.offered).slice(0, 15).map((c) => c.w.id);
  assert.ok(list.length >= 10, String(list.length));
  okr(as(d, "U1", E.sendOffers, pr.id, "Car park marshal", list));
  for (const w of list.slice(0, 10)) { const o = d.offers.find((x) => x.shiftId === pr.id && x.workerId === w && x.status === "sent")!; okr(as(d, w, E.respondOffer, o.id, "accept")); }
  assert.equal(Q.coverage(d, pr.id, "Car park marshal").confirmed, before.confirmed + 10);
  const bySup = new Map<string, number>();
  for (const x of shs) bySup.set(Q.shiftSupervisor(d, x), (bySup.get(Q.shiftSupervisor(d, x)) || 0) + Q.coverage(d, x.id).confirmed);
  assert.ok(bySup.size >= 7);
});

console.log("Scenario 4: attendance to payroll");
check("location check, early finish paid at the five-hour minimum, approvals, Sage and Bullhorn", () => {
  const d = fresh();
  const load = shiftOf(d, ev(d, "3Arena").id, "Load-in crew");
  const a = Q.confirmedOf(d, load.id).find((x) => x.workerId === PERSONAS.ciaran)!;
  okr(as(d, "U1", E.advance, atDay(DAY, "11:58")));
  const far = as(d, PERSONAS.ciaran, E.clockIn, a.id, { method: "gps", distanceM: 240 });
  assert.equal(far.ok, false);
  assert.match(far.msg, /240 m/);
  okr(as(d, PERSONAS.ciaran, E.clockIn, a.id, { method: "gps", distanceM: 30 }));
  assert.equal(Q.asgView(d, a.id).state, "in");
  okr(as(d, "U1", E.advance, atDay(DAY, "15:00")));
  okr(as(d, PERSONAS.ciaran, E.clockOut, a.id, { method: "gps", distanceM: 22 }));
  let l = Q.line(d, a.id)!;
  assert.equal(l.workedMin, 182);
  assert.equal(l.payableMin, 300);
  assert.equal(l.topupMin, 118);
  assert.equal(l.status, "supervisor");
  assert.equal(as(d, "S1", E.approveSupervisor, [a.id]).ok, true, "Bianca supervises the event");
  l = Q.line(d, a.id)!;
  assert.equal(l.status, "office");
  okr(as(d, "U1", E.approveOffice, [a.id]));
  assert.equal(Q.line(d, a.id)!.status, "approved");
  const x = okr(as(d, "U1", E.exportSage, [a.id]));
  assert.ok(x.data.rows.some((r: (string | number)[]) => r[1] === "Ciarán Doyle" && r[12] === 5));
  assert.equal(Q.line(d, a.id)!.status, "exported");
  okr(as(d, "U1", E.syncBullhorn));
  assert.equal(as(d, "U4", E.exportSage, [a.id]).ok, false, "Ronan has no payroll permission");
});
check("offline clock-in waits to sync, forgotten clock-out is flagged and corrected with a note", () => {
  const d = fresh();
  const show = shiftOf(d, ev(d, "3Arena").id, "Show crew");
  const a = Q.confirmedOf(d, show.id).find((x) => x.workerId === PERSONAS.tomasz)!;
  okr(as(d, "U1", E.advance, atDay(DAY, "17:20")));
  okr(as(d, PERSONAS.tomasz, E.clockIn, a.id, { method: "gps", distanceM: 20, offline: true }));
  assert.equal(Q.asgView(d, a.id).state, "pending");
  okr(as(d, PERSONAS.tomasz, E.syncOffline, a.id));
  assert.equal(Q.asgView(d, a.id).state, "in");
  okr(as(d, "U1", E.advance, atDay(addDays(DAY, 1), "00:05")));
  assert.ok(d.exceptions.some((x) => x.asgId === a.id && x.type === "missing_out" && x.status === "open"));
  assert.equal(Q.line(d, a.id)!.status, "missing");
  assert.equal(as(d, "S1", E.correctClock, a.id, "out", "23:35", "").ok, false, "a note is required");
  okr(as(d, "S1", E.correctClock, a.id, "out", "23:35", "Saw him leave with the load-out crew"));
  assert.equal(Q.line(d, a.id)!.status, "supervisor");
  assert.ok(d.clocks.some((c) => c.asgId === a.id && c.method === "correction"));
});

console.log("Scenario 5: expired documentation");
check("expired Stamp 2 blocks offers and overrides; renewal is pending until verified", () => {
  const d = fresh();
  const ccd = Q.shiftsOf(d, ev(d, "Convention Centre").id)[0];
  const s1 = as(d, "U1", E.sendOffers, ccd.id, "Catering assistant", [PERSONAS.priya]);
  assert.equal(s1.ok, false);
  assert.match(s1.msg, /Work authorisation/);
  assert.equal(as(d, "U1", E.assignManual, ccd.id, "Catering assistant", PERSONAS.priya, "Client asked for her").ok, false);
  const up = okr(as(d, PERSONAS.priya, E.uploadDoc, PERSONAS.priya, { type: "RTW", issued: DAY, expires: addDays(DAY, 365) }));
  assert.equal(Q.eligibility(d, PERSONAS.priya, ccd.id, "Catering assistant").status, "hard", "pending still blocks");
  assert.equal(as(d, "U4", E.verifyDoc, up.data.id, true).ok, false, "Ronan can't verify");
  okr(as(d, "U1", E.verifyDoc, up.data.id, true));
  assert.notEqual(Q.eligibility(d, PERSONAS.priya, ccd.id, "Catering assistant").status, "hard");
  okr(as(d, "U1", E.sendOffers, ccd.id, "Catering assistant", [PERSONAS.priya]));
  const o = d.offers.find((x) => x.workerId === PERSONAS.priya && x.status === "sent")!;
  okr(as(d, PERSONAS.priya, E.respondOffer, o.id, "accept"));
  assert.equal(Q.coverage(d, ccd.id, "Catering assistant").confirmed, 3);
});

console.log("Automations and replies");
check("2 h travel check and 45 min no-reply check run once", () => {
  const d = fresh();
  const gs = Q.shiftsOf(d, ev(d, "Guinness").id)[0];
  okr(as(d, "U1", E.advance, atDay(DAY, "09:50")));
  assert.equal(d.messages.filter((m) => m.kind === "travel" && m.ref?.id === gs.id).length, 1);
  assert.ok(d.autoRuns.some((r) => r.key === "noreply:" + gs.id + ":v1"));
  okr(as(d, "U1", E.advance, atDay(DAY, "10:10")));
  assert.equal(d.messages.filter((m) => m.kind === "travel" && m.ref?.id === gs.id).length, 1);
  const replied = Q.confirmedOf(d, gs.id).filter((a) => Q.updatesOf(d, a.id).some((u) => u.code === "on_way" || u.code === "late"));
  assert.ok(replied.length >= 8, "simulated crew replied: " + replied.length);
  for (const a of Q.confirmedOf(d, gs.id).filter((x) => x.flaggedAt)) assert.ok(!Q.updatesOf(d, a.id).some((u) => u.code !== "confirmed"));
});
check("24 h reconfirmation for tomorrow goes out once", () => {
  const d = fresh();
  const tShow = d.shifts.find((x) => x.eventId === "E-U1" && x.label === "Show crew")!;
  okr(as(d, "U1", E.advance, atDay(DAY, "18:00")));
  okr(as(d, "U1", E.advance, atDay(DAY, "18:30")));
  assert.equal(d.messages.filter((m) => m.kind === "reconfirm" && m.ref?.id === tShow.id).length, 1);
});
check("automatic reassignment confirms or offers a replacement, never doubling up", () => {
  const d = fresh();
  okr(as(d, "U1", E.setRule, "autoReassign", true));
  d.ui.crowd = false;
  const gs = Q.shiftsOf(d, ev(d, "Guinness").id)[0];
  okr(as(d, "U1", E.advance, atDay(DAY, "09:50")));
  const flagged = Q.confirmedOf(d, gs.id).filter((a) => a.flaggedAt).length;
  const replacing = d.offers.filter((o) => o.kind === "replacement" && o.shiftId === gs.id).length + d.assignments.filter((a) => a.shiftId === gs.id && a.status === "stood_down").length;
  assert.ok(flagged + d.assignments.filter((a) => a.shiftId === gs.id && a.status === "stood_down").length > 0, "with no simulated replies everyone is flagged");
  assert.ok(replacing > 0, "some replacement action happened");
  for (const n of gs.needs) assert.ok(Q.coverage(d, gs.id, n.role).confirmed <= n.count);
});
check("structured replies update the roster", () => {
  const d = fresh();
  const sh = Q.shiftsOf(d, ev(d, "National Aquatic").id)[0];
  const lost = Q.confirmedOf(d, sh.id).find((a) => Q.asgView(d, a.id).state === "lost")!;
  okr(as(d, lost.workerId, E.replyCode, lost.workerId, lost.id, "arrived"));
  assert.equal(Q.asgView(d, lost.id).state, "arrived");
  assert.ok(!d.exceptions.some((x) => x.asgId === lost.id && x.type === "lost" && x.status === "open"));
  const other = Q.confirmedOf(d, sh.id).find((a) => Q.asgView(d, a.id).state === "on_way" && a.workerId !== PERSONAS.maria)!;
  assert.equal(as(d, other.workerId, E.replyCode, other.workerId, other.id, "late", { eta: atDay(DAY, "07:00") }).ok, false, "ETA must be in the future");
  okr(as(d, other.workerId, E.replyCode, other.workerId, other.id, "cant_make", { note: "Sick" }));
  assert.equal(Q.asg(d, other.id).status, "cancelled");
  assert.equal(Q.coverage(d, sh.id).confirmed, 15);
  assert.ok(Q.alerts(d).some((x) => x.eventId === sh.eventId && x.area === "staffing"));
});
check("emergency registration is not verification", () => {
  const d = fresh();
  const r = okr(as(d, "S1", E.registerEmergency, { name: "Walk In Tester", mobile: "089 555 0000", role: "Event crew", rtw: "Irish citizen", idPhoto: true }, ev(d, "National Aquatic").id));
  const w = Q.worker(d, r.data.id);
  assert.equal(w.status, "pending_verification");
  const sh = Q.shiftsOf(d, ev(d, "National Aquatic").id)[0];
  assert.equal(Q.eligibility(d, w.id, sh.id, "Event crew").status, "hard");
  const doc = d.docs.find((x) => x.workerId === w.id)!;
  okr(as(d, "U1", E.verifyDoc, doc.id, true));
  assert.equal(Q.worker(d, w.id).status, "active");
});

console.log("\n" + passed + " passed" + (failed ? ", " + failed + " failed" : ""));
