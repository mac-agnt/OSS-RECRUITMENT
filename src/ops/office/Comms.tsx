/* Communications: event and direct threads, structured replies with tallies, and
   messages to one worker, an event crew, selected workers or unconfirmed workers.
   WhatsApp delivery is simulated and labelled. */

import { Fragment, useEffect, useMemo, useState } from "react";
import type { Code, Message, OpsState } from "../model";
import { CODE_LABEL } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { go, setQuery, useRoute } from "../router";
import { actQuiet, office, useOps } from "../store";
import { dayKey, fmtDay, fmtTime, ms, relTime, span } from "../time";
import { Avatar, Btn, Check, Drawer, Field, I, Icon, Notice, Search, Select, Sim, Status, Tabs, Toggle } from "../ui/kit";

const dayLabel = (iso: string, now: string) => (dayKey(iso) === dayKey(now) ? "Today" : dayKey(iso) === dayKey(new Date(ms(now) - 86400e3).toISOString()) ? "Yesterday" : fmtDay(dayKey(iso)));
const D_SMILE = "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M8.500 14.500c1 1.300 2.200 2 3.500 2s2.500-.7 3.500-2 M9 9.500h.01 M15 9.500h.01";
const D_MIC = "M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z M6 11a6 6 0 0 0 12 0 M12 17v4";
const D_ARCHIVE = "M4 6h16v4H4z M5.500 10v9h13v-9 M10 14h4";
const TRAVEL: Code[] = ["on_way", "late", "arrived", "lost", "cant_make"];

export function Bubble({ s, m, wa }: { s: OpsState; m: Message; wa?: boolean }) {
  const fromWorker = m.from.kind === "worker";
  const sys = m.from.kind === "system";
  const t = m.asks ? Q.tally(s, m) : null;
  return (
    <div className={"bubble" + (fromWorker ? "" : " out")}>
      <div className="who">{sys ? "OSS automatic" : fromWorker ? Q.nameOf(s, m.from.id) : Q.nameOf(s, m.from.id) + (m.from.kind === "supervisor" ? " (supervisor)" : "")}
        {!fromWorker && m.to.length > 1 && <span className="dim" style={{ fontWeight: 400 }}> to {m.to.length} crew</span>}
        {!fromWorker && m.to.length === 1 && m.to[0] !== "office" && <span className="dim" style={{ fontWeight: 400 }}> to {Q.nameOf(s, m.to[0])}</span>}</div>
      <div style={{ color: "var(--ink)", whiteSpace: "pre-wrap" }}>{fromWorker && m.code ? <b>{m.body}</b> : m.body}</div>
      {m.asks && <div className="tally">{m.asks.map((c) => <span key={c} className="tag">{CODE_LABEL[c]}</span>)}</div>}
      {t && <div className="tally">{Object.entries(t).map(([k, n]) => <Status key={k} tone={k === "No reply yet" ? "grey" : k === "Cannot make the shift" || k === "Cannot find the location" ? "bad" : k === "Running late" ? "warn" : "ok"} plain>{n} {k.toLowerCase()}</Status>)}</div>}
      <div className="meta">{m.kind !== "message" && m.kind !== "reply" && <span className="kind">{m.kind}</span>}<span>{fmtTime(m.at)}{!fromWorker && <span className="tick">✓✓</span>}</span></div>
    </div>
  );
}

