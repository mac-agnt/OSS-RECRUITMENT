import { useState } from "react";
import type { OssState } from "../model";
import * as Q from "../selectors";
import { navigate, openDrawer, setUi, useOss } from "../store";
import { tabOf } from "../modules";
import { dayKey, fmtDate, fmtHM, minutesBetween, ms } from "../time";
import { Btn, Card, Empty, Metric, Page, S, Scope, Seg, St, Table } from "../ui/kit";
import { CovBar } from "./Staffing";

export default function Dashboard() {
  const s = useOss();
  const tab = tabOf(s, "Dashboard");
  if (tab === "staffing") return <StaffingDash s={s} />;
  if (tab === "attendance") return <AttendanceDash s={s} />;
  if (tab === "hours") return <HoursDash s={s} />;
  return <Executive s={s} />;
}

function Executive({ s }: { s: OssState }) {
  const t = Q.windowTotals(s), pend = Q.pendingDemand(s);
  const exc = Q.openExceptions(s).length;
  const owners = s.users.map((u) => ({ u, open: s.tasks.filter((x) => x.ownerId === u.id && x.status !== "done").length, late: s.tasks.filter((x) => x.ownerId === u.id && x.status !== "done" && ms(x.due) < ms(s.clock)).length })).filter((x) => x.open);
  return (
    <Page title="Executive" sub="Firm demand, coverage and what is blocking the team. Every number links to the records behind it." scope={<Scope><b>{Q.windowLabel(s)}</b> · confirmed bookings</Scope>}>
      <div className="oss-grid oss-g2" style={{ alignItems: "start" }}>
        <Card title="Firm demand by booking" meta={t.required + " positions · " + t.confirmed + " confirmed · " + t.coverageLabel}>
          <div className="oss-bars">{t.events.map((e) => <CovBar key={e.id} label={e.name.split(":")[0]} c={Q.eventCoverage(s, e.id)} onClick={() => navigate("Staffing", "allocation", { kind: "event", id: e.id })} />)}</div>
          <div className="oss-legend" style={{ marginTop: 12 }}><span><i style={{ background: "var(--ok)" }} />Confirmed</span><span><i style={{ background: "var(--accent)", opacity: .55 }} />Awaiting reply</span><span><i style={{ background: "var(--track)" }} />Not yet invited</span></div>
        </Card>
        <Card title="Pipeline, kept separate" meta="Not in firm totals">
          <Table rows={pend.events} rowKey={(e) => e.id} onRow={(e) => openDrawer("event", e.id)}
            cols={[{ key: "n", label: "Pending booking", render: (e) => e.name }, { key: "d", label: "Date", render: (e) => e.date.slice(5) }, { key: "p", label: "Indicative", num: true, render: (e) => e.indicativePositions }]} />
          <div className="oss-row oss-small" style={{ marginTop: 10 }}><span className="grow oss-dim">Ryder Cup 2027 programme (indicative unique workers, all phases)</span><b>~850</b></div>
          <div className="oss-tiny oss-muted">Never added to a single-day headcount. <button className="oss-link" onClick={() => navigate("Events", "programme")}>Programme planning</button></div>
        </Card>
        <Card title="Workload by owner" pad={false}>
          <Table rows={owners} rowKey={(x) => x.u.id} onRow={(x) => { setUi({ personaId: x.u.id }); navigate("Work", "mine"); }}
            cols={[{ key: "n", label: "Person", render: (x) => <span className="strong">{x.u.name}<div className="oss-tiny oss-muted">{x.u.role}</div></span> }, { key: "o", label: "Open tasks", num: true, render: (x) => x.open },
              { key: "l", label: "Overdue", num: true, render: (x) => x.late ? <St tone="bad">{x.late}</St> : "0" }]} />
        </Card>
        <Card title="Exceptions now">
          <div className="oss-grid oss-g2" style={{ gap: 8 }}>
            <Metric label="Open attendance exceptions" value={exc} tone={exc ? "warn" : undefined} onClick={() => navigate("Live Operations", "exceptions")} />
            <Metric label="Blocked handover rows" value={s.items.filter((i) => i.state === "blocked").length} tone={s.items.some((i) => i.state === "blocked") ? "bad" : "ok"} onClick={() => navigate("Timesheets", "handover")} />
            <Metric label="Open cancellations" value={Q.replacementQueue(s).filter((r) => r.open).length} onClick={() => navigate("Staffing", "replacements")} />
            <Metric label="Documents awaiting review" value={s.documents.filter((d) => d.review === "pending").length} onClick={() => navigate("Workforce", "documents")} />
          </div>
        </Card>
      </div>
      <Card title="Company context (client-stated, not live data)" style={{ marginTop: 14 }}>
        <div className="oss-grid oss-g4">
          <div><div className="oss-small oss-dim">Annual turnover</div><div style={{ fontSize: 20, fontWeight: 600 }}>~€25m → €35m ambition</div><div className="oss-tiny oss-muted">A 40% increase. Revenue is not profit; worker costs pass through.</div></div>
          <div><div className="oss-small oss-dim">Mix</div><div style={{ fontSize: 20, fontWeight: 600 }}>~80% construction · ~20% events</div><div className="oss-tiny oss-muted">Implied events share is an approximation, not audited segment revenue.</div></div>
          <div><div className="oss-small oss-dim">Office</div><div style={{ fontSize: 20, fontWeight: 600 }}>~14 staff</div><div className="oss-tiny oss-muted">About four in events, one more planned. Eight demo personas here.</div></div>
          <div><div className="oss-small oss-dim">Contractors on site</div><div style={{ fontSize: 20, fontWeight: 600 }}>500–600, ~1,000 peak</div><div className="oss-tiny oss-muted">From the discovery call. The demo has 96 sample profiles.</div></div>
        </div>
      </Card>
    </Page>
  );
}

