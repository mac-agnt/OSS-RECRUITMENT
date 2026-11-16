/* Events: every client booking, its shifts and how full each one is.
   Upcoming reads as an agenda (day rail on the left, each event with its shifts,
   role mix, team leader and the one thing to do next). An event opens as its own
   page under a hero with the live fill. Bookings is a board by stage, and call
   sheets read like the printed sheet the supervisor carries. */

import "../../styles/oss-events.css";
import { useMemo, useState } from "react";
import type { DocType, EventBooking, OssState, Shift } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { docLabel } from "../seed";
import { navigate, openDrawer, run, setUi, useOss } from "../store";
import { tabOf } from "../modules";
import { addDays, dayKey, fmtDate, fmtDateLong, fmtDayMonth, fmtTime, ms, weekday, zoned } from "../time";
import { Av, Btn, Card, Chip, Cov, Drawer, Faces, Field, I, Icon, KV, Meter, Page, PPE, Ring, Row, RIcon, S, Search, Seats, Section, Seg, St, Tag, TimeSelect, kindVar, regionVar, toneVar } from "../ui/kit";
import { DESKS } from "../network";
import { ACCOUNTS, CALL_SHEETS, kitMove, profile, roleMix } from "../industry";
import { fmtHM } from "../time";
import { AuditList, ShiftTimeEditor } from "../ui/drawers";

export default function Events() {
  const s = useOss();
  const tab = tabOf(s, "Events");
  const f = s.ui.focus;
  const creating = f?.kind === "new";
  const close = () => setUi({ focus: null });
  const create = <Btn kind="primary" icon={I.plus} onClick={() => setUi({ focus: { kind: "new", id: "booking" } })}>New booking</Btn>;
  const body = f?.kind === "event" && Q.eventOf(s, f.id) ? <EventPage key={f.id} s={s} e={Q.eventOf(s, f.id)} />
    : tab === "bookings" ? <Bookings s={s} action={create} /> : tab === "callsheets" ? <CallSheets s={s} /> : <Upcoming s={s} action={create} />;
  return <>{body}{creating && <CreateBooking s={s} close={close} />}</>;
}

type View = "staffing" | "callsheet" | "roles" | "kit" | "hours" | "history";
/* Set just before opening an event, so "Call sheet" lands on the call sheet. */
let nextView: View | null = null;
const open = (id: string, view?: View) => { nextView = view || null; navigate("Events", undefined, { kind: "event", id }); };
const short = (e: EventBooking) => e.name.split(":")[0];
const rest = (e: EventBooking) => e.name.split(":").slice(1).join(":").trim();
const code = (s: OssState, clientId: string) => { const c = ACCOUNTS[clientId]?.code; return c && c !== "-" ? c.split("-")[1] : Q.clientOf(s, clientId).name.split(" ")[0].toUpperCase(); };
const hm = (a: string, b: string) => fmtTime(a) + "-" + fmtTime(b);
/* Desk colours: one fixed hue each, shared by Events, Calendar, Staffing and Timesheets. */
export const DESK_C: Record<string, string> = { "Dublin events desk": "var(--k-4)", "Stadia and sport desk": "var(--k-2)", "Live music and theatre desk": "var(--k-1)", "Corporate and hospitality desk": "var(--k-3)", "Cork and Munster desk": "var(--k-6)", "West and North desk": "var(--k-5)" };
export const DESK_SHORT: Record<string, string> = { "Dublin events desk": "Dublin events", "Stadia and sport desk": "Stadia and sport", "Live music and theatre desk": "Live music", "Corporate and hospitality desk": "Corporate", "Cork and Munster desk": "Cork and Munster", "West and North desk": "West and North" };
export const deskC = (d: string) => DESK_C[d] || "var(--k-4)";
/** A desk reads as a quiet label with a coloured dot; the kind of work owns the strong colour. */
export function DeskTag({ desk }: { desk: string }) { return <span className="nx-desk" title={desk}><i style={{ background: deskC(desk) }} />{DESK_SHORT[desk] || desk}</span>; }
const span = (s: OssState, e: EventBooking): [string, string] | null => {
  const sh = Q.shiftsOfEvent(s, e.id);
  if (!sh.length) return null;
  const a = sh.reduce((m, x) => (ms(x.start) < ms(m) ? x.start : m), sh[0].start);
  const b = sh.reduce((m, x) => (ms(x.end) > ms(m) ? x.end : m), sh[0].end);
  return [a, b];
};
const crewOf = (s: OssState, e: EventBooking) => Q.shiftsOfEvent(s, e.id).flatMap((x) => Q.rowsBy(s.assignments, "shift", (a) => a.shiftId, x.id)).filter((a) => a.status === "confirmed");
const leadersOf = (s: OssState, e: EventBooking) => Array.from(new Set(crewOf(s, e).map((a) => a.workerId))).map((id) => Q.worker(s, id)).filter((w) => w && profile(w).teamLeader);
const needsLeader = (s: OssState, e: EventBooking) => Q.shiftsOfEvent(s, e.id).some((x) => roleMix(x).some(([r]) => r === "Team leader"));
function mixOf(s: OssState, e: EventBooking): [string, number][] {
  const m = new Map<string, number>();
  Q.shiftsOfEvent(s, e.id).forEach((x) => roleMix(x).forEach(([r, n]) => m.set(r, (m.get(r) || 0) + n)));
  return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
}
function phaseOf(s: OssState, e: EventBooking) { return e.historical ? "completed" : Q.eventPhase(s, e); }
function countdown(s: OssState, e: EventBooking): string {
  const sp = span(s, e);
  if (e.status === "pending") return "Pending with the client";
  if (!sp) return "Times to confirm";
  const ph = phaseOf(s, e);
  if (ph === "live") return "On site now, until " + fmtTime(sp[1]);
  if (ph === "completed") return "Finished " + fmtDate(sp[1]) + ", " + fmtTime(sp[1]);
  const mins = Math.round((ms(sp[0]) - ms(s.clock)) / 60000);
  return mins > 48 * 60 ? "Starts in " + Math.round(mins / 1440) + " days" : "Starts in " + fmtHM(mins);
}

/* The one thing to do next on an event, most pressing first. */
interface Next { label: string; note: string; kind?: "primary" | "urgent"; go: () => void }
function nextOf(s: OssState, e: EventBooking): Next {
  const c = Q.eventCoverage(s, e.id);
  const v = Q.venueOf(s, e.venueId);
  const sp = span(s, e);
  const ph = phaseOf(s, e);
  if (e.status === "pending") return { label: "Open", note: e.pendingNote || "Waiting on the client", go: () => open(e.id) };
  if (ph === "live") return { label: "Event day board", note: "On site now", kind: "primary", go: () => navigate("Attendance", "board") };
  if (ph === "completed") return { label: "Hours", note: s.ext.signoffs[e.id] ? "Client signed off" : "Hours to approve and sign off", go: () => open(e.id, "hours") };
  const soon = sp ? ms(sp[0]) - ms(s.clock) < 48 * 3600000 : false;
  if (c.notInvited > 0) return { label: "Find crew", note: c.notInvited + " not offered yet", kind: soon ? "urgent" : "primary", go: () => navigate("Staffing", "allocate", { kind: "event", id: e.id }) };
  if (c.awaiting > 0) return { label: "Chase replies", note: c.awaiting + " awaiting reply", go: () => navigate("Staffing", "responses", { kind: "event", id: e.id }) };
  if (v && !v.meetingConfirmed) return { label: "Meeting point", note: "Not confirmed yet", go: () => open(e.id) };
  if (CALL_SHEETS[e.id]) return { label: "Call sheet", note: "Fully crewed", go: () => open(e.id, "callsheet") };
  return { label: "Open", note: "Fully crewed", go: () => open(e.id) };
}

/* A card that opens the event, but whose own buttons still work. */
function Clickable({ className, onOpen, children, label }: { className: string; onOpen: () => void; children: any; label: string }) {
  return (
    <div className={className} role="button" tabIndex={0} aria-label={label}
      onClick={(ev) => { if ((ev.target as HTMLElement).closest("button,a,select,input")) return; onOpen(); }}
      onKeyDown={(ev) => { if (ev.key === "Enter" && ev.target === ev.currentTarget) onOpen(); }}>{children}</div>
  );
}

