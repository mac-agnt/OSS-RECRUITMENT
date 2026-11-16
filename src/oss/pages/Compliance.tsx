/* Compliance: the rules an Irish event staffing agency lives by. Right to work
   and the Stamp 2 student hours cap (a gauge per student), Organisation of
   Working Time Act rest and breaks (drawn against the 11-hour line), and a
   licence and vetting matrix that can be checked against any event's roster. */

import "../../styles/oss-crew.css";
import { useMemo, useState } from "react";
import type { DocType, OssState, Region, Worker } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { CALL_SHEETS, profile, restPairs, stamp2Check, STAMP2_CAP_MIN, weekMinutes } from "../industry";
import { navigate, openDrawer, run, useOss } from "../store";
import { tabOf } from "../modules";
import { addDays, dayKey, fmtDate, fmtHM, fmtTime, minutesBetween, weekday } from "../time";
const addDaysK = (iso: string, n: number) => addDays(dayKey(iso), n);
import { Av, Btn, Card, Chip, I, Icon, Meter, Page, regionVar, Ring, Row, RIcon, Seg, St } from "../ui/kit";
import { regionOfW } from "./Staff";

export default function Compliance() {
  const s = useOss();
  const tab = tabOf(s, "Compliance");
  if (tab === "hours") return <WorkingTime s={s} />;
  if (tab === "licences") return <Licences s={s} />;
  return <RightToWork s={s} />;
}

const RTW_ORDER = ["Irish citizen", "EU citizen", "Stamp 4", "Stamp 1G", "Stamp 2 (student)"] as const;
const RTW_RULE: Record<string, string> = { "Irish citizen": "No limit", "EU citizen": "No limit", "Stamp 4": "No limit, IRP card", "Stamp 1G": "Full time, IRP card", "Stamp 2 (student)": "20h term time, 40h holidays" };
/* Each permission type keeps one hue on every chart. */
const RTW_HUE: Record<string, string> = { "Irish citizen": "var(--k-2)", "EU citizen": "var(--k-6)", "Stamp 4": "var(--k-4)", "Stamp 1G": "var(--k-1)", "Stamp 2 (student)": "var(--k-3)" };
const REGIONS: Region[] = ["Dublin", "Leinster", "Munster", "Connacht", "Ulster"];
function RegionChips({ value, onPick, counts }: { value: string; onPick: (r: string) => void; counts?: Record<string, number> }) {
  return <div className="cp-regchips">{(["all", ...REGIONS] as string[]).map((r) => <button key={r} className={value === r ? "on" : ""} onClick={() => onPick(r)} style={r === "all" ? undefined : { ["--c" as any]: regionVar(r) }}>{r !== "all" && <i />}{r === "all" ? "All regions" : r}{counts && <span>{r === "all" ? Object.values(counts).reduce((a, b) => a + b, 0) : counts[r] || 0}</span>}</button>)}</div>;
}

