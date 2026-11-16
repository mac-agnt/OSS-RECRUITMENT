/* Event day, run as a command centre for the whole of Ireland.
   Board: the day's headline numbers and crew-on-site curve, every venue on the
   map, what needs a person right now, every event by phase, then one event in
   focus with each person in a lane. Check-ins: the geofence and every reading
   for any event today. Exceptions: triage across every event, worst first. */

import { useMemo, useState, type ReactNode } from "react";
import "../../styles/oss-live.css";
import type { Assignment, AttendanceException, EventBooking, OssState, Shift, Venue } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { navigate, openDrawer, run, setUi, useOss } from "../store";
import { tabOf } from "../modules";
import { HERO_EVENT } from "../seed";
import { dayKey, fmtDate, fmtDateLong, fmtTime, minutesBetween, ms } from "../time";
import { Av, Btn, Card, Chip, I, Icon, IrelandMap, kindVar, Meter, Page, regionVar, Row, RIcon, S, Tag, type MapPin } from "../ui/kit";

export default function Attendance() {
  const s = useOss();
  const tab = tabOf(s, "Attendance");
  const day = useMemo(() => dayModel(s), [s]);
  if (tab === "exceptions") return <Exceptions s={s} day={day} />;
  if (!day.events.length) return <Nothing s={s} />;
  return tab === "map" ? <CheckIns s={s} day={day} /> : <Board s={s} day={day} />;
}

/* ── the day, modelled once ──────────────────────────────────────────────── */
type Lane = "expected" | "on_way" | "late" | "on_site" | "finished" | "missing";
type Phase = "live" | "soon" | "done";
interface Person { a: Assignment; sh: Shift; lane: Lane; note: string; att: string; vin?: string; vout?: string; eta?: string }
interface EvDay {
  e: EventBooking; v?: Venue; kind: string; region: string; desk: string; short: string; shifts: Shift[]; people: Person[]; phase: Phase;
  start: number; end: number; n: Record<Lane, number>; due: number; arrived: number; onSite: number; plannedNow: number; required: number; exceptions: number;
}
interface Day { key: string; now: number; events: EvDay[]; people: Person[] }
const LANE_KEYS: Lane[] = ["expected", "on_way", "late", "on_site", "finished", "missing"];

function personOf(s: OssState, a: Assignment, sh: Shift): Person {
  const arr = Q.arrivalState(s, a.id), att = Q.attendanceState(s, a.id), j = Q.journeyOf(s, a.id);
  const vin = Q.verifiedIn(s, a.id), vout = Q.verifiedOut(s, a.id);
  const now = ms(s.clock), grace = s.rules.missedClockMin * 60000;
  const started = now > ms(sh.start) + grace, ended = now > ms(sh.end) + grace;
  let lane: Lane;
  if (vout) lane = "finished";
  else if (vin) lane = ended ? "missing" : "on_site";
  else if (arr === "Running late" && !ended) lane = "late";
  else if (arr === "Issue reported") lane = "missing";
  else if (started) lane = "missing";
  else if (arr === "On the way" || arr === "On site") lane = "on_way";
  else lane = "expected";
  const lateBy = vin ? minutesBetween(sh.start, vin.at) : 0;
  const note = lane === "finished" ? "In " + fmtTime(vin!.at) + " · out " + fmtTime(vout!.at)
    : lane === "on_site" ? "Clocked in " + fmtTime(vin!.at) + (lateBy > 0 ? " · " + lateBy + " min late" : "")
    : lane === "late" ? "ETA " + (j?.eta ? fmtTime(j.eta) : "not given") + (j?.message ? " · \"" + j.message + "\"" : "")
    : lane === "on_way" ? (arr === "On site" ? "Says they're on site" : "Set off " + fmtTime(j!.at))
    : lane === "missing" ? (vin ? "No clock-out" : arr === "Issue reported" ? "Reported a problem" : "No clock-in") + (att === "Review required" ? " · check-in to review" : att === "Awaiting sync" ? " · offline, waiting to sync" : "")
    : arr === "Not reported" ? "Arrival prompt " + s.rules.arrivalPromptH + "h before" : arr;
  return { a, sh, lane, note, att, vin: vin?.at, vout: vout?.at, eta: j?.status === "running_late" ? j.eta : undefined };
}

function dayModel(s: OssState): Day {
  const now = ms(s.clock), key = dayKey(s.clock);
  /* Today's shifts, plus anything still running from last night or finished in the last twelve hours. */
  const shifts = s.shifts.filter((x) => {
    const e = Q.eventOf(s, x.eventId);
    if (!e || e.historical || e.status !== "confirmed") return false;
    return dayKey(x.start) === key || (ms(x.start) <= now && ms(x.end) > now) || (ms(x.end) <= now && ms(x.end) + 12 * 3600000 >= now);
  });
  const bySh = new Map<string, Assignment[]>();
  const ids = new Set(shifts.map((x) => x.id));
  for (const a of s.assignments) if (a.status === "confirmed" && ids.has(a.shiftId)) (bySh.get(a.shiftId) || bySh.set(a.shiftId, []).get(a.shiftId)!).push(a);
  const openEx = new Map<string, number>();
  for (const x of Q.openExceptions(s)) openEx.set(x.assignmentId, (openEx.get(x.assignmentId) || 0) + 1);
  const evs = new Map<string, Shift[]>();
  for (const x of shifts) (evs.get(x.eventId) || evs.set(x.eventId, []).get(x.eventId)!).push(x);
  const events: EvDay[] = [];
  const all: Person[] = [];
  evs.forEach((list, id) => {
    const e = Q.eventOf(s, id), v = Q.venueOf(s, e.venueId);
    list.sort((a, b) => a.start.localeCompare(b.start));
    const people = list.flatMap((sh) => (bySh.get(sh.id) || []).map((a) => personOf(s, a, sh)));
    const n = Object.fromEntries(LANE_KEYS.map((k) => [k, people.filter((p) => p.lane === k).length])) as Record<Lane, number>;
    const start = Math.min(...list.map((x) => ms(x.start))), end = Math.max(...list.map((x) => ms(x.end)));
    const live = list.some((x) => ms(x.start) <= now && ms(x.end) > now);
    const ahead = list.some((x) => ms(x.start) > now);
    const due = people.filter((p) => ms(p.sh.start) <= now).length;
    events.push({
      e, v, kind: Q.kindOf(s, e), region: Q.regionOf(s, e), desk: Q.deskOf(e), short: e.name.split(":")[0], shifts: list, people,
      phase: live ? "live" : ahead ? "soon" : "done", start, end, n, due,
      arrived: people.filter((p) => p.vin && ms(p.sh.start) <= now).length, onSite: people.filter((p) => p.vin && !p.vout).length,
      plannedNow: people.filter((p) => ms(p.sh.start) <= now && ms(p.sh.end) > now).length,
      required: list.reduce((t, x) => t + x.required, 0), exceptions: people.reduce((t, p) => t + (openEx.get(p.a.id) || 0), 0)
    });
    all.push(...people);
  });
  const rank: Record<Phase, number> = { live: 0, soon: 1, done: 2 };
  events.sort((a, b) => rank[a.phase] - rank[b.phase] || (a.phase === "done" ? b.end - a.end : a.start - b.start));
  return { key, now, events, people: all };
}

