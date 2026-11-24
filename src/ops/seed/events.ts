/* Events, rosters, replies, attendance and hours, all relative to today.
   Built directly (fast and deterministic); the engine takes over from the
   opening clock. */

import type { Assignment, Code, DocType, Event, Need, OpsState, Shift, Worker } from "../model";
import { needsRtw } from "../model";
import { hash, roll, shuffle } from "../rand";
import { addDays, addMin, atDay, dayKey, isoWeekday, minutesBetween, ms, weekStartKey } from "../time";
import { isStamp2Holiday } from "../selectors";
import { PERSONAS } from "./people";

type Pref = "dublin" | "munster" | "leinster";
interface FillOpts { prefer?: Pref; exclude?: Set<string>; ignoreAvail?: boolean }

export function buildRosters(s: OpsState, today: string) {
  let seq = 0;
  const id = (p: string) => p + "-" + (++seq);
  const T = (offset: number, hm: string) => atDay(today, hm, offset);
  const nowIso = T(0, "07:45");

  /* ── fast lookups for seeding ─────────────────────────────────────────── */
  const docMap = new Map<string, Map<DocType, string | null>>();
  for (const d of s.docs) {
    if (d.status !== "verified") continue;
    let m = docMap.get(d.workerId); if (!m) { m = new Map(); docMap.set(d.workerId, m); }
    const cur = m.get(d.type);
    if (cur === undefined || (d.expires || "9999") > (cur || "9999")) m.set(d.type, d.expires);
  }
  const docsOk = (w: Worker, types: DocType[], day: string) => types.every((t) => {
    if (t === "RTW" && !needsRtw(w.rtw)) return true;
    const e = docMap.get(w.id)?.get(t);
    return e !== undefined && (e === null || e >= day);
  });
  const busy = new Map<string, [number, number, string][]>();
  const weekMin = new Map<string, number>();
  const byRole = new Map<string, Worker[]>();
  for (const w of s.workers) for (const r of w.roles) { const l = byRole.get(r) || []; l.push(w); byRole.set(r, l); }

  const events = s.events, shifts = s.shifts;
  const ev = (evId: string, name: string, clientId: string, venueId: string, supervisorId: string, o: Partial<Event> = {}): Event => {
    const e: Event = { id: evId, name, clientId, venueId, supervisorId, status: "confirmed", instructions: o.instructions || "", ppe: o.ppe || ["Hi-vis vest", "OSS lanyard"],
      quals: o.quals || [], project: o.project, createdAt: o.createdAt || T(-10, "11:00"), createdBy: o.createdBy || "U1" };
    events.push(e); return e;
  };
  const sh = (e: Event, label: string, day: string, start: string, end: string, needs: Need[], o: { venueId?: string; supervisorId?: string } = {}): Shift => {
    const st = atDay(day, start);
    let en = atDay(day, end);
    if (ms(en) <= ms(st)) en = addMin(en, 24 * 60);
    const x: Shift = { id: id("S"), eventId: e.id, label, start: st, end: en, needs, venueId: o.venueId, supervisorId: o.supervisorId, version: 1 };
    shifts.push(x); return x;
  };
  const venueOf = (x: Shift) => x.venueId || events.find((e) => e.id === x.eventId)!.venueId;
  const net = (x: Shift) => { const m = minutesBetween(x.start, x.end); return m > s.rules.breakAfterMin ? m - s.rules.breakMin : m; };
  const free = (w: Worker, x: Shift) => {
    const st = ms(x.start), en = ms(x.end), v = venueOf(x);
    return !(busy.get(w.id) || []).some(([a, b, vv]) => { const buf = vv === v ? 0 : 60 * 60000; return a < en + buf && b + buf > st; });
  };
  const book = (w: Worker, x: Shift) => {
    const l = busy.get(w.id) || []; l.push([ms(x.start), ms(x.end), venueOf(x)]); busy.set(w.id, l);
    const k = w.id + weekStartKey(x.start); weekMin.set(k, (weekMin.get(k) || 0) + net(x));
  };
  const availCovers = (w: Worker, x: Shift) => {
    const c = w.week[isoWeekday(x.start)];
    const sMin = localMinutes(x.start), eMin = sMin + minutesBetween(x.start, x.end);
    const win: Record<string, [number, number]> = { a: [0, 1800], d: [360, 1080], e: [900, 1590] };
    return !!win[c] && sMin >= win[c][0] && eMin <= win[c][1];
  };
  const setAvail = (w: Worker, x: Shift) => {
    if (availCovers(w, x)) return;
    const i = isoWeekday(x.start);
    w.week = w.week.slice(0, i) + "a" + w.week.slice(i + 1);
  };
  const quals = (e: Event, role: string): DocType[] => [...new Set([...(s.rules.roleQuals[role] || []), ...e.quals])];
  const canWork = (w: Worker, x: Shift, role: string, o: FillOpts) => {
    if (w.persona || w.status !== "active" || o.exclude?.has(w.id)) return false;
    const day = dayKey(x.start);
    if (w.off.some((z) => day >= z.from && day <= z.to)) return false;
    if (!o.ignoreAvail && w.week[isoWeekday(x.start)] === "x") return false;
    const e = events.find((z) => z.id === x.eventId)!;
    if (!docsOk(w, ["ID", "RTW", ...quals(e, role)], day)) return false;
    if (!free(w, x)) return false;
    if (w.rtw === "Stamp 2") {
      const lim = isStamp2Holiday(day) ? s.rules.stamp2HolidayMin : s.rules.stamp2WeekMin;
      if ((weekMin.get(w.id + weekStartKey(x.start)) || 0) + net(x) > lim) return false;
    }
    return true;
  };
  const order = (list: Worker[], key: string, prefer?: Pref) => {
    const sh2 = shuffle(list, key);
    if (!prefer) return sh2;
    const rank = (w: Worker) => prefer === "munster" ? (w.region === "Munster" ? 0 : w.region === "Dublin" ? 1 : 2)
      : prefer === "leinster" ? (w.region === "Leinster" || w.region === "Dublin" ? 0 : 1) : (w.region === "Dublin" ? 0 : w.region === "Leinster" ? 1 : 2);
    return sh2.map((w, i) => ({ w, k: rank(w) * 100000 + i })).sort((a, b) => a.k - b.k).map((z) => z.w);
  };
  const assign = (w: Worker, x: Shift, role: string, at: string, by = "U1"): Assignment => {
    const a: Assignment = { id: id("A"), shiftId: x.id, workerId: w.id, role, status: "confirmed", source: "offer", at, by: w.id };
    void by;
    s.assignments.push(a); book(w, x); return a;
  };
  /** Book n workers for a role, returning the assignments. */
  const fill = (x: Shift, role: string, n: number, o: FillOpts = {}): Assignment[] => {
    const out: Assignment[] = [];
    if (n <= 0) return out;
    const sentAt = addMin(x.start, -(4 + roll(x.id, 6)) * 24 * 60);
    for (const w of order(byRole.get(role) || [], x.id + role, o.prefer || "dublin")) {
      if (out.length >= n) break;
      if (!canWork(w, x, role, o)) continue;
      const a = assign(w, x, role, ms(sentAt) < ms(nowIso) ? addMin(sentAt, 20 + roll(w.id + x.id, 900)) : nowIso);
      if (!o.ignoreAvail) setAvail(w, x);
      out.push(a);
    }
    return out;
  };
  const place = (wid: string, x: Shift, role: string) => { const w = s.workers.find((z) => z.id === wid)!; const a = assign(w, x, role, addMin(x.start, -3 * 24 * 60)); setAvail(w, x); return a; };
  const offer = (x: Shift, role: string, workerId: string, sentAt: string, hours = 24, kind: "standard" | "replacement" = "standard") => {
    s.offers.push({ id: id("O"), shiftId: x.id, workerId, role, status: "sent", sentAt, sentBy: "U1", expiresAt: addMin(sentAt, hours * 60), kind });
  };
  const offerTo = (x: Shift, role: string, n: number, sentAt: string, hours = 24, o: FillOpts = {}) => {
    let k = 0;
    for (const w of order(byRole.get(role) || [], "off" + x.id + role, o.prefer)) {
      if (k >= n) break;
      if (!canWork(w, x, role, o)) continue;
      if (s.offers.some((z) => z.shiftId === x.id && z.workerId === w.id)) continue;
      offer(x, role, w.id, sentAt, hours); k++;
    }
  };
  const standby = (x: Shift, role: string, n: number) => {
    let k = 0;
    for (const w of order(byRole.get(role) || [], "sb" + x.id + role, "dublin")) {
      if (k >= n) break;
      if (!canWork(w, x, role, {})) continue;
      s.standby.push({ id: id("SB"), shiftId: x.id, workerId: w.id, role, order: ++k, at: addMin(x.start, -26 * 60), source: "office" });
      setAvail(w, x);
    }
  };

  /* ── replies, attendance and approvals ────────────────────────────────── */
  const thread = (e: Event) => { const t = "T-" + e.id; if (!s.threads.some((z) => z.id === t)) s.threads.push({ id: t, kind: "event", eventId: e.id, title: e.name }); return t; };
  const sysMsg = (e: Event, x: Shift, kind: "reconfirm" | "travel", at: string, to: string[], body: string) => {
    s.messages.push({ id: id("M"), threadId: thread(e), at, from: { kind: "system", id: "system" }, body, kind, to, channels: ["app", "whatsapp"],
      asks: kind === "reconfirm" ? ["confirmed", "cant_make"] : ["on_way", "late", "arrived", "lost", "cant_make"], ref: { type: "shift", id: x.id }, read: { office: at } });
    s.autoRuns.push({ id: id("R"), key: kind + ":" + x.id + ":v1", at, kind, summary: to.length + " asked" });
  };
  const reply = (e: Event, a: Assignment, code: Code, at: string, extra: { eta?: string; note?: string } = {}) => {
    s.updates.push({ id: id("U"), asgId: a.id, code, at, eta: extra.eta, note: extra.note, via: roll(a.id + code, 2) ? "whatsapp" : "app" });
    if (code === "confirmed") a.reconfirmedAt = at;
    const labels: Record<string, string> = { confirmed: "Confirmed", on_way: "On my way", late: "Running late", arrived: "Arrived", lost: "Cannot find the location" };
    s.messages.push({ id: id("M"), threadId: thread(e), at, from: { kind: "worker", id: a.workerId }, kind: "reply", code, to: ["office"],
      body: labels[code] + (extra.eta ? ", ETA " + extra.eta.slice(11, 16) : "") + (extra.note ? ": " + extra.note : ""), channels: ["app"], ref: { type: "assignment", id: a.id }, read: { office: at } });
  };
  const reconfirmAll = (e: Event, x: Shift, list: Assignment[], noReply = 0) => {
    const at = addMin(x.start, -24 * 60);
    if (ms(at) > ms(nowIso)) return;
    sysMsg(e, x, "reconfirm", at, list.map((a) => a.workerId), "Reminder: you're booked for " + e.name.split(":")[0] + " tomorrow. Please confirm you're still available.");
    list.forEach((a, i) => { if (i >= list.length - noReply) return; const t = addMin(at, 6 + roll(a.id, 200)); if (ms(t) < ms(nowIso)) reply(e, a, "confirmed", t); });
  };
  const clockPair = (a: Assignment, x: Shift, inOff: number, outOff: number | null, by = "system") => {
    s.clocks.push({ id: id("K"), asgId: a.id, kind: "in", at: addMin(x.start, inOff), method: roll(a.id, 5) ? "gps" : "qr", distanceM: 6 + roll(a.id + "d", 35), result: "ok", reason: "Simulated location within radius", by });
    if (outOff !== null) s.clocks.push({ id: id("K"), asgId: a.id, kind: "out", at: addMin(x.end, outOff), method: "gps", distanceM: 8 + roll(a.id + "o", 30), result: "ok", reason: "Simulated location within radius", by });
  };
  const approve = (list: Assignment[], stage: "supervisor" | "office", by: string, at: string) => list.forEach((a) => s.approvals.push({ id: id("AP"), asgId: a.id, stage, by, at, version: 1 }));
  const worked = (list: Assignment[], x: Shift, sup: string, opts: { office?: string; forget?: number } = {}) => {
    list.forEach((a, i) => clockPair(a, x, -(roll(a.id, 12)), i === opts.forget ? null : roll(a.id + "x", 10)));
    const done = list.filter((_, i) => i !== opts.forget);
    approve(done, "supervisor", sup, addMin(x.end, 40));
    if (opts.office) approve(done, "office", "U3", opts.office);
    return done;
  };
  const exportIds: string[] = [];

  /* ── history: last week, approved and exported ─────────────────────────── */
  const h1 = ev("E-H1", "National Aquatic Centre: club swimming gala", "C03", "V03", "S1", { ppe: ["Non-slip shoes", "OSS lanyard"] });
  const h1s = sh(h1, "Event support", addDays(today, -6), "09:00", "15:00", [{ role: "Event crew", count: 8 }, { role: "Steward", count: 4 }]);
  const h2 = ev("E-H2", "Aviva Stadium: match day", "C02", "V02", "S2");
  const h2a = sh(h2, "Stewards", addDays(today, -5), "13:00", "20:30", [{ role: "Steward", count: 30 }]);
  const h2b = sh(h2, "Turnstiles and concourse", addDays(today, -5), "14:00", "20:00", [{ role: "Event crew", count: 10 }]);
  const h3 = ev("E-H3", "Guinness Storehouse: corporate dinner", "C04", "V04", "S3", { ppe: ["Black uniform", "Non-slip shoes"] });
  const h3s = sh(h3, "Dinner service", addDays(today, -4), "18:00", "23:30", [{ role: "Catering assistant", count: 10 }, { role: "Bar staff", count: 4 }]);
  const h4 = ev("E-H4", "3Arena: concert night", "C01", "V01", "S1", { quals: ["MH"], ppe: ["Hi-vis vest", "Safety boots", "Gloves"] });
  const h4a = sh(h4, "Load-in crew", addDays(today, -3), "12:00", "17:00", [{ role: "Stagehand", count: 10 }], { supervisorId: "S4" });
  const h4b = sh(h4, "Show crew", addDays(today, -3), "17:30", "23:30", [{ role: "Event crew", count: 14 }, { role: "Steward", count: 6 }]);
  const h5 = ev("E-H5", "Convention Centre Dublin: technology conference", "C05", "V05", "S4", { ppe: ["Black uniform", "OSS lanyard"] });
  const h5s = sh(h5, "Conference crew", addDays(today, -2), "07:30", "18:00", [{ role: "Event crew", count: 10 }, { role: "Hospitality host", count: 6 }]);
  const hist: Assignment[] = [];
  const doneShift = (x: Shift, sup: string, placed: [string, string][]) => {
    const pre = placed.map(([wid, role]) => place(wid, x, role));
    const rest = x.needs.flatMap((n) => fill(x, n.role, n.count - pre.filter((a) => a.role === n.role).length, { ignoreAvail: true }));
    hist.push(...worked([...pre, ...rest], x, sup, { office: T(-1, "09:10") }));
  };
  doneShift(h1s, "S1", []);
  doneShift(h2a, "S2", [[PERSONAS.maria, "Steward"]]);
  doneShift(h2b, "S2", []);
  doneShift(h3s, "S3", [[PERSONAS.priya, "Catering assistant"], [PERSONAS.aoife, "Bar staff"]]);
  doneShift(h4a, "S4", [[PERSONAS.ciaran, "Stagehand"]]);
  doneShift(h4b, "S1", [[PERSONAS.tomasz, "Event crew"]]);
  doneShift(h5s, "S4", []);
  const exp = "PX-" + addDays(today, -1).replace(/-/g, "").slice(2) + "-1";
  for (const a of hist) exportIds.push(a.id + ":1");
  s.exports.push({ id: exp, at: T(-1, "09:30"), by: "U3", asgIds: exportIds, period: "Last week", minutes: 0, amount: 0, file: "oss-sage-payroll-" + exp.toLowerCase() + ".csv" });
  s.syncs.push({ id: id("SY"), at: T(-1, "09:40"), by: "U3", scope: "Workers and approved hours", rows: hist.length, summary: hist.length + " placement hours and 12 worker updates sent; 3 changes received" });

  /* ── yesterday: awaiting office approval ──────────────────────────────── */
  const y1 = ev("E-Y1", "Guinness Storehouse: evening reception", "C04", "V04", "S3", { ppe: ["Black uniform", "Non-slip shoes"] });
  const y1s = sh(y1, "Reception crew", addDays(today, -1), "18:00", "23:30", [{ role: "Catering assistant", count: 10 }, { role: "Bar staff", count: 4 }]);
  const y1a = [...fill(y1s, "Catering assistant", 10, { ignoreAvail: true }), ...fill(y1s, "Bar staff", 4, { ignoreAvail: true })];
  worked(y1a, y1s, "S3", { forget: 3 });
  s.exceptions.push({ id: id("X"), asgId: y1a[3].id, type: "missing_out", status: "open", at: addMin(y1s.end, 30), key: "missedout:" + y1a[3].id, detail: "No clock-out 30 min after the 23:30 finish" });
  s.autoRuns.push({ id: id("R"), key: "missedout:" + y1s.id, at: addMin(y1s.end, 30), kind: "missedout", summary: "1 missing clock-out" });
  const y2 = ev("E-Y2", "Aviva Stadium: corporate box service", "C02", "V02", "S2", { ppe: ["Black uniform", "OSS lanyard"], instructions: "Three-hour hosting shift in the West Stand boxes. Minimum paid hours apply." });
  const y2s = sh(y2, "Hospitality hosts", addDays(today, -1), "13:00", "16:00", [{ role: "Hospitality host", count: 6 }]);
  const y2a = [place(PERSONAS.maria, y2s, "Hospitality host"), ...fill(y2s, "Hospitality host", 5, { ignoreAvail: true })];
  worked(y2a, y2s, "S2");

  /* ── today ────────────────────────────────────────────────────────────── */
  const t1 = ev("E-T1", "RDS: Christmas craft fair build", "C06", "V06", "S4", { quals: ["MH"], ppe: ["Hi-vis vest", "Safety boots", "Gloves"],
    instructions: "Build the stand frames in Simmonscourt Hall. Report to Marek at the service gate." });
  const t1s = sh(t1, "Build crew", today, "05:00", "07:30", [{ role: "General operative", count: 8 }]);
  const t1a = fill(t1s, "General operative", 8);
  reconfirmAll(t1, t1s, t1a);
  sysMsg(t1, t1s, "travel", addMin(t1s.start, -120), t1a.map((a) => a.workerId), "RDS build starts at 05:00. Are you on your way?");
  t1a.forEach((a) => reply(t1, a, "on_way", addMin(t1s.start, -100 + roll(a.id, 60))));
  s.autoRuns.push({ id: id("R"), key: "noreply:" + t1s.id + ":v1", at: addMin(t1s.start, -45), kind: "noreply", summary: "0 flagged" });
  t1a.forEach((a) => clockPair(a, t1s, -roll(a.id, 10), roll(a.id + "o", 9)));

  const t2 = ev("E-T2", "National Aquatic Centre: winter swimming gala", "C03", "V03", "S1", { ppe: ["Non-slip shoes", "OSS lanyard"],
    instructions: "Spectator stewarding and poolside support. Staff door beside the main car park; sign in with Bianca. No outdoor shoes on the pool deck." });
  const t2s = sh(t2, "Event support", today, "08:30", "14:30", [{ role: "Event crew", count: 10 }, { role: "Steward", count: 6 }]);
  const t2ec = fill(t2s, "Event crew", 10);
  const t2st = [place(PERSONAS.maria, t2s, "Steward"), ...fill(t2s, "Steward", 5)];
  const t2a = [...t2st, ...t2ec];
  standby(t2s, "Event crew", 2); standby(t2s, "Steward", 1);
  reconfirmAll(t2, t2s, t2a, 1);
  const tp = addMin(t2s.start, -120);
  sysMsg(t2, t2s, "travel", tp, t2a.map((a) => a.workerId), "National Aquatic Centre starts at 08:30. Meeting point: staff door beside the main car park. Are you on your way?");
  // 9 on the way, 1 arrived, 2 running late, 1 lost, 3 no reply (one steward, two event crew; never the persona).
  const plan: (Code | null)[] = ["on_way", "on_way", "on_way", "late", "on_way", null, "lost", "on_way", "arrived", "on_way", "on_way", "late", "on_way", "on_way", null, null];
  t2a.forEach((a, i) => {
    const c = plan[i];
    if (!c) return;
    const at = c === "arrived" ? T(0, "07:40") : c === "lost" ? T(0, "07:41") : addMin(tp, 4 + roll(a.id, 50));
    reply(t2, a, c, at, c === "late" ? { eta: i === 3 ? T(0, "08:40") : T(0, "08:50"), note: i === 3 ? "Bus is stuck on the N3" : undefined } : c === "lost" ? { note: "At the main entrance, can't see a staff door" } : {});
    if (c === "late") s.exceptions.push({ id: id("X"), asgId: a.id, type: "late", status: "open", at, key: "late:" + a.id, detail: "Running late, ETA " + (i === 3 ? "08:40" : "08:50") });
    if (c === "lost") s.exceptions.push({ id: id("X"), asgId: a.id, type: "lost", status: "open", at, key: "lost:" + a.id, detail: "Can't find the staff door at the National Aquatic Centre" });
  });
  const noReplyAt = addMin(t2s.start, -45);
  s.autoRuns.push({ id: id("R"), key: "noreply:" + t2s.id + ":v1", at: noReplyAt, kind: "noreply", summary: "3 flagged" });
  t2a.filter((_, i) => !plan[i]).forEach((a) => {
    a.flaggedAt = noReplyAt;
    s.exceptions.push({ id: id("X"), asgId: a.id, type: "no_response", status: "open", at: noReplyAt, key: "noreply:" + a.id, detail: "No reply 45 min before start; potentially unavailable" });
  });

  const t3 = ev("E-T3", "Guinness Storehouse: corporate lunch", "C04", "V04", "S3", { ppe: ["Black uniform", "Non-slip shoes"],
    instructions: "Lunch for 180 guests in the Arrol Suite. Hair tied back, no jewellery. Collect aprons from the events office." });
  const t3s = sh(t3, "Lunch service", today, "10:30", "16:30", [{ role: "Catering assistant", count: 8 }, { role: "Bar staff", count: 4 }]);
  const t3a = [...fill(t3s, "Catering assistant", 8), ...fill(t3s, "Bar staff", 4)];
  reconfirmAll(t3, t3s, t3a);

  const t4 = ev("E-T4", "3Arena: concert night", "C01", "V01", "S1", { quals: ["MH"], ppe: ["Hi-vis vest", "Safety boots", "Gloves"],
    instructions: "Load-in from 12:00 at the loading bay (Gate C). Show crew report to Bianca at 17:15 for the briefing. Doors 18:30, curfew 23:00." });
  const t4a = sh(t4, "Load-in crew", today, "12:00", "17:00", [{ role: "Stagehand", count: 10 }], { supervisorId: "S4" });
  const t4b = sh(t4, "Show crew", today, "17:30", "23:30", [{ role: "Event crew", count: 14 }, { role: "Steward", count: 6 }]);
  const t4aa = [place(PERSONAS.ciaran, t4a, "Stagehand"), ...fill(t4a, "Stagehand", 9)];
  const t4ba = [place(PERSONAS.tomasz, t4b, "Event crew"), ...fill(t4b, "Event crew", 12), ...fill(t4b, "Steward", 6)];
  standby(t4b, "Event crew", 3); standby(t4b, "Steward", 1);
  offerTo(t4b, "Event crew", 1, T(0, "07:05"));
  reconfirmAll(t4, t4a, t4aa); reconfirmAll(t4, t4b, t4ba, 1);

  const t5 = ev("E-T5", "Aviva Stadium: international match day", "C02", "V02", "S2", { ppe: ["Hi-vis vest", "OSS lanyard", "Rain jacket"],
    instructions: "Stewards report to the West Stand accreditation desk (Gate O). Briefing 30 minutes before the shift. Gates open 17:30." });
  const t5a = sh(t5, "Stewards", today, "15:00", "22:30", [{ role: "Steward", count: 40 }]);
  const t5b = sh(t5, "Turnstiles and concourse", today, "16:00", "22:00", [{ role: "Event crew", count: 10 }, { role: "Accreditation", count: 6 }]);
  const t5aa = fill(t5a, "Steward", 35);
  const t5ba = [...fill(t5b, "Event crew", 10), ...fill(t5b, "Accreditation", 6)];
  reconfirmAll(t5, t5a, t5aa, 2); reconfirmAll(t5, t5b, t5ba);

  const t6 = ev("E-T6", "Convention Centre Dublin: business awards dinner", "C05", "V05", "S4", { ppe: ["Black uniform", "Non-slip shoes"],
    instructions: "Dinner for 600 in the Forum. Loading bay entrance on Mayor Street Upper. Service briefing 16:45.", createdAt: T(-1, "15:20") });
  const t6s = sh(t6, "Dinner service", today, "17:00", "00:30", [{ role: "Catering assistant", count: 8 }, { role: "Bar staff", count: 4 }]);
  const t6a = fill(t6s, "Catering assistant", 2);
  reconfirmAll(t6, t6s, t6a);
  offer(t6s, "Bar staff", PERSONAS.aoife, T(-1, "15:40"), 24);
  offerTo(t6s, "Bar staff", 1, T(-1, "15:40"));
  offerTo(t6s, "Catering assistant", 1, T(-1, "15:40"));
  s.offers.push({ id: id("O"), shiftId: t6s.id, workerId: (byRole.get("Catering assistant") || []).find((w) => !w.persona && canWork(w, t6s, "Catering assistant", {}) && !s.offers.some((o) => o.workerId === w.id))!.id,
    role: "Catering assistant", status: "declined", sentAt: T(-1, "15:40"), sentBy: "U1", expiresAt: T(0, "15:40"), respondedAt: T(-1, "16:05"), kind: "standard" });

  /* Maria's other shifts this week, so her Stamp 2 hours are close to the limit. */
  const ws = weekStartKey(T(0, "12:00"));
  const otherDays = [1, 2, 3, 4, 5, 6, -1, -2, -3, -4, -5, -6].map((k) => addDays(today, k)).filter((dd) => dd >= ws && dd <= addDays(ws, 6) && dd !== addDays(today, -1)).slice(0, 2);
  otherDays.forEach((dd, k) => {
    const e = ev("E-M" + k, "Guinness Storehouse: private tour hosts", "C04", "V04", "S3", { ppe: ["Black uniform"], instructions: "Hosting private tours of the Storehouse." });
    const x = sh(e, "Tour hosts", dd, k ? "17:00" : "10:00", k ? "21:00" : "14:00", [{ role: "Hospitality host", count: 4 }]);
    const list = [place(PERSONAS.maria, x, "Hospitality host"), ...fill(x, "Hospitality host", 3)];
    if (dd < today) worked(list, x, "S3", { office: undefined });
  });

  /* ── the next two weeks ───────────────────────────────────────────────── */
  const up = (o: number, evId: string, name: string, c: string, v: string, sup: string, list: [string, string, string, Need[], number, number?, string?][], opt: Partial<Event> = {}) => {
    const e = ev(evId, name, c, v, sup, opt);
    for (const [label, from, to, needs, ratio, offers, shiftSup] of list) {
      const x = sh(e, label, addDays(today, o), from, to, needs, { supervisorId: shiftSup });
      for (const n of needs) {
        const got = fill(x, n.role, Math.round(n.count * ratio));
        if (o <= 1) reconfirmAll(e, x, got);
      }
      if (offers) offerTo(x, needs[0].role, offers, T(0, "07:00"));
    }
    return e;
  };
  up(1, "E-U1", "3Arena: concert night", "C01", "V01", "S1", [["Load-in crew", "12:00", "17:00", [{ role: "Stagehand", count: 10 }], 0.8, 0, "S4"],
    ["Show crew", "17:30", "23:30", [{ role: "Event crew", count: 14 }, { role: "Steward", count: 6 }], 1]], { quals: ["MH"], ppe: ["Hi-vis vest", "Safety boots", "Gloves"] });
  const u1a = s.shifts.find((x) => x.eventId === "E-U1" && x.label === "Load-in crew")!;
  offer(u1a, "Stagehand", PERSONAS.ciaran, T(0, "07:00"));
  offerTo(u1a, "Stagehand", 1, T(0, "07:00"));
  up(1, "E-U2", "Guinness Storehouse: whiskey tasting reception", "C04", "V04", "S3", [["Bar crew", "18:00", "22:00", [{ role: "Bar staff", count: 6 }], 1]], { ppe: ["Black uniform"] });
  up(2, "E-U3", "Guinness Storehouse: product launch", "C04", "V04", "S3", [["Launch crew", "17:00", "23:00", [{ role: "Catering assistant", count: 8 }, { role: "Hospitality host", count: 4 }], 1]], { ppe: ["Black uniform"] });
  up(3, "E-U4", "Bord Gáis Energy Theatre: musical, two shows", "C09", "V07", "S5", [["Front of house", "13:00", "22:30", [{ role: "Steward", count: 12 }], 0.75, 2]], { ppe: ["Black uniform", "OSS lanyard"] });
  up(4, "E-U5", "National Aquatic Centre: schools championships", "C03", "V03", "S1", [["Event support", "08:00", "17:00", [{ role: "Event crew", count: 12 }, { role: "Steward", count: 8 }], 1]], { ppe: ["Non-slip shoes"] });
  up(5, "E-U6", "Aviva Stadium: international match day", "C02", "V02", "S2", [["Stewards", "12:00", "19:30", [{ role: "Steward", count: 60 }], 0.74, 6],
    ["Turnstiles and concourse", "13:00", "19:00", [{ role: "Event crew", count: 14 }, { role: "Accreditation", count: 6 }], 1]], { ppe: ["Hi-vis vest", "Rain jacket"] });
  up(5, "E-U7", "3Arena: comedy night", "C01", "V01", "S1", [["Show crew", "18:00", "23:00", [{ role: "Event crew", count: 10 }, { role: "Steward", count: 6 }], 1]], { ppe: ["Hi-vis vest"] });
  up(6, "E-U8", "Convention Centre Dublin: medical conference build", "C05", "V05", "S4", [["Build crew", "07:00", "17:00", [{ role: "General operative", count: 12 }, { role: "Stagehand", count: 6 }], 0]],
    { quals: ["MH"], ppe: ["Hi-vis vest", "Safety boots", "Hard hat"], createdAt: T(0, "07:10") });
  up(8, "E-U9", "RDS: Christmas craft fair derig", "C06", "V06", "S4", [["Derig crew", "18:00", "23:00", [{ role: "General operative", count: 12 }], 0.6]], { quals: ["MH"], ppe: ["Hi-vis vest", "Safety boots"] });
  const u10 = up(9, "E-U10", "Guinness Storehouse: corporate Christmas party", "C04", "V04", "S3", [["Party crew", "18:30", "01:00", [{ role: "Catering assistant", count: 16 }, { role: "Bar staff", count: 7 }], 1]], { ppe: ["Black uniform"] });
  place(PERSONAS.aoife, s.shifts.find((x) => x.eventId === u10.id)!, "Bar staff");
  s.shifts.find((x) => x.eventId === u10.id)!.needs = [{ role: "Catering assistant", count: 16 }, { role: "Bar staff", count: 8 }];
  up(11, "E-U11", "3Arena: concert night", "C01", "V01", "S1", [["Load-in crew", "12:00", "17:00", [{ role: "Stagehand", count: 12 }], 1, 0, "S4"],
    ["Show crew", "17:30", "23:30", [{ role: "Event crew", count: 16 }, { role: "Steward", count: 8 }], 0.92]], { quals: ["MH"], ppe: ["Hi-vis vest", "Safety boots", "Gloves"] });
  up(13, "E-U12", "Convention Centre Dublin: charity ball", "C05", "V05", "S4", [["Ball crew", "18:00", "01:00", [{ role: "Catering assistant", count: 10 }, { role: "Bar staff", count: 4 }], 0]], { ppe: ["Black uniform"], createdAt: T(0, "07:20") });

  /* ── Electric Picnic 2027 ─────────────────────────────────────────────── */
  const epYear = today >= "2027-08-15" ? Number(today.slice(0, 4)) + 1 : 2027;
  const ep = ev("E-EP", "Electric Picnic " + epYear, "C07", "V08", "S8", { project: "Electric Picnic " + epYear, ppe: ["Hi-vis vest", "Safety boots", "Rain jacket"],
    instructions: "Crew camping in the staff campsite. Accreditation at the crew gate on the Stradbally road. Shuttle buses from Portlaoise station." , createdAt: T(-20, "10:00") });
  const epDay = (k: number) => epYear + "-09-0" + (1 + k);
  const epFill = (x: Shift, ratio: number) => { for (const n of x.needs) fill(x, n.role, Math.round(n.count * ratio), { prefer: "leinster", ignoreAvail: true }); offerTo(x, x.needs[0].role, 6, T(-1, "10:00"), 168, { prefer: "leinster", ignoreAvail: true }); };
  for (let k = 0; k < 2; k++) epFill(sh(ep, "Build crew", epDay(k), "07:00", "19:00", [{ role: "General operative", count: 30 }, { role: "Stagehand", count: 10 }], { supervisorId: "S9" }), 0.55);
  for (let k = 2; k < 5; k++) {
    epFill(sh(ep, "Arena stewards", epDay(k), "12:00", "00:00", [{ role: "Steward", count: 80 }]), 0.42);
    epFill(sh(ep, "Bars", epDay(k), "13:00", "01:00", [{ role: "Bar staff", count: 40 }], { supervisorId: "S6" }), 0.4);
    epFill(sh(ep, "Campsite crew", epDay(k), "08:00", "20:00", [{ role: "Event crew", count: 30 }], { supervisorId: "S7" }), 0.5);
    epFill(sh(ep, "Car parks", epDay(k), "07:00", "19:00", [{ role: "Car park marshal", count: 24 }], { supervisorId: "S9" }), 0.46);
  }
  epFill(sh(ep, "Derig crew", epDay(5), "08:00", "18:00", [{ role: "General operative", count: 30 }], { supervisorId: "S9" }), 0.3);
  offer(s.shifts.find((x) => x.eventId === "E-EP" && x.label === "Build crew")!, "Stagehand", PERSONAS.ciaran, T(-1, "10:00"), 168);

  /* ── Ryder Cup 2027 ───────────────────────────────────────────────────── */
  const rc = ev("E-RC", "Ryder Cup 2027", "C08", "V09", "S9", { project: "Ryder Cup 2027", ppe: ["Hi-vis vest", "OSS lanyard", "Rain jacket", "Safety boots"],
    instructions: "Coaches from Dublin (Heuston) and Cork leave 04:15 and 11:15. Accreditation photos are taken at the course operations compound. Phones away on the course during play.", createdAt: T(-60, "10:00") });
  const factor = [0.35, 0.6, 0.75, 0.85, 1, 1, 1];
  const fillRatio = [0.82, 0.74, 0.66, 0.61, 0.56, 0.53, 0.5];
  const rcDays = Array.from({ length: 7 }, (_, k) => "2027-09-" + String(13 + k));
  const scale = (n: number, k: number) => Math.max(4, Math.round(n * factor[k]));
  const rcShifts: [string, string, string, string, string, Need[], boolean][] = [
    ["Course, early", "V09", "S2", "06:00", "14:00", [{ role: "Steward", count: 150 }, { role: "Event crew", count: 40 }, { role: "Accreditation", count: 20 }], false],
    ["Course, late", "V09", "S3", "13:00", "21:00", [{ role: "Steward", count: 130 }, { role: "Event crew", count: 30 }], false],
    ["Spectator village, early", "V10", "S4", "07:00", "15:00", [{ role: "Hospitality host", count: 40 }, { role: "Catering assistant", count: 50 }, { role: "Bar staff", count: 30 }], false],
    ["Spectator village, late", "V10", "S5", "14:00", "22:00", [{ role: "Catering assistant", count: 40 }, { role: "Bar staff", count: 40 }, { role: "Hospitality host", count: 20 }], false],
    ["Park and ride, early", "V11", "S6", "05:30", "13:30", [{ role: "Car park marshal", count: 60 }, { role: "Steward", count: 20 }], false],
    ["Park and ride, late", "V11", "S7", "12:30", "20:30", [{ role: "Car park marshal", count: 50 }, { role: "Steward", count: 20 }], false],
    ["Fan zone", "V12", "S8", "11:00", "19:00", [{ role: "Steward", count: 50 }, { role: "Event crew", count: 40 }, { role: "Bar staff", count: 30 }], true]
  ];
  const rcDaysWorked = new Map<string, number>();
  rcDays.forEach((day, k) => {
    for (const [label, v, sup, from, to, needs, lateWeek] of rcShifts) {
      if (lateWeek && k < 3) continue;
      const x = sh(rc, label, day, from, to, needs.map((n) => ({ role: n.role, count: scale(n.count, k) })), { venueId: v, supervisorId: sup });
      for (const n of x.needs) {
        const want = Math.round(n.count * fillRatio[k]);
        let got = 0;
        for (const w of order(byRole.get(n.role) || [], "rc" + x.id + n.role, "munster")) {
          if (got >= want) break;
          if ((rcDaysWorked.get(w.id) || 0) >= 5) continue;
          if (!canWork(w, x, n.role, { ignoreAvail: true })) continue;
          assign(w, x, n.role, T(-roll(w.id + x.id, 40) - 1, "10:00"));
          rcDaysWorked.set(w.id, (rcDaysWorked.get(w.id) || 0) + 1);
          got++;
        }
        if (k >= 4) offerTo(x, n.role, Math.min(12, Math.round((n.count - got) * 0.1)), T(0, "07:10"), 24, { prefer: "munster", ignoreAvail: true });
      }
    }
  });
  const rcFri = s.shifts.find((x) => x.eventId === "E-RC" && x.label === "Course, early" && x.start.startsWith("2027-09-17"))!;
  place(PERSONAS.ciaran, rcFri, "Event crew");

  return { nowIso, hero: { nac: t2s.id, aviva: t5a.id, ccd: t6s.id, arenaShow: t4b.id, arenaLoadIn: t4a.id, rds: t1s.id } };
}

function localMinutes(iso: string): number {
  const t = new Date(iso);
  const p = new Intl.DateTimeFormat("en-IE", { timeZone: "Europe/Dublin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(t);
  return Number(p.find((x) => x.type === "hour")!.value) * 60 + Number(p.find((x) => x.type === "minute")!.value);
}
void hash;
