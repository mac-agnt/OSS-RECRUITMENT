/* Supervisor app: my events, who is travelling, late, arrived, clocked in or
   missing, and the few actions needed on a busy site. */

import { useMemo, useState } from "react";
import type { Rtw } from "../model";
import { ROLES } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { act, useOps } from "../store";
import { dayKey, fmtDay, fmtHM, fmtTime, ms, relTime, span } from "../time";
import { Btn, Check, Field, I, Icon, Notice, Select, Status } from "../ui/kit";
import { Sheet } from "./CrewApp";

type Tab = "events" | "approvals" | "register";

function WorkerSheet({ asgId, onClose }: { asgId: string; onClose: () => void }) {
  const s = useOps();
  const sid = s.ui.supervisorId;
  const v = Q.asgView(s, asgId);
  const [mode, setMode] = useState<"main" | "msg" | "time" | "replace" | "override">("main");
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"in" | "out">(v.inAt ? "out" : "in");
  const [hm, setHm] = useState(fmtTime(s.clock));
  const [note, setNote] = useState("");
  const sb = Q.standbyOf(s, v.sh.id).find((b) => b.role === v.a.role);
  const run = (r: { ok: boolean }) => { if (r.ok) onClose(); };
  return (
    <Sheet title={v.w.name} onClose={onClose}>
      <div className="row wrap"><Status tone={v.tone}>{v.label}</Status><span className="small dim">{v.a.role}{v.last ? " · updated " + relTime(v.last.at, s.clock) : ""}</span></div>
      {v.last?.note && <span className="small">"{v.last.note}"</span>}
      {v.openEx.map((x) => <div key={x.id} className="row small"><span className="tone-bad grow">{x.detail}</span>
        {x.type !== "missing_out" && <Btn size="sm" onClick={() => act(sid, E.resolveException, x.id, "Checked on site by supervisor")}>Resolve</Btn>}</div>)}
      {mode === "main" && <>
        <div className="m-btns">
          <a className="btn m-big" href={"tel:" + v.w.mobile.replace(/\s/g, "")}><Icon d={I.phone} />Call</a>
          <Btn className="m-big" icon={I.comms} onClick={() => setMode("msg")}>Message</Btn>
          {!v.inAt && v.state !== "ended" && <Btn kind="primary" className="m-big" icon={I.check} onClick={() => run(act(sid, E.clockIn, v.a.id, { method: "supervisor", note: "Seen on site" }))}>Clock in now</Btn>}
          {v.inAt && !v.outAt && <Btn kind="primary" className="m-big" icon={I.check} onClick={() => run(act(sid, E.clockOut, v.a.id, { method: "supervisor", note: "Signed out by supervisor" }))}>Clock out now</Btn>}
          {!v.inAt && v.travel !== "arrived" && <Btn className="m-big" onClick={() => run(act(sid, E.replyCode, v.w.id, v.a.id, "arrived", { via: "supervisor", note: "Marked arrived by supervisor" }))}>Mark arrived</Btn>}
          <Btn className="m-big" icon={I.edit} onClick={() => setMode("time")}>Set a time</Btn>
        </div>
        {!v.inAt && (sb ? <Btn kind="danger" className="m-big" onClick={() => { const r = act(sid, E.promoteStandby, sb.id, v.a.id, note); if (r.ok) onClose(); else if (r.data?.needsReason) setMode("override"); }}>Replace with {Q.worker(s, sb.workerId).name} (standby)</Btn>
          : <Btn kind="danger" className="m-big" onClick={() => setMode("replace")}>Request a replacement</Btn>)}
      </>}
      {mode === "msg" && <>
        <textarea className="textarea" placeholder={"Message " + v.w.name.split(" ")[0]} value={text} onChange={(e) => setText(e.target.value)} aria-label="Message" />
        <Btn kind="primary" className="m-big" icon={I.send} disabled={!text.trim()} onClick={() => run(act(sid, E.sendMessage, { audience: "worker", workerIds: [v.w.id], body: text }))}>Send by app and WhatsApp</Btn>
      </>}
      {mode === "time" && <>
        <div className="row"><button className={"chip" + (kind === "in" ? " on" : "")} onClick={() => setKind("in")}>Clock-in</button><button className={"chip" + (kind === "out" ? " on" : "")} onClick={() => setKind("out")}>Clock-out</button>
          <input className="input" type="time" value={hm} onChange={(e) => setHm(e.target.value)} aria-label="Time" style={{ width: 120 }} /></div>
        <input className="input" placeholder="Audit note: how do you know?" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Audit note" />
        <Btn kind="primary" className="m-big" disabled={note.trim().length < 5} onClick={() => run(act(sid, E.correctClock, v.a.id, kind, hm, note))}>Save with note</Btn>
        <span className="tiny dim">The original record is kept and the office sees your note.</span>
      </>}
      {mode === "override" && sb && <>
        <span className="small">Confirming {Q.worker(s, sb.workerId).name} overrides a working-time or travel rule. Add a reason for the office.</span>
        <input className="input" placeholder="Reason" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Override reason" />
        <Btn kind="danger" className="m-big" disabled={note.trim().length < 5} onClick={() => run(act(sid, E.promoteStandby, sb.id, v.a.id, note))}>Confirm with reason</Btn>
      </>}
      {mode === "replace" && <>
        <input className="input" placeholder="Why? For example: not answering, no show" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Reason" />
        <Btn kind="danger" className="m-big" onClick={() => run(act(sid, E.requestReplacement, v.a.id, note))}>Ask the office for a replacement</Btn>
      </>}
    </Sheet>
  );
}

