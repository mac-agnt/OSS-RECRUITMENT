/* Venue pictures. Drop a real photo at public/venues/<venue id>.jpg (for example
   V02.jpg) and it replaces the drawn scene automatically. */

import { useState } from "react";

type Kind = "arena" | "stadium" | "pool" | "pint" | "glass" | "hall" | "theatre" | "tents" | "golf" | "track";
const MAP: Record<string, [Kind, string, string, string]> = {
  V01: ["arena", "#170d2e", "#6b2a72", "#e8709f"], V02: ["stadium", "#06172a", "#0f4c5c", "#2f9f72"], V03: ["pool", "#06304b", "#0e7fa8", "#86dbe9"],
  V04: ["pint", "#120b07", "#3a2412", "#d3a25c"], V05: ["glass", "#0a1b2b", "#1f5f73", "#93d6d2"], V06: ["hall", "#171c28", "#3d4a63", "#d2ac70"],
  V07: ["theatre", "#26090f", "#7a1f33", "#e6a95b"], V08: ["tents", "#1b0f3d", "#cf5a3b", "#f7cc7e"], V09: ["golf", "#0b2a4a", "#e58a54", "#f6c978"],
  V10: ["tents", "#0b2a4a", "#c9794e", "#f4cd86"], V11: ["track", "#0d2a3a", "#c7855a", "#ecbc78"], V12: ["tents", "#0b2538", "#3b7f8c", "#f0c987"]
};

