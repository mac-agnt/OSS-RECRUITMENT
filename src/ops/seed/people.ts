/* Office staff, supervisors and about 1,040 fictional crew with their documents.
   Real OSS people appear by first name only, with demo contact details. */

import type { Avail, Doc, DocType, Region, Rtw, User, Worker } from "../model";
import { hash, pick, roll } from "../rand";
import { addDays } from "../time";

export const USERS: User[] = [
  { id: "U1", name: "Daniele", title: "Events coordinator", kind: "office", email: "daniele@example.test", phone: "01 555 0101",
    perms: ["allocate", "message", "approve_hours", "view_docs", "verify_docs", "payroll"] },
  { id: "U2", name: "Shane", title: "Director", kind: "office", email: "shane@example.test", phone: "01 555 0102",
    perms: ["allocate", "message", "approve_hours", "view_docs", "verify_docs", "payroll", "manage", "supervise"] },
  { id: "U3", name: "Clodagh", title: "Compliance and payroll", kind: "office", email: "clodagh@example.test", phone: "01 555 0103",
    perms: ["message", "approve_hours", "view_docs", "verify_docs", "payroll"] },
  { id: "U4", name: "Ronan", title: "Recruitment consultant", kind: "office", email: "ronan@example.test", phone: "01 555 0104",
    perms: ["message"] },
  ...(["Bianca", "Declan", "Siobhán", "Marek", "Aisling", "Femi", "Ruairí", "Ewa", "Tadhg"].map((name, i): User => ({
    id: "S" + (i + 1), name, title: "Site supervisor", kind: "supervisor",
    email: name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") + "@example.test",
    phone: "087 555 01" + String(20 + i), perms: ["supervise", "message"]
  })))
];

/* ── names ──────────────────────────────────────────────────────────────── */
const IRISH_F = ["Aoife", "Ciara", "Niamh", "Saoirse", "Róisín", "Orla", "Gráinne", "Caoimhe", "Clodagh", "Sinéad", "Áine", "Eimear",
  "Deirdre", "Emer", "Fiona", "Laura", "Rachel", "Sarah", "Emma", "Chloe", "Katie", "Megan", "Leah", "Hannah", "Ella", "Ava", "Sophie",
  "Grace", "Amy", "Lucy", "Erin", "Rebecca", "Jessica", "Shauna", "Nicole", "Ellen", "Molly", "Ruth", "Maeve", "Ailbhe", "Muireann", "Nuala"];
const IRISH_M = ["Seán", "Ciarán", "Cian", "Oisín", "Darragh", "Conor", "Eoin", "Fionn", "Liam", "Jack", "Adam", "Dylan", "Luke", "Aaron",
  "Callum", "Ryan", "Kevin", "Mark", "David", "Niall", "Dónal", "Pádraig", "Cathal", "Diarmuid", "Colm", "Brian", "Barry", "Gavin",
  "Stephen", "Paul", "John", "Michael", "Patrick", "James", "Rory", "Kieran", "Fergal", "Alan", "Robbie", "Sam", "Josh", "Evan", "Jamie",
  "Killian", "Cillian", "Ronan", "Emmet", "Lorcan"];
const IRISH_L = ["Murphy", "Kelly", "O'Sullivan", "Walsh", "Smith", "O'Brien", "Byrne", "Ryan", "O'Connor", "O'Neill", "O'Reilly", "Doyle",
  "McCarthy", "Gallagher", "Kennedy", "Lynch", "Murray", "Quinn", "Moore", "McLoughlin", "Connolly", "Daly", "O'Connell", "Dunne", "Brennan",
  "Burke", "Collins", "Campbell", "Clarke", "Hughes", "Fitzgerald", "Martin", "Maguire", "Nolan", "Flynn", "O'Callaghan", "O'Donnell",
  "Duffy", "Mahony", "Boyle", "Healy", "O'Shea", "Sweeney", "Hayes", "Kavanagh", "Power", "McGrath", "Moran", "Brady", "Casey", "Foley",
  "Fitzpatrick", "O'Leary", "Donnelly", "Regan", "Donovan", "Flanagan", "Kane", "Cunningham", "Griffin", "Kenny", "Sheehan", "Ward",
  "Whelan", "Lyons", "Higgins", "Cullen", "Keane", "Maher", "McKenna", "Hogan", "O'Keeffe", "McNamara", "Moloney", "O'Rourke", "Buckley",
  "O'Dwyer", "Phelan", "Tobin", "Furlong", "Kinsella", "Lawlor", "Behan", "Geraghty", "Nevin", "Rafferty", "Shiels", "Traynor", "Mulligan"];
