/* Reports: the weekly client export OSS does by hand today, hours and overtime
   by employee, event and client, a payroll-ready file of approved hours, and
   who holds which certificate. Each one reads like a report: period and
   export at the top, one plain sentence, the figures, then the detail.
   Exports open in Excel. */

import "../../styles/oss-biz.css";
import { useMemo, useState, type ReactNode } from "react";
import type { OssState } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { docLabel, mappingFor } from "../seed";
import { navigate, openDrawer, run, useOss } from "../store";
import { tabOf } from "../modules";
import { addDays, dayKey, fmtDate, fmtDayMonth, fmtHM, fmtTime, zoned } from "../time";
import { Av, Btn, Card, Chip, hueVar, I, Icon, kindVar, Meter, regionVar, Ribbon, St, Steps, Table, Tag, type Col, deskVar } from "../ui/kit";
import { regionOfW } from "./Staff";
import { downloadCsv } from "../ui/fmt";

export default function Reports() {
  const s = useOss();
  const tab = tabOf(s, "Reports");
  if (tab === "hours") return <Hours s={s} />;
  if (tab === "payroll") return <Payroll s={s} />;
  if (tab === "qualifications") return <Qualifications s={s} />;
  return <ClientReport s={s} />;
}

const WEEKS = ["2026-11-09", "2026-11-16"];
const weekLabel = (w: string) => fmtDayMonth(zoned(w, "12:00")) + " to " + fmtDayMonth(zoned(addDays(w, 6), "12:00"));
const audited = (what: string, label: string, summary: string) => run((d) => { E.audit(d, "Shane Esler", "report.exported", { type: "report", id: what, label }, summary, "systems"); return { ok: true, message: "Downloaded. Opens in Excel." }; });

/** The report frame: a document header (name, period, export), one plain-English line, then the body. */
function Report({ kicker, title, period, controls, action, lede, children }: { kicker: string; title: string; period: ReactNode; controls?: ReactNode; action?: ReactNode; lede: ReactNode; children: ReactNode }) {
  return (
    <div className="oss-page">
      <article className="rp-doc">
        <header className="rp-head">
          <div className="rp-mark"><Icon d={I.doc} size={18} /></div>
          <div className="grow" style={{ minWidth: 0 }}>
            <div className="oss-eyebrow">{kicker}</div>
            <h1>{title}</h1>
            <div className="rp-period"><Icon d={I.cal} size={13} />{period}<span className="rp-gen">From live records</span></div>
          </div>
          {action && <div className="rp-act">{action}</div>}
        </header>
        {controls && <div className="rp-controls">{controls}</div>}
        <p className="rp-lede">{lede}</p>
        {children}
      </article>
    </div>
  );
}

