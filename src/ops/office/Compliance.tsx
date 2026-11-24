/* Compliance: valid, expiring, expired and missing documents, the verification
   queue, renewal requests and a filterable report. Document files are shown only
   to users with permission to view them. */

import { useMemo, useState } from "react";
import type { Doc, DocType, OpsState, Worker } from "../model";
import { DOC_LABEL } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { go, setQuery, useRoute } from "../router";
import { office, useOps } from "../store";
import { dayKey, fmtDay, relTime } from "../time";
import { Btn, Col, downloadCsv, Drawer, I, Icon, KV, Notice, Pager, Panel, Search, Select, Status, Table, Tabs } from "../ui/kit";
import { Page } from "./common";

interface Row { w: Worker; type: DocType; v: Q.DocView; mandatory: boolean; rostered?: string }
type Tab = "attention" | "pending" | "expiring" | "expired" | "missing" | "valid";
const TONE: Record<Q.DocKey, Q.Tone> = { valid: "ok", expiring: "warn", expired: "bad", missing: "bad", pending: "info", rejected: "bad", not_required: "grey" };
const LABEL: Record<Q.DocKey, string> = { valid: "Valid", expiring: "Expiring", expired: "Expired", missing: "Missing", pending: "Awaiting verification", rejected: "Rejected", not_required: "Not required" };

function buildRows(s: OpsState): Row[] {
  const rostered = new Map(Q.urgentCompliance(s).filter((x) => x.shiftId).map((x) => [x.workerId, x.shiftId!]));
  const out: Row[] = [];
  for (const w of s.workers) {
    const types = new Set<DocType>([...Q.mandatoryTypes(w), ...Q.skillQuals(s, w)]);
    for (const d of Q.docsOf(s, w.id)) types.add(d.type);
    for (const t of types) {
      const v = Q.docState(s, w.id, t);
      if (v.state === "not_required") continue;
      out.push({ w, type: t, v, mandatory: Q.mandatoryTypes(w).includes(t), rostered: rostered.get(w.id) });
    }
  }
  return out;
}