function StaffingDash({ s }: { s: OssState }) {
  const t = Q.windowTotals(s);
  const byDate = new Map<string, Q.Coverage[]>();
  t.events.forEach((e) => Q.shiftsOfEvent(s, e.id).forEach((x) => { const k = dayKey(x.start); byDate.set(k, (byDate.get(k) || []).concat([Q.shiftCoverage(s, x.id)])); }));
  const dates = Array.from(byDate).sort();
  const max = Math.max(...dates.map(([, l]) => Q.sumCov(l).required), 1);
  const resp = s.invitations.filter((i) => i.respondedAt && !Q.eventOf(s, Q.shiftOf(s, i.shiftId).eventId).historical).map((i) => minutesBetween(i.sentAt, i.respondedAt!)).sort((a, b) => a - b);
  const med = resp.length ? resp[Math.floor(resp.length / 2)] : 0;
  const buckets = [["< 1h", 0, 60], ["1–3h", 60, 180], ["3–6h", 180, 360], ["6h+", 360, 1e9]] as const;
  const open = s.invitations.filter((i) => Q.isActiveInvite(s, i));
  const [show, setShow] = useState<"chart" | "table">("chart");
  return (
    <Page title="Staffing" sub="Demand, fill and reply speed from the invitation records." scope={<Scope><b>{Q.windowLabel(s)}</b> · firm bookings</Scope>}
      actions={<Seg value={show} onChange={setShow} options={[{ id: "chart", label: "Chart" }, { id: "table", label: "Table" }]} />}>
      <div className="oss-grid oss-g2" style={{ alignItems: "start" }}>
        <Card title="Positions by date" meta="Confirmed / awaiting / not yet invited">
          {show === "chart" ? <div className="oss-vbars">{dates.map(([k, l]) => { const c = Q.sumCov(l); const h = (n: number) => (n / max) * 140 + "px"; return (
            <button key={k} onClick={() => navigate("Staffing", "coverage")} title={c.confirmed + " confirmed, " + c.awaiting + " awaiting, " + c.notInvited + " not invited of " + c.required}>
              <span className="num">{c.confirmed}/{c.required}</span>
              <span className="col" style={{ height: h(c.required) }}><i style={{ height: h(c.confirmed), background: "var(--ok)", display: "block" }} /><i style={{ height: h(c.awaiting), background: "var(--accent)", opacity: .55, display: "block" }} /></span>
              <span className="lab">{fmtDate(k + "T12:00:00Z")}</span></button>); })}</div>
            : <Table rows={dates} rowKey={([k]) => k} cols={[{ key: "d", label: "Date", render: ([k]) => fmtDate(k + "T12:00:00Z") }, { key: "r", label: "Required", num: true, render: ([, l]) => Q.sumCov(l).required }, { key: "c", label: "Confirmed", num: true, render: ([, l]) => Q.sumCov(l).confirmed }, { key: "a", label: "Awaiting", num: true, render: ([, l]) => Q.sumCov(l).awaiting }, { key: "u", label: "Unfilled", num: true, render: ([, l]) => Q.sumCov(l).unfilled }]} />}
        </Card>
        <Card title="Filled vs unfilled by booking">
          {show === "chart" ? <div className="oss-bars">{t.events.map((e) => <CovBar key={e.id} label={e.name.split(":")[0]} c={Q.eventCoverage(s, e.id)} onClick={() => navigate("Staffing", "allocation", { kind: "event", id: e.id })} />)}</div>
            : <Table rows={t.events} rowKey={(e) => e.id} cols={[{ key: "n", label: "Booking", render: (e) => e.name }, { key: "c", label: "Confirmed", num: true, render: (e) => Q.eventCoverage(s, e.id).confirmed }, { key: "u", label: "Unfilled", num: true, render: (e) => Q.eventCoverage(s, e.id).unfilled }]} />}
        </Card>
        <Card title="Time to response" meta={"Median " + (med < 60 ? med + " min" : fmtHM(med)) + " · " + resp.length + " answered invitations"}>
          <div className="oss-bars">{buckets.map(([l, a, b]) => { const n = resp.filter((x) => x >= a && x < b).length; return (
            <div key={l} className="oss-hbar" style={{ cursor: "default" }}><span>{l}</span><span className="track"><i style={{ width: (resp.length ? (n / resp.length) * 100 : 0) + "%", background: "var(--accent)" }} /></span><span className="val">{n}</span></div>); })}</div>
          <div className="oss-small oss-muted" style={{ marginTop: 8 }}>From sent and responded timestamps on every answered invitation (sample data).</div>
        </Card>
        <Card title={"Unanswered invitations (" + open.length + ")"} pad={false}>
          <Table rows={open} rowKey={(i) => i.id} onRow={() => navigate("Staffing", "invitations")} empty={<Empty title="Every invitation has an answer" />}
            cols={[{ key: "w", label: "Worker", render: (i) => Q.nameOf(s, i.workerId) }, { key: "s", label: "Shift", render: (i) => Q.eventOf(s, Q.shiftOf(s, i.shiftId).eventId).name.split(":")[0] + " " + Q.shiftOf(s, i.shiftId).label.toLowerCase() },
              { key: "o", label: "Open for", num: true, render: (i) => fmtHM(minutesBetween(i.sentAt, s.clock)) }]} />
        </Card>
      </div>
    </Page>
  );
}

