/* Calendar: every booking, pending job, induction and key date. Month is the
   grid with a day panel underneath; Week is a real time grid (shifts placed by
   their hours, crew needed against crew free in each column head); Season is
   the year's demand curve with what drives it. */

import "../../styles/oss-events.css";
import { useMemo, useState } from "react";
import type { EventBooking, OssState, Shift } from "../model";
import * as Q from "../selectors";
import { navigate, useOss } from "../store";
import { tabOf } from "../modules";
import { addDays, dayKey, fmtDate, fmtDateLong, fmtTime, ms, weekday, zoned } from "../time";
import { Btn, Card, Cov, I, Icon, Page, Ribbon, St, Tag, kindVar, toneVar } from "../ui/kit";
import { DESKS } from "../network";
import { DeskTag, DESK_SHORT, deskC } from "./Events";

export default function CalendarPage() {
  const s = useOss();
  const tab = tabOf(s, "Calendar");
  if (tab === "week") return <Week s={s} />;
  if (tab === "season") return <Season s={s} />;
  return <Month s={s} />;
}

const KEY_DATES: Record<string, string> = { "2026-11-27": "Payroll cut-off, 12:00", "2026-12-15": "Stamp 2 holiday hours start" };
const open = (id: string) => navigate("Events", "upcoming", { kind: "event", id });
const short = (name: string) => name.split(":")[0];
const hm = (a: string, b: string) => fmtTime(a) + "-" + fmtTime(b);

function stateOf(s: OssState, x: Shift): "done" | "full" | "gap" | "await" | "pending" | "live" {
  const e = Q.eventOf(s, x.eventId);
  if (e.status === "pending") return "pending";
  if (e.historical || ms(s.clock) > ms(x.end)) return "done";
  if (ms(s.clock) >= ms(x.start)) return "live";
  const c = Q.shiftCoverage(s, x.id);
  return c.unfilled === 0 ? "full" : c.notInvited > 0 ? "gap" : "await";
}