function ShiftScreen({ shiftId, onBack }: { shiftId: string; onBack: () => void }) {
  const s = useOps();
  const sid = s.ui.supervisorId;
  const sh = Q.shift(s, shiftId), ev = Q.event(s, sh.eventId), venue = Q.shiftVenue(s, sh);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState(false);
  const [text, setText] = useState("");
  const [overrideSb, setOverrideSb] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const views = Q.confirmedOf(s, sh.id).map((a) => Q.asgView(s, a.id));
  const c = Q.coverage(s, sh.id);
  const groups: [string, Q.AttState[], Q.Tone][] = [
    ["Missing or not replying", ["missing", "no_reply"], "bad"], ["Can't find the location", ["lost"], "bad"], ["Running late", ["late"], "warn"],
    ["On the way", ["on_way"], "info"], ["Arrived, not clocked in", ["arrived", "pending"], "ok"], ["Clocked in", ["in"], "ok"], ["Clocked out", ["out"], "grey"], ["No update yet", ["upcoming"], "grey"]];
  const standby = Q.standbyOf(s, sh.id);
  const counts: [string, number, Q.Tone][] = [["Needed", c.required, "grey"], ["Confirmed", c.confirmed, c.outstanding ? "warn" : "ok"],
    ["Travelling", views.filter((v) => v.state === "on_way" || v.state === "late").length, "info"], ["Arrived", views.filter((v) => v.state === "arrived").length, "ok"],
    ["Clocked in", views.filter((v) => v.state === "in").length, "ok"], ["Missing", views.filter((v) => v.state === "missing" || v.state === "no_reply").length, "bad"], ["Standby", standby.length, "grey"]];
  return (
    <>
      <button className="linkbtn" style={{ alignSelf: "flex-start" }} onClick={onBack}>‹ My events</button>
      <div className="m-card">
        <h2>{ev.name}</h2>
        <div className="m-meta"><span><Icon d={I.events} size={15} />{sh.label}, {fmtDay(dayKey(sh.start))} {span(sh.start, sh.end)}</span><span><Icon d={I.pin} size={15} />{venue.meeting}</span></div>
        <div className="row wrap" style={{ gap: 6 }}>{counts.map(([l, n, t]) => <Status key={l} tone={t} plain>{n} {l.toLowerCase()}</Status>)}</div>
      </div>
      <div className="m-btns">
        <Btn className="m-big" icon={I.comms} onClick={() => setMsg(true)}>Message crew</Btn>
        <Btn className="m-big" icon={I.refresh} onClick={() => act(sid, E.requestStatus, ev.id, [sh.id])}>Request status</Btn>
      </div>
      {groups.map(([label, states, tone]) => {
        const list = views.filter((v) => states.includes(v.state));
        if (!list.length) return null;
        return (
          <div key={label} className="stack g8">
            <div className="m-h"><span className={"tone-" + tone}>{label}</span> ({list.length})</div>
            <div className="m-list">{list.map((v) => (
              <button key={v.a.id} className="m-item" onClick={() => setOpen(v.a.id)}>
                <div className="grow"><b>{v.w.name}</b><small>{v.a.role}{v.eta && v.state === "late" ? " · ETA " + fmtTime(v.eta) : ""}{v.inAt ? " · in " + fmtTime(v.inAt) : ""}{v.last?.note ? " · " + v.last.note : ""}</small></div>
                <Status tone={v.tone}>{v.state === "in" ? "In" : v.label.split(",")[0]}</Status>
              </button>))}</div>
          </div>
        );
      })}
      {standby.length > 0 && (
        <div className="stack g8">
          <div className="m-h">Standby ({standby.length})</div>
          <div className="m-list">{standby.map((b) => (
            <div key={b.id} className="m-item"><div className="grow"><b>{Q.worker(s, b.workerId).name}</b><small>{b.role} · #{b.order}</small></div>
              {Q.coverage(s, sh.id, b.role).outstanding > 0 && <Btn size="sm" kind="primary" onClick={() => { const r = act(sid, E.promoteStandby, b.id); if (!r.ok && r.data?.needsReason) { setWhy(""); setOverrideSb(b.id); } }}>Confirm</Btn>}</div>))}</div>
        </div>
      )}
      {open && <WorkerSheet asgId={open} onClose={() => setOpen(null)} />}
      {overrideSb && <Sheet title="Confirm with a reason" onClose={() => setOverrideSb(null)}>
        <span className="small">This overrides a working-time or travel rule for {Q.worker(s, s.standby.find((b) => b.id === overrideSb)?.workerId || "").name}. The office sees your reason.</span>
        <input className="input" placeholder="Reason" value={why} onChange={(e) => setWhy(e.target.value)} aria-label="Override reason" />
        <Btn kind="primary" className="m-big" disabled={why.trim().length < 5} onClick={() => { if (act(sid, E.promoteStandby, overrideSb, undefined, why).ok) setOverrideSb(null); }}>Confirm with reason</Btn>
      </Sheet>}
      {msg && <Sheet title="Message the crew" onClose={() => setMsg(false)}>
        <span className="small dim">Goes to the {c.confirmed} confirmed crew on this shift, in the app and by WhatsApp (simulated).</span>
        <div className="row wrap">{["Briefing in 10 minutes at the meeting point.", "Gates open in 30 minutes. Positions please.", "Thanks everyone, sign out with me before you leave."].map((t) => <button key={t} className="chip" onClick={() => setText(t)}>{t.split(".")[0]}</button>)}</div>
        <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" aria-label="Message" />
        <Btn kind="primary" className="m-big" icon={I.send} disabled={!text.trim()} onClick={() => { if (act(sid, E.sendMessage, { audience: "shift", shiftId: sh.id, body: text }).ok) { setMsg(false); setText(""); } }}>Send to {c.confirmed}</Btn>
      </Sheet>}
    </>
  );
}

