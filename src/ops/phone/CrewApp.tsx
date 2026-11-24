/* OSS Crew: the worker's phone app. Five tabs, big buttons, no dashboards:
   Jobs, My shifts, Clock in/out, Messages, Profile. */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Assignment, Code, DocType, Message } from "../model";
import { CODE_LABEL, DOC_LABEL } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { act, actQuiet, setUi, useOps } from "../store";
import { addMin, dayKey, fmtDay, fmtHM, fmtMoney, fmtTime, minutesBetween, ms, relTime, span } from "../time";
import { Btn, Field, I, Icon, Notice, Select, Status, Toggle } from "../ui/kit";

type Tab = "jobs" | "shifts" | "clock" | "messages" | "profile";

export function Sheet({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <>
      <div className="m-sheet-scrim" onClick={onClose} aria-hidden="true" />
      <div className="m-sheet" role="dialog" aria-label={title}>
        <div className="row between"><h2>{title}</h2><Btn kind="quiet" icon={I.x} iconOnly title="Close" onClick={onClose} /></div>
        {children}
      </div>
    </>
  );
}

const estPay = (rate: number, min: number, minimum: number) => fmtMoney((Math.max(min, minimum) / 60) * rate);

/* ── replies about one shift ────────────────────────────────────────────── */
function ReplyButtons({ a, wid }: { a: Assignment; wid: string }) {
  const s = useOps();
  const [sheet, setSheet] = useState<"late" | "cant" | null>(null);
  const [reason, setReason] = useState("");
  const sh = Q.shift(s, a.shiftId);
  const v = Q.asgView(s, a.id);
  const owed = Q.owedReply(s, a);
  const now = ms(s.clock);
  const soon = ms(sh.start) - now < 3 * 3600e3;
  const send = (code: Code, extra: { eta?: string; note?: string } = {}) => act(wid, E.replyCode, wid, a.id, code, { ...extra, via: s.ui.whatsapp ? "whatsapp" : "app" });
  if (v.inAt || ms(sh.end) < now) return null;
  const base = Math.max(now, ms(sh.start));
  return (
    <>
      {owed === "reconfirm" && !soon && (
        <div className="stack g8">
          <span className="strong">Are you still coming?</span>
          <div className="m-btns"><Btn kind="primary" className="m-big" onClick={() => send("confirmed")}>Yes, I'm coming</Btn><Btn className="m-big" onClick={() => setSheet("cant")}>I can't make it</Btn></div>
        </div>
      )}
      {soon && (
        <div className="stack g8">
          <span className="strong">{v.travel === "none" ? "Let your supervisor know" : "Update your status"}</span>
          <div className="m-btns">
            <Btn kind={v.travel === "on_way" ? "primary" : "secondary"} className="m-big" icon={I.bus} onClick={() => send("on_way")}>On my way</Btn>
            <Btn kind={v.travel === "late" ? "primary" : "secondary"} className="m-big" icon={I.time} onClick={() => setSheet("late")}>Running late</Btn>
            <Btn kind={v.travel === "arrived" ? "primary" : "secondary"} className="m-big" icon={I.check} onClick={() => send("arrived")}>I've arrived</Btn>
            <Btn kind={v.travel === "lost" ? "primary" : "secondary"} className="m-big" icon={I.pin} onClick={() => send("lost")}>Can't find it</Btn>
          </div>
          <Btn className="m-big" kind="danger" onClick={() => setSheet("cant")}>I can't make the shift</Btn>
        </div>
      )}
      {sheet === "late" && (
        <Sheet title="When will you get there?" onClose={() => setSheet(null)}>
          <div className="m-btns">{[10, 20, 30, 45].map((m) => <Btn key={m} className="m-big" onClick={() => { send("late", { eta: new Date(base + m * 60000).toISOString() }); setSheet(null); }}>
            {fmtTime(new Date(base + m * 60000).toISOString())} ({m} min)</Btn>)}</div>
        </Sheet>
      )}
      {sheet === "cant" && (
        <Sheet title="Can't make the shift" onClose={() => setSheet(null)}>
          <span className="small dim">Your place goes to someone on standby. Tell us why so the office can plan.</span>
          <div className="row wrap">{["Sick", "Family emergency", "Transport problem", "Clash with work or college"].map((r) => <button key={r} className={"chip" + (reason === r ? " on" : "")} onClick={() => setReason(r)}>{r}</button>)}</div>
          <input className="input" placeholder="Or type a reason" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />
          <Btn kind="danger" className="m-big" disabled={!reason.trim()} onClick={() => { send("cant_make", { note: reason }); setSheet(null); }}>Cancel my shift</Btn>
        </Sheet>
      )}
    </>
  );
}

