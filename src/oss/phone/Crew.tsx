/* OSS Crew: the employee's phone app. Reads and writes the same store as the
   office, so every tap here changes the desk view immediately. */

import { useEffect, useMemo, useState } from "react";
import type { Assignment, Invitation, OssState } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { docLabel } from "../seed";
import { run, setUi, useOss } from "../store";
import { addDays, dayKey, fmtDate, fmtDateLong, fmtHM, fmtTime, ms, weekday, zoned } from "../time";
import { Btn, Empty, I, Icon, S, St, TimeSelect } from "../ui/kit";
import { VerifyControls, type VerifyInput } from "./Verify";

type Tab = "home" | "shifts" | "schedule" | "inbox" | "profile";
type Detail = { kind: "inv"; id: string } | { kind: "asg"; id: string } | null;

export const CREW_PERSONAS = [
  ["W009", "Aidan Murphy", "availability and split answers"],
  ["W014", "Chloé Ryan", "cancellation"],
  ["W031", "Orla Kavanagh", "replacement"],
  ["W021", "Owen Clarke", "arrival and check-in"],
  ["W025", "Niamh Walsh", "corrected hours"],
  ["W028", "Sean McKenna", "outstanding invitation"],
  ["W029", "Adam O'Neill", "gap filler"]
];

export default function Crew() {
  const s = useOss();
  const wid = s.ui.crewWorkerId;
  const w = Q.worker(s, wid);
  const [tab, setTab] = useState<Tab>("home");
  const [detail, setDetail] = useState<Detail>(null);
  useEffect(() => { setDetail(null); setTab("home"); }, [wid]);
  if (!w) return null;
  const invs = s.invitations.filter((i) => i.workerId === wid && Q.isActiveInvite(s, i)).sort((a, b) => Q.shiftOf(s, a.shiftId).start.localeCompare(Q.shiftOf(s, b.shiftId).start));
  const unread = s.messages.filter((m) => m.receipts[wid] && !m.receipts[wid].read).length;
  const open = (d: Detail) => setDetail(d);
  return (
    <div className="crew">
      <div className="crew-top">
        <span className="oss-av lg" aria-hidden="true">{w.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}</span>
        <div className="who"><b>{w.name}</b><span>OSS Crew · {fmtDate(s.clock)} {fmtTime(s.clock)} · sample data</span></div>
        <select className="oss-input" style={{ width: 120, height: 36, fontSize: 12 }} value={wid} aria-label="Demo worker persona" onChange={(e) => setUi({ crewWorkerId: e.target.value })}>
          {CREW_PERSONAS.map(([id, n]) => <option key={id} value={id}>{n.split(" ")[0]}</option>)}
          {!CREW_PERSONAS.some(([id]) => id === wid) && <option value={wid}>{w.name.split(" ")[0]}</option>}
        </select>
      </div>
      <div className="crew-body">
        {detail ? <ShiftDetail s={s} wid={wid} detail={detail} back={() => setDetail(null)} />
          : tab === "home" ? <Home s={s} wid={wid} invs={invs} open={open} go={setTab} />
          : tab === "shifts" ? <Shifts s={s} wid={wid} open={open} />
          : tab === "schedule" ? <Schedule s={s} wid={wid} open={open} />
          : tab === "inbox" ? <Inbox s={s} wid={wid} />
          : <Profile s={s} wid={wid} />}
      </div>
      <nav className="crew-nav" aria-label="OSS Crew">
        {([["home", "Home", I.home, invs.length], ["shifts", "Shifts", I.list, 0], ["schedule", "Schedule", I.cal, 0], ["inbox", "Inbox", I.inbox, unread], ["profile", "Profile", I.user, 0]] as const).map(([id, label, icon, badge]) => (
          <button key={id} className={"crew-tab" + (tab === id && !detail ? " on" : "")} onClick={() => { setDetail(null); setTab(id as Tab); }} aria-current={tab === id ? "page" : undefined}>
            <Icon d={icon} size={20} />{label}{badge ? <span className="badge">{badge}</span> : null}
          </button>
        ))}
      </nav>
    </div>
  );
}

const venueName = (s: OssState, shiftId: string) => Q.venueOf(s, Q.eventOf(s, Q.shiftOf(s, shiftId).eventId).venueId)?.name || Q.eventOf(s, Q.shiftOf(s, shiftId).eventId).name;
const when = (s: OssState, shiftId: string) => { const x = Q.shiftOf(s, shiftId); return fmtDate(x.start) + " · " + fmtTime(x.start) + "–" + fmtTime(x.end); };

