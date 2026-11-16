/* Site supervisor app (Mark Walsh): today's roster at a glance, who's late or
   missing, the venue QR for check-in, on-site registration and crew messages.
   Mark proposes time corrections; someone in the office approves them. */

import { useMemo, useState } from "react";
import type { OssState } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { runAs, setUi, useOss } from "../store";
import { dayKey, fmtDate, fmtTime, ms } from "../time";
import { Av, Btn, I, Icon, St, TimeSelect } from "../ui/kit";

type Tab = "today" | "roster" | "issues" | "register" | "message";
const MARK = "U05";

function myShifts(s: OssState) {
  const shifts = s.events.filter((e) => e.supervisorId === MARK && e.status === "confirmed" && !e.historical).flatMap((e) => Q.shiftsOfEvent(s, e.id));
  const today = shifts.filter((x) => dayKey(x.start) === dayKey(s.clock) || (ms(x.start) <= ms(s.clock) + 12 * 3600000 && ms(x.end) + 6 * 3600000 >= ms(s.clock)));
  const upcoming = shifts.filter((x) => ms(x.start) > ms(s.clock)).sort((a, b) => a.start.localeCompare(b.start));
  return { today: today.sort((a, b) => a.start.localeCompare(b.start)), upcoming };
}
function counts(s: OssState, shiftId: string) {
  const asg = s.assignments.filter((a) => a.shiftId === shiftId && a.status === "confirmed");
  const started = ms(s.clock) >= ms(Q.shiftOf(s, shiftId).start);
  const inn = asg.filter((a) => Q.verifiedIn(s, a.id)).length;
  const late = asg.filter((a) => Q.arrivalState(s, a.id) === "Running late" && !Q.verifiedIn(s, a.id)).length;
  const missing = started ? asg.filter((a) => !Q.verifiedIn(s, a.id) && Q.arrivalState(s, a.id) !== "Running late").length : 0;
  return { expected: asg.length, inn, late, missing };
}

export default function Supervisor() {
  const s = useOss();
  const [tab, setTab] = useState<Tab>("today");
  const [offline, setOffline] = useState(false);
  const { today, upcoming } = myShifts(s);
  const [sid, setSid] = useState<string | null>(null);
  const shiftId = sid && Q.shiftOf(s, sid) ? sid : (today.find((x) => ms(x.end) > ms(s.clock)) || today[today.length - 1] || upcoming[0])?.id;
  const issues = Q.openExceptions(s).filter((e) => Q.eventOf(s, Q.shiftOf(s, Q.asgOf(s, e.assignmentId).shiftId).eventId).supervisorId === MARK);
  const sh = shiftId ? Q.shiftOf(s, shiftId) : null;
  const c = shiftId ? counts(s, shiftId) : null;
  return (
    <div className="crew">
      <div className="crew-head">
        <span className="brand"><img src="/brand/oss-logo.png" alt="" />Supervisor</span>
        <span className="grow" />
        <button className="crew-bell" onClick={() => setOffline(!offline)} aria-pressed={offline} aria-label={offline ? "Offline" : "Online"} style={offline ? { color: "var(--bad)" } : undefined}><Icon d={I.wifiOff} size={17} /></button>
        <Av name="Mark Walsh" />
      </div>
      {sh && c && tab !== "register" && <div className="sup-band">
        <div className="k">{ms(s.clock) < ms(sh.start) ? "Next up · " + fmtDate(sh.start) : ms(s.clock) < ms(sh.end) ? "Live now" : "Finished " + fmtTime(sh.end)}</div>
        <h2>{Q.venueOf(s, Q.eventOf(s, sh.eventId).venueId)?.name} · {sh.label}</h2>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,.8)", marginTop: 2 }}>{fmtTime(sh.start)}-{fmtTime(sh.end)}</div>
        <div className="stats">{([["Expected", c.expected], ["On site", c.inn], ["Late", c.late], ["Missing", c.missing]] as const).map(([l, n]) => <div key={l}><b>{n}</b><span>{l}</span></div>)}</div>
      </div>}
      {offline && <div className="crew-banner" style={{ margin: "10px 14px 0" }}><Icon d={I.wifiOff} size={15} />No signal. Anything you record is saved on the phone and sent when you're back online.</div>}
      <div className="crew-body" style={{ paddingTop: 4 }}>
        {tab === "today" && <Today s={s} today={today} upcoming={upcoming} shiftId={shiftId} setSid={setSid} go={setTab} issues={issues.length} />}
        {tab === "roster" && shiftId && <Roster s={s} shiftId={shiftId} offline={offline} />}
        {tab === "issues" && <Issues s={s} list={issues} offline={offline} />}
        {tab === "register" && <Register s={s} />}
        {tab === "message" && shiftId && <Message s={s} shiftId={shiftId} />}
      </div>
      <nav className="crew-nav" aria-label="Supervisor">
        {([["today", "Today", I.home, 0], ["roster", "Roster", I.users, 0], ["issues", "Issues", I.alert, issues.length], ["register", "Register", I.plus, 0], ["message", "Message", I.msg, 0]] as const).map(([id, label, icon, badge]) => (
          <button key={id} className={"crew-tab" + (tab === id ? " on" : "")} onClick={() => setTab(id as Tab)}><Icon d={icon} size={21} />{label}{badge ? <span className="badge">{badge}</span> : null}</button>))}
      </nav>
    </div>
  );
}