const EU: [string[], string[]][] = [
  [["Tomasz", "Piotr", "Kasia", "Agnieszka", "Michał", "Paweł", "Jakub", "Ewelina", "Monika", "Krzysztof", "Magda", "Bartek"],
    ["Kowalski", "Nowak", "Wiśniewski", "Wójcik", "Lewandowski", "Szymański", "Dąbrowski", "Zieliński", "Kamiński", "Mazur"]],
  [["Lukas", "Ieva", "Mantas", "Rūta", "Tomas", "Greta"], ["Kazlauskas", "Petrauskas", "Jankauskas", "Butkus", "Vasiliauskas"]],
  [["Andrei", "Ioana", "Elena", "Mihai", "Alexandra", "Vlad", "Bianca"], ["Popescu", "Ionescu", "Dumitru", "Stan", "Munteanu", "Constantin"]],
  [["Pablo", "Lucía", "Javier", "Sofía", "Carlos", "Alba", "Irene", "Sergio"], ["García", "Fernández", "López", "Martínez", "Sánchez", "Romero", "Navarro"]],
  [["Giulia", "Marco", "Francesca", "Luca", "Chiara", "Matteo"], ["Rossi", "Russo", "Bianchi", "Romano", "Ricci", "Greco"]],
  [["Camille", "Léa", "Hugo", "Lucas", "Manon", "Théo"], ["Dubois", "Laurent", "Moreau", "Girard", "Bernard"]],
  [["Inês", "João", "Beatriz", "Tiago", "Rita"], ["Ferreira", "Pereira", "Costa", "Martins", "Sousa"]],
  [["Jānis", "Anna", "Matej", "Zuzana", "Péter", "Eszter"], ["Bērziņš", "Ozols", "Horváth", "Novák", "Kovács", "Varga"]]
];
const STUDENT: [string[], string[]][] = [
  [["Gabriel", "Mateus", "Larissa", "Camila", "Thiago", "Rafael", "Juliana", "Bruna", "Felipe", "Amanda"], ["Oliveira", "Souza", "Lima", "Carvalho", "Almeida", "Ribeiro", "Rodrigues", "Barbosa"]],
  [["Arjun", "Ananya", "Rohan", "Sneha", "Karthik", "Divya", "Aditya", "Meera"], ["Sharma", "Patel", "Reddy", "Iyer", "Menon", "Gupta", "Kumar"]],
  [["Wei", "Mei", "Jun", "Xin", "Hao", "Yan"], ["Zhang", "Wang", "Li", "Chen", "Liu", "Zhao"]],
  [["Diego", "Valentina", "Santiago", "Fernanda", "Mariana"], ["Hernández", "González", "Ramírez", "Torres", "Flores"]],
  [["Min-jun", "Ji-woo", "Seo-yeon"], ["Kim", "Park", "Lee"]]
];
const STAMP4: [string[], string[]][] = [
  [["Olena", "Oleksandr", "Iryna", "Dmytro", "Kateryna", "Yulia", "Andrii"], ["Shevchenko", "Kovalenko", "Bondarenko", "Tkachenko", "Melnyk", "Kravchenko"]],
  [["Chidi", "Adaeze", "Emeka", "Ngozi", "Tunde"], ["Okafor", "Eze", "Nwosu", "Adeyemi", "Okeke"]],
  [["Ahmed", "Fatima", "Omar", "Layla"], ["Al-Hassan", "Haddad", "Khalil", "Mansour"]]
];
const UK: [string[], string[]] = [["Oliver", "Harry", "Amelia", "Isla", "George", "Charlotte", "Freya", "Jacob", "Poppy", "Alfie"], ["Taylor", "Evans", "Davies", "Wright", "Hall", "Robinson", "Hughes", "Green", "Wood", "Turner"]];