function InvCard({ s, inv, open }: { s: OssState; inv: Invitation; open: (d: Detail) => void }) {
  const sh = Q.shiftOf(s, inv.shiftId);
  const unavailable = inv.flags.includes("worker-unavailable");
  return (
    <div className="crew-card">
      <button className="oss-link" style={{ color: "var(--ink)", display: "block", width: "100%" }} onClick={() => open({ kind: "inv", id: inv.id })}>
        <div className="oss-row"><h3 className="grow">{venueName(s, sh.id)}</h3><S s="Awaiting reply" /></div>
        <div className="oss-small oss-dim" style={{ marginTop: 4 }}>{sh.label} · {when(s, sh.id)}</div>
        <div className="oss-tiny oss-muted" style={{ marginTop: 6 }}>PPE: {sh.ppe.join(", ")}{inv.kind === "replacement" ? " · replacement offer" : ""}</div>
      </button>
      {unavailable && <div className="oss-note warn" style={{ marginTop: 10, fontSize: 13 }}>You marked yourself unavailable for this time.</div>}
      <div className="crew-actions">
        <Btn kind="primary" onClick={() => run(E.respond, inv.id, "accept")} disabled={unavailable}>Accept</Btn>
        <Btn onClick={() => run(E.respond, inv.id, "decline", unavailable ? "Unavailable" : "")}>Decline</Btn>
      </div>
      <div className="oss-tiny oss-muted" style={{ marginTop: 8 }}>This answer applies to this shift only. Offer open until {fmtDate(inv.expiresAt)} {fmtTime(inv.expiresAt)}.</div>
    </div>
  );
}

function nextAsg(s: OssState, wid: string): Assignment | undefined {
  return s.assignments.filter((a) => a.workerId === wid && a.status === "confirmed" && !Q.verifiedOut(s, a.id) && ms(Q.shiftOf(s, a.shiftId).end) + 6 * 3600000 > ms(s.clock))
    .sort((a, b) => Q.shiftOf(s, a.shiftId).start.localeCompare(Q.shiftOf(s, b.shiftId).start))[0];
}

function Home({ s, wid, invs, open, go }: { s: OssState; wid: string; invs: Invitation[]; open: (d: Detail) => void; go: (t: Tab) => void }) {
  const a = nextAsg(s, wid);
  const notSubmitted = !Q.hasSubmittedAvailability(s, wid);
  return <>
    <div className="crew-h">Next shift</div>
    {a ? <AsgCard s={s} a={a} open={open} /> : <div className="crew-card"><div className="oss-small oss-dim">No confirmed shifts coming up.</div></div>}
    {invs.length > 0 && <><div className="crew-h">Offers waiting for you ({invs.length})</div>{invs.map((i) => <InvCard key={i.id} s={s} inv={i} open={open} />)}</>}
    <div className="crew-card">
      <div className="oss-row"><Icon d={I.cal} size={18} /><div className="grow"><b className="oss-ink" style={{ fontSize: 14 }}>Availability</b><div className="oss-tiny oss-muted">{notSubmitted ? "Not submitted yet. OSS can only offer shifts when it knows." : "Keep it current so offers fit your week."}</div></div><Btn size="sm" onClick={() => go("schedule")}>Update</Btn></div>
    </div>
  </>;
}

function AsgCard({ s, a, open }: { s: OssState; a: Assignment; open: (d: Detail) => void }) {
  const sh = Q.shiftOf(s, a.shiftId);
  const att = Q.attendanceState(s, a.id), arr = Q.arrivalState(s, a.id);
  const needsReconfirm = a.shiftVersion < sh.version;
  return (
    <button className="crew-card" style={{ display: "block", width: "100%", textAlign: "left", font: "inherit", color: "inherit", cursor: "pointer" }} onClick={() => open({ kind: "asg", id: a.id })}>
      <div className="oss-row"><h3 className="grow">{venueName(s, sh.id)}</h3><S s={needsReconfirm ? "Needs review" : "Confirmed"} /></div>
      <div className="oss-small oss-dim" style={{ marginTop: 4 }}>{sh.label} · {when(s, sh.id)}</div>
      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}><S s={arr} /><S s={att} /></div>
      <div className="oss-tiny" style={{ marginTop: 8, color: "var(--accent)" }}>Open shift details</div>
    </button>
  );
}