const btn = { display: "block", width: "100%", textAlign: "left" as const, font: "inherit", color: "inherit", cursor: "pointer", border: 0 };

function Today({ s, today, upcoming, shiftId, setSid, go, issues }: { s: OssState; today: ReturnType<typeof myShifts>["today"]; upcoming: ReturnType<typeof myShifts>["upcoming"]; shiftId?: string; setSid: (x: string) => void; go: (t: Tab) => void; issues: number }) {
  const list = today.length ? today : upcoming.slice(0, 3);
  const sh = shiftId ? Q.shiftOf(s, shiftId) : null;
  return <>
    {issues > 0 && <button className="crew-banner" style={{ ...btn, display: "flex" }} onClick={() => go("issues")}><Icon d={I.alert} size={16} /><span style={{ flex: 1 }}><b>{issues} thing{issues > 1 ? "s" : ""} need you</b><br />Missed clocks or check-ins to review</span><Icon d={I.chevron} size={16} /></button>}
    {sh && Q.venueOf(s, Q.eventOf(s, sh.eventId).venueId)?.methods.includes("qr") && <div className="crew-card" style={{ textAlign: "center" }}>
      <h3>Check-in code</h3>
      <div className="sub">Show this at the staff entrance</div>
      <div className="crew-scan" style={{ width: 170, height: 170 }}><Icon d={I.qr} size={70} sw={1.3} /></div>
      <div style={{ fontSize: 11.5, color: "var(--faint)", fontFamily: "ui-monospace,monospace" }}>{E.qrFor(Q.eventOf(s, sh.eventId).venueId!, sh)}</div>
    </div>}
    <div className="crew-h">{today.length ? "Your shifts today" : "Coming up"}</div>
    {list.map((x) => { const c = counts(s, x.id); const ev = Q.eventOf(s, x.eventId); return (
      <button key={x.id} className="crew-card" style={{ ...btn, boxShadow: x.id === shiftId ? "0 0 0 2px var(--accent)" : undefined }} onClick={() => { setSid(x.id); go("roster"); }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><h3 style={{ flex: 1 }}>{Q.venueOf(s, ev.venueId)?.name} · {x.label}</h3><span className="sub" style={{ marginTop: 0 }}>{fmtTime(x.start)}</span></div>
        <div className="sub">{fmtDate(x.start)} · {c.inn} of {c.expected} on site{c.late ? " · " + c.late + " late" : ""}{c.missing ? " · " + c.missing + " missing" : ""}</div>
      </button>); })}
    {!list.length && <div className="crew-card"><div className="sub">No shifts assigned to you.</div></div>}
  </>;
}

function Roster({ s, shiftId, offline }: { s: OssState; shiftId: string; offline: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const asg = s.assignments.filter((a) => a.shiftId === shiftId && a.status === "confirmed").filter((a) => !q || Q.nameOf(s, a.workerId).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(!!Q.verifiedIn(s, a.id)) - Number(!!Q.verifiedIn(s, b.id)) || Q.nameOf(s, a.workerId).localeCompare(Q.nameOf(s, b.workerId)));
  const tone = (id: string) => { const att = Q.attendanceState(s, id), arr = Q.arrivalState(s, id); return att === "Clocked in" ? ["ok", "On site"] : att === "Clocked out" ? ["neutral", "Finished"] : att === "Review required" ? ["warn", "Check-in to review"] : arr === "Running late" ? ["warn", "Running late"] : arr === "On the way" ? ["info", "On the way"] : ms(s.clock) > ms(Q.shiftOf(s, shiftId).start) ? ["bad", "Not here"] : ["neutral", "Expected"]; };
  return <>
    <div className="crew-h">Roster · {asg.length}</div>
    <input className="oss-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find someone" aria-label="Search roster" style={{ marginTop: 8 }} />
    <div className="crew-card" style={{ padding: "6px 16px" }}>
      {asg.map((a) => { const [t, l] = tone(a.id); return (
        <button key={a.id} className="crew-li" style={{ ...btn, display: "flex", background: "none" }} onClick={() => setOpen(a.id)}>
          <Av name={Q.nameOf(s, a.workerId)} size="sm" /><span className="grow"><b>{Q.nameOf(s, a.workerId)}</b><span>{Q.verifiedIn(s, a.id) ? "In at " + fmtTime(Q.verifiedIn(s, a.id)!.at) : Q.journeyOf(s, a.id)?.eta ? "ETA " + fmtTime(Q.journeyOf(s, a.id)!.eta!) : Q.worker(s, a.workerId).mobile}</span></span>
          <St tone={t as any}>{l}</St>
        </button>); })}
    </div>
    {open && <WorkerSheet s={s} asgId={open} offline={offline} close={() => setOpen(null)} />}
  </>;
}

function WorkerSheet({ s, asgId, offline, close }: { s: OssState; asgId: string; offline: boolean; close: () => void }) {
  const a = Q.asgOf(s, asgId);
  const sh = Q.shiftOf(s, a.shiftId);
  const [field, setField] = useState<"in" | "out">(Q.verifiedIn(s, asgId) ? "out" : "in");
  const [hm, setHm] = useState(fmtTime(field === "out" ? sh.end : sh.start));
  const [reason, setReason] = useState("");
  const clocks = Q.clocksOf(s, asgId);
  const review = clocks.filter((c) => c.result === "review");
  const awaiting = clocks.filter((c) => c.result === "awaiting_sync");
  const pending = s.corrections.filter((c) => c.assignmentId === asgId && c.status === "proposed");
  return (
    <div className="crew-sheet" onClick={close}><div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={Q.nameOf(s, a.workerId)}>
      <div className="grab" />
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}><Av name={Q.nameOf(s, a.workerId)} size="lg" /><div style={{ flex: 1 }}><h3 style={{ margin: 0, fontSize: 19 }}>{Q.nameOf(s, a.workerId)}</h3><div className="sub" style={{ color: "var(--dim)", fontSize: 13 }}>{Q.worker(s, a.workerId).mobile}</div></div></div>
      <div className="crew-h">Clock records</div>
      <div className="crew-card" style={{ padding: "4px 16px" }}>
        {clocks.length ? clocks.map((c) => <div key={c.id} className="crew-li"><span className="grow"><b>{c.kind === "in" ? "In" : "Out"} {fmtTime(c.at)}</b><span>{c.method === "qr" ? "QR code" : c.method === "gps" ? (c.distanceM ?? "?") + " m away" : c.method}</span></span><St tone={c.result === "verified" ? "ok" : c.result === "rejected" ? "bad" : "warn"}>{c.result === "verified" ? "OK" : c.result === "rejected" ? "Rejected" : c.result === "review" ? "Review" : "Offline"}</St></div>)
          : <div className="sub" style={{ padding: "10px 0" }}>Nothing yet.</div>}
      </div>
      {awaiting.length > 0 && <div style={{ marginTop: 10 }}><Btn block disabled={offline} onClick={() => runAs(MARK, E.syncOffline, asgId, 30, 15)}>{offline ? "Waiting for signal" : "Send saved check-in"}</Btn></div>}
      {review.map((c) => <div key={c.id} className="crew-card"><h3>Check-in to review</h3><div className="sub">{c.reason}</div>
        <input className="oss-input" style={{ marginTop: 10 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What did you see?" aria-label="Review reason" />
        <div className="crew-actions"><Btn kind="primary" disabled={!reason.trim()} onClick={() => runAs(MARK, E.reviewClock, c.id, true, reason)}>They're here</Btn><Btn disabled={!reason.trim()} onClick={() => runAs(MARK, E.reviewClock, c.id, false, reason)}>Reject</Btn></div></div>)}
      <div className="crew-h">Fix a time</div>
      {pending.length ? <div className="crew-banner info"><Icon d={I.clock} size={15} />Sent to the office: clock-{pending[0].field} {fmtTime(pending[0].proposed)}. They'll approve it.</div> : <div className="crew-card">
        <div className="crew-actions" style={{ marginTop: 0 }}>
          <select className="oss-input" value={field} onChange={(e) => setField(e.target.value as any)} aria-label="Which time"><option value="in">Clock-in</option><option value="out">Clock-out</option></select>
          <TimeSelect value={hm} onChange={setHm} label="Time" />
        </div>
        <input className="oss-input" style={{ marginTop: 8 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why, e.g. phone died, I saw them leave" aria-label="Reason" />
        <div style={{ marginTop: 10 }}><Btn block kind="primary" disabled={!reason.trim()} onClick={() => { runAs(MARK, E.proposeCorrection, asgId, field, hm, reason, "Proposed on site by Mark Walsh"); }}>Send to office</Btn></div>
      </div>}
    </div></div>
  );
}

function Issues({ s, list, offline }: { s: OssState; list: ReturnType<typeof Q.openExceptions>; offline: boolean }) {
  const [note, setNote] = useState<Record<string, string>>({});
  const [sheet, setSheet] = useState<string | null>(null);
  const LABEL: Record<string, string> = { missing_in: "Missed clock-in", missing_out: "Missed clock-out", outside: "Checked in too far away", poor_accuracy: "Weak location", denied: "Location off", offline: "No signal", bad_token: "Wrong code" };
  return <>
    <div className="crew-h">Needs you · {list.length}</div>
    {list.map((e) => { const a = Q.asgOf(s, e.assignmentId); return (
      <div key={e.id} className="crew-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Av name={Q.nameOf(s, a.workerId)} size="sm" /><h3 style={{ flex: 1 }}>{Q.nameOf(s, a.workerId)}</h3><St tone="warn">{LABEL[e.type] || e.type}</St></div>
        <div className="sub" style={{ marginTop: 8 }}>{e.reason}</div>
        {e.type === "missing_out" || e.type === "missing_in" ? <div style={{ marginTop: 12 }}><Btn block kind="primary" onClick={() => setSheet(a.id)}>Fix the time</Btn></div> : <>
          <input className="oss-input" style={{ marginTop: 10 }} value={note[e.id] || ""} onChange={(x) => setNote({ ...note, [e.id]: x.target.value })} placeholder="What happened?" aria-label="Note" />
          <div style={{ marginTop: 8 }}><Btn block disabled={!(note[e.id] || "").trim()} onClick={() => runAs(MARK, E.resolveException, e.id, note[e.id])}>Resolve</Btn></div>
        </>}
      </div>); })}
    {!list.length && <div className="crew-card" style={{ textAlign: "center" }}><div className="sub">All clear.</div></div>}
    {sheet && <WorkerSheet s={s} asgId={sheet} offline={offline} close={() => setSheet(null)} />}
  </>;
}

function Register({ s }: { s: OssState }) {
  const [f, setF] = useState({ name: "", email: "", mobile: "", role: "Event crew", locality: "Dublin city" });
  const [res, setRes] = useState<{ ok: boolean; message: string; data?: any } | null>(null);
  const dup = useMemo(() => (f.email || f.mobile ? E.findDuplicates(s, f) : { exact: undefined, similar: [] }), [f.email, f.mobile, f.name, s.workers.length]);
  return <>
    <div className="crew-hello"><h1>Register</h1><p>Sign someone up at the gate. We check they're not already on file.</p></div>
    <div className="crew-card" style={{ display: "grid", gap: 12 }}>
      {([["name", "Full name", "text"], ["mobile", "Mobile", "tel"], ["email", "Email", "email"]] as const).map(([k, l, t]) => (
        <div key={k} className="oss-field"><label htmlFor={"r-" + k}>{l}</label><input id={"r-" + k} className="oss-input" type={t} value={(f as any)[k]} onChange={(e) => { setF({ ...f, [k]: e.target.value }); setRes(null); }} autoComplete="off" /></div>))}
      <div className="oss-field"><label htmlFor="r-role">Role</label><select id="r-role" className="oss-input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{["Event crew", "Stagehand", "General operative", "Steward", "Catering assistant"].map((r) => <option key={r}>{r}</option>)}</select></div>
      {dup.exact && <div className="crew-banner" style={{ marginTop: 0 }}><Icon d={I.user} size={15} /><span><b>{dup.exact.name} is already registered.</b> Matched on {E.normEmail(dup.exact.email) === E.normEmail(f.email) ? "email" : "mobile"}, so no duplicate is made.</span></div>}
      {!dup.exact && <Btn kind="primary" block disabled={!f.name.trim() || (!f.email.trim() && !f.mobile.trim())} onClick={() => setRes(runAs(MARK, E.registerWorker, f, "Mark Walsh", !!res?.data?.similar))}>{res?.data?.similar ? "Yes, they're new" : "Register"}</Btn>}
      {res && <div className={"crew-banner " + (res.ok ? "ok" : "")} style={{ marginTop: 0 }}><Icon d={res.ok ? I.check : I.info} size={15} />{res.message}</div>}
    </div>
  </>;
}

function Message({ s, shiftId }: { s: OssState; shiftId: string }) {
  const sh = Q.shiftOf(s, shiftId);
  const roster = s.assignments.filter((a) => a.shiftId === shiftId && a.status === "confirmed").map((a) => a.workerId);
  const [body, setBody] = useState("");
  const [sent, setSent] = useState(false);
  return <>
    <div className="crew-hello"><h1>Message crew</h1><p>Goes to the {roster.length} people on {sh.label.toLowerCase()}.</p></div>
    <div className="crew-card">
      <div className="crew-ppe" style={{ marginTop: 0 }}>{["Use Gate C tonight", "Running 15 min behind", "Bring your hi-vis"].map((t) => <span key={t} style={{ cursor: "pointer" }} onClick={() => setBody(t + ".")}>{t}</span>)}</div>
      <textarea className="oss-input" rows={4} style={{ marginTop: 12, height: "auto", padding: 12 }} value={body} onChange={(e) => { setBody(e.target.value); setSent(false); }} placeholder="Write a message" aria-label="Message" />
      <div style={{ marginTop: 10 }}><Btn kind="primary" block disabled={!body.trim()} onClick={() => { const r = runAs(MARK, E.sendBulk, { workerIds: roster, body, eventId: sh.eventId, audience: "From Mark, " + sh.label.toLowerCase(), kind: "event" }); if (r.ok) { setSent(true); setBody(""); } }}>Send to {roster.length}</Btn></div>
      {sent && <div className="crew-banner ok"><Icon d={I.check} size={15} />Sent. They'll see it in OSS Crew.</div>}
    </div>
  </>;
}
void setUi;
