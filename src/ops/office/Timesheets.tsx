/* Timesheets from attendance: scheduled and actual hours, breaks, the minimum-pay
   top-up shown apart from hours worked, rates, overtime flags and approval stages.
   Approved lines export to a Sage CSV; Bullhorn sync is a simulated preview. */

import { useMemo, useState } from "react";
import type { OpsState } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { go, setQuery, useRoute } from "../router";
import { office, useOps } from "../store";
import { addDays, dayKey, decHours, fmtDay, fmtHM, fmtMoney, fmtTime, isoWeekdayOfDay, relTime } from "../time";
import { Btn, Col, downloadCsv, Drawer, I, Icon, Notice, Panel, Search, Seg, Select, Sim, Status, Table } from "../ui/kit";
import { SetTime } from "./dialogs";
import { Page, plural } from "./common";

const TONE: Record<Q.LineStatus, Q.Tone> = { in_progress: "info", missing: "bad", review: "bad", supervisor: "warn", office: "warn", approved: "ok", exported: "grey" };
const LineStatus = ({ st }: { st: Q.LineStatus }) => <Status tone={TONE[st]}>{Q.LINE_LABEL[st]}</Status>;

function lineCols(s: OpsState, onFix: (id: string) => void, showEvent = true): Col<Q.Line>[] {
  return [
    { key: "w", label: "Worker", render: (l) => <div className="stack" style={{ gap: 0 }}><button className="linkbtn" onClick={(e) => { e.stopPropagation(); go("/crew/" + l.w.id); }}>{l.w.name}</button><span className="tiny dim">{l.a.role}{l.w.rtw === "Stamp 2" ? " · Stamp 2" : ""}</span></div> },
    ...(showEvent ? [{ key: "e", label: "Event and shift", hide: "md" as const, render: (l: Q.Line) => <div className="stack" style={{ gap: 0 }}><span className="ellip" style={{ maxWidth: 260 }}>{l.ev.name}</span><span className="tiny dim">{l.sh.label}</span></div> }] : []),
    { key: "d", label: "Date", render: (l) => <span className="nowrap">{fmtDay(l.day)}</span> },
    { key: "sch", label: "Scheduled", hide: "sm", render: (l) => <span className="num nowrap">{fmtTime(l.sh.start)}-{fmtTime(l.sh.end)}</span> },
    { key: "act", label: "Actual", render: (l) => <span className="num nowrap">{l.inAt ? fmtTime(l.inAt) : <span className="tone-bad">--:--</span>}-{l.outAt ? fmtTime(l.outAt) : <span className="tone-bad">--:--</span>}{l.corrected && <span className="tiny dim"> edited</span>}</span> },
    { key: "brk", label: "Break", cls: "r", hide: "md", render: (l) => <span className="num">{l.breakMin ? fmtHM(l.breakMin) : "-"}</span> },
    { key: "wk", label: "Worked", cls: "r", render: (l) => <span className="num">{l.inAt && l.outAt ? fmtHM(l.workedMin) : "-"}</span> },
    { key: "pay", label: "Payable", cls: "r", render: (l) => <span className="num"><b className="ink">{l.inAt && l.outAt ? fmtHM(l.payableMin) : "-"}</b>{l.topupMin > 0 && <div className="tiny tone-info">incl. {fmtHM(l.topupMin)} minimum</div>}</span> },
    { key: "gross", label: "Est. pay", cls: "r", hide: "md", render: (l) => <span className="num">{l.payableMin ? fmtMoney(l.pay) : "-"}<div className="tiny dim">{fmtMoney(l.rate)}/h</div></span> },
    { key: "flags", label: "Flags", hide: "sm", render: (l) => <div className="stack" style={{ gap: 2 }}>{l.ot.map((o) => <span key={o} className="tiny tone-warn">{o}</span>)}{l.openEx.map((x) => <span key={x.id} className="tiny tone-bad">{x.detail}</span>)}</div> },
    { key: "st", label: "Status", render: (l) => (
      <div className="stack" style={{ gap: 4, alignItems: "flex-start" }}>
        <LineStatus st={l.status} />
        {(l.status === "missing" || l.status === "review") && <button className="linkbtn tiny" onClick={(e) => { e.stopPropagation(); onFix(l.a.id); }}>Set the time</button>}
        {l.sup && l.status !== "supervisor" && <span className="tiny dim">Supervisor: {Q.nameOf(s, l.sup.by)}</span>}
      </div>) }
  ];
}

