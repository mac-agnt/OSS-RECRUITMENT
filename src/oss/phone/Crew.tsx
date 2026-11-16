/* OSS Crew: the employee app. Availability, shift offers answered one shift at
   a time, a monthly schedule, messages from OSS, arrival status, clock in and
   out at the venue, documents and hours worked. Same records as the office. */

import { useEffect, useState } from "react";
import type { Assignment, Invitation, OssState } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { docLabel } from "../seed";
import { run, useOss } from "../store";
import { addDays, dayKey, fmtDate, fmtDateLong, fmtHM, fmtTime, minutesBetween, ms, weekday, zoned } from "../time";
import { Av, Btn, I, Icon, ppeIcon, St, TimeSelect } from "../ui/kit";
import { VerifyControls, type VerifyInput } from "./Verify";

type Tab = "home" | "shifts" | "schedule" | "inbox" | "me";
type Detail = { kind: "inv"; id: string } | { kind: "asg"; id: string } | null;

export const CREW_PERSONAS = [
  ["W009", "Aidan Murphy", "availability and split answers"],
  ["W028", "Sean McKenna", "outstanding invitation"],
  ["W029", "Adam O'Neill", "fills a gap"],
  ["W014", "Chloé Ryan", "cancellation"],
  ["W031", "Orla Kavanagh", "replacement"],
  ["W021", "Owen Clarke", "arrival and check-in"],
  ["W025", "Niamh Walsh", "corrected hours"]
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
  return (
    <div className="crew">
      <div className="crew-head">
        <span className="brand"><img src="/brand/oss-logo.png" alt="" />Crew</span>
        <span className="grow" />
        <button className="crew-bell" aria-label={unread + " unread messages"} onClick={() => { setDetail(null); setTab("inbox"); }}><Icon d={I.bell} size={18} />{unread > 0 && <b />}</button>
        <Av name={w.name} />
      </div>
      <div className="crew-body">
        {detail ? <ShiftDetail s={s} wid={wid} detail={detail} back={() => setDetail(null)} />
          : tab === "home" ? <Home s={s} wid={wid} invs={invs} open={setDetail} go={setTab} />
          : tab === "shifts" ? <Shifts s={s} wid={wid} open={setDetail} />
          : tab === "schedule" ? <Schedule s={s} wid={wid} open={setDetail} />
          : tab === "inbox" ? <Inbox s={s} wid={wid} />
          : <Me s={s} wid={wid} />}
      </div>
      <nav className="crew-nav" aria-label="OSS Crew">
        {([["home", "Home", I.home, invs.length], ["shifts", "Shifts", I.list, 0], ["schedule", "Calendar", I.cal, 0], ["inbox", "Messages", I.msg, unread], ["me", "Me", I.user, 0]] as const).map(([id, label, icon, badge]) => (
          <button key={id} className={"crew-tab" + (tab === id && !detail ? " on" : "")} onClick={() => { setDetail(null); setTab(id as Tab); }} aria-current={tab === id ? "page" : undefined}>
            <Icon d={icon} size={21} />{label}{badge ? <span className="badge">{badge}</span> : null}
          </button>))}
      </nav>
    </div>
  );
}

const venueName = (s: OssState, shiftId: string) => { const e = Q.eventOf(s, Q.shiftOf(s, shiftId).eventId); return Q.venueOf(s, e.venueId)?.name || e.name.split(":")[0]; };
const when = (s: OssState, shiftId: string) => { const x = Q.shiftOf(s, shiftId); return fmtDate(x.start) + " · " + fmtTime(x.start) + "-" + fmtTime(x.end); };
const Ppe = ({ items }: { items: string[] }) => <div className="crew-ppe">{items.map((p) => <span key={p}><Icon d={ppeIcon(p)} size={14} />{p}</span>)}</div>;
const card = { display: "block", width: "100%", textAlign: "left" as const, font: "inherit", color: "inherit", cursor: "pointer", border: 0 };

function nextAsg(s: OssState, wid: string): Assignment | undefined {
  return s.assignments.filter((a) => a.workerId === wid && a.status === "confirmed" && !Q.verifiedOut(s, a.id) && ms(Q.shiftOf(s, a.shiftId).end) + 6 * 3600000 > ms(s.clock))
    .sort((a, b) => Q.shiftOf(s, a.shiftId).start.localeCompare(Q.shiftOf(s, b.shiftId).start))[0];
}