/* ── upcoming: an agenda ──────────────────────────────────────────────────── */
type Scope = "week" | "month" | "all";
const SCOPE_DAYS: Record<Scope, number> = { week: 6, month: 29, all: 400 };
/** First day an event still matters from: today for anything already running. */
const groupDay = (s: OssState, e: EventBooking) => { const today = dayKey(s.clock); return e.date < today ? today : e.date; };
function inScope(s: OssState, e: EventBooking, until: string) {
  if (e.historical || e.status === "cancelled") return false;
  const sp = span(s, e);
  if (sp && ms(sp[1]) < ms(s.clock)) return false;
  if (!sp && e.date < dayKey(s.clock)) return false;
  return groupDay(s, e) <= until;
}
function Upcoming({ s, action }: { s: OssState; action: any }) {
  const [scope, setScope] = useState<Scope>("week");
  const [filter, setFilter] = useState<"all" | "gaps" | "pending">("all");
  const [desk, setDesk] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");
  const [q, setQ] = useState("");
  const today = dayKey(s.clock);
  const until = addDays(today, SCOPE_DAYS[scope]);
  const pend = Q.pendingDemand(s);
  const scoped = s.events.filter((e) => inScope(s, e, until))
    .sort((a, b) => groupDay(s, a).localeCompare(groupDay(s, b)) || (span(s, a)?.[0] || "").localeCompare(span(s, b)?.[0] || ""));
  const byKind = scoped.filter((e) => desk === "all" || Q.deskOf(e) === desk);
  const base = byKind.filter((e) => kind === "all" || Q.kindOf(s, e) === kind);
  const gaps = base.filter((e) => e.status === "confirmed" && Q.eventCoverage(s, e.id).unfilled > 0);
  const pendings = base.filter((e) => e.status === "pending");
  let list = filter === "gaps" ? gaps : filter === "pending" ? pendings : base;
  const needle = q.trim().toLowerCase();
  if (needle) list = list.filter((e) => (e.name + " " + Q.clientOf(s, e.clientId).name + " " + (Q.venueOf(s, e.venueId)?.name || "") + " " + Q.deskOf(e)).toLowerCase().includes(needle));
  const byDay = Array.from(new Set(list.map((e) => groupDay(s, e))));
  const firm = base.filter((e) => e.status === "confirmed");
  const t = Q.sumCov(firm.map((e) => Q.eventCoverage(s, e.id)));
  const open7 = Math.max(0, t.unfilled - t.awaiting);
  const rel = (d: string) => (d === today ? "Today" : d === addDays(today, 1) ? "Tomorrow" : fmtDateLong(zoned(d, "12:00")).split(" ")[0]);
  /* Demand by day (or week for the long view), stacked by kind. */
  const buckets: { key: string; label: string; sub: string; parts: Record<string, number>; req: number; conf: number }[] = [];
  const bucketOf = (d: string) => scope === "all" ? (() => { const wd = (weekday(zoned(d, "12:00")) + 6) % 7; return addDays(d, -wd); })() : d;
  if (scope !== "all") for (let i = 0; i <= SCOPE_DAYS[scope]; i++) { const d = addDays(today, i); buckets.push({ key: d, label: scope === "week" ? fmtDate(zoned(d, "12:00")).split(" ")[0] : String(Number(d.slice(8))), sub: scope === "week" ? String(Number(d.slice(8))) : "", parts: {}, req: 0, conf: 0 }); }
  firm.forEach((e) => Q.shiftsOfEvent(s, e.id).forEach((x) => {
    const d = dayKey(x.start); if (d < today || d > until) return;
    const k = bucketOf(d); let b = buckets.find((z) => z.key === k);
    if (!b) { b = { key: k, label: fmtDayMonth(zoned(k, "12:00")), sub: "wk", parts: {}, req: 0, conf: 0 }; buckets.push(b); }
    const c = Q.shiftCoverage(s, x.id); const kd = Q.kindOf(s, e);
    b.parts[kd] = (b.parts[kd] || 0) + x.required; b.req += x.required; b.conf += c.confirmed;
  }));
  buckets.sort((a, b) => a.key.localeCompare(b.key));
  const peak = Math.max(1, ...buckets.map((b) => b.req));
  const deskN = (d: string) => scoped.filter((e) => Q.deskOf(e) === d && (kind === "all" || Q.kindOf(s, e) === kind)).length;
  const kindN = (k: string) => byKind.filter((e) => Q.kindOf(s, e) === k).length;
  const jump = (d: string) => document.getElementById("evday-" + d)?.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  const scopeLabel = scope === "week" ? "next seven days" : scope === "month" ? "next 30 days" : "everything booked";
  return (
    <Page eyebrow={"Events · " + Q.windowLabel(s).replace("-", " to ")} title="Upcoming events" sub="Every booking across the six desks, day by day, with live staffing for every shift and the next thing to do." actions={action}>
      <section className="ev-sum nx-sum">
        <div className="nx-sum-l">
          <Ring value={t.confirmed} max={t.required || 1} size={104} stroke={9} tone={t.unfilled ? "accent" : "ok"} label={t.required ? Q.pctLabel(t) : "-"} sub="filled" />
          <div className="mid">
            <div className="nx-k">{scopeLabel}{desk !== "all" ? " · " + (DESK_SHORT[desk] || desk) : ""}{kind !== "all" ? " · " + kind : ""}</div>
            <div className="ttl"><b>{t.confirmed.toLocaleString("en-IE")} of {t.required.toLocaleString("en-IE")}</b> positions confirmed across {firm.length} booked event{firm.length === 1 ? "" : "s"}</div>
            <Meter total={t.required || 1} height={10} parts={[{ n: t.confirmed, tone: "ok", label: "confirmed" }, { n: t.awaiting, tone: "accent", label: "awaiting reply" }, { n: open7, tone: "warn", label: "still to offer" }]} />
          </div>
        </div>
        <div className="nx-days" role="list" aria-label="Crew needed by day">
          {buckets.map((b) => (
            <button key={b.key} role="listitem" className={"nx-dayc" + (b.key === today ? " today" : "")} onClick={() => jump(b.key)} title={b.req + " positions, " + b.conf + " confirmed"} disabled={!b.req}>
              <span className="n">{b.req ? b.req.toLocaleString("en-IE") : ""}</span>
              <span className="col" style={{ height: Math.max(3, (b.req / peak) * 92) }}>
                {Q.KINDS.filter((k) => b.parts[k]).map((k) => <i key={k} style={{ flexGrow: b.parts[k], background: kindVar(k) }} />)}
              </span>
              <span className="l">{b.label}</span>
              {b.sub && <span className="d">{b.sub}</span>}
              {b.req > 0 && <span className={"f" + (b.conf >= b.req ? " ok" : b.conf / b.req < 0.8 ? " lo" : "")}>{Math.round((b.conf / b.req) * 100)}%</span>}
            </button>))}
        </div>
        <div className="side">
          <button className="ev-sumstat" onClick={() => setFilter("gaps")}><b style={{ color: t.unfilled ? "var(--warn)" : undefined }}>{t.unfilled}</b><span>unfilled</span></button>
          <button className="ev-sumstat" onClick={() => setFilter("pending")}><b>{pend.events.length}</b><span>pending, ~{pend.positions} staff</span></button>
        </div>
      </section>
      <div className="nx-filters">
        <div className="row">
          <Seg value={scope} onChange={setScope} label="How far ahead" options={[{ id: "week", label: "Next 7 days" }, { id: "month", label: "30 days" }, { id: "all", label: "Everything" }]} />
          <Seg value={filter} onChange={setFilter} label="Filter events" options={[{ id: "all", label: "All", n: base.length }, { id: "gaps", label: "Gaps to fill", n: gaps.length }, { id: "pending", label: "Pending", n: pendings.length }]} />
          <Search value={q} onChange={setQ} placeholder="Search event, client, venue or desk" style={{ maxWidth: 320, flex: "1 1 200px" }} />
        </div>
        <div className="row chips" aria-label="Desk">
          <button className={"nx-chip" + (desk === "all" ? " on" : "")} onClick={() => setDesk("all")}>All desks<span>{scoped.filter((e) => kind === "all" || Q.kindOf(s, e) === kind).length}</span></button>
          {DESKS.map((d) => <button key={d} className={"nx-chip" + (desk === d ? " on" : "")} onClick={() => setDesk(desk === d ? "all" : d)} disabled={!deskN(d)}><i style={{ background: deskC(d) }} />{DESK_SHORT[d]}<span>{deskN(d)}</span></button>)}
        </div>
        <div className="row chips" aria-label="Kind of work">
          {Q.KINDS.map((k) => <button key={k} className={"nx-chip kind" + (kind === k ? " on" : "")} style={{ ["--c" as any]: kindVar(k) }} onClick={() => setKind(kind === k ? "all" : k)} disabled={!kindN(k)}><i />{k}<span>{kindN(k)}</span></button>)}
        </div>
      </div>
      <div className="ev-agenda">
        {byDay.map((d) => {
          const evs = list.filter((e) => groupDay(s, e) === d);
          const crew = evs.filter((e) => e.status === "confirmed").reduce((n, e) => n + Q.shiftsOfEvent(s, e.id).filter((x) => dayKey(x.start) === d).reduce((m, x) => m + x.required, 0), 0);
          const kinds = Array.from(new Set(evs.map((e) => Q.kindOf(s, e))));
          return (
            <div key={d} id={"evday-" + d} className={"ev-day" + (d === today ? " today" : "")}>
              <div className="ev-rail"><div className="stick">
                <span className="rel">{rel(d)}</span>
                <b>{Number(d.slice(8))}</b>
                <span className="mo">{fmtDate(zoned(d, "12:00")).split(" ")[2]}</span>
                <span className="cnt">{evs.length} event{evs.length === 1 ? "" : "s"}{crew ? <><br />{crew.toLocaleString("en-IE")} crew</> : ""}</span>
                <span className="nx-kdots">{kinds.map((k) => <i key={k} title={k} style={{ background: kindVar(k) }} />)}</span>
              </div></div>
              <div className="ev-list">{evs.map((e) => <AgendaItem key={e.id} s={s} e={e} />)}</div>
            </div>);
        })}
        {!byDay.length && <Card><div className="oss-empty"><b>Nothing to show</b>No events match these filters.</div></Card>}
      </div>
    </Page>
  );
}

