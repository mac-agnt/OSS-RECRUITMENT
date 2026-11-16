/* The canonical opening snapshot: Thursday 12 November 2026, 16:00 Europe/Dublin.
   Deterministic: no Math.random, no real clock. Every total on every screen is
   derived from these rows. All people other than Shane Esler are fictional. */

import { buildExt } from "./extSeed";
import { buildNetwork, NET_CLIENTS, NET_CLIENT_REMOTE, NET_CONTACTS, NET_TEAMS, NET_USERS, NET_VENUES, settleNetwork } from "./network";
import type {
  AdminUser, AgentProposal, AgentRun, Assignment, AuditEvent, AvailabilityException, AvailabilityRule, Automation,
  Client, ClientContact, ClockEntry, Decision, DocType, EventBooking, HandoverBatch, HandoverItem, IntegrationMapping,
  Invitation, Message, OssState, ProgrammePlan, Rules, Shift, StandbyEntry, Team, Thread, TimesheetApproval, Venue,
  Worker, WorkerDocument, WorkflowTask
} from "./model";
import { addMin, zoned } from "./time";

export const SEED_VERSION = "oss-pulse-2026-11-12-v9";
export const OPENING_CLOCK = zoned("2026-11-12", "16:00");
export const WINDOW = { from: "2026-11-12", to: "2026-11-18" };
export const HERO_EVENT = "EVT-001";

const T = (date: string, time: string) => zoned(date, time);

/* ── office personas ─────────────────────────────────────────────────────── */
export const USERS: AdminUser[] = [
  { id: "U01", name: "Shane Esler", role: "Director of Operations", email: "shane@ossrecruitment.ie", team: "Management", initials: "SE", known: true, perms: ["manage", "allocate", "approve_hours", "message", "handover", "approve_docs", "edit_hours", "supervise"] },
  { id: "U02", name: "Aoife Byrne", role: "Events Manager", email: "demo.aoife@ossrecruitment.ie", team: "Events", initials: "AB", perms: ["manage", "allocate", "approve_hours", "message"] },
  { id: "U03", name: "Darragh Kelly", role: "Events Coordinator", email: "demo.darragh@ossrecruitment.ie", team: "Events", initials: "DK", perms: ["allocate", "message"] },
  { id: "U04", name: "Sarah Nolan", role: "Events Coordinator", email: "demo.sarah@ossrecruitment.ie", team: "Events", initials: "SN", perms: ["allocate", "message"] },
  { id: "U05", name: "Mark Walsh", role: "Site Supervisor", email: "demo.mark@ossrecruitment.ie", team: "Events", initials: "MW", perms: ["supervise", "message"] },
  { id: "U06", name: "Nessa Doyle", role: "Compliance Administrator", email: "demo.nessa@ossrecruitment.ie", team: "Compliance", initials: "ND", perms: ["approve_docs"] },
  { id: "U07", name: "Emma Ryan", role: "Hours Administrator", email: "demo.emma@ossrecruitment.ie", team: "Hours & payroll handover", initials: "ER", perms: ["edit_hours", "handover"] },
  { id: "U08", name: "Conor Murphy", role: "Recruitment Lead", email: "demo.conor@ossrecruitment.ie", team: "Recruitment", initials: "CM", perms: ["message"] }
];

const TEAMS: Team[] = [
  { id: "TM1", name: "Management", members: ["U01"], note: "Capacity, risk and sign-off." },
  { id: "TM2", name: "Dublin events desk", members: ["U02", "U03", "U04", "U05"], note: "Aiken, 3Arena, Aviva and the Dublin venues. Sets the standard for the other desks." },
  { id: "TM3", name: "Compliance", members: ["U06"], note: "Document review and expiry." },
  { id: "TM4", name: "Hours & payroll handover", members: ["U07"], note: "Approved hours into Bullhorn." },
  { id: "TM5", name: "Recruitment", members: ["U08"], note: "Construction and events candidates (four or five people in the real team)." }
];

/* ── workers: 96 sample profiles ─────────────────────────────────────────── */
type WSpec = [string, string, string[], string];
const NAMED: WSpec[] = [
  ["W001", "Declan Farrell", ["Stagehand", "General operative"], "Dublin city"],
  ["W002", "Grace Okafor", ["Stagehand", "Event crew"], "Clondalkin"],
  ["W003", "Ciara Kelly", ["Stagehand", "General operative"], "Tallaght"],
  ["W004", "Tadhg Moran", ["General operative", "Site crew"], "Lucan"],
  ["W005", "Marta Kowalska", ["Stagehand", "Event crew"], "Swords"],
  ["W006", "Ronan Fitzpatrick", ["Site crew", "General operative"], "Bray"],
  ["W007", "Aisling Quinn", ["Stagehand", "Event crew"], "Dublin city"],
  ["W008", "Kevin Hughes", ["General operative", "Stagehand"], "Tallaght"],
  ["W009", "Aidan Murphy", ["Stagehand", "Event crew"], "Clondalkin"],
  ["W010", "Leah Byrne", ["Stagehand", "General operative"], "Lucan"],
  ["W011", "Cillian Ward", ["Event crew", "Stagehand"], "Swords"],
  ["W012", "Brian Doyle", ["Event crew", "General operative"], "Dublin city"],
  ["W013", "Siobhán Daly", ["Event crew", "Steward"], "Bray"],
  ["W014", "Chloé Ryan", ["Event crew", "Steward"], "Dublin city"],
  ["W015", "Darren Keogh", ["Event crew", "Stagehand"], "Tallaght"],
  ["W016", "Ifeoma Nwosu", ["Event crew", "Steward"], "Clondalkin"],
  ["W017", "Shauna Lynch", ["Event crew"], "Lucan"],
  ["W018", "Mateus Silva", ["Event crew", "General operative"], "Swords"],
  ["W019", "Róisín Healy", ["Event crew", "Steward"], "Bray"],
  ["W020", "Jack Delaney", ["Event crew", "Stagehand"], "Dublin city"],
  ["W021", "Owen Clarke", ["Event crew", "Stagehand"], "Tallaght"],
  ["W022", "Niall Corcoran", ["Event crew"], "Clondalkin"],
  ["W023", "Ana Petrescu", ["Event crew", "Steward"], "Lucan"],
  ["W024", "Fionn Gallagher", ["Event crew", "Stagehand"], "Swords"],
  ["W025", "Niamh Walsh", ["Event crew", "Steward"], "Bray"],
  ["W026", "Liam Tierney", ["Event crew", "General operative"], "Dublin city"],
  ["W027", "Megan Foley", ["Event crew", "Steward"], "Tallaght"],
  ["W028", "Sean McKenna", ["Event crew", "Stagehand"], "Clondalkin"],
  ["W029", "Adam O'Neill", ["Event crew", "Stagehand"], "Lucan"],
  ["W030", "Sofia Costa", ["Event crew", "Steward"], "Dublin city"],
  ["W031", "Orla Kavanagh", ["Event crew", "Stagehand"], "Swords"],
  ["W032", "Paddy Whelan", ["Stagehand", "Event crew"], "Bray"],
  ["W033", "Eoin Brennan", ["Stagehand", "Event crew"], "Tallaght"],
  ["W034", "Maeve Duffy", ["Event crew", "Steward"], "Clondalkin"],
  ["W035", "Tomas Nowak", ["General operative", "Stagehand"], "Lucan"],
  ["W052", "Jamie Allen", ["Steward", "Catering assistant"], "Dublin city"]
];
const FIRST = ["Alan", "Bríd", "Cathal", "Dara", "Eimear", "Fiachra", "Gemma", "Hugh", "Isabel", "Joseph", "Karen", "Luke", "Mairéad",
  "Nathan", "Olivia", "Piotr", "Rachel", "Stephen", "Tara", "Ultan", "Vanessa", "William", "Yusuf", "Zofia", "Aaron", "Bláthnaid",
  "Colm", "Deirdre", "Emeka", "Fergal", "Gráinne", "Harry", "Ines", "Jonas", "Katie", "Lorcan", "Mia", "Neil", "Oisín", "Priya",
  "Rory", "Saoirse", "Tiernan", "Una", "Victor", "Wiktoria", "Ailbhe", "Bartek", "Caoimhe", "Diarmuid", "Elena", "Fintan", "Gavin",
  "Hannah", "Ivan", "Jessica", "Kian", "Laura", "Malachy", "Nora", "Pádraig"];
