import { useState } from "react";
import type { OssState } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { loadStage, navigate, openDrawer, run, setUi, useOss } from "../store";
import { tabOf } from "../modules";
import { dayKey, fmtDate, fmtTime, minutesBetween, ms } from "../time";
import { Btn, Card, Empty, I, Metric, Page, S, Scope, Seg, St, Table } from "../ui/kit";
import { WorkerLink, span, when } from "../ui/fmt";
import { VenueSchematic } from "../phone/Verify";

export default function LiveOps() {
  const s = useOss();
  const tab = tabOf(s, "Live Operations");
  const shiftId = useShiftPick(s);
  if (tab === "arrivals") return <Arrivals s={s} shiftId={shiftId} />;
  if (tab === "attendance") return <Attendance s={s} shiftId={shiftId} />;
  if (tab === "exceptions") return <Exceptions s={s} />;
  return <Today s={s} shiftId={shiftId} />;
}

function liveShifts(s: OssState) {
  return s.shifts.filter((x) => !Q.eventOf(s, x.eventId).historical && Q.eventOf(s, x.eventId).status === "confirmed")
    .filter((x) => dayKey(x.start) === dayKey(s.clock) || (ms(x.start) <= ms(s.clock) && ms(x.end) + 3 * 3600000 >= ms(s.clock)))
    .sort((a, b) => a.start.localeCompare(b.start));
}
function useShiftPick(s: OssState) {
  const f = s.ui.focus;
  if (f?.kind === "shift" && Q.shiftOf(s, f.id)) return f.id;
  const l = liveShifts(s);
  return (l.find((x) => ms(x.end) > ms(s.clock)) || l[l.length - 1])?.id || null;
}
function ShiftPicker({ s, shiftId }: { s: OssState; shiftId: string | null }) {
  const l = liveShifts(s);
  const all = l.length ? l : s.shifts.filter((x) => ms(x.start) > ms(s.clock) && Q.eventOf(s, x.eventId).status === "confirmed").sort((a, b) => a.start.localeCompare(b.start)).slice(0, 6);
  return <select className="oss-input" style={{ width: 300, height: 34 }} value={shiftId || ""} onChange={(e) => setUi({ focus: { kind: "shift", id: e.target.value } })} aria-label="Shift">
    {!shiftId && <option value="">Choose a shift</option>}
    {all.concat(shiftId && !all.some((x) => x.id === shiftId) ? [Q.shiftOf(s, shiftId)] : []).map((x) => <option key={x.id} value={x.id}>{Q.eventOf(s, x.eventId).name}: {x.label} ({fmtDate(x.start)} {fmtTime(x.start)})</option>)}
  </select>;
}

function rosterRows(s: OssState, shiftId: string) {
  return s.assignments.filter((a) => a.shiftId === shiftId && a.status === "confirmed").map((a) => {
    const sh = Q.shiftOf(s, a.shiftId);
    const arr = Q.arrivalState(s, a.id), att = Q.attendanceState(s, a.id);
    const j = Q.journeyOf(s, a.id);
    const started = ms(s.clock) >= ms(sh.start);
    const vin = Q.verifiedIn(s, a.id);
    const late = vin ? ms(vin.at) > ms(sh.start) : started;
    const next = att === "Clocked out" ? "Done" : att === "Clocked in" ? (ms(s.clock) > ms(sh.end) + 10 * 60000 ? "Missing clock-out: propose a correction" : "On shift")
      : att === "Review required" || att === "Awaiting sync" ? "Supervisor review" : !started ? (arr === "Not reported" ? "Arrival prompt " + s.rules.arrivalPromptH + "h before" : "Expected " + fmtTime(sh.start))
      : arr === "Running late" ? "ETA " + (j?.eta ? fmtTime(j.eta) : "unknown") : "Missing: contact worker";
    return { a, arr, att, j, vin, late, next };
  });
}