function AttendanceDash({ s }: { s: OssState }) {
  const shifts = s.shifts.filter((x) => !Q.eventOf(s, x.eventId).historical && ms(x.start) <= ms(s.clock) && Q.eventOf(s, x.eventId).status === "confirmed");
  const rows = shifts.map((x) => {
    const asg = s.assignments.filter((a) => a.shiftId === x.id && a.status === "confirmed");
    const vin = asg.map((a) => Q.verifiedIn(s, a.id));
    const onTime = vin.filter((v) => v && ms(v.at) <= ms(x.start)).length;
    const late = vin.filter((v) => v && ms(v.at) > ms(x.start)).length;
    const missing = vin.filter((v) => !v).length;
    const reportedLate = asg.filter((a) => s.journeys.some((j) => j.assignmentId === a.id && j.status === "running_late")).length;
    const exc = s.exceptions.filter((e) => asg.some((a) => a.id === e.assignmentId)).length;
    return { x, n: asg.length, onTime, late, missing, reportedLate, exc };
  });
  const tot = rows.reduce((t, r) => ({ n: t.n + r.n, onTime: t.onTime + r.onTime, late: t.late + r.late, missing: t.missing + r.missing, rl: t.rl + r.reportedLate }), { n: 0, onTime: 0, late: 0, missing: 0, rl: 0 });
  const types = new Map<string, number>(); s.exceptions.forEach((e) => types.set(e.type, (types.get(e.type) || 0) + 1));
  return (
    <Page title="Attendance" sub="On time means a verified clock-in at or before the scheduled start. A reported late arrival is not the same as verified late attendance."
      scope={<Scope><b>Shifts started by {fmtDate(s.clock)}</b> · {rows.length} shifts, {tot.n} assignments</Scope>}>
      {!rows.length ? <Card><Empty title="No shifts have started yet in this scenario" body="Load the Event day or Hours review stage from Demo controls." /></Card> : <>
        <div className="oss-grid oss-g4" style={{ marginBottom: 14 }}>
          <Metric label="On time (verified)" value={tot.onTime + " / " + tot.n} tone="ok" />
          <Metric label="Late (verified)" value={tot.late + " / " + tot.n} tone={tot.late ? "warn" : undefined} />
          <Metric label="No verified clock-in" value={tot.missing + " / " + tot.n} tone={tot.missing ? "bad" : undefined} />
          <Metric label="Reported running late" value={tot.rl} sub="Self-reported journeys" />
        </div>
        <div className="oss-grid oss-main-side" style={{ alignItems: "start" }}>
          <Card title="By shift" pad={false}>
            <Table rows={rows} rowKey={(r) => r.x.id} onRow={(r) => navigate("Live Operations", "attendance", { kind: "shift", id: r.x.id })}
              cols={[{ key: "s", label: "Shift", render: (r) => Q.eventOf(s, r.x.eventId).name.split(":")[0] + ", " + r.x.label.toLowerCase() }, { key: "d", label: "Date", render: (r) => fmtDate(r.x.start) },
                { key: "n", label: "Assigned", num: true, render: (r) => r.n }, { key: "o", label: "On time", num: true, render: (r) => r.onTime }, { key: "l", label: "Late", num: true, render: (r) => r.late },
                { key: "m", label: "Missing", num: true, render: (r) => r.missing }, { key: "e", label: "Exceptions", num: true, render: (r) => r.exc }]} />
          </Card>
          <Card title="Clock exceptions by type" meta="All shifts in sample">
            <div className="oss-bars">{Array.from(types).map(([k, n]) => <div key={k} className="oss-hbar" style={{ cursor: "default" }}><span>{k.replace(/_/g, " ")}</span><span className="track"><i style={{ width: Math.min(100, n * 20) + "%", background: "var(--warn)" }} /></span><span className="val">{n}</span></div>)}</div>
            {!types.size && <Empty title="No exceptions" />}
            <div style={{ marginTop: 10 }}><Btn size="sm" onClick={() => navigate("Live Operations", "exceptions")}>Open exceptions table</Btn></div>
          </Card>
        </div>
      </>}
    </Page>
  );
}