function Shifts({ s, wid, open }: { s: OssState; wid: string; open: (d: Detail) => void }) {
  const [f, setF] = useState<"offered" | "confirmed" | "open" | "history">("offered");
  const offered = s.invitations.filter((i) => i.workerId === wid && Q.isActiveInvite(s, i));
  const confirmed = s.assignments.filter((a) => a.workerId === wid && a.status === "confirmed" && !Q.verifiedOut(s, a.id) && ms(Q.shiftOf(s, a.shiftId).end) + 6 * 3600000 > ms(s.clock));
  const w = Q.worker(s, wid);
  const openShifts = Q.windowEvents(s).flatMap((e) => Q.shiftsOfEvent(s, e.id)).filter((x) => ms(x.start) > ms(s.clock) && Q.shiftCoverage(s, x.id).notInvited > 0 && w.roles.some((r) => x.roles.includes(r))
    && !s.assignments.some((a) => a.shiftId === x.id && a.workerId === wid && a.status === "confirmed") && !s.invitations.some((i) => i.shiftId === x.id && i.workerId === wid && Q.isActiveInvite(s, i)));
  const hist = [
    ...s.invitations.filter((i) => i.workerId === wid && i.status !== "accepted" && !Q.isActiveInvite(s, i)).map((i) => ({ id: i.id, at: Q.shiftOf(s, i.shiftId).start, shiftId: i.shiftId, label: Q.inviteLabel(s, i), d: { kind: "inv", id: i.id } as Detail })),
    ...s.assignments.filter((a) => a.workerId === wid && (a.status !== "confirmed" || Q.verifiedOut(s, a.id) || ms(Q.shiftOf(s, a.shiftId).end) + 6 * 3600000 <= ms(s.clock))).map((a) => ({ id: a.id, at: Q.shiftOf(s, a.shiftId).start, shiftId: a.shiftId, label: a.status === "cancelled" ? "Cancelled" : a.status === "withdrawn" ? "Withdrawn" : "Completed", d: { kind: "asg", id: a.id } as Detail }))
  ].sort((a, b) => b.at.localeCompare(a.at));
  const requested = (sid: string) => s.openShiftRequests.some((r) => r.shiftId === sid && r.workerId === wid);
  return <>
    <div className="oss-seg" style={{ marginTop: 6, width: "100%" }}>
      {([["offered", "Offered", offered.length], ["confirmed", "Confirmed", confirmed.length], ["open", "Open", openShifts.length], ["history", "History", hist.length]] as const).map(([id, l, n]) => (
        <button key={id} className={f === id ? "on" : ""} style={{ flex: 1, height: 36 }} onClick={() => setF(id)}>{l} <span className="n">{n}</span></button>))}
    </div>
    {f === "offered" && (offered.length ? offered.map((i) => <InvCard key={i.id} s={s} inv={i} open={open} />) : <Empty title="No offers right now" />)}
    {f === "confirmed" && (confirmed.length ? confirmed.map((a) => <AsgCard key={a.id} s={s} a={a} open={open} />) : <Empty title="No confirmed shifts" />)}
    {f === "open" && <>
      <div className="crew-sim">Open shifts you can ask about. Requesting does not book you: OSS invites, then you accept. (Workshop assumption to validate.)</div>
      {openShifts.length ? openShifts.map((x) => (
        <div key={x.id} className="crew-card">
          <h3>{venueName(s, x.id)}</h3><div className="oss-small oss-dim" style={{ marginTop: 4 }}>{x.label} · {when(s, x.id)}</div>
          <div style={{ marginTop: 10 }}>{requested(x.id) ? <St tone="info">Requested, waiting for OSS</St> : <Btn block onClick={() => run(requestInvite, x.id, wid)}>Request invitation</Btn>}</div>
        </div>)) : <Empty title="No open shifts that match your roles" />}
    </>}
    {f === "history" && (hist.length ? hist.map((h) => (
      <button key={h.id} className="crew-card" style={{ display: "block", width: "100%", textAlign: "left", font: "inherit", color: "inherit" }} onClick={() => open(h.d)}>
        <div className="oss-row"><b className="grow">{venueName(s, h.shiftId)}</b><S s={h.label} /></div>
        <div className="oss-small oss-dim">{Q.shiftOf(s, h.shiftId).label} · {when(s, h.shiftId)}</div>
      </button>)) : <Empty title="No history yet" />)}
  </>;
}
function requestInvite(d: OssState, shiftId: string, wid: string): E.Result {
  if (d.openShiftRequests.some((r) => r.shiftId === shiftId && r.workerId === wid)) return { ok: true, message: "Already requested." };
  d.openShiftRequests.push({ id: E.nid(d, "REQ"), shiftId, workerId: wid, at: d.clock, status: "requested" });
  E.postMessage(d, { threadId: E.threadFor(d, wid).id, kind: "reply", recipients: ["office"], from: { kind: "worker", id: wid }, body: "I'd like to be considered for " + Q.eventOf(d, Q.shiftOf(d, shiftId).eventId).name + ", " + Q.shiftOf(d, shiftId).label.toLowerCase() + "." });
  E.audit(d, Q.nameOf(d, wid), "shift.requested", { type: "shift", id: shiftId, label: Q.shiftOf(d, shiftId).label }, Q.nameOf(d, wid) + " requested an invitation (not a booking)", "operations");
  return { ok: true, message: "Request sent. You're not booked unless OSS invites you and you accept." };
}

