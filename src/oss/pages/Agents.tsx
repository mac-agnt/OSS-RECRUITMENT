/* Agents: an operations room, not a settings page. Pick an agent on the left
   to see its work log (each check, what it found, the decision it brought you)
   and, on the right, exactly what it watches, what it may do and what it never
   does. "The team" shows every agent across the last day and a half and how
   work passes between them before a person approves. Proposals is an approval
   inbox: the reason, the exact people or message affected, then one click. */

import { useRef, useState } from "react";
import type { AgentProposal, AgentRun, OssState } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { navigate, run, useOss } from "../store";
import { tabOf } from "../modules";
import { fmtDate, fmtTime, hourOf, ms } from "../time";
import { Av, Btn, I, Icon, Seg, Toggle } from "../ui/kit";
import AgentFace from "../../components/AgentFace";

type Agent = (typeof E.AGENTS)[number];
interface Meta { schedule: string; every: number; offset: number; from?: number; to?: number; watches: string[]; can: string[]; never: string[]; approver: string | null; handsTo: string[] }

/* What each agent watches and the lines it never crosses. `every`/`offset` are
   hours on the Dublin clock, used to draw its quiet checks on the team timeline. */
const META: Record<string, Meta> = {
  briefing: { schedule: "07:00 every day, and on request", every: 24, offset: 7, watches: ["Bookings", "Coverage", "Bullhorn batches", "Documents"],
    can: ["Writes the morning summary with a link to every record it mentions", "Counts confirmed, awaiting and unfilled positions for the next seven days", "Flags blocked Bullhorn lines before the payroll cut-off"],
    never: ["Changes a record", "Sends anything to crew or clients"], approver: null, handsTo: ["watchdog"] },
  watchdog: { schedule: "Every few minutes, around the clock on event days", every: 1, offset: 0, watches: ["Invitations", "Assignments", "Running late", "Clock records"],
    can: ["Spots a cancellation and opens the replacement task", "Chases invitations with no reply after 12 hours", "Raises a missed clock-in once the grace period passes"],
    never: ["Changes a roster", "Contacts crew directly", "Opens the same task twice"], approver: null, handsTo: ["staffing", "comms"] },
  staffing: { schedule: "When a gap opens or a reply comes in", every: 2, offset: 1, from: 7, to: 23, watches: ["Availability", "Documents", "Rest between shifts", "Client preferences"],
    can: ["Shortlists eligible crew with the reason for each person", "Puts the client's preferred crew first", "Skips anyone over the Stamp 2 cap or short of 11 hours' rest"],
    never: ["Sends an invitation without a coordinator", "Offers work to anyone on a client's do-not-rebook list"], approver: "U03", handsTo: ["comms"] },
  eligibility: { schedule: "06:00 daily, and whenever a document is uploaded", every: 24, offset: 6, watches: ["Manual Handling", "Safe Pass", "PSA licences", "Right to work"],
    can: ["Checks every document against the shift date, not today's date", "Drafts renewal reminders before anything expires", "Flags uploads waiting for review"],
    never: ["Judges whether a document is genuine", "Approves a document"], approver: "U06", handsTo: ["staffing", "comms"] },
  comms: { schedule: "Before every event, and on request", every: 12, offset: 9, watches: ["Rosters", "Call sheets", "Message templates"],
    can: ["Drafts PPE and call-time updates for the exact roster", "Shows every recipient before anything goes", "Tracks who has acknowledged"],
    never: ["Sends without a person", "Messages anyone off the roster"], approver: "U02", handsTo: [] },
  timesheet: { schedule: "When a shift ends, and every morning after", every: 6, offset: 2, watches: ["Clock records", "Corrections", "Pay rules"],
    can: ["Finds missing clock-ins and clock-outs", "Applies the five-hour minimum and flags time past finish", "Proposes corrections with the supervisor's note attached"],
    never: ["Approves hours", "Changes the pay rules"], approver: "U07", handsTo: ["handover"] },
  handover: { schedule: "After every Bullhorn send", every: 6, offset: 4, watches: ["Handover batches", "Candidate mappings"],
    can: ["Finds failed and blocked rows", "Prepares a safe retry with the same transfer key", "Warns before the Friday payroll cut-off"],
    never: ["Sends a row twice", "Treats a transfer as a payment"], approver: "U07", handsTo: [] }
};

