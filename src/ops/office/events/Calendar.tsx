/* Events calendar: Day (default, today), Week and Month, with filters. */

import { useMemo } from "react";
import type { Event, OpsState } from "../../model";
import * as Q from "../../selectors";
import { go, setQuery, useRoute } from "../../router";
import { useOps } from "../../store";
import { addDays, dayKey, fmtDateLong, fmtDay, fmtDayMonth, fmtTime, isoWeekdayOfDay, zoned } from "../../time";
import { Btn, I, Search, Seg, Select, Tabs } from "../../ui/kit";
import { dayRows, Page } from "../common";
import EventCards from "../EventCards";

type View = "day" | "week" | "month";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function EventsTabs({ on }: { on: "calendar" | "clients" }) {
  return <div style={{ marginBottom: 14 }}><Tabs label="Events" value={on} onChange={(v) => go(v === "clients" ? "/clients" : "/events")}
    items={[{ id: "calendar", label: "Calendar" }, { id: "clients", label: "Clients" }]} /></div>;
}

function useFiltered(s: OpsState, f: { client: string; sup: string; venue: string; status: string; q: string }) {
  return useMemo(() => s.events.filter((e) => {
    if (e.status === "cancelled" && f.status !== "grey") return false;
    if (f.client && e.clientId !== f.client) return false;
    const shs = Q.shiftsOf(s, e.id);
    if (f.sup && e.supervisorId !== f.sup && !shs.some((x) => x.supervisorId === f.sup)) return false;
    if (f.venue && e.venueId !== f.venue && !shs.some((x) => x.venueId === f.venue)) return false;
    if (f.q) { const t = f.q.toLowerCase(); if (!(e.name.toLowerCase().includes(t) || Q.client(s, e.clientId).name.toLowerCase().includes(t))) return false; }
    if (f.status && Q.staffStatus(s, e.id).tone !== f.status) return false;
    return true;
  }), [s, f.client, f.sup, f.venue, f.status, f.q]);
}

function Chip({ s, e, day }: { s: OpsState; e: Event; day: string }) {
  const shs = Q.shiftsOnDay(s, e.id, day);
  const st = Q.staffStatus(s, e.id, shs);
  const c = Q.eventCov(s, e.id, shs);
  return (
    <button className="evchip" onClick={() => go("/events/" + e.id + "?tab=roster&day=" + day)} title={e.name + ": " + st.label}>
      <span className="t num">{fmtTime(shs[0].start)}{shs.length > 1 ? " · " + shs.length + " shifts" : ""}</span>
      <span className="n">{e.name}</span>
      <span className={"s tone-" + st.tone}><span className="num">{c.confirmed}/{c.required}</span>&nbsp;{st.label.toLowerCase()}</span>
    </button>
  );
}

