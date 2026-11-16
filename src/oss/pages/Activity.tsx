/* Activity: everything that happened, split the way the template does it
   (people in the field, the office, systems and agents), and the audit trail
   underneath: who changed an allocation, a clock time or an approval, and when. */

import "../../styles/oss-biz.css";
import { useMemo, useState } from "react";
import type { AuditEvent, OssState } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { DESKS } from "../network";
import { navigate, openDrawer, useOss } from "../store";
import { tabOf } from "../modules";
import { dayKey, fmtDate, fmtTime } from "../time";
import { Av, Btn, Card, Chip, hueVar, I, Page, Ribbon, Row, RIcon, Search, St, Table, Tag, deskVar } from "../ui/kit";
import { downloadCsv, when } from "../ui/fmt";
import AgentFace from "../../components/AgentFace";

export const openEntity = (s: OssState, a: AuditEvent) => {
  const e = a.entity;
  if (e.type === "event") openDrawer("event", e.id);
  else if (e.type === "worker") openDrawer("worker", e.id);
  else if (e.type === "batch") openDrawer("batch", e.id);
  else if (e.type === "venue") openDrawer("venue", e.id);
  else if (e.type === "client") openDrawer("client", e.id);
  else if (e.type === "assignment" || e.type === "correction" || e.type === "clock" || e.type === "exception" || e.type === "timesheet") {
    const asg = e.type === "assignment" ? e.id : e.type === "correction" ? s.corrections.find((c) => c.id === e.id)?.assignmentId : e.type === "clock" ? s.clocks.find((c) => c.id === e.id)?.assignmentId : e.type === "exception" ? s.exceptions.find((x) => x.id === e.id)?.assignmentId : e.id.replace(/^TS-/, "");
    if (asg) openDrawer("timesheet", asg);
  } else if (e.type === "invitation") { const i = s.invitations.find((x) => x.id === e.id); if (i) openDrawer("worker", i.workerId); }
  else if (e.type === "item") { const it = s.items.find((x) => x.id === e.id); if (it) openDrawer("batch", it.batchId); }
  else if (e.type === "document") { const d = s.documents.find((x) => x.id === e.id); if (d) openDrawer("worker", d.workerId); }
  else if (e.type === "shift") { const sh = s.shifts.find((x) => x.id === e.id); if (sh) openDrawer("event", sh.eventId); }
};

type Lane = "crew" | "office" | "systems";
const DESK_SET = new Set<string>(DESKS);
/** Lane and desk for every audit row, worked out once per change (thousands of crew, hundreds of rows). */
function useAuditIndex(s: OssState) {
  return useMemo(() => {
    const users = new Map(s.users.map((u) => [u.name, u]));
    const crew = new Set(s.workers.map((w) => w.name));
    const lane = new Map<string, Lane>(); const desk = new Map<string, string | null>();
    const evDesk = (eventId: string) => { const e = Q.eventOf(s, eventId); return e ? Q.deskOf(e) : null; };
    for (const a of s.audit) {
      lane.set(a.id, users.has(a.actor) ? "office" : a.actor === "OSS Crew" || crew.has(a.actor) ? "crew" : "systems");
      const e = a.entity; let d: string | null = null;
      if (e.type === "shift") { const sh = Q.shiftOf(s, e.id); d = sh ? evDesk(sh.eventId) : null; }
      else if (e.type === "event") d = evDesk(e.id);
      else if (e.type === "assignment") { const x = Q.asgOf(s, e.id); d = x ? evDesk(Q.shiftOf(s, x.shiftId).eventId) : null; }
      else if (e.type === "batch") { const b = s.batches.find((y) => y.id === e.id); d = b && DESK_SET.has(b.scope) ? b.scope : "Dublin events desk"; }
      if (!d) { const u = users.get(a.actor); if (u && DESK_SET.has(u.team)) d = u.team; }
      desk.set(a.id, d);
    }
    return { lane, desk };
  }, [s.audit, s.users, s.workers]);
}
const laneOf = (s: OssState, a: AuditEvent): Lane => s.users.some((u) => u.name === a.actor) ? "office" : a.actor === "OSS Crew" || s.workers.some((w) => w.name === a.actor) ? "crew" : "systems";

