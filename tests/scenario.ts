/* Repeatable checks for the demo's state transitions. Run with `npm run verify`.
   Each check drives the same engine actions the UI uses. */

import assert from "node:assert/strict";
import type { OssState } from "../src/oss/model";
import { buildStage } from "../src/oss/stages";
import * as E from "../src/oss/engine";
import * as S from "../src/oss/selectors";
import { zoned } from "../src/oss/time";

let passed = 0;
function check(name: string, fn: () => void) {
  try { fn(); passed++; console.log("  ok  " + name); }
  catch (e) { console.error("  FAIL " + name + "\n       " + (e as Error).message); process.exitCode = 1; }
}
const clone = (s: OssState) => structuredClone(s);
const as = (d: OssState, persona: string) => { d.ui.personaId = persona; return d; };
const hero = (d: OssState) => S.eventCoverage(d, "EVT-001");
const inv = (d: OssState, sh: string, w: string) => d.invitations.filter((i) => i.shiftId === sh && i.workerId === w && i.status === "sent").pop()!;

const s1 = buildStage(1);

console.log("Opening snapshot");
check("Dublin events desk window 106 / 95 / 6 awaiting / 101 allocated / 11 unfilled / 5 not invited / 89.6%", () => {
  const t = S.windowTotals(s1, { desk: "Dublin events desk" });
  assert.deepEqual([t.required, t.confirmed, t.awaiting, t.allocated, t.unfilled, t.notInvited, t.coverageLabel], [106, 95, 6, 101, 11, 5, "89.6%"]);
});
check("per-event table reconciles", () => {
  const rows = ["EVT-001", "EVT-002", "EVT-003", "EVT-004"].map((id) => { const c = S.eventCoverage(s1, id); return [c.required, c.confirmed, c.awaiting, c.allocated, c.unfilled]; });
  assert.deepEqual(rows, [[30, 25, 3, 28, 5], [48, 44, 2, 46, 4], [16, 14, 1, 15, 2], [12, 12, 0, 12, 0]]);
});
check("pending demand 42 positions, excluded from firm totals", () => {
  assert.equal(S.pendingDemand(s1).positions, 42);
  assert.equal(S.windowTotals(s1, { desk: "Dublin events desk" }).required, 106);
});
check("96 story workers, network crew start at W101", () => { assert.equal(s1.workers.filter((w) => Number(w.id.slice(1)) < 100).length, 96); assert.ok(s1.workers.length > 700); });
check("network never shares a worker with a story shift", () => { const story = new Set(s1.assignments.filter((a) => !a.id.startsWith("NASG-")).map((a) => a.workerId)); assert.ok(s1.assignments.filter((a) => a.id.startsWith("NASG-")).every((a) => !story.has(a.workerId))); });
check("company-wide window is bigger than the desk", () => assert.ok(S.windowTotals(s1).required > 1000));
check("hero shifts 8/10 and 17/20", () => {
  const a = S.shiftCoverage(s1, "SH-001A"), b = S.shiftCoverage(s1, "SH-001B");
  assert.deepEqual([a.confirmed, a.awaiting, a.allocated, a.unfilled], [8, 1, 9, 2]);
  assert.deepEqual([b.confirmed, b.awaiting, b.allocated, b.unfilled], [17, 2, 19, 3]);
});
check("Eoin blocked by expiry before Saturday; Maeve eligible with warning; Tomas blocked pending review", () => {
  const e = S.eligibility(s1, "W033", "SH-001B");
  assert.equal(e.status, "blocked");
  assert.ok(e.reasons.some((r) => /valid through 13 Nov only/.test(r.label)));
  assert.equal(S.eligibility(s1, "W034", "SH-001B").status, "warning");
  const t = S.eligibility(s1, "W035", "SH-001A");
  assert.equal(t.status, "blocked");
  assert.ok(t.reasons.some((r) => /awaiting review/.test(r.label)));
});
check("historical batch 11 accepted (55h) / 1 blocked (5h)", () => {
  const b = S.batchSummary(s1, "BH-1111-01");
  assert.deepEqual([b.accepted, b.acceptedMin, b.blocked, b.blockedMin], [11, 3300, 1, 300]);
});