const LAST = ["Brady", "Carroll", "Doran", "Egan", "Flood", "Geraghty", "Hennessy", "Kearney", "Lawlor", "Maher", "Power", "Reilly",
  "Sheridan", "Tobin", "Phelan", "Mulligan", "Costello", "Dempsey", "Behan", "Cullen", "Duggan", "Fahy", "Garvey", "Horgan", "Joyce",
  "Keane", "Lennon", "McCann", "Nevin", "Owens", "Quigley", "Rafferty", "Shiels", "Traynor", "Vaughan", "Woods", "Abara", "Santos",
  "Novak", "Ionescu", "Mensah", "Kaminski", "Moloney", "Cregan", "Hogan", "Furlong", "Brophy", "Kinsella", "Mahon", "Devlin",
  "Grogan", "Hayden", "Lacey", "Molloy", "Nugent", "Rooney", "Staunton", "Ward", "Whelan", "Barry", "Cassidy"];
const PLACES = ["Dublin city", "Tallaght", "Clondalkin", "Lucan", "Swords", "Bray", "Blanchardstown", "Naas", "Drogheda"];

export const wid = (n: number) => "W" + String(n).padStart(3, "0");
function rolesFor(n: number): string[] {
  if (n >= 36 && n <= 47) return ["Catering assistant", "Steward"];
  if (n >= 48 && n <= 63) return ["Steward"];
  if (n >= 64 && n <= 79) return ["Event crew", "General operative"];
  if (n === 80) return ["Steward"];
  if (n === 81) return ["Event crew", "General operative"];
  return ["Event crew", "General operative"];
}

function buildWorkers(): Worker[] {
  const named = new Map(NAMED.map((w) => [w[0], w]));
  const used = new Set(NAMED.map((w) => w[1]));
  const out: Worker[] = [];
  let k = 0;
  for (let n = 1; n <= 96; n++) {
    const id = wid(n);
    const spec = named.get(id);
    let name: string, roles: string[], locality: string;
    if (spec) { name = spec[1]; roles = spec[2]; locality = spec[3]; }
    else {
      do { name = FIRST[(k * 7 + 3) % FIRST.length] + " " + LAST[(k * 11 + 5) % LAST.length]; k++; } while (used.has(name));
      used.add(name);
      roles = rolesFor(n);
      locality = PLACES[(n * 5) % PLACES.length];
    }
    const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
    const hero3Arena = ["W010", "W029", "W030", "W031"].includes(id) || n <= 28;
    out.push({
      id, name, roles, locality,
      email: slug + "@example.test",
      mobile: "085 555 " + String(1000 + n * 37).slice(-4),
      joined: (2017 + (n % 9)) + "-" + String((n % 12) + 1).padStart(2, "0") + "-" + String((n % 27) + 1).padStart(2, "0"),
      status: "active",
      priorShifts: 4 + ((n * 13) % 37),
      priorVenues: hero3Arena ? ["3Arena", n % 2 ? "Aviva Stadium" : "Guinness Storehouse"] : [n % 3 ? "Aviva Stadium" : "National Aquatic Centre"]
    });
  }
  return out;
}

/* ── clients, contacts, venues ───────────────────────────────────────────── */
const CLIENTS: Client[] = [
  { id: "C01", name: "Aiken Promotions", fictional: false, sector: "Live music promoter",
    provenance: "Live music promoter, regular OSS client." },
  { id: "C02", name: "Lansdowne Event Services Ltd", fictional: true, sector: "Stadium operations", provenance: "Fictional client for the demo." },
  { id: "C03", name: "National Sports Event Services Ltd", fictional: true, sector: "Sports events", provenance: "Fictional client for the demo." },
  { id: "C04", name: "Quayside Events Ltd", fictional: true, sector: "Corporate events", provenance: "Fictional client for the demo." },
  { id: "C05", name: "Dockside Production Services Ltd", fictional: true, sector: "Conference production", provenance: "Fictional client for the demo." }
];
const CONTACTS: ClientContact[] = [
  { id: "CC01", clientId: "C01", name: "Booking desk", role: "Production bookings", email: "bookings.sample@example.test", phone: "01 555 0140" },
  { id: "CC02", clientId: "C02", name: "Gráinne Lacey", role: "Operations manager", email: "grainne.lacey@example.test", phone: "01 555 0152" },
  { id: "CC03", clientId: "C03", name: "Paul Sheridan", role: "Event lead", email: "paul.sheridan@example.test", phone: "01 555 0161" },
  { id: "CC04", clientId: "C04", name: "Niamh Brophy", role: "Account director", email: "niamh.brophy@example.test", phone: "01 555 0177" },
  { id: "CC05", clientId: "C04", name: "Ross Hayden", role: "Venue producer", email: "ross.hayden@example.test", phone: "01 555 0178" },
  { id: "CC06", clientId: "C05", name: "Ellen Mahon", role: "Production manager", email: "ellen.mahon@example.test", phone: "01 555 0189" }
];
const VENUES: Venue[] = [
  { id: "V01", name: "3Arena", area: "North Wall Quay, Dublin 1", meetingPoint: "Loading bay on North Wall Quay. Gate to be confirmed by the venue.",
    meetingConfirmed: false, geofenceM: 50, supervisorId: "U05", qrToken: "QR-V01-SH001B-v1", methods: ["gps", "qr"], county: "Dublin", region: "Dublin", lat: 53.3475, lng: -6.2286, capacity: 13000 },
  { id: "V02", name: "Aviva Stadium", area: "Lansdowne Road, Dublin 4", meetingPoint: "Meeting point awaiting confirmation.", meetingConfirmed: false, geofenceM: 50, supervisorId: "U05", qrToken: "QR-V02-v1", methods: ["gps", "qr"], county: "Dublin", region: "Dublin", lat: 53.3352, lng: -6.2285, capacity: 51700 },
  { id: "V03", name: "National Aquatic Centre", area: "Blanchardstown, Dublin 15", meetingPoint: "Staff entrance, sample instruction confirmed with client.", meetingConfirmed: true, geofenceM: 50, supervisorId: "U05", qrToken: "QR-V03-v1", methods: ["gps"], county: "Dublin", region: "Dublin", lat: 53.399, lng: -6.361, capacity: 2500 },
  { id: "V04", name: "Guinness Storehouse", area: "St James's Gate, Dublin 8", meetingPoint: "Events entrance, sample instruction confirmed with client.", meetingConfirmed: true, geofenceM: 50, supervisorId: "U05", qrToken: "QR-V04-v1", methods: ["gps", "qr"], county: "Dublin", region: "Dublin", lat: 53.3419, lng: -6.2867, capacity: 1600 }
];