function AgendaItem({ s, e }: { s: OssState; e: EventBooking }) {
  const c = Q.eventCoverage(s, e.id);
  const v = Q.venueOf(s, e.venueId);
  const shifts = Q.shiftsOfEvent(s, e.id);
  const sp = span(s, e);
  const ph = phaseOf(s, e);
  const nx = nextOf(s, e);
  const leaders = leadersOf(s, e);
  const mix = mixOf(s, e);
  const pending = e.status === "pending";
  const kind = Q.kindOf(s, e);
  const region = Q.regionOf(s, e);
  const multiDay = sp ? dayKey(sp[0]) !== dayKey(sp[1]) && shifts.length > 1 : false;
  const cls = "ev-item nx-kind" + (pending ? " pending" : ph === "live" ? " live" : ph === "completed" ? " done" : c.unfilled ? " gap" : "");
  return (
    <Clickable className={cls} onOpen={() => open(e.id)} label={"Open " + e.name}>
      <span className="nx-stripe" style={{ background: kindVar(kind) }} aria-hidden="true" />
      <div className="ev-when">{sp ? <><b>{fmtTime(sp[0])}</b><span>{multiDay ? "to " + fmtDate(sp[1]).split(" ").slice(0, 2).join(" ") : "to " + fmtTime(sp[1])}</span></> : <><b>TBC</b><span>times</span></>}</div>
      <div className="ev-body">
        <div className="ev-tags">
          <Tag c={kindVar(kind)} dot={false}>{kind}</Tag>
          <DeskTag desk={Q.deskOf(e)} />
          <span className="ev-code">{code(s, e.clientId)}</span>
          {pending ? <S s="Pending" /> : ph === "live" ? <St tone="ok">Live now</St> : ph === "completed" ? <St tone="neutral">Finished</St> : c.unfilled ? <St tone="warn">{c.unfilled} to fill</St> : <St tone="ok">Fully crewed</St>}
        </div>
        <div className="ev-name"><b>{short(e)}</b>{rest(e) && <span>{rest(e)}</span>}</div>
        <div className="ev-where">
          <span className="w"><Icon d={I.pin} size={12} />{v ? v.name + ", " + v.area : "Venue to confirm"}</span>
          {region !== "Dublin" && <span className="w nx-region" style={{ ["--c" as any]: regionVar(region) }}>{region}</span>}
          <span className="w"><Icon d={I.user} size={12} />{Q.nameOf(s, e.ownerId)}</span>
          {e.audience ? <span className="w"><Icon d={I.users} size={12} />{e.audience.toLocaleString("en-IE")} expected</span> : null}
        </div>
        {shifts.length > 0 && <div className="ev-shifts">{shifts.slice(0, 4).map((x) => <div key={x.id} className="ev-shift"><span className="lbl">{x.label}{shifts.length > 1 && multiDay ? <span className="oss-muted"> · {fmtDate(x.start).split(" ")[0]}</span> : null}</span><span className="tm">{hm(x.start, x.end)}</span><span className="cv"><Cov c={Q.shiftCoverage(s, x.id)} compact /></span></div>)}
          {shifts.length > 4 && <div className="oss-tiny oss-muted" style={{ padding: "4px 2px 0" }}>+{shifts.length - 4} more shifts in the run</div>}</div>}
        {!pending && mix.length > 0 && <div className="ev-mix">
          {mix.slice(0, 4).map(([r, n]) => <span key={r} className="ev-role"><b>{n}</b>{r}</span>)}
          {leaders.length ? <span className="ev-role tl"><Av name={leaders[0].name} size="sm" />TL {leaders.slice(0, 3).map((w) => w.name.split(" ")[0]).join(", ")}{leaders.length > 3 ? " +" + (leaders.length - 3) : ""}</span>
            : needsLeader(s, e) ? <span className="ev-role warn"><Icon d={I.alert} size={12} />No team leader yet</span> : null}
        </div>}
        {pending && <div className="ev-where" style={{ marginTop: 8 }}><span className="w"><Icon d={I.info} size={12} />~{e.indicativePositions} staff if confirmed · {e.pendingNote || "Waiting on the client"}</span></div>}
      </div>
      <div className="ev-side">
        {pending ? <div className="ev-ind"><b>~{e.indicativePositions}</b><span>staff</span></div>
          : <Ring value={c.confirmed} max={c.required} size={64} stroke={6} tone={c.unfilled ? (c.notInvited ? "warn" : "accent") : "ok"} label={c.confirmed + "/" + c.required} />}
        <div className="ev-next"><span>{nx.note}</span><Btn size="sm" kind={nx.kind} onClick={nx.go}>{nx.label}</Btn></div>
      </div>
    </Clickable>
  );
}