/* ── client report: one client, one week, with the days laid out ─────────── */
function ClientReport({ s }: { s: OssState }) {
  const [client, setClient] = useState("C01");
  const [week, setWeek] = useState(WEEKS[0]);
  const all = Q.lines(s, { clientId: client, weekOf: week });
  const ls = all.filter((l) => l.status === "approved" || l.status === "exported");
  const pending = all.length - ls.length;
  const t = Q.totals(ls);
  const cl = Q.clientOf(s, client);
  const staff = new Set(ls.map((l) => l.worker.id)).size;
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));
  const byDay = days.map((d) => ({ d, min: ls.filter((l) => dayKey(l.shift.start) === d).reduce((n, l) => n + l.payableMin, 0), n: ls.filter((l) => dayKey(l.shift.start) === d).length }));
  const dmax = Math.max(1, ...byDay.map((x) => x.min));
  const cols: Col<Q.Line>[] = [
    { key: "w", label: "Employee", render: (l) => <span className="oss-row"><Av name={l.worker.name} size="sm" /><span className="strong">{l.worker.name}</span></span>, foot: ls.length + " lines" },
    { key: "e", label: "Event", render: (l) => <span>{l.event.name.split(":")[0]}<div className="oss-tiny oss-muted">{l.shift.label}</div></span> },
    { key: "d", label: "Date", nowrap: true, render: (l) => fmtDate(l.shift.start) },
    { key: "r", label: "Rostered", num: true, render: (l) => fmtTime(l.shift.start) + " to " + fmtTime(l.shift.end) },
    { key: "a", label: "Actual", num: true, render: (l) => fmtTime(l.approvedStart!) + " to " + fmtTime(l.approvedEnd!) },
    { key: "wk", label: "Hours", num: true, render: (l) => fmtHM(l.workedMin), foot: fmtHM(t.worked) },
    { key: "x", label: "Overtime", num: true, render: (l) => (l.extraMin ? fmtHM(l.extraMin) : "-"), foot: fmtHM(t.extra) },
    { key: "p", label: "Charged", num: true, render: (l) => <b className="oss-ink">{fmtHM(l.payableMin)}</b>, foot: fmtHM(t.payable) }
  ];
  const exportCsv = () => {
    const rows = ls.map((l) => [l.worker.name, l.event.name, l.shift.label, l.workDate, fmtTime(l.shift.start), fmtTime(l.shift.end), fmtTime(l.approvedStart!), fmtTime(l.approvedEnd!), fmtHM(l.workedMin), fmtHM(l.extraMin), fmtHM(l.payableMin)]);
    rows.push(["Total", "", "", "", "", "", "", "", fmtHM(t.worked), fmtHM(t.extra), fmtHM(t.payable)]);
    downloadCsv("OSS " + cl.name + " week " + week + ".csv", ["Employee", "Event", "Shift", "Date", "Rostered start", "Rostered finish", "Actual start", "Actual finish", "Hours", "Overtime", "Charged hours"], rows);
    audited("client-" + client, cl.name, "Exported " + cl.name + " weekly report: " + ls.length + " lines, " + fmtHM(t.payable) + " (" + weekLabel(week) + ")");
  };
  return (
    <Report kicker="Client report" title={"Weekly hours: " + cl.name} period={"Week of " + weekLabel(week)}
      action={<Btn kind="primary" icon={I.download} disabled={!ls.length} onClick={exportCsv}>Export to Excel</Btn>}
      controls={<>
        <label className="rp-client" style={{ ["--c" as any]: hueVar(client) }}><i /><select className="oss-input" value={client} onChange={(e) => setClient(e.target.value)} aria-label="Client">{s.clients.slice().sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <div className="oss-seg">{WEEKS.map((w) => <button key={w} className={w === week ? "on" : ""} onClick={() => setWeek(w)}>{weekLabel(w)}</button>)}</div>
      </>}
      lede={ls.length
        ? <>{cl.name} had <b>{staff} staff</b> on <b>{ls.length} shifts</b> this week: <b>{fmtHM(t.payable)}</b> charged, of which {fmtHM(t.extra)} ran past the rostered finish.{pending ? " " + pending + " more lines are still waiting for OSS approval and are left out." : " Every line is approved."}</>
        : <>No approved hours for {cl.name} in this week yet.{pending ? " " + pending + " lines are waiting for approval in Timesheets." : " Pick another client or week."}</>}>
      <Ribbon items={[
        { label: "Charged hours", value: fmtHM(t.payable), tone: "accent" },
        { label: "Staff", value: staff, sub: ls.length + " shifts" },
        { label: "Worked", value: fmtHM(t.worked), sub: "Clock to clock" },
        { label: "Overtime", value: fmtHM(t.extra), tone: t.extra ? "warn" : undefined, sub: "Past rostered finish" },
        { label: "Not approved yet", value: pending, sub: pending ? "Left out" : "None", onClick: pending ? () => navigate("Timesheets", "review") : undefined }]} />
      <div className="rp-days" aria-label="Charged hours by day">
        {byDay.map((x) => (
          <div key={x.d} className={"rp-day" + (x.min ? "" : " none")}>
            <span className="v">{x.min ? fmtHM(x.min) : "-"}</span>
            <span className="col"><i style={{ height: (x.min / dmax) * 100 + "%", background: hueVar(client) }} /></span>
            <span className="l">{fmtDate(x.d + "T12:00:00Z").split(" ")[0]}<small>{x.n ? x.n + " shifts" : ""}</small></span>
          </div>))}
      </div>
      <Card pad={false} title="Line by line" meta="Approved lines only. Click a line for the clock record." icon={I.list}>
        <Table rows={ls} rowKey={(l) => l.id} cols={cols} foot onRow={(l) => openDrawer("timesheet", l.asg.id)}
          empty={<div className="oss-empty"><b>No approved hours for this week</b>{pending ? pending + " lines are waiting for approval." : "Pick another client or week."}</div>} />
      </Card>
    </Report>
  );
}

