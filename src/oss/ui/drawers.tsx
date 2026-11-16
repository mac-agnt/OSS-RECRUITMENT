/* The canonical record drawers. Every module opens these instead of keeping its
   own copy of a record, so a worker, booking or timesheet looks the same everywhere. */

import { useState } from "react";
import type { OssState } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { docLabel } from "../seed";
import { closeDrawer, navigate, openDrawer, run, setUi, useOss } from "../store";
import { fmtDate, fmtDayMonth, fmtHM, fmtTime, ms, zoned } from "../time";
import { Av, Btn, Cov, Drawer, Empty, I, Icon, KV, Reason, S, Section, Seg, St, Table, TimeSelect } from "./kit";
import { RecLink, hm, span, when } from "./fmt";
import { profile, reliability, stamp2Check, STAMP2_CAP_MIN } from "../industry";

export function RecordDrawer() {
  const s = useOss();
  const dr = s.ui.drawer;
  if (!dr) return null;
  if (dr.kind === "worker") return <WorkerDrawer s={s} id={dr.id} />;
  if (dr.kind === "event") return <EventDrawer s={s} id={dr.id} />;
  if (dr.kind === "timesheet") return <TimesheetDrawer s={s} asgId={dr.id} />;
  if (dr.kind === "batch") return <BatchDrawer s={s} id={dr.id} />;
  if (dr.kind === "client") return <ClientDrawer s={s} id={dr.id} />;
  if (dr.kind === "venue") return <VenueDrawer s={s} id={dr.id} />;
  if (dr.kind === "mapping") return <MappingDrawer s={s} workerId={dr.id} />;
  return null;
}

const docTone = (st: Q.DocState) => (st === "valid" ? "Valid" : st === "expiring" ? "Expiring" : st === "expired" ? "Expired doc" : st === "pending" ? "Pending review" : st === "rejected" ? "Rejected" : "Missing");