/* ── event page ───────────────────────────────────────────────────────────── */
function EventPage({ s, e }: { s: OssState; e: EventBooking }) {
  const shifts = Q.shiftsOfEvent(s, e.id);
  const c = Q.eventCoverage(s, e.id);
  const v = Q.venueOf(s, e.venueId);
  const cl = Q.clientOf(s, e.clientId);
  const [view, setView] = useState<View>(() => { const x = nextView || "staffing"; nextView = null; return x; });
  const back = { label: "Events", go: () => navigate("Events", tabOf(s, "Events"), null) };
  const audit = useMemo(() => {
    const ids = new Set<string>([e.id]);
    shifts.forEach((x) => { ids.add(x.id); Q.rowsBy(s.assignments, "shift", (a) => a.shiftId, x.id).forEach((a) => ids.add(a.id)); Q.rowsBy(s.invitations, "shift", (i) => i.shiftId, x.id).forEach((i) => ids.add(i.id)); });
    return s.audit.filter((a) => ids.has(a.entity.id)).slice(-40).reverse();
  }, [s, e.id]);
  const ph = phaseOf(s, e);
  const pending = e.status === "pending";
  const leaders = leadersOf(s, e);
  const aside = pending
    ? <div className="ev-haside"><div className="ev-big"><span>Indicative headcount</span><b>~{e.indicativePositions}</b><small>Not yet confirmed by the client</small></div></div>
    : <div className="ev-haside">
        <Ring value={c.confirmed} max={c.required} size={124} stroke={10} tone={c.unfilled ? "accent" : "ok"} label={c.confirmed + "/" + c.required} sub={Q.pctLabel(c) + " confirmed"} />
        <div className="ev-hstats">
          <button onClick={() => navigate("Staffing", "responses", { kind: "event", id: e.id })}><b>{c.awaiting}</b><span>awaiting reply</span></button>
          <button onClick={() => navigate("Staffing", "allocate", { kind: "event", id: e.id })}><b style={{ color: c.unfilled ? "var(--warn)" : undefined }}>{c.unfilled}</b><span>unfilled</span></button>
          <button onClick={() => navigate("Staffing", "allocate", { kind: "event", id: e.id })}><b>{c.notInvited}</b><span>not offered yet</span></button>
        </div>
      </div>;
  return (
    <div className="oss-page" style={{ paddingTop: 10 }}>
      <section className={"oss-hero ev-hero " + (ph === "live" ? "accent live" : "accent")}>
        <div className="main">
          <button className="oss-back" onClick={back.go}><Icon d={I.back} size={14} />{back.label}</button>
          <div className="oss-eyebrow">{cl.name} · {pending ? "Pending booking" : ph === "live" ? "Live now" : ph === "completed" ? "Finished" : "Booked"}</div>
          <h1>{e.name}</h1>
          <div className="sub">{(v ? v.name + ", " + v.area : "Venue to confirm") + " · " + fmtDateLong(zoned(e.date, "12:00"))}{shifts.length ? " · " + shifts.map((x) => x.label + " " + hm(x.start, x.end)).join(", ") : ""}{pending && e.pendingNote ? " · " + e.pendingNote : ""}</div>
          <div className="ev-hchips">
            <span className={"ev-count" + (ph === "live" ? " live" : "")}><Icon d={I.clock} size={13} />{countdown(s, e)}</span>
            <Tag c={kindVar(Q.kindOf(s, e))} dot={false}>{Q.kindOf(s, e)}</Tag>
            <DeskTag desk={Q.deskOf(e)} />
            {v?.county && <span className="nx-region" style={{ ["--c" as any]: regionVar(Q.regionOf(s, e)) }}>{v.county}, {Q.regionOf(s, e)}</span>}
            <span className="oss-pill"><Av name={Q.nameOf(s, e.ownerId)} size="sm" />{Q.nameOf(s, e.ownerId)}, coordinator</span>
            {!pending && <span className="oss-pill"><Icon d={I.shield} size={13} />{leaders.length ? "Team leader " + leaders.map((w) => w.name).join(", ") : needsLeader(s, e) ? "No team leader yet" : "Supervisor " + Q.nameOf(s, e.supervisorId)}</span>}
          </div>
          <div className="acts">
            {pending ? <Btn kind="primary" icon={I.check} onClick={() => run(E.setBookingStatus, e.id, "confirmed")}>Confirm booking</Btn>
              : <Btn kind={c.notInvited ? "primary" : undefined} icon={I.users} onClick={() => navigate("Staffing", "allocate", { kind: "event", id: e.id })}>Find crew</Btn>}
            {!pending && CALL_SHEETS[e.id] && <Btn icon={I.doc} onClick={() => setView("callsheet")}>Call sheet</Btn>}
            <Btn icon={I.msg} onClick={() => navigate("Messages", "compose", { kind: "event", id: e.id })}>Message crew</Btn>
            {ph === "live" && <Btn icon={I.pin} onClick={() => navigate("Attendance", "board")}>Event day board</Btn>}
          </div>
        </div>
        <div className="aside">{aside}</div>
      </section>

      {!pending && <div className="ev-views"><Seg value={view} onChange={setView} label="Event view" options={[{ id: "staffing", label: "Staffing" }, { id: "callsheet", label: "Call sheet" }, { id: "roles", label: "Roles & team leaders" }, { id: "kit", label: "Kit & welfare" }, { id: "hours", label: "Hours & sign-off", n: Q.lines(s, { eventId: e.id }).length || undefined }, { id: "history", label: "History", n: audit.length }]} /></div>}
      {pending ? <PendingBody s={s} e={e} />
        : view === "callsheet" ? <CallSheetDoc s={s} e={e} /> : view === "roles" ? <RolesView s={s} e={e} /> : view === "kit" ? <KitView s={s} e={e} /> : view === "hours" ? <HoursView s={s} e={e} />
        : view === "history" ? <Card title="History" meta="Who changed what, and when" icon={I.list}><AuditList s={s} items={audit} /></Card> :
      <div className="oss-grid oss-main-side" style={{ alignItems: "start" }}>
        <div className="oss-stack">
          {shifts.map((x) => <ShiftCard key={x.id} s={s} x={x} />)}
          {!shifts.length && <Card><div className="oss-empty"><b>No shifts yet</b>Shifts are added once the client confirms times and headcount.</div></Card>}
          {!e.historical && shifts.length > 0 && <Card title="Change times" meta="Accepted staff are asked to reconfirm" icon={I.clock}><ShiftTimeEditor s={s} shifts={shifts} /></Card>}
        </div>
        <OnTheDay s={s} e={e} />
      </div>}
    </div>
  );
}

function PendingBody({ s, e }: { s: OssState; e: EventBooking }) {
  return (
    <div className="oss-grid oss-main-side" style={{ alignItems: "start" }}>
      <Card title="What happens next" icon={I.list}>
        <ol className="ev-steps">
          <li className="on"><b>Client call logged</b><span>{Q.nameOf(s, e.ownerId)} took the booking. Headcount ~{e.indicativePositions}.</span></li>
          <li><b>Client confirms times and headcount</b><span>{e.pendingNote || "Waiting on the client."}</span></li>
          <li><b>Shifts added, crew offered</b><span>Pending bookings show in the calendar but not in staffing totals until confirmed.</span></li>
        </ol>
      </Card>
      <OnTheDay s={s} e={e} />
    </div>
  );
}

function OnTheDay({ s, e }: { s: OssState; e: EventBooking }) {
  const shifts = Q.shiftsOfEvent(s, e.id);
  const v = Q.venueOf(s, e.venueId);
  const cl = Q.clientOf(s, e.clientId);
  return (
    <div className="oss-stack">
      <Card title="On the day" meta="Shown on every invitation and shift" icon={I.pin}>
        <div className="oss-small oss-dim">Meeting point</div>
        <div className="oss-small" style={{ marginTop: 4, color: "var(--ink)", lineHeight: 1.5 }}>{v?.meetingPoint || "To confirm"}</div>
        {v && !v.meetingConfirmed && <div style={{ marginTop: 8 }}><Btn size="sm" onClick={() => run(E.confirmMeetingPoint, v.id, "Staff entrance at the loading bay, Gate C. Report to Mark Walsh.")}>Confirm meeting point</Btn></div>}
        <div className="oss-small oss-dim" style={{ marginTop: 14 }}>PPE</div>
        <div style={{ marginTop: 6 }}><PPE items={e.ppe} /></div>
        {shifts.some((x) => x.requiredDocs.length) && <><div className="oss-small oss-dim" style={{ marginTop: 14 }}>Required documents</div>
          <div className="oss-pills" style={{ marginTop: 6 }}>{Array.from(new Set(shifts.flatMap((x) => x.requiredDocs))).map((t) => <span key={t} className="oss-pill"><Icon d={I.shield} size={13} />{docLabel(t)}</span>)}</div></>}
        <div className="oss-small oss-dim" style={{ marginTop: 14 }}>Instructions</div>
        <div className="oss-small" style={{ marginTop: 4, lineHeight: 1.55, color: "var(--body)" }}>{e.brief}</div>
      </Card>
      <Card title="Check-in" meta={v ? "Within " + v.geofenceM + " m of the venue" : "Venue to confirm"} icon={I.qr}>
        <KV items={[["Methods", v?.methods.map((m) => m === "gps" ? "GPS" : "Venue QR").join(" + ") || "-"], ["Geofence", v ? v.geofenceM + " m" : "-"], ["Supervisor", Q.nameOf(s, e.supervisorId)], ["Coordinator", Q.nameOf(s, e.ownerId)]]} />
      </Card>
      <Card title="Client" icon={I.briefcase} flush>
        <div className="oss-rows">
          <Row lead={<RIcon d={I.briefcase} />} title={cl.name} sub={cl.sector} onClick={() => openDrawer("client", cl.id)} />
          {s.contacts.filter((x) => x.clientId === cl.id).map((x) => <Row key={x.id} lead={<Av name={x.name} />} title={x.name} sub={x.role} />)}
        </div>
      </Card>
    </div>
  );
}

