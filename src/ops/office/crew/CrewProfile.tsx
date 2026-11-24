/* One worker: contact details, availability, qualifications and documents,
   shifts, hours, messages and the Bullhorn reference. Assign from here. */

import { useMemo, useState } from "react";
import type { Avail, DocType, Rtw, Worker } from "../../model";
import { DOC_LABEL, ROLES } from "../../model";
import * as E from "../../engine";
import * as Q from "../../selectors";
import { go, setQuery, useRoute } from "../../router";
import { act, office, useOps } from "../../store";
import { dayKey, fmtDay, fmtDayY, fmtHM, fmtMoney, ms, span } from "../../time";
import { Avatar, Btn, Drawer, Field, I, KV, Notice, Panel, Seg, Select, Status, Table, Tabs, Tag } from "../../ui/kit";
import { Page } from "../common";
import { DirectMessages } from "../Comms";
import { DocReview } from "../Compliance";
import { WeekBar } from "./CrewList";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const RTWS: Rtw[] = ["Irish citizen", "EU/EEA citizen", "UK citizen", "Stamp 2", "Stamp 4", "Stamp 1G"];
const COUNTIES = ["Dublin", "Cork", "Limerick", "Galway", "Kildare", "Laois", "Wicklow", "Meath", "Louth", "Kerry", "Clare", "Waterford", "Tipperary", "Kilkenny", "Wexford", "Westmeath", "Sligo", "Mayo", "Donegal", "Cavan", "Monaghan", "Carlow", "Roscommon"];

export function AvailabilityEditor({ w, actor }: { w: Worker; actor: string }) {
  const [week, setWeek] = useState(w.week);
  const [from, setFrom] = useState(""), [to, setTo] = useState(""), [note, setNote] = useState("");
  const dirty = week !== w.week;
  return (
    <div className="stack g16">
      <div className="stack g8">
        {DAYS.map((d, i) => (
          <div key={d} className="row wrap" style={{ justifyContent: "space-between" }}>
            <span className="strong" style={{ width: 100 }}>{d}</span>
            <Seg label={d} value={week[i] as Avail} onChange={(v) => setWeek(week.slice(0, i) + v + week.slice(i + 1))}
              items={[{ id: "a", label: "All day" }, { id: "d", label: "Daytime" }, { id: "e", label: "Evenings" }, { id: "x", label: "Not available" }, { id: "?", label: "Not set" }]} />
          </div>
        ))}
        <div className="row"><Btn kind="primary" disabled={!dirty} onClick={() => act(actor, E.setWeek, w.id, week)}>Save weekly availability</Btn>{dirty && <Btn kind="quiet" onClick={() => setWeek(w.week)}>Undo</Btn>}</div>
        <span className="tiny dim">Daytime is 05:00 to 19:00, evenings 15:00 to 02:30. Changing availability never cancels confirmed shifts.</span>
      </div>
      <div className="stack g8">
        <h3>Unavailable dates</h3>
        {!w.off.length && <span className="dim small">None.</span>}
        {w.off.map((o) => <div key={o.id} className="row small"><b className="ink">{fmtDay(o.from)}{o.to !== o.from ? " to " + fmtDay(o.to) : ""}</b><span className="dim">{o.note}</span><span className="grow" />
          <Btn size="sm" kind="quiet" icon={I.x} iconOnly title="Remove" onClick={() => act(actor, E.removeOff, w.id, o.id)} /></div>)}
        <div className="row wrap">
          <input className="input sm" type="date" aria-label="First day" value={from} onChange={(e) => { setFrom(e.target.value); if (!to) setTo(e.target.value); }} style={{ width: 150 }} />
          <input className="input sm" type="date" aria-label="Last day" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
          <input className="input sm" placeholder="Reason (optional)" aria-label="Reason" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: 180 }} />
          <Btn size="sm" disabled={!from || !to} onClick={() => { if (act(actor, E.addOff, w.id, from, to, note).ok) { setFrom(""); setTo(""); setNote(""); } }}>Add</Btn>
        </div>
      </div>
    </div>
  );
}