export default function Activity() {
  const s = useOss();
  return tabOf(s, "Activity") === "audit" ? <Audit s={s} /> : <Live s={s} />;
}

function Live({ s }: { s: OssState }) {
  const [desk, setDesk] = useState("all");
  const ix = useAuditIndex(s);
  const today = s.audit.filter((a) => dayKey(a.at) === dayKey(s.clock));
  const all = s.audit.slice().reverse().filter((a) => desk === "all" || ix.desk.get(a.id) === desk);
  const lanes: Record<Lane, AuditEvent[]> = { crew: [], office: [], systems: [] };
  for (const a of all) lanes[ix.lane.get(a.id) || "systems"].push(a);
  const by = (l: Lane) => lanes[l];
  const deskCount = (d: string) => s.audit.filter((a) => ix.desk.get(a.id) === d).length;
  const col = (l: Lane, title: string, sub: string, icon: string) => (
    <Card title={title} meta={sub} icon={icon} right={<span className="oss-tag live">Live</span>} flush>
      <div className="oss-rows" style={{ maxHeight: 640, overflowY: "auto" }}>
        {by(l).slice(0, 30).map((a) => {
          const agent = E.AGENTS.find((x) => x.name === a.actor);
          return <Row key={a.id} onClick={() => openEntity(s, a)} wrap
            lead={agent ? <AgentFace shape={agent.shape} state="complete" tint={agent.tint} size="30" /> : l === "systems" ? <RIcon d={a.actor === "Automation" ? I.bell : I.link} tone="info" /> : <Av name={a.actor} size="sm" />}
            title={a.summary} sub={<>{a.actor + " · " + (dayKey(a.at) === dayKey(s.clock) ? fmtTime(a.at) : fmtDate(a.at) + ", " + fmtTime(a.at)) + (a.result === "rejected" ? " · stopped" : "")}{ix.desk.get(a.id) && <span className="ac-desk"><Tag c={deskVar(ix.desk.get(a.id)!)} dot={false}>{ix.desk.get(a.id)!.replace(" desk", "")}</Tag></span>}</>} />;
        })}
        {!by(l).length && <div className="oss-empty"><b>Quiet so far</b></div>}
      </div>
    </Card>);
  return (
    <Page eyebrow="Activity" title="Everything happening now" sub="Crew answering and checking in, the office allocating and approving, and the systems doing the chasing. The full audit trail sits underneath."
      actions={<Btn icon={I.download} onClick={() => exportAudit(s, s.audit)}>Export audit log</Btn>}>
      <Ribbon items={[
        { label: "Today, up to " + fmtTime(s.clock), value: today.length, sub: "Every change logged", tone: "accent" },
        { label: "From crew", value: by("crew").length, sub: "Replies, availability, check-ins" },
        { label: "From the office", value: by("office").length, sub: "Invites, corrections, approvals" },
        { label: "Systems and agents", value: by("systems").length, sub: "Reminders, alerts, Bullhorn" },
        { label: "Stopped by a rule", value: s.audit.filter((a) => a.result === "rejected").length, sub: "Blocked before it happened", onClick: () => navigate("Activity", "audit") }]} />
      <div className="cl-kinds ac-desks">
        <button className={desk === "all" ? "on" : ""} onClick={() => setDesk("all")}>Every desk <span>{s.audit.length}</span></button>
        {DESKS.map((d) => <button key={d} className={desk === d ? "on" : ""} onClick={() => setDesk(d)} style={{ ["--c" as any]: deskVar(d) }}><i />{d.replace(" desk", "")}<span>{deskCount(d)}</span></button>)}
      </div>
      <div className="oss-grid oss-g3" style={{ alignItems: "start" }}>
        {col("crew", "Crew", "From the OSS Crew app", I.phone)}
        {col("office", "OSS office", "Decisions people made", I.users)}
        {col("systems", "Systems and agents", "Reminders, alerts and handover", I.bolt)}
      </div>
    </Page>
  );
}

