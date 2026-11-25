/* A day's events as cards: a picture, the staffing picture at a glance, and one
   line per shift underneath. Opens the event or a single shift. */

import type { ReactNode } from "react";
import type { OpsState } from "../model";
import * as Q from "../selectors";
import { go } from "../router";
import { span } from "../time";
import { Avatar, I, Icon, Meter, Status } from "../ui/kit";
import VenueArt from "../ui/VenueArt";
import { attendanceText, supName, venueLabel, type BoardRow } from "./common";

export default function EventCards({ s, rows, empty }: { s: OpsState; rows: BoardRow[]; empty?: ReactNode }) {
  if (!rows.length) return <>{empty}</>;
  const groups: { e: BoardRow["e"]; list: BoardRow[] }[] = [];
  for (const r of rows) { const g = groups.find((x) => x.e.id === r.e.id); if (g) g.list.push(r); else groups.push({ e: r.e, list: [r] }); }
  return (
    <div className="ecards">
      {groups.map(({ e, list }, i) => {
        const shifts = list.map((r) => r.sh);
        const st = Q.staffStatus(s, e.id, shifts), cov = Q.eventCov(s, e.id, shifts);
        const venue = Q.shiftVenue(s, shifts[0]);
        const phase = Q.eventPhase(s, e.id);
        return (
          <article key={e.id} className={"ecard " + st.tone} style={{ animationDelay: Math.min(i, 8) * 60 + "ms" }}>
            <button className="ecard-hero" onClick={() => go("/events/" + e.id)} aria-label={"Open " + e.name}>
              <VenueArt venueId={venue.id} />
              <span className="ecard-shade" />
              <span className="ecard-top"><Status tone={st.tone}>{st.label}</Status><span className="ecard-chip">{list.length} shift{list.length === 1 ? "" : "s"}</span></span>
              <span className="ecard-title">
                <span className="ecard-client">{Q.client(s, e.clientId).name}</span>
                <h3>{e.name}</h3>
                <span className="ecard-where"><Icon d={I.pin} size={14} />{venueLabel(s, shifts[0])}</span>
              </span>
            </button>
            <div className="ecard-stats">
              <div><b className="num">{cov.confirmed}<span> / {cov.required}</span></b><span className="lab">Confirmed</span></div>
              <div><b className={"num" + (cov.outstanding ? " tone-bad" : " tone-ok")}>{cov.outstanding}</b><span className="lab">{cov.outstanding === 1 ? "Open place" : "Open places"}</span></div>
              <div className="ecard-sup"><Avatar name={supName(s, shifts[0])} size="sm" /><span className="stack" style={{ gap: 0 }}><b>{supName(s, shifts[0])}</b><span className="lab">Supervisor</span></span></div>
            </div>
            <div className="ecard-lines" role="list">
              {list.map(({ sh }) => {
                const c = Q.coverage(s, sh.id), sst = Q.staffStatus(s, e.id, [sh]), t = attendanceText(s, sh);
                return (
                  <button key={sh.id} role="listitem" className="eline" onClick={() => go("/events/" + e.id + "?tab=" + (Q.shiftPhase(s, sh) === "upcoming" ? "roster" : "attendance") + "&shift=" + sh.id)}>
                    <span className="eline-time num">{span(sh.start, sh.end)}</span>
                    <span className="eline-main"><b>{sh.label}</b><span className={"tone-" + t.tone}>{t.text}</span></span>
                    <span className="eline-crew num"><span><b>{c.confirmed}</b><span className="dim"> of {c.required}</span></span><Meter value={c.confirmed} max={Math.max(1, c.required)} tone={sst.tone} /></span>
                    <span className="eline-go"><Icon d={I.arrowR} size={16} /></span>
                  </button>
                );
              })}
            </div>
            {phase === "done" && <div className="ecard-done">Finished</div>}
          </article>
        );
      })}
    </div>
  );
}