/* ── hours & overtime: rostered against actual bars ──────────────────────── */
function Hours({ s }: { s: OssState }) {
  const [by, setBy] = useState<"desk" | "region" | "client" | "event" | "employee">("desk");
  const [all, setAll] = useState(false);
  const ls = Q.lines(s).filter((l) => l.complete || l.status === "incomplete");
  const t = Q.totals(ls);
  const key = (l: Q.Line) => (by === "employee" ? l.worker.name : by === "event" ? l.event.name.split(":")[0] + " · " + fmtDate(l.shift.start) : by === "desk" ? Q.deskOf(l.event) : by === "region" ? Q.regionOf(s, l.event) : Q.clientOf(s, l.event.clientId).name);
  const colour = (l: Q.Line) => (by === "desk" ? deskVar(Q.deskOf(l.event)) : by === "region" ? regionVar(Q.regionOf(s, l.event)) : by === "client" ? hueVar(l.event.clientId) : by === "event" ? kindVar(Q.kindOf(s, l.event)) : regionVar(regionOfW(l.worker)));
  const groups = Array.from(ls.reduce((m, l) => { const k = key(l); const g = m.get(k); if (g) g.push(l); else m.set(k, [l]); return m; }, new Map<string, Q.Line[]>())).map(([k, l]) => ({ k, l, t: Q.totals(l), c: colour(l[0]) })).sort((a, b) => b.t.payable - a.t.payable);
  const shownGroups = all ? groups : groups.slice(0, 16);
  const byDesk = Array.from(ls.reduce((m, l) => m.set(Q.deskOf(l.event), (m.get(Q.deskOf(l.event)) || 0) + l.payableMin), new Map<string, number>())).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...groups.map((g) => Math.max(g.t.scheduled, g.t.payable + g.t.extra)));
  const approved = ls.filter((l) => l.status === "approved" || l.status === "exported").length;
  const late = ls.filter((l) => l.extraMin).length;
  return (
    <Report kicker="Hours and overtime" title="Rostered against actual" period="Every shift with clock records, this week"
      controls={<div className="oss-seg">{(["desk", "region", "client", "event", "employee"] as const).map((k) => <button key={k} className={by === k ? "on" : ""} onClick={() => { setBy(k); setAll(false); }}>By {k}</button>)}</div>}
      lede={ls.length
        ? <>Crew were rostered for <b>{fmtHM(t.scheduled)}</b> and <b>{fmtHM(t.payable)}</b> is payable. {late} {late === 1 ? "person" : "people"} stayed past the finish ({fmtHM(t.extra)} overtime){t.incomplete ? ", and " + t.incomplete + " lines still have a clock missing" : ""}. {approved} of {ls.length} lines are approved.</>
        : <>No clock records yet. Hours appear here once shifts start.</>}>
      <Ribbon items={[
        { label: "Payable", value: fmtHM(t.payable), tone: "accent", sub: ls.length + " lines" },
        { label: "Rostered", value: fmtHM(t.scheduled), sub: "As booked" },
        { label: "Minimum top-ups", value: "+" + fmtHM(t.topup), sub: "Five-hour minimum" },
        { label: "Overtime", value: fmtHM(t.extra), tone: t.extra ? "warn" : undefined, sub: late + " stayed late" },
        { label: "Missing clocks", value: t.incomplete, tone: t.incomplete ? "bad" : undefined, sub: t.incomplete ? "Fix in Timesheets" : "None", onClick: t.incomplete ? () => navigate("Timesheets", "corrections") : undefined }]} />
      {byDesk.length > 0 && <section className="oss-card rp-desks" aria-label="Payable hours by desk">
        <div className="rp-desks-h"><b>Payable hours by desk</b><span>{byDesk.length} desks with hours on file</span></div>
        <div className="rp-stack">{byDesk.map(([d, m]) => <i key={d} title={d + ": " + fmtHM(m)} style={{ width: (m / Math.max(1, t.payable)) * 100 + "%", background: deskVar(d) }} />)}</div>
        <div className="rp-stack-lg">{byDesk.map(([d, m]) => <span key={d}><i style={{ background: deskVar(d) }} />{d.replace(" desk", "")}<b>{fmtHM(m)}</b></span>)}</div>
      </section>}
      <Card title={"By " + by} meta={groups.length + " groups. The bar is what was rostered, the line is what is payable, anything past the bar is overtime"} icon={I.chart}>
        <div className="rp-hbars">
          {shownGroups.map((g) => (
            <div key={g.k} className="rp-hbar">
              <span className="k oss-ellip"><i className="rp-dot" style={{ background: g.c }} />{g.k}</span>
              <span className="tr">
                <span className="ros" style={{ width: (g.t.scheduled / max) * 100 + "%" }} />
                <span className="pay" style={{ width: (Math.min(g.t.payable, g.t.scheduled) / max) * 100 + "%", background: g.c }} />
                {g.t.extra > 0 && <span className="ot" style={{ left: (g.t.scheduled / max) * 100 + "%", width: (g.t.extra / max) * 100 + "%" }} />}
              </span>
              <span className="val">{fmtHM(g.t.payable)}<small> / {fmtHM(g.t.scheduled)}</small>{g.t.incomplete ? <St tone="bad">{g.t.incomplete} missing</St> : null}</span>
            </div>))}
          {!groups.length && <div className="oss-empty"><b>No hours yet</b>Hours appear once shifts start.</div>}
        </div>
        {groups.length > 16 && <div style={{ marginTop: 10 }}><Btn size="sm" kind="ghost" onClick={() => setAll(!all)}>{all ? "Show the top 16" : "Show all " + groups.length}</Btn></div>}
      </Card>
    </Report>
  );
}

