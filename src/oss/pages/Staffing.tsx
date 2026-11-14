import { useMemo, useState } from "react";
import type { OssState } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { docLabel } from "../seed";
import { openDrawer, run, setUi, useOss } from "../store";
import { tabOf } from "../modules";
import { fmtDate, fmtTime, minutesBetween, ms } from "../time";
import { Av, Btn, Card, Cov, Empty, I, Icon, Metric, Page, Reason, S, Scope, Seg, St, Table } from "../ui/kit";
import { RecLink, WorkerLink, span, when } from "../ui/fmt";

export default function Staffing() {
  const s = useOss();
  const tab = tabOf(s, "Staffing");
  if (tab === "invitations") return <Invitations s={s} />;
  if (tab === "replacements") return <Replacements s={s} />;
  if (tab === "standby") return <Standby s={s} />;
  if (tab === "coverage") return <CoverageView s={s} />;
  return <Allocation s={s} />;
}

/* ── allocation: requirements | eligible staff | selection preview ──────── */
function pickShift(s: OssState): string {
  const f = s.ui.focus;
  if (f?.kind === "shift" && Q.shiftOf(s, f.id)) return f.id;
  const evId = f?.kind === "event" ? f.id : "EVT-001";
  const shifts = Q.shiftsOfEvent(s, evId);
  return (shifts.find((x) => Q.shiftCoverage(s, x.id).notInvited > 0) || shifts.find((x) => Q.shiftCoverage(s, x.id).unfilled > 0) || shifts[0])?.id || "SH-001A";
}

