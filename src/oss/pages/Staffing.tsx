/* Staffing: pick a shift, filter to people who are available and cleared,
   invite several at once (each gets an individual invitation), then track
   replies and cover cancellations from the standby list. */

import "../../styles/oss-events.css";
import { useMemo, useState } from "react";
import type { OssState } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { docLabel } from "../seed";
import { profile, reliability, restIfOffered, stamp2Check } from "../industry";
import { navigate, openDrawer, run, setUi, useOss } from "../store";
import { tabOf } from "../modules";
import { fmtDate, fmtHM, fmtTime, minutesBetween, ms } from "../time";
import { Av, Btn, Card, Chip, Cov, Figure, Hero, I, Icon, Meter, Page, PPE, Ribbon, Row, RIcon, S, Search, Seg, St, Tag, kindVar } from "../ui/kit";
import { DESKS } from "../network";
import { DeskTag, DESK_SHORT, deskC } from "./Events";

export default function Staffing() {
  const s = useOss();
  const tab = tabOf(s, "Staffing");
  if (tab === "responses") return <Responses s={s} />;
  if (tab === "replacements") return <Replacements s={s} />;
  return <Allocate s={s} />;
}

function pickShift(s: OssState): string {
  const f = s.ui.focus;
  if (f?.kind === "shift" && Q.shiftOf(s, f.id)) return f.id;
  const evId = f?.kind === "event" ? f.id : "EVT-001";
  const shifts = Q.shiftsOfEvent(s, evId);
  return (shifts.find((x) => Q.shiftCoverage(s, x.id).notInvited > 0) || shifts.find((x) => Q.shiftCoverage(s, x.id).unfilled > 0) || shifts[0])?.id || "SH-001A";
}

const REASON_TONE = { ok: "var(--ok)", warn: "var(--warn)", block: "var(--bad)", unknown: "var(--dim)" } as const;
const REASON_ICON = { ok: I.check, warn: I.alert, block: I.x, unknown: I.info } as const;

