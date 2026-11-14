/* Five deterministic presenter stages. Each is the canonical seed replayed
   through the same actions the UI uses, so later stages are always coherent
   with earlier ones (no future clock-outs spliced into Thursday). */

import type { OssState } from "./model";
import { buildCanonical, mappingFor } from "./seed";
import {
  approveLines, cancelAssignment, clock, confirmMeetingPoint, createBatch, decideCorrection, decideProposal, journey,
  proposeCorrection, resolveMapping, respond, retryItems, sendBatch, sendInvitations, setAvailability, setClock, simulateClockIns, simulateClockOuts
} from "./engine";
import { lines } from "./selectors";
import { zoned } from "./time";

export const STAGES = [
  { n: 1, name: "Thursday planning", detail: "Canonical opening snapshot, Thu 12 Nov 16:00." },
  { n: 2, name: "Roster filled", detail: "Aidan's split answers, Sean, Leah, Adam and Sofia accepted. Thu 12 Nov 19:30." },
  { n: 3, name: "Event day", detail: "Saturday 15:30: set-up finished, evening crew due at 17:00. Chloé about to cancel." },
  { n: 4, name: "Hours review", detail: "Sunday 08:30: evening complete. Niamh's checkout missing; Owen late; Brian past midnight." },
  { n: 5, name: "Approved & handed over", detail: "Sunday 09:45: correction approved, 30 lines approved and sent, Jamie's row retried." }
];

const T = zoned;
function at(d: OssState, date: string, time: string, personaId = "U01") {
  setClock(d, T(date, time));
  d.ui.personaId = personaId;
}
const invFor = (d: OssState, shiftId: string, w: string) => d.invitations.filter((i) => i.shiftId === shiftId && i.workerId === w && i.status === "sent").pop()!;
const must = (r: { ok: boolean; message: string }, what: string) => { if (!r.ok) console.warn("[stage] " + what + ": " + r.message); return r; };