/* ── home ────────────────────────────────────────────────────────────────── */
function Home({ s, wid, invs, open, go }: { s: OssState; wid: string; invs: Invitation[]; open: (d: Detail) => void; go: (t: Tab) => void }) {
  const w = Q.worker(s, wid);
  const a = nextAsg(s, wid);
  const h = Number(fmtTime(s.clock).slice(0, 2));
  const greet = h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
  const reminder = a && Q.verifiedIn(s, a.id) ? undefined : s.messages.filter((m) => m.receipts[wid] && m.kind === "reminder" && !m.receipts[wid].ack).pop();
  const urgent = s.messages.filter((m) => m.receipts[wid] && !m.receipts[wid].read && (m.audience || "").startsWith("Urgent")).pop();
  const done = Q.lines(s, { workerId: wid }).filter((l) => l.complete);
  const sub = invs.length ? invs.length + " shift offer" + (invs.length > 1 ? "s" : "") + " waiting for you." : a ? "You're on " + fmtDate(Q.shiftOf(s, a.shiftId).start) + " at " + venueName(s, a.shiftId) + "." : !Q.hasSubmittedAvailability(s, wid) ? "Add your availability to start getting offers." : "No shifts booked right now.";
  return <>
    <div className="crew-hello"><h1>{greet}, {w.name.split(" ")[0]}</h1><p>{sub}</p></div>
    {urgent && <button className="crew-banner" style={{ ...card, display: "flex" }} onClick={() => go("inbox")}><Icon d={I.bolt} size={16} /><span><b>Urgent from OSS</b><br />{urgent.body.replace(/^URGENT:\s*/, "")}</span></button>}
    {reminder && <div className="crew-banner info"><Icon d={I.bell} size={16} /><span style={{ flex: 1 }}><b>{reminder.from.id === "AU2" ? "Still good for tomorrow?" : "Reminder"}</b><br />{reminder.body}
      <span style={{ display: "flex", gap: 8, marginTop: 10 }}><Btn size="sm" kind="primary" onClick={() => run(E.acknowledge, wid, reminder.id)}>{reminder.from.id === "AU2" ? "Yes, I'll be there" : "Got it"}</Btn>{reminder.from.id === "AU2" && <Btn size="sm" onClick={() => { const x = nextAsg(s, wid); if (x) open({ kind: "asg", id: x.id }); }}>Can't make it</Btn>}</span></span></div>}
    {a && <NextShift s={s} a={a} open={open} />}
    {invs.length > 0 && <><div className="crew-h">Offers for you <span className="n">{invs.length}</span></div>{invs.map((i) => <Offer key={i.id} s={s} inv={i} open={open} />)}</>}
    <div className="crew-h">Your availability</div>
    <button className="crew-card" style={card} onClick={() => go("schedule")}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="oss-ricon info"><Icon d={I.cal} size={17} /></span>
        <span style={{ flex: 1 }}><b style={{ display: "block", fontSize: 14.5 }}>{Q.hasSubmittedAvailability(s, wid) ? "Up to date" : "Not set yet"}</b><span style={{ fontSize: 12.5, color: "var(--dim)" }}>{Q.hasSubmittedAvailability(s, wid) ? "Tap to change days, times or holidays" : "OSS can only offer work once you add it"}</span></span>
        <Icon d={I.chevron} size={16} />
      </div>
    </button>
    <div className="crew-h">At a glance</div>
    <div className="crew-kv" style={{ marginTop: 10 }}>
      <div><div className="k">Shifts booked</div><div className="v">{s.assignments.filter((x) => x.workerId === wid && x.status === "confirmed" && ms(Q.shiftOf(s, x.shiftId).end) > ms(s.clock)).length}</div></div>
      <div><div className="k">Hours this week</div><div className="v">{fmtHM(done.reduce((t, l) => t + l.payableMin, 0))}</div></div>
    </div>
  </>;
}

function NextShift({ s, a, open }: { s: OssState; a: Assignment; open: (d: Detail) => void }) {
  const sh = Q.shiftOf(s, a.shiftId);
  const mins = minutesBetween(s.clock, sh.start);
  const vin = Q.verifiedIn(s, a.id);
  const lab = vin ? "On shift since " + fmtTime(vin.at) : mins <= 0 ? "Started " + fmtTime(sh.start) : mins < 24 * 60 ? "Starts in " + (mins < 60 ? mins + " min" : fmtHM(mins)) : "Next shift";
  return (
    <button className="crew-next" onClick={() => open({ kind: "asg", id: a.id })}>
      <div className="k">{lab}</div>
      <h2>{venueName(s, sh.id)}</h2>
      <div className="w">{sh.label} · {fmtDate(sh.start)}, {fmtTime(sh.start)}-{fmtTime(sh.end)}</div>
      <div className="row">
        <span className="chip"><Icon d={I.pin} size={13} />{Q.venueOf(s, Q.eventOf(s, sh.eventId).venueId)?.area.split(",")[0]}</span>
        {a.shiftVersion < sh.version ? <span className="chip" style={{ background: "#F6881F" }}>New times, reconfirm</span> : <span className="chip"><Icon d={I.check} size={13} />Confirmed</span>}
        {Q.arrivalState(s, a.id) !== "Not reported" && !vin && <span className="chip">{Q.arrivalState(s, a.id)}</span>}
      </div>
    </button>
  );
}

function Offer({ s, inv, open }: { s: OssState; inv: Invitation; open: (d: Detail) => void }) {
  const sh = Q.shiftOf(s, inv.shiftId);
  const unavailable = inv.flags.includes("worker-unavailable");
  return (
    <div className="crew-card">
      <button style={{ ...card, background: "none", padding: 0 }} onClick={() => open({ kind: "inv", id: inv.id })}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><h3 style={{ flex: 1 }}>{venueName(s, sh.id)}</h3>{inv.kind === "replacement" ? <span className="oss-st urgent">Cover needed</span> : <St tone="info">{sh.label}</St>}</div>
        <div className="sub">{inv.kind === "replacement" ? sh.label + " · " : ""}{fmtDateLong(sh.start).replace(" 2026", "")} · {fmtTime(sh.start)}-{fmtTime(sh.end)}</div>
        <Ppe items={sh.ppe} />
      </button>
      {unavailable && <div className="crew-banner" style={{ marginTop: 10 }}><Icon d={I.alert} size={15} />You said you're not free then.</div>}
      <div className="crew-actions">
        <Btn kind="primary" onClick={() => run(E.respond, inv.id, "accept")} disabled={unavailable}>Accept</Btn>
        <Btn onClick={() => run(E.respond, inv.id, "decline", unavailable ? "Unavailable" : "")}>Decline</Btn>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--faint)", marginTop: 10, textAlign: "center" }}>Just this shift · offer open until {fmtDate(inv.expiresAt)} {fmtTime(inv.expiresAt)}</div>
    </div>
  );
}

/* ── shifts ──────────────────────────────────────────────────────────────── */
function Shifts({ s, wid, open }: { s: OssState; wid: string; open: (d: Detail) => void }) {
  const [f, setF] = useState<"offered" | "booked" | "open" | "past">("offered");
  const offered = s.invitations.filter((i) => i.workerId === wid && Q.isActiveInvite(s, i));
  const booked = s.assignments.filter((a) => a.workerId === wid && a.status === "confirmed" && !Q.verifiedOut(s, a.id) && ms(Q.shiftOf(s, a.shiftId).end) + 6 * 3600000 > ms(s.clock));
  const w = Q.worker(s, wid);
  const openShifts = Q.windowEvents(s).flatMap((e) => Q.shiftsOfEvent(s, e.id)).filter((x) => ms(x.start) > ms(s.clock) && Q.shiftCoverage(s, x.id).notInvited > 0 && w.roles.some((r) => x.roles.includes(r))
    && !s.assignments.some((a) => a.shiftId === x.id && a.workerId === wid && a.status === "confirmed") && !s.invitations.some((i) => i.shiftId === x.id && i.workerId === wid && Q.isActiveInvite(s, i)));
  const past = [
    ...s.assignments.filter((a) => a.workerId === wid && (a.status !== "confirmed" || Q.verifiedOut(s, a.id) || ms(Q.shiftOf(s, a.shiftId).end) + 6 * 3600000 <= ms(s.clock))).map((a) => ({ id: a.id, at: Q.shiftOf(s, a.shiftId).start, shiftId: a.shiftId, label: a.status === "cancelled" ? "Cancelled" : a.status === "withdrawn" ? "Withdrawn" : "Worked", d: { kind: "asg", id: a.id } as Detail, line: Q.lineFor(s, a) })),
    ...s.invitations.filter((i) => i.workerId === wid && i.status === "declined").map((i) => ({ id: i.id, at: Q.shiftOf(s, i.shiftId).start, shiftId: i.shiftId, label: "Declined", d: { kind: "inv", id: i.id } as Detail, line: null }))
  ].sort((a, b) => b.at.localeCompare(a.at));
  const requested = (sid: string) => s.openShiftRequests.some((r) => r.shiftId === sid && r.workerId === wid);
  return <>
    <div className="crew-hello"><h1>Shifts</h1></div>
    <div className="oss-seg">
      {([["offered", "Offers", offered.length], ["booked", "Booked", booked.length], ["open", "Open", openShifts.length], ["past", "Past", past.length]] as const).map(([id, l, n]) => (
        <button key={id} className={f === id ? "on" : ""} onClick={() => setF(id)}>{l}{n ? <span className="n">{n}</span> : null}</button>))}
    </div>
    {f === "offered" && (offered.length ? offered.map((i) => <Offer key={i.id} s={s} inv={i} open={open} />) : <Empty text="No offers right now. Keep your availability up to date." />)}
    {f === "booked" && (booked.length ? booked.map((a) => <NextShift key={a.id} s={s} a={a} open={open} />).map((x, i) => <div key={i} style={{ marginTop: 12 }}>{x}</div>) : <Empty text="Nothing booked yet." />)}
    {f === "open" && <>
      <div className="crew-banner info"><Icon d={I.info} size={15} />Shifts that still need people. Tap interested and OSS will send you an offer if it fits.</div>
      {openShifts.length ? openShifts.map((x) => (
        <div key={x.id} className="crew-card">
          <h3>{venueName(s, x.id)}</h3><div className="sub">{x.label} · {when(s, x.id)}</div>
          <div style={{ marginTop: 12 }}>{requested(x.id) ? <St tone="info">Interest sent</St> : <Btn block onClick={() => run(requestInvite, x.id, wid)}>I'm interested</Btn>}</div>
        </div>)) : <Empty text="No open shifts for your roles." />}
    </>}
    {f === "past" && <div className="crew-card">{past.length ? past.map((h) => (
      <button key={h.id} className="crew-li" style={{ ...card, display: "flex", background: "none" }} onClick={() => open(h.d)}>
        <span className="grow"><b>{venueName(s, h.shiftId)}</b><span>{Q.shiftOf(s, h.shiftId).label} · {fmtDate(h.at)}</span></span>
        {h.line?.complete ? <b className="oss-tab" style={{ fontSize: 14 }}>{fmtHM(h.line.payableMin)}</b> : <St tone={h.label === "Cancelled" ? "bad" : "neutral"}>{h.label}</St>}
      </button>)) : <div className="sub">Your past shifts and hours will show here.</div>}</div>}
  </>;
}
const Empty = ({ text }: { text: string }) => <div className="crew-card" style={{ textAlign: "center", color: "var(--dim)", fontSize: 13.5, padding: 22 }}>{text}</div>;
function requestInvite(d: OssState, shiftId: string, wid: string): E.Result {
  if (d.openShiftRequests.some((r) => r.shiftId === shiftId && r.workerId === wid)) return { ok: true, message: "Already sent." };
  d.openShiftRequests.push({ id: E.nid(d, "REQ"), shiftId, workerId: wid, at: d.clock, status: "requested" });
  E.postMessage(d, { threadId: E.threadFor(d, wid).id, kind: "reply", recipients: ["office"], from: { kind: "worker", id: wid }, body: "I'm interested in " + Q.eventOf(d, Q.shiftOf(d, shiftId).eventId).name + ", " + Q.shiftOf(d, shiftId).label.toLowerCase() + "." });
  E.audit(d, Q.nameOf(d, wid), "shift.requested", { type: "shift", id: shiftId, label: Q.shiftOf(d, shiftId).label }, Q.nameOf(d, wid) + " asked to be considered for " + Q.shiftOf(d, shiftId).label.toLowerCase(), "operations");
  return { ok: true, message: "Sent to OSS. You'll get an offer if it fits." };
}

/* ── shift detail ────────────────────────────────────────────────────────── */
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
  const near = ms(s.clock) >= ms(sh.start) - 3 * 3600000;
  const kind: "in" | "out" = vin ? "out" : "in";
  const status = activeInv ? "Waiting for your answer" : asg ? (asg.status === "cancelled" ? "Cancelled" : asg.status === "withdrawn" ? "Withdrawn" : vout ? "Done" : vin ? "On shift" : "Confirmed") : inv ? Q.inviteLabel(s, inv) : "";
  const doClock = (vi: VerifyInput) => { if (!asg) return; const r = run(E.clock, asg.id, { kind, method: vi.method, distanceM: vi.distance, accuracyM: vi.accuracy, denied: vi.denied, offline: vi.offline, token: vi.token }); if (r.ok) setMode(""); };
  const arr = asg ? Q.arrivalState(s, asg.id) : "Not reported";
  return <>
    <button className="oss-btn ghost sm" style={{ margin: "0 0 4px -8px", minHeight: 36 }} onClick={back}><Icon d={I.back} size={16} />Back</button>
    <div className="crew-next" style={{ cursor: "default" }}>
      <div className="k">{status}</div>
      <h2>{v?.name || "Venue to be confirmed"}</h2>
      <div className="w">{fmtDateLong(sh.start).replace(" 2026", "")}</div>
      <div style={{ position: "relative", fontSize: 30, fontWeight: 600, letterSpacing: "-1px", marginTop: 6, fontVariantNumeric: "tabular-nums" }}>{fmtTime(sh.start)}-{fmtTime(sh.end)}</div>
      <div className="row"><span className="chip">{sh.label}</span><span className="chip">{fmtHM(minutesBetween(sh.start, sh.end))}</span></div>
    </div>
    {asg && asg.status === "confirmed" && asg.shiftVersion < sh.version && <div className="crew-banner"><Icon d={I.alert} size={15} /><span style={{ flex: 1 }}>The times changed. Please check and reconfirm.<span style={{ display: "block", marginTop: 8 }}><Btn size="sm" kind="primary" onClick={() => run(E.reconfirm, asg.id)}>Reconfirm new times</Btn></span></span></div>}

    {activeInv && inv && <div className="crew-card">
      <h3>Can you do it?</h3>
      <div className="sub">Your answer is for this shift only.</div>
      <label className="oss-check" style={{ marginTop: 12, minHeight: 40, fontSize: 13.5 }}><input type="checkbox" checked={ppeOk} onChange={(e) => setPpe(e.target.checked)} />I'll bring the PPE below and I've read the instructions</label>
      <div className="crew-actions">
        <Btn kind="primary" disabled={!ppeOk || inv.flags.includes("worker-unavailable")} onClick={() => run(E.respond, inv.id, "accept")}>Accept</Btn>
        <Btn onClick={() => run(E.respond, inv.id, "decline", inv.flags.includes("worker-unavailable") ? "Unavailable" : "")}>Decline</Btn>
      </div>
    </div>}

    {live && asg && !vout && <div className="crew-card">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><h3 style={{ flex: 1 }}>On the day</h3>{arr !== "Not reported" && !vin && <St tone={arr === "Running late" ? "warn" : "info"}>{arr}</St>}{vin && <St tone="ok">Clocked in {fmtTime(vin.at)}</St>}</div>
      {!near && <div className="sub" style={{ marginTop: 6 }}>Check-in opens three hours before the start.</div>}
      {near && mode === "" && <>
        <div className="crew-actions">
          {!vin && <Btn onClick={() => run(E.journey, asg.id, "on_the_way")}><Icon d={I.route} size={16} />On my way</Btn>}
          {!vin && <Btn onClick={() => setMode("late")}><Icon d={I.clock} size={16} />Running late</Btn>}
        </div>
        <div className="crew-actions one" style={{ marginTop: 8 }}><Btn kind="primary" onClick={() => setMode("clock")}><Icon d={vin ? I.check : I.qr} size={17} />{vin ? "Clock out" : "Clock in"}</Btn></div>
        <button className="oss-link" style={{ display: "block", margin: "12px auto 0", fontSize: 13 }} onClick={() => setMode("issue")}>Report a problem</button>
      </>}
      {mode === "late" && <div style={{ marginTop: 12 }}>
        <div className="oss-field"><label>I'll be there by</label><TimeSelect value={eta} onChange={setEta} /></div>
        <div className="oss-field" style={{ marginTop: 10 }}><label>Anything OSS should know?</label><input className="oss-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Luas delayed, 20 minutes behind" /></div>
        <div className="crew-actions"><Btn kind="primary" onClick={() => { run(E.journey, asg.id, "running_late", zoned(dayKey(sh.start), eta), note); setMode(""); }}>Let them know</Btn><Btn onClick={() => setMode("")}>Cancel</Btn></div>
      </div>}
      {mode === "issue" && <div style={{ marginTop: 12 }}>
        <input className="oss-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's wrong?" aria-label="Problem" />
        <div className="crew-actions"><Btn kind="primary" onClick={() => { run(E.journey, asg.id, "issue", undefined, note || "Problem reported"); setMode(""); }}>Tell OSS</Btn><Btn onClick={() => setMode("")}>Cancel</Btn></div>
      </div>}
      {mode === "clock" && <div style={{ marginTop: 12 }}>
        <VerifyControls s={s} venueId={ev.venueId!} shift={sh} kind={kind} onSubmit={doClock} onCancel={() => setMode("")} />
        {s.clocks.some((c) => c.assignmentId === asg.id && c.result === "awaiting_sync") && <div style={{ marginTop: 8 }}><Btn block onClick={() => run(E.syncOffline, asg.id, 30, 15)}>Back online, send it</Btn></div>}
      </div>}
    </div>}

    {vout && asg && <Hours s={s} asgId={asg.id} />}

    <div className="crew-card">
      <h3>Where to go</h3>
      <div className="sub" style={{ marginTop: 4 }}>{v?.area}</div>
      <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.5 }}>{v?.meetingConfirmed ? v.meetingPoint : "Meeting point to be confirmed. OSS will message you."}</div>
      <div className="sub" style={{ marginTop: 10 }}>Supervisor: {Q.nameOf(s, ev.supervisorId)}</div>
    </div>
    <div className="crew-card">
      <h3>Bring</h3>
      <Ppe items={sh.ppe} />
      {sh.requiredDocs.length > 0 && <div className="sub" style={{ marginTop: 10 }}>Needs a valid {sh.requiredDocs.map(docLabel).join(", ")} on file</div>}
      <div style={{ marginTop: 12, fontSize: 13.5, lineHeight: 1.55, color: "var(--body)" }}>{ev.brief}</div>
    </div>
    <div className="crew-card">
      <div className="crew-actions" style={{ marginTop: 0 }}>
        <Btn onClick={() => run(E.workerReply, wid, "Question about " + ev.name.split(":")[0] + ", " + sh.label.toLowerCase() + ".")}><Icon d={I.msg} size={16} />Message OSS</Btn>
        {live && !vin && ms(s.clock) < ms(sh.start) ? <Btn kind="danger" onClick={() => setMode("cancel")}>Can't make it</Btn> : <span />}
      </div>
      {mode === "cancel" && asg && <div style={{ marginTop: 12 }}>
        <div className="crew-banner" style={{ marginTop: 0 }}><Icon d={I.alert} size={15} />OSS will be told straight away and will find someone to cover.</div>
        <div className="oss-field" style={{ marginTop: 10 }}><label>Reason</label><input className="oss-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Family emergency" /></div>
        <div className="crew-actions"><Btn kind="danger" disabled={!reason.trim()} onClick={() => { run(E.cancelAssignment, asg.id, reason, true); setMode(""); }}>Cancel shift</Btn><Btn onClick={() => setMode("")}>Keep it</Btn></div>
      </div>}
    </div>
  </>;
}

function Hours({ s, asgId }: { s: OssState; asgId: string }) {
  const l = Q.lineFor(s, Q.asgOf(s, asgId));
  if (!l) return null;
  const approved = l.status === "approved" || l.status === "exported";
  return (
    <div className="crew-card">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><h3 style={{ flex: 1 }}>Your hours</h3>{approved ? <St tone="ok">Approved</St> : l.status === "incomplete" ? <St tone="warn">Being checked</St> : <St tone="info">With OSS</St>}</div>
      <div className="crew-kv">
        <div><div className="k">Worked</div><div className="v">{l.complete ? fmtHM(l.workedMin) : "-"}</div></div>
        <div><div className="k">You'll be paid</div><div className="v">{l.complete ? fmtHM(l.payableMin) : "-"}</div></div>
      </div>
      {l.topupMin > 0 && <div className="sub" style={{ marginTop: 10 }}>Includes the 5-hour minimum (+{fmtHM(l.topupMin)})</div>}
      {l.extraMin > 0 && <div className="sub" style={{ marginTop: 6 }}>{fmtHM(l.extraMin)} past your finish time, sent for overtime</div>}
      {l.correctionNote && <div className="sub" style={{ marginTop: 6 }}>{l.correctionNote}</div>}
    </div>
  );
}

/* ── calendar & availability ─────────────────────────────────────────────── */
function Schedule({ s, wid, open }: { s: OssState; wid: string; open: (d: Detail) => void }) {
  const [sel, setSel] = useState(dayKey(s.clock) < "2026-11-14" ? "2026-11-14" : dayKey(s.clock));
  const [from, setFrom] = useState("07:00"), [to, setTo] = useState("14:00");
  const [sheet, setSheet] = useState<"" | "day" | "repeat" | "holiday">("");
  const [hol, setHol] = useState({ a: "2026-11-20", b: "2026-11-22" });
  const lead = weekday(zoned("2026-11-01", "12:00"));
  const mine = s.assignments.filter((a) => a.workerId === wid);
  const myInv = s.invitations.filter((i) => i.workerId === wid);
  const items = (k: string) => ({ asg: mine.filter((a) => dayKey(Q.shiftOf(s, a.shiftId).start) === k), inv: myInv.filter((i) => dayKey(Q.shiftOf(s, i.shiftId).start) === k && Q.isActiveInvite(s, i)) });
  const dayState = (k: string) => Q.availability(s, wid, zoned(k, "09:00"), zoned(k, "21:00")).state;
  const di = items(sel);
  const ex = s.availExceptions.filter((x) => x.workerId === wid && (dayKey(x.start) === sel || (x.start < zoned(sel, "00:00") && x.end > zoned(sel, "00:00"))));
  const rules = s.availRules.filter((r) => r.workerId === wid);
  const wd = weekday(zoned(sel, "12:00"));
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const saveDay = (restOff: boolean) => {
    const add: any[] = [{ start: zoned(sel, from), end: zoned(sel, to), kind: "available", note: fmtDate(zoned(sel, "12:00")) + " " + from + " to " + to }];
    if (restOff) add.push({ start: zoned(sel, to), end: zoned(addDays(sel, 1), "00:00"), kind: "unavailable", note: fmtDate(zoned(sel, "12:00")) + " from " + to });
    run(E.setAvailability, wid, add, ex.filter((x) => !/^Confirmed availability/.test(x.note || "")).map((x) => x.id));
    setSheet("");
  };
  return <>
    <div className="crew-hello"><h1>November</h1><p>Tap a day to see shifts or change when you're free.</p></div>
    <div className="crew-cal" role="grid" aria-label="November 2026">
      {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i} className="dow">{d}</div>)}
      {Array.from({ length: lead }).map((_, i) => <span key={"l" + i} />)}
      {Array.from({ length: 30 }).map((_, i) => {
        const k = "2026-11-" + String(i + 1).padStart(2, "0");
        const it = items(k);
        const has = it.asg.some((a) => a.status === "confirmed");
        const st = dayState(k);
        const cls = [has ? "has" : st === "available" ? "av" : st === "unavailable" ? "un" : "", it.inv.length && "inv", sel === k && "sel", k === dayKey(s.clock) && "today"].filter(Boolean).join(" ");
        return <button key={k} className={cls} onClick={() => setSel(k)} aria-label={fmtDate(zoned(k, "12:00")) + (has ? ", booked" : "")}>{i + 1}</button>;
      })}
    </div>
    <div className="crew-legend"><span><i style={{ background: "var(--navy)" }} />Booked</span><span><i style={{ background: "var(--ok-soft)" }} />Free</span><span><i style={{ background: "#F6881F", borderRadius: 99 }} />Offer</span><span><i style={{ background: "var(--surface-2)" }} />Not free</span></div>

    <div className="crew-h">{fmtDateLong(zoned(sel, "12:00")).replace(" 2026", "")}</div>
    {di.asg.map((a) => <button key={a.id} className="crew-card" style={card} onClick={() => open({ kind: "asg", id: a.id })}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><h3 style={{ flex: 1 }}>{venueName(s, a.shiftId)}</h3><St tone={a.status === "confirmed" ? "ok" : "bad"}>{a.status === "confirmed" ? "Booked" : "Cancelled"}</St></div>
      <div className="sub">{Q.shiftOf(s, a.shiftId).label} · {fmtTime(Q.shiftOf(s, a.shiftId).start)}-{fmtTime(Q.shiftOf(s, a.shiftId).end)}</div></button>)}
    {di.inv.map((i) => <Offer key={i.id} s={s} inv={i} open={open} />)}
    <div className="crew-card">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><h3 style={{ flex: 1 }}>When you're free</h3></div>
      <div style={{ marginTop: 8 }}>{ex.length ? ex.map((x) => <div key={x.id} className="crew-li"><span className="grow"><b>{x.kind === "available" ? "Free" : x.kind === "holiday" ? "Holiday" : "Not free"}</b><span>{fmtTime(x.start)} to {dayKey(x.end) !== sel ? "midnight" : fmtTime(x.end)}</span></span><St tone={x.kind === "available" ? "ok" : "neutral"}>{x.kind === "available" ? "Free" : "Off"}</St></div>)
        : <div className="sub">{rules.some((r) => r.weekday === wd) ? "Your usual " + DAYS[wd] + ": " + rules.filter((r) => r.weekday === wd).map((r) => r.start + "-" + r.end).join(", ") : "Nothing set. OSS won't offer you this day."}</div>}</div>
      <div className="crew-actions">
        <Btn kind="primary" onClick={() => setSheet("day")}>Set times</Btn>
        <Btn onClick={() => run(E.setAvailability, wid, [{ start: zoned(sel, "00:00"), end: zoned(addDays(sel, 1), "00:00"), kind: "unavailable", note: "Not free all day" }], ex.filter((x) => !/^Confirmed availability/.test(x.note || "")).map((x) => x.id))}>Not free</Btn>
      </div>
    </div>
    <div className="crew-card">
      <h3>Every week</h3>
      <div style={{ marginTop: 6 }}>{rules.length ? rules.map((r) => <div key={r.id} className="crew-li"><span className="grow"><b>{DAYS[r.weekday]}s</b><span>{r.start}-{r.end}</span></span><button className="oss-link" style={{ fontSize: 13 }} onClick={() => run(E.setAvailability, wid, [], [], { remove: [r.id] })}>Remove</button></div>) : <div className="sub">No weekly pattern yet.</div>}</div>
      <div className="crew-actions"><Btn onClick={() => setSheet("repeat")}>Add a weekly day</Btn><Btn onClick={() => setSheet("holiday")}>Add holiday</Btn></div>
    </div>
    {sheet && <div className="crew-sheet" onClick={() => setSheet("")}><div onClick={(e) => e.stopPropagation()}>
      <div className="grab" />
      {sheet === "holiday" ? <>
        <h3 style={{ margin: "4px 0 14px", fontSize: 19 }}>Holiday</h3>
        <div className="crew-actions" style={{ marginTop: 0 }}>
          <div className="oss-field"><label>From</label><input className="oss-input" type="date" value={hol.a} onChange={(e) => setHol({ ...hol, a: e.target.value })} /></div>
          <div className="oss-field"><label>To</label><input className="oss-input" type="date" value={hol.b} onChange={(e) => setHol({ ...hol, b: e.target.value })} /></div>
        </div>
        <div style={{ marginTop: 16 }}><Btn kind="primary" block disabled={hol.b < hol.a} onClick={() => { run(E.setAvailability, wid, [{ start: zoned(hol.a, "00:00"), end: zoned(addDays(hol.b, 1), "00:00"), kind: "holiday", note: "Holiday " + hol.a.slice(5) + " to " + hol.b.slice(5) }]); setSheet(""); }}>Save holiday</Btn></div>
      </> : <>
        <h3 style={{ margin: "4px 0 14px", fontSize: 19 }}>{sheet === "repeat" ? "Every " + DAYS[wd] : fmtDateLong(zoned(sel, "12:00")).replace(" 2026", "")}</h3>
        <div className="crew-actions" style={{ marginTop: 0 }}>
          <div className="oss-field"><label>Free from</label><TimeSelect value={from} onChange={setFrom} /></div>
          <div className="oss-field"><label>Until</label><TimeSelect value={to} onChange={setTo} /></div>
        </div>
        {sheet === "day" ? <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
          <Btn kind="primary" block onClick={() => saveDay(true)}>Save, and I'm not free after</Btn>
          <Btn block onClick={() => saveDay(false)}>Save these times only</Btn>
        </div> : <div style={{ marginTop: 16 }}><Btn kind="primary" block onClick={() => { run(E.setAvailability, wid, [], [], { add: [{ weekday: wd, start: from, end: to }] }); setSheet(""); }}>Repeat every {DAYS[wd]}</Btn></div>}
        <div className="sub" style={{ marginTop: 12, textAlign: "center" }}>Changing this never cancels a shift you've accepted.</div>
      </>}
    </div></div>}
  </>;
}

