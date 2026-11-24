/* Crew: a plain, searchable list of every worker with availability, skills,
   area, bookings, weekly hours, compliance and contact details. */

import { useMemo, useState } from "react";
import type { Avail, Worker } from "../../model";
import { ROLES } from "../../model";
import * as Q from "../../selectors";
import { go } from "../../router";
import { useOps } from "../../store";
import { addDays, dayKey, fmtDay, fmtHM, isoWeekdayOfDay, ms } from "../../time";
import { Btn, Col, I, Pager, Search, Select, Status, Table } from "../../ui/kit";
import { Page } from "../common";

export function WeekBar({ week }: { week: string }) {
  const names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return <span className="weekbar" role="img" aria-label={"Weekly availability: " + week.split("").map((c, i) => names[i] + " " + Q.AVAIL_LABEL[c as Avail]).join(", ")}>
    {week.split("").map((c, i) => <i key={i} className={c === "?" ? "" : c} title={names[i] + ": " + Q.AVAIL_LABEL[c as Avail]} />)}</span>;
}

interface Row { w: Worker; comp: Q.CompView; upcoming: number; next?: string; weekMin: number; limit: number; strict: boolean }

export default function CrewList() {
  const s = useOps();
  const [q, setQ] = useState("");
  const [skill, setSkill] = useState("");
  const [day, setDay] = useState("");
  const [docs, setDocs] = useState("");
  const [county, setCounty] = useState("");
  const [booked, setBooked] = useState("");
  const [hours, setHours] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const today = dayKey(s.clock);
  const rows = useMemo<Row[]>(() => s.workers.map((w) => {
    const up = Q.asgsOfWorker(s, w.id).filter((a) => a.status === "confirmed" && ms(Q.shift(s, a.shiftId).start) > ms(s.clock)).map((a) => Q.shift(s, a.shiftId).start).sort();
    const lim = Q.weekLimit(s, w);
    return { w, comp: Q.compliance(s, w.id), upcoming: up.length, next: up[0], weekMin: Q.weekMinutes(s, w.id, s.clock), limit: lim.min, strict: lim.strict };
  }), [s]);
  const shown = rows.filter((r) => {
    const w = r.w;
    if (q) { const t = q.toLowerCase().replace(/\s/g, ""); if (!(w.name.toLowerCase().replace(/\s/g, "").includes(t) || w.mobile.replace(/\s/g, "").includes(t) || w.area.toLowerCase().includes(q.toLowerCase()) || w.id.toLowerCase() === t)) return false; }
    if (skill && !w.roles.includes(skill)) return false;
    if (county && w.county !== county) return false;
    if (status && w.status !== status) return false;
    if (docs === "valid" && r.comp.level !== "ok") return false;
    if (docs === "attention" && r.comp.level === "ok") return false;
    if (booked === "yes" && !r.upcoming) return false;
    if (booked === "no" && r.upcoming) return false;
    if (hours === "15" && r.weekMin < 15 * 60) return false;
    if (hours === "near" && r.weekMin < r.limit * 0.85) return false;
    if (day) {
      const c = w.week[isoWeekdayOfDay(day)];
      if (c === "x" || c === "?" || w.off.some((o) => day >= o.from && day <= o.to)) return false;
    }
    return true;
  });
  const dayOpts = Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((d, i) => ({ value: d, label: i === 0 ? "Available today" : i === 1 ? "Available tomorrow" : "Available " + fmtDay(d) }));
  const cols: Col<Row>[] = [
    { key: "n", label: "Name", render: (r) => <div className="stack" style={{ gap: 0 }}><span className="strong">{r.w.name}</span><span className="tiny dim">{r.w.id}{r.w.status === "pending_verification" ? " · not verified yet" : ""}{r.w.emergency ? " · registered on site" : ""}</span></div> },
    { key: "sk", label: "Skills", hide: "sm", render: (r) => <span className="small">{r.w.roles.join(", ")}</span> },
    { key: "ar", label: "Area", hide: "md", render: (r) => <span className="small">{r.w.area}{r.w.county !== "Dublin" ? ", " + r.w.county : ""}</span> },
    { key: "av", label: "Availability", hide: "sm", render: (r) => <WeekBar week={r.w.week} /> },
    { key: "up", label: "Upcoming", hide: "md", render: (r) => (r.upcoming ? <span className="small"><b className="ink">{r.upcoming}</b> <span className="dim">next {fmtDay(dayKey(r.next!))}</span></span> : <span className="dim small">None</span>) },
    { key: "wk", label: "This week", render: (r) => <span className={"num small " + (r.weekMin > r.limit ? (r.strict ? "tone-bad strong" : "tone-warn") : r.weekMin > r.limit * 0.85 ? "tone-warn" : "")}>{fmtHM(r.weekMin)}{r.strict && <span className="dim"> / {fmtHM(r.limit)}</span>}</span> },
    { key: "cp", label: "Compliance", render: (r) => <Status tone={r.comp.level === "ok" ? "ok" : r.comp.level === "expiring" ? "warn" : "bad"} title={r.comp.summary}>{r.comp.level === "ok" ? "Valid" : r.comp.level === "expiring" ? "Check soon" : "Action needed"}</Status> },
    { key: "m", label: "Mobile", hide: "md", render: (r) => <span className="num small nowrap">{r.w.mobile}</span> }
  ];
  const filtersOn = !!(q || skill || day || docs || county || booked || hours || status);
  return (
    <Page title="Crew" sub={s.workers.filter((w) => w.status === "active").length.toLocaleString("en-IE") + " active workers. Search, filter and open anyone to see their documents, shifts and hours."}
      actions={<Btn kind="primary" icon={I.plus} onClick={() => go("/crew/new")}>Register worker</Btn>}>
      <div className="toolbar">
        <Search value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder="Name, mobile or area" />
        <div style={{ width: 180 }}><Select sm label="Skill" value={skill} onChange={(v) => { setSkill(v); setPage(0); }} placeholder="Any skill" options={ROLES.map((r) => ({ value: r, label: r }))} /></div>
        <div style={{ width: 190 }}><Select sm label="Available" value={day} onChange={(v) => { setDay(v); setPage(0); }} placeholder="Any availability" options={dayOpts} /></div>
        <div style={{ width: 170 }}><Select sm label="Documents" value={docs} onChange={(v) => { setDocs(v); setPage(0); }} placeholder="Any documents" options={[{ value: "valid", label: "All documents valid" }, { value: "attention", label: "Needs attention" }]} /></div>
        <div style={{ width: 150 }}><Select sm label="County" value={county} onChange={(v) => { setCounty(v); setPage(0); }} placeholder="Any county" options={[...new Set(s.workers.map((w) => w.county))].sort().map((c) => ({ value: c, label: c }))} /></div>
        <div style={{ width: 160 }}><Select sm label="Bookings" value={booked} onChange={(v) => { setBooked(v); setPage(0); }} placeholder="Any bookings" options={[{ value: "yes", label: "Has upcoming shifts" }, { value: "no", label: "No upcoming shifts" }]} /></div>
        <div style={{ width: 170 }}><Select sm label="Weekly hours" value={hours} onChange={(v) => { setHours(v); setPage(0); }} placeholder="Any weekly hours" options={[{ value: "15", label: "Over 15 h this week" }, { value: "near", label: "Near or over limit" }]} /></div>
        <div style={{ width: 170 }}><Select sm label="Status" value={status} onChange={(v) => { setStatus(v); setPage(0); }} placeholder="Any status" options={[{ value: "active", label: "Active" }, { value: "pending_verification", label: "Not verified yet" }]} /></div>
        {filtersOn && <Btn size="sm" kind="ghost" onClick={() => { setQ(""); setSkill(""); setDay(""); setDocs(""); setCounty(""); setBooked(""); setHours(""); setStatus(""); setPage(0); }}>Clear</Btn>}
      </div>
      <div className="row wrap small dim" style={{ marginBottom: 8, gap: 14 }}>
        <span>{shown.length.toLocaleString("en-IE")} workers</span>
        <span className="hide-sm row wrap" style={{ gap: 14 }}>
        <span className="row" style={{ gap: 6 }}><span className="weekbar" aria-hidden="true" style={{ gridTemplateColumns: "12px" }}><i className="a" /></span>All day</span>
        <span className="row" style={{ gap: 6 }}><span className="weekbar" aria-hidden="true" style={{ gridTemplateColumns: "12px" }}><i className="d" /></span>Daytime</span>
        <span className="row" style={{ gap: 6 }}><span className="weekbar" aria-hidden="true" style={{ gridTemplateColumns: "12px" }}><i className="e" /></span>Evenings</span>
        <span className="row" style={{ gap: 6 }}><span className="weekbar" aria-hidden="true" style={{ gridTemplateColumns: "12px" }}><i className="x" /></span>Not available</span>
        <span className="row" style={{ gap: 6 }}><span className="weekbar" aria-hidden="true" style={{ gridTemplateColumns: "12px" }}><i /></span>Not set</span>
        </span>
      </div>
      <div className="panel">
        <Table label="Crew" cols={cols} rows={shown.slice(page * 50, page * 50 + 50)} rowKey={(r) => r.w.id} onRow={(r) => go("/crew/" + r.w.id)}
          empty={<div className="empty"><b>No workers match</b>Try clearing a filter.</div>} />
        <Pager page={page} size={50} total={shown.length} onPage={setPage} />
      </div>
    </Page>
  );
}
