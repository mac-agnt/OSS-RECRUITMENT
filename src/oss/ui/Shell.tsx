/* OSS pieces that plug into the Pulse shell: the Home widget rail, header
   controls (demo stages, role preview, persona), the phone dock and the page router. */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { OssState } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { briefing, SEEDED_QUESTIONS } from "../answers";
import { loadStage, navigate, openDrawer, resetDemo, run, setUi, useOss } from "../store";
import { STAGES } from "../stages";
import { addMin, dayKey, fmtDate, fmtTime, ms, relTime, zoned } from "../time";
import { Cov, I, Icon, St, Toasts } from "./kit";
import { RecordDrawer } from "./drawers";
import Crew, { CREW_PERSONAS } from "../phone/Crew";
import Supervisor from "../phone/Supervisor";
import Events from "../pages/Events";
import Workforce from "../pages/Workforce";
import Staffing from "../pages/Staffing";
import LiveOps from "../pages/LiveOps";
import Timesheets from "../pages/Timesheets";
import Work from "../pages/Work";
import Agents from "../pages/Agents";
import Dashboard from "../pages/Dashboard";
import Activity from "../pages/Activity";
import SettingsPage from "../pages/Settings";
import RecordsExtra, { OntologyLineage } from "../pages/RecordsExtra";

export { RecordsExtra, OntologyLineage };

export function OssPage({ page, themes, theme, setTheme }: { page: string; themes: { id: string; name: string }[]; theme: string; setTheme: (t: string) => void }) {
  switch (page) {
    case "Events": return <Events />;
    case "Workforce": return <Workforce />;
    case "Staffing": return <Staffing />;
    case "Live Operations": return <LiveOps />;
    case "Timesheets": return <Timesheets />;
    case "Work": return <Work />;
    case "Agents": return <Agents />;
    case "Dashboard": return <Dashboard />;
    case "Activity": return <Activity />;
    case "Settings": return <SettingsPage themes={themes} theme={theme} setTheme={setTheme} />;
    default: return null;
  }
}

