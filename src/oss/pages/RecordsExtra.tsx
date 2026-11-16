import { useState } from "react";
import type { OssState } from "../model";
import * as Q from "../selectors";
import { openDrawer, useOss } from "../store";
import { fmtDate, fmtHM, fmtTime } from "../time";
import { Card, Empty, I, Icon, Page, S, Seg, St, Table } from "../ui/kit";
import { when } from "../ui/fmt";

/* Directory, Venues and Audit references sit after Ontology, Files and Contacts. */
export default function RecordsExtra({ section }: { section: string }) {
  const s = useOss();
  if (section === "venues") return <Venues s={s} />;
  if (section === "audit") return <AuditRefs s={s} />;
  return <Directory s={s} />;
}

type Hit = { kind: string; id: string; label: string; sub: string; open: () => void };
function search(s: OssState, q: string): Hit[] {
  const t = q.toLowerCase();
  const hits: Hit[] = [];
  const m = (x: string) => x.toLowerCase().includes(t);
  s.workers.forEach((w) => m(w.name + " " + w.id + " " + w.email) && hits.push({ kind: "Worker", id: w.id, label: w.name, sub: w.roles.join(", ") + " · " + w.locality, open: () => openDrawer("worker", w.id) }));
  s.events.forEach((e) => m(e.name + " " + e.id) && hits.push({ kind: "Event", id: e.id, label: e.name, sub: Q.clientOf(s, e.clientId).name + " · " + e.date, open: () => openDrawer("event", e.id) }));
  s.shifts.forEach((x) => m(x.label + " " + x.id + " " + Q.eventOf(s, x.eventId).name) && hits.push({ kind: "Shift", id: x.id, label: Q.eventOf(s, x.eventId).name + ", " + x.label, sub: fmtDate(x.start) + " " + fmtTime(x.start), open: () => openDrawer("event", x.eventId) }));
  s.assignments.forEach((a) => m(a.id + " " + Q.nameOf(s, a.workerId)) && t.length > 2 && hits.push({ kind: "Assignment", id: a.id, label: Q.nameOf(s, a.workerId) + " on " + Q.shiftOf(s, a.shiftId).label.toLowerCase(), sub: a.status, open: () => openDrawer("timesheet", a.id) }));
  Q.lines(s).forEach((l) => m(l.id + " " + l.worker.name) && t.length > 2 && hits.push({ kind: "Timesheet", id: l.id, label: l.worker.name + ", " + l.shift.label.toLowerCase(), sub: l.complete ? fmtHM(l.payableMin) + " payable · v" + l.version : "incomplete", open: () => openDrawer("timesheet", l.asg.id) }));
  s.mappings.forEach((x) => m(x.localId + " " + (x.remoteId || "")) && t.length > 2 && hits.push({ kind: "Mapping", id: x.id, label: x.localId + " → " + (x.remoteId || "pending"), sub: x.note, open: () => openDrawer(x.entityType === "worker" ? "mapping" : "client", x.localId) }));
  s.clients.forEach((c) => m(c.name + " " + c.id) && hits.push({ kind: "Client", id: c.id, label: c.name, sub: c.sector, open: () => openDrawer("client", c.id) }));
  return hits.slice(0, 80);
}