/* ── allocate ─────────────────────────────────────────────────────────────── */
function Allocate({ s }: { s: OssState }) {
  const shiftId = pickShift(s);
  const sh = Q.shiftOf(s, shiftId);
  const ev = Q.eventOf(s, sh.eventId);
  const cov = Q.shiftCoverage(s, shiftId);
  const [group, setGroup] = useState<"eligible" | "unknown" | "blocked">("eligible");
  const [q, setQ] = useState("");
  const [here, setHere] = useState(false);
  const [area, setArea] = useState("all");
  const [picked, setPicked] = useState<string[]>([]);
  const [showCovered, setShowCovered] = useState(false);
  const [cap, setCap] = useState(40);
  const cands = useMemo(() => Q.candidates(s, shiftId), [s, shiftId]);
  const areas = Array.from(new Set(cands[group].map((c) => c.worker.locality))).sort();
  const list = cands[group].slice().sort((a, b) => Number(profile(b.worker).preferredBy.includes(ev.clientId)) - Number(profile(a.worker).preferredBy.includes(ev.clientId))).filter((c) => (!q || (c.worker.name + " " + c.worker.locality + " " + c.worker.roles.join(" ")).toLowerCase().includes(q.toLowerCase()))
    && (!here || c.venueHistory) && (area === "all" || c.worker.locality === area));
  const sel = picked.filter((id) => cands.eligible.some((c) => c.worker.id === id));
  const choose = (id: string) => { setPicked([]); setCap(40); setUi({ focus: { kind: "shift", id } }); };
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.concat([id])));
  const confirmed = Q.rowsBy(s.assignments, "shift", (a) => a.shiftId, shiftId).filter((a) => a.status === "confirmed");
  const awaiting = Q.rowsBy(s.invitations, "shift", (i) => i.shiftId, shiftId).filter((i) => Q.isActiveInvite(s, i));
  const room = cov.notInvited;
  const fillTop = () => setPicked(cands.eligible.slice(0, room).map((c) => c.worker.id));
  const evs = Q.windowEvents(s).filter((e) => Q.eventPhase(s, e) !== "completed");
  /* Shifts still needing people come first; the covered ones fold away so the strip stays short at company scale. */
  const strip = evs.flatMap((e) => Q.shiftsOfEvent(s, e.id).filter((x) => ms(x.end) > ms(s.clock)).map((x) => ({ e, x, c: Q.shiftCoverage(s, x.id) })));
  const needs = strip.filter((r) => r.c.unfilled > 0 || r.x.id === shiftId).sort((a, b) => Number(b.c.notInvited > 0) - Number(a.c.notInvited > 0) || a.x.start.localeCompare(b.x.start));
  const covered = strip.filter((r) => !(r.c.unfilled > 0 || r.x.id === shiftId));
  const pill = ({ e, x, c }: (typeof strip)[number]) => {
    const w = (n: number) => (c.required ? (n / c.required) * 100 : 0) + "%";
    return (
      <button key={x.id} role="tab" aria-selected={x.id === shiftId} className={"ops-shiftpill nx-pill" + (x.id === shiftId ? " on" : "")} style={{ ["--k" as any]: kindVar(Q.kindOf(s, e)) }} onClick={() => choose(x.id)}>
        <span className="ev"><i className="nx-deskdot" style={{ background: deskC(Q.deskOf(e)) }} />{fmtDate(x.start)} · {e.name.split(":")[0]}</span>
        <b>{x.label}</b>
        <span className="tm">{fmtTime(x.start)}-{fmtTime(x.end)}</span>
        <span className="bar"><i className="c" style={{ width: w(c.confirmed) }} /><i className="a" style={{ width: w(c.awaiting) }} /></span>
        <span className="foot"><span className="n">{c.confirmed}/{c.required}</span>{c.notInvited > 0 ? <span className="need">{c.notInvited} to invite</span> : c.unfilled > 0 ? <span className="oss-tiny" style={{ color: "var(--accent)" }}>{c.awaiting} awaiting</span> : <span className="done"><Icon d={I.check} size={12} sw={2.4} />Covered</span>}</span>
      </button>);
  };
  return (
    <Page eyebrow={"Allocate · " + (Q.windowLabel(s).split("· ").pop() || "").replace(/[–—]/g, "-")} title="Find and invite staff" sub="Only people who are available, qualified and free that day are offered. Everyone answers each shift on its own.">
      <div className="nx-striph"><b>Needs crew</b><span>{needs.filter((r) => r.c.notInvited > 0).length} to invite, {needs.filter((r) => !r.c.notInvited && r.c.unfilled).length} waiting on replies</span><span className="grow" /><button className="oss-link oss-small" onClick={() => setShowCovered(!showCovered)}>{showCovered ? "Hide" : "Show"} {covered.length} covered shift{covered.length === 1 ? "" : "s"}</button></div>
      <div className="ops-shiftbar" role="tablist" aria-label="Shift to staff">
        {needs.map(pill)}
        {!needs.length && <div className="oss-small oss-dim" style={{ padding: "14px 6px" }}>Every upcoming shift is covered.</div>}
      </div>
      {showCovered && <div className="ops-shiftbar nx-covered" role="tablist" aria-label="Covered shifts">{covered.map(pill)}</div>}

      <section className="ops-shiftsum">
        <div className="txt">
          <span className="oss-eyebrow">{ev.name}</span>
          <h2>{sh.label}</h2>
          <span className="nx-tagrow"><Tag c={kindVar(Q.kindOf(s, ev))} dot={false}>{Q.kindOf(s, ev)}</Tag><DeskTag desk={Q.deskOf(ev)} /></span>
          <span className="oss-small oss-dim">{fmtDate(sh.start)} · {fmtTime(sh.start)}-{fmtTime(sh.end)} · {sh.roles.slice(0, 3).join(", ")}</span>
        </div>
        <div className="mtr">
          <div className="big"><b>{cov.confirmed}</b><span>of {cov.required} confirmed</span></div>
          <Meter total={cov.required} parts={[{ n: cov.confirmed, tone: "ok", label: "confirmed" }, { n: cov.awaiting, tone: "accent", label: "awaiting reply" }, { n: room, tone: "warn", label: "to invite" }]} />
        </div>
        <div className="req">
          <PPE items={sh.ppe} />
          {sh.requiredDocs.length > 0 && <span className="oss-pill"><Icon d={I.shield} size={13} />{sh.requiredDocs.map(docLabel).join(", ")} required</span>}
        </div>
      </section>

      <div className="ops-alloc">
        <Card title={group === "eligible" ? "Ready to invite" : group === "unknown" ? "No availability given" : "Can't work this shift"} meta={list.length + " people · preferred crew for " + Q.clientOf(s, ev.clientId).name.split(" ")[0] + " first"} icon={I.users} pad={false}>
          <div className="oss-filters" style={{ paddingBottom: 10 }}>
            <Seg value={group} onChange={(v) => { setGroup(v); setArea("all"); }} label="Who" options={[{ id: "eligible", label: "Ready to invite", n: cands.eligible.length }, { id: "unknown", label: "No availability", n: cands.unknown.length }, { id: "blocked", label: "Can't work", n: cands.blocked.length }]} />
          </div>
          <div className="oss-filters">
            <Search value={q} onChange={setQ} placeholder="Name, role or area" style={{ flex: "1 1 200px" }} />
            <select className="oss-input" style={{ width: 150, borderRadius: 999 }} value={area} onChange={(e) => setArea(e.target.value)} aria-label="Area"><option value="all">Any area</option>{areas.map((a) => <option key={a} value={a}>{a}</option>)}</select>
            <Chip on={here} onClick={() => setHere(!here)}>Worked here before</Chip>
          </div>
          <div className="oss-rows" style={{ padding: "0 8px 10px", maxHeight: 680, overflowY: "auto" }}>
            {list.slice(0, cap).map((c) => {
              const on = picked.includes(c.worker.id);
              const p = profile(c.worker);
              const st2 = stamp2Check(s, c.worker.id, sh);
              const rest = restIfOffered(s, c.worker.id, sh);
              const dnr = p.dnr.find((d) => d.clientId === ev.clientId);
              const pref = p.preferredBy.includes(ev.clientId);
              const hold = !!dnr || !!st2?.over || (rest !== null && rest < 660);
              return (
                <div key={c.worker.id} className={"oss-r" + (on ? " sel" : "")} style={{ alignItems: "flex-start" }}>
                  {group === "eligible" && <input type="checkbox" aria-label={"Select " + c.worker.name} checked={on} onChange={() => toggle(c.worker.id)} style={{ width: 18, height: 18, marginTop: 8, accentColor: "var(--accent)", flex: "none" }} />}
                  <Av name={c.worker.name} />
                  <div className="main">
                    <div className="t"><button className="oss-link" style={{ color: "var(--ink)" }} onClick={() => openDrawer("worker", c.worker.id)}>{c.worker.name}</button>{c.venueHistory && <span className="oss-tiny" style={{ color: "var(--accent)", fontWeight: 500, marginLeft: 8 }}>Worked here before</span>}</div>
                    <div className="s">{c.worker.roles[0]} · {c.worker.locality} · {c.worker.priorShifts} shifts{c.standby ? " · standby #" + c.standby : ""}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 6 }}>
                      {c.elig.reasons.filter((r) => r.code !== "role").map((r, i) => <span key={i} className="oss-tiny" style={{ display: "inline-flex", alignItems: "center", gap: 4, color: r.level === "ok" ? "var(--body)" : REASON_TONE[r.level] }}><Icon d={REASON_ICON[r.level]} size={12} sw={2.2} style={{ color: REASON_TONE[r.level] }} />{r.label}</span>)}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
                      {pref && <St tone="info">Asked for by {Q.clientOf(s, ev.clientId).name.split(" ")[0]}</St>}
                      {dnr && <St tone="bad">Do not rebook: {dnr.reason}</St>}
                      {st2 && <St tone={st2.over ? "bad" : st2.near ? "warn" : "neutral"}>Stamp 2 · {fmtHM(st2.total)} + {fmtHM(st2.add)} of 20h</St>}
                      {rest !== null && <St tone={rest < 660 ? "bad" : rest < 720 ? "warn" : "neutral"}>{fmtHM(rest)} rest</St>}
                      <St tone={reliability(p) >= 98 ? "ok" : reliability(p) >= 93 ? "neutral" : "warn"}>{reliability(p)}% turned up</St>
                      {p.teamLeader && <St tone="neutral">Team leader</St>}
                    </div>
                  </div>
                  <div className="end" style={{ paddingTop: 2 }}>
                    {group === "eligible" && <><Btn size="sm" onClick={() => run(E.sendInvitations, shiftId, [c.worker.id])} disabled={room < 1 || hold} title={hold ? "Held back: " + (dnr ? "client asked not to rebook" : st2?.over ? "over the Stamp 2 cap" : "under 11 hours rest") : undefined}>Invite</Btn><Btn size="sm" kind="ghost" onClick={() => run(E.addStandby, shiftId, c.worker.id)}>Standby</Btn></>}
                    {group === "unknown" && <Btn size="sm" onClick={() => run(E.requestAvailability, shiftId, [c.worker.id])}>Ask availability</Btn>}
                  </div>
                </div>);
            })}
            {list.length > cap && <button className="nx-more" onClick={() => setCap(cap + 40)}>Show {Math.min(40, list.length - cap)} more of {list.length}</button>}
            {!list.length && <div className="oss-empty"><b>{group === "eligible" ? "Nobody left to invite" : "Nobody here"}</b>{group === "eligible" ? "Check who hasn't given availability, or use the standby list." : ""}</div>}
          </div>
          {group === "unknown" && cands.unknown.length > 0 && <div className="oss-row" style={{ padding: "12px 20px", borderTop: "1px solid var(--border)" }}><Btn size="sm" icon={I.send} onClick={() => run(E.requestAvailability, shiftId, cands.unknown.map((c) => c.worker.id))}>Ask all {cands.unknown.length} for availability</Btn></div>}
        </Card>

        <div className="oss-stack ops-alloc-side">
          <Card title={sel.length ? sel.length + " selected" : "Selection"} icon={I.send}>
            {sel.length ? <div className="oss-rows" style={{ margin: "0 -12px" }}>{sel.map((id) => <Row key={id} lead={<Av name={Q.nameOf(s, id)} size="sm" />} title={Q.nameOf(s, id)} end={<button className="oss-link oss-small" onClick={() => toggle(id)}>Remove</button>} />)}</div>
              : <div className="oss-small oss-dim" style={{ lineHeight: 1.55 }}>Tick people to invite them together.{room > 0 && cands.eligible.length > 0 && <> Or <button className="oss-link" onClick={fillTop}>pick the best {Math.min(room, cands.eligible.length)}</button>.</>}</div>}
            {sel.length > room && <div className="oss-note warn" style={{ marginTop: 10 }}>Only {room} place{room === 1 ? "" : "s"} left. The rest can go on standby so the shift is never overbooked.</div>}
            <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
              <Btn kind="primary" icon={I.send} disabled={!sel.length || room < 1} onClick={() => { run(E.sendInvitations, shiftId, sel); setPicked([]); }}>Send {Math.min(sel.length, room) || ""} invitation{Math.min(sel.length, room) === 1 ? "" : "s"}</Btn>
              {sel.length > 0 && <Btn onClick={() => { sel.forEach((id) => run(E.addStandby, shiftId, id)); setPicked([]); }}>Add to standby</Btn>}
            </div>
            {sel.length > 0 && <div className="oss-note" style={{ marginTop: 12 }}><b className="oss-ink">They'll see:</b> {E.inviteBody(s, sh)}</div>}
          </Card>
          <Card title="Roster" meta={confirmed.length + " confirmed · " + awaiting.length + " awaiting"} icon={I.list} flush>
            <div className="oss-rows" style={{ maxHeight: 320, overflowY: "auto" }}>
              {awaiting.map((i) => <Row key={i.id} lead={<Av name={Q.nameOf(s, i.workerId)} size="sm" />} title={Q.nameOf(s, i.workerId)} sub={"Sent " + fmtTime(i.sentAt)} end={<Btn size="sm" kind="ghost" onClick={() => run(E.remind, i.id)}>Remind</Btn>} />)}
              {confirmed.map((a) => <Row key={a.id} lead={<Av name={Q.nameOf(s, a.workerId)} size="sm" />} title={Q.nameOf(s, a.workerId)} sub={a.replacementFor ? "Replacement" : "Accepted " + fmtTime(a.acceptedAt)} end={<Icon d={I.check} size={15} style={{ color: "var(--ok)" }} />} />)}
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

/* ── responses ───────────────────────────────────────────────────────────── */
type LaneId = "Awaiting reply" | "Accepted" | "Declined" | "gone";
const RLANES: { id: LaneId; label: string; tone: string }[] = [
  { id: "Awaiting reply", label: "Awaiting reply", tone: "" }, { id: "Accepted", label: "Accepted", tone: "ok" },
  { id: "Declined", label: "Declined", tone: "neutral" }, { id: "gone", label: "Withdrawn or expired", tone: "neutral" }];
const laneOf = (lab: string): LaneId => (lab === "Expired" || lab === "Withdrawn" ? "gone" : (lab as LaneId));
const ago = (m: number) => (m < 60 ? m + " min" : fmtHM(m));

function Responses({ s }: { s: OssState }) {
  const evFocus = s.ui.focus?.kind === "event" ? s.ui.focus.id : "all";
  const [ev, setEv] = useState(evFocus);
  const [desk, setDesk] = useState<string>("all");
  const [shiftF, setShiftF] = useState("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const firm = s.events.filter((e) => !e.historical && e.status === "confirmed");
  const base = s.invitations.filter((i) => { const e = Q.eventOf(s, Q.shiftOf(s, i.shiftId).eventId); return !e.historical && (ev === "all" ? desk === "all" || Q.deskOf(e) === desk : e.id === ev); });
  const shiftIds = ev === "all" ? [] : Array.from(new Set(base.map((i) => i.shiftId))).sort((a, b) => Q.shiftOf(s, a).start.localeCompare(Q.shiftOf(s, b).start));
  const sf = shiftIds.includes(shiftF) ? shiftF : "all";
  const all = base.filter((i) => sf === "all" || i.shiftId === sf);
  const replied = all.filter((i) => i.respondedAt);
  const avg = replied.length ? Math.round(replied.reduce((t, i) => t + minutesBetween(i.sentAt, i.respondedAt!), 0) / replied.length) : 0;
  const lanes = useMemo(() => { const m: Record<LaneId, typeof all> = { "Awaiting reply": [], "Accepted": [], "Declined": [], "gone": [] }; all.forEach((i) => m[laneOf(Q.inviteLabel(s, i))].push(i)); return m; }, [s, ev, desk, sf]);
  const lane = (id: LaneId) => lanes[id].slice().sort((a, b) => (id === "Awaiting reply" ? a.sentAt.localeCompare(b.sentAt) : (b.respondedAt || b.sentAt).localeCompare(a.respondedAt || a.sentAt)));
  const waiting = lane("Awaiting reply");
  const sub: Record<LaneId, string> = {
    "Awaiting reply": waiting.length ? "Oldest sent " + ago(minutesBetween(waiting[0].sentAt, s.clock)) + " ago" : "Nothing outstanding",
    "Accepted": replied.length ? "Average reply " + ago(avg) : "Counted as confirmed",
    "Declined": "Place goes back to invite",
    "gone": "Pulled by the office or ran out of time"
  };
  const deskN = (d: string) => s.invitations.filter((i) => Q.deskOf(Q.eventOf(s, Q.shiftOf(s, i.shiftId).eventId)) === d && Q.isActiveInvite(s, i)).length;
  return (
    <Page eyebrow="Responses" title="Who has answered" sub="Every invitation is for one shift. A yes to the morning never commits anyone to the evening."
      actions={<select className="oss-input" style={{ width: 280, maxWidth: "100%", borderRadius: 999 }} value={ev} onChange={(e) => { setEv(e.target.value); setShiftF("all"); }} aria-label="Event"><option value="all">All events</option>{DESKS.map((d) => { const l = firm.filter((e) => Q.deskOf(e) === d); return l.length ? <optgroup key={d} label={d}>{l.map((e) => <option key={e.id} value={e.id}>{fmtDate(e.date + "T12:00:00Z").split(" ").slice(0, 2).join(" ")} · {e.name}</option>)}</optgroup> : null; })}</select>}>
      <Ribbon items={[
        { label: "Offers in this view", value: all.length.toLocaleString("en-IE"), sub: ev === "all" ? (desk === "all" ? "Every desk" : DESK_SHORT[desk]) : Q.eventOf(s, ev).name.split(":")[0] },
        { label: "Awaiting reply", value: waiting.length, tone: waiting.length ? "accent" : undefined, sub: sub["Awaiting reply"] },
        { label: "Accepted", value: lanes["Accepted"].length.toLocaleString("en-IE"), tone: "ok", sub: "Counted as confirmed" },
        { label: "Declined", value: lanes["Declined"].length, sub: "Back to invite" },
        { label: "Average reply", value: replied.length ? ago(avg) : "-", sub: replied.length.toLocaleString("en-IE") + " answered" }
      ]} />
      {ev === "all" ? <div className="nx-filters"><div className="row chips" aria-label="Desk">
        <button className={"nx-chip" + (desk === "all" ? " on" : "")} onClick={() => setDesk("all")}>All desks</button>
        {DESKS.map((d) => { const n = deskN(d); return <button key={d} className={"nx-chip" + (desk === d ? " on" : "")} onClick={() => setDesk(desk === d ? "all" : d)}><i style={{ background: deskC(d) }} />{DESK_SHORT[d]}{n > 0 && <span className="warn">{n} waiting</span>}</button>; })}
      </div></div>
      : <div className="ops-shiftfilter">
        <Chip on={sf === "all"} onClick={() => setShiftF("all")}>All shifts <span className="oss-muted">{base.length}</span></Chip>
        {shiftIds.map((id) => { const x = Q.shiftOf(s, id); return <Chip key={id} on={sf === id} onClick={() => setShiftF(id)}>{fmtDate(x.start).split(" ")[0]} · {x.label} <span className="oss-muted">{base.filter((i) => i.shiftId === id).length}</span></Chip>; })}
      </div>}
      {sf !== "all" && <div className="ops-swim-cov"><span className="oss-small oss-dim">{fmtDate(Q.shiftOf(s, sf).start)}, {fmtTime(Q.shiftOf(s, sf).start)}-{fmtTime(Q.shiftOf(s, sf).end)}</span><span style={{ width: 220 }}><Cov c={Q.shiftCoverage(s, sf)} /></span></div>}
      <div className="ops-swim">
        {RLANES.map((l) => { const list = lane(l.id); const capN = open[l.id] ? 200 : l.id === "Awaiting reply" ? 40 : 12; return (
          <section key={l.id} className={"ops-swimlane " + l.tone + (l.id === "Awaiting reply" ? " live" : "")}>
            <header>
              <span className="h"><span className="oss-dot" />{l.label}<b>{list.length}</b></span>
              <span className="s">{sub[l.id]}</span>
              {l.id === "Awaiting reply" && list.length > 0 && <Btn size="sm" icon={I.bell} onClick={() => list.forEach((i) => run(E.remind, i.id))}>Remind all {list.length}</Btn>}
            </header>
            <div className="cards">
              {list.slice(0, capN).map((i) => {
                const waited = minutesBetween(i.sentAt, i.respondedAt || s.clock);
                const sh = Q.shiftOf(s, i.shiftId);
                const active = Q.isActiveInvite(s, i);
                const lab = Q.inviteLabel(s, i);
                return (
                  <article key={i.id} className={"ops-pcard" + (active && waited > 12 * 60 ? " stale" : "")}>
                    <div className="top">
                      <Av name={Q.nameOf(s, i.workerId)} size="sm" />
                      <button className="nm" onClick={() => openDrawer("worker", i.workerId)}>{Q.nameOf(s, i.workerId)}</button>
                      {i.kind === "replacement" && <St tone="info">Cover</St>}
                    </div>
                    {sf === "all" && <div className="sh"><i className="nx-deskdot" style={{ background: kindVar(Q.kindOf(s, Q.eventOf(s, sh.eventId))) }} />{Q.eventOf(s, sh.eventId).name.split(":")[0]} · {sh.label}</div>}
                    <div className="tm">{i.respondedAt ? "Answered in " + ago(waited) : active ? "Waiting " + ago(waited) : lab === "Expired" ? "Expired " + fmtTime(i.expiresAt) : "Withdrawn"}<span> · sent {fmtDate(i.sentAt).split(" ")[0]} {fmtTime(i.sentAt)}</span></div>
                    {(i.reminders.length > 0 || i.flags.includes("worker-unavailable")) && <div className="fl">{i.reminders.length > 0 && <span>Reminded {i.reminders.length}x</span>}{i.flags.includes("worker-unavailable") && <St tone="bad">Now unavailable</St>}</div>}
                    {active && <div className="act"><Btn size="sm" onClick={() => run(E.remind, i.id)}>Remind</Btn><Btn size="sm" kind="ghost" onClick={() => run(E.withdrawInvitation, i.id)}>Withdraw</Btn></div>}
                  </article>);
              })}
              {list.length > capN && <button className="nx-more" onClick={() => setOpen({ ...open, [l.id]: true })}>{open[l.id] ? "Showing the latest 200 of " + list.length.toLocaleString("en-IE") : "Show more (" + list.length.toLocaleString("en-IE") + " in total)"}</button>}
              {!list.length && <div className="none">Nobody</div>}
            </div>
          </section>); })}
      </div>
    </Page>
  );
}

/* ── replacements ────────────────────────────────────────────────────────── */
function Replacements({ s }: { s: OssState }) {
  const rq = Q.replacementQueue(s);
  const open = rq.filter((r) => r.open).sort((a, b) => a.shift.start.localeCompare(b.shift.start)), done = rq.filter((r) => !r.open);
  const gaps = Q.windowEvents(s).flatMap((e) => Q.shiftsOfEvent(s, e.id)).filter((x) => Q.shiftCoverage(s, x.id).unfilled > 0 && ms(x.start) > ms(s.clock));
  const shifts = Q.windowEvents(s).flatMap((e) => Q.shiftsOfEvent(s, e.id)).filter((x) => ms(x.end) > ms(s.clock));
  const [sid, setSid] = useState(open[0]?.shift.id || s.standby[0]?.shiftId || "SH-001B");
  const booked = (wid: string, shid: string) => Q.rowsBy(s.assignments, "shift", (a) => a.shiftId, shid).some((a) => a.workerId === wid && a.status === "confirmed");
  const sb = s.standby.filter((b) => b.shiftId === sid && !booked(b.workerId, sid)).sort((a, b) => a.order - b.order);
  const urgent = (start: string) => minutesBetween(s.clock, start) < 48 * 60;
  const first = open[0];
  const firstMins = first ? minutesBetween(s.clock, first.shift.start) : 0;
  const hot = !!first && urgent(first.shift.start);
  return (
    <div className="oss-page">
      {first ? <Hero tone={hot ? "urgent" : "accent"} eyebrow="Replacements" title={open.length + " drop-out" + (open.length === 1 ? "" : "s") + " to cover"}
        sub="Each gap below has the standby list for that shift beside it, already checked for availability and documents. Send one offer at a time; the gap closes when they accept."
        aside={<><Figure size="lg" label="First gap starts in" value={firstMins < 60 ? firstMins + " min" : fmtHM(firstMins)} tone={hot ? "urgent" : "warn"} sub={first.event.name.split(":")[0] + ", " + first.shift.label} /></>} />
        : <Hero tone="plain" eyebrow="Replacements" title="No open cancellations" sub={done.length ? done.length + " drop-out" + (done.length === 1 ? "" : "s") + " covered so far. New cancellations show up here the moment they happen." : "Cancellations show up here the moment they happen, with the standby list for that shift beside them."} />}
      <div className="oss-stack">
        {open.map((r) => {
          const mins = minutesBetween(s.clock, r.shift.start);
          const isHot = urgent(r.shift.start);
          const list = s.standby.filter((b) => b.shiftId === r.shift.id && !booked(b.workerId, r.shift.id)).sort((a, b) => a.order - b.order);
          return (
            <article key={r.asg.id} className={"ops-gap" + (isHot ? " hot" : "")}>
              <div className="who">
                <span className={"oss-st " + (isHot ? "urgent" : "warn")}><Icon d={I.clock} size={12} sw={2.2} />Starts in {mins < 60 ? mins + " min" : fmtHM(mins)}</span>
                <div className="oss-row" style={{ gap: 12, marginTop: 14 }}>
                  <Av name={r.worker.name} lg />
                  <span style={{ minWidth: 0 }}><b className="nm">{r.worker.name} can't make it</b><span className="ev">{r.event.name.split(":")[0]}, {r.shift.label} · {fmtDate(r.shift.start)} {fmtTime(r.shift.start)}</span></span>
                </div>
                <blockquote className="ops-quote">{r.asg.cancelReason || "No reason given"}<span> · cancelled {fmtTime(r.asg.cancelledAt!)}</span></blockquote>
                <div style={{ marginTop: 14 }}><Cov c={Q.shiftCoverage(s, r.shift.id)} /></div>
                {r.pendingInv.length > 0 && <div className="oss-note info" style={{ marginTop: 12 }}>Offer sent to <b>{r.pendingInv.map((i) => Q.nameOf(s, i.workerId)).join(", ")}</b> at {fmtTime(r.pendingInv[0].sentAt)}. The gap closes when they accept.</div>}
              </div>
              <div className="sb">
                <span className="oss-eyebrow">Standby for this shift</span>
                <div className="oss-rows" style={{ marginTop: 8 }}>
                  {list.map((b, bi) => {
                    const e = Q.eligibility(s, b.workerId, r.shift.id);
                    const firstUp = bi === list.findIndex((x) => { const ex = Q.eligibility(s, x.workerId, r.shift.id); return ex.status !== "blocked" && ex.status !== "unknown"; });
                    const invited = r.pendingInv.some((i) => i.workerId === b.workerId);
                    return <Row key={b.id} lead={<span className="ops-ord">{b.order}</span>} title={<span className="oss-row" style={{ gap: 8 }}><Av name={Q.nameOf(s, b.workerId)} size="sm" />{Q.nameOf(s, b.workerId)}</span>}
                      sub={e.reasons.filter((x) => x.code !== "role").map((x) => x.label).join(" · ") + (b.willing ? " · said they're willing" : "")} wrap
                      end={invited ? <S s="Awaiting reply" /> : <Btn size="sm" kind={firstUp ? (isHot ? "urgent" : "primary") : undefined} disabled={e.status === "blocked" || e.status === "unknown" || r.pendingInv.length > 0} onClick={() => run(E.sendInvitations, r.shift.id, [b.workerId], { kind: "replacement", replaces: r.asg.id })}>Send offer</Btn>} />;
                  })}
                  {!list.length && <div className="oss-small oss-dim" style={{ padding: "6px 12px" }}>No standby list for this shift. <button className="oss-link" onClick={() => navigate("Staffing", "allocate", { kind: "shift", id: r.shift.id })}>Find someone</button></div>}
                </div>
              </div>
            </article>);
        })}
      </div>
      <div className="oss-gap" />
      <div className="oss-grid oss-g2" style={{ alignItems: "start" }}>
        <Card title="Standby lists" meta="Fallback people per shift, in order" icon={I.list} flush
          right={<select className="oss-input" style={{ width: 210, maxWidth: "52vw", height: 34, borderRadius: 999 }} value={sid} onChange={(e) => setSid(e.target.value)} aria-label="Shift">{DESKS.map((d) => { const l = shifts.filter((x) => Q.deskOf(Q.eventOf(s, x.eventId)) === d); return l.length ? <optgroup key={d} label={d}>{l.map((x) => <option key={x.id} value={x.id}>{fmtDate(x.start).split(" ")[0]} · {Q.eventOf(s, x.eventId).name.split(":")[0]}: {x.label}</option>)}</optgroup> : null; })}</select>}>
          <div className="oss-rows">
            {sb.map((b) => { const sh = Q.shiftOf(s, sid); const a = Q.availability(s, b.workerId, sh.start, sh.end); return (
              <Row key={b.id} lead={<Av name={Q.nameOf(s, b.workerId)} />} title={b.order + ". " + Q.nameOf(s, b.workerId)} sub={a.detail + (b.willing ? " · willing" : "")}
                end={<><button className="oss-iconbtn" aria-label="Move up" onClick={() => run(E.moveStandby, b.id, -1)}><Icon d={I.up} size={13} /></button><button className="oss-iconbtn" aria-label="Move down" onClick={() => run(E.moveStandby, b.id, 1)}><Icon d={I.down} size={13} /></button><Btn size="sm" kind="ghost" onClick={() => run(E.removeStandby, b.id)}>Remove</Btn></>} />); })}
            {!sb.length && <div className="oss-empty"><b>No standby yet</b>Add people from Allocate.</div>}
          </div>
        </Card>
        <Card title="Open positions" meta="Upcoming shifts still short" icon={I.users} flush>
          <div className="oss-rows">
            {gaps.map((x) => <Row key={x.id} lead={<RIcon d={I.users} tone="warn" />} title={<span className="oss-row" style={{ gap: 8 }}><i className="nx-deskdot" style={{ background: kindVar(Q.kindOf(s, Q.eventOf(s, x.eventId))) }} />{Q.eventOf(s, x.eventId).name.split(":")[0] + " · " + x.label}</span>} sub={fmtDate(x.start) + ", " + fmtTime(x.start) + " · " + Q.shiftCoverage(s, x.id).notInvited + " not invited"}
              end={<span style={{ width: 130 }}><Cov c={Q.shiftCoverage(s, x.id)} compact /></span>} onClick={() => navigate("Staffing", "allocate", { kind: "shift", id: x.id })} />)}
            {!gaps.length && <div className="oss-empty"><b>Every upcoming shift is covered</b></div>}
          </div>
          {done.length > 0 && <div style={{ padding: "4px 12px 10px" }}>
            <div className="oss-label" style={{ padding: "8px 0 6px" }}>Covered</div>
            {done.map((r) => <Row key={r.asg.id} lead={<RIcon d={I.check} tone="ok" />} title={r.worker.name + " → " + (r.replacement ? Q.nameOf(s, r.replacement.workerId) : "not replaced")} sub={r.event.name.split(":")[0] + " · " + r.shift.label} />)}
          </div>}
        </Card>
      </div>
    </div>
  );
}

export function CovBar({ label, c, onClick }: { label: string; c: Q.Coverage; onClick?: () => void }) {
  const w = (n: number) => (c.required ? (n / c.required) * 100 : 0) + "%";
  return (
    <button className="oss-hbar" onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <span className="oss-ellip">{label}</span>
      <span className="track"><i style={{ width: w(c.confirmed), background: "var(--ok)" }} /><i style={{ width: w(c.awaiting), background: "var(--accent)" }} /></span>
      <span className="val">{c.confirmed}/{c.required}</span>
    </button>
  );
}