/* ── messages ────────────────────────────────────────────────────────────── */
function Inbox({ s, wid }: { s: OssState; wid: string }) {
  const msgs = s.messages.filter((m) => m.receipts[wid] || (m.from.kind === "worker" && m.from.id === wid)).sort((a, b) => a.at.localeCompare(b.at));
  const [reply, setReply] = useState("");
  useEffect(() => {
    const ids = msgs.filter((m) => m.receipts[wid] && !m.receipts[wid].read).map((m) => m.id);
    if (ids.length) { const t = setTimeout(() => run(E.markRead, wid, ids), 900); return () => clearTimeout(t); }
  }, [msgs.length]);
  return <>
    <div className="crew-hello"><h1>Messages</h1><p>From the OSS events team.</p></div>
    {msgs.map((m) => {
      const mine = m.from.kind === "worker";
      const r = m.receipts[wid];
      const sys = m.from.kind === "system";
      return (
        <div key={m.id} className={"crew-msg" + (mine ? " me" : sys ? " reminder" : "")}>
          <div className="meta">{mine ? "You" : sys ? "Reminder" : Q.nameOf(s, m.from.id).split(" ")[0] + ", OSS"} · {fmtDate(m.at)} {fmtTime(m.at)}</div>
          {m.body}
          {!mine && m.kind !== "invitation" && <div style={{ marginTop: 8 }}>{r?.ack ? <span style={{ fontSize: 12, color: "var(--ok)", fontWeight: 600 }}>✓ Confirmed {fmtTime(r.ack)}</span> : <Btn size="sm" onClick={() => run(E.acknowledge, wid, m.id)}>{m.from.id === "AU2" ? "Yes, I'll be there" : "Got it"}</Btn>}</div>}
          {m.kind === "invitation" && <div style={{ marginTop: 6, fontSize: 12, color: "var(--dim)" }}>Answer it on the Home tab.</div>}
        </div>);
    })}
    {!msgs.length && <Empty text="No messages yet." />}
    <div className="crew-sticky">
      <div style={{ display: "flex", gap: 8 }}>
        <input className="oss-input" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Message OSS" aria-label="Message OSS" onKeyDown={(e) => { if (e.key === "Enter" && reply.trim()) { run(E.workerReply, wid, reply); setReply(""); } }} />
        <Btn kind="primary" disabled={!reply.trim()} onClick={() => { run(E.workerReply, wid, reply); setReply(""); }}><Icon d={I.send} size={16} /></Btn>
      </div>
    </div>
  </>;
}

