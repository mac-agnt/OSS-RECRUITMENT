import type { ReactNode } from "react";
import type { OssState, Rules } from "../model";
import * as E from "../engine";
import { loadStage, resetDemo, run, setUi, useOss } from "../store";
import { tabOf } from "../modules";
import { STAGES } from "../stages";
import { Btn, Card, Page, S, St, Table } from "../ui/kit";

export default function Settings({ themes, theme, setTheme }: { themes: { id: string; name: string }[]; theme: string; setTheme: (t: string) => void }) {
  const s = useOss();
  const tab = tabOf(s, "Settings");
  if (tab === "teams") return <Teams s={s} />;
  if (tab === "systems") return <Systems />;
  if (tab === "rules") return <RulesView s={s} />;
  if (tab === "governance") return <Governance s={s} />;
  if (tab === "ai") return <AiControls s={s} />;
  if (tab === "experience") return <Experience s={s} themes={themes} theme={theme} setTheme={setTheme} />;
  return <Org />;
}

function Org() {
  return (
    <Page title="Organisation" sub="Who this workspace belongs to, and the sample-data notice shown throughout.">
      <div className="oss-grid oss-g2" style={{ alignItems: "start" }}>
        <Card title="OSS Recruitment">
          <div className="oss-kv">
            <div><div className="k">Trading name</div><div className="v">OSS / OSS Recruitment</div></div>
            <div><div className="k">Company (demo)</div><div className="v">Outsource Staffing Solutions</div></div>
            <div><div className="k">Address</div><div className="v">G3 Riverview Business Park, Nangor Road, Dublin 12</div></div>
            <div><div className="k">Established</div><div className="v">2010 (public website)</div></div>
            <div><div className="k">Public website</div><div className="v">osscompany.ie</div></div>
            <div><div className="k">Contact domain (from the call)</div><div className="v">ossrecruitment.ie</div></div>
            <div><div className="k">Time zone</div><div className="v">Europe/Dublin, 24-hour</div></div>
            <div><div className="k">Currency</div><div className="v">EUR</div></div>
          </div>
          <div className="oss-note" style={{ marginTop: 12 }}>osscompany.ie and ossrecruitment.ie are kept distinct; neither is substituted for the other.</div>
        </Card>
        <Card title="Brand">
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "6px 0 12px" }}>
            <img src="/brand/oss-logo-white.png" alt="OSS" style={{ height: 34, width: "auto" }} onError={(e) => ((e.currentTarget.style.display = "none"))} />
            <span style={{ fontWeight: 700, letterSpacing: ".04em" }}>OSS Pulse</span>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[["#064B68", "Primary deep blue"], ["#0099D8", "Bright blue"], ["#007BAE", "Supporting blue"], ["#F6881F", "Orange (sparingly)"]].map(([c, l]) => <span key={c} className="oss-pill" style={{ height: 30 }}><i style={{ width: 12, height: 12, borderRadius: 4, background: c, display: "inline-block", marginRight: 7 }} />{l} {c}</span>)}
          </div>
          <div className="oss-small oss-muted" style={{ marginTop: 10 }}>Colours observed in the public site styling, applied through Pulse tokens. Semantic green, amber and red keep their meaning.</div>
        </Card>
      </div>
      <Card title="Sample data notice" style={{ marginTop: 14 }}>
        <div className="oss-small" style={{ lineHeight: 1.7 }}>All operational data is synthetic and pinned to a reproducible scenario starting Thursday 12 November 2026, 16:00. Shane Esler is the only real person named. Every other person, contact, roster and rate is fictional. Aiken Promotions is a client named in the call; this particular booking is fictional. Nothing is sent to anyone: messages, Bullhorn transfers, GPS and QR checks, and AI outputs are simulated.</div>
      </Card>
    </Page>
  );
}

