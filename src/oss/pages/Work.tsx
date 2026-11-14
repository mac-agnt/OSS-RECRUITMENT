import { useState } from "react";
import type { OssState, WorkflowTask } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { navigate, openDrawer, run, useOss } from "../store";
import { tabOf } from "../modules";
import { fmtDate, fmtTime, ms } from "../time";
import { Btn, Card, Empty, I, Metric, Page, S, Seg, St, Table } from "../ui/kit";
import { RecLink, when } from "../ui/fmt";

export default function Work() {
  const s = useOss();
  const tab = tabOf(s, "Work");
  if (tab === "board") return <Board s={s} />;
  if (tab === "approvals") return <ApprovalsHub s={s} />;
  if (tab === "comms") return <Comms s={s} />;
  if (tab === "automations") return <Automations s={s} />;
  return <Mine s={s} />;
}

const openRelated = (t: WorkflowTask) => {
  const r = t.related; if (!r) return;
  if (r.type === "event") navigate("Staffing", "allocation", { kind: "event", id: r.id });
  else if (r.type === "document") navigate("Workforce", "documents");
  else if (r.type === "worker" && t.kind === "mapping") openDrawer("mapping", r.id);
  else if (r.type === "worker") openDrawer("worker", r.id);
  else if (r.type === "venue") openDrawer("venue", r.id);
  else if (r.type === "assignment") navigate("Staffing", "replacements");
  else if (r.type === "exception") navigate("Live Operations", "exceptions");
};
function TaskRow({ s, t }: { s: OssState; t: WorkflowTask }) {
  const late = t.status !== "done" && ms(t.due) < ms(s.clock);
  return <>
    <div className="oss-row"><b className="grow oss-ink oss-small">{t.title}</b><St tone={t.priority === "High" ? "warn" : "neutral"}>{t.priority}</St></div>
    <div className="oss-tiny oss-muted" style={{ marginTop: 4 }}>{Q.nameOf(s, t.ownerId)} · {t.dept} · due {fmtDate(t.due)} {fmtTime(t.due)}{late ? " · overdue" : ""}</div>
    {t.related && <div style={{ marginTop: 6 }}><button className="oss-link oss-small" onClick={() => openRelated(t)}>{t.related.label}</button></div>}
    {t.doneReason && <div className="oss-tiny" style={{ marginTop: 4, color: "var(--ok)" }}>Closed: {t.doneReason}</div>}
  </>;
}

