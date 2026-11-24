/* Settings: the rules every number is calculated from, integrations (each
   clearly simulated), team and access, and the audit log. */

import { useMemo, useState } from "react";
import type { DocType, Perm, Rules } from "../model";
import { DOC_LABEL, QUAL_TYPES, ROLES } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { go } from "../router";
import { office, useOps } from "../store";
import { dayKey, fmtDay, fmtTime, relTime } from "../time";
import { Btn, Check, I, Icon, Notice, Pager, Panel, Search, Sim, Status, Table, Tabs, Toggle } from "../ui/kit";
import { Page } from "./common";
import { BullhornDrawer } from "./Timesheets";

type NumKey = { [K in keyof Rules]: Rules[K] extends number ? K : never }[keyof Rules];

function RuleNum({ k, label, help, unit, scale = 1 }: { k: NumKey; label: string; help?: string; unit: string; scale?: number }) {
  const s = useOps();
  const cur = s.rules[k] / scale;
  const [v, setV] = useState(String(cur));
  const changed = Number(v) !== cur;
  return (
    <div className="row wrap" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div className="stack" style={{ gap: 1, flex: "1 1 260px" }}><span className="strong">{label}</span>{help && <span className="small dim">{help}</span>}</div>
      <div className="row">
        <input className="input sm num" type="number" value={v} onChange={(e) => setV(e.target.value)} aria-label={label} style={{ width: 96 }} />
        <span className="small dim" style={{ width: 44 }}>{unit}</span>
        <Btn size="sm" kind={changed ? "primary" : "secondary"} disabled={!changed} onClick={() => office(E.setRule, k, Math.round(Number(v) * scale))}>Save</Btn>
      </div>
    </div>
  );
}
function RuleToggle({ k, label, help }: { k: "minimumOn" | "otPastFinish" | "autoReassign"; label: string; help: string }) {
  const s = useOps();
  return (
    <div className="row wrap" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
      <div className="stack" style={{ gap: 1, flex: "1 1 260px" }}><span className="strong">{label}</span><span className="small dim">{help}</span></div>
      <Toggle on={s.rules[k]} onChange={(v) => office(E.setRule, k, v)}><span className="small">{s.rules[k] ? "On" : "Off"}</span></Toggle>
    </div>
  );
}
function Rates() {
  const s = useOps();
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(ROLES.map((r) => [r, String(s.rules.rates[r] ?? "")])));
  return <div className="stack" style={{ gap: 0 }}>{ROLES.map((r) => (
    <div key={r} className="row" style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <span>{r}</span>
      <div className="row"><span className="dim">€</span><input className="input sm num" type="number" step="0.05" style={{ width: 90 }} value={v[r]} aria-label={r + " hourly rate"} onChange={(e) => setV({ ...v, [r]: e.target.value })} />
        <Btn size="sm" disabled={Number(v[r]) === s.rules.rates[r]} onClick={() => office(E.setRate, r, Number(v[r]))}>Save</Btn></div>
    </div>))}</div>;
}
function RoleQuals() {
  const s = useOps();
  return <div className="stack" style={{ gap: 0 }}>{ROLES.map((r) => {
    const cur = s.rules.roleQuals[r] || [];
    return (
      <div key={r} className="row wrap" style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
        <span style={{ width: 170 }}>{r}</span>
        <div className="row wrap" style={{ gap: 6 }}>{QUAL_TYPES.map((t: DocType) => <button key={t} className={"chip" + (cur.includes(t) ? " on" : "")} style={{ height: 28 }} aria-pressed={cur.includes(t)}
          onClick={() => office(E.setRoleQuals, r, cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t])}>{DOC_LABEL[t]}</button>)}</div>
      </div>
    );
  })}</div>;
}
function VenueRadius() {
  const s = useOps();
  const [v, setV] = useState<Record<string, string>>(Object.fromEntries(s.venues.map((x) => [x.id, String(x.radiusM)])));
  return <div className="stack" style={{ gap: 0 }}>{s.venues.map((x) => (
    <div key={x.id} className="row wrap" style={{ justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
      <div className="stack" style={{ gap: 0 }}><span>{x.name}</span><span className="tiny dim">{x.meeting}</span></div>
      <div className="row"><input className="input sm num" type="number" style={{ width: 90 }} value={v[x.id] ?? String(x.radiusM)} aria-label={x.name + " radius"} onChange={(e) => setV({ ...v, [x.id]: e.target.value })} /><span className="small dim">m</span>
        <Btn size="sm" disabled={Number(v[x.id]) === x.radiusM} onClick={() => office(E.setVenue, x.id, { radiusM: Number(v[x.id]) })}>Save</Btn></div>
    </div>))}</div>;
}

const PERMS: [Perm, string][] = [["allocate", "Events and offers"], ["message", "Messages"], ["approve_hours", "Approve hours"], ["payroll", "Payroll export"], ["view_docs", "Open documents"], ["verify_docs", "Verify documents"], ["supervise", "Supervise"], ["manage", "Admin"]];

function Audit() {
  const s = useOps();
  const [q, setQ] = useState("");
  const [sim, setSim] = useState(false);
  const [page, setPage] = useState(0);
  const rows = useMemo(() => s.audit.slice().reverse().filter((a) => (!sim || a.sim) && (!q || (a.summary + a.actor + a.action).toLowerCase().includes(q.toLowerCase()))), [s, q, sim]);
  return (
    <Panel title="Audit log" meta="Every change, who made it and when. Simulated steps are marked." flush>
      <div className="toolbar" style={{ padding: "12px 16px 0" }}><Search value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Search the log" /><Check checked={sim} onChange={setSim}>Simulated only</Check></div>
      <Table label="Audit log" rows={rows.slice(page * 50, page * 50 + 50)} rowKey={(a) => a.id} cols={[
        { key: "t", label: "When", render: (a) => <span className="nowrap num small">{fmtDay(dayKey(a.at))} {fmtTime(a.at)}</span> },
        { key: "w", label: "Who", render: (a) => <span className="strong">{a.actor}</span> },
        { key: "s", label: "What happened", render: (a) => <span className="small">{a.summary}{a.sim && <> <Sim /></>}</span> }]} />
      <Pager page={page} size={50} total={rows.length} onPage={setPage} />
    </Panel>
  );
}

export default function Settings({ tab: t }: { tab?: string }) {
  const s = useOps();
  const [bh, setBh] = useState(false);
  const tab = ["rules", "integrations", "team", "audit"].includes(t || "") ? t! : "rules";
  const waCount = s.messages.filter((m) => m.channels.includes("whatsapp")).length;
  const lastSync = s.syncs[s.syncs.length - 1];
  const lastExport = s.exports[s.exports.length - 1];
  return (
    <Page title="Settings" sub="Rules, connections to other systems, team access and the audit log." narrow>
      <div style={{ marginBottom: 16 }}><Tabs label="Settings" value={tab} onChange={(v) => go("/settings/" + v)} items={[{ id: "rules", label: "Rules" }, { id: "integrations", label: "Integrations" }, { id: "team", label: "Team and access" }, { id: "audit", label: "Audit log" }]} /></div>
      {tab === "rules" && (
        <div className="stack g16">
          <Notice tone="info">These are demo defaults from the calls with Shane and Daniele. Pay, overtime and break rules are to be validated with OSS before go-live.</Notice>
          <Panel title="Attendance">
            <RuleNum k="radiusM" label="Default clock-in radius" help="New locations start with this. Each location can have its own below." unit="m" />
            <RuleNum k="clockOpenMin" label="Clock-in opens before the start" unit="min" />
            <RuleNum k="missedOutMin" label="Flag a missing clock-out after the finish" unit="min" />
            <RuleNum k="travelBufferMin" label="Travel time between different venues" help="A worker can't be booked closer than this between two venues without an override." unit="min" />
          </Panel>
          <Panel title="Clock-in radius by location"><VenueRadius /></Panel>
          <Panel title="Pay">
            <RuleToggle k="minimumOn" label="Minimum paid hours" help="Shown as a separate top-up; actual hours worked are kept as recorded." />
            <RuleNum k="minimumMin" label="Minimum paid per shift" unit="hours" scale={60} />
            <RuleNum k="breakAfterMin" label="Unpaid break applies on shifts longer than" unit="hours" scale={60} />
            <RuleNum k="breakMin" label="Unpaid break length" unit="min" />
            <RuleToggle k="otPastFinish" label="Flag finishes past the scheduled end" help="Flags for review only. No overtime rate is applied automatically." />
            <RuleNum k="otDailyMin" label="Flag days longer than (0 = off)" unit="hours" scale={60} />
          </Panel>
          <Panel title="Hourly rates (sample)"><Rates /></Panel>
          <Panel title="Reminders and replacements">
            <RuleNum k="reconfirmH" label="Ask crew to reconfirm" help="Before the shift starts." unit="hours" />
            <RuleNum k="travelH" label="Ask for travelling status" help="Before the shift starts." unit="hours" />
            <RuleNum k="noReplyMin" label="Flag non-responders as potentially unavailable" help="Before the shift starts. A replacement is recommended from standby first." unit="min" />
            <RuleToggle k="autoReassign" label="Automatic reassignment" help="When on, the recommended standby worker is confirmed (or offered the shift) without waiting for the office. The worker replaced is stood down in the same step." />
            <RuleNum k="offerExpiryH" label="Job offers stay open for" unit="hours" />
          </Panel>
          <Panel title="Working hours">
            <RuleNum k="stamp2WeekMin" label="Stamp 2 limit in term time" unit="hours" scale={60} />
            <RuleNum k="stamp2HolidayMin" label="Stamp 2 limit in holiday months" help="June to September and 15 December to 15 January." unit="hours" scale={60} />
            <RuleNum k="weekWarnMin" label="Warn for everyone else over" help="A warning only; it doesn't block bookings." unit="hours" scale={60} />
          </Panel>
          <Panel title="Documents" id="documents">
            <RuleNum k="expiryWarnDays" label="Treat documents as expiring" help="Days before the expiry date." unit="days" />
            <div className="small dim" style={{ padding: "10px 0" }}>Workers get reminders {s.rules.expiryReminders.join(", ")} days before a document expires.</div>
            <h3 style={{ margin: "8px 0" }}>Qualifications needed for every shift in a role</h3>
            <RoleQuals />
          </Panel>
        </div>
      )}
      {tab === "integrations" && (
        <div className="stack g16">
          <Notice tone="warn">None of these systems is connected in the demo. Every sync, file and message to them is simulated and marked as such.</Notice>
          <Panel title={<span className="row"><Icon d={I.sync} />Bullhorn<Sim /></span>} right={<Btn size="sm" kind="primary" onClick={() => setBh(true)}>Open sync</Btn>}>
            <div className="stack g8 small">
              <span>Two-way. Worker records (contact details, skills, documents status) both ways; approved hours to Bullhorn placements. Bullhorn stays the recruitment CRM.</span>
              <span className="dim">Last sync: {lastSync ? fmtDay(dayKey(lastSync.at)) + " " + fmtTime(lastSync.at) + ", " + lastSync.summary : "never"}</span>
              <span className="dim">{s.workers.filter((w) => w.bullhornState === "pending").length} worker updates waiting · {s.workers.filter((w) => w.bullhornState === "not_linked").length} workers not linked yet</span>
            </div>
          </Panel>
          <Panel title={<span className="row"><Icon d={I.file} />Sage payroll<Sim>File export</Sim></span>} right={<Btn size="sm" onClick={() => go("/timesheets")}>Open timesheets</Btn>}>
            <div className="stack g8 small">
              <span>Approved timesheets download as a CSV for Sage. Column layout is a sample to confirm with OSS payroll.</span>
              <span className="dim">Last export: {lastExport ? lastExport.id + ", " + lastExport.asgIds.length + " lines, " + relTime(lastExport.at, s.clock) : "none"}</span>
            </div>
          </Panel>
          <Panel title={<span className="row"><Icon d={I.comms} />WhatsApp Business<Sim /></span>}>
            <div className="stack g8 small">
              <span>Messages, offers and reminders show as WhatsApp messages with reply buttons; replies update the roster. {waCount} messages marked for WhatsApp in this demo.</span>
              <span className="dim">Group messaging and template approval depend on WhatsApp Business rules and are validated during implementation.</span>
            </div>
          </Panel>
          <Panel title={<span className="row"><Icon d={I.gps} />Location and QR attendance<Sim /></span>}>
            <span className="small">Location is read once, at clock-in and clock-out, and compared with the venue radius. QR codes are per shift. The phone app lets you choose the simulated distance.</span>
          </Panel>
        </div>
      )}
      {tab === "team" && (
        <Panel title="Team and access" meta="Switch who you're signed in as from the menu at the top right (demo)." flush>
          <Table label="Team" rows={s.users} rowKey={(u) => u.id} cols={[
            { key: "n", label: "Name", render: (u) => <div className="stack" style={{ gap: 0 }}><span className="strong">{u.name}</span><span className="tiny dim">{u.title}</span></div> },
            { key: "k", label: "Uses", render: (u) => (u.kind === "office" ? "Office platform" : "Supervisor app") },
            { key: "p", label: "Access", render: (u) => <div className="row wrap" style={{ gap: 4 }}>{PERMS.filter(([p]) => u.perms.includes(p)).map(([p, l]) => <span key={p} className="tag">{l}</span>)}</div> },
            { key: "m", label: "", render: (u) => (u.id === s.ui.officeId ? <Status tone="info">You</Status> : null) }]} />
        </Panel>
      )}
      {tab === "audit" && <Audit />}
      {bh && <BullhornDrawer onClose={() => setBh(false)} />}
    </Page>
  );
}

export { Q };
