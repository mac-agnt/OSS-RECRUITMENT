/* The opening snapshot for a given day: Daniele opens OSS at 07:45. */

import type { OpsState, Rules } from "../model";
import { candidates, docState, line, shift } from "../selectors";
import { addDays, atDay, isoWeekday } from "../time";
import { roll } from "../rand";
import { buildDocs, buildWorkers, PERSONAS, USERS } from "./people";
import { CLIENTS, VENUES } from "./places";
import { buildRosters } from "./events";
import { sageRow } from "../engine/hours";

export const OPS_VERSION = "ops-v3";

export const DEFAULT_RULES: Rules = {
  radiusM: 50, clockOpenMin: 60,
  minimumOn: true, minimumMin: 300,
  breakAfterMin: 360, breakMin: 30,
  otPastFinish: true, otDailyMin: 0,
  reconfirmH: 24, travelH: 2, noReplyMin: 45, autoReassign: false,
  offerExpiryH: 24, missedOutMin: 30, travelBufferMin: 60,
  stamp2WeekMin: 1200, stamp2HolidayMin: 2400, weekWarnMin: 2880,
  expiryWarnDays: 30, expiryReminders: [60, 30, 7],
  rates: { Steward: 14.5, "Event crew": 14.5, Stagehand: 16, "General operative": 15, "Catering assistant": 14.5, "Bar staff": 14.5,
    "Hospitality host": 15, "Car park marshal": 14.5, Accreditation: 15 },
  roleQuals: { Stagehand: ["MH"], "General operative": ["MH"], "Catering assistant": ["HACCP"], "Bar staff": ["HACCP"] }
};