function Today({ s, shiftId }: { s: OssState; shiftId: string | null }) {
  const live = liveShifts(s);
  if (!shiftId) return <NoLive s={s} />;
  const sh = Q.shiftOf(s, shiftId);
  const ev = Q.eventOf(s, sh.eventId);
  const rows = rosterRows(s, shiftId);
  const started = ms(s.clock) >= ms(sh.start);
  const checked = rows.filter((r) => r.vin).length;
  const lateN = rows.filter((r) => r.arr === "Running late" && !r.vin).length;
  const missing = started ? rows.filter((r) => !r.vin && r.arr !== "Running late").length : 0;
  const exc = Q.openExceptions(s).filter((e) => Q.asgOf(s, e.assignmentId).shiftId === shiftId);
  return (
    <Page title="Today" sub={<>{ev.name} · {sh.label} · {span(sh.start, sh.end)} · on-site lead {Q.nameOf(s, ev.supervisorId)}</>}
      scope={<ShiftPicker s={s} shiftId={shiftId} />}
      actions={<><Btn size="sm" icon={I.phone} onClick={() => setUi({ role: "supervisor", phoneOpen: true })}>Supervisor view</Btn></>}>
      {!live.length && <div className="oss-note" style={{ marginBottom: 12 }}>No shift today. Showing forthcoming work. <button className="oss-link" onClick={() => { if (!s.ui.dirty || window.confirm("Load the Event day stage? Unsaved workshop edits are replaced.")) loadStage(3); }}>Preview event day</button></div>}
      <div className="oss-grid oss-g4" style={{ marginBottom: 14 }}>
        <Metric label="Expected" value={rows.length} sub={"Confirmed for " + sh.label.toLowerCase()} />
        <Metric label="Checked in (verified)" value={checked} tone={checked === rows.length && rows.length ? "ok" : undefined} sub="Clock evidence, not self-report" />
        <Metric label="Running late (reported)" value={lateN} tone={lateN ? "warn" : undefined} sub="Worker-reported, not verified" />
        <Metric label="Missing" value={missing} tone={missing ? "bad" : undefined} sub={started ? "Started, no verified clock-in" : "Shift not started"} />
      </div>
      <Card title="Roster and next actions" pad={false} right={<span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Btn size="sm" onClick={() => run(E.simulateClockIns, shiftId)} disabled={rows.every((r) => r.vin)} title="Presenter control">Simulate on-time check-ins</Btn>
        <Btn size="sm" onClick={() => run(E.simulateClockOuts, shiftId)} disabled={!rows.some((r) => r.vin && r.att === "Clocked in")} title="Presenter control">Simulate end-of-shift (fixture)</Btn></span>}>
        <Table rows={rows} rowKey={(r) => r.a.id} onRow={(r) => openDrawer("timesheet", r.a.id)}
          cols={[{ key: "w", label: "Worker", render: (r) => <WorkerLink s={s} id={r.a.workerId} /> },
            { key: "ar", label: "Arrival (self-reported)", render: (r) => <span><S s={r.arr} />{r.j?.eta && r.arr === "Running late" ? <span className="oss-tiny oss-muted"> ETA {fmtTime(r.j.eta)}</span> : null}</span> },
            { key: "at", label: "Attendance (verified)", render: (r) => <S s={r.att} /> },
            { key: "in", label: "In", num: true, render: (r) => r.vin ? fmtTime(r.vin.at) + (r.late ? " · +" + minutesBetween(sh.start, r.vin.at) + "m" : "") : "—" },
            { key: "out", label: "Out", num: true, render: (r) => { const o = Q.verifiedOut(s, r.a.id); return o ? fmtTime(o.at) : "—"; } },
            { key: "n", label: "Next action", render: (r) => <span className="oss-small oss-dim">{r.next}</span> }]} />
      </Card>
      {exc.length > 0 && <Card title={"Open exceptions on this shift (" + exc.length + ")"} pad={false} style={{ marginTop: 14 }}><ExcTable s={s} list={exc} /></Card>}
      <div className="oss-small oss-muted" style={{ marginTop: 10 }}>Simulation buttons are presenter controls. Nothing here advances time or records attendance on its own.</div>
    </Page>
  );
}

function NoLive({ s }: { s: OssState }) {
  const next = s.shifts.filter((x) => ms(x.start) > ms(s.clock) && Q.eventOf(s, x.eventId).status === "confirmed").sort((a, b) => a.start.localeCompare(b.start)).slice(0, 6);
  return (
    <Page title="Today" sub="No shift is running now. Forthcoming work below." actions={<Btn kind="primary" onClick={() => { if (!s.ui.dirty || window.confirm("Load the Event day stage? Unsaved workshop edits are replaced.")) loadStage(3); }}>Preview event day</Btn>}>
      <Card pad={false}><Table rows={next} rowKey={(x) => x.id} onRow={(x) => setUi({ focus: { kind: "shift", id: x.id } })}
        cols={[{ key: "e", label: "Booking", render: (x) => Q.eventOf(s, x.eventId).name }, { key: "s", label: "Shift", render: (x) => x.label }, { key: "w", label: "When", nowrap: true, render: (x) => span(x.start, x.end) },
          { key: "c", label: "Confirmed", num: true, render: (x) => Q.shiftCoverage(s, x.id).confirmed + "/" + x.required }]} /></Card>
    </Page>
  );
}