function Teams({ s }: { s: OssState }) {
  const perms: [string, string][] = [["allocate", "Invite and allocate"], ["approve_docs", "Approve documents"], ["approve_hours", "Approve hours and corrections"], ["edit_hours", "Edit draft hours"], ["handover", "Bullhorn handover"], ["supervise", "Site supervision"], ["message", "Message crew"], ["manage", "Rules and booking cancellation"]];
  return (
    <Page title="Teams & access" sub="Eight demo personas, a subset of the roughly 14-person office. Switching persona changes the presentation over the same local data; it is not real authentication or security enforcement.">
      <Card title="Permission matrix" pad={false}>
        <Table rows={s.users} rowKey={(u) => u.id} onRow={(u) => setUi({ personaId: u.id })}
          cols={[{ key: "n", label: "Persona", render: (u) => <span className="strong">{u.name}<div className="oss-tiny oss-muted">{u.role}{u.known ? " · known person" : " · fictional"}</div></span> }, { key: "t", label: "Team", render: (u) => u.team }]
            .concat(perms.map(([k, l]) => ({ key: k, label: l, render: (u: any) => (u.perms.includes(k) ? <St tone="ok">Yes</St> : <span className="oss-muted">—</span>) })) as any)} />
      </Card>
      <div className="oss-grid oss-g2" style={{ marginTop: 14 }}>
        <Card title="Teams">{s.teams.map((t) => <div key={t.id} className="oss-row oss-small" style={{ padding: "6px 0" }}><b className="grow">{t.name}</b><span className="oss-dim">{t.members.map((m) => s.users.find((u) => u.id === m)?.name).join(", ")}</span></div>)}</Card>
        <Card title="Worker-facing roles">
          <div className="oss-small" style={{ lineHeight: 1.7 }}>
            <b>Employees</b> see their own shifts, messages, documents and hours only. No colleagues' personal details or documents.<br />
            <b>Supervisors</b> see rosters for their assigned venues and shifts, and propose corrections they cannot approve.<br />
            <b>Coordinators</b> manage allocation. <b>Compliance</b> reviews evidence. <b>Authorised managers</b> approve hours.
          </div>
        </Card>
      </div>
    </Page>
  );
}

function Systems() {
  const rows: [string, ReactNode, string][] = [
    ["Bullhorn", <St tone="sim">Simulated</St>, "Retained recruitment CRM and intended destination for approved staffing and hours data. Adapter is local; account modules, entities and the approved-hours route need validation."],
    ["Bright", <St tone="neutral">Outside app scope</St>, "Retained downstream payroll. No direct connection in the first release."],
    ["Sage", <St tone="neutral">Outside app scope</St>, "Retained downstream invoicing. No direct connection in the first release."],
    ["TeamTrack", <St tone="warn">Migration to validate</St>, "Legacy event workflow. Exports, ownership and duplicates to be checked on real data."],
    ["Excel", <St tone="neutral">Report format</St>, "Imports and client reports. Exports here are CSV that opens in Excel."],
    ["WhatsApp", <St tone="neutral">No live connector</St>, "Current one-to-one process this workflow aims to reduce."]
  ];
  return (
    <Page title="Systems" sub="What connects to what. No service shows as connected unless it is.">
      <Card pad={false}><Table rows={rows} rowKey={(r) => r[0]} cols={[{ key: "n", label: "System", render: (r) => <span className="strong">{r[0]}</span> }, { key: "s", label: "Status", render: (r) => r[1] }, { key: "d", label: "Role", render: (r) => <span className="oss-small">{r[2]}</span> }]} /></Card>
    </Page>
  );
}