function WorkerDrawer({ s, id }: { s: OssState; id: string }) {
  const w = Q.worker(s, id);
  const [tab, setTab] = useState<"profile" | "availability" | "work" | "documents" | "messages" | "history">("profile");
  if (!w) return null;
  const asgs = s.assignments.filter((a) => a.workerId === id).sort((a, b) => Q.shiftOf(s, a.shiftId).start.localeCompare(Q.shiftOf(s, b.shiftId).start));
  const upcoming = asgs.filter((a) => a.status === "confirmed" && ms(Q.shiftOf(s, a.shiftId).end) > ms(s.clock));
  const invs = s.invitations.filter((i) => i.workerId === id);
  const docs = s.documents.filter((d) => d.workerId === id);
  const map = s.mappings.find((m) => m.localId === id);
  const msgs = s.messages.filter((m) => m.recipients.includes(id) || m.from.id === id).slice(-12).reverse();
  const ls = Q.lines(s, { workerId: id });
  return (
    <Drawer eyebrow={w.roles.join(", ") + " · " + w.locality + " · " + w.mobile} title={<span style={{ display: "flex", alignItems: "center", gap: 10 }}><Av name={w.name} />{w.name}</span>} wide
      footer={<><Btn size="sm" icon={I.phone} onClick={() => { setUi({ drawer: null, role: "crew", crewWorkerId: id, phoneOpen: true }); }}>See {w.name.split(" ")[0]}'s app</Btn>
        <Btn size="sm" icon={I.msg} onClick={() => navigate("Messages", "inbox")}>Message</Btn></>}>
      <Seg value={tab} onChange={setTab} options={[{ id: "profile", label: "Profile" }, { id: "availability", label: "Availability" }, { id: "work", label: "Upcoming work", n: upcoming.length },
        { id: "documents", label: "Documents", n: docs.length }, { id: "messages", label: "Messages" }, { id: "history", label: "History" }]} />
      <div style={{ marginTop: 16 }}>
        {tab === "profile" && <>
          <KV items={[["Roles", w.roles.join(", ")], ["Locality", w.locality], ["Email", w.email], ["Mobile", w.mobile], ["Status", w.status === "active" ? <S s="Confirmed" /> : <S s="Pending compliance" />],
            ["Bullhorn mapping", map?.status === "mapped" ? map.remoteId : <S s="Mapping pending" />], ["Prior shifts (imported summary)", w.priorShifts], ["Prior venues", w.priorVenues.join(", ") || "None"]]} />
          {w.registeredBy && <div className="oss-note" style={{ marginTop: 12 }}>Registered by {w.registeredBy} on {when(w.registeredAt)}. Compliance review pending.</div>}
          <CrewFile s={s} id={id} />
          <Section title="Eligibility for open 3Arena shifts">
            {["SH-001A", "SH-001B"].map((sid) => { const e = Q.eligibility(s, id, sid); return (
              <div key={sid} style={{ marginBottom: 10 }}>
                <div className="oss-row" style={{ marginBottom: 6 }}><b className="oss-ink oss-small">{Q.shiftOf(s, sid).label}</b><St tone={e.status === "eligible" ? "ok" : e.status === "warning" ? "warn" : e.status === "unknown" ? "neutral" : "bad"}>{({ eligible: "Eligible", warning: "Eligible, renewal due", unknown: "Availability unknown", blocked: "Blocked" } as const)[e.status]}</St></div>
                {e.reasons.map((r, i) => <Reason key={i} level={r.level}>{r.label}</Reason>)}
              </div>); })}
          </Section>
        </>}
        {tab === "availability" && <AvailabilityList s={s} id={id} />}
        {tab === "work" && <Table rows={upcoming} rowKey={(a) => a.id} empty={<Empty title="No upcoming confirmed work" />} onRow={(a) => openDrawer("event", Q.shiftOf(s, a.shiftId).eventId)}
          cols={[{ key: "e", label: "Booking", render: (a) => Q.eventOf(s, Q.shiftOf(s, a.shiftId).eventId).name },
            { key: "s", label: "Shift", render: (a) => Q.shiftOf(s, a.shiftId).label },
            { key: "w", label: "When", nowrap: true, render: (a) => span(Q.shiftOf(s, a.shiftId).start, Q.shiftOf(s, a.shiftId).end) },
            { key: "st", label: "Status", render: (a) => a.shiftVersion < Q.shiftOf(s, a.shiftId).version ? <S s="Needs review" /> : <S s="Confirmed" /> }]} />}
        {tab === "documents" && <Table rows={docs} rowKey={(d) => d.id} empty={<Empty title="No documents on file" />}
          cols={[{ key: "t", label: "Type", render: (d) => docLabel(d.type) }, { key: "f", label: "Sample file", render: (d) => <span className="oss-mono">{d.file}</span> },
            { key: "e", label: "Expires", nowrap: true, render: (d) => fmtDayMonth(zoned(d.expires, "12:00")) + " " + d.expires.slice(0, 4) },
            { key: "r", label: "Review", render: (d) => <S s={docTone(Q.docStatusToday(s, d))} /> },
            { key: "a", label: "", render: (d) => d.review === "pending" ? <span style={{ display: "flex", gap: 6 }}><Btn size="sm" kind="primary" onClick={() => run(E.reviewDocument, d.id, "approved")}>Approve</Btn><Btn size="sm" onClick={() => run(E.reviewDocument, d.id, "rejected")}>Reject</Btn></span> : d.reviewer ? <span className="oss-small oss-muted">by {Q.nameOf(s, d.reviewer)}</span> : null }]} />}
        {tab === "messages" && (msgs.length ? <div className="oss-list">{msgs.map((m) => (
          <div key={m.id}><div className="oss-row"><b className="oss-small oss-ink">{m.from.kind === "worker" ? w.name : m.from.kind === "system" ? "Automation" : Q.nameOf(s, m.from.id)}</b><span className="oss-tiny oss-muted">{when(m.at)}</span>
            {m.receipts[id]?.ack ? <St tone="ok">Acknowledged</St> : m.receipts[id]?.read ? <St tone="neutral">Read</St> : m.receipts[id] ? <St tone="neutral">Delivered</St> : null}</div>
            <div className="oss-small" style={{ marginTop: 4 }}>{m.body}</div></div>))}</div> : <Empty title="No messages" />)}
        {tab === "history" && <>
          <Table rows={ls} rowKey={(l) => l.id} onRow={(l) => openDrawer("timesheet", l.asg.id)} empty={<Empty title="No hours recorded yet" body={w.priorShifts + " earlier shifts were imported from TeamTrack."} />}
            cols={[{ key: "e", label: "Shift", render: (l) => l.event.name + ", " + l.shift.label.toLowerCase() }, { key: "d", label: "Date", nowrap: true, render: (l) => fmtDate(l.shift.start) },
              { key: "w", label: "Worked", num: true, render: (l) => l.complete ? fmtHM(l.workedMin) : "-" }, { key: "p", label: "Payable", num: true, render: (l) => l.complete ? fmtHM(l.payableMin) : "-" },
              { key: "s", label: "Status", render: (l) => <LineStatus st={l.status} /> }]} />
          <Section title="Invitations">
            <Table rows={invs} rowKey={(i) => i.id} cols={[{ key: "s", label: "Shift", render: (i) => Q.eventOf(s, Q.shiftOf(s, i.shiftId).eventId).name + ", " + Q.shiftOf(s, i.shiftId).label.toLowerCase() },
              { key: "t", label: "Sent", nowrap: true, render: (i) => when(i.sentAt) }, { key: "r", label: "Reply", render: (i) => <S s={Q.inviteLabel(s, i)} /> },
              { key: "c", label: "Cancelled", render: (i) => { const a = s.assignments.find((x) => x.invitationId === i.id && x.status === "cancelled"); return a ? <St tone="bad">Cancelled {fmtTime(a.cancelledAt!)}</St> : null; } }]} />
          </Section>
        </>}
      </div>
    </Drawer>
  );
}

