/* Today: what needs Daniele's attention this morning, then every shift on today's board. */

import { useMemo } from "react";
import * as Q from "../selectors";
import { go, Link } from "../router";
import { useOps } from "../store";
import { fmtDateLong, fmtTime, hourOf } from "../time";
import { Btn, I, Icon, Panel } from "../ui/kit";
import { plural, ShiftBoard } from "./common";

export default function Today() {
  const s = useOps();
  const t = useMemo(() => Q.todayStats(s), [s]);
  const alerts = useMemo(() => Q.alerts(s), [s]);
  const me = Q.user(s, s.ui.officeId)!;
  const h = hourOf(s.clock);
  const greet = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  const rows = useMemo(() => Q.todayShifts(s), [s]);
  const stats: { n: number; label: string; tone?: "bad" | "warn" | "ok"; to: string }[] = [
    { n: t.events.length, label: "Events today", to: "/events?view=day" },
    { n: t.required, label: "Workers required", to: "/events?view=day" },
    { n: t.confirmed, label: "Confirmed", tone: t.outstanding ? undefined : "ok", to: "/events?view=day" },
    { n: t.outstanding, label: "Outstanding positions", tone: t.outstanding ? "bad" : "ok", to: alerts.find((a) => a.area === "staffing")?.to || "/events" },
    { n: t.noReply, label: "Not responded", tone: t.noReply ? "warn" : "ok", to: alerts.find((a) => a.id.startsWith("flag-"))?.to || "/comms" },
    { n: t.exceptions, label: "Attendance exceptions", tone: t.exceptions ? "warn" : "ok", to: "/timesheets?status=attention" },
    { n: t.compliance, label: "Urgent compliance", tone: t.compliance ? "bad" : "ok", to: "/compliance?tab=attention" }
  ];
  return (
    <div className="o-page">
      <FlapClock iso={s.clock} />
      <div className="hero">
        <span className="hero-pill"><i />{t.events.length} events today · {t.outstanding} open positions</span>
        <h1>{greet} <em>{me.name}</em></h1>
        <p>{fmtDateLong(s.clock)}. {plural(t.events.length, "event")} and {plural(t.shifts.length, "shift")} today.</p>
        <div className="row wrap" style={{ justifyContent: "center" }}><Btn icon={I.comms} onClick={() => go("/comms?new=1")}>Message crew</Btn><Btn kind="primary" icon={I.plus} onClick={() => go("/events/new")}>New event</Btn></div>
      </div>
      <div className="strip" role="list" aria-label="Today at a glance">
        {stats.map((x) => (
          <button key={x.label} role="listitem" className={x.tone} onClick={() => go(x.to)}>
            <b>{x.n.toLocaleString("en-IE")}</b><span>{x.label}</span>
          </button>
        ))}
      </div>
      <div className="today-grid">
        <Panel title="Today's shifts" meta="Green: fully staffed. Amber: partly staffed. Red: unstaffed or needs attention. Grey: finished." flush
          right={<Link to="/events?view=day" className="small">Open calendar</Link>}>
          <ShiftBoard s={s} rows={rows} empty={<div className="empty"><b>No events today</b>Create one from New event.</div>} />
        </Panel>
        <Panel title="Needs attention" meta={alerts.length ? plural(alerts.length, "item") : "All clear"} flush>
          <div className="attn">
            {!alerts.length && <div className="empty"><b>Nothing needs you right now</b>New issues appear here as they happen.</div>}
            {alerts.map((a) => (
              <div key={a.id} className="attn-item">
                <span className={"ico " + a.tone}><Icon d={a.tone === "info" ? I.info : I.alert} size={15} /></span>
                <div className="grow">
                  <b>{a.title}</b>
                  <p>{a.detail}</p>
                  <div className="act"><Btn size="sm" kind={a.tone === "bad" ? "primary" : "secondary"} onClick={() => go(a.to)}>{a.action}</Btn></div>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** Split-flap style date and time, driven by the demo clock. */
function FlapClock({ iso }: { iso: string }) {
  const d = fmtDateLong(iso).toUpperCase().replace(/,/g, "").split(" ");
  const wd = (d[0] || "").slice(0, 3), day = (d[1] || "").padStart(2, "0"), mon = (d[2] || "").slice(0, 3);
  const tm = fmtTime(iso);
  const cell = (c: string, k: string, hot?: boolean) => <span key={k} className={"flap" + (hot ? " hot" : "")}>{c}</span>;
  return (
    <div className="flaps" role="img" aria-label={"Demo time " + wd + " " + day + " " + mon + " " + tm}>
      {[...wd].map((c, i) => cell(c, "w" + i))}<span className="flap-gap" />{[...day].map((c, i) => cell(c, "d" + i))}<span className="flap-gap" />{[...mon].map((c, i) => cell(c, "m" + i))}<span className="flap-gap" />
      {[...tm].map((c, i) => (c === ":" ? <span key={"c" + i} className="flap-colon">:</span> : cell(c, "t" + i, true)))}
    </div>
  );
}
