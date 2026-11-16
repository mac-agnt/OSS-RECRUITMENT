/* The event-staffing layer on top of the core records: right to work and the
   Stamp 2 hours cap, Working Time Act rest periods, reliability, licences,
   client preferences, call sheets and role mix per shift, client accounts,
   and the recruitment / sign-off / kit actions. Profile facts are
   deterministic per employee so every screen agrees. */

import type { Applicant, ApplicantStage, OssState, Shift, Worker } from "./model";
import * as Q from "./selectors";
import { audit, type Result } from "./engine";
import { NET_ACCOUNTS } from "./network";
import { addDays, dayKey, fmtHM, minutesBetween, ms, zoned } from "./time";

const h = (id: string) => { let x = 0; for (const c of id) x = (x * 31 + c.charCodeAt(0)) % 9973; return x; };
export const WEEK = { from: "2026-11-09", to: "2026-11-15" };

/* ── employee profile ─────────────────────────────────────────────────────── */
export type Rtw = "Irish citizen" | "EU citizen" | "Stamp 2 (student)" | "Stamp 4" | "Stamp 1G";
const RTW_FIXED: Record<string, Rtw> = { W018: "Stamp 2 (student)", W016: "Stamp 2 (student)", W030: "EU citizen", W023: "EU citizen", W005: "EU citizen", W002: "Stamp 4", W035: "Stamp 2 (student)", W027: "Stamp 2 (student)", W020: "Stamp 2 (student)" };
const PREFER: Record<string, string[]> = { C01: ["W011", "W013", "W021", "W025", "W001", "W031"], C02: ["W036", "W040", "W052", "W064"], C04: ["W037", "W041", "W044"], C03: ["W082", "W088"] };
const DNR: Record<string, [string, string][]> = { C01: [["W066", "Left post during egress, Oct"]], C02: [["W090", "Two no-shows this season"]], C04: [["W058", "Client asked not to rebook after Storehouse, Sep"]] };

export interface Profile {
  rtw: Rtw; earlierMin: number; uniform: string; transport: string; radio: boolean; languages: string[];
  licences: string[]; shifts90: number; attended: number; noShows: number; lateCancels: number; lates: number; rating: number;
  preferredBy: string[]; dnr: { clientId: string; reason: string }[]; teamLeader: boolean;
}
export function profile(w: Worker): Profile {
  const n = h(w.id);
  const idx = Number(w.id.slice(1));
  const rtw: Rtw = RTW_FIXED[w.id] || (n % 9 === 0 ? "Stamp 2 (student)" : n % 9 === 1 ? "Stamp 2 (student)" : n % 13 === 2 ? "Stamp 4" : n % 17 === 3 ? "Stamp 1G" : n % 5 === 4 ? "EU citizen" : "Irish citizen");
  const shifts90 = 4 + (n % 19);
  const noShows = w.id === "W090" ? 2 : n % 23 === 0 ? 1 : 0;
  const lateCancels = w.id === "W014" ? 1 : n % 17 === 0 ? 1 : 0;
  const lates = w.id === "W021" ? 2 : n % 11 === 0 ? 1 : 0;
  const attended = Math.max(0, shifts90 - noShows);
  const licences: string[] = [];
  if (w.roles.includes("Steward") && n % 3 === 0) licences.push("PSA licence (event security)");
  if (w.roles.includes("Site crew") || (w.roles.includes("General operative") && n % 4 === 0)) licences.push("Forklift (CSCS)");
  if (w.roles.includes("Stagehand") && n % 3 === 1) licences.push("Working at Heights");
  if (n % 5 === 0) licences.push("Garda vetted");
  if (n % 7 === 0) licences.push("Manual Handling instructor");
  const preferredBy = Object.keys(PREFER).filter((c) => PREFER[c].includes(w.id));
  const dnr = Object.keys(DNR).flatMap((c) => DNR[c].filter(([x]) => x === w.id).map(([, reason]) => ({ clientId: c, reason })));
  return {
    rtw, earlierMin: rtw.startsWith("Stamp 2") ? (w.id === "W018" ? 16 * 60 : w.id === "W027" ? 14 * 60 : 300 + (n % 3) * 180) : 0,
    uniform: ["S", "M", "M", "L", "L", "XL"][n % 6], transport: ["Public transport", "Own car", "Public transport", "Bike", "Lift share"][n % 5],
    radio: n % 3 !== 2, languages: w.name.match(/Silva|Costa|Petrescu|Kowalska|Okafor|Nwosu/) ? ["English", w.name.includes("Silva") || w.name.includes("Costa") ? "Portuguese" : w.name.includes("Petrescu") ? "Romanian" : w.name.includes("Kowalska") ? "Polish" : "Igbo"] : ["English"],
    licences, shifts90, attended, noShows, lateCancels, lates, rating: Math.max(3, 5 - noShows - (lateCancels ? 1 : 0) - (lates > 1 ? 1 : 0)) - (n % 9 === 5 ? 0.5 : 0),
    preferredBy, dnr, teamLeader: idx % 10 === 1 || ["W011", "W025", "W036", "W052", "W064", "W082"].includes(w.id)
  };
}
export const reliability = (p: Profile) => (p.shifts90 ? Math.round((p.attended / p.shifts90) * 1000) / 10 : 100);