/* ── bookings and shifts ─────────────────────────────────────────────────── */
const PPE_HERO = ["Safety boots", "High-visibility jacket", "Gloves"];
const SETUP_ROLES = ["Stagehand", "General operative", "Event crew", "Site crew"];
const EVENT_ROLES = ["Event crew", "Stagehand", "General operative", "Steward"];

const EVENTS: EventBooking[] = [
  { id: "EVT-001", name: "3Arena: arena crew", clientId: "C01", venueId: "V01", date: "2026-11-14", status: "confirmed", ownerId: "U03", approverId: "U02", supervisorId: "U05",
    ppe: PPE_HERO, createdAt: T("2026-11-06", "11:20"), sample: true, kind: "Concert", desk: "Dublin events desk", audience: 12400,
    brief: "Set-up crew in the morning to build the stage and barriers, event crew in the evening for the show. Report to the OSS supervisor at the loading bay." },
  { id: "EVT-002", name: "Aviva: stadium operations", clientId: "C02", venueId: "V02", date: "2026-11-15", status: "confirmed", ownerId: "U04", approverId: "U02", supervisorId: "U05",
    ppe: ["High-visibility jacket", "Safety boots"], createdAt: T("2026-11-02", "09:40"), kind: "Sport", desk: "Dublin events desk", audience: 51000, brief: "Stewarding and stadium operations crew for Sunday's fixture." },
  { id: "EVT-003", name: "National Aquatic Centre: event support", clientId: "C03", venueId: "V03", date: "2026-11-13", status: "confirmed", ownerId: "U04", approverId: "U02", supervisorId: "U05",
    ppe: ["Non-slip footwear"], createdAt: T("2026-11-04", "14:05"), kind: "Sport", desk: "Dublin events desk", audience: 2100, brief: "Poolside and spectator support for the gymnastics and aquatics event." },
  { id: "EVT-004", name: "Guinness Storehouse: corporate evening", clientId: "C04", venueId: "V04", date: "2026-11-13", status: "confirmed", ownerId: "U03", approverId: "U02", supervisorId: "U05",
    ppe: ["Black uniform", "Non-slip footwear"], createdAt: T("2026-11-03", "16:30"), kind: "Corporate", desk: "Dublin events desk", audience: 420, brief: "Catering and floor crew for a corporate dinner in the Gravity Bar." },
  { id: "EVT-005", name: "Winter corporate reception", clientId: "C04", venueId: "V04", date: "2026-11-20", status: "pending", ownerId: "U03", approverId: "U02", supervisorId: "U05",
    ppe: ["Black uniform"], createdAt: T("2026-11-10", "12:10"), kind: "Corporate", desk: "Dublin events desk", pendingNote: "Awaiting headcount approval from the client.", indicativePositions: 18, brief: "Indicative only." },
  { id: "EVT-006", name: "Conference build crew", clientId: "C05", venueId: null, date: "2026-11-23", status: "pending", ownerId: "U04", approverId: "U02", supervisorId: "U05",
    ppe: ["Safety boots", "High-visibility jacket"], createdAt: T("2026-11-11", "15:45"), kind: "Conference", desk: "Dublin events desk", pendingNote: "Dates provisional; venue awaiting confirmation.", indicativePositions: 24, brief: "Indicative only." },
  { id: "EVT-H01", name: "Storehouse corporate evening", clientId: "C04", venueId: "V04", date: "2026-11-11", status: "confirmed", ownerId: "U03", approverId: "U02", supervisorId: "U05",
    ppe: ["Black uniform"], createdAt: T("2026-10-28", "10:00"), historical: true, kind: "Corporate", desk: "Dublin events desk", brief: "Completed. Hours approved and sent in batch BH-1111-01." }
];

const S = (id: string, eventId: string, label: string, roles: string[], date: string, from: string, to: string, required: number, docs: DocType[], ppe: string[]): Shift => {
  const start = T(date, from);
  let end = T(date, to);
  if (Date.parse(end) <= Date.parse(start)) end = addMin(end, 24 * 60);
  return { id, eventId, label, roles, start, end, required, requiredDocs: docs, ppe, version: 1 };
};
const SHIFTS: Shift[] = [
  S("SH-001A", "EVT-001", "Set-up crew", SETUP_ROLES, "2026-11-14", "08:00", "13:00", 10, ["MH"], PPE_HERO),
  S("SH-001B", "EVT-001", "Event crew", EVENT_ROLES, "2026-11-14", "17:00", "23:00", 20, ["MH"], PPE_HERO),
  S("SH-002A", "EVT-002", "Stewards", ["Steward"], "2026-11-15", "11:00", "19:00", 30, [], ["High-visibility jacket", "Safety boots"]),
  S("SH-002B", "EVT-002", "Stadium operations crew", ["Event crew", "General operative"], "2026-11-15", "10:00", "18:00", 18, ["MH"], ["High-visibility jacket", "Safety boots"]),
  S("SH-003A", "EVT-003", "Event support", ["Event crew", "General operative"], "2026-11-13", "16:00", "22:00", 16, [], ["Non-slip footwear"]),
  S("SH-004A", "EVT-004", "Catering and floor crew", ["Catering assistant"], "2026-11-13", "17:30", "23:30", 12, ["HACCP"], ["Black uniform", "Non-slip footwear"]),
  S("SH-005A", "EVT-005", "Reception crew (indicative)", ["Catering assistant", "Event crew"], "2026-11-20", "18:00", "23:00", 18, ["HACCP"], ["Black uniform"]),
  S("SH-006A", "EVT-006", "Build crew (indicative)", ["General operative", "Stagehand", "Site crew"], "2026-11-23", "07:00", "17:00", 24, ["MH"], ["Safety boots", "High-visibility jacket"]),
  S("SH-H01A", "EVT-H01", "Catering and floor crew", ["Catering assistant", "Steward"], "2026-11-11", "18:00", "23:00", 12, [], ["Black uniform"])
];

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => wid(a + i));
export const ROSTER: Record<string, { confirmed: string[]; awaiting: string[] }> = {
  "SH-001A": { confirmed: range(1, 8), awaiting: ["W009"] },
  "SH-001B": { confirmed: range(11, 27), awaiting: ["W009", "W028"] },
  "SH-002A": { confirmed: range(36, 63), awaiting: ["W080"] },
  "SH-002B": { confirmed: range(64, 79), awaiting: ["W081"] },
  "SH-003A": { confirmed: range(82, 95), awaiting: ["W096"] },
  "SH-004A": { confirmed: range(36, 47), awaiting: [] },
  "SH-H01A": { confirmed: range(41, 52), awaiting: [] }
};