function Arrivals({ s, shiftId }: { s: OssState; shiftId: string | null }) {
  if (!shiftId) return <NoLive s={s} />;
  const rows = rosterRows(s, shiftId);
  const groups = ["Not reported", "On the way", "Running late", "On site", "Issue reported"] as const;
  return (
    <Page title="Arrivals" sub="Self-reported journey status. A journey update is not a clock event, and no location trail is kept." scope={<ShiftPicker s={s} shiftId={shiftId} />}>
      <div className="oss-board" style={{ gridTemplateColumns: "repeat(5,minmax(200px,1fr))" }}>
        {groups.map((g) => { const list = rows.filter((r) => r.arr === g); return (
          <div key={g} className="oss-lane"><h3><span style={{ flex: 1 }}>{g}</span><span>{list.length}</span></h3>
            {list.map((r) => <div key={r.a.id} className="oss-task"><WorkerLink s={s} id={r.a.workerId} />
              <div className="oss-tiny oss-muted" style={{ marginTop: 4 }}>{r.j ? fmtTime(r.j.at) + " self-reported" + (r.j.eta ? " · ETA " + fmtTime(r.j.eta) : "") : "No update"}</div>
              {r.j?.message && <div className="oss-tiny" style={{ marginTop: 3 }}>"{r.j.message}"</div>}
              <div style={{ marginTop: 6 }}><S s={r.att} /></div></div>)}
            {!list.length && <div className="oss-tiny oss-muted" style={{ padding: 6 }}>None</div>}
          </div>); })}
      </div>
    </Page>
  );
}

function Attendance({ s, shiftId }: { s: OssState; shiftId: string | null }) {
  const [f, setF] = useState<"all" | "active" | "finished" | "missing">("all");
  const [sel, setSel] = useState<string | null>(null);
  if (!shiftId) return <NoLive s={s} />;
  const sh = Q.shiftOf(s, shiftId);
  const v = Q.venueOf(s, Q.eventOf(s, sh.eventId).venueId)!;
  const asgIds = new Set(s.assignments.filter((a) => a.shiftId === shiftId).map((a) => a.id));
  const records = s.clocks.filter((c) => asgIds.has(c.assignmentId)).sort((a, b) => b.at.localeCompare(a.at));
  const rows = rosterRows(s, shiftId);
  const active = rows.filter((r) => r.att === "Clocked in"), finished = rows.filter((r) => r.att === "Clocked out");
  const missing = rows.filter((r) => (ms(s.clock) > ms(sh.start) + s.rules.missedClockMin * 60000 && !r.vin) || (r.att === "Clocked in" && ms(s.clock) > ms(sh.end) + s.rules.missedClockMin * 60000));
  const show = f === "all" ? records : records.filter((c) => (f === "active" ? active : f === "finished" ? finished : missing).some((r) => r.a.id === c.assignmentId));
  const pick = records.find((c) => c.id === sel) || records.find((c) => c.result !== "verified") || records[0];
  return (
    <Page title="Attendance" sub={<>Clock records for {sh.label.toLowerCase()} at {v.name}. Verified, review-required and rejected attempts are kept separately; originals are never overwritten.</>} scope={<ShiftPicker s={s} shiftId={shiftId} />}>
      <div className="oss-grid oss-main-side" style={{ alignItems: "start" }}>
        <Card pad={false} title={<Seg value={f} onChange={setF} options={[{ id: "all", label: "All records", n: records.length }, { id: "active", label: "Active", n: active.length }, { id: "finished", label: "Finished", n: finished.length }, { id: "missing", label: "Missing clock", n: missing.length }]} />}>
          {f === "missing" && missing.length > 0 && <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }} className="oss-small">{missing.map((r) => Q.nameOf(s, r.a.workerId)).join(", ")}: {missing.some((r) => r.vin) ? "no clock-out" : "no verified clock-in"}.</div>}
          <Table rows={show} rowKey={(c) => c.id} selected={pick?.id} onRow={(c) => setSel(c.id)} maxHeight={560} empty={<Empty title="No clock records yet" body={ms(s.clock) < ms(sh.start) ? "The shift has not started." : undefined} />}
            cols={[{ key: "t", label: "Time", nowrap: true, render: (c) => fmtTime(c.at) + (fmtDate(c.at) !== fmtDate(sh.start) ? " (" + fmtDate(c.at) + ")" : "") },
              { key: "w", label: "Worker", render: (c) => Q.nameOf(s, Q.asgOf(s, c.assignmentId).workerId) },
              { key: "k", label: "Event", render: (c) => (c.kind === "in" ? "Clock-in" : "Clock-out") }, { key: "m", label: "Method", render: (c) => c.method.toUpperCase() },
              { key: "d", label: "Distance", num: true, render: (c) => (c.distanceM !== undefined ? c.distanceM + " m" : "—") },
              { key: "r", label: "Status", render: (c) => <St tone={c.result === "verified" ? "ok" : c.result === "rejected" ? "bad" : "warn"}>{c.result === "verified" ? "Verified" : c.result === "rejected" ? "Rejected" : c.result === "review" ? "Review required" : "Awaiting sync"}</St> }]} />
        </Card>
        <Card title="Evidence">
          {pick ? <>
            <VenueSchematic radius={v.geofenceM} distance={pick.distanceM ?? 0} accuracy={pick.accuracyM ?? 10} />
            <div className="oss-list" style={{ marginTop: 10 }}>
              <div className="oss-row oss-small"><span className="grow oss-dim">Worker</span><WorkerLink s={s} id={Q.asgOf(s, pick.assignmentId).workerId} /></div>
              <div className="oss-row oss-small"><span className="grow oss-dim">Recorded</span><span>{when(pick.at)}</span></div>
              <div className="oss-row oss-small"><span className="grow oss-dim">Method</span><span>{pick.method.toUpperCase()}{pick.token ? " · " + pick.token : ""}</span></div>
              <div className="oss-row oss-small"><span className="grow oss-dim">Distance / accuracy</span><span>{pick.distanceM ?? "—"} m / {pick.accuracyM ?? "—"} m</span></div>
              <div className="oss-small">{pick.reason}</div>
            </div>
            <div className="oss-note" style={{ marginTop: 10 }}>Sample {v.geofenceM} m radius (assumption from the call). A reading inside the radius narrows, but does not prove, presence.</div>
            <div style={{ marginTop: 10 }}><Btn size="sm" onClick={() => openDrawer("timesheet", pick.assignmentId)}>Open timesheet line</Btn></div>
          </> : <Empty title="Select a record" />}
        </Card>
      </div>
    </Page>
  );
}