/* ── Stamp 2 weekly hours (20h in term time; 40h Jun to Sep and 15 Dec to 15 Jan) ── */
export const STAMP2_CAP_MIN = 20 * 60;
export function weekMinutes(s: OssState, wid: string, from = WEEK.from, to = WEEK.to) {
  const w = Q.worker(s, wid);
  const p = profile(w);
  const booked = Q.asgByWorker(s, wid).filter((a) => a.status === "confirmed").map((a) => Q.shiftOf(s, a.shiftId))
    .filter((x) => dayKey(x.start) >= from && dayKey(x.start) <= to).reduce((t, x) => t + minutesBetween(x.start, x.end), 0);
  return { earlier: p.earlierMin, booked, total: p.earlierMin + booked };
}
export function stamp2Check(s: OssState, wid: string, sh?: Shift) {
  const p = profile(Q.worker(s, wid));
  if (!p.rtw.startsWith("Stamp 2")) return null;
  const wk = weekMinutes(s, wid);
  const add = sh && !s.assignments.some((a) => a.workerId === wid && a.shiftId === sh.id && a.status === "confirmed") ? minutesBetween(sh.start, sh.end) : 0;
  const after = wk.total + add;
  return { ...wk, add, after, over: after > STAMP2_CAP_MIN, near: after > STAMP2_CAP_MIN - 4 * 60 };
}

/* ── Working Time Act: 11 hours rest between shifts ───────────────────────── */
export function restPairs(s: OssState) {
  const by = new Map<string, { sh: Shift; end: string }[]>();
  for (const a of s.assignments) {
    if (a.status !== "confirmed") continue;
    const sh = Q.shiftOf(s, a.shiftId);
    const out = Q.verifiedOut(s, a.id);
    const corr = Q.rowsBy(s.corrections, "asg", (c) => c.assignmentId, a.id).filter((c) => c.field === "out" && c.status === "approved").pop();
    by.set(a.workerId, (by.get(a.workerId) || []).concat([{ sh, end: corr?.proposed || out?.at || sh.end }]));
  }
  const pairs: { workerId: string; a: Shift; b: Shift; restMin: number }[] = [];
  by.forEach((list, wid) => {
    const l = list.sort((x, y) => x.sh.start.localeCompare(y.sh.start));
    for (let i = 1; i < l.length; i++) pairs.push({ workerId: wid, a: l[i - 1].sh, b: l[i].sh, restMin: minutesBetween(l[i - 1].end, l[i].sh.start) });
  });
  return pairs.sort((x, y) => x.restMin - y.restMin);
}
export const restIfOffered = (s: OssState, wid: string, sh: Shift) => {
  const mine = s.assignments.filter((a) => a.workerId === wid && a.status === "confirmed").map((a) => Q.shiftOf(s, a.shiftId)).filter((x) => x.id !== sh.id);
  const gaps = mine.map((x) => (ms(x.end) <= ms(sh.start) ? minutesBetween(x.end, sh.start) : ms(sh.end) <= ms(x.start) ? minutesBetween(sh.end, x.start) : -1)).filter((g) => g >= 0 && g < 24 * 60);
  return gaps.length ? Math.min(...gaps) : null;
};