const agentOf = (id: string) => E.AGENTS.find((a) => a.id === id)!;
const runsOf = (s: OssState, id: string) => s.agentRuns.filter((r) => r.agentId === id);
const pendingOf = (s: OssState, id?: string) => s.proposals.filter((p) => p.status === "pending" && (!id || p.agentId === id));
const WARN = /cancel|blocked|missing|excluded|expir|not yet|outstanding|awaiting|late|unfilled|no replacement|failed|over the/i;
const fTone = (f: string) => (/^no |every approved|no blocked/i.test(f) ? "ok" : WARN.test(f) ? "warn" : "ok");
const runKind = (r: AgentRun) => (r.proposalIds.length ? "decision" : r.findings.some((f) => fTone(f) === "warn") ? "warn" : "ok");
const TRIGGER: Record<AgentRun["trigger"], string> = { scheduled: "Scheduled check", run_now: "Run on request", seed: "Check" };
const sameDay = (a: string, b: string) => fmtDate(a) === fmtDate(b);
const when = (iso: string, now: string) => (sameDay(iso, now) ? fmtTime(iso) : fmtDate(iso).split(" ")[0]);

function faceState(s: OssState, id: string): string {
  if (s.agentsPaused[id]) return "idle";
  if (pendingOf(s, id).length) return "waiting";
  const r = runsOf(s, id).pop();
  return r && ms(s.clock) - ms(r.at) < 20 * 60000 ? "working" : "complete";
}
function statusOf(s: OssState, id: string): [string, string] {
  if (s.agentsPaused[id]) return ["Paused", "var(--neutral)"];
  const n = pendingOf(s, id).length;
  if (n) return [n + " waiting on you", "var(--accent)"];
  return ["Watching", "var(--ok)"];
}

export default function Agents() {
  const s = useOss();
  const [sel, setSelRaw] = useState<string>("team");
  const [pid, setPidRaw] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  /* On a narrow screen the list sits above the content: bring the content into view. */
  const reveal = () => requestAnimationFrame(() => { const w = wrap.current; if (w && w.clientWidth < 760) w.querySelector(".ag-main")?.scrollIntoView({ block: "start" }); });
  const setSel = (id: string) => { setSelRaw(id); reveal(); };
  const setPid = (id: string | null) => { setPidRaw(id); reveal(); };
  if (tabOf(s, "Agents") === "proposals") return <div ref={wrap} className="ag-wrap"><Inbox s={s} pid={pid} setPid={setPid} /></div>;
  return (
    <div ref={wrap} className="ag-wrap">
      <div className="ag-room">
        <AgentList s={s} sel={sel} setSel={setSel} />
        {sel === "team" ? <TeamMain s={s} setSel={setSel} /> : <AgentMain s={s} a={agentOf(sel)} />}
        {sel === "team" ? <TeamSide s={s} /> : <AgentSide s={s} a={agentOf(sel)} setSel={setSel} />}
      </div>
    </div>
  );
}

/* ── left: the team list ─────────────────────────────────────────────────── */
function AgentList({ s, sel, setSel }: { s: OssState; sel: string; setSel: (id: string) => void }) {
  const on = E.AGENTS.filter((a) => !s.agentsPaused[a.id]).length;
  const waiting = pendingOf(s).length;
  return (
    <nav className="ag-col ag-list" aria-label="Agents">
      <div className="ag-list-h"><b>Agents</b><span>{on} of {E.AGENTS.length} watching</span></div>
      <button className={"ag-item" + (sel === "team" ? " on" : "")} onClick={() => setSel("team")}>
        <span className="ag-stack">{E.AGENTS.slice(0, 3).map((a) => <span key={a.id}><AgentFace shape={a.shape} state={faceState(s, a.id)} tint={a.tint} size="26" /></span>)}</span>
        <span className="tx">
          <span className="nm"><b>The team</b>{waiting > 0 && <span className="ag-badge">{waiting}</span>}</span>
          <span className="pv">Everyone's work on one timeline, and how a gap becomes an offer</span>
        </span>
      </button>
      <div className="ag-sep" />
      {E.AGENTS.map((a) => {
        const r = runsOf(s, a.id).pop();
        const n = pendingOf(s, a.id).length;
        return (
          <button key={a.id} className={"ag-item" + (sel === a.id ? " on" : "") + (s.agentsPaused[a.id] ? " off" : "")} onClick={() => setSel(a.id)}>
            <AgentFace shape={a.shape} state={faceState(s, a.id)} tint={a.tint} size="40" />
            <span className="tx">
              <span className="nm"><b>{a.name}</b>{n > 0 ? <span className="ag-badge">{n}</span> : r && <time>{when(r.at, s.clock)}</time>}</span>
              <span className="pv">{s.agentsPaused[a.id] ? "Paused. Not checking anything." : r?.findings[0] || a.job}</span>
            </span>
          </button>);
      })}
    </nav>
  );
}