export function DocReview({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const s = useOps();
  const [note, setNote] = useState("");
  const w = Q.worker(s, doc.workerId);
  const canView = Q.can(s, s.ui.officeId, "view_docs");
  const canVerify = Q.can(s, s.ui.officeId, "verify_docs");
  return (
    <Drawer title={DOC_LABEL[doc.type] + ": " + w.name} sub={doc.status === "pending" ? "Uploaded " + relTime(doc.uploadedAt, s.clock) + (doc.uploadedBy === w.id ? " by the worker" : " by " + Q.nameOf(s, doc.uploadedBy)) : "Status: " + doc.status} onClose={onClose}
      footer={doc.status === "pending" && canVerify ? <>
        <input className="input" placeholder="Note (required to reject)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" style={{ flex: "1 1 200px" }} />
        <Btn kind="danger" onClick={() => { if (office(E.verifyDoc, doc.id, false, note).ok) onClose(); }}>Reject</Btn>
        <Btn kind="primary" icon={I.check} onClick={() => { if (office(E.verifyDoc, doc.id, true, note).ok) onClose(); }}>Verify</Btn>
      </> : undefined}>
      <div className="stack g16">
        {canView ? (
          <div className="panel" style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--surface-2)" }}>
            <div className="stack" style={{ alignItems: "center", gap: 6 }}><Icon d={I.file} size={32} /><span className="small dim">{doc.file}</span><span className="tag sim">Sample image: no real document stored</span></div>
          </div>
        ) : <Notice tone="warn" icon={I.lock}>Restricted. Only staff with document access (compliance and events coordinators) can open the file. You can still see its status.</Notice>}
        <KV items={[["Worker", <button className="linkbtn" onClick={() => go("/crew/" + w.id)}>{w.name}</button>], ["Work authorisation", w.rtw], ["Document", doc.name], ["Reference", doc.ref],
          ["Issued", fmtDay(doc.issued)], ["Expires", doc.expires ? fmtDay(doc.expires) : "No expiry"], ["Verification", doc.status === "verified" ? "Verified by " + Q.nameOf(s, doc.verifiedBy || "") + (doc.verifiedAt ? ", " + fmtDay(dayKey(doc.verifiedAt)) : "") : doc.status === "rejected" ? "Rejected: " + (doc.note || "") : "Not verified yet"]]} />
        {doc.status === "pending" && !canVerify && <Notice tone="info">You can't verify documents. Ask Clodagh or Daniele.</Notice>}
        <span className="tiny dim">Verifying confirms the details match the document. It doesn't check authenticity with the issuing body.</span>
      </div>
    </Drawer>
  );
}

export default function Compliance() {
  const s = useOps();
  const r = useRoute();
  const tab = (["attention", "pending", "expiring", "expired", "missing", "valid"].includes(r.q.get("tab") || "") ? r.q.get("tab") : "attention") as Tab;
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [county, setCounty] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<Doc | null>(null);
  const rows = useMemo(() => buildRows(s), [s]);
  const pendingDocs = useMemo(() => s.docs.filter((d) => d.status === "pending").sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt)), [s]);
  const inTab = (x: Row): boolean => {
    if (tab === "attention") return !!x.rostered && ["expired", "missing", "pending", "rejected"].includes(x.v.state) || (x.mandatory && ["expired", "missing", "rejected"].includes(x.v.state));
    if (tab === "expired") return x.v.state === "expired" || x.v.state === "rejected";
    return x.v.state === tab;
  };
  const counts = (t: Tab) => (t === "pending" ? pendingDocs.length : rows.filter((x) => (t === "attention" ? (!!x.rostered && ["expired", "missing", "pending", "rejected"].includes(x.v.state)) || (x.mandatory && ["expired", "missing", "rejected"].includes(x.v.state))
    : t === "expired" ? x.v.state === "expired" || x.v.state === "rejected" : x.v.state === t)).length);
  const shown = rows.filter((x) => inTab(x) && (!type || x.type === type) && (!county || x.w.county === county) && (!q || x.w.name.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => Number(!!b.rostered) - Number(!!a.rostered) || (a.v.doc?.expires || "").localeCompare(b.v.doc?.expires || "") || a.w.name.localeCompare(b.w.name));
  const remind = (x: Row) => office(E.sendMessage, { audience: "worker", workerIds: [x.w.id], kind: "reminder",
    body: x.v.state === "missing" ? "We don't have your " + DOC_LABEL[x.type].toLowerCase() + " on file. Please upload it in the OSS Crew app (Profile, Documents)."
      : "Your " + DOC_LABEL[x.type].toLowerCase() + (x.v.state === "expired" ? " has expired" : " expires on " + fmtDay(x.v.doc!.expires!)) + ". Please upload the renewed document in the OSS Crew app so you can keep getting shifts." });
  const cols: Col<Row>[] = [
    { key: "w", label: "Worker", render: (x) => <div className="stack" style={{ gap: 0 }}><button className="linkbtn" onClick={() => go("/crew/" + x.w.id)}>{x.w.name}</button><span className="tiny dim">{x.w.rtw} · {x.w.area}</span></div> },
    { key: "d", label: "Document", render: (x) => <div className="stack" style={{ gap: 0 }}><span className="ink">{DOC_LABEL[x.type]}</span><span className="tiny dim">{x.mandatory ? "Required for all shifts" : "Needed for some roles"}</span></div> },
    { key: "ref", label: "Reference", hide: "md", render: (x) => <span className="num small">{x.v.doc?.ref || "-"}</span> },
    { key: "iss", label: "Issued", hide: "md", render: (x) => (x.v.doc ? fmtDay(x.v.doc.issued) : "-") },
    { key: "exp", label: "Expires", render: (x) => (x.v.doc?.expires ? <span className="nowrap">{fmtDay(x.v.doc.expires)}{x.v.daysLeft !== undefined && <div className={"tiny " + (x.v.daysLeft < 0 ? "tone-bad" : x.v.daysLeft <= 30 ? "tone-warn" : "dim")}>{x.v.daysLeft < 0 ? -x.v.daysLeft + " days ago" : "in " + x.v.daysLeft + " days"}</div>}</span> : "-") },
    { key: "st", label: "Status", render: (x) => <div className="stack" style={{ gap: 2, alignItems: "flex-start" }}><Status tone={TONE[x.v.state]}>{LABEL[x.v.state]}</Status>{x.rostered && <span className="tiny tone-bad">Rostered {fmtDay(dayKey(Q.shift(s, x.rostered).start))}</span>}</div> },
    { key: "a", label: "", render: (x) => <div className="row" style={{ justifyContent: "flex-end" }}>
      {x.v.doc && <Btn size="sm" kind="quiet" icon={Q.can(s, s.ui.officeId, "view_docs") ? I.eye : I.lock} onClick={() => setOpen(x.v.doc!)}>{x.v.state === "pending" ? "Review" : "View"}</Btn>}
      {["expiring", "expired", "missing", "rejected"].includes(x.v.state) && <Btn size="sm" onClick={() => remind(x)}>Request renewal</Btn>}</div> }
  ];
  const exportCsv = () => downloadCsv("oss-compliance-" + tab + "-" + dayKey(s.clock) + ".csv",
    ["Worker", "Worker ID", "Work authorisation", "County", "Document", "Reference", "Issued", "Expires", "Status", "Verified by"],
    shown.map((x) => [x.w.name, x.w.id, x.w.rtw, x.w.county, DOC_LABEL[x.type], x.v.doc?.ref || "", x.v.doc?.issued || "", x.v.doc?.expires || "", LABEL[x.v.state], x.v.doc?.verifiedBy ? Q.nameOf(s, x.v.doc.verifiedBy) : ""]));
  return (
    <Page title="Compliance" sub="Photo ID, work authorisation and qualifications. Expired or unverified mandatory documents block bookings automatically."
      actions={<><Btn icon={I.settings} onClick={() => go("/settings/rules#documents")}>Reminder settings</Btn><Btn icon={I.download} onClick={exportCsv} disabled={tab === "pending"}>Export report</Btn></>}>
      <div style={{ marginBottom: 14 }}>
        <Tabs label="Compliance" value={tab} onChange={(v) => { setQuery({ tab: v }); setPage(0); }} items={[
          { id: "attention", label: "Needs attention", n: counts("attention"), tone: "bad" }, { id: "pending", label: "Awaiting verification", n: counts("pending"), tone: "warn" },
          { id: "expiring", label: "Expiring in " + s.rules.expiryWarnDays + " days", n: counts("expiring") }, { id: "expired", label: "Expired", n: counts("expired") },
          { id: "missing", label: "Missing", n: counts("missing") }, { id: "valid", label: "Valid", n: counts("valid") }]} />
      </div>
      {tab === "pending" ? (
        <Panel title="Verification queue" meta="Oldest first. Workers stay blocked until a document is verified." flush>
          <Table label="Documents awaiting verification" rows={pendingDocs} rowKey={(d) => d.id} onRow={setOpen}
            empty={<div className="empty"><b>Nothing to verify</b>New uploads from the crew app appear here.</div>}
            cols={[
              { key: "w", label: "Worker", render: (d) => <span className="strong">{Q.worker(s, d.workerId).name}</span> },
              { key: "d", label: "Document", render: (d) => DOC_LABEL[d.type] + (Q.worker(s, d.workerId).status === "pending_verification" ? " (new worker)" : "") },
              { key: "e", label: "Expires", render: (d) => (d.expires ? fmtDay(d.expires) : "-") },
              { key: "u", label: "Uploaded", render: (d) => relTime(d.uploadedAt, s.clock) },
              { key: "a", label: "", render: () => <span className="row" style={{ justifyContent: "flex-end" }}><Btn size="sm" kind="primary">Review</Btn></span> }]} />
        </Panel>
      ) : (
        <>
          <div className="toolbar">
            <Search value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Search worker" />
            <div style={{ width: 200 }}><Select sm label="Document" value={type} onChange={(v) => { setType(v); setPage(0); }} placeholder="All documents" options={(Object.keys(DOC_LABEL) as DocType[]).map((t) => ({ value: t, label: DOC_LABEL[t] }))} /></div>
            <div style={{ width: 160 }}><Select sm label="County" value={county} onChange={(v) => { setCounty(v); setPage(0); }} placeholder="All counties" options={[...new Set(s.workers.map((w) => w.county))].sort().map((c) => ({ value: c, label: c }))} /></div>
            <span className="small dim">{shown.length} rows</span>
          </div>
          {tab === "attention" && <div style={{ marginBottom: 12 }}><Notice tone="info">Rostered workers come first. A document that runs out before a shift blocks that booking until a renewal is uploaded and verified.</Notice></div>}
          <div className="panel">
            <Table label="Documents" cols={cols} rows={shown.slice(page * 50, page * 50 + 50)} rowKey={(x) => x.w.id + x.type}
              empty={<div className="empty"><b>Nothing here</b>No documents match these filters.</div>} />
            <Pager page={page} size={50} total={shown.length} onPage={setPage} />
          </div>
        </>
      )}
      <div style={{ marginTop: 16 }}>
        <Panel title="Reminders">
          <span className="small">Workers are reminded {s.rules.expiryReminders.join(", ")} days before a document expires, in the app and by WhatsApp (simulated). Documents count as expiring {s.rules.expiryWarnDays} days before.</span>
        </Panel>
      </div>
      {open && <DocReview doc={open} onClose={() => setOpen(null)} />}
    </Page>
  );
}
