/* Settings: organisation, team and access, the operating rules (radius,
   five-hour minimum, reminder timings), integrations and appearance. */

import "../../styles/oss-biz.css";
import type { OssState, Rules } from "../model";
import * as Q from "../selectors";
import { DESKS } from "../network";
import * as E from "../engine";
import { resetDemo, run, useOss } from "../store";
import { tabOf } from "../modules";
import { Av, Btn, Card, Figure, hueVar, I, Page, Row, RIcon, St, Table, Tag, Toggle, deskVar } from "../ui/kit";

export default function Settings({ themes, theme, setTheme }: { themes: { id: string; name: string }[]; theme: string; setTheme: (t: string) => void }) {
  const s = useOss();
  const tab = tabOf(s, "Settings");
  if (tab === "team") return <Team s={s} />;
  if (tab === "rules") return <RulesView s={s} />;
  if (tab === "integrations") return <Integrations />;
  if (tab === "appearance") return <Appearance themes={themes} theme={theme} setTheme={setTheme} />;
  return <Org s={s} />;
}

function Org({ s }: { s: OssState }) {
  return (
    <Page eyebrow="Organisation" title="OSS Recruitment" sub="Outsource Staffing Services. Event staffing for sport, music, festivals and arenas, all year round.">
      <div className="oss-grid oss-g2" style={{ alignItems: "start" }}>
        <Card title="Company" icon={I.briefcase}>
          <div className="oss-kv">
            <div><div className="k">Trading as</div><div className="v">OSS Recruitment</div></div>
            <div><div className="k">Since</div><div className="v">2010</div></div>
            <div><div className="k">Head office</div><div className="v">Riverview Business Park, Dublin 12</div></div>
            <div><div className="k">Regional offices</div><div className="v">Cork, Galway, Ryder Cup programme in Limerick</div></div>
            <div><div className="k">Website</div><div className="v">osscompany.ie</div></div>
            <div><div className="k">Time zone</div><div className="v">Europe/Dublin, 24-hour</div></div>
          </div>
        </Card>
        <Card title="At a glance" icon={I.chart}>
          <div className="st-figs">
            <Figure label="Crew on the register" value={s.workers.length.toLocaleString("en-IE")} sub="Across all five regions" />
            <Figure label="Office team" value={s.users.length} sub={DESKS.length + " desks"} />
            <Figure label="Client accounts" value={s.clients.length} />
            <Figure label="Venues" value={s.venues.length} sub="With check-in set up" />
          </div>
        </Card>
        <Card title="Brand" icon={I.spark}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "4px 0 14px" }}>
            <img className="oss-logo-w" src="/brand/oss-logo-white.png" alt="OSS" style={{ height: 34, width: "auto" }} />
            <img className="oss-logo-c" src="/brand/oss-logo.png" alt="OSS" style={{ height: 34, width: "auto" }} />
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[["#064B68", "Deep blue"], ["#0099D8", "Bright blue"], ["#007BAE", "Mid blue"], ["#F6881F", "Orange, urgent only"]].map(([c, l]) => <span key={c} className="oss-pill" style={{ height: 30 }}><i style={{ width: 12, height: 12, borderRadius: 4, background: c, display: "inline-block" }} />{l}</span>)}
          </div>
        </Card>
      </div>
    </Page>
  );
}