/* ── centre: one agent's work log ────────────────────────────────────────── */
function AgentMain({ s, a }: { s: OssState; a: Agent }) {
  const m = META[a.id];
  const paused = !!s.agentsPaused[a.id];
  const [label, color] = statusOf(s, a.id);
  const runs = runsOf(s, a.id).slice().reverse();
  const days: { day: string; list: AgentRun[] }[] = [];
  runs.forEach((r) => { const d = sameDay(r.at, s.clock) ? "Today" : fmtDate(r.at); const g = days.find((x) => x.day === d); g ? g.list.push(r) : days.push({ day: d, list: [r] }); });
  return (
    <section className="ag-col ag-main" aria-label={a.name}>
      <header className="ag-hero">
        <AgentFace shape={a.shape} state={faceState(s, a.id)} tint={a.tint} size="72" />
        <div className="grow">
          <span className="ag-kicker" style={{ ["--c" as any]: color }}><i />{label}</span>
          <h1>{a.name}</h1>
          <p>{a.job}</p>
          <div className="oss-pills"><span className="oss-pill"><Icon d={I.clock} size={13} />{m.schedule}</span><span className="oss-pill"><Icon d={I.shield} size={13} />{a.scope}</span></div>
        </div>
        <div className="act">
          <Toggle on={!paused} onChange={(v) => run(E.setAgentPaused, a.id, !v)} label={(paused ? "Resume " : "Pause ") + a.name} />
          <Btn kind="primary" icon={I.play} disabled={paused} onClick={() => run(E.runAgent, a.id)}>Run now</Btn>
        </div>
      </header>
      {days.map((g) => (
        <div key={g.day}>
          <div className="ag-day">{g.day}</div>
          {g.list.map((r) => <RunEntry key={r.id} s={s} r={r} />)}
        </div>))}
      {!runs.length && <div className="ag-emptylog"><Icon d={I.spark} size={20} /><b>No checks logged yet</b><span>Press Run now and {a.name} reads the current records and writes up what it finds here.</span></div>}
    </section>
  );
}

function RunEntry({ s, r }: { s: OssState; r: AgentRun }) {
  const k = runKind(r);
  const props = s.proposals.filter((p) => r.proposalIds.includes(p.id));
  return (
    <article className="ag-run">
      <span className={"ag-node " + k}><Icon d={k === "decision" ? I.hand : k === "warn" ? I.alert : I.check} size={15} sw={2} /></span>
      <div className="ag-bubble">
        <div className="ag-bubble-h"><b>{TRIGGER[r.trigger]}</b><span className="oss-tiny oss-muted">{r.findings.length} finding{r.findings.length === 1 ? "" : "s"}</span><time>{fmtTime(r.at)}</time></div>
        <ul className="ag-finds">{r.findings.map((f, i) => <li key={i} className={fTone(f)}><Icon d={fTone(f) === "warn" ? I.alert : I.check} size={13} sw={2.2} />{f}</li>)}</ul>
        {r.evidence.length > 0 && <div className="ag-ev">{r.evidence.map((e, i) => <button key={i} onClick={() => navigate(e.page, e.tab, e.focus ? { kind: "event", id: e.focus } : undefined)}>{e.label}<Icon d={I.chevron} size={11} /></button>)}</div>}
        {props.map((p) => <ProposalCard key={p.id} s={s} p={p} />)}
      </div>
    </article>
  );
}