/* ── call sheets and role mix ─────────────────────────────────────────────── */
export interface CallSheet {
  runOfShow: [string, string][]; calls: { shiftId: string; time: string; where: string; who: string }[];
  roleMix: Record<string, [string, number][]>; accreditation: string; radio: string; uniform: string; briefing: string;
  transport: string; welfare: string; kit: [string, number][]; signOffBy: string; ratio: string; notes: string[];
}
export const CALL_SHEETS: Record<string, CallSheet> = {
  "EVT-001": {
    runOfShow: [["07:45", "Set-up crew call, loading bay"], ["08:00", "Load-in starts: barriers, stage deck, front-of-house"], ["13:00", "Set-up crew released"], ["16:30", "Event crew call and briefing"], ["17:00", "Event crew on positions"], ["18:30", "Doors"], ["20:00", "Show"], ["22:45", "Curfew"], ["23:00", "Egress complete, crew stood down"]],
    calls: [{ shiftId: "SH-001A", time: "07:45", where: "Loading bay, North Wall Quay", who: "Report to Mark Walsh" }, { shiftId: "SH-001B", time: "16:30", where: "Loading bay, Gate C", who: "Briefing with Mark Walsh and the venue duty manager" }],
    roleMix: { "SH-001A": [["Stagehand", 6], ["General operative", 4]], "SH-001B": [["Event crew", 12], ["Steward", 6], ["Team leader", 2]] },
    accreditation: "Wristbands at the Gate C hut. Show your OSS Crew ID on your phone.", radio: "Channel 4 (OSS). Team leaders and supervisor carry radios.",
    uniform: "Black OSS t-shirt, black trousers. Hi-vis issued on site.", briefing: "16:30 at the loading bay: positions, emergency exits, egress plan, radio calls.",
    transport: "Luas Red Line to The Point. No crew parking.", welfare: "15-minute break after 4h30. Water and meal voucher at the crew room.",
    kit: [["Hi-vis vests", 30], ["Radios", 4], ["Gloves (pairs)", 30], ["Torches", 6]], signOffBy: "Booking desk, Aiken Promotions", ratio: "1 team leader per 10 crew", notes: ["Under-18 attendees expected: Garda-vetted crew on front-of-house.", "Manual Handling required for both shifts."]
  },
  "EVT-002": {
    runOfShow: [["09:45", "Stadium ops crew call"], ["10:00", "Ops crew on positions: turnstiles, concourse set-up"], ["10:45", "Steward call and briefing, West Stand"], ["11:00", "Stewards on positions"], ["12:30", "Gates open"], ["15:00", "Kick-off"], ["17:00", "Full time, egress"], ["19:00", "Stand down"]],
    calls: [{ shiftId: "SH-002B", time: "09:45", where: "Gate D staff entrance", who: "Report to the Lansdowne ops supervisor" }, { shiftId: "SH-002A", time: "10:45", where: "West Stand briefing room", who: "Report to Mark Walsh" }],
    roleMix: { "SH-002A": [["Steward", 26], ["Team leader", 3], ["Supervisor", 1]], "SH-002B": [["Event crew", 12], ["General operative", 6]] },
    accreditation: "Accreditation passes issued at Gate D. Photo ID required.", radio: "Channel 2 (stewarding). Supervisors and team leaders.", uniform: "OSS steward jacket issued; black trousers, safety boots.",
    briefing: "10:45 in the West Stand: zone allocation, crowd safety, emergency procedures.", transport: "DART to Lansdowne Road.", welfare: "30-minute break rota from 13:00. Packed lunch provided.",
    kit: [["Steward jackets", 30], ["Radios", 4], ["Hi-vis vests", 18], ["Clickers", 8]], signOffBy: "Gráinne Lacey, Lansdowne Event Services", ratio: "1 team leader per 10 stewards", notes: ["Stewards work to the stadium safety plan; positions by zone.", "PSA-licensed staff placed on the turnstiles."]
  },
  "EVT-003": {
    runOfShow: [["15:45", "Crew call, staff entrance"], ["16:00", "Spectator set-up"], ["17:30", "Doors"], ["18:00", "Competition"], ["21:30", "Egress"], ["22:00", "Stand down"]],
    calls: [{ shiftId: "SH-003A", time: "15:45", where: "Staff entrance, Blanchardstown", who: "Report to Paul Sheridan" }], roleMix: { "SH-003A": [["Event crew", 10], ["General operative", 4], ["Team leader", 2]] },
    accreditation: "Lanyards at the staff entrance.", radio: "Channel 1.", uniform: "Black OSS t-shirt, non-slip shoes.", briefing: "15:50 poolside: slip hazards and spectator flow.", transport: "Bus 38 or 39.", welfare: "Break rota from 19:00.",
    kit: [["Lanyards", 16], ["Radios", 2]], signOffBy: "Paul Sheridan, National Sports Event Services", ratio: "1 team leader per 8 crew", notes: ["Wet deck: non-slip footwear checked at the door."]
  },
  "EVT-004": {
    runOfShow: [["17:15", "Crew call, events entrance"], ["17:30", "Floor set and bar prep"], ["19:00", "Guests arrive"], ["19:45", "Dinner service"], ["22:30", "Last orders"], ["23:30", "Reset and stand down"]],
    calls: [{ shiftId: "SH-004A", time: "17:15", where: "Events entrance, St James's Gate", who: "Report to Ross Hayden" }], roleMix: { "SH-004A": [["Catering assistant", 10], ["Team leader", 2]] },
    accreditation: "Name badges at the events desk.", radio: "None; team leaders on phones.", uniform: "Black shirt, black trousers, black non-slip shoes.", briefing: "17:20: menu, allergens, service timings.", transport: "Luas Red Line to James's.", welfare: "Staff meal at 18:30.",
    kit: [["Aprons", 12], ["Name badges", 12]], signOffBy: "Ross Hayden, Quayside Events", ratio: "1 team leader per 6", notes: ["Food Safety Level 1 required for all catering assistants."]
  }
};
export const roleMix = (sh: Shift): [string, number][] => CALL_SHEETS[sh.eventId]?.roleMix[sh.id] || [[sh.roles[0], sh.required]];