/* Focus: a shift picked elsewhere, else 3Arena on its day, else the national view only. */
function focusOf(s: OssState, day: Day): { ev?: EvDay; shiftId?: string } {
  const f = s.ui.focus;
  if (f?.kind === "national") return {};
  if (f?.kind === "shift") {
    const ev = day.events.find((x) => x.shifts.some((y) => y.id === f.id));
    if (ev) return { ev, shiftId: f.id };
  }
  const ev = (f?.kind === "event" && day.events.find((x) => x.e.id === f.id)) || day.events.find((x) => x.e.id === HERO_EVENT);
  if (!ev) return {};
  return { ev, shiftId: (ev.shifts.find((x) => ms(x.end) > day.now) || ev.shifts[ev.shifts.length - 1]).id };
}
const pickEvent = (ev: EvDay, now: number) => setUi({ focus: { kind: "shift", id: (ev.shifts.find((x) => ms(x.end) > now) || ev.shifts[ev.shifts.length - 1]).id } });
const scrollToFocus = () => requestAnimationFrame(() => document.getElementById("lv-focus")?.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
const span = (ev: EvDay) => fmtTime(new Date(ev.start).toISOString()) + "-" + fmtTime(new Date(ev.end).toISOString());
const fmtN = (n: number) => n.toLocaleString("en-IE");

/* ── board ───────────────────────────────────────────────────────────────── */
function Board({ s, day }: { s: OssState; day: Day }) {
  const focus = focusOf(s, day);
  const live = day.events.filter((x) => x.phase === "live");
  const due = day.events.reduce((t, x) => t + x.due, 0), arrived = day.events.reduce((t, x) => t + x.arrived, 0);
  const onSite = day.events.reduce((t, x) => t + x.onSite, 0), plannedNow = day.events.reduce((t, x) => t + x.plannedNow, 0);
  const late = day.people.filter((p) => p.lane === "late").length;
  const missing = day.people.filter((p) => p.lane === "missing" && !p.vin).length;
  const noOut = day.people.filter((p) => p.lane === "missing" && p.vin).length;
  const exc = day.events.reduce((t, x) => t + x.exceptions, 0);
  const today = day.events.filter((x) => x.shifts.some((y) => dayKey(y.start) === day.key));
  const lastNight = day.events.length - today.length;
  const regions = new Set(today.map((x) => x.region));
  const audience = today.reduce((t, x) => t + (x.e.audience || 0), 0);
  const crewToday = today.reduce((t, x) => t + x.people.filter((p) => dayKey(p.sh.start) === day.key).length, 0);
  const pct = due ? Math.round((arrived / due) * 1000) / 10 : 0;
  const dateIso = s.clock;
  return (
    <div className="oss-page lv">
      <section className="lv-cmd" aria-label="Today across Ireland">
        <div className="lv-cmd-top">
          <div className="lv-when">
            <span className="oss-eyebrow"><span className="lv-pulse" aria-hidden="true" />Live operations · all of Ireland</span>
            <h1>{fmtDateLong(dateIso).replace(/ \d{4}$/, "")}</h1>
            <p>{today.length} event{today.length === 1 ? "" : "s"} today across {regions.size} region{regions.size === 1 ? "" : "s"} · {fmtN(crewToday)} crew rostered{audience ? " · about " + fmtN(Math.round(audience / 100) * 100) + " people through the gates" : ""}{lastNight ? " · " + lastNight + " finished last night" : ""}</p>
          </div>
          <div className="lv-clock"><span>Time now</span><b>{fmtTime(s.clock)}</b><small>{live.length} event{live.length === 1 ? "" : "s"} running</small></div>
        </div>
        <div className="lv-kpis">
          <Kpi c="var(--accent)" label="Events live now" value={live.length} sub={"of " + today.length + " today"} />
          <Kpi c="var(--ok)" label="Crew on site" value={fmtN(onSite)} sub={plannedNow ? "of " + fmtN(plannedNow) + " due on shift now" : "nobody due right now"} />
          <Kpi c={pct >= 97 || !due ? "var(--ok)" : "var(--warn)"} label="Checked in" value={due ? pct + "%" : "-"} sub={fmtN(arrived) + " of " + fmtN(due) + " whose call has passed"} />
          <Kpi c="var(--warn)" label="Running late" value={late} sub={late ? "with an ETA" : "nobody late"} dim={!late} />
          <Kpi c="#F6881F" label="Not arrived" value={missing} sub={missing ? "past the " + s.rules.missedClockMin + " min alert" : "everyone due is in"} dim={!missing} urgent={missing > 0} />
          <Kpi c="var(--bad)" label="Open exceptions" value={exc + noOut} sub={noOut ? noOut + " missing a clock-out" : "clocks and readings"} dim={!(exc + noOut)} />
        </div>
        <OnSiteCurve s={s} day={day} />
      </section>

      <div className="lv-mid">
        <MapCard s={s} day={day} focusId={focus.ev?.e.id} />
        <Attention s={s} day={day} />
      </div>

      <EventsByPhase day={day} focusId={focus.ev?.e.id} />

      {focus.ev && focus.shiftId ? <Focus s={s} ev={focus.ev} shiftId={focus.shiftId} />
        : <div className="lv-pick" id="lv-focus"><Icon d={I.users} size={18} /><span><b>Pick an event to see every person</b>Each card above opens the crew in lanes: not yet, on the way, running late, checked in and clocked out.</span></div>}
    </div>
  );
}

function Kpi({ c, label, value, sub, dim, urgent }: { c: string; label: string; value: ReactNode; sub: string; dim?: boolean; urgent?: boolean }) {
  return <div className={"lv-kpi" + (dim ? " dim" : "") + (urgent ? " urgent" : "")} style={{ ["--c" as any]: c }}><span className="l"><i />{label}</span><b>{value}</b><span className="s">{sub}</span></div>;
}

/* Crew on site through the day: the plan as a stacked hill by kind of work, the actual as a line up to now. */
function OnSiteCurve({ s, day }: { s: OssState; day: Day }) {
  const STEP = 15 * 60000;
  const shifts = day.events.flatMap((ev) => ev.shifts.map((sh) => ({ sh, kind: ev.kind, n: ev.people.filter((p) => p.sh.id === sh.id).length })));
  if (!shifts.length) return null;
  const t0 = Math.floor((Math.min(...shifts.map((x) => ms(x.sh.start))) - 45 * 60000) / STEP) * STEP;
  const t1 = Math.min(t0 + 22 * 3600000, Math.ceil((Math.max(...shifts.map((x) => ms(x.sh.end))) + 30 * 60000) / STEP) * STEP);
  const ts: number[] = []; for (let t = t0; t <= t1; t += STEP) ts.push(t);
  const kinds = Q.KINDS.filter((k) => shifts.some((x) => x.kind === k));
  const plan = ts.map((t) => kinds.map((k) => shifts.filter((x) => x.kind === k && ms(x.sh.start) <= t && ms(x.sh.end) > t).reduce((n, x) => n + x.n, 0)));
  const ins = day.people.filter((p) => p.vin).map((p) => [ms(p.vin!), p.vout ? ms(p.vout) : Infinity] as const);
  const at = (t: number) => ins.filter(([a, b]) => a <= t && b > t).length;
  const pts: [number, number][] = ts.filter((t) => t <= day.now).map((t) => [t, at(t)]);
  if (day.now >= t0 && day.now <= t1) pts.push([day.now, at(day.now)]);
  const actual = pts.map((p) => p[1]);
  const max = Math.max(10, ...plan.map((r) => r.reduce((a, b) => a + b, 0)), ...actual) * 1.12;
  const W = 1000, H = 170;
  const X = (t: number) => ((t - t0) / (t1 - t0)) * W, Y = (v: number) => H - (v / max) * H;
  const layers = kinds.map((k, ki) => {
    const lo = plan.map((r) => r.slice(0, ki).reduce((a, b) => a + b, 0)), hi = plan.map((r, i) => lo[i] + r[ki]);
    return { k, d: "M" + ts.map((t, i) => X(t).toFixed(1) + " " + Y(hi[i]).toFixed(1)).join("L") + "L" + ts.slice().reverse().map((t, i) => X(t).toFixed(1) + " " + Y(lo[lo.length - 1 - i]).toFixed(1)).join("L") + "Z" };
  });
  const line = pts.length ? "M" + pts.map(([t, v]) => X(t).toFixed(1) + " " + Y(v).toFixed(1)).join("L") : "";
  const nowX = (Math.min(Math.max(day.now, t0), t1) - t0) / (t1 - t0) * 100;
  const ticks = ts.filter((t) => new Date(t).getUTCMinutes() === 0 && Math.round((t - t0) / 3600000) % 2 === 0);
  const peak = Math.max(...plan.map((r) => r.reduce((a, b) => a + b, 0)));
  const peakAt = ts[plan.findIndex((r) => r.reduce((a, b) => a + b, 0) === peak)];
  return (
    <div className="lv-curve">
      <div className="lv-curve-h">
        <b>Crew on site through the day</b>
        <span className="lg">{kinds.map((k) => <span key={k}><i style={{ background: kindVar(k) }} />{k}</span>)}<span><i className="ln" />Checked in now</span></span>
        <span className="pk">Peak {fmtN(peak)} at {fmtTime(new Date(peakAt).toISOString())}</span>
      </div>
      <div className="lv-curve-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          {[0.25, 0.5, 0.75].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} className="gl" vectorEffect="non-scaling-stroke" />)}
          {layers.map((l) => <path key={l.k} d={l.d} style={{ fill: kindVar(l.k) }} className="ar" />)}
          {line && <path d={line} className="act" vectorEffect="non-scaling-stroke" />}
        </svg>
        {day.now >= t0 && day.now <= t1 && <span className="now" style={{ left: nowX + "%" }}><em>Now · {fmtN(actual[actual.length - 1] || 0)} on site</em></span>}
        <div className="ax">{ticks.map((t) => <span key={t} style={{ left: ((t - t0) / (t1 - t0)) * 100 + "%" }}>{fmtTime(new Date(t).toISOString())}</span>)}</div>
      </div>
      <span className="sr">Planned peak {peak} crew. {actual.length ? (actual[actual.length - 1] || 0) + " checked in at " + fmtTime(s.clock) : "Nobody has checked in yet."}</span>
    </div>
  );
}

function MapCard({ s, day, focusId }: { s: OssState; day: Day; focusId?: string }) {
  const seen = new Map<string, number>();
  const pins: MapPin[] = day.events.filter((x) => x.v?.lat !== undefined).map((x) => {
    const k = x.v!.id; const off = seen.get(k) || 0; seen.set(k, off + 1);
    const east = x.region === "Dublin" || x.region === "Leinster";
    return { id: x.e.id, lat: x.v!.lat! - off * 0.05, lng: x.v!.lng! + off * 0.07, c: kindVar(x.kind), r: 4 + Math.min(10, Math.sqrt(x.people.length) * 0.95), pulse: x.phase === "live", on: x.e.id === focusId,
      label: east ? undefined : x.short.length > 16 ? x.v!.county || x.short : x.short };
  });
  const byRegion = Q.REGIONS.map((r) => ({ r, n: day.events.filter((x) => x.region === r).reduce((t, x) => t + x.people.length, 0), ev: day.events.filter((x) => x.region === r).length })).filter((x) => x.n);
  const total = byRegion.reduce((t, x) => t + x.n, 0) || 1;
  const dublin = day.events.filter((x) => x.region === "Dublin" || x.region === "Leinster");
  return (
    <Card title="Where the crew are" meta={day.events.length + " venues today · size shows crew, colour shows the work"} icon={I.map}>
      <div className="lv-map">
        <IrelandMap pins={pins} height={360} onPick={(id) => { const ev = day.events.find((x) => x.e.id === id); if (ev) { pickEvent(ev, day.now); scrollToFocus(); } }} />
        {dublin.length > 0 && <div className="lv-dub">
          <span className="h">Dublin and Leinster</span>
          {dublin.map((x) => <button key={x.e.id} className={x.e.id === focusId ? "on" : ""} onClick={() => { pickEvent(x, day.now); scrollToFocus(); }}><i style={{ background: kindVar(x.kind) }} className={x.phase === "live" ? "live" : ""} />{x.short}<b>{x.people.length}</b></button>)}
        </div>}
      </div>
      <div className="lv-regions">
        <div className="bar">{byRegion.map((x) => <i key={x.r} style={{ width: (x.n / total) * 100 + "%", background: regionVar(x.r) }} title={x.r + ": " + x.n + " crew"} />)}</div>
        <div className="lg">{byRegion.map((x) => <span key={x.r}><i style={{ background: regionVar(x.r) }} />{x.r}<b>{fmtN(x.n)}</b><small>{x.ev} event{x.ev === 1 ? "" : "s"}</small></span>)}</div>
      </div>
    </Card>
  );
}

/* What needs a person, worst first: no-shows, late arrivals, readings, then thin shifts about to start. */
interface Att { sev: "urgent" | "warn" | "info"; key: string; title: string; sub: string; who?: string; ev: EvDay; go: () => void; act: string }
function Attention({ s, day }: { s: OssState; day: Day }) {
  const [all, setAll] = useState(false);
  const items: Att[] = [];
  for (const ev of day.events) {
    const miss = ev.people.filter((p) => p.lane === "missing" && !p.vin);
    const sel = (p?: Person) => () => { setUi({ focus: { kind: "shift", id: (p?.sh || ev.shifts[0]).id } }); if (p) openDrawer("timesheet", p.a.id); else scrollToFocus(); };
    if (miss.length > 2) items.push({ sev: "urgent", key: ev.e.id + "-miss", title: miss.length + " not checked in at " + ev.short, sub: Array.from(new Set(miss.map((p) => p.sh.label))).join(", ") + " · alert after " + s.rules.missedClockMin + " min", ev, act: "Open", go: () => { pickEvent(ev, day.now); scrollToFocus(); } });
    else miss.forEach((p) => items.push({ sev: "urgent", key: p.a.id, who: Q.nameOf(s, p.a.workerId), title: Q.nameOf(s, p.a.workerId) + " not checked in", sub: ev.short + ", " + p.sh.label.toLowerCase() + " · call " + fmtTime(p.sh.start) + " · " + Math.max(0, minutesBetween(p.sh.start, s.clock)) + " min ago", ev, act: "Open", go: sel(p) }));
    ev.people.filter((p) => p.lane === "late").forEach((p) => items.push({ sev: "warn", key: p.a.id, who: Q.nameOf(s, p.a.workerId), title: Q.nameOf(s, p.a.workerId) + " running late", sub: ev.short + " · " + p.note, ev, act: "Message", go: () => navigate("Messages", "compose", { kind: "shift", id: p.sh.id }) }));
    ev.people.filter((p) => p.lane === "missing" && p.vin).forEach((p) => items.push({ sev: "warn", key: p.a.id + "-out", who: Q.nameOf(s, p.a.workerId), title: Q.nameOf(s, p.a.workerId) + ": no clock-out", sub: ev.short + ", " + p.sh.label.toLowerCase() + " · blocks the timesheet", ev, act: "Fix time", go: () => navigate("Timesheets", "corrections", { kind: "assignment", id: p.a.id }) }));
    ev.people.filter((p) => p.att === "Review required").forEach((p) => items.push({ sev: "warn", key: p.a.id + "-rev", who: Q.nameOf(s, p.a.workerId), title: Q.nameOf(s, p.a.workerId) + ": check-in to review", sub: ev.short + " · reading outside the venue radius", ev, act: "Review", go: () => navigate("Attendance", "map", { kind: "shift", id: p.sh.id }) }));
    for (const sh of ev.shifts) {
      const mins = minutesBetween(s.clock, sh.start); const c = Q.shiftCoverage(s, sh.id);
      if (mins > 0 && mins <= 180 && c.confirmed < sh.required) items.push({ sev: mins <= 90 ? "warn" : "info", key: sh.id + "-thin", title: ev.short + ", " + sh.label.toLowerCase() + ": " + c.confirmed + "/" + sh.required, sub: "Starts in " + (mins < 60 ? mins + " min" : Math.floor(mins / 60) + "h " + (mins % 60) + "m") + " · " + (sh.required - c.confirmed) + " still open", ev, act: "Find crew", go: () => navigate("Staffing", "allocate", { kind: "shift", id: sh.id }) });
    }
    if (ev.phase === "soon" && ev.v && !ev.v.meetingConfirmed) items.push({ sev: "info", key: ev.e.id + "-mp", title: "Meeting point not confirmed: " + ev.v.name, sub: "Starts " + fmtTime(new Date(ev.start).toISOString()) + " · goes on every invitation", ev, act: "Open event", go: () => navigate("Events", "upcoming", { kind: "event", id: ev.e.id }) });
  }
  const rank = { urgent: 0, warn: 1, info: 2 };
  items.sort((a, b) => rank[a.sev] - rank[b.sev]);
  const shown = all ? items : items.slice(0, 7);
  /* Next call times, so a quiet board still says what's coming. */
  const next = day.events.flatMap((ev) => ev.shifts.filter((x) => ms(x.start) > day.now && ms(x.start) - day.now <= 4 * 3600000).map((sh) => ({ ev, sh, ppl: ev.people.filter((p) => p.sh.id === sh.id) })))
    .sort((a, b) => a.sh.start.localeCompare(b.sh.start)).slice(0, Math.max(0, 6 - Math.min(items.length, 6)));
  const n = (k: Att["sev"]) => items.filter((x) => x.sev === k).length;
  return (
    <Card title="Needs attention" meta={items.length ? n("urgent") + " urgent · " + n("warn") + " to watch · " + n("info") + " heads-up" : "Nothing waiting"} icon={I.alert}
      right={n("urgent") > 0 ? <span className="oss-st urgent"><Icon d={I.alert} size={12} sw={2.2} />{n("urgent")} now</span> : undefined}>
      <div className="lv-att">
        {shown.map((x) => (
          <div key={x.key} className={"lv-att-i " + x.sev}>
            <span className="sev" aria-hidden="true" />
            {x.who ? <Av name={x.who} size="sm" /> : <span className="kd" style={{ background: kindVar(x.ev.kind) }} />}
            <span className="tx"><b>{x.title}</b><span>{x.sub}</span></span>
            <Btn size="sm" kind={x.sev === "urgent" ? "urgent" : undefined} onClick={x.go}>{x.act}</Btn>
          </div>))}
        {!items.length && <div className="lv-calm"><Icon d={I.check} size={18} /><b>All quiet</b><span>Everyone due is checked in and nothing is waiting on a person.</span></div>}
        {next.length > 0 && <div className="lv-next">
          <span className="h">Next call times</span>
          {next.map(({ ev, sh, ppl }) => { const way = ppl.filter((p) => p.lane === "on_way").length; const mins = minutesBetween(s.clock, sh.start); return (
            <button key={sh.id} className="lv-next-i" onClick={() => { setUi({ focus: { kind: "shift", id: sh.id } }); scrollToFocus(); }}>
              <b className="t">{fmtTime(sh.start)}</b>
              <i style={{ background: kindVar(ev.kind) }} />
              <span className="tx"><b>{ev.short}, {sh.label.toLowerCase()}</b><span>{ppl.length} due · {way} on the way · in {mins < 60 ? mins + " min" : Math.floor(mins / 60) + "h " + (mins % 60) + "m"}</span></span>
              <span className="bar"><span style={{ width: (ppl.length ? (way / ppl.length) * 100 : 0) + "%" }} /></span>
            </button>); })}
        </div>}
        {items.length > 7 && <button className="lv-more" onClick={() => setAll(!all)}>{all ? "Show fewer" : "Show all " + items.length}</button>}
      </div>
    </Card>
  );
}

function MiniRing({ value, max, c, size = 58, label }: { value: number; max: number; c: string; size?: number; label: ReactNode }) {
  const r = (size - 7) / 2, C = 2 * Math.PI * r, p = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <span className="lv-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth="6" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={c} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${C * p} ${C}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <b>{label}</b>
    </span>
  );
}

