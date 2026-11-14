/* Site supervisor phone view (Mark Walsh). Essentials first, details in a
   sheet. Mark proposes corrections; he cannot approve his own. */

import { useMemo, useState } from "react";
import type { OssState } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { loadStage, run, runQuiet, setUi, useOss } from "../store";
import { dayKey, fmtDate, fmtTime, ms } from "../time";
import { Btn, Empty, I, Icon, S, St, TimeSelect } from "../ui/kit";

type Tab = "today" | "roster" | "issues" | "register" | "message";

function myShifts(s: OssState) {
  const evs = s.events.filter((e) => e.supervisorId === "U05" && e.status === "confirmed" && !e.historical);
  const shifts = evs.flatMap((e) => Q.shiftsOfEvent(s, e.id));
  const today = shifts.filter((x) => dayKey(x.start) === dayKey(s.clock) || (ms(x.start) <= ms(s.clock) + 12 * 3600000 && ms(x.end) + 6 * 3600000 >= ms(s.clock)));
  const upcoming = shifts.filter((x) => ms(x.start) > ms(s.clock)).sort((a, b) => a.start.localeCompare(b.start));
  return { today: today.sort((a, b) => a.start.localeCompare(b.start)), upcoming };
}

export default function Supervisor() {
  const s = useOss();
  const [tab, setTab] = useState<Tab>("today");
  const [offline, setOffline] = useState(false);
  const { today, upcoming } = myShifts(s);
  const [sid, setSid] = useState<string | null>(null);
  const shiftId = sid && Q.shiftOf(s, sid) ? sid : (today.find((x) => ms(x.end) > ms(s.clock)) || today[today.length - 1] || upcoming[0])?.id;
  const issues = Q.openExceptions(s).filter((e) => Q.eventOf(s, Q.shiftOf(s, Q.asgOf(s, e.assignmentId).shiftId).eventId).supervisorId === "U05");
  return (
    <div className="crew">
      <div className="crew-top">
        <span className="oss-av lg" aria-hidden="true">MW</span>
        <div className="who"><b>Mark Walsh</b><span>Site supervisor · {fmtDate(s.clock)} {fmtTime(s.clock)} · sample data</span></div>
        <button className={"oss-btn sm" + (offline ? " danger" : "")} onClick={() => setOffline(!offline)} aria-pressed={offline}><Icon d={I.wifiOff} size={14} />{offline ? "Offline" : "Online"}</button>
      </div>
      {offline && <div className="oss-note warn" style={{ margin: "0 16px", fontSize: 13 }}>Offline (simulated). Captures are kept on this device and marked awaiting verification until you're back online.</div>}
      <div className="crew-body">
        {tab === "today" && <Today s={s} today={today} upcoming={upcoming} shiftId={shiftId} setSid={setSid} go={setTab} issues={issues.length} />}
        {tab === "roster" && shiftId && <Roster s={s} shiftId={shiftId} offline={offline} />}
        {tab === "issues" && <Issues s={s} list={issues} offline={offline} />}
        {tab === "register" && <Register s={s} />}
        {tab === "message" && shiftId && <Message s={s} shiftId={shiftId} />}
        {!shiftId && tab !== "register" && tab !== "issues" && <Empty title="No shifts assigned" />}
      </div>
      <nav className="crew-nav" aria-label="Supervisor">
        {([["today", "Today", I.home, 0], ["roster", "Roster", I.users, 0], ["issues", "Issues", I.alert, issues.length], ["register", "Register", I.plus, 0], ["message", "Message", I.msg, 0]] as const).map(([id, label, icon, badge]) => (
          <button key={id} className={"crew-tab" + (tab === id ? " on" : "")} onClick={() => setTab(id as Tab)}><Icon d={icon} size={20} />{label}{badge ? <span className="badge">{badge}</span> : null}</button>))}
      </nav>
    </div>
  );
}

function counts(s: OssState, shiftId: string) {
  const asg = s.assignments.filter((a) => a.shiftId === shiftId && a.status === "confirmed");
  const sh = Q.shiftOf(s, shiftId);
  const started = ms(s.clock) >= ms(sh.start);
  const inn = asg.filter((a) => Q.verifiedIn(s, a.id)).length;
  const late = asg.filter((a) => Q.arrivalState(s, a.id) === "Running late" && !Q.verifiedIn(s, a.id)).length;
  const missing = started ? asg.filter((a) => !Q.verifiedIn(s, a.id) && Q.arrivalState(s, a.id) !== "Running late").length : 0;
  return { expected: asg.length, inn, late, missing };
}

function Today({ s, today, upcoming, shiftId, setSid, go, issues }: { s: OssState; today: ReturnType<typeof myShifts>["today"]; upcoming: ReturnType<typeof myShifts>["upcoming"]; shiftId?: string; setSid: (x: string) => void; go: (t: Tab) => void; issues: number }) {
  const list = today.length ? today : upcoming.slice(0, 3);
  return <>
    <div className="crew-h">{today.length ? "Today's shifts" : "Next shifts"}</div>
    {list.map((x) => { const c = counts(s, x.id); const ev = Q.eventOf(s, x.eventId); return (
      <button key={x.id} className="crew-card" onClick={() => { setSid(x.id); go("roster"); }} style={{ display: "block", width: "100%", textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer", ...(x.id === shiftId ? { borderColor: "var(--accent-line)" } : {}) }}>
        <div className="oss-row"><b className="grow">{Q.venueOf(s, ev.venueId)?.name} · {x.label}</b><span className="oss-small oss-muted">{fmtTime(x.start)}–{fmtTime(x.end)}</span></div>
        <div className="oss-small oss-dim">{fmtDate(x.start)}</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, marginTop: 10, textAlign: "center" }}>
          {([["Expected", c.expected, ""], ["Checked in", c.inn, "var(--ok)"], ["Late", c.late, "var(--warn)"], ["Missing", c.missing, "var(--bad)"]] as const).map(([l, n, col]) => (
            <div key={l} style={{ padding: "8px 0", borderRadius: 12, background: "var(--surface-faint)", border: "1px solid var(--border)" }}><div style={{ fontSize: 20, fontWeight: 600, color: n && col ? col : "var(--ink)" }}>{n}</div><div className="oss-tiny oss-muted">{l}</div></div>))}
        </div>
      </button>); })}
    {!today.length && <div className="crew-card"><div className="oss-small oss-dim">Nothing on today. Load the event-day stage to rehearse Saturday.</div><div style={{ marginTop: 10 }}><Btn block onClick={() => { if (!s.ui.dirty || window.confirm("Load the Event day stage? Unsaved workshop edits are replaced.")) loadStage(3); }}>Preview event day</Btn></div></div>}
    {issues > 0 && <button className="crew-card" onClick={() => go("issues")} style={{ display: "block", width: "100%", textAlign: "left", font: "inherit", color: "inherit", borderColor: "var(--warn-soft)" }}><div className="oss-row"><Icon d={I.alert} size={18} style={{ color: "var(--warn)" }} /><b className="grow">{issues} open issue{issues > 1 ? "s" : ""}</b><Icon d={I.chevron} /></div></button>}
  </>;
}

function Roster({ s, shiftId, offline }: { s: OssState; shiftId: string; offline: boolean }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const sh = Q.shiftOf(s, shiftId);
  const asg = s.assignments.filter((a) => a.shiftId === shiftId && a.status === "confirmed").filter((a) => !q || Q.nameOf(s, a.workerId).toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Q.nameOf(s, a.workerId).localeCompare(Q.nameOf(s, b.workerId)));
  const sel = open ? Q.asgOf(s, open) : null;
  return <>
    <div className="crew-h">{Q.eventOf(s, sh.eventId).name.split(":")[0]} · {sh.label} · {fmtTime(sh.start)}–{fmtTime(sh.end)}</div>
    <input className="oss-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search roster" />
    {asg.map((a) => (
      <button key={a.id} className="crew-card" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", font: "inherit", color: "inherit", marginTop: 8, padding: "12px 14px", minHeight: 56 }} onClick={() => setOpen(a.id)}>
        <span className="grow" style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 14.5 }}>{Q.nameOf(s, a.workerId)}</b><div className="oss-tiny oss-muted">{Q.arrivalState(s, a.id)}</div></span>
        <S s={Q.attendanceState(s, a.id)} />
      </button>))}
    {!asg.length && <Empty title="No one matches" />}
    {sel && <WorkerSheet s={s} asgId={sel.id} offline={offline} close={() => setOpen(null)} />}
  </>;
}

