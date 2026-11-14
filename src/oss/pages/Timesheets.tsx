import { useMemo, useState } from "react";
import type { OssState } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { navigate, openDrawer, run, useOss } from "../store";
import { tabOf } from "../modules";
import { addDays, dayKey, fmtDate, fmtDayMonth, fmtHM, fmtTime, zoned } from "../time";
import { Btn, Card, Drawer, Empty, I, KV, Metric, Page, S, Scope, Seg, St, Table, TimeSelect, type Col } from "../ui/kit";
import { LineStatus } from "../ui/drawers";
import { RecLink, WorkerLink, downloadCsv, hm, when } from "../ui/fmt";

export default function Timesheets() {
  const s = useOss();
  const tab = tabOf(s, "Timesheets");
  if (tab === "corrections") return <Corrections s={s} />;
  if (tab === "approvals") return <Approvals s={s} />;
  if (tab === "reports") return <Reports s={s} />;
  if (tab === "handover") return <Handover s={s} />;
  return <Review s={s} />;
}

const WEEKS = ["2026-11-09", "2026-11-16"];
const weekLabel = (w: string) => "Mon " + fmtDayMonth(zoned(w, "12:00")) + " to Sun " + fmtDayMonth(zoned(addDays(w, 6), "12:00"));

export function lineCols(s: OssState, opts: { select?: { sel: string[]; toggle: (id: string) => void } } = {}): Col<Q.Line>[] {
  const c: Col<Q.Line>[] = [];
  if (opts.select) c.push({ key: "x", label: "", width: "34px", render: (l) => l.status === "ready" ? <input type="checkbox" aria-label={"Select " + l.worker.name} checked={opts.select!.sel.includes(l.asg.id)} onChange={() => opts.select!.toggle(l.asg.id)} onClick={(e) => e.stopPropagation()} style={{ width: 16, height: 16, accentColor: "var(--accent)" }} /> : null });
  c.push(
    { key: "w", label: "Worker", nowrap: true, render: (l) => <span className="strong">{l.worker.name}</span>, foot: "Totals" },
    { key: "s", label: "Shift", render: (l) => <span style={{ display: "block", maxWidth: 210 }}><span className="oss-ellip" style={{ display: "block" }}>{l.event.name.split(":")[0]}</span><span className="oss-tiny oss-muted oss-ellip" style={{ display: "block" }}>{l.shift.label} · {fmtDate(l.shift.start)}</span></span> },
    { key: "sc", label: "Scheduled", num: true, render: (l) => fmtTime(l.shift.start) + "–" + fmtTime(l.shift.end) },
    { key: "raw", label: "Raw clock", num: true, render: (l) => hm(l.rawIn) + "–" + (l.rawOut ? fmtTime(l.rawOut) : <span style={{ color: "var(--bad)" }}>missing</span>) },
    { key: "ap", label: "Approved interval", num: true, render: (l) => l.complete ? <span>{fmtTime(l.approvedStart!)}–{fmtTime(l.approvedEnd!)}{dayKey(l.approvedEnd!) !== dayKey(l.approvedStart!) ? <span className="oss-tiny oss-muted"> +1d</span> : null}{l.correctionNote ? <span className="oss-tiny" style={{ color: "var(--accent)" }}> corrected</span> : null}</span> : "—" },
    { key: "b", label: "Break", num: true, render: (l) => fmtHM(l.breakMin) },
    { key: "wk", label: "Worked", num: true, render: (l) => l.complete ? fmtHM(l.workedMin) : "—" },
    { key: "tu", label: "Min. top-up", num: true, render: (l) => l.topupMin ? fmtHM(l.topupMin) : "—" },
    { key: "p", label: "Payable", num: true, render: (l) => l.complete ? <b className="oss-ink">{fmtHM(l.payableMin)}</b> : "—" },
    { key: "x2", label: "Past finish", num: true, render: (l) => l.extraMin ? <St tone="warn">{fmtHM(l.extraMin)}</St> : "—" },
    { key: "st", label: "State", render: (l) => <LineStatus st={l.status} /> }
  );
  return c;
}
function withFoot(cols: Col<Q.Line>[], ls: Q.Line[]) {
  const t = Q.totals(ls);
  const f: Record<string, string> = { sc: fmtHM(t.scheduled), wk: fmtHM(t.worked), tu: fmtHM(t.topup), p: fmtHM(t.payable), x2: fmtHM(t.extra), b: fmtHM(t.breaks) };
  return cols.map((c) => ({ ...c, foot: c.foot ?? f[c.key] }));
}