/* ── documents ───────────────────────────────────────────────────────────── */
const DOC_LABEL: Record<DocType, string> = { MH: "Manual Handling", SP: "Safe Pass", HACCP: "Food Safety Level 1", FA: "First Aid Responder" };
export const docLabel = (t: DocType) => DOC_LABEL[t];

function buildDocuments(): WorkerDocument[] {
  const docs: WorkerDocument[] = [];
  let n = 0;
  const add = (workerId: string, type: DocType, expires: string, review: WorkerDocument["review"] = "approved", issued?: string, uploadedAt?: string) => {
    n++;
    docs.push({
      id: "DOC-" + String(n).padStart(4, "0"), workerId, type, expires, review,
      issuer: "Sample training provider (synthetic)",
      file: workerId + "-" + type.toLowerCase() + "-sample.pdf",
      issued: issued || (Number(expires.slice(0, 4)) - (type === "SP" ? 4 : 3)) + expires.slice(4),
      uploadedAt: uploadedAt || T("2026-0" + ((n % 8) + 1) + "-1" + (n % 9), "10:00"),
      reviewer: review === "approved" ? "U06" : undefined,
      reviewedAt: review === "approved" ? T("2026-0" + ((n % 8) + 1) + "-2" + (n % 8), "11:30") : undefined
    });
  };
  const future = (i: number) => (2027 + (i % 2)) + "-" + String((i % 9) + 2).padStart(2, "0") + "-" + String((i % 26) + 1).padStart(2, "0");
  for (let i = 1; i <= 31; i++) add(wid(i), "MH", future(i));
  add("W033", "MH", "2026-11-13");
  add("W034", "MH", "2026-11-28");
  add("W035", "MH", "2028-11-10", "pending", "2025-11-10", T("2026-11-11", "19:42"));
  add("W032", "MH", future(32));
  for (let i = 36; i <= 47; i++) add(wid(i), "HACCP", future(i));
  for (let i = 53; i <= 56; i++) add(wid(i), "MH", future(i));
  for (let i = 64; i <= 81; i++) add(wid(i), "MH", i === 71 ? "2026-12-09" : future(i));
  for (const i of [4, 6, 64, 65, 66, 67, 68, 69]) add(wid(i), "SP", future(i + 3));
  add("W070", "SP", "2026-10-30");
  add("W060", "SP", "2026-12-02");
  add("W088", "HACCP", "2026-09-30");
  add("W013", "FA", future(13));
  add("W093", "FA", "2029-06-30", "pending", "2026-06-30", T("2026-11-10", "08:15"));
  for (let i = 82; i <= 87; i++) add(wid(i), "MH", future(i));
  return docs;
}

/* ── availability ────────────────────────────────────────────────────────── */
function buildAvailability(): { rules: AvailabilityRule[]; ex: AvailabilityException[] } {
  const rules: AvailabilityRule[] = [];
  const ex: AvailabilityException[] = [];
  let r = 0, e = 0;
  const rule = (w: string, weekday: number, start: string, end: string) => rules.push({ id: "AR-" + String(++r).padStart(4, "0"), workerId: w, weekday, start, end });
  const exc = (w: string, start: string, end: string, kind: AvailabilityException["kind"], note: string, createdAt: string) =>
    ex.push({ id: "AX-" + String(++e).padStart(4, "0"), workerId: w, start, end, kind, note, createdAt });

  // Explicit availability for every already-confirmed or invited firm-booking worker.
  for (const sh of SHIFTS) {
    const ro = ROSTER[sh.id];
    if (!ro || sh.eventId === "EVT-H01") continue;
    for (const w of ro.confirmed.concat(ro.awaiting)) {
      if (w === "W009") continue;
      exc(w, sh.start, sh.end, "available", "Confirmed availability for " + sh.label, T("2026-11-09", "09:00"));
    }
  }
  // Aidan: Saturday morning only. Evening not confirmed.
  exc("W009", T("2026-11-14", "07:00"), T("2026-11-14", "14:00"), "available", "Saturday morning", T("2026-11-10", "20:14"));
  // Weekend availability used by the hero replacements and the candidate pool.
  for (const d of [6, 0]) rule("W010", d, "07:00", "23:59");
  rule("W029", 5, "12:00", "23:59"); rule("W029", 6, "12:00", "23:59");
  rule("W030", 6, "14:00", "23:59"); rule("W030", 0, "10:00", "20:00");
  rule("W031", 6, "06:00", "23:59"); rule("W031", 0, "06:00", "23:59");
  rule("W034", 6, "07:00", "23:59");
  rule("W033", 6, "07:00", "23:59");
  rule("W035", 6, "07:00", "23:59"); rule("W035", 0, "07:00", "23:59");
  rule("W032", 6, "07:00", "23:59");
  exc("W032", T("2026-11-13", "00:00"), T("2026-11-17", "00:00"), "holiday", "Away 13 to 16 November", T("2026-10-20", "18:00"));
  rule("W028", 6, "15:00", "23:59");
  for (let i = 53; i <= 56; i++) rule(wid(i), 6, "16:00", "23:59");
  for (let i = 1; i <= 27; i++) { if (i === 9) continue; rule(wid(i), i % 2 ? 6 : 0, i <= 8 ? "07:00" : "15:00", "23:59"); }
  for (let i = 36; i <= 51; i++) { rule(wid(i), 5, "16:00", "23:59"); rule(wid(i), 0, "09:00", "21:00"); }
  for (let i = 64; i <= 71; i++) rule(wid(i), 0, "08:00", "20:00");
  for (let i = 82; i <= 88; i++) rule(wid(i), 5, "14:00", "23:59");
  rule("W052", 0, "09:00", "21:00");
  return { rules, ex };
}