function WorkerSheet({ s, asgId, offline, close }: { s: OssState; asgId: string; offline: boolean; close: () => void }) {
  const a = Q.asgOf(s, asgId);
  const sh = Q.shiftOf(s, a.shiftId);
  const [field, setField] = useState<"in" | "out">(Q.verifiedIn(s, asgId) ? "out" : "in");
  const [hm, setHm] = useState(fmtTime(field === "out" ? sh.end : sh.start));
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const clocks = Q.clocksOf(s, asgId);
  const review = clocks.filter((c) => c.result === "review");
  const awaiting = clocks.filter((c) => c.result === "awaiting_sync");
  const pending = s.corrections.filter((c) => c.assignmentId === asgId && c.status === "proposed");
  const asMark = <T,>(fn: () => T) => { const prev = s.ui.personaId; setUi({ personaId: "U05" }); const r = fn(); setUi({ personaId: prev }); return r; };
  return (
    <div className="oss-scrim" style={{ alignItems: "flex-end", justifyContent: "center", position: "absolute" }} onClick={close}>
      <div role="dialog" aria-modal="true" aria-label={"Worker " + Q.nameOf(s, a.workerId)} onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxHeight: "86%", overflowY: "auto", background: "var(--overlay)", borderRadius: "22px 22px 0 0", border: "1px solid var(--border-strong)", padding: "16px 16px 28px", animation: "ossSlide .25s var(--ease) both" }}>
        <div className="oss-row"><b className="grow" style={{ fontSize: 17 }}>{Q.nameOf(s, a.workerId)}</b><button className="oss-x" onClick={close} aria-label="Close"><Icon d={I.x} size={13} /></button></div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}><S s={Q.arrivalState(s, asgId)} /><S s={Q.attendanceState(s, asgId)} /></div>
        <div className="crew-h">Clock records (originals kept)</div>
        {clocks.length ? clocks.map((c) => <div key={c.id} className="oss-small" style={{ padding: "6px 0", borderTop: "1px solid var(--border)" }}>
          <b>{c.kind === "in" ? "In" : "Out"} {fmtTime(c.at)}</b> · {c.method.toUpperCase()} · <St tone={c.result === "verified" ? "ok" : c.result === "rejected" ? "bad" : "warn"}>{c.result === "awaiting_sync" ? "Awaiting sync" : c.result}</St><div className="oss-tiny oss-muted">{c.reason}</div></div>)
          : <div className="oss-small oss-muted">No clock records yet.</div>}
        {awaiting.length > 0 && <div style={{ marginTop: 10 }}><Btn block disabled={offline} onClick={() => run(E.syncOffline, asgId, 30, 15)}>{offline ? "Waiting for signal" : "Sync captured evidence"}</Btn></div>}
        {review.map((c) => <div key={c.id} className="crew-card"><b>Review: clock-{c.kind} {fmtTime(c.at)}</b><div className="oss-small oss-dim">{c.reason}</div>
          <input className="oss-input" style={{ marginTop: 8 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required)" aria-label="Review reason" />
          <div className="crew-actions"><Btn kind="primary" disabled={!reason.trim()} onClick={() => setMsg(asMark(() => { const r = runQuiet(E.reviewClock, c.id, true, reason); return { ok: r.ok, text: r.message }; }))}>Confirm presence</Btn><Btn disabled={!reason.trim()} onClick={() => setMsg(asMark(() => { const r = runQuiet(E.reviewClock, c.id, false, reason); return { ok: r.ok, text: r.message }; }))}>Reject</Btn></div></div>)}
        <div className="crew-h">Propose a correction</div>
        {pending.length ? <div className="oss-note">Waiting for approval: clock-{pending[0].field} {fmtTime(pending[0].proposed)} ({pending[0].reason}). Aoife Byrne or Shane Esler approves; you can't approve your own.</div> : <>
          <div className="crew-actions">
            <select className="oss-input" value={field} onChange={(e) => setField(e.target.value as any)} aria-label="Clock field"><option value="in">Clock-in</option><option value="out">Clock-out</option></select>
            <TimeSelect value={hm} onChange={setHm} label="Proposed time" />
          </div>
          <input className="oss-input" style={{ marginTop: 8 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (required), e.g. phone battery died" aria-label="Correction reason" />
          <div style={{ marginTop: 8 }}><Btn block kind="primary" disabled={!reason.trim()} onClick={() => setMsg(asMark(() => { const r = runQuiet(E.proposeCorrection, asgId, field, hm, reason, "Proposed on site by Mark Walsh"); return { ok: r.ok, text: r.message }; }))}>Send for approval</Btn></div>
        </>}
        {msg && <div className={"oss-note " + (msg.ok ? "ok" : "bad")} style={{ marginTop: 10 }}>{msg.text}</div>}
      </div>
    </div>
  );
}

function Issues({ s, list, offline }: { s: OssState; list: ReturnType<typeof Q.openExceptions>; offline: boolean }) {
  const [note, setNote] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  return <>
    <div className="crew-h">Open issues ({list.length})</div>
    {msg && <div className="oss-note">{msg}</div>}
    {list.map((e) => { const a = Q.asgOf(s, e.assignmentId); const attempt = Q.clocksOf(s, a.id).filter((c) => c.result === "rejected" || c.result === "review").pop(); return (
      <div key={e.id} className="crew-card">
        <div className="oss-row"><b className="grow">{Q.nameOf(s, a.workerId)}</b><St tone="warn">{e.type.replace(/_/g, " ")}</St></div>
        <div className="oss-small" style={{ marginTop: 6 }}>{e.reason}</div>
        {attempt && <div className="oss-tiny oss-muted" style={{ marginTop: 4 }}>Attempt {fmtTime(attempt.at)} · {attempt.method.toUpperCase()}{attempt.distanceM !== undefined ? " · " + attempt.distanceM + " m, accuracy " + attempt.accuracyM + " m" : ""} · {attempt.reason}</div>}
        <div className="oss-tiny" style={{ marginTop: 4, color: "var(--dim)" }}>Next: {e.nextAction}</div>
        {e.type === "missing_out" || e.type === "missing_in" ? <div style={{ marginTop: 8 }}><Btn block kind="primary" onClick={() => setSheet(a.id)}>Propose a correction</Btn><div className="oss-tiny oss-muted" style={{ marginTop: 6 }}>Missing clocks need an approved correction, not a note.</div></div> : <>
          <input className="oss-input" style={{ marginTop: 8 }} value={note[e.id] || ""} onChange={(x) => setNote({ ...note, [e.id]: x.target.value })} placeholder="Exception reason" aria-label="Exception reason" />
          <div style={{ marginTop: 8 }}><Btn block disabled={!(note[e.id] || "").trim()} onClick={() => { const prev = s.ui.personaId; setUi({ personaId: "U05" }); const r = runQuiet(E.resolveException, e.id, note[e.id]); setUi({ personaId: prev }); setMsg(r.message); }}>Record reason and resolve</Btn></div>
        </>}
      </div>); })}
    {!list.length && <Empty title="No open issues" />}
    {sheet && <WorkerSheet s={s} asgId={sheet} offline={offline} close={() => setSheet(null)} />}
  </>;
}

function Register({ s }: { s: OssState }) {
  const [f, setF] = useState({ name: "", email: "", mobile: "", role: "Event crew", locality: "Dublin city" });
  const [res, setRes] = useState<{ ok: boolean; message: string; data?: any } | null>(null);
  const dup = useMemo(() => (f.email || f.mobile ? E.findDuplicates(s, f) : { exact: undefined, similar: [] }), [f.email, f.mobile, f.name, s.workers.length]);
  const submit = (confirmNew = false) => setRes(runQuiet(E.registerWorker, f, "Mark Walsh", confirmNew));
  return <>
    <div className="crew-h">Quick registration</div>
    <div className="crew-card" style={{ display: "grid", gap: 10 }}>
      {([["name", "Full name", "text"], ["email", "Email", "email"], ["mobile", "Mobile", "tel"]] as const).map(([k, l, t]) => (
        <div key={k} className="oss-field"><label htmlFor={"r-" + k}>{l}</label><input id={"r-" + k} className="oss-input" type={t} value={(f as any)[k]} onChange={(e) => { setF({ ...f, [k]: e.target.value }); setRes(null); }} autoComplete="off" /></div>))}
      <div className="crew-actions" style={{ marginTop: 0 }}>
        <div className="oss-field"><label htmlFor="r-role">Role</label><select id="r-role" className="oss-input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{["Event crew", "Stagehand", "General operative", "Steward", "Catering assistant"].map((r) => <option key={r}>{r}</option>)}</select></div>
        <div className="oss-field"><label htmlFor="r-loc">Locality</label><select id="r-loc" className="oss-input" value={f.locality} onChange={(e) => setF({ ...f, locality: e.target.value })}>{["Dublin city", "Tallaght", "Clondalkin", "Lucan", "Swords", "Bray", "Blanchardstown"].map((r) => <option key={r}>{r}</option>)}</select></div>
      </div>
      {dup.exact && <div className="oss-note warn">Existing profile found: <b>{dup.exact.name}</b> ({dup.exact.id}), matched on {E.normEmail(dup.exact.email) === E.normEmail(f.email) ? "email" : "mobile"}. No new record will be created.
        <div className="crew-actions"><Btn size="sm" onClick={() => setUi({ role: "office", drawer: { kind: "worker", id: dup.exact!.id } })}>Open profile</Btn><Btn size="sm" onClick={() => run(E.sendBulk, { workerIds: [dup.exact!.id], body: "Please check your contact details and documents in OSS Crew are up to date.", audience: "Profile update request" })}>Request update</Btn></div></div>}
      {!dup.exact && dup.similar.length > 0 && <div className="oss-note">Similar names on file: {dup.similar.slice(0, 3).map((w) => w.name + " (" + w.id + ")").join(", ")}. Names alone never merge records.</div>}
      {!dup.exact && <Btn kind="primary" block disabled={!f.name.trim() || (!f.email.trim() && !f.mobile.trim())} onClick={() => submit(res?.data?.similar ? true : false)}>{res?.data?.similar ? "Create anyway (reviewed)" : "Check and register"}</Btn>}
      {res && <div className={"oss-note " + (res.ok ? "ok" : res.data?.existing ? "warn" : "")}>{res.message}</div>}
      <div className="oss-tiny oss-muted">New profiles start as pending compliance with a Bullhorn mapping pending. No documents are requested here.</div>
    </div>
  </>;
}

function Message({ s, shiftId }: { s: OssState; shiftId: string }) {
  const sh = Q.shiftOf(s, shiftId);
  const roster = s.assignments.filter((a) => a.shiftId === shiftId && a.status === "confirmed").map((a) => a.workerId);
  const [body, setBody] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  return <>
    <div className="crew-h">Message the {sh.label.toLowerCase()} crew</div>
    <div className="crew-card">
      <div className="oss-small">To: <b>{roster.length} confirmed</b> on {Q.eventOf(s, sh.eventId).name.split(":")[0]} {sh.label.toLowerCase()}. Cancelled and standby workers are excluded.</div>
      <textarea className="oss-input" rows={4} style={{ marginTop: 10 }} value={body} onChange={(e) => setBody(e.target.value)} placeholder="e.g. Meet at the loading access, not the main foyer." aria-label="Message" />
      <div style={{ marginTop: 10 }}><Btn kind="primary" block disabled={!body.trim()} onClick={() => { const prev = s.ui.personaId; setUi({ personaId: "U05" }); const r = runQuiet(E.sendBulk, { workerIds: roster, body, eventId: sh.eventId, audience: "Supervisor message, " + sh.label.toLowerCase() }); setUi({ personaId: prev }); setSent(r.message); setBody(""); }}>Send to {roster.length}</Btn></div>
      {sent && <div className="oss-note ok" style={{ marginTop: 10 }}>{sent}</div>}
    </div>
  </>;
}
