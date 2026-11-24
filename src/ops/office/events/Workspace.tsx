/* One event, everything in one place: overview, shifts and roster, messages,
   attendance, timesheets and job instructions. */

import { useState } from "react";
import type { Event, OpsState, Shift } from "../../model";
import { DOC_LABEL } from "../../model";
import * as E from "../../engine";
import * as Q from "../../selectors";
import { go, setQuery, useRoute } from "../../router";
import { office, useOps } from "../../store";
import { dayKey, fmtDay, fmtTime, ms, relTime, span } from "../../time";
import { Avatar, Btn, Dialog, I, Icon, KV, Notice, Panel, Popover, Sim, Status, Tabs } from "../../ui/kit";
import { attendanceText, Page, supName, venueLabel } from "../common";
import Roster from "./Roster";
import { EventMessages } from "../Comms";
import { LinesPanel } from "../Timesheets";
import { ResolveDialog, SetTime } from "../dialogs";

type Tab = "overview" | "roster" | "comms" | "attendance" | "timesheets" | "instructions";

function Overview({ s, ev }: { s: OpsState; ev: Event }) {
  const c = Q.client(s, ev.clientId), v = Q.venue(s, ev.venueId);
  const shs = Q.shiftsOf(s, ev.id);
  const ids = new Set([ev.id, ...shs.map((x) => x.id), ...shs.flatMap((x) => Q.asgsOfShift(s, x.id).map((a) => a.id))]);
  const activity = s.audit.filter((a) => a.ref && ids.has(a.ref.id)).slice(-10).reverse();
  return (
    <div className="grid2" style={{ alignItems: "start" }}>
      <div className="stack g16">
        <Panel title="Shifts" flush>
          <div className="tbl-wrap">
            <table className="tbl" aria-label="Shifts">
              <thead><tr><th>Shift</th><th>When</th><th className="r">Needed</th><th className="r">Confirmed</th><th className="r">Open</th><th>Staffing</th></tr></thead>
              <tbody>
                {shs.slice(0, 14).map((x) => { const cv = Q.coverage(s, x.id); const st = Q.staffStatus(s, ev.id, [x]); return (
                  <tr key={x.id} className="click" onClick={() => setQuery({ tab: "roster", day: dayKey(x.start), shift: x.id })}>
                    <td className="strong">{x.label}</td><td className="num nowrap">{fmtDay(dayKey(x.start))}, {span(x.start, x.end)}</td>
                    <td className="r num">{cv.required}</td><td className="r num">{cv.confirmed}</td><td className={"r num " + (cv.outstanding ? "tone-bad" : "")}>{cv.outstanding}</td>
                    <td><Status tone={st.tone}>{st.label}</Status></td>
                  </tr>); })}
              </tbody>
            </table>
          </div>
          {shs.length > 14 && <div className="pager"><span>{shs.length - 14} more shifts</span><Btn size="sm" onClick={() => setQuery({ tab: "roster" })}>Open shifts and roster</Btn></div>}
        </Panel>
        <Panel title="Recent activity" meta="From the audit log">
          {!activity.length ? <span className="dim">Nothing yet.</span> : <div className="stack g8">
            {activity.map((a) => <div key={a.id} className="small"><span className="dim num">{relTime(a.at, s.clock)}</span> · <b className="ink">{a.actor}</b> {a.summary}{a.sim && <> <Sim /></>}</div>)}
          </div>}
        </Panel>
      </div>
      <div className="stack g16">
        <Panel title="Client">
          <KV items={[["Company", <button className="linkbtn" onClick={() => go("/clients/" + c.id)}>{c.name}</button>], ["Contact", c.contact || "-"], ["Email", c.email ? <a href={"mailto:" + c.email}>{c.email}</a> : "-"], ["Phone", c.phone || "-"]]} />
        </Panel>
        <Panel title="Location">
          <KV items={[["Venue", v.name], ["Address", v.address], ["Meeting point", v.meeting], ["Clock-in radius", v.radiusM + " m"], ["Supervisor", Q.user(s, ev.supervisorId)?.name || "-"]]} />
        </Panel>
        <Panel title="Requirements">
          <KV items={[["PPE", ev.ppe.join(", ") || "None"], ["Qualifications", ev.quals.map((t) => DOC_LABEL[t]).join(", ") || "Role rules only"]]} />
        </Panel>
      </div>
    </div>
  );
}

