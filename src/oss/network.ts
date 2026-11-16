/* OSS beyond the 3Arena story: the regional desks, the venues and clients
   across Ireland, the wider crew pool and every other booking running the
   same weeks. Deterministic, so every stage rebuilds the same company.

   Guard rails that keep the story exact:
   - story crew are W001 to W096; network crew start at W101 and never share a shift with them
   - story events sit on the Dublin events desk; network events are on other desks (`network: true`)
   - network crew are free on weekdays only, so they never show up as candidates for the story's weekend shifts
   - Stamp 2 students are booked well inside the 20-hour cap, and nobody gets less than 11 hours' rest
   - IDs use their own prefixes (NET-, NASG-, NCL-...) so the engine's counters, batch numbers and receipts are untouched

   `settleNetwork` plays the network forward to the scenario clock: arrivals,
   GPS and QR clock-ins, clock-outs, hours approval by the desk and the send
   to Bullhorn. It runs on every clock move, before the automations. */

import type {
  AdminUser, Assignment, AuditEvent, AvailabilityRule, Client, ClientContact, ClockEntry, EventBooking, EventKind, HandoverItem,
  IntegrationMapping, Invitation, JourneyUpdate, OssState, Region, Shift, Team, TimesheetApproval, Venue, Worker, WorkerDocument
} from "./model";
import { addMin, dayKey, minutesBetween, ms, zoned } from "./time";

const T = zoned;
const hash = (id: string) => { let x = 0; for (const c of id) x = (x * 31 + c.charCodeAt(0)) % 9973; return x; };
const pad = (n: number, w = 3) => String(n).padStart(w, "0");

/* ── people in the office: regional desks ─────────────────────────────────── */
export const DESKS = ["Dublin events desk", "Stadia and sport desk", "Live music and theatre desk", "Corporate and hospitality desk", "Cork and Munster desk", "West and North desk"] as const;
export type Desk = (typeof DESKS)[number];
const DESK_CODE: Record<string, string> = { "Stadia and sport desk": "SS", "Live music and theatre desk": "LM", "Corporate and hospitality desk": "CH", "Cork and Munster desk": "CK", "West and North desk": "WN", "Dublin events desk": "DE" };
/** Who runs each desk: owner, site supervisor, who approves hours. */
export const DESK_STAFF: Record<string, { owner: string; supervisor: string; hours: string }> = {
  "Dublin events desk": { owner: "U03", supervisor: "U05", hours: "U07" },
  "Stadia and sport desk": { owner: "U12", supervisor: "U17", hours: "U07" },
  "Live music and theatre desk": { owner: "U04", supervisor: "U18", hours: "U07" },
  "Corporate and hospitality desk": { owner: "U13", supervisor: "U18", hours: "U07" },
  "Cork and Munster desk": { owner: "U09", supervisor: "U14", hours: "U15" },
  "West and North desk": { owner: "U11", supervisor: "U16", hours: "U15" }
};
export const NET_USERS: AdminUser[] = [
  { id: "U09", name: "Clodagh Murphy", role: "Cork and Munster desk lead", email: "demo.clodagh@ossrecruitment.ie", team: "Cork and Munster desk", initials: "CM", perms: ["allocate", "approve_hours", "message"] },
  { id: "U10", name: "Ruairí Keane", role: "Ryder Cup 2027 programme lead", email: "demo.ruairi@ossrecruitment.ie", team: "Ryder Cup 2027 programme", initials: "RK", perms: ["allocate", "message"] },
  { id: "U11", name: "Siobhán Walsh", role: "West and North desk lead", email: "demo.siobhan@ossrecruitment.ie", team: "West and North desk", initials: "SW", perms: ["allocate", "approve_hours", "message"] },
  { id: "U12", name: "Kevin Daly", role: "Stadia and sport desk manager", email: "demo.kevin@ossrecruitment.ie", team: "Stadia and sport desk", initials: "KD", perms: ["allocate", "approve_hours", "message"] },
  { id: "U13", name: "Aoibhinn Kelly", role: "Corporate and hospitality desk manager", email: "demo.aoibhinn@ossrecruitment.ie", team: "Corporate and hospitality desk", initials: "AK", perms: ["allocate", "approve_hours", "message"] },
  { id: "U14", name: "Pádraig Flanagan", role: "Site supervisor, Munster", email: "demo.padraig@ossrecruitment.ie", team: "Cork and Munster desk", initials: "PF", perms: ["supervise", "message"] },
  { id: "U15", name: "Gráinne O'Neill", role: "Hours administrator, Cork", email: "demo.grainne@ossrecruitment.ie", team: "Hours & payroll handover", initials: "GO", perms: ["edit_hours", "handover"] },
  { id: "U16", name: "Tomás Ryan", role: "Site supervisor, West and North", email: "demo.tomas@ossrecruitment.ie", team: "West and North desk", initials: "TR", perms: ["supervise", "message"] },
  { id: "U17", name: "Laura Kinsella", role: "Site supervisor, stadia", email: "demo.laura@ossrecruitment.ie", team: "Stadia and sport desk", initials: "LK", perms: ["supervise", "message"] },
  { id: "U18", name: "Eoghan Brennan", role: "Site supervisor, Leinster", email: "demo.eoghan@ossrecruitment.ie", team: "Corporate and hospitality desk", initials: "EB", perms: ["supervise", "message"] }
];
export const NET_TEAMS: Team[] = [
  { id: "TM6", name: "Stadia and sport desk", members: ["U12", "U17"], note: "Aviva, Thomond Park, racecourses and motorsport." },
  { id: "TM7", name: "Live music and theatre desk", members: ["U04", "U18"], note: "Arenas, theatres and touring shows outside the Aiken account." },
  { id: "TM8", name: "Corporate and hospitality desk", members: ["U13", "U18"], note: "Conferences, galas, Christmas parties and exhibitions." },
  { id: "TM9", name: "Cork and Munster desk", members: ["U09", "U14", "U15"], note: "Cork office. Munster venues, Killarney and Limerick." },
  { id: "TM10", name: "West and North desk", members: ["U11", "U16"], note: "Galway office. Connacht, Cavan and Donegal." },
  { id: "TM11", name: "Ryder Cup 2027 programme", members: ["U10", "U08"], note: "Recruiting and training around 850 crew for Adare Manor." }
];