/* ── month ───────────────────────────────────────────────────────────────── */
interface DayInfo { shifts: Shift[]; events: EventBooking[]; req: number; conf: number }
/** One pass over every shift: which events touch each day and how many crew it needs. */
function dayIndex(s: OssState, desk: string): Map<string, DayInfo> {
  const m = new Map<string, DayInfo>();
  for (const x of s.shifts) {
    const e = Q.eventOf(s, x.eventId);
    if (e.status === "cancelled" || (desk !== "all" && Q.deskOf(e) !== desk)) continue;
    const d = dayKey(x.start);
    const r = m.get(d) || { shifts: [], events: [], req: 0, conf: 0 };
    r.shifts.push(x);
    if (!r.events.includes(e)) r.events.push(e);
    if (e.status === "confirmed") { r.req += x.required; r.conf += Q.shiftCoverage(s, x.id).confirmed; }
    m.set(d, r);
  }
  return m;
}
function dayTone(s: OssState, d: string, r: DayInfo): "ok" | "accent" | "warn" | "neutral" {
  if (!r.req) return "neutral";
  if (d < dayKey(s.clock)) return "neutral";
  const p = r.conf / r.req, days = (ms(zoned(d, "12:00")) - ms(s.clock)) / 864e5;
  if (p >= 0.98) return "ok";
  return days < 7 && p < 0.9 ? "warn" : "accent";
}
function Month({ s }: { s: OssState }) {
  const [month, setMonth] = useState(dayKey(s.clock).slice(0, 7));
  const [day, setDay] = useState<string>(dayKey(s.clock));
  const [desk, setDesk] = useState<string>("all");
  const [y, m] = month.split("-").map(Number);
  const first = month + "-01";
  const lead = (weekday(zoned(first, "12:00")) + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = dayKey(s.clock);
  const cells = Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => addDays(first, i - lead));
  const idx = useMemo(() => dayIndex(s, desk), [s, desk]);
  const inds = (k: string) => s.ext.inductions.filter((i) => dayKey(i.at) === k);
  const shift = (n: number) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); };
  const title = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-IE", { month: "long", year: "numeric", timeZone: "UTC" });
  const inMonth = Array.from(idx.entries()).filter(([k]) => k.startsWith(month));
  const monthEvs = Array.from(new Set(inMonth.flatMap(([, r]) => r.events)));
  const conf = monthEvs.filter((e) => e.status === "confirmed");
  const req = inMonth.reduce((n, [, r]) => n + r.req, 0), cf = inMonth.reduce((n, [, r]) => n + r.conf, 0);
  const busiest = inMonth.slice().sort((a, b) => b[1].req - a[1].req)[0];
  const peak = Math.max(1, ...inMonth.map(([, r]) => r.req));
  const gaps = conf.filter((e) => !e.historical && Q.eventPhase(s, e) !== "completed" && Q.eventCoverage(s, e.id).unfilled > 0).length;
  const cut = Object.keys(KEY_DATES).find((k) => k.startsWith(month) && KEY_DATES[k].startsWith("Payroll"));
  const order = (r: DayInfo) => r.events.slice().sort((a, b) => {
    const ca = Q.eventCoverage(s, a.id), cb = Q.eventCoverage(s, b.id);
    return Number(cb.unfilled > 0 && cb.notInvited > 0) - Number(ca.unfilled > 0 && ca.notInvited > 0) || cb.required - ca.required;
  });
  return (
    <Page eyebrow="Calendar · month" title={title} sub="Every desk's bookings, pending jobs, inductions and the dates payroll and compliance care about. Pick a day to see all of its shifts."
      actions={<><button className="oss-iconbtn" onClick={() => shift(-1)} aria-label="Previous month"><Icon d={I.back} size={14} /></button><Btn size="sm" onClick={() => { setMonth(today.slice(0, 7)); setDay(today); }}>Today</Btn><button className="oss-iconbtn" onClick={() => shift(1)} aria-label="Next month"><Icon d={I.chevron} size={14} /></button><Btn kind="primary" icon={I.plus} onClick={() => navigate("Events", "upcoming", { kind: "new", id: "booking" })}>New booking</Btn></>}>
      <div className="cal-strip">
        <Ribbon items={[
          { label: "Booked events", value: conf.length, sub: monthEvs.filter((e) => e.status === "pending").length + " pending with the client" },
          { label: "Crew positions", value: req.toLocaleString("en-IE"), sub: req ? Math.round((cf / req) * 100) + "% confirmed so far" : "Nothing booked", tone: req && cf / req < 0.6 ? "warn" : undefined },
          { label: "Busiest day", value: busiest ? fmtDate(zoned(busiest[0], "12:00")).split(" ").slice(0, 2).join(" ") : "-", sub: busiest ? busiest[1].req.toLocaleString("en-IE") + " crew across " + busiest[1].events.length + " events" : "", onClick: busiest ? () => setDay(busiest[0]) : undefined },
          { label: "Still filling", value: gaps, sub: "Upcoming with gaps", tone: gaps ? "warn" : undefined },
          { label: "Inductions", value: s.ext.inductions.filter((i) => i.at.startsWith(month)).length, sub: "New crew coming through" },
          { label: "Payroll cut-off", value: cut ? fmtDate(zoned(cut, "12:00")) : "None", sub: cut ? "Approved hours to Bullhorn" : "This month", tone: cut ? "urgent" : undefined }
        ]} />
      </div>
      <div className="nx-filters">
        <div className="row chips" aria-label="Desk">
          <button className={"nx-chip" + (desk === "all" ? " on" : "")} onClick={() => setDesk("all")}>All desks</button>
          {DESKS.map((d) => <button key={d} className={"nx-chip" + (desk === d ? " on" : "")} onClick={() => setDesk(desk === d ? "all" : d)}><i style={{ background: deskC(d) }} />{DESK_SHORT[d]}</button>)}
        </div>
      </div>
      <Card pad={false}>
        <div className="oss-cal cal-big nx-cal">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="dow">{d}</div>)}
          {cells.map((k) => { const r = idx.get(k); const evs = r ? order(r) : []; const tone = r ? dayTone(s, k, r) : "neutral"; return (
            <div key={k} className={["cal-cell", k === today && "today", k.slice(0, 7) !== month && "out", k === day && "picked"].filter(Boolean).join(" ")}>
              <div className="nx-cd">
                <button className="cal-d" onClick={() => setDay(k)} aria-label={"Show " + fmtDateLong(zoned(k, "12:00"))}>{Number(k.slice(8))}{k === today && <span>Today</span>}</button>
                {r && r.req > 0 && <span className="nx-crew">{r.req.toLocaleString("en-IE")}</span>}
              </div>
              {evs.slice(0, 3).map((e) => { const c = Q.sumCov(r!.shifts.filter((x) => x.eventId === e.id).map((x) => Q.shiftCoverage(s, x.id))); const ph = e.historical ? "completed" : Q.eventPhase(s, e); return (
                <button key={e.id} className={"nx-evb" + (e.status === "pending" ? " pending" : ph === "completed" ? " done" : c.notInvited > 0 ? " gap" : "")} style={{ ["--k" as any]: kindVar(Q.kindOf(s, e)) }} onClick={() => open(e.id)} title={e.name + (e.status === "confirmed" ? ", " + c.confirmed + "/" + c.required : ", pending")}>
                  <span className="t">{short(e.name)}</span>{e.status === "confirmed" && !e.historical && <span className="n">{c.confirmed}/{c.required}</span>}
                </button>); })}
              {evs.length > 3 && <button className="nx-plus" onClick={() => setDay(k)}>+{evs.length - 3} more</button>}
              {inds(k).map((i) => <button key={i.id} className="cal-ind" onClick={() => navigate("Recruitment", "inductions")} title={i.kind + ", " + i.place}><Icon d={I.users} size={11} />{i.kind.replace(" induction", "").replace("Ryder Cup 2027 open day", "Ryder Cup open day")}</button>)}
              {KEY_DATES[k] && <div className={"cal-key" + (KEY_DATES[k].startsWith("Payroll") ? " urgent" : "")}>{KEY_DATES[k]}</div>}
              {r && r.req > 0 && <span className="nx-heat" title={r.conf + " of " + r.req + " confirmed"}><i style={{ width: Math.max(8, (r.req / peak) * 100) + "%", background: toneVar(tone === "neutral" ? "neutral" : tone) }} /></span>}
            </div>); })}
        </div>
        <div className="oss-legend cal-legend nx-legend">
          {Q.KINDS.map((k) => <span key={k}><i style={{ background: kindVar(k) }} />{k}</span>)}
          <span className="sep" />
          <span><i style={{ background: "var(--ok)" }} />Day fully crewed</span><span><i style={{ background: "var(--accent)" }} />Filling on plan</span><span><i style={{ background: "var(--warn)" }} />Behind for this close</span><span><i style={{ border: "1px dashed var(--border-strong)", background: "none" }} />Pending</span>
        </div>
      </Card>
      <DayPanel s={s} day={day} desk={desk} />
    </Page>
  );
}