/* ── composer ───────────────────────────────────────────────────────────── */
export function Composer({ eventId, workerId, shiftId, onSent, compact }: { eventId?: string; workerId?: string; shiftId?: string; onSent?: () => void; compact?: boolean }) {
  const s = useOps();
  const [audience, setAudience] = useState<E.Audience>(workerId ? "worker" : shiftId ? "shift" : "event");
  const [shift, setShift] = useState(shiftId || "");
  const [body, setBody] = useState("");
  const [asks, setAsks] = useState<Code[]>([]);
  const [wa, setWa] = useState(true);
  const ev = eventId ? Q.event(s, eventId) : undefined;
  const live = ev ? Q.shiftsOf(s, ev.id).filter((x) => ms(x.end) > ms(s.clock)) : [];
  const form = { audience, eventId, workerIds: workerId ? [workerId] : undefined, shiftId: audience === "shift" ? shift : undefined };
  const n = E.recipients(s, form).length;
  const next = live[0];
  const templates = ev ? [
    { label: "Shift instructions", body: (ev.instructions ? ev.instructions + " " : "") + "Meeting point: " + Q.venue(s, ev.venueId).meeting + ".", asks: [] as Code[] },
    { label: "Reminder", body: next ? "Reminder: you're booked for " + ev.name.split(":")[0] + " on " + fmtDay(dayKey(next.start)) + ", " + span(next.start, next.end) + ". Please confirm you're still available." : "", asks: ["confirmed", "cant_make"] as Code[] },
    { label: "Status request", body: "Quick check before " + ev.name.split(":")[0] + ": are you on your way?", asks: TRAVEL }
  ] : [{ label: "Reminder", body: "Reminder from OSS: please check My shifts in the app for your next booking.", asks: [] as Code[] }];
  const send = () => {
    const r = office(E.sendMessage, { ...form, body, asks, kind: asks.length ? (asks.includes("on_way") ? "status" : "reminder") : "message", whatsapp: wa });
    if (r.ok) { setBody(""); setAsks([]); onSent?.(); }
  };
  const [more, setMore] = useState(false);
  const audLabel = audience === "event" ? "Whole crew" : audience === "unconfirmed" ? "Unconfirmed crew" : "One shift";
  const typed = body.trim().length > 0;
  return (
    <div className="wa-composer">
      {more && (
        <div className="wa-opts">
          {!workerId && ev && (
            <div className="row wrap">
              <span className="small strong">To</span>
              <button className={"chip" + (audience === "event" ? " on" : "")} onClick={() => setAudience("event")}>Whole crew</button>
              <button className={"chip" + (audience === "unconfirmed" ? " on" : "")} onClick={() => setAudience("unconfirmed")}>Unconfirmed</button>
              {live.length > 0 && <button className={"chip" + (audience === "shift" ? " on" : "")} onClick={() => { setAudience("shift"); setShift(shift || live[0].id); }}>One shift</button>}
              {audience === "shift" && <div style={{ width: 240 }}><Select sm label="Shift" value={shift} onChange={setShift} options={live.map((x) => ({ value: x.id, label: x.label + ", " + fmtDay(dayKey(x.start)) + " " + fmtTime(x.start) }))} /></div>}
            </div>
          )}
          {!compact && <div className="row wrap"><span className="small dim">Templates</span>{templates.filter((x) => x.body).map((x) => <button key={x.label} className="chip" onClick={() => { setBody(x.body); setAsks(x.asks); setMore(false); }}>{x.label}</button>)}</div>}
          <div className="row wrap" style={{ gap: 14 }}>
            <Toggle on={wa} onChange={setWa}><span className="small">Also by WhatsApp</span><Sim /></Toggle>
            <Check checked={asks.length > 0} onChange={(v) => setAsks(v ? TRAVEL : [])}><span className="small">Ask for status replies</span></Check>
          </div>
        </div>
      )}
      {!workerId && ev && !more && <button className="wa-to" onClick={() => setMore(true)}>To {audLabel.toLowerCase()} · {n} recipient{n === 1 ? "" : "s"}{asks.length ? " · asks for replies" : ""}</button>}
      <div className="wa-bar">
        <button className="wa-round" title={more ? "Close options" : "Audience, templates and options"} aria-label="Options" aria-expanded={more} onClick={() => setMore((x) => !x)}><Icon d={more ? I.x : I.plus} size={22} /></button>
        <div className="wa-input">
          <textarea rows={1} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Type a message" aria-label="Message"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (typed && n) send(); } }} />
          <Icon d={D_SMILE} size={22} />
        </div>
        <button className="wa-send" title={typed ? "Send" : "Type a message to send"} aria-label="Send" disabled={!typed || !n} onClick={send}><Icon d={typed ? I.send : D_MIC} size={22} /></button>
      </div>
    </div>
  );
}