/* ── clients ──────────────────────────────────────────────────────────────── */
const C = (id: string, name: string, sector: string): Client => ({ id, name, sector, fictional: true, provenance: "Fictional client for the demo." });
export const NET_CLIENTS: Client[] = [
  C("C06", "Harbourlight Live", "Live music promoter"), C("C07", "Shannonside Sports Partnership", "Stadium and sport operations"),
  C("C08", "Corrib Festivals Ltd", "Festival and outdoor events"), C("C09", "Meridian Conferences Ireland", "Conference organiser"),
  C("C10", "Kestrel Hospitality Group", "Corporate hospitality"), C("C11", "Liffey Exhibitions", "Exhibition organiser"),
  C("C13", "Brightwater Productions", "Touring concert promoter"), C("C14", "Emerald Motorsport Events", "Motorsport and sport events"),
  C("C16", "Northgate Venue Services", "Stadium and sport operations"), C("C18", "Kingfisher Corporate Events", "Corporate events"),
  C("C19", "Atlantic Christmas Markets", "Festival and outdoor events"), C("C20", "Greenway Racing", "Racecourse and sport operations"),
  C("C21", "Capital Conference Co", "Conference organiser"), C("C22", "Bridgeview Theatre Group", "Theatre and live music")
];
export const NET_CLIENT_REMOTE: Record<string, string> = Object.fromEntries(NET_CLIENTS.map((c, i) => [c.id, "BH-CORP-" + (2301 + i * 7)]));
export const NET_CONTACTS: ClientContact[] = [
  ["C06", "Ciarán Moloney", "Production manager"], ["C07", "Áine Hogan", "Stadium operations lead"], ["C08", "Declan Furey", "Festival director"],
  ["C09", "Rebecca Lynch", "Event operations"], ["C10", "Mark Coughlan", "Head of events"], ["C11", "Sinéad Quirke", "Show manager"],
  ["C13", "Jonathan Pierce", "Tour production"], ["C14", "Fergal Nolan", "Clerk of the course"], ["C16", "Orla Brady", "Venue manager"],
  ["C18", "Hannah Doyle", "Account director"], ["C19", "Liam Fahy", "Market operations"], ["C20", "Barry Kehoe", "Raceday operations"],
  ["C21", "Emma Whelan", "Venue producer"], ["C22", "Peter Gallagher", "Front of house manager"]
].map(([c, n, r], i) => ({ id: "CC" + pad(10 + i, 2), clientId: c, name: n, role: r, email: n.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, ".") + "@example.test", phone: "0" + (c === "C08" || c === "C19" ? "91" : c === "C07" || c === "C10" ? "21" : "1") + " 555 0" + (300 + i * 11) }));
/** Year-to-date and service figures for the network accounts (industry.ts merges these into ACCOUNTS). */
export const NET_ACCOUNTS: Record<string, { manager: string; portal: "Live" | "Invited" | "Not set up"; code: string; eventsYtd: number; hoursYtd: number; fill12: number; standards: string[]; signOff: string; tier: "Key account" | "Regular" | "New" }> = {
  C06: { manager: "U04", portal: "Live", code: "OSS-HBL-26", eventsYtd: 37, hoursYtd: 5410, fill12: 96.2, standards: ["Safety boots", "Hi-vis", "Manual Handling"], signOff: "Ciarán Moloney", tier: "Key account" },
  C07: { manager: "U12", portal: "Live", code: "OSS-SSP-26", eventsYtd: 22, hoursYtd: 14980, fill12: 97.1, standards: ["Steward training", "PSA licence on turnstiles", "Hi-vis"], signOff: "Áine Hogan", tier: "Key account" },
  C08: { manager: "U11", portal: "Live", code: "OSS-CFL-26", eventsYtd: 19, hoursYtd: 7820, fill12: 94.6, standards: ["Hi-vis", "Radio trained"], signOff: "Declan Furey", tier: "Key account" },
  C09: { manager: "U09", portal: "Invited", code: "OSS-MCI-26", eventsYtd: 14, hoursYtd: 2120, fill12: 98.3, standards: ["Black uniform"], signOff: "Rebecca Lynch", tier: "Regular" },
  C10: { manager: "U09", portal: "Live", code: "OSS-KHG-26", eventsYtd: 26, hoursYtd: 3460, fill12: 97.9, standards: ["Food Safety Level 1", "Black uniform", "Responsible serving"], signOff: "Mark Coughlan", tier: "Key account" },
  C11: { manager: "U13", portal: "Live", code: "OSS-LEX-26", eventsYtd: 11, hoursYtd: 6230, fill12: 95.4, standards: ["Safety boots", "Manual Handling", "Forklift (CSCS) for build"], signOff: "Sinéad Quirke", tier: "Regular" },
  C13: { manager: "U04", portal: "Live", code: "OSS-BWP-26", eventsYtd: 31, hoursYtd: 6110, fill12: 96.8, standards: ["Safety boots", "Hi-vis", "Working at Heights for riggers"], signOff: "Jonathan Pierce", tier: "Key account" },
  C14: { manager: "U12", portal: "Invited", code: "OSS-EME-26", eventsYtd: 12, hoursYtd: 2640, fill12: 93.8, standards: ["Marshal briefing", "Hi-vis"], signOff: "Fergal Nolan", tier: "Regular" },
  C16: { manager: "U11", portal: "Not set up", code: "OSS-NVS-26", eventsYtd: 8, hoursYtd: 1890, fill12: 92.5, standards: ["Steward training", "Hi-vis"], signOff: "Orla Brady", tier: "Regular" },
  C18: { manager: "U13", portal: "Live", code: "OSS-KCE-26", eventsYtd: 44, hoursYtd: 4980, fill12: 98.9, standards: ["Black uniform", "Food Safety Level 1"], signOff: "Hannah Doyle", tier: "Key account" },
  C19: { manager: "U11", portal: "Live", code: "OSS-ACM-26", eventsYtd: 6, hoursYtd: 3020, fill12: 95.0, standards: ["Hi-vis", "Cash handling"], signOff: "Liam Fahy", tier: "Regular" },
  C20: { manager: "U12", portal: "Live", code: "OSS-GRR-26", eventsYtd: 29, hoursYtd: 8760, fill12: 96.4, standards: ["Car park marshal briefing", "Hi-vis", "Steward training"], signOff: "Barry Kehoe", tier: "Key account" },
  C21: { manager: "U13", portal: "Live", code: "OSS-CCC-26", eventsYtd: 33, hoursYtd: 7340, fill12: 99.1, standards: ["Black uniform", "Accreditation desk training"], signOff: "Emma Whelan", tier: "Key account" },
  C22: { manager: "U04", portal: "Invited", code: "OSS-BTG-26", eventsYtd: 58, hoursYtd: 4210, fill12: 97.3, standards: ["Black uniform", "Front of house induction"], signOff: "Peter Gallagher", tier: "Regular" }
};

/* ── venues across Ireland ────────────────────────────────────────────────── */
const V = (id: string, name: string, area: string, county: string, region: Region, lat: number, lng: number, capacity: number, sup: string, qr = true): Venue =>
  ({ id, name, area, county, region, lat, lng, capacity, supervisorId: sup, meetingPoint: "Staff entrance. Confirmed with the venue for this season.", meetingConfirmed: true, geofenceM: capacity > 20000 ? 120 : 60, qrToken: "QR-" + id + "-v1", methods: qr ? ["gps", "qr"] : ["gps"] });