/** Mounted once: drawers, toasts and hash-based role entry (#crew, #supervisor). */
export function OssOverlays() {
  useEffect(() => {
    const apply = () => { const h = window.location.hash.replace("#", ""); if (h === "crew" || h === "supervisor") setUi({ role: h, phoneOpen: true }); };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);
  return <><RecordDrawer /><Toasts /></>;
}

/* ── Home widget rail: briefing, decision metrics, attention, events, activity ── */
export function HomeRail({ ask }: { ask: (q: string) => void }) {
  const s = useOss();
  const t = Q.windowTotals(s);
  const attn = attention(s);
  const recent = s.audit.slice(-6).reverse();
  const handled = s.agentRuns.slice(-3).reverse();
  return (
    <aside className="oss-rail" aria-label="Today at OSS">
      <section className="oss-card">
        <div className="oss-card-h"><h2>Briefing</h2><span className="meta">{fmtDate(s.clock)} {fmtTime(s.clock)}</span></div>
        <div className="oss-card-b">
          <div className="oss-small" style={{ lineHeight: 1.6, color: "var(--body)" }}>{briefing(s)}</div>
          <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
            {SEEDED_QUESTIONS.map((q) => <button key={q} className="oss-btn sm" style={{ justifyContent: "flex-start", height: "auto", minHeight: 30, padding: "6px 10px", whiteSpace: "normal", textAlign: "left" }} onClick={() => ask(q)}><Icon d={I.msg} size={12} />{q}</button>)}
          </div>
        </div>
      </section>
      <section className="oss-card">
        <div className="oss-card-h"><h2>Positions</h2><span className="meta">{Q.windowLabel(s)} · confirmed bookings</span></div>
        <div className="oss-card-b">
          <div className="oss-mini">
            <button onClick={() => navigate("Staffing", "coverage")}><div className="v">{t.required}</div><div className="l">Required</div></button>
            <button onClick={() => navigate("Staffing", "coverage")}><div className="v">{t.confirmed}</div><div className="l">Confirmed · {t.coverageLabel}</div></button>
            <button onClick={() => navigate("Staffing", "replacements")}><div className="v" style={{ color: t.unfilled ? "var(--warn)" : undefined }}>{t.unfilled}</div><div className="l">Unfilled</div></button>
            <button onClick={() => navigate("Staffing", "invitations")}><div className="v">{t.awaiting}</div><div className="l">Awaiting reply</div></button>
          </div>
        </div>
      </section>
      <section className="oss-card">
        <div className="oss-card-h"><h2>Needs attention</h2><span className="meta">{attn.length}</span></div>
        <div className="oss-card-b">
          {attn.map((a, i) => <button key={i} className="oss-attn" onClick={a.go}><Icon d={a.icon} size={15} style={{ color: a.tone, marginTop: 2, flex: "none" }} /><span><div className="t">{a.title}</div><div className="s">{a.sub}</div></span></button>)}
          {!attn.length && <div className="oss-small oss-muted">Nothing needs attention.</div>}
        </div>
      </section>
      <section className="oss-card">
        <div className="oss-card-h"><h2>Upcoming bookings</h2></div>
        <div className="oss-card-b" style={{ display: "grid", gap: 8 }}>
          {t.events.map((e) => (
            <button key={e.id} className="oss-attn" style={{ borderTop: 0, padding: 0 }} onClick={() => navigate("Staffing", "allocation", { kind: "event", id: e.id })}>
              <span style={{ flex: 1, minWidth: 0 }}><div className="t">{e.name.split(":")[0]}</div><div className="s">{fmtDate(zoned(e.date, "12:00"))} · {Q.clientOf(s, e.clientId).name}</div><div style={{ marginTop: 5 }}><Cov c={Q.eventCoverage(s, e.id)} compact /></div></span>
            </button>))}
        </div>
      </section>
      <section className="oss-card">
        <div className="oss-card-h"><h2>Activity</h2><button className="oss-link oss-small" style={{ marginLeft: "auto" }} onClick={() => navigate("Activity", "all")}>All</button></div>
        <div className="oss-card-b">{recent.map((a) => <div key={a.id} className="oss-small" style={{ padding: "6px 0", borderTop: "1px solid var(--border)" }}><span className="oss-ink">{a.summary}</span><div className="oss-tiny oss-muted">{relTime(a.at, s.clock)} · {a.actor}{a.result === "simulated" ? " · simulated" : a.result === "rejected" ? " · rejected" : ""}</div></div>)}</div>
      </section>
      <section className="oss-card">
        <div className="oss-card-h"><h2>Handled in this demo</h2></div>
        <div className="oss-card-b">{handled.map((r) => <div key={r.id} className="oss-small" style={{ padding: "6px 0", borderTop: "1px solid var(--border)" }}><span className="oss-ink">{E.AGENTS.find((a) => a.id === r.agentId)?.name}</span>: {r.findings[0]}<div className="oss-tiny oss-muted">{fmtDate(r.at)} {fmtTime(r.at)} · {r.trigger === "run_now" ? "run on request" : "seeded run"}</div></div>)}</div>
      </section>
    </aside>
  );
}

function attention(s: OssState) {
  const out: { title: string; sub: string; icon: string; tone: string; go: () => void; rank: number }[] = [];
  const h = Q.eventCoverage(s, "EVT-001");
  if (h.unfilled) out.push({ rank: 1, title: "3Arena: " + h.unfilled + "-position gap", sub: h.confirmed + "/" + h.required + " confirmed · " + h.awaiting + " awaiting · Sat 14 Nov", icon: I.users, tone: "var(--warn)", go: () => navigate("Staffing", "allocation", { kind: "event", id: "EVT-001" }) });
  Q.replacementQueue(s).filter((r) => r.open).forEach((r) => out.push({ rank: 0, title: r.worker.name + " cancelled " + r.shift.label.toLowerCase(), sub: r.pendingInv.length ? "Replacement invitation out" : "Choose a standby replacement", icon: I.swap, tone: "var(--bad)", go: () => navigate("Staffing", "replacements") }));
  s.items.filter((i) => i.state === "blocked").forEach((i) => out.push({ rank: 2, title: "1 blocked Bullhorn line · " + (i.snapshot.payableMin / 60) + " hours", sub: Q.nameOf(s, i.snapshot.workerId) + " · worker mapping required", icon: I.link, tone: "var(--bad)", go: () => openDrawer("mapping", i.snapshot.workerId) }));
  if (Q.docState(s, "W033", "MH", Q.shiftOf(s, "SH-001A").end).state === "expired" && ms(s.clock) < ms(Q.shiftOf(s, "SH-001B").end)) out.push({ rank: 3, title: "Eoin Brennan ineligible for Saturday", sub: "Manual Handling valid through 13 Nov only", icon: I.shield, tone: "var(--warn)", go: () => openDrawer("worker", "W033") });
  const exp = Q.expiringDocs(s).filter((d) => d.workerId !== "W033")[0];
  if (exp) out.push({ rank: 4, title: "Next expiring: " + Q.nameOf(s, exp.workerId), sub: "Manual Handling".replace("Manual Handling", exp.type === "MH" ? "Manual Handling" : exp.type) + " expires " + exp.expires.slice(8) + " " + fmtDate(zoned(exp.expires, "12:00")).split(" ").pop(), icon: I.doc, tone: "var(--dim)", go: () => navigate("Workforce", "documents") });
  const inc = Q.lines(s).filter((l) => l.status === "incomplete");
  inc.forEach((l) => out.push({ rank: 1, title: l.worker.name + ": clock-" + (l.rawIn ? "out" : "in") + " missing", sub: l.event.name.split(":")[0] + " " + l.shift.label.toLowerCase() + " · needs a correction", icon: I.clock, tone: "var(--bad)", go: () => navigate("Timesheets", "corrections") }));
  const corr = s.corrections.filter((c) => c.status === "proposed");
  corr.forEach((c) => out.push({ rank: 1, title: "Correction waiting: " + Q.nameOf(s, Q.asgOf(s, c.assignmentId).workerId), sub: "Clock-" + c.field + " " + fmtTime(c.proposed) + " · proposed by " + Q.nameOf(s, c.requestedBy), icon: I.check, tone: "var(--warn)", go: () => navigate("Timesheets", "corrections") }));
  return out.sort((a, b) => a.rank - b.rank).slice(0, 6);
}

/* ── header: demo chip + role switch ─────────────────────────────────────── */
const MOMENTS: [string, string, string][] = [
  ["2026-11-12", "17:00", "Thu 17:00"], ["2026-11-13", "09:00", "Fri 09:00"], ["2026-11-14", "06:00", "Sat 06:00 (arrival prompts)"], ["2026-11-14", "15:30", "Sat 15:30 (before evening)"],
  ["2026-11-14", "16:50", "Sat 16:50"], ["2026-11-14", "17:00", "Sat 17:00 (evening starts)"], ["2026-11-14", "17:12", "Sat 17:12 (missed-clock check)"], ["2026-11-14", "17:20", "Sat 17:20"],
  ["2026-11-14", "23:00", "Sat 23:00 (evening ends)"], ["2026-11-14", "23:12", "Sat 23:12 (missed checkout check)"], ["2026-11-15", "08:30", "Sun 08:30"]
];
export function HeaderControls() {
  const s = useOss();
  const [open, setOpen] = useState(false);
  const p = Q.persona(s);
  return (
    <div className="oss-hdr">
      <button className="oss-demo-chip" onClick={() => setOpen(!open)} aria-expanded={open} title={"Demo controls · sample data · scenario " + fmtDate(s.clock) + " " + fmtTime(s.clock)}>
        <Icon d={I.play} size={11} />Demo · <b>{fmtDate(s.clock).replace(/ \d+ \w+$/, "")} {fmtTime(s.clock)}</b>
      </button>
      <div className="oss-seg" role="group" aria-label="Preview as">
        {(["office", "crew", "supervisor"] as const).map((r) => <button key={r} className={s.ui.role === r ? "on" : ""} onClick={() => setUi({ role: r, phoneOpen: r !== "office" })} title={r === "office" ? "Office: " + p.name : r === "crew" ? "Employee app (OSS Crew)" : "Site supervisor (Mark Walsh)"}>{r === "office" ? "Office" : r === "crew" ? "Crew" : "Supervisor"}</button>)}
      </div>
      {open && createPortal(<div data-theme={document.querySelector("[data-theme]")?.getAttribute("data-theme") || "harbour"} style={{ fontFamily: "var(--ui)", color: "var(--ink)" }}><DemoControls s={s} close={() => setOpen(false)} /></div>, document.body)}
    </div>
  );
}

function DemoControls({ s, close }: { s: OssState; close: () => void }) {
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") close(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, []);
  const future = MOMENTS.filter(([d, t]) => ms(zoned(d, t)) > ms(s.clock)).slice(0, 5);
  const stageLoad = (n: number) => { if (!s.ui.dirty || window.confirm("Load \"" + STAGES[n - 1].name + "\"? Workshop edits since the last stage load are replaced.")) { loadStage(n); } };
  const advance = (iso: string) => run(E.setClock, iso);
  const evening = Q.shiftOf(s, "SH-001B");
  const eveIn = s.assignments.filter((a) => a.shiftId === "SH-001B" && a.status === "confirmed");
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 79 }} onClick={close} />
      <div className="oss-pop" role="dialog" aria-label="Demo controls">
        <div style={{ padding: "16px 16px 6px" }}>
          <div className="oss-row"><b className="grow" style={{ fontSize: 15 }}>Demo controls</b><button className="oss-x" onClick={close} aria-label="Close"><Icon d={I.x} size={12} /></button></div>
          <div className="oss-small oss-dim" style={{ marginTop: 4 }}>Reproducible workshop scenario, not OSS's live operation. Scenario time only moves when you move it.</div>
        </div>
        <div style={{ padding: "8px 16px" }}>
          <div className="oss-label" style={{ marginBottom: 6 }}>Stages</div>
          <div style={{ display: "grid", gap: 6 }}>{STAGES.map((st) => <button key={st.n} className={"oss-stage" + (s.ui.stage === st.n ? " on" : "")} onClick={() => stageLoad(st.n)}><span className="n">{st.n}</span><span><b className="oss-ink">{st.name}</b><div className="oss-tiny oss-muted">{st.detail}</div></span></button>)}</div>
        </div>
        <div style={{ padding: "8px 16px" }}>
          <div className="oss-label" style={{ marginBottom: 6 }}>Scenario time · {fmtDate(s.clock)} {fmtTime(s.clock)}</div>
          <div className="oss-pills">
            <button className="oss-btn sm" onClick={() => advance(addMin(s.clock, 30))}>+30 min</button>
            <button className="oss-btn sm" onClick={() => advance(addMin(s.clock, 120))}>+2 h</button>
            {future.map(([d, t, l]) => <button key={l} className="oss-btn sm" onClick={() => advance(zoned(d, t))}>{l}</button>)}
          </div>
          <div className="oss-tiny oss-muted" style={{ marginTop: 6 }}>Advancing runs due reminders and missed-clock alerts once each. It never accepts invitations or records attendance.</div>
        </div>
        <div style={{ padding: "8px 16px" }}>
          <div className="oss-label" style={{ marginBottom: 6 }}>Story shortcuts</div>
          <div className="oss-pills">
            <button className="oss-btn sm" onClick={() => { setUi({ role: "crew", crewWorkerId: "W009", phoneOpen: true }); close(); }}>Aidan's phone</button>
            <button className="oss-btn sm" onClick={() => { setUi({ role: "crew", crewWorkerId: "W014", phoneOpen: true }); close(); }}>Chloé's phone</button>
            <button className="oss-btn sm" onClick={() => { setUi({ role: "crew", crewWorkerId: "W031", phoneOpen: true }); close(); }}>Orla's phone</button>
            <button className="oss-btn sm" onClick={() => { setUi({ role: "crew", crewWorkerId: "W021", phoneOpen: true }); close(); }}>Owen's phone</button>
            <button className="oss-btn sm" onClick={() => { setUi({ role: "supervisor", phoneOpen: true }); close(); }}>Mark (supervisor)</button>
            {dayKey(s.clock) === "2026-11-14" && ms(s.clock) >= ms(evening.start) - 3600000 && eveIn.some((a) => !Q.verifiedIn(s, a.id)) && <button className="oss-btn sm" onClick={() => run(E.simulateClockIns, "SH-001B")}>Simulate evening check-ins</button>}
            {eveIn.some((a) => Q.verifiedIn(s, a.id) && !Q.verifiedOut(s, a.id)) && <button className="oss-btn sm" onClick={() => run(E.simulateClockOuts, "SH-001B")}>Simulate evening clock-outs (fixture)</button>}
          </div>
        </div>
        <div style={{ padding: "8px 16px 16px" }}>
          <div className="oss-note" style={{ fontSize: 12 }}>
            <b>Functional locally:</b> bookings, availability, eligibility, invitations, cancellation, replacement, clocking, corrections, approvals, CSV export, mapping and retry, audit.<br />
            <b>Simulated:</b> message delivery, GPS and QR, offline sync, Bullhorn receipts, AI agents, role access.<br />
            <b>Out of scope:</b> backend, real identity, Sage and Bright, payroll, tracking.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button className="oss-btn sm danger" onClick={() => { if (window.confirm("Reset the whole demo to the canonical Thursday snapshot?")) { resetDemo(); close(); } }}>Reset demo</button>
            <span className="oss-tiny oss-muted" style={{ alignSelf: "center" }}>Stage {s.ui.stage}{s.ui.dirty ? " · edited" : ""}</span>
          </div>
        </div>
      </div>
    </>
  );
}