function DayPanel({ s, day, desk }: { s: OssState; day: string; desk: string }) {
  const shifts = s.shifts.filter((x) => dayKey(x.start) === day && Q.eventOf(s, x.eventId).status !== "cancelled" && (desk === "all" || Q.deskOf(Q.eventOf(s, x.eventId)) === desk)).sort((a, b) => ms(a.start) - ms(b.start));
  const inds = s.ext.inductions.filter((i) => dayKey(i.at) === day);
  const firm = shifts.filter((x) => Q.eventOf(s, x.eventId).status === "confirmed");
  const need = firm.reduce((n, x) => n + x.required, 0);
  const conf = firm.reduce((n, x) => n + Q.shiftCoverage(s, x.id).confirmed, 0);
  const byKind = Q.KINDS.map((k) => [k, firm.filter((x) => Q.kindOf(s, Q.eventOf(s, x.eventId)) === k).reduce((n, x) => n + x.required, 0)] as [string, number]).filter(([, n]) => n);
  const events = new Set(shifts.map((x) => x.eventId)).size;
  return (
    <section className="cal-day">
      <div className="cal-day-h">
        <div><span className="oss-eyebrow">{day === dayKey(s.clock) ? "Today" : "Selected day"}</span><h2>{fmtDateLong(zoned(day, "12:00"))}</h2></div>
        <span className="grow" />
        {need > 0 && <div className="nx-daysum">
          <span><b>{need.toLocaleString("en-IE")}</b> crew needed</span><span><b>{conf.toLocaleString("en-IE")}</b> confirmed</span><span><b>{events}</b> event{events === 1 ? "" : "s"}</span>
          <span className="nx-mixbar" title={byKind.map(([k, n]) => k + " " + n).join(", ")}>{byKind.map(([k, n]) => <i key={k} style={{ flexGrow: n, background: kindVar(k) }} />)}</span>
        </div>}
      </div>
      <div className="cal-day-list">
        {shifts.map((x) => { const e = Q.eventOf(s, x.eventId); const st = stateOf(s, x); const kind = Q.kindOf(s, e); return (
          <button key={x.id} className={"cal-day-row nx-dayrow " + st} onClick={() => open(e.id)}>
            <span className="tm"><b>{fmtTime(x.start)}</b><span>{fmtTime(x.end)}</span></span>
            <span className="bar" style={{ background: st === "pending" ? undefined : kindVar(kind) }} />
            <span className="tx"><b>{short(e.name)}</b><span>{x.label} · {Q.venueOf(s, e.venueId)?.name || "Venue to confirm"}</span></span>
            <span className="nx-dtags"><Tag c={kindVar(kind)} dot={false}>{kind}</Tag><DeskTag desk={Q.deskOf(e)} /></span>
            <span className="cv">{e.status === "pending" ? <St tone="neutral">Pending</St> : <Cov c={Q.shiftCoverage(s, x.id)} compact />}</span>
          </button>); })}
        {inds.map((i) => <button key={i.id} className="cal-day-row nx-dayrow ind" onClick={() => navigate("Recruitment", "inductions")}><span className="tm"><b>{fmtTime(i.at)}</b><span /></span><span className="bar" /><span className="tx"><b>{i.kind}</b><span>{i.place}</span></span><span className="nx-dtags" /><span className="cv"><St tone="ok">{s.ext.applicants.filter((a) => a.inductionId === i.id && a.stage === "induction").length}/{i.capacity} booked</St></span></button>)}
        {KEY_DATES[day] && <div className="cal-day-row nx-dayrow key"><span className="tm"><b>{KEY_DATES[day].startsWith("Payroll") ? "12:00" : "All day"}</b><span /></span><span className="bar" /><span className="tx"><b>{KEY_DATES[day]}</b><span>{KEY_DATES[day].startsWith("Payroll") ? "Approved hours must be in Bullhorn" : "Students can work up to 40 hours a week"}</span></span><span className="nx-dtags" /></div>}
        {!shifts.length && !inds.length && !KEY_DATES[day] && <div className="oss-small oss-dim" style={{ padding: "10px 4px" }}>Nothing booked on this day.</div>}
      </div>
    </section>
  );
}