export const NET_VENUES: Venue[] = [
  V("V05", "Thomond Park", "Cratloe Road, Limerick", "Limerick", "Munster", 52.6745, -8.6425, 25600, "U14"),
  V("V06", "RDS Simmonscourt", "Ballsbridge, Dublin 4", "Dublin", "Dublin", 53.3255, -6.229, 8000, "U18"),
  V("V07", "Convention Centre Dublin", "Spencer Dock, Dublin 1", "Dublin", "Dublin", 53.3478, -6.2394, 8000, "U18"),
  V("V08", "Bord Gáis Energy Theatre", "Grand Canal Square, Dublin 2", "Dublin", "Dublin", 53.344, -6.2401, 2100, "U18"),
  V("V09", "Olympia Theatre", "Dame Street, Dublin 2", "Dublin", "Dublin", 53.3442, -6.2662, 1240, "U18", false),
  V("V10", "Vicar Street", "Thomas Street, Dublin 8", "Dublin", "Dublin", 53.3424, -6.2789, 1500, "U18", false),
  V("V11", "Leopardstown Racecourse", "Foxrock, Dublin 18", "Dublin", "Dublin", 53.27, -6.202, 15000, "U17"),
  V("V12", "Punchestown Racecourse", "Naas, Co Kildare", "Kildare", "Leinster", 53.187, -6.623, 25000, "U17"),
  V("V13", "Mondello Park", "Donore, Co Kildare", "Kildare", "Leinster", 53.257, -6.745, 10000, "U17", false),
  V("V14", "Cork City Hall", "Anglesea Street, Cork", "Cork", "Munster", 51.8975, -8.465, 1600, "U14"),
  V("V15", "Cork Opera House", "Emmet Place, Cork", "Cork", "Munster", 51.8995, -8.472, 1000, "U14", false),
  V("V16", "INEC Killarney", "Muckross Road, Killarney", "Kerry", "Munster", 52.06, -9.504, 4000, "U14"),
  V("V17", "University of Limerick Sport Arena", "Castletroy, Limerick", "Limerick", "Munster", 52.674, -8.57, 3000, "U14", false),
  V("V18", "Waterford Winterval, The Mall", "The Mall, Waterford", "Waterford", "Munster", 52.2596, -7.106, 12000, "U14", false),
  V("V19", "Galway Christmas Market, Eyre Square", "Eyre Square, Galway", "Galway", "Connacht", 53.274, -9.049, 15000, "U16", false),
  V("V20", "Galway Racecourse", "Ballybrit, Galway", "Galway", "Connacht", 53.296, -9.011, 9000, "U16"),
  V("V21", "Kingspan Breffni", "Cavan town", "Cavan", "Ulster", 53.991, -7.357, 32000, "U16"),
  V("V22", "Dublin Castle", "Dame Street, Dublin 2", "Dublin", "Dublin", 53.3429, -6.2674, 1500, "U18"),
  V("V23", "Royal Hospital Kilmainham", "Military Road, Dublin 8", "Dublin", "Dublin", 53.343, -6.3, 1200, "U18", false),
  V("V24", "Fairyhouse Racecourse", "Ratoath, Co Meath", "Meath", "Leinster", 53.521, -6.494, 20000, "U17"),
  V("V25", "Croke Park Conference Centre", "Jones's Road, Dublin 3", "Dublin", "Dublin", 53.3607, -6.2512, 2000, "U18"),
  V("V26", "An Grianán Theatre", "Port Road, Letterkenny", "Donegal", "Ulster", 54.95, -7.734, 380, "U16", false)
];

/* ── crew across Ireland ──────────────────────────────────────────────────── */
const NFIRST = ["Aoife", "Ciara", "Saoirse", "Niamh", "Róisín", "Caoimhe", "Clodagh", "Éabha", "Sorcha", "Laoise", "Muireann", "Orlaith", "Grace", "Emma", "Sarah", "Chloe", "Rachel", "Amy", "Kate", "Hannah", "Lucy", "Ellen",
  "Oisín", "Cian", "Darragh", "Conor", "Seán", "Eoin", "Ronan", "Fionn", "Cillian", "Diarmuid", "Tadhg", "Pádraig", "Jack", "James", "Adam", "Luke", "Ben", "Dylan", "Mark", "Kevin", "Shane", "Gavin", "Brendan", "Colm",
  "Mateus", "Gabriela", "Lucas", "Beatriz", "Marta", "Kasia", "Piotr", "Tomasz", "Agnieszka", "Andrei", "Ioana", "Lucía", "Javier", "Giulia", "Marco", "Priya", "Arjun", "Ananya", "Chidi", "Amara", "Tunde",
  "Olena", "Dmytro", "Yusuf", "Leila", "Mei", "Jun", "Camille", "Hugo", "Inés", "Rafael"];
const NLAST = ["Murphy", "Kelly", "O'Sullivan", "Walsh", "Smith", "O'Brien", "Byrne", "Ryan", "O'Connor", "O'Neill", "O'Reilly", "Doyle", "McCarthy", "Gallagher", "O'Doherty", "Kennedy", "Lynch", "Murray", "Quinn",
  "Moore", "McLoughlin", "O'Carroll", "Connolly", "Daly", "O'Connell", "Wilson", "Dunne", "Brennan", "Burke", "Collins", "Campbell", "Clarke", "Johnston", "Hughes", "Farrell", "Fitzgerald", "Brown", "Martin",
  "Maguire", "Nolan", "Flynn", "Thompson", "Callaghan", "O'Donnell", "Duffy", "Mahony", "Boyle", "Healy", "Shea", "White", "Sweeney", "Hayes", "Kavanagh", "Power", "McGrath", "Moran", "Brady", "Stewart", "Casey",
  "Foley", "Fitzpatrick", "Leary", "McDonnell", "MacMahon", "Donnelly", "Regan", "Donovan", "Burns", "Flanagan", "Mullan", "Barry", "Kane", "Robinson", "Cunningham", "Griffin", "Kenny", "Sheehan", "Ward", "Whelan",
  "Santos", "Oliveira", "Pereira", "Nowak", "Kowalski", "Wiśniewska", "Popescu", "Ionescu", "García", "Fernández", "Rossi", "Bianchi", "Sharma", "Patel", "Okonkwo", "Adeyemi", "Kovalenko", "Shevchenko", "Demir", "Chen", "Wang", "Dubois", "Moreau"];
const LOCALITIES: Record<Region, string[]> = {
  Dublin: ["Rathmines", "Drumcondra", "Phibsborough", "Tallaght", "Swords", "Blanchardstown", "Clondalkin", "Lucan", "Dún Laoghaire", "Finglas", "Coolock", "Ballymun", "Crumlin", "Ranelagh", "Stoneybatter", "Santry", "Tallaght", "Dublin city"],
  Leinster: ["Naas", "Newbridge", "Navan", "Drogheda", "Bray", "Wicklow", "Kilkenny", "Carlow", "Wexford", "Athlone", "Mullingar", "Portlaoise", "Maynooth", "Celbridge"],
  Munster: ["Cork city", "Ballincollig", "Douglas", "Bishopstown", "Limerick city", "Castletroy", "Ennis", "Killarney", "Tralee", "Waterford", "Clonmel", "Mallow", "Shannon"],
  Connacht: ["Galway city", "Salthill", "Oranmore", "Knocknacarra", "Castlebar", "Sligo", "Westport", "Tuam"],
  Ulster: ["Letterkenny", "Cavan", "Monaghan", "Donegal town", "Bundoran"]
};
const NROLES = [["Steward"], ["Steward", "Event crew"], ["Event crew", "General operative"], ["Catering assistant", "Bar staff"], ["Stagehand", "Event crew"], ["Steward", "Car park marshal"],
  ["Usher", "Event crew"], ["General operative", "Site crew"], ["Catering assistant"], ["Accreditation", "Event crew"], ["Bar staff"], ["Steward"], ["Event crew"], ["Stagehand", "General operative"], ["Hospitality host", "Catering assistant"]];
export const NET_FIRST = 101, NET_LAST = 860;
const nwid = (n: number) => "W" + pad(n);
const regionForIndex = (i: number): Region => { const r = (i * 37) % 100; return r < 46 ? "Dublin" : r < 60 ? "Leinster" : r < 86 ? "Munster" : r < 96 ? "Connacht" : "Ulster"; };
/** Same right-to-work rule as industry.ts profile(): network crew have no fixed overrides. */
const isStamp2 = (id: string) => { const n = hash(id); return n % 9 === 0 || n % 9 === 1; };
const earlierMin = (id: string) => (isStamp2(id) ? 300 + (hash(id) % 3) * 180 : 0);

