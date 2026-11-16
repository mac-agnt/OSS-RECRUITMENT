/* Timesheets: drafts generated from clock records, scheduled against actual,
   the five-hour minimum, overtime past the scheduled finish, corrections with
   an approver, and the handover of approved hours to Bullhorn. */

import "../../styles/oss-ops.css";
import "../../styles/oss-events.css";
import { useMemo, useState } from "react";
import type { OssState } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { navigate, openDrawer, run, setUi, useOss } from "../store";
import { tabOf } from "../modules";
import { dayKey, fmtDate, fmtDayMonth, fmtHM, fmtTime } from "../time";
import { Av, Btn, Card, Drawer, I, Icon, KV, Meter, Page, Row, RIcon, Search, St, Steps, Table, TimeSelect, kindVar, type Col } from "../ui/kit";
import { DESKS } from "../network";
import { DESK_SHORT, deskC } from "./Events";
import { LineStatus } from "../ui/drawers";
import { hm, when } from "../ui/fmt";

export default function Timesheets() {
  const s = useOss();
  const tab = tabOf(s, "Timesheets");
  if (tab === "corrections") return <Corrections s={s} />;
  if (tab === "bullhorn") return <Bullhorn s={s} />;
  return <Review s={s} />;
}

export function lineCols(s: OssState, opts: { select?: { sel: string[]; toggle: (id: string) => void } } = {}): Col<Q.Line>[] {
  const c: Col<Q.Line>[] = [];
  if (opts.select) c.push({ key: "x", label: "", width: "36px", render: (l) => l.status === "ready" ? <input type="checkbox" aria-label={"Select " + l.worker.name} checked={opts.select!.sel.includes(l.asg.id)} onChange={() => opts.select!.toggle(l.asg.id)} onClick={(e) => e.stopPropagation()} style={{ width: 16, height: 16, accentColor: "var(--accent)" }} /> : null });
  c.push(
    { key: "w", label: "Employee", nowrap: true, render: (l) => <span className="oss-row"><Av name={l.worker.name} size="sm" /><span><span className="strong">{l.worker.name}</span><div className="oss-tiny oss-muted">{l.shift.label} · {fmtDate(l.shift.start)}</div></span></span>, foot: "Total" },
    { key: "sc", label: "Rostered", num: true, render: (l) => fmtTime(l.shift.start) + "-" + fmtTime(l.shift.end) },
    { key: "in", label: "In", num: true, render: (l) => l.approvedStart ? fmtTime(l.approvedStart) : <span style={{ color: "var(--bad)" }}>missing</span> },
    { key: "out", label: "Out", num: true, render: (l) => l.approvedEnd ? <span>{fmtTime(l.approvedEnd)}{dayKey(l.approvedEnd) !== dayKey(l.shift.start) ? <span className="oss-tiny oss-muted"> +1</span> : null}{l.correctionNote ? <span className="oss-tiny" style={{ color: "var(--accent)" }}> edited</span> : null}</span> : <span style={{ color: "var(--bad)" }}>missing</span> },
    { key: "sm", label: "Rostered hrs", num: true, render: (l) => fmtHM(l.scheduledMin) },
    { key: "wk", label: "Worked", num: true, render: (l) => l.complete ? fmtHM(l.workedMin) : "-" },
    { key: "tu", label: "5h minimum", num: true, render: (l) => l.topupMin ? <St tone="info">+{fmtHM(l.topupMin)}</St> : <span className="oss-muted">-</span> },
    { key: "x2", label: "Overtime", num: true, render: (l) => l.extraMin ? <St tone="warn">{fmtHM(l.extraMin)}</St> : <span className="oss-muted">-</span> },
    { key: "p", label: "Payable", num: true, render: (l) => l.complete ? <b className="oss-ink">{fmtHM(l.payableMin)}</b> : "-" },
    { key: "st", label: "Status", render: (l) => <LineStatus st={l.status} /> }
  );
  return c;
}
function withFoot(cols: Col<Q.Line>[], ls: Q.Line[]) {
  const t = Q.totals(ls);
  const f: Record<string, string> = { sm: fmtHM(t.scheduled), wk: fmtHM(t.worked), tu: "+" + fmtHM(t.topup), p: fmtHM(t.payable), x2: fmtHM(t.extra) };
  return cols.map((c) => ({ ...c, foot: c.foot ?? f[c.key] }));
}