/* ── invitations and assignments ─────────────────────────────────────────── */
function buildRoster() {
  const invitations: Invitation[] = [];
  const assignments: Assignment[] = [];
  let i = 0;
  for (const sh of SHIFTS) {
    const ro = ROSTER[sh.id];
    if (!ro) continue;
    const sentBase = sh.eventId === "EVT-H01" ? T("2026-11-04", "10:00") : T("2026-11-09", "10:00");
    ro.confirmed.forEach((w, k) => {
      i++;
      const sentAt = addMin(sentBase, k * 3);
      const respondedAt = addMin(sentAt, 14 + ((i * 53) % 410));
      const inv: Invitation = {
        id: "INV-" + sh.id.slice(3) + "-" + w, shiftId: sh.id, workerId: w, sentAt, sentBy: EVENTS.find((e) => e.id === sh.eventId)!.ownerId,
        version: 1, status: "accepted", expiresAt: addMin(sentAt, 48 * 60), respondedAt, flags: [], kind: "standard", reminders: []
      };
      invitations.push(inv);
      assignments.push({ id: "ASG-" + sh.id.slice(3) + "-" + w, shiftId: sh.id, workerId: w, invitationId: inv.id, status: "confirmed", acceptedAt: respondedAt, shiftVersion: 1 });
    });
  }
  const pending: [string, string, string, string, string[]][] = [
    ["SH-001A", "W009", T("2026-11-11", "15:20"), T("2026-11-13", "18:00"), []],
    ["SH-001B", "W009", T("2026-11-11", "15:21"), T("2026-11-13", "18:00"), ["availability-not-confirmed"]],
    ["SH-001B", "W028", T("2026-11-12", "11:05"), T("2026-11-13", "18:00"), []],
    ["SH-002A", "W080", T("2026-11-11", "14:00"), T("2026-11-14", "18:00"), []],
    ["SH-002B", "W081", T("2026-11-12", "09:30"), T("2026-11-14", "18:00"), []],
    ["SH-003A", "W096", T("2026-11-12", "10:15"), T("2026-11-13", "12:00"), []]
  ];
  for (const [shiftId, w, sentAt, expiresAt, flags] of pending) {
    const sh = SHIFTS.find((s) => s.id === shiftId)!;
    invitations.push({
      id: "INV-" + shiftId.slice(3) + "-" + w, shiftId, workerId: w, sentAt, sentBy: EVENTS.find((e) => e.id === sh.eventId)!.ownerId,
      version: 1, status: "sent", expiresAt, flags, kind: "standard", reminders: []
    });
  }
  return { invitations, assignments };
}

/* ── historical attendance, approvals and the BH-1111-01 batch ───────────── */
function buildHistory(assignments: Assignment[]) {
  const clocks: ClockEntry[] = [];
  const approvals: TimesheetApproval[] = [];
  const hist = assignments.filter((a) => a.shiftId === "SH-H01A");
  hist.forEach((a, k) => {
    clocks.push({ id: "CLK-H-" + a.workerId + "-in", assignmentId: a.id, kind: "in", at: T("2026-11-11", "18:00"), method: "gps", distanceM: 18 + k * 3, accuracyM: 12, result: "verified", reason: "Within venue radius", eventKey: "h-in-" + a.id });
    clocks.push({ id: "CLK-H-" + a.workerId + "-out", assignmentId: a.id, kind: "out", at: T("2026-11-11", "23:00"), method: "gps", distanceM: 22 + k * 2, accuracyM: 14, result: "verified", reason: "Within venue radius", eventKey: "h-out-" + a.id });
    approvals.push({ id: "APR-H-" + a.workerId, assignmentId: a.id, version: 1, approvedBy: "U02", approvedAt: T("2026-11-12", "09:40"), status: "approved" });
  });
  return { clocks, approvals };
}

export function mappingFor(workerId: string): string | null {
  if (workerId === "W052") return null;
  return "BH-CAND-" + (40210 + Number(workerId.slice(1)) * 7);
}
export const CLIENT_REMOTE: Record<string, string | null> = { C01: "BH-CORP-2210", C02: "BH-CORP-2231", C03: "BH-CORP-2247", C04: "BH-CORP-2252", C05: null, ...NET_CLIENT_REMOTE };

function buildMappings(workers: Worker[]): IntegrationMapping[] {
  const m: IntegrationMapping[] = workers.map((w) => ({
    id: "MAP-" + w.id, entityType: "worker", localId: w.id, remoteId: mappingFor(w.id), status: mappingFor(w.id) ? "mapped" : "missing",
    note: mappingFor(w.id) ? "Matched on email at sample import" : "No Bullhorn candidate ID recorded for this worker"
  }));
  for (const c of CLIENTS) m.push({ id: "MAP-" + c.id, entityType: "client", localId: c.id, remoteId: CLIENT_REMOTE[c.id], status: CLIENT_REMOTE[c.id] ? "mapped" : "missing", note: CLIENT_REMOTE[c.id] ? "ClientCorporation reference (sample)" : "New client; mapping pending" });
  return m;
}

/* ── communications, tasks, agents, audit ────────────────────────────────── */
function buildComms(): { threads: Thread[]; messages: Message[] } {
  const threads: Thread[] = [
    { id: "TH-W009", kind: "direct", workerId: "W009", title: "Aidan Murphy" },
    { id: "TH-W028", kind: "direct", workerId: "W028", title: "Sean McKenna" },
    { id: "TH-W035", kind: "direct", workerId: "W035", title: "Tomas Nowak" },
    { id: "TH-EVT-001", kind: "event", eventId: "EVT-001", title: "3Arena: arena crew" },
    { id: "TH-EVT-002", kind: "event", eventId: "EVT-002", title: "Aviva: stadium operations" }
  ];
  const evtCrew = range(1, 8).concat(range(11, 27));
  const rc = (ids: string[], at: string, readAll = true) => Object.fromEntries(ids.map((w, k) => [w, { delivered: at, read: readAll || k % 3 ? addMin(at, 30 + k) : undefined }]));
  const messages: Message[] = [
    { id: "MSG-0001", threadId: "TH-W009", from: { kind: "office", id: "U03" }, kind: "invitation", at: T("2026-11-11", "15:20"), recipients: ["W009"],
      body: "3Arena, Saturday 14 Nov, 08:00-13:00. Safety boots, hi-vis and gloves required. Please accept or decline this shift.",
      receipts: { W009: { delivered: T("2026-11-11", "15:20"), read: T("2026-11-11", "18:02") } }, related: { type: "invitation", id: "INV-001A-W009" } },
    { id: "MSG-0002", threadId: "TH-W009", from: { kind: "office", id: "U03" }, kind: "invitation", at: T("2026-11-11", "15:21"), recipients: ["W009"],
      body: "3Arena, Saturday 14 Nov, 17:00-23:00. Safety boots, hi-vis and gloves required. Please accept or decline this shift.",
      receipts: { W009: { delivered: T("2026-11-11", "15:21"), read: T("2026-11-11", "18:02") } }, related: { type: "invitation", id: "INV-001B-W009" } },
    { id: "MSG-0003", threadId: "TH-W028", from: { kind: "office", id: "U03" }, kind: "invitation", at: T("2026-11-12", "11:05"), recipients: ["W028"],
      body: "3Arena, Saturday 14 Nov, 17:00-23:00. Safety boots, hi-vis and gloves required. Please accept or decline this shift.",
      receipts: { W028: { delivered: T("2026-11-12", "11:05") } }, related: { type: "invitation", id: "INV-001B-W028" } },
    { id: "MSG-0004", threadId: "TH-EVT-001", from: { kind: "office", id: "U03" }, kind: "event", at: T("2026-11-10", "17:30"), recipients: evtCrew, audience: "Confirmed crew, 3Arena",
      body: "Thanks for confirming Saturday at 3Arena. Full brief and meeting point to follow once the gate is confirmed.", receipts: rc(evtCrew, T("2026-11-10", "17:30"), false) },
    { id: "MSG-0005", threadId: "TH-W035", from: { kind: "worker", id: "W035" }, kind: "reply", at: T("2026-11-11", "19:44"), recipients: ["office"],
      body: "Uploaded my Manual Handling cert this evening. Hope that is OK for Saturday.", receipts: {} }
  ];
  return { threads, messages };
}