function buildNetWorkers(): Worker[] {
  const out: Worker[] = []; const used = new Set<string>();
  let k = 0;
  for (let n = NET_FIRST; n <= NET_LAST; n++) {
    let name: string;
    do { name = NFIRST[(k * 13 + 7) % NFIRST.length] + " " + NLAST[(k * 29 + 3) % NLAST.length]; k++; } while (used.has(name));
    used.add(name);
    const region = regionForIndex(n);
    const loc = LOCALITIES[region][(n * 7) % LOCALITIES[region].length];
    const slug = name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
    out.push({
      id: nwid(n), name, roles: NROLES[(n * 11) % NROLES.length], locality: loc, region,
      email: slug + "." + n + "@example.test", mobile: "08" + (3 + (n % 5)) + " 555 " + pad((n * 53) % 10000, 4),
      joined: (2016 + (n % 10)) + "-" + pad((n % 12) + 1, 2) + "-" + pad((n % 27) + 1, 2), status: "active",
      priorShifts: 3 + ((n * 17) % 58), priorVenues: []
    });
  }
  return out;
}
function buildNetDocs(workers: Worker[]): WorkerDocument[] {
  const docs: WorkerDocument[] = [];
  const exp = (i: number) => (2027 + (i % 3)) + "-" + pad((i % 10) + 2, 2) + "-" + pad((i % 26) + 1, 2);
  const add = (w: Worker, type: WorkerDocument["type"], i: number) => docs.push({
    id: "NDOC-" + w.id + "-" + type, workerId: w.id, type, expires: exp(i), review: "approved", issuer: "Sample training provider (synthetic)",
    file: w.id + "-" + type.toLowerCase() + "-sample.pdf", issued: (2023 + (i % 3)) + "-" + pad((i % 10) + 2, 2) + "-" + pad((i % 26) + 1, 2),
    uploadedAt: T("2026-0" + ((i % 8) + 1) + "-1" + (i % 9), "10:00"), reviewer: "U06", reviewedAt: T("2026-0" + ((i % 8) + 1) + "-2" + (i % 8), "11:30")
  });
  workers.forEach((w, i) => {
    const n = Number(w.id.slice(1));
    if (n % 6 !== 0) add(w, "MH", n);
    if (w.roles.some((r) => /operative|Site|Stagehand|marshal/.test(r)) && n % 3 !== 0) add(w, "SP", n + 4);
    if (w.roles.some((r) => /Catering|Bar|Hospitality/.test(r))) add(w, "HACCP", n + 2);
    if (n % 16 === 0) add(w, "FA", n + 6);
    void i;
  });
  return docs;
}
function buildNetAvailability(workers: Worker[]): AvailabilityRule[] {
  const rules: AvailabilityRule[] = [];
  workers.forEach((w) => {
    const n = Number(w.id.slice(1));
    if (n % 5 === 0) return;
    const days = n % 2 ? [1, 3, 5] : [2, 4];
    days.forEach((d, j) => rules.push({ id: "NAR-" + w.id + "-" + j, workerId: w.id, weekday: d, start: n % 3 ? "16:00" : "08:00", end: "23:59" }));
  });
  return rules;
}