function CrewFile({ s, id }: { s: OssState; id: string }) {
  const w = Q.worker(s, id);
  const p = profile(w);
  const st2 = stamp2Check(s, id);
  const rel = reliability(p);
  return <>
    <Section title="Reliability, last 90 days">
      <div className="oss-grid oss-g4" style={{ gap: 8 }}>
        <div className="oss-metric"><div className="l">Shifts</div><div className="v">{p.shifts90}</div></div>
        <div className={"oss-metric" + (rel < 95 ? " warn" : " ok")}><div className="l">Turned up</div><div className="v">{rel}%</div></div>
        <div className={"oss-metric" + (p.noShows ? " bad" : "")}><div className="l">No-shows</div><div className="v">{p.noShows}</div></div>
        <div className={"oss-metric" + (p.lateCancels + p.lates ? " warn" : "")}><div className="l">Late cancels / lates</div><div className="v">{p.lateCancels} / {p.lates}</div></div>
      </div>
    </Section>
    <Section title="Right to work and hours">
      <div className="oss-row" style={{ gap: 10, flexWrap: "wrap" }}><St tone={p.rtw.startsWith("Stamp 2") ? "warn" : "ok"}>{p.rtw}</St>{p.teamLeader && <St tone="info">Team leader</St>}{p.radio && <St tone="neutral">Radio trained</St>}</div>
      {st2 && <div style={{ marginTop: 12 }}>
        <div className="oss-small oss-dim" style={{ marginBottom: 6 }}>This week: {fmtHM(st2.earlier)} Mon to Thu + {fmtHM(st2.booked)} booked = <b className="oss-ink">{fmtHM(st2.total)}</b> of 20h (term time)</div>
        <span style={{ display: "block", height: 8, borderRadius: 999, background: "var(--track)", overflow: "hidden" }}><i style={{ display: "block", height: "100%", width: Math.min(100, (st2.total / STAMP2_CAP_MIN) * 100) + "%", background: st2.total > STAMP2_CAP_MIN ? "var(--bad)" : st2.total > STAMP2_CAP_MIN - 240 ? "var(--warn)" : "var(--accent)" }} /></span>
      </div>}
    </Section>
    <Section title="Licences and training">{p.licences.length ? <div className="oss-pills">{p.licences.map((l) => <span key={l} className="oss-pill"><Icon d={I.shield} size={12} />{l}</span>)}</div> : <div className="oss-small oss-muted">None beyond the documents on file</div>}</Section>
    <Section title="With clients">
      <div className="oss-list oss-small">
        {p.preferredBy.map((c) => <div key={c} className="oss-row"><St tone="ok">Preferred</St><span>{Q.clientOf(s, c).name} asks for {w.name.split(" ")[0]} by name</span></div>)}
        {p.dnr.map((d) => <div key={d.clientId} className="oss-row"><St tone="bad">Do not rebook</St><span>{Q.clientOf(s, d.clientId).name}: {d.reason}</span></div>)}
        {!p.preferredBy.length && !p.dnr.length && <div className="oss-muted">No client preferences recorded</div>}
      </div>
    </Section>
    <Section title="Practical"><KV items={[["Uniform", p.uniform], ["Gets there by", p.transport], ["Languages", p.languages.join(", ")], ["Rating", p.rating.toFixed(1) + " / 5"]]} /></Section>
  </>;
}

export function AvailabilityList({ s, id }: { s: OssState; id: string }) {
  const rules = s.availRules.filter((r) => r.workerId === id);
  const ex = s.availExceptions.filter((x) => x.workerId === id && ms(x.end) > ms(s.clock) - 7 * 864e5);
  return <>
    <Section title="Recurring">{rules.length ? <div className="oss-pills">{rules.map((r) => <span key={r.id} className="oss-pill">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][r.weekday]} {r.start} to {r.end}</span>)}</div> : <div className="oss-small oss-muted">Not submitted</div>}</Section>
    <Section title="Dates and exceptions">{ex.length ? <div className="oss-list">{ex.map((x) => (
      <div key={x.id} className="oss-row"><St tone={x.kind === "available" ? "ok" : "bad"}>{x.kind === "available" ? "Available" : x.kind === "holiday" ? "Holiday" : "Unavailable"}</St>
        <span className="oss-small grow">{fmtDate(x.start)} {fmtTime(x.start)} to {fmtDate(x.end) === fmtDate(x.start) ? "" : fmtDate(x.end) + " "}{fmtTime(x.end)}</span><span className="oss-tiny oss-muted">{x.note}</span></div>))}</div>
      : <div className="oss-small oss-muted">None</div>}</Section>
    <div className="oss-note" style={{ marginTop: 12 }}>Holiday and unavailable entries override recurring availability. Changing availability never cancels confirmed work.</div>
  </>;
}

export function LineStatus({ st }: { st: Q.LineStatus }) {
  const m: Record<Q.LineStatus, string> = { in_progress: "In progress", incomplete: "Incomplete", needs_review: "Needs review", ready: "Ready", approved: "Approved", exported: "Sent to Bullhorn" };
  return <S s={m[st]} />;
}