console.log("Aidan, Sean and the remaining gaps");
{
  const d = clone(s1);
  d.clock = zoned("2026-11-12", "16:20");
  E.setAvailability(d, "W009", [{ start: zoned("2026-11-14", "14:00"), end: zoned("2026-11-15", "00:00"), kind: "unavailable", note: "Saturday from 14:00" }]);
  check("availability edit does not cancel or change confirmed work", () => assert.equal(hero(d).confirmed, 25));
  E.respond(d, "INV-001A-W009", "accept");
  check("Aidan accepts morning: 26/30, 2 awaiting, 28 allocated, 4 unfilled", () => { const c = hero(d); assert.deepEqual([c.confirmed, c.awaiting, c.allocated, c.unfilled], [26, 2, 28, 4]); });
  check("evening accept would be rejected on re-check (unavailable)", () => { const x = clone(d); const r = E.respond(x, "INV-001B-W009", "accept"); assert.equal(r.ok, false); });
  E.respond(d, "INV-001B-W009", "decline");
  check("Aidan declines evening: 26/30, 1 awaiting, 27 allocated, 4 unfilled; morning kept", () => {
    const c = hero(d); assert.deepEqual([c.confirmed, c.awaiting, c.allocated, c.unfilled], [26, 1, 27, 4]);
    assert.ok(d.assignments.some((a) => a.id === "ASG-001A-W009" && a.status === "confirmed"));
  });
  E.respond(d, "INV-001B-W028", "accept");
  check("Sean accepts: 27/30, 0 awaiting, 27 allocated, 3 unfilled", () => { const c = hero(d); assert.deepEqual([c.confirmed, c.awaiting, c.allocated, c.unfilled], [27, 0, 27, 3]); });
  check("employee cannot accept before office sends", () => assert.equal(d.invitations.some((i) => i.workerId === "W010" && i.shiftId === "SH-001A"), false));
  as(d, "U06");
  check("invite needs an allocating persona", () => assert.equal(E.sendInvitations(d, "SH-001A", ["W010"]).ok, false));
  as(d, "U03");
  E.sendInvitations(d, "SH-001A", ["W010"]); E.sendInvitations(d, "SH-001B", ["W029", "W030"]);
  check("unknown availability is not invitable", () => assert.equal(E.sendInvitations(d, "SH-001B", ["W072"]).ok, false));
  E.respond(d, inv(d, "SH-001A", "W010").id, "accept");
  const adam = inv(d, "SH-001B", "W029").id;
  E.respond(d, adam, "accept"); E.respond(d, adam, "accept");
  E.respond(d, inv(d, "SH-001B", "W030").id, "accept");
  check("hero full 30/30; double accept did not duplicate", () => {
    const c = hero(d); assert.deepEqual([c.confirmed, c.awaiting, c.unfilled], [30, 0, 0]);
    assert.equal(d.assignments.filter((a) => a.workerId === "W029" && a.status === "confirmed").length, 1);
  });
  check("desk confirmed 100, six gaps elsewhere", () => { const t = S.windowTotals(d, { desk: "Dublin events desk" }); assert.deepEqual([t.required, t.confirmed, t.unfilled], [106, 100, 6]); });
  check("fill task closed only when the event is full", () => assert.equal(d.tasks.find((t) => t.id === "TSK-0001")!.status, "done"));
  check("capacity never exceeded", () => {
    for (const sh of d.shifts) assert.ok(S.shiftCoverage(d, sh.id).confirmed <= sh.required, sh.id);
  });
}

console.log("Registration");
{
  const d = clone(s1);
  const r = E.registerWorker(d, { name: "Aidan Murphy", email: " Aidan.Murphy@EXAMPLE.test ", mobile: "", role: "Stagehand", locality: "Clondalkin" }, "Mark Walsh");
  const before = d.workers.length;
  check("re-entering Aidan's email opens existing profile, workforce unchanged", () => { assert.equal(r.ok, false); assert.equal(r.data.existing, "W009"); assert.equal(d.workers.length, before); });
  const n = E.registerWorker(d, { name: "Cara Lennox", email: "cara.lennox@example.test", mobile: "085 555 7711", role: "Event crew", locality: "Swords" }, "Mark Walsh");
  check("new registration creates one pending row with mapping pending", () => {
    assert.ok(n.ok); assert.equal(d.workers.length, before + 1);
    const nw = d.workers[d.workers.length - 1];
    assert.equal(nw.status, "pending_compliance"); assert.ok(!s1.workers.some((w) => w.id === nw.id));
    assert.equal(d.mappings.find((m) => m.localId === nw.id)!.status, "missing");
  });
}