/* ── week: a time grid ────────────────────────────────────────────────────── */
const H0 = 6, H1 = 24, HPX = 42, LANE_W = 92;
const hourNum = (iso: string) => { const [h, mm] = fmtTime(iso).split(":").map(Number); return h + mm / 60; };
/** Crew who said they're free 09:00 to 21:00 that day; only people with a matching rule or exception are checked. */
function freeOn(s: OssState, d: string): number {
  const wd = weekday(zoned(d, "12:00"));
  const ids = new Set<string>();
  for (const r of s.availRules) if (r.weekday === wd) ids.add(r.workerId);
  for (const x of s.availExceptions) if (x.kind === "available" && dayKey(x.start) <= d && dayKey(x.end) >= d) ids.add(x.workerId);
  let n = 0; ids.forEach((id) => { if (Q.availability(s, id, zoned(d, "09:00"), zoned(d, "21:00")).state === "available") n++; });
  return n;
}
function Week({ s }: { s: OssState }) {
  const base = dayKey(s.clock) < "2026-11-12" ? "2026-11-12" : dayKey(s.clock) > "2026-11-18" ? dayKey(s.clock) : "2026-11-12";
  const [start, setStart] = useState(base);
  const [desk, setDesk] = useState<string>("all");
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = dayKey(s.clock);
  const free = useMemo(() => new Map(days.map((d) => [d, freeOn(s, d)])), [s.availRules, s.availExceptions, start]);
  const data = days.map((d) => {
    const shifts = s.shifts.filter((x) => dayKey(x.start) === d && Q.eventOf(s, x.eventId).status !== "cancelled" && (desk === "all" || Q.deskOf(Q.eventOf(s, x.eventId)) === desk)).sort((a, b) => ms(a.start) - ms(b.start) || ms(b.end) - ms(a.end));
    const booked = shifts.filter((x) => Q.eventOf(s, x.eventId).status === "confirmed");
    const need = booked.reduce((n, x) => n + x.required, 0);
    const conf = booked.reduce((n, x) => n + Q.shiftCoverage(s, x.id).confirmed, 0);
    const avail = free.get(d) || 0;
    const ends: number[] = [];
    const placed = shifts.map((x) => {
      const a = Math.max(H0, Math.min(H1, hourNum(x.start)));
      const b = dayKey(x.end) !== d ? H1 : Math.max(a + 0.5, Math.min(H1, hourNum(x.end)));
      let lane = ends.findIndex((e) => e <= a);
      if (lane < 0) { lane = ends.length; ends.push(b); } else ends[lane] = b;
      return { x, a, b, lane };
    });
    return { d, need, conf, avail, placed, lanes: Math.max(1, ends.length) };
  });
  const maxBar = Math.max(1, ...data.map((x) => Math.max(x.need - x.conf, x.avail)));
  const nowH = hourNum(s.clock);
  const weekNeed = data.reduce((n, x) => n + x.need, 0), weekConf = data.reduce((n, x) => n + x.conf, 0);
  const cols = "50px " + data.map((x) => "minmax(" + Math.max(118, x.lanes * LANE_W) + "px," + Math.max(1, x.lanes) + "fr)").join(" ");
  return (
    <Page eyebrow={"Calendar · week of " + fmtDate(zoned(start, "12:00"))} title="The week, hour by hour" sub="Every shift where it sits in the day, coloured by the kind of work. Busy days get wider so nothing overlaps. Column heads show open positions against crew who are still free that day."
      actions={<><button className="oss-iconbtn" onClick={() => setStart(addDays(start, -7))} aria-label="Previous week"><Icon d={I.back} size={14} /></button><Btn size="sm" onClick={() => setStart(base)}>This week</Btn><button className="oss-iconbtn" onClick={() => setStart(addDays(start, 7))} aria-label="Next week"><Icon d={I.chevron} size={14} /></button></>}>
      <div className="nx-filters">
        <div className="row chips" aria-label="Desk">
          <button className={"nx-chip" + (desk === "all" ? " on" : "")} onClick={() => setDesk("all")}>All desks</button>
          {DESKS.map((d) => <button key={d} className={"nx-chip" + (desk === d ? " on" : "")} onClick={() => setDesk(desk === d ? "all" : d)}><i style={{ background: deskC(d) }} />{DESK_SHORT[d]}</button>)}
        </div>
      </div>
      <div className="wk-meta">
        <span><b>{weekConf.toLocaleString("en-IE")}</b> of <b>{weekNeed.toLocaleString("en-IE")}</b> positions confirmed this week</span>
        <div className="oss-legend">{Q.KINDS.map((k) => <span key={k}><i style={{ background: kindVar(k) }} />{k}</span>)}<span><i style={{ background: "var(--warn-soft)", border: "1px solid var(--warn)" }} />Still to offer</span><span><i style={{ border: "1px dashed var(--border-strong)" }} />Pending</span></div>
      </div>
      <Card pad={false}>
        <div className="wk-scroll">
          <div className="wk" style={{ gridTemplateColumns: cols }}>
            <div className="wk-corner" />
            {data.map((x) => { const open2 = Math.max(0, x.need - x.conf); const short2 = open2 > x.avail; return (
              <div key={x.d} className={"wk-head" + (x.d === today ? " today" : "")}>
                <div className="dd"><b>{Number(x.d.slice(8))}</b><span>{fmtDate(zoned(x.d, "12:00")).split(" ")[0]}</span>{x.placed.length > 0 && <span className="nx-wkn">{x.placed.length} shifts</span>}{short2 && <St tone="warn">Tight</St>}</div>
                <div className="nf"><span><b>{x.need.toLocaleString("en-IE")}</b> needed, <b style={{ color: open2 ? "var(--warn)" : "var(--ok)" }}>{open2}</b> open</span><span><b>{x.avail}</b> still free</span></div>
                <div className="nfbar"><i className="n" style={{ width: (open2 / maxBar) * 100 + "%", background: short2 ? "var(--bad)" : "var(--warn)" }} /><i className="f" style={{ width: (x.avail / maxBar) * 100 + "%" }} /></div>
              </div>); })}
            <div className="wk-hours" style={{ height: (H1 - H0) * HPX }}>
              {Array.from({ length: H1 - H0 }, (_, i) => <span key={i} style={{ top: i * HPX }}>{String(H0 + i).padStart(2, "0")}:00</span>)}
            </div>
            {data.map((x) => (
              <div key={x.d} className={"wk-col" + (x.d === today ? " today" : "")} style={{ height: (H1 - H0) * HPX }}>
                {Array.from({ length: H1 - H0 }, (_, i) => <i key={i} className="hl" style={{ top: i * HPX }} />)}
                {x.placed.map(({ x: sh, a, b, lane }) => {
                  const e = Q.eventOf(s, sh.eventId); const c = Q.shiftCoverage(s, sh.id); const st = stateOf(s, sh); const h = (b - a) * HPX;
                  return (
                    <button key={sh.id} className={"wk-blk nx-blk " + st + (h < 64 ? " tight" : "")} onClick={() => open(sh.eventId)} title={e.name + ", " + sh.label + " " + hm(sh.start, sh.end) + ", " + c.confirmed + "/" + c.required + " confirmed, " + Q.deskOf(e)}
                      style={{ ["--k" as any]: kindVar(Q.kindOf(s, e)), top: (a - H0) * HPX + 1, height: h - 2, left: "calc(" + (lane / x.lanes) * 100 + "% + 3px)", width: "calc(" + 100 / x.lanes + "% - 6px)" }}>
                      <b>{short(e.name)}</b>
                      <span>{sh.label} · {hm(sh.start, sh.end)}</span>
                      {e.status !== "pending" && <span className="cv">{c.confirmed}/{c.required}{c.awaiting ? " · " + c.awaiting + " awaiting" : ""}</span>}
                    </button>);
                })}
                {x.d === today && nowH >= H0 && nowH <= H1 && <i className="wk-now" style={{ top: (nowH - H0) * HPX }}><span>{fmtTime(s.clock)}</span></i>}
              </div>))}
          </div>
        </div>
      </Card>
    </Page>
  );
}