function ShiftDetail({ s, wid, detail, back }: { s: OssState; wid: string; detail: NonNullable<Detail>; back: () => void }) {
  const inv = detail.kind === "inv" ? s.invitations.find((i) => i.id === detail.id) : undefined;
  const asg = detail.kind === "asg" ? s.assignments.find((a) => a.id === detail.id) : inv ? s.assignments.find((a) => a.invitationId === inv.id) : undefined;
  const shiftId = (asg || inv)!.shiftId;
  const sh = Q.shiftOf(s, shiftId), ev = Q.eventOf(s, sh.eventId), v = Q.venueOf(s, ev.venueId);
  const [ppeOk, setPpe] = useState(false);
  const [mode, setMode] = useState<"" | "late" | "cancel" | "clock" | "issue">("");
  const [eta, setEta] = useState(fmtTime(new Date(Math.ceil((ms(s.clock) + 20 * 60000) / 300000) * 300000).toISOString()));
  const [note, setNote] = useState("");
  const [reason, setReason] = useState("");
  const live = asg && asg.status === "confirmed";
  const activeInv = inv && Q.isActiveInvite(s, inv) && !(asg && asg.status === "confirmed");
  const vin = asg && Q.verifiedIn(s, asg.id), vout = asg && Q.verifiedOut(s, asg.id);
  const att = asg ? Q.attendanceState(s, asg.id) : null;
  const near = ms(s.clock) >= ms(sh.start) - 3 * 3600000;
  const kind: "in" | "out" = vin ? "out" : "in";
  const status = activeInv ? "Awaiting reply" : asg ? (asg.status === "cancelled" ? "Cancelled" : asg.status === "withdrawn" ? "Withdrawn" : vout ? "Clocked out" : "Confirmed") : inv ? Q.inviteLabel(s, inv) : "";
  const doClock = (vi: VerifyInput) => { if (!asg) return; run(E.clock, asg.id, { kind, method: vi.method, distanceM: vi.distance, accuracyM: vi.accuracy, denied: vi.denied, offline: vi.offline, token: vi.token }); };
  const hist = s.audit.filter((a) => (asg && a.entity.id === asg.id) || (inv && a.entity.id === inv.id) || (asg && s.clocks.some((c) => c.id === a.entity.id && c.assignmentId === asg.id))).slice(-8).reverse();
  return <>
    <button className="oss-btn ghost sm" style={{ marginTop: 4, paddingLeft: 4 }} onClick={back}><Icon d={I.back} size={16} />Back</button>
    {/* 1 status and time */}
    <div className="crew-card">
      <div className="oss-row"><S s={status} />{asg && asg.status === "confirmed" && asg.shiftVersion < sh.version && <St tone="warn">Times changed</St>}</div>
      {asg && asg.status === "confirmed" && asg.shiftVersion < sh.version && <div style={{ marginTop: 10 }}><Btn kind="primary" block onClick={() => run(E.reconfirm, asg.id)}>Reconfirm the new times</Btn></div>}
      <h3 style={{ marginTop: 10, fontSize: 18 }}>{fmtDateLong(sh.start)}</h3>
      <div style={{ fontSize: 22, fontWeight: 600, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{fmtTime(sh.start)}–{fmtTime(sh.end)}</div>
    </div>
    {/* 2 venue and meeting point */}
    <div className="crew-card">
      <div className="oss-row"><Icon d={I.pin} size={18} /><b className="grow">{v?.name || "Venue to be confirmed"}</b></div>
      <div className="oss-small oss-dim" style={{ marginTop: 6 }}>{v?.area}</div>
      <div className="oss-small" style={{ marginTop: 8 }}>{v?.meetingPoint}</div>
      {v && !v.meetingConfirmed && <div className="oss-tiny" style={{ color: "var(--warn)", marginTop: 4 }}>Meeting point awaiting confirmation. OSS will message you.</div>}
    </div>
    {/* 3 role, PPE, acknowledgement */}
    <div className="crew-card">
      <b>{sh.label}</b><div className="oss-small oss-dim" style={{ marginTop: 2 }}>{ev.name.split(":")[0]} · booked by OSS for a client event</div>
      <div className="crew-h" style={{ marginTop: 12 }}>Bring</div>
      <div className="oss-pills">{sh.ppe.map((p) => <span key={p} className="oss-pill" style={{ fontSize: 13, height: 30 }}>{p}</span>)}</div>
      {sh.requiredDocs.length > 0 && <div className="oss-small oss-dim" style={{ marginTop: 8 }}>Required on file: {sh.requiredDocs.map(docLabel).join(", ")}</div>}
      {activeInv && <label className="oss-check" style={{ marginTop: 12, minHeight: 44 }}><input type="checkbox" checked={ppeOk} onChange={(e) => setPpe(e.target.checked)} />I have read the PPE and instructions</label>}
      <div className="oss-tiny oss-muted" style={{ marginTop: 8 }}>Sample terms: sample rates and conditions are confirmed by OSS outside this demo.</div>
    </div>
    {/* 4 primary action */}
    {activeInv && inv && <div className="crew-sticky">
      <Btn kind="primary" block disabled={!ppeOk || inv.flags.includes("worker-unavailable")} onClick={() => run(E.respond, inv.id, "accept")}>Accept this shift</Btn>
      <Btn block onClick={() => run(E.respond, inv.id, "decline", inv.flags.includes("worker-unavailable") ? "Unavailable" : "")}>Decline</Btn>
    </div>}
    {activeInv && !ppeOk && <div className="oss-tiny oss-muted" style={{ textAlign: "center" }}>Tick the PPE box to accept.</div>}
    {live && asg && !vout && <div className="crew-card">
      <div className="oss-row"><b className="grow">On the day</b><S s={Q.arrivalState(s, asg.id)} /><S s={att!} /></div>
      {!near && <div className="oss-small oss-dim" style={{ marginTop: 8 }}>Arrival and clock actions open three hours before the start.</div>}
      {near && mode === "" && <div className="crew-actions">
        {!vin && <Btn onClick={() => run(E.journey, asg.id, "on_the_way")}>On the way</Btn>}
        {!vin && <Btn onClick={() => setMode("late")}>Running late</Btn>}
        <Btn kind="primary" onClick={() => setMode("clock")}>{vin ? "Clock out" : "Clock in"}</Btn>
        <Btn onClick={() => setMode("issue")}>Report a problem</Btn>
      </div>}
      {mode === "late" && <div style={{ marginTop: 10 }}>
        <label className="oss-label" htmlFor="eta">Expected arrival</label>
        <TimeSelect id="eta" value={eta} onChange={setEta} style={{ marginTop: 6 }} />
        <label className="oss-label" htmlFor="ln" style={{ display: "block", marginTop: 10 }}>Short message</label>
        <input id="ln" className="oss-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Bus diverted, 20 minutes behind" style={{ marginTop: 6 }} />
        <div className="crew-actions"><Btn kind="primary" onClick={() => { run(E.journey, asg.id, "running_late", zoned(dayKey(sh.start), eta), note); setMode(""); }}>Send update</Btn><Btn onClick={() => setMode("")}>Cancel</Btn></div>
        <div className="oss-tiny oss-muted" style={{ marginTop: 6 }}>A running-late update is not a clock-in.</div>
      </div>}
      {mode === "issue" && <div style={{ marginTop: 10 }}>
        <input className="oss-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's wrong?" aria-label="Problem" />
        <div className="crew-actions"><Btn kind="primary" onClick={() => { run(E.journey, asg.id, "issue", undefined, note || "Problem reported"); setMode(""); }}>Tell OSS</Btn><Btn onClick={() => setMode("")}>Cancel</Btn></div>
      </div>}
      {mode === "clock" && <div style={{ marginTop: 10 }}>
        <VerifyControls s={s} venueId={ev.venueId!} shift={sh} kind={kind} onSubmit={(vi) => doClock(vi)} onCancel={() => setMode("")} />
        {asg && s.clocks.some((c) => c.assignmentId === asg.id && c.result === "awaiting_sync") && <Btn block onClick={() => run(E.syncOffline, asg.id, 30, 15)}>Back online: sync now</Btn>}
      </div>}
    </div>}
    {vout && asg && <PersonalHours s={s} asgId={asg.id} />}
    {/* 5 contact, cancel, history */}
    <div className="crew-card">
      <div className="crew-actions">
        <Btn icon={I.msg} onClick={() => run(E.workerReply, wid, "Question about " + ev.name + ", " + sh.label.toLowerCase() + ".")}>Contact OSS</Btn>
        {live && !vin && ms(s.clock) < ms(sh.start) && <Btn kind="danger" onClick={() => setMode("cancel")}>Cancel shift</Btn>}
      </div>
      {mode === "cancel" && asg && <div style={{ marginTop: 12 }}>
        <div className="oss-note warn" style={{ fontSize: 13 }}>Cancelling releases your place on {sh.label.toLowerCase()}. OSS will look for a replacement. Your history keeps this record.</div>
        <label className="oss-label" htmlFor="cr" style={{ display: "block", marginTop: 10 }}>Reason (required)</label>
        <input id="cr" className="oss-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family commitment" style={{ marginTop: 6 }} />
        <div className="crew-actions"><Btn kind="danger" disabled={!reason.trim()} onClick={() => { run(E.cancelAssignment, asg.id, reason, true); setMode(""); }}>Confirm cancellation</Btn><Btn onClick={() => setMode("")}>Keep shift</Btn></div>
      </div>}
      {hist.length > 0 && <><div className="crew-h">History</div>{hist.map((h) => <div key={h.id} className="oss-small" style={{ padding: "5px 0", borderTop: "1px solid var(--border)" }}><span className="oss-muted">{fmtDate(h.at)} {fmtTime(h.at)}</span> · {h.summary}</div>)}</>}
    </div>
  </>;
}

function PersonalHours({ s, asgId }: { s: OssState; asgId: string }) {
  const l = Q.lineFor(s, Q.asgOf(s, asgId));
  if (!l) return null;
  return (
    <div className="crew-card">
      <div className="oss-row"><b className="grow">Your hours</b>{l.status === "approved" || l.status === "exported" ? <S s="Approved" /> : l.status === "incomplete" ? <S s="Incomplete" /> : <S s="Needs review" />}</div>
      <div className="oss-small" style={{ marginTop: 8, lineHeight: 1.7 }}>
        Worked {l.complete ? fmtHM(l.workedMin) : "pending"}<br />
        {l.topupMin ? <>Minimum top-up {fmtHM(l.topupMin)}<br /></> : null}
        Payable {l.complete ? fmtHM(l.payableMin) : "pending"}
      </div>
      {l.correctionNote && <div className="oss-tiny oss-muted">{l.correctionNote}</div>}
      <div className="oss-tiny oss-muted" style={{ marginTop: 6 }}>Hours only. Pay, tax and payslips are handled outside this app.</div>
    </div>
  );
}

function Schedule({ s, wid, open }: { s: OssState; wid: string; open: (d: Detail) => void }) {
  const [sel, setSel] = useState(dayKey(s.clock) < "2026-11-14" ? "2026-11-14" : dayKey(s.clock));
  const [from, setFrom] = useState("07:00"), [to, setTo] = useState("14:00");
  const [restOff, setRestOff] = useState(true);
  const [hol, setHol] = useState({ a: "2026-11-20", b: "2026-11-22" });
  const days = useMemo(() => { const first = "2026-11-01"; const lead = weekday(zoned(first, "12:00")); return { lead, n: 30 }; }, []);
  const mine = s.assignments.filter((a) => a.workerId === wid);
  const myInv = s.invitations.filter((i) => i.workerId === wid);
  const dayItems = (k: string) => ({
    asg: mine.filter((a) => dayKey(Q.shiftOf(s, a.shiftId).start) === k),
    inv: myInv.filter((i) => dayKey(Q.shiftOf(s, i.shiftId).start) === k && i.status !== "accepted")
  });
  const di = dayItems(sel);
  const ex = s.availExceptions.filter((x) => x.workerId === wid && (dayKey(x.start) === sel || (x.start < zoned(sel, "00:00") && x.end > zoned(sel, "00:00"))));
  const rules = s.availRules.filter((r) => r.workerId === wid);
  const save = () => {
    const add: any[] = [{ start: zoned(sel, from), end: zoned(sel, to), kind: "available", note: fmtDate(zoned(sel, "12:00")) + " " + from + " to " + to }];
    if (restOff) add.push({ start: zoned(sel, to), end: zoned(addDays(sel, 1), "00:00"), kind: "unavailable", note: fmtDate(zoned(sel, "12:00")) + " from " + to });
    run(E.setAvailability, wid, add, ex.filter((x) => !/^Confirmed availability/.test(x.note || "")).map((x) => x.id));
  };
  return <>
    <div className="crew-h">November 2026</div>
    <div className="crew-day" role="grid" aria-label="November 2026">
      {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} className="oss-tiny oss-muted" style={{ paddingBottom: 4 }}>{d}</div>)}
      {Array.from({ length: days.lead }).map((_, i) => <span key={"l" + i} />)}
      {Array.from({ length: days.n }).map((_, i) => {
        const k = "2026-11-" + String(i + 1).padStart(2, "0");
        const it = dayItems(k);
        const has = it.asg.some((a) => a.status === "confirmed");
        const dec = it.inv.length > 0 || it.asg.some((a) => a.status !== "confirmed");
        return <button key={k} className={[has && "has", dec && !has && "dec", sel === k && "sel"].filter(Boolean).join(" ")} onClick={() => setSel(k)} aria-label={fmtDate(zoned(k, "12:00")) + (has ? ", shift booked" : "")}>{i + 1}{has && <i />}</button>;
      })}
    </div>
    <div className="crew-h">{fmtDateLong(zoned(sel, "12:00"))}</div>
    {di.asg.map((a) => <button key={a.id} className="crew-card" style={{ display: "block", width: "100%", textAlign: "left", font: "inherit", color: "inherit" }} onClick={() => open({ kind: "asg", id: a.id })}>
      <div className="oss-row"><b className="grow">{Q.shiftOf(s, a.shiftId).label}</b><S s={a.status === "confirmed" ? "Accepted" : a.status === "cancelled" ? "Cancelled" : "Withdrawn"} /></div>
      <div className="oss-small oss-dim">{venueName(s, a.shiftId)} · {fmtTime(Q.shiftOf(s, a.shiftId).start)}–{fmtTime(Q.shiftOf(s, a.shiftId).end)}</div></button>)}
    {di.inv.map((i) => <button key={i.id} className="crew-card" style={{ display: "block", width: "100%", textAlign: "left", font: "inherit", color: "inherit", borderStyle: "dashed" }} onClick={() => open({ kind: "inv", id: i.id })}>
      <div className="oss-row"><b className="grow">{Q.shiftOf(s, i.shiftId).label}</b><S s={Q.inviteLabel(s, i)} /></div>
      <div className="oss-small oss-dim">{venueName(s, i.shiftId)} · {fmtTime(Q.shiftOf(s, i.shiftId).start)}–{fmtTime(Q.shiftOf(s, i.shiftId).end)}</div></button>)}
    {!di.asg.length && !di.inv.length && <div className="oss-small oss-muted" style={{ marginTop: 6 }}>No shifts this day.</div>}

    <div className="crew-card">
      <b>My availability this day</b>
      <div style={{ marginTop: 8 }}>{ex.length ? ex.map((x) => <div key={x.id} className="oss-row oss-small" style={{ padding: "4px 0" }}><St tone={x.kind === "available" ? "ok" : "bad"}>{x.kind === "available" ? "Available" : "Unavailable"}</St><span>{fmtTime(x.start)} to {dayKey(x.end) !== sel ? "midnight" : fmtTime(x.end)}</span></div>)
        : <div className="oss-small oss-muted">{rules.some((r) => r.weekday === weekday(zoned(sel, "12:00"))) ? "Using your recurring availability." : "Not set. OSS treats this as unknown."}</div>}</div>
      <div className="crew-actions" style={{ marginTop: 10 }}>
        <div><label className="oss-label" htmlFor="af">Available from</label><TimeSelect id="af" value={from} onChange={setFrom} style={{ marginTop: 4 }} /></div>
        <div><label className="oss-label" htmlFor="at">until</label><TimeSelect id="at" value={to} onChange={setTo} style={{ marginTop: 4 }} /></div>
      </div>
      <label className="oss-check" style={{ marginTop: 10, minHeight: 44 }}><input type="checkbox" checked={restOff} onChange={(e) => setRestOff(e.target.checked)} />Unavailable for the rest of the day</label>
      <div className="crew-actions">
        <Btn kind="primary" onClick={save}>Save this day</Btn>
        <Btn onClick={() => run(E.setAvailability, wid, [{ start: zoned(sel, "00:00"), end: zoned(addDays(sel, 1), "00:00"), kind: "unavailable", note: "Unavailable all day" }], ex.filter((x) => !/^Confirmed availability/.test(x.note || "")).map((x) => x.id))}>Unavailable all day</Btn>
      </div>
      <div className="oss-tiny oss-muted" style={{ marginTop: 8 }}>Saving never cancels a shift you've accepted. Use Cancel shift for that.</div>
    </div>
    <div className="crew-card">
      <b>Recurring</b>
      <div className="oss-pills" style={{ marginTop: 8 }}>{rules.length ? rules.map((r) => <span key={r.id} className="oss-pill" style={{ height: 32 }}>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][r.weekday]} {r.start}–{r.end}
        <button className="oss-link" style={{ marginLeft: 6 }} aria-label="Remove" onClick={() => run(E.setAvailability, wid, [], [], { remove: [r.id] })}><Icon d={I.x} size={11} /></button></span>) : <span className="oss-small oss-muted">None</span>}</div>
      <div style={{ marginTop: 10 }}><Btn size="sm" onClick={() => run(E.setAvailability, wid, [], [], { add: [{ weekday: weekday(zoned(sel, "12:00")), start: from, end: to }] })}>Repeat {from}–{to} every {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][weekday(zoned(sel, "12:00"))]}</Btn></div>
    </div>
    <div className="crew-card">
      <b>Holiday</b>
      <div className="crew-actions">
        <div><label className="oss-label" htmlFor="ha">From</label><input id="ha" className="oss-input" type="date" value={hol.a} onChange={(e) => setHol({ ...hol, a: e.target.value })} style={{ marginTop: 4 }} /></div>
        <div><label className="oss-label" htmlFor="hb">To</label><input id="hb" className="oss-input" type="date" value={hol.b} onChange={(e) => setHol({ ...hol, b: e.target.value })} style={{ marginTop: 4 }} /></div>
      </div>
      <div style={{ marginTop: 10 }}><Btn size="sm" disabled={hol.b < hol.a} onClick={() => run(E.setAvailability, wid, [{ start: zoned(hol.a, "00:00"), end: zoned(addDays(hol.b, 1), "00:00"), kind: "holiday", note: "Holiday " + hol.a.slice(5) + " to " + hol.b.slice(5) }])}>Add holiday</Btn></div>
    </div>
  </>;
}