function ShiftCard({ s, x }: { s: OssState; x: Shift }) {
  const c = Q.shiftCoverage(s, x.id);
  const asg = Q.rowsBy(s.assignments, "shift", (a) => a.shiftId, x.id);
  const confirmed = asg.filter((a) => a.status === "confirmed");
  const cancelled = asg.filter((a) => a.status === "cancelled");
  const invs = Q.rowsBy(s.invitations, "shift", (i) => i.shiftId, x.id);
  const waiting = invs.filter((i) => Q.isActiveInvite(s, i));
  const declined = invs.filter((i) => i.status === "declined");
  const started = ms(s.clock) >= ms(x.start);
  return (
    <Card title={x.label + " · " + hm(x.start, x.end)} meta={x.roles.join(", ")} icon={I.users}
      right={<><span style={{ width: 170 }}><Cov c={c} compact /></span>{c.unfilled > 0 && !started && <Btn size="sm" kind="primary" onClick={() => navigate("Staffing", "allocate", { kind: "shift", id: x.id })}>Fill {c.unfilled}</Btn>}</>}>
      <Seats c={c} />
      <div className="oss-legend" style={{ marginTop: 10 }}><span><i style={{ background: "var(--ok)" }} />{c.confirmed} confirmed</span><span><i style={{ border: "1.5px solid var(--accent)" }} />{c.awaiting} awaiting reply</span><span><i style={{ background: "var(--track)" }} />{Math.max(0, c.required - c.confirmed - c.awaiting)} open</span>{c.standby > 0 && <span>{c.standby} on standby</span>}</div>
      <div className="ev-groups">
        <Group title="Accepted" n={confirmed.length} tone="ok" names={confirmed.map((a) => Q.nameOf(s, a.workerId))} />
        <Group title="Awaiting reply" n={waiting.length} tone="info" names={waiting.map((i) => Q.nameOf(s, i.workerId))} />
        <Group title="Declined or cancelled" n={declined.length + cancelled.length} tone="neutral" names={declined.map((i) => Q.nameOf(s, i.workerId)).concat(cancelled.map((a) => Q.nameOf(s, a.workerId)))} />
      </div>
      {cancelled.length > 0 && <div className="oss-rows" style={{ marginTop: 10, marginLeft: -12, marginRight: -12 }}>
        {cancelled.map((a) => { const rep = s.assignments.find((r) => r.replacementFor === a.id && r.status === "confirmed"); return (
          <Row key={a.id} lead={<RIcon d={I.swap} tone={rep ? "ok" : "bad"} />} title={Q.nameOf(s, a.workerId) + " cancelled at " + fmtTime(a.cancelledAt!)} sub={a.cancelReason + (rep ? " · replaced by " + Q.nameOf(s, rep.workerId) : "")}
            end={rep ? <S s="Resolved" /> : <Btn size="sm" onClick={() => navigate("Staffing", "replacements")}>Replace</Btn>} />); })}
      </div>}
    </Card>
  );
}
function Group({ title, n, tone, names }: { title: string; n: number; tone: string; names: string[] }) {
  return (
    <div className="ev-group">
      <div className="oss-row"><span className="oss-dot" style={{ ["--c" as any]: tone === "ok" ? "var(--ok)" : tone === "info" ? "var(--accent)" : "var(--neutral)" }} /><span className="l grow">{title}</span><b className="oss-tab oss-ink">{n}</b></div>
      <div style={{ marginTop: 10, minHeight: 26 }}>{names.length ? <Faces names={names} max={6} /> : <span className="oss-tiny oss-muted">Nobody</span>}</div>
      {names.length > 0 && <div className="oss-tiny oss-dim" style={{ marginTop: 8, lineHeight: 1.5 }}>{names.slice(0, 4).join(", ")}{names.length > 4 ? " and " + (names.length - 4) + " more" : ""}</div>}
    </div>
  );
}