/** Timesheet lines for one event (workspace tab). */
export function LinesPanel({ eventId }: { eventId: string }) {
  const s = useOps();
  const ls = useMemo(() => Q.lines(s, { eventId }), [s, eventId]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [fix, setFix] = useState<string | null>(null);
  const t = Q.lineTotals(ls);
  const ready = ls.filter((l) => l.status === "office" || l.status === "supervisor");
  if (!ls.length) return <Panel title="Timesheets"><span className="dim">Timesheets appear here once a shift starts and crew clock in.</span></Panel>;
  const ids = [...sel].map((k) => k.replace("TS-", ""));
  return (
    <Panel title="Timesheets" meta={plural(t.count, "line") + " · " + fmtHM(t.payable) + " payable · " + fmtMoney(t.pay) + " estimated"} flush
      right={<><Btn size="sm" kind="primary" icon={I.check} disabled={!sel.size} onClick={() => { office(E.approveOffice, ids); setSel(new Set()); }}>Approve selected ({sel.size})</Btn>
        {ready.length > 0 && <Btn size="sm" onClick={() => setSel(new Set(ready.map((l) => l.id)))}>Select ready ({ready.length})</Btn>}</>}>
      <Table label="Timesheet lines" cols={lineCols(s, setFix, false)} rows={ls} rowKey={(l) => l.id} selected={sel}
        onSelect={(k, on) => setSel((x) => { const n = new Set(x); if (on) n.add(k); else n.delete(k); return n; })} />
      {fix && <SetTime asgId={fix} onClose={() => setFix(null)} />}
    </Panel>
  );
}

function SageDrawer({ onClose }: { onClose: () => void }) {
  const s = useOps();
  const ready = Q.lines(s, { status: ["approved"] });
  const t = Q.lineTotals(ready);
  const doExport = () => {
    const r = office(E.exportSage, ready.map((l) => l.a.id));
    if (r.ok) downloadCsv(r.data.file, r.data.header, r.data.rows);
  };
  const again = (id: string) => {
    const x = s.exports.find((e) => e.id === id)!;
    // The rows frozen at export time, so later rate or time changes never alter a file already sent to payroll.
    const rows = x.rows || x.asgIds.map((k) => Q.line(s, k.split(":")[0])).filter((l): l is Q.Line => !!l).map((l) => E.sageRow(s, l, x.id));
    downloadCsv(x.file, E.SAGE_HEADER, rows);
  };
  return (
    <Drawer wide title="Sage payroll export" sub="Approved timesheets become a payroll file. Columns are a sample format to confirm with OSS payroll." onClose={onClose}
      footer={<><span className="small dim grow">{plural(ready.length, "approved line")} · {fmtHM(t.payable)} payable · {fmtMoney(t.pay)}</span><Btn kind="primary" icon={I.download} disabled={!ready.length} onClick={doExport}>Download CSV and mark exported</Btn></>}>
      <div className="stack g16">
        <Notice tone="info">This produces a file to import into Sage. It does not connect to Sage or pay anyone.</Notice>
        {!ready.length ? <div className="empty"><b>Nothing approved waiting for export</b>Approve timesheets first.</div> : (
          <div className="panel"><Table label="Export preview" rows={ready.slice(0, 60)} rowKey={(l) => l.id} cols={[
            { key: "ref", label: "Payroll ref", render: (l) => <span className="num small nowrap">{l.w.bullhornId || l.w.id}</span> },
            { key: "n", label: "Employee", render: (l) => l.w.name },
            { key: "d", label: "Date", render: (l) => <span className="nowrap">{fmtDay(l.day)}</span> },
            { key: "e", label: "Event", hide: "sm", render: (l) => <span className="ellip" style={{ maxWidth: 200, display: "inline-block" }}>{l.ev.name}</span> },
            { key: "h", label: "Payable (h)", cls: "r", render: (l) => <span className="num">{decHours(l.payableMin)}</span> },
            { key: "m", label: "Of which minimum", cls: "r", render: (l) => <span className="num">{l.topupMin ? decHours(l.topupMin) : "-"}</span> },
            { key: "r", label: "Rate", cls: "r", render: (l) => <span className="num">{fmtMoney(l.rate)}</span> },
            { key: "g", label: "Gross", cls: "r", render: (l) => <span className="num">{fmtMoney(l.pay)}</span> }]} />
            {ready.length > 60 && <div className="pager"><span>Showing 60 of {ready.length}; all are in the file.</span></div>}</div>
        )}
        <div className="stack g8">
          <h3>Previous exports</h3>
          {!s.exports.length && <span className="dim small">None yet.</span>}
          {s.exports.slice().reverse().map((x) => (
            <div key={x.id} className="row small wrap"><Icon d={I.file} /><b className="ink">{x.id}</b><span className="dim">{x.period} · {x.asgIds.length} lines · {fmtHM(x.minutes)} · {fmtMoney(x.amount)} · {Q.nameOf(s, x.by)}, {relTime(x.at, s.clock)}</span>
              <span className="grow" /><Btn size="sm" kind="quiet" icon={I.download} onClick={() => again(x.id)}>Download again</Btn></div>
          ))}
        </div>
      </div>
    </Drawer>
  );
}

export function BullhornDrawer({ onClose }: { onClose: () => void }) {
  const s = useOps();
  const pending = s.workers.filter((w) => w.bullhornState === "pending");
  const unlinked = s.workers.filter((w) => w.bullhornState === "not_linked" && w.status === "active");
  return (
    <Drawer title="Bullhorn sync" sub="Two-way: worker records both ways, approved hours to Bullhorn placements." onClose={onClose}
      footer={<Btn kind="primary" icon={I.sync} onClick={() => office(E.syncBullhorn)}>Run sync now</Btn>}>
      <div className="stack g16">
        <Notice tone="warn">Simulated. Bullhorn is not connected in this demo; no records leave this browser.</Notice>
        <div className="grid3">
          <div className="panel" style={{ padding: 12 }}><b className="ink num" style={{ fontSize: 22 }}>{pending.length}</b><div className="small dim">worker updates to send</div></div>
          <div className="panel" style={{ padding: 12 }}><b className="ink num" style={{ fontSize: 22 }}>{unlinked.length}</b><div className="small dim">new workers to create</div></div>
          <div className="panel" style={{ padding: 12 }}><b className="ink num" style={{ fontSize: 22 }}>{s.exports.reduce((n, x) => n + x.asgIds.length, 0)}</b><div className="small dim">exported hours lines</div></div>
        </div>
        {pending.length > 0 && <div className="stack g8"><h3>Waiting to send</h3>{pending.slice(0, 8).map((w) => <div key={w.id} className="row small"><b className="ink">{w.name}</b><span className="dim">{w.bullhornId} · details changed in OSS</span></div>)}</div>}
        <div className="stack g8">
          <h3>History</h3>
          {s.syncs.slice().reverse().map((x) => <div key={x.id} className="small"><span className="dim">{fmtDay(dayKey(x.at))} {fmtTime(x.at)}, {Q.nameOf(s, x.by)}:</span> {x.summary} <Sim /></div>)}
        </div>
      </div>
    </Drawer>
  );
}

export default function Timesheets() {
  const s = useOps();
  const r = useRoute();
  const today = dayKey(s.clock);
  const view = r.q.get("view") === "day" ? "day" : "week";
  const date = r.q.get("date") || today;
  const status = r.q.get("status") || "all";
  const [q, setQ] = useState("");
  const [eventId, setEventId] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [fix, setFix] = useState<string | null>(null);
  const [sage, setSage] = useState(false);
  const [bh, setBh] = useState(false);
  const from = view === "day" ? date : addDays(date, -isoWeekdayOfDay(date));
  const to = view === "day" ? date : addDays(from, 6);
  const all = useMemo(() => Q.lines(s, { from, to }), [s, from, to]);
  const groups: Record<string, Q.LineStatus[]> = { attention: ["missing", "review"], supervisor: ["supervisor"], office: ["office"], approved: ["approved"], exported: ["exported"], progress: ["in_progress"] };
  const ls = all.filter((l) => (status === "all" || groups[status]?.includes(l.status)) && (!eventId || l.ev.id === eventId) && (!q || l.w.name.toLowerCase().includes(q.toLowerCase())));
  const t = Q.lineTotals(ls);
  const count = (k: string) => all.filter((l) => groups[k].includes(l.status)).length;
  const ids = [...sel].map((k) => k.replace("TS-", ""));
  const approvable = ls.filter((l) => l.status === "office" || l.status === "supervisor");
  const warnings = useMemo(() => {
    const seen = new Map<string, number>();
    for (const a of s.assignments) if (a.status === "confirmed") { const sh = Q.shift(s, a.shiftId); const d = dayKey(sh.start); if (d >= addDays(today, -isoWeekdayOfDay(today)) && d <= addDays(today, 6 - isoWeekdayOfDay(today))) seen.set(a.workerId, 0); }
    return [...seen.keys()].map((id) => { const w = Q.worker(s, id); const m = Q.weekMinutes(s, id, s.clock); const lim = Q.weekLimit(s, w); return { w, m, lim }; })
      .filter((x) => x.m > x.lim.min * 0.85).sort((a, b) => b.m / b.lim.min - a.m / a.lim.min).slice(0, 8);
  }, [s, today]);
  return (
    <Page title="Timesheets" sub="Built from clock-in and clock-out. Supervisors approve first, then the office approves for payroll."
      actions={<><Btn icon={I.sync} onClick={() => setBh(true)}>Bullhorn sync</Btn><Btn kind="primary" icon={I.download} onClick={() => setSage(true)}>Sage export</Btn></>}>
      <div className="toolbar">
        <Seg label="Period" value={view} onChange={(v) => setQuery({ view: v })} items={[{ id: "day", label: "Day" }, { id: "week", label: "Week" }]} />
        <Btn size="sm" icon={I.chevL} iconOnly title="Previous" onClick={() => setQuery({ date: addDays(date, view === "day" ? -1 : -7) })} />
        <Btn size="sm" disabled={date === today} onClick={() => setQuery({ date: today })}>This {view}</Btn>
        <Btn size="sm" icon={I.chevR} iconOnly title="Next" onClick={() => setQuery({ date: addDays(date, view === "day" ? 1 : 7) })} />
        <span className="strong">{view === "day" ? fmtDay(date) : fmtDay(from) + " to " + fmtDay(to)}</span>
      </div>
      <div className="strip six" style={{ marginBottom: 14 }}>
        <div><b>{t.count}</b><span>Lines</span></div>
        <div><b>{fmtHM(t.sched)}</b><span>Scheduled</span></div>
        <div><b>{fmtHM(t.worked)}</b><span>Worked (after breaks)</span></div>
        <div><b>{fmtHM(t.topup)}</b><span>Minimum-pay top-up</span></div>
        <div><b>{fmtHM(t.payable)}</b><span>Payable</span></div>
        <div><b>{fmtMoney(t.pay)}</b><span>Estimated gross</span></div>
      </div>
      <div className="toolbar">
        <div className="row wrap" style={{ gap: 6 }}>
          {[["all", "All", all.length], ["attention", "Needs a fix", count("attention")], ["supervisor", "Awaiting supervisor", count("supervisor")], ["office", "Awaiting office", count("office")], ["approved", "Approved", count("approved")], ["exported", "Exported", count("exported")]].map(([id, label, n]) =>
            <button key={id as string} className={"chip" + (status === id ? " on" : "")} onClick={() => setQuery({ status: id === "all" ? null : (id as string) })}>{label} <span className="num dim">{n}</span></button>)}
        </div>
      </div>
      <div className="toolbar">
        <Search value={q} onChange={setQ} placeholder="Search worker" />
        <div style={{ width: 280 }}><Select sm label="Event" value={eventId} onChange={setEventId} placeholder="All events" options={[...new Map(all.map((l) => [l.ev.id, l.ev.name])).entries()].map(([v, l]) => ({ value: v, label: l }))} /></div>
        <span className="grow" />
        {approvable.length > 0 && <Btn size="sm" onClick={() => setSel(new Set(approvable.map((l) => l.id)))}>Select ready to approve ({approvable.length})</Btn>}
        <Btn size="sm" kind="primary" icon={I.check} disabled={!sel.size} onClick={() => { office(E.approveOffice, ids); setSel(new Set()); }}>Approve selected ({sel.size})</Btn>
      </div>
      <div className="panel">
        <Table label="Timesheets" cols={lineCols(s, setFix)} rows={ls} rowKey={(l) => l.id} selected={sel} groupBy={(l) => fmtDay(l.day) + " · " + l.ev.name}
          onSelect={(k, on) => setSel((x) => { const n = new Set(x); if (on) n.add(k); else n.delete(k); return n; })}
          empty={<div className="empty"><b>No timesheets in this period</b>Lines appear once a shift starts and crew clock in.</div>} />
      </div>
      <div className="grid2" style={{ marginTop: 16, alignItems: "start" }}>
        <Panel title="Weekly hours this week" meta={"Stamp 2 limit " + fmtHM(s.rules.stamp2WeekMin) + " in term time; everyone else is warned over " + fmtHM(s.rules.weekWarnMin)}>
          {!warnings.length ? <span className="dim">No one is near their weekly limit.</span> : <div className="stack g8">
            {warnings.map((x) => <div key={x.w.id} className="row small"><button className="linkbtn" onClick={() => go("/crew/" + x.w.id)}>{x.w.name}</button><span className="dim">{x.w.rtw}</span><span className="grow" />
              <Status tone={x.m > x.lim.min ? "bad" : "warn"}>{fmtHM(x.m)} of {fmtHM(x.lim.min)}</Status></div>)}
          </div>}
        </Panel>
        <Panel title="Pay rules in use" right={<Btn size="sm" kind="ghost" onClick={() => go("/settings/rules")}>Change</Btn>}>
          <div className="stack g8 small">
            <span><Icon d={I.check} size={13} /> Minimum paid: {s.rules.minimumOn ? fmtHM(s.rules.minimumMin) + " per shift, shown separately from hours worked" : "off"}</span>
            <span><Icon d={I.check} size={13} /> Unpaid break: {fmtHM(s.rules.breakMin)} on shifts over {fmtHM(s.rules.breakAfterMin)}</span>
            <span><Icon d={I.alert} size={13} /> Overtime is flagged, not paid automatically: {s.rules.otPastFinish ? "finishing 15 min or more past schedule" : "past-finish flag off"}{s.rules.otDailyMin ? "; over " + fmtHM(s.rules.otDailyMin) + " a day" : ""}. To validate with OSS.</span>
          </div>
        </Panel>
      </div>
      {fix && <SetTime asgId={fix} onClose={() => setFix(null)} />}
      {sage && <SageDrawer onClose={() => setSage(false)} />}
      {bh && <BullhornDrawer onClose={() => setBh(false)} />}
    </Page>
  );
}