const PHASES: { id: Phase; label: string; blurb: string }[] = [
  { id: "live", label: "Live now", blurb: "Crew on shift" }, { id: "soon", label: "Later today", blurb: "Call times still to come" }, { id: "done", label: "Finished", blurb: "Today and last night" }];
function EventsByPhase({ day, focusId }: { day: Day; focusId?: string }) {
  return (
    <div className="lv-phases">
      {PHASES.map((ph) => { const list = day.events.filter((x) => x.phase === ph.id); if (!list.length) return null; return (
        <section key={ph.id} className={"lv-phase " + ph.id}>
          <header><span className="dot" aria-hidden="true" /><b>{ph.label}</b><span className="n">{list.length}</span><span className="bl">{ph.blurb}</span></header>
          <div className="lv-evgrid">{list.map((x) => <EventCard key={x.e.id} ev={x} on={x.e.id === focusId} now={day.now} />)}</div>
        </section>); })}
    </div>
  );
}
function EventCard({ ev, on, now }: { ev: EvDay; on: boolean; now: number }) {
  const s = useOss();
  const c = kindVar(ev.kind);
  const missing = ev.people.filter((p) => p.lane === "missing").length;
  const ring = ev.phase === "soon" ? { v: ev.people.length, m: ev.required, l: ev.people.length + "/" + ev.required, k: "booked" }
    : ev.phase === "live" ? { v: ev.onSite, m: ev.plannedNow || ev.people.length, l: String(ev.onSite), k: "on site" }
    : { v: ev.arrived, m: ev.people.length, l: ev.arrived + "/" + ev.people.length, k: "turned up" };
  const startIso = new Date(ev.start).toISOString(), endIso = new Date(ev.end).toISOString();
  /* The next call still to come, not the first of the day (3Arena's set-up crew are long finished by the evening call). */
  const next = ev.shifts.map((x) => ms(x.start)).filter((t) => t > now).sort((a, b) => a - b)[0] ?? ev.start;
  const mins = Math.max(1, Math.round((next - now) / 60000));
  const status = ev.phase === "live" ? "Live until " + fmtTime(endIso) : ev.phase === "soon" ? "Call " + fmtTime(new Date(next).toISOString()) + (next - now < 3 * 3600000 ? " · in " + (mins < 60 ? mins + " min" : Math.floor(mins / 60) + "h" + (mins % 60 ? " " + (mins % 60) + "m" : "")) : "") : "Finished " + fmtTime(endIso);
  void startIso;
  return (
    <button className={"lv-ev " + ev.phase + (on ? " on" : "")} style={{ ["--c" as any]: c }} onClick={() => { pickEvent(ev, now); scrollToFocus(); }} aria-pressed={on}>
      <span className="top"><Tag c={c}>{ev.kind}</Tag><span className={"ph " + ev.phase}>{ev.phase === "live" && <i />}{status}</span></span>
      <span className="mid">
        <span className="tx"><b>{ev.short}</b><span>{ev.v ? ev.v.name.split(",")[0] + ", " + (ev.v.county || ev.region) : ev.region}</span><span className="desk">{ev.desk}</span></span>
        <span className="rg"><MiniRing value={ring.v} max={ring.m} c={c} label={ring.l} /><small>{ring.k}</small></span>
      </span>
      <Meter legend={false} height={6} total={Math.max(1, ev.people.length)} parts={[
        { n: ev.n.on_site + ev.n.finished, tone: "ok", label: "checked in" }, { n: ev.n.on_way, tone: "accent", label: "on the way" },
        { n: ev.n.late, tone: "warn", label: "running late" }, { n: missing, tone: "bad", label: "missing" }, { n: ev.n.expected, tone: "neutral", label: "not yet" }]} />
      <span className="foot">
        <Av name={Q.nameOf(s, ev.e.supervisorId)} size="sm" /><span className="sup">{Q.nameOf(s, ev.e.supervisorId)}</span>
        <span className="flags">
          {ev.n.late > 0 && <span className="f warn">{ev.n.late} late</span>}
          {missing > 0 && <span className="f bad">{missing} missing</span>}
          {!ev.n.late && !missing && <span className="f">{ev.shifts.length} shift{ev.shifts.length === 1 ? "" : "s"} · {span(ev)}</span>}
        </span>
      </span>
    </button>
  );
}