function Inbox({ s, wid }: { s: OssState; wid: string }) {
  const msgs = s.messages.filter((m) => m.receipts[wid] || (m.from.kind === "worker" && m.from.id === wid)).sort((a, b) => b.at.localeCompare(a.at));
  const [reply, setReply] = useState("");
  useEffect(() => {
    const ids = msgs.filter((m) => m.receipts[wid] && !m.receipts[wid].read).map((m) => m.id);
    if (ids.length) { const t = setTimeout(() => run(E.markRead, wid, ids), 900); return () => clearTimeout(t); }
  }, [msgs.length]);
  return <>
    <div className="crew-h">Messages from OSS</div>
    {msgs.map((m) => {
      const mine = m.from.kind === "worker";
      const r = m.receipts[wid];
      const ackable = !mine && (m.kind === "event" || m.kind === "bulk" || m.kind === "reminder" || m.kind === "direct");
      return (
        <div key={m.id} className={"crew-msg" + (mine ? " me" : "")}>
          <div className="oss-tiny oss-muted">{mine ? "You" : m.from.kind === "system" ? "OSS reminder" : Q.nameOf(s, m.from.id) + " · OSS"} · {fmtDate(m.at)} {fmtTime(m.at)}{m.kind === "invitation" ? " · shift offer" : ""}</div>
          <div style={{ marginTop: 3 }}>{m.body}</div>
          {ackable && <div style={{ marginTop: 8 }}>{r?.ack ? <St tone="ok">Acknowledged {fmtTime(r.ack)}</St> : <Btn size="sm" onClick={() => run(E.acknowledge, wid, m.id)}>Acknowledge</Btn>}</div>}
          {m.kind === "invitation" && <div className="oss-tiny oss-muted" style={{ marginTop: 6 }}>Answer offers in Shifts. A reply here is not an acceptance.</div>}
        </div>
      );
    })}
    {!msgs.length && <Empty title="No messages yet" />}
    <div className="crew-sticky" style={{ flexDirection: "column" }}>
      <div style={{ display: "flex", gap: 8 }}>
        <input className="oss-input" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Message OSS" aria-label="Message OSS" />
        <Btn kind="primary" icon={I.send} disabled={!reply.trim()} onClick={() => { run(E.workerReply, wid, reply); setReply(""); }}>Send</Btn>
      </div>
      <div className="oss-tiny oss-muted">Replying is not the same as accepting a shift. In-app only; nothing is sent by SMS or email.</div>
    </div>
  </>;
}

