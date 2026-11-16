/* Operations dashboard for the whole company, read top to bottom:
   1. the KPI band (template): today across OSS
   2. what needs a person now, beside what is live on site right now
   3. the picture: this week on a map of Ireland, demand by kind, fill by desk
   4. supporting lists: clients, hours to Bullhorn, replies, availability, documents
   Executive and Year are the business view and the season plan. Colour is
   meaning: kinds and desks own a hue, status keeps ok/warn/bad, orange is urgent. */

import { useState, type ReactNode } from "react";
import "../../styles/oss-dash.css";
import type { EventBooking, EventKind, OssState, Shift } from "../model";
import { ACCOUNTS, profile, reliability } from "../industry";
import { AREAS, areaCount, todos, type Area, type Todo } from "../todo";
import * as E from "../engine";
import * as Q from "../selectors";
import { WINDOW } from "../seed";
import { DESKS } from "../network";
import { navigate, openDrawer, run, useOss } from "../store";
import { tabOf } from "../modules";
import { addDays, dayKey, fmtDate, fmtHM, fmtTime, minutesBetween, ms, zoned } from "../time";
import { Av, Btn, Card, Faces, Figure, Hero, hueVar, I, Icon, IrelandMap, kindVar, Page, regionVar, Ring, Row, RIcon, S, Seg, St, Steps, Tag, type MapPin } from "../ui/kit";

export default function Dashboard() {
  const s = useOss();
  const tab = tabOf(s, "Dashboard");
  return tab === "year" ? <Year s={s} /> : tab === "executive" ? <Executive s={s} /> : <Control s={s} />;
}

/* ── shared measures (also used by the KPI band and the Home rail) ─────────── */
export const DESK_VAR: Record<string, string> = {
  "Dublin events desk": "var(--k-4)", "Stadia and sport desk": "var(--k-2)", "Live music and theatre desk": "var(--k-1)",
  "Corporate and hospitality desk": "var(--k-3)", "Cork and Munster desk": "var(--k-6)", "West and North desk": "var(--k-5)"
};
export const deskVar = (d: string) => DESK_VAR[d] || hueVar(d);
export const AREA_VAR: Record<Area, string> = { staffing: "var(--k-6)", eventday: "var(--k-2)", hours: "var(--k-1)", crew: "var(--k-3)" };
const AREA_ICON: Record<Area, string> = { staffing: I.users, eventday: I.wave, hours: I.doc, crew: I.shield };
const URGENT = "#F6881F";
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
export const nf = (n: number) => n.toLocaleString("en-IE");
const hrs = (min: number) => nf(Math.round(min / 60)) + "h";
const short = (e: EventBooking) => e.name.split(":")[0];
const deskShort = (d: string) => d.replace(/ desk$/, "");
const firm = (e: EventBooking) => e.status === "confirmed" && !e.historical;
const crewOn = (s: OssState, shId: string) => Q.rowsBy(s.assignments, "shift", (a) => a.shiftId, shId).filter((a) => a.status === "confirmed");
const inWeek = (d: string) => d >= WINDOW.from && d <= WINDOW.to;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

export interface LiveEvent { e: EventBooking; shifts: Shift[]; expected: number; onSite: number; late: number; required: number }
/** Today across OSS: every firm shift today, what is live now, who is on site. */
export function dayPulse(s: OssState) {
  const day = dayKey(s.clock), now = ms(s.clock);
  const firmShifts = s.shifts.filter((x) => firm(Q.eventOf(s, x.eventId)));
  const today = firmShifts.filter((x) => dayKey(x.start) === day);
  const liveSh = firmShifts.filter((x) => ms(x.start) <= now && ms(x.end) >= now);
  /* Same definition as Q.eventsOnDay (any shift starting or ending today), plus anything on site right now. */
  const onDay = Q.eventsOnDay(s, day);
  const events = onDay.concat(s.events.filter((e) => !onDay.includes(e) && liveSh.some((x) => x.eventId === e.id)));
  const byEv = new Map<string, LiveEvent>();
  for (const x of liveSh) {
    const e = Q.eventOf(s, x.eventId);
    const g = byEv.get(e.id) || { e, shifts: [], expected: 0, onSite: 0, late: 0, required: 0 };
    const crew = crewOn(s, x.id);
    g.shifts.push(x); g.required += x.required; g.expected += crew.length;
    g.onSite += crew.filter((a) => Q.verifiedIn(s, a.id) && !Q.verifiedOut(s, a.id)).length;
    g.late += crew.filter((a) => !Q.verifiedIn(s, a.id) && Q.arrivalState(s, a.id) === "Running late").length;
    byEv.set(e.id, g);
  }
  const live = [...byEv.values()].sort((a, b) => b.expected - a.expected);
  const next = firmShifts.filter((x) => ms(x.start) > now && ms(x.start) - now < 30 * 3600000).sort((a, b) => a.start.localeCompare(b.start));
  return {
    day, events, today, live, next,
    rostered: sum(today.map((x) => crewOn(s, x.id).length)), positions: sum(today.map((x) => x.required)),
    onSite: sum(live.map((l) => l.onSite)), expected: sum(live.map((l) => l.expected)), late: sum(live.map((l) => l.late)),
    venues: new Set(events.map((e) => e.venueId)).size
  };
}
/** This week across OSS: fill, hours from clock to Bullhorn, crew used. */
export function weekPulse(s: OssState) {
  const t = Q.windowTotals(s);
  const ls = Q.lines(s).filter((l) => inWeek(l.workDate));
  const approved = ls.filter((l) => l.status === "approved" || l.status === "exported");
  const inBh = s.items.filter((i) => inWeek(i.snapshot.workDate) && i.state === "accepted");
  const crewIds = new Set(t.events.flatMap((e) => Q.shiftsOfEvent(s, e.id)).flatMap((x) => crewOn(s, x.id).map((a) => a.workerId)));
  return {
    t, ls, crewIds, crewUsed: crewIds.size,
    clocked: ls.filter((l) => l.complete).length, approved: approved.length, approvedMin: sum(approved.map((l) => l.payableMin)),
    inBh: inBh.length, inBhMin: sum(inBh.map((i) => i.snapshot.payableMin)),
    blocked: s.items.filter((i) => i.state === "blocked" || i.state === "failed"),
    ready: ls.filter((l) => l.status === "ready" || l.status === "needs_review").length, incomplete: ls.filter((l) => l.status === "incomplete").length
  };
}
function weekByKind(s: OssState) {
  return Array.from({ length: 7 }, (_, i) => addDays(WINDOW.from, i)).map((d) => {
    const sh = s.shifts.filter((x) => dayKey(x.start) === d && firm(Q.eventOf(s, x.eventId)));
    const k = new Map<EventKind, number>();
    for (const x of sh) { const kd = Q.kindOf(s, Q.eventOf(s, x.eventId)); k.set(kd, (k.get(kd) || 0) + x.required); }
    return { d, req: sum(sh.map((x) => x.required)), conf: sum(sh.map((x) => Math.min(x.required, crewOn(s, x.id).length))), events: new Set(sh.map((x) => x.eventId)).size, kinds: Q.KINDS.map((kd) => ({ kd, n: k.get(kd) || 0 })) };
  });
}
function deskRows(s: OssState, wk: ReturnType<typeof weekPulse>) {
  return DESKS.map((d) => {
    const t = Q.windowTotals(s, { desk: d });
    const ins = t.events.flatMap((e) => Q.shiftsOfEvent(s, e.id)).flatMap((x) => crewOn(s, x.id).map((a) => ({ x, c: Q.verifiedIn(s, a.id) }))).filter((z) => z.c);
    const onTime = ins.filter((z) => ms(z.c!.at) <= ms(z.x.start) + 5 * 60000).length;
    const appr = wk.ls.filter((l) => Q.deskOf(l.event) === d && (l.status === "approved" || l.status === "exported"));
    return { d, t, clocked: ins.length, onTime: ins.length ? pct(onTime, ins.length) : null, approvedMin: sum(appr.map((l) => l.payableMin)) };
  }).filter((r) => r.t.required);
}