function EventDrawer({ s, id }: { s: OssState; id: string }) {
  const e = Q.eventOf(s, id);
  const [tab, setTab] = useState<"overview" | "shifts" | "roster" | "brief" | "comms" | "history">("overview");
  if (!e) return null;
  const shifts = Q.shiftsOfEvent(s, id);
  const c = Q.eventCoverage(s, id);
  const v = Q.venueOf(s, e.venueId);
  const cl = Q.clientOf(s, e.clientId);
  const roster = s.assignments.filter((a) => shifts.some((x) => x.id === a.shiftId));
  const invs = s.invitations.filter((i) => shifts.some((x) => x.id === i.shiftId) && Q.isActiveInvite(s, i));
  const hist = s.audit.filter((a) => a.entity.id === id || shifts.some((x) => x.id === a.entity.id) || roster.some((r) => r.id === a.entity.id) || s.invitations.some((i) => i.id === a.entity.id && shifts.some((x) => x.id === i.shiftId))).slice(-30).reverse();
  return (
    <Drawer eyebrow={e.id + (e.status === "pending" ? " · pending booking" : e.historical ? " · completed" : " · confirmed booking")} title={e.name} wide
      footer={<>{e.status !== "pending" && !e.historical && <Btn kind="primary" icon={I.users} onClick={() => navigate("Staffing", "allocation", { kind: "event", id })}>Open staffing</Btn>}
        {e.status === "pending" && <Btn kind="primary" onClick={() => run(E.setBookingStatus, id, "confirmed")}>Confirm booking</Btn>}
        <Btn icon={I.msg} onClick={() => navigate("Work", "comms", { kind: "event", id })}>Message crew</Btn>
        <Btn icon={I.clock} onClick={() => navigate("Timesheets", "review", { kind: "event", id })}>Hours</Btn></>}>
      <Seg value={tab} onChange={setTab} options={[{ id: "overview", label: "Overview" }, { id: "shifts", label: "Shifts", n: shifts.length }, { id: "roster", label: "Roster", n: roster.filter((r) => r.status === "confirmed").length },
        { id: "brief", label: "Brief & PPE" }, { id: "comms", label: "Communication" }, { id: "history", label: "History" }]} />
      <div style={{ marginTop: 16 }}>
        {tab === "overview" && <>
          <KV items={[["Booking client", <RecLink kind="client" id={cl.id}>{cl.name}</RecLink>], ["Venue", v ? <RecLink kind="venue" id={v.id}>{v.name}</RecLink> : "Venue awaiting confirmation"],
            ["Date", fmtDate(zoned(e.date, "12:00"))], ["Coordinator", Q.nameOf(s, e.ownerId)], ["Approver", Q.nameOf(s, e.approverId)], ["Site supervisor", Q.nameOf(s, e.supervisorId)],
            ["Status", e.status === "pending" ? <S s="Pending" /> : <S s="Firm" />], ["Coverage", e.status === "pending" ? e.indicativePositions + " indicative" : <Cov c={c} />]]} />
          {e.pendingNote && <div className="oss-note" style={{ marginTop: 12 }}>{e.pendingNote} Pending demand is excluded from firm coverage.</div>}
          {cl.id === "C01" && <div className="oss-note" style={{ marginTop: 12 }}>{cl.provenance}</div>}
          <Section title="Definitions">
            <div className="oss-small oss-dim" style={{ lineHeight: 1.6 }}>Confirmed: active accepted assignments. Awaiting reply: open invitations reserving positions. Allocated: confirmed plus reserved. Unfilled: required minus confirmed (includes positions awaiting a reply). Standby does not count.</div>
          </Section>
        </>}
        {tab === "shifts" && <ShiftTable s={s} shifts={shifts} />}
        {tab === "shifts" && !e.historical && <ShiftTimeEditor s={s} shifts={shifts} />}
        {tab === "roster" && <Table rows={roster.concat([]).sort((a, b) => a.shiftId.localeCompare(b.shiftId) || a.workerId.localeCompare(b.workerId))} rowKey={(a) => a.id} onRow={(a) => openDrawer("worker", a.workerId)}
          cols={[{ key: "w", label: "Worker", render: (a) => Q.nameOf(s, a.workerId) }, { key: "s", label: "Shift", render: (a) => Q.shiftOf(s, a.shiftId).label },
            { key: "st", label: "Status", render: (a) => a.status === "confirmed" ? (a.replacementFor ? <St tone="ok">Confirmed (replacement)</St> : <S s="Confirmed" />) : <St tone="bad">{a.status === "cancelled" ? "Cancelled " + fmtTime(a.cancelledAt!) : "Withdrawn"}</St> },
            { key: "ar", label: "Arrival", render: (a) => a.status === "confirmed" ? <span className="oss-small oss-dim">{Q.arrivalState(s, a.id)} · {Q.attendanceState(s, a.id)}</span> : null }]}
          empty={<Empty title="No roster yet" />} />}
        {tab === "roster" && invs.length > 0 && <Section title={"Awaiting reply (" + invs.length + ")"}><div className="oss-pills">{invs.map((i) => <span key={i.id} className="oss-pill">{Q.nameOf(s, i.workerId)} · {Q.shiftOf(s, i.shiftId).label}</span>)}</div></Section>}
        {tab === "brief" && <>
          <Section title="Brief"><div className="oss-small" style={{ lineHeight: 1.6 }}>{e.brief}</div></Section>
          <Section title="PPE"><div className="oss-pills">{e.ppe.map((p) => <span key={p} className="oss-pill">{p}</span>)}</div></Section>
          <Section title="Required evidence"><div className="oss-pills">{Array.from(new Set(shifts.flatMap((x) => x.requiredDocs))).map((t) => <span key={t} className="oss-pill">{docLabel(t)} (valid through shift end)</span>)}{!shifts.some((x) => x.requiredDocs.length) && <span className="oss-small oss-muted">None for this booking</span>}</div></Section>
          {v && <Section title="Meeting point"><div className="oss-row"><span className="grow oss-small">{v.meetingPoint}</span>{v.meetingConfirmed ? <S s="Resolved" /> : <St tone="warn">Awaiting confirmation</St>}</div></Section>}
          <div className="oss-note" style={{ marginTop: 14 }}>These are demo requirements for this booking, not a claim that every OSS event needs the same evidence or equipment.</div>
        </>}
        {tab === "comms" && <div className="oss-list">{s.messages.filter((m) => m.threadId === "TH-" + id || (m.related && s.invitations.some((i) => i.id === m.related!.id && shifts.some((x) => x.id === i.shiftId)))).slice(-15).reverse().map((m) => (
          <div key={m.id}><div className="oss-row"><b className="oss-small oss-ink">{m.audience || (m.recipients.length === 1 ? Q.nameOf(s, m.recipients[0]) : m.recipients.length + " recipients")}</b><span className="oss-tiny oss-muted">{when(m.at)} · {m.kind}</span></div><div className="oss-small" style={{ marginTop: 3 }}>{m.body}</div></div>))}
          {!s.messages.some((m) => m.threadId === "TH-" + id) && <div className="oss-small oss-muted">No event-group messages yet.</div>}</div>}
        {tab === "history" && <AuditList s={s} items={hist} />}
      </div>
    </Drawer>
  );
}

