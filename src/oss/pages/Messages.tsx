/* Messages: replaces the one-to-one WhatsApps. Individual, event-group and bulk
   messages to suitable available staff, urgent cover requests, and the
   automatic reminders (day before, two hours before, missed clocks). */

import { useEffect, useMemo, useState } from "react";
import type { Message, OssState, Shift } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { navigate, run, runQuiet, setUi, useOss } from "../store";
import { tabOf } from "../modules";
import { fmtDate, fmtHM, fmtTime, minutesBetween, ms } from "../time";
import "../../styles/oss-biz.css";
import { Av, Btn, Card, Chip, Faces, hueVar, I, Icon, Page, Row, RIcon, Search, St, Tag, Toggle, deskVar } from "../ui/kit";
import { DESKS } from "../network";
import { regionOfW } from "./Staff";
import { DateBadge } from "../ui/Shell";

export default function Messages() {
  const s = useOss();
  const tab = tabOf(s, "Messages");
  if (tab === "compose") return <Compose s={s} />;
  if (tab === "reminders") return <Reminders s={s} />;
  return <Inbox s={s} />;
}

const who = (s: OssState, m: Message) => m.from.kind === "worker" ? Q.nameOf(s, m.from.id) : m.from.kind === "system" ? "Automatic reminder" : Q.nameOf(s, m.from.id);
function officeRead(d: OssState, threadId: string): E.Result {
  for (const m of d.messages) if (m.threadId === threadId && m.from.kind === "worker" && !m.receipts.office?.read) m.receipts.office = { delivered: m.at, read: d.clock };
  return { ok: true, message: "" };
}