/* ── review & approve ─────────────────────────────────────────────────────── */
type PickGroup = "ready" | "open" | "done";
const PICK_LABEL: Record<PickGroup, string> = { ready: "Ready to approve", open: "On shift or missing a clock", done: "Approved" };
function Review({ s }: { s: OssState }) {
  const all = useMemo(() => Q.lines(s), [s]);
  const byEvent = useMemo(() => { const m = new Map<string, Q.Line[]>(); all.forEach((l) => { const a = m.get(l.event.id); if (a) a.push(l); else m.set(l.event.id, [l]); }); return m; }, [all]);
  const evOpts = Array.from(byEvent.keys()).map((id) => Q.eventOf(s, id)).sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  const focusEv = s.ui.focus?.kind === "event" ? s.ui.focus.id : null;
  const [ev, setEv] = useState<string>(focusEv && byEvent.has(focusEv) ? focusEv : byEvent.has("EVT-001") ? "EVT-001" : evOpts[0]?.id || "");
  const [sel, setSel] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const [q, setQ] = useState("");
  const [desk, setDesk] = useState("all");
  const ls = ev ? byEvent.get(ev) || [] : [];
  const t = Q.totals(ls);
  const ready = ls.filter((l) => l.status === "ready");
  const blocked = ls.filter((l) => l.status === "incomplete" || l.status === "needs_review" || l.status === "in_progress");
  const chosen = ready.filter((l) => sel.includes(l.asg.id));
  const tt = Q.totals(chosen);
  const toggle = (id: string) => setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.concat([id])));
  if (!evOpts.length) return (
    <Page eyebrow="Timesheets" title="No hours yet" sub="Timesheets are drafted automatically from clock-ins and clock-outs once a shift starts.">
      <Card icon={I.clock} title="Nothing to review" meta="Move the story to event day or the morning after to see the 3Arena hours"><span /></Card>
    </Page>);
  const e = Q.eventOf(s, ev);
  const done = ls.filter((l) => l.status === "approved" || l.status === "exported").length;
  const sent = ls.filter((l) => l.status === "exported").length;
  const groupOf = (id: string): PickGroup => { const l = byEvent.get(id) || []; return l.some((x) => x.status === "ready") ? "ready" : l.some((x) => x.status === "incomplete" || x.status === "needs_review" || x.status === "in_progress") ? "open" : "done"; };
  const needle = q.trim().toLowerCase();
  const shown = evOpts.filter((x) => (desk === "all" || Q.deskOf(x) === desk) && (!needle || (x.name + " " + Q.clientOf(s, x.clientId).name + " " + Q.deskOf(x)).toLowerCase().includes(needle)));
  const groups = (["ready", "open", "done"] as PickGroup[]).map((g) => ({ g, list: shown.filter((x) => groupOf(x.id) === g) }));
  const readyAll = all.filter((l) => l.status === "ready").length;
  const doneAll = all.filter((l) => l.status === "approved" || l.status === "exported").length;
  return (
    <Page eyebrow={"Timesheets · " + e.name.split(":")[0] + " · " + fmtDate(e.date + "T12:00:00Z")} title="Review and approve hours" sub="Drafted from verified clock records. Rostered against actual, the five-hour minimum and overtime are worked out for you. Each desk approves its own events; everything lands here.">
      <section className="nx-picker" aria-label="Choose an event">
        <div className="nx-picker-h">
          <span className="nx-k">Events with hours</span>
          <span className="oss-small oss-dim"><b className="oss-ink">{all.length.toLocaleString("en-IE")}</b> lines across {evOpts.length} events · <b className="oss-ink">{readyAll}</b> ready · <b className="oss-ink">{doneAll.toLocaleString("en-IE")}</b> approved</span>
          <span className="grow" />
          <Search value={q} onChange={setQ} placeholder="Search events" style={{ width: 220, maxWidth: "100%" }} />
          <select className="oss-input nx-sel" value={desk} onChange={(x) => setDesk(x.target.value)} aria-label="Desk"><option value="all">All desks</option>{DESKS.map((d) => <option key={d} value={d}>{d}</option>)}</select>
        </div>
        <div className="nx-picker-b">
          {groups.map(({ g, list }) => list.length > 0 && (
            <div key={g} className={"nx-pg " + g}>
              <div className="nx-pg-h"><span className="oss-dot" />{PICK_LABEL[g]}<span>{list.length}</span></div>
              <div className="nx-pg-l" role="listbox" aria-label={PICK_LABEL[g]}>
                {list.map((x) => { const xl = byEvent.get(x.id) || []; const xr = xl.filter((l) => l.status === "ready").length; const xd = xl.filter((l) => l.status === "approved" || l.status === "exported").length; const xb = xl.length - xr - xd; return (
                  <button key={x.id} role="option" aria-selected={x.id === ev} className={"nx-pi" + (x.id === ev ? " on" : "")} style={{ ["--k" as any]: kindVar(Q.kindOf(s, x)) }} onClick={() => { setEv(x.id); setSel([]); }}>
                    <span className="t">{x.name.split(":")[0]}<i className="nx-deskdot" title={Q.deskOf(x)} style={{ background: deskC(Q.deskOf(x)) }} /></span>
                    <span className="s">{fmtDate(x.date + "T12:00:00Z")} · {xl.length} lines{xr ? " · " + xr + " ready" : ""}{xb ? " · " + xb + " open" : ""}</span>
                    <span className="m"><i className="d" style={{ flexGrow: xd }} /><i className="r" style={{ flexGrow: xr }} /><i className="b" style={{ flexGrow: xb }} /></span>
                  </button>); })}
              </div>
            </div>))}
          {!shown.length && <div className="oss-small oss-dim" style={{ padding: 12 }}>No events match.</div>}
        </div>
      </section>
      <div className="ops-review">
        <div className="ops-review-main">
          {blocked.length > 0 && <div className="ops-blocked">
            <Icon d={I.alert} size={16} />
            <span className="grow"><b>{blocked.length} line{blocked.length > 1 ? "s" : ""} can't be approved yet.</b> {blocked.map((l) => l.worker.name + (l.status === "incomplete" ? " (missing clock)" : l.status === "needs_review" ? " (correction waiting)" : " (still on shift)")).join(", ")}.</span>
            <Btn size="sm" onClick={() => navigate("Timesheets", "corrections")}>Fix</Btn></div>}
          <Card pad={false} title={e.name} meta={ls.length + " lines · " + ready.length + " ready · " + done + " approved"} icon={I.doc}
            right={<Btn size="sm" disabled={!ready.length} onClick={() => setSel(ready.map((l) => l.asg.id))}>Select all ready ({ready.length})</Btn>}>
            <Table rows={ls} rowKey={(l) => l.id} onRow={(l) => openDrawer("timesheet", l.asg.id)} cols={withFoot(lineCols(s, { select: { sel, toggle } }), ls)} foot maxHeight={680}
              empty={<div className="oss-empty"><b>No lines</b></div>} />
          </Card>
        </div>
        <aside className="ops-receipt-wrap" aria-label="Hours summary">
          <div className="ops-receipt">
            <div className="ops-rc-head"><span>OSS Recruitment</span><b>Hours docket</b><small>{e.name.split(":")[0]} · {fmtDate(e.date + "T12:00:00Z")}</small></div>
            <div className="ops-rc-rows">
              <div><span>Lines</span><b>{ls.length}</b></div>
              <div><span>Rostered</span><b>{fmtHM(t.scheduled)}</b></div>
              <div><span>Worked</span><b>{fmtHM(t.worked)}</b></div>
              <div className="add"><span>5h minimum top-up</span><b>+{fmtHM(t.topup)}</b></div>
            </div>
            <div className="ops-rc-total"><span>Payable</span><b>{fmtHM(t.payable)}</b>{t.incomplete > 0 && <small>Provisional, {t.incomplete} missing a clock</small>}</div>
            <div className="ops-rc-rows">
              <div className="ot"><span>Overtime past finish</span><b>{fmtHM(t.extra)}</b></div>
            </div>
            <div className="ops-rc-note">Time past the rostered finish is flagged for review. No multiplier is applied.</div>
            <div className="ops-rc-meter"><Meter height={8} total={ls.length || 1} parts={[{ n: done, tone: "ok", label: "approved" }, { n: ready.length, tone: "accent", label: "ready" }, { n: blocked.length, tone: "bad", label: "blocked" }]} /></div>
            {chosen.length > 0 && <div className="ops-rc-sel">
              <span className="k">This approval</span>
              <div><span>{chosen.length} line{chosen.length === 1 ? "" : "s"}</span><b>{fmtHM(tt.payable)}</b></div>
              <button className="oss-link oss-small" onClick={() => setSel([])}>Clear selection</button>
            </div>}
            <div className="ops-rc-acts">
              <Btn kind="primary" block icon={I.check} disabled={!chosen.length} onClick={() => setPreview(true)}>{chosen.length ? "Approve " + chosen.length + " line" + (chosen.length === 1 ? "" : "s") : "Tick lines to approve"}</Btn>
              {!chosen.length && ready.length > 0 && <Btn block onClick={() => setSel(ready.map((l) => l.asg.id))}>Select all {ready.length} ready</Btn>}
              {sent > 0 && <Btn block kind="ghost" icon={I.link} onClick={() => navigate("Timesheets", "bullhorn")}>{sent} in Bullhorn</Btn>}
              {done > sent && <Btn block kind="ghost" icon={I.send} onClick={() => navigate("Timesheets", "bullhorn")}>Send approved to Bullhorn</Btn>}
            </div>
          </div>
        </aside>
      </div>
      {preview && <Drawer title={"Approve " + chosen.length + " lines"} eyebrow={e.name} onClose={() => setPreview(false)}
        footer={<><Btn kind="primary" icon={I.check} onClick={() => { run(E.approveLines, chosen.map((l) => l.asg.id)); setSel([]); setPreview(false); }}>Approve</Btn><Btn onClick={() => setPreview(false)}>Cancel</Btn></>}>
        <KV items={[["Lines", chosen.length], ["Worked", fmtHM(tt.worked)], ["5h minimum top-up", "+" + fmtHM(tt.topup)], ["Payable", fmtHM(tt.payable)], ["Overtime", fmtHM(tt.extra)], ["Left out", blocked.length]]} />
        <div className="oss-note" style={{ marginTop: 14 }}>Approval is recorded against your name and this version of each line. Sending to Bullhorn is the next step.</div>
      </Drawer>}
    </Page>
  );
}