/* ── network bookings ─────────────────────────────────────────────────────── */
type SS = [string, string[], string, string, string, number];   // label, roles, date, from, to, required
interface ES { id: string; name: string; client: string; venue: string; kind: EventKind; desk: Desk; audience: number; ppe: string[]; brief: string; shifts: SS[]; awaiting?: number }
const STEW = ["Steward"], CREW = ["Event crew", "General operative"], CAT = ["Catering assistant", "Bar staff", "Hospitality host"], STAGE = ["Stagehand", "General operative", "Site crew"], FOH = ["Usher", "Event crew", "Accreditation"];
const HI = ["High-visibility jacket", "Safety boots"], BLACK = ["Black uniform", "Non-slip footwear"];
const WINDOW_EVENTS: ES[] = [
  { id: "NET-101", name: "CCD: MedTech Ireland summit", client: "C21", venue: "V07", kind: "Conference", desk: "Corporate and hospitality desk", audience: 2400, ppe: BLACK, brief: "Registration, accreditation and floor crew for a two-day summit.",
    shifts: [["Registration and floor crew", FOH, "2026-11-12", "07:30", "18:30", 46], ["Registration and floor crew", FOH, "2026-11-13", "07:30", "17:30", 40]] },
  { id: "NET-102", name: "Galway Christmas Market: opening weekend", client: "C19", venue: "V19", kind: "Festival", desk: "West and North desk", audience: 15000, ppe: ["High-visibility jacket"], brief: "Market stewards and crowd management around Eyre Square.",
    shifts: [["Market stewards", STEW, "2026-11-12", "11:00", "21:30", 18], ["Market stewards", STEW, "2026-11-13", "11:00", "21:30", 18], ["Market stewards", STEW, "2026-11-14", "10:00", "21:30", 26], ["Market stewards", STEW, "2026-11-15", "12:00", "20:00", 20]] },
  { id: "NET-103", name: "INEC Killarney: comedy tour", client: "C13", venue: "V16", kind: "Concert", desk: "Cork and Munster desk", audience: 3800, ppe: ["Black uniform"], brief: "Front of house and stewards, two nights.",
    shifts: [["Front of house and stewards", FOH.concat(STEW), "2026-11-12", "17:00", "23:30", 26], ["Front of house and stewards", FOH.concat(STEW), "2026-11-14", "17:00", "23:30", 28]] },
  { id: "NET-104", name: "Bord Gáis Energy Theatre: winter musical", client: "C22", venue: "V08", kind: "Concert", desk: "Live music and theatre desk", audience: 2100, ppe: BLACK, brief: "Ushers, bar and cloakroom for the run.",
    shifts: [["Front of house", FOH.concat(CAT), "2026-11-12", "17:30", "23:00", 22], ["Front of house", FOH.concat(CAT), "2026-11-13", "17:30", "23:00", 22], ["Matinee front of house", FOH.concat(CAT), "2026-11-14", "12:30", "17:30", 20], ["Front of house", FOH.concat(CAT), "2026-11-17", "17:30", "23:00", 22], ["Front of house", FOH.concat(CAT), "2026-11-18", "17:30", "23:00", 22]] },
  { id: "NET-105", name: "RDS Simmonscourt: Home and Interiors Show", client: "C11", venue: "V06", kind: "Exhibition", desk: "Corporate and hospitality desk", audience: 9000, ppe: HI, brief: "Build crew Friday, then show-day stewards and info desk.",
    shifts: [["Build crew", STAGE, "2026-11-13", "07:00", "15:00", 24], ["Show crew", CREW.concat(STEW), "2026-11-14", "09:00", "19:00", 40], ["Show crew", CREW.concat(STEW), "2026-11-15", "09:00", "18:00", 38], ["Breakdown crew", STAGE, "2026-11-16", "08:00", "15:00", 26]] },
  { id: "NET-106", name: "Vicar Street: indie double bill", client: "C06", venue: "V10", kind: "Concert", desk: "Live music and theatre desk", audience: 1500, ppe: ["Black uniform"], brief: "Stewards and bar support.",
    shifts: [["Stewards and bar", STEW.concat(CAT), "2026-11-13", "18:30", "23:30", 16]] },
  { id: "NET-107", name: "Cork City Hall: business awards gala", client: "C10", venue: "V14", kind: "Corporate", desk: "Cork and Munster desk", audience: 900, ppe: BLACK, brief: "Waiting staff, bar and floor crew for a seated dinner.",
    shifts: [["Catering and bar", CAT, "2026-11-13", "17:00", "01:00", 34]] },
  { id: "NET-108", name: "UL Sport Arena: Munster careers fair", client: "C09", venue: "V17", kind: "Conference", desk: "Cork and Munster desk", audience: 2600, ppe: ["Black uniform"], brief: "Registration and floor crew.",
    shifts: [["Registration and floor", FOH, "2026-11-13", "08:00", "17:00", 18]] },
  { id: "NET-109", name: "Thomond Park: Munster v Leinster", client: "C07", venue: "V05", kind: "Sport", desk: "Stadia and sport desk", audience: 25600, ppe: HI, brief: "Full stadium stewarding, turnstiles and hospitality for a sell-out derby.",
    shifts: [["Stewards", STEW, "2026-11-14", "14:30", "22:30", 120], ["Turnstiles and accreditation", ["Steward", "Accreditation"], "2026-11-14", "15:00", "21:00", 24], ["Hospitality", CAT, "2026-11-14", "15:00", "23:00", 30]], awaiting: 3 },
  { id: "NET-110", name: "Punchestown: winter racing", client: "C20", venue: "V12", kind: "Sport", desk: "Stadia and sport desk", audience: 7500, ppe: HI, brief: "Car parks, enclosures and hospitality.",
    shifts: [["Car park marshals", ["Car park marshal", "Steward"], "2026-11-14", "09:30", "18:00", 30], ["Enclosure stewards", STEW, "2026-11-14", "10:30", "18:00", 36], ["Hospitality", CAT, "2026-11-14", "11:00", "18:30", 20]] },
  { id: "NET-111", name: "Olympia Theatre: Saturday gig", client: "C06", venue: "V09", kind: "Concert", desk: "Live music and theatre desk", audience: 1240, ppe: ["Black uniform"], brief: "Stewards and cloakroom.",
    shifts: [["Stewards and cloakroom", STEW.concat(FOH), "2026-11-14", "18:00", "23:30", 16]] },
  { id: "NET-112", name: "Mondello Park: club motorsport", client: "C14", venue: "V13", kind: "Sport", desk: "Stadia and sport desk", audience: 3200, ppe: HI, brief: "Marshals for spectator areas and the paddock.",
    shifts: [["Spectator marshals", ["Steward", "Car park marshal"], "2026-11-14", "07:30", "17:30", 22]] },
  { id: "NET-113", name: "Kingspan Breffni: county final", client: "C16", venue: "V21", kind: "Sport", desk: "West and North desk", audience: 14000, ppe: HI, brief: "Stewards and turnstiles.",
    shifts: [["Stewards", STEW, "2026-11-14", "12:00", "18:30", 44]] },
  { id: "NET-114", name: "Waterford Winterval: opening day", client: "C19", venue: "V18", kind: "Festival", desk: "Cork and Munster desk", audience: 12000, ppe: ["High-visibility jacket"], brief: "Crowd stewards along The Mall and the ice rink.",
    shifts: [["Festival stewards", STEW, "2026-11-14", "10:00", "21:00", 20]] },
  { id: "NET-115", name: "Leopardstown: Sunday racing", client: "C20", venue: "V11", kind: "Sport", desk: "Stadia and sport desk", audience: 9500, ppe: HI, brief: "Car parks, stewards and hospitality.",
    shifts: [["Stewards and car parks", ["Steward", "Car park marshal"], "2026-11-15", "10:30", "18:00", 44], ["Hospitality", CAT, "2026-11-15", "11:00", "18:30", 20]] },
  { id: "NET-116", name: "Cork Opera House: family matinee", client: "C22", venue: "V15", kind: "Concert", desk: "Cork and Munster desk", audience: 1000, ppe: ["Black uniform"], brief: "Ushers and bar.",
    shifts: [["Front of house", FOH.concat(CAT), "2026-11-15", "12:00", "18:30", 14]] },
  { id: "NET-117", name: "CCD: European fintech forum", client: "C21", venue: "V07", kind: "Conference", desk: "Corporate and hospitality desk", audience: 3100, ppe: BLACK, brief: "Registration, room monitors and floor crew.",
    shifts: [["Registration and floor crew", FOH, "2026-11-16", "07:30", "18:00", 52], ["Registration and floor crew", FOH, "2026-11-17", "07:30", "18:00", 48]] },
  { id: "NET-118", name: "Dublin Castle: state reception", client: "C18", venue: "V22", kind: "Corporate", desk: "Corporate and hospitality desk", audience: 650, ppe: BLACK, brief: "Waiting staff and cloakroom. Garda vetting required.",
    shifts: [["Catering and cloakroom", CAT.concat(FOH), "2026-11-16", "17:00", "23:30", 28]] },
  { id: "NET-119", name: "Galway Racecourse: west agri expo", client: "C08", venue: "V20", kind: "Exhibition", desk: "West and North desk", audience: 6000, ppe: HI, brief: "Car parks and hall stewards over two days.",
    shifts: [["Car parks and stewards", ["Steward", "Car park marshal"], "2026-11-16", "08:00", "18:00", 22], ["Car parks and stewards", ["Steward", "Car park marshal"], "2026-11-17", "08:00", "18:00", 22]] },
  { id: "NET-120", name: "INEC Killarney: national sales conference", client: "C09", venue: "V16", kind: "Conference", desk: "Cork and Munster desk", audience: 1400, ppe: ["Black uniform"], brief: "Registration and room crew.",
    shifts: [["Registration and room crew", FOH, "2026-11-17", "07:30", "18:00", 24]] },
  { id: "NET-121", name: "Royal Hospital Kilmainham: charity gala", client: "C18", venue: "V23", kind: "Corporate", desk: "Corporate and hospitality desk", audience: 480, ppe: BLACK, brief: "Waiting staff and bar.",
    shifts: [["Catering and bar", CAT, "2026-11-17", "17:30", "00:30", 32]] },
  { id: "NET-122", name: "3Arena: arena tour, night one", client: "C13", venue: "V01", kind: "Concert", desk: "Live music and theatre desk", audience: 12800, ppe: ["Safety boots", "High-visibility jacket"], brief: "Load-in crew in the morning, stewards and crew for the show.",
    shifts: [["Load-in crew", STAGE, "2026-11-18", "08:00", "14:00", 16], ["Show crew", CREW.concat(STEW), "2026-11-18", "16:30", "23:30", 58]], awaiting: 4 },
  { id: "NET-123", name: "Cork City Hall: winter conferrings", client: "C09", venue: "V14", kind: "Conference", desk: "Cork and Munster desk", audience: 1200, ppe: ["Black uniform"], brief: "Ushers and registration.",
    shifts: [["Ushers and registration", FOH, "2026-11-18", "09:00", "17:00", 16]] }
];
/** Later bookings: regular work through to the new year. Generated, so the calendar fills like a real season. */
function laterEvents(): ES[] {
  const out: ES[] = []; let n = 200;
  const add = (date: string, name: string, client: string, venue: string, kind: EventKind, desk: Desk, audience: number, ppe: string[], shifts: [string, string[], string, string, number, number?][]) => {
    out.push({ id: "NET-" + (++n), name, client, venue, kind, desk, audience, ppe, brief: "Booked. Offers go out in waves from ten days before.",
      shifts: shifts.map(([l, r, f, t, req, off]) => [l, r, off ? addDayStr(date, off) : date, f, t, req] as SS) });
  };
  const sats = ["2026-11-21", "2026-11-28", "2026-12-05", "2026-12-12", "2026-12-19"];
  ["2026-11-20", "2026-11-28", "2026-12-04", "2026-12-12", "2026-12-18"].forEach((d, i) => add(d, "3Arena: " + ["arena tour, night two", "pop arena show", "rock double headliner", "Christmas arena show", "comedy arena special"][i], i % 2 ? "C06" : "C13", "V01", "Concert", "Live music and theatre desk", 12500,
    ["Safety boots", "High-visibility jacket"], [["Load-in crew", STAGE, "08:00", "14:00", 16], ["Show crew", CREW.concat(STEW), "16:30", "23:30", 56]]));
  add("2026-11-21", "Aviva Stadium: autumn international", "C02", "V02", "Sport", "Stadia and sport desk", 51000, HI, [["Stewards", STEW, "12:00", "20:30", 180], ["Stadium operations crew", CREW, "10:00", "19:00", 50], ["Hospitality", CAT, "11:30", "20:30", 34]]);
  sats.forEach((d, i) => add(d, "Galway Christmas Market: weekend " + (i + 2), "C19", "V19", "Festival", "West and North desk", 14000, ["High-visibility jacket"], [["Market stewards", STEW, "10:00", "21:30", 24], ["Market stewards", STEW, "12:00", "20:00", 20, 1]]));
  sats.forEach((d, i) => add(d, "Waterford Winterval: weekend " + (i + 2), "C19", "V18", "Festival", "Cork and Munster desk", 11000, ["High-visibility jacket"], [["Festival stewards", STEW, "10:00", "21:00", 20]]));
  ["2026-12-05", "2026-12-19"].forEach((d, i) => add(d, "Thomond Park: " + ["European cup weekend", "Christmas derby"][i], "C07", "V05", "Sport", "Stadia and sport desk", 25600, HI, [["Stewards", STEW, "14:00", "22:30", 120], ["Turnstiles and accreditation", ["Steward", "Accreditation"], "15:00", "21:00", 24], ["Hospitality", CAT, "15:00", "23:00", 30]]));
  add("2026-11-29", "Punchestown: November jumps", "C20", "V12", "Sport", "Stadia and sport desk", 8000, HI, [["Car parks and stewards", ["Car park marshal", "Steward"], "10:00", "18:00", 60], ["Hospitality", CAT, "11:00", "18:30", 20]]);
  add("2026-12-06", "Fairyhouse: winter festival", "C20", "V24", "Sport", "Stadia and sport desk", 9000, HI, [["Car parks and stewards", ["Car park marshal", "Steward"], "10:00", "18:00", 62], ["Hospitality", CAT, "11:00", "18:30", 22]]);
  [26, 27, 28, 29].forEach((day, i) => add("2026-12-" + day, "Leopardstown Christmas Festival: day " + (i + 1), "C20", "V11", "Sport", "Stadia and sport desk", 18000, HI, [["Stewards and car parks", ["Steward", "Car park marshal"], "10:00", "18:30", 70], ["Hospitality", CAT, "10:30", "19:00", 26]]));
  add("2026-11-24", "CCD: retail leaders conference", "C21", "V07", "Conference", "Corporate and hospitality desk", 1800, BLACK, [["Registration and floor crew", FOH, "07:30", "18:00", 44]]);
  add("2026-12-03", "CCD: tech awards", "C21", "V07", "Corporate", "Corporate and hospitality desk", 1400, BLACK, [["Catering and floor crew", CAT.concat(FOH), "16:00", "00:30", 48]]);
  add("2026-11-25", "Croke Park: sponsors' dinner", "C18", "V25", "Corporate", "Corporate and hospitality desk", 900, BLACK, [["Catering and floor crew", CAT, "16:30", "00:00", 40]]);
  ["2026-12-04", "2026-12-11", "2026-12-18"].forEach((d, i) => add(d, "Guinness Storehouse: Christmas party " + (i + 1), "C18", "V04", "Corporate", "Corporate and hospitality desk", 600, BLACK, [["Catering and floor crew", CAT, "17:30", "01:00", 30]]));
  add("2026-12-10", "Dublin Castle: Christmas reception", "C18", "V22", "Corporate", "Corporate and hospitality desk", 700, BLACK, [["Catering and cloakroom", CAT.concat(FOH), "17:00", "23:30", 30]]);
  add("2026-12-11", "Cork City Hall: Christmas ball", "C10", "V14", "Corporate", "Cork and Munster desk", 950, BLACK, [["Catering and bar", CAT, "17:00", "01:00", 36]]);
  add("2026-12-12", "Royal Hospital Kilmainham: winter gala", "C18", "V23", "Corporate", "Corporate and hospitality desk", 500, BLACK, [["Catering and bar", CAT, "17:30", "00:30", 32]]);
  ["2026-11-28", "2026-12-12"].forEach((d) => add(d, "INEC Killarney: winter concert", "C13", "V16", "Concert", "Cork and Munster desk", 4000, ["Black uniform"], [["Front of house and stewards", FOH.concat(STEW), "17:00", "23:30", 30]]));
  add("2026-12-03", "RDS: Christmas craft fair", "C11", "V06", "Exhibition", "Corporate and hospitality desk", 7000, HI, [["Build crew", STAGE, "07:00", "15:00", 20], ["Fair crew", CREW.concat(STEW), "09:30", "19:00", 36, 1], ["Fair crew", CREW.concat(STEW), "09:30", "19:00", 36, 2], ["Fair crew", CREW.concat(STEW), "10:00", "18:00", 34, 3]]);
  add("2026-12-10", "Bord Gáis Energy Theatre: Christmas panto", "C22", "V08", "Concert", "Live music and theatre desk", 2100, BLACK, [0, 1, 2, 3, 5, 7, 8, 9].map((o) => ["Front of house", FOH.concat(CAT), "17:30", "22:30", 22, o] as [string, string[], string, string, number, number]));
  add("2026-11-21", "Mondello Park: championship finale", "C14", "V13", "Sport", "Stadia and sport desk", 4500, HI, [["Spectator marshals", ["Steward", "Car park marshal"], "07:30", "17:30", 26]]);
  add("2026-12-02", "An Grianán Theatre: Christmas concert", "C22", "V26", "Concert", "West and North desk", 380, ["Black uniform"], [["Front of house", FOH, "18:00", "23:00", 8]]);
  add("2026-11-26", "UL Sport Arena: graduation week", "C09", "V17", "Conference", "Cork and Munster desk", 3000, ["Black uniform"], [["Ushers and registration", FOH, "08:30", "17:30", 22], ["Ushers and registration", FOH, "08:30", "17:30", 22, 1]]);
  return out;
}
function addDayStr(date: string, n: number): string { const d = new Date(date + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

export interface NetSeed { workers: Worker[]; documents: WorkerDocument[]; availRules: AvailabilityRule[]; events: EventBooking[]; shifts: Shift[]; invitations: Invitation[]; assignments: Assignment[]; mappings: IntegrationMapping[] }

const REGION_POOL: Record<Region, Region[]> = { Dublin: ["Dublin", "Leinster"], Leinster: ["Leinster", "Dublin"], Munster: ["Munster"], Connacht: ["Connacht", "Ulster"], Ulster: ["Ulster", "Connacht"] };
/** Monday of the week a timestamp falls in (Dublin days). */
const weekOf = (iso: string) => { const d = new Date(dayKey(iso) + "T12:00:00Z"); const wd = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - wd); return d.toISOString().slice(0, 10); };

export function buildNetwork(venues: Venue[]): NetSeed {
  const workers = buildNetWorkers();
  const venue = new Map(venues.concat(NET_VENUES).map((v) => [v.id, v]));
  const specs = WINDOW_EVENTS.concat(laterEvents());
  const events: EventBooking[] = []; const shifts: Shift[] = [];
  for (const e of specs) {
    const st = DESK_STAFF[e.desk];
    events.push({ id: e.id, name: e.name, clientId: e.client, venueId: e.venue, date: e.shifts[0][2], status: "confirmed", ownerId: st.owner, approverId: st.owner, supervisorId: st.supervisor,
      ppe: e.ppe, brief: e.brief, createdAt: T(addDayStr(e.shifts[0][2], -24 - (hash(e.id) % 30)), "10:00"), kind: e.kind, desk: e.desk, audience: e.audience, network: true });
    e.shifts.forEach(([label, roles, date, from, to, req], i) => {
      const start = T(date, from); let end = T(date, to);
      if (ms(end) <= ms(start)) end = addMin(end, 24 * 60);
      shifts.push({ id: "NSH-" + e.id.slice(4) + String.fromCharCode(65 + i), eventId: e.id, label, roles, start, end, required: req, requiredDocs: [], ppe: e.ppe, version: 1 });
    });
  }
  /* staff every shift from the regional pool, inside the working-time and Stamp 2 limits */
  const booked = new Map<string, { start: number; end: number }[]>();
  const perWeek = new Map<string, number>();
  const weekMin = new Map<string, number>();
  const pools = new Map<Region, Worker[]>();
  for (const w of workers) { const r = w.region || "Dublin"; (pools.get(r) || pools.set(r, []).get(r)!).push(w); }
  const cursor = new Map<Region, number>();
  const opening = ms(T("2026-11-12", "16:00"));
  const invitations: Invitation[] = []; const assignments: Assignment[] = [];
  const fits = (w: Worker, sh: Shift) => {
    const s0 = ms(sh.start), e0 = ms(sh.end), wk = weekOf(sh.start), dur = (e0 - s0) / 60000;
    if ((perWeek.get(w.id + wk) || 0) >= 2) return false;
    if (isStamp2(w.id) && (weekMin.get(w.id + wk) || 0) + dur + earlierMin(w.id) > 15 * 60) return false;
    for (const b of booked.get(w.id) || []) { if (s0 < b.end + 12 * 3600000 && e0 > b.start - 12 * 3600000) return false; }
    return true;
  };
  for (const sh of shifts.slice().sort((a, b) => a.start.localeCompare(b.start))) {
    const ev = events.find((x) => x.id === sh.eventId)!;
    const spec = specs.find((x) => x.id === ev.id)!;
    const daysOut = (ms(sh.start) - opening) / 864e5;
    const lastShiftOfEvent = shifts.filter((x) => x.eventId === ev.id).pop() === sh;
    const fill = daysOut < 7 ? 1 : daysOut < 13 ? 0.82 + (hash(sh.id) % 14) / 100 : daysOut < 24 ? 0.4 + (hash(sh.id) % 25) / 100 : (hash(sh.id) % 22) / 100;
    const awaiting = daysOut < 7 && spec.awaiting && lastShiftOfEvent ? spec.awaiting : 0;
    const target = Math.min(sh.required, Math.round(sh.required * fill)) - awaiting - (daysOut < 7 && spec.awaiting && lastShiftOfEvent ? 2 : 0);
    const region = venue.get(ev.venueId!)?.region || "Dublin";
    const order = REGION_POOL[region].flatMap((r) => pools.get(r) || []).concat(workers);
    let got = 0, tries = 0; const want = target + awaiting;
    const pick: Worker[] = [];
    let i = cursor.get(region) || 0;
    while (pick.length < want && tries < order.length * 1.2) {
      const w = order[i % order.length]; i++; tries++;
      if (pick.includes(w) || !fits(w, sh)) continue;
      const roleOk = w.roles.some((r) => sh.roles.includes(r)) || tries > order.length * 0.6;
      if (!roleOk) continue;
      pick.push(w);
    }
    cursor.set(region, i % Math.max(1, (REGION_POOL[region].flatMap((r) => pools.get(r) || [])).length));
    pick.forEach((w, j) => {
      const s0 = ms(sh.start), e0 = ms(sh.end), wk = weekOf(sh.start);
      const accepted = j < target;
      const aIdx = j - target;
      const sentAt = accepted ? T(addDayStr(dayKey(sh.start), -Math.min(9, Math.max(2, Math.round(daysOut) + 3))), pad(9 + (j % 9), 2) + ":" + pad((j * 7) % 60, 2)) : T("2026-11-12", pad(12 + (aIdx % 3), 2) + ":" + pad(10 + aIdx * 9, 2));
      const sent = ms(sentAt) > opening ? T("2026-11-11", "10:00") : sentAt;
      const inv: Invitation = { id: "NINV-" + sh.id.slice(4) + "-" + w.id, shiftId: sh.id, workerId: w.id, sentAt: sent, sentBy: DESK_STAFF[ev.desk || "Dublin events desk"].owner, version: 1,
        status: accepted ? "accepted" : "sent", expiresAt: addMin(sh.start, -120), respondedAt: accepted ? addMin(sent, 25 + (hash(w.id) % 300)) : undefined, flags: [], kind: "standard", reminders: [] };
      if (accepted && ms(inv.respondedAt!) > opening) inv.respondedAt = addMin(sent, 20);
      invitations.push(inv);
      if (accepted) {
        assignments.push({ id: "NASG-" + sh.id.slice(4) + "-" + w.id, shiftId: sh.id, workerId: w.id, invitationId: inv.id, status: "confirmed", acceptedAt: inv.respondedAt!, shiftVersion: 1 });
        (booked.get(w.id) || booked.set(w.id, []).get(w.id)!).push({ start: s0, end: e0 });
        perWeek.set(w.id + wk, (perWeek.get(w.id + wk) || 0) + 1);
        weekMin.set(w.id + wk, (weekMin.get(w.id + wk) || 0) + (e0 - s0) / 60000);
        w.priorVenues = w.priorVenues.includes(venue.get(ev.venueId!)!.name) ? w.priorVenues : w.priorVenues.concat(venue.get(ev.venueId!)!.name).slice(-3);
      }
    });
    void got;
  }
  const mappings: IntegrationMapping[] = workers.map((w) => ({ id: "MAP-" + w.id, entityType: "worker", localId: w.id, remoteId: "BH-CAND-" + (40210 + Number(w.id.slice(1)) * 7), status: "mapped", note: "Matched on email at sample import" }));
  NET_CLIENTS.forEach((c) => mappings.push({ id: "MAP-" + c.id, entityType: "client", localId: c.id, remoteId: NET_CLIENT_REMOTE[c.id], status: "mapped", note: "ClientCorporation matched on company name" }));
  return { workers, documents: buildNetDocs(workers), availRules: buildNetAvailability(workers), events, shifts, invitations, assignments, mappings };
}

/* ── playing the network forward to the scenario clock ───────────────────── */
export const isNetEvent = (e: { network?: boolean } | undefined) => !!e?.network;
const LATE = (k: number) => k % 37 === 0;
export function settleNetwork(d: OssState, to: string) {
  const now = ms(to);
  const shiftById = new Map(d.shifts.map((x) => [x.id, x]));
  const eventById = new Map(d.events.map((x) => [x.id, x]));
  const venueById = new Map(d.venues.map((x) => [x.id, x]));
  const have = new Set<string>();
  for (const c of d.clocks) if (c.id.startsWith("NCL-")) have.add(c.id);
  for (const j of d.journeys) if (j.id.startsWith("NJ-")) have.add(j.id);
  for (const a of d.approvals) if (a.id.startsWith("NAP-")) have.add(a.id);
  for (const i of d.items) if (i.id.startsWith("NHO-")) have.add(i.id);
  for (const a of d.audit) if (a.id.startsWith("NAUD-")) have.add(a.id);
  const newAudit: AuditEvent[] = [];
  const shiftIn = new Map<string, number>(); const batchRows = new Map<string, { n: number; min: number; at: string; desk: string; label: string }>(); const approvedBy = new Map<string, { n: number; at: string; by: string; label: string }>();
  /* replies to the few offers still out */
  for (const inv of d.invitations) {
    if (!inv.id.startsWith("NINV-") || inv.status !== "sent") continue;
    const k = hash(inv.id); const reply = ms(inv.sentAt) + (5 + (k % 5)) * 3600000;
    if (reply > now) continue;
    const sh = shiftById.get(inv.shiftId); if (!sh || ms(sh.start) < reply) continue;
    inv.status = "accepted"; inv.respondedAt = new Date(reply).toISOString();
    d.assignments.push({ id: "NASG-" + sh.id.slice(4) + "-" + inv.workerId, shiftId: sh.id, workerId: inv.workerId, invitationId: inv.id, status: "confirmed", acceptedAt: inv.respondedAt, shiftVersion: 1 });
  }
  for (const a of d.assignments) {
    if (!a.id.startsWith("NASG-") || a.status !== "confirmed") continue;
    const sh = shiftById.get(a.shiftId)!; const ev = eventById.get(sh.eventId)!; const v = venueById.get(ev.venueId || "");
    const s0 = ms(sh.start), e0 = ms(sh.end); if (s0 - 3600000 > now) continue;
    const k = hash(a.id); const late = LATE(k);
    const inAt = s0 + (late ? 8 + (k % 22) : -(k % 14)) * 60000;
    const outAt = e0 + ((k % 9) - 3) * 60000;
    const jId = "NJ-" + a.id;
    if (!have.has(jId) && k % 5 !== 0 && s0 - (late ? 15 : 50) * 60000 <= now) d.journeys.push({ id: jId, assignmentId: a.id, status: late ? "running_late" : "on_the_way", at: new Date(s0 - (late ? 15 : 50) * 60000).toISOString(), eta: late ? new Date(inAt).toISOString() : undefined, message: late ? ["Bus is crawling, ten minutes out", "Traffic on the N7, nearly there", "Train delayed, be there shortly"][k % 3] : undefined } as JourneyUpdate);
    const method: ClockEntry["method"] = v?.methods.includes("qr") && k % 2 ? "qr" : "gps";
    const mk = (kind: "in" | "out", at: number): ClockEntry => ({ id: "NCL-" + a.id + "-" + kind, assignmentId: a.id, kind, at: new Date(at).toISOString(), method, distanceM: method === "gps" ? 6 + (k % 34) : undefined, accuracyM: method === "gps" ? 4 + (k % 9) : undefined, token: method === "qr" ? v?.qrToken : undefined, result: "verified", reason: method === "qr" ? "Venue QR code scanned" : "Inside the venue geofence", eventKey: a.id + ":" + kind });
    if (inAt <= now && !have.has("NCL-" + a.id + "-in")) { d.clocks.push(mk("in", inAt)); shiftIn.set(sh.id, (shiftIn.get(sh.id) || 0) + 1); }
    if (outAt <= now && !have.has("NCL-" + a.id + "-out")) d.clocks.push(mk("out", outAt));
    const desk = ev.desk || "Dublin events desk"; const staff = DESK_STAFF[desk];
    const apAt = e0 + 150 * 60000;
    if (apAt <= now && !have.has("NAP-" + a.id)) {
      d.approvals.push({ id: "NAP-" + a.id, assignmentId: a.id, version: 1, approvedBy: staff.hours, approvedAt: new Date(apAt).toISOString(), status: "approved" } as TimesheetApproval);
      const key = staff.hours + dayKey(sh.start); const g = approvedBy.get(key) || { n: 0, at: new Date(apAt).toISOString(), by: staff.hours, label: dayKey(sh.start) }; g.n++; approvedBy.set(key, g);
    }
    const hoAt = e0 + 7 * 3600000;
    if (hoAt <= now && !have.has("NHO-" + a.id)) {
      const wd = dayKey(sh.start); const batchId = "BH-" + wd.slice(5).replace("-", "") + "-" + DESK_CODE[desk];
      const worked = Math.max(0, Math.round((outAt - inAt) / 60000) - d.rules.breakMin);
      const top = d.rules.minimumOn ? Math.max(0, d.rules.minimumMin - worked) : 0;
      const tk = a.id + ":" + wd + ":v1";
      if (!d.batches.some((b) => b.id === batchId)) d.batches.push({ id: batchId, label: desk + ", " + wd.slice(8) + " " + ["Nov", "Dec"][Number(wd.slice(5, 7)) - 11], createdAt: new Date(hoAt).toISOString(), createdBy: staff.hours, scope: desk });
      const n = d.items.filter((x) => x.batchId === batchId).length + 1;
      d.items.push({ id: "NHO-" + a.id, batchId, assignmentId: a.id, version: 1, transferKey: tk, state: "accepted", receipt: "SIM-RCPT-" + batchId.slice(3) + "-" + pad(n), attempts: [{ at: new Date(hoAt).toISOString(), result: "accepted" }],
        snapshot: { timesheetId: "TS-" + a.id, version: 1, workerId: a.workerId, candidateId: "BH-CAND-" + (40210 + Number(a.workerId.slice(1)) * 7), clientId: ev.clientId, clientRemoteId: NET_CLIENT_REMOTE[ev.clientId] || "BH-CORP-2231",
          eventId: ev.id, shiftId: sh.id, workDate: wd, scheduledStart: sh.start, scheduledEnd: sh.end, approvedStart: new Date(inAt).toISOString(), approvedEnd: new Date(outAt).toISOString(),
          workedMin: worked, breakMin: d.rules.breakMin, topupMin: top, payableMin: worked + top, extraMin: Math.max(0, Math.round((outAt - e0) / 60000)), approvedBy: staff.hours, approvedAt: new Date(apAt).toISOString(), correction: null, transferKey: tk } } as HandoverItem);
      const b = batchRows.get(batchId) || { n: 0, min: 0, at: new Date(hoAt).toISOString(), desk, label: wd }; b.n++; b.min += worked + top; batchRows.set(batchId, b);
    }
  }
  /* a few lines of activity per shift and batch, not one per person */
  shiftIn.forEach((n, shId) => { const sh = shiftById.get(shId)!; const ev = eventById.get(sh.eventId)!; const id = "NAUD-in-" + shId;
    if (!have.has(id)) newAudit.push({ id, at: ms(sh.start) <= now ? sh.start : to, actor: "OSS Crew", action: "clock.batch_in", entity: { type: "shift", id: shId, label: ev.name.split(":")[0] + ", " + sh.label }, summary: n + " crew clocked in at " + ev.name.split(":")[0] + ", " + sh.label.toLowerCase(), category: "systems", result: "simulated" }); });
  approvedBy.forEach((g, key) => { const id = "NAUD-ap-" + key + "-" + g.n; if (!have.has(id)) newAudit.push({ id, at: g.at, actor: d.users.find((u) => u.id === g.by)?.name || g.by, action: "hours.approved", entity: { type: "timesheet", id: key, label: g.n + " lines" }, summary: (d.users.find((u) => u.id === g.by)?.name || "Desk") + " approved " + g.n + " timesheet lines for " + g.label.slice(8) + " " + ["Nov", "Dec"][Number(g.label.slice(5, 7)) - 11], category: "approvals", result: "ok" }); });
  batchRows.forEach((b, id) => { const aid = "NAUD-bh-" + id + "-" + b.n; if (!have.has(aid)) newAudit.push({ id: aid, at: b.at, actor: "Bullhorn", action: "handover.sent", entity: { type: "batch", id, label: id }, summary: "Bullhorn accepted " + id + ": " + b.n + " rows from the " + b.desk + " (" + Math.floor(b.min / 60) + "h" + (b.min % 60 ? " " + (b.min % 60) + "m" : "") + ")", category: "systems", result: "simulated" }); });
  if (newAudit.length) { d.audit.push(...newAudit); d.audit.sort((a, b) => a.at.localeCompare(b.at)); }
  void minutesBetween;
}
