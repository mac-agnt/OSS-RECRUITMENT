import { useState } from "react";
import type { DocType, OssState } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { docLabel } from "../seed";
import { navigate, openDrawer, run, useOss } from "../store";
import { tabOf } from "../modules";
import { addDays, dayKey, fmtDate, fmtTime, weekday, zoned } from "../time";
import { Btn, Card, Cov, Drawer, Empty, Field, I, Metric, Page, S, Scope, Seg, St, Table, TimeSelect } from "../ui/kit";
import { RecLink } from "../ui/fmt";

export default function Events() {
  const s = useOss();
  const tab = tabOf(s, "Events");
  const [creating, setCreating] = useState(false);
  const create = <Btn kind="primary" icon={I.plus} onClick={() => setCreating(true)}>Create booking</Btn>;
  return <>
    {tab === "calendar" ? <Calendar s={s} action={create} /> : tab === "bookings" ? <Bookings s={s} action={create} /> : tab === "clients" ? <Clients s={s} /> : tab === "programme" ? <Programme s={s} /> : <Overview s={s} action={create} />}
    {creating && <CreateBooking s={s} close={() => setCreating(false)} />}
  </>;
}

const phaseLabel = (p: string) => (p === "upcoming" ? "Upcoming" : p === "live" ? "Live" : "Completed");

function Overview({ s, action }: { s: OssState; action: any }) {
  const [mode, setMode] = useState<"firm" | "pending">("firm");
  const t = Q.windowTotals(s), pend = Q.pendingDemand(s);
  const rows = mode === "firm" ? t.events : pend.events;
  return (
    <Page title="Events" sub="Bookings OSS staffs for its clients. The booking client, the event and the venue are separate records." actions={action}
      scope={<Scope><b>{Q.windowLabel(s)}</b></Scope>}>
      <div className="oss-grid oss-g4" style={{ marginBottom: 14 }}>
        <Metric label="Firm demand" value={t.required + " positions"} sub={t.events.length + " confirmed bookings"} onClick={() => setMode("firm")} />
        <Metric label="Confirmed" value={t.confirmed} sub={t.coverageLabel + " coverage"} onClick={() => navigate("Staffing", "coverage")} />
        <Metric label="Unfilled" value={t.unfilled} tone={t.unfilled ? "warn" : "ok"} sub={t.awaiting + " awaiting reply"} onClick={() => navigate("Staffing", "allocation")} />
        <Metric label="Pending (not in firm totals)" value={pend.positions + " positions"} sub={pend.events.length + " pending bookings"} onClick={() => setMode("pending")} />
      </div>
      <Card pad={false} title={<Seg value={mode} onChange={setMode} options={[{ id: "firm", label: "Firm", n: t.events.length }, { id: "pending", label: "Pending", n: pend.events.length }]} />}>
        <Table rows={rows} rowKey={(e) => e.id} onRow={(e) => openDrawer("event", e.id)}
          cols={[{ key: "n", label: "Booking", render: (e) => <span className="strong">{e.name}<div className="oss-tiny oss-muted">{e.id}</div></span> },
            { key: "c", label: "Client", render: (e) => <RecLink kind="client" id={e.clientId}>{Q.clientOf(s, e.clientId).name}</RecLink> },
            { key: "v", label: "Venue", render: (e) => e.venueId ? <RecLink kind="venue" id={e.venueId}>{Q.venueOf(s, e.venueId)!.name}</RecLink> : <span className="oss-muted">Awaiting confirmation</span> },
            { key: "d", label: "Date", nowrap: true, render: (e) => fmtDate(zoned(e.date, "12:00")) },
            { key: "cov", label: "Coverage", render: (e) => mode === "pending" ? <span className="oss-small oss-muted">{e.indicativePositions} indicative · {e.pendingNote}</span>
              : <button className="oss-link" onClick={(x) => { x.stopPropagation(); navigate("Staffing", "allocation", { kind: "event", id: e.id }); }} aria-label={"Open staffing for " + e.name}><Cov c={Q.eventCoverage(s, e.id)} /></button> },
            { key: "o", label: "Owner", render: (e) => Q.nameOf(s, e.ownerId) },
            { key: "p", label: "State", render: (e) => mode === "pending" ? <S s="Pending" /> : <S s={phaseLabel(Q.eventPhase(s, e))} /> },
            { key: "due", label: "Due", render: (e) => { const task = s.tasks.find((t) => t.related?.id === e.id && t.status !== "done"); return task ? <span className="oss-small">{task.title}<div className="oss-tiny oss-muted">{Q.nameOf(s, task.ownerId)} · {fmtDate(task.due)} {fmtTime(task.due)}</div></span> : <span className="oss-muted oss-small">None</span>; } }]} />
      </Card>
      {mode === "firm" && <div className="oss-small oss-muted" style={{ marginTop: 10 }}>Firm totals only include confirmed bookings. Pending demand ({pend.positions} positions) and the Ryder Cup programme estimate are never added to them.</div>}
    </Page>
  );
}