/* ── control panel ──────────────────────────────────────────────────────── */
function Control({ s }: { s: OssState }) {
  const all = todos(s);
  const [area, setArea] = useState<"all" | Area>("all");
  const [urgentOnly, setUrgent] = useState(false);
  const [more, setMore] = useState(false);
  const shown = all.filter((t) => (area === "all" || t.area === area) && (!urgentOnly || t.urgent));
  const urgent = shown.filter((t) => t.urgent), rest = shown.filter((t) => !t.urgent);
  const restShown = more ? rest : rest.slice(0, Math.max(3, 10 - urgent.length));
  const day = dayPulse(s), wk = weekPulse(s);
  const quick: [string, string, () => void][] = [
    ["New booking", I.plus, () => navigate("Events", "upcoming", { kind: "new", id: "booking" })], ["Invite crew", I.users, () => navigate("Staffing", "allocate")],
    ["Message crew", I.msg, () => navigate("Messages", "compose")], ["Register on site", I.user, () => navigate("Staff", "register")],
    ["Book an induction", I.cal, () => navigate("Recruitment", "inductions")], ["Approve hours", I.check, () => navigate("Timesheets", "review")],
    ["Send to Bullhorn", I.link, () => navigate("Timesheets", "bullhorn")], ["Client report", I.download, () => navigate("Reports", "client")], ["Ask Pulse", I.spark, () => navigate("Home")]];
  return (
    <Page bare>
      <div className="db-top">
        <section className="oss-card db-todo" aria-label="Needs you">
          <header className="db-todo-h">
            <div className="db-todo-t">
              <span className="oss-eyebrow">Needs you</span>
              <h2>{all.length} things to do{all.some((t) => t.urgent) && <span className="db-urg"><Icon d={I.alert} size={12} sw={2.2} />{all.filter((t) => t.urgent).length} urgent</span>}</h2>
            </div>
            <div className="db-filters" role="group" aria-label="Filter by area">
              <button className={"db-pill" + (area === "all" ? " on" : "")} onClick={() => setArea("all")}>All <b>{all.length}</b></button>
              {AREAS.map((a) => <button key={a.id} className={"db-pill" + (area === a.id ? " on" : "")} style={{ ["--c" as any]: AREA_VAR[a.id] }} onClick={() => setArea(a.id)}><i />{a.label} <b>{areaCount(all, a.id).n}</b></button>)}
              <button className={"db-pill" + (urgentOnly ? " on" : "")} style={{ ["--c" as any]: URGENT }} aria-pressed={urgentOnly} onClick={() => setUrgent(!urgentOnly)}><i />Urgent only</button>
            </div>
          </header>
          {urgent.length > 0 && <div className="db-group urgent"><span className="db-group-l">Urgent</span>{urgent.map((t, k) => <TodoRow key={"u" + k} s={s} t={t} />)}</div>}
          {restShown.length > 0 && <div className="db-group"><span className="db-group-l">{urgent.length ? "Next" : "To do"}</span>{restShown.map((t, k) => <TodoRow key={"r" + k} s={s} t={t} />)}</div>}
          {rest.length > restShown.length && <button className="db-more" onClick={() => setMore(true)}>Show {rest.length - restShown.length} more</button>}
          {!shown.length && <div className="oss-empty"><b>Clear</b>Nothing waiting here.</div>}
          <footer className="db-quick" aria-label="Shortcuts">{quick.map(([l, ic, go]) => <button key={l} onClick={go}><Icon d={ic} size={12} />{l}</button>)}</footer>
        </section>
        <LivePanel s={s} day={day} />
      </div>

      <div className="db-vis">
        <MapCard s={s} day={day} />
        <div className="db-vis-r">
          <Demand s={s} />
          <DeskFill s={s} />
        </div>
      </div>

      <div className="db-low">
        <TopClients s={s} />
        <HoursFlow s={s} wk={wk} />
        <Replies s={s} />
      </div>

      <div className="db-foot">
        <Availability s={s} />
        <Documents s={s} />
      </div>
    </Page>
  );
}

