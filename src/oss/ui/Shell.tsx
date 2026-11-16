/* OSS pieces that plug into the Pulse shell: the page router, the Home widget
   rail, the header (story timeline + phone), the signed-in card and the phone. */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { OssState } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { briefing, SEEDED_QUESTIONS } from "../answers";
import { loadStage, navigate, resetDemo, run, setUi, useOss } from "../store";
import { STAGES } from "../stages";
import { dayKey, fmtDate, fmtHM, fmtTime, minutesBetween, ms, zoned } from "../time";
import { todos } from "../todo";
import { profile, stamp2Check, STAMP2_CAP_MIN } from "../industry";
import { Av, Btn, Cov, I, Icon, kindVar, Row, RIcon, St, Tag, Toasts } from "./kit";
import { RecordDrawer } from "./drawers";
import AgentFace from "../../components/AgentFace";
import Crew, { CREW_PERSONAS } from "../phone/Crew";
import Supervisor from "../phone/Supervisor";
import Events from "../pages/Events";
import Staff from "../pages/Staff";
import Staffing from "../pages/Staffing";
import Attendance from "../pages/Attendance";
import Timesheets from "../pages/Timesheets";
import Messages from "../pages/Messages";
import Reports from "../pages/Reports";
import Agents from "../pages/Agents";
import Dashboard, { dayPulse } from "../pages/Dashboard";
import Activity from "../pages/Activity";
import SettingsPage from "../pages/Settings";
import RecordsExtra, { OntologyLineage } from "../pages/RecordsExtra";
import CalendarPage from "../pages/Calendar";
import Clients from "../pages/Clients";
import Recruitment from "../pages/Recruitment";
import Compliance from "../pages/Compliance";
import Portals from "../pages/Portals";

export { RecordsExtra, OntologyLineage };

export function OssPage({ page, themes, theme, setTheme }: { page: string; themes: { id: string; name: string }[]; theme: string; setTheme: (t: string) => void }) {
  switch (page) {
    case "Dashboard": return <Dashboard />;
    case "Calendar": return <CalendarPage />;
    case "Clients": return <Clients />;
    case "Recruitment": return <Recruitment />;
    case "Compliance": return <Compliance />;
    case "Portals": return <Portals />;
    case "Events": return <Events />;
    case "Staffing": return <Staffing />;
    case "Staff": return <Staff />;
    case "Messages": return <Messages />;
    case "Attendance": return <Attendance />;
    case "Timesheets": return <Timesheets />;
    case "Reports": return <Reports />;
    case "Agents": return <Agents />;
    case "Activity": return <Activity />;
    case "Settings": return <SettingsPage themes={themes} theme={theme} setTheme={setTheme} />;
    default: return null;
  }
}