function AssignDrawer({ w, onClose }: { w: Worker; onClose: () => void }) {
  const s = useOps();
  const [q, setQ] = useState("");
  const [reason, setReason] = useState<Record<string, string>>({});
  const now = ms(s.clock);
  const options = useMemo(() => s.shifts.filter((sh) => ms(sh.start) > now && Q.event(s, sh.eventId).status === "confirmed" && sh.needs.some((n) => w.roles.includes(n.role)))
    .sort((a, b) => a.start.localeCompare(b.start))
    .flatMap((sh) => sh.needs.filter((n) => w.roles.includes(n.role)).map((n) => ({ sh, role: n.role, c: Q.coverage(s, sh.id, n.role), e: Q.eligibility(s, w.id, sh.id, n.role) })))
    .filter((x) => !q || Q.event(s, x.sh.eventId).name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 60), [s, w.id, q]);
  return (
    <Drawer wide title={"Assign " + w.name} sub="Upcoming shifts that need one of their skills. Compliance blocks can't be overridden." onClose={onClose}>
      <div className="stack g12">
        <input className="input" placeholder="Search events" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search events" />
        {options.map(({ sh, role, c, e }) => {
          const k = sh.id + role;
          const offered = Q.openOffersOf(s, sh.id).some((o) => o.workerId === w.id);
          const hard = Q.blockers(e, "hard"), soft = Q.blockers(e, "soft");
          return (
            <div key={k} className="panel" style={{ padding: 12 }}>
              <div className="row wrap between">
                <div className="stack" style={{ gap: 1 }}>
                  <span className="strong">{Q.event(s, sh.eventId).name}</span>
                  <span className="small dim">{sh.label} · {role} · {fmtDay(dayKey(sh.start))} {span(sh.start, sh.end)} · {c.outstanding ? c.outstanding + " open" : "full"}</span>
                  {[...hard, ...soft].map((r, i) => <span key={i} className={"tiny " + (r.level === "hard" ? "tone-bad" : "tone-warn")}>{r.label}</span>)}
                </div>
                <div className="row wrap">
                  {e.status === "hard" ? <Status tone="bad">Blocked</Status> : offered ? <Tag>Offer sent</Tag> : c.outstanding === 0 ? <Btn size="sm" onClick={() => office(E.addStandby, sh.id, role, w.id)}>Add to standby</Btn> : <>
                    <Btn size="sm" disabled={soft.some((r) => r.code !== "avail")} onClick={() => office(E.sendOffers, sh.id, role, [w.id])}>Send offer</Btn>
                    <Btn size="sm" kind="primary" disabled={soft.length > 0 && (reason[k] || "").trim().length < 5} onClick={() => { if (office(E.assignManual, sh.id, role, w.id, reason[k] || "").ok) onClose(); }}>Assign</Btn>
                  </>}
                </div>
              </div>
              {soft.length > 0 && e.status !== "hard" && c.outstanding > 0 && !offered &&
                <input className="input sm" style={{ marginTop: 8 }} placeholder="Reason to override (kept in the audit log)" value={reason[k] || ""} onChange={(ev) => setReason({ ...reason, [k]: ev.target.value })} aria-label="Override reason" />}
            </div>
          );
        })}
        {!options.length && <div className="empty"><b>No matching shifts</b>No upcoming shift needs {w.roles.join(" or ").toLowerCase()}.</div>}
      </div>
    </Drawer>
  );
}

function EditDrawer({ w, onClose }: { w: Worker; onClose: () => void }) {
  const [f, setF] = useState({ name: w.name, email: w.email, mobile: w.mobile, area: w.area, county: w.county, roles: w.roles, rtw: w.rtw, note: w.note || "" });
  return (
    <Drawer title={"Edit " + w.name} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={() => { if (office(E.updateWorker, w.id, f).ok) onClose(); }}>Save</Btn></>}>
      <div className="stack g12">
        <Field label="Full name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <div className="grid2"><Field label="Mobile"><input className="input" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field></div>
        <div className="grid2"><Field label="Area"><input className="input" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} /></Field>
          <Field label="County"><Select value={f.county} onChange={(v) => setF({ ...f, county: v })} options={COUNTIES.map((c) => ({ value: c, label: c }))} /></Field></div>
        <Field label="Work authorisation"><Select value={f.rtw} onChange={(v) => setF({ ...f, rtw: v as Rtw })} options={RTWS.map((r) => ({ value: r, label: r }))} /></Field>
        <div className="stack g8"><span className="small strong">Skills</span><div className="row wrap">{ROLES.map((r) => <button key={r} className={"chip" + (f.roles.includes(r) ? " on" : "")} aria-pressed={f.roles.includes(r)}
          onClick={() => setF({ ...f, roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] })}>{r}</button>)}</div></div>
        <Field label="Office note"><textarea className="textarea" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <span className="tiny dim">Changes are queued for the Bullhorn sync (simulated).</span>
      </div>
    </Drawer>
  );
}