const PERMS: [string, string][] = [["allocate", "Invite staff"], ["message", "Message crew"], ["supervise", "Run a site"], ["approve_docs", "Approve documents"], ["edit_hours", "Edit hours"], ["approve_hours", "Approve hours"], ["handover", "Send to Bullhorn"], ["manage", "Change rules"]];
function Team({ s }: { s: OssState }) {
  const week = Q.windowEvents(s);
  const deskLoad = (d: string) => { const ev = week.filter((e) => Q.deskOf(e) === d); return { events: ev.length, crew: ev.reduce((n, e) => n + Q.eventCoverage(s, e.id).confirmed, 0) }; };
  const desks = s.teams.filter((t) => (DESKS as readonly string[]).includes(t.name));
  const support = s.teams.filter((t) => !(DESKS as readonly string[]).includes(t.name));
  return (
    <Page eyebrow="Team & access" title="Who runs what" sub={s.users.length + " people across " + desks.length + " desks and the teams behind them. Staff only ever see their own shifts, messages, documents and hours in OSS Crew."}>
      <div className="st-org">
        {desks.map((t) => { const l = deskLoad(t.name); return (
          <section key={t.id} className="st-desk" style={{ ["--c" as any]: (t.name.endsWith("desk") ? deskVar(t.name) : hueVar(t.name)) }}>
            <header><Tag c={hueVar(t.name)}>{t.name}</Tag><span className="grow" /><span className="st-load"><b>{l.events}</b> events · <b>{l.crew.toLocaleString("en-IE")}</b> crew this week</span></header>
            <p>{t.note}</p>
            <div className="st-people">{t.members.map((id) => { const u = s.users.find((x) => x.id === id); return u ? <div key={id} className="st-person"><Av name={u.name} size="sm" /><span><b>{u.name}</b><span>{u.role}</span></span></div> : null; })}</div>
          </section>); })}
      </div>
      <div className="oss-rule"><span>Behind the desks</span></div>
      <div className="st-support">
        {support.map((t) => (
          <section key={t.id} className="st-desk quiet" style={{ ["--c" as any]: (t.name.endsWith("desk") ? deskVar(t.name) : hueVar(t.name)) }}>
            <header><b>{t.name}</b></header>
            <p>{t.note}</p>
            <div className="st-people">{t.members.map((id) => { const u = s.users.find((x) => x.id === id); return u ? <div key={id} className="st-person"><Av name={u.name} size="sm" /><span><b>{u.name}</b><span>{u.role}</span></span></div> : null; })}</div>
          </section>))}
      </div>
      <div className="oss-gap" />
      <Card pad={false} icon={I.users} title="Who can do what" meta={s.users.length + " people in the office web app"}>
        <Table rows={s.users} rowKey={(u) => u.id} maxHeight={560}
          cols={[{ key: "n", label: "Person", render: (u) => <span className="oss-row"><Av name={u.name} size="sm" /><span><span className="strong">{u.name}</span><div className="oss-tiny oss-muted">{u.role}</div></span></span> }]
            .concat(PERMS.map(([k, l]) => ({ key: k, label: l, render: (u: any) => (u.perms.includes(k) ? <span className="st-yes" title="Allowed" /> : <span className="oss-muted">·</span>) })) as any)} />
      </Card>
      <div className="oss-gap" />
      <div className="oss-grid oss-g3">
        <Card title="Employees" icon={I.phone}><div className="oss-small" style={{ lineHeight: 1.6, color: "var(--body)" }}>Their own offers, schedule, messages, documents and hours. Never anyone else's details.</div></Card>
        <Card title="Supervisors" icon={I.pin}><div className="oss-small" style={{ lineHeight: 1.6, color: "var(--body)" }}>The roster for their site on the day. They can propose a time correction but not approve it.</div></Card>
        <Card title="Clients" icon={I.briefcase}><div className="oss-small" style={{ lineHeight: 1.6, color: "var(--body)" }}>A read-only view of staffing and attendance for their own events, and sign-off of the hours.</div></Card>
      </div>
    </Page>
  );
}