function Review({ s }: { s: OssState }) {
  const focusEv = s.ui.focus?.kind === "event" ? s.ui.focus.id : null;
  const heroLines = Q.lines(s, { eventId: "EVT-001" }).length > 0;
  const [group, setGroup] = useState<"week" | "client" | "event" | "worker">(focusEv || heroLines ? "event" : "week");
  const [week, setWeek] = useState(WEEKS[0]);
  const [ev, setEv] = useState<string>(focusEv || "EVT-001");
  const [client, setClient] = useState("C01");
  const [wq, setWq] = useState("");
  const ls = group === "week" ? Q.lines(s, { weekOf: week }) : group === "event" ? Q.lines(s, { eventId: ev }) : group === "client" ? Q.lines(s, { clientId: client }) : Q.lines(s).filter((l) => !wq || l.worker.name.toLowerCase().includes(wq.toLowerCase()));
  const t = Q.totals(ls);
  const known = ls.filter((l) => l.complete);
  const evOpts = s.events.filter((e) => Q.lines(s, { eventId: e.id }).length);
  return (
    <Page title="Timesheet review" sub="Drafts come from verified clock records and approved corrections. Missing entries are incomplete and stay out of final totals until reviewed."
      scope={<Scope><b>{group === "week" ? weekLabel(week) : group === "event" ? Q.eventOf(s, ev)?.name : group === "client" ? Q.clientOf(s, client).name : "All workers"}</b></Scope>}
      actions={<Seg value={group} onChange={setGroup} label="Group by" options={[{ id: "week", label: "Week" }, { id: "client", label: "Client" }, { id: "event", label: "Event" }, { id: "worker", label: "Worker" }]} />}>
      <div className="oss-grid oss-g4" style={{ marginBottom: 14 }}>
        <Metric label="Lines" value={t.count} sub={t.incomplete ? t.incomplete + " incomplete" : "All complete"} tone={t.incomplete ? "warn" : undefined} />
        <Metric label="Scheduled" value={fmtHM(t.scheduled)} sub="All lines" />
        <Metric label={t.incomplete ? "Worked (provisional, known lines)" : "Worked"} value={fmtHM(t.worked)} sub={t.worked.toLocaleString("en-IE") + " minutes"} />
        <Metric label={t.incomplete ? "Payable (provisional)" : "Payable"} value={fmtHM(t.payable)} sub={"incl. " + fmtHM(t.topup) + " minimum top-up · " + fmtHM(t.extra) + " past finish flagged"} />
      </div>
      <Card pad={false} title={group === "week" ? <select className="oss-input" style={{ width: 260, height: 34 }} value={week} onChange={(e) => setWeek(e.target.value)} aria-label="Week">{WEEKS.map((w) => <option key={w} value={w}>{weekLabel(w)}</option>)}</select>
        : group === "event" ? <select className="oss-input" style={{ width: 300, height: 34 }} value={ev} onChange={(e) => setEv(e.target.value)} aria-label="Event">{evOpts.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        : group === "client" ? <select className="oss-input" style={{ width: 300, height: 34 }} value={client} onChange={(e) => setClient(e.target.value)} aria-label="Client">{s.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        : <input className="oss-input" style={{ width: 260, height: 34 }} value={wq} onChange={(e) => setWq(e.target.value)} placeholder="Filter workers" aria-label="Filter workers" />}
        meta={t.incomplete ? "Provisional: " + known.length + " of " + ls.length + " lines complete" : undefined}>
        <Table rows={ls} rowKey={(l) => l.id} onRow={(l) => openDrawer("timesheet", l.asg.id)} cols={withFoot(lineCols(s), ls)} foot maxHeight={620}
          empty={<Empty title="No timesheet lines here yet" body="Lines appear once a shift starts. Load the Hours review stage from Demo controls to see the completed 3Arena shifts." />} />
      </Card>
      <div className="oss-small oss-muted" style={{ marginTop: 10 }}>Minutes are exact (no rounding). Break and minimum rules are sample assumptions to confirm. Time past finish is a review category, not a multiplier, and is not added to payable twice.</div>
    </Page>
  );
}

function Corrections({ s }: { s: OssState }) {
  const focus = s.ui.focus?.kind === "assignment" ? s.ui.focus.id : null;
  const all = s.corrections.slice().reverse();
  const incomplete = Q.lines(s).filter((l) => l.status === "incomplete" && !s.corrections.some((c) => c.assignmentId === l.asg.id && c.status === "proposed"));
  const [form, setForm] = useState<{ asg: string; field: "in" | "out"; hm: string; reason: string } | null>(null);
  const start = (l: Q.Line) => setForm({ asg: l.asg.id, field: l.rawIn ? "out" : "in", hm: fmtTime(l.rawIn ? l.shift.end : l.shift.start), reason: "" });
  return (
    <Page title="Corrections" sub="Before and after, with reason, requester, approver and version. The original clock record is never overwritten; whoever proposes cannot approve.">
      {incomplete.length > 0 && <Card title="Incomplete lines needing a correction" pad={false}>
        <Table rows={incomplete} rowKey={(l) => l.id} selected={focus ? "TS-" + focus : null}
          cols={[{ key: "w", label: "Worker", render: (l) => <WorkerLink s={s} id={l.worker.id} /> }, { key: "s", label: "Shift", render: (l) => l.event.name.split(":")[0] + ", " + l.shift.label.toLowerCase() },
            { key: "r", label: "Raw clock", render: (l) => hm(l.rawIn) + " to " + (l.rawOut ? fmtTime(l.rawOut) : "missing") },
            { key: "a", label: "", render: (l) => <Btn size="sm" kind="primary" onClick={() => start(l)}>Propose correction</Btn> }]} />
      </Card>}
      <Card title="Correction requests" pad={false} style={{ marginTop: 14 }}>
        <Table rows={all} rowKey={(c) => c.id} empty={<Empty title="No corrections yet" body="A supervisor can propose one from the phone view or from an incomplete line above." />}
          cols={[{ key: "w", label: "Worker", render: (c) => <WorkerLink s={s} id={Q.asgOf(s, c.assignmentId).workerId} /> },
            { key: "f", label: "Field", render: (c) => "Clock-" + c.field },
            { key: "b", label: "Before", render: (c) => <span style={{ textDecoration: "line-through", color: "var(--faint)" }}>{c.original ? fmtTime(c.original) : "missing"}</span> },
            { key: "a", label: "After", render: (c) => <b className="oss-ink">{fmtTime(c.proposed)}{dayKey(c.proposed) !== dayKey(Q.shiftOf(s, Q.asgOf(s, c.assignmentId).shiftId).start) ? " (+1d)" : ""}</b> },
            { key: "r", label: "Reason", render: (c) => <span className="oss-small">{c.reason}{c.note ? <div className="oss-tiny oss-muted">{c.note}</div> : null}</span> },
            { key: "by", label: "Requested", render: (c) => <span className="oss-small">{Q.nameOf(s, c.requestedBy)}<div className="oss-tiny oss-muted">{when(c.requestedAt)}</div></span> },
            { key: "d", label: "Decision", render: (c) => c.status === "proposed" ? <S s="Needs review" /> : <span className="oss-small"><S s={c.status === "approved" ? "Approved" : "Rejected"} /><div className="oss-tiny oss-muted">{Q.nameOf(s, c.decidedBy!)} · {when(c.decidedAt)}</div></span> },
            { key: "x", label: "", render: (c) => c.status === "proposed" ? <span style={{ display: "flex", gap: 6 }}><Btn size="sm" kind="primary" onClick={() => run(E.decideCorrection, c.id, true)}>Approve</Btn><Btn size="sm" onClick={() => run(E.decideCorrection, c.id, false)}>Reject</Btn></span> : <Btn size="sm" kind="ghost" onClick={() => openDrawer("timesheet", c.assignmentId)}>Line</Btn> }]} />
      </Card>
      {form && <Drawer title={"Propose clock-" + form.field + " for " + Q.nameOf(s, Q.asgOf(s, form.asg).workerId)} onClose={() => setForm(null)}
        footer={<><Btn kind="primary" disabled={!form.reason.trim()} onClick={() => { const r = run(E.proposeCorrection, form.asg, form.field, form.hm, form.reason); if (r.ok) setForm(null); }}>Send for approval</Btn><Btn onClick={() => setForm(null)}>Cancel</Btn></>}>
        <div style={{ display: "grid", gap: 12 }}>
          <div className="oss-field"><label htmlFor="cf">Field</label><select id="cf" className="oss-input" value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value as any })}><option value="in">Clock-in</option><option value="out">Clock-out</option></select></div>
          <div className="oss-field"><label htmlFor="ct">Proposed time</label><TimeSelect id="ct" value={form.hm} onChange={(v) => setForm({ ...form, hm: v })} /><div className="help">A clock-out earlier than the start is treated as after midnight.</div></div>
          <div className="oss-field"><label htmlFor="cr">Reason (required)</label><textarea id="cr" className="oss-input" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          <div className="oss-note">Proposing as {Q.persona(s).name}. Someone else with approval rights must approve it.</div>
        </div>
      </Drawer>}
    </Page>
  );
}