/* ── places people live ─────────────────────────────────────────────────── */
const AREAS: Record<Region, [string, string][]> = {
  Dublin: [["Dublin 1", "Dublin"], ["Dublin 7", "Dublin"], ["Dublin 8", "Dublin"], ["Dublin 15", "Dublin"], ["Tallaght", "Dublin"],
    ["Clondalkin", "Dublin"], ["Lucan", "Dublin"], ["Swords", "Dublin"], ["Blanchardstown", "Dublin"], ["Dún Laoghaire", "Dublin"],
    ["Drumcondra", "Dublin"], ["Rathmines", "Dublin"], ["Finglas", "Dublin"], ["Coolock", "Dublin"], ["Ballsbridge", "Dublin"], ["Phibsborough", "Dublin"]],
  Leinster: [["Bray", "Wicklow"], ["Naas", "Kildare"], ["Maynooth", "Kildare"], ["Drogheda", "Louth"], ["Navan", "Meath"], ["Portlaoise", "Laois"],
    ["Kilkenny", "Kilkenny"], ["Wexford", "Wexford"], ["Athlone", "Westmeath"], ["Carlow", "Carlow"]],
  Munster: [["Cork city", "Cork"], ["Ballincollig", "Cork"], ["Limerick city", "Limerick"], ["Adare", "Limerick"], ["Ennis", "Clare"],
    ["Waterford", "Waterford"], ["Tralee", "Kerry"], ["Killarney", "Kerry"], ["Clonmel", "Tipperary"], ["Shannon", "Clare"], ["Newcastle West", "Limerick"]],
  Connacht: [["Galway city", "Galway"], ["Oranmore", "Galway"], ["Castlebar", "Mayo"], ["Sligo", "Sligo"], ["Roscommon", "Roscommon"]],
  Ulster: [["Letterkenny", "Donegal"], ["Cavan", "Cavan"], ["Monaghan", "Monaghan"]]
};

/* Skill mixes: each crew member holds one of these. */
const MIXES: string[][] = [
  ["Steward"], ["Steward", "Event crew"], ["Event crew", "General operative"], ["Catering assistant", "Bar staff"],
  ["Stagehand", "Event crew"], ["Steward", "Car park marshal"], ["Hospitality host", "Catering assistant"],
  ["General operative", "Stagehand"], ["Bar staff"], ["Accreditation", "Steward"], ["Event crew"], ["Catering assistant"],
  ["Car park marshal", "Event crew"], ["Steward", "Hospitality host"], ["Event crew", "Steward"], ["Bar staff", "Event crew"]
];

export const N_WORKERS = 1040;
export const wid = (n: number) => "W" + String(n).padStart(4, "0");

/** Named personas the presenter plays on the phone. */
export const PERSONAS = { ciaran: "W0001", maria: "W0002", priya: "W0003", tomasz: "W0004", aoife: "W0005" } as const;

const slug = (name: string) => name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]+/g, ".").replace(/^\.|\.$/g, "");
const AVAIL_POOL: Avail[] = ["a", "a", "a", "e", "e", "e", "d", "d", "x", "x", "?", "?"];

function regionFor(n: number): Region {
  const r = roll("region" + n, 100);
  return r < 55 ? "Dublin" : r < 70 ? "Leinster" : r < 88 ? "Munster" : r < 95 ? "Connacht" : "Ulster";
}
function rtwFor(n: number): Rtw {
  const r = roll("rtw" + n, 100);
  return r < 55 ? "Irish citizen" : r < 77 ? "EU/EEA citizen" : r < 79 ? "UK citizen" : r < 92 ? "Stamp 2" : r < 98 ? "Stamp 4" : "Stamp 1G";
}
function nameFor(n: number, rtw: Rtw, used: Set<string>): string {
  for (let k = 0; k < 400; k++) {
    const key = "nm" + n + ":" + k;
    let first: string, last: string;
    if (rtw === "Irish citizen" || k > 200) {
      first = roll(key + "g", 2) ? pick(IRISH_F, key + "f") : pick(IRISH_M, key + "m");
      last = pick(IRISH_L, key + "l");
      // A share of Irish citizens have family names from elsewhere, as in the real workforce.
      if (roll(key + "x", 100) < 12) last = pick(pick(STAMP4, key + "g4")[1], key + "l4");
    } else if (rtw === "EU/EEA citizen") { const g = pick(EU, key + "g"); first = pick(g[0], key + "f"); last = pick(g[1], key + "l"); }
    else if (rtw === "UK citizen") { first = pick(UK[0], key + "f"); last = pick(UK[1], key + "l"); }
    else if (rtw === "Stamp 4") { const g = pick(STAMP4, key + "g"); first = pick(g[0], key + "f"); last = pick(g[1], key + "l"); }
    else { const g = pick(STUDENT, key + "g"); first = pick(g[0], key + "f"); last = pick(g[1], key + "l"); }
    const name = first + " " + last;
    if (!used.has(name)) { used.add(name); return name; }
  }
  throw new Error("name pool exhausted");
}