export function AttendanceShift({ s, ev, sh }: { s: OpsState; ev: Event; sh: Shift }) {
  const [setTime, setSetTime] = useState<string | null>(null);
  const [resolve, setResolve] = useState<string | null>(null);
  const a = Q.attendance(s, [sh]);
  const t = attendanceText(s, sh);
  const v = Q.shiftVenue(s, sh);
  const ph = Q.shiftPhase(s, sh);
  const chips: [string, number, Q.Tone][] = [["Confirmed", a.confirmed, "grey"], ["On the way", a.onWay, "info"], ["Late", a.late, "warn"], ["Cannot find it", a.lost, "bad"], ["Arrived", a.arrived, "ok"],
    ["Clocked in", a.in, "ok"], ["Clocked out", a.out, "grey"], ["Missing", a.missing, "bad"], ["No reply", a.noReply, "bad"], ["Waiting to sync", a.pending, "warn"], ["Standby", a.standby, "grey"]];
  return (
    <div className="shift" id={"shift-" + sh.id}>
      <div className="shift-h">
        <div className="stack" style={{ gap: 2 }}>
          <h3>{sh.label}, {span(sh.start, sh.end)}</h3>
          <span className={"small tone-" + t.tone}>{t.text}</span>
        </div>
        <div className="row wrap">
          {ph !== "done" && <Btn size="sm" icon={I.comms} onClick={() => office(E.requestStatus, ev.id, [sh.id])}>Request status update</Btn>}
          {ph !== "upcoming" || ms(sh.start) - ms(s.clock) < 60 * 60000 ? <Btn size="sm" kind="quiet" icon={I.play} onClick={() => office(E.simulateArrivals, sh.id)} title="Demo only">Simulate arrivals</Btn> : null}
        </div>
      </div>
      <div className="row wrap" style={{ padding: "0 16px 12px" }}>
        {chips.filter(([, n]) => n > 0).map(([l, n, tone]) => <Status key={l} tone={tone} plain>{n} {l.toLowerCase()}</Status>)}
      </div>
      <div className="tbl-wrap" style={{ borderTop: "1px solid var(--border)" }}>
        <table className="tbl" aria-label={"Attendance, " + sh.label}>
          <thead><tr><th>Worker</th><th>Status</th><th className="hide-sm">Last update</th><th>In</th><th>Out</th><th className="hide-md">Issues</th><th /></tr></thead>
          <tbody>
            {Q.confirmedOf(s, sh.id).map((x) => {
              const av = Q.asgView(s, x.id);
              const inC = Q.okClock(s, x.id, "in"), outC = Q.okClock(s, x.id, "out");
              const rejected = Q.clocksOf(s, x.id).filter((c) => c.result === "rejected").pop();
              return (
                <tr key={x.id}>
                  <td><button className="linkbtn row" onClick={() => go("/crew/" + x.workerId)}><Avatar name={av.w.name} size="sm" />{av.w.name}</button></td>
                  <td><Status tone={av.tone}>{av.label}</Status></td>
                  <td className="hide-sm small">{av.last ? <>{av.last.note || ""}<span className="dim">{av.last.note ? " · " : ""}{relTime(av.last.at, s.clock)}{av.last.via === "whatsapp" ? " · WhatsApp" : ""}</span></> : <span className="dim">No update</span>}</td>
                  <td className="small num">{inC ? <>{fmtTime(inC.at)}<div className="tiny dim">{inC.method === "gps" ? (inC.distanceM ?? "") + " m, location" : inC.method === "qr" ? "QR code" : inC.method === "correction" ? "Set by office" : "Supervisor"}</div></> : rejected ? <span className="tone-bad tiny">{rejected.reason}</span> : "-"}</td>
                  <td className="small num">{outC ? <>{fmtTime(outC.at)}<div className="tiny dim">{outC.method === "correction" ? "Set by office" : outC.method === "gps" ? (outC.distanceM ?? "") + " m" : outC.method}</div></> : "-"}</td>
                  <td className="hide-md small">{av.openEx.map((e) => <div key={e.id} className="row"><span className={e.type === "late" ? "tone-warn" : "tone-bad"}>{e.detail}</span>
                    {e.type !== "missing_out" && <button className="linkbtn tiny" onClick={() => setResolve(e.id)}>Resolve</button>}</div>)}</td>
                  <td className="r nowrap">
                    {ph !== "upcoming" && <Btn size="sm" kind="quiet" onClick={() => setSetTime(x.id)}>Set time</Btn>}
                    <Btn size="sm" kind="quiet" icon={I.comms} iconOnly title={"Message " + av.w.name} onClick={() => go("/comms?worker=" + x.workerId)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="row wrap small dim" style={{ padding: "10px 16px", borderTop: "1px solid var(--border)", gap: 16 }}>
        <span><Icon d={I.pin} size={13} /> {v.name}: {v.meeting}</span>
        <span><Icon d={I.gps} size={13} /> Location check within {v.radiusM} m <Sim /></span>
        {v.qr && <span><Icon d={I.qr} size={13} /> QR code OSS-{sh.id}-v{sh.version} <Sim /></span>}
      </div>
      {setTime && <SetTime asgId={setTime} onClose={() => setSetTime(null)} />}
      {resolve && <ResolveDialog exId={resolve} onClose={() => setResolve(null)} />}
    </div>
  );
}

function Attendance({ s, ev }: { s: OpsState; ev: Event }) {
  const r = useRoute();
  const all = Q.shiftsOf(s, ev.id);
  const days = [...new Set(all.map((x) => dayKey(x.start)))];
  const nowDay = dayKey(s.clock);
  const day = r.q.get("day") && days.includes(r.q.get("day")!) ? r.q.get("day")! : days.find((d) => d >= nowDay) || days[days.length - 1];
  const list = all.length > 6 ? all.filter((x) => dayKey(x.start) === day) : all;
  return (
    <div className="stack g12">
      {all.length > 6 && <div className="row wrap">{days.map((d) => <button key={d} className={"chip" + (d === day ? " on" : "")} onClick={() => setQuery({ day: d })}>{fmtDay(d)}</button>)}</div>}
      <Notice tone="info">Location is checked only when someone clocks in or out, never tracked in between. Location and QR checks are simulated in this demo.</Notice>
      {list.map((sh) => <AttendanceShift key={sh.id} s={s} ev={ev} sh={sh} />)}
    </div>
  );
}

function Instructions({ s, ev }: { s: OpsState; ev: Event }) {
  const v = Q.venue(s, ev.venueId);
  const body = (ev.instructions ? ev.instructions + " " : "") + "Meeting point: " + v.meeting + "." + (ev.ppe.length ? " Bring: " + ev.ppe.join(", ").toLowerCase() + "." : "");
  return (
    <Panel title="Job instructions" right={<><Btn size="sm" icon={I.edit} onClick={() => go("/events/" + ev.id + "/edit")}>Edit</Btn>
      <Btn size="sm" kind="primary" icon={I.send} onClick={() => office(E.sendMessage, { audience: "event", eventId: ev.id, kind: "instructions", body })}>Send to confirmed crew</Btn></>}>
      <div className="stack g16">
        <p style={{ whiteSpace: "pre-wrap", color: "var(--ink)" }}>{ev.instructions || "No instructions yet."}</p>
        <KV items={[["Meeting point", v.meeting], ["Address", v.address], ["PPE and uniform", ev.ppe.join(", ") || "None"],
          ["Qualifications", [...ev.quals.map((t) => DOC_LABEL[t]), "plus role rules"].join(", ")], ["Directions", <a href={"https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(v.name + ", " + v.address)} target="_blank" rel="noreferrer">Open in maps</a>]]} />
        <div className="small dim">Crew see this in the app with the shift. The message also goes by WhatsApp (simulated).</div>
      </div>
    </Panel>
  );
}

export default function Workspace({ id }: { id: string }) {
  const s = useOps();
  const r = useRoute();
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState("");
  const ev = Q.event(s, id);
  if (!ev) return <Page title="Event not found" back={{ to: "/events", label: "Events" }}><Notice tone="warn">This event doesn't exist in the demo data. It may have been removed by a reset.</Notice></Page>;
  const tab = (["overview", "roster", "comms", "attendance", "timesheets", "instructions"].includes(r.q.get("tab") || "") ? r.q.get("tab") : "overview") as Tab;
  const shs = Q.shiftsOf(s, ev.id);
  const sp = Q.eventSpan(s, ev.id);
  const st = Q.staffStatus(s, ev.id);
  const c = Q.eventCov(s, ev.id);
  const phase = Q.eventPhase(s, ev.id);
  const flagged = c.flagged;
  const unread = Q.messagesOf(s, "T-" + ev.id).filter((m) => m.to.includes("office") && !m.read.office).length;
  const lineCount = Q.lines(s, { eventId: ev.id, status: ["supervisor", "office", "missing", "review"] }).length;
  const soon = shs.some((x) => ms(x.end) > ms(s.clock) && ms(x.start) - ms(s.clock) < 24 * 3600e3);
  return (
    <Page back={{ to: "/events?date=" + dayKey(sp.start), label: "Events" }}
      title={<span className="row wrap">{ev.name}<Status tone={st.tone}>{st.label}</Status></span>}
      sub={<span className="ws-meta">
        <span><Icon d={I.client} size={14} />{Q.client(s, ev.clientId).name}</span>
        <span><Icon d={I.pin} size={14} />{Q.venue(s, ev.venueId).name}{new Set(shs.map((x) => x.venueId || ev.venueId)).size > 1 ? " and " + (new Set(shs.map((x) => x.venueId || ev.venueId)).size - 1) + " more" : ""}</span>
        <span><Icon d={I.events} size={14} />{fmtDay(dayKey(sp.start))}{dayKey(sp.end) !== dayKey(sp.start) && dayKey(sp.end) !== dayKey(addMinIso(sp.start)) ? " to " + fmtDay(dayKey(sp.end)) : ""}, {shs.length === 1 ? span(sp.start, sp.end) : shs.length + " shifts"}</span>
        <span><Icon d={I.user} size={14} />{Q.user(s, ev.supervisorId)?.name || "No supervisor"}{new Set(shs.map((x) => Q.shiftSupervisor(s, x))).size > 1 ? " and " + (new Set(shs.map((x) => Q.shiftSupervisor(s, x))).size - 1) + " shift supervisors" : ""}</span>
        <span className="num"><Icon d={I.crew} size={14} /><b className="ink">{c.confirmed}</b> of {c.required} confirmed{c.outstanding ? ", " + c.outstanding + " open" : ""}</span>
      </span>}
      actions={<>
        {ev.status === "confirmed" && phase !== "done" && <Btn icon={I.comms} onClick={() => go("/comms?event=" + ev.id)}>Message crew</Btn>}
        {ev.status === "confirmed" && soon && <Btn onClick={() => office(E.requestStatus, ev.id)}>Request status</Btn>}
        {ev.status === "confirmed" && <Btn icon={I.edit} onClick={() => go("/events/" + ev.id + "/edit")}>Edit</Btn>}
        {ev.status === "confirmed" && phase === "upcoming" && (
          <Popover button={(open, toggle) => <Btn icon={I.more} iconOnly title="More" onClick={toggle} />}>
            {(close) => <button className="item" style={{ color: "var(--bad)" }} onClick={() => { close(); setCancel(true); }}><Icon d={I.x} />Cancel event</button>}
          </Popover>
        )}
      </>}>
      {ev.status === "cancelled" && <div style={{ marginBottom: 12 }}><Notice tone="warn">Cancelled: {ev.cancelReason}</Notice></div>}
      <div style={{ marginBottom: 16 }}>
        <Tabs label="Event workspace" value={tab} onChange={(v) => setQuery({ tab: v, shift: null })} items={[
          { id: "overview", label: "Overview" }, { id: "roster", label: "Shifts and roster", n: flagged || (c.outstanding < 100 ? c.outstanding : 0), tone: flagged ? "bad" : undefined },
          { id: "comms", label: "Communications", n: unread, tone: "accent" }, { id: "attendance", label: "Attendance" },
          { id: "timesheets", label: "Timesheets", n: lineCount }, { id: "instructions", label: "Instructions" }]} />
      </div>
      {tab === "overview" && <Overview s={s} ev={ev} />}
      {tab === "roster" && <Roster ev={ev} />}
      {tab === "comms" && <EventMessages eventId={ev.id} />}
      {tab === "attendance" && <Attendance s={s} ev={ev} />}
      {tab === "timesheets" && <LinesPanel eventId={ev.id} />}
      {tab === "instructions" && <Instructions s={s} ev={ev} />}
      {cancel && (
        <Dialog title={"Cancel " + ev.name + "?"} onClose={() => setCancel(false)}
          actions={<><Btn onClick={() => setCancel(false)}>Keep event</Btn><Btn kind="danger" disabled={!reason.trim()} onClick={() => { if (office(E.cancelEvent, ev.id, reason).ok) setCancel(false); }}>Cancel event</Btn></>}>
          <div className="stack g8"><span>{c.confirmed} confirmed crew are released and told by message. Open offers are withdrawn.</span>
            <input className="input" autoFocus placeholder="Reason the crew will see" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" /></div>
        </Dialog>
      )}
    </Page>
  );
}

const addMinIso = (iso: string) => new Date(Date.parse(iso) + 12 * 3600e3).toISOString();