/* ── client accounts ──────────────────────────────────────────────────────── */
export interface Account { manager: string; portal: "Live" | "Invited" | "Not set up"; code: string; eventsYtd: number; hoursYtd: number; fill12: number; standards: string[]; signOff: string; tier: string }
export const ACCOUNTS: Record<string, Account> = {
  C01: { manager: "U02", portal: "Live", code: "OSS-AIKEN-26", eventsYtd: 41, hoursYtd: 6840, fill12: 97.8, standards: ["Safety boots", "Hi-vis", "Manual Handling", "Garda vetting for youth gigs"], signOff: "Booking desk", tier: "Key account" },
  C02: { manager: "U04", portal: "Live", code: "OSS-LES-26", eventsYtd: 28, hoursYtd: 9120, fill12: 95.1, standards: ["Steward training", "PSA licence on turnstiles", "Safety boots"], signOff: "Gráinne Lacey", tier: "Key account" },
  C03: { manager: "U04", portal: "Invited", code: "OSS-NSES-26", eventsYtd: 9, hoursYtd: 1260, fill12: 93.4, standards: ["Non-slip footwear"], signOff: "Paul Sheridan", tier: "Regular" },
  C04: { manager: "U03", portal: "Live", code: "OSS-QSE-26", eventsYtd: 34, hoursYtd: 3980, fill12: 98.6, standards: ["Food Safety Level 1", "Black uniform"], signOff: "Ross Hayden", tier: "Key account" },
  C05: { manager: "U04", portal: "Not set up", code: "-", eventsYtd: 3, hoursYtd: 610, fill12: 91.0, standards: ["Safety boots", "Hi-vis", "Manual Handling"], signOff: "Ellen Mahon", tier: "New" },
  ...NET_ACCOUNTS
};
export const preferredCrew = (clientId: string) => PREFER[clientId] || [];
export const dnrList = (clientId: string) => (DNR[clientId] || []).map(([workerId, reason]) => ({ workerId, reason }));

