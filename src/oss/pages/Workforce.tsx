import { useMemo, useState } from "react";
import type { OssState } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { docLabel } from "../seed";
import { openDrawer, run, runQuiet, useOss } from "../store";
import { tabOf } from "../modules";
import { addDays, dayKey, fmtDate, fmtDayMonth, fmtHM, weekday, zoned } from "../time";
import { Btn, Card, Drawer, Empty, Field, I, Icon, Metric, Page, S, Scope, Seg, St, Table } from "../ui/kit";
import { WorkerLink, when } from "../ui/fmt";

export default function Workforce() {
  const s = useOss();
  const tab = tabOf(s, "Workforce");
  if (tab === "availability") return <Availability s={s} />;
  if (tab === "documents") return <Documents s={s} />;
  if (tab === "registration") return <Registration s={s} />;
  if (tab === "history") return <History s={s} />;
  return <People s={s} />;
}

function People({ s }: { s: OssState }) {
  const [q, setQ] = useState("");
  const [chip, setChip] = useState<"all" | "upcoming" | "mh" | "issue" | "nosub" | "pending">("all");
  const [sort, setSort] = useState<"name" | "id" | "locality">("id");
  const upcoming = (id: string) => s.assignments.filter((a) => a.workerId === id && a.status === "confirmed" && Date.parse(Q.shiftOf(s, a.shiftId).end) > Date.parse(s.clock)).length;
  const docIssue = (id: string) => s.documents.some((d) => d.workerId === id && ["expired", "pending", "expiring"].includes(Q.docStatusToday(s, d)));
  const mh = (id: string) => s.documents.some((d) => d.workerId === id && d.type === "MH" && ["valid", "expiring"].includes(Q.docStatusToday(s, d)));
  const tests: Record<string, (id: string) => boolean> = { all: () => true, upcoming: (id) => upcoming(id) > 0, mh, issue: docIssue, nosub: (id) => !Q.hasSubmittedAvailability(s, id), pending: (id) => Q.worker(s, id).status === "pending_compliance" };
  const base = s.workers.filter((w) => !q || (w.name + " " + w.id + " " + w.locality + " " + w.roles.join(" ") + " " + w.email).toLowerCase().includes(q.toLowerCase()));
  const rows = base.filter((w) => tests[chip](w.id)).sort((a, b) => (a[sort] as string).localeCompare(b[sort] as string));
  const n = (k: string) => base.filter((w) => tests[k](w.id)).length;
  const [sel, setSel] = useState<string[]>([]);
  const [bulk, setBulk] = useState(false);
  const [patch, setPatch] = useState<{ locality: string; addRole: string }>({ locality: "", addRole: "" });
  const toggle = (id: string) => setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.concat([id])));
  const preview = sel.map((id) => Q.worker(s, id)).map((w) => ({ w, changes: [patch.locality && w.locality !== patch.locality ? "Locality: " + w.locality + " → " + patch.locality : "", patch.addRole && !w.roles.includes(patch.addRole) ? "Roles: add " + patch.addRole : ""].filter(Boolean) }));
  return (
    <Page title="People" sub={<>{s.workers.length} sample profiles with fictional details. Not OSS's actual worker base.</>} scope={<Scope><b>Sample register</b></Scope>}
      actions={<Btn disabled={!sel.length} onClick={() => setBulk(true)}>Bulk edit ({sel.length})</Btn>}>
      {bulk && <Drawer title={"Bulk edit " + sel.length + " workers"} onClose={() => setBulk(false)}
        footer={<><Btn kind="primary" disabled={!preview.some((p) => p.changes.length)} onClick={() => { const r = run(E.bulkUpdateWorkers, sel, { locality: patch.locality || undefined, addRole: patch.addRole || undefined }); if (r.ok) { setBulk(false); setSel([]); } }}>Apply {preview.filter((p) => p.changes.length).length} changes</Btn><Btn onClick={() => setBulk(false)}>Cancel</Btn></>}>
        <div className="oss-grid oss-g2">
          <Field label="Set locality"><select className="oss-input" value={patch.locality} onChange={(e) => setPatch({ ...patch, locality: e.target.value })}><option value="">No change</option>{["Dublin city", "Tallaght", "Clondalkin", "Lucan", "Swords", "Bray", "Blanchardstown", "Naas", "Drogheda"].map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Add role"><select className="oss-input" value={patch.addRole} onChange={(e) => setPatch({ ...patch, addRole: e.target.value })}><option value="">No change</option>{["Event crew", "Stagehand", "General operative", "Steward", "Catering assistant", "Site crew"].map((x) => <option key={x}>{x}</option>)}</select></Field>
        </div>
        <div className="oss-section"><h3>Preview</h3>
          <Table rows={preview} rowKey={(p) => p.w.id} cols={[{ key: "w", label: "Worker", render: (p) => p.w.name }, { key: "c", label: "Changed fields", render: (p) => p.changes.length ? p.changes.join("; ") : <span className="oss-muted">No change</span> }]} />
        </div>
      </Drawer>}
      <Card pad={false} title={<div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ position: "relative" }}><Icon d={I.search} size={14} style={{ position: "absolute", left: 11, top: 11, color: "var(--faint)" }} /><input className="oss-input" style={{ width: 240, height: 34, paddingLeft: 32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, ID, role, locality" aria-label="Search workers" /></div>
        <Seg value={chip} onChange={setChip} options={[{ id: "all", label: "All", n: n("all") }, { id: "upcoming", label: "Upcoming work", n: n("upcoming") }, { id: "mh", label: "Manual Handling valid", n: n("mh") }, { id: "issue", label: "Document attention", n: n("issue") }, { id: "nosub", label: "Availability not submitted", n: n("nosub") }, { id: "pending", label: "Pending compliance", n: n("pending") }]} /></div>}
        right={<select className="oss-input" style={{ width: 140, height: 32 }} value={sort} onChange={(e) => setSort(e.target.value as any)} aria-label="Sort"><option value="id">Sort: ID</option><option value="name">Sort: name</option><option value="locality">Sort: locality</option></select>}>
        <Table rows={rows} rowKey={(w) => w.id} onRow={(w) => openDrawer("worker", w.id)} maxHeight={640}
          empty={<Empty title="No workers match" body="Try a different filter." action={<Btn size="sm" onClick={() => { setQ(""); setChip("all"); }}>Clear filters</Btn>} />}
          cols={[{ key: "x", label: "", width: "34px", render: (w) => <input type="checkbox" aria-label={"Select " + w.name} checked={sel.includes(w.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggle(w.id)} style={{ width: 16, height: 16, accentColor: "var(--accent)" }} /> },
            { key: "id", label: "ID", render: (w) => <span className="oss-mono">{w.id}</span> }, { key: "n", label: "Name", render: (w) => <span className="strong">{w.name}</span> },
            { key: "r", label: "Roles", render: (w) => w.roles.join(", ") }, { key: "l", label: "Locality", render: (w) => w.locality },
            { key: "d", label: "Evidence", render: (w) => { const ds = s.documents.filter((d) => d.workerId === w.id); if (!ds.length) return <span className="oss-muted oss-small">None on file</span>;
              return <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{ds.map((d) => { const st = Q.docStatusToday(s, d); return <St key={d.id} tone={st === "valid" ? "ok" : st === "expiring" || st === "pending" ? "warn" : "bad"}>{d.type}{st !== "valid" ? " " + st : ""}</St>; })}</span>; } },
            { key: "a", label: "Availability", render: (w) => Q.hasSubmittedAvailability(s, w.id) ? <span className="oss-small">{s.availRules.filter((r) => r.workerId === w.id).map((r) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][r.weekday]).join(", ") || "Dates only"}</span> : <St tone="neutral">Not submitted</St> },
            { key: "u", label: "Upcoming", num: true, render: (w) => upcoming(w.id) || "—" },
            { key: "s", label: "Status", render: (w) => w.status === "active" ? null : <S s="Pending compliance" /> }]} />
      </Card>
    </Page>
  );
}

function Availability({ s }: { s: OssState }) {
  const [day, setDay] = useState("2026-11-14");
  const [q, setQ] = useState("");
  const days = Array.from({ length: 7 }, (_, i) => addDays("2026-11-12", i));
  const sh = Q.shiftOf(s, s.ui.focus?.kind === "shift" ? s.ui.focus.id : "SH-001B");
  const nosub = Q.notSubmitted(s);
  const cell = (wid: string, k: string) => {
    const a = Q.availability(s, wid, zoned(k, "17:00"), zoned(k, "23:00"));
    const m = Q.availability(s, wid, zoned(k, "08:00"), zoned(k, "13:00"));
    const asg = s.assignments.some((x) => x.workerId === wid && x.status === "confirmed" && dayKey(Q.shiftOf(s, x.shiftId).start) === k);
    const st = a.state === "unavailable" && m.state === "unavailable" ? "bad" : a.state === "available" || m.state === "available" ? "ok" : a.state === "unavailable" || m.state === "unavailable" ? "warn" : "neutral";
    const label = asg ? "Booked" : st === "ok" ? (m.state === "available" && a.state === "available" ? "Day" : m.state === "available" ? "AM" : "PM") : st === "bad" ? "Off" : st === "warn" ? "Part" : "?";
    return <span title={"AM: " + m.detail + " · PM: " + a.detail} className={"oss-st " + (asg ? "info" : st)} style={{ minWidth: 48, justifyContent: "center" }}>{label}</span>;
  };
  const people = s.workers.filter((w) => !q || w.name.toLowerCase().includes(q.toLowerCase())).slice(0, q ? 96 : 40);
  return (
    <Page title="Availability" sub="Recurring availability, date exceptions, holidays and unknowns. Holiday and unavailable entries override recurring availability."
      scope={<Scope><b>{Q.windowLabel(s)}</b> · AM 08:00–13:00, PM 17:00–23:00 probes</Scope>}>
      <div className="oss-grid oss-main-side" style={{ alignItems: "start" }}>
        <Card pad={false} title="Week matrix" right={<input className="oss-input" style={{ width: 200, height: 32 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name" aria-label="Filter by name" />}>
          <div className="oss-tw" style={{ maxHeight: 620, overflowY: "auto" }}>
            <table className="oss-table">
              <thead><tr><th>Worker</th>{days.map((k) => <th key={k} className="num" style={{ textAlign: "center", color: k === day ? "var(--accent)" : undefined, cursor: "pointer" }} onClick={() => setDay(k)}>{fmtDate(zoned(k, "12:00"))}</th>)}</tr></thead>
              <tbody>{people.map((w) => <tr key={w.id} className="click" onClick={() => openDrawer("worker", w.id)}><td className="strong nowrap">{w.name}</td>{days.map((k) => <td key={k} style={{ textAlign: "center" }}>{cell(w.id, k)}</td>)}</tr>)}</tbody>
            </table>
          </div>
          {!q && <div className="oss-small oss-muted" style={{ padding: "10px 14px", borderTop: "1px solid var(--border)" }}>Showing 40 of {s.workers.length}. Filter by name to see anyone.</div>}
        </Card>
        <div style={{ display: "grid", gap: 14 }}>
          <Card title={"Selected shift: " + sh.label} meta={Q.eventOf(s, sh.eventId).name}>
            {(() => { const c = Q.candidates(s, sh.id); return <div className="oss-grid oss-g3" style={{ gap: 8 }}><Metric label="Available" value={c.eligible.length + c.blocked.filter((x) => x.elig.avail === "available").length} /><Metric label="Unknown" value={c.unknown.length} /><Metric label="Unavailable" value={c.blocked.filter((x) => x.elig.avail === "unavailable").length} /></div>; })()}
            <div className="oss-small oss-muted" style={{ marginTop: 8 }}>Counts workers whose roles suit this shift and who are not already on it.</div>
          </Card>
          <Card title={"Not submitted (" + nosub.length + ")"} pad={false} right={<Btn size="sm" icon={I.send} onClick={() => run(E.sendBulk, { workerIds: nosub.map((w) => w.id), body: "Please add your availability in OSS Crew so we can offer you suitable shifts.", audience: "Availability not submitted" })}>Send reminder</Btn>}>
            <div style={{ maxHeight: 360, overflowY: "auto" }}><div className="oss-list" style={{ padding: "4px 14px" }}>{nosub.map((w) => <div key={w.id} className="oss-row oss-small"><span className="grow"><WorkerLink s={s} id={w.id} /></span><span className="oss-muted">{w.locality}</span></div>)}</div></div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function Documents({ s }: { s: OssState }) {
  const [f, setF] = useState<"pending" | "expiring" | "expired" | "approved">("pending");
  const [shiftCheck, setShiftCheck] = useState("SH-001B");
  const at = Q.shiftOf(s, shiftCheck);
  const rows = s.documents.filter((d) => { const st = Q.docStatusToday(s, d); return f === "approved" ? st === "valid" : f === "expired" ? st === "expired" || st === "rejected" : st === f; })
    .sort((a, b) => a.expires.localeCompare(b.expires));
  const n = (k: string) => s.documents.filter((d) => { const st = Q.docStatusToday(s, d); return k === "approved" ? st === "valid" : k === "expired" ? st === "expired" || st === "rejected" : st === k; }).length;
  const canReview = Q.can(s, "approve_docs");
  return (
    <Page title="Documents" sub="Uploaded is not approved, and expired is not pending review. Eligibility checks validity on the shift's date, not just today."
      scope={<Scope><b>Today {fmtDate(s.clock)}</b></Scope>}>
      {!canReview && <div className="oss-note" style={{ marginBottom: 12 }}>Document approval needs the compliance persona (Nessa Doyle). Switch persona in the header to approve or reject.</div>}
      <Card pad={false} title={<Seg value={f} onChange={setF} options={[{ id: "pending", label: "Pending review", n: n("pending") }, { id: "expiring", label: "Expiring (30 days)", n: n("expiring") }, { id: "expired", label: "Expired or rejected", n: n("expired") }, { id: "approved", label: "Approved", n: n("approved") }]} />}
        right={<label className="oss-small oss-dim" style={{ display: "flex", gap: 8, alignItems: "center" }}>Check against<select className="oss-input" style={{ width: 220, height: 32 }} value={shiftCheck} onChange={(e) => setShiftCheck(e.target.value)}>{s.shifts.filter((x) => !Q.eventOf(s, x.eventId).historical).map((x) => <option key={x.id} value={x.id}>{Q.eventOf(s, x.eventId).name.split(":")[0]} {x.label} ({fmtDate(x.start)})</option>)}</select></label>}>
        <Table rows={rows} rowKey={(d) => d.id} onRow={(d) => openDrawer("worker", d.workerId)} maxHeight={600} empty={<Empty title="Nothing in this queue" />}
          cols={[{ key: "w", label: "Worker", render: (d) => <WorkerLink s={s} id={d.workerId} /> }, { key: "t", label: "Type", render: (d) => docLabel(d.type) },
            { key: "i", label: "Issuer / file", render: (d) => <span className="oss-small">{d.issuer}<div className="oss-tiny oss-muted oss-mono">{d.file}</div></span> },
            { key: "is", label: "Issued", nowrap: true, render: (d) => d.issued }, { key: "e", label: "Expires", nowrap: true, render: (d) => fmtDayMonth(zoned(d.expires, "12:00")) + " " + d.expires.slice(0, 4) },
            { key: "on", label: "On " + fmtDate(at.end), render: (d) => { const st = Q.docState(s, d.workerId, d.type, at.end); return <St tone={st.state === "valid" ? "ok" : st.state === "expiring" ? "warn" : "bad"}>{st.state === "valid" ? "Valid" : st.state === "expiring" ? "Valid, renew soon" : st.state === "pending" ? "Not reviewed" : "Not valid"}</St>; } },
            { key: "r", label: "Review", render: (d) => <span className="oss-small">{d.review === "pending" ? "Uploaded " + when(d.uploadedAt) : d.review === "approved" ? "Approved" + (d.reviewer ? " by " + Q.nameOf(s, d.reviewer) : "") : "Rejected"}</span> },
            { key: "a", label: "", render: (d) => d.review === "pending" ? <span style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}><Btn size="sm" kind="primary" onClick={() => run(E.reviewDocument, d.id, "approved")}>Approve</Btn><Btn size="sm" onClick={() => run(E.reviewDocument, d.id, "rejected")}>Reject</Btn></span>
              : Q.docStatusToday(s, d) === "expiring" ? <Btn size="sm" onClick={(e: any) => { e.stopPropagation(); run(E.sendBulk, { workerIds: [d.workerId], body: "Your " + docLabel(d.type) + " expires on " + fmtDayMonth(zoned(d.expires, "12:00")) + ". Please upload a renewal.", audience: "Renewal reminder" }); }}>Remind</Btn> : null }]} />
      </Card>
      <div className="oss-small oss-muted" style={{ marginTop: 10 }}>Review confirms the record is complete and in date. It does not verify authenticity. Demo uploads are labelled synthetic placeholders; no real identity documents are requested.</div>
    </Page>
  );
}

function Registration({ s }: { s: OssState }) {
  const [f, setF] = useState({ name: "", email: "", mobile: "", role: "Event crew", locality: "Dublin city" });
  const [res, setRes] = useState<E.Result | null>(null);
  const dup = useMemo(() => (f.email || f.mobile || f.name ? E.findDuplicates(s, f) : { exact: undefined, similar: [] as any[] }), [f, s.workers.length]);
  const recent = s.workers.filter((w) => w.registeredAt).reverse();
  return (
    <Page title="Registration" sub="Fast, phone-friendly sign-up. Email and mobile are normalised and checked for exact matches before anything is created; names alone never merge records.">
      <div className="oss-grid oss-g2" style={{ alignItems: "start" }}>
        <Card title="Register a worker">
          <div style={{ display: "grid", gap: 12 }}>
            <Field label="Full name"><input className="oss-input" value={f.name} onChange={(e) => { setF({ ...f, name: e.target.value }); setRes(null); }} autoComplete="off" /></Field>
            <Field label="Email" help="Try re-entering Aidan Murphy's email: aidan.murphy@example.test"><input className="oss-input" type="email" value={f.email} onChange={(e) => { setF({ ...f, email: e.target.value }); setRes(null); }} autoComplete="off" /></Field>
            <Field label="Mobile"><input className="oss-input" type="tel" value={f.mobile} onChange={(e) => { setF({ ...f, mobile: e.target.value }); setRes(null); }} autoComplete="off" /></Field>
            <div className="oss-grid oss-g2">
              <Field label="Role"><select className="oss-input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{["Event crew", "Stagehand", "General operative", "Steward", "Catering assistant", "Site crew"].map((r) => <option key={r}>{r}</option>)}</select></Field>
              <Field label="Locality"><select className="oss-input" value={f.locality} onChange={(e) => setF({ ...f, locality: e.target.value })}>{["Dublin city", "Tallaght", "Clondalkin", "Lucan", "Swords", "Bray", "Blanchardstown", "Naas", "Drogheda"].map((r) => <option key={r}>{r}</option>)}</select></Field>
            </div>
            {dup.exact && <div className="oss-note warn"><b>Existing profile found:</b> {dup.exact.name} ({dup.exact.id}). Matched on {E.normEmail(dup.exact.email) === E.normEmail(f.email) ? "email" : "mobile"}. Nothing new will be created.
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}><Btn size="sm" onClick={() => openDrawer("worker", dup.exact!.id)}>Open profile</Btn><Btn size="sm" onClick={() => run(E.sendBulk, { workerIds: [dup.exact!.id], body: "Please check your contact details and documents in OSS Crew are up to date.", audience: "Profile update request" })}>Request update</Btn></div></div>}
            {!dup.exact && dup.similar.length > 0 && <div className="oss-note">Possible name matches for review: {dup.similar.slice(0, 4).map((w) => w.name + " (" + w.id + ")").join(", ")}. Check before creating.</div>}
            {!dup.exact && <Btn kind="primary" disabled={!f.name.trim() || (!f.email.trim() && !f.mobile.trim())} onClick={() => setRes(runQuiet(E.registerWorker, f, Q.persona(s).name, !!(res && res.data?.similar)))}>{res?.data?.similar ? "Create after review" : "Check and register"}</Btn>}
            {res && <div className={"oss-note " + (res.ok ? "ok" : "warn")}>{res.message}{res.data?.created && <> <button className="oss-link" onClick={() => openDrawer("worker", res.data.created)}>Open {res.data.created}</button></>}</div>}
          </div>
        </Card>
        <Card title="Recently registered" pad={false}>
          <Table rows={recent} rowKey={(w) => w.id} onRow={(w) => openDrawer("worker", w.id)} empty={<Empty title="No registrations in this session" body={"Workforce stays at " + s.workers.length + " until a genuinely new person is added."} />}
            cols={[{ key: "n", label: "Name", render: (w) => w.name }, { key: "id", label: "ID", render: (w) => w.id }, { key: "s", label: "Status", render: () => <S s="Pending compliance" /> },
              { key: "m", label: "Bullhorn", render: () => <S s="Mapping pending" /> }, { key: "b", label: "By", render: (w) => w.registeredBy }]} />
        </Card>
      </div>
    </Page>
  );
}

function History({ s }: { s: OssState }) {
  const [wid, setWid] = useState("W025");
  const ls = Q.lines(s, { workerId: wid });
  const ex = s.exceptions.filter((e) => Q.asgOf(s, e.assignmentId).workerId === wid);
  const docEvents = s.audit.filter((a) => a.entity.type === "document" && s.documents.some((d) => d.id === a.entity.id && d.workerId === wid));
  const w = Q.worker(s, wid);
  return (
    <Page title="History" sub="Shifts, hours, attendance exceptions and document changes per worker. Rows open the same timesheet record used everywhere else. No behavioural scores."
      actions={<select className="oss-input" style={{ width: 260, height: 34 }} value={wid} onChange={(e) => setWid(e.target.value)} aria-label="Worker">{s.workers.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.id})</option>)}</select>}>
      <div className="oss-grid oss-g4" style={{ marginBottom: 14 }}>
        <Metric label="Shifts in sample" value={ls.length} sub={w.priorShifts + " before (imported summary)"} />
        <Metric label="Worked" value={fmtHM(ls.reduce((t, l) => t + l.workedMin, 0))} />
        <Metric label="Payable" value={fmtHM(ls.reduce((t, l) => t + l.payableMin, 0))} />
        <Metric label="Attendance exceptions" value={ex.length} />
      </div>
      <Card title="Shifts and hours" pad={false}>
        <Table rows={ls} rowKey={(l) => l.id} onRow={(l) => openDrawer("timesheet", l.asg.id)} empty={<Empty title="No hours recorded in this sample" body="Load the Hours review stage to see completed shifts." />}
          cols={[{ key: "e", label: "Booking", render: (l) => l.event.name }, { key: "s", label: "Shift", render: (l) => l.shift.label }, { key: "d", label: "Date", render: (l) => fmtDate(l.shift.start) },
            { key: "w", label: "Worked", num: true, render: (l) => (l.complete ? fmtHM(l.workedMin) : "—") }, { key: "p", label: "Payable", num: true, render: (l) => (l.complete ? fmtHM(l.payableMin) : "—") },
            { key: "st", label: "State", render: (l) => l.status === "incomplete" ? <S s="Incomplete" /> : l.status === "exported" ? <S s="Sent to Bullhorn (simulated)" /> : l.status === "approved" ? <S s="Approved" /> : <S s="Ready" /> }]} />
      </Card>
      <div className="oss-grid oss-g2" style={{ marginTop: 14 }}>
        <Card title="Attendance exceptions" pad={false}><Table rows={ex} rowKey={(e) => e.id} empty={<Empty title="None" />} cols={[{ key: "t", label: "Type", render: (e) => e.type.replace(/_/g, " ") }, { key: "r", label: "Reason", render: (e) => e.reason }, { key: "s", label: "Status", render: (e) => <S s={e.status === "open" ? "Open" : "Resolved"} /> }]} /></Card>
        <Card title="Document changes" pad={false}><Table rows={docEvents} rowKey={(a) => a.id} empty={<Empty title="None in this sample" />} cols={[{ key: "t", label: "When", render: (a) => when(a.at) }, { key: "s", label: "Change", render: (a) => a.summary }]} /></Card>
      </div>
    </Page>
  );
}
void weekday;