/* ── one event in focus: every person in a lane ──────────────────────────── */
const LANES: { id: Lane; label: string; tone: string; hint: string }[] = [
  { id: "expected", label: "Not yet", tone: "neutral", hint: "Not heard from yet" }, { id: "on_way", label: "On the way", tone: "", hint: "Told us they've set off" },
  { id: "late", label: "Running late", tone: "warn", hint: "With an expected time" }, { id: "on_site", label: "Checked in", tone: "ok", hint: "Verified at the venue" },
  { id: "finished", label: "Clocked out", tone: "neutral", hint: "Shift done" }];
const CAP = 12;
function Focus({ s, ev, shiftId }: { s: OssState; ev: EvDay; shiftId: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const sh = Q.shiftOf(s, shiftId);
  const rs = ev.people.filter((p) => p.sh.id === shiftId);
  const now = ms(s.clock);
  const missing = rs.filter((r) => r.lane === "missing");
  const lateIds = rs.filter((r) => r.lane === "late" || r.lane === "missing");
  const arrived = rs.filter((r) => r.vin).length;
  const live = now >= ms(sh.start) && now < ms(sh.end);
  const mins = minutesBetween(s.clock, sh.start);
  const status = now < ms(sh.start) ? "Starts in " + (mins < 60 ? mins + " min" : Math.floor(mins / 60) + "h " + (mins % 60) + "m") : live ? "Live now" : "Shift ended " + fmtTime(sh.end);
  const marks = rs.filter((r) => r.vin).map((r) => ({ name: Q.nameOf(s, r.a.workerId), d: minutesBetween(sh.start, r.vin!) }));
  const onTime = marks.filter((m) => m.d <= 0).length;
  const pos = (d: number) => ((Math.max(-60, Math.min(60, d)) + 60) / 120) * 100;
  const c = kindVar(ev.kind);
  return (
    <section className="lv-focus" id="lv-focus" style={{ ["--c" as any]: c }} aria-label={"Crew at " + ev.short}>
      <header className="lv-focus-h">
        <div className="tx">
          <span className="kick"><Tag c={c}>{ev.kind}</Tag><span className={"lv-state " + (missing.length && live ? "urgent" : live ? "live" : "")}>{live && <i />}{status}</span><span className="dim">{ev.desk}</span></span>
          <h2>{ev.short}, {sh.label.toLowerCase()}</h2>
          <p>{ev.v?.name}{ev.v?.county ? ", " + ev.v.county : ""} · {fmtDate(sh.start)}, {fmtTime(sh.start)}-{fmtTime(sh.end)} · supervisor {Q.nameOf(s, ev.e.supervisorId)}</p>
          <div className="acts">
            {lateIds.length > 0 && <Btn icon={I.msg} onClick={() => navigate("Messages", "compose", { kind: "shift", id: shiftId })}>Message {lateIds.length} late or missing</Btn>}
            <Btn icon={I.phone} onClick={() => setUi({ role: "supervisor", phoneOpen: true })}>Supervisor app</Btn>
            <Btn kind="ghost" icon={I.map} onClick={() => navigate("Attendance", "map", { kind: "shift", id: shiftId })}>Check-in map</Btn>
            <Btn kind="ghost" icon={I.back} onClick={() => setUi({ focus: { kind: "national", id: "-" } })}>All of Ireland</Btn>
          </div>
        </div>
        <div className="big">
          <MiniRing value={arrived} max={rs.length || 1} c={arrived === rs.length && rs.length ? "var(--ok)" : c} size={112} label={<>{arrived}<small>/{rs.length}</small></>} />
          <span>{now >= ms(sh.end) ? "turned up" : "checked in"}</span>
        </div>
      </header>
      {ev.shifts.length > 1 && <div className="lv-shifts">{ev.shifts.map((x) => <Chip key={x.id} on={x.id === shiftId} onClick={() => setUi({ focus: { kind: "shift", id: x.id } })}>{x.label} · {fmtTime(x.start)}-{fmtTime(x.end)} <span className="oss-muted">{ev.people.filter((p) => p.sh.id === x.id).length}</span></Chip>)}</div>}
      {missing.length > 0 && <div className="ops-alarm" role="alert">
        <span className="h"><Icon d={I.alert} size={16} /><b>{missing.length} missing or with an issue</b><span>Alert after {s.rules.missedClockMin} min</span></span>
        <div className="ppl">{missing.slice(0, 8).map((r) => <button key={r.a.id} className="oss-person" onClick={() => openDrawer("timesheet", r.a.id)}><Av name={Q.nameOf(s, r.a.workerId)} size="sm" /><span style={{ minWidth: 0 }}><div className="t">{Q.nameOf(s, r.a.workerId)}</div><div className="s">{r.note}</div></span></button>)}{missing.length > 8 && <span className="oss-small oss-dim">+{missing.length - 8} more</span>}</div>
        <Btn size="sm" onClick={() => navigate("Attendance", "exceptions")}>Open exceptions</Btn>
      </div>}
      <div className="ops-lanes">
        {LANES.map((l) => { const list = rs.filter((r) => r.lane === l.id); const show = open[l.id] ? list : list.slice(0, CAP); return (
          <section key={l.id} className={"ops-lane " + l.tone}>
            <header><span className="oss-dot" /><b>{l.label}</b><span className="n">{list.length}</span></header>
            <span className="hint">{l.hint}</span>
            <div className="ppl">
              {show.map((r) => (
                <button key={r.a.id} className={"ops-who" + (l.id === "late" ? " late" : "")} onClick={() => openDrawer("timesheet", r.a.id)}>
                  <Av name={Q.nameOf(s, r.a.workerId)} size="sm" />
                  <span className="tx"><b>{Q.nameOf(s, r.a.workerId)}</b><span>{r.note}</span></span>
                  {l.id === "late" && r.eta && <span className="eta">{fmtTime(r.eta)}</span>}
                </button>))}
              {list.length > CAP && <button className="lv-more" onClick={() => setOpen({ ...open, [l.id]: !open[l.id] })}>{open[l.id] ? "Show fewer" : "Show all " + list.length}</button>}
              {!list.length && <div className="none">Nobody</div>}
            </div>
          </section>); })}
      </div>
      <Card title="Arrivals against call time" meta={marks.length ? onTime + " of " + marks.length + " checked in by " + fmtTime(sh.start) : "Fills in as crew check in"} icon={I.clock}>
        <div className="ops-arr">
          <div className="track">
            <i className="call" style={{ left: "50%" }} />
            {marks.map((m, i) => <span key={i} className={"mk" + (m.d > 0 ? " late" : "")} style={{ left: pos(m.d) + "%", bottom: 6 + (i % 4) * 9 }} title={m.name + ": " + (m.d > 0 ? m.d + " min late" : Math.abs(m.d) + " min early")} />)}
          </div>
          <div className="ax"><span>60 min early</span><span className="c">Call {fmtTime(sh.start)}</span><span>60 min late</span></div>
        </div>
      </Card>
    </section>
  );
}

/* ── venue check-in for any event today ──────────────────────────────────── */
function TodayPicker({ s, day, shiftId }: { s: OssState; day: Day; shiftId: string }) {
  const cur = day.events.find((x) => x.shifts.some((y) => y.id === shiftId));
  return (
    <div className="lv-picker">
      <div className="evs" role="tablist" aria-label="Events today">
        {day.events.map((x) => (
          <button key={x.e.id} role="tab" aria-selected={x === cur} className={"lv-pill" + (x === cur ? " on" : "")} style={{ ["--c" as any]: kindVar(x.kind) }} onClick={() => pickEvent(x, day.now)}>
            <i className={x.phase === "live" ? "live" : ""} /><b>{x.short}</b><span>{x.v?.county || x.region} · {x.people.length}</span>
          </button>))}
      </div>
      {cur && cur.shifts.length > 1 && <div className="lv-shifts">{cur.shifts.map((x) => <Chip key={x.id} on={x.id === shiftId} onClick={() => setUi({ focus: { kind: "shift", id: x.id } })}>{x.label} · {fmtTime(x.start)}-{fmtTime(x.end)}</Chip>)}</div>}
    </div>
  );
}
function CheckIns({ s, day }: { s: OssState; day: Day }) {
  const f = focusOf(s, day);
  const fallback = day.events.find((x) => x.phase === "live") || day.events[0];
  const shiftId = f.shiftId || (fallback.shifts.find((x) => ms(x.end) > day.now) || fallback.shifts[0]).id;
  const sh = Q.shiftOf(s, shiftId), ev = Q.eventOf(s, sh.eventId);
  const v = Q.venueOf(s, ev.venueId)!;
  const asgIds = new Set(s.assignments.filter((a) => a.shiftId === shiftId).map((a) => a.id));
  const records = s.clocks.filter((c) => asgIds.has(c.assignmentId)).sort((a, b) => b.at.localeCompare(a.at));
  const [sel, setSel] = useState<string | null>(null);
  const pick = records.find((c) => c.id === sel) || records.find((c) => c.result !== "verified") || records[0];
  const ok = records.filter((c) => c.result === "verified").length, rej = records.filter((c) => c.result === "rejected").length;
  const latest = new Map<string, typeof records[0]>();
  records.slice().reverse().forEach((c) => { const cur = latest.get(c.assignmentId); if (!cur || c.result === "verified" || cur.result !== "verified") latest.set(c.assignmentId, c); });
  const FENCE = 150;
  const place = (dm: number) => dm <= v.geofenceM ? 72 + (dm / v.geofenceM) * (FENCE - 82) : Math.min(FENCE + 28 + (dm - v.geofenceM) * 0.4, 250);
  const review = records.filter((c) => c.result === "review").length;
  const flagged = records.filter((c) => c.result !== "verified");
  const rest = records.filter((c) => c.result === "verified");
  const dots = latest.size > 40;
  const qr = records.filter((c) => c.method === "qr").length;
  return (
    <Page eyebrow={"Venue check-in · " + day.events.length + " venues today"} title={v.name} sub={(v.county ? v.county + " · " : "") + v.geofenceM + " m check-in radius · " + v.methods.map((m) => (m === "gps" ? "location" : "QR code")).join(" or ") + ". Anything outside the radius goes to review, never straight through."}>
      <TodayPicker s={s} day={day} shiftId={shiftId} />
      <div className="ops-checkin">
        <section className="ops-mapcard" aria-label={"Map of " + v.name}>
          <div className="oss-map ops-bigmap">
            <div className="road" style={{ left: 0, right: 0, top: "70%", height: 28 }} />
            <div className="road" style={{ left: "16%", width: 18, top: 0, bottom: 0 }} />
            <div className="road" style={{ left: "78%", width: 12, top: 0, bottom: "30%" }} />
            <div className="fence" style={{ width: FENCE * 2, height: FENCE * 2, left: "calc(50% - " + FENCE + "px)", top: "calc(50% - " + FENCE + "px)" }} />
            <div className="bldg" style={{ width: 110, height: 58, left: "calc(50% - 55px)", top: "calc(50% - 29px)" }}>{v.name.split(",")[0]}</div>
            {Array.from(latest.values()).map((c, i) => {
              const r = c.method === "qr" ? 74 + (i % 6) * 11 : place(c.distanceM ?? 0), a = i * 2.39996 + 0.6;
              const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.82;
              const tone = c.result === "verified" ? "ok" : c.result === "rejected" ? "bad" : "warn";
              const name = Q.nameOf(s, Q.asgOf(s, c.assignmentId).workerId);
              return <button key={c.id} className={"pin " + tone + (dots ? " lv-dotpin" : "")} style={{ left: "calc(50% + " + x + "px)", top: "calc(50% + " + y + "px)", background: "none", border: 0, cursor: "pointer" }} onClick={() => setSel(c.id)} title={name + " · " + (c.method === "qr" ? "QR" : (c.distanceM ?? 0) + " m")}>
                {dots ? <span className="lv-dot" /> : <Av name={name} size="sm" />}{pick?.assignmentId === c.assignmentId && <span className="lbl">{name.split(" ")[0]} · {c.method === "qr" ? "QR" : (c.distanceM ?? 0) + " m"}</span>}
              </button>;
            })}
            <div className="ops-maplegend">
              <span><i className="ok" /><b>{ok}</b> verified</span>
              <span><i className="bad" /><b>{rej}</b> rejected</span>
              {review > 0 && <span><i className="warn" /><b>{review}</b> to review</span>}
              {qr > 0 && <span><b>{qr}</b> by QR</span>}
              <span className="m">Accuracy limit {s.rules.maxAccuracyM} m</span>
            </div>
            <div className="scale"><span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 99, border: "1.5px dashed var(--accent)" }} />{v.geofenceM} m check-in radius · {v.area}</div>
          </div>
        </section>
        <aside className="ops-readings" aria-label="Clock readings">
          <header><b>Readings</b><span>{records.length} for {ev.name.split(":")[0]}, {sh.label.toLowerCase()}{flagged.length ? ", " + flagged.length + " flagged first" : ", newest first"}</span></header>
          <div className="list">
            {flagged.length > 0 && <div className="grp">Rejected or to review</div>}
            {[flagged, rest].map((grp, gi) => <div key={gi}>{gi === 1 && flagged.length > 0 && rest.length > 0 && <div className="grp">All other readings, newest first</div>}{grp.slice(0, gi === 1 ? 120 : undefined).map((c) => {
              const on = pick?.id === c.id;
              const tone = c.result === "verified" ? "ok" : c.result === "rejected" ? "bad" : "warn";
              return (
                <div key={c.id} className={"ops-read " + tone + (on ? " on" : "")}>
                  <button className="row" onClick={() => setSel(c.id)} aria-expanded={on}>
                    <span className={"ic " + tone}><Icon d={c.method === "qr" ? I.qr : I.pin} size={14} /></span>
                    <span className="tx"><b>{Q.nameOf(s, Q.asgOf(s, c.assignmentId).workerId)}</b><span>{c.kind === "in" ? "Clock-in" : "Clock-out"} {fmtTime(c.at)} · {c.method === "qr" ? "QR code" : c.method === "gps" ? "Location" : c.method}</span></span>
                    <span className="dist"><b>{c.method === "qr" ? "QR" : (c.distanceM ?? "?") + " m"}</b><span className={"r " + tone}>{c.result === "verified" ? "Accepted" : c.result === "rejected" ? "Rejected" : c.result === "review" ? "Review" : "Offline"}</span></span>
                  </button>
                  {on && <div className="more">
                    <div className="kv"><span>When</span><b>{fmtDate(c.at)}, {fmtTime(c.at)}</b></div>
                    {c.method !== "qr" && <div className="kv"><span>Distance, accuracy</span><b>{c.distanceM ?? "-"} m, ±{c.accuracyM ?? "-"} m</b></div>}
                    <div className="why">{c.reason}</div>
                    {c.result === "review" && <div className="oss-row" style={{ gap: 8, marginTop: 10 }}><Btn size="sm" kind="primary" onClick={() => run(E.reviewClock, c.id, true, "Supervisor confirmed on site")}>Accept</Btn><Btn size="sm" onClick={() => run(E.reviewClock, c.id, false, "Not on site")}>Reject</Btn></div>}
                  </div>}
                </div>);
            })}</div>)}
            {rest.length > 120 && <div className="oss-tiny oss-muted" style={{ padding: "8px 12px" }}>Showing the newest 120 of {rest.length} accepted readings.</div>}
            {!records.length && <div className="oss-empty"><b>No check-ins yet</b>{ms(s.clock) < ms(sh.start) ? "Call time is " + fmtTime(sh.start) + "." : ""}</div>}
          </div>
        </aside>
      </div>
    </Page>
  );
}