console.log("Event day");
const s3 = buildStage(3);
{
  const d = clone(s3);
  check("stage 3 starts 30/30 with set-up hours recorded", () => {
    assert.equal(hero(d).confirmed, 30);
    assert.equal(S.lines(d, { shiftId: "SH-001A" }).filter((l) => l.complete).length, 10);
  });
  E.cancelAssignment(d, "ASG-001B-W014", "Family commitment", true);
  check("Chloé cancels: evening 19/20, event 29/30, one replacement task", () => {
    assert.equal(S.shiftCoverage(d, "SH-001B").confirmed, 19); assert.equal(hero(d).confirmed, 29);
    assert.equal(d.tasks.filter((t) => t.kind === "replacement" && t.status !== "done").length, 1);
  });
  as(d, "U03");
  E.sendInvitations(d, "SH-001B", ["W031"], { kind: "replacement", replaces: "ASG-001B-W014" });
  check("replacement invitation alone does not restore coverage", () => {
    assert.equal(S.shiftCoverage(d, "SH-001B").confirmed, 19);
    assert.equal(d.tasks.filter((t) => t.kind === "replacement" && t.status !== "done").length, 1);
  });
  E.respond(d, inv(d, "SH-001B", "W031").id, "accept");
  check("Orla accepts: 20/20, task closed, company back to 100", () => {
    assert.equal(S.shiftCoverage(d, "SH-001B").confirmed, 20);
    assert.equal(d.tasks.filter((t) => t.kind === "replacement" && t.status !== "done").length, 0);
    assert.equal(S.windowTotals(d, { desk: "Dublin events desk" }).confirmed, 100);
  });
  d.clock = zoned("2026-11-14", "16:50");
  E.journey(d, "ASG-001B-W021", "on_site");
  check("on site is not clocked in", () => { assert.equal(S.arrivalState(d, "ASG-001B-W021"), "On site"); assert.equal(S.attendanceState(d, "ASG-001B-W021"), "Not clocked in"); });
  d.clock = zoned("2026-11-14", "17:18");
  const rej = E.clock(d, "ASG-001B-W021", { kind: "in", method: "gps", distanceM: 240, accuracyM: 18 });
  check("240 m attempt rejected and recorded", () => { assert.equal(rej.ok, false); assert.equal(S.attendanceState(d, "ASG-001B-W021"), "Not clocked in"); assert.ok(d.clocks.some((c) => c.result === "rejected" && c.distanceM === 240)); });
  const poor = E.clock(clone(d), "ASG-001B-W021", { kind: "in", method: "gps", distanceM: 20, accuracyM: 400 });
  check("poor accuracy goes to review, not verified", () => assert.equal(poor.ok, false));
  const off = clone(d); E.clock(off, "ASG-001B-W021", { kind: "in", method: "gps", offline: true, distanceM: 20 });
  check("offline capture awaits verification", () => assert.equal(S.attendanceState(off, "ASG-001B-W021"), "Awaiting sync"));
  E.syncOffline(off, "ASG-001B-W021"); E.syncOffline(off, "ASG-001B-W021");
  check("offline sync reconciles once and still needs review", () => { assert.equal(off.clocks.filter((c) => c.method === "offline").length, 1); assert.equal(S.attendanceState(off, "ASG-001B-W021"), "Review required"); });
  const qrBad = E.clock(clone(d), "ASG-001B-W021", { kind: "in", method: "qr", token: "QR-V01-SH001A-v1" });
  check("wrong-shift QR rejected", () => assert.equal(qrBad.ok, false));
  d.clock = zoned("2026-11-14", "17:20");
  E.clock(d, "ASG-001B-W021", { kind: "in", method: "gps", distanceM: 42, accuracyM: 12 });
  check("42 m check accepted at 17:20", () => assert.equal(S.attendanceState(d, "ASG-001B-W021"), "Clocked in"));
}