export function ShiftTable({ s, shifts }: { s: OssState; shifts: ReturnType<typeof Q.shiftsOfEvent> }) {
  return <Table rows={shifts} rowKey={(x) => x.id} onRow={(x) => navigate("Staffing", "allocation", { kind: "shift", id: x.id })}
    cols={[{ key: "l", label: "Shift", render: (x) => <span className="strong">{x.label}</span> }, { key: "t", label: "Time", nowrap: true, render: (x) => span(x.start, x.end) },
      { key: "r", label: "Required", num: true, render: (x) => x.required }, { key: "c", label: "Confirmed", num: true, render: (x) => Q.shiftCoverage(s, x.id).confirmed },
      { key: "a", label: "Awaiting", num: true, render: (x) => Q.shiftCoverage(s, x.id).awaiting }, { key: "u", label: "Unfilled", num: true, render: (x) => Q.shiftCoverage(s, x.id).unfilled },
      { key: "d", label: "Evidence", render: (x) => x.requiredDocs.map(docLabel).join(", ") || "None" }]} />;
}

export function ShiftTimeEditor({ s, shifts }: { s: OssState; shifts: ReturnType<typeof Q.shiftsOfEvent> }) {
  const [sid, setSid] = useState(shifts[0]?.id || "");
  const sh = shifts.find((x) => x.id === sid);
  const [a, setA] = useState(sh ? fmtTime(sh.start) : "08:00");
  const [b, setB] = useState(sh ? fmtTime(sh.end) : "13:00");
  if (!sh) return null;
  const imp = E.shiftChangeImpact(s, sid);
  const changed = a !== fmtTime(sh.start) || b !== fmtTime(sh.end);
  const pending = s.assignments.filter((x) => x.shiftId === sid && x.status === "confirmed" && x.shiftVersion < sh.version);
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select className="oss-input" style={{ width: 200 }} value={sid} onChange={(e) => { const n = shifts.find((x) => x.id === e.target.value)!; setSid(n.id); setA(fmtTime(n.start)); setB(fmtTime(n.end)); }} aria-label="Shift">{shifts.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
        <TimeSelect value={a} onChange={setA} label="New start" style={{ width: 110 }} /><span className="oss-dim">to</span><TimeSelect value={b} onChange={setB} label="New end" style={{ width: 110 }} />
      </div>
      {changed && <div className="oss-note warn" style={{ marginTop: 10 }}>Impact: {imp.accepted.length} accepted worker{imp.accepted.length === 1 ? "" : "s"} must reconfirm ({imp.accepted.slice(0, 6).map((x) => Q.nameOf(s, x.workerId)).join(", ")}{imp.accepted.length > 6 ? "…" : ""}) and {imp.invites.length} open invitation{imp.invites.length === 1 ? "" : "s"} will show the new times. Nobody is removed automatically.
        <div style={{ marginTop: 8 }}><Btn size="sm" kind="primary" onClick={() => run(E.changeShiftTimes, sid, a, b)}>Save and ask to reconfirm</Btn></div></div>}
      {pending.length > 0 && <div className="oss-small" style={{ marginTop: 8 }}>{pending.length} still to reconfirm version {sh.version}: {pending.map((x) => Q.nameOf(s, x.workerId)).join(", ")}</div>}
    </div>
  );
}

export function AuditList({ s, items }: { s: OssState; items: OssState["audit"] }) {
  if (!items.length) return <Empty title="No history yet" />;
  return <div className="oss-timeline">{items.map((a) => (
    <div key={a.id} className={a.result === "rejected" ? "bad" : a.result === "simulated" ? "info" : "ok"}>
      <div className="oss-small oss-ink">{a.summary}</div>
      <div className="oss-tiny oss-muted" style={{ marginTop: 2 }}>{when(a.at)} · {a.actor}{a.result === "rejected" ? " · rejected" : a.result === "simulated" ? " · simulated" : ""}{a.before ? " · " + a.before + " → " + a.after : ""}</div>
    </div>))}</div>;
}