function HoursDash({ s }: { s: OssState }) {
  const ls = Q.lines(s, { weekOf: "2026-11-09" });
  const t = Q.totals(ls);
  const by = (st: Q.LineStatus[]) => ls.filter((l) => st.includes(l.status)).length;
  const batches = s.batches.map((b) => ({ b, x: Q.batchSummary(s, b.id) }));
  return (
    <Page title="Hours & handover" sub="Scheduled, worked and payable time from the same timesheet lines as the Timesheets module. Minimums and time past finish are never double counted."
      scope={<Scope><b>Week Mon 9 to Sun 15 Nov</b> · {ls.length} lines</Scope>}>
      {!ls.length ? <Card><Empty title="No hours yet" body="Load the Hours review stage from Demo controls." /></Card> : <>
        <div className="oss-grid oss-g4" style={{ marginBottom: 14 }}>
          <Metric label="Scheduled" value={fmtHM(t.scheduled)} />
          <Metric label={t.incomplete ? "Worked (provisional)" : "Worked"} value={fmtHM(t.worked)} sub={t.incomplete ? t.incomplete + " incomplete line(s) excluded" : undefined} />
          <Metric label="Payable" value={fmtHM(t.payable)} sub={"incl. " + fmtHM(t.topup) + " minimum top-up"} />
          <Metric label="Past scheduled finish" value={fmtHM(t.extra)} sub="Review category, not added again" />
        </div>
        <div className="oss-grid oss-g2" style={{ alignItems: "start" }}>
          <Card title="Approval pipeline">
            <div className="oss-bars">{([["Incomplete", ["incomplete", "in_progress"]], ["Needs review", ["needs_review"]], ["Ready", ["ready"]], ["Approved, not sent", ["approved"]], ["Sent (simulated)", ["exported"]]] as const).map(([l, st]) => (
              <button key={l} className="oss-hbar" onClick={() => navigate("Timesheets", "approvals")}><span>{l}</span><span className="track"><i style={{ width: (by(st as any) / ls.length) * 100 + "%", background: l === "Incomplete" ? "var(--bad)" : l === "Needs review" ? "var(--warn)" : "var(--accent)" }} /></span><span className="val">{by(st as any)}</span></button>))}</div>
            <div className="oss-small oss-muted" style={{ marginTop: 8 }}>{s.corrections.length} correction{s.corrections.length === 1 ? "" : "s"} recorded, {s.corrections.filter((c) => c.status === "proposed").length} waiting.</div>
          </Card>
          <Card title="Bullhorn handover (simulated)" pad={false}>
            <Table rows={batches} rowKey={(r) => r.b.id} onRow={(r) => openDrawer("batch", r.b.id)}
              cols={[{ key: "b", label: "Batch", render: (r) => r.b.id }, { key: "a", label: "Accepted", num: true, render: (r) => r.x.accepted + " · " + fmtHM(r.x.acceptedMin) },
                { key: "bl", label: "Blocked", num: true, render: (r) => r.x.blocked ? <St tone="bad">{r.x.blocked} · {fmtHM(r.x.blockedMin)}</St> : "0" }, { key: "s", label: "", render: () => <S s="Simulated" /> }]} />
          </Card>
        </div>
      </>}
    </Page>
  );
}