function Scene({ kind, id, c0, c1, c2 }: { kind: Kind; id: string; c0: string; c1: string; c2: string }) {
  const sky = <><defs>
    <linearGradient id={id + "s"} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c0} /><stop offset=".6" stopColor={c1} /><stop offset="1" stopColor={c2} /></linearGradient>
    <radialGradient id={id + "g"} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#fff6d6" stopOpacity=".85" /><stop offset="1" stopColor="#fff6d6" stopOpacity="0" /></radialGradient>
  </defs><rect width="600" height="300" fill={`url(#${id}s)`} /></>;
  const dark = "rgba(5,8,12,.55)", darker = "rgba(5,8,12,.78)";
  switch (kind) {
    case "arena": return <>{sky}
      <path d="M300 0 L120 300 H190Z M300 0 L300 300 H340Z M300 0 L470 300 H410Z" fill="#fff" opacity=".07" />
      <path d="M50 300 C50 125 175 62 300 62 S550 125 550 300Z" fill={darker} /><path d="M50 300 C50 125 175 62 300 62 S550 125 550 300" fill="none" stroke={c2} strokeWidth="3" opacity=".8" />
      <ellipse cx="300" cy="300" rx="190" ry="46" fill={`url(#${id}g)`} /><g fill="#fff" opacity=".85"><circle cx="205" cy="150" r="3" /><circle cx="300" cy="120" r="3" /><circle cx="395" cy="150" r="3" /></g></>;
    case "stadium": return <>{sky}
      <ellipse cx="300" cy="262" rx="300" ry="76" fill={darker} /><ellipse cx="300" cy="268" rx="236" ry="52" fill="#2f9f72" opacity=".9" /><ellipse cx="300" cy="268" rx="236" ry="52" fill="none" stroke="#fff" opacity=".35" />
      <path d="M300 218v100M240 268h120" stroke="#fff" opacity=".25" />
      {[70, 190, 410, 530].map((x) => <g key={x}><rect x={x - 3} y="90" width="6" height="150" fill={dark} /><rect x={x - 22} y="74" width="44" height="22" rx="3" fill="#e9f3ff" /><circle cx={x} cy="84" r="46" fill={`url(#${id}g)`} /></g>)}</>;
    case "pool": return <>{sky}
      <path d="M0 0 L220 150 L140 150Z M600 0 L400 150 L470 150Z" fill="#fff" opacity=".1" />
      <rect y="120" width="600" height="180" fill="#0c6f95" /><rect y="120" width="600" height="14" fill={darker} />
      {[0, 1, 2, 3, 4, 5].map((i) => <g key={i}><rect y={140 + i * 26} width="600" height="2" fill="#fff" opacity=".5" /><rect y={141 + i * 26} width="600" height="24" fill={i % 2 ? "#1a93bd" : "#0e7fa8"} opacity=".7" /></g>)}
      <rect y="0" width="600" height="120" fill={darker} opacity=".6" />{[60, 160, 260, 360, 460, 540].map((x) => <circle key={x} cx={x} cy="40" r="5" fill="#fff" opacity=".8" />)}</>;
    case "pint": return <>{sky}
      <ellipse cx="420" cy="170" rx="190" ry="150" fill={`url(#${id}g)`} opacity=".55" />
      <g fill={dark}>{[0, 1, 2, 3, 4].map((i) => <rect key={i} x={20 + i * 50} y={90 + (i % 2) * 24} width="42" height={210 - (i % 2) * 24} />)}</g>
      <g fill="#ffd9a0" opacity=".7">{[0, 1, 2, 3, 4].map((i) => <rect key={i} x={30 + i * 50} y={110 + (i % 2) * 24} width="8" height="12" />)}</g>
      <path d="M350 60h150l-18 220a14 14 0 0 1-14 12h-86a14 14 0 0 1-14-12z" fill="#150c07" stroke={c2} strokeWidth="2" /><path d="M347 60h156l-4 34H351z" fill="#f4ead0" /><ellipse cx="425" cy="60" rx="78" ry="10" fill="#fff8e6" /></>;
    case "glass": return <>{sky}
      <g fill={dark}>{[40, 90, 140, 470, 520].map((x, i) => <rect key={x} x={x} y={150 - i * 12} width="40" height={150 + i * 12} />)}</g>
      <path d="M200 300V90q0-34 34-34h132q34 0 34 34v210z" fill={darker} stroke={c2} strokeOpacity=".7" strokeWidth="2" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => <path key={i} d={`M200 ${100 + i * 28}h200`} stroke={c2} strokeOpacity=".28" />)}{[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M${240 + i * 30} 56V300`} stroke={c2} strokeOpacity=".22" />)}
      <rect y="262" width="600" height="38" fill="#0b1f2c" opacity=".7" /></>;
    case "hall": return <>{sky}
      {[0, 1, 2].map((i) => <g key={i}><path d={`M${30 + i * 190} 300V190a80 80 0 0 1 160 0V300z`} fill={darker} stroke={c2} strokeOpacity=".5" strokeWidth="2" />{[0, 1, 2, 3].map((j) => <path key={j} d={`M${40 + i * 190 + j * 36} 300V${200 - Math.sin((j / 3) * Math.PI) * 36}`} stroke={c2} strokeOpacity=".25" />)}</g>)}
      <circle cx="300" cy="90" r="60" fill={`url(#${id}g)`} opacity=".6" /></>;
    case "theatre": return <>{sky}
      <path d="M300 0 L190 300 H410Z" fill="#fff6d6" opacity=".12" />
      <path d="M0 0h210c-40 60-60 150-30 300H0z" fill="#5c1224" /><path d="M600 0H390c40 60 60 150 30 300h180z" fill="#5c1224" />
      {[40, 80, 120, 160].map((x) => <path key={x} d={`M${x} 0c-10 100-6 200 10 300`} stroke="#e6a95b" strokeOpacity=".35" fill="none" />)}{[440, 480, 520, 560].map((x) => <path key={x} d={`M${x} 0c10 100 6 200-10 300`} stroke="#e6a95b" strokeOpacity=".35" fill="none" />)}
      <rect y="262" width="600" height="38" fill={darker} /><ellipse cx="300" cy="262" rx="120" ry="12" fill={`url(#${id}g)`} /></>;
    case "tents": return <>{sky}
      <circle cx="430" cy="170" r="130" fill={`url(#${id}g)`} opacity=".7" />
      <path d="M0 250 C150 220 300 262 450 238 S560 240 600 250V300H0z" fill={darker} />
      {[[70, 130, 120], [210, 100, 150], [380, 120, 140], [510, 150, 100]].map(([x, y, w], i) => <g key={i}><path d={`M${x} ${y + 120}L${x + w / 2} ${y}L${x + w} ${y + 120}z`} fill={i % 2 ? "#e9d6b0" : "#f0efe6"} opacity=".92" /><path d={`M${x + w / 2} ${y}V${y + 120}`} stroke="#000" opacity=".15" /></g>)}
      <path d="M0 40Q150 90 300 40T600 40" stroke="#fff" strokeOpacity=".5" fill="none" />{[40, 120, 200, 280, 360, 440, 520].map((x, i) => <path key={x} d={`M${x} ${58 + (i % 2) * 12}l10 22l10-22z`} fill={["#f7cc7e", "#e8709f", "#7fd6e8"][i % 3]} />)}</>;
    case "golf": return <>{sky}
      <circle cx="470" cy="200" r="150" fill={`url(#${id}g)`} /><path d="M0 200C120 160 240 196 360 180S560 150 600 190V300H0z" fill="#27503a" opacity=".9" />
      <path d="M0 238C150 205 300 250 470 224S570 210 600 232V300H0z" fill="#2f6b3a" /><path d="M0 276C140 250 300 292 480 268S580 262 600 278V300H0z" fill="#3f8a47" />
      <path d="M410 268V176" stroke="#fff" strokeWidth="3" /><path d="M410 176l46 13l-46 13z" fill="#e8c35a" /><ellipse cx="410" cy="270" rx="18" ry="4" fill="#173a22" opacity=".6" />
      <g fill="#122b19" opacity=".9">{[60, 100, 520].map((x) => <path key={x} d={`M${x} 220l16-52l16 52z`} />)}</g></>;
    default: return <>{sky}
      <circle cx="380" cy="190" r="140" fill={`url(#${id}g)`} opacity=".7" />
      <path d="M0 180C140 150 260 190 400 168S560 150 600 176V300H0z" fill="#3b5b3f" opacity=".85" /><path d="M-20 300C120 230 320 210 620 250V300z" fill="#2c4a31" />
      <path d="M-20 280C140 232 340 226 620 268" stroke="#f3e2b8" strokeWidth="5" fill="none" opacity=".85" /><path d="M-20 262C140 216 340 210 620 250" stroke="#f3e2b8" strokeWidth="3" fill="none" opacity=".6" />
      {[40, 120, 200, 280, 360, 440, 520].map((x) => <rect key={x} x={x} y={246 - Math.abs(x - 300) / 22} width="4" height="22" fill="#f3e2b8" opacity=".85" />)}</>;
  }
}

export default function VenueArt({ venueId, className }: { venueId: string; className?: string }) {
  const [photo, setPhoto] = useState(true);
  const [kind, c0, c1, c2] = MAP[venueId] || MAP.V09;
  return (
    <div className={"venue-art" + (className ? " " + className : "")} aria-hidden="true">
      <svg viewBox="0 0 600 300" preserveAspectRatio="xMidYMid slice" width="100%" height="100%"><Scene kind={kind} id={"va" + venueId} c0={c0} c1={c1} c2={c2} /></svg>
      {photo && <img src={"/venues/" + venueId + ".jpg"} alt="" onError={() => setPhoto(false)} />}
    </div>
  );
}