function buildTasks(): WorkflowTask[] {
  return [
    { id: "TSK-0001", title: "Fill 3Arena gaps", ownerId: "U03", due: T("2026-11-13", "17:00"), priority: "High", dept: "Events", status: "in_progress",
      related: { type: "event", id: "EVT-001", label: "3Arena: arena crew" }, kind: "fill_gaps", createdAt: T("2026-11-11", "09:00"), source: "Ops Watchdog" },
    { id: "TSK-0002", title: "Review Tomas Nowak's Manual Handling evidence", ownerId: "U06", due: T("2026-11-13", "12:00"), priority: "High", dept: "Compliance", status: "open",
      related: { type: "document", id: "DOC-0034", label: "Manual Handling, uploaded 11 Nov" }, kind: "doc_review", createdAt: T("2026-11-11", "19:45"), source: "Eligibility Assistant" },
    { id: "TSK-0003", title: "Resolve Jamie Allen's Bullhorn mapping", ownerId: "U07", due: T("2026-11-12", "17:00"), priority: "High", dept: "Hours", status: "open",
      related: { type: "worker", id: "W052", label: "Jamie Allen" }, kind: "mapping", createdAt: T("2026-11-12", "10:20"), source: "Bullhorn Handover Monitor" },
    { id: "TSK-0004", title: "Confirm 3Arena meeting point", ownerId: "U02", due: T("2026-11-13", "15:00"), priority: "Medium", dept: "Events", status: "open",
      related: { type: "venue", id: "V01", label: "3Arena" }, kind: "venue", createdAt: T("2026-11-10", "16:00"), source: "Manual" },
    { id: "TSK-0005", title: "Chase two Aviva replies", ownerId: "U04", due: T("2026-11-14", "12:00"), priority: "Medium", dept: "Events", status: "open",
      related: { type: "event", id: "EVT-002", label: "Aviva: stadium operations" }, kind: "chase", createdAt: T("2026-11-12", "09:00"), source: "Ops Watchdog" },
    { id: "TSK-0006", title: "Shortlist stewards for Aviva gaps", ownerId: "U08", due: T("2026-11-14", "10:00"), priority: "Low", dept: "Recruitment", status: "open",
      related: { type: "event", id: "EVT-002", label: "Aviva: stadium operations" }, kind: "general", createdAt: T("2026-11-12", "09:05"), source: "Manual" },
    { id: "TSK-0007", title: "Request headcount approval for winter reception", ownerId: "U03", due: T("2026-11-16", "12:00"), priority: "Low", dept: "Events", status: "open",
      related: { type: "event", id: "EVT-005", label: "Winter corporate reception" }, kind: "general", createdAt: T("2026-11-10", "12:15"), source: "Manual" }
  ];
}

const AUTOMATIONS: Automation[] = [
  { id: "AU1", name: "Shift invitation", trigger: "Coordinator sends selection", recipient: "Each invited worker", timing: "Immediately", conditions: "Eligible on shift date; one invitation per worker per shift", on: true, key: "inviteExpiryH" },
  { id: "AU2", name: "Day-before reconfirmation", trigger: "Shift start minus reminder window", recipient: "Confirmed workers", timing: "24 hours before start", conditions: "Assignment confirmed; not already sent for this version", on: true, key: "dayBeforeH" },
  { id: "AU3", name: "Arrival prompt", trigger: "Shift start minus prompt window", recipient: "Confirmed workers", timing: "2 hours before start", conditions: "No journey update yet", on: true, key: "arrivalPromptH" },
  { id: "AU4", name: "Missed clock-in alert", trigger: "Start plus grace", recipient: "Site supervisor and coordinator", timing: "10 minutes after start", conditions: "No verified clock-in", on: true, key: "missedClockMin" },
  { id: "AU5", name: "Missed clock-out alert", trigger: "End plus grace", recipient: "Worker and site supervisor", timing: "10 minutes after end", conditions: "Clocked in, no clock-out", on: true, key: "missedClockMin" },
  { id: "AU6", name: "Document expiry warning", trigger: "Daily scan", recipient: "Worker and compliance", timing: "30 days before expiry", conditions: "Required evidence for upcoming work", on: true, key: "renewalWarnDays" },
  { id: "AU7", name: "Handover failure", trigger: "Batch row blocked or failed", recipient: "Hours administrator", timing: "On each attempt", conditions: "Row not accepted", on: true, key: null },
  { id: "AU8", name: "Reconfirmation on material change", trigger: "Shift time edited", recipient: "Accepted workers on that shift", timing: "On save", conditions: "Start or end moved", on: true, key: null }
];

export const RULES: Rules = {
  geofenceM: 50, maxAccuracyM: 100, travelBufferMin: 60, minimumOn: true, minimumMin: 300,
  dayBeforeH: 24, arrivalPromptH: 2, missedClockMin: 10, inviteExpiryH: 24, breakMin: 0, renewalWarnDays: 30
};

const DECISIONS: Decision[] = [
  { id: "D01", topic: "Booking model", assumption: "One booking client per event; several shifts and roles per booking.", owner: "Events Manager", effect: "Events, Staffing", status: "Demo assumption" },
  { id: "D02", topic: "Multi-venue and multi-rate bookings", assumption: "Not modelled yet.", owner: "Events Manager", effect: "Events, Timesheets", status: "To validate" },
  { id: "D03", topic: "Open shifts", assumption: "Workers browse and request; nothing is booked until invited and accepted.", owner: "Events Manager", effect: "OSS Crew, Staffing", status: "To validate" },
  { id: "D04", topic: "Missing availability", assumption: "Unknown availability is excluded from the eligible list and listed separately.", owner: "Events Manager", effect: "Staffing", status: "To validate" },
  { id: "D05", topic: "Capacity and confirmation", assumption: "First eligible acceptance claims a position; others are offered standby.", owner: "Events Manager", effect: "Staffing, OSS Crew", status: "To validate" },
  { id: "D06", topic: "Invitation expiry", assumption: "24 hours or two hours before start, whichever is sooner.", owner: "Events Manager", effect: "Staffing", status: "Demo assumption" },
  { id: "D07", topic: "Qualification gates", assumption: "Required evidence must be reviewed and valid through shift end.", owner: "Compliance Administrator", effect: "Staffing, Workforce", status: "To validate" },
  { id: "D08", topic: "Duplicate prevention", assumption: "Exact email or mobile match opens the existing profile; name matches go to review.", owner: "Recruitment Lead", effect: "Workforce", status: "To validate" },
  { id: "D09", topic: "Attendance verification", assumption: "50-metre sample radius; GPS or QR with exception review; offline capture needs review.", owner: "Site Supervisor", effect: "Live Operations", status: "To validate" },
  { id: "D10", topic: "Five-hour minimum", assumption: "Sample payable minimum of five hours, shown separately from worked time.", owner: "Director of Operations", effect: "Timesheets", status: "To validate" },
  { id: "D11", topic: "Breaks, rounding, overnight and overtime", assumption: "No unpaid break, no rounding, exact minutes across midnight; time past scheduled end is flagged, not multiplied.", owner: "Hours Administrator", effect: "Timesheets", status: "To validate" },
  { id: "D12", topic: "Bullhorn handover", assumption: "Approved hours leave through a simulated adapter; account modules, entities and write route to confirm.", owner: "Hours Administrator", effect: "Timesheets, Settings", status: "To validate" },
  { id: "D13", topic: "Payroll and invoicing", assumption: "Bright (payroll) and Sage (invoicing) stay downstream and outside this app.", owner: "Director of Operations", effect: "Settings", status: "Confirmed from source" },
  { id: "D14", topic: "Messaging channels", assumption: "In-app only in the demo; push, SMS and email to be chosen.", owner: "Events Manager", effect: "Work, OSS Crew", status: "To validate" },
  { id: "D15", topic: "Privacy and retention", assumption: "Roles, evidence, location and document retention periods.", owner: "Director of Operations", effect: "Governance", status: "To agree" },
  { id: "D16", topic: "TeamTrack migration", assumption: "Exports, ownership and duplicate reconciliation to validate on real data.", owner: "Events Manager", effect: "Workforce, Events", status: "To validate" },
  { id: "D17", topic: "Rollout and support", assumption: "Representative venue pilot; peak volumes; support ownership. January 2027 is the client's target, to scope.", owner: "Director of Operations", effect: "Governance", status: "To agree" }
];