function Audit({ s }: { s: OssState }) {
  const [q, setQ] = useState("");
  const [lane, setLane] = useState<"all" | Lane>("all");
  const [day, setDay] = useState("all");
  const [desk, setDesk] = useState("all");
  const ix = useAuditIndex(s);
  const days = Array.from(new Set(s.audit.map((a) => dayKey(a.at)))).sort().reverse();
  const rows = s.audit.filter((a) => (lane === "all" || ix.lane.get(a.id) === lane) && (day === "all" || dayKey(a.at) === day) && (desk === "all" || ix.desk.get(a.id) === desk)
    && (!q || (a.summary + " " + a.entity.label + " " + a.actor).toLowerCase().includes(q.toLowerCase()))).slice().reverse();
  return (
    <Page eyebrow="Audit trail" title="Who changed what, and when" sub="Shift allocations, attendance, timesheets and approvals. Every change is timestamped against a person, with the before and after."
      actions={<Btn icon={I.download} onClick={() => exportAudit(s, rows)}>Export {rows.length}</Btn>}>
      <Card pad={false}>
        <div className="oss-filters" style={{ paddingTop: 16 }}>
          <Search value={q} onChange={setQ} placeholder="Search names or changes" style={{ flex: "1 1 220px", maxWidth: 320 }} />
          {([["all", "Everyone"], ["office", "Office"], ["crew", "Crew"], ["systems", "Systems"]] as const).map(([k, l]) => <Chip key={k} on={lane === k} onClick={() => setLane(k)}>{l}</Chip>)}
          <select className="oss-input" style={{ width: 160, height: 34, borderRadius: 999 }} value={day} onChange={(e) => setDay(e.target.value)} aria-label="Date"><option value="all">Any day</option>{days.map((d) => <option key={d} value={d}>{fmtDate(d + "T12:00:00Z")}</option>)}</select>
          <select className="oss-input" style={{ width: 210, height: 34, borderRadius: 999 }} value={desk} onChange={(e) => setDesk(e.target.value)} aria-label="Desk"><option value="all">Every desk</option>{DESKS.map((d) => <option key={d}>{d}</option>)}</select>
        </div>
        <Table rows={rows} rowKey={(a) => a.id} onRow={(a) => openEntity(s, a)} maxHeight={680} empty={<div className="oss-empty"><b>Nothing matches</b></div>}
          cols={[{ key: "t", label: "When", nowrap: true, render: (a) => when(a.at) }, { key: "a", label: "Who", render: (a) => <span className="oss-row"><Av name={a.actor} size="sm" /><span className="strong">{a.actor}</span></span> },
            { key: "s", label: "What changed", render: (a) => <span>{a.summary}{a.before !== undefined && <div className="oss-tiny oss-muted">{a.before} → {a.after}</div>}</span> },
            { key: "e", label: "Record", render: (a) => <span className="oss-small oss-dim">{a.entity.label}{ix.desk.get(a.id) && <div style={{ marginTop: 4 }}><Tag c={deskVar(ix.desk.get(a.id)!)} dot={false}>{ix.desk.get(a.id)!.replace(" desk", "")}</Tag></div>}</span> },
            { key: "r", label: "", render: (a) => a.result === "rejected" ? <St tone="bad">Stopped</St> : <St tone="ok">Logged</St> }]} />
      </Card>
    </Page>
  );
}

function exportAudit(s: OssState, list: AuditEvent[]) {
  downloadCsv("OSS audit trail.csv", ["When", "Who", "What changed", "Before", "After", "Record", "Outcome"],
    list.map((a) => [fmtDate(a.at) + " " + fmtTime(a.at), a.actor, a.summary, a.before || "", a.after || "", a.entity.label, a.result === "rejected" ? "Stopped" : "Logged"]));
}