console.log("Hours");
const s4 = buildStage(4);
{
  const d = clone(s4);
  const ls = S.lines(d, { eventId: "EVT-001" });
  check("30 lines, Orla in, Chloé out", () => {
    assert.equal(ls.length, 30);
    assert.ok(ls.some((l) => l.worker.id === "W031")); assert.ok(!ls.some((l) => l.worker.id === "W014"));
  });
  check("Niamh incomplete and blocks approval", () => assert.equal(ls.find((l) => l.worker.id === "W025")!.status, "incomplete"));
  check("Brian finishes 00:00 on Sunday 15 Nov, 7h worked, 1h extra", () => {
    const b = ls.find((l) => l.worker.id === "W012")!;
    assert.equal(b.approvedEnd, zoned("2026-11-15", "00:00")); assert.equal(b.workedMin, 420); assert.equal(b.extraMin, 60);
  });
  check("Owen 5h40m; Ciara 4h worked + 1h top-up", () => {
    assert.equal(ls.find((l) => l.worker.id === "W021")!.workedMin, 340);
    const c = ls.find((l) => l.worker.id === "W003")!; assert.deepEqual([c.workedMin, c.topupMin, c.payableMin], [240, 60, 300]);
  });
  as(d, "U05");
  E.proposeCorrection(d, "ASG-001B-W025", "out", "23:30", "Supervisor confirmed");
  const cid = d.corrections[0].id;
  check("Mark cannot approve his own correction", () => assert.equal(E.decideCorrection(d, cid, true).ok, false));
  as(d, "U02");
  E.decideCorrection(d, cid, true);
  check("original Niamh clock kept; correction recorded", () => {
    assert.equal(S.verifiedOut(d, "ASG-001B-W025"), undefined);
    assert.equal(d.corrections[0].decidedBy, "U02"); assert.equal(d.corrections[0].requestedBy, "U05");
  });
  const t = S.totals(S.lines(d, { eventId: "EVT-001" }));
  check("scheduled 170h, worked 170h10m, top-up 1h, payable 171h10m, extra 1h30m", () => {
    assert.deepEqual([t.count, t.scheduled, t.worked, t.topup, t.payable, t.extra], [30, 10200, 10210, 60, 10270, 90]);
  });
}

console.log("Handover");
const s5 = buildStage(5);
{
  const d = clone(s5);
  check("historical batch 12 accepted / 0 blocked / 60h; first 11 receipts unchanged", () => {
    const b = S.batchSummary(d, "BH-1111-01");
    assert.deepEqual([b.accepted, b.blocked, b.acceptedMin], [12, 0, 3600]);
    const r1 = S.batchSummary(s1, "BH-1111-01").items.filter((i) => i.state === "accepted").map((i) => i.receipt);
    assert.deepEqual(b.items.filter((i) => i.snapshot.workerId !== "W052").map((i) => i.receipt), r1);
  });
  const heroBatch = d.batches.find((b) => b.scope === "EVT-001")!;
  check("hero is a separate 30-line batch, 10,270 payable minutes", () => {
    const b = S.batchSummary(d, heroBatch.id); assert.deepEqual([b.items.length, b.accepted, b.totalMin], [30, 30, 10270]);
  });
  as(d, "U07");
  const before = d.items.length, receipts = d.items.map((i) => i.receipt).join();
  E.retryItems(d, d.items.filter((i) => i.batchId === heroBatch.id).map((i) => i.id));
  check("retrying accepted rows creates no duplicates", () => { assert.equal(d.items.length, before); assert.equal(d.items.map((i) => i.receipt).join(), receipts); });
  as(d, "U02");
  E.reopenLine(d, "ASG-001B-W012", "Client queried finish time");
  check("post-export reopen creates a new version, old receipt kept", () => {
    const l = S.lineFor(d, S.asgOf(d, "ASG-001B-W012"))!;
    assert.equal(l.version, 2); assert.equal(l.status, "ready");
    assert.ok(d.items.some((i) => i.assignmentId === "ASG-001B-W012" && i.version === 1 && i.state === "accepted"));
  });
}

console.log("Reset and automations");
check("stage rebuild is deterministic", () => assert.equal(JSON.stringify(buildStage(4)), JSON.stringify(s4)));
check("starting over after later stages restores the Thursday snapshot", () => {
  buildStage(5);
  const fresh = buildStage(1);
  assert.equal(fresh.venues.find((v) => v.id === "V01")!.meetingConfirmed, false);
  assert.equal(S.eventCoverage(fresh, "EVT-001").confirmed, 25);
});
{
  const d = clone(s3);
  E.setClock(d, zoned("2026-11-14", "16:00")); const n1 = d.messages.length;
  const x = clone(d); E.setClock(x, zoned("2026-11-14", "16:00"));
  check("advancing twice does not duplicate reminder runs", () => assert.equal(x.messages.length, n1));
}

console.log(passed + " checks passed" + (process.exitCode ? ", with failures" : ""));
