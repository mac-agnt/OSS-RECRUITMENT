/* Seed rows for the industry layer: the Ryder Cup and winter recruitment
   pipeline, group inductions in every office, and empty sign-off / kit ledgers.
   Deterministic, no imports from selectors (seed.ts imports this).

   Scale: about 400 applicants. The Ryder Cup 2027 campaign (about 300) leans
   on Limerick and Munster; the winter season campaign (about 100) is spread
   across Dublin, Cork and Galway. */

import type { Applicant, ExtState, Induction } from "./model";
import { zoned } from "./time";

const FIRST = ["Conor", "Aoife", "Eimear", "Darragh", "Ciarán", "Saoirse", "Lucas", "Gabriela", "Rafael", "Juliana", "Tomás", "Ella", "Jakub", "Zofia", "Kwame", "Amara", "Diarmuid", "Clodagh", "Thiago", "Larissa",
  "Rory", "Méabh", "Oisín", "Sinéad", "Bruno", "Camila", "Piotr", "Hannah", "Cian", "Laura", "Mohammed", "Priya", "Fiachra", "Nóra", "Mateo", "Isabela", "Dylan", "Gráinne", "Pedro", "Yasmin", "Kacper", "Ailbhe",
  "Seán", "Orla", "Liam", "Róisín", "Eoghan", "Áine", "Killian", "Siún", "Pádraic", "Caitríona", "Ruairí", "Deirbhile", "Colm", "Muireann", "Fionnán", "Ellie", "Jamie", "Ava", "Noah", "Freya", "Andrei", "Ioana",
  "Arjun", "Ananya", "Chinedu", "Ngozi", "Dmytro", "Olena", "Marco", "Giulia", "Lucía", "Javier", "Wei", "Mei", "Hugo", "Inès"];
const LAST = ["Kinsella", "Mulligan", "O'Rourke", "Fahy", "Brady", "Santos", "Oliveira", "Pereira", "Nowak", "Lewandowski", "Mensah", "Adeyemi", "Nolan", "Geraghty", "Ferreira", "Costello", "Hennessy", "Lima",
  "Wiśniewska", "Moloney", "Carroll", "Dempsey", "Rocha", "Kenny", "Burke", "Ahmed", "Sharma", "Horgan", "Maguire", "Souza", "O'Dwyer", "Quilligan", "Hartigan", "Cusack", "Fitzgibbon", "Liddy", "Clancy",
  "McNamara", "Ryan", "O'Halloran", "Culhane", "Enright", "Madigan", "Keane", "Lenihan", "Sheahan", "Mulcahy", "Hogan", "Barrett", "Collins", "Kiely", "Nagle", "Twomey", "Crowley", "Cronin", "Desmond",
  "Walsh", "Joyce", "Fahey", "Concannon", "Popescu", "Ionescu", "Patel", "Okafor", "Kovalenko", "Rossi", "García", "Chen", "Dubois"];
const SOURCES = ["Indeed", "OSS website", "Referral from crew", "College jobs fair", "Walk-in at 3Arena", "Instagram", "TikTok", "UL careers fair", "Limerick open day", "Jobs.ie"];
const RTW = ["Irish citizen", "EU citizen", "Stamp 2 (student)", "Irish citizen", "Stamp 4", "Irish citizen", "EU citizen", "Stamp 2 (student)", "Stamp 1G", "Irish citizen"];
const ROLESETS = [["Steward"], ["Event crew"], ["Event crew", "Stagehand"], ["Catering assistant"], ["Steward", "Event crew"], ["General operative"], ["Bar staff"], ["Site crew"],
  ["Car park marshal", "Steward"], ["Hospitality host", "Catering assistant"], ["Accreditation", "Event crew"], ["Steward"]];
const RYDER_AREAS = ["Limerick city", "Castletroy", "Adare", "Ennis", "Shannon", "Newcastle West", "Kilmallock", "Raheen", "Annacotty", "Cork city", "Nenagh", "Tralee", "Limerick city", "Adare", "Dublin city"];
const WINTER_AREAS = ["Dublin city", "Tallaght", "Swords", "Lucan", "Bray", "Cork city", "Douglas", "Galway city", "Salthill", "Blanchardstown", "Naas", "Drogheda"];
/* Stage mix that looks like a live funnel: plenty applied, fewer at each step. */
const STAGES: Applicant["stage"][] = ["applied", "applied", "applied", "applied", "applied", "applied", "applied", "screened", "screened", "screened", "screened", "induction", "induction", "induction",
  "inducted", "inducted", "docs", "docs", "docs", "active", "active", "active", "withdrawn"];