/* What approving actually does: the people it invites or the message it sends. */
function ActionPreview({ s, p }: { s: OssState; p: AgentProposal }) {
  if (p.action?.type === "invite") {
    const by: Record<string, string[]> = {};
    for (const [sh, w] of p.action.payload.invites as [string, string][]) (by[sh] = by[sh] || []).push(w);
    return <>{Object.keys(by).map((sh) => (
      <div key={sh} className="ag-target">
        <span className="lbl">Offer: {Q.shiftOf(s, sh)?.label || sh}</span>
        <div className="ag-who">{by[sh].map((w) => <span key={w} className="ag-person"><Av name={Q.nameOf(s, w)} size="sm" />{Q.nameOf(s, w)}</span>)}</div>
      </div>))}</>;
  }
  if (p.action?.type === "message") {
    const ids = p.action.payload.workerIds as string[];
    return (
      <div className="ag-target">
        <span className="lbl">Message to {ids.length} {ids.length === 1 ? "person" : "people"} in OSS Crew</span>
        <div className="ag-who">{ids.slice(0, 6).map((w) => <span key={w} className="ag-person"><Av name={Q.nameOf(s, w)} size="sm" />{Q.nameOf(s, w)}</span>)}{ids.length > 6 && <span className="ag-person more">+{ids.length - 6} more</span>}</div>
        <div className="ag-quote">{p.action.payload.body}</div>
      </div>);
  }
  return null;
}

function ProposalCard({ s, p, big }: { s: OssState; p: AgentProposal; big?: boolean }) {
  const ap = META[p.agentId]?.approver;
  const done = p.status !== "pending";
  const reasons = p.detail.split(" | ");
  return (
    <div className={"ag-prop" + (done ? " done" : "") + (big ? " big" : "")}>
      <span className="ag-prop-k">{done ? (p.status === "approved" ? "Approved" : "Dismissed") : "Decision for " + (ap ? Q.nameOf(s, ap) + " or any manager" : "a manager")}</span>
      {!big && <h3>{p.title}</h3>}
      <div className="why">{reasons.map((x, i) => <div key={i} className="ag-li"><Icon d={I.info} size={13} style={{ color: "var(--dim)" }} /><span>{x}</span></div>)}</div>
      <ActionPreview s={s} p={p} />
      <div className="act">
        {done
          ? <span className="oss-small oss-dim">{p.status === "approved" ? "Approved" : "Dismissed"} by {Q.nameOf(s, p.decidedBy!)}{p.decidedAt ? " at " + fmtTime(p.decidedAt) : ""}{p.result ? ". " + p.result : ""}</span>
          : <><Btn kind="primary" size={big ? undefined : "sm"} icon={I.check} onClick={() => run(E.decideProposal, p.id, true)}>Approve</Btn><Btn size={big ? undefined : "sm"} onClick={() => run(E.decideProposal, p.id, false)}>Dismiss</Btn>
            <span className="oss-tiny oss-muted">Runs the same checks as doing it by hand</span></>}
      </div>
    </div>
  );
}

/* ── right: what it watches, may do and never does ──────────────────────── */
function AgentSide({ s, a, setSel }: { s: OssState; a: Agent; setSel: (id: string) => void }) {
  const m = META[a.id];
  const mine = s.proposals.filter((p) => p.agentId === a.id);
  const ap = m.approver ? s.users.find((u) => u.id === m.approver) : undefined;
  return (
    <aside className="ag-col ag-side" aria-label={a.name + " guardrails"}>
      <div className="ag-sec">
        <h4>Track record</h4>
        <div className="ag-nums">
          <div><b>{runsOf(s, a.id).length}</b><span>Checks logged</span></div>
          <div><b>{mine.filter((p) => p.status === "approved").length}</b><span>Approved</span></div>
          <div><b>{mine.filter((p) => p.status === "dismissed").length}</b><span>Dismissed</span></div>
        </div>
      </div>
      <div className="ag-sec"><h4>Watches</h4><div className="oss-pills">{m.watches.map((w) => <span key={w} className="oss-pill">{w}</span>)}</div><div className="oss-small oss-dim" style={{ marginTop: 10 }}>Reads {a.inputs.toLowerCase()}.</div></div>
      <div className="ag-sec"><h4>It can</h4>{m.can.map((x) => <div key={x} className="ag-li"><Icon d={I.check} size={13} sw={2.2} style={{ color: "var(--ok)" }} /><span>{x}</span></div>)}</div>
      <div className="ag-sec"><h4>It never</h4>{m.never.map((x) => <div key={x} className="ag-li"><Icon d={I.x} size={13} sw={2.2} style={{ color: "var(--bad)" }} /><span>{x}</span></div>)}</div>
      <div className="ag-sec">
        <h4>Who signs off</h4>
        {ap ? <div className="oss-row" style={{ gap: 10 }}><Av name={ap.name} /><span><div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)" }}>{ap.name}</div><div className="oss-tiny oss-dim">{ap.role}, or any manager</div></span></div>
          : <div className="oss-small oss-dim">Nothing to sign off. It only reads and reports.</div>}
      </div>
      {m.handsTo.length > 0 && <div className="ag-sec"><h4>Passes work to</h4><div className="oss-stack" style={{ gap: 6 }}>{m.handsTo.map((id) => { const b = agentOf(id); return (
        <button key={id} className="ag-mini" onClick={() => setSel(id)}><AgentFace shape={b.shape} state={faceState(s, id)} tint={b.tint} size="26" /><span>{b.name}</span><Icon d={I.chevron} size={12} /></button>); })}</div></div>}
    </aside>
  );
}