export default function Calendar() {
  const s = useOps();
  const r = useRoute();
  const today = dayKey(s.clock);
  const view = (["day", "week", "month"].includes(r.q.get("view") || "") ? r.q.get("view") : "day") as View;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(r.q.get("date") || "") ? r.q.get("date")! : today;
  const f = { client: r.q.get("client") || "", sup: r.q.get("sup") || "", venue: r.q.get("venue") || "", status: r.q.get("status") || "", q: r.q.get("q") || "" };
  const events = useFiltered(s, f);
  const onDay = (day: string) => events.filter((e) => Q.shiftsOnDay(s, e.id, day).length).sort((a, b) => Q.shiftsOnDay(s, a.id, day)[0].start.localeCompare(Q.shiftsOnDay(s, b.id, day)[0].start));
  const step = (n: number) => {
    if (view === "day") return addDays(date, n);
    if (view === "week") return addDays(date, 7 * n);
    const [y, m] = date.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1 + n, 1));
    return t.toISOString().slice(0, 10);
  };
  const weekStart = addDays(date, -isoWeekdayOfDay(date));
  const label = view === "day" ? fmtDateLong(zoned(date, "12:00")) : view === "week"
    ? fmtDayMonth(zoned(weekStart, "12:00")) + " to " + fmtDayMonth(zoned(addDays(weekStart, 6), "12:00")) + " " + addDays(weekStart, 6).slice(0, 4)
    : MONTHS[Number(date.slice(5, 7)) - 1] + " " + date.slice(0, 4);
  const opt = <T extends { id: string; name: string }>(list: T[]) => list.map((x) => ({ value: x.id, label: x.name }));
  const filtersOn = !!(f.client || f.sup || f.venue || f.status || f.q);
  return (
    <Page title="Events" sub="Every booking by day, with staffing for each shift." actions={<Btn kind="primary" icon={I.plus} onClick={() => go("/events/new")}>New event</Btn>}>
      <EventsTabs on="calendar" />
      <div className="toolbar">
        <Seg label="Calendar view" value={view} onChange={(v) => setQuery({ view: v })} items={[{ id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }]} />
        <div className="row">
          <Btn size="sm" icon={I.chevL} iconOnly title="Previous" onClick={() => setQuery({ date: step(-1) })} />
          <Btn size="sm" onClick={() => setQuery({ date: today })} disabled={date === today}>Today</Btn>
          <Btn size="sm" icon={I.chevR} iconOnly title="Next" onClick={() => setQuery({ date: step(1) })} />
          <input className="input sm" type="date" aria-label="Go to date" value={date} onChange={(e) => e.target.value && setQuery({ date: e.target.value })} style={{ width: 150 }} />
        </div>
        <span className="strong" style={{ marginRight: "auto" }}>{label}</span>
      </div>
      <div className="toolbar">
        <Search value={f.q} onChange={(v) => setQuery({ q: v })} placeholder="Search events or clients" />
        <div style={{ width: 190 }}><Select sm label="Client" value={f.client} onChange={(v) => setQuery({ client: v })} placeholder="All clients" options={opt(s.clients)} /></div>
        <div style={{ width: 170 }}><Select sm label="Supervisor" value={f.sup} onChange={(v) => setQuery({ sup: v })} placeholder="All supervisors" options={opt(s.users.filter((u) => u.kind === "supervisor"))} /></div>
        <div style={{ width: 200 }}><Select sm label="Location" value={f.venue} onChange={(v) => setQuery({ venue: v })} placeholder="All locations" options={opt(s.venues)} /></div>
        <div style={{ width: 170 }}><Select sm label="Staffing status" value={f.status} onChange={(v) => setQuery({ status: v })} placeholder="Any staffing"
          options={[{ value: "ok", label: "Fully staffed" }, { value: "warn", label: "Partially staffed" }, { value: "bad", label: "Unstaffed or urgent" }, { value: "grey", label: "Completed or cancelled" }]} /></div>
        {filtersOn && <Btn size="sm" kind="ghost" onClick={() => setQuery({ client: null, sup: null, venue: null, status: null, q: null })}>Clear filters</Btn>}
      </div>

      {view === "day" && (
        <EventCards s={s} rows={dayRows(s, date, onDay(date))}
          empty={<div className="empty"><b>No events on {fmtDay(date)}</b>{filtersOn ? "Try clearing the filters." : "Create one with New event."}</div>} />
      )}

      {view === "week" && (
        <div className="cal-week">
          {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => {
            const list = onDay(d);
            return (
              <div key={d} className={"day" + (d === today ? " today" : "")}>
                <div className="day-h"><span>{fmtDay(d).split(" ")[0]}</span><button className="linkbtn" onClick={() => setQuery({ view: "day", date: d })}><b>{Number(d.slice(8))}</b></button></div>
                <div className="day-b">
                  {list.map((e) => <Chip key={e.id} s={s} e={e} day={d} />)}
                  {!list.length && <span className="tiny faint" style={{ padding: 4 }}>No events</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {view === "month" && (() => {
        const first = date.slice(0, 7) + "-01";
        const start = addDays(first, -isoWeekdayOfDay(first));
        const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
        return (
          <div className="cal-month">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="dow">{d}</div>)}
            {cells.map((d) => {
              const list = onDay(d);
              return (
                <div key={d} className={"cell" + (d.slice(0, 7) !== date.slice(0, 7) ? " out" : "") + (d === today ? " today" : "")}>
                  <div className="d"><b className="num">{Number(d.slice(8))}</b>{list.length > 0 && <span className="tiny">{list.length}</span>}</div>
                  {list.slice(0, 3).map((e) => {
                    const st = Q.staffStatus(s, e.id, Q.shiftsOnDay(s, e.id, d));
                    return <button key={e.id} className="mchip" onClick={() => go("/events/" + e.id + "?tab=roster&day=" + d)} title={e.name + ": " + st.label}><i className={"dot-" + st.tone} /><span>{e.name.split(":")[0]}</span></button>;
                  })}
                  {list.length > 3 && <button className="more" onClick={() => setQuery({ view: "day", date: d })}>{list.length - 3} more</button>}
                </div>
              );
            })}
          </div>
        );
      })()}
    </Page>
  );
}