function weekFor(n: number, rtw: Rtw): string {
  let w = "";
  for (let d = 0; d < 7; d++) {
    let c = pick(AVAIL_POOL, "wk" + n + ":" + d);
    // Students on Stamp 2 mostly work evenings and weekends.
    if (rtw === "Stamp 2" && d < 5 && c === "a") c = "e";
    w += c;
  }
  return w;
}

export function buildWorkers(today: string): Worker[] {
  const used = new Set<string>();
  const out: Worker[] = [];
  const persona: Record<string, Partial<Worker>> = {
    W0001: { name: "Ciarán Doyle", rtw: "Irish citizen", region: "Dublin", area: "Phibsborough", county: "Dublin", roles: ["Stagehand", "Event crew", "General operative"], week: "aaeeaax" },
    W0002: { name: "Maria Santos", rtw: "Stamp 2", region: "Dublin", area: "Dublin 8", county: "Dublin", roles: ["Steward", "Hospitality host"], week: "deeeeaa" },
    W0003: { name: "Priya Nair", rtw: "Stamp 2", region: "Dublin", area: "Dublin 15", county: "Dublin", roles: ["Catering assistant", "Bar staff"], week: "eeeeeaa" },
    W0004: { name: "Tomasz Nowak", rtw: "EU/EEA citizen", region: "Dublin", area: "Clondalkin", county: "Dublin", roles: ["Event crew", "Steward"], week: "aaeaaaa" },
    W0005: { name: "Aoife Brennan", rtw: "Irish citizen", region: "Dublin", area: "Swords", county: "Dublin", roles: ["Catering assistant", "Bar staff"], week: "eeaeaae" }
  };
  Object.values(persona).forEach((p) => used.add(p.name!));
  for (let n = 1; n <= N_WORKERS; n++) {
    const id = wid(n);
    const p = persona[id];
    const rtw = p?.rtw || rtwFor(n);
    const region = p?.region || regionFor(n);
    const [area, county] = p ? [p.area!, p.county!] : pick(AREAS[region], "area" + n);
    const name = p?.name || nameFor(n, rtw, used);
    const linked = n <= 5 || roll("bh" + n, 100) >= 4;
    const joinedYear = 2016 + roll("jy" + n, 11);
    const joined = Math.min(joinedYear, Number(today.slice(0, 4))) + "-" + String(1 + roll("jm" + n, 12)).padStart(2, "0") + "-" + String(1 + roll("jd" + n, 27)).padStart(2, "0");
    const off = !p && roll("off" + n, 100) < 6
      ? [{ id: "OFF-" + id, from: addDays(today, 3 + roll("offs" + n, 20)), to: addDays(today, 6 + roll("offs" + n, 20)), note: "Away" }]
      : [];
    out.push({
      id, name, email: slug(name) + (p ? "" : "." + n) + "@example.test",
      mobile: "08" + (3 + roll("mob" + n, 6)) + " 555 " + String(1000 + ((n * 7919) % 9000)).slice(-4),
      area, county, region, roles: p?.roles || pick(MIXES, "mix" + n), rtw,
      status: "active", joined: joined > today ? today : joined,
      bullhornId: linked ? "BH-" + (40000 + n * 7) : null, bullhornState: linked ? (roll("bhs" + n, 100) < 3 ? "pending" : "synced") : "not_linked",
      week: p?.week || weekFor(n, rtw), off, persona: !!p || undefined
    });
  }
  return out;
}

/* ── documents ──────────────────────────────────────────────────────────── */
const ID_NAMES: Record<Rtw, string[]> = {
  "Irish citizen": ["Irish passport", "Irish driving licence", "Irish passport card"],
  "EU/EEA citizen": ["EU passport", "EU national ID card"],
  "UK citizen": ["UK passport"],
  "Stamp 2": ["Passport"], "Stamp 4": ["Passport"], "Stamp 1G": ["Passport"]
};
const DOC_NAME: Record<DocType, string> = {
  ID: "Photo ID", RTW: "IRP card", MH: "Manual handling certificate", SP: "Safe Pass card", HACCP: "Food safety Level 1 certificate",
  FA: "Occupational first aid", PSA: "PSA licence (event security)"
};
const VALID_YEARS: Record<DocType, number> = { ID: 10, RTW: 1, MH: 3, SP: 4, HACCP: 3, FA: 2, PSA: 3 };