function Profile({ s, wid }: { s: OssState; wid: string }) {
  const w = Q.worker(s, wid);
  const docs = s.documents.filter((d) => d.workerId === wid);
  const ls = Q.lines(s, { workerId: wid });
  const [type, setType] = useState<"MH" | "SP" | "HACCP" | "FA">("MH");
  const [exp, setExp] = useState("2029-11-30");
  const done = ls.filter((l) => l.complete);
  return <>
    <div className="crew-card">
      <b>{w.name}</b>
      <div className="oss-small oss-dim" style={{ marginTop: 6, lineHeight: 1.7 }}>{w.email}<br />{w.mobile}<br />{w.locality} · {w.roles.join(", ")}</div>
      <div className="oss-tiny oss-muted" style={{ marginTop: 6 }}>Sample profile with fictional details.</div>
    </div>
    <div className="crew-h">Documents</div>
    {docs.map((d) => { const st = Q.docStatusToday(s, d); return (
      <div key={d.id} className="crew-card" style={{ marginTop: 8 }}>
        <div className="oss-row"><b className="grow">{docLabel(d.type)}</b><S s={st === "valid" ? "Valid" : st === "expiring" ? "Expiring" : st === "expired" ? "Expired doc" : st === "pending" ? "Pending review" : "Rejected"} /></div>
        <div className="oss-small oss-dim">Expires {d.expires}{d.review === "pending" ? " · uploaded, awaiting review" : ""}</div>
      </div>); })}
    <div className="crew-card">
      <b>Upload a renewal (sample)</b>
      <div className="crew-actions">
        <select className="oss-input" value={type} onChange={(e) => setType(e.target.value as any)} aria-label="Document type"><option value="MH">Manual Handling</option><option value="SP">Safe Pass</option><option value="HACCP">Food Safety Level 1</option><option value="FA">First Aid Responder</option></select>
        <input className="oss-input" type="date" value={exp} onChange={(e) => setExp(e.target.value)} aria-label="Expiry date" />
      </div>
      <div style={{ marginTop: 10 }}><Btn block icon={I.upload} onClick={() => run(E.uploadDocument, wid, type, exp, w.name)}>Attach labelled sample file</Btn></div>
      <div className="oss-tiny oss-muted" style={{ marginTop: 6 }}>Demo only: creates a synthetic placeholder. Do not upload real identity documents.</div>
    </div>
    <div className="crew-h">My hours</div>
    <div className="crew-card">
      {done.length ? <>
        {done.map((l) => <div key={l.id} className="oss-row oss-small" style={{ padding: "6px 0", borderTop: "1px solid var(--border)" }}><span className="grow">{fmtDate(l.shift.start)} · {l.event.name.split(":")[0]}</span><span className="oss-tab">{fmtHM(l.workedMin)} worked{l.topupMin ? " + " + fmtHM(l.topupMin) : ""}</span><LineSt l={l} /></div>)}
        <div className="oss-row" style={{ marginTop: 8 }}><b className="grow">Payable total</b><b className="oss-tab">{fmtHM(done.reduce((t, l) => t + l.payableMin, 0))}</b></div>
      </> : <div className="oss-small oss-muted">No recorded hours in this sample yet.</div>}
      <div className="oss-tiny oss-muted" style={{ marginTop: 8 }}>Worked, approved and payable time only. No pay amounts, payslips or payment status are shown.</div>
    </div>
    <div className="crew-h">Previous work</div>
    <div className="crew-card"><div className="oss-small oss-dim">{w.priorShifts} shifts before this sample · {w.priorVenues.join(", ") || "no venues yet"}</div></div>
  </>;
}
const LineSt = ({ l }: { l: Q.Line }) => <S s={l.status === "approved" || l.status === "exported" ? "Approved" : l.status === "incomplete" ? "Incomplete" : "Needs review"} />;