function TimesheetDrawer({ s, asgId }: { s: OssState; asgId: string }) {
  const a = Q.asgOf(s, asgId);
  const l = a && Q.lineFor(s, a);
  if (!a) return null;
  const clocks = Q.clocksOf(s, asgId);
  const corr = s.corrections.filter((c) => c.assignmentId === asgId);
  const ex = s.exceptions.filter((x) => x.assignmentId === asgId);
  const items = s.items.filter((i) => i.assignmentId === asgId);
  const sh = Q.shiftOf(s, a.shiftId);
  const journeys = s.journeys.filter((j) => j.assignmentId === asgId);
  return (
    <Drawer eyebrow={"Timesheet" + (l ? " · version " + l.version : "")} title={Q.nameOf(s, a.workerId) + ", " + sh.label.toLowerCase()} wide
      footer={<>{l?.status === "ready" && <Btn kind="primary" icon={I.check} onClick={() => run(E.approveLines, [asgId])}>Approve line</Btn>}
        {(l?.status === "approved" || l?.status === "exported") && <Btn onClick={() => { const r = window.prompt("Reason for reopening (creates a new version):"); if (r) run(E.reopenLine, asgId, r); }}>Reopen as new version</Btn>}
        <Btn onClick={() => navigate("Timesheets", "corrections", { kind: "assignment", id: asgId })}>Corrections</Btn>
        <span className="oss-small oss-muted" style={{ marginLeft: "auto" }}>{Q.eventOf(s, sh.eventId).name}</span></>}>
      {!l ? <Empty title="No timesheet line" body={a.status === "cancelled" ? "Cancelled before the shift. No hours are generated." : "The shift has not started."} /> : <>
        <div className="oss-row" style={{ marginBottom: 12 }}><LineStatus st={l.status} />{l.correctionNote && <St tone="info">Corrected</St>}{!l.mapped && <S s="Mapping pending" />}</div>
        <KV items={[["Rostered", span(sh.start, sh.end) + " (" + fmtHM(l.scheduledMin) + ")"], ["Clocked", hm(l.rawIn) + " to " + (l.rawOut ? fmtTime(l.rawOut) : "missing")],
          ["Approved times", l.complete ? fmtTime(l.approvedStart!) + " to " + fmtTime(l.approvedEnd!) + (fmtDate(l.approvedEnd!) !== fmtDate(l.approvedStart!) ? " (" + fmtDate(l.approvedEnd!) + ")" : "") : "Incomplete"],
          ["Unpaid break", fmtHM(l.breakMin)], ["Worked", l.complete ? fmtHM(l.workedMin) : "-"], ["5h minimum top-up", fmtHM(l.topupMin)], ["Payable", l.complete ? fmtHM(l.payableMin) : "-"],
          ["Overtime", l.extraMin ? fmtHM(l.extraMin) : "None"]]} />
        <div className="oss-note" style={{ marginTop: 12 }}>Worked time is exact clock minutes. The five-hour minimum tops up payable time only. Time past the rostered finish is flagged as overtime.</div>
      </>}
      <Section title="Clock records (originals always kept)">
        <Table rows={clocks} rowKey={(c) => c.id} empty={<Empty title="No clock records" />}
          cols={[{ key: "k", label: "Event", render: (c) => (c.kind === "in" ? "Clock-in" : "Clock-out") }, { key: "t", label: "Time", nowrap: true, render: (c) => when(c.at) },
            { key: "m", label: "Method", render: (c) => c.method.toUpperCase() }, { key: "d", label: "Distance / accuracy", num: true, render: (c) => (c.distanceM !== undefined ? c.distanceM + " m / " + (c.accuracyM ?? "?") + " m" : "-") },
            { key: "r", label: "Result", render: (c) => <St tone={c.result === "verified" ? "ok" : c.result === "rejected" ? "bad" : "warn"}>{c.result === "awaiting_sync" ? "Awaiting sync" : c.result[0].toUpperCase() + c.result.slice(1)}</St> },
            { key: "w", label: "Reason", render: (c) => <span className="oss-small oss-dim">{c.reason}</span> }]} />
      </Section>
      {journeys.length > 0 && <Section title="Arrival updates"><div className="oss-list">{journeys.map((j) => <div key={j.id} className="oss-small">{fmtTime(j.at)} · {j.status.replace("_", " ")}{j.eta ? ", ETA " + fmtTime(j.eta) : ""}{j.message ? ": " + j.message : ""}</div>)}</div></Section>}
      {corr.length > 0 && <Section title="Corrections">{corr.map((c) => (
        <div key={c.id} className="oss-note" style={{ marginBottom: 8 }}>
          <div className="oss-row"><b className="oss-ink">Clock-{c.field}: {c.original ? fmtTime(c.original) : "missing"} → {fmtTime(c.proposed)}</b><S s={c.status === "proposed" ? "Needs review" : c.status === "approved" ? "Approved" : "Rejected"} /></div>
          <div style={{ marginTop: 4 }}>{c.reason}{c.note ? ". " + c.note : ""}</div>
          <div className="oss-tiny oss-muted" style={{ marginTop: 4 }}>Requested by {Q.nameOf(s, c.requestedBy)} {when(c.requestedAt)}{c.decidedBy ? " · " + c.status + " by " + Q.nameOf(s, c.decidedBy) + " " + when(c.decidedAt) : ""}</div>
        </div>))}</Section>}
      {ex.length > 0 && <Section title="Attendance exceptions">{ex.map((x) => <div key={x.id} className="oss-row oss-small" style={{ padding: "6px 0" }}><S s={x.status === "open" ? "Open" : "Resolved"} /><span className="grow">{x.reason}</span><span className="oss-muted oss-tiny">{x.resolution || x.nextAction}</span></div>)}</Section>}
      {items.length > 0 && <Section title="Bullhorn handover">{items.map((i) => (
        <div key={i.id} className="oss-row oss-small" style={{ padding: "6px 0" }}><RecLink kind="batch" id={i.batchId}>{i.batchId}</RecLink><span className="oss-muted">v{i.version}</span>
          <St tone={i.state === "accepted" ? "ok" : i.state === "blocked" ? "bad" : "info"}>{i.state === "accepted" ? "Accepted by Bullhorn" : i.state}</St><span className="grow oss-muted oss-tiny">{i.receipt || i.error}</span></div>))}</Section>}
    </Drawer>
  );
}