function TodoRow({ s, t }: { s: OssState; t: Todo }) {
  return (
    <div className={"db-item" + (t.urgent ? " urgent" : "")} style={{ ["--c" as any]: AREA_VAR[t.area] }}>
      <span className="db-ico">{t.who ? <Av name={Q.nameOf(s, t.who)} size="sm" /> : <Icon d={AREA_ICON[t.area]} size={15} />}</span>
      <div className="db-item-m">
        <div className="t">{t.title}</div>
        <div className="s"><span className="db-area">{AREAS.find((a) => a.id === t.area)!.label}</span>{t.tag && <span className="db-code">{t.tag}</span>}<span>{t.sub}</span></div>
      </div>
      <div className="db-item-a">{t.actions.map((x) => <Btn key={x.label} size="sm" kind={x.primary ? (t.urgent ? "urgent" : "primary") : undefined} onClick={x.go}>{x.label}</Btn>)}</div>
    </div>
  );
}

function LivePanel({ s, day }: { s: OssState; day: ReturnType<typeof dayPulse> }) {
  return (
    <aside className="oss-card db-live" aria-label="Live right now">
      <div className="db-live-h">
        <span className={"db-pulse" + (day.live.length ? "" : " off")} />
        <b>Live right now</b>
        <span>{day.live.length ? nf(day.onSite) + " of " + nf(day.expected) + " on site" : fmtDate(s.clock) + ", " + fmtTime(s.clock)}</span>
      </div>
      <div className="db-live-figs">
        <div><b>{day.live.length}</b><span>events live</span></div>
        <div><b>{day.events.length}</b><span>today, {day.venues} venues</span></div>
        <div className={day.late ? "late" : ""}><b>{day.late}</b><span>running late</span></div>
      </div>
      {day.live.slice(0, 6).map((l) => {
        const kd = Q.kindOf(s, l.e); const v = Q.venueOf(s, l.e.venueId);
        return (
          <button key={l.e.id} className="db-lrow" style={{ ["--c" as any]: kindVar(kd) }} onClick={() => navigate("Attendance", "board", { kind: "event", id: l.e.id })}>
            <span className="top"><span className="nm">{short(l.e)}</span><span className="ct">{l.onSite}<small>/{l.expected}</small></span></span>
            <span className="sub"><Tag c={kindVar(kd)}>{kd}</Tag><span className="oss-ellip">{v?.county || v?.area || ""} · {l.shifts.map((x) => x.label).join(", ")}</span>{l.late > 0 && <span className="db-late">{l.late} late</span>}</span>
            <span className="db-lbar"><i style={{ width: (l.expected ? (l.onSite / l.expected) * 100 : 0) + "%" }} /></span>
          </button>);
      })}
      {day.live.length > 6 && <div className="oss-tiny oss-muted" style={{ padding: "2px 10px 6px" }}>+{day.live.length - 6} more live</div>}
      {!day.live.length && <div className="db-quiet">Nobody on site right now.</div>}
      {day.next.length > 0 && (
        <div className="db-next">
          <span className="db-next-h">Starting next</span>
          {day.next.slice(0, 5).map((x) => { const e = Q.eventOf(s, x.eventId); return (
            <button key={x.id} className="db-nrow" style={{ ["--c" as any]: kindVar(Q.kindOf(s, e)) }} onClick={() => navigate("Events", "upcoming", { kind: "event", id: e.id })}>
              <time>{dayKey(x.start) === day.day ? fmtTime(x.start) : fmtDate(x.start).split(" ")[0] + " " + fmtTime(x.start)}</time><i /><span className="oss-ellip">{short(e)}, {x.label.toLowerCase()}</span><b>{crewOn(s, x.id).length}/{x.required}</b>
            </button>); })}
        </div>)}
      <Btn block icon={I.wave} onClick={() => navigate("Attendance", "board")}>Open live operations</Btn>
    </aside>
  );
}

function MapCard({ s, day }: { s: OssState; day: ReturnType<typeof dayPulse> }) {
  const [mode, setMode] = useState<"week" | "today">("week");
  const evs = mode === "today" ? day.events : Q.windowTotals(s).events;
  const liveIds = new Set(day.live.map((l) => l.e.id));
  const byVenue = new Map<string, { req: number; events: EventBooking[] }>();
  for (const e of evs) { if (!e.venueId) continue; const g = byVenue.get(e.venueId) || { req: 0, events: [] }; g.req += Q.eventCoverage(s, e.id).required; g.events.push(e); byVenue.set(e.venueId, g); }
  const rows = [...byVenue.entries()].map(([vid, g]) => ({ v: Q.venueOf(s, vid)!, ...g })).filter((r) => r.v?.lat !== undefined).sort((a, b) => b.req - a.req);
  const dublinTop = rows.find((r) => r.v.region === "Dublin");
  const labelled = new Set<string>();
  const pins: MapPin[] = rows.map((r) => {
    const big = r.events.slice().sort((a, b) => Q.eventCoverage(s, b.id).required - Q.eventCoverage(s, a.id).required)[0];
    return { id: big.id, lat: r.v.lat!, lng: r.v.lng!, c: kindVar(Q.kindOf(s, big)), r: Math.min(16, 4 + Math.sqrt(r.req) * 0.85), pulse: r.events.some((e) => liveIds.has(e.id)),
      label: r === dublinTop ? "Dublin" : r.v.region !== "Dublin" && r.v.county && !labelled.has(r.v.county) && !!labelled.add(r.v.county) ? r.v.county : undefined };
  });
  const regions = Q.REGIONS.map((rg) => { const list = rows.filter((r) => r.v.region === rg); return { rg, events: sum(list.map((r) => r.events.length)), req: sum(list.map((r) => r.req)) }; });
  const kinds = Q.KINDS.map((kd) => ({ kd, n: evs.filter((e) => Q.kindOf(s, e) === kd).length })).filter((x) => x.n);
  return (
    <section className="oss-card db-map" aria-label="Events across Ireland">
      <div className="db-sech">
        <div><h3>Across Ireland</h3><span>{evs.length} events at {rows.length} venues, {nf(sum(rows.map((r) => r.req)))} positions</span></div>
        <div className="r"><Seg value={mode} onChange={setMode} label="Map range" options={[{ id: "week", label: "This week" }, { id: "today", label: "Today" }]} /></div>
      </div>
      <div className="db-mapwrap"><IrelandMap pins={pins} height={390} onPick={(id) => navigate("Events", "upcoming", { kind: "event", id })} /></div>
      <div className="db-kinds">{kinds.map((k) => <Tag key={k.kd} c={kindVar(k.kd)}>{k.kd} <b>{k.n}</b></Tag>)}</div>
      <div className="db-regions">{regions.map((r) => <div key={r.rg} className="db-reg" style={{ ["--c" as any]: regionVar(r.rg) }}><span>{r.rg}</span><b>{nf(r.req)}</b><small>{r.events} event{r.events === 1 ? "" : "s"}</small></div>)}</div>
    </section>
  );
}