/* ── bookings: a board by stage ──────────────────────────────────────────── */
type Lane = "pending" | "filling" | "full" | "hours" | "signed";
const LANES: { id: Lane; label: string; tone: string; blurb: string }[] = [
  { id: "pending", label: "With the client", tone: "neutral", blurb: "Pending: times or headcount to confirm" },
  { id: "filling", label: "Booked, filling", tone: "warn", blurb: "Offers go out in waves from ten days before" },
  { id: "full", label: "Booked and crewed", tone: "ok", blurb: "Every position confirmed" },
  { id: "hours", label: "Hours to sign off", tone: "", blurb: "Finished, hours with OSS or the client" },
  { id: "signed", label: "Signed off", tone: "ok", blurb: "Client signed the hours" }
];
function laneOf(s: OssState, e: EventBooking): Lane {
  if (e.status === "pending") return "pending";
  if (phaseOf(s, e) === "completed") return s.ext.signoffs[e.id] ? "signed" : "hours";
  return Q.eventCoverage(s, e.id).unfilled > 0 ? "filling" : "full";
}
/** Fill colour by how full and how close: far-off bookings are expected to be part filled. */
export function fillTone(s: OssState, e: EventBooking): "ok" | "accent" | "warn" | "bad" {
  const c = Q.eventCoverage(s, e.id);
  if (!c.required || c.unfilled === 0) return "ok";
  const days = (ms((span(s, e)?.[0]) || zoned(e.date, "12:00")) - ms(s.clock)) / 864e5;
  const p = c.confirmed / c.required;
  if (days < 2) return p < 0.95 ? "bad" : "warn";
  if (days < 7) return p < 0.85 ? "warn" : "accent";
  return p < 0.25 && days < 14 ? "warn" : "accent";
}
function Bookings({ s, action }: { s: OssState; action: any }) {
  const [q, setQ] = useState("");
  const [client, setClient] = useState<string>("all");
  const [desk, setDesk] = useState<string>("all");
  const [more, setMore] = useState<Record<string, boolean>>({});
  const all = s.events.filter((e) => e.status !== "cancelled");
  const needle = q.trim().toLowerCase();
  const rows = all.filter((e) => (client === "all" || e.clientId === client) && (desk === "all" || Q.deskOf(e) === desk) && (!needle || (e.name + " " + Q.clientOf(s, e.clientId).name + " " + (Q.venueOf(s, e.venueId)?.name || "")).toLowerCase().includes(needle)));
  const lanes = LANES.map((l) => {
    const list = rows.filter((e) => laneOf(s, e) === l.id).sort((a, b) => (l.id === "hours" || l.id === "signed" ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
    return { ...l, list };
  });
  const clients = Array.from(new Set(all.map((e) => e.clientId))).sort((a, b) => Q.clientOf(s, a).name.localeCompare(Q.clientOf(s, b).name));
  /* Fill by week, from this week to the end of the booked season. */
  const mon = (d: string) => addDays(d, -((weekday(zoned(d, "12:00")) + 6) % 7));
  const weeks = new Map<string, { req: number; conf: number; n: number; kinds: Record<string, number> }>();
  rows.filter((e) => e.status === "confirmed" && !e.historical).forEach((e) => Q.shiftsOfEvent(s, e.id).forEach((x) => {
    const w = mon(dayKey(x.start)); if (w < mon(dayKey(s.clock))) return;
    const c = Q.shiftCoverage(s, x.id); const r = weeks.get(w) || { req: 0, conf: 0, n: 0, kinds: {} };
    r.req += x.required; r.conf += c.confirmed; r.n++; const k = Q.kindOf(s, e); r.kinds[k] = (r.kinds[k] || 0) + x.required; weeks.set(w, r);
  }));
  const wk = Array.from(weeks.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const peak = Math.max(1, ...wk.map(([, r]) => r.req));
  const tot = wk.reduce((a, [, r]) => ({ req: a.req + r.req, conf: a.conf + r.conf }), { req: 0, conf: 0 });
  return (
    <Page eyebrow="Events · all bookings" title="Every booking, by stage" sub="From the client's first call to signed-off hours, across every desk. Each card opens the event." actions={action}>
      <section className="nx-weeks">
        <div className="nx-weeks-h">
          <div><span className="nx-k">Fill by week</span><b>{tot.conf.toLocaleString("en-IE")}</b><span className="oss-small oss-dim"> of {tot.req.toLocaleString("en-IE")} positions confirmed to the end of the season</span></div>
          <div className="oss-legend"><span><i style={{ background: "var(--ok)" }} />Confirmed</span><span><i style={{ background: "var(--track)" }} />Still to fill</span>{Q.KINDS.map((k) => <span key={k}><i style={{ background: kindVar(k), borderRadius: 2 }} />{k}</span>)}</div>
        </div>
        <div className="nx-weeks-g">
          {wk.map(([w, r]) => { const p = r.req ? r.conf / r.req : 1; return (
            <div key={w} className="nx-wk" title={r.conf + " of " + r.req + " confirmed, " + r.n + " shifts"}>
              <span className="pct" style={{ color: p >= 0.98 ? "var(--ok)" : p < 0.5 ? "var(--warn)" : "var(--body)" }}>{Math.round(p * 100)}%</span>
              <span className="col" style={{ height: Math.max(6, (r.req / peak) * 120) }}><i style={{ height: p * 100 + "%" }} /></span>
              <span className="mix">{Q.KINDS.filter((k) => r.kinds[k]).map((k) => <i key={k} style={{ flexGrow: r.kinds[k], background: kindVar(k) }} />)}</span>
              <span className="l">{fmtDayMonth(zoned(w, "12:00"))}</span>
              <span className="n">{r.req.toLocaleString("en-IE")}</span>
            </div>); })}
        </div>
      </section>
      <div className="nx-filters">
        <div className="row">
          <Search value={q} onChange={setQ} placeholder="Search bookings" style={{ maxWidth: 280, flex: "1 1 200px" }} />
          <select className="oss-input nx-sel" value={client} onChange={(e) => setClient(e.target.value)} aria-label="Client"><option value="all">All clients ({clients.length})</option>{clients.map((c) => <option key={c} value={c}>{Q.clientOf(s, c).name}</option>)}</select>
        </div>
        <div className="row chips" aria-label="Desk">
          <button className={"nx-chip" + (desk === "all" ? " on" : "")} onClick={() => setDesk("all")}>All desks<span>{all.length}</span></button>
          {DESKS.map((d) => <button key={d} className={"nx-chip" + (desk === d ? " on" : "")} onClick={() => setDesk(desk === d ? "all" : d)}><i style={{ background: deskC(d) }} />{DESK_SHORT[d]}<span>{all.filter((e) => Q.deskOf(e) === d).length}</span></button>)}
        </div>
      </div>
      <div className="ev-board">
        {lanes.map((l) => { const cap = more[l.id] ? 60 : 8; return (
          <div key={l.id} className={"ev-lane " + l.tone}>
            <div className="ev-lane-h"><span className="oss-dot" /><b>{l.label}</b><span className="n">{l.list.length}</span></div>
            <div className="ev-lane-s">{l.blurb}</div>
            {l.list.slice(0, cap).map((e) => <BookingCard key={e.id} s={s} e={e} lane={l.id} />)}
            {l.list.length > cap && <button className="nx-more" onClick={() => setMore({ ...more, [l.id]: true })}>Show {Math.min(l.list.length, 60) - cap} more</button>}
            {l.list.length > 60 && more[l.id] && <div className="oss-tiny oss-muted" style={{ padding: "4px 6px" }}>+{l.list.length - 60} more. Search to narrow down.</div>}
            {!l.list.length && <div className="ev-lane-empty">Nothing here</div>}
          </div>); })}
      </div>
    </Page>
  );
}
function BookingCard({ s, e, lane }: { s: OssState; e: EventBooking; lane: Lane }) {
  const c = Q.eventCoverage(s, e.id);
  const v = Q.venueOf(s, e.venueId);
  const ls = lane === "hours" || lane === "signed" ? Q.lines(s, { eventId: e.id }) : [];
  const payable = ls.reduce((n, l) => n + l.payableMin, 0);
  const ph = phaseOf(s, e);
  const kind = Q.kindOf(s, e);
  const ft = fillTone(s, e);
  return (
    <button className="ev-bcard nx-bcard" style={{ ["--k" as any]: kindVar(kind) }} onClick={() => open(e.id, lane === "hours" || lane === "signed" ? "hours" : undefined)}>
      <div className="top"><span className="nx-kdot" title={kind} /><span className="ev-code">{code(s, e.clientId)}</span><span className="d">{fmtDate(zoned(e.date, "12:00"))}</span></div>
      <div className="t">{e.name}</div>
      <div className="s">{v?.name || "Venue to confirm"}{v?.county && v.county !== "Dublin" ? ", " + v.county : ""}</div>
      <div className="foot">
        <span className="nx-deskdot" title={Q.deskOf(e)} style={{ background: deskC(Q.deskOf(e)) }} />
        {lane === "pending" ? <span className="oss-tiny oss-dim">~{e.indicativePositions} staff</span>
          : lane === "hours" || lane === "signed" ? <span className="oss-tiny oss-dim">{ls.length ? fmtHM(payable) + " payable · " + ls.length + " lines" : "No timesheet lines"}</span>
          : <span className="nx-fill"><span className="bar"><i style={{ width: (c.required ? (c.confirmed / c.required) * 100 : 0) + "%", background: toneVar(ft) }} /><i className="a" style={{ width: (c.required ? (c.awaiting / c.required) * 100 : 0) + "%" }} /></span><b>{c.confirmed}/{c.required}</b></span>}
        {ph === "live" && <St tone="ok">Live</St>}
      </div>
    </button>
  );
}

/* ── call sheets: the printed sheet ──────────────────────────────────────── */
function CallSheets({ s }: { s: OssState }) {
  const list = s.events.filter((e) => CALL_SHEETS[e.id] && !e.historical).sort((a, b) => a.date.localeCompare(b.date));
  const [sel, setSel] = useState<string>(list[0]?.id || "");
  const cur = list.find((e) => e.id === sel) || list[0];
  return (
    <Page eyebrow="Events · call sheets" title="Call sheets" sub="Call times, meeting points, accreditation, radio, uniform and transport. Sent to crew in OSS Crew the day before and printed for the supervisor.">
      <div className="ev-cs">
        <div className="ev-cs-list">
          {list.map((e) => { const cs = CALL_SHEETS[e.id]; return (
            <button key={e.id} className={"ev-cs-item" + (cur?.id === e.id ? " on" : "")} onClick={() => setSel(e.id)}>
              <span className="d"><b>{Number(e.date.slice(8))}</b><span>{fmtDate(zoned(e.date, "12:00")).split(" ")[0]}</span></span>
              <span className="tx"><b>{short(e)}</b><span>{cs.calls.map((c) => c.time).join(", ")} call · {Q.venueOf(s, e.venueId)?.name || ""}</span></span>
            </button>); })}
        </div>
        {cur ? <CallSheetDoc s={s} e={cur} withOpen /> : <Card><div className="oss-empty"><b>No call sheets yet</b></div></Card>}
      </div>
    </Page>
  );
}

function CallSheetDoc({ s, e, withOpen }: { s: OssState; e: EventBooking; withOpen?: boolean }) {
  const cs = CALL_SHEETS[e.id];
  if (!cs) return <Card><div className="oss-empty"><b>No call sheet yet</b>It is drafted from the booking once times and headcount are confirmed.</div></Card>;
  const v = Q.venueOf(s, e.venueId);
  const crewIds = crewOf(s, e).map((a) => a.workerId);
  const send = () => run(E.sendBulk, { workerIds: crewIds, body: "Call sheet for " + short(e) + ": " + cs.calls.map((c) => Q.shiftOf(s, c.shiftId).label + " call " + c.time + " at " + c.where).join("; ") + ". " + cs.accreditation, eventId: e.id, audience: e.name + " crew, call sheet", kind: "event" });
  const docs = Array.from(new Set(Q.shiftsOfEvent(s, e.id).flatMap((x) => x.requiredDocs)));
  const info: [string, string][] = [["Accreditation", cs.accreditation], ["Radio", cs.radio], ["Uniform", cs.uniform], ["Briefing", cs.briefing], ["Getting there", cs.transport], ["Welfare and breaks", cs.welfare], ["Ratio", cs.ratio]];
  return (
    <div className="ev-sheetwrap">
      <div className="ev-sheet-bar">
        <span className="oss-small oss-dim">{crewIds.length} confirmed crew get this in OSS Crew</span>
        <span className="grow" />
        {withOpen && <Btn size="sm" kind="ghost" onClick={() => open(e.id)}>Open event</Btn>}
        <Btn size="sm" kind="primary" icon={I.send} disabled={!crewIds.length} onClick={send}>Send to crew</Btn>
      </div>
      <article className="ev-sheet">
        <header className="ev-sheet-h">
          <div className="l">
            <span className="k">OSS Recruitment · Crew call sheet</span>
            <h2>{e.name}</h2>
            <div className="meta">{fmtDateLong(zoned(e.date, "12:00"))}<br />{v ? v.name + ", " + v.area : "Venue to confirm"} · {Q.clientOf(s, e.clientId).name}</div>
          </div>
          <dl className="ev-sheet-id">
            <dt>Supervisor</dt><dd>{Q.nameOf(s, e.supervisorId)}</dd>
            <dt>Coordinator</dt><dd>{Q.nameOf(s, e.ownerId)}</dd>
            <dt>Radio</dt><dd>{cs.radio.split(".")[0]}</dd>
          </dl>
        </header>
        <section>
          <h4>Crew calls</h4>
          <div className="ev-tw"><table className="ev-tbl">
            <thead><tr><th>Call</th><th>Shift</th><th>Where</th><th>Report to</th><th className="num">Crew</th></tr></thead>
            <tbody>{cs.calls.map((c) => { const x = Q.shiftOf(s, c.shiftId); const cv = Q.shiftCoverage(s, c.shiftId); return (
              <tr key={c.shiftId}><td className="big">{c.time}</td><td><b>{x.label}</b><div className="sm">{hm(x.start, x.end)}</div></td><td>{c.where}</td><td>{c.who}</td><td className="num">{cv.confirmed}/{cv.required}</td></tr>); })}</tbody>
          </table></div>
        </section>
        <div className="ev-sheet-cols">
          <section>
            <h4>Run of show</h4>
            <table className="ev-tbl ros"><tbody>{cs.runOfShow.map(([t, l], k) => <tr key={k} className={/call|briefing/i.test(l) ? "call" : /Doors|Show|Kick-off|Guests|Competition|Gates open/.test(l) ? "key" : ""}><td className="tm">{t}</td><td>{l}</td></tr>)}</tbody></table>
          </section>
          <section>
            <h4>On the day</h4>
            <dl className="ev-dl">{info.map(([k, d]) => <div key={k}><dt>{k}</dt><dd>{d}</dd></div>)}</dl>
          </section>
        </div>
        <section>
          <h4>Site notes</h4>
          <ul className="ev-notes">{cs.notes.concat([v?.meetingPoint ? "Meeting point: " + v.meetingPoint : ""]).filter(Boolean).map((n) => <li key={n}>{n}</li>)}</ul>
        </section>
        <footer className="ev-sheet-f">
          <span><b>PPE</b> {e.ppe.join(", ") || "None"}</span>
          {docs.length > 0 && <span><b>Documents</b> {docs.map((d) => docLabel(d as DocType)).join(", ")}</span>}
          <span><b>Hours signed off by</b> {cs.signOffBy}</span>
        </footer>
      </article>
    </div>
  );
}

function RolesView({ s, e }: { s: OssState; e: EventBooking }) {
  const cs = CALL_SHEETS[e.id];
  return (
    <div className="oss-stack">
      {Q.shiftsOfEvent(s, e.id).map((x) => {
        const mix = roleMix(x);
        const crew = Q.rowsBy(s.assignments, "shift", (a) => a.shiftId, x.id).filter((a) => a.status === "confirmed").map((a) => Q.worker(s, a.workerId));
        const leaders = crew.filter((w) => profile(w).teamLeader);
        const left = new Map(mix.map(([r, n]) => [r, n] as [string, number]));
        const filled = new Map(mix.map(([r]) => [r, 0] as [string, number]));
        crew.forEach((w) => { const r = profile(w).teamLeader && (left.get("Team leader") || 0) > 0 ? "Team leader" : mix.map(([r]) => r).find((r) => w.roles.includes(r) && (left.get(r) || 0) > 0) || mix.map(([r]) => r).find((r) => (left.get(r) || 0) > 0); if (r) { left.set(r, (left.get(r) || 0) - 1); filled.set(r, (filled.get(r) || 0) + 1); } });
        return (
          <Card key={x.id} title={x.label + " · " + hm(x.start, x.end)} meta={cs?.ratio || ""} icon={I.users} right={<span style={{ width: 170 }}><Cov c={Q.shiftCoverage(s, x.id)} compact /></span>}>
            <div className="oss-bars">{mix.map(([r, n]) => <div key={r} className="oss-hbar" style={{ gridTemplateColumns: "160px minmax(0,1fr) 70px", cursor: "default" }}><span>{r}</span><span className="track"><i style={{ width: ((filled.get(r) || 0) / n) * 100 + "%", background: (filled.get(r) || 0) >= n ? "var(--ok)" : "var(--accent)" }} /></span><span className="val">{filled.get(r) || 0}/{n}</span></div>)}</div>
            <div className="oss-row" style={{ marginTop: 16, gap: 10, flexWrap: "wrap" }}><span className="oss-small oss-dim">Team leaders on the roster:</span>{leaders.length ? leaders.map((w) => <span key={w.id} className="oss-pill"><Av name={w.name} size="sm" />{w.name}</span>) : <St tone="warn">None yet</St>}</div>
          </Card>);
      })}
    </div>
  );
}

function KitView({ s, e }: { s: OssState; e: EventBooking }) {
  const cs = CALL_SHEETS[e.id];
  if (!cs) return <Card><div className="oss-empty"><b>No kit list yet</b></div></Card>;
  const led = s.ext.kit[e.id] || {};
  return (
    <div className="oss-grid oss-g75" style={{ alignItems: "start" }}>
      <Card pad={false} title="Kit out and back" meta="Signed out at the call, counted back at stand-down" icon={I.briefcase}>
        <div className="oss-rows" style={{ padding: "0 8px 10px" }}>
          {cs.kit.map(([item, n]) => { const r = led[item] || { out: 0, back: 0 }; const missing = r.out - r.back; return (
            <div key={item} className="oss-r">
              <div className="main"><div className="t">{item}</div><div className="s">{n} planned · {r.out} out · {r.back} back{missing > 0 && r.back > 0 ? " · " + missing + " not returned" : ""}</div>
                <div className="ev-kitbar"><i className="o" style={{ width: (r.out / n) * 100 + "%" }} /><i className="b" style={{ width: (r.back / n) * 100 + "%" }} /></div></div>
              <div className="end">
                <Btn size="sm" onClick={() => run(kitMove, e.id, item, "out", Math.min(n - r.out, 5) || 0)} disabled={r.out >= n}>Sign out 5</Btn>
                <Btn size="sm" kind="ghost" onClick={() => run(kitMove, e.id, item, "back", Math.min(r.out - r.back, 5))} disabled={r.back >= r.out}>Count back</Btn>
                {r.out > 0 && r.back >= r.out ? <St tone="ok">All back</St> : missing > 0 && r.back > 0 ? <St tone="warn">{missing} out</St> : null}
              </div>
            </div>); })}
        </div>
      </Card>
      <div className="oss-stack">
        <Card title="Welfare" icon={I.clock}><div className="oss-small" style={{ lineHeight: 1.6, color: "var(--body)" }}>{cs.welfare}</div></Card>
        <Card title="Uniform" icon={I.user}><div className="oss-small" style={{ lineHeight: 1.6, color: "var(--body)" }}>{cs.uniform}</div>
          <div className="oss-pills" style={{ marginTop: 10 }}>{["S", "M", "L", "XL"].map((z) => <span key={z} className="oss-pill">{z} · {crewOf(s, e).filter((a) => profile(Q.worker(s, a.workerId)).uniform === z).length}</span>)}</div></Card>
      </div>
    </div>
  );
}

function HoursView({ s, e }: { s: OssState; e: EventBooking }) {
  const ls = Q.lines(s, { eventId: e.id });
  const t = Q.totals(ls);
  const so = s.ext.signoffs[e.id];
  if (!ls.length) return <Card><div className="oss-empty"><b>No hours yet</b>Timesheets draft themselves from clock-ins once the event starts.</div></Card>;
  const approved = ls.filter((l) => l.status === "approved" || l.status === "exported").length;
  return (
    <div className="oss-grid oss-main-side" style={{ alignItems: "start" }}>
      <Card title="Hours for this event" meta={ls.length + " timesheet lines"} icon={I.clock}>
        <div className="ev-sum-h">
          <div className="ev-big"><span>Payable</span><b>{fmtHM(t.payable)}</b><small>{approved} of {ls.length} lines approved</small></div>
          <dl className="ev-receipt">
            <div><dt>Rostered</dt><dd>{fmtHM(t.scheduled)}</dd></div>
            <div><dt>Worked</dt><dd>{fmtHM(t.worked)}</dd></div>
            <div><dt>5-hour minimum</dt><dd>+{fmtHM(t.topup)}</dd></div>
            <div><dt>Past scheduled finish</dt><dd>{fmtHM(t.extra)}</dd></div>
            <div className="tot"><dt>Payable</dt><dd>{fmtHM(t.payable)}</dd></div>
          </dl>
        </div>
        <div style={{ marginTop: 14 }}><Btn size="sm" onClick={() => navigate("Timesheets", "review", { kind: "event", id: e.id })}>Open in Timesheets</Btn></div>
      </Card>
      <Card title="Client sign-off" icon={I.check} right={so ? <St tone="ok">Signed by {so.by.split(",")[0]}</St> : undefined}>
        <ol className="ev-steps">
          <li className={approved === ls.length ? "on" : ""}><b>OSS approves every line</b><span>{approved} of {ls.length} approved</span></li>
          <li className={so ? "on" : ""}><b>{Q.clientOf(s, e.clientId).name} signs off</b><span>{so ? "Signed " + fmtDateLong(so.at) + " at " + fmtTime(so.at) + " in the client portal" : "In the client portal"}</span></li>
        </ol>
        {!so && <div style={{ marginTop: 12 }}><Btn size="sm" kind="primary" onClick={() => navigate("Portals", "client", { kind: "client", id: e.clientId })}>Open the client portal</Btn></div>}
      </Card>
    </div>
  );
}

/* ── new booking ──────────────────────────────────────────────────────────── */
type SForm = { label: string; roles: string[]; start: string; end: string; required: number };
const ROLES = ["Stagehand", "General operative", "Event crew", "Site crew", "Steward", "Catering assistant"];
function CreateBooking({ s, close }: { s: OssState; close: () => void }) {
  const [f, setF] = useState<E.BookingForm>({ name: "", clientId: "C04", venueId: "V04", date: "2026-11-27", status: "pending", ownerId: "U03", ppe: ["High-visibility jacket"], docs: [], brief: "", shifts: [{ label: "Event crew", roles: ["Event crew", "Steward"], start: "17:00", end: "23:00", required: 10 }] });
  const [err, setErr] = useState<string | null>(null);
  const [dupOk, setDupOk] = useState(false);
  const dups = E.bookingDuplicates(s, f);
  const set = (p: Partial<E.BookingForm>) => { setF({ ...f, ...p }); setErr(null); setDupOk(false); };
  const setShift = (i: number, p: Partial<SForm>) => set({ shifts: f.shifts.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  const phoneCall = () => set({ name: "3Arena: concert crew", clientId: "C01", venueId: "V01", date: "2026-12-05", status: "confirmed", ownerId: "U03", ppe: ["Safety boots", "High-visibility jacket", "Gloves"], docs: ["MH"],
    brief: "Set-up crew in the morning, event crew in the evening. Report to the OSS supervisor at the loading bay.",
    shifts: [{ label: "Set-up crew", roles: ["Stagehand", "General operative", "Event crew", "Site crew"], start: "08:00", end: "13:00", required: 10 }, { label: "Event crew", roles: ["Event crew", "Stagehand", "General operative", "Steward"], start: "17:00", end: "23:00", required: 20 }] });
  const bad = f.shifts.find((x) => x.end <= x.start && !(x.end < "06:00"));
  const total = f.shifts.reduce((n, x) => n + x.required, 0);
  const save = () => {
    if (!f.name.trim()) { setErr("Give the booking a name."); return; }
    if (bad) { setErr("\"" + bad.label + "\" ends before it starts."); return; }
    if (dups.length && !dupOk) { setErr("Looks like a duplicate of " + dups.map((d) => d.name).join(", ") + ". Save again to keep both."); setDupOk(true); return; }
    const r = run(E.createBooking, f);
    if (r.ok) navigate("Events", "upcoming", { kind: "event", id: r.data.id }); else setErr(r.message);
  };
  return (
    <Drawer title="New booking" eyebrow={"Client call · " + total + " staff across " + f.shifts.length + " shift" + (f.shifts.length > 1 ? "s" : "")} onClose={close} wide
      footer={<><Btn kind="primary" icon={I.check} onClick={save}>{dupOk ? "Save anyway" : f.status === "confirmed" ? "Create booking" : "Save as pending"}</Btn><Btn onClick={close}>Cancel</Btn><span style={{ marginLeft: "auto" }} /><Btn kind="ghost" icon={I.phone} onClick={phoneCall}>Fill from a 3Arena call</Btn></>}>
      <div className="oss-grid oss-g2">
        <Field label="Event name"><input className="oss-input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Aviva: match day stewards" /></Field>
        <Field label="Status" help="Pending bookings show in the calendar but not in staffing totals."><select className="oss-input" value={f.status} onChange={(e) => set({ status: e.target.value as any })}><option value="pending">Pending</option><option value="confirmed">Confirmed</option></select></Field>
        <Field label="Client"><select className="oss-input" value={f.clientId} onChange={(e) => set({ clientId: e.target.value })}>{s.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Venue"><select className="oss-input" value={f.venueId || ""} onChange={(e) => set({ venueId: e.target.value || null })}><option value="">To confirm</option>{s.venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
        <Field label="Date"><input className="oss-input" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} /></Field>
        <Field label="Coordinator"><select className="oss-input" value={f.ownerId} onChange={(e) => set({ ownerId: e.target.value })}>{s.users.filter((u) => (u.perms as string[]).includes("allocate")).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
      </div>
      <Section title="Shifts">
        {f.shifts.map((x, i) => (
          <div key={i} className="oss-card" style={{ padding: 14, marginBottom: 10 }}>
            <div className="oss-grid ev-shiftrow" style={{ gridTemplateColumns: "1.4fr .8fr .8fr .7fr auto", alignItems: "end", gap: 10 }}>
              <Field label="Shift"><input className="oss-input" value={x.label} onChange={(e) => setShift(i, { label: e.target.value })} /></Field>
              <Field label="Start"><TimeSelect value={x.start} onChange={(v) => setShift(i, { start: v })} label="Start" /></Field>
              <Field label="End" err={x.end <= x.start && !(x.end < "06:00") ? "Ends before start" : undefined}><TimeSelect value={x.end} onChange={(v) => setShift(i, { end: v })} label="End" /></Field>
              <Field label="Staff"><input className="oss-input" type="number" min={1} value={x.required} onChange={(e) => setShift(i, { required: Math.max(1, Number(e.target.value) || 1) })} /></Field>
              <Btn kind="ghost" size="sm" disabled={f.shifts.length === 1} onClick={() => set({ shifts: f.shifts.filter((_, k) => k !== i) })}>Remove</Btn>
            </div>
            <div className="oss-pills" style={{ marginTop: 10 }}>{ROLES.map((r) => <Chip key={r} on={x.roles.includes(r)} onClick={() => setShift(i, { roles: x.roles.includes(r) ? x.roles.filter((z) => z !== r) : x.roles.concat([r]) })}>{r}</Chip>)}</div>
          </div>))}
        <Btn size="sm" icon={I.plus} onClick={() => set({ shifts: f.shifts.concat([{ label: "Shift " + (f.shifts.length + 1), roles: ["Event crew"], start: "09:00", end: "17:00", required: 5 }]) })}>Add shift</Btn>
      </Section>
      <div className="oss-grid oss-g2 oss-section">
        <Field label="PPE (shown on every invitation)"><div className="oss-pills">{["Safety boots", "High-visibility jacket", "Gloves", "Hard hat", "Black uniform", "Non-slip footwear"].map((p) => <Chip key={p} on={f.ppe.includes(p)} onClick={() => set({ ppe: f.ppe.includes(p) ? f.ppe.filter((z) => z !== p) : f.ppe.concat([p]) })}>{p}</Chip>)}</div></Field>
        <Field label="Required documents"><div className="oss-pills">{(["MH", "SP", "HACCP", "FA"] as DocType[]).map((t) => <Chip key={t} on={f.docs.includes(t)} onClick={() => set({ docs: f.docs.includes(t) ? f.docs.filter((z) => z !== t) : f.docs.concat([t]) })}>{docLabel(t)}</Chip>)}</div></Field>
      </div>
      <div className="oss-section"><Field label="Instructions for staff"><textarea className="oss-input" rows={3} value={f.brief} onChange={(e) => set({ brief: e.target.value })} placeholder="Where to report, what to wear, who to ask for" /></Field></div>
      {dups.length > 0 && <div className="oss-note warn" style={{ marginTop: 12 }}>Same client and date as {dups.map((d) => d.name).join(", ")}.</div>}
      {err && <div className="oss-note bad" style={{ marginTop: 12 }}>{err}</div>}
    </Drawer>
  );
}