/* ── corrections ─────────────────────────────────────────────────────────── */
function Corrections({ s }: { s: OssState }) {
  const focus = s.ui.focus?.kind === "assignment" ? s.ui.focus.id : null;
  const proposed = s.corrections.filter((c) => c.status === "proposed");
  const decided = s.corrections.filter((c) => c.status !== "proposed").reverse();
  const incomplete = Q.lines(s).filter((l) => l.status === "incomplete" && !s.corrections.some((c) => c.assignmentId === l.asg.id && c.status === "proposed"));
  const [form, setForm] = useState<{ asg: string; field: "in" | "out"; hm: string; reason: string } | null>(() => {
    const l = focus ? incomplete.find((x) => x.asg.id === focus) : undefined;
    return l ? { asg: l.asg.id, field: l.rawIn ? "out" : "in", hm: fmtTime(l.rawIn ? l.shift.end : l.shift.start), reason: "" } : null;
  });
  const start = (l: Q.Line) => setForm({ asg: l.asg.id, field: l.rawIn ? "out" : "in", hm: fmtTime(l.rawIn ? l.shift.end : l.shift.start), reason: "" });
  const nm = (asgId: string) => Q.nameOf(s, Q.asgOf(s, asgId).workerId);
  const hist = (c: (typeof s.corrections)[number]) => Q.shiftOf(s, Q.asgOf(s, c.assignmentId).shiftId);
  return (
    <Page eyebrow="Corrections" title="Fix a missing or wrong time" sub="The original clock record is kept. Every change shows before and after, the reason, who asked and who approved. Nobody approves their own.">
      <div className="ops-fix-h">
        <span className="ops-fix-count"><b>{proposed.length}</b> waiting for approval</span>
        <span className={"ops-fix-count" + (incomplete.length ? " bad" : "")}><b>{incomplete.length}</b> missing clock{incomplete.length === 1 ? "" : "s"}</span>
        <span className="ops-fix-count"><b>{decided.length}</b> decided</span>
      </div>
      <div className="ops-fix-grid">
        {proposed.map((c) => {
          const sh = Q.shiftOf(s, Q.asgOf(s, c.assignmentId).shiftId);
          const nextDay = dayKey(c.proposed) !== dayKey(sh.start);
          return (
            <article key={c.id} className="ops-fix">
              <header className="oss-row" style={{ gap: 12 }}>
                <Av name={nm(c.assignmentId)} lg />
                <span className="grow" style={{ minWidth: 0 }}>
                  <b className="ops-fix-name">{nm(c.assignmentId)}</b>
                  <span className="ops-fix-sub">{Q.eventOf(s, sh.eventId).name.split(":")[0]}, {sh.label} · rostered {fmtTime(sh.start)}-{fmtTime(sh.end)}</span>
                </span>
                <St tone="info">Clock-{c.field}</St>
              </header>
              <div className="ops-diff">
                <div className={"was" + (c.original ? "" : " miss")}><span>Recorded</span><b>{c.original ? fmtTime(c.original) : "Missing"}</b><small>{c.original ? "From the phone" : "No clock-" + c.field + " on file"}</small></div>
                <span className="arrow" aria-hidden="true"><Icon d="M5 12h14 M13 6l6 6-6 6" size={18} /></span>
                <div className="now"><span>Proposed</span><b>{fmtTime(c.proposed)}</b><small>{nextDay ? "Next day, " + fmtDate(c.proposed) : fmtDate(c.proposed)}</small></div>
              </div>
              <blockquote className="ops-quote">{c.reason}{c.note ? <span> · {c.note}</span> : null}</blockquote>
              <footer className="ops-fix-f">
                <span className="oss-tiny oss-muted grow">Proposed by {Q.nameOf(s, c.requestedBy)}, {fmtDate(c.requestedAt)} {fmtTime(c.requestedAt)}</span>
                <Btn size="sm" onClick={() => run(E.decideCorrection, c.id, false)}>Reject</Btn>
                <Btn size="sm" kind="primary" icon={I.check} onClick={() => run(E.decideCorrection, c.id, true)}>Approve</Btn>
              </footer>
            </article>);
        })}
        {!proposed.length && <div className="ops-fix ops-fix-empty"><Icon d={I.check} size={20} /><b>Nothing waiting for approval</b><span>Supervisors propose fixes from their phone. The office can propose one from a missing clock below.</span></div>}
      </div>
      <div className="oss-grid oss-g2" style={{ alignItems: "start", marginTop: 18 }}>
        <Card title="Missing clocks" meta={incomplete.length ? "Propose the right time to unblock approval" : "Every line has both clocks"} icon={I.clock} flush>
          <div className="oss-rows">
            {incomplete.map((l) => (
              <Row key={l.id} sel={focus === l.asg.id} lead={<Av name={l.worker.name} />} title={l.worker.name}
                sub={<span className="ops-clockpair"><span>{l.event.name.split(":")[0]}, {l.shift.label}</span><span className="pair"><i className={l.rawIn ? "" : "miss"}>In {hm(l.rawIn)}</i><i className={l.rawOut ? "" : "miss"}>Out {l.rawOut ? fmtTime(l.rawOut) : "missing"}</i></span></span>}
                end={<Btn size="sm" kind="primary" onClick={() => start(l)}>Propose time</Btn>} />))}
            {!incomplete.length && <div className="oss-empty"><b>No missing clocks</b></div>}
          </div>
        </Card>
        <Card title="History" meta="Every decision, with both times kept" icon={I.list}>
          <ol className="ops-hist">
            {decided.map((c) => (
              <li key={c.id} className={c.status}>
                <button onClick={() => openDrawer("timesheet", c.assignmentId)}>
                  <b>{nm(c.assignmentId)}</b>
                  <span className="t"><s>{c.original ? fmtTime(c.original) : "missing"}</s> → {fmtTime(c.proposed)} <span className="oss-muted">· {hist(c).label}</span></span>
                  <span className="by">Asked by {Q.nameOf(s, c.requestedBy)} · {c.status === "approved" ? "approved" : "rejected"} by {Q.nameOf(s, c.decidedBy!)} at {fmtTime(c.decidedAt!)}</span>
                </button>
              </li>))}
            {!decided.length && <li className="none">No decisions yet.</li>}
          </ol>
        </Card>
      </div>
      {form && <Drawer title={"Clock-" + form.field + " for " + nm(form.asg)} eyebrow="Propose a correction" onClose={() => setForm(null)}
        footer={<><Btn kind="primary" disabled={!form.reason.trim()} onClick={() => { const r = run(E.proposeCorrection, form.asg, form.field, form.hm, form.reason); if (r.ok) setForm(null); }}>Send for approval</Btn><Btn onClick={() => setForm(null)}>Cancel</Btn></>}>
        <div style={{ display: "grid", gap: 14 }}>
          <div className="oss-field"><label htmlFor="cf">Which time</label><select id="cf" className="oss-input" value={form.field} onChange={(e) => setForm({ ...form, field: e.target.value as any })}><option value="in">Clock-in</option><option value="out">Clock-out</option></select></div>
          <div className="oss-field"><label htmlFor="ct">Correct time</label><TimeSelect id="ct" value={form.hm} onChange={(v) => setForm({ ...form, hm: v })} /><div className="help">A clock-out before the start time counts as after midnight.</div></div>
          <div className="oss-field"><label htmlFor="cr">Reason</label><textarea id="cr" className="oss-input" rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Phone battery died, supervisor saw them leave at 23:30" /></div>
          <div className="oss-note">Someone else with approval rights signs this off.</div>
        </div>
      </Drawer>}
    </Page>
  );
}