const PROGRAMMES: ProgrammePlan[] = [
  { id: "PRG-RYDER", name: "Ryder Cup 2027 programme", kind: "ryder", indicativeWorkers: 850, status: "Planning assumption",
    note: "Midpoint of the client's 800 to 900 estimate across the whole programme, including build-up. Dates, phases, bookings and allocation are unconfirmed. Not a single-day headcount.",
    months: [] },
  { id: "PRG-SUMMER", name: "Summer festival programme 2027", kind: "festival", indicativeWorkers: 0, status: "Scenario",
    note: "Editable planning placeholder. No festival contracts are implied.",
    months: [{ month: "May", demand: 120 }, { month: "Jun", demand: 260 }, { month: "Jul", demand: 340 }, { month: "Aug", demand: 380 }, { month: "Sep", demand: 150 }] }
];

function buildAgents(): { runs: AgentRun[]; proposals: AgentProposal[] } {
  const proposals: AgentProposal[] = [
    { id: "PRP-0001", agentId: "staffing", at: T("2026-11-12", "15:40"), status: "pending",
      title: "Invite Leah Byrne, Adam O'Neill and Sofia Costa",
      detail: "Leah for the one uninvited set-up position; Adam and Sofia for evening once Aidan's and Sean's replies settle. All three have explicit Saturday availability, valid Manual Handling and prior 3Arena shifts.",
      action: { type: "invite", payload: { invites: [["SH-001A", "W010"], ["SH-001B", "W029"], ["SH-001B", "W030"]] } } },
    { id: "PRP-0002", agentId: "eligibility", at: T("2026-11-12", "06:05"), status: "pending",
      title: "Send Maeve Duffy a renewal reminder",
      detail: "Manual Handling is valid for Saturday but expires on 28 November, before later work could be offered.",
      action: { type: "message", payload: { workerIds: ["W034"], body: "Your Manual Handling certificate expires on 28 November. Please upload a renewal so we can keep offering you shifts." } } }
  ];
  const runs: AgentRun[] = [
    { id: "RUN-0001", agentId: "briefing", at: T("2026-11-12", "07:00"), trigger: "scheduled",
      findings: ["3Arena Saturday: 25 of 30 positions confirmed, three replies outstanding.", "One Bullhorn line blocked: Jamie Allen, five hours.", "Eoin Brennan's Manual Handling expires before Saturday."],
      evidence: [{ label: "3Arena coverage", page: "Staffing", tab: "allocation", focus: "EVT-001" }, { label: "BH-1111-01", page: "Timesheets", tab: "handover" }], proposalIds: [] },
    { id: "RUN-0002", agentId: "eligibility", at: T("2026-11-12", "06:00"), trigger: "scheduled",
      findings: ["Eoin Brennan excluded from Saturday: Manual Handling valid through 13 Nov only.", "Tomas Nowak: evidence uploaded, awaiting review.", "Maeve Duffy: valid Saturday, expires 28 Nov."],
      evidence: [{ label: "Documents", page: "Workforce", tab: "documents" }], proposalIds: ["PRP-0002"] },
    { id: "RUN-0003", agentId: "handover", at: T("2026-11-12", "10:20"), trigger: "scheduled",
      findings: ["BH-1111-01: 11 lines accepted (55h), one blocked (5h).", "Blocked line W052 Jamie Allen: no Bullhorn candidate mapping."],
      evidence: [{ label: "BH-1111-01", page: "Timesheets", tab: "handover" }], proposalIds: [] },
    { id: "RUN-0004", agentId: "staffing", at: T("2026-11-12", "15:40"), trigger: "scheduled",
      findings: ["Set-up: one position not yet invited.", "Evening: one position not yet invited, two replies outstanding.", "Shortlist: Leah Byrne, Adam O'Neill, Sofia Costa."],
      evidence: [{ label: "Allocation", page: "Staffing", tab: "allocation", focus: "EVT-001" }], proposalIds: ["PRP-0001"] },
    { id: "RUN-0005", agentId: "watchdog", at: T("2026-11-12", "15:30"), trigger: "scheduled",
      findings: ["Six invitations awaiting reply across the next seven days.", "Task 'Fill 3Arena gaps' in progress, due Fri 17:00."],
      evidence: [{ label: "Invitations", page: "Staffing", tab: "invitations" }], proposalIds: [] }
  ];
  return { runs, proposals };
}