/* ── the team: timeline and how work moves ───────────────────────────────── */
const HOUR = 3600000;
function TeamMain({ s, setSel }: { s: OssState; setSel: (id: string) => void }) {
  const now = ms(s.clock);
  const end = Math.ceil((now + 3 * HOUR) / HOUR) * HOUR;
  const start = end - 36 * HOUR;
  const x = (t: number) => ((t - start) / (end - start)) * 100;
  const ticks: number[] = [];
  for (let t = Math.ceil(start / (6 * HOUR)) * 6 * HOUR; t <= end; t += 6 * HOUR) ticks.push(t);
  const iso = (t: number) => new Date(t).toISOString();
  const inWin = s.agentRuns.filter((r) => ms(r.at) >= start && ms(r.at) <= end);
  const decided = s.proposals.filter((p) => p.status !== "pending").length;
  const quiet = (id: string): number[] => {
    if (s.agentsPaused[id]) return [];
    const m = META[id]; const out: number[] = [];
    for (let t = Math.ceil(start / HOUR) * HOUR; t <= now; t += HOUR) {
      const h = hourOf(iso(t));
      if (((h - m.offset) % m.every + m.every) % m.every !== 0) continue;
      if (m.from !== undefined && (h < m.from || h > (m.to ?? 23))) continue;
      if (runsOf(s, id).some((r) => Math.abs(ms(r.at) - t) < 50 * 60000)) continue;
      out.push(t);
    }
    return out;
  };
  return (
    <section className="ag-col ag-main" aria-label="The agent team">
      <header className="ag-hero team">
        <span className="ag-stack big">{E.AGENTS.map((a) => <span key={a.id}><AgentFace shape={a.shape} state={faceState(s, a.id)} tint={a.tint} size="40" /></span>)}</span>
        <div className="grow">
          <span className="ag-kicker" style={{ ["--c" as any]: "var(--ok)" }}><i />{E.AGENTS.filter((a) => !s.agentsPaused[a.id]).length} of {E.AGENTS.length} watching</span>
          <h1>The agent team</h1>
          <p>Seven helpers read the same bookings, replies, clocks and documents as every desk, across {s.events.filter((e) => !e.historical).length} bookings and {s.workers.length.toLocaleString("en-IE")} crew. They find the problem, line up the fix and hand the decision to the right person. In the last 36 hours: {inWin.length} checks with something to report, {decided} decision{decided === 1 ? "" : "s"} made by people, {pendingOf(s).length} waiting on you.</p>
        </div>
      </header>

      <div className="oss-card ag-tl">
        <div className="oss-card-h"><span className="ico"><Icon d={I.wave} size={16} /></span><div className="ttl"><h2>Last 36 hours</h2><span className="meta">Every check each agent made. Click one to open its log.</span></div></div>
        <div className="ag-lanes">
          {E.AGENTS.map((a) => (
            <div key={a.id} className="ag-lane">
              <button className="who" onClick={() => setSel(a.id)}><AgentFace shape={a.shape} state={faceState(s, a.id)} tint={a.tint} size="24" /><span>{a.name}</span></button>
              <div className="ag-track">
                {ticks.map((t) => <i key={t} className="ag-gl" style={{ left: x(t) + "%" }} />)}
                {quiet(a.id).map((t) => <i key={t} className="ag-tick" style={{ left: x(t) + "%" }} />)}
                {runsOf(s, a.id).filter((r) => ms(r.at) >= start && ms(r.at) <= end).map((r) => (
                  <button key={r.id} className={"ag-dot " + runKind(r)} style={{ left: x(ms(r.at)) + "%" }} title={a.name + ", " + fmtDate(r.at) + " " + fmtTime(r.at) + ": " + r.findings[0]} aria-label={a.name + " check at " + fmtTime(r.at)} onClick={() => setSel(a.id)} />))}
                <i className="ag-nowline" style={{ left: x(now) + "%" }} />
              </div>
            </div>))}
          <div className="ag-lane axis">
            <span />
            <div className="ag-track">
              {ticks.filter((t) => Math.abs(t - now) > 3 * HOUR).map((t) => <span key={t} className="ag-at" style={{ left: x(t) + "%" }}>{hourOf(iso(t)) === 0 ? fmtDate(iso(t)).split(" ")[0] : fmtTime(iso(t))}</span>)}
              <span className="ag-at now" style={{ left: x(now) + "%" }}>Now</span>
            </div>
          </div>
          <div className="oss-legend ag-legend"><span><i className="ag-k q" />Quiet check</span><span><i className="ag-k ok" />All clear</span><span><i className="ag-k warn" />Found something</span><span><i className="ag-k dec" />Brought a decision</span></div>
        </div>
      </div>

      <div className="oss-rule"><span>How work moves</span></div>
      <div className="oss-stack">
        <Flow s={s} title="Filling a gap" steps={[["a", "watchdog", "Spots the gap or the cancellation"], ["a", "staffing", "Shortlists eligible crew, preferred first"], ["p", "U03", "Coordinator approves the offers"], ["sys", "OSS Crew", "Offers land on crew phones"]]} setSel={setSel} />
        <Flow s={s} title="Keeping crew compliant" steps={[["a", "eligibility", "Checks documents against the shift date"], ["a", "comms", "Drafts the renewal reminder"], ["p", "U06", "Compliance approves"], ["sys", "OSS Crew", "Crew upload the renewal"]]} setSel={setSel} />
        <Flow s={s} title="Getting hours paid" steps={[["a", "timesheet", "Drafts lines, finds missing clocks"], ["p", "U07", "Hours approved and signed off"], ["a", "handover", "Watches the send, retries safely"], ["sys", "Bullhorn", "Approved hours in payroll"]]} setSel={setSel} />
      </div>
    </section>
  );
}