/* ── Bullhorn ────────────────────────────────────────────────────────────── */
const FIELDS: [string, string][] = [["Candidate", "Bullhorn candidate ID"], ["Client", "Client corporation ID"], ["Event and shift", "Name, date, rostered start and finish"], ["Approved times", "Start, finish, break"], ["Hours", "Worked, 5h top-up, payable, overtime"], ["Approval", "Approved by and when, any correction"], ["Transfer key", "Stops a retry creating duplicates"]];
function Bullhorn({ s }: { s: OssState }) {
  const waiting = Q.lines(s).filter((l) => l.status === "approved" && !l.item);
  const byEvent = useMemo(() => { const m = new Map<string, Q.Line[]>(); waiting.forEach((l) => m.set(l.event.id, (m.get(l.event.id) || []).concat([l]))); return Array.from(m); }, [s]);
  /* Sends with a blocked row first (they need someone), then newest first. */
  const batches = s.batches.slice().reverse().sort((a, b) => Number(Q.batchSummary(s, b.id).blocked > 0) - Number(Q.batchSummary(s, a.id).blocked > 0));
  const items = s.items;
  const accepted = items.filter((i) => i.state === "accepted");
  const queued = items.filter((i) => i.state === "queued");
  const sentN = items.filter((i) => i.attempts.length > 0).length;
  const blocked = items.filter((i) => i.state === "blocked" || i.state === "failed");
  const last = items.flatMap((i) => i.attempts.map((a) => a.at)).sort().pop();
  const acceptedMin = accepted.reduce((n, i) => n + i.snapshot.payableMin, 0);
  const [allB, setAllB] = useState(false);
  const deskOfBatch = (b: (typeof s.batches)[number]) => (DESKS as readonly string[]).includes(b.scope) ? b.scope : (() => { const it = s.items.find((i) => i.batchId === b.id); return it ? Q.deskOf(Q.eventOf(s, it.snapshot.eventId)) : "Dublin events desk"; })();
  const byDesk = DESKS.map((d) => ({ d, min: accepted.filter((i) => Q.deskOf(Q.eventOf(s, i.snapshot.eventId)) === d).reduce((n, i) => n + i.snapshot.payableMin, 0), rows: accepted.filter((i) => Q.deskOf(Q.eventOf(s, i.snapshot.eventId)) === d).length })).filter((x) => x.rows);
  const deskPeak = Math.max(1, ...byDesk.map((x) => x.min));
  const send = (eid: string, l: Q.Line[]) => { const r = run(E.createBatch, l.map((x) => x.asg.id), Q.eventOf(s, eid).name + ", " + fmtDayMonth(l[0].shift.start), eid); if (r.ok) { run(E.sendBatch, r.data.id); setTimeout(() => openDrawer("batch", r.data.id), 50); } };
  return (
    <Page eyebrow="Bullhorn handover" title="Approved hours into Bullhorn" sub="Only approved lines are sent. Each row is matched to a Bullhorn candidate and client, and every send gets a receipt you can check.">
      <section className="ops-pipe">
        <div className="ops-pipe-lead">
          <span className="oss-eyebrow">In Bullhorn</span>
          <b>{acceptedMin >= 6000 ? Math.floor(acceptedMin / 60).toLocaleString("en-IE") + "h" + (acceptedMin % 60 ? " " + (acceptedMin % 60) + "m" : "") : fmtHM(acceptedMin)}</b>
          <span className="oss-small oss-dim">{accepted.length} row{accepted.length === 1 ? "" : "s"} accepted · {acceptedMin.toLocaleString("en-IE")} min</span>
          <span className="oss-tiny oss-muted">{last ? "Last sync " + fmtDate(last) + ", " + fmtTime(last) : "No sends yet"}</span>
        </div>
        <div className="ops-pipe-steps">
          <Steps steps={[
            { label: "Approved, not sent", n: waiting.length, sub: waiting.length ? fmtHM(Q.totals(waiting).payable) : "Nothing waiting", tone: waiting.length ? "accent" : undefined, on: waiting.length > 0 },
            { label: "Queued", n: queued.length, sub: "Waiting on Bullhorn" },
            { label: "Sent", n: sentN, sub: "With a receipt per row" },
            { label: "Accepted", n: accepted.length, tone: accepted.length ? "ok" : undefined, sub: "In Bullhorn" },
            { label: "Blocked", n: blocked.length, tone: blocked.length ? "bad" : undefined, sub: blocked.length ? "Needs a candidate match" : "Nothing stuck" }
          ]} />
        </div>
      </section>
      <div className="oss-grid oss-main-side" style={{ alignItems: "start" }}>
        <div className="oss-stack">
          {blocked.length > 0 && <div className="ops-stuck">
            <div className="ops-stuck-h"><Icon d={I.alert} size={16} /><b>Hours that can't land yet</b><span className="oss-tiny">Payroll cut-off Fri 27 Nov</span></div>
            {blocked.map((i) => <div key={i.id} className="ops-stuck-r"><Av name={Q.nameOf(s, i.snapshot.workerId)} /><span className="grow"><b>{Q.nameOf(s, i.snapshot.workerId)}</b><span>{(i.error || "No Bullhorn candidate match")} · {fmtHM(i.snapshot.payableMin)} · {i.batchId}</span></span>
              <Btn size="sm" kind="primary" onClick={() => openDrawer("mapping", i.snapshot.workerId)}>Match and retry</Btn></div>)}
          </div>}
          {byEvent.length > 0 && <Card title="Ready to send" meta="Approved hours grouped by event" icon={I.send} flush>
            <div className="oss-rows">{byEvent.map(([eid, l]) => (
              <Row key={eid} lead={<RIcon d={I.doc} tone="info" />} title={Q.eventOf(s, eid).name} sub={l.length + " lines · " + fmtHM(Q.totals(l).payable) + " payable" + (l.some((x) => !x.mapped) ? " · " + l.filter((x) => !x.mapped).length + " not matched yet" : "")}
                end={<Btn size="sm" kind="primary" icon={I.send} onClick={() => send(eid, l)}>Send to Bullhorn</Btn>} />))}
            </div>
          </Card>}
          <div className="oss-rule"><span>Sends</span></div>
          <div className="ops-batches">
            {batches.slice(0, allB ? 200 : 12).map((b) => { const x = Q.batchSummary(s, b.id); const bd = deskOfBatch(b); const at = x.items.flatMap((i) => i.attempts.map((a) => a.at)).sort().pop(); const n = x.items.length || 1; return (
              <button key={b.id} className={"ops-batch" + (x.blocked ? " has-bad" : "")} onClick={() => openDrawer("batch", b.id)}>
                <span className="ops-batch-h"><span className="id">{b.id}</span><span className="when">{at ? when(at) : "Not sent"}</span></span>
                <b className="ops-batch-t">{b.label}</b>
                <span className="nx-desk sm nx-bdesk"><i style={{ background: deskC(bd) }} />{DESK_SHORT[bd] || bd}</span>
                <span className="ops-batch-fig"><b>{x.items.length}</b> rows<span className="sep" /><b>{fmtHM(x.totalMin)}</b> payable</span>
                <span className="ops-batch-min">{x.totalMin.toLocaleString("en-IE")} min</span>
                <span className="ops-batch-bar" aria-hidden="true"><i className="ok" style={{ width: (x.accepted / n) * 100 + "%" }} /><i className="q" style={{ width: (x.queued / n) * 100 + "%" }} /><i className="bad" style={{ width: ((x.blocked + x.failed) / n) * 100 + "%" }} /></span>
                <span className="ops-batch-st"><St tone="ok">{x.accepted} accepted</St>{x.queued > 0 && <St tone="info">{x.queued} queued</St>}{x.blocked + x.failed > 0 && <St tone="bad">{x.blocked + x.failed} blocked</St>}</span>
              </button>); })}
            {batches.length > 12 && !allB && <button className="nx-more" onClick={() => setAllB(true)}>Show all {batches.length} sends</button>}
            {!batches.length && <div className="oss-empty"><b>Nothing sent yet</b></div>}
          </div>
        </div>
        <div className="oss-stack">
          {byDesk.length > 0 && <Card title="In Bullhorn by desk" meta="Accepted payable hours" icon={I.chart}>
            <div className="nx-deskbars">{byDesk.sort((a, b) => b.min - a.min).map((x) => (
              <div key={x.d} className="r"><span className="nm"><i style={{ background: deskC(x.d) }} />{DESK_SHORT[x.d]}</span><span className="bar"><i style={{ width: (x.min / deskPeak) * 100 + "%", background: deskC(x.d) }} /></span><b>{fmtHM(x.min)}</b><span className="n">{x.rows} rows</span></div>))}</div>
          </Card>}
          <Card title="What goes across" meta="One row per approved line" icon={I.list}>
            <div className="oss-list">{FIELDS.map(([k, v]) => <div key={k} className="oss-row oss-small"><b className="oss-ink" style={{ width: 120, flex: "none" }}>{k}</b><span className="oss-dim">{v}</span></div>)}</div>
          </Card>
          <Card title="How it stays clean" icon={I.shield}>
            <div className="oss-small" style={{ lineHeight: 1.65, color: "var(--body)" }}>Retries resend only the rows that failed, with the same transfer key, so nothing is counted twice. Reopening approved hours creates a new version and a new row. Sage invoicing and Bright payroll carry on from Bullhorn as they do today.</div>
            <div className="oss-tiny oss-muted" style={{ marginTop: 10 }}>Bullhorn is simulated in this demo.</div>
          </Card>
        </div>
      </div>
    </Page>
  );
}
void setUi;