function Approvals() {
  const s = useOps();
  const sid = s.ui.supervisorId;
  const ls = useMemo(() => Q.lines(s, { supervisorId: sid, from: dayKey(new Date(ms(s.clock) - 7 * 864e5).toISOString()) }).filter((l) => ["supervisor", "missing", "review", "in_progress"].includes(l.status)), [s, sid]);
  const ready = ls.filter((l) => l.status === "supervisor");
  const [time, setTime] = useState<string | null>(null);
  const [hm, setHm] = useState("");
  const [note, setNote] = useState("");
  return (
    <>
      <div className="m-card">
        <h2>Timesheets to approve</h2>
        <span className="small dim">Check the hours, then approve. The office reviews next and sends them to payroll.</span>
        <Btn kind="primary" className="m-big" icon={I.check} disabled={!ready.length} onClick={() => act(sid, E.approveSupervisor, ready.map((l) => l.a.id))}>Approve {ready.length} ready</Btn>
      </div>
      {!ls.length && <div className="m-card"><span className="strong">All done</span><span className="small dim">Nothing waiting from your shifts this week.</span></div>}
      {ls.length > 0 && <div className="m-list">{ls.map((l) => (
        <div key={l.id} className="m-item">
          <div className="grow"><b>{l.w.name}</b><small>{fmtDay(l.day)} {l.ev.name.split(":")[0]} · {l.inAt ? fmtTime(l.inAt) : "--:--"} to {l.outAt ? fmtTime(l.outAt) : "--:--"}{l.payableMin ? " · " + fmtHM(l.payableMin) + " paid" : ""}</small></div>
          {l.status === "missing" || l.status === "review" ? <Btn size="sm" kind="danger" onClick={() => { setTime(l.a.id); setHm(fmtTime(l.sh.end)); setNote(""); }}>Fix</Btn> : <Status tone={l.status === "supervisor" ? "warn" : "info"}>{l.status === "supervisor" ? "Ready" : "In progress"}</Status>}
        </div>))}</div>}
      {time && <Sheet title="Set the missing time" onClose={() => setTime(null)}>
        <span className="small">{Q.worker(s, Q.asg(s, time).workerId).name}: {Q.okClock(s, time, "in") ? "clock-out" : "clock-in"}</span>
        <input className="input" type="time" value={hm} onChange={(e) => setHm(e.target.value)} aria-label="Clock-out time" />
        <input className="input" placeholder="Audit note: how do you know?" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Audit note" />
        <Btn kind="primary" className="m-big" disabled={note.trim().length < 5} onClick={() => { if (act(sid, E.correctClock, time, Q.okClock(s, time, "in") ? "out" : "in", hm, note).ok) setTime(null); }}>Save with note</Btn>
        {!Q.okClock(s, time, "in") && <Btn className="m-big" onClick={() => { if (act(sid, E.markNoShow, time, note || "Did not attend").ok) setTime(null); }}>They didn't turn up (no-show)</Btn>}
      </Sheet>}
    </>
  );
}

function Register({ shifts }: { shifts: string[] }) {
  const s = useOps();
  const sid = s.ui.supervisorId;
  const [f, setF] = useState({ name: "", mobile: "", role: "Event crew", rtw: "Irish citizen" as Rtw, idPhoto: true });
  const [shift, setShift] = useState(shifts[0] || "");
  const [done, setDone] = useState<string | null>(null);
  return (
    <>
      <div className="m-card">
        <h2>Register an emergency worker</h2>
        <span className="small">For someone who turns up to help on the day. Registering them is not verification: the office must check their ID{" "}and work authorisation before they can clock in or be booked.</span>
      </div>
      {done && <Notice tone="ok">{done}</Notice>}
      <div className="m-card">
        <Field label="Full name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Mobile"><input className="input" inputMode="tel" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></Field>
        <Field label="Role"><Select value={f.role} onChange={(v) => setF({ ...f, role: v })} options={ROLES.map((r) => ({ value: r, label: r }))} /></Field>
        <Field label="Work authorisation"><Select value={f.rtw} onChange={(v) => setF({ ...f, rtw: v as Rtw })} options={(["Irish citizen", "EU/EEA citizen", "UK citizen", "Stamp 2", "Stamp 4", "Stamp 1G"] as Rtw[]).map((r) => ({ value: r, label: r }))} /></Field>
        {shifts.length > 0 && <Field label="For which event"><Select value={shift} onChange={setShift} options={shifts.map((id) => { const sh = Q.shift(s, id); return { value: id, label: Q.event(s, sh.eventId).name.split(":")[0] + ", " + sh.label }; })} /></Field>}
        <Check checked={f.idPhoto} onChange={(v) => setF({ ...f, idPhoto: v })}>I've taken a photo of their ID (simulated)</Check>
        <Btn kind="primary" className="m-big" icon={I.plus} onClick={() => {
          const r = act(sid, E.registerEmergency, f, shift ? Q.shift(s, shift).eventId : null);
          if (r.ok) { setDone(f.name + " is registered and waiting for office verification. They can't clock in yet."); setF({ ...f, name: "", mobile: "" }); }
        }}>Register and ask the office to verify</Btn>
      </div>
    </>
  );
}

export default function SupervisorApp() {
  const s = useOps();
  const sid = s.ui.supervisorId;
  const me = Q.user(s, sid);
  const [tab, setTab] = useState<Tab>("events");
  const [shiftId, setShiftId] = useState<string | null>(null);
  const now = ms(s.clock);
  const mine = useMemo(() => s.shifts.filter((x) => Q.shiftSupervisor(s, x) === sid && Q.event(s, x.eventId).status === "confirmed" && ms(x.end) > now - 6 * 3600e3 && ms(x.start) < now + 7 * 864e5)
    .sort((a, b) => a.start.localeCompare(b.start)), [s, sid]);
  const todayKey = dayKey(s.clock);
  const toApprove = Q.lines(s, { supervisorId: sid, from: dayKey(new Date(now - 7 * 864e5).toISOString()), status: ["supervisor", "missing", "review"] }).length;
  if (!me) return <div className="m-app"><div className="m-body"><Notice tone="warn">Pick a supervisor.</Notice></div></div>;
  return (
    <div className="m-app">
      <div className="m-top">
        <img src="/brand/oss-logo.png" alt="" width={30} height={30} style={{ borderRadius: 7 }} />
        <div className="stack grow" style={{ gap: 0 }}><h1>{tab === "events" ? "Hi " + me.name : tab === "approvals" ? "Approvals" : "Register"}</h1><span className="sub">OSS Supervisor</span></div>
      </div>
      <div className="m-body">
        {tab === "events" && (shiftId ? <ShiftScreen shiftId={shiftId} onBack={() => setShiftId(null)} /> : <>
          {!mine.length && <div className="m-card"><span className="strong">No events assigned to you this week</span><span className="small dim">The office assigns supervisors per event or shift.</span></div>}
          {[["Today", mine.filter((x) => dayKey(x.start) === todayKey || (ms(x.start) < now && ms(x.end) > now))], ["Coming up", mine.filter((x) => dayKey(x.start) > todayKey)], ["Earlier", mine.filter((x) => dayKey(x.start) < todayKey && ms(x.end) <= now)]].map(([label, list]) => {
            const l = list as typeof mine;
            if (!l.length) return null;
            return (
              <div key={label as string} className="stack g8">
                <div className="m-h">{label as string}</div>
                {l.map((x) => {
                  const ev = Q.event(s, x.eventId), c = Q.coverage(s, x.id), a = Q.attendance(s, [x]);
                  const st = Q.staffStatus(s, ev.id, [x]);
                  const live = Q.shiftPhase(s, x) === "live";
                  return (
                    <button key={x.id} className={"m-card" + (a.missing + a.noReply + a.lost ? " attn" : "")} style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }} onClick={() => setShiftId(x.id)}>
                      <div className="row between"><h2>{ev.name.split(":")[0]}</h2><Status tone={st.tone}>{live ? "Live" : st.label}</Status></div>
                      <span className="small">{x.label} · {fmtDay(dayKey(x.start))} {span(x.start, x.end)}</span>
                      <div className="row wrap" style={{ gap: 6 }}>
                        <Status tone={c.outstanding ? "warn" : "ok"} plain>{c.confirmed}/{c.required} confirmed</Status>
                        {a.onWay + a.late > 0 && <Status tone="info" plain>{a.onWay + a.late} travelling</Status>}
                        {a.late > 0 && <Status tone="warn" plain>{a.late} late</Status>}
                        {a.arrived + a.in > 0 && <Status tone="ok" plain>{a.arrived + a.in} on site</Status>}
                        {a.missing + a.noReply + a.lost > 0 && <Status tone="bad" plain>{a.missing + a.noReply + a.lost} need you</Status>}
                      </div>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </>)}
        {tab === "approvals" && <Approvals />}
        {tab === "register" && <Register shifts={mine.filter((x) => ms(x.end) > now).map((x) => x.id)} />}
      </div>
      <nav className="m-tabs three" aria-label="Supervisor app">
        <button className={tab === "events" ? "on" : ""} onClick={() => { setTab("events"); setShiftId(null); }}><Icon d={I.events} size={21} />My events</button>
        <button className={tab === "approvals" ? "on" : ""} onClick={() => setTab("approvals")}><Icon d={I.hours} size={21} />Approvals{toApprove ? <span className="dot">{toApprove}</span> : null}</button>
        <button className={tab === "register" ? "on" : ""} onClick={() => setTab("register")}><Icon d={I.plus} size={21} />Register</button>
      </nav>
    </div>
  );
}