function Demand({ s }: { s: OssState }) {
  const days = weekByKind(s);
  const max = Math.max(1, ...days.map((d) => d.req));
  const today = dayKey(s.clock);
  return (
    <section className="oss-card db-demand" aria-label="Demand this week">
      <div className="db-sech">
        <div><h3>Demand this week</h3><span>Positions per day by kind of work, with fill</span></div>
        <div className="r"><Btn size="sm" icon={I.plus} onClick={() => navigate("Events", "upcoming", { kind: "new", id: "booking" })}>New booking</Btn></div>
      </div>
      <div className="db-cols">
        {days.map((d) => {
          const iso = zoned(d.d, "12:00");
          return (
            <button key={d.d} className={"db-col" + (d.d === today ? " today" : "")} onClick={() => navigate("Calendar", "week")} title={nf(d.req) + " positions, " + d.events + " events"}>
              <span className="n">{nf(d.req)}</span>
              <span className="db-stack" style={{ height: Math.max(4, (d.req / max) * 150) + "px" }}>
                {d.kinds.filter((k) => k.n).map((k) => <i key={k.kd} style={{ height: (k.n / d.req) * 100 + "%", background: kindVar(k.kd) }} />)}
              </span>
              <span className="d"><b>{fmtDate(iso).split(" ")[0]}</b> {fmtDate(iso).split(" ")[1]}</span>
              <span className="f" style={{ color: d.req && d.conf < d.req ? "var(--warn)" : "var(--ok)" }}>{d.req ? pct(d.conf, d.req) + "%" : "-"}</span>
            </button>);
        })}
      </div>
      <div className="db-legend">{Q.KINDS.map((k) => <span key={k} style={{ ["--c" as any]: kindVar(k) }}><i />{k}</span>)}</div>
    </section>
  );
}

function DeskFill({ s }: { s: OssState }) {
  const rows = DESKS.map((d) => ({ d, t: Q.windowTotals(s, { desk: d }) })).filter((r) => r.t.required);
  return (
    <section className="oss-card db-desks" aria-label="Fill by desk">
      <div className="db-sech"><div><h3>Fill by desk</h3><span>Confirmed, awaiting a reply and open, next seven days</span></div></div>
      {rows.map(({ d, t }) => (
        <button key={d} className="db-desk" style={{ ["--c" as any]: deskVar(d) }} onClick={() => navigate("Events", "upcoming")}>
          <span className="nm"><i />{deskShort(d)}<small>{t.events.length}</small></span>
          <span className="db-dbar"><i style={{ width: (t.confirmed / t.required) * 100 + "%" }} />{t.awaiting > 0 && <i className="aw" style={{ width: (t.awaiting / t.required) * 100 + "%" }} />}</span>
          <span className="pc" style={{ color: t.unfilled ? "var(--warn)" : undefined }}>{t.coverageLabel}</span>
          <span className="cnt">{nf(t.confirmed)}/{nf(t.required)}</span>
        </button>))}
    </section>
  );
}

function TopClients({ s }: { s: OssState }) {
  const by = new Map<string, { req: number; conf: number; n: number }>();
  for (const e of Q.windowTotals(s).events) { const c = Q.eventCoverage(s, e.id); const g = by.get(e.clientId) || { req: 0, conf: 0, n: 0 }; g.req += c.required; g.conf += c.confirmed; g.n++; by.set(e.clientId, g); }
  const rows = [...by.entries()].sort((a, b) => b[1].req - a[1].req).slice(0, 7);
  const max = Math.max(1, ...rows.map((r) => r[1].req));
  return (
    <Card title="Biggest clients this week" meta={by.size + " clients with work booked"} icon={I.briefcase}>
      <div className="db-cl">
        {rows.map(([id, g]) => (
          <button key={id} className="db-clrow" style={{ ["--c" as any]: hueVar(id) }} onClick={() => navigate("Clients", "accounts", { kind: "client", id })}>
            <span className="nm"><i />{Q.clientOf(s, id).name}</span>
            <span className="bar"><i style={{ width: (g.req / max) * 100 + "%" }} /></span>
            <span className="v">{nf(g.req)}<small>{g.n} ev</small></span>
          </button>))}
      </div>
    </Card>
  );
}

function HoursFlow({ s, wk }: { s: OssState; wk: ReturnType<typeof weekPulse> }) {
  const batches = s.batches.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  return (
    <Card title="Hours this week" meta="From the clock to Bullhorn, every desk" icon={I.doc} right={<Btn size="sm" onClick={() => navigate("Timesheets", "review")}>Review</Btn>}>
      <div className="db-hfig"><Figure label="Approved" value={hrs(wk.approvedMin)} sub={nf(wk.approved) + " lines"} tone="accent" /><Figure label="In Bullhorn" value={hrs(wk.inBhMin)} sub={nf(wk.inBh) + " rows"} tone="ok" /></div>
      <Steps steps={[
        { label: "Clocked", n: nf(wk.clocked), on: wk.clocked > 0 },
        { label: "To approve", n: nf(wk.ready), tone: wk.ready ? "accent" : undefined, on: wk.ready > 0 },
        { label: "Approved", n: nf(wk.approved), on: wk.approved > 0 },
        { label: "Blocked", n: wk.blocked.length + wk.incomplete, tone: wk.blocked.length + wk.incomplete ? "bad" : undefined, sub: wk.incomplete ? wk.incomplete + " missing clock" : undefined }]} />
      <div className="oss-rows" style={{ marginTop: 12, marginLeft: -12, marginRight: -12 }}>
        {batches.map((b) => {
          const bs = Q.batchSummary(s, b.id);
          return <Row key={b.id} lead={<RIcon d={I.link} tone={bs.blocked ? "bad" : "ok"} />} title={b.id} sub={b.label + " · " + bs.accepted + "/" + bs.items.length + " rows · " + fmtHM(bs.acceptedMin)}
            end={bs.blocked ? <S s="Blocked" /> : <St tone="ok">In Bullhorn</St>} onClick={() => navigate("Timesheets", "bullhorn")} />;
        })}
      </div>
    </Card>
  );
}