export function payloadOf(s: OssState, it: OssState["items"][0]) {
  const sn = it.snapshot;
  return JSON.stringify({ _note: "Fields sent per approved line. Final mapping agreed with OSS against its Bullhorn setup.",
    local_timesheet_id: sn.timesheetId, version: sn.version, worker_id: sn.workerId, mapped_candidate_id: sn.candidateId, client_id: sn.clientId, mapped_client_id: sn.clientRemoteId,
    event_id: sn.eventId, shift_id: sn.shiftId, job_or_placement_ref: null, work_date: sn.workDate, scheduled_start: sn.scheduledStart, scheduled_end: sn.scheduledEnd,
    approved_start: sn.approvedStart, approved_end: sn.approvedEnd, worked_minutes: sn.workedMin, unpaid_break_minutes: sn.breakMin, minimum_topup_minutes: sn.topupMin,
    payable_minutes: sn.payableMin, extra_hours_minutes: sn.extraMin, approved_by: Q.nameOf(s, sn.approvedBy), approved_at: sn.approvedAt, correction: sn.correction, transfer_key: sn.transferKey }, null, 2);
}

function BatchDrawer({ s, id }: { s: OssState; id: string }) {
  const b = s.batches.find((x) => x.id === id);
  const sum = Q.batchSummary(s, id);
  const [sel, setSel] = useState<string | null>(null);
  if (!b) return null;
  const it = sum.items.find((i) => i.id === sel) || sum.items[0];
  const blocked = sum.items.filter((i) => i.state === "blocked");
  return (
    <Drawer eyebrow={"Bullhorn send · " + b.id} title={b.label} wide
      footer={<>{sum.queued > 0 && <Btn kind="primary" icon={I.send} onClick={() => run(E.sendBatch, id)}>Send to Bullhorn</Btn>}
        {blocked.length > 0 && <Btn kind="primary" icon={I.refresh} onClick={() => run(E.retryItems, blocked.map((i) => i.id))}>Retry {blocked.length} blocked</Btn>}
        <Btn icon={I.refresh} onClick={() => run(E.retryItems, sum.items.filter((i) => i.state === "accepted").map((i) => i.id))}>Resend accepted rows</Btn><span className="oss-tiny oss-muted">Resending never creates duplicates</span></>}>
      <KV items={[["Rows", sum.items.length], ["Accepted by Bullhorn", sum.accepted + " · " + fmtHM(sum.acceptedMin)], ["Blocked", sum.blocked + (sum.blocked ? " · " + fmtHM(sum.blockedMin) : "")],
        ["Total payable", fmtHM(sum.totalMin) + " (" + sum.totalMin.toLocaleString("en-IE") + " min)"], ["Created", when(b.createdAt) + " by " + Q.nameOf(s, b.createdBy)]]} />
      <Section title="Rows">
        <Table rows={sum.items} rowKey={(i) => i.id} selected={it?.id} onRow={(i) => setSel(i.id)} maxHeight={320}
          cols={[{ key: "w", label: "Worker", render: (i) => Q.nameOf(s, i.snapshot.workerId) }, { key: "d", label: "Date", nowrap: true, render: (i) => fmtDate(i.snapshot.workDate + "T12:00:00Z") },
            { key: "p", label: "Payable", num: true, render: (i) => fmtHM(i.snapshot.payableMin) },
            { key: "s", label: "State", render: (i) => <St tone={i.state === "accepted" ? "ok" : i.state === "blocked" ? "bad" : "info"}>{i.state === "accepted" ? "Accepted" : i.state[0].toUpperCase() + i.state.slice(1)}</St> },
            { key: "r", label: "Bullhorn receipt", render: (i) => <span className="oss-small oss-dim">{i.receipt || i.error || "-"}</span> },
            { key: "a", label: "", render: (i) => i.state === "blocked" ? <Btn size="sm" onClick={(e: any) => { e.stopPropagation(); openDrawer("mapping", i.snapshot.workerId); }}>Match</Btn> : null }]} />
      </Section>
      {it && <Section title={"What was sent for " + Q.nameOf(s, it.snapshot.workerId)}>
        <div className="oss-small oss-dim" style={{ marginBottom: 8 }}>{Q.nameOf(s, it.snapshot.workerId)} worked {fmtHM(it.snapshot.workedMin)} on {it.snapshot.workDate}; {fmtHM(it.snapshot.payableMin)} payable{it.snapshot.topupMin ? " including a " + fmtHM(it.snapshot.topupMin) + " minimum top-up" : ""}. No documents or location history leave OSS Pulse.</div>
        <pre className="oss-code">{payloadOf(s, it)}</pre>
        <Section title="Attempts">{it.attempts.map((x, k) => <div key={k} className="oss-small oss-dim">{when(x.at)} · {x.result}</div>)}</Section>
      </Section>}
    </Drawer>
  );
}