/* ── thread view ────────────────────────────────────────────────────────── */
function ThreadView({ threadId, workerId, eventId, onBack }: { threadId?: string; workerId?: string; eventId?: string; onBack?: () => void }) {
  const s = useOps();
  const [all, setAll] = useState(false);
  const t = threadId ? Q.threadById(s, threadId) : undefined;
  const wid = workerId || t?.workerId;
  const eid = eventId || t?.eventId;
  const allMsgs = useMemo(() => (t ? Q.messagesOf(s, t.id).slice().sort((a, b) => a.at.localeCompare(b.at)) : []), [s, t]);
  // In event threads, routine replies are summarised in the tallies; problems always show.
  const routine = (m: Message) => t?.kind === "event" && m.kind === "reply" && !!m.code && ["confirmed", "on_way", "arrived", "declined"].includes(m.code);
  const hidden = allMsgs.filter(routine).length;
  const msgs = all ? allMsgs : allMsgs.filter((m) => !routine(m));
  const unread = allMsgs.filter((m) => m.to.includes("office") && !m.read.office).length;
  // Where the "unread messages" divider goes: fixed when the chat is opened, before it is marked read.
  const [firstUnread] = useState(() => ({ id: allMsgs.find((m) => m.to.includes("office") && !m.read.office)?.id, n: unread }));
  useEffect(() => { if (t && unread) actQuiet(s.ui.officeId, E.markRead, "office", t.id); }, [t?.id, unread]);
  const next = wid ? Q.asgsOfWorker(s, wid).filter((a) => a.status === "confirmed" && ms(Q.shift(s, a.shiftId).end) > ms(s.clock)).map((a) => Q.shift(s, a.shiftId)).sort((a, b) => a.start.localeCompare(b.start))[0] : undefined;
  const pinned = eid && Q.event(s, eid) ? "Meeting point: " + Q.venue(s, Q.event(s, eid).venueId).meeting : next ? "Next: " + Q.event(s, next.eventId).name.split(":")[0] + ", " + fmtDay(dayKey(next.start)) + " " + fmtTime(next.start) : "";
  const title = t?.title || (wid ? Q.worker(s, wid).name : eid ? Q.event(s, eid).name : "");
  return (
    <div className="thread wa-skin">
      <div className="thread-h">
        <div className="row">
          {onBack && <button className="wa-back" title="Back to chats" aria-label="Back to chats" onClick={onBack}><Icon d={I.chevL} size={20} /></button>}
          {wid ? <Avatar name={title} /> : <span className="avatar grp"><Icon d={I.events} size={18} /></span>}
          <div className="stack" style={{ gap: 0 }}>
            <span className="strong">{title}</span>
            <span className="tiny dim">{wid ? Q.worker(s, wid).mobile + " · " + Q.worker(s, wid).roles.join(", ") : eid ? Q.client(s, Q.event(s, eid).clientId).name + " · event thread" : ""}</span>
          </div>
        </div>
        <div className="wa-cap">
          {wid && <button title="Open profile" aria-label="Open profile" onClick={() => go("/crew/" + wid)}><Icon d={I.user} size={20} /></button>}
          {eid && <button title="Open event" aria-label="Open event" onClick={() => go("/events/" + eid + "?tab=roster")}><Icon d={I.events} size={20} /></button>}
        </div>
      </div>
      {pinned && <div className="wa-pin"><Icon d={I.pin} size={15} /><span>{pinned}</span></div>}
      <div className="thread-b">
        <div className="wa-note">Simulated WhatsApp. No WhatsApp account is connected and nothing is sent to real phones.</div>
        {!allMsgs.length && <div className="empty"><b>No messages yet</b>Write the first one below.</div>}
        {hidden > 0 && <button className="linkbtn small" style={{ alignSelf: "center" }} onClick={() => setAll((x) => !x)}>{all ? "Hide routine replies" : hidden + " routine replies (confirmed, on my way, arrived) are counted in the tallies. Show them"}</button>}
        {msgs.map((m, i) => <Fragment key={m.id}>{(i === 0 || dayKey(m.at) !== dayKey(msgs[i - 1].at)) && <div className="wa-date">{dayLabel(m.at, s.clock)}</div>}{m.id === firstUnread.id && <div className="wa-unread">{firstUnread.n} unread message{firstUnread.n === 1 ? "" : "s"}</div>}<Bubble s={s} m={m} /></Fragment>)}
      </div>
      <div className="thread-f"><Composer key={(wid || "") + (eid || "")} workerId={wid} eventId={wid ? undefined : eid} compact={!!wid} /></div>
    </div>
  );
}