/* ── inbox ───────────────────────────────────────────────────────────────── */
function Inbox({ s }: { s: OssState }) {
  const [q, setQ] = useState("");
  const threads = s.threads.map((t) => ({ t, msgs: s.messages.filter((m) => m.threadId === t.id) })).filter((x) => x.msgs.length)
    .map((x) => ({ ...x, last: x.msgs[x.msgs.length - 1], unread: x.msgs.filter((m) => m.from.kind === "worker" && !m.receipts.office?.read).length }))
    .filter((x) => !q || x.t.title.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.last.at.localeCompare(a.last.at));
  const [sel, setSel] = useState<string>(threads[0]?.t.id || "");
  const cur = threads.find((x) => x.t.id === sel) || threads[0];
  useEffect(() => { if (cur && cur.unread) runQuiet(officeRead, cur.t.id); }, [cur?.t.id, cur?.unread]);
  const [body, setBody] = useState("");
  const roster = (eventId: string) => s.assignments.filter((a) => a.status === "confirmed" && Q.shiftOf(s, a.shiftId).eventId === eventId).map((a) => a.workerId);
  const send = () => {
    if (!cur || !body.trim()) return;
    if (cur.t.kind === "direct" && cur.t.workerId) run(E.sendBulk, { workerIds: [cur.t.workerId], body, audience: cur.t.title, kind: "direct" });
    else if (cur.t.eventId) run(E.sendBulk, { workerIds: Array.from(new Set(roster(cur.t.eventId))), body, eventId: cur.t.eventId, audience: cur.t.title + " crew", kind: "event" });
    setBody("");
  };
  const unread = threads.reduce((n, x) => n + x.unread, 0);
  return (
    <Page eyebrow="Messages" title="Conversations with crew" sub="Every message sits on the record it's about, so nothing lives in someone's personal WhatsApp."
      actions={<Btn kind="primary" icon={I.send} onClick={() => navigate("Messages", "compose")}>New message</Btn>}>
      <div className="oss-grid oss-side-main" style={{ alignItems: "start" }}>
        <Card title="Inbox" meta={unread ? unread + " unread from crew" : "All caught up"} icon={I.inbox} pad={false}>
          <div className="oss-filters"><Search value={q} onChange={setQ} placeholder="Find a person or event" style={{ flex: 1 }} /></div>
          <div className="oss-rows" style={{ padding: "0 8px 10px", maxHeight: 600, overflowY: "auto" }}>
            {threads.map((x) => (
              <Row key={x.t.id} sel={cur?.t.id === x.t.id} onClick={() => setSel(x.t.id)}
                lead={x.t.kind === "direct" ? <Av name={x.t.title} /> : <RIcon d={I.users} tone="info" />}
                title={<>{x.t.title}{x.unread ? <span className="oss-st urgent" style={{ height: 18, padding: "0 7px", marginLeft: 8, fontSize: 10.5 }}>{x.unread}</span> : null}</>}
                sub={(x.last.from.kind === "office" ? "You: " : "") + x.last.body}
                end={<span className="when">{fmtTime(x.last.at)}</span>} />))}
          </div>
        </Card>
        {cur ? <Card title={cur.t.title} meta={cur.t.kind === "direct" ? "Direct · in the OSS Crew app" : "Event group · " + new Set(cur.t.eventId ? roster(cur.t.eventId) : []).size + " people"} icon={cur.t.kind === "direct" ? I.user : I.users} pad={false}
          right={cur.t.kind === "direct" && cur.t.workerId ? <Btn size="sm" icon={I.phone} onClick={() => setUi({ phoneOpen: true, role: "crew", crewWorkerId: cur.t.workerId! })}>See their phone</Btn> : cur.t.eventId ? <Btn size="sm" onClick={() => navigate("Events", "upcoming", { kind: "event", id: cur.t.eventId! })}>Open event</Btn> : undefined}>
          <div className="oss-chat">
            {cur.msgs.map((m) => {
              const mine = m.from.kind === "office";
              const rs = Object.values(m.receipts);
              const read = rs.filter((r) => r.read).length, ack = rs.filter((r) => r.ack).length;
              if (m.from.kind === "system") return <div key={m.id} className="oss-bubble sys"><Icon d={I.bell} size={12} /> {m.body}<span className="meta">Automatic · {fmtDate(m.at)}, {fmtTime(m.at)}</span></div>;
              return (
                <div key={m.id} className={"oss-bubble" + (mine ? " me" : "")}>
                  {!mine && <b style={{ display: "block", fontSize: 12, marginBottom: 3, color: "var(--dim)" }}>{who(s, m)}</b>}
                  {m.body}
                  <span className="meta">{mine ? Q.nameOf(s, m.from.id) + " · " : ""}{fmtDate(m.at)}, {fmtTime(m.at)}{m.kind === "invitation" ? " · shift offer" : ""}{mine && rs.length ? " · " + (rs.length === 1 ? (ack ? "acknowledged" : read ? "read" : "delivered") : read + " of " + rs.length + " read" + (ack ? ", " + ack + " acknowledged" : "")) : ""}</span>
                </div>);
            })}
          </div>
          <div className="oss-compose">
            <textarea className="oss-input" rows={2} value={body} onChange={(e) => setBody(e.target.value)} placeholder={cur.t.kind === "direct" ? "Message " + cur.t.title.split(" ")[0] : "Message everyone on this event"} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <Btn kind="primary" icon={I.send} disabled={!body.trim()} onClick={send}>Send</Btn>
          </div>
        </Card> : <Card><div className="oss-empty"><b>No conversations yet</b></div></Card>}
      </div>
    </Page>
  );
}

