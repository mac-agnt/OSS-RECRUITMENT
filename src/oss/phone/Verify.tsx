/* Venue check-in on the phone: GPS within the venue radius, or scan the venue
   QR. Location is simulated for the demo; the presenter picks the distance.
   Anything outside the radius goes to review, never straight through. */

import { useState } from "react";
import type { OssState, Shift } from "../model";
import { qrFor } from "../engine";
import * as Q from "../selectors";
import { Btn, I, Icon } from "../ui/kit";

export interface VerifyInput { method: "gps" | "qr"; distance?: number; accuracy?: number; denied?: boolean; offline?: boolean; token?: string }

export function VenueSchematic({ radius, distance, accuracy }: { radius: number; distance: number; accuracy: number }) {
  const scale = 80 / Math.max(radius * 1.2, Math.min(distance, 300));
  const r = radius * scale, d = Math.min(distance * scale, 96), a = Math.min(accuracy * scale, 60);
  const inside = distance <= radius;
  return (
    <svg viewBox="-110 -110 220 220" width="100%" style={{ maxWidth: 230, display: "block", margin: "0 auto" }} role="img" aria-label={distance + " metres from the venue, check-in radius " + radius + " metres"}>
      <circle r={104} fill="none" stroke="var(--border)" strokeDasharray="2 5" />
      <circle r={r} fill="var(--accent-faint)" stroke="var(--accent)" strokeDasharray="4 4" />
      <rect x={-16} y={-11} width={32} height={22} rx={6} fill="var(--navy, #064B68)" />
      <text y={-r - 7} textAnchor="middle" fontSize="10" fill="var(--dim)">{radius} m</text>
      <circle cx={d * 0.8} cy={-d * 0.6} r={a} fill={inside ? "var(--ok-soft)" : "var(--bad-soft)"} />
      <circle cx={d * 0.8} cy={-d * 0.6} r={6} fill={inside ? "var(--ok)" : "var(--bad)"} stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

export function VerifyControls({ s, venueId, shift, kind, onSubmit, onCancel }: { s: OssState; venueId: string; shift: Shift; kind: "in" | "out"; onSubmit: (v: VerifyInput) => void; onCancel?: () => void }) {
  const v = Q.venueOf(s, venueId)!;
  const [method, setMethod] = useState<"gps" | "qr">("gps");
  const [distance, setDistance] = useState(240);
  const [accuracy] = useState(18);
  const [offline, setOffline] = useState(false);
  const good = qrFor(venueId, shift);
  const stale = good.replace(/v\d+$/, "v0");
  const [token, setToken] = useState(good);
  const inside = distance <= v.geofenceM;
  return (
    <div>
      <div className="oss-seg">
        <button className={method === "gps" ? "on" : ""} onClick={() => setMethod("gps")}><Icon d={I.pin} size={14} />My location</button>
        {v.methods.includes("qr") && <button className={method === "qr" ? "on" : ""} onClick={() => setMethod("qr")}><Icon d={I.qr} size={14} />Scan QR</button>}
      </div>
      {method === "gps" ? <div style={{ marginTop: 12 }}>
        <VenueSchematic radius={v.geofenceM} distance={distance} accuracy={accuracy} />
        <div style={{ textAlign: "center", fontSize: 14, fontWeight: 600, marginTop: 4, color: inside ? "var(--ok)" : "var(--bad)" }}>{inside ? "You're at " + v.name : distance + " m from " + v.name}</div>
        <div style={{ textAlign: "center", fontSize: 12, color: "var(--dim)", marginTop: 2 }}>Must be within {v.geofenceM} m to {kind === "in" ? "clock in" : "clock out"}</div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", marginTop: 10, padding: "8px", borderRadius: 14, background: "var(--surface-2)" }}>
          <span style={{ fontSize: 11, color: "var(--faint)", alignSelf: "center", marginRight: 2 }}>Demo location</span>
          {[240, 42, 15].map((d) => <button key={d} className={"oss-btn sm" + (distance === d ? " primary" : "")} style={{ minHeight: 30, height: 30 }} onClick={() => setDistance(d)}>{d} m</button>)}
          <button className={"oss-btn sm" + (offline ? " primary" : "")} style={{ minHeight: 30, height: 30 }} onClick={() => setOffline(!offline)}><Icon d={I.wifiOff} size={12} />No signal</button>
        </div>
      </div> : <div style={{ marginTop: 12 }}>
        <div className="crew-scan"><Icon d={I.qr} size={54} sw={1.4} /></div>
        <div style={{ textAlign: "center", fontSize: 12.5, color: "var(--dim)" }}>Point at the OSS code at the staff entrance</div>
        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 10, padding: 8, borderRadius: 14, background: "var(--surface-2)" }}>
          <span style={{ fontSize: 11, color: "var(--faint)", alignSelf: "center" }}>Demo code</span>
          <button className={"oss-btn sm" + (token === good ? " primary" : "")} style={{ minHeight: 30, height: 30 }} onClick={() => setToken(good)}>Today's code</button>
          <button className={"oss-btn sm" + (token === stale ? " primary" : "")} style={{ minHeight: 30, height: 30 }} onClick={() => setToken(stale)}>Old photo of it</button>
        </div>
      </div>}
      <div className="crew-actions">
        <Btn kind="primary" onClick={() => onSubmit({ method, distance, accuracy, offline, token })}>{kind === "in" ? "Clock in" : "Clock out"}</Btn>
        {onCancel && <Btn onClick={onCancel}>Cancel</Btn>}
      </div>
    </div>
  );
}