/* ── season ──────────────────────────────────────────────────────────────── */
const SEASON: { m: string; level: number; items: string[] }[] = [
  { m: "Nov", level: 2, items: ["Arena concerts", "Autumn rugby internationals", "Corporate Christmas build-up"] },
  { m: "Dec", level: 3, items: ["Christmas parties", "Arena shows", "Stamp 2 40h from 15 Dec"] },
  { m: "Jan", level: 1, items: ["Platform go-live", "TeamTrack crew migrated", "Ryder Cup recruitment opens"] },
  { m: "Feb", level: 2, items: ["Six Nations at the Aviva", "Limerick inductions"] },
  { m: "Mar", level: 2, items: ["St Patrick's festival", "Six Nations"] },
  { m: "Apr", level: 2, items: ["Conferences", "Arena tours"] },
  { m: "May", level: 3, items: ["Outdoor season starts", "Cup finals"] },
  { m: "Jun", level: 4, items: ["Stadium concerts", "Festivals", "Stamp 2 40h from June"] },
  { m: "Jul", level: 4, items: ["Festivals", "All-Ireland finals, Croke Park"] },
  { m: "Aug", level: 5, items: ["Festival peak", "Electric Picnic", "Ryder Cup build-up at Adare"] },
  { m: "Sep", level: 5, items: ["Ryder Cup 2027, Adare Manor", "Stamp 2 back to 20h from October"] },
  { m: "Oct", level: 2, items: ["Indoor season", "Debrief and payroll close-out"] }
];
const LEVEL = ["", "Quiet", "Steady", "Busy", "Very busy", "Peak"];
/** Typical mix of work by month, as a share of crew hours (planning figures). */
const MIX: Record<string, number[]> = { // Concert, Sport, Corporate, Conference, Festival, Exhibition
  Jan: [20, 25, 15, 25, 0, 15], Feb: [20, 45, 10, 15, 0, 10], Mar: [20, 35, 10, 15, 15, 5], Apr: [30, 25, 15, 20, 0, 10], May: [30, 30, 10, 10, 15, 5], Jun: [40, 20, 5, 5, 25, 5],
  Jul: [35, 25, 5, 5, 30, 0], Aug: [30, 15, 5, 5, 45, 0], Sep: [15, 60, 5, 5, 15, 0], Oct: [30, 25, 15, 15, 5, 10], Nov: [30, 30, 20, 10, 5, 5], Dec: [25, 25, 35, 5, 10, 0] };
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function Season({ s }: { s: OssState }) {
  const now = new Date(s.clock).toLocaleDateString("en-IE", { month: "short", timeZone: "UTC" }).slice(0, 3);
  const [pick, setPick] = useState<string>(now);
  const cur = SEASON.find((x) => x.m === pick) || SEASON[0];
  const booked = useMemo(() => {
    const out: Record<string, { req: number; conf: number; events: number }> = {}; const seen = new Set<string>();
    for (const x of s.shifts) { const e = Q.eventOf(s, x.eventId); if (e.status !== "confirmed") continue; const mo = MONTHS[Number(dayKey(x.start).slice(5, 7)) - 1]; const r = out[mo] || (out[mo] = { req: 0, conf: 0, events: 0 }); r.req += x.required; r.conf += Q.shiftCoverage(s, x.id).confirmed; if (!seen.has(mo + e.id)) { seen.add(mo + e.id); r.events++; } }
    return out;
  }, [s]);
  return (
    <Page eyebrow="Calendar · season" title="The year at OSS events" sub="Busy all year, very busy in summer, and the Ryder Cup on top in 2027. Taller months need more crew, so recruitment and inductions run ahead of them.">
      <div className="oss-legend nx-seasonlg">{Q.KINDS.map((k) => <span key={k}><i style={{ background: kindVar(k) }} />{k}</span>)}</div>
      <Card pad={false}>
        <div className="ss-curve">
          {SEASON.map((x) => (
            <button key={x.m} className={"ss-col l" + x.level + (x.m === pick ? " on" : "") + (x.m === now ? " now" : "")} onClick={() => setPick(x.m)} aria-label={x.m + ": " + LEVEL[x.level]}>
              <span className="lv">{LEVEL[x.level]}</span>
              <span className="track nx-track"><span className="stack" style={{ height: x.level * 20 + "%" }}>{Q.KINDS.map((k, i) => MIX[x.m][i] ? <i key={k} style={{ flexGrow: MIX[x.m][i], background: kindVar(k) }} /> : null)}</span></span>
              <b>{x.m}</b>
              {x.m === now && <span className="tag">Now</span>}
              {x.m === "Sep" && <span className="tag pk">Ryder Cup</span>}
            </button>))}
        </div>
      </Card>
      <div className="ss-detail">
        <section className="ss-month">
          <span className="oss-eyebrow">{LEVEL[cur.level]}</span>
          <h2>{cur.m === now ? "This month" : new Date(Date.UTC(2026, ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].indexOf(cur.m), 15)).toLocaleDateString("en-IE", { month: "long", timeZone: "UTC" })}</h2>
          <ul>{cur.items.map((i) => <li key={i}>{i}</li>)}</ul>
          <div className="nx-mixlist">{Q.KINDS.map((k, i) => MIX[cur.m][i] ? <div key={k}><span className="nm"><i style={{ background: kindVar(k) }} />{k}</span><span className="bar"><i style={{ width: MIX[cur.m][i] + "%", background: kindVar(k) }} /></span><b>{MIX[cur.m][i]}%</b></div> : null)}</div>
          {booked[cur.m] && <div className="nx-booked"><b>{booked[cur.m].req.toLocaleString("en-IE")}</b> positions already booked, <b>{booked[cur.m].events}</b> events, {Math.round((booked[cur.m].conf / Math.max(1, booked[cur.m].req)) * 100)}% confirmed</div>}
        </section>
        <div className="ss-list">
          {SEASON.map((x) => (
            <button key={x.m} className={"ss-row" + (x.m === pick ? " on" : "")} onClick={() => setPick(x.m)}>
              <b>{x.m}</b>
              <span className="dots">{[1, 2, 3, 4, 5].map((k) => <i key={k} className={k <= x.level ? "f" : ""} />)}</span>
              <span className="it">{booked[x.m] ? <b className="nx-bk">{booked[x.m].req.toLocaleString("en-IE")} booked</b> : null}{x.items.join(", ")}</span>
            </button>))}
        </div>
      </div>
    </Page>
  );
}
