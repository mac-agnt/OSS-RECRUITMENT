/* Pieces shared by office screens: page frame, the shift board used on Today and
   the calendar day view, attendance summaries and small formatters. */

import type { ReactNode } from "react";
import type { Event, OpsState, Shift } from "../model";
import * as Q from "../selectors";
import { go } from "../router";
import { fmtTime, minutesBetween, ms, span } from "../time";
import { Col, Meter, Status, Table } from "../ui/kit";

export function Page({ title, sub, actions, children, narrow, back }: { title: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; narrow?: boolean; back?: { to: string; label: string } }) {
  return (
    <div className={"o-page" + (narrow ? " narrow" : "")}>
      {back && <button className="linkbtn small" style={{ marginBottom: 6 }} onClick={() => go(back.to)}>‹ {back.label}</button>}
      <div className="o-head">
        <div className="stack" style={{ gap: 2 }}><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
        {actions && <div className="row wrap">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

export const firstWord = (name: string) => name.split(":")[0];
export const venueLabel = (s: OpsState, sh: Shift) => { const v = Q.shiftVenue(s, sh); return v.name + (v.county !== "Dublin" ? ", " + v.county : ""); };
export const supName = (s: OpsState, sh: Shift) => Q.user(s, Q.shiftSupervisor(s, sh))?.name || "Unassigned";

/** Attendance or reply progress for a shift, in words. */
export function attendanceText(s: OpsState, sh: Shift): { text: string; tone: Q.Tone; value: number; max: number } {
  const ph = Q.shiftPhase(s, sh);
  const a = Q.attendance(s, [sh]);
  if (ph === "done") return { text: a.out + a.in + " of " + a.confirmed + " worked" + (a.missing ? ", " + a.missing + " no-show" : ""), tone: a.missing ? "warn" : "grey", value: a.out + a.in, max: a.confirmed };
  if (ph === "live") {
    const bits = [a.in + a.out + " of " + a.confirmed + " clocked in"];
    if (a.late) bits.push(a.late + " late");
    if (a.missing) bits.push(a.missing + " missing");
    return { text: bits.join(", "), tone: a.missing ? "bad" : a.late ? "warn" : "ok", value: a.in + a.out, max: a.confirmed };
  }
  const mins = minutesBetween(s.clock, sh.start);
  const travel = a.onWay + a.arrived + a.late + a.lost;
  if (travel || a.noReply) {
    const bits = [travel + " travelling or arrived"];
    if (a.late) bits.push(a.late + " late");
    if (a.lost) bits.push(a.lost + " lost");
    if (a.noReply) bits.push(a.noReply + " no reply");
    return { text: bits.join(", "), tone: a.noReply || a.lost ? "bad" : a.late ? "warn" : "info", value: travel, max: a.confirmed };
  }
  const when = mins < 60 ? "Starts in " + mins + " min" : mins < 24 * 60 ? "Starts " + fmtTime(sh.start) : "Not started";
  return { text: when, tone: "grey", value: 0, max: a.confirmed };
}

export interface BoardRow { e: Event; sh: Shift }
export function ShiftBoard({ s, rows, empty }: { s: OpsState; rows: BoardRow[]; empty?: ReactNode }) {
  const cols: Col<BoardRow>[] = [
    { key: "status", label: "Staffing", width: 148, render: ({ e, sh }) => { const st = Q.staffStatus(s, e.id, [sh]); return <Status tone={st.tone}>{st.label}</Status>; } },
    { key: "time", label: "Shift", width: 112, render: ({ sh }) => <div className="stack" style={{ gap: 0 }}><span className="num strong nowrap">{span(sh.start, sh.end)}</span><span className="tiny dim">{sh.label}</span></div> },
    { key: "event", label: "Event", render: ({ e, sh }) => (
      <div className="stack" style={{ gap: 1, minWidth: 180 }}>
        <span className="strong">{e.name}</span>
        <span className="small dim">{Q.client(s, e.clientId).name} · {venueLabel(s, sh)} · {supName(s, sh)}</span>
      </div>) },
    { key: "crew", label: "Crew", width: 96, render: ({ sh }) => { const c = Q.coverage(s, sh.id); return (
      <div className="stack num" style={{ gap: 0 }}>
        <span><b className="ink">{c.confirmed}</b><span className="dim"> of {c.required}</span></span>
        <span className={"tiny " + (c.outstanding ? "tone-bad" : "dim")}>{c.outstanding ? c.outstanding + " open" : "Full"}</span>
      </div>); } },
    { key: "att", label: "Attendance", hide: "sm", width: 210, render: ({ sh }) => {
      const t = attendanceText(s, sh);
      return <div className="stack" style={{ gap: 4 }}><span className={"small tone-" + t.tone}>{t.text}</span>{t.max > 0 && t.value > 0 && <Meter value={t.value} max={t.max} tone={t.tone} />}</div>;
    } }
  ];
  return <Table label="Shifts" cols={cols} rows={rows} rowKey={(r) => r.sh.id} empty={empty}
    onRow={({ e, sh }) => go("/events/" + e.id + "?tab=" + (Q.shiftPhase(s, sh) === "upcoming" ? "roster" : "attendance") + "&shift=" + sh.id)} />;
}

/** Shifts on a day, one row per shift, earliest first. */
export function dayRows(s: OpsState, day: string, events?: Event[]): BoardRow[] {
  const list = events || Q.eventsOnDay(s, day);
  return list.flatMap((e) => Q.shiftsOnDay(s, e.id, day).map((sh) => ({ e, sh }))).sort((a, b) => ms(a.sh.start) - ms(b.sh.start));
}

export const plural = (n: number, one: string, many?: string) => n + " " + (n === 1 ? one : many || one + "s");