function Approvals({ s }: { s: OssState }) {
  const [q, setQ] = useState<"ready" | "blocked" | "approved" | "reopened">("ready");
  const [sel, setSel] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const all = Q.lines(s);
  const reopenedIds = new Set(s.approvals.filter((a) => a.status === "reopened").map((a) => a.assignmentId));
  const groups = {
    ready: all.filter((l) => l.status === "ready"),
    blocked: all.filter((l) => l.status === "incomplete" || l.status === "needs_review" || l.status === "in_progress"),
    approved: all.filter((l) => l.status === "approved" || l.status === "exported"),
    reopened: all.filter((l) => reopenedIds.has(l.asg.id))
  };
  const rows = groups[q];
  const toggle = (id: string) => setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.concat([id])));
  const chosen = groups.ready.filter((l) => sel.includes(l.asg.id));
  const tt = Q.totals(chosen);
  return (
    <Page title="Approvals" sub="Approve eligible rows independently. Blocked rows are never included silently. Reopening an exported row creates a new version and a new handover item."
      actions={q === "ready" && <><Btn onClick={() => setSel(groups.ready.map((l) => l.asg.id))} disabled={!groups.ready.length}>Select all ready ({groups.ready.length})</Btn><Btn kind="primary" icon={I.check} disabled={!chosen.length} onClick={() => setPreview(true)}>Approve selected ({chosen.length})</Btn></>}>
      <Card pad={false} title={<Seg value={q} onChange={(v) => { setQ(v); setSel([]); }} options={[{ id: "ready", label: "Ready", n: groups.ready.length }, { id: "blocked", label: "Blocked", n: groups.blocked.length }, { id: "approved", label: "Approved", n: groups.approved.length }, { id: "reopened", label: "Reopened", n: groups.reopened.length }]} />}>
        <Table rows={rows} rowKey={(l) => l.id} onRow={(l) => openDrawer("timesheet", l.asg.id)} cols={withFoot(lineCols(s, q === "ready" ? { select: { sel, toggle } } : {}), rows)} foot maxHeight={600}
          empty={<Empty title={q === "ready" ? "Nothing waiting for approval" : "Nothing here"} body={q === "ready" ? "Lines become ready once both clocks are verified or corrected." : undefined} />} />
      </Card>
      {preview && <Drawer title={"Approve " + chosen.length + " lines"} onClose={() => setPreview(false)}
        footer={<><Btn kind="primary" icon={I.check} onClick={() => { run(E.approveLines, chosen.map((l) => l.asg.id)); setSel([]); setPreview(false); }}>Approve as {Q.persona(s).name}</Btn><Btn onClick={() => setPreview(false)}>Cancel</Btn></>}>
        <KV items={[["Rows", chosen.length], ["Worked", fmtHM(tt.worked)], ["Minimum top-up", fmtHM(tt.topup)], ["Payable", fmtHM(tt.payable)], ["Past finish (review)", fmtHM(tt.extra)], ["Excluded (blocked)", groups.blocked.length]]} />
        {groups.blocked.length > 0 && <div className="oss-note warn" style={{ marginTop: 12 }}>Not included: {groups.blocked.map((l) => l.worker.name + " (" + l.status.replace("_", " ") + ")").join(", ")}.</div>}
        <div className="oss-note" style={{ marginTop: 12 }}>Approval records your name and the line version. It does not send anything; handover is a separate step.</div>
      </Drawer>}
    </Page>
  );
}