function Replies({ s }: { s: OssState }) {
  const awaiting = s.invitations.filter((i) => Q.isActiveInvite(s, i)).sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  return (
    <Card title="Waiting for a reply" meta={awaiting.length + " offers out, oldest first"} icon={I.clock} flush
      right={awaiting.length > 0 && <Btn size="sm" onClick={() => awaiting.forEach((i) => run(E.remind, i.id))}>Remind all</Btn>}>
      <div className="oss-rows">
        {awaiting.slice(0, 6).map((i) => {
          const w = Q.worker(s, i.workerId), sh = Q.shiftOf(s, i.shiftId), e = Q.eventOf(s, sh.eventId);
          const mins = minutesBetween(i.sentAt, s.clock);
          return <Row key={i.id} lead={<Av name={w.name} size="sm" />} title={w.name} sub={<><span className="db-kdot" style={{ ["--c" as any]: kindVar(Q.kindOf(s, e)) }} />{short(e) + " · " + sh.label}</>}
            end={<span className="when" style={{ color: mins > 12 * 60 ? URGENT : undefined }}>{mins < 60 ? mins + " min" : mins < 1440 ? fmtHM(mins) : fmtDate(i.sentAt)}{i.reminders.length ? " · reminded" : ""}</span>} onClick={() => navigate("Staffing", "responses")} />;
        })}
        {!awaiting.length && <div className="oss-empty"><b>Everyone has answered</b></div>}
      </div>
    </Card>
  );
}

