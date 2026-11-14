import { useState } from "react";
import type { AuditEvent, OssState, StoryKey } from "../model";
import { openDrawer, useOss } from "../store";
import { tabOf } from "../modules";
import { dayKey, fmtDate } from "../time";
import { Card, Empty, I, Icon, Page, Scope, Seg, St, Table } from "../ui/kit";
import { when } from "../ui/fmt";

export const STORIES: Record<StoryKey, string> = {
  A: "The Saturday booking", B: "Chloé's cancellation", C: "Arrival is not clock-in", D: "Eligible on the day", E: "Hours must be explainable", F: "A handover can fail safely"
};

const openEntity = (s: OssState, a: AuditEvent) => {
  const e = a.entity;
  if (e.type === "event") openDrawer("event", e.id);
  else if (e.type === "worker") openDrawer("worker", e.id);
  else if (e.type === "batch") openDrawer("batch", e.id);
  else if (e.type === "venue") openDrawer("venue", e.id);
  else if (e.type === "assignment" || e.type === "correction" || e.type === "clock" || e.type === "exception" || e.type === "timesheet") {
    const asg = e.type === "assignment" ? e.id : e.type === "correction" ? s.corrections.find((c) => c.id === e.id)?.assignmentId : e.type === "clock" ? s.clocks.find((c) => c.id === e.id)?.assignmentId : e.type === "exception" ? s.exceptions.find((x) => x.id === e.id)?.assignmentId : e.id.replace(/^TS-/, "");
    if (asg) openDrawer("timesheet", asg);
  } else if (e.type === "invitation") { const i = s.invitations.find((x) => x.id === e.id); if (i) openDrawer("worker", i.workerId); }
  else if (e.type === "item") { const it = s.items.find((x) => x.id === e.id); if (it) openDrawer("batch", it.batchId); }
  else if (e.type === "document") { const d = s.documents.find((x) => x.id === e.id); if (d) openDrawer("worker", d.workerId); }
  else if (e.type === "shift") { const sh = s.shifts.find((x) => x.id === e.id); if (sh) openDrawer("event", sh.eventId); }
};

export default function Activity() {
  const s = useOss();
  const tab = tabOf(s, "Activity");
  const [q, setQ] = useState("");
  const [actor, setActor] = useState("all");
  const [story, setStory] = useState<"all" | StoryKey>("all");
  const [day, setDay] = useState("all");
  const base = s.audit.filter((a) => tab === "all" || (tab === "operations" ? a.category === "operations" : a.category !== "operations"));
  const rows = base.filter((a) => (actor === "all" || a.actor === actor) && (story === "all" || a.story === story) && (day === "all" || dayKey(a.at) === day)
    && (!q || (a.summary + " " + a.entity.label + " " + a.entity.id + " " + a.actor).toLowerCase().includes(q.toLowerCase()))).slice().reverse();
  const actors = Array.from(new Set(base.map((a) => a.actor))).sort();
  const days = Array.from(new Set(base.map((a) => dayKey(a.at)))).sort().reverse();
  const title = tab === "operations" ? "Operations" : tab === "systems" ? "Systems & approvals" : "All activity";
  return (
    <Page title={title} sub="Every change, with who did it, when (scenario time) and what it touched. Rejections are recorded as rejections; simulated steps say so."
      scope={<Scope><b>{rows.length}</b> of {base.length} events</Scope>}>
      <Card pad={false} title={<div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative" }}><Icon d={I.search} size={14} style={{ position: "absolute", left: 11, top: 11, color: "var(--faint)" }} /><input className="oss-input" style={{ width: 240, height: 34, paddingLeft: 32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search names, IDs, actions" aria-label="Search activity" /></div>
        <select className="oss-input" style={{ width: 180, height: 34 }} value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Actor"><option value="all">Any actor</option>{actors.map((a) => <option key={a}>{a}</option>)}</select>
        <select className="oss-input" style={{ width: 150, height: 34 }} value={day} onChange={(e) => setDay(e.target.value)} aria-label="Date"><option value="all">Any date</option>{days.map((d) => <option key={d} value={d}>{fmtDate(d + "T12:00:00Z")}</option>)}</select>
      </div>}
        right={<Seg value={story} onChange={setStory} label="Story" options={[{ id: "all", label: "All stories" }].concat((Object.keys(STORIES) as StoryKey[]).map((k) => ({ id: k, label: k, n: base.filter((a) => a.story === k).length }))) as any} />}>
        {story !== "all" && <div className="oss-small" style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>Story {story}: <b>{STORIES[story]}</b></div>}
        <Table rows={rows} rowKey={(a) => a.id} onRow={(a) => openEntity(s, a)} maxHeight={680} empty={<Empty title="No activity matches" body="Clear a filter to see more." />}
          cols={[{ key: "t", label: "When", nowrap: true, render: (a) => when(a.at) }, { key: "a", label: "Actor", render: (a) => <span className="strong">{a.actor}</span> },
            { key: "s", label: "What happened", render: (a) => <span>{a.summary}{a.before !== undefined && <div className="oss-tiny oss-muted">{a.before} → {a.after}</div>}</span> },
            { key: "e", label: "Record", render: (a) => <span className="oss-small oss-dim">{a.entity.type} · <span className="oss-mono">{a.entity.id}</span></span> },
            { key: "r", label: "Result", render: (a) => a.result === "rejected" ? <St tone="bad">Rejected</St> : a.result === "simulated" ? <St tone="sim">Simulated</St> : <St tone="ok">Recorded</St> },
            { key: "st", label: "Story", render: (a) => a.story ? <span className="oss-pill" title={STORIES[a.story]}>{a.story}</span> : null }]} />
      </Card>
    </Page>
  );
}