function UploadForm({ w }: { w: Worker }) {
  const s = useOps();
  const [type, setType] = useState<DocType>("MH");
  const [issued, setIssued] = useState(dayKey(s.clock));
  const [expires, setExpires] = useState("");
  const [file, setFile] = useState("");
  return (
    <div className="row wrap" style={{ alignItems: "flex-end" }}>
      <Field label="Document"><Select value={type} onChange={(v) => setType(v as DocType)} options={(Object.keys(DOC_LABEL) as DocType[]).map((t) => ({ value: t, label: DOC_LABEL[t] }))} /></Field>
      <Field label="Issued"><input className="input" type="date" value={issued} onChange={(e) => setIssued(e.target.value)} /></Field>
      <Field label="Expires"><input className="input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
      <Field label="File (name only is kept)"><input className="input" type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0]?.name || "")} /></Field>
      <Btn kind="primary" icon={I.upload} onClick={() => { if (office(E.uploadDoc, w.id, { type, issued, expires, fileName: file || undefined }).ok) setExpires(""); }}>Upload for verification</Btn>
    </div>
  );
}

export default function CrewProfile({ id }: { id: string }) {
  const s = useOps();
  const r = useRoute();
  const [assign, setAssign] = useState(false);
  const [edit, setEdit] = useState(false);
  const [doc, setDoc] = useState<string | null>(null);
  const w = Q.worker(s, id);
  if (!w) return <Page title="Worker not found" back={{ to: "/crew", label: "Crew" }}><Notice tone="warn">No worker with this reference in the demo data.</Notice></Page>;
  const tab = r.q.get("tab") || "overview";
  const comp = Q.compliance(s, w.id);
  const asgs = Q.asgsOfWorker(s, w.id).filter((a) => !!Q.shift(s, a.shiftId));
  const now = ms(s.clock);
  const upcoming = asgs.filter((a) => a.status === "confirmed" && ms(Q.shift(s, a.shiftId).end) > now).sort((a, b) => Q.shift(s, a.shiftId).start.localeCompare(Q.shift(s, b.shiftId).start));
  const previous = asgs.filter((a) => ms(Q.shift(s, a.shiftId).end) <= now || a.status !== "confirmed").sort((a, b) => Q.shift(s, b.shiftId).start.localeCompare(Q.shift(s, a.shiftId).start));
  const offers = Q.offersOfWorker(s, w.id).filter((o) => Q.isOpenOffer(s, o) && !!Q.shift(s, o.shiftId));
  const ls = Q.lines(s, { workerId: w.id });
  const t = Q.lineTotals(ls);
  const wk = Q.weekMinutes(s, w.id, s.clock), lim = Q.weekLimit(s, w);
  const docs = Q.docsOf(s, w.id).slice().sort((a, b) => a.type.localeCompare(b.type) || b.uploadedAt.localeCompare(a.uploadedAt));
  const canView = Q.can(s, s.ui.officeId, "view_docs");
  return (
    <Page back={{ to: "/crew", label: "Crew" }}
      title={<span className="row wrap"><Avatar name={w.name} size="lg" />{w.name}
        {w.status === "pending_verification" ? <Status tone="warn">Not verified yet</Status> : <Status tone={comp.level === "ok" ? "ok" : comp.level === "expiring" ? "warn" : "bad"}>{comp.level === "ok" ? "Documents valid" : comp.summary}</Status>}</span>}
      sub={<span className="row wrap" style={{ gap: 6 }}>{w.roles.map((x) => <Tag key={x}>{x}</Tag>)}<span className="dim">· {w.area}, {w.county} · {w.rtw}</span>{w.emergency && <Tag>Registered on site by {Q.nameOf(s, w.emergency.by)}</Tag>}</span>}
      actions={<><Btn icon={I.comms} onClick={() => setQuery({ tab: "messages" })}>Message</Btn><Btn icon={I.edit} onClick={() => setEdit(true)}>Edit</Btn>
        <Btn kind="primary" icon={I.plus} disabled={w.status !== "active"} title={w.status !== "active" ? "Verify documents first" : undefined} onClick={() => setAssign(true)}>Assign to event</Btn></>}>
      <div style={{ marginBottom: 16 }}>
        <Tabs label="Worker" value={tab} onChange={(v) => setQuery({ tab: v })} items={[{ id: "overview", label: "Overview" }, { id: "availability", label: "Availability" },
          { id: "documents", label: "Documents", n: comp.level === "ok" ? 0 : comp.items.filter((i) => !["valid", "not_required"].includes(i.view.state)).length, tone: comp.level === "action" ? "bad" : "warn" },
          { id: "shifts", label: "Shifts", n: upcoming.length + offers.length }, { id: "hours", label: "Hours" }, { id: "messages", label: "Messages" }]} />
      </div>
      {tab === "overview" && (
        <div className="grid2" style={{ alignItems: "start" }}>
          <div className="stack g16">
            <Panel title="Contact"><KV items={[["Mobile", <a href={"tel:" + w.mobile.replace(/\s/g, "")}>{w.mobile}</a>], ["Email", w.email ? <a href={"mailto:" + w.email}>{w.email}</a> : "-"], ["Area", w.area + ", " + w.county], ["Joined", fmtDay(w.joined)], ["Worker reference", w.id]]} /></Panel>
            <Panel title="Bullhorn" right={<Status tone={w.bullhornState === "synced" ? "ok" : w.bullhornState === "pending" ? "warn" : "grey"}>{w.bullhornState === "synced" ? "In sync" : w.bullhornState === "pending" ? "Changes to send" : "Not linked"}</Status>}>
              <KV items={[["Candidate ref", w.bullhornId || "Created on next sync"], ["Sync", "Two-way, simulated"]]} />
            </Panel>
            {w.note && <Panel title="Office note"><p>{w.note}</p></Panel>}
          </div>
          <div className="stack g16">
            <Panel title="This week"><div className="stack g8">
              <span className={"num " + (wk > lim.min ? (lim.strict ? "tone-bad strong" : "tone-warn") : "")} style={{ fontSize: 20 }}>{fmtHM(wk)} <span className="small dim">of {fmtHM(lim.min)} ({lim.label})</span></span>
              {w.rtw === "Stamp 2" && <span className="small dim">Stamp 2 students can work 20 hours a week in term and 40 in the holiday months. Bookings over the limit need an override and a reason.</span>}
            </div></Panel>
            <Panel title="Next shifts" right={<Btn size="sm" kind="ghost" onClick={() => setQuery({ tab: "shifts" })}>All shifts</Btn>}>
              {!upcoming.length && <span className="dim">No upcoming shifts.</span>}
              <div className="stack g8">{upcoming.slice(0, 4).map((a) => { const sh = Q.shift(s, a.shiftId); return (
                <button key={a.id} className="linkbtn" style={{ textAlign: "left" }} onClick={() => go("/events/" + sh.eventId + "?tab=roster&shift=" + sh.id + "&day=" + dayKey(sh.start))}>
                  <b>{fmtDay(dayKey(sh.start))} {span(sh.start, sh.end)}</b> <span className="dim">{Q.event(s, sh.eventId).name} · {a.role}</span></button>); })}</div>
            </Panel>
            <Panel title="Availability" right={<Btn size="sm" kind="ghost" onClick={() => setQuery({ tab: "availability" })}>Change</Btn>}><WeekBar week={w.week} /></Panel>
          </div>
        </div>
      )}
      {tab === "availability" && <Panel title="Availability"><AvailabilityEditor w={w} actor={s.ui.officeId} /></Panel>}
      {tab === "documents" && (
        <div className="stack g16">
          <Panel title="Documents and qualifications" flush meta={comp.summary}>
            <Table label="Documents" rows={docs} rowKey={(d) => d.id} empty={<div className="empty"><b>No documents</b>Upload one below or ask the worker to use the app.</div>} cols={[
              { key: "t", label: "Document", render: (d) => <div className="stack" style={{ gap: 0 }}><span className="ink">{DOC_LABEL[d.type]}</span><span className="tiny dim">{d.name}</span></div> },
              { key: "r", label: "Reference", hide: "sm", render: (d) => <span className="num small">{d.ref}</span> },
              { key: "i", label: "Issued", hide: "md", render: (d) => fmtDayY(d.issued, dayKey(s.clock)) },
              { key: "e", label: "Expires", render: (d) => (d.expires ? fmtDayY(d.expires, dayKey(s.clock)) : "-") },
              { key: "s", label: "Status", render: (d) => { const v = Q.docState(s, w.id, d.type); const current = v.doc?.id === d.id;
                return d.status === "pending" ? <Status tone="info">Awaiting verification</Status> : d.status === "rejected" ? <Status tone="bad">Rejected</Status>
                  : current ? <Status tone={v.state === "valid" ? "ok" : v.state === "expiring" ? "warn" : "bad"}>{v.state === "valid" ? "Valid" : v.state === "expiring" ? "Expiring" : "Expired"}</Status> : <Status tone="grey">Replaced</Status>; } },
              { key: "a", label: "", render: (d) => <Btn size="sm" kind="quiet" icon={canView ? I.eye : I.lock} onClick={() => setDoc(d.id)}>{d.status === "pending" ? "Review" : "View"}</Btn> }]} />
          </Panel>
          <Panel title="Upload on the worker's behalf"><UploadForm w={w} /></Panel>
        </div>
      )}
      {tab === "shifts" && (
        <div className="stack g16">
          {offers.length > 0 && <Panel title="Offers waiting for a reply" flush><Table label="Offers" rows={offers} rowKey={(o) => o.id} cols={[
            { key: "e", label: "Event", render: (o) => Q.event(s, Q.shift(s, o.shiftId).eventId).name },
            { key: "d", label: "When", render: (o) => { const sh = Q.shift(s, o.shiftId); return fmtDay(dayKey(sh.start)) + " " + span(sh.start, sh.end); } },
            { key: "r", label: "Role", render: (o) => o.role }, { key: "x", label: "Expires", render: (o) => fmtDay(dayKey(o.expiresAt)) + " " + o.expiresAt.slice(11, 16) },
            { key: "a", label: "", render: (o) => <Btn size="sm" kind="quiet" onClick={() => office(E.withdrawOffer, o.id)}>Withdraw</Btn> }]} /></Panel>}
          <Panel title="Upcoming shifts" flush><Table label="Upcoming shifts" rows={upcoming} rowKey={(a) => a.id} onRow={(a) => go("/events/" + Q.shift(s, a.shiftId).eventId + "?tab=roster")} empty={<div className="empty">No upcoming shifts.</div>} cols={[
            { key: "d", label: "When", render: (a) => { const sh = Q.shift(s, a.shiftId); return <span className="nowrap">{fmtDay(dayKey(sh.start))} {span(sh.start, sh.end)}</span>; } },
            { key: "e", label: "Event", render: (a) => Q.event(s, Q.shift(s, a.shiftId).eventId).name },
            { key: "r", label: "Role", render: (a) => a.role }, { key: "s", label: "Status", render: (a) => { const v = Q.asgView(s, a.id); return <Status tone={v.tone}>{v.label}</Status>; } }]} /></Panel>
          <Panel title="Previous assignments" flush><Table label="Previous assignments" rows={previous.slice(0, 40)} rowKey={(a) => a.id} empty={<div className="empty">No history yet.</div>} cols={[
            { key: "d", label: "When", render: (a) => fmtDay(dayKey(Q.shift(s, a.shiftId).start)) },
            { key: "e", label: "Event", render: (a) => Q.event(s, Q.shift(s, a.shiftId).eventId).name },
            { key: "r", label: "Role", render: (a) => a.role },
            { key: "s", label: "Outcome", render: (a) => (a.status === "confirmed" ? (Q.line(s, a.id)?.payableMin ? fmtHM(Q.line(s, a.id)!.payableMin) + " paid" : "Worked") : a.status === "cancelled" ? "Cancelled: " + a.endReason : a.status === "stood_down" ? "Stood down" : "Removed") }]} /></Panel>
        </div>
      )}
      {tab === "hours" && (
        <Panel title="Recorded hours" meta={ls.length + " timesheets · " + fmtHM(t.payable) + " payable · " + fmtMoney(t.pay) + " estimated"} flush>
          <Table label="Hours" rows={ls.slice().reverse()} rowKey={(l) => l.id} empty={<div className="empty">No hours recorded yet.</div>} cols={[
            { key: "d", label: "Date", render: (l) => fmtDay(l.day) }, { key: "e", label: "Event", render: (l) => l.ev.name },
            { key: "w", label: "Worked", cls: "r", render: (l) => <span className="num">{l.inAt && l.outAt ? fmtHM(l.workedMin) : "-"}</span> },
            { key: "p", label: "Payable", cls: "r", render: (l) => <span className="num">{l.payableMin ? fmtHM(l.payableMin) : "-"}{l.topupMin > 0 && <div className="tiny tone-info">incl. {fmtHM(l.topupMin)} minimum</div>}</span> },
            { key: "s", label: "Status", render: (l) => Q.LINE_LABEL[l.status] }]} />
        </Panel>
      )}
      {tab === "messages" && <DirectMessages workerId={w.id} />}
      {assign && <AssignDrawer w={w} onClose={() => setAssign(false)} />}
      {edit && <EditDrawer w={w} onClose={() => setEdit(false)} />}
      {doc && <DocReview doc={Q.docById(s, doc)} onClose={() => setDoc(null)} />}
    </Page>
  );
}