function MappingDrawer({ s, workerId }: { s: OssState; workerId: string }) {
  const w = Q.worker(s, workerId);
  const m = s.mappings.find((x) => x.localId === workerId);
  const suggestion = "BH-CAND-" + (40210 + Number(workerId.slice(1)) * 7);
  const blocked = s.items.filter((i) => i.snapshot.workerId === workerId && i.state === "blocked");
  return (
    <Drawer eyebrow="Bullhorn match" title={"Map " + w.name}
      footer={m?.status === "mapped"
        ? <>{blocked.length > 0 && <Btn kind="primary" icon={I.refresh} onClick={() => run(E.retryItems, blocked.map((i) => i.id))}>Retry {blocked.length} blocked row</Btn>}<Btn onClick={closeDrawer}>Close</Btn></>
        : <><Btn kind="primary" icon={I.check} onClick={() => run(E.resolveMapping, workerId, suggestion)}>Confirm match</Btn><Btn onClick={closeDrawer}>Not this person</Btn></>}>
      <KV items={[["Local worker", w.id + " · " + w.name], ["Email", w.email], ["Mobile", w.mobile], ["Current mapping", m?.remoteId || "None"]]} />
      <Section title="Suggested Bullhorn candidate">
        <div className="oss-card" style={{ padding: 14 }}>
          <div className="oss-row"><Av name={w.name} /><div className="grow"><div className="oss-ink" style={{ fontWeight: 500 }}>{w.name}</div><div className="oss-small oss-muted">{suggestion} · Bullhorn candidate</div></div><St tone="ok">2 of 2 match</St></div>
          <div style={{ marginTop: 10 }}><Reason level="ok">Email matches the local record</Reason><Reason level="ok">Mobile matches the local record</Reason><Reason level="unknown">Name alone is never enough to merge</Reason></div>
        </div>
      </Section>
      <div className="oss-note" style={{ marginTop: 14 }}>A person confirms the match. Bullhorn stays the master for candidate identifiers; nothing in Bullhorn is overwritten. After confirming, retry only the blocked row; accepted rows keep their receipts.</div>
      {m?.status === "mapped" && <div className="oss-note ok" style={{ marginTop: 10 }}>Mapped to {m.remoteId}{m.confirmedBy ? " by " + Q.nameOf(s, m.confirmedBy) : ""}.</div>}
    </Drawer>
  );
}

function ClientDrawer({ s, id }: { s: OssState; id: string }) {
  const c = Q.clientOf(s, id);
  const evs = s.events.filter((e) => e.clientId === id);
  const cts = s.contacts.filter((x) => x.clientId === id);
  const venues = Array.from(new Set(evs.map((e) => e.venueId).filter(Boolean))) as string[];
  const map = s.mappings.find((m) => m.localId === id);
  return (
    <Drawer eyebrow="Client" title={c.name}>
      <KV items={[["Sector", c.sector], ["Bullhorn ClientCorporation", map?.remoteId || "Mapping pending"], ["Bookings", evs.length], ["Venues used", venues.map((v) => Q.venueOf(s, v)!.name).join(", ") || "None"]]} />
      <div className="oss-note" style={{ marginTop: 12 }}>{c.provenance}</div>
      <Section title="Contacts">{cts.map((x) => <div key={x.id} className="oss-row oss-small" style={{ padding: "6px 0" }}><Av name={x.name} /><span className="grow"><span className="oss-ink">{x.name}</span><br /><span className="oss-muted">{x.role}</span></span><span className="oss-muted">{x.email}</span></div>)}</Section>
      <Section title="Bookings"><Table rows={evs} rowKey={(e) => e.id} onRow={(e) => openDrawer("event", e.id)} cols={[{ key: "n", label: "Booking", render: (e) => e.name }, { key: "d", label: "Date", nowrap: true, render: (e) => fmtDate(zoned(e.date, "12:00")) }, { key: "s", label: "Status", render: (e) => <S s={e.status === "pending" ? "Pending" : e.historical ? "Completed" : "Firm"} /> }]} /></Section>
      <div className="oss-small oss-muted" style={{ marginTop: 12 }}>Client and contact records stay owned by Bullhorn.</div>
    </Drawer>
  );
}

function VenueDrawer({ s, id }: { s: OssState; id: string }) {
  const v = Q.venueOf(s, id)!;
  const [text, setText] = useState(v.meetingPoint);
  const evs = s.events.filter((e) => e.venueId === id);
  return (
    <Drawer eyebrow="Venue" title={v.name}
      footer={!v.meetingConfirmed ? <Btn kind="primary" icon={I.check} onClick={() => run(E.confirmMeetingPoint, id, text)}>Confirm meeting point</Btn> : undefined}>
      <KV items={[["Area", v.area], ["Site supervisor", Q.nameOf(s, v.supervisorId)], ["Check-in methods", v.methods.map((m) => m.toUpperCase()).join(", ")], ["Check-in radius", v.geofenceM + " m"]]} />
      <Section title="Meeting point">
        {v.meetingConfirmed ? <div className="oss-note ok">{v.meetingPoint}</div> : <>
          <textarea className="oss-input" rows={3} value={text} onChange={(e) => setText(e.target.value)} aria-label="Meeting point" />
          <div className="oss-small oss-muted" style={{ marginTop: 6 }}>Shown to staff on every invitation once confirmed.</div></>}
      </Section>
      <Section title="Linked bookings"><div className="oss-list">{evs.map((e) => <div key={e.id} className="oss-row"><RecLink kind="event" id={e.id}>{e.name}</RecLink><span className="oss-muted oss-small">{fmtDate(zoned(e.date, "12:00"))}</span></div>)}</div></Section>
          </Drawer>
  );
}

export { Icon };