function Mine({ s }: { s: OssState }) {
  const p = Q.persona(s);
  const mine = s.tasks.filter((t) => t.ownerId === p.id).sort((a, b) => (a.status === "done" ? 1 : 0) - (b.status === "done" ? 1 : 0) || a.due.localeCompare(b.due));
  return (
    <Page title="My work" sub={<>Tasks owned by <b>{p.name}</b>. Switch persona in the header to see another person's queue. Tasks with a real prerequisite close themselves when it is met.</>}>
      <Card pad={false}>
        <Table rows={mine} rowKey={(t) => t.id} empty={<Empty title={"Nothing assigned to " + p.name.split(" ")[0]} body="Try Darragh, Nessa, Emma or Aoife from the persona switcher." />}
          cols={[{ key: "t", label: "Task", render: (t) => <span><span className="strong">{t.title}</span>{t.related && <div><button className="oss-link oss-small" onClick={() => openRelated(t)}>{t.related.label}</button></div>}</span> },
            { key: "d", label: "Due", nowrap: true, render: (t) => <span style={{ color: t.status !== "done" && ms(t.due) < ms(s.clock) ? "var(--bad)" : undefined }}>{fmtDate(t.due)} {fmtTime(t.due)}</span> },
            { key: "p", label: "Priority", render: (t) => t.priority }, { key: "dp", label: "Department", render: (t) => t.dept }, { key: "src", label: "Source", render: (t) => <span className="oss-small oss-dim">{t.source}</span> },
            { key: "s", label: "Status", render: (t) => <S s={t.status === "done" ? "Resolved" : t.status === "blocked" ? "Blocked" : t.status === "in_progress" ? "In progress" : "Open"} /> },
            { key: "a", label: "", render: (t) => t.status !== "done" ? <span style={{ display: "flex", gap: 6 }}>{t.status === "open" && <Btn size="sm" onClick={() => run(E.setTaskStatus, t.id, "in_progress")}>Start</Btn>}<Btn size="sm" kind="ghost" onClick={() => run(E.setTaskStatus, t.id, "done")}>Mark done</Btn></span> : null }]} />
      </Card>
    </Page>
  );
}

function Board({ s }: { s: OssState }) {
  const [dept, setDept] = useState("Events");
  const tasks = s.tasks.filter((t) => dept === "All" || t.dept === dept);
  const lanes: [WorkflowTask["status"], string][] = [["open", "Open"], ["in_progress", "In progress"], ["blocked", "Blocked"], ["done", "Done"]];
  const depts = ["All", ...Array.from(new Set(s.tasks.map((t) => t.dept)))];
  return (
    <Page title="Team board" sub="Moving a card never completes the work behind it. Replacement, review and mapping tasks close only when the record changes."
      actions={<Seg value={dept} onChange={setDept} options={depts.map((d) => ({ id: d, label: d, n: s.tasks.filter((t) => (d === "All" || t.dept === d) && t.status !== "done").length }))} />}>
      <div className="oss-board">
        {lanes.map(([st, label]) => { const list = tasks.filter((t) => t.status === st); return (
          <div key={st} className="oss-lane"><h3><span style={{ flex: 1 }}>{label}</span><span>{list.length}</span></h3>
            {list.map((t) => <div key={t.id} className="oss-task"><TaskRow s={s} t={t} />
              {st !== "done" && <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {lanes.filter(([x]) => x !== st).map(([x, l]) => <Btn key={x} size="sm" kind="ghost" onClick={() => run(E.setTaskStatus, t.id, x)}>{l}</Btn>)}</div>}
            </div>)}
            {!list.length && <div className="oss-tiny oss-muted" style={{ padding: 6 }}>Empty</div>}
          </div>); })}
      </div>
    </Page>
  );
}

function ApprovalsHub({ s }: { s: OssState }) {
  const corr = s.corrections.filter((c) => c.status === "proposed");
  const ready = Q.lines(s).filter((l) => l.status === "ready");
  const docs = s.documents.filter((d) => d.review === "pending");
  const props = s.proposals.filter((p) => p.status === "pending");
  return (
    <Page title="Approvals" sub="Everything waiting for a person, in one place. Each button uses the same permission check as its owning module.">
      <div className="oss-grid oss-g4" style={{ marginBottom: 14 }}>
        <Metric label="Hour corrections" value={corr.length} onClick={() => navigate("Timesheets", "corrections")} sub="Events Manager or Director" />
        <Metric label="Timesheet lines ready" value={ready.length} onClick={() => navigate("Timesheets", "approvals")} sub="Events Manager or Director" />
        <Metric label="Documents to review" value={docs.length} onClick={() => navigate("Workforce", "documents")} sub="Compliance Administrator" />
        <Metric label="Agent proposals" value={props.length} onClick={() => navigate("Agents", "approvals")} sub="Coordinator or manager" />
      </div>
      <div className="oss-grid oss-g2">
        <Card title="Corrections" pad={false}><Table rows={corr} rowKey={(c) => c.id} empty={<Empty title="None waiting" />}
          cols={[{ key: "w", label: "Worker", render: (c) => Q.nameOf(s, Q.asgOf(s, c.assignmentId).workerId) }, { key: "c", label: "Change", render: (c) => "Clock-" + c.field + " " + (c.original ? fmtTime(c.original) : "missing") + " → " + fmtTime(c.proposed) },
            { key: "a", label: "", render: (c) => <span style={{ display: "flex", gap: 6 }}><Btn size="sm" kind="primary" onClick={() => run(E.decideCorrection, c.id, true)}>Approve</Btn><Btn size="sm" onClick={() => run(E.decideCorrection, c.id, false)}>Reject</Btn></span> }]} /></Card>
        <Card title="Documents" pad={false}><Table rows={docs} rowKey={(d) => d.id} empty={<Empty title="None waiting" />}
          cols={[{ key: "w", label: "Worker", render: (d) => Q.nameOf(s, d.workerId) }, { key: "t", label: "Type", render: (d) => d.type },
            { key: "a", label: "", render: (d) => <span style={{ display: "flex", gap: 6 }}><Btn size="sm" kind="primary" onClick={() => run(E.reviewDocument, d.id, "approved")}>Approve</Btn><Btn size="sm" onClick={() => run(E.reviewDocument, d.id, "rejected")}>Reject</Btn></span> }]} /></Card>
        <Card title="Timesheet lines" pad={false} right={ready.length ? <Btn size="sm" onClick={() => navigate("Timesheets", "approvals")}>Review and approve</Btn> : undefined}><Table rows={ready.slice(0, 8)} rowKey={(l) => l.id} onRow={(l) => openDrawer("timesheet", l.asg.id)} empty={<Empty title="None waiting" />}
          cols={[{ key: "w", label: "Worker", render: (l) => l.worker.name }, { key: "e", label: "Shift", render: (l) => l.event.name.split(":")[0] + " " + l.shift.label.toLowerCase() }]} /></Card>
        <Card title="Agent proposals" pad={false}><Table rows={props} rowKey={(p) => p.id} empty={<Empty title="None waiting" />}
          cols={[{ key: "t", label: "Proposal", render: (p) => p.title }, { key: "a", label: "", render: (p) => <span style={{ display: "flex", gap: 6 }}><Btn size="sm" kind="primary" onClick={() => run(E.decideProposal, p.id, true)}>Approve</Btn><Btn size="sm" onClick={() => run(E.decideProposal, p.id, false)}>Dismiss</Btn></span> }]} /></Card>
      </div>
    </Page>
  );
}

function Comms({ s }: { s: OssState }) {
  const focusEv = s.ui.focus?.kind === "event" ? s.ui.focus.id : "EVT-001";
  const [eventId, setEventId] = useState(focusEv);
  const shifts = Q.shiftsOfEvent(s, eventId);
  const [shiftId, setShiftId] = useState<string>(shifts.find((x) => x.id === "SH-001B")?.id || shifts[0]?.id || "");
  const [aud, setAud] = useState<"confirmed" | "awaiting" | "standby">("confirmed");
  const [body, setBody] = useState("Saturday evening at 3Arena: safety boots, hi-vis and gloves are required. Gloves will not be supplied on site. Please acknowledge.");
  const [thread, setThread] = useState<string | null>(null);
  const sh = shiftId ? Q.shiftOf(s, shiftId) : null;
  const recips = !sh ? [] : aud === "confirmed" ? s.assignments.filter((a) => a.shiftId === shiftId && a.status === "confirmed").map((a) => a.workerId)
    : aud === "awaiting" ? s.invitations.filter((i) => i.shiftId === shiftId && Q.isActiveInvite(s, i)).map((i) => i.workerId) : s.standby.filter((b) => b.shiftId === shiftId).map((b) => b.workerId);
  const excluded = !sh ? [] : s.assignments.filter((a) => a.shiftId === shiftId && a.status !== "confirmed").map((a) => Q.nameOf(s, a.workerId) + " (" + a.status + ")");
  const sent = s.messages.filter((m) => m.kind === "event" || m.kind === "bulk").slice().reverse().slice(0, 12);
  const threads = s.threads.filter((t) => t.kind === "direct");
  const tmsgs = thread ? s.messages.filter((m) => m.threadId === thread) : [];
  const stats = (m: OssState["messages"][0]) => { const r = Object.values(m.receipts); return { d: r.length, read: r.filter((x) => x.read).length, ack: r.filter((x) => x.ack).length }; };
  return (
    <Page title="Communications" sub="Individual conversations, event groups and filtered bulk messages. Delivery, read, acknowledged and shift accepted are four different facts. In-app only; no SMS, push or email is sent.">
      <div className="oss-grid oss-g2" style={{ alignItems: "start" }}>
        <Card title="Compose to a roster">
          <div style={{ display: "grid", gap: 10 }}>
            <div className="oss-grid oss-g2">
              <label className="oss-field"><span className="oss-label">Booking</span><select className="oss-input" value={eventId} onChange={(e) => { setEventId(e.target.value); setShiftId(Q.shiftsOfEvent(s, e.target.value)[0]?.id || ""); }}>{s.events.filter((e) => !e.historical && e.status === "confirmed").map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
              <label className="oss-field"><span className="oss-label">Shift</span><select className="oss-input" value={shiftId} onChange={(e) => setShiftId(e.target.value)}>{shifts.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
            </div>
            <Seg value={aud} onChange={setAud} label="Audience" options={[{ id: "confirmed", label: "Confirmed" }, { id: "awaiting", label: "Awaiting reply" }, { id: "standby", label: "Standby" }]} />
            <textarea className="oss-input" rows={4} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Message" />
            <div className="oss-note"><b>{recips.length} recipients</b> · channel: in-app (simulated){excluded.length ? " · excluded: " + excluded.join(", ") : ""}{recips.length ? <div className="oss-tiny" style={{ marginTop: 4 }}>{recips.map((w) => Q.nameOf(s, w)).join(", ")}</div> : null}</div>
            <div><Btn kind="primary" icon={I.send} disabled={!recips.length || !body.trim()} onClick={() => { if (window.confirm("Send this in-app message to " + recips.length + " people? (Simulated; no external delivery.)")) run(E.sendBulk, { workerIds: recips, body, eventId, audience: (aud === "confirmed" ? "Confirmed" : aud === "awaiting" ? "Awaiting reply" : "Standby") + " · " + Q.eventOf(s, eventId).name.split(":")[0] + " " + (sh?.label.toLowerCase() || "") }); }}>Send to {recips.length}</Btn></div>
          </div>
        </Card>
        <Card title="Sent to groups" pad={false}>
          <Table rows={sent} rowKey={(m) => m.id} empty={<Empty title="No group messages yet" />}
            cols={[{ key: "a", label: "Audience", render: (m) => <span className="oss-small"><span className="strong">{m.audience || "Group"}</span><div className="oss-tiny oss-muted">{when(m.at)}</div></span> },
              { key: "d", label: "Delivered", num: true, render: (m) => stats(m).d }, { key: "r", label: "Read", num: true, render: (m) => stats(m).read }, { key: "k", label: "Acknowledged", num: true, render: (m) => stats(m).ack }]} />
        </Card>
      </div>
      <div className="oss-grid oss-side-main" style={{ marginTop: 14, alignItems: "start" }}>
        <Card title="Conversations" pad={false}>
          <div className="oss-list" style={{ padding: "4px 0" }}>{threads.map((t) => { const last = s.messages.filter((m) => m.threadId === t.id).pop(); return (
            <button key={t.id} className="oss-attn" style={{ padding: "10px 14px", background: thread === t.id ? "var(--accent-faint)" : undefined }} onClick={() => setThread(t.id)}>
              <span style={{ flex: 1, minWidth: 0 }}><div className="t">{t.title}</div><div className="s oss-ellip">{last?.body || "No messages"}</div></span></button>); })}</div>
        </Card>
        <Card title={thread ? s.threads.find((t) => t.id === thread)!.title : "Select a conversation"}>
          {thread ? <div className="oss-list">{tmsgs.map((m) => <div key={m.id}><div className="oss-row"><b className="oss-small oss-ink">{m.from.kind === "worker" ? Q.nameOf(s, m.from.id) : m.from.kind === "system" ? "Automation" : Q.nameOf(s, m.from.id)}</b><span className="oss-tiny oss-muted">{when(m.at)} · {m.kind}</span>
            {m.recipients[0] && m.receipts[m.recipients[0]] && (m.receipts[m.recipients[0]].ack ? <St tone="ok">Acknowledged</St> : m.receipts[m.recipients[0]].read ? <St tone="neutral">Read</St> : <St tone="sim">Delivered (simulated)</St>)}</div>
            <div className="oss-small" style={{ marginTop: 3 }}>{m.body}</div></div>)}
            <ReplyBox s={s} threadId={thread} /></div> : <Empty title="Pick a conversation on the left" />}
        </Card>
      </div>
    </Page>
  );
}
function ReplyBox({ s, threadId }: { s: OssState; threadId: string }) {
  const t = s.threads.find((x) => x.id === threadId)!;
  const [b, setB] = useState("");
  if (!t.workerId) return null;
  return <div style={{ display: "flex", gap: 8 }}><input className="oss-input" value={b} onChange={(e) => setB(e.target.value)} placeholder={"Message " + t.title} aria-label="Reply" /><Btn kind="primary" disabled={!b.trim()} onClick={() => { run(E.sendBulk, { workerIds: [t.workerId!], body: b, audience: t.title }); setB(""); }}>Send</Btn></div>;
}

function Automations({ s }: { s: OssState }) {
  return (
    <Page title="Automations" sub="Triggers run only when scenario time is advanced, never on the real clock, and each run is deduplicated per assignment, trigger and shift version. Edits affect this local simulation only.">
      <Card pad={false}>
        <Table rows={s.automations} rowKey={(a) => a.id}
          cols={[{ key: "n", label: "Automation", render: (a) => <span className="strong">{a.name}</span> }, { key: "t", label: "Trigger", render: (a) => a.trigger }, { key: "r", label: "Recipient", render: (a) => a.recipient },
            { key: "w", label: "Timing", render: (a) => a.key === "dayBeforeH" ? s.rules.dayBeforeH + " hours before" : a.key === "arrivalPromptH" ? s.rules.arrivalPromptH + " hours before" : a.key === "missedClockMin" ? s.rules.missedClockMin + " min after" : a.timing },
            { key: "c", label: "Conditions", render: (a) => <span className="oss-small oss-dim">{a.conditions}</span> },
            { key: "l", label: "Last run", render: (a) => { const r = s.autoRuns.filter((x) => x.automationId === a.id); return r.length ? <span className="oss-small">{when(r[r.length - 1].at)}<div className="oss-tiny oss-muted">{r.length} run{r.length > 1 ? "s" : ""}</div></span> : <span className="oss-muted oss-small">Not yet</span>; } },
            { key: "o", label: "State", render: (a) => <span style={{ display: "flex", gap: 6, alignItems: "center" }}><St tone={a.on ? "ok" : "neutral"}>{a.on ? "On" : "Paused"}</St><Btn size="sm" kind="ghost" onClick={() => run(E.setAutomation, a.id, !a.on)}>{a.on ? "Pause" : "Enable"}</Btn></span> }]} />
      </Card>
      <div className="oss-small oss-muted" style={{ marginTop: 10 }}>Timings are demo assumptions; change them in Settings, Rules. <RecLink kind="event" id="EVT-001">See runs on the 3Arena booking</RecLink>.</div>
    </Page>
  );
}