/* ── actions (audited like every other change) ────────────────────────────── */
const ok = (message: string): Result => ({ ok: true, message });
const ORDER: ApplicantStage[] = ["applied", "screened", "induction", "inducted", "docs", "active"];
const STAGE_LABEL: Record<ApplicantStage, string> = { applied: "Applied", screened: "Phone screened", induction: "Induction booked", inducted: "Inducted", docs: "Documents and payroll", active: "Active crew", withdrawn: "Withdrawn" };
export const stageLabel = (st: ApplicantStage) => STAGE_LABEL[st];
export function advanceApplicant(d: OssState, id: string): Result {
  const a = d.ext.applicants.find((x) => x.id === id);
  if (!a) return { ok: false, message: "Applicant not found" };
  const i = ORDER.indexOf(a.stage);
  if (i < 0 || i >= ORDER.length - 1) return ok(a.name + " is already " + STAGE_LABEL[a.stage].toLowerCase() + ".");
  const before = a.stage;
  a.stage = ORDER[i + 1];
  if (a.stage === "induction" && !a.inductionId) a.inductionId = nextInduction(d)?.id;
  if (a.stage === "docs") a.docs.rtw = true;
  if (a.stage === "active") a.docs = { mh: true, sp: a.docs.sp, rtw: true, bank: true };
  audit(d, d.users.find((u) => u.id === d.ui.personaId)!.name, "applicant.advanced", { type: "applicant", id, label: a.name }, a.name + ": " + STAGE_LABEL[before] + " → " + STAGE_LABEL[a.stage], "operations");
  return ok(a.name + " moved to " + STAGE_LABEL[a.stage].toLowerCase() + ".");
}
export function withdrawApplicant(d: OssState, id: string): Result {
  const a = d.ext.applicants.find((x) => x.id === id)!;
  a.stage = "withdrawn";
  audit(d, "Shane Esler", "applicant.withdrawn", { type: "applicant", id, label: a.name }, a.name + " withdrawn from the pipeline", "operations");
  return ok(a.name + " withdrawn.");
}
export function bookInduction(d: OssState, id: string, inductionId: string): Result {
  const a = d.ext.applicants.find((x) => x.id === id)!;
  const ind = d.ext.inductions.find((x) => x.id === inductionId)!;
  if (d.ext.applicants.filter((x) => x.inductionId === inductionId && x.stage === "induction").length >= ind.capacity) return { ok: false, message: "That induction is full." };
  a.inductionId = inductionId; a.stage = "induction";
  audit(d, "Shane Esler", "induction.booked", { type: "applicant", id, label: a.name }, a.name + " booked onto " + ind.kind.toLowerCase(), "operations");
  return ok(a.name + " booked. They get the details in a text and email.");
}
export const nextInduction = (d: OssState) => d.ext.inductions.find((x) => ms(x.at) > ms(d.clock) && d.ext.applicants.filter((a) => a.inductionId === x.id && a.stage === "induction").length < x.capacity);
export function signOffHours(d: OssState, eventId: string, by: string, minutes: number): Result {
  d.ext.signoffs[eventId] = { by, at: d.clock, note: "Signed off in the client portal", hours: minutes };
  audit(d, by, "client.signoff", { type: "event", id: eventId, label: Q.eventOf(d, eventId).name }, by + " signed off " + fmtHM(minutes) + " for " + Q.eventOf(d, eventId).name.split(":")[0] + " in the client portal", "approvals");
  return ok("Hours signed off by the client.");
}
export function kitMove(d: OssState, eventId: string, item: string, dir: "out" | "back", n: number): Result {
  const k = (d.ext.kit[eventId] = d.ext.kit[eventId] || {});
  const row = (k[item] = k[item] || { out: 0, back: 0 });
  row[dir] = Math.max(0, row[dir] + n);
  return ok(item + ": " + row.out + " out, " + row.back + " back.");
}
export const pipeline = (s: OssState, campaign?: string) => {
  const l = s.ext.applicants.filter((a) => !campaign || a.campaign === campaign);
  return ORDER.map((st) => ({ stage: st, label: STAGE_LABEL[st], list: l.filter((a) => a.stage === st) }));
};
export const daysBetween = (a: string, b: string) => Math.round((ms(b) - ms(a)) / 864e5);
export { addDays, zoned };
export type { Applicant };