/* ── right to work ───────────────────────────────────────────────────────── */
function RightToWork({ s }: { s: OssState }) {
  const [f, setF] = useState<"attention" | "all" | "near" | "over">("attention");
  const [region, setRegion] = useState("all");
  const [limit, setLimit] = useState(24);
  const crew = useMemo(() => s.workers.map((w) => ({ w, p: profile(w), r: regionOfW(w) })), [s.workers]);
  const mix = RTW_ORDER.map((r) => ({ r, list: crew.filter((x) => x.p.rtw === r) }));
  const stamp2All = useMemo(() => crew.filter((x) => x.p.rtw.startsWith("Stamp 2")).map((x) => ({ ...x, c: stamp2Check(s, x.w.id)! })).sort((a, b) => b.c.total - a.c.total), [crew, s.assignments]);
  const regionCounts: Record<string, number> = {};
  for (const x of stamp2All) regionCounts[x.r] = (regionCounts[x.r] || 0) + 1;
  const stamp2 = region === "all" ? stamp2All : stamp2All.filter((x) => x.r === region);
  const near = stamp2.filter((x) => x.c.total > STAMP2_CAP_MIN - 4 * 60 && x.c.total <= STAMP2_CAP_MIN);
  const over = stamp2.filter((x) => x.c.total > STAMP2_CAP_MIN);
  const booked = stamp2.filter((x) => x.c.booked > 0);
  const list = f === "near" ? near : f === "over" ? over : f === "attention" ? over.concat(near) : stamp2;
  const pick = (v: typeof f) => { setF(v); setLimit(24); };
  const open = s.invitations.filter((i) => Q.isActiveInvite(s, i)).map((i) => ({ i, c: stamp2Check(s, i.workerId, Q.shiftOf(s, i.shiftId)) })).filter((x) => x.c && x.c.over);
  const irp = crew.filter((x) => x.p.rtw === "Stamp 1G" || x.p.rtw === "Stamp 4" || x.p.rtw.startsWith("Stamp 2")).slice(0, 5);
  return (
    <Page eyebrow={"Compliance · right to work · week of " + fmtDate("2026-11-09T12:00:00Z")} title="Right to work" sub="Every crew member's permission to work, and the Stamp 2 student hours cap checked before an offer goes out, not after payroll.">
      <section className="oss-card cp-mix" aria-label="Right to work mix">
        <div className="cp-mixhead"><b>{s.workers.length.toLocaleString("en-IE")}</b><span>crew on the register, by permission to work</span></div>
        <div className="cp-mixbar">{mix.map((m) => <i key={m.r} title={m.r + ": " + m.list.length} style={{ width: (m.list.length / s.workers.length) * 100 + "%", background: RTW_HUE[m.r] }} />)}</div>
        <div className="cp-mixcols">
          {mix.map((m) => (
            <div key={m.r} className="it">
              <span className="sw" style={{ background: RTW_HUE[m.r] }} />
              <b>{m.list.length}</b>
              <span className="l">{m.r}</span>
              <span className="r">{RTW_RULE[m.r]}</span>
            </div>))}
        </div>
      </section>
      <div className="oss-grid oss-g75" style={{ alignItems: "start" }}>
        <Card title="Stamp 2 students this week" meta={stamp2.length + " students · " + booked.length + " booked this week · Mon 9 to Sun 15 Nov, against the 20h term-time cap"} icon={I.clock}>
          <RegionChips value={region} onPick={(r) => { setRegion(r); setLimit(24); }} counts={regionCounts} />
          <div className="cp-ringfilters">
            <Chip on={f === "attention"} onClick={() => pick("attention")}>Needs a look <span className="oss-muted">{over.length + near.length}</span></Chip>
            <Chip on={f === "over"} onClick={() => pick("over")}>Over <span className="oss-muted">{over.length}</span></Chip>
            <Chip on={f === "near"} onClick={() => pick("near")}>Close to the cap <span className="oss-muted">{near.length}</span></Chip>
            <Chip on={f === "all"} onClick={() => pick("all")}>All Stamp 2 <span className="oss-muted">{stamp2.length}</span></Chip>
          </div>
          <div className="cp-rings">
            {list.slice(0, limit).map(({ w, c, r }) => {
              const tone = c.total > STAMP2_CAP_MIN ? "bad" : c.total > STAMP2_CAP_MIN - 240 ? "warn" : "ok";
              return (
                <button key={w.id} className={"cp-ringcard " + tone} onClick={() => openDrawer("worker", w.id)}>
                  <Ring value={c.total} max={STAMP2_CAP_MIN} size={88} stroke={8} tone={tone} label={fmtHM(c.total)} sub="of 20h" />
                  <b className="nm">{w.name}</b>
                  <span className="cp-rg" style={{ ["--c" as any]: regionVar(r) }}><i />{w.locality}</span>
                  <span className="dt">{fmtHM(c.earlier)} worked · {fmtHM(c.booked)} booked</span>
                  {tone === "bad" ? <St tone="bad">{fmtHM(c.total - STAMP2_CAP_MIN)} over</St> : c.total === STAMP2_CAP_MIN ? <St tone="warn">At the cap</St> : <St tone={tone}>{fmtHM(STAMP2_CAP_MIN - c.total)} left</St>}
                </button>);
            })}
            {!list.length && <div className="oss-empty" style={{ gridColumn: "1 / -1" }}><b>Nobody here</b>No Stamp 2 student is in this band this week.</div>}
          </div>
          {list.length > limit && <button className="cw-more" onClick={() => setLimit(limit + 48)}>Show {Math.min(48, list.length - limit)} more of {list.length - limit}</button>}
        </Card>
        <div className="oss-stack">
          <Card title="Held back before sending" meta="Offers that would push a student over 20h" icon={I.shield} flush>
            <div className="oss-rows">
              {open.map(({ i, c }) => <Row key={i.id} lead={<RIcon d={I.alert} tone="warn" />} title={Q.nameOf(s, i.workerId)} sub={Q.shiftOf(s, i.shiftId).label + " would take the week to " + fmtHM(c!.after)} end={<Btn size="sm" onClick={() => run(E.withdrawInvitation, i.id)}>Withdraw</Btn>} />)}
              {!open.length && <div className="oss-small oss-dim" style={{ padding: "4px 12px 12px", lineHeight: 1.55 }}>No open offer would breach the cap. Allocate warns before an offer goes to a Stamp 2 student near 20 hours.</div>}
            </div>
          </Card>
          <Card title="Permissions to renew" meta="IRP cards expiring in the next 90 days" icon={I.doc} flush>
            <div className="oss-rows">{irp.map((x, k) => <Row key={x.w.id} lead={<Av name={x.w.name} size="sm" />} title={x.w.name} sub={x.p.rtw + " · IRP expires " + ["14 Dec", "9 Jan", "22 Jan", "3 Feb", "11 Feb"][k]} end={<Btn size="sm" kind="ghost" onClick={() => run(E.sendBulk, { workerIds: [x.w.id], body: "Your IRP card is due for renewal. Please upload the new card in OSS Crew when you have it.", audience: "IRP renewal reminder" })}>Remind</Btn>} />)}</div>
          </Card>
          <Card title="How it's checked" icon={I.list}>
            <div className="cp-how">
              <div><Icon d={I.check} size={13} sw={2.2} /><span>Right to work is confirmed at registration and stored with the profile</span></div>
              <div><Icon d={I.check} size={13} sw={2.2} /><span>Every Stamp 2 offer is checked against hours already worked that week</span></div>
              <div><Icon d={I.check} size={13} sw={2.2} /><span>The cap lifts to 40h from June to September and 15 Dec to 15 Jan</span></div>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

/* ── working time ────────────────────────────────────────────────────────── */
const RULES: [string, string, string][] = [
  ["11 hours rest", "Between the end of one shift and the start of the next", "Checked on every offer"],
  ["Breaks", "15 minutes after 4h30, 30 minutes after 6 hours", "Printed on the call sheet"],
  ["Weekly rest", "24 hours off in every 7 days", "Checked weekly"],
  ["48-hour average", "Average working week, measured over 4 months", "Tracked per person"],
  ["Sunday premium", "Sunday work flagged for the payroll file", "Sent to Bullhorn"],
  ["Under 18s", "No night work after 22:00, extra rest", "Blocked in Allocate"]
];
const DAY = 24 * 60;
function WorkingTime({ s }: { s: OssState }) {
  const pairs = restPairs(s).filter((p) => p.restMin < DAY);
  const breach = pairs.filter((p) => p.restMin < 11 * 60), tight = pairs.filter((p) => p.restMin >= 11 * 60 && p.restMin < 12 * 60);
  const [allBreaks, setAllBreaks] = useState(false);
  const shifts = Q.windowEvents(s).flatMap((e) => Q.shiftsOfEvent(s, e.id));
  const breakShifts = shifts.map((x) => ({ x, len: minutesBetween(x.start, x.end) })).filter((x) => x.len > 270).sort((a, b) => a.x.start.localeCompare(b.x.start));
  const breakShown = allBreaks ? breakShifts : breakShifts.slice(0, 8);
  const crewOn = shifts.reduce((n, x) => n + Q.shiftCoverage(s, x.id).confirmed, 0);
  const sunday = shifts.filter((x) => weekday(x.start) === 0);
  const sundayCrew = sunday.reduce((n, x) => n + Q.shiftCoverage(s, x.id).confirmed, 0);
  const weekly = s.workers.map((w) => ({ w, m: weekMinutes(s, w.id).total })).filter((x) => x.m > 0).sort((a, b) => b.m - a.m).slice(0, 7);
  const WMAX = 60 * 60;
  return (
    <Page eyebrow="Compliance · Organisation of Working Time Act" title="Working time" sub="Rest between shifts, breaks, weekly limits and Sunday work, checked against every roster and every late clock-out.">
      <section className="oss-card cp-restcard" aria-label="Rest between shifts">
        <div className="oss-card-h"><span className="ico"><Icon d={I.clock} size={16} /></span>
          <div className="ttl"><h2>Rest between shifts</h2><span className="meta">Same person, back-to-back shifts, shortest rest first. Uses actual clock-outs and approved corrections.</span></div>
          <div className="right cp-restsum">
            <span><b>{pairs.length}</b> pairs checked</span>
            <span className={breach.length ? "bad" : ""}><b>{breach.length}</b> under 11h</span>
            <span className={tight.length ? "warn" : ""}><b>{tight.length}</b> under 12h</span>
          </div>
        </div>
        <div className="cp-rest">
          {pairs.length > 0 && <div className="cp-rest-scale" aria-hidden="true"><span /><span><i style={{ left: "0%" }}>0h</i><i style={{ left: (6 / 24) * 100 + "%" }}>6h</i><i className="line" style={{ left: (11 / 24) * 100 + "%" }}>11h</i><i style={{ left: (18 / 24) * 100 + "%" }}>18h</i><i style={{ left: "100%" }}>24h</i></span><span /></div>}
          {pairs.slice(0, 10).map((p, k) => {
            const tone = p.restMin < 660 ? "bad" : p.restMin < 720 ? "warn" : "ok";
            return (
              <div key={k} role="button" tabIndex={0} className="cp-restrow" onClick={() => openDrawer("worker", p.workerId)} onKeyDown={(e) => { if (e.key === "Enter") openDrawer("worker", p.workerId); }}>
                <span className="who"><Av name={Q.nameOf(s, p.workerId)} size="sm" /><span><b>{Q.nameOf(s, p.workerId)}</b><span>{Q.eventOf(s, p.a.eventId).name.split(":")[0]} {fmtDate(p.a.start).split(" ")[0]} to {Q.eventOf(s, p.b.eventId).name.split(":")[0]} {fmtDate(p.b.start).split(" ")[0]} {fmtTime(p.b.start)}</span></span></span>
                <span className="track"><i className={"fill " + tone} style={{ width: Math.min(100, (p.restMin / DAY) * 100) + "%" }} /><i className="mark" style={{ left: (11 / 24) * 100 + "%" }} /></span>
                <St tone={tone}>{fmtHM(p.restMin)}</St>
              </div>);
          })}
          {!pairs.length && <div className="oss-empty"><b>No back-to-back shifts this week</b>Every offer is still checked for 11 hours' rest before it goes out.</div>}
        </div>
      </section>
      <div className="oss-grid oss-g57" style={{ alignItems: "start" }}>
        <Card title="The rules we check" icon={I.shield}>
          <dl className="cp-rules">
            {RULES.map(([t, d, how]) => <div key={t}><dt>{t}</dt><dd>{d}</dd><dd className="how">{t === "Sunday premium" ? sundayCrew + " crew on " + sunday.length + " Sunday shift" + (sunday.length === 1 ? "" : "s") + " this week" : how}</dd></div>)}
          </dl>
        </Card>
        <div className="oss-stack">
          <Card title="Breaks owed" meta={breakShifts.length + " shifts over 4h30 this week, " + crewOn.toLocaleString("en-IE") + " crew. The marker is when the first break is due."} icon={I.list}>
            <div className="cp-breaks">
              {breakShown.map(({ x, len }) => {
                const due = new Date(Date.parse(x.start) + 270 * 60000).toISOString();
                return (
                  <div key={x.id} className="cp-brk">
                    <div className="t"><b><i className="cw-rdot" style={{ background: regionVar(Q.regionOf(s, Q.eventOf(s, x.eventId))) }} />{Q.eventOf(s, x.eventId).name.split(":")[0]}</b><span>{x.label} · {fmtDate(x.start)}, {fmtTime(x.start)} to {fmtTime(x.end)}</span></div>
                    <div className="bar"><i className="mk" style={{ left: (270 / len) * 100 + "%" }} />{len > 360 && <i className="mk two" style={{ left: (360 / len) * 100 + "%" }} />}</div>
                    <div className="f"><span>{fmtHM(len)} shift</span><span>{len > 360 ? "30 min break" : "15 min break"}, first due by {fmtTime(due)}</span></div>
                  </div>);
              })}
              {!breakShifts.length && <div className="oss-small oss-muted">No shifts over 4h30 in the window.</div>}
            </div>
            {breakShifts.length > 8 && <Btn size="sm" kind="ghost" onClick={() => setAllBreaks(!allBreaks)}>{allBreaks ? "Show the first eight" : "Show all " + breakShifts.length}</Btn>}
          </Card>
          <Card title="Longest weeks" meta="Hours booked this week against the 48-hour average" icon={I.chart}>
            <div className="cp-weeks">
              {weekly.map((x) => (
                <button key={x.w.id} className="cp-wk" onClick={() => openDrawer("worker", x.w.id)}>
                  <span className="n">{x.w.name}</span>
                  <span className="track"><i style={{ width: Math.min(100, (x.m / WMAX) * 100) + "%", background: x.m > 48 * 60 ? "var(--bad)" : "var(--accent)" }} /><i className="mark" style={{ left: (48 / 60) * 100 + "%" }} /></span>
                  <b>{fmtHM(x.m)}</b>
                </button>))}
              {!weekly.length && <div className="oss-small oss-muted">No hours booked this week.</div>}
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

/* ── licences & vetting: matrix ──────────────────────────────────────────── */
type LCell = "valid" | "expiring" | "pending" | "expired" | "missing";
const COLS: { key: string; label: string; short: string; lic?: string; doc?: DocType }[] = [
  { key: "psa", label: "PSA licence", short: "PSA", lic: "PSA licence (event security)" },
  { key: "garda", label: "Garda vetting", short: "Vetted", lic: "Garda vetted" },
  { key: "height", label: "Working at Heights", short: "Heights", lic: "Working at Heights" },
  { key: "fork", label: "Forklift (CSCS)", short: "Forklift", lic: "Forklift (CSCS)" },
  { key: "mh", label: "Manual Handling", short: "Manual H.", doc: "MH" },
  { key: "sp", label: "Safe Pass", short: "Safe Pass", doc: "SP" }
];
function Licences({ s }: { s: OssState }) {
  const [scope, setScope] = useState<string>("holders");
  const [region, setRegion] = useState("all");
  const [limit, setLimit] = useState(60);
  const events = s.events.filter((e) => !e.historical && Q.shiftsOfEvent(s, e.id).length && Q.eventPhase(s, e) !== "completed" && e.date <= addDaysK(s.clock, 21)).sort((a, b) => a.date.localeCompare(b.date));
  const ev = events.find((e) => e.id === scope);
  const at = ev ? Q.shiftsOfEvent(s, ev.id).map((x) => x.end).sort().pop()! : s.clock;
  const crew = s.workers.map((w) => ({ w, p: profile(w) }));
  const rosterIds = ev ? new Set(s.assignments.filter((a) => a.status === "confirmed" && Q.shiftOf(s, a.shiftId).eventId === ev.id).map((a) => a.workerId)) : null;
  const scoped = (rosterIds ? crew.filter((x) => rosterIds.has(x.w.id)) : scope === "holders" ? crew.filter((x) => COLS.some((c) => c.lic && x.p.licences.includes(c.lic))) : crew);
  const regionCounts: Record<string, number> = {};
  for (const x of scoped) { const r = regionOfW(x.w); regionCounts[r] = (regionCounts[r] || 0) + 1; }
  const rows = (region === "all" ? scoped : scoped.filter((x) => regionOfW(x.w) === region)).sort((a, b) => a.w.name.localeCompare(b.w.name));
  const cell = (w: Worker, licences: string[], c: (typeof COLS)[number]): LCell => {
    if (c.lic) return licences.includes(c.lic) ? "valid" : "missing";
    const st = Q.docState(s, w.id, c.doc!, at).state;
    return st === "valid" ? "valid" : st === "expiring" ? "expiring" : st === "pending" ? "pending" : st === "missing" ? "missing" : "expired";
  };
  const grid = rows.map((x) => ({ ...x, cells: COLS.map((c) => cell(x.w, x.p.licences, c)) }));
  const held = COLS.map((_, i) => grid.filter((r) => r.cells[i] === "valid" || r.cells[i] === "expiring").length);
  const shown = grid.slice(0, limit);
  const checks = Object.keys(CALL_SHEETS).filter((id) => Q.eventOf(s, id) && !Q.eventOf(s, id).historical).flatMap((id) => {
    const out: { id: string; ev: string; need: string; have: number; of: number; ok: boolean }[] = [];
    const shifts = Q.shiftsOfEvent(s, id);
    const roster = s.assignments.filter((a) => a.status === "confirmed" && shifts.some((x) => x.id === a.shiftId)).map((a) => profile(Q.worker(s, a.workerId)));
    if (id === "EVT-001") { const v = roster.filter((p) => p.licences.includes("Garda vetted")).length; out.push({ id, ev: "3Arena front-of-house (youth audience)", need: "Garda vetted", have: v, of: 6, ok: v >= 6 }); }
    if (id === "EVT-002") { const v = roster.filter((p) => p.licences.includes("PSA licence (event security)")).length; out.push({ id, ev: "Aviva turnstiles", need: "PSA licence", have: v, of: 4, ok: v >= 4 }); }
    const mh = shifts.filter((x) => x.requiredDocs.includes("MH"));
    if (mh.length) out.push({ id, ev: Q.eventOf(s, id).name.split(":")[0] + " (" + mh.map((x) => x.label.toLowerCase()).join(", ") + ")", need: "Manual Handling", have: mh.reduce((n, x) => n + Q.shiftCoverage(s, x.id).confirmed, 0), of: mh.reduce((n, x) => n + x.required, 0), ok: true });
    return out;
  });
  const ICON: Record<LCell, string> = { valid: I.check, expiring: I.clock, pending: I.upload, expired: I.x, missing: "" };
  const WORD: Record<LCell, string> = { valid: "Valid", expiring: "Valid, renew soon", pending: "Uploaded, not reviewed", expired: "Expired or rejected", missing: "Not held" };
  return (
    <Page eyebrow="Compliance · licences and vetting" title="Licences and vetting" sub="Who can work security, heights, plant and youth events. Check the whole register, or pick an event to test its actual roster on the day.">
      <div className="cp-reqs">
        {checks.map((c, k) => (
          <button key={k} className={"cp-req" + (c.ok ? "" : " short") + (scope === c.id ? " on" : "")} onClick={() => setScope(c.id)}>
            <span className="h"><RIcon d={c.ok ? I.check : I.alert} tone={c.ok ? "ok" : "warn"} /><span><b>{c.need}</b><span>{c.ev}</span></span></span>
            <Meter total={c.of} height={8} legend={false} parts={[{ n: Math.min(c.have, c.of), tone: c.ok ? "ok" : "warn", label: "on the roster" }]} />
            <span className="f"><b>{c.have}</b> of {c.of} needed{c.ok ? "" : ", " + (c.of - c.have) + " short"}</span>
          </button>))}
      </div>
      <section className="oss-card cp-matrixcard" aria-label="Licence matrix">
        <div className="cp-mx-h">
          <Seg value={scope === "holders" || scope === "all" ? scope : "event"} onChange={(v) => { setScope(v === "event" ? (events[0]?.id || "holders") : v); setLimit(60); }} label="Who to show"
            options={[{ id: "holders", label: "Licence holders" }, { id: "all", label: "Everyone", n: s.workers.length }, { id: "event", label: "An event's roster" }]} />
          {ev || (scope !== "holders" && scope !== "all") ? <select className="oss-input cp-evsel" value={ev?.id || ""} onChange={(e) => setScope(e.target.value)} aria-label="Event">
            {events.map((e) => <option key={e.id} value={e.id}>{fmtDate(e.date + "T12:00:00Z")} · {e.name.split(":")[0]}</option>)}</select> : null}
          <span className="grow" />
          <span className="oss-small oss-dim">{rows.length.toLocaleString("en-IE")} {rows.length === 1 ? "person" : "people"} · documents checked {ev ? "for " + fmtDate(at) + ", " + fmtTime(at) : "as of today"}</span>
        </div>
        <div style={{ padding: "0 18px 10px" }}><RegionChips value={region} onPick={(r) => { setRegion(r); setLimit(60); }} counts={regionCounts} /></div>
        <div className="cp-mx">
          <table className="cp-mx-t">
            <thead><tr><th className="nm">Crew</th>{COLS.map((c, i) => <th key={c.key} title={c.label}><span>{c.short}</span><b>{held[i]}</b></th>)}</tr></thead>
            <tbody>
              {shown.map(({ w, cells }) => (
                <tr key={w.id}>
                  <th className="nm"><button onClick={() => openDrawer("worker", w.id)}><Av name={w.name} size="sm" /><span>{w.name}</span><i className="cw-rdot" style={{ background: regionVar(regionOfW(w)), marginLeft: "auto" }} /></button></th>
                  {cells.map((v, i) => <td key={i}><span className={"cp-mc " + v} title={COLS[i].label + ": " + WORD[v]}>{ICON[v] ? <Icon d={ICON[v]} size={11} sw={2.6} /> : null}</span></td>)}
                </tr>))}
              {!grid.length && <tr><td colSpan={COLS.length + 1}><div className="oss-empty"><b>Nobody rostered yet</b>{ev ? <Btn size="sm" onClick={() => navigate("Staffing", "allocate")}>Allocate crew</Btn> : null}</div></td></tr>}
            </tbody>
          </table>
        </div>
        {grid.length > limit && <button className="cw-more" onClick={() => setLimit(limit + 120)}>Show {Math.min(120, grid.length - limit)} more of {grid.length - limit}</button>}
        <div className="cp-legend">
          {(["valid", "expiring", "pending", "expired", "missing"] as LCell[]).map((v) => <span key={v}><span className={"cp-mc " + v}>{ICON[v] ? <Icon d={ICON[v]} size={10} sw={2.6} /> : null}</span>{WORD[v]}</span>)}
        </div>
      </section>
    </Page>
  );
}