function Availability({ s }: { s: OssState }) {
  const noAvail = Q.notSubmitted(s);
  const done = s.workers.length - noAvail.length;
  return (
    <section className="oss-card db-avail" aria-label="Availability">
      <Ring value={done} max={s.workers.length} size={104} stroke={10} tone="ok" label={Math.round((done / s.workers.length) * 100) + "%"} sub="submitted" />
      <div className="grow">
        <h3>Availability</h3>
        <p><b>{nf(done)}</b> of {nf(s.workers.length)} crew have told OSS when they can work. {nf(noAvail.length)} haven't yet.</p>
        <div className="oss-row" style={{ gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <Faces names={noAvail.map((w) => w.name)} max={5} />
          <Btn size="sm" icon={I.send} onClick={() => navigate("Staff", "availability")}>Ask the {nf(noAvail.length)}</Btn>
          <Btn size="sm" kind="ghost" onClick={() => navigate("Staff", "availability")}>See who's free</Btn>
        </div>
      </div>
    </section>
  );
}

function Documents({ s }: { s: OssState }) {
  const exp = Q.expiringDocs(s);
  const pending = s.documents.filter((d) => d.review === "pending");
  return (
    <Card title="Documents" meta={pending.length + " to review, " + exp.length + " expiring in 30 days"} icon={I.shield} flush right={<Btn size="sm" onClick={() => navigate("Staff", "documents")}>Open</Btn>}>
      <div className="oss-rows db-docs">
        {pending.map((d) => <Row key={d.id} lead={<RIcon d={I.upload} tone="info" />} title={Q.nameOf(s, d.workerId) + " uploaded " + docName(d.type)} sub="Waiting for review" onClick={() => navigate("Staff", "documents")} end={<S s="Pending review" />} />)}
        {exp.slice(0, 4).map((d) => <Row key={d.id} lead={<RIcon d={I.shield} tone="warn" />} title={Q.nameOf(s, d.workerId) + ": " + docName(d.type)} sub={"Expires " + fmtDate(zoned(d.expires, "12:00"))} onClick={() => navigate("Staff", "documents")} end={<S s="Expiring" />} />)}
        {!pending.length && !exp.length && <div className="oss-empty"><b>All clear</b></div>}
      </div>
    </Card>
  );
}
const docName = (t: string) => ({ MH: "Manual Handling", SP: "Safe Pass", HACCP: "Food Safety", FA: "First Aid" } as Record<string, string>)[t] || t;

/* ── executive ────────────────────────────────────────────────────────────── */
const TREND = [92.4, 94.1, 93.6, 95.2, 96.0, 95.4, 96.8, 96.1, 94.9, 97.3, 97.6];
const REGION_AT: Record<string, [number, number]> = { Dublin: [53.35, -6.26], Leinster: [52.85, -7.05], Munster: [52.25, -8.75], Connacht: [53.6, -9.05], Ulster: [54.45, -7.6] };
function Donut({ parts, size = 176, stroke = 24, children }: { parts: { label: string; n: number; c: string }[]; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, tot = sum(parts.map((p) => p.n));
  let off = 0;
  return (
    <span className="db-donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--track)" strokeWidth={stroke} />
        {parts.map((p) => { const len = tot ? (p.n / tot) * c : 0; const el = <circle key={p.label} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.c} strokeWidth={stroke} strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />; off += len; return el; })}
      </svg>
      <span className="in">{children}</span>
    </span>
  );
}
function Executive({ s }: { s: OssState }) {
  const wk = weekPulse(s); const t = wk.t;
  const ps = s.workers.map((w) => ({ w, p: profile(w) }));
  const shifts90 = sum(ps.map((x) => x.p.shifts90)), noShows = sum(ps.map((x) => x.p.noShows)), lateC = sum(ps.map((x) => x.p.lateCancels));
  const replied = s.invitations.filter((i) => i.respondedAt && i.status === "accepted");
  const ttf = replied.length ? Math.round(sum(replied.map((i) => minutesBetween(i.sentAt, i.respondedAt!))) / replied.length) : 0;
  const trend = TREND.concat([t.coverage]);
  const tmax = 100, tmin = 88;
  const accounts = s.clients.filter((c) => ACCOUNTS[c.id]).map((c) => ({ c, a: ACCOUNTS[c.id] })).sort((x, y) => y.a.hoursYtd - x.a.hoursYtd);
  const hoursYtd = sum(accounts.map((x) => x.a.hoursYtd));
  const top = accounts.slice(0, 10), others = accounts.slice(10);
  const hmax = Math.max(1, top[0]?.a.hoursYtd || 1);
  const mix = Q.KINDS.map((kd) => ({ label: kd, c: kindVar(kd), n: sum(t.events.filter((e) => Q.kindOf(s, e) === kd).map((e) => Q.eventCoverage(s, e.id).required)) })).filter((x) => x.n);
  const desks = deskRows(s, wk);
  const regions = Q.REGIONS.map((rg) => { const ws = s.workers.filter((w) => (w.region || "Dublin") === rg); return { rg, n: ws.length, active: ws.filter((w) => wk.crewIds.has(w.id)).length }; });
  const rmax = Math.max(1, ...regions.map((r) => r.n));
  const reliable = ps.filter((x) => x.p.shifts90 >= 14 && x.p.noShows === 0 && x.p.lateCancels === 0 && x.p.lates === 0).sort((a, b) => b.p.shifts90 - a.p.shifts90).slice(0, 6);
  return (
    <Page bare>
      <Hero eyebrow={"Executive · all six desks · week of " + fmtDate(zoned(WINDOW.from, "12:00"))} title={<>Fill rate this week is {t.coverageLabel}</>}
        sub={nf(t.confirmed) + " of " + nf(t.required) + " positions confirmed across " + t.events.length + " events, " + t.awaiting + " awaiting a reply and " + nf(t.unfilled) + " still open. The last eleven weeks averaged " + (sum(TREND) / TREND.length).toFixed(1) + "%."}
        aside={<>
          <Ring value={t.coverage} max={100} size={132} stroke={11} tone="ok" label={t.coverageLabel} sub={nf(t.confirmed) + " of " + nf(t.required)} />
          <div className="db-spark" aria-label="Fill rate, last 12 weeks">
            <span className="oss-tiny oss-dim">Last 12 weeks</span>
            <svg viewBox="0 0 220 70" width="220" height="70" aria-hidden="true">
              <polyline fill="none" stroke="var(--ok)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={trend.map((v, i) => (6 + i * (208 / (trend.length - 1))) + "," + (64 - ((v - tmin) / (tmax - tmin)) * 58)).join(" ")} />
              <circle cx={214} cy={64 - ((trend[trend.length - 1] - tmin) / (tmax - tmin)) * 58} r="4" fill="var(--ok)" />
            </svg>
            <span className="oss-tiny oss-muted">{Math.min(...TREND)}% to {Math.max(...TREND)}%</span>
          </div>
        </>}>
        <div className="db-figs">
          <Figure size="sm" label="Positions this week" value={nf(t.required)} sub={t.events.length + " events"} />
          <Figure size="sm" label="Crew working this week" value={nf(wk.crewUsed)} sub={"of " + nf(s.workers.length) + " on the books"} tone="accent" />
          <Figure size="sm" label="Average time to fill" value={fmtHM(ttf)} sub="Offer sent to accepted" />
          <Figure size="sm" label="No-show rate" value={((noShows / Math.max(1, shifts90)) * 100).toFixed(1) + "%"} sub={"90 days · " + nf(noShows) + " of " + nf(shifts90)} tone="bad" />
          <Figure size="sm" label="Late cancellations" value={nf(lateC)} sub="Under 24 hours, 90 days" tone="warn" />
          <Figure size="sm" label="Hours delivered" value={nf(hoursYtd)} sub="Year to date, all clients" tone="ok" />
        </div>
      </Hero>

      <div className="db-ex1">
        <Card title="Hours delivered by client" meta={"Year to date · top 10 of " + accounts.length} icon={I.briefcase}>
          <div className="db-cl">
            {top.map(({ c, a }) => (
              <button key={c.id} className="db-clrow" style={{ ["--c" as any]: hueVar(c.id) }} onClick={() => navigate("Clients", "accounts", { kind: "client", id: c.id })}>
                <span className="nm"><i />{c.name}</span>
                <span className="bar"><i style={{ width: (a.hoursYtd / hmax) * 100 + "%" }} /></span>
                <span className="v">{nf(a.hoursYtd)}h<small>{a.fill12}%</small></span>
              </button>))}
            {others.length > 0 && <div className="db-clrow muted"><span className="nm"><i style={{ background: "var(--neutral)" }} />{others.length} other clients</span><span className="bar"><i style={{ width: (sum(others.map((x) => x.a.hoursYtd)) / hmax) * 100 + "%", background: "var(--neutral)" }} /></span><span className="v">{nf(sum(others.map((x) => x.a.hoursYtd)))}h</span></div>}
          </div>
        </Card>
        <Card title="Mix of work this week" meta="Positions by kind" icon={I.grid}>
          <div className="db-mix">
            <Donut parts={mix}><b>{nf(t.required)}</b><small>positions</small></Donut>
            <div className="db-mixl">{mix.slice().sort((a, b) => b.n - a.n).map((m) => <div key={m.label} style={{ ["--c" as any]: m.c }}><i /><span>{m.label}</span><b>{nf(m.n)}</b><small>{pct(m.n, t.required)}%</small></div>)}</div>
          </div>
        </Card>
      </div>

      <div className="db-ex2">
        <Card title="Desks" meta="This week, every desk side by side" icon={I.list} pad={false}>
          <div className="oss-tw">
            <table className="oss-table db-league">
              <thead><tr><th>Desk</th><th className="num">Events</th><th className="num">Positions</th><th>Fill</th><th className="num">On time</th><th className="num">Approved</th></tr></thead>
              <tbody>{desks.map((r) => (
                <tr key={r.d}>
                  <td><span className="db-dk" style={{ ["--c" as any]: deskVar(r.d) }}><i />{deskShort(r.d)}</span></td>
                  <td className="num">{r.t.events.length}</td>
                  <td className="num">{nf(r.t.required)}</td>
                  <td><span className="db-minibar" style={{ ["--c" as any]: deskVar(r.d) }}><i style={{ width: r.t.coverage + "%" }} /></span><span className="num" style={{ marginLeft: 8, color: r.t.unfilled ? "var(--warn)" : undefined }}>{r.t.coverageLabel}</span></td>
                  <td className="num">{r.onTime === null ? <span className="oss-muted">not yet</span> : r.onTime + "%"}</td>
                  <td className="num">{r.approvedMin ? hrs(r.approvedMin) : <span className="oss-muted">0h</span>}</td>
                </tr>))}</tbody>
            </table>
          </div>
        </Card>
      </div>
      <div className="db-ex3">
        <Card title="Crew pool by region" meta={nf(s.workers.length) + " on the books · " + nf(wk.crewUsed) + " working this week"} icon={I.users}>
          <div className="db-pool">
            <IrelandMap height={250} labels={false} pins={regions.map((r) => ({ id: r.rg, lat: REGION_AT[r.rg][0], lng: REGION_AT[r.rg][1], c: regionVar(r.rg), r: 5 + Math.sqrt(r.n) * 0.9 }))} onPick={() => navigate("Staff", "directory")} />
            <div className="db-poolr">{regions.map((r) => (
              <div key={r.rg} style={{ ["--c" as any]: regionVar(r.rg) }}>
                <span className="nm"><i />{r.rg}</span>
                <span className="bar"><i style={{ width: (r.n / rmax) * 100 + "%" }} /><i className="act" style={{ width: (r.active / rmax) * 100 + "%" }} /></span>
                <b>{nf(r.n)}</b><small>{nf(r.active)} this week</small>
              </div>))}</div>
          </div>
        </Card>
        <Card title="Most reliable crew" meta="14+ shifts in 90 days, no no-shows, no late cancels" icon={I.check} flush>
          <div className="oss-rows">{reliable.map((x) => <Row key={x.w.id} lead={<Av name={x.w.name} size="sm" />} title={x.w.name} sub={<><span className="db-kdot" style={{ ["--c" as any]: regionVar(x.w.region || "Dublin") }} />{x.w.roles[0] + " · " + x.p.shifts90 + " shifts · " + (x.w.region || "Dublin")}</>} end={<St tone="ok">{reliability(x.p)}%</St>} onClick={() => openDrawer("worker", x.w.id)} />)}</div>
        </Card>
      </div>
        <Card title="Fill rate, last 12 weeks" meta="Positions filled of positions booked, every desk" icon={I.chart} pad={false}>
          <div style={{ padding: "8px 20px 18px" }}>
            <svg viewBox="0 0 600 200" width="100%" height="200" role="img" aria-label="Fill rate trend">
              <defs><linearGradient id="db-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--ok)" stopOpacity=".28" /><stop offset="1" stopColor="var(--ok)" stopOpacity="0" /></linearGradient></defs>
              {[88, 92, 96, 100].map((y) => <g key={y}><line x1="34" x2="590" y1={180 - ((y - tmin) / (tmax - tmin)) * 160} y2={180 - ((y - tmin) / (tmax - tmin)) * 160} stroke="var(--border)" /><text x="0" y={184 - ((y - tmin) / (tmax - tmin)) * 160} fontSize="11" fill="var(--faint)">{y}%</text></g>)}
              <polygon fill="url(#db-fill)" points={"40,180 " + trend.map((v, i) => (40 + i * 50) + "," + (180 - ((v - tmin) / (tmax - tmin)) * 160)).join(" ") + " " + (40 + (trend.length - 1) * 50) + ",180"} />
              <polyline fill="none" stroke="var(--ok)" strokeWidth="2.5" strokeLinejoin="round" points={trend.map((v, i) => (40 + i * 50) + "," + (180 - ((v - tmin) / (tmax - tmin)) * 160)).join(" ")} />
              {trend.map((v, i) => <circle key={i} cx={40 + i * 50} cy={180 - ((v - tmin) / (tmax - tmin)) * 160} r={i === trend.length - 1 ? 5 : 3} fill={i === trend.length - 1 ? "var(--accent)" : "var(--ok)"} />)}
            </svg>
            <div className="oss-small oss-dim">This week is still filling: {nf(t.unfilled)} positions open, {t.awaiting} awaiting a reply.</div>
          </div>
        </Card>
    </Page>
  );
}

/* ── year ahead ───────────────────────────────────────────────────────────── */
const MONTHS: [string, string][] = [["Nov", "2026-11"], ["Dec", "2026-12"], ["Jan", "2027-01"], ["Feb", "2027-02"], ["Mar", "2027-03"], ["Apr", "2027-04"], ["May", "2027-05"], ["Jun", "2027-06"], ["Jul", "2027-07"], ["Aug", "2027-08"], ["Sep", "2027-09"], ["Oct", "2027-10"]];
/** Planning forecast (positions per month, every desk). Booked months come from the records. */
const FORECAST: Record<string, number> = { Jan: 1450, Feb: 1600, Mar: 2300, Apr: 2100, May: 2900, Jun: 4600, Jul: 5400, Aug: 6200, Sep: 7100, Oct: 2700 };
/** Expected mix by kind: Concert, Sport, Corporate, Conference, Festival, Exhibition. */
const MIX: Record<string, number[]> = {
  Nov: [0.22, 0.3, 0.16, 0.14, 0.12, 0.06], Dec: [0.22, 0.3, 0.2, 0.06, 0.16, 0.06], Jan: [0.22, 0.25, 0.12, 0.25, 0.04, 0.12], Feb: [0.22, 0.3, 0.12, 0.22, 0.04, 0.1],
  Mar: [0.2, 0.25, 0.1, 0.15, 0.22, 0.08], Apr: [0.24, 0.28, 0.12, 0.18, 0.08, 0.1], May: [0.26, 0.26, 0.12, 0.14, 0.14, 0.08], Jun: [0.3, 0.2, 0.08, 0.08, 0.3, 0.04],
  Jul: [0.32, 0.22, 0.06, 0.05, 0.32, 0.03], Aug: [0.3, 0.2, 0.06, 0.05, 0.36, 0.03], Sep: [0.16, 0.58, 0.08, 0.08, 0.08, 0.02], Oct: [0.26, 0.3, 0.14, 0.18, 0.06, 0.06]
};
function Year({ s }: { s: OssState }) {
  const ryder = s.programmes.find((p) => p.kind === "ryder");
  const pend = Q.pendingDemand(s);
  const firmShifts = s.shifts.filter((x) => firm(Q.eventOf(s, x.eventId)));
  const data = MONTHS.map(([m, ym]) => {
    const booked = Q.KINDS.map((kd) => sum(firmShifts.filter((x) => x.start.slice(0, 7) === ym && Q.kindOf(s, Q.eventOf(s, x.eventId)) === kd).map((x) => x.required)));
    const bt = sum(booked);
    const extraTot = FORECAST[m] !== undefined ? FORECAST[m] : m === "Dec" ? Math.round(bt * 0.22) : m === "Nov" ? pend.positions : 0;
    const extra = MIX[m].map((f) => Math.round(extraTot * f));
    return { m, booked, extra, bt, tot: bt + sum(extra) };
  });
  const max = Math.max(...data.map((d) => d.tot));
  const peak = data.reduce((a, b) => (b.tot > a.tot ? b : a));
  const ahead = s.events.filter((e) => firm(e) && e.date > WINDOW.to).map((e) => ({ e, c: Q.eventCoverage(s, e.id) })).sort((a, b) => b.c.required - a.c.required).slice(0, 6);
  return (
    <Page bare>
      <Hero tone="plain" eyebrow="The year ahead · Nov 2026 to Oct 2027 · every desk" title={<>Peak is {peak.m}{peak.m === "Sep" ? " 2027" : ""}: about {nf(peak.tot)} positions</>}
        sub={"November already has " + nf(data[0].bt) + " positions booked and December " + nf(data[1].bt) + ". The Ryder Cup at Adare Manor needs around " + (ryder?.indicativeWorkers || 850) + " people across build-up and tournament week, on top of a full summer of festivals and stadium shows."}
        aside={<div className="db-yfigs">
          <Figure label="Booked to New Year" value={nf(data[0].bt + data[1].bt)} sub="Positions on the books" tone="accent" />
          <Figure label="Ryder Cup programme" value={"~" + (ryder?.indicativeWorkers || 850)} sub="People, Sep 2027" tone="ok" />
          <Figure label="Crew on the books" value={nf(s.workers.filter((w) => w.status === "active").length)} sub="Registered and cleared" />
        </div>}>
        <div className="db-miles">
          {([["Jan", "Platform live, recruitment opens"], ["Mar", "St Patrick's festival"], ["Jun", "Summer season, Stamp 2 at 40h"], ["Aug", "Ryder Cup build-up"], ["Sep", "Tournament week"]] as [string, string][]).map(([m, l]) => <span key={m} className="db-mile"><b>{m}</b>{l}</span>)}
        </div>
      </Hero>
      <Card title="Positions by month" meta="Solid is booked, pale is the planning forecast, coloured by kind of work" icon={I.chart} pad={false}
        right={<div className="db-legend">{Q.KINDS.map((k) => <span key={k} style={{ ["--c" as any]: kindVar(k) }}><i />{k}</span>)}</div>}>
        <div className="db-year">
          {data.map((d) => (
            <div key={d.m} className={"db-ycol" + (d.m === peak.m ? " peak" : "")}>
              <span className="num">{nf(d.tot)}</span>
              <span className="db-ystack" style={{ height: Math.max(4, (d.tot / max) * 210) + "px" }}>
                {Q.KINDS.map((kd, i) => d.booked[i] > 0 && <i key={"b" + kd} style={{ height: (d.booked[i] / d.tot) * 100 + "%", background: kindVar(kd) }} />)}
                {Q.KINDS.map((kd, i) => d.extra[i] > 0 && <i key={"f" + kd} className="fc" style={{ height: (d.extra[i] / d.tot) * 100 + "%", backgroundColor: kindVar(kd) }} />)}
              </span>
              <span className="lab">{d.m}</span>
            </div>))}
        </div>
      </Card>
      <div className="oss-gap" />
      <div className="db-yr">
        <Card title="Biggest bookings ahead" meta="After this week, by positions" icon={I.cal} flush>
          <div className="oss-rows">
            {ahead.map(({ e, c }) => <Row key={e.id} lead={<span className="db-datebox" style={{ ["--c" as any]: kindVar(Q.kindOf(s, e)) }}><b>{fmtDate(zoned(e.date, "12:00")).split(" ")[1]}</b><small>{fmtDate(zoned(e.date, "12:00")).split(" ")[2]}</small></span>}
              title={short(e)} sub={<><Tag c={kindVar(Q.kindOf(s, e))}>{Q.kindOf(s, e)}</Tag> {Q.clientOf(s, e.clientId).name}</>} end={<span className="num">{nf(c.confirmed)}/{nf(c.required)}</span>} onClick={() => navigate("Events", "upcoming", { kind: "event", id: e.id })} />)}
          </div>
        </Card>
        <Card title="Ryder Cup 2027" meta="Programme planning" icon={I.hat}>
          <div className="oss-small" style={{ lineHeight: 1.6, color: "var(--body)" }}>800 to 900 staff across the build-up and tournament week, most from Limerick and Munster. The platform needs to be live in January so recruitment, documents and availability are in place well before.</div>
          <div className="oss-pills" style={{ marginTop: 12 }}><span className="oss-pill">Recruitment from Jan</span><span className="oss-pill">Build-up Aug</span><span className="oss-pill">Tournament Sep</span></div>
          <div style={{ marginTop: 14 }}><Btn size="sm" onClick={() => navigate("Recruitment", "ryder")}>Open the plan</Btn></div>
        </Card>
        <Card title="Pending bookings" meta="Not yet confirmed by the client" icon={I.clock} flush>
          <div className="oss-rows">
            {pend.events.map((e) => <Row key={e.id} lead={<RIcon d={I.cal} />} title={e.name} sub={Q.clientOf(s, e.clientId).name + " · " + fmtDate(zoned(e.date, "12:00"))} end={<span className="num">~{e.indicativePositions}</span>} onClick={() => navigate("Events", "upcoming", { kind: "event", id: e.id })} />)}
            {!pend.events.length && <div className="oss-empty"><b>Nothing pending</b></div>}
          </div>
        </Card>
      </div>
    </Page>
  );
}