/* ── compose ─────────────────────────────────────────────────────────────── */
const TEMPLATES: { id: string; label: string; urgent?: boolean; body: (ctx: string) => string }[] = [
  { id: "cover", label: "Urgent cover", urgent: true, body: (c) => "Urgent: we need extra hands for " + c + ". If you can make it, accept the offer in the app and we'll confirm straight away." },
  { id: "change", label: "Change to instructions", body: (c) => "Update for " + c + ": please use the staff entrance at the loading bay, Gate C. Safety boots and hi-vis required." },
  { id: "cancel", label: "Event cancelled", body: (c) => c + " has been cancelled by the client. You won't be needed. Sorry for the short notice." },
  { id: "avail", label: "Ask for availability", body: () => "We have a busy few weeks coming up. Please update your availability in OSS Crew so we can offer you shifts." }
];
function Compose({ s }: { s: OssState }) {
  const f = s.ui.focus;
  const initEvent = f?.kind === "event" ? f.id : f?.kind === "shift" ? Q.shiftOf(s, f.id).eventId : "EVT-001";
  const [mode, setMode] = useState<"event" | "available" | "person">(f?.kind === "event" || f?.kind === "shift" ? "event" : "available");
  const [ev, setEv] = useState(initEvent);
  const [shift, setShift] = useState<string>(f?.kind === "shift" ? f.id : "all");
  const [date, setDate] = useState("2026-11-14");
  const [role, setRole] = useState("any");
  const [region, setRegion] = useState("any");
  const [person, setPerson] = useState("W009");
  const [urgent, setUrgent] = useState(false);
  const [body, setBody] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const events = s.events.filter((e) => !e.historical && e.status === "confirmed");
  const shiftsOf = Q.shiftsOfEvent(s, ev);
  const recipients = useMemo(() => {
    if (mode === "person") return [person];
    if (mode === "event") return Array.from(new Set(s.assignments.filter((a) => a.status === "confirmed" && Q.shiftOf(s, a.shiftId).eventId === ev && (shift === "all" || a.shiftId === shift)).map((a) => a.workerId)));
    return s.workers.filter((w) => w.status === "active" && (role === "any" || w.roles.includes(role)) && (region === "any" || regionOfW(w) === region) && Q.availability(s, w.id, date + "T08:00:00Z", date + "T22:00:00Z").state === "available").map((w) => w.id);
  }, [mode, ev, shift, date, role, region, person, s]);
  const ctx = mode === "event" ? Q.eventOf(s, ev).name.split(":")[0] + (shift !== "all" ? " (" + Q.shiftOf(s, shift).label.toLowerCase() + ")" : "") : mode === "available" ? "events on " + fmtDate(date + "T12:00:00Z") : "your shift";
  const audience = mode === "event" ? Q.eventOf(s, ev).name + (shift !== "all" ? ", " + Q.shiftOf(s, shift).label : "") + " crew" : mode === "available" ? "Available " + fmtDate(date + "T12:00:00Z") + (role !== "any" ? ", " + role : "") + (region !== "any" ? ", " + region : "") : Q.nameOf(s, person);
  const send = () => {
    const r = run(E.sendBulk, { workerIds: recipients, body: (urgent ? "URGENT: " : "") + body.replace(/^URGENT:\s*/i, ""), eventId: mode === "event" ? ev : undefined, audience: (urgent ? "Urgent · " : "") + audience, kind: mode === "event" ? "event" : recipients.length > 1 ? "bulk" : "direct" });
    if (r.ok) { setSent(audience + " · " + recipients.length + (recipients.length === 1 ? " person" : " people")); setBody(""); }
  };
  return (
    <Page eyebrow="New message" title="Message the right people" sub="Pick an event crew, everyone available on a date, or one person. It lands in their OSS Crew app with read receipts.">
      <div className="oss-grid oss-g75" style={{ alignItems: "start" }}>
        <Card title="Who" icon={I.users}>
          <div className="oss-seg" style={{ marginBottom: 16 }}>
            <button className={mode === "event" ? "on" : ""} onClick={() => setMode("event")}>Event crew</button>
            <button className={mode === "available" ? "on" : ""} onClick={() => setMode("available")}>Available staff</button>
            <button className={mode === "person" ? "on" : ""} onClick={() => setMode("person")}>One person</button>
          </div>
          {mode === "event" && <div className="oss-grid oss-g2">
            <div className="oss-field"><label>Event</label><select className="oss-input" value={ev} onChange={(e) => { setEv(e.target.value); setShift("all"); }}>{events.slice().sort((a, b) => a.date.localeCompare(b.date)).map((e) => <option key={e.id} value={e.id}>{fmtDate(e.date + "T12:00:00Z")} · {e.name}</option>)}</select></div>
            <div className="oss-field"><label>Shift</label><select className="oss-input" value={shift} onChange={(e) => setShift(e.target.value)}><option value="all">Everyone on the event</option>{shiftsOf.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></div>
          </div>}
          {mode === "available" && <div className="oss-grid oss-g3">
            <div className="oss-field"><label>Available on</label><input className="oss-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="oss-field"><label>Role</label><select className="oss-input" value={role} onChange={(e) => setRole(e.target.value)}><option value="any">Any role</option>{["Event crew", "Steward", "Stagehand", "General operative", "Catering assistant", "Bar staff", "Site crew", "Usher", "Car park marshal"].map((r) => <option key={r}>{r}</option>)}</select></div>
            <div className="oss-field"><label>Region</label><select className="oss-input" value={region} onChange={(e) => setRegion(e.target.value)}><option value="any">All of Ireland</option>{["Dublin", "Leinster", "Munster", "Connacht", "Ulster"].map((r) => <option key={r}>{r}</option>)}</select></div>
          </div>}
          {mode === "person" && <div className="oss-field"><label>Person</label><select className="oss-input" value={person} onChange={(e) => setPerson(e.target.value)}>{s.workers.slice().sort((a, b) => a.name.localeCompare(b.name)).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></div>}

          <div className="oss-label" style={{ margin: "20px 0 8px" }}>Start from</div>
          <div className="oss-pills">{TEMPLATES.map((t) => <Chip key={t.id} onClick={() => { setBody(t.body(ctx)); setUrgent(!!t.urgent); }}>{t.label}</Chip>)}</div>
          <div className="oss-field" style={{ marginTop: 14 }}><label htmlFor="mb">Message</label><textarea id="mb" className="oss-input" rows={5} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a message" /></div>
          <div className="oss-row" style={{ marginTop: 14, gap: 12 }}>
            <Toggle on={urgent} onChange={setUrgent} label="Urgent" /><span className="oss-small grow"><b className="oss-ink">Urgent</b> <span className="oss-dim">· shows at the top of their app with an alert</span></span>
            <Btn kind={urgent ? "urgent" : "primary"} icon={I.send} disabled={!body.trim() || !recipients.length} onClick={send}>Send to {recipients.length}</Btn>
          </div>
          {sent && <div className="oss-note ok" style={{ marginTop: 14 }}>Sent to {sent}. Replies and read receipts land in the inbox. <button className="oss-link" onClick={() => navigate("Messages", "inbox")}>Open inbox</button></div>}
        </Card>
        <Card title={recipients.length + (recipients.length === 1 ? " person" : " people")} meta={audience} icon={I.inbox} flush>
          <div style={{ padding: "0 12px 10px" }}><Faces names={recipients.map((id) => Q.nameOf(s, id))} max={10} /></div>
          <div className="oss-rows" style={{ maxHeight: 420, overflowY: "auto" }}>
            {recipients.slice(0, 40).map((id) => <Row key={id} lead={<Av name={Q.nameOf(s, id)} size="sm" />} title={Q.nameOf(s, id)} sub={Q.worker(s, id).roles[0] + " · " + Q.worker(s, id).locality} />)}
            {!recipients.length && <div className="oss-empty"><b>Nobody matches</b>Try another date or role.</div>}
          </div>
        </Card>
      </div>
    </Page>
  );
}

/* ── reminders: what goes out before every shift, on one line per shift ── */
type Stop = { key: string; label: string; when: string; at: number; auto?: string; office?: { label: string; go: () => void }; sent?: number; of?: number; note?: string };
function stopsFor(s: OssState, sh: Shift): Stop[] {
  const start = ms(sh.start), end = ms(sh.end), H = 3600000;
  const asg = s.assignments.filter((a) => a.shiftId === sh.id && a.status === "confirmed").map((a) => a.id);
  const ran = (id: string) => s.autoRuns.filter((r) => r.automationId === id && asg.some((a) => r.key === id + ":" + a || r.key.startsWith(id + ":" + a + ":"))).length;
  const thread = s.threads.find((t) => t.kind === "event" && t.eventId === sh.eventId);
  /* Other desks run the same automations from their own office; count them as sent once the time has passed. */
  const net = !!Q.eventOf(s, sh.eventId).network;
  const ranAt = (id: string, at: number) => (net ? (at <= ms(s.clock) ? asg.length : 0) : ran(id));
  const kitSent = thread ? s.messages.filter((m) => m.threadId === thread.id && m.from.kind === "office").length : 0;
  const dayBefore = new Date(start - 24 * H); dayBefore.setUTCHours(18, 0, 0, 0);
  return [
    { key: "kit", label: "Kit and PPE note", when: "48h before", at: start - 48 * H, office: { label: "Write it", go: () => navigate("Messages", "compose", { kind: "shift", id: sh.id }) }, note: kitSent ? kitSent + " sent to the event group" : net && start - 48 * H <= ms(s.clock) ? "Sent by the " + Q.deskOf(Q.eventOf(s, sh.eventId)) : sh.ppe.join(", ") },
    { key: "AU2", label: "Day-before reconfirmation", when: s.rules.dayBeforeH + "h before", at: start - s.rules.dayBeforeH * H, auto: "AU2", sent: ranAt("AU2", start - s.rules.dayBeforeH * H), of: asg.length },
    { key: "call", label: "Call sheet", when: fmtDate(dayBefore.toISOString()).split(" ")[0] + " 18:00", at: dayBefore.getTime(), office: { label: "Call sheet", go: () => navigate("Events", "upcoming", { kind: "event", id: sh.eventId }) }, note: "Call time, gate, radio channel" },
    { key: "AU3", label: "Arrival prompt", when: s.rules.arrivalPromptH + "h before", at: start - s.rules.arrivalPromptH * H, auto: "AU3", sent: ranAt("AU3", start - s.rules.arrivalPromptH * H), of: asg.length },
    { key: "AU4", label: "Missed clock-in alert", when: s.rules.missedClockMin + " min after start", at: start + s.rules.missedClockMin * 60000, auto: "AU4", sent: ran("AU4"), note: "Only if someone hasn't clocked in" },
    { key: "AU5", label: "Missed clock-out alert", when: s.rules.missedClockMin + " min after finish", at: end + s.rules.missedClockMin * 60000, auto: "AU5", sent: ran("AU5"), note: "Only if a clock-out is missing" }
  ];
}

function Reminders({ s }: { s: OssState }) {
  const [all, setAll] = useState(false);
  const [desk, setDesk] = useState("all");
  const now = ms(s.clock);
  const open = s.invitations.filter((i) => Q.isActiveInvite(s, i)).sort((a, b) => a.sentAt.localeCompare(b.sentAt));
  const runs = s.autoRuns.slice().reverse();
  const sentCount = (id: string) => s.autoRuns.filter((r) => r.automationId === id).length;
  const notAck = s.messages.filter((m) => m.kind === "reminder" && m.from.id === "AU2").flatMap((m) => Object.entries(m.receipts).filter(([, r]) => !r.ack).map(([wid]) => ({ wid, m })));
  const allShifts = Q.windowEvents(s).filter((e) => Q.eventPhase(s, e) !== "completed").flatMap((e) => Q.shiftsOfEvent(s, e.id)).filter((x) => ms(x.end) + 3600000 > now).sort((a, b) => a.start.localeCompare(b.start));
  const deskOfShift = (x: Shift) => Q.deskOf(Q.eventOf(s, x.eventId));
  const shifts = desk === "all" ? allShifts : allShifts.filter((x) => deskOfShift(x) === desk);
  const shown = all ? shifts : shifts.slice(0, 5);
  const crewAll = allShifts.reduce((n, x) => n + Q.shiftCoverage(s, x.id).confirmed, 0);
  const isOn = (id?: string) => !id || !!s.automations.find((a) => a.id === id)?.on;
  return (
    <Page eyebrow="Reminders" title="What goes out before every shift" sub="Each shift gets the same run of reminders. The system sends the automatic ones and logs them against the shift; the office sends the kit note and the call sheet. Non-replies come back here."
      actions={<Btn icon={I.sliders} onClick={() => navigate("Settings", "rules")}>Timings</Btn>}>
      <section className="oss-card rm-sum" aria-label="Reminders across every desk">
        <div className="rm-sum-h"><b>{allShifts.length}</b><span>shifts in the next seven days, {crewAll.toLocaleString("en-IE")} crew getting the same run of reminders</span></div>
        <div className="cl-kinds">
          <button className={desk === "all" ? "on" : ""} onClick={() => { setDesk("all"); setAll(false); }}>Every desk <span>{allShifts.length}</span></button>
          {DESKS.map((d) => { const n = allShifts.filter((x) => deskOfShift(x) === d).length; return n ? <button key={d} className={desk === d ? "on" : ""} onClick={() => { setDesk(d); setAll(false); }} style={{ ["--c" as any]: deskVar(d) }}><i />{d.replace(" desk", "")}<span>{n}</span></button> : null; })}
        </div>
      </section>
      <div className="oss-grid oss-main-side" style={{ alignItems: "start" }}>
        <div className="oss-stack">
          {shown.map((sh) => {
            const ev = Q.eventOf(s, sh.eventId);
            const stops = stopsFor(s, sh);
            const nextIdx = stops.findIndex((x) => x.at > now && isOn(x.auto));
            const crew = s.assignments.filter((a) => a.shiftId === sh.id && a.status === "confirmed").length;
            return (
              <section key={sh.id} className="rm-track">
                <header className="rm-h">
                  <DateBadge iso={sh.start} />
                  <span className="grow" style={{ minWidth: 0 }}><b>{ev.name.split(":")[0]}</b><span className="oss-small oss-dim">{sh.label} · {fmtTime(sh.start)} to {fmtTime(sh.end)} · {crew} confirmed</span></span>
                  <Tag c={deskVar(Q.deskOf(ev))} dot={false}>{Q.deskOf(ev).replace(" desk", "")}</Tag>
                  {ms(sh.start) <= now && ms(sh.end) >= now ? <span className="oss-tag live">On now</span> : <span className="oss-tag">Starts {fmtDate(sh.start)} {fmtTime(sh.start)}</span>}
                </header>
                <ol className="rm-line">
                  {stops.map((x, k) => {
                    const past = x.at <= now, off = !isOn(x.auto);
                    return (
                      <li key={x.key} className={(past ? "past" : "") + (k === nextIdx ? " next" : "") + (off ? " off" : "") + (x.office ? " office" : "")}>
                        <span className="node">{past && !x.office && !off ? <Icon d={I.check} size={11} sw={2.6} /> : x.office ? <Icon d={I.user} size={11} sw={2.2} /> : <Icon d={I.bell} size={11} sw={2.2} />}</span>
                        <span className="w">{x.when}{k === nextIdx && <em>Next</em>}</span>
                        <b>{x.label}</b>
                        <span className="st">
                          {off ? "Rule switched off"
                            : x.office ? (x.note || "Office sends")
                            : x.of !== undefined ? (past ? x.sent + " of " + x.of + " sent" : "To " + x.of + " crew, " + fmtDate(new Date(x.at).toISOString()) + " " + fmtTime(new Date(x.at).toISOString()))
                            : past ? (x.sent ? x.sent + " raised" : "None needed") : x.note}
                        </span>
                        {x.office && <button className="oss-link rm-act" onClick={x.office.go}>{x.office.label}</button>}
                      </li>);
                  })}
                </ol>
              </section>);
          })}
          {!shifts.length && <Card><div className="oss-empty"><b>No shifts coming up</b>Reminders line up here as soon as a booking has shifts.</div></Card>}
          {shifts.length > 5 && <div><Btn kind="ghost" onClick={() => setAll(!all)}>{all ? "Show the next five" : "Show all " + shifts.length + " shifts"}</Btn></div>}
        </div>
        <div className="oss-stack">
          <Card title="Waiting on a reply" meta={open.length ? open.length + " offers · oldest " + fmtHM(minutesBetween(open[0].sentAt, s.clock)) + " ago" : "Everyone answered"} icon={I.clock} flush right={open.length > 0 && <Btn size="sm" onClick={() => open.forEach((i) => run(E.remind, i.id))}>Remind all</Btn>}>
            <div className="oss-rows" style={{ maxHeight: 300, overflowY: "auto" }}>
              {open.map((i) => <Row key={i.id} lead={<Av name={Q.nameOf(s, i.workerId)} size="sm" />} title={Q.nameOf(s, i.workerId)} sub={Q.eventOf(s, Q.shiftOf(s, i.shiftId).eventId).name.split(":")[0] + " · " + Q.shiftOf(s, i.shiftId).label + " · " + (i.reminders.length ? "reminded " + i.reminders.length + "×" : "not reminded yet")}
                end={<Btn size="sm" kind="ghost" onClick={() => run(E.remind, i.id)}>Remind</Btn>} />)}
              {!open.length && <div className="oss-empty"><b>Nobody to chase</b></div>}
            </div>
          </Card>
          <Card title="Not reconfirmed" meta={notAck.length ? notAck.length + " haven't answered the day-before check" : "Everyone reconfirmed"} icon={I.alert} flush>
            <div className="oss-rows" style={{ maxHeight: 220, overflowY: "auto" }}>
              {notAck.slice(0, 20).map((x) => <Row key={x.m.id + x.wid} lead={<Av name={Q.nameOf(s, x.wid)} size="sm" />} title={Q.nameOf(s, x.wid)} sub={"Asked " + fmtDate(x.m.at) + ", " + fmtTime(x.m.at)} />)}
              {!notAck.length && <div className="oss-small oss-muted" style={{ padding: "4px 12px 12px" }}>Day-before checks go out {s.rules.dayBeforeH} hours before each shift.</div>}
            </div>
          </Card>
          <Card title="Rules" meta={s.automations.filter((a) => a.on).length + " of " + s.automations.length + " switched on"} icon={I.bell} flush>
            <div className="oss-rows">
              {s.automations.map((a) => <Row key={a.id} lead={<RIcon d={a.id === "AU4" || a.id === "AU5" ? I.alert : I.bell} tone={a.on ? "info" : undefined} />} title={a.name} sub={a.timing + " · " + sentCount(a.id) + " sent"} wrap
                end={<Toggle on={a.on} onChange={(v) => run(E.setAutomation, a.id, v)} label={a.name} />} />)}
            </div>
          </Card>
          <Card title="Recently sent" icon={I.list} flush>
            <div className="oss-rows" style={{ maxHeight: 280, overflowY: "auto" }}>
              {runs.slice(0, 12).map((r) => <Row key={r.id} lead={<RIcon d={I.bell} />} title={r.summary} sub={s.automations.find((a) => a.id === r.automationId)?.name + " · " + fmtDate(r.at) + ", " + fmtTime(r.at)} />)}
              {!runs.length && <div className="oss-small oss-muted" style={{ padding: "4px 12px 12px" }}>Reminders appear here as the event gets closer. Move the story clock to Saturday to see them fire.</div>}
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}
void St;