function Calendar({ s, action }: { s: OssState; action: any }) {
  const [view, setView] = useState<"month" | "week">("month");
  const [month, setMonth] = useState("2026-11");
  const [y, m] = month.split("-").map(Number);
  const first = month + "-01";
  const lead = (weekday(zoned(first, "12:00")) + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = dayKey(s.clock);
  const weekStart = addDays(today, -((weekday(zoned(today, "12:00")) + 6) % 7));
  const cells = view === "month" ? Array.from({ length: Math.ceil((lead + days) / 7) * 7 }, (_, i) => addDays(first, i - lead)) : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const evs = (k: string) => s.events.filter((e) => e.date === k && e.status !== "cancelled");
  const shiftMonth = (n: number) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); };
  return (
    <Page title="Calendar" sub="Firm, pending and completed bookings. Click a booking to open it." actions={action}
      scope={<Seg value={view} onChange={setView} options={[{ id: "month", label: "Month" }, { id: "week", label: "Week" }]} />}>
      <Card pad={false} title={view === "month" ? new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("en-IE", { month: "long", year: "numeric", timeZone: "UTC" }) : "Week of " + fmtDate(zoned(weekStart, "12:00"))}
        right={view === "month" ? <><Btn size="sm" kind="ghost" icon={I.back} onClick={() => shiftMonth(-1)}>Previous</Btn><Btn size="sm" kind="ghost" onClick={() => setMonth("2026-11")}>November</Btn><Btn size="sm" kind="ghost" onClick={() => shiftMonth(1)}>Next</Btn></> : undefined}>
        <div className="oss-cal">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="dow">{d}</div>)}
          {cells.map((k) => (
            <div key={k} className={[k === today && "today", view === "month" && k.slice(0, 7) !== month && "out"].filter(Boolean).join(" ")} style={view === "week" ? { minHeight: 180 } : undefined}>
              <div className="d">{Number(k.slice(8))}</div>
              {evs(k).map((e) => { const ph = e.historical ? "completed" : Q.eventPhase(s, e); return (
                <button key={e.id} className={"oss-ev" + (e.status === "pending" ? " pending" : ph === "completed" ? " done" : "")} onClick={() => openDrawer("event", e.id)} title={e.name}>
                  {e.status === "pending" ? "Pending: " : ""}{e.name.split(":")[0]}{e.status === "confirmed" && !e.historical ? " · " + Q.eventCoverage(s, e.id).confirmed + "/" + Q.eventCoverage(s, e.id).required : ""}
                </button>); })}
            </div>))}
        </div>
      </Card>
      <div className="oss-legend" style={{ marginTop: 10 }}><span><i style={{ background: "var(--accent-faint)", border: "1px solid var(--accent-line)" }} />Firm</span><span><i style={{ border: "1px dashed var(--border-strong)" }} />Pending</span><span><i style={{ background: "var(--surface-2)" }} />Completed</span>
        <span>2027 programme assumptions live in Programme planning, without invented dates.</span></div>
    </Page>
  );
}