/* ── exceptions across every event ───────────────────────────────────────── */
const EX_LABEL: Record<string, string> = { missing_in: "Missed clock-in", missing_out: "Missed clock-out", outside: "Outside the venue", poor_accuracy: "Weak location", denied: "Location off", offline: "No signal", bad_token: "Wrong QR code" };
const SEV: { id: string; label: string; tone: string; blurb: string; types: string[] }[] = [
  { id: "now", label: "Act now", tone: "urgent", blurb: "Nobody has seen them clock in", types: ["missing_in"] },
  { id: "fix", label: "Fix before approval", tone: "warn", blurb: "Blocks the timesheet until a correction is approved", types: ["missing_out"] },
  { id: "check", label: "Check the reading", tone: "info", blurb: "Location or code didn't pass at the venue", types: ["outside", "poor_accuracy", "denied", "bad_token"] },
  { id: "wait", label: "Waiting to sync", tone: "neutral", blurb: "Phone was offline; the record lands when it reconnects", types: ["offline"] }
];
const sevOf = (t: string) => SEV.find((x) => x.types.includes(t)) || SEV[2];
function Exceptions({ s, day }: { s: OssState; day: Day }) {
  const [showDone, setShowDone] = useState(() => s.exceptions.filter((e) => e.status === "open").length < 3);
  const [evF, setEvF] = useState<string>("all");
  const evOfEx = (e: AttendanceException) => Q.shiftOf(s, Q.asgOf(s, e.assignmentId).shiftId).eventId;
  const openAll = s.exceptions.filter((e) => e.status === "open").sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const open = openAll.filter((e) => evF === "all" || evOfEx(e) === evF);
  const done = s.exceptions.filter((e) => e.status === "resolved" && (evF === "all" || evOfEx(e) === evF)).sort((a, b) => (b.resolvedAt || b.createdAt).localeCompare(a.resolvedAt || a.createdAt));
  const evIds = Array.from(new Set(s.exceptions.map(evOfEx)));
  const clean = day.events.filter((x) => !openAll.some((e) => evOfEx(e) === x.e.id));
  const item = (e: AttendanceException) => {
    const a = Q.asgOf(s, e.assignmentId), sh = Q.shiftOf(s, a.shiftId), ev = Q.eventOf(s, sh.eventId);
    const missing = e.type === "missing_in" || e.type === "missing_out";
    return (
      <article key={e.id} className={"ops-tri" + (e.status === "resolved" ? " done" : "")}>
        <span className="ic"><Icon d={missing ? I.clock : e.type === "bad_token" ? I.qr : e.type === "offline" ? I.wifiOff : I.pin} size={16} /></span>
        <div className="tx">
          <div className="t"><button className="oss-link" style={{ color: "var(--ink)", fontWeight: 600 }} onClick={() => openDrawer("timesheet", e.assignmentId)}>{Q.nameOf(s, a.workerId)}</button><span className="lab">{EX_LABEL[e.type] || e.type}</span><Tag c={kindVar(Q.kindOf(s, ev))}>{ev.name.split(":")[0]}</Tag></div>
          <div className="s">{sh.label} · raised {fmtDate(e.createdAt).split(" ")[0]} {fmtTime(e.createdAt)} · owner {Q.nameOf(s, e.ownerId)}</div>
          <div className="r">{e.status === "open" ? <><b>Next:</b> {e.nextAction}</> : <><b>Resolved:</b> {e.resolution}</>}</div>
        </div>
        <div className="act">
          {e.status === "open" ? (missing
            ? <Btn size="sm" kind={e.type === "missing_in" ? "urgent" : "primary"} onClick={() => navigate("Timesheets", "corrections", { kind: "assignment", id: e.assignmentId })}>Fix time</Btn>
            : <><Btn size="sm" kind="primary" onClick={() => navigate("Attendance", "map", { kind: "shift", id: sh.id })}>Review check-in</Btn><Btn size="sm" kind="ghost" onClick={() => run(E.resolveException, e.id, "Checked with the supervisor on site")}>Resolve</Btn></>)
            : <S s="Resolved" />}
        </div>
      </article>);
  };
  return (
    <Page eyebrow={"Exceptions · " + day.events.length + " events today"} title="Attendance that needs a person" sub="Missed clock-ins and clock-outs, check-ins outside the venue, weak signal and wrong codes, across every venue. Nothing clears itself."
      actions={<span className="ops-tri-sum">{SEV.map((g) => { const n = open.filter((e) => sevOf(e.type).id === g.id).length; return <span key={g.id} className={"c " + g.tone + (n ? " has" : "")}><b>{n}</b>{g.label}</span>; })}</span>}>
      {evIds.length > 1 && <div className="lv-shifts"><Chip on={evF === "all"} onClick={() => setEvF("all")}>Every event <span className="oss-muted">{openAll.length}</span></Chip>
        {evIds.map((id) => { const ev = Q.eventOf(s, id); return <Chip key={id} on={evF === id} onClick={() => setEvF(id)}><i className="lv-kdot" style={{ background: kindVar(Q.kindOf(s, ev)) }} />{ev.name.split(":")[0]} <span className="oss-muted">{openAll.filter((e) => evOfEx(e) === id).length}</span></Chip>; })}</div>}
      {SEV.map((g) => { const list = open.filter((e) => sevOf(e.type).id === g.id); if (!list.length) return null; return (
        <section key={g.id} className={"ops-trigroup " + g.tone}>
          <header><span className="oss-dot" /><b>{g.label}</b><span className="n">{list.length}</span><span className="bl">{g.blurb}</span></header>
          {list.map(item)}
        </section>); })}
      {!open.length && <div className="ops-tri-clear"><Icon d={I.check} size={22} /><b>No open exceptions</b><span>Missed clocks, readings outside the venue and wrong codes land here the moment they happen.</span></div>}
      {clean.length > 0 && <div className="lv-clean"><Icon d={I.shield} size={15} /><span><b>{clean.length} of {day.events.length} events today running clean.</b> {clean.slice(0, 6).map((x) => x.short).join(", ")}{clean.length > 6 ? " and " + (clean.length - 6) + " more" : ""}.</span></div>}
      {done.length > 0 && <section className="ops-trigroup neutral">
        <header><button className="ops-tri-toggle" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}><Icon d={showDone ? I.up : I.down} size={13} /><b>Resolved</b><span className="n">{done.length}</span><span className="bl">Each with the reason it was closed</span></button></header>
        {showDone && done.map(item)}
      </section>}
    </Page>
  );
}

function Nothing({ s }: { s: OssState }) {
  const next = s.shifts.filter((x) => ms(x.start) > ms(s.clock) && Q.eventOf(s, x.eventId).status === "confirmed").sort((a, b) => a.start.localeCompare(b.start)).slice(0, 8);
  return (
    <Page eyebrow="Live operations" title="Nothing running right now" sub="The board fills up on the day of each event, across every venue.">
      <Card title="Coming up" icon={I.cal} flush>
        <div className="oss-rows">{next.map((x) => { const ev = Q.eventOf(s, x.eventId); return <Row key={x.id} lead={<RIcon d={I.cal} />} title={<>{ev.name.split(":")[0] + " · " + x.label} <Tag c={kindVar(Q.kindOf(s, ev))}>{Q.kindOf(s, ev)}</Tag></>} sub={fmtDate(x.start) + ", " + fmtTime(x.start) + "-" + fmtTime(x.end)} end={<span className="num">{Q.shiftCoverage(s, x.id).confirmed}/{x.required}</span>} onClick={() => setUi({ focus: { kind: "shift", id: x.id } })} />; })}</div>
      </Card>
    </Page>
  );
}