export function ExcTable({ s, list }: { s: OssState; list: OssState["exceptions"] }) {
  return <Table rows={list} rowKey={(e) => e.id} onRow={(e) => openDrawer("timesheet", e.assignmentId)} empty={<Empty title="No exceptions" />}
    cols={[{ key: "w", label: "Worker", render: (e) => Q.nameOf(s, Q.asgOf(s, e.assignmentId).workerId) },
      { key: "t", label: "Type", render: (e) => <St tone={e.status === "open" ? "warn" : "ok"}>{e.type.replace(/_/g, " ")}</St> },
      { key: "r", label: "Reason", render: (e) => <span className="oss-small">{e.reason}</span> },
      { key: "o", label: "Owner", render: (e) => Q.nameOf(s, e.ownerId) },
      { key: "n", label: "Next action / resolution", render: (e) => <span className="oss-small oss-dim">{e.status === "open" ? e.nextAction : e.resolution}</span> },
      { key: "c", label: "Raised", nowrap: true, render: (e) => when(e.createdAt) },
      { key: "a", label: "", render: (e) => e.status === "open" && (e.type === "missing_out" || e.type === "missing_in") ? <Btn size="sm" onClick={(x: any) => { x.stopPropagation(); navigate("Timesheets", "corrections", { kind: "assignment", id: e.assignmentId }); }}>Correction</Btn> : null }]} />;
}

function Exceptions({ s }: { s: OssState }) {
  const [f, setF] = useState<"open" | "resolved">("open");
  const list = s.exceptions.filter((e) => e.status === f).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <Page title="Exceptions" sub="Missing start or finish, outside venue, poor accuracy, denied permission, offline capture and bad QR codes. An unresolved issue never turns green on its own."
      scope={<Scope><b>All shifts</b></Scope>}>
      <Card pad={false} title={<Seg value={f} onChange={setF} options={[{ id: "open", label: "Open", n: s.exceptions.filter((e) => e.status === "open").length }, { id: "resolved", label: "Resolved", n: s.exceptions.filter((e) => e.status === "resolved").length }]} />}>
        <ExcTable s={s} list={list} />
      </Card>
    </Page>
  );
}