/* ── me ──────────────────────────────────────────────────────────────────── */
function Me({ s, wid }: { s: OssState; wid: string }) {
  const w = Q.worker(s, wid);
  const docs = s.documents.filter((d) => d.workerId === wid);
  const ls = Q.lines(s, { workerId: wid }).filter((l) => l.complete);
  const [up, setUp] = useState(false);
  const [type, setType] = useState<"MH" | "SP" | "HACCP" | "FA">("MH");
  const [exp, setExp] = useState("2029-11-30");
  return <>
    <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "6px 2px 4px" }}>
      <Av name={w.name} size="xl" />
      <div><h1 style={{ margin: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-.6px" }}>{w.name}</h1><div className="sub" style={{ color: "var(--dim)", fontSize: 13.5 }}>{w.roles.join(", ")} · {w.locality}</div></div>
    </div>
    <div className="crew-kv">
      <div><div className="k">Shifts with OSS</div><div className="v">{w.priorShifts + ls.length}</div></div>
      <div><div className="k">Hours this week</div><div className="v">{fmtHM(ls.reduce((t, l) => t + l.payableMin, 0))}</div></div>
    </div>
    <div className="crew-h">Documents</div>
    <div className="crew-card">
      {docs.map((d) => { const st = Q.docStatusToday(s, d); return (
        <div key={d.id} className="crew-li"><span className="oss-ricon" style={{ width: 34, height: 34 }}><Icon d={I.shield} size={16} /></span>
          <span className="grow"><b>{docLabel(d.type)}</b><span>{d.review === "pending" ? "Sent, being checked" : "Expires " + fmtDate(zoned(d.expires, "12:00")) + " " + d.expires.slice(0, 4)}</span></span>
          <St tone={st === "valid" ? "ok" : st === "expiring" || st === "pending" ? "warn" : "bad"}>{st === "valid" ? "Valid" : st === "expiring" ? "Renew soon" : st === "pending" ? "Checking" : st === "expired" ? "Expired" : "Rejected"}</St></div>); })}
      {!docs.length && <div className="sub">No documents yet.</div>}
      <div style={{ marginTop: 12 }}><Btn block onClick={() => setUp(true)}><Icon d={I.upload} size={16} />Upload a document</Btn></div>
    </div>
    <div className="crew-h">Recent hours</div>
    <div className="crew-card">
      {ls.length ? ls.map((l) => <div key={l.id} className="crew-li"><span className="grow"><b>{venueName(s, l.shift.id)}</b><span>{fmtDate(l.shift.start)} · {l.shift.label}</span></span><b className="oss-tab" style={{ fontSize: 15 }}>{fmtHM(l.payableMin)}</b></div>)
        : <div className="sub">Hours show here after each shift.</div>}
    </div>
    <div className="crew-h">Details</div>
    <div className="crew-card">
      <div className="crew-li"><span className="grow"><b>Mobile</b><span>{w.mobile}</span></span></div>
      <div className="crew-li"><span className="grow"><b>Email</b><span>{w.email}</span></span></div>
    </div>
    {up && <div className="crew-sheet" onClick={() => setUp(false)}><div onClick={(e) => e.stopPropagation()}>
      <div className="grab" />
      <h3 style={{ margin: "4px 0 14px", fontSize: 19 }}>Upload a document</h3>
      <div className="oss-field"><label>Type</label><select className="oss-input" value={type} onChange={(e) => setType(e.target.value as any)}><option value="MH">Manual Handling</option><option value="SP">Safe Pass</option><option value="HACCP">Food Safety</option><option value="FA">First Aid</option></select></div>
      <div className="oss-field" style={{ marginTop: 10 }}><label>Expiry date</label><input className="oss-input" type="date" value={exp} onChange={(e) => setExp(e.target.value)} /></div>
      <div style={{ marginTop: 14, padding: 18, borderRadius: 18, border: "1.5px dashed var(--border-strong)", textAlign: "center", color: "var(--dim)", fontSize: 13.5 }}><Icon d={I.upload} size={20} /><div style={{ marginTop: 6 }}>Take a photo or choose a file</div></div>
      <div style={{ marginTop: 14 }}><Btn kind="primary" block onClick={() => { run(E.uploadDocument, wid, type, exp, w.name); setUp(false); }}>Send to OSS</Btn></div>
    </div></div>}
  </>;
}
