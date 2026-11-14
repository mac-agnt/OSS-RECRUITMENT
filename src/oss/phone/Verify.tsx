/* Simulated venue verification. No real permission prompt and no location is
   read: the presenter sets distance and accuracy. A QR code or GPS reading
   does not prove presence on its own; failures go to review, never to approved. */

import { useState } from "react";
import type { OssState, Shift } from "../model";
import { qrFor } from "../engine";
import * as Q from "../selectors";
import { Btn, I, Icon } from "../ui/kit";

export interface VerifyInput { method: "gps" | "qr"; distance?: number; accuracy?: number; denied?: boolean; offline?: boolean; token?: string }

export function VenueSchematic({ radius, distance, accuracy }: { radius: number; distance: number; accuracy: number }) {
  // Schematic, not a map: rings at the sample radius, a dot at the reported distance.
  const scale = 80 / Math.max(radius * 1.2, Math.min(distance, 300));
  const r = radius * scale, d = Math.min(distance * scale, 96), a = Math.min(accuracy * scale, 60);
  const inside = distance <= radius;
  return (
    <svg viewBox="-110 -110 220 220" width="100%" style={{ maxWidth: 220, display: "block", margin: "0 auto" }} role="img" aria-label={"Schematic: " + distance + " metres from venue point, sample radius " + radius + " metres"}>
      <circle r={104} fill="none" stroke="var(--border)" strokeDasharray="2 4" />
      <circle r={r} fill="var(--accent-faint)" stroke="var(--accent-line)" />
      <circle r={3.5} fill="var(--accent)" />
      <text y={-r - 6} textAnchor="middle" fontSize="10" fill="var(--dim)">{radius} m sample radius</text>
      <circle cx={d * 0.8} cy={-d * 0.6} r={a} fill={inside ? "var(--ok-soft)" : "var(--bad-soft)"} />
      <circle cx={d * 0.8} cy={-d * 0.6} r={5} fill={inside ? "var(--ok)" : "var(--bad)"} />
      <text x={0} y={100} textAnchor="middle" fontSize="10" fill="var(--faint)">Schematic only · no map, no tracking</text>
    </svg>
  );
}

export function VerifyControls({ s, venueId, shift, kind, onSubmit, onCancel }: { s: OssState; venueId: string; shift: Shift; kind: "in" | "out"; onSubmit: (v: VerifyInput) => void; onCancel?: () => void }) {
  const v = Q.venueOf(s, venueId)!;
  const [method, setMethod] = useState<"gps" | "qr">("gps");
  const [distance, setDistance] = useState(240);
  const [accuracy, setAccuracy] = useState(18);
  const [denied, setDenied] = useState(false);
  const [offline, setOffline] = useState(false);
  const good = qrFor(venueId, shift);
  const tokens = [[good, "Current shift code"], [good.replace(/v\d+$/, "v0"), "Expired code (fixture)"], [qrFor(venueId, { ...shift, id: shift.id.endsWith("A") ? shift.id.replace(/A$/, "B") : shift.id.replace(/B$/, "A") }), "Wrong shift (fixture)"]];
  const [token, setToken] = useState(good);
  return (
    <div>
      <div className="oss-seg" style={{ width: "100%" }}>
        <button className={method === "gps" ? "on" : ""} style={{ flex: 1, height: 38 }} onClick={() => setMethod("gps")}><Icon d={I.pin} size={14} />Location</button>
        {v.methods.includes("qr") && <button className={method === "qr" ? "on" : ""} style={{ flex: 1, height: 38 }} onClick={() => setMethod("qr")}><Icon d={I.qr} size={14} />Scan QR</button>}
      </div>
      <div className="crew-sim" style={{ marginTop: 10 }}>
        <b style={{ color: "var(--ink)" }}>Demo controls · simulated {method === "gps" ? "location" : "scan"}</b>
        {method === "gps" ? <>
          <VenueSchematic radius={v.geofenceM} distance={denied ? 0 : distance} accuracy={accuracy} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
            {[240, 42, 15].map((d) => <button key={d} className={"oss-btn sm" + (distance === d ? " primary" : "")} onClick={() => setDistance(d)}>{d} m</button>)}
            <label className="oss-small" style={{ display: "flex", alignItems: "center", gap: 6 }}>Distance <input className="oss-input" type="number" min={0} max={5000} value={distance} onChange={(e) => setDistance(Number(e.target.value) || 0)} style={{ width: 80, height: 34 }} aria-label="Distance in metres" /></label>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
            <span className="oss-small">Accuracy</span>
            {[12, 18, 400].map((a) => <button key={a} className={"oss-btn sm" + (accuracy === a ? " primary" : "")} onClick={() => setAccuracy(a)}>{a} m</button>)}
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8 }}>
            <label className="oss-check"><input type="checkbox" checked={denied} onChange={(e) => setDenied(e.target.checked)} />Permission denied</label>
            <label className="oss-check"><input type="checkbox" checked={offline} onChange={(e) => setOffline(e.target.checked)} /><Icon d={I.wifiOff} size={13} />No signal</label>
          </div>
        </> : <>
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {tokens.map(([t, l]) => <label key={t} className="oss-check" style={{ minHeight: 36 }}><input type="radio" name="tok" checked={token === t} onChange={() => setToken(t)} /><span><span className="oss-mono">{t}</span><br /><span className="oss-tiny oss-muted">{l}</span></span></label>)}
          </div>
          <div className="oss-tiny oss-muted" style={{ marginTop: 6 }}>A shared or static code is not fraud-proof; it narrows, not proves, presence.</div>
        </>}
      </div>
      <div className="crew-actions">
        <Btn kind="primary" onClick={() => onSubmit({ method, distance, accuracy, denied, offline, token })}>{kind === "in" ? "Clock in" : "Clock out"}</Btn>
        {onCancel && <Btn onClick={onCancel}>Cancel</Btn>}
      </div>
    </div>
  );
}