function Flow({ s, title, steps, setSel }: { s: OssState; title: string; steps: [string, string, string][]; setSel: (id: string) => void }) {
  return (
    <div className="ag-flowcard">
      <b className="ag-flow-t">{title}</b>
      <div className="ag-flow">
        {steps.map(([k, id, what], i) => {
          const body = k === "a"
            ? <><AgentFace shape={agentOf(id).shape} state={faceState(s, id)} tint={agentOf(id).tint} size="30" /><b>{agentOf(id).name}</b></>
            : k === "p" ? <><Av name={Q.nameOf(s, id)} /><b>{Q.nameOf(s, id)}</b></>
            : <><span className="ag-sys"><Icon d={id === "Bullhorn" ? I.upload : I.phone} size={15} /></span><b>{id}</b></>;
          return (
            <div key={i} className="ag-flow-i">
              {k === "a" ? <button className="ag-step" onClick={() => setSel(id)}>{body}<span>{what}</span></button>
                : <div className={"ag-step" + (k === "p" ? " person" : " sys")}>{body}<span>{what}</span></div>}
              {i < steps.length - 1 && <span className="ag-arrow" aria-hidden="true"><Icon d="M5 12h14 M13 6l6 6-6 6" size={14} /></span>}
            </div>);
        })}
      </div>
    </div>
  );
}