/** Document rows for every worker. Expiry dates are spread relative to today so warnings always exist. */
export function buildDocs(workers: Worker[], today: string, clock: string): Doc[] {
  const docs: Doc[] = [];
  const add = (w: Worker, type: DocType, daysLeft: number, status: Doc["status"] = "verified", extra: Partial<Doc> = {}) => {
    const n = Number(w.id.slice(1));
    const expires = addDays(today, daysLeft);
    const issued = addDays(expires, -Math.round(VALID_YEARS[type] * 365.25));
    const name = type === "ID" ? pick(ID_NAMES[w.rtw], "idn" + n) : type === "RTW" ? "IRP card (" + w.rtw + ")" : DOC_NAME[type];
    docs.push({
      id: "D-" + w.id + "-" + type + (extra.id ? "" : ""), workerId: w.id, type, name,
      ref: "•••• " + String((hash(w.id + type) % 9000) + 1000), issued: issued > today ? today : issued, expires,
      status, file: w.id.toLowerCase() + "-" + type.toLowerCase() + ".pdf",
      uploadedAt: status === "pending" ? clock : addDays(issued, 2) + "T10:00:00.000Z", uploadedBy: w.id,
      verifiedBy: status === "verified" ? "U3" : undefined, verifiedAt: status === "verified" ? addDays(issued, 4) + "T11:30:00.000Z" : undefined,
      ...extra
    });
  };
  for (const w of workers) {
    const n = Number(w.id.slice(1));
    const k = (t: string) => "doc" + t + n;
    if (n <= 5) continue; // personas get hand-written documents below
    // Photo ID: nearly everyone valid; a handful expiring or expired.
    const idr = roll(k("id"), 1000);
    add(w, "ID", idr < 8 ? -roll(k("ide"), 60) - 1 : idr < 22 ? 3 + roll(k("ide"), 26) : 200 + roll(k("idv"), 2800));
    if (w.rtw === "Stamp 2" || w.rtw === "Stamp 4" || w.rtw === "Stamp 1G") {
      const r = roll(k("rtw"), 100);
      add(w, "RTW", r < 4 ? -1 - roll(k("rtwe"), 30) : r < 14 ? 4 + roll(k("rtwe"), 25) : 40 + roll(k("rtwv"), 320));
    }
    const physical = w.roles.some((r) => /Stagehand|General operative|Event crew|Car park/.test(r));
    if (physical && roll(k("mh"), 100) < 88) {
      const r = roll(k("mhs"), 100);
      add(w, "MH", r < 4 ? -1 - roll(k("mhe"), 90) : r < 9 ? 5 + roll(k("mhe"), 24) : 60 + roll(k("mhv"), 1000));
    }
    if (w.roles.some((r) => /Stagehand|General operative/.test(r)) && roll(k("sp"), 100) < 45) add(w, "SP", 90 + roll(k("spv"), 1300));
    if (w.roles.some((r) => /Catering|Bar|Hospitality/.test(r)) && roll(k("hc"), 100) < 92) {
      const r = roll(k("hcs"), 100);
      add(w, "HACCP", r < 3 ? -1 - roll(k("hce"), 60) : r < 8 ? 6 + roll(k("hce"), 22) : 90 + roll(k("hcv"), 900));
    }
    if (roll(k("fa"), 100) < 6) add(w, "FA", 30 + roll(k("fav"), 600));
    if (w.roles.includes("Steward") && roll(k("psa"), 100) < 22) add(w, "PSA", 60 + roll(k("psav"), 900));
  }
  // Personas.
  const by = (id: string) => workers.find((w) => w.id === id)!;
  add(by("W0001"), "ID", 2400); add(by("W0001"), "MH", 410); add(by("W0001"), "SP", 900);
  add(by("W0002"), "ID", 1500); add(by("W0002"), "RTW", 152);
  add(by("W0003"), "ID", 1700); add(by("W0003"), "RTW", -3); add(by("W0003"), "HACCP", 520);
  add(by("W0004"), "ID", 2100); add(by("W0004"), "MH", 640);
  add(by("W0005"), "ID", 1900); add(by("W0005"), "HACCP", 300);
  return docs;
}