const W = (date: string, time: string) => zoned(date, time);
/** Sorted by date: `nextInduction` takes the first future session with a free seat. */
export const INDUCTIONS: Induction[] = [
  { id: "IND-01", at: W("2026-11-17", "18:00"), place: "OSS office, Riverview Business Park, Dublin 12", capacity: 20, host: "U08", kind: "Event crew induction" },
  { id: "IND-05", at: W("2026-11-18", "18:30"), place: "OSS Cork office, Lapp's Quay, Cork", capacity: 24, host: "U09", kind: "Munster crew induction" },
  { id: "IND-02", at: W("2026-11-19", "18:00"), place: "OSS office, Riverview Business Park, Dublin 12", capacity: 20, host: "U08", kind: "Stewarding induction" },
  { id: "IND-06", at: W("2026-11-20", "18:00"), place: "OSS Galway office, Eyre Square, Galway", capacity: 16, host: "U11", kind: "West crew induction" },
  { id: "IND-03", at: W("2026-11-21", "10:00"), place: "3Arena briefing room, North Wall Quay", capacity: 30, host: "U02", kind: "Arena crew induction" },
  { id: "IND-04", at: W("2026-11-26", "11:00"), place: "Limerick, Ryder Cup recruitment day", capacity: 60, host: "U10", kind: "Ryder Cup 2027 open day" },
  { id: "IND-07", at: W("2026-12-03", "18:00"), place: "University of Limerick, Castletroy", capacity: 40, host: "U10", kind: "Ryder Cup 2027 induction" },
  { id: "IND-08", at: W("2026-12-08", "18:00"), place: "OSS Cork office, Lapp's Quay, Cork", capacity: 24, host: "U09", kind: "Munster crew induction" },
  { id: "IND-09", at: W("2026-12-12", "10:00"), place: "Adare village hall, Adare", capacity: 50, host: "U10", kind: "Ryder Cup 2027 induction" }
];
const RYDER_INDS = ["IND-04", "IND-07", "IND-09", "IND-05", "IND-08"];
const WINTER_INDS = ["IND-01", "IND-02", "IND-03", "IND-06", "IND-05"];

export function buildExt(): ExtState {
  const applicants: Applicant[] = [];
  const used = new Set<string>();
  const seats = new Map<string, number>();
  let k = 0;
  for (let i = 0; i < 404; i++) {
    let name: string;
    do { name = FIRST[(k * 7 + 3) % FIRST.length] + " " + LAST[(k * 11 + 5) % LAST.length]; k++; } while (used.has(name));
    used.add(name);
    const ryder = i % 4 !== 3;
    const stage = STAGES[(i * 7 + (ryder ? 0 : 3)) % STAGES.length];
    /* Ryder Cup applications started in October; winter season ones in November. */
    const daysBack = ryder ? (i * 13) % 42 : (i * 5) % 14;
    const applied = new Date(Date.UTC(2026, 10, 12) - (stage === "applied" ? daysBack % 9 : daysBack) * 864e5).toISOString().slice(0, 10);
    const rtw = RTW[(i * 3) % RTW.length];
    let inductionId: string | undefined;
    if (stage === "induction") {
      const opts = ryder ? RYDER_INDS : WINTER_INDS;
      for (let j = 0; j < opts.length; j++) {
        const id = opts[(i + j) % opts.length];
        const cap = INDUCTIONS.find((x) => x.id === id)!.capacity;
        if ((seats.get(id) || 0) < cap - 2) { inductionId = id; seats.set(id, (seats.get(id) || 0) + 1); break; }
      }
    }
    const late = ["inducted", "docs", "active"].includes(stage);
    applicants.push({
      id: "APP-" + String(201 + i), name, appliedAt: zoned(applied, String(9 + (i % 12)).padStart(2, "0") + ":" + String((i * 13) % 60).padStart(2, "0")),
      source: SOURCES[ryder ? (i * 3) % SOURCES.length : (i * 5) % 6], stage, roles: ROLESETS[(i * 5) % ROLESETS.length],
      campaign: ryder ? "Ryder Cup 2027" : "Winter season", rtw,
      area: ryder ? RYDER_AREAS[(i * 7) % RYDER_AREAS.length] : WINTER_AREAS[(i * 5) % WINTER_AREAS.length],
      inductionId: stage === "induction" ? inductionId : undefined,
      docs: { mh: late ? i % 2 === 0 || stage === "active" : false, sp: stage === "active" || (stage === "docs" && i % 3 === 0), rtw: late, bank: stage === "active" || (stage === "docs" && i % 2 === 1) },
      note: rtw.startsWith("Stamp 2") ? "Term time: 20 hours a week until 15 Dec" : undefined
    });
  }
  return { applicants, inductions: INDUCTIONS, signoffs: {}, kit: {} };
}