/* ── payroll export: the path from clock to Bullhorn ─────────────────────── */
function Payroll({ s }: { s: OssState }) {
  const allLines = Q.lines(s);
  const ls = allLines.filter((l) => l.status === "approved" || l.status === "exported");
  const byWorker = Array.from(ls.reduce((m, l) => m.set(l.worker.id, (m.get(l.worker.id) || []).concat([l])), new Map<string, Q.Line[]>()))
    .map(([id, l]) => ({ w: Q.worker(s, id), l, t: Q.totals(l), cand: s.mappings.find((m) => m.localId === id)?.remoteId || mappingFor(id) }))
    .sort((a, b) => a.w.name.localeCompare(b.w.name));
  const t = Q.totals(ls);
  const [allRows, setAllRows] = useState(false);
  const [q, setQ] = useState("");
  const tableRows = byWorker.filter((x) => !q || x.w.name.toLowerCase().includes(q.toLowerCase()));
  const desksOf = (l: Q.Line[]) => Array.from(new Set(l.map((x) => Q.deskOf(x.event))));
  const accepted = s.items.filter((i) => i.state === "accepted").length;
  const blocked = s.items.filter((i) => i.state === "blocked" || i.state === "failed").length;
  const unmatched = byWorker.filter((x) => !x.cand).length;
  const exportCsv = () => {
    downloadCsv("OSS approved hours for payroll.csv", ["Employee", "Bullhorn candidate", "Shifts", "Worked", "5h minimum top-up", "Overtime", "Payable hours", "Payable minutes"],
      byWorker.map((x) => [x.w.name, x.cand || "Not matched", x.l.length, fmtHM(x.t.worked), fmtHM(x.t.topup), fmtHM(x.t.extra), fmtHM(x.t.payable), x.t.payable]));
    audited("payroll", "Approved hours", "Exported payroll file: " + byWorker.length + " employees, " + fmtHM(t.payable));
  };
  return (
    <Report kicker="Payroll export" title="Approved hours, ready for payroll" period="Payroll cut-off Fri 27 Nov"
      action={<Btn kind="primary" icon={I.download} disabled={!byWorker.length} onClick={exportCsv}>Download file</Btn>}
      lede={byWorker.length
        ? <><b>{byWorker.length} employees</b> have <b>{fmtHM(t.payable)}</b> of approved hours: {fmtHM(t.worked)} worked, +{fmtHM(t.topup)} from the five-hour minimum and {fmtHM(t.extra)} of overtime.{unmatched ? " " + unmatched + " still need a Bullhorn match." : ""}</>
        : <>Nothing approved yet. Approve hours in Timesheets and they appear here.</>}>
      <div className="rp-steps">
        <Steps steps={[
          { label: "Clock records", n: allLines.length, sub: "Lines drafted", on: allLines.length > 0 },
          { label: "Approved by OSS", n: ls.length, sub: fmtHM(t.payable), on: ls.length > 0, tone: ls.length ? "accent" : undefined },
          { label: "In Bullhorn", n: accepted, sub: "Rows accepted", on: accepted > 0, tone: accepted ? "ok" : undefined },
          { label: "Blocked", n: blocked, sub: blocked ? "Needs a match" : "Nothing blocked", tone: blocked ? "bad" : undefined }]} />
        <Btn size="sm" icon={I.link} onClick={() => navigate("Timesheets", "bullhorn")}>Bullhorn handover</Btn>
      </div>
      <Ribbon items={[
        { label: "Payable", value: fmtHM(t.payable), tone: "accent", sub: byWorker.length + " employees" },
        { label: "Worked", value: fmtHM(t.worked), sub: "Clock to clock" },
        { label: "Minimum top-ups", value: "+" + fmtHM(t.topup), sub: ls.filter((l) => l.topupMin).length + " short shifts" },
        { label: "Overtime", value: fmtHM(t.extra), tone: t.extra ? "warn" : undefined, sub: "For the overtime rate" }]} />
      <Card pad={false} title="By employee" meta={"One line each, the way payroll wants it" + (tableRows.length > 120 && !allRows ? ". Showing 120 of " + tableRows.length : "")} icon={I.users}
        right={<><input className="oss-input rp-find" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an employee" aria-label="Find an employee" />{tableRows.length > 120 && <Btn size="sm" kind="ghost" onClick={() => setAllRows(!allRows)}>{allRows ? "Show 120" : "Show all " + tableRows.length}</Btn>}</>}>
        <Table rows={allRows ? tableRows : tableRows.slice(0, 120)} rowKey={(x) => x.w.id} onRow={(x) => openDrawer("worker", x.w.id)} foot maxHeight={640}
          empty={<div className="oss-empty"><b>Nothing approved yet</b>Approve hours in Timesheets first.</div>}
          cols={[{ key: "n", label: "Employee", render: (x) => <span className="oss-row"><Av name={x.w.name} size="sm" /><span className="strong">{x.w.name}</span></span>, foot: byWorker.length + " employees" },
            { key: "d", label: "Desk", render: (x) => <span className="oss-row" style={{ gap: 4, flexWrap: "wrap" }}>{desksOf(x.l).map((d) => <Tag key={d} c={deskVar(d)} dot={false}>{d.replace(" desk", "").replace(" and ", " & ")}</Tag>)}</span> },
            { key: "c", label: "Bullhorn", render: (x) => x.cand ? <span className="oss-mono">{x.cand}</span> : <St tone="warn">Not matched</St> },
            { key: "s", label: "Shifts", num: true, render: (x) => x.l.length, foot: String(ls.length) },
            { key: "w", label: "Worked", num: true, render: (x) => fmtHM(x.t.worked), foot: fmtHM(t.worked) },
            { key: "tu", label: "Top-up", num: true, render: (x) => (x.t.topup ? "+" + fmtHM(x.t.topup) : "-"), foot: "+" + fmtHM(t.topup) },
            { key: "o", label: "Overtime", num: true, render: (x) => (x.t.extra ? fmtHM(x.t.extra) : "-"), foot: fmtHM(t.extra) },
            { key: "p", label: "Payable", num: true, render: (x) => <b className="oss-ink">{fmtHM(x.t.payable)}</b>, foot: fmtHM(t.payable) }]} />
      </Card>
    </Report>
  );
}

/* ── qualifications: a coverage matrix, then who holds the one you pick ──── */
function Qualifications({ s }: { s: OssState }) {
  const [need, setNeed] = useState<"MH" | "SP" | "HACCP" | "FA">("MH");
  const [region, setRegion] = useState("all");
  const types = ["MH", "SP", "HACCP", "FA"] as const;
  /* One pass over the documents: latest copy of each type per person, and its status today. */
  const idx = useMemo(() => {
    const m = new Map<string, { st: string; exp: string }>();
    for (const d of s.documents) m.set(d.workerId + "|" + d.type, { st: Q.docStatusToday(s, d), exp: d.expires });
    return m;
  }, [s.documents, s.clock, s.rules.renewalWarnDays]);
  const state = (wid: string, t: string) => idx.get(wid + "|" + t)?.st || "missing";
  const pool = region === "all" ? s.workers : s.workers.filter((w) => regionOfW(w) === region);
  const count = (t: string, st: string[]) => pool.filter((w) => st.includes(state(w.id, t))).length;
  const rows = pool.filter((w) => state(w.id, need) !== "missing").sort((a, b) => state(a.id, need).localeCompare(state(b.id, need)) || a.name.localeCompare(b.name));
  const tone = (st: string) => (st === "valid" ? "ok" : st === "expiring" || st === "pending" ? "warn" : st === "missing" ? "neutral" : "bad");
  const n = pool.length;
  const thin = types.slice().sort((a, b) => count(a, ["valid", "expiring"]) - count(b, ["valid", "expiring"]))[0];
  return (
    <Report kicker="Qualifications" title="Who holds valid evidence" period={(region === "all" ? "All " + n.toLocaleString("en-IE") + " crew on the register" : n.toLocaleString("en-IE") + " crew in " + region) + ", as of today"}
      controls={<div className="cl-kinds">{["all", "Dublin", "Leinster", "Munster", "Connacht", "Ulster"].map((r) => <button key={r} className={region === r ? "on" : ""} onClick={() => setRegion(r)} style={r === "all" ? undefined : { ["--c" as any]: regionVar(r) }}>{r !== "all" && <i />}{r === "all" ? "All regions" : r}</button>)}</div>}
      action={<Btn icon={I.download} onClick={() => { downloadCsv("OSS qualifications.csv", ["Employee"].concat(types.map((t) => docLabel(t))), s.workers.map((w) => [w.name].concat(types.map((t) => state(w.id, t))))); audited("qualifications", "Qualifications", "Exported qualifications report: " + s.workers.length + " employees"); }}>Export</Btn>}
      lede={<><b>{count("MH", ["valid", "expiring"])} of {n}</b> crew can work a shift that needs Manual Handling today, {count("MH", ["expiring"])} of them renew soon. {docLabel(thin)} is the thinnest: <b>{count(thin, ["valid", "expiring"])}</b> {count(thin, ["valid", "expiring"]) === 1 ? "person holds" : "people hold"} it.</>}>
      <Card title="Coverage by requirement" meta="Pick one to see who holds it" icon={I.shield}>
        <div className="rp-matrix">
          {types.map((t) => {
            const v = count(t, ["valid"]), ex = count(t, ["expiring"]), pe = count(t, ["pending"]), bad = count(t, ["expired", "rejected"]);
            return (
              <button key={t} className={"rp-mx" + (t === need ? " on" : "")} onClick={() => setNeed(t)} aria-pressed={t === need}>
                <span className="k"><b>{docLabel(t)}</b><small>{v + ex} of {n} can work</small></span>
                <Meter total={n} height={12} legend={false} parts={[{ n: v, tone: "ok", label: "valid" }, { n: ex, tone: "warn", label: "renew soon" }, { n: pe, tone: "accent", label: "to review" }, { n: bad, tone: "bad", label: "expired" }]} />
                <span className="nums"><span><i className="ok" />{v}</span><span><i className="warn" />{ex}</span><span><i className="acc" />{pe}</span><span><i className="bad" />{bad}</span></span>
              </button>);
          })}
        </div>
        <div className="oss-legend" style={{ marginTop: 14 }}><span><i style={{ background: "var(--ok)" }} />Valid</span><span><i style={{ background: "var(--warn)" }} />Renew soon</span><span><i style={{ background: "var(--accent)" }} />Uploaded, to review</span><span><i style={{ background: "var(--bad)" }} />Expired or rejected</span><span><i style={{ background: "var(--track)" }} />Nothing on file</span></div>
      </Card>
      <div className="oss-gap" />
      <Card pad={false} title={docLabel(need)} meta={rows.length.toLocaleString("en-IE") + " people have a copy on file" + (rows.length > 150 ? ". First 150 shown, export for the full list" : "")} icon={I.list}>
        <Table rows={rows.slice(0, 150)} rowKey={(w) => w.id} onRow={(w) => openDrawer("worker", w.id)} maxHeight={560}
          cols={[{ key: "n", label: "Employee", render: (w) => <span className="oss-row"><Av name={w.name} size="sm" /><span className="strong">{w.name}</span><i className="rp-dot" style={{ background: regionVar(regionOfW(w)) }} /></span> },
            ...types.map((t) => ({ key: t, label: t === "HACCP" ? "Food" : t, render: (w: typeof s.workers[0]) => { const st = state(w.id, t); return st === "missing" ? <span className="oss-muted">-</span> : <St tone={tone(st) as any}>{st === "valid" ? "Valid" : st === "expiring" ? "Renew soon" : st === "pending" ? "To review" : st === "rejected" ? "Rejected" : "Expired"}</St>; } })),
            { key: "e", label: "Expires", nowrap: true, render: (w) => { const d = idx.get(w.id + "|" + need); return d ? fmtDate(zoned(d.exp, "12:00")) + " " + d.exp.slice(0, 4) : "-"; } }]} />
      </Card>
    </Report>
  );
}