const RULE_META: [keyof Rules, string, string, "Confirmed from source" | "Demo assumption" | "To validate"][] = [
  ["geofenceM", "Attendance radius (m)", "Sample radius for GPS check-in", "To validate"],
  ["maxAccuracyM", "Maximum location accuracy (m)", "Worse readings go to supervisor review", "Demo assumption"],
  ["travelBufferMin", "Travel buffer between venues (min)", "Applied to overlaps across different venues", "Demo assumption"],
  ["minimumMin", "Payable minimum (min)", "Five-hour sample minimum mentioned in the call", "To validate"],
  ["breakMin", "Unpaid break (min)", "Zero in the sample calculation", "To validate"],
  ["inviteExpiryH", "Invitation expiry (hours)", "Or two hours before start, whichever is sooner", "Demo assumption"],
  ["dayBeforeH", "Reconfirmation (hours before)", "Day-before reminder", "Demo assumption"],
  ["arrivalPromptH", "Arrival prompt (hours before)", "Asks for on the way or running late", "Demo assumption"],
  ["missedClockMin", "Missed-clock alert (min after)", "After start or end", "Demo assumption"],
  ["renewalWarnDays", "Renewal warning (days)", "Expiry warnings and eligibility warnings", "Demo assumption"]
];
function RulesView({ s }: { s: OssState }) {
  return (
    <Page title="Rules" sub="Every rule is labelled: confirmed from source, demo assumption, or to validate in the workshop. Changing one recalculates every derived number.">
      <Card pad={false} title="Operating rules">
        <Table rows={RULE_META} rowKey={(r) => r[0]}
          cols={[{ key: "n", label: "Rule", render: (r) => <span className="strong">{r[1]}<div className="oss-tiny oss-muted">{r[2]}</div></span> },
            { key: "v", label: "Value", render: (r) => <input className="oss-input" type="number" min={0} style={{ width: 100, height: 32 }} value={s.rules[r[0]] as number} onChange={(e) => run(E.setRule, r[0], Number(e.target.value) || 0)} aria-label={r[1]} /> },
            { key: "s", label: "Status", render: (r) => <St tone={r[3] === "To validate" ? "warn" : r[3] === "Confirmed from source" ? "ok" : "neutral"}>{r[3]}</St> }]} />
        <div style={{ padding: "12px 14px", borderTop: "1px solid var(--border)" }} className="oss-row">
          <label className="oss-check"><input type="checkbox" checked={s.rules.minimumOn} onChange={(e) => run(E.setRule, "minimumOn", e.target.checked)} />Apply the payable minimum</label>
          <span className="oss-small oss-muted">Worked time never changes; only payable time does.</span>
        </div>
      </Card>
      <Card title="Fixed demo behaviour" style={{ marginTop: 14 }}>
        <div className="oss-small" style={{ lineHeight: 1.7 }}>First eligible acceptance claims a position; later acceptances go to standby and never overbook. Unknown availability is excluded from the eligible list. Required evidence must be approved and valid through shift end. Overlapping accepted shifts are blocked. Time past scheduled finish is flagged for review, with no overtime multiplier. No rounding. Approval roles: Events Manager or Director for hours and corrections; Compliance for documents.</div>
      </Card>
      <Decisions s={s} />
    </Page>
  );
}
function Decisions({ s }: { s: OssState }) {
  return (
    <Card title="Workshop decision register" pad={false} style={{ marginTop: 14 }}>
      <Table rows={s.decisions} rowKey={(d) => d.id}
        cols={[{ key: "t", label: "Topic", render: (d) => <span className="strong">{d.topic}</span> }, { key: "a", label: "Assumption", render: (d) => <span className="oss-small">{d.assumption}</span> },
          { key: "o", label: "Owner role", render: (d) => d.owner }, { key: "e", label: "Affects", render: (d) => <span className="oss-small oss-dim">{d.effect}</span> },
          { key: "s", label: "Status", render: (d) => <select className="oss-input" style={{ width: 190, height: 32 }} value={d.status} onChange={(e) => run(E.setDecision, d.id, e.target.value)} aria-label={"Status of " + d.topic}>{["Confirmed from source", "Demo assumption", "To validate", "To agree"].map((x) => <option key={x}>{x}</option>)}</select> }]} />
    </Card>
  );
}