/** Messages tab inside an event workspace. */
export function EventMessages({ eventId }: { eventId: string }) {
  return <div className="panel" style={{ overflow: "hidden", height: "min(720px, calc(100dvh - 260px))", display: "flex" }}><div style={{ flex: 1, minWidth: 0, display: "flex" }}><ThreadView threadId={"T-" + eventId} eventId={eventId} /></div></div>;
}

/** Direct thread with one worker (crew profile). */
export function DirectMessages({ workerId }: { workerId: string }) {
  const s = useOps();
  const id = "T-" + workerId;
  return <div className="panel" style={{ overflow: "hidden", height: "min(640px, calc(100dvh - 300px))", display: "flex" }}><div style={{ flex: 1, minWidth: 0, display: "flex" }}>
    <ThreadView threadId={s.threads.some((t) => t.id === id) ? id : undefined} workerId={workerId} /></div></div>;
}

/* ── new message drawer ─────────────────────────────────────────────────── */
function NewMessage({ onClose, preset }: { onClose: () => void; preset?: { event?: string; shift?: string } }) {
  const s = useOps();
  const [mode, setMode] = useState<"event" | "worker" | "selected" | "offers">(preset?.event ? "event" : "event");
  const [eventId, setEventId] = useState(preset?.event || Q.eventsOnDay(s, dayKey(s.clock))[0]?.id || "");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const upcoming = s.events.filter((e) => e.status === "confirmed" && Q.eventPhase(s, e.id) !== "done").sort((a, b) => Q.eventSpan(s, a.id).start.localeCompare(Q.eventSpan(s, b.id).start));
  const matches = q.trim().length >= 2 ? s.workers.filter((w) => w.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  return (
    <Drawer title="New message" sub="Goes to the OSS Crew app and, simulated, WhatsApp." onClose={onClose}>
      <div className="stack g16">
        <Tabs label="Send to" value={mode} onChange={(v) => { setMode(v); setPicked([]); }} items={[{ id: "event", label: "Event crew" }, { id: "worker", label: "One worker" }, { id: "selected", label: "Selected workers" }, { id: "offers", label: "Job offers" }]} />
        {mode === "event" && <>
          <Field label="Event"><Select value={eventId} onChange={setEventId} options={upcoming.map((e) => ({ value: e.id, label: e.name + " (" + fmtDay(dayKey(Q.eventSpan(s, e.id).start)) + ")" }))} /></Field>
          {eventId && <Composer key={eventId} eventId={eventId} shiftId={preset?.shift} onSent={onClose} />}
        </>}
        {(mode === "worker" || mode === "selected") && <>
          <Search value={q} onChange={setQ} placeholder="Search crew by name" autoFocus />
          <div className="stack" style={{ gap: 4 }}>
            {matches.map((w) => (
              <button key={w.id} className="item" style={{ border: "1px solid var(--border)", borderRadius: 8, background: picked.includes(w.id) ? "var(--accent-soft)" : "var(--surface)", padding: "8px 10px", textAlign: "left", cursor: "pointer" }}
                onClick={() => setPicked((p) => (mode === "worker" ? [w.id] : p.includes(w.id) ? p.filter((x) => x !== w.id) : [...p, w.id]))}>
                <b className="ink">{w.name}</b> <span className="small dim">{w.roles.join(", ")} · {w.area}</span>
              </button>
            ))}
          </div>
          {picked.length > 0 && <div className="row wrap">{picked.map((id) => <span key={id} className="tag">{Q.worker(s, id).name}</span>)}</div>}
          {mode === "worker" && picked[0] && <Composer key={picked[0]} workerId={picked[0]} onSent={onClose} />}
          {mode === "selected" && picked.length > 0 && <SelectedComposer ids={picked} onSent={onClose} />}
        </>}
        {mode === "offers" && <>
          <Notice tone="info">Job offers go out from the event's Find crew panel, so every acceptance updates the roster and first come, first served applies.</Notice>
          <div className="stack" style={{ gap: 6 }}>
            {upcoming.filter((e) => Q.eventCov(s, e.id).outstanding > 0).slice(0, 10).map((e) => {
              const c = Q.eventCov(s, e.id);
              return <button key={e.id} className="btn" style={{ justifyContent: "space-between", height: "auto", padding: "10px 12px" }} onClick={() => { onClose(); go("/events/" + e.id + "?tab=roster&fill=1"); }}>
                <span className="stack" style={{ gap: 0, alignItems: "flex-start" }}><b>{e.name}</b><span className="tiny dim">{fmtDay(dayKey(Q.eventSpan(s, e.id).start))}</span></span><span className="tone-bad num">{c.outstanding} open</span></button>;
            })}
          </div>
        </>}
      </div>
    </Drawer>
  );
}
function SelectedComposer({ ids, onSent }: { ids: string[]; onSent: () => void }) {
  const [body, setBody] = useState("");
  const [wa, setWa] = useState(true);
  return (
    <div className="stack g8">
      <textarea className="textarea" value={body} onChange={(e) => setBody(e.target.value)} placeholder={"Message to " + ids.length + " workers"} aria-label="Message" />
      <div className="row between"><Toggle on={wa} onChange={setWa}><span className="small">Also by WhatsApp</span><Sim /></Toggle>
        <Btn kind="primary" icon={I.send} disabled={!body.trim()} onClick={() => { if (office(E.sendMessage, { audience: "selected", workerIds: ids, body, whatsapp: wa }).ok) onSent(); }}>Send to {ids.length}</Btn></div>
    </div>
  );
}

/* ── page ───────────────────────────────────────────────────────────────── */
export default function Comms({ threadId }: { threadId?: string }) {
  const s = useOps();
  const r = useRoute();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "events" | "people" | "archived">("all");
  const workerParam = r.q.get("worker") || undefined;
  const eventParam = r.q.get("event") || undefined;
  const [composing, setComposing] = useState(r.q.get("new") === "1" || (!!eventParam && !threadId));
  const threads = useMemo(() => s.threads.map((t) => Q.threadSummary(s, t)).filter((x) => x.count > 0)
    .sort((a, b) => (b.last?.at || "").localeCompare(a.last?.at || "")), [s]);
  const isArchived = (t: { kind: string; eventId?: string }) => t.kind === "event" && !!t.eventId && !!Q.event(s, t.eventId) && Q.eventPhase(s, t.eventId) === "done";
  const isPinned = (t: { kind: string; eventId?: string }) => t.kind === "event" && !!t.eventId && !!Q.event(s, t.eventId) && dayKey(Q.eventSpan(s, t.eventId).start) === dayKey(s.clock) && Q.eventPhase(s, t.eventId) !== "done";
  const archivedN = threads.filter((x) => isArchived(x.t)).length;
  const shown = threads.filter((x) => (filter === "archived" ? isArchived(x.t) : !isArchived(x.t) && (filter === "all" || (filter === "unread" ? x.unread > 0 : filter === "events" ? x.t.kind === "event" : x.t.kind === "direct")))
    && (!q || x.t.title.toLowerCase().includes(q.toLowerCase())));
  const directForWorker = workerParam ? "T-" + workerParam : undefined;
  const openId = threadId || directForWorker;
  const unread = threads.reduce((n, x) => n + x.unread, 0);
  return (
    <div className={"comms wa-skin" + (openId ? " has-thread" : "")}>
      <div className="comms-list">
        <div className="wa-list-h">
          <div className="wa-title"><button className="wa-round dark" title="Mark all as read" aria-label="Mark all as read" onClick={() => threads.filter((x) => x.unread > 0).forEach((x) => actQuiet(s.ui.officeId, E.markRead, "office", x.t.id))}><Icon d={I.more} size={20} /></button>
            <h2>Chats</h2><button className="wa-round" title="New message" aria-label="New message" onClick={() => setComposing(true)}><Icon d={I.plus} size={24} /></button></div>
          <Search value={q} onChange={setQ} placeholder="Search" />
          <div className="row wrap" style={{ gap: 8 }}>
            {(["all", "unread", "events", "people"] as const).map((f) => <button key={f} className={"chip" + (filter === f ? " on" : "")} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "unread" ? "Unread" : f === "events" ? "Groups" : "People"}{f === "unread" && unread ? <span className="num dim"> {unread}</span> : null}</button>)}
          </div>
        </div>
        <div className="items">
          {archivedN > 0 && filter !== "archived" && <button className="wa-arch" onClick={() => setFilter("archived")}><Icon d={D_ARCHIVE} size={22} /><span>Archived</span><span className="num">{archivedN}</span></button>}
          {filter === "archived" && <button className="wa-arch" onClick={() => setFilter("all")}><Icon d={I.chevL} size={22} /><span>Back to chats</span></button>}
          {!shown.length && <div className="empty">No chats.</div>}
          {shown.map(({ t, last, unread: u }) => (
            <button key={t.id} className={"thread-item" + (openId === t.id ? " on" : "")} onClick={() => go("/comms/" + t.id)}>
              {t.kind === "direct" ? <Avatar name={t.title} /> : <span className="avatar grp"><Icon d={I.events} size={22} /></span>}
              <span className="stack grow" style={{ gap: 2 }}>
                <span className="row between"><span className="t ellip">{t.title}</span><span className={"tiny nowrap" + (u > 0 ? " hot" : " dim")}>{last ? relTime(last.at, s.clock) : ""}</span></span>
                <span className="row between"><span className="p">{last ? (last.from.kind === "worker" ? Q.nameOf(s, last.from.id).split(" ")[0] + ": " : "✓✓ ") + (last.code ? CODE_LABEL[last.code] : last.body) : ""}</span>
                  {u > 0 ? <span className="wa-badge">{u}</span> : isPinned(t) ? <Icon d={I.pin} size={16} /> : null}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
      {openId ? <ThreadView key={openId} threadId={s.threads.some((t) => t.id === openId) ? openId : undefined} workerId={workerParam && !threadId ? workerParam : undefined} onBack={() => go("/comms")} />
        : <div className="thread wa-skin" style={{ alignItems: "center", justifyContent: "center" }}><div className="empty"><b>Pick a thread</b>Or start a new message to a worker, an event crew or a selection.<div style={{ marginTop: 12 }}><Btn kind="primary" icon={I.plus} onClick={() => setComposing(true)}>New message</Btn></div></div></div>}
      {composing && <NewMessage preset={{ event: eventParam, shift: r.q.get("shift") || undefined }} onClose={() => { setComposing(false); if (r.q.get("new") || eventParam) setQuery({ new: null, event: null, shift: null }); }} />}
    </div>
  );
}