function Reports({ s }: { s: OssState }) {
  const [client, setClient] = useState("C01");
  const [week, setWeek] = useState(WEEKS[0]);
  const ls = Q.lines(s, { clientId: client, weekOf: week }).filter((l) => l.status === "approved" || l.status === "exported");
  const pendingN = Q.lines(s, { clientId: client, weekOf: week }).length - ls.length;
  const t = Q.totals(ls);
  const cols: Col<Q.Line>[] = [
    { key: "w", label: "Employee", render: (l) => l.worker.name, foot: "Total (" + ls.length + ")" },
    { key: "e", label: "Event", render: (l) => l.event.name }, { key: "s", label: "Shift", render: (l) => l.shift.label },
    { key: "d", label: "Date", nowrap: true, render: (l) => fmtDate(l.shift.start) },
    { key: "a", label: "Approved time", num: true, render: (l) => fmtTime(l.approvedStart!) + "–" + fmtTime(l.approvedEnd!) },
    { key: "wk", label: "Worked", num: true, render: (l) => fmtHM(l.workedMin), foot: fmtHM(t.worked) },
    { key: "tu", label: "Min. top-up", num: true, render: (l) => (l.topupMin ? fmtHM(l.topupMin) : "—"), foot: fmtHM(t.topup) },
    { key: "p", label: "Payable", num: true, render: (l) => fmtHM(l.payableMin), foot: fmtHM(t.payable) },
    { key: "x", label: "Extra-hours candidate", num: true, render: (l) => (l.extraMin ? fmtHM(l.extraMin) : "—"), foot: fmtHM(t.extra) }
  ];
  const exportCsv = () => {
    const rows = ls.map((l) => [l.worker.name, l.event.name, l.shift.label, l.workDate, fmtTime(l.approvedStart!), fmtTime(l.approvedEnd!), dayKey(l.approvedEnd!), l.workedMin, fmtHM(l.workedMin), l.topupMin, l.payableMin, fmtHM(l.payableMin), l.extraMin]);
    rows.push(["TOTAL", "", "", "", "", "", "", t.worked, fmtHM(t.worked), t.topup, t.payable, fmtHM(t.payable), t.extra]);
    downloadCsv("oss-client-report-" + Q.clientOf(s, client).name.toLowerCase().replace(/[^a-z]+/g, "-") + "-" + week + ".csv",
      ["Employee", "Event", "Shift", "Work date", "Approved start", "Approved end", "End date", "Worked minutes", "Worked (h:mm)", "Minimum top-up minutes", "Payable minutes", "Payable (h:mm)", "Extra-hours candidate minutes"], rows);
    run((d) => { E.audit(d, Q.persona(d).name, "report.exported", { type: "client", id: client, label: Q.clientOf(d, client).name }, "Exported client report CSV: " + ls.length + " approved rows, " + fmtHM(t.payable) + " payable (" + weekLabel(week) + ")", "systems"); return { ok: true, message: "CSV downloaded (" + ls.length + " rows). Opens in Excel." }; });
  };
  return (
    <Page title="Client reports" sub="Approved hours per client and Monday to Sunday week. No identity documents or private worker data are included."
      actions={<Btn kind="primary" icon={I.download} disabled={!ls.length} onClick={exportCsv}>Export CSV (opens in Excel)</Btn>}>
      <Card pad={false} title={<span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select className="oss-input" style={{ width: 280, height: 34 }} value={client} onChange={(e) => setClient(e.target.value)} aria-label="Client">{s.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="oss-input" style={{ width: 240, height: 34 }} value={week} onChange={(e) => setWeek(e.target.value)} aria-label="Week">{WEEKS.map((w) => <option key={w} value={w}>{weekLabel(w)}</option>)}</select></span>}
        meta={pendingN ? pendingN + " lines not yet approved are excluded" : undefined}>
        <Table rows={ls} rowKey={(l) => l.id} cols={cols} foot empty={<Empty title="No approved hours for this client and week" body={pendingN ? pendingN + " lines exist but are not approved yet." : undefined} />} />
      </Card>
      <div className="oss-small oss-muted" style={{ marginTop: 10 }}>The CSV contains exactly the rows above, in minutes and h:mm (no decimal hours), UTF-8 with formula-safe cells.</div>
    </Page>
  );
}

function Handover({ s }: { s: OssState }) {
  const waiting = Q.lines(s).filter((l) => l.status === "approved" && !l.item);
  const byEvent = useMemo(() => { const m = new Map<string, Q.Line[]>(); waiting.forEach((l) => m.set(l.event.id, (m.get(l.event.id) || []).concat([l]))); return Array.from(m); }, [s]);
  const batches = s.batches.slice().reverse();
  const unmapped = s.mappings.filter((m) => m.entityType === "worker" && m.status === "missing");
  return (
    <Page title="Bullhorn handover" sub={<>Approved hours leave through a <b>simulated</b> adapter: Draft, Ready, Queued, Sending, then Accepted, Blocked or Failed. Each row has a stable transfer key, so retries never duplicate. A receipt is not payment.</>}
      scope={<St tone="sim">Simulated handover</St>}>
      {byEvent.length > 0 && <Card title="Approved, not yet sent" pad={false}>
        <Table rows={byEvent} rowKey={([e]) => e}
          cols={[{ key: "e", label: "Booking", render: ([e]) => Q.eventOf(s, e).name }, { key: "n", label: "Lines", num: true, render: ([, l]) => l.length },
            { key: "p", label: "Payable", num: true, render: ([, l]) => fmtHM(Q.totals(l).payable) },
            { key: "m", label: "Mappings", render: ([, l]) => l.every((x) => x.mapped) ? <S s="Mapped" /> : <St tone="warn">{l.filter((x) => !x.mapped).length} missing</St> },
            { key: "a", label: "", render: ([e, l]) => <Btn size="sm" kind="primary" icon={I.send} onClick={() => { const r = run(E.createBatch, l.map((x) => x.asg.id), Q.eventOf(s, e).name + ", " + fmtDayMonth(l[0].shift.start), e); if (r.ok) { run(E.sendBatch, r.data.id); openTo(r.data.id); } }}>Create batch and send</Btn> }]} />
      </Card>}
      <Card title="Batches" pad={false} style={{ marginTop: byEvent.length ? 14 : 0 }}>
        <Table rows={batches} rowKey={(b) => b.id} onRow={(b) => openDrawer("batch", b.id)}
          cols={[{ key: "id", label: "Batch", render: (b) => <span className="strong">{b.id}</span> }, { key: "l", label: "Scope", render: (b) => b.label },
            { key: "n", label: "Rows", num: true, render: (b) => Q.batchSummary(s, b.id).items.length },
            { key: "a", label: "Accepted", num: true, render: (b) => { const x = Q.batchSummary(s, b.id); return x.accepted + " · " + fmtHM(x.acceptedMin); } },
            { key: "bl", label: "Blocked", num: true, render: (b) => { const x = Q.batchSummary(s, b.id); return x.blocked ? <St tone="bad">{x.blocked} · {fmtHM(x.blockedMin)}</St> : "0"; } },
            { key: "t", label: "Total payable", num: true, render: (b) => fmtHM(Q.batchSummary(s, b.id).totalMin) },
            { key: "w", label: "Last attempt", nowrap: true, render: (b) => { const at = Q.batchSummary(s, b.id).items.flatMap((i) => i.attempts.map((a) => a.at)).sort().pop(); return at ? when(at) : "—"; } }]} />
      </Card>
      <div className="oss-grid oss-g2" style={{ marginTop: 14 }}>
        <Card title="Mappings needing a person" pad={false}>
          <Table rows={unmapped} rowKey={(m) => m.id} empty={<Empty title="All workers mapped" />}
            cols={[{ key: "w", label: "Worker", render: (m) => <WorkerLink s={s} id={m.localId} /> }, { key: "n", label: "Note", render: (m) => <span className="oss-small oss-dim">{m.note}</span> },
              { key: "a", label: "", render: (m) => <Btn size="sm" onClick={() => openDrawer("mapping", m.localId)}>Resolve</Btn> }]} />
        </Card>
        <Card title="Field ownership (proposed, to validate)">
          <div className="oss-small" style={{ lineHeight: 1.65 }}>
            <b>Bullhorn keeps</b> master client, contact and candidate identifiers.<br />
            <b>OSS Pulse owns</b> availability, event operations, invitations and replies, journey and clock evidence, and hour approvals.<br />
            <b>To agree</b>: assignment, job or placement mapping and the approved-hours destination. Nothing silently overwrites Bullhorn data.
          </div>
          <div className="oss-note" style={{ marginTop: 10 }}>Bullhorn's public docs list Candidate, ClientCorporation, ClientContact, JobOrder and Placement. That does not establish OSS's modules, fields or an approved-hours write route; those need OSS's configuration and testing. <RecLink kind="batch" id="BH-1111-01">Open BH-1111-01</RecLink></div>
        </Card>
      </div>
    </Page>
  );
}
function openTo(id: string) { setTimeout(() => openDrawer("batch", id), 50); }
export { navigate };