/* ── shift detail ───────────────────────────────────────────────────────── */
function ShiftDetail({ a, wid, onBack, onClock }: { a: Assignment; wid: string; onBack: () => void; onClock: () => void }) {
  const s = useOps();
  const sh = Q.shift(s, a.shiftId), ev = Q.event(s, sh.eventId), v = Q.shiftVenue(s, sh);
  const sup = Q.user(s, Q.shiftSupervisor(s, sh));
  const st = Q.asgView(s, a.id);
  const canClock = ms(s.clock) >= ms(sh.start) - s.rules.clockOpenMin * 60000 && ms(s.clock) <= ms(sh.end) && !st.outAt;
  const quals = Q.requiredQuals(s, ev, a.role);
  return (
    <div className="stack g12">
      <button className="linkbtn" style={{ alignSelf: "flex-start" }} onClick={onBack}>‹ My shifts</button>
      <div className="m-card">
        <div className="row between"><h2>{ev.name}</h2><Status tone={st.tone}>{st.label}</Status></div>
        <div className="m-meta">
          <span><Icon d={I.events} size={15} />{fmtDay(dayKey(sh.start))}, {span(sh.start, sh.end)}</span>
          <span><Icon d={I.user} size={15} />{a.role} · {sh.label}</span>
          <span><Icon d={I.pin} size={15} />{v.name}, {v.address}</span>
        </div>
        <a className="btn m-big" href={"https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(v.name + ", " + v.address)} target="_blank" rel="noreferrer"><Icon d={I.pin} />Directions</a>
        {canClock && <Btn kind="primary" className="m-big" icon={I.hours} onClick={onClock}>{st.inAt ? "Go to clock out" : "Clock in"}</Btn>}
        <ReplyButtons a={a} wid={wid} />
      </div>
      <div className="m-card">
        <h2>Where to report</h2>
        <p>{v.meeting}</p>
        {sup && <div className="row between"><span>Supervisor: <b className="ink">{sup.name}</b></span><a className="btn sm" href={"tel:" + sup.phone.replace(/\s/g, "")}><Icon d={I.phone} />Call</a></div>}
      </div>
      <div className="m-card">
        <h2>Instructions</h2>
        <p style={{ whiteSpace: "pre-wrap" }}>{ev.instructions || "Your supervisor will brief you on arrival."}</p>
        {ev.ppe.length > 0 && <><span className="strong">Bring or wear</span><div className="row wrap">{ev.ppe.map((p) => <span key={p} className="tag">{p}</span>)}</div></>}
        {quals.length > 0 && <span className="small dim">You need a valid {quals.map((t) => DOC_LABEL[t].toLowerCase()).join(" and ")} for this shift.</span>}
      </div>
    </div>
  );
}

/* ── tabs ───────────────────────────────────────────────────────────────── */
function Jobs({ wid, go }: { wid: string; go: (t: Tab) => void }) {
  const s = useOps();
  const offers = Q.offersOfWorker(s, wid).filter((o) => Q.isOpenOffer(s, o)).sort((a, b) => Q.shift(s, a.shiftId).start.localeCompare(Q.shift(s, b.shiftId).start));
  const standby = Q.standbyOfWorker(s, wid).filter((b) => ms(Q.shift(s, b.shiftId).end) > ms(s.clock));
  const comp = Q.compliance(s, wid);
  const w = Q.worker(s, wid);
  const [declining, setDeclining] = useState<string | null>(null);
  return (
    <>
      {w.status === "pending_verification" && <Notice tone="warn">We're checking your documents. You'll get job offers once they're verified.</Notice>}
      {comp.level === "action" && w.status === "active" && (
        <div className="m-card attn"><span className="strong tone-bad">Action needed: {comp.summary}</span><span className="small">You can't be booked until this is fixed. Upload the renewed document and the office will verify it.</span>
          <Btn kind="primary" className="m-big" icon={I.upload} onClick={() => go("profile")}>Upload document</Btn></div>
      )}
      <div className="m-h">Job offers</div>
      {!offers.length && <div className="m-card"><span className="strong">No offers right now</span><span className="small dim">New jobs appear here and by WhatsApp. Keep your availability up to date so we can offer you more.</span></div>}
      {offers.map((o) => {
        const sh = Q.shift(s, o.shiftId), ev = Q.event(s, sh.eventId), v = Q.shiftVenue(s, sh);
        const mins = minutesBetween(sh.start, sh.end);
        const c = Q.coverage(s, sh.id, o.role);
        return (
          <div key={o.id} className="m-card">
            <div className="stack" style={{ gap: 2 }}><h2>{ev.name}</h2>{o.kind === "replacement" && <span className="small tone-warn strong">Replacement: please reply quickly</span>}</div>
            <div className="m-meta">
              <span><Icon d={I.events} size={15} />{fmtDay(dayKey(sh.start))}, {span(sh.start, sh.end)}</span>
              <span><Icon d={I.user} size={15} />{o.role}</span>
              <span><Icon d={I.pin} size={15} />{v.name}</span>
              <span><Icon d={I.hours} size={15} />About {estPay(s.rules.rates[o.role] ?? 14.5, Q.netMinutes(s, sh), s.rules.minimumOn ? s.rules.minimumMin : 0)} for {fmtHM(mins)}</span>
            </div>
            {ev.ppe.length > 0 && <div className="row wrap">{ev.ppe.map((p) => <span key={p} className="tag">{p}</span>)}</div>}
            <span className="tiny dim">{c.outstanding ? c.outstanding + " place" + (c.outstanding === 1 ? "" : "s") + " left. First to accept get them." : "Full: accepting puts you on standby."} Offer open until {fmtDay(dayKey(o.expiresAt))} {fmtTime(o.expiresAt)}.</span>
            <div className="m-btns">
              <Btn kind="primary" className="m-big" icon={I.check} onClick={() => act(wid, E.respondOffer, o.id, "accept", s.ui.whatsapp ? "whatsapp" : "app")}>Accept</Btn>
              <Btn className="m-big" onClick={() => setDeclining(o.id)}>Decline</Btn>
            </div>
          </div>
        );
      })}
      {standby.length > 0 && <>
        <div className="m-h">On standby</div>
        <div className="m-list">{standby.map((b) => { const sh = Q.shift(s, b.shiftId); return (
          <div key={b.id} className="m-item"><div className="grow"><b>{Q.event(s, sh.eventId).name}</b><small>{fmtDay(dayKey(sh.start))}, {span(sh.start, sh.end)} · {b.role}</small></div><span className="tag">#{b.order}</span></div>); })}</div>
        <span className="tiny dim" style={{ padding: "0 4px" }}>You're not booked on these. We'll message you if a place opens.</span>
      </>}
      {declining && <Sheet title="Decline this job?" onClose={() => setDeclining(null)}>
        <span className="small dim">No problem. Only this shift is declined.</span>
        <div className="m-btns"><Btn className="m-big" onClick={() => setDeclining(null)}>Keep it</Btn><Btn kind="danger" className="m-big" onClick={() => { act(wid, E.respondOffer, declining, "decline", s.ui.whatsapp ? "whatsapp" : "app"); setDeclining(null); }}>Decline</Btn></div>
      </Sheet>}
    </>
  );
}

function Shifts({ wid, open }: { wid: string; open: (asgId: string) => void }) {
  const s = useOps();
  const now = ms(s.clock);
  const mine = Q.asgsOfWorker(s, wid).filter((a) => a.status === "confirmed");
  const up = mine.filter((a) => ms(Q.shift(s, a.shiftId).end) > now).sort((a, b) => Q.shift(s, a.shiftId).start.localeCompare(Q.shift(s, b.shiftId).start));
  const past = mine.filter((a) => ms(Q.shift(s, a.shiftId).end) <= now).sort((a, b) => Q.shift(s, b.shiftId).start.localeCompare(Q.shift(s, a.shiftId).start)).slice(0, 6);
  return (
    <>
      <div className="m-h">Coming up</div>
      {!up.length && <div className="m-card"><span className="strong">No shifts booked</span><span className="small dim">Accepted jobs show here with directions and instructions.</span></div>}
      {up.length > 0 && <div className="m-list">{up.map((a) => {
        const sh = Q.shift(s, a.shiftId), v = Q.asgView(s, a.id), owed = Q.owedReply(s, a);
        return (
          <button key={a.id} className="m-item" onClick={() => open(a.id)}>
            <div className="grow"><b>{Q.event(s, sh.eventId).name}</b><small>{fmtDay(dayKey(sh.start))}, {span(sh.start, sh.end)} · {a.role}</small>
              {owed && <small className="tone-warn" style={{ color: "var(--warn)" }}>{owed === "travel" ? "Tell us you're on your way" : "Please confirm you're still coming"}</small>}</div>
            <Status tone={v.tone}>{v.label}</Status>
          </button>);
      })}</div>}
      {past.length > 0 && <>
        <div className="m-h">Recent</div>
        <div className="m-list">{past.map((a) => { const sh = Q.shift(s, a.shiftId); const l = Q.line(s, a.id); return (
          <div key={a.id} className="m-item"><div className="grow"><b>{Q.event(s, sh.eventId).name}</b><small>{fmtDay(dayKey(sh.start))} · {l?.payableMin ? fmtHM(l.payableMin) + " paid" + (l.topupMin ? " (minimum applied)" : "") : "No hours recorded"}</small></div>
            {l && <span className="small dim">{Q.LINE_LABEL[l.status]}</span>}</div>); })}</div>
      </>}
    </>
  );
}

function Clock({ wid }: { wid: string }) {
  const s = useOps();
  const now = ms(s.clock);
  const [method, setMethod] = useState<"gps" | "qr">("gps");
  const [where, setWhere] = useState<"here" | "near" | "far" | "offline">("here");
  const [qr, setQr] = useState<"good" | "old">("good");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const mine = Q.asgsOfWorker(s, wid).filter((a) => a.status === "confirmed");
  const active = mine.find((a) => Q.asgView(s, a.id).inAt && !Q.asgView(s, a.id).outAt) || mine.find((a) => Q.asgView(s, a.id).pendingSync);
  const next = mine.filter((a) => ms(Q.shift(s, a.shiftId).end) > now && !Q.asgView(s, a.id).outAt).sort((a, b) => Q.shift(s, a.shiftId).start.localeCompare(Q.shift(s, b.shiftId).start))[0];
  const a = active || next;
  if (!a) return <div className="m-card"><span className="strong">No shift to clock in to</span><span className="small dim">Your next accepted shift will show here.</span></div>;
  const sh = Q.shift(s, a.shiftId), v = Q.asgView(s, a.id), venue = Q.shiftVenue(s, sh);
  const opens = ms(sh.start) - s.rules.clockOpenMin * 60000;
  const dist = where === "here" ? 18 : where === "near" ? 46 : 240;
  const doClock = (kind: "in" | "out") => {
    const fn = kind === "in" ? E.clockIn : E.clockOut;
    const r = act(wid, fn, a.id, { method, distanceM: dist, offline: where === "offline", token: qr === "good" ? E.qrToken(sh.id, sh.version) : "OSS-" + sh.id + "-v0" });
    setMsg({ ok: r.ok, text: r.msg });
  };
  const sim = (
    <div className="m-sim" aria-label="Demo controls">
      <span className="label">Demo: simulated phone</span>
      <button className={"chip" + (method === "gps" ? " on" : "")} onClick={() => setMethod("gps")}><Icon d={I.gps} size={14} />Location</button>
      <button className={"chip" + (method === "qr" ? " on" : "")} onClick={() => setMethod("qr")}><Icon d={I.qr} size={14} />QR code</button>
      {method === "gps" ? <>
        <button className={"chip" + (where === "here" ? " on" : "")} onClick={() => setWhere("here")}>At the venue</button>
        <button className={"chip" + (where === "near" ? " on" : "")} onClick={() => setWhere("near")}>46 m away</button>
        <button className={"chip" + (where === "far" ? " on" : "")} onClick={() => setWhere("far")}>240 m away</button>
      </> : <>
        <button className={"chip" + (qr === "good" ? " on" : "")} onClick={() => setQr("good")}>Today's code</button>
        <button className={"chip" + (qr === "old" ? " on" : "")} onClick={() => setQr("old")}>An old code</button>
      </>}
      <button className={"chip" + (where === "offline" ? " on" : "")} onClick={() => setWhere(where === "offline" ? "here" : "offline")}><Icon d={I.wifiOff} size={14} />No signal</button>
    </div>
  );
  const done = v.outAt ? Q.line(s, a.id) : null;
  return (
    <>
      <div className="m-card">
        <span className="small dim">{fmtDay(dayKey(sh.start))}, {span(sh.start, sh.end)}</span>
        <h2>{Q.event(s, sh.eventId).name}</h2>
        <span className="small"><Icon d={I.pin} size={13} /> {venue.meeting}</span>
      </div>
      {msg && <Notice tone={msg.ok ? "ok" : "bad"}>{msg.text}</Notice>}
      {v.pendingSync && (
        <div className="m-card"><span className="strong">Saved on this phone</span><span className="small">No signal when you clocked. It syncs as soon as you're back online; your original time is kept.</span>
          <Btn className="m-big" icon={I.refresh} onClick={() => setMsg({ ok: true, text: act(wid, E.syncOffline, a.id).msg })}>I'm back online: sync now</Btn></div>
      )}
      {!v.inAt && !v.pendingSync && (
        <div className="m-card m-clock">
          {now < opens ? <><span className="strong">Clock-in opens at {fmtTime(new Date(opens).toISOString())}</span><span className="small dim">That's {s.rules.clockOpenMin} minutes before your start.</span></> : <>
            <span className="small dim">Location is checked once, now. It is not tracked after.</span>
            <Btn kind="primary" className="m-huge" block icon={method === "qr" ? I.qr : I.gps} onClick={() => doClock("in")}>{method === "qr" ? "Scan QR to clock in" : "Clock in"}</Btn>
          </>}
        </div>
      )}
      {v.inAt && !v.outAt && (
        <div className="m-card m-clock">
          <span className="small dim">Clocked in at {fmtTime(v.inAt)} · demo time</span>
          <span className="timer">{fmtHM(minutesBetween(v.inAt, s.clock))}</span>
          <span className="small dim">Finishes {fmtTime(sh.end)}</span>
          <Btn kind="primary" className="m-huge" block icon={I.check} onClick={() => doClock("out")}>Clock out</Btn>
        </div>
      )}
      {done && (
        <div className="m-card">
          <span className="strong tone-ok">Clocked out at {fmtTime(v.outAt!)}</span>
          <div className="m-meta">
            <span>Worked {fmtHM(done.workedMin)}{done.breakMin ? " after a " + fmtHM(done.breakMin) + " break" : ""}</span>
            <span>Paid {fmtHM(done.payableMin)}{done.topupMin ? " (minimum " + fmtHM(s.rules.minimumMin) + " applies)" : ""}</span>
            <span>Estimated {fmtMoney(done.pay)} before tax, once approved</span>
          </div>
        </div>
      )}
      {!v.outAt && sim}
    </>
  );
}

function replyTarget(s: ReturnType<typeof useOps>, m: Message, wid: string): { asg?: Assignment; offerId?: string } {
  if (!m.ref) return {};
  if (m.ref.type === "shift") {
    const a = Q.asgsOfShift(s, m.ref.id).find((x) => x.workerId === wid && x.status === "confirmed");
    if (a) return { asg: a };
    const o = Q.offersOfShift(s, m.ref.id).find((x) => x.workerId === wid && Q.isOpenOffer(s, x));
    return o ? { offerId: o.id } : {};
  }
  if (m.ref.type === "event") {
    const a = Q.asgsOfWorker(s, wid).filter((x) => x.status === "confirmed" && Q.shift(s, x.shiftId).eventId === m.ref!.id && ms(Q.shift(s, x.shiftId).end) > ms(s.clock))
      .sort((x, y) => Q.shift(s, x.shiftId).start.localeCompare(Q.shift(s, y.shiftId).start))[0];
    return a ? { asg: a } : {};
  }
  return {};
}

function Messages({ wid }: { wid: string }) {
  const s = useOps();
  const [text, setText] = useState("");
  const msgs = useMemo(() => Q.workerMessages(s, wid).slice(-40), [s, wid]);
  const unread = Q.unreadForWorker(s, wid).length;
  useEffect(() => { if (unread) actQuiet(wid, E.markRead, wid); }, [unread, wid]);
  const lastAsk = [...msgs].reverse().find((m) => m.asks && m.to.includes(wid));
  const target = lastAsk ? replyTarget(s, lastAsk, wid) : {};
  const answered = lastAsk && target.asg && Q.updatesOf(s, target.asg.id).some((u) => u.at >= lastAsk.at);
  return (
    <div className="m-chat">
      {!msgs.length && <div className="m-card"><span className="strong">No messages yet</span><span className="small dim">Messages from the OSS office appear here and on WhatsApp.</span></div>}
      {msgs.map((m) => {
        const mineMsg = m.from.kind === "worker";
        return (
          <div key={m.id} className={"bubble" + (mineMsg ? " out" : " in-wa")} style={{ alignSelf: mineMsg ? "flex-end" : "flex-start" }}>
            {!mineMsg && <div className="who">{m.from.kind === "system" ? "OSS Recruitment" : Q.nameOf(s, m.from.id) + " · OSS"}</div>}
            <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
            <div className="meta"><span>{relTime(m.at, s.clock)}</span>{s.ui.whatsapp && <span>WhatsApp (simulated)</span>}</div>
          </div>
        );
      })}
      {lastAsk && !answered && (target.asg || target.offerId) && (
        <div className="m-card">
          <span className="small strong">Quick reply</span>
          <div className="m-replies">
            {target.offerId ? <>
              <Btn size="sm" kind="primary" onClick={() => act(wid, E.respondOffer, target.offerId!, "accept", s.ui.whatsapp ? "whatsapp" : "app")}>Accept</Btn>
              <Btn size="sm" onClick={() => act(wid, E.respondOffer, target.offerId!, "decline", s.ui.whatsapp ? "whatsapp" : "app")}>Decline</Btn>
            </> : lastAsk.asks!.map((c) => <Btn key={c} size="sm" kind={c === "cant_make" ? "danger" : "secondary"}
              onClick={() => act(wid, E.replyCode, wid, target.asg!.id, c, { via: s.ui.whatsapp ? "whatsapp" : "app", eta: c === "late" ? addMin(Q.shift(s, target.asg!.shiftId).start > s.clock ? Q.shift(s, target.asg!.shiftId).start : s.clock, 20) : undefined, note: c === "cant_make" ? "Replied from messages" : undefined })}>{CODE_LABEL[c]}</Btn>)}
          </div>
        </div>
      )}
      <div className="row" style={{ position: "sticky", bottom: 0, paddingTop: 6 }}>
        <input className="input" placeholder="Message the OSS office" value={text} onChange={(e) => setText(e.target.value)} aria-label="Message the office" onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { act(wid, E.workerText, wid, text); setText(""); } }} />
        <Btn kind="primary" icon={I.send} iconOnly title="Send" disabled={!text.trim()} onClick={() => { act(wid, E.workerText, wid, text); setText(""); }} />
      </div>
    </div>
  );
}

function Profile({ wid }: { wid: string }) {
  const s = useOps();
  const w = Q.worker(s, wid);
  const comp = Q.compliance(s, wid);
  const [up, setUp] = useState<DocType | null>(null);
  const [issued, setIssued] = useState(dayKey(s.clock));
  const [expires, setExpires] = useState("");
  const [file, setFile] = useState("");
  const [week, setWeek] = useState(w.week);
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({ mobile: w.mobile, email: w.email, area: w.area });
  const wk = Q.weekMinutes(s, wid, s.clock), lim = Q.weekLimit(s, w);
  const ls = Q.lines(s, { workerId: wid }).slice(-6).reverse();
  const month = Q.lines(s, { workerId: wid, from: dayKey(addMin(s.clock, -30 * 24 * 60)) });
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return (
    <>
      <div className="m-card">
        <div className="row between"><div className="stack" style={{ gap: 0 }}><h2>{w.name}</h2><span className="small dim">{w.roles.join(", ")}</span></div><Btn size="sm" onClick={() => setEdit(true)}>Edit</Btn></div>
        <div className="m-meta"><span><Icon d={I.phone} size={14} />{w.mobile}</span><span><Icon d={I.comms} size={14} />{w.email || "No email"}</span><span><Icon d={I.pin} size={14} />{w.area}</span></div>
      </div>
      <div className="m-h">Hours and earnings</div>
      <div className="m-card">
        <div className="row between"><span>This week</span><b className={"num " + (wk > lim.min && lim.strict ? "tone-bad" : "ink")}>{fmtHM(wk)}{lim.strict ? " of " + fmtHM(lim.min) : ""}</b></div>
        <div className="row between"><span>Last 30 days</span><b className="num ink">{fmtHM(Q.lineTotals(month).payable)} · {fmtMoney(Q.lineTotals(month).pay)}</b></div>
        {ls.map((l) => <div key={l.id} className="row between small"><span className="ellip">{fmtDay(l.day)} {l.ev.name.split(":")[0]}</span><span className="num nowrap">{l.payableMin ? fmtHM(l.payableMin) : "-"} · {l.status === "exported" || l.status === "approved" ? "approved" : l.status === "missing" ? "check times" : "pending"}</span></div>)}
        <span className="tiny dim">Estimates before tax. Pay comes through OSS payroll.</span>
      </div>
      <div className="m-h">My availability</div>
      <div className="m-card">
        {DAYS.map((d, i) => (
          <div key={d} className="row between"><span className="strong" style={{ width: 44 }}>{d}</span>
            <div style={{ width: 170 }}><Select sm label={d} value={week[i]} onChange={(v) => setWeek(week.slice(0, i) + v + week.slice(i + 1))}
              options={[{ value: "a", label: "All day" }, { value: "d", label: "Daytime" }, { value: "e", label: "Evenings" }, { value: "x", label: "Not available" }, { value: "?", label: "Not set" }]} /></div></div>
        ))}
        <Btn kind="primary" className="m-big" disabled={week === w.week} onClick={() => act(wid, E.setWeek, wid, week)}>Save availability</Btn>
      </div>
      <div className="m-h">My documents</div>
      <div className="m-list">
        {comp.items.map((it) => (
          <div key={it.type} className="m-item">
            <div className="grow"><b>{DOC_LABEL[it.type]}</b><small>{it.view.label}</small></div>
            {["valid"].includes(it.view.state) ? <Status tone="ok">Valid</Status> : it.view.state === "pending" ? <Status tone="info">Checking</Status>
              : <Btn size="sm" kind={it.view.state === "expiring" ? "secondary" : "primary"} onClick={() => { setUp(it.type); setExpires(""); }}>{it.view.state === "missing" ? "Upload" : "Renew"}</Btn>}
          </div>
        ))}
      </div>
      {up && (
        <Sheet title={"Upload " + DOC_LABEL[up].toLowerCase()} onClose={() => setUp(null)}>
          <Field label="Photo of the document"><input className="input" type="file" accept="image/*" capture="environment" onChange={(e) => setFile(e.target.files?.[0]?.name || "")} /></Field>
          <span className="tiny dim">Demo: only the file name is kept; no image is stored.</span>
          <div className="grid2"><Field label="Issue date"><input className="input" type="date" value={issued} onChange={(e) => setIssued(e.target.value)} /></Field>
            <Field label="Expiry date"><input className="input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field></div>
          <Btn kind="primary" className="m-big" icon={I.upload} disabled={!expires} onClick={() => { if (act(wid, E.uploadDoc, wid, { type: up, issued, expires, fileName: file || undefined }).ok) setUp(null); }}>Send for checking</Btn>
        </Sheet>
      )}
      {edit && (
        <Sheet title="Edit my details" onClose={() => setEdit(false)}>
          <Field label="Mobile"><input className="input" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Area"><input className="input" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} /></Field>
          <Btn kind="primary" className="m-big" onClick={() => { if (act(wid, E.updateWorker, wid, f).ok) setEdit(false); }}>Save</Btn>
        </Sheet>
      )}
    </>
  );
}

export default function CrewApp() {
  const s = useOps();
  const wid = s.ui.crewId;
  const w = Q.worker(s, wid);
  const [tab, setTab] = useState<Tab>("jobs");
  const [detail, setDetail] = useState<string | null>(null);
  useEffect(() => { setDetail(null); }, [wid]);
  if (!w) return <div className="m-app"><div className="m-body"><Notice tone="warn">Pick a worker to view the app as.</Notice></div></div>;
  const offers = Q.offersOfWorker(s, wid).filter((o) => Q.isOpenOffer(s, o)).length;
  const unread = Q.unreadForWorker(s, wid).length;
  const owed = Q.asgsOfWorker(s, wid).filter((a) => Q.owedReply(s, a)).length;
  const wa = s.ui.whatsapp && tab === "messages";
  const TABS: { id: Tab; label: string; icon: string; n?: number }[] = [
    { id: "jobs", label: "Jobs", icon: I.jobs, n: offers }, { id: "shifts", label: "My shifts", icon: I.list, n: owed }, { id: "clock", label: "Clock in", icon: I.hours },
    { id: "messages", label: "Messages", icon: I.comms, n: unread }, { id: "profile", label: "Profile", icon: I.user }];
  const detailAsg = detail ? Q.asg(s, detail) : undefined;
  return (
    <div className={"m-app" + (wa ? " m-wa" : "")}>
      <div className="m-top">
        {wa ? <span className="avatar" style={{ background: "#fff", color: "#0b6b4f" }}>OSS</span> : <img src="/brand/oss-logo.png" alt="" width={30} height={30} style={{ borderRadius: 7 }} />}
        <div className="stack grow" style={{ gap: 0 }}>
          <h1>{wa ? "OSS Recruitment" : tab === "jobs" ? "Hi " + w.name.split(" ")[0] : TABS.find((t) => t.id === tab)!.label}</h1>
          <span className="sub">{wa ? "WhatsApp Business (simulated)" : "OSS Crew"}</span>
        </div>
        {tab === "messages" && <Toggle on={s.ui.whatsapp} onChange={(v) => setUi({ whatsapp: v })}><span className="small" style={{ color: wa ? "#fff" : undefined }}>WhatsApp</span></Toggle>}
      </div>
      <div className="m-body">
        {detailAsg && tab === "shifts" ? <ShiftDetail a={detailAsg} wid={wid} onBack={() => setDetail(null)} onClock={() => { setDetail(null); setTab("clock"); }} />
          : tab === "jobs" ? <Jobs wid={wid} go={setTab} /> : tab === "shifts" ? <Shifts wid={wid} open={setDetail} /> : tab === "clock" ? <Clock wid={wid} />
          : tab === "messages" ? <Messages wid={wid} /> : <Profile wid={wid} />}
      </div>
      <nav className="m-tabs" aria-label="Crew app">
        {TABS.map((t) => <button key={t.id} className={tab === t.id ? "on" : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => { setTab(t.id); setDetail(null); }}>
          <Icon d={t.icon} size={21} />{t.label}{t.n ? <span className="dot">{t.n}</span> : null}</button>)}
      </nav>
    </div>
  );
}