function Allocation({ s }: { s: OssState }) {
  const shiftId = pickShift(s);
  const sh = Q.shiftOf(s, shiftId);
  const ev = Q.eventOf(s, sh.eventId);
  const cov = Q.shiftCoverage(s, shiftId);
  const [filter, setFilter] = useState<"eligible" | "unknown" | "blocked">("eligible");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const cands = useMemo(() => Q.candidates(s, shiftId), [s, shiftId]);
  const list = cands[filter].filter((c) => !q || (c.worker.name + " " + c.worker.locality + " " + c.worker.roles.join(" ")).toLowerCase().includes(q.toLowerCase()));
  const sel = picked.filter((id) => cands.eligible.some((c) => c.worker.id === id));
  const events = Q.windowEvents(s);
  const choose = (id: string) => { setPicked([]); setUi({ focus: { kind: "shift", id } }); };
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.concat([id])));
  const confirmed = s.assignments.filter((a) => a.shiftId === shiftId && a.status === "confirmed");
  const awaiting = s.invitations.filter((i) => i.shiftId === shiftId && Q.isActiveInvite(s, i));
  const cancelled = s.assignments.filter((a) => a.shiftId === shiftId && a.status === "cancelled");
  const over = sel.length > cov.notInvited;

  return (
    <Page title="Allocation" sub={<>Pick a shift, see who is eligible and why, then invite people individually. Each invitation is its own decision for that worker.</>}
      scope={<Scope><b>{Q.windowLabel(s)}</b> · confirmed bookings</Scope>}>
      <div className="oss-grid oss-three" style={{ alignItems: "start" }}>
        <Card title="Shift requirements" pad={false}>
          <div className="oss-list" style={{ padding: "4px 0" }}>
            {events.map((e) => (
              <div key={e.id} style={{ padding: "10px 14px" }}>
                <div className="oss-row"><RecLink kind="event" id={e.id}><span className="oss-small" style={{ fontWeight: 600 }}>{e.name}</span></RecLink></div>
                <div className="oss-tiny oss-muted" style={{ margin: "2px 0 6px" }}>{fmtDate(Q.shiftsOfEvent(s, e.id)[0].start)} · {Q.clientOf(s, e.clientId).name}</div>
                {Q.shiftsOfEvent(s, e.id).map((x) => {
                  const c = Q.shiftCoverage(s, x.id);
                  return (
                    <button key={x.id} onClick={() => choose(x.id)} className="oss-stage" style={{ marginTop: 6, padding: "8px 10px", ...(x.id === shiftId ? { borderColor: "var(--accent-line)", background: "var(--accent-faint)" } : {}) }} aria-pressed={x.id === shiftId}>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="oss-row"><span className="grow oss-small oss-ink">{x.label}</span><span className="oss-tiny oss-muted">{fmtTime(x.start)}–{fmtTime(x.end)}</span></span>
                        <span style={{ display: "block", marginTop: 5 }}><Cov c={c} compact /></span>
                        {c.notInvited > 0 && <span className="oss-tiny" style={{ color: "var(--warn)" }}>{c.notInvited} not yet invited</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </Card>

        <Card title={"Eligible staff for " + sh.label.toLowerCase()} meta={ev.name + " · " + span(sh.start, sh.end)} pad={false}
          right={<Seg value={filter} onChange={setFilter} label="Candidate filter" options={[{ id: "eligible", label: "Available & eligible", n: cands.eligible.length }, { id: "unknown", label: "Availability unknown", n: cands.unknown.length }, { id: "blocked", label: "Blocked", n: cands.blocked.length }]} />}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: "1 1 200px" }}>
              <Icon d={I.search} size={14} style={{ position: "absolute", left: 11, top: 12, color: "var(--faint)" }} />
              <input className="oss-input" style={{ paddingLeft: 32 }} placeholder="Name, role or locality" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search candidates" />
            </div>
            <span className="oss-small oss-muted">Rules: role, explicit availability, {sh.requiredDocs.map(docLabel).join(", ") || "no evidence"} valid through shift end, no overlap, {s.rules.travelBufferMin}-min travel buffer between venues.</span>
          </div>
          <Table rows={list} rowKey={(c) => c.worker.id} maxHeight={560}
            empty={<Empty title={filter === "eligible" ? "No eligible workers left" : "Nobody in this group"} body={filter === "eligible" ? "Try the availability-unknown list and request availability." : undefined} />}
            cols={[
              { key: "x", label: "", width: "34px", render: (c) => filter === "eligible" ? <input type="checkbox" aria-label={"Select " + c.worker.name} checked={picked.includes(c.worker.id)} onChange={() => toggle(c.worker.id)} style={{ width: 17, height: 17, accentColor: "var(--accent)" }} /> : null },
              { key: "w", label: "Worker", render: (c) => <div><WorkerLink s={s} id={c.worker.id} /><div className="oss-tiny oss-muted">{c.worker.roles[0]} · {c.worker.locality}{c.standby ? " · standby #" + c.standby : ""}</div></div> },
              { key: "why", label: "Why", render: (c) => <div style={{ display: "grid", gap: 2 }}>{c.elig.reasons.filter((r) => r.code !== "role").map((r, i) => <Reason key={i} level={r.level}>{r.label}</Reason>)}</div> },
              { key: "h", label: "History", render: (c) => <span className="oss-small oss-dim">{c.venueHistory ? "Worked here before" : c.worker.priorShifts + " prior shifts"}{c.upcoming ? " · " + c.upcoming + " upcoming" : ""}</span> },
              { key: "a", label: "", render: (c) => filter === "eligible"
                ? <span style={{ display: "flex", gap: 6 }}><Btn size="sm" onClick={() => run(E.sendInvitations, shiftId, [c.worker.id])} disabled={cov.notInvited < 1}>Invite</Btn><Btn size="sm" kind="ghost" onClick={() => run(E.addStandby, shiftId, c.worker.id)}>Standby</Btn></span>
                : filter === "unknown" ? <Btn size="sm" onClick={() => run(E.requestAvailability, shiftId, [c.worker.id])}>Request availability</Btn> : null }
            ]} />
          {filter === "unknown" && cands.unknown.length > 0 && <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}><Btn size="sm" icon={I.send} onClick={() => run(E.requestAvailability, shiftId, cands.unknown.map((c) => c.worker.id))}>Request availability from all {cands.unknown.length}</Btn> <span className="oss-small oss-muted">Not an invitation. They stay out of allocated counts.</span></div>}
        </Card>

        <div style={{ display: "grid", gap: 14 }}>
          <Card title="Selection" meta={sh.label}>
            <div className="oss-grid oss-g2" style={{ gap: 8 }}>
              <Metric label="Required" value={cov.required} /><Metric label="Confirmed" value={cov.confirmed} tone={cov.confirmed === cov.required ? "ok" : undefined} />
              <Metric label="Awaiting reply" value={cov.awaiting} /><Metric label="Not yet invited" value={cov.notInvited} tone={cov.notInvited ? "warn" : undefined} />
            </div>
            <div style={{ marginTop: 14 }}>
              {sel.length ? sel.map((id) => <div key={id} className="oss-row oss-small" style={{ padding: "5px 0" }}><Av name={Q.nameOf(s, id)} /><span className="grow">{Q.nameOf(s, id)}</span><button className="oss-link" onClick={() => toggle(id)}>Remove</button></div>)
                : <div className="oss-small oss-muted">Tick eligible workers to invite them together. Each still gets an individual invitation.</div>}
            </div>
            {sel.length > 0 && <div className="oss-note" style={{ marginTop: 10 }}>Preview: "{E.inviteBody(s, sh)}" Offer expires after {s.rules.inviteExpiryH}h or two hours before start. In-app delivery is simulated.</div>}
            {over && <div className="oss-note warn" style={{ marginTop: 8 }}>Only {cov.notInvited} uninvited position{cov.notInvited === 1 ? "" : "s"} left. Extra people go to standby instead, so the shift can never be overbooked.</div>}
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <Btn kind="primary" icon={I.send} disabled={!sel.length || cov.notInvited < 1} onClick={() => { run(E.sendInvitations, shiftId, sel); setPicked([]); }}>Invite selected ({Math.min(sel.length, cov.notInvited)})</Btn>
              {sel.length > 0 && <Btn onClick={() => { sel.forEach((id) => run(E.addStandby, shiftId, id)); setPicked([]); }}>Add to standby</Btn>}
            </div>
          </Card>
          <Card title="Current roster" meta={confirmed.length + " confirmed · " + awaiting.length + " awaiting"} pad={false}>
            <div style={{ maxHeight: 300, overflowY: "auto" }}>
              <div className="oss-list" style={{ padding: "4px 14px" }}>
                {awaiting.map((i) => <div key={i.id} className="oss-row oss-small"><span className="grow"><WorkerLink s={s} id={i.workerId} />{i.flags.includes("availability-not-confirmed") && <div className="oss-tiny" style={{ color: "var(--warn)" }}>Coordinator exception: availability not confirmed</div>}{i.flags.includes("worker-unavailable") && <div className="oss-tiny" style={{ color: "var(--bad)" }}>Worker now marked unavailable</div>}</span><S s="Awaiting reply" /><Btn size="sm" kind="ghost" onClick={() => run(E.remind, i.id)}>Remind</Btn></div>)}
                {confirmed.map((a) => <div key={a.id} className="oss-row oss-small"><span className="grow"><WorkerLink s={s} id={a.workerId} />{a.replacementFor && <span className="oss-tiny oss-muted"> · replacement</span>}</span><S s="Confirmed" /></div>)}
                {cancelled.map((a) => <div key={a.id} className="oss-row oss-small" style={{ opacity: .75 }}><span className="grow"><WorkerLink s={s} id={a.workerId} /></span><St tone="bad">Cancelled {fmtTime(a.cancelledAt!)}</St></div>)}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

/* ── invitations ─────────────────────────────────────────────────────────── */
function Invitations({ s }: { s: OssState }) {
  const [f, setF] = useState<"all" | "Awaiting reply" | "Accepted" | "Declined" | "Expired" | "Withdrawn">("Awaiting reply");
  const [ev, setEv] = useState("all");
  const all = s.invitations.filter((i) => !Q.eventOf(s, Q.shiftOf(s, i.shiftId).eventId).historical).filter((i) => ev === "all" || Q.shiftOf(s, i.shiftId).eventId === ev);
  const rows = all.filter((i) => f === "all" || Q.inviteLabel(s, i) === f).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const n = (k: string) => all.filter((i) => Q.inviteLabel(s, i) === k).length;
  return (
    <Page title="Invitations" sub="One row per worker per shift. Accepting or declining one shift never changes another." scope={<Scope><b>All firm bookings</b></Scope>}>
      <Card pad={false} title={<Seg value={f} onChange={setF} label="Reply filter" options={[{ id: "Awaiting reply", label: "Awaiting reply", n: n("Awaiting reply") }, { id: "Accepted", label: "Accepted", n: n("Accepted") }, { id: "Declined", label: "Declined", n: n("Declined") }, { id: "Expired", label: "Expired", n: n("Expired") }, { id: "Withdrawn", label: "Withdrawn", n: n("Withdrawn") }, { id: "all", label: "All", n: all.length }]} />}
        right={<select className="oss-input" style={{ width: 230, height: 32 }} value={ev} onChange={(e) => setEv(e.target.value)} aria-label="Booking"><option value="all">All bookings</option>{s.events.filter((e) => !e.historical && e.status !== "cancelled").map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>}>
        <Table rows={rows} rowKey={(i) => i.id} onRow={(i) => openDrawer("worker", i.workerId)}
          cols={[
            { key: "w", label: "Worker", render: (i) => <span className="strong">{Q.nameOf(s, i.workerId)}</span> },
            { key: "s", label: "Shift", render: (i) => <span>{Q.eventOf(s, Q.shiftOf(s, i.shiftId).eventId).name}<div className="oss-tiny oss-muted">{Q.shiftOf(s, i.shiftId).label} · {span(Q.shiftOf(s, i.shiftId).start, Q.shiftOf(s, i.shiftId).end)}</div></span> },
            { key: "k", label: "Type", render: (i) => <span className="oss-small">{i.kind === "replacement" ? "Replacement" : "Standard"} · v{i.version}</span> },
            { key: "t", label: "Sent", nowrap: true, render: (i) => when(i.sentAt) },
            { key: "r", label: "Response time", num: true, render: (i) => i.respondedAt ? Math.round(minutesBetween(i.sentAt, i.respondedAt)) + " min" : Q.isActiveInvite(s, i) ? "open " + Math.round(minutesBetween(i.sentAt, s.clock) / 60) + "h" : "—" },
            { key: "fl", label: "Flags", render: (i) => <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{i.flags.includes("availability-not-confirmed") && <St tone="warn">Availability not confirmed</St>}{i.flags.includes("worker-unavailable") && <St tone="bad">Now unavailable</St>}{i.reminders.length > 0 && <St tone="neutral">{i.reminders.length} reminder</St>}</span> },
            { key: "st", label: "Status", render: (i) => <S s={Q.inviteLabel(s, i)} /> },
            { key: "a", label: "", render: (i) => Q.isActiveInvite(s, i) ? <span style={{ display: "flex", gap: 6 }} onClick={(e) => e.stopPropagation()}><Btn size="sm" onClick={() => run(E.remind, i.id)}>Remind</Btn><Btn size="sm" kind="ghost" onClick={() => run(E.withdrawInvitation, i.id)}>Withdraw</Btn></span> : null }
          ]} />
      </Card>
    </Page>
  );
}

/* ── replacements ────────────────────────────────────────────────────────── */
function Replacements({ s }: { s: OssState }) {
  const rq = Q.replacementQueue(s);
  const open = rq.filter((r) => r.open), done = rq.filter((r) => !r.open);
  const gaps = Q.windowEvents(s).flatMap((e) => Q.shiftsOfEvent(s, e.id)).filter((x) => Q.shiftCoverage(s, x.id).unfilled > 0 && ms(x.start) > ms(s.clock));
  return (
    <Page title="Replacements" sub="Cancellations and open positions, with eligible standby workers in order. A replacement invitation does not close the gap; only an acceptance does.">
      {open.length === 0 && <div className="oss-note" style={{ marginBottom: 14 }}>No open cancellations. {done.length ? "Resolved cancellations stay in history below." : "When a worker cancels, the replacement task appears here."}</div>}
      {open.map((r) => {
        const sb = s.standby.filter((b) => b.shiftId === r.shift.id).sort((a, b) => a.order - b.order);
        const mins = minutesBetween(s.clock, r.shift.start);
        return (
          <Card key={r.asg.id} title={r.worker.name + " cancelled " + r.shift.label.toLowerCase()} meta={r.event.name}
            right={<><St tone={mins < 180 ? "bad" : "warn"}>Starts in {mins < 60 ? mins + " min" : Math.floor(mins / 60) + "h " + (mins % 60) + "m"}</St><span className="oss-small oss-dim">Owner {Q.nameOf(s, r.event.ownerId)}</span></>}>
            <div className="oss-row oss-small" style={{ marginBottom: 12 }}><span className="grow">Reason: "{r.asg.cancelReason}" · cancelled {when(r.asg.cancelledAt)} · coverage <b className="oss-ink">{Q.shiftCoverage(s, r.shift.id).confirmed}/{r.shift.required}</b></span></div>
            {r.pendingInv.length > 0 && <div className="oss-note" style={{ marginBottom: 10 }}>Replacement invitation out to {r.pendingInv.map((i) => Q.nameOf(s, i.workerId)).join(", ")} (expires {fmtTime(r.pendingInv[0].expiresAt)}). Coverage stays at {Q.shiftCoverage(s, r.shift.id).confirmed}/{r.shift.required} until someone accepts.</div>}
            <Table rows={sb} rowKey={(b) => b.id} empty={<Empty title="No standby list for this shift" />}
              cols={[{ key: "o", label: "#", width: "40px", render: (b) => b.order },
                { key: "w", label: "Standby worker", render: (b) => <WorkerLink s={s} id={b.workerId} /> },
                { key: "e", label: "Eligibility now", render: (b) => { const e = Q.eligibility(s, b.workerId, r.shift.id); return <div>{e.reasons.filter((x) => x.code !== "role").map((x, i) => <Reason key={i} level={x.level}>{x.label}</Reason>)}</div>; } },
                { key: "c", label: "Contact", render: (b) => <span className="oss-small oss-dim">{b.willing ? "Willing · " : ""}{b.contact}</span> },
                { key: "a", label: "", render: (b) => { const e = Q.eligibility(s, b.workerId, r.shift.id); const invited = r.pendingInv.some((i) => i.workerId === b.workerId);
                  return invited ? <S s="Awaiting reply" /> : <Btn size="sm" kind="primary" disabled={e.status === "blocked" || e.status === "unknown" || r.pendingInv.length > 0} onClick={() => run(E.sendInvitations, r.shift.id, [b.workerId], { kind: "replacement", replaces: r.asg.id })}>Send replacement invitation</Btn>; } }]} />
          </Card>
        );
      })}
      <Card title="Open positions" meta="Upcoming shifts with unfilled positions" pad={false} style={{ marginTop: 14 }}>
        <Table rows={gaps} rowKey={(x) => x.id} onRow={(x) => setUi({ tabs: { ...s.ui.tabs, Staffing: "allocation" }, focus: { kind: "shift", id: x.id } })} empty={<Empty title="No open positions in the window" />}
          cols={[{ key: "e", label: "Booking", render: (x) => Q.eventOf(s, x.eventId).name }, { key: "s", label: "Shift", render: (x) => x.label }, { key: "t", label: "When", nowrap: true, render: (x) => span(x.start, x.end) },
            { key: "c", label: "Coverage", render: (x) => <Cov c={Q.shiftCoverage(s, x.id)} /> }, { key: "n", label: "Not yet invited", num: true, render: (x) => Q.shiftCoverage(s, x.id).notInvited }]} />
      </Card>
      {done.length > 0 && <Card title="Resolved" pad={false}>
        <Table rows={done} rowKey={(r) => r.asg.id} cols={[{ key: "w", label: "Cancelled", render: (r) => r.worker.name + ", " + r.shift.label.toLowerCase() },
          { key: "r", label: "Replacement", render: (r) => r.replacement ? <span><WorkerLink s={s} id={r.replacement.workerId} /> accepted {fmtTime(r.replacement.acceptedAt)}</span> : "Shift ended without replacement" },
          { key: "c", label: "Coverage now", render: (r) => <Cov c={Q.shiftCoverage(s, r.shift.id)} compact /> }]} />
      </Card>}
    </Page>
  );
}

/* ── standby ─────────────────────────────────────────────────────────────── */
function Standby({ s }: { s: OssState }) {
  const shifts = Q.windowEvents(s).flatMap((e) => Q.shiftsOfEvent(s, e.id));
  const [sid, setSid] = useState(s.standby[0]?.shiftId || "SH-001B");
  const list = s.standby.filter((b) => b.shiftId === sid).sort((a, b) => a.order - b.order);
  const cov = Q.shiftCoverage(s, sid);
  return (
    <Page title="Standby" sub="Eligible fallback workers per shift. Standby is not an accepted or paid assignment and never counts toward confirmed or allocated headcount.">
      <Card pad={false} title={<select className="oss-input" style={{ width: 320, height: 34 }} value={sid} onChange={(e) => setSid(e.target.value)} aria-label="Shift">{shifts.map((x) => <option key={x.id} value={x.id}>{Q.eventOf(s, x.eventId).name}: {x.label} ({fmtDate(x.start)})</option>)}</select>}
        right={<Cov c={cov} />}>
        <Table rows={list} rowKey={(b) => b.id} empty={<Empty title="No standby list" body="Add people from Allocation with the Standby button." />}
          cols={[{ key: "o", label: "Order", width: "90px", render: (b) => <span style={{ display: "flex", gap: 4, alignItems: "center" }}><b className="oss-ink">{b.order}</b><button className="oss-btn sm ghost" aria-label="Move up" onClick={() => run(E.moveStandby, b.id, -1)}><Icon d={I.up} size={12} /></button><button className="oss-btn sm ghost" aria-label="Move down" onClick={() => run(E.moveStandby, b.id, 1)}><Icon d={I.down} size={12} /></button></span> },
            { key: "w", label: "Worker", render: (b) => <WorkerLink s={s} id={b.workerId} /> },
            { key: "av", label: "Availability re-check", render: (b) => { const sh = Q.shiftOf(s, sid); const a = Q.availability(s, b.workerId, sh.start, sh.end); return <Reason level={a.state === "available" ? "ok" : a.state === "unknown" ? "unknown" : "block"}>{a.detail}</Reason>; } },
            { key: "d", label: "Evidence", render: (b) => { const sh = Q.shiftOf(s, sid); return sh.requiredDocs.map((t) => { const d = Q.docState(s, b.workerId, t, sh.end); return <Reason key={t} level={d.state === "valid" ? "ok" : d.state === "expiring" ? "warn" : "block"}>{d.label}</Reason>; }); } },
            { key: "c", label: "Contact", render: (b) => <span className="oss-small oss-dim">{b.willing ? "Willing · " : ""}{b.contact}</span> },
            { key: "a", label: "", render: (b) => <span style={{ display: "flex", gap: 6 }}>{!b.willing && <Btn size="sm" onClick={() => run(E.markStandbyWilling, b.id)}>Mark willing</Btn>}<Btn size="sm" kind="ghost" onClick={() => run(E.removeStandby, b.id)}>Remove</Btn></span> }]} />
      </Card>
    </Page>
  );
}

/* ── coverage matrix ─────────────────────────────────────────────────────── */
function CoverageView({ s }: { s: OssState }) {
  const [pend, setPend] = useState(false);
  const t = Q.windowTotals(s);
  const evs = Q.windowEvents(s, { pending: pend });
  const rows = evs.flatMap((e) => Q.shiftsOfEvent(s, e.id));
  const roles = new Map<string, Q.Coverage[]>();
  rows.forEach((x) => { const k = x.label; roles.set(k, (roles.get(k) || []).concat([Q.shiftCoverage(s, x.id)])); });
  const dates = new Map<string, Q.Coverage[]>();
  rows.forEach((x) => { const k = fmtDate(x.start); dates.set(k, (dates.get(k) || []).concat([Q.shiftCoverage(s, x.id)])); });
  return (
    <Page title="Coverage" sub="Positions, not people. Required, allocated and confirmed per shift, with drilldowns to the underlying roster."
      scope={<Scope><b>{Q.windowLabel(s)}</b></Scope>}
      actions={<Seg value={pend ? "p" : "f"} onChange={(v) => setPend(v === "p")} options={[{ id: "f", label: "Firm" }, { id: "p", label: "Pending (indicative)" }]} />}>
      {!pend && <div className="oss-grid oss-g4" style={{ marginBottom: 14 }}>
        <Metric label="Required positions" value={t.required} sub="Confirmed bookings only" />
        <Metric label="Confirmed" value={t.confirmed} sub={t.coverageLabel + " coverage"} />
        <Metric label="Unfilled" value={t.unfilled} tone={t.unfilled ? "warn" : "ok"} sub={t.awaiting + " awaiting reply, " + t.notInvited + " not yet invited"} />
        <Metric label="Unique workers confirmed" value={Q.uniqueWorkers(s, t.events.map((e) => e.id))} sub="Some people work more than one shift" />
      </div>}
      <Card pad={false} title="By shift">
        <Table rows={rows} rowKey={(x) => x.id} onRow={(x) => pend ? openDrawer("event", x.eventId) : setUi({ tabs: { ...s.ui.tabs, Staffing: "allocation" }, focus: { kind: "shift", id: x.id } })} foot={!pend}
          cols={[{ key: "e", label: "Booking", render: (x) => Q.eventOf(s, x.eventId).name, foot: "Total" }, { key: "s", label: "Shift", render: (x) => x.label },
            { key: "d", label: "When", nowrap: true, render: (x) => span(x.start, x.end) },
            { key: "r", label: "Required", num: true, render: (x) => x.required, foot: t.required }, { key: "al", label: "Allocated", num: true, render: (x) => pend ? "—" : Q.shiftCoverage(s, x.id).allocated, foot: t.allocated },
            { key: "c", label: "Confirmed", num: true, render: (x) => pend ? "—" : Q.shiftCoverage(s, x.id).confirmed, foot: t.confirmed }, { key: "a", label: "Awaiting", num: true, render: (x) => pend ? "—" : Q.shiftCoverage(s, x.id).awaiting, foot: t.awaiting },
            { key: "u", label: "Unfilled", num: true, render: (x) => pend ? "—" : Q.shiftCoverage(s, x.id).unfilled, foot: t.unfilled }, { key: "n", label: "Not yet invited", num: true, render: (x) => pend ? "—" : Q.shiftCoverage(s, x.id).notInvited, foot: t.notInvited },
            { key: "b", label: "Coverage", render: (x) => pend ? <S s="Pending" /> : <Cov c={Q.shiftCoverage(s, x.id)} compact />, foot: t.coverageLabel }]} />
      </Card>
      {!pend && <div className="oss-grid oss-g2" style={{ marginTop: 14 }}>
        <Card title="By role"><div className="oss-bars">{Array.from(roles).map(([k, l]) => { const c = Q.sumCov(l); return <CovBar key={k} label={k} c={c} />; })}</div></Card>
        <Card title="By date"><div className="oss-bars">{Array.from(dates).map(([k, l]) => { const c = Q.sumCov(l); return <CovBar key={k} label={k} c={c} />; })}</div></Card>
      </div>}
    </Page>
  );
}
export function CovBar({ label, c, onClick }: { label: string; c: Q.Coverage; onClick?: () => void }) {
  const w = (n: number) => (c.required ? (n / c.required) * 100 : 0) + "%";
  return (
    <button className="oss-hbar" onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <span className="oss-ellip">{label}</span>
      <span className="track"><i style={{ width: w(c.confirmed), background: "var(--ok)" }} /><i style={{ width: w(c.awaiting), background: "var(--accent)", opacity: .55 }} /></span>
      <span className="val">{c.confirmed}/{c.required}</span>
    </button>
  );
}