function stage2(d: OssState) {
  at(d, "2026-11-12", "16:20");
  const old = d.availExceptions.filter((x) => x.workerId === "W009").map((x) => x.id);
  must(setAvailability(d, "W009", [
    { start: T("2026-11-14", "07:00"), end: T("2026-11-14", "14:00"), kind: "available", note: "Saturday 07:00 to 14:00" },
    { start: T("2026-11-14", "14:00"), end: T("2026-11-15", "00:00"), kind: "unavailable", note: "Saturday from 14:00" }
  ], old), "aidan availability");
  at(d, "2026-11-12", "16:22"); must(respond(d, "INV-001A-W009", "accept"), "aidan morning");
  at(d, "2026-11-12", "16:23"); must(respond(d, "INV-001B-W009", "decline", "Not available after 14:00"), "aidan evening");
  at(d, "2026-11-12", "17:05"); must(respond(d, "INV-001B-W028", "accept"), "sean");
  at(d, "2026-11-12", "17:30", "U03"); must(decideProposal(d, "PRP-0001", true), "invite three");
  at(d, "2026-11-12", "18:10"); must(respond(d, invFor(d, "SH-001A", "W010").id, "accept"), "leah");
  at(d, "2026-11-12", "18:40"); must(respond(d, invFor(d, "SH-001B", "W029").id, "accept"), "adam");
  at(d, "2026-11-12", "19:05"); must(respond(d, invFor(d, "SH-001B", "W030").id, "accept"), "sofia");
  at(d, "2026-11-12", "19:30");
}
function stage3(d: OssState) {
  stage2(d);
  at(d, "2026-11-13", "10:00", "U02");
  must(confirmMeetingPoint(d, "V01", "OSS supervisor at the loading access. Mark Walsh confirms the gate with the venue on the day (sample)."), "meeting point");
  must(simulateClockIns(d, "SH-003A"), "nac in");
  must(simulateClockIns(d, "SH-004A"), "gsh in");
  must(simulateClockOuts(d, "SH-003A"), "nac out");
  must(simulateClockOuts(d, "SH-004A"), "gsh out");
  at(d, "2026-11-14", "07:15", "U02");
  const fri = lines(d).filter((l) => l.shift.id === "SH-003A" || l.shift.id === "SH-004A").map((l) => l.asg.id);
  must(approveLines(d, fri), "approve fri");
  at(d, "2026-11-14", "07:30", "U07");
  const b = createBatch(d, fri, "Friday events, 13 Nov", "EVT-003, EVT-004");
  if (b.ok) must(sendBatch(d, b.data.id), "send fri");
  d.ui.personaId = "U01";
  must(simulateClockIns(d, "SH-001A"), "setup in");
  must(simulateClockOuts(d, "SH-001A"), "setup out");
  at(d, "2026-11-14", "15:30");
}
function stage4(d: OssState) {
  stage3(d);
  at(d, "2026-11-14", "15:30");
  must(cancelAssignment(d, "ASG-001B-W014", "Family commitment came up; can't make tonight", true), "chloe");
  at(d, "2026-11-14", "15:40", "U03");
  must(sendInvitations(d, "SH-001B", ["W031"], { kind: "replacement", replaces: "ASG-001B-W014" }), "orla invite");
  at(d, "2026-11-14", "15:52"); must(respond(d, invFor(d, "SH-001B", "W031").id, "accept"), "orla");
  at(d, "2026-11-14", "16:50");
  must(journey(d, "ASG-001B-W021", "running_late", T("2026-11-14", "17:20"), "Bus diverted at the quays, about 20 minutes behind"), "owen late");
  must(simulateClockIns(d, "SH-001B"), "evening in");
  at(d, "2026-11-14", "17:18");
  clock(d, "ASG-001B-W021", { kind: "in", method: "gps", distanceM: 240, accuracyM: 18 });
  at(d, "2026-11-14", "17:20");
  must(clock(d, "ASG-001B-W021", { kind: "in", method: "gps", distanceM: 42, accuracyM: 12 }), "owen in");
  must(simulateClockOuts(d, "SH-001B"), "evening out");
  at(d, "2026-11-15", "08:30");
}
function stage5(d: OssState) {
  stage4(d);
  at(d, "2026-11-15", "09:05", "U05");
  must(proposeCorrection(d, "ASG-001B-W025", "out", "23:30", "Supervisor saw Niamh leave with the load-out crew at 23:30; her phone battery had died", "Confirmed with Niamh by phone on Sunday morning"), "propose");
  at(d, "2026-11-15", "09:12", "U02");
  must(decideCorrection(d, d.corrections.find((c) => c.assignmentId === "ASG-001B-W025")!.id, true), "approve correction");
  at(d, "2026-11-15", "09:20", "U02");
  const hero = lines(d, { eventId: "EVT-001" }).map((l) => l.asg.id);
  must(approveLines(d, hero), "approve hero");
  at(d, "2026-11-15", "09:30", "U07");
  const b = createBatch(d, hero, "3Arena: arena crew, 14 Nov", "EVT-001");
  if (b.ok) must(sendBatch(d, b.data.id), "send hero");
  at(d, "2026-11-15", "09:40", "U07");
  must(resolveMapping(d, "W052", "BH-CAND-" + (40210 + 52 * 7)), "jamie mapping");
  at(d, "2026-11-15", "09:42", "U07");
  must(retryItems(d, ["HO-H-W052"]), "jamie retry");
  at(d, "2026-11-15", "09:45");
  void mappingFor;
}

const CREW = ["W009", "W009", "W014", "W025", "W025"];
export function buildStage(n: number): OssState {
  const d = buildCanonical();
  if (n >= 2) {
    if (n === 2) stage2(d); else if (n === 3) stage3(d); else if (n === 4) stage4(d); else stage5(d);
  }
  d.ui = { ...d.ui, stage: n, personaId: "U01", crewWorkerId: CREW[n - 1], dirty: false, drawer: null, focus: null };
  return d;
}