function Directory({ s }: { s: OssState }) {
  const [q, setQ] = useState("Niamh");
  const hits = q.trim().length ? search(s, q.trim()) : [];
  return (
    <Page title="Directory" sub="Search across workers, events, shifts, assignments, timesheets and mappings. Every result opens the canonical record.">
      <Card pad={false} title={<div style={{ position: "relative" }}><Icon d={I.search} size={14} style={{ position: "absolute", left: 11, top: 12, color: "var(--faint)" }} /><input className="oss-input" style={{ width: 360, paddingLeft: 32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, ID or reference" aria-label="Search records" autoFocus /></div>}
        meta={hits.length + " results"}>
        <Table rows={hits} rowKey={(h) => h.kind + h.id} onRow={(h) => h.open()} empty={<Empty title={q ? "Nothing matches \"" + q + "\"" : "Type to search"} />}
          cols={[{ key: "k", label: "Type", render: (h) => <span className="oss-pill">{h.kind}</span> }, { key: "l", label: "Record", render: (h) => <span className="strong">{h.label}</span> },
            { key: "s", label: "Detail", render: (h) => <span className="oss-small oss-dim">{h.sub}</span> }, { key: "i", label: "ID", render: (h) => <span className="oss-mono">{h.id}</span> }]} />
      </Card>
    </Page>
  );
}

function Venues({ s }: { s: OssState }) {
  return (
    <Page title="Venues" sub="Venue details, verification configuration, meeting point status, supervisor and linked events.">
      <Card pad={false}>
        <Table rows={s.venues} rowKey={(v) => v.id} onRow={(v) => openDrawer("venue", v.id)}
          cols={[{ key: "n", label: "Venue", render: (v) => <span className="strong">{v.name}<div className="oss-tiny oss-muted">{v.area}</div></span> },
            { key: "m", label: "Meeting point", render: (v) => v.meetingConfirmed ? <St tone="ok">Confirmed</St> : <St tone="warn">Awaiting confirmation</St> },
            { key: "c", label: "Verification", render: (v) => v.methods.map((x) => x.toUpperCase()).join(" + ") + " · " + v.geofenceM + " m sample radius" },
            { key: "s", label: "Supervisor", render: (v) => Q.nameOf(s, v.supervisorId) },
            { key: "e", label: "Events", num: true, render: (v) => s.events.filter((e) => e.venueId === v.id).length }]} />
      </Card>
    </Page>
  );
}

function AuditRefs({ s }: { s: OssState }) {
  const [q, setQ] = useState("");
  const rows = s.mappings.filter((m) => !q || (m.localId + " " + (m.remoteId || "") + " " + Q.nameOf(s, m.localId)).toLowerCase().includes(q.toLowerCase()));
  return (
    <Page title="Audit references" sub="Integration identifiers with their source. Synthetic references only; no tokens or credentials are stored or shown.">
      <Card pad={false} title={<input className="oss-input" style={{ width: 280, height: 34 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search IDs or names" aria-label="Search references" />}>
        <Table rows={rows} rowKey={(m) => m.id} maxHeight={640} onRow={(m) => openDrawer(m.entityType === "worker" ? "worker" : "client", m.localId)}
          cols={[{ key: "t", label: "Entity", render: (m) => m.entityType === "worker" ? "Worker" : "Client" }, { key: "l", label: "Local", render: (m) => <span><span className="oss-mono">{m.localId}</span> {Q.nameOf(s, m.localId) !== m.localId ? Q.nameOf(s, m.localId) : m.entityType === "client" ? Q.clientOf(s, m.localId).name : ""}</span> },
            { key: "r", label: "Bullhorn reference", render: (m) => m.remoteId ? <span className="oss-mono">{m.remoteId}</span> : <S s="Mapping pending" /> },
            { key: "p", label: "Provenance", render: (m) => <span className="oss-small oss-dim">{m.note}{m.confirmedBy ? " · " + Q.nameOf(s, m.confirmedBy) + " " + when(m.confirmedAt) : ""}</span> }]} />
      </Card>
    </Page>
  );
}

/* Shown beneath the (unchanged) ontology graph: the worker-to-hours relationship
   for one person, each link opening the canonical record. */
export function OntologyLineage() {
  const s = useOss();
  const [wid, setWid] = useState("W025");
  const asg = s.assignments.filter((a) => a.workerId === wid).sort((a, b) => b.acceptedAt.localeCompare(a.acceptedAt))[0];
  const people = ["W025", "W021", "W012", "W003", "W031", "W014", "W052"];
  const steps: { k: string; label: string; id?: string; state?: string; tone?: "ok" | "warn" | "bad" | "info" | "neutral" | "sim"; open?: () => void }[] = [];
  steps.push({ k: "Worker", label: Q.nameOf(s, wid), id: wid, open: () => openDrawer("worker", wid) });
  if (asg) {
    const sh = Q.shiftOf(s, asg.shiftId);
    const inv = s.invitations.find((i) => i.id === asg.invitationId);
    steps.push({ k: "Invitation", label: inv ? Q.inviteLabel(s, inv) + " " + (inv.respondedAt ? fmtTime(inv.respondedAt) : "") : "-", id: inv?.id, tone: "ok" });
    steps.push({ k: "Accepted shift", label: Q.eventOf(s, sh.eventId).name.split(":")[0] + " " + sh.label.toLowerCase(), id: asg.id, state: asg.status, tone: asg.status === "confirmed" ? "ok" : "bad", open: () => openDrawer("event", sh.eventId) });
    const cl = Q.clocksOf(s, asg.id);
    const vin = Q.verifiedIn(s, asg.id), vout = Q.verifiedOut(s, asg.id);
    steps.push({ k: "Clock records", label: cl.length ? (vin ? "in " + fmtTime(vin.at) : "no verified in") + " · " + (vout ? "out " + fmtTime(vout.at) : "clock-out missing") + (cl.some((c) => c.result === "rejected") ? " · " + cl.filter((c) => c.result === "rejected").length + " rejected" : "") : "none yet",
      tone: !cl.length ? "neutral" : vin && vout ? "ok" : "warn", open: () => openDrawer("timesheet", asg.id) });
    const corr = s.corrections.filter((c) => c.assignmentId === asg.id).pop();
    if (corr) steps.push({ k: "Correction", label: "clock-" + corr.field + " " + fmtTime(corr.proposed) + " · " + corr.status, id: corr.id, tone: corr.status === "approved" ? "ok" : "warn", open: () => openDrawer("timesheet", asg.id) });
    const l = Q.lineFor(s, asg);
    if (l) steps.push({ k: "Timesheet", label: (l.complete ? fmtHM(l.payableMin) + " payable" : "incomplete") + " · v" + l.version + " · " + l.status.replace("_", " "), id: l.id, tone: l.status === "approved" || l.status === "exported" ? "ok" : l.status === "incomplete" ? "bad" : "info", open: () => openDrawer("timesheet", asg.id) });
    const it = s.items.filter((i) => i.assignmentId === asg.id).pop();
    steps.push({ k: "Handover receipt", label: it ? (it.receipt ? it.receipt : it.state) : "not sent", id: it?.batchId, tone: it?.state === "accepted" ? "ok" : it ? "bad" : "neutral", open: it ? () => openDrawer("batch", it.batchId) : undefined });
  }
  return (
    <div style={{ padding: "14px 22px 28px" }}>
      <Card title="Record lineage" meta="Worker → accepted shift → clock → correction → timesheet → handover"
        right={<Seg value={wid} onChange={setWid} label="Worker" options={people.map((p) => ({ id: p, label: Q.nameOf(s, p).split(" ")[0] }))} />}>
        <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }} aria-label="Relationship chain">
          {steps.map((st, i) => (
            <li key={i}>
              <button className="oss-metric" style={{ width: "100%", height: "100%", cursor: st.open ? "pointer" : "default" }} onClick={st.open} disabled={!st.open}>
                <div className="l">{i + 1}. {st.k}</div>
                <div className="oss-small oss-ink" style={{ marginTop: 6, fontWeight: 500 }}>{st.label}</div>
                {st.id && <div className="oss-tiny oss-muted oss-mono" style={{ marginTop: 4 }}>{st.id}</div>}
                {st.tone && <div style={{ marginTop: 6 }}><St tone={st.tone}>{st.tone === "ok" ? "Linked" : st.tone === "bad" ? "Gap" : st.tone === "warn" ? "Needs review" : st.tone === "sim" ? "Simulated" : st.tone === "info" ? "Open" : "Pending"}</St></div>}
              </button>
            </li>))}
        </ol>
        {!asg && <Empty title="No assignment for this worker" />}
        <div className="oss-small oss-muted" style={{ marginTop: 10 }}>The graph above shows how entity types relate across the whole dataset; this chain is one person's actual records. Search the graph for "worker timesheet" to trace the same path.</div>
      </Card>
    </div>
  );
}