/** Mounted once: drawers, toasts and hash entry (#crew, #supervisor) for phones. */
export function OssOverlays() {
  useEffect(() => {
    const apply = () => { const h = window.location.hash.replace("#", ""); if (h === "crew" || h === "supervisor") setUi({ role: h, phoneOpen: true }); };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);
  return <><RecordDrawer /><Toasts /></>;
}

/** Suggested questions under the ask box (part of the composer). */
export function AskList({ ask }: { ask: (q: string) => void }) {
  return <div className="oss-asks">{SEEDED_QUESTIONS.slice(0, 5).map((q) => <button key={q} onClick={() => ask(q)}><span>Ask</span>{q}</button>)}</div>;
}

/* ── Home widget rail ─────────────────────────────────────────────────────── */
export function HomeRail({ ask }: { ask: (q: string) => void }) {
  const s = useOss();
  const all = todos(s);
  const urgent = all.filter((t) => t.urgent);
  const ag = E.AGENTS[0];
  const day = dayPulse(s);
  const t = Q.windowTotals(s);
  const open = s.invitations.filter((i) => Q.isActiveInvite(s, i)).sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  const st2 = s.workers.filter((w) => profile(w).rtw.startsWith("Stamp 2")).map((w) => stamp2Check(s, w.id)!).filter((c) => c.total > STAMP2_CAP_MIN - 240).length;
  const n = (x: number) => x.toLocaleString("en-IE");
  void ask;
  return (
    <aside className="oss-rail" aria-label="Today at OSS">
      <section className="oss-card hr-today">
        <div className="hr-h"><span className="oss-eyebrow">Today across OSS</span><span className="hr-date">{fmtDate(s.clock)}, {fmtTime(s.clock)}</span></div>
        <div className="hr-grid">
          <button style={{ ["--c" as any]: "var(--k-2)" }} onClick={() => navigate("Events", "upcoming")}><b>{day.events.length}</b><span>events today</span><small>{day.venues} venues, {n(day.positions)} positions</small></button>
          <button style={{ ["--c" as any]: "var(--ok)" }} onClick={() => navigate("Attendance", "board")}><b>{day.live.length}</b><span>{day.live.length > 0 && <i className="db-pulse" />}live now</span><small>{n(day.onSite)} crew on site</small></button>
          <button style={{ ["--c" as any]: "var(--k-6)" }} onClick={() => navigate("Staffing", "allocate")}><b>{n(day.rostered)}</b><span>crew rostered</span><small>across every desk</small></button>
          <button style={{ ["--c" as any]: "var(--k-1)" }} onClick={() => navigate("Dashboard", "executive")}><b>{t.coverageLabel}</b><span>filled this week</span><small>{n(t.confirmed)} of {n(t.required)}</small></button>
        </div>
      </section>
      {urgent.length > 0 && <section className="oss-card oss-priority">
        <div className="oss-card-h"><span className="ico" style={{ color: "#F6881F", background: "rgba(246,136,31,.12)", borderColor: "transparent" }}><Icon d={I.alert} size={16} /></span><div className="ttl"><h2>{urgent.length} urgent {urgent.length === 1 ? "item" : "items"}</h2><span className="meta">{all.length} things to do in all</span></div></div>
        <div className="oss-card-b flush"><div className="oss-rows">
          {urgent.slice(0, 3).map((x, k) => <Row key={k} lead={x.who ? <Av name={Q.nameOf(s, x.who)} size="sm" /> : undefined} title={x.title} sub={x.sub} onClick={x.actions[0].go} wrap />)}
        </div>
        <div style={{ padding: "4px 12px 6px" }}><Btn size="sm" kind="urgent" icon={I.chevron} onClick={() => navigate("Dashboard", "overview")}>Open the control panel</Btn></div></div>
      </section>}
      {day.live.length > 0 && <section className="oss-card">
        <div className="oss-card-h"><div className="ttl"><h2>Live now</h2><span className="meta">{n(day.onSite)} of {n(day.expected)} crew on site</span></div><span className="oss-tag live">{day.live.length}</span></div>
        <div className="hr-live">
          {day.live.slice(0, 4).map((l) => { const kd = Q.kindOf(s, l.e); return (
            <button key={l.e.id} className="db-lrow" style={{ ["--c" as any]: kindVar(kd) }} onClick={() => navigate("Attendance", "board", { kind: "event", id: l.e.id })}>
              <span className="top"><span className="nm">{l.e.name.split(":")[0]}</span><span className="ct">{l.onSite}<small>/{l.expected}</small></span></span>
              <span className="sub"><Tag c={kindVar(kd)}>{kd}</Tag><span className="oss-ellip">{Q.venueOf(s, l.e.venueId)?.county || ""}</span>{l.late > 0 && <span className="db-late">{l.late} late</span>}</span>
              <span className="db-lbar"><i style={{ width: (l.expected ? (l.onSite / l.expected) * 100 : 0) + "%" }} /></span>
            </button>); })}
          {day.live.length > 4 && <button className="db-more" style={{ margin: "4px 10px" }} onClick={() => navigate("Attendance", "board")}>{day.live.length - 4} more live</button>}
        </div>
      </section>}
      <section className="oss-card">
        <div className="oss-card-h"><div className="ttl"><h2>Starting next</h2><span className="meta">Every desk, next 30 hours</span></div><span className="oss-tag">{day.next.length}</span></div>
        <div className="oss-card-b flush"><div className="oss-rows">
          {day.next.slice(0, 4).map((x) => { const e = Q.eventOf(s, x.eventId); const kd = Q.kindOf(s, e); const c = Q.shiftCoverage(s, x.id); return (
            <Row key={x.id} onClick={() => navigate("Events", "upcoming", { kind: "event", id: e.id })} lead={<DateBadge iso={x.start} />}
              title={<><span className="hr-k" style={{ ["--c" as any]: kindVar(kd), marginRight: 7 }} />{e.name.split(":")[0]}</>} sub={fmtTime(x.start) + " · " + x.label + " · " + c.confirmed + "/" + c.required} />); })}
          {!day.next.length && <div className="oss-small oss-muted" style={{ padding: "4px 12px 10px" }}>Nothing else starts in the next 30 hours.</div>}
        </div></div>
      </section>
      <section className="oss-card">
        <div className="oss-card-h"><div className="ttl"><h2>Waiting for a reply</h2><span className="meta">Oldest first</span></div><span className="oss-tag">{open.length}</span></div>
        <div className="oss-card-b flush"><div className="oss-rows">
          {open.slice(0, 3).map((i) => <Row key={i.id} lead={<Av name={Q.nameOf(s, i.workerId)} size="sm" />} title={Q.nameOf(s, i.workerId)} sub={Q.shiftOf(s, i.shiftId).label + ", " + fmtDate(Q.shiftOf(s, i.shiftId).start)} end={<span className="when">{fmtHM(minutesBetween(i.sentAt, s.clock))}</span>} onClick={() => navigate("Staffing", "responses")} />)}
          {!open.length && <div className="oss-small oss-muted" style={{ padding: "4px 12px 10px" }}>Everyone has answered.</div>}
        </div></div>
      </section>
      <section className="oss-card">
        <div className="oss-card-h"><div className="ttl"><h2>Crew compliance</h2><span className="meta">{n(s.workers.length)} crew · right to work, rest and documents</span></div></div>
        <div className="oss-card-b"><div className="oss-mini">
          <button onClick={() => navigate("Compliance", "rtw")}><div className="v" style={{ color: st2 ? "var(--warn)" : undefined }}>{st2}</div><div className="l">Stamp 2 near 20h</div></button>
          <button onClick={() => navigate("Staff", "documents")}><div className="v">{Q.expiringDocs(s).length}</div><div className="l">Documents expiring</div></button>
        </div></div>
      </section>
      <section className="oss-card">
        <div className="oss-card-h"><AgentFace shape={ag.shape} state="idle" tint={ag.tint} size="30" /><div className="ttl"><h2>Briefing</h2><span className="meta">{fmtDate(s.clock)}, {fmtTime(s.clock)}</span></div></div>
        <div className="oss-card-b"><div className="oss-brief"><p>{briefing(s)}</p></div></div>
      </section>
    </aside>
  );
}

export function DateBadge({ iso }: { iso: string }) {
  const d = fmtDate(iso).split(" ");
  return <span style={{ flex: "none", width: 42, height: 46, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--border)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
    <span style={{ fontFamily: "var(--mono)", fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--faint)" }}>{d[0]}</span>
    <span style={{ fontSize: 17, fontWeight: 600, color: "var(--ink)", marginTop: 3, fontVariantNumeric: "tabular-nums" }}>{d[1]}</span>
  </span>;
}

export function attention(s: OssState) {
  type T = "ok" | "warn" | "bad" | "info";
  const out: { title: string; sub: string; icon: string; tone: T; go: () => void; rank: number }[] = [];
  Q.replacementQueue(s).filter((r) => r.open).forEach((r) => out.push({ rank: 0, title: r.worker.name + " cancelled", sub: r.shift.label + " · " + (r.pendingInv.length ? "replacement invited" : "needs a replacement"), icon: I.swap, tone: "bad", go: () => navigate("Staffing", "replacements") }));
  Q.lines(s).filter((l) => l.status === "incomplete").forEach((l) => out.push({ rank: 1, title: l.worker.name + ": no clock-" + (l.rawIn ? "out" : "in"), sub: l.event.name.split(":")[0] + " · correct before approval", icon: I.clock, tone: "bad", go: () => navigate("Timesheets", "corrections") }));
  s.corrections.filter((c) => c.status === "proposed").forEach((c) => out.push({ rank: 1, title: "Approve " + Q.nameOf(s, Q.asgOf(s, c.assignmentId).workerId) + "'s correction", sub: "Clock-" + c.field + " " + fmtTime(c.proposed) + " · from " + Q.nameOf(s, c.requestedBy), icon: I.check, tone: "warn", go: () => navigate("Timesheets", "corrections") }));
  Q.windowEvents(s).forEach((e) => { const c = Q.eventCoverage(s, e.id); if (c.unfilled && Q.eventPhase(s, e) === "upcoming") out.push({ rank: 2, title: e.name.split(":")[0] + ": " + c.unfilled + " to fill", sub: c.confirmed + "/" + c.required + " confirmed · " + c.awaiting + " awaiting · " + fmtDate(zoned(e.date, "12:00")), icon: I.users, tone: "warn", go: () => navigate("Staffing", "allocate", { kind: "event", id: e.id }) }); });
  Q.openExceptions(s).forEach((x) => out.push({ rank: 1, title: Q.nameOf(s, Q.asgOf(s, x.assignmentId).workerId) + ": " + x.reason.toLowerCase().replace(/\.$/, ""), sub: "Attendance exception", icon: I.alert, tone: "bad", go: () => navigate("Attendance", "exceptions") }));
  s.items.filter((i) => i.state === "blocked" || i.state === "failed").forEach((i) => out.push({ rank: 2, title: Q.nameOf(s, i.snapshot.workerId) + "'s hours not in Bullhorn", sub: "Needs a candidate match · " + (i.snapshot.payableMin / 60) + "h approved", icon: I.link, tone: "bad", go: () => navigate("Timesheets", "bullhorn") }));
  const ready = Q.lines(s).filter((l) => l.status === "ready" || l.status === "needs_review").length;
  if (ready) out.push({ rank: 3, title: ready + " timesheet lines to approve", sub: "Generated from clock records", icon: I.doc, tone: "info", go: () => navigate("Timesheets", "review") });
  const exp = Q.expiringDocs(s);
  if (exp.length) out.push({ rank: 4, title: exp.length + " document" + (exp.length > 1 ? "s" : "") + " expiring within 30 days", sub: "Next: " + Q.nameOf(s, exp[0].workerId) + ", " + fmtDate(zoned(exp[0].expires, "12:00")), icon: I.shield, tone: "warn", go: () => navigate("Staff", "documents") });
  return out.sort((a, b) => a.rank - b.rank);
}

/* ── header: story timeline + phone ───────────────────────────────────────── */
const MOMENTS: [string, string, string][] = [
  ["2026-11-13", "09:00", "Fri 09:00"], ["2026-11-14", "06:00", "Sat 06:00 · arrival prompts"], ["2026-11-14", "16:50", "Sat 16:50"], ["2026-11-14", "17:00", "Sat 17:00 · event crew starts"],
  ["2026-11-14", "17:12", "Sat 17:12 · missed clock-in check"], ["2026-11-14", "17:20", "Sat 17:20"], ["2026-11-14", "23:00", "Sat 23:00 · event ends"], ["2026-11-14", "23:12", "Sat 23:12 · missed clock-out check"], ["2026-11-15", "08:30", "Sun 08:30"]
];
export function HeaderControls() {
  const s = useOss();
  const p = Q.userOf(s, "U01")!;
  return (
    <div className="oss-hdr">
      <button className="oss-user" onClick={() => navigate("Settings", "team")} title="Signed in">
        <Av name={p.name} size="sm" /><span><b>{p.name}</b><span>{p.role}</span></span>
      </button>
    </div>
  );
}

/** Bottom bar, as in the Pulse demos: sample-data marker, the story clock and the portals. */
export function BottomBar() {
  const s = useOss();
  const [open, setOpen] = useState(false);
  const phone = s.ui.phoneOpen;
  const openApp = (role: "crew" | "supervisor") => setUi({ phoneOpen: true, role });
  return (
    <div className="oss-bottombar">
      <span className="oss-bchip muted">Sample data</span>
      <button className="oss-bchip story" onClick={() => setOpen(!open)} aria-expanded={open} title="Move through the 3Arena story">
        <span className="dots" aria-hidden="true">{STAGES.map((st) => <i key={st.n} className={st.n <= s.ui.stage ? "on" : ""} />)}</span>
        {fmtDate(s.clock)}, {fmtTime(s.clock)} Dublin
      </button>
      <span className="sep" />
      <button className={"oss-bchip" + (phone && s.ui.role !== "supervisor" ? " on" : "")} onClick={() => (phone && s.ui.role !== "supervisor" ? setUi({ phoneOpen: false, role: "office" }) : openApp("crew"))}><Icon d={I.phone} size={12} />Crew app</button>
      <button className={"oss-bchip" + (phone && s.ui.role === "supervisor" ? " on" : "")} onClick={() => (phone && s.ui.role === "supervisor" ? setUi({ phoneOpen: false, role: "office" }) : openApp("supervisor"))}><Icon d={I.pin} size={12} />Supervisor app</button>
      <button className="oss-bchip" onClick={() => navigate("Portals", "client")}><Icon d={I.briefcase} size={12} />Client portal</button>
      <button className="oss-bchip" onClick={() => navigate("Portals", "overview")}><Icon d={I.grid} size={12} />All portals</button>
      {open && createPortal(<div data-theme={document.querySelector("[data-theme]")?.getAttribute("data-theme") || "harbour"} style={{ fontFamily: "var(--ui)", color: "var(--ink)" }}><Story s={s} close={() => setOpen(false)} /></div>, document.body)}
    </div>
  );
}

function Story({ s, close }: { s: OssState; close: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const future = MOMENTS.filter(([d, t]) => ms(zoned(d, t)) > ms(s.clock)).slice(0, 4);
  const evening = Q.shiftOf(s, "SH-001B");
  const eveIn = s.assignments.filter((a) => a.shiftId === "SH-001B" && a.status === "confirmed");
  const canIn = dayKey(s.clock) === "2026-11-14" && ms(s.clock) >= ms(evening.start) - 3600000 && eveIn.some((a) => !Q.verifiedIn(s, a.id));
  const canOut = eveIn.some((a) => Q.verifiedIn(s, a.id) && !Q.verifiedOut(s, a.id));
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 79 }} onClick={close} />
      <div className="oss-pop up" role="dialog" aria-label="Story timeline">
        <div style={{ padding: "18px 20px 6px" }}>
          <div className="oss-eyebrow">The 3Arena story</div>
          <div style={{ fontSize: 19, fontWeight: 500, letterSpacing: "-.4px", marginTop: 6 }}>{fmtDate(s.clock)}, {fmtTime(s.clock)}</div>
        </div>
        <div className="oss-steps">
          {STAGES.map((st) => (
            <button key={st.n} className={"oss-step" + (s.ui.stage === st.n ? " on" : st.n < s.ui.stage ? " done" : "")} onClick={() => { loadStage(st.n); close(); }}>
              <span className="n">{st.n}</span><span><b>{st.name}</b><span>{st.detail}</span></span>
            </button>))}
        </div>
        {(future.length > 0 || canIn || canOut) && <div style={{ padding: "4px 20px 16px", borderTop: "1px solid var(--border)" }}>
          <div className="oss-label" style={{ margin: "12px 0 8px" }}>Move the clock</div>
          <div className="oss-pills">
            {future.map(([d, t, l]) => <button key={l} className="oss-btn sm" onClick={() => run(E.setClock, zoned(d, t))}>{l}</button>)}
            {canIn && <button className="oss-btn sm" onClick={() => run(E.simulateClockIns, "SH-001B")}>Crew checks in</button>}
            {canOut && <button className="oss-btn sm" onClick={() => run(E.simulateClockOuts, "SH-001B")}>Crew clocks out</button>}
          </div>
        </div>}
        <div style={{ padding: "12px 20px 18px", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 10 }}>
          <span className="oss-tiny oss-muted" style={{ flex: 1 }}>Sample data. Messages, GPS and Bullhorn are simulated.</span>
          <button className="oss-btn sm ghost" onClick={() => { resetDemo(); close(); }}>Start over</button>
        </div>
      </div>
    </>
  );
}

/** Signed-in card in the side rail. */
export function PersonaCard({ compact }: { compact?: boolean }) {
  const s = useOss();
  const p = Q.userOf(s, "U01")!;
  if (compact) return <Av name={p.name} size="lg" />;
  return (
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-.3px", color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
      <div style={{ marginTop: 2, fontSize: 12, color: "var(--faint)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.role}</div>
    </div>
  );
}
export const personaInitials = () => null;

/* ── the phone ───────────────────────────────────────────────────────────── */
export function PhoneDock() {
  const s = useOss();
  if (!s.ui.phoneOpen) return null;
  const crew = s.ui.role !== "supervisor";
  const now = fmtTime(s.clock);
  const wid = s.ui.crewWorkerId;
  return (
    <aside className="oss-phonewrap" aria-label={crew ? "OSS Crew app" : "Supervisor app"}>
      <div className="oss-phonebar">
        <div className="oss-seg" role="tablist" aria-label="App">
          <button className={crew ? "on" : ""} onClick={() => setUi({ role: "crew" })}>Employee</button>
          <button className={!crew ? "on" : ""} onClick={() => setUi({ role: "supervisor" })}>Supervisor</button>
        </div>
        {crew ? <select value={wid} onChange={(e) => setUi({ crewWorkerId: e.target.value })} aria-label="Signed in as">
          {CREW_PERSONAS.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          {!CREW_PERSONAS.some(([id]) => id === wid) && <option value={wid}>{Q.worker(s, wid)?.name}</option>}
        </select> : <span className="oss-small oss-dim" style={{ flex: 1, paddingLeft: 6 }}>Mark Walsh</span>}
        <button className="oss-x" style={{ width: 32, height: 32 }} onClick={() => setUi({ phoneOpen: false, role: "office" })} aria-label="Close phone"><Icon d={I.x} size={12} /></button>
      </div>
      <div className="oss-phone">
        <div className="oss-screen crew">
          <div className="oss-island" aria-hidden="true" />
          <div className="oss-status" aria-hidden="true">
            <span>{now}</span>
            <span className="ic">
              <svg width="18" height="12" viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1" /><rect x="5" y="5.5" width="3" height="6.5" rx="1" /><rect x="10" y="3" width="3" height="9" rx="1" /><rect x="15" y="0" width="3" height="12" rx="1" /></svg>
              <svg width="25" height="12" viewBox="0 0 25 12" fill="none"><rect x=".5" y=".5" width="21" height="11" rx="3.5" stroke="currentColor" opacity=".4" /><rect x="2" y="2" width="16" height="8" rx="2" fill="currentColor" /><rect x="23" y="4" width="1.5" height="4" rx=".75" fill="currentColor" opacity=".4" /></svg>
            </span>
          </div>
          {crew ? <Crew /> : <Supervisor />}
          <div className="oss-homebar" aria-hidden="true" />
        </div>
      </div>
    </aside>
  );
}

export { St };