function Bookings({ s, action }: { s: OssState; action: any }) {
  const [q, setQ] = useState("");
  const rows = s.events.filter((e) => !q || (e.name + Q.clientOf(s, e.clientId).name).toLowerCase().includes(q.toLowerCase())).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Page title="Bookings" sub="Every booking with its client, venue, shifts and positions." actions={action}>
      <Card pad={false} title={<input className="oss-input" style={{ width: 280, height: 34 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search bookings or clients" aria-label="Search bookings" />}>
        <Table rows={rows} rowKey={(e) => e.id} onRow={(e) => openDrawer("event", e.id)} empty={<Empty title="No bookings match" action={<Btn size="sm" onClick={() => setQ("")}>Clear search</Btn>} />}
          cols={[{ key: "id", label: "ID", render: (e) => <span className="oss-mono">{e.id}</span> }, { key: "n", label: "Booking", render: (e) => <span className="strong">{e.name}</span> },
            { key: "st", label: "Status", render: (e) => <S s={e.status === "pending" ? "Pending" : e.status === "cancelled" ? "Cancelled" : e.historical ? "Completed" : "Firm"} /> },
            { key: "c", label: "Client", render: (e) => Q.clientOf(s, e.clientId).name }, { key: "v", label: "Venue", render: (e) => Q.venueOf(s, e.venueId)?.name || "To confirm" },
            { key: "d", label: "Date", nowrap: true, render: (e) => fmtDate(zoned(e.date, "12:00")) }, { key: "sh", label: "Shifts", num: true, render: (e) => Q.shiftsOfEvent(s, e.id).length },
            { key: "r", label: "Required", num: true, render: (e) => Q.eventCoverage(s, e.id).required }, { key: "cf", label: "Confirmed", num: true, render: (e) => e.status === "pending" ? "—" : Q.eventCoverage(s, e.id).confirmed }]} />
      </Card>
    </Page>
  );
}

function Clients({ s }: { s: OssState }) {
  return (
    <Page title="Clients & venues" sub="A client can use several venues, and choosing a venue never changes who the booking client is.">
      <div className="oss-grid oss-g2">
        <Card title="Clients" pad={false}>
          <Table rows={s.clients} rowKey={(c) => c.id} onRow={(c) => openDrawer("client", c.id)}
            cols={[{ key: "n", label: "Client", render: (c) => <span className="strong">{c.name}<div className="oss-tiny oss-muted">{c.fictional ? "Fictional" : "Named in call; booking fictional"}</div></span> },
              { key: "b", label: "Bookings", num: true, render: (c) => s.events.filter((e) => e.clientId === c.id).length },
              { key: "c", label: "Contacts", num: true, render: (c) => s.contacts.filter((x) => x.clientId === c.id).length },
              { key: "m", label: "Bullhorn", render: (c) => s.mappings.find((m) => m.localId === c.id)?.status === "mapped" ? <S s="Mapped" /> : <S s="Mapping pending" /> }]} />
        </Card>
        <Card title="Venues" pad={false}>
          <Table rows={s.venues} rowKey={(v) => v.id} onRow={(v) => openDrawer("venue", v.id)}
            cols={[{ key: "n", label: "Venue", render: (v) => <span className="strong">{v.name}<div className="oss-tiny oss-muted">{v.area}</div></span> },
              { key: "m", label: "Meeting point", render: (v) => v.meetingConfirmed ? <St tone="ok">Confirmed</St> : <St tone="warn">Awaiting confirmation</St> },
              { key: "e", label: "Bookings", num: true, render: (v) => s.events.filter((e) => e.venueId === v.id).length }]} />
        </Card>
      </div>
      <div className="oss-small oss-muted" style={{ marginTop: 10 }}>The website lists work at venues such as 3Arena and Aviva Stadium. That is context, not evidence of any specific future booking here.</div>
    </Page>
  );
}

function Programme({ s }: { s: OssState }) {
  const ry = s.programmes.find((p) => p.kind === "ryder")!, su = s.programmes.find((p) => p.kind === "festival")!;
  const max = Math.max(...su.months.map((m) => m.demand), 1);
  return (
    <Page title="Programme planning" sub="2027 demand assumptions, kept apart from firm and pending bookings. Nothing here is a booking, an assignment or a timesheet.">
      <div className="oss-grid oss-g2">
        <Card title={ry.name} right={<St tone="neutral">{ry.status}</St>}>
          <div style={{ fontSize: 34, fontWeight: 600, letterSpacing: "-1px" }}>~{ry.indicativeWorkers} <span className="oss-small oss-dim" style={{ fontWeight: 400 }}>unique workers, indicative</span></div>
          <div className="oss-small" style={{ marginTop: 8, lineHeight: 1.6 }}>{ry.note}</div>
          <div className="oss-note" style={{ marginTop: 12 }}>Undated on purpose: no official fixture calendar or phase dates are assumed. 850 people across a programme is not 850 shifts on one day.</div>
        </Card>
        <Card title={su.name} right={<St tone="neutral">Scenario</St>}>
          <div className="oss-vbars">{su.months.map((m) => (
            <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
              <span className="num oss-small oss-tab">{m.demand}</span>
              <span className="col" style={{ width: "100%", maxWidth: 48, height: (m.demand / max) * 120 + "px", background: "var(--accent)", opacity: .75, borderRadius: "6px 6px 2px 2px" }} />
              <input className="oss-input" type="number" min={0} value={m.demand} onChange={(e) => run(E.setProgrammeMonth, su.id, m.month, Number(e.target.value))} style={{ height: 30, width: 64, textAlign: "center", fontSize: 12 }} aria-label={m.month + " assumed positions"} />
              <span className="lab oss-tiny oss-muted">{m.month}</span>
            </div>))}</div>
          <div className="oss-small oss-muted" style={{ marginTop: 10 }}>Editable monthly positions, labelled scenario. No festival contracts are implied.</div>
        </Card>
      </div>
      <Card title="Readiness against current sample workforce" style={{ marginTop: 14 }}>
        <div className="oss-grid oss-g4">
          <Metric label="Sample profiles" value={s.workers.length} sub="Not OSS's full base" />
          <Metric label="Manual Handling valid" value={new Set(s.documents.filter((d) => d.type === "MH" && Q.docStatusToday(s, d) === "valid").map((d) => d.workerId)).size} />
          <Metric label="Availability not submitted" value={Q.notSubmitted(s).length} tone="warn" onClick={() => navigate("Workforce", "availability")} />
          <Metric label="Docs expiring in 30 days" value={Q.expiringDocs(s).length} onClick={() => navigate("Workforce", "documents")} />
        </div>
      </Card>
    </Page>
  );
}

/* ── create booking ──────────────────────────────────────────────────────── */
type SForm = { label: string; roles: string[]; start: string; end: string; required: number };
const ROLES = ["Stagehand", "General operative", "Event crew", "Site crew", "Steward", "Catering assistant"];
function CreateBooking({ s, close }: { s: OssState; close: () => void }) {
  const [f, setF] = useState<E.BookingForm>({ name: "", clientId: "C04", venueId: "V04", date: "2026-11-27", status: "pending", ownerId: "U03", ppe: ["High-visibility jacket"], docs: [], brief: "", shifts: [{ label: "Event crew", roles: ["Event crew", "Steward"], start: "17:00", end: "23:00", required: 10 }] });
  const [err, setErr] = useState<string | null>(null);
  const [dupOk, setDupOk] = useState(false);
  const dups = E.bookingDuplicates(s, f);
  const set = (p: Partial<E.BookingForm>) => { setF({ ...f, ...p }); setErr(null); setDupOk(false); };
  const setShift = (i: number, p: Partial<SForm>) => set({ shifts: f.shifts.map((x, k) => (k === i ? { ...x, ...p } : x)) });
  const sample = () => set({ name: "3Arena: arena crew (workshop copy)", clientId: "C01", venueId: "V01", date: "2026-12-05", status: "pending", ownerId: "U03", ppe: ["Safety boots", "High-visibility jacket", "Gloves"], docs: ["MH"],
    brief: "Workshop copy of the 3Arena sample. Saving creates a new booking; the canonical EVT-001 is not modified.",
    shifts: [{ label: "Set-up crew", roles: ["Stagehand", "General operative", "Event crew", "Site crew"], start: "08:00", end: "13:00", required: 10 }, { label: "Event crew", roles: ["Event crew", "Stagehand", "General operative", "Steward"], start: "17:00", end: "23:00", required: 20 }] });
  const bad = f.shifts.find((x) => x.end <= x.start && !(x.end < "06:00"));
  const save = () => {
    if (bad) { setErr("\"" + bad.label + "\" ends before it starts."); return; }
    if (dups.length && !dupOk) { setErr("Possible duplicate: " + dups.map((d) => d.id + " " + d.name).join(", ") + ". Confirm to save anyway."); setDupOk(true); return; }
    const r = run(E.createBooking, f);
    if (r.ok) { close(); openDrawer("event", r.data.id); } else setErr(r.message);
  };
  return (
    <Drawer title="Create booking" eyebrow="New booking" onClose={close} wide
      footer={<><Btn kind="primary" icon={I.check} onClick={save}>{dupOk ? "Save anyway" : "Save as " + f.status}</Btn><Btn onClick={close}>Cancel</Btn><span style={{ marginLeft: "auto" }} /><Btn kind="ghost" onClick={sample}>Use 3Arena sample</Btn></>}>
      <div className="oss-grid oss-g2">
        <Field label="Booking name"><input className="oss-input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Winter gala: floor crew" /></Field>
        <Field label="Status" help="Pending bookings stay out of firm demand."><select className="oss-input" value={f.status} onChange={(e) => set({ status: e.target.value as any })}><option value="pending">Pending</option><option value="confirmed">Confirmed</option></select></Field>
        <Field label="Booking client"><select className="oss-input" value={f.clientId} onChange={(e) => set({ clientId: e.target.value })}>{s.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Venue" help="Choosing a venue does not change the client."><select className="oss-input" value={f.venueId || ""} onChange={(e) => set({ venueId: e.target.value || null })}><option value="">Venue to confirm</option>{s.venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></Field>
        <Field label="Date"><input className="oss-input" type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} /></Field>
        <Field label="Coordinator"><select className="oss-input" value={f.ownerId} onChange={(e) => set({ ownerId: e.target.value })}>{s.users.filter((u) => (u.perms as string[]).includes("allocate")).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
      </div>
      <div className="oss-section"><h3>Shifts</h3>
        {f.shifts.map((x, i) => (
          <div key={i} className="oss-card" style={{ padding: 12, marginBottom: 10 }}>
            <div className="oss-grid" style={{ gridTemplateColumns: "1.4fr .8fr .8fr .7fr auto", alignItems: "end", gap: 10 }}>
              <Field label="Shift name"><input className="oss-input" value={x.label} onChange={(e) => setShift(i, { label: e.target.value })} /></Field>
              <Field label="Start"><TimeSelect value={x.start} onChange={(v) => setShift(i, { start: v })} label="Start" /></Field>
              <Field label="End" err={x.end <= x.start && !(x.end < "06:00") ? "Ends before start" : undefined}><TimeSelect value={x.end} onChange={(v) => setShift(i, { end: v })} label="End" /></Field>
              <Field label="Positions"><input className="oss-input" type="number" min={1} value={x.required} onChange={(e) => setShift(i, { required: Math.max(1, Number(e.target.value) || 1) })} /></Field>
              <Btn kind="ghost" size="sm" disabled={f.shifts.length === 1} onClick={() => set({ shifts: f.shifts.filter((_, k) => k !== i) })}>Remove</Btn>
            </div>
            <div className="oss-pills" style={{ marginTop: 10 }}>{ROLES.map((r) => <label key={r} className="oss-check oss-pill" style={{ height: 30 }}><input type="checkbox" checked={x.roles.includes(r)} onChange={(e) => setShift(i, { roles: e.target.checked ? x.roles.concat([r]) : x.roles.filter((z) => z !== r) })} />{r}</label>)}</div>
          </div>))}
        <Btn size="sm" icon={I.plus} onClick={() => set({ shifts: f.shifts.concat([{ label: "Shift " + (f.shifts.length + 1), roles: ["Event crew"], start: "09:00", end: "17:00", required: 5 }]) })}>Add shift</Btn>
        <div className="oss-small oss-muted" style={{ marginTop: 6 }}>An end time before 06:00 is treated as the next morning.</div>
      </div>
      <div className="oss-grid oss-g2 oss-section">
        <Field label="PPE"><div className="oss-pills">{["Safety boots", "High-visibility jacket", "Gloves", "Black uniform", "Non-slip footwear"].map((p) => <label key={p} className="oss-check oss-pill" style={{ height: 30 }}><input type="checkbox" checked={f.ppe.includes(p)} onChange={(e) => set({ ppe: e.target.checked ? f.ppe.concat([p]) : f.ppe.filter((z) => z !== p) })} />{p}</label>)}</div></Field>
        <Field label="Required evidence (valid through shift end)"><div className="oss-pills">{(["MH", "SP", "HACCP", "FA"] as DocType[]).map((t) => <label key={t} className="oss-check oss-pill" style={{ height: 30 }}><input type="checkbox" checked={f.docs.includes(t)} onChange={(e) => set({ docs: e.target.checked ? f.docs.concat([t]) : f.docs.filter((z) => z !== t) })} />{docLabel(t)}</label>)}</div></Field>
      </div>
      <div className="oss-section"><Field label="Brief"><textarea className="oss-input" rows={3} value={f.brief} onChange={(e) => set({ brief: e.target.value })} /></Field></div>
      {dups.length > 0 && <div className="oss-note warn" style={{ marginTop: 12 }}>Same client and date as {dups.map((d) => d.id + " " + d.name).join(", ")}.</div>}
      {err && <div className="oss-note bad" style={{ marginTop: 12 }}>{err}</div>}
    </Drawer>
  );
}