function Governance({ s }: { s: OssState }) {
  const items: [string, string, string][] = [
    ["Access", "Role model above; employees see only their own records.", "To agree"],
    ["Document handling", "Synthetic placeholders only in the demo. Real evidence storage, viewers and deletion to agree.", "To agree"],
    ["Location evidence", "Point-in-time check-in readings only; no continuous tracking or trail. Retention period to agree.", "To agree"],
    ["Audit trail", "Every change records actor, time, entity and before/after. Rejections are kept.", "Demo assumption"],
    ["Export permissions", "Client reports exclude identity documents and private details.", "Demo assumption"],
    ["Retention", "Periods for documents, location and messages.", "To agree"],
    ["Operational support", "Support during peak events was raised as a concern in the call. Owner, hours and recovery process to agree; no SLA is implied.", "To agree"],
    ["Security certification", "None claimed.", "To agree"]
  ];
  return (
    <Page title="Governance" sub="Decisions about data, access and support. Nothing here is a contract term, certification or guarantee.">
      <Card pad={false}><Table rows={items} rowKey={(r) => r[0]} cols={[{ key: "a", label: "Area", render: (r) => <span className="strong">{r[0]}</span> }, { key: "b", label: "Current position", render: (r) => <span className="oss-small">{r[1]}</span> }, { key: "c", label: "Status", render: (r) => <St tone={r[2] === "To agree" ? "warn" : "neutral"}>{r[2]}</St> }]} /></Card>
      <Decisions s={s} />
    </Page>
  );
}

function AiControls({ s }: { s: OssState }) {
  return (
    <Page title="AI controls" sub="Which agents run, what they can read and where a person must approve. No model or provider calls are made in this demo.">
      <Card pad={false}><Table rows={E.AGENTS} rowKey={(a) => a.id}
        cols={[{ key: "n", label: "Agent", render: (a) => <span className="strong">{a.name}</span> }, { key: "d", label: "Reads", render: (a) => <span className="oss-small">{a.inputs}</span> },
          { key: "g", label: "Approval gate", render: (a) => <span className="oss-small">{a.scope}</span> },
          { key: "r", label: "Runs", num: true, render: (a) => s.agentRuns.filter((r) => r.agentId === a.id).length },
          { key: "p", label: "", render: (a) => <span style={{ display: "flex", gap: 6, alignItems: "center" }}><St tone={s.agentsPaused[a.id] ? "neutral" : "ok"}>{s.agentsPaused[a.id] ? "Paused" : "Enabled"}</St><Btn size="sm" kind="ghost" onClick={() => run(E.setAgentPaused, a.id, !s.agentsPaused[a.id])}>{s.agentsPaused[a.id] ? "Resume" : "Pause"}</Btn></span> }]} /></Card>
    </Page>
  );
}

function Experience({ s, themes, theme, setTheme }: { s: OssState; themes: { id: string; name: string }[]; theme: string; setTheme: (t: string) => void }) {
  return (
    <Page title="Experience" sub="Theme, accessibility and the demo scenario.">
      <div className="oss-grid oss-g2" style={{ alignItems: "start" }}>
        <Card title="Theme">
          <div className="oss-pills">{themes.map((t) => <button key={t.id} className={"oss-btn sm" + (t.id === theme ? " primary" : "")} onClick={() => setTheme(t.id)}>{t.name}</button>)}</div>
          <div className="oss-small oss-muted" style={{ marginTop: 10 }}>OSS blue is applied to the default (Harbour) and Light themes. Motion follows your system's reduced-motion setting.</div>
        </Card>
        <Card title="Demo scenario">
          <div style={{ display: "grid", gap: 8 }}>{STAGES.map((st) => <button key={st.n} className={"oss-stage" + (s.ui.stage === st.n ? " on" : "")} onClick={() => { if (!s.ui.dirty || window.confirm("Load \"" + st.name + "\"? Workshop edits since the last stage load are replaced.")) loadStage(st.n); }}><span className="n">{st.n}</span><span><b className="oss-ink">{st.name}</b><div className="oss-tiny oss-muted">{st.detail}</div></span></button>)}</div>
          <div style={{ marginTop: 12 }}><Btn kind="danger" onClick={() => { if (window.confirm("Reset the whole demo to the canonical Thursday snapshot?")) resetDemo(); }}>Reset demo</Btn></div>
          <div className="oss-small oss-muted" style={{ marginTop: 8 }}>Stored only in this browser under its own key. Reset removes every later-stage change.</div>
        </Card>
        <Card title="Notifications">
          <div className="oss-small" style={{ lineHeight: 1.7 }}>In-app only in the demo. Push, SMS and email are listed in the decision register for the workshop. <S s="Simulated" /></div>
        </Card>
      </div>
    </Page>
  );
}