/** Office persona switcher for the side rail's signed-in card. */
export function PersonaCard({ compact }: { compact?: boolean }) {
  const s = useOss();
  const p = Q.persona(s);
  if (compact) return <span className="oss-av lg" title={p.name + " · " + p.role}>{p.initials}</span>;
  return (
    <div style={{ minWidth: 0, flex: 1 }}>
      <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: "-.3px", color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
      <select value={p.id} onChange={(e) => setUi({ personaId: e.target.value })} aria-label="Act as office persona"
        style={{ marginTop: 3, width: "100%", background: "none", border: 0, padding: 0, color: "var(--faint)", fontSize: 12, cursor: "pointer", font: "inherit" }}>
        {s.users.map((u) => <option key={u.id} value={u.id}>{u.role}{u.known ? "" : " (demo persona)"} · {u.name}</option>)}
      </select>
    </div>
  );
}
export const personaInitials = () => null;

/* ── phone dock ──────────────────────────────────────────────────────────── */
export function PhoneDock() {
  const s = useOss();
  if (s.ui.role === "office") return null;
  const crew = s.ui.role === "crew";
  return (
    <aside className="oss-dock" aria-label={crew ? "OSS Crew preview" : "Supervisor preview"}>
      <div className="oss-dock-h">
        <Icon d={I.phone} size={14} />
        <b style={{ color: "var(--ink)" }}>{crew ? "OSS Crew" : "Supervisor"}</b>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{crew ? "employee view" : "supervisor view"} · same records as the office</span>
        <button className="oss-btn sm" onClick={() => setUi({ role: "office", phoneOpen: false })}>Back to office</button>
      </div>
      <div className="oss-dock-b">{crew ? <Crew /> : <Supervisor />}</div>
    </aside>
  );
}

export { St };