function buildAudit(): AuditEvent[] {
  const A = (at: string, actor: string, action: string, type: string, id: string, label: string, summary: string, category: AuditEvent["category"], result: AuditEvent["result"] = "ok", story?: AuditEvent["story"]): AuditEvent =>
    ({ id: "", at, actor, action, entity: { type, id, label }, summary, category, result, story });
  const list = [
    A(T("2026-11-06", "11:20"), "Darragh Kelly", "booking.created", "event", "EVT-001", "3Arena: arena crew", "Created the 3Arena booking for Aiken Promotions: two shifts, 30 positions", "operations", "ok", "A"),
    A(T("2026-11-09", "10:00"), "Darragh Kelly", "invitations.sent", "shift", "SH-001B", "Event crew", "Sent 17 individual invitations for 3Arena event crew", "operations", "ok", "A"),
    A(T("2026-11-10", "20:14"), "Aidan Murphy", "availability.updated", "worker", "W009", "Aidan Murphy", "Recorded Saturday 07:00 to 14:00 available", "operations"),
    A(T("2026-11-11", "15:21"), "Darragh Kelly", "invitation.sent", "invitation", "INV-001B-W009", "Aidan Murphy, event crew", "Invited Aidan to event crew with availability not confirmed (coordinator exception)", "operations", "ok", "A"),
    A(T("2026-11-11", "19:42"), "Tomas Nowak", "document.uploaded", "document", "DOC-0034", "Manual Handling", "Uploaded Manual Handling evidence; awaiting review", "approvals", "ok", "D"),
    A(T("2026-11-12", "06:00"), "Eligibility Assistant", "agent.run", "agent", "eligibility", "Eligibility Assistant", "Flagged Eoin Brennan: Manual Handling valid through 13 Nov, before Saturday's shift", "systems", "ok", "D"),
    A(T("2026-11-12", "09:40"), "Aoife Byrne", "hours.approved", "event", "EVT-H01", "Storehouse corporate evening", "Approved 12 lines, 60h, for 11 Nov", "approvals", "ok", "F"),
    A(T("2026-11-12", "10:15"), "Emma Ryan", "handover.batch_created", "batch", "BH-1111-01", "BH-1111-01", "Created Bullhorn send with 12 approved lines", "systems", "simulated", "F"),
    A(T("2026-11-12", "10:16"), "Bullhorn", "handover.sent", "batch", "BH-1111-01", "Storehouse, 11 Nov", "Bullhorn accepted 11 lines, 55h", "systems", "simulated", "F"),
    A(T("2026-11-12", "10:16"), "Bullhorn", "handover.blocked", "item", "HO-H-W052", "Jamie Allen, 11 Nov", "Jamie Allen's five hours blocked: no Bullhorn candidate match", "systems", "rejected", "F"),
    A(T("2026-11-12", "11:05"), "Darragh Kelly", "invitation.sent", "invitation", "INV-001B-W028", "Sean McKenna, event crew", "Invited Sean McKenna to 3Arena event crew", "operations", "ok", "A"),
    A(T("2026-11-12", "15:40"), "Staffing Assistant", "agent.proposal", "agent", "staffing", "Staffing Assistant", "Proposed invitations for Leah Byrne, Adam O'Neill and Sofia Costa; waiting for a coordinator", "systems")
  ];
  return list.map((e, i) => ({ ...e, id: "AUD-" + String(i + 1).padStart(5, "0") }));
}

function buildBatch(assignments: Assignment[], approvals: TimesheetApproval[]): { batches: HandoverBatch[]; items: HandoverItem[] } {
  const batches: HandoverBatch[] = [{ id: "BH-1111-01", label: "Storehouse corporate evening, 11 Nov", createdAt: T("2026-11-12", "10:15"), createdBy: "U07", scope: "EVT-H01" }];
  const items: HandoverItem[] = [];
  assignments.filter((a) => a.shiftId === "SH-H01A").forEach((a, k) => {
    const apr = approvals.find((p) => p.assignmentId === a.id)!;
    const key = a.id + ":2026-11-11:v1";
    const mapped = mappingFor(a.workerId);
    items.push({
      id: "HO-H-" + a.workerId, batchId: "BH-1111-01", assignmentId: a.id, version: 1, transferKey: key,
      snapshot: {
        timesheetId: "TS-" + a.id, version: 1, workerId: a.workerId, candidateId: mapped, clientId: "C04", clientRemoteId: CLIENT_REMOTE.C04,
        eventId: "EVT-H01", shiftId: "SH-H01A", workDate: "2026-11-11", scheduledStart: T("2026-11-11", "18:00"), scheduledEnd: T("2026-11-11", "23:00"),
        approvedStart: T("2026-11-11", "18:00"), approvedEnd: T("2026-11-11", "23:00"), workedMin: 300, breakMin: 0, topupMin: 0, payableMin: 300, extraMin: 0,
        approvedBy: apr.approvedBy, approvedAt: apr.approvedAt, correction: null, transferKey: key
      },
      state: mapped ? "accepted" : "blocked",
      receipt: mapped ? "SIM-RCPT-1111-" + String(k + 1).padStart(2, "0") : undefined,
      error: mapped ? undefined : "Worker mapping missing: no Bullhorn candidate ID for W052",
      attempts: [{ at: T("2026-11-12", "10:16"), result: mapped ? "accepted" : "blocked: mapping missing" }]
    });
  });
  return { batches, items };
}

const STANDBY: StandbyEntry[] = [
  { id: "SB-1", shiftId: "SH-001B", workerId: "W031", order: 1, willing: true, note: "Confirmed willing to be on standby Saturday evening", contact: "Replied 12 Nov 13:10" },
  { id: "SB-2", shiftId: "SH-001B", workerId: "W034", order: 2, willing: true, note: "Manual Handling expires 28 Nov", contact: "Replied 12 Nov 14:02" },
  { id: "SB-3", shiftId: "SH-001B", workerId: "W055", order: 3, willing: true, note: "Steward experience", contact: "Replied 12 Nov 14:30" },
  { id: "SB-4", shiftId: "SH-001A", workerId: "W035", order: 1, willing: true, note: "Evidence awaiting review", contact: "Replied 11 Nov 19:44" }
];

export function buildCanonical(): OssState {
  const workers = buildWorkers();
  const { rules, ex } = buildAvailability();
  const { invitations, assignments } = buildRoster();
  const { clocks, approvals } = buildHistory(assignments);
  const { batches, items } = buildBatch(assignments, approvals);
  const { threads, messages } = buildComms();
  const { runs, proposals } = buildAgents();
  const net = buildNetwork(VENUES);
  // Deep copy: actions mutate the state, and module-level seed rows must stay pristine for "start over".
  const state: OssState = structuredClone({
    seedVersion: SEED_VERSION, clock: OPENING_CLOCK, seq: 100,
    users: USERS.concat(NET_USERS), teams: TEAMS.concat(NET_TEAMS), workers: workers.concat(net.workers), clients: CLIENTS.concat(NET_CLIENTS), contacts: CONTACTS.concat(NET_CONTACTS), venues: VENUES.concat(NET_VENUES),
    events: EVENTS.concat(net.events), shifts: SHIFTS.concat(net.shifts), documents: buildDocuments().concat(net.documents), availRules: rules.concat(net.availRules), availExceptions: ex,
    invitations: invitations.concat(net.invitations), assignments: assignments.concat(net.assignments), standby: STANDBY, journeys: [], clocks, exceptions: [], corrections: [], approvals,
    threads, messages, tasks: buildTasks(), agentRuns: runs, proposals, agentsPaused: {},
    mappings: buildMappings(workers).concat(net.mappings), batches, items, audit: buildAudit(), programmes: PROGRAMMES, rules: { ...RULES },
    automations: AUTOMATIONS, autoRuns: [], decisions: DECISIONS, openShiftRequests: [], ext: buildExt(),
    ui: { stage: 1, role: "office", personaId: "U01", crewWorkerId: "W009", tabs: {}, focus: null, phoneOpen: false, drawer: null, dirty: false }
  });
  /* The other desks have been working all day too. */
  settleNetwork(state, OPENING_CLOCK);
  return state;
}