const RULES: [keyof Rules, string, string, string, boolean][] = [
  ["geofenceM", "Check-in radius", "metres from the venue", "Clock-ins further out go to review", true],
  ["minimumMin", "Guaranteed minimum", "minutes paid", "Five hours, whatever is worked", true],
  ["dayBeforeH", "Reconfirmation reminder", "hours before", "\"Still good for tomorrow?\"", true],
  ["arrivalPromptH", "On-the-way prompt", "hours before", "Asks if they've set off or are running late", true],
  ["missedClockMin", "Missed clock alert", "minutes after start or finish", "Goes to the supervisor and coordinator", false],
  ["inviteExpiryH", "Offer expires after", "hours", "Or two hours before the shift, whichever is first", false],
  ["travelBufferMin", "Gap between venues", "minutes", "Stops back-to-back shifts across town", false],
  ["maxAccuracyM", "Location accuracy limit", "metres", "Weaker signal goes to review", false],
  ["breakMin", "Unpaid break", "minutes", "Taken off worked time", false],
  ["renewalWarnDays", "Document renewal warning", "days before expiry", "Reminder to the employee and compliance", false]
];
function RulesView({ s }: { s: OssState }) {
  return (
    <Page eyebrow="Rules" title="How the platform behaves" sub="Change a number and every count, eligibility check and timesheet recalculates straight away.">
      <div className="oss-grid oss-g75" style={{ alignItems: "start" }}>
        <Card pad={false} title="Operating rules" icon={I.sliders}>
          <div className="oss-rows" style={{ padding: "0 8px 10px" }}>
            {RULES.map(([k, label, unit, help, call]) => (
              <Row key={k} title={<>{label}{call && <span className="oss-tiny" style={{ marginLeft: 8, color: "var(--accent)", fontWeight: 500 }}>From your call</span>}</>} sub={help}
                end={<><input className="oss-input" type="number" min={0} style={{ width: 88, height: 34, textAlign: "right" }} value={s.rules[k] as number} onChange={(e) => run(E.setRule, k, Number(e.target.value) || 0)} aria-label={label} /><span className="oss-small oss-dim" style={{ width: 150, textAlign: "left" }}>{unit}</span></>} />))}
          </div>
          <div className="oss-row" style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", gap: 12 }}>
            <Toggle on={s.rules.minimumOn} onChange={(v) => run(E.setRule, "minimumOn", v)} label="Apply the guaranteed minimum" />
            <span className="oss-small"><b className="oss-ink">Apply the guaranteed minimum</b> <span className="oss-dim">· worked time never changes, only payable time</span></span>
          </div>
        </Card>
        <div className="oss-stack">
          <Card title="Allocation" icon={I.users}>
            <div className="oss-list oss-small" style={{ color: "var(--body)" }}>
              <div>Offers go to people who are available, qualified and free that day.</div>
              <div>Each shift is accepted or declined on its own.</div>
              <div>First to accept gets the place. Late acceptances go to standby, so a shift is never overbooked.</div>
              <div>Expired documents block a shift that needs them.</div>
            </div>
          </Card>
          <Card title="To agree at the workshop" icon={I.list}>
            <div className="oss-list oss-small" style={{ color: "var(--body)" }}>
              <div>Overtime rate and when it starts</div>
              <div>Breaks and rounding</div>
              <div>Push, SMS or email for which messages</div>
              <div>GPS, QR or both at each venue</div>
              <div>Who can reopen hours after Bullhorn</div>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function Integrations() {
  const rows: [string, string, "ok" | "warn" | "neutral" | "info", string, string][] = [
    ["Bullhorn", "Two-way", "info", "Candidates and clients in, approved hours out. Simulated for this demo.", "Bullhorn"],
    ["Sage", "Via Bullhorn", "neutral", "Invoicing carries on from Bullhorn as today.", "Sage"],
    ["Bright", "Via Bullhorn", "neutral", "Payroll carries on from Bullhorn as today. Payroll file export available.", "Bright"],
    ["TeamTrack", "Import", "warn", "Staff profiles, documents and event history to migrate before go-live.", "TeamTrack"],
    ["Excel", "Export", "ok", "Weekly client reports, payroll file, qualifications and audit log.", "Excel"],
    ["WhatsApp", "Replaced", "neutral", "Shift offers, updates and replies move into OSS Crew.", "WhatsApp"]
  ];
  return (
    <Page eyebrow="Integrations" title="Connected systems" sub="Bullhorn stays the CRM. OSS Pulse runs the event work and hands approved hours back, so nothing is typed in twice.">
      <Card pad={false} icon={I.link} title="Systems" meta="Where data comes from and where it goes">
        <div className="oss-rows" style={{ padding: "0 8px 10px" }}>
          {rows.map(([n, how, tone, desc]) => <Row key={n} lead={<Av name={n} />} title={n} sub={desc} wrap end={<St tone={tone}>{how}</St>} />)}
        </div>
      </Card>
    </Page>
  );
}

function Appearance({ themes, theme, setTheme }: { themes: { id: string; name: string }[]; theme: string; setTheme: (t: string) => void }) {
  return (
    <Page eyebrow="Appearance" title="Look and feel" sub="OSS blue on dark or light. Motion follows the reduced-motion setting on each device.">
      <div className="oss-grid oss-g2" style={{ alignItems: "start" }}>
        <Card title="Theme" icon={I.spark}>
          <div className="oss-pills">{themes.map((t) => <button key={t.id} className={"oss-btn sm" + (t.id === theme ? " primary" : "")} onClick={() => setTheme(t.id)}>{t.name}</button>)}</div>
        </Card>
        <Card title="Demo data" icon={I.refresh}>
          <div className="oss-small oss-dim" style={{ lineHeight: 1.55 }}>Sample data for the 3Arena story, saved in this browser only. Starting over puts everything back to the Thursday booking call.</div>
          <div style={{ marginTop: 12 }}><Btn onClick={() => resetDemo()}>Start the story over</Btn></div>
        </Card>
      </div>
    </Page>
  );
}
void RIcon;