export function buildSeed(today: string): OpsState {
  const clock = atDay(today, "07:45");
  const workers = buildWorkers(today);
  const docs = buildDocs(workers, today, clock);
  const s: OpsState = {
    version: OPS_VERSION, seedDay: today, clock, seq: 1000,
    users: USERS.map((u) => ({ ...u })), workers, docs,
    clients: CLIENTS.map((c, i) => ({ ...c, createdAt: atDay(today, "10:00", -900 + i * 37) })), venues: VENUES.map((v) => ({ ...v })),
    events: [], shifts: [], offers: [], assignments: [], standby: [], updates: [], clocks: [], exceptions: [],
    approvals: [], exports: [], syncs: [], threads: [], messages: [],
    rules: structuredClone(DEFAULT_RULES), autoRuns: [], audit: [],
    ui: { view: "office", officeId: "U1", supervisorId: "S1", crewId: PERSONAS.ciaran, whatsapp: false, theme: "dark", crowd: true }
  };
  const { hero } = buildRosters(s, today);

  /* Document renewals waiting for the office, and a couple of rejected uploads. */
  let pend = 0;
  for (const w of s.workers) {
    if (pend >= 6 || w.persona) continue;
    const exp = s.docs.find((d) => d.workerId === w.id && d.status === "verified" && d.expires && d.expires > today && d.expires <= addDays(today, 25));
    if (!exp || roll("pend" + w.id, 3)) continue;
    s.docs.push({ ...exp, id: "D-" + w.id + "-" + exp.type + "-R", status: "pending", issued: addDays(today, -2), expires: addDays(exp.expires!, 3 * 365),
      uploadedAt: atDay(today, "0" + (6 + (pend % 2)) + ":" + String(10 + pend * 7), pend % 3 ? 0 : -1), verifiedBy: undefined, verifiedAt: undefined, file: "renewal-" + w.id.toLowerCase() + ".jpg" });
    pend++;
  }
  let rej = 0;
  for (const w of s.workers.slice(300)) {
    if (rej >= 2) break;
    const exp = s.docs.find((d) => d.workerId === w.id && d.status === "verified" && d.type === "MH" && d.expires && d.expires < today);
    if (!exp) continue;
    s.docs.push({ ...exp, id: "D-" + w.id + "-MH-X", status: "rejected", issued: addDays(today, -9), expires: addDays(today, 1000), uploadedAt: atDay(today, "19:00", -8),
      verifiedBy: "U3", verifiedAt: atDay(today, "10:00", -7), note: "Photo too blurred to read the certificate number", file: "upload-" + w.id.toLowerCase() + ".jpg" });
    rej++;
  }

  /* Two new registrations from yesterday, waiting for document checks. */
  const newbies: [string, string, string[], "Irish citizen" | "Stamp 2"][] = [["Sadhbh Keane", "Rathmines", ["Steward", "Event crew"], "Irish citizen"], ["Lucas Ferreira Lima", "Dublin 7", ["Bar staff", "Catering assistant"], "Stamp 2"]];
  newbies.forEach(([name, area, roles, rtw], i) => {
    const id = "W" + String(s.workers.length + 1).padStart(4, "0");
    s.workers.push({ id, name, email: name.toLowerCase().replace(/ /g, ".") + "@example.test", mobile: "085 555 " + (2201 + i * 17), area, county: "Dublin", region: "Dublin",
      roles, rtw, status: "pending_verification", joined: addDays(today, -1), bullhornId: null, bullhornState: "not_linked", week: "eeeeeaa", off: [] });
    s.docs.push({ id: "D-" + id + "-ID", workerId: id, type: "ID", name: rtw === "Stamp 2" ? "Passport" : "Irish passport", ref: "•••• " + (4410 + i), issued: addDays(today, -800), expires: addDays(today, 2400),
      status: "pending", file: id.toLowerCase() + "-id.jpg", uploadedAt: atDay(today, "18:30", -1), uploadedBy: id });
    if (rtw === "Stamp 2") s.docs.push({ id: "D-" + id + "-RTW", workerId: id, type: "RTW", name: "IRP card (Stamp 2)", ref: "•••• 9921", issued: addDays(today, -60), expires: addDays(today, 300),
      status: "pending", file: id.toLowerCase() + "-irp.jpg", uploadedAt: atDay(today, "18:34", -1), uploadedBy: id });
  });

  /* A few messages so Communications isn't empty. */
  const dm = (workerId: string, from: "worker" | "office", body: string, at: string, read: boolean) => {
    const t = "T-" + workerId;
    if (!s.threads.some((x) => x.id === t)) s.threads.push({ id: t, kind: "direct", workerId, title: s.workers.find((w) => w.id === workerId)!.name });
    s.messages.push({ id: "M-dm-" + s.messages.length, threadId: t, at, from: from === "worker" ? { kind: "worker", id: workerId } : { kind: "office", id: "U1" },
      body, kind: from === "worker" ? "reply" : "message", to: from === "worker" ? ["office"] : [workerId], channels: from === "worker" ? ["whatsapp"] : ["app", "whatsapp"],
      read: from === "worker" ? (read ? { office: at } : {}) : { office: at, [workerId]: at } });
  };
  dm(PERSONAS.aoife, "worker", "Hi, is there staff parking at the Convention Centre tonight or should I get the Luas?", atDay(today, "07:22"), false);
  dm(PERSONAS.tomasz, "worker", "Can I bring my own gloves for the 3Arena load-out?", atDay(today, "21:05", -1), true);
  dm(PERSONAS.tomasz, "office", "Yes, rigger gloves are fine. Safety boots are a must.", atDay(today, "21:20", -1), true);

  /* Two rostered workers whose documents run out before their shift: the compliance alert on Today. */
  for (const [evId, days, type] of [["E-U6", 3, "ID"], ["E-U5", 2, "ID"]] as const) {
    const sh = s.shifts.find((x) => x.eventId === evId)!;
    const a = s.assignments.find((x) => x.shiftId === sh.id && x.status === "confirmed" && !s.workers.find((w) => w.id === x.workerId)!.persona)!;
    const doc = s.docs.find((d) => d.workerId === a.workerId && d.type === type && d.status === "verified")!;
    doc.expires = addDays(today, days);
  }

  /* Calibrate today's Aviva stewards so exactly eight eligible workers have confirmed availability. */
  const av = shift(s, hero.aviva);
  const wd = isoWeekday(av.start);
  const pool = candidates(s, av.id, "Steward", { showBlocked: true })
    .filter((c) => !c.offered && c.e.reasons.every((r) => r.code === "avail" || r.level === "ok" || r.level === "warn"));
  pool.forEach((c, i) => {
    const cur = c.w.week[wd];
    const ch = i < 8 ? (cur === "a" ? "a" : "e") : cur === "x" ? "x" : "?";
    c.w.week = c.w.week.slice(0, wd) + ch + c.w.week.slice(wd + 1);
  });

  /* Export totals from the lines they hold. */
  for (const e of s.exports) {
    const ls = e.asgIds.map((k) => line(s, k.split(":")[0])).filter(Boolean);
    e.minutes = ls.reduce((t, l) => t + l!.payableMin, 0);
    e.amount = Math.round(ls.reduce((t, l) => t + l!.pay, 0) * 100) / 100;
    e.rows = ls.map((l) => sageRow(s, l!, e.id));
  }

  s.audit.push(
    { id: "L-1", at: atDay(today, "15:20", -1), actor: "Daniele", action: "event.created", summary: "Created Convention Centre Dublin: business awards dinner: 1 shift, 12 positions", ref: { type: "event", id: "E-T6" } },
    { id: "L-2", at: atDay(today, "15:40", -1), actor: "Daniele", action: "offer.sent", summary: "Sent 3 job offers for the awards dinner (bar and catering)", ref: { type: "event", id: "E-T6" } },
    { id: "L-3", at: atDay(today, "07:10"), actor: "Daniele", action: "event.created", summary: "Created Convention Centre Dublin: medical conference build: 1 shift, 18 positions", ref: { type: "event", id: "E-U8" } },
    { id: "L-4", at: atDay(today, "07:45"), actor: "OSS automatic", action: "auto.no_reply", summary: "3 not replying 45 min before National Aquatic Centre event support; replacements recommended", ref: { type: "event", id: "E-T2" }, sim: true }
  );
  void docState;
  return s;
}

export { PERSONAS };
