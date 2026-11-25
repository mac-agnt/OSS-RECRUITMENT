/* Area map for a shift: real OpenStreetMap tiles around the meeting point, with
   one dot per confirmed worker. Dot positions are SIMULATED from each worker's
   status (no live location is collected), and the map says so. */

import { useMemo } from "react";
import type { OpsState, Shift } from "../model";
import { roll } from "../rand";
import * as Q from "../selectors";

const Z = 13, TILE = 256, W = 1024, H = 640;
const worldX = (lng: number) => ((lng + 180) / 360) * 2 ** Z * TILE;
const worldY = (lat: number) => {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z * TILE;
};

/** Where a worker with this status sits, as a fraction of the map's half-width/height from the meeting point. */
const RING: Record<string, [number, number]> = {
  in: [0.01, 0.08], out: [0.04, 0.2], arrived: [0.02, 0.1], pending: [0.02, 0.1], lost: [0.12, 0.28],
  on_way: [0.3, 0.8], late: [0.55, 0.9], missing: [0.7, 0.96], no_reply: [0.7, 0.96], upcoming: [0.82, 0.98], ended: [0.82, 0.98]
};
const COLOUR: Record<Q.Tone, string> = { ok: "var(--ok)", info: "var(--accent-text)", warn: "var(--warn)", bad: "var(--bad)", grey: "var(--grey)" };

export default function MapView({ s, sh, tall }: { s: OpsState; sh: Shift; tall?: boolean }) {
  const v = Q.shiftVenue(s, sh);
  const views = useMemo(() => Q.confirmedOf(s, sh.id).map((a) => Q.asgView(s, a.id)), [s, sh.id]);
  const cx = worldX(v.lng), cy = worldY(v.lat);
  const x0 = cx - W / 2, y0 = cy - H / 2;
  const tiles: { k: string; x: number; y: number }[] = [];
  for (let tx = Math.floor(x0 / TILE); tx <= Math.floor((x0 + W) / TILE); tx++)
    for (let ty = Math.floor(y0 / TILE); ty <= Math.floor((y0 + H) / TILE); ty++) tiles.push({ k: tx + "/" + ty, x: tx, y: ty });
  const dots = views.map((w) => {
    const [a, b] = RING[w.state] || RING.upcoming;
    const r = a + (roll(w.a.id + "r", 1000) / 1000) * (b - a);
    const th = (roll(w.a.id + "t", 6283) / 1000);
    return { w, left: 50 + Math.cos(th) * r * 46, top: 50 + Math.sin(th) * r * 44 };
  });
  const legend: [string, Q.Tone, (w: Q.AsgView) => boolean][] = [
    ["At the venue", "ok", (w) => ["in", "arrived", "pending", "out"].includes(w.state)], ["Travelling", "info", (w) => w.state === "on_way"],
    ["Running late", "warn", (w) => w.state === "late"], ["Missing or lost", "bad", (w) => ["missing", "no_reply", "lost"].includes(w.state)],
    ["No update yet", "grey", (w) => w.state === "upcoming"]];
  return (
    <div className="mapbox">
      <div className="map-legend">
        {legend.map(([l, t, f]) => { const n = views.filter(f).length; return n ? <span key={l} className="map-key"><i style={{ background: COLOUR[t] }} />{n} {l.toLowerCase()}</span> : null; })}
      </div>
      <div className={"map" + (tall ? " tall" : "")} role="img" aria-label={"Map around " + v.name + " showing where confirmed crew are (simulated)"}>
        {tiles.map((t) => (
          <img key={t.k} className="map-tile" alt="" draggable={false} loading="lazy" src={"https://tile.openstreetmap.org/" + Z + "/" + t.x + "/" + t.y + ".png"}
            style={{ left: ((t.x * TILE - x0) / W) * 100 + "%", top: ((t.y * TILE - y0) / H) * 100 + "%", width: (TILE / W) * 100 + "%", height: (TILE / H) * 100 + "%" }} />
        ))}
        {dots.map((d) => (
          <span key={d.w.a.id} className={"map-dot " + d.w.tone} title={d.w.w.name + ": " + d.w.label} style={{ left: d.left + "%", top: d.top + "%", background: COLOUR[d.w.tone] }} />
        ))}
        <span className="map-pin" style={{ left: "50%", top: "50%" }}><b>{v.name}</b></span>
        <span className="map-attr">© OpenStreetMap contributors</span>
      </div>
      <div className="tiny dim" style={{ marginTop: 6 }}>Crew positions are simulated from their status for this demo. The live version would use location shared only when clocking in.</div>
    </div>
  );
}