function TeamSide({ s }: { s: OssState }) {
  const list = pendingOf(s);
  return (
    <aside className="ag-col ag-side" aria-label="Waiting on you">
      <div className="ag-sec">
        <h4>Waiting on you</h4>
        {list.map((p) => { const a = agentOf(p.agentId); return (
          <div key={p.id} className="ag-wait">
            <div className="oss-row" style={{ gap: 8, alignItems: "flex-start" }}><AgentFace shape={a.shape} state="waiting" tint={a.tint} size="26" /><span className="grow"><span className="oss-tiny oss-muted">{a.name} · {when(p.at, s.clock)}</span><b>{p.title}</b></span></div>
            <div className="oss-row" style={{ gap: 6, marginTop: 10 }}><Btn size="sm" kind="primary" onClick={() => run(E.decideProposal, p.id, true)}>Approve</Btn><Btn size="sm" onClick={() => run(E.decideProposal, p.id, false)}>Dismiss</Btn><Btn size="sm" kind="ghost" onClick={() => navigate("Agents", "proposals")}>Details</Btn></div>
          </div>); })}
        {!list.length && <div className="oss-small oss-dim">Nothing waiting. New decisions appear here as the records change.</div>}
      </div>
      <div className="ag-sec">
        <h4>Rules every agent follows</h4>
        {["Reads the same records as the office, nothing more", "Proposes. A person approves anything that changes a roster, a document or someone's hours", "Approving runs the same checks as doing it by hand", "Every check and decision is written to Activity", "Any agent can be paused in one click"].map((x) => <div key={x} className="ag-li"><Icon d={I.shield} size={13} style={{ color: "var(--accent)" }} /><span>{x}</span></div>)}
      </div>
    </aside>
  );
}

/* ── proposals: an approval inbox ───────────────────────────────────────── */
function Inbox({ s, pid, setPid }: { s: OssState; pid: string | null; setPid: (id: string | null) => void }) {
  const [f, setF] = useState<"pending" | "approved" | "dismissed">("pending");
  const list = s.proposals.filter((p) => p.status === f).slice().reverse();
  const n = (k: string) => s.proposals.filter((p) => p.status === k).length;
  const cur = s.proposals.find((p) => p.id === pid && p.status === f) || list[0];
  const src = cur ? s.agentRuns.find((r) => r.proposalIds.includes(cur.id)) : undefined;
  const a = cur ? agentOf(cur.agentId) : undefined;
  return (
    <>
      <div className="ag-inbox">
        <nav className="ag-col ag-list" aria-label="Proposals">
          <div className="ag-list-h"><b>Proposals</b><span>{n("pending")} waiting</span></div>
          <div style={{ padding: "0 6px 12px" }}><Seg value={f} onChange={setF} label="Filter proposals" options={[{ id: "pending", label: "Waiting", n: n("pending") }, { id: "approved", label: "Approved", n: n("approved") }, { id: "dismissed", label: "Dismissed", n: n("dismissed") }]} /></div>
          {list.map((p) => { const b = agentOf(p.agentId); return (
            <button key={p.id} className={"ag-item" + (cur?.id === p.id ? " on" : "")} onClick={() => setPid(p.id)}>
              <AgentFace shape={b.shape} state={p.status === "pending" ? "waiting" : "complete"} tint={b.tint} size="34" />
              <span className="tx"><span className="nm"><b>{b.name}</b><time>{when(p.at, s.clock)}</time></span><span className="pv" style={{ color: "var(--ink)" }}>{p.title}</span></span>
            </button>); })}
          {!list.length && <div className="oss-empty"><b>{f === "pending" ? "Nothing waiting" : "None yet"}</b>{f === "pending" ? "Run an agent and its proposals land here." : ""}</div>}
        </nav>
        <section className="ag-col ag-main" aria-label="Proposal">
          {cur && a ? <>
            <header className="ag-hero">
              <AgentFace shape={a.shape} state={cur.status === "pending" ? "waiting" : "complete"} tint={a.tint} size="56" />
              <div className="grow">
                <span className="ag-kicker" style={{ ["--c" as any]: cur.status === "pending" ? "var(--accent)" : "var(--neutral)" }}><i />{a.name} · {fmtDate(cur.at)}, {fmtTime(cur.at)}</span>
                <h1 style={{ fontSize: 26 }}>{cur.title}</h1>
              </div>
            </header>
            <ProposalCard s={s} p={cur} big />
            {src && <>
              <div className="oss-rule"><span>What it found first</span></div>
              <RunEntry s={s} r={{ ...src, proposalIds: [] }} />
            </>}
          </> : <div className="ag-emptylog"><Icon d={I.check} size={20} /><b>All decided</b><span>When an agent needs a person, the proposal opens here with the reason and exactly who it affects.</span></div>}
        </section>
      </div>
    </>
  );
}
