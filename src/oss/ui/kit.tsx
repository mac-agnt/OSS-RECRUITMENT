/* Shared building blocks for the OSS modules, styled from Pulse tokens. Icons
   extend the template's own 24px stroke set (src/logic/data.js ICONS). */

import { useEffect, useRef, type ReactNode } from "react";
import type { Coverage } from "../selectors";
import { closeDrawer, useToasts } from "../store";

export const I = {
  check: "M5 12.5l4.2 4.2L19 7",
  x: "M6 6l12 12 M18 6 6 18",
  alert: "M12 4 2.8 19.5h18.4L12 4Z M12 10v4.2 M12 17.2h.01",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7.5V12l3 2",
  dot: "M12 12h.01",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 11v5 M12 8h.01",
  minus: "M6 12h12",
  plus: "M12 5v14 M5 12h14",
  search: "m21 21-4.3-4.3 M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0",
  chevron: "m9 6 6 6-6 6",
  back: "m15 6-6 6 6 6",
  down: "M12 5v14 M6 13l6 6 6-6",
  up: "M12 19V5 M6 11l6-6 6 6",
  pin: "M12 21s6.5-5.6 6.5-11a6.5 6.5 0 1 0-13 0C5.5 15.4 12 21 12 21Z M12 12.8a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z",
  cal: "M8 4v3 M16 4v3 M4.5 9.5h15 M6.4 6h11.2A1.9 1.9 0 0 1 19.5 8v10a1.9 1.9 0 0 1-1.9 1.9H6.4A1.9 1.9 0 0 1 4.5 18V8A1.9 1.9 0 0 1 6.4 6Z",
  user: "M12 12.5a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z M5 20.2c.9-3.1 3.6-4.9 7-4.9s6.1 1.8 7 4.9",
  users: "M9 12a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 12Z M16.5 12.5a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z M2.6 19.6c.8-2.8 3.2-4.4 6.4-4.4s5.6 1.6 6.4 4.4 M17 15.4c2.2.4 3.7 1.8 4.3 4.2",
  msg: "M21 11.5a8.4 8.4 0 0 1-9 8.4 9.9 9.9 0 0 1-4-.8L3 21l1.9-4.9A8.3 8.3 0 0 1 4 11.5 8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z",
  send: "M4 12 20 4l-6 16-3-7-7-1Z",
  doc: "M6.4 3.6h7.4l4.2 4.2v12.6H6.4V3.6Z M13.4 3.8v4.2h4.2 M9 12.4h6 M9 16h4",
  shield: "M12 3.6 19.5 6v6.1c0 4-3.1 6.9-7.5 8.3-4.4-1.4-7.5-4.3-7.5-8.3V6L12 3.6Z M9.2 12.2l2 2 3.6-3.7",
  download: "M12 4v11 M7 10l5 5 5-5 M5 19.5h14",
  upload: "M12 20V9 M7 14l5-5 5 5 M5 4.5h14",
  refresh: "M20 11a8 8 0 0 0-14.3-4.6L4 8 M4 4v4h4 M4 13a8 8 0 0 0 14.3 4.6L20 16 M20 20v-4h-4",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  phone: "M8 2.8h8a1.6 1.6 0 0 1 1.6 1.6v15.2a1.6 1.6 0 0 1-1.6 1.6H8a1.6 1.6 0 0 1-1.6-1.6V4.4A1.6 1.6 0 0 1 8 2.8Z M11 18h2",
  home: "M12 3.2 3.6 9.1v10a1.5 1.5 0 0 0 1.5 1.5h13.8a1.5 1.5 0 0 0 1.5-1.5v-10L12 3.2Z",
  list: "M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01",
  inbox: "M3 13h4l1.5 3h7l1.5-3h4 M3 13l2.4-7A2 2 0 0 1 7.3 4.6h9.4a2 2 0 0 1 1.9 1.4L21 13v4.4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V13Z",
  qr: "M4 4h6v6H4V4Z M14 4h6v6h-6V4Z M4 14h6v6H4v-6Z M14 14h2v2h-2z M18 14h2 M14 18h2 M18 18h2v2",
  wifiOff: "M2 2l20 20 M8.5 16.5a5 5 0 0 1 7 0 M5 12.5a10 10 0 0 1 4-2.3 M19 12.5a10 10 0 0 0-2.4-1.6 M12 20h.01",
  play: "M7 5v14l11-7L7 5Z",
  pause: "M8 5v14 M16 5v14",
  bolt: "M13 3 5 14h6l-1 7 8-11h-6l1-7Z",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z M8 17h7a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h7",
  hand: "M8 13V6.5a1.5 1.5 0 0 1 3 0V12 M11 11.5V4.5a1.5 1.5 0 0 1 3 0v7 M14 11.5V6a1.5 1.5 0 0 1 3 0v8a6 6 0 0 1-6 6h-1a6 6 0 0 1-5-2.7l-2-3.3a1.5 1.5 0 0 1 2.5-1.6L8 14",
  swap: "M7 7h13 M16 3l4 4-4 4 M17 17H4 M8 13l-4 4 4 4",
  filter: "M4 5h16l-6 7.5V19l-4 1.5v-8L4 5Z",
  external: "M14 4h6v6 M20 4l-9 9 M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10",
  bell: "M12 4a5.5 5.5 0 0 0-5.5 5.5v3.2L5 16h14l-1.5-3.3V9.5A5.5 5.5 0 0 0 12 4Z M9.8 19a2.2 2.2 0 0 0 4.4 0",
  boot: "M7 4h5v7l6.5 2.2a2.5 2.5 0 0 1 1.7 2.4V18H4V5a1 1 0 0 1 1-1h2Z M4 15h16.2 M8 4v4",
  vest: "M8 3.5 5 6v14h5v-6h4v6h5V6l-3-2.5-2 3h-4l-2-3Z M5 11h5 M14 11h5",
  glove: "M8 21v-6L5.5 11a1.6 1.6 0 0 1 2.6-1.8L9 10.5V5a1.3 1.3 0 0 1 2.6 0v5 M11.6 4.2a1.3 1.3 0 0 1 2.6 0v5.8 M14.2 5.2a1.3 1.3 0 0 1 2.6 0v5.6 M16.8 7.2a1.3 1.3 0 0 1 2.6 0V14a7 7 0 0 1-3 5.7V21",
  hat: "M4 17h16 M5 17a7 7 0 0 1 14 0 M10 10.5V7.5a2 2 0 0 1 4 0v3",
  chart: "M4 20V10 M10 20V4 M16 20v-7 M21 20H3",
  grid: "M4 4h7v7H4V4Z M13 4h7v7h-7V4Z M4 13h7v7H4v-7Z M13 13h7v7h-7v-7Z",
  map: "M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z M9 4v14 M15 6v14",
  spark: "M12 3v4 M12 17v4 M3 12h4 M17 12h4 M6 6l2.5 2.5 M15.5 15.5 18 18 M6 18l2.5-2.5 M15.5 8.5 18 6",
  sliders: "M4 7h10 M18 7h2 M4 17h4 M12 17h8 M14 4.5v5 M8 14.5v5",
  wave: "M3 12h3l2.5-6 4 12 3-9 2 3H21",
  briefcase: "M4 8h16v11H4V8Z M9 8V5.5h6V8 M4 13h16"
};

export function Icon({ d, size = 15, sw = 1.8, style }: { d: string; size?: number; sw?: number; style?: any }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
      <path d={d} />
    </svg>
  );
}

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral" | "sim";
const toneIcon: Record<Tone, string> = { ok: I.check, warn: I.alert, bad: I.x, info: I.clock, neutral: I.minus, sim: I.info };
export function St({ tone, children, icon }: { tone: Tone; children: ReactNode; icon?: string }) {
  return <span className={"oss-st " + tone}><Icon d={icon || toneIcon[tone]} size={12} sw={2.2} />{children}</span>;
}

/** Shared status vocabulary, so the same word never means two things. */
export const STATUS: Record<string, Tone> = {
  "Confirmed": "ok", "Accepted": "ok", "Awaiting reply": "info", "Declined": "neutral", "Expired": "warn", "Withdrawn": "neutral",
  "Cancelled": "bad", "Blocked": "bad", "Needs review": "warn", "Review required": "warn", "Ready": "info", "Approved": "ok",
  "Sent to Bullhorn": "ok", "Incomplete": "bad", "In progress": "info", "Eligible": "ok", "Eligible, renewal due": "warn",
  "Availability unknown": "neutral", "Clocked in": "ok", "Clocked out": "neutral", "Not clocked in": "neutral", "Awaiting sync": "warn",
  "On the way": "info", "Running late": "warn", "On site": "ok", "Issue reported": "bad", "Not reported": "neutral",
  "Valid": "ok", "Expiring": "warn", "Expired doc": "bad", "Pending review": "warn", "Missing": "bad", "Rejected": "bad",
  "Accepted by Bullhorn": "ok", "Queued": "info", "Failed": "bad", "Open": "warn", "Resolved": "ok", "Firm": "ok", "Pending": "neutral",
  "Upcoming": "info", "Live": "ok", "Completed": "neutral", "Mapped": "ok", "Mapping pending": "warn", "Simulated": "sim", "Pending compliance": "warn", "Booked": "ok", "Finished": "neutral", "Missing clock-in": "bad", "Urgent": "warn", "Delivered": "neutral", "Read": "info", "Acknowledged": "ok", "Available": "ok", "Unavailable": "neutral", "Holiday": "neutral", "Not submitted": "warn"
};
export const S = ({ s }: { s: string }) => <St tone={STATUS[s] || "neutral"}>{s}</St>;

export function Btn({ kind, size, onClick, children, disabled, title, icon, type, block }: {
  kind?: "primary" | "ghost" | "danger" | "urgent"; size?: "sm" | "lg"; onClick?: (e: any) => void; children?: ReactNode; disabled?: boolean; title?: string; icon?: string; type?: "button" | "submit"; block?: boolean;
}) {
  return (
    <button type={type || "button"} className={["oss-btn", kind, size, block && "block"].filter(Boolean).join(" ")} onClick={onClick} disabled={disabled} title={title}>
      {icon && <Icon d={icon} size={size === "sm" ? 13 : 15} />}{children}
    </button>
  );
}

export function Page({ title, sub, actions, children, scope, eyebrow, back, bare }: { title?: ReactNode; sub?: ReactNode; actions?: ReactNode; children: ReactNode; scope?: ReactNode; eyebrow?: ReactNode; back?: { label: string; go: () => void }; bare?: boolean }) {
  if (bare) return <div className="oss-page" style={{ paddingTop: 22 }}>{children}</div>;
  return (
    <div className="oss-page">
      <div className="oss-head">
        <div className="txt">
          {back && <button className="oss-back" onClick={back.go}><Icon d={I.back} size={14} />{back.label}</button>}
          {eyebrow && <div className="oss-eyebrow">{eyebrow}</div>}
          <h1>{title}</h1>
          {sub && <div className="oss-sub">{sub}</div>}
        </div>
        {(scope || actions) && <div className="oss-head-actions">{scope}{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** The template's KPI tile: dot, label, big figure, hint. `hero` is the accent-filled lead tile. */
export function Tile({ label, value, unit, hint, color, tone, hero, onClick }: { label: string; value: ReactNode; unit?: ReactNode; hint?: ReactNode; color?: string; tone?: "ok" | "warn" | "bad"; hero?: boolean; onClick?: () => void }) {
  const cls = "oss-tile" + (hero ? " hero" : "") + (tone ? " " + tone : "");
  const inner = <><div className="l"><i style={color ? { ["--c" as any]: color } : undefined} />{label}</div><div className="v">{value}{unit && <small>{unit}</small>}</div>{hint && <div className="h">{hint}</div>}</>;
  return onClick ? <button className={cls} onClick={onClick}>{inner}</button> : <div className={cls}>{inner}</div>;
}
export const Tiles = ({ children, n }: { children: ReactNode; n?: 3 | 4 | 5 }) => <div className={"oss-tiles" + (n === 5 ? " five" : n === 3 ? " three" : "")}>{children}</div>;

/** A list row: leading visual, title and subline, trailing content. */
export function Row({ lead, title, sub, end, onClick, sel, wrap }: { lead?: ReactNode; title: ReactNode; sub?: ReactNode; end?: ReactNode; onClick?: () => void; sel?: boolean; wrap?: boolean }) {
  const inner = <>{lead}<div className="main"><div className={"t" + (wrap ? " wrap" : "")}>{title}</div>{sub && <div className={"s" + (wrap ? " wrap" : "")}>{sub}</div>}</div>{end && <div className="end">{end}</div>}</>;
  // A div with button semantics, so rows can hold their own buttons without nesting <button>s.
  return onClick
    ? <div role="button" tabIndex={0} className={"oss-r click" + (sel ? " sel" : "")} onClick={(e) => { if ((e.target as HTMLElement).closest("button,a,input,select,textarea") && e.target !== e.currentTarget) return; onClick(); }} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) { e.preventDefault(); onClick(); } }}>{inner}</div>
    : <div className={"oss-r" + (sel ? " sel" : "")}>{inner}</div>;
}
export const RIcon = ({ d, tone }: { d: string; tone?: "ok" | "warn" | "bad" | "info" }) => <span className={"oss-ricon" + (tone ? " " + tone : "")}><Icon d={d} size={16} /></span>;
export const Rule = ({ children }: { children: ReactNode }) => <div className="oss-rule"><span>{children}</span></div>;
export function Search({ value, onChange, placeholder, style }: { value: string; onChange: (v: string) => void; placeholder: string; style?: any }) {
  return <label className="oss-search" style={style}><Icon d={I.search} size={14} /><input className="oss-input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} /></label>;
}
export const Toggle = ({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) =>
  <button className={"oss-toggle" + (on ? " on" : "")} role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} />;
export const Chip = ({ on, onClick, children }: { on?: boolean; onClick: () => void; children: ReactNode }) => <button className={"oss-chip" + (on ? " on" : "")} aria-pressed={!!on} onClick={onClick}>{children}</button>;
const PPE_ICON: Record<string, string> = { "Safety boots": I.boot, "High-visibility jacket": I.vest, "Hi-vis vest": I.vest, "Gloves": I.glove, "Hard hat": I.hat };
export const ppeIcon = (p: string) => PPE_ICON[p] || I.shield;
export const PPE = ({ items }: { items: string[] }) => <div className="oss-pills">{items.map((p) => <span key={p} className="oss-pill"><Icon d={ppeIcon(p)} size={13} />{p}</span>)}</div>;
export const Scope = ({ children }: { children: ReactNode }) => <span className="oss-scope"><Icon d={I.filter} size={12} />{children}</span>;

export function Card({ title, meta, right, children, pad = true, style, id, icon, flush }: { title?: ReactNode; meta?: ReactNode; right?: ReactNode; children: ReactNode; pad?: boolean; style?: any; id?: string; icon?: string; flush?: boolean }) {
  return (
    <section className="oss-card" style={style} id={id}>
      {(title || right) && (
        <div className="oss-card-h">
          {icon && <span className="ico"><Icon d={icon} size={16} /></span>}
          {title && <div className="ttl"><h2>{title}</h2>{meta && <span className="meta">{meta}</span>}</div>}
          {right && <div className="right">{right}</div>}
        </div>
      )}
      {flush ? <div className="oss-card-b flush">{children}</div> : pad ? <div className="oss-card-b">{children}</div> : children}
    </section>
  );
}

export function Seg<T extends string>({ options, value, onChange, label }: { options: { id: T; label: string; n?: number | string }[]; value: T; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="oss-seg" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} role="tab" aria-selected={o.id === value} className={o.id === value ? "on" : ""} onClick={() => onChange(o.id)}>
          {o.label}{o.n !== undefined && <span className="n">{o.n}</span>}
        </button>
      ))}
    </div>
  );
}

export interface Col<R> { key: string; label: ReactNode; num?: boolean; nowrap?: boolean; render: (r: R) => ReactNode; width?: string; foot?: ReactNode }
export function Table<R>({ cols, rows, rowKey, onRow, empty, selected, flash, maxHeight, foot }: {
  cols: Col<R>[]; rows: R[]; rowKey: (r: R) => string; onRow?: (r: R) => void; empty?: ReactNode; selected?: string | null; flash?: string[]; maxHeight?: number | string; foot?: boolean;
}) {
  return (
    <div className="oss-tw" style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}>
      <table className="oss-table">
        <thead><tr>{cols.map((c) => <th key={c.key} className={c.num ? "num" : ""} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => {
            const k = rowKey(r);
            return (
              <tr key={k} className={[onRow && "click", selected === k && "sel", flash?.includes(k) && "flash"].filter(Boolean).join(" ")}
                tabIndex={onRow ? 0 : undefined} onClick={onRow ? () => onRow(r) : undefined}
                onKeyDown={onRow ? (e) => { if (e.key === "Enter") onRow(r); } : undefined}>
                {cols.map((c) => <td key={c.key} className={[c.num && "num", c.nowrap && "nowrap"].filter(Boolean).join(" ")}>{c.render(r)}</td>)}
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={cols.length}>{empty || <Empty title="Nothing here" body="No records match these filters." />}</td></tr>}
        </tbody>
        {foot && rows.length > 0 && <tfoot><tr>{cols.map((c) => <td key={c.key} className={c.num ? "num" : ""}>{c.foot}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}

export function Empty({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return <div className="oss-empty"><b>{title}</b>{body}{action && <div style={{ marginTop: 12 }}>{action}</div>}</div>;
}

export function Metric({ label, value, sub, tone, onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "warn" | "bad" | "ok"; onClick?: () => void }) {
  const inner = <><div className="l">{label}</div><div className="v">{value}</div>{sub && <div className="s">{sub}</div>}</>;
  return onClick ? <button className={"oss-metric " + (tone || "")} onClick={onClick}>{inner}</button> : <div className={"oss-metric " + (tone || "")}>{inner}</div>;
}

export function Cov({ c, compact }: { c: Coverage; compact?: boolean }) {
  const w = (n: number) => (c.required ? (n / c.required) * 100 : 0) + "%";
  return (
    <span className="oss-cov" title={c.confirmed + " confirmed, " + c.awaiting + " awaiting reply, " + c.unfilled + " unfilled of " + c.required}>
      <span className="bar"><i className="c" style={{ width: w(c.confirmed) }} /><i className="a" style={{ width: w(c.awaiting) }} /></span>
      <span className="t">{c.confirmed}/{c.required}{!compact && c.awaiting ? <span style={{ fontWeight: 400, color: "var(--dim)" }}>{" · " + c.awaiting + " awaiting"}</span> : null}</span>
    </span>
  );
}

export function Field({ label, children, help, err }: { label: string; children: ReactNode; help?: ReactNode; err?: ReactNode }) {
  return <div className="oss-field"><label>{label}</label>{children}{help && <div className="help">{help}</div>}{err && <div className="err">{err}</div>}</div>;
}

export function Drawer({ eyebrow, title, onClose, children, footer, wide, labelledBy = "oss-drawer-title" }: { eyebrow?: ReactNode; title: ReactNode; onClose?: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; labelledBy?: string }) {
  const close = onClose || closeDrawer;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); prev?.focus?.(); };
  }, []);
  return (
    <div className="oss-scrim" onClick={close}>
      <div className={"oss-drawer" + (wide ? " wide" : "")} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="oss-drawer-h">
          <div style={{ flex: 1, minWidth: 0 }}>
            {eyebrow && <div className="eyebrow">{eyebrow}</div>}
            <h2 id={labelledBy}>{title}</h2>
          </div>
          <button className="oss-x" onClick={close} aria-label="Close"><Icon d={I.x} size={13} sw={2.2} /></button>
        </div>
        <div className="oss-drawer-b">{children}</div>
        {footer && <div className="oss-drawer-f">{footer}</div>}
      </div>
    </div>
  );
}

export const Section = ({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) => (
  <div className="oss-section"><h3 style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ flex: 1 }}>{title}</span>{right}</h3>{children}</div>
);
export const KV = ({ items }: { items: [ReactNode, ReactNode][] }) => (
  <div className="oss-kv">{items.map(([k, v], i) => <div key={i}><div className="k">{k}</div><div className="v">{v}</div></div>)}</div>
);
const hueOf = (name: string) => { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360; return 170 + (h % 70); };
export const initials = (name: string) => name.split(" ").map((p) => p[0]).filter(Boolean).slice(0, 2).join("");
export const Av = ({ name, lg, size }: { name: string; lg?: boolean; size?: "sm" | "lg" | "xl" }) =>
  <span className={"oss-av" + (size ? " " + size : lg ? " lg" : "")} style={{ ["--h" as any]: hueOf(name) }} aria-hidden="true">{initials(name)}</span>;
export function Faces({ names, max = 5 }: { names: string[]; max?: number }) {
  return <span className="oss-faces">{names.slice(0, max).map((n, i) => <Av key={n + i} name={n} size="sm" />)}{names.length > max && <span className="more">+{names.length - max}</span>}</span>;
}
export function Reason({ level, children }: { level: "ok" | "warn" | "block" | "unknown"; children: ReactNode }) {
  const map = { ok: [I.check, "var(--ok)"], warn: [I.alert, "var(--warn)"], block: [I.x, "var(--bad)"], unknown: [I.info, "var(--dim)"] } as const;
  return <div className="oss-reason"><Icon d={map[level][0]} size={13} sw={2.2} style={{ color: map[level][1] }} /><span>{children}</span></div>;
}

export function Toasts() {
  const list = useToasts();
  return (
    <div className="oss-toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={"oss-toast" + (t.ok ? "" : " bad")}>
          <Icon d={t.ok ? I.check : I.alert} size={15} style={{ color: t.ok ? "var(--ok)" : "var(--bad)", marginTop: 1 }} />
          <span style={{ flex: 1 }}>{t.text}</span>
          {t.action && <button className="oss-btn sm" onClick={t.action.run}>{t.action.label}</button>}
        </div>
      ))}
    </div>
  );
}

export function useHashFocus(id: string | undefined, deps: any[]) {
  useEffect(() => {
    if (!id) return;
    const el = document.getElementById(id);
    el?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, deps);
}

/** 24-hour time picker. Native time inputs follow the browser locale (often 12-hour), so this is a select. */
const TIMES = Array.from({ length: 288 }, (_, i) => String(Math.floor(i / 12)).padStart(2, "0") + ":" + String((i % 12) * 5).padStart(2, "0"));
export function TimeSelect({ value, onChange, id, label, style }: { value: string; onChange: (v: string) => void; id?: string; label?: string; style?: any }) {
  const opts = TIMES.includes(value) ? TIMES : TIMES.concat([value]).sort();
  return <select id={id} className="oss-input" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} style={style}>{opts.map((t) => <option key={t} value={t}>{t}</option>)}</select>;
}

/** One square per position: filled = confirmed, ring = awaiting reply, empty = open. */
export function Seats({ c }: { c: Coverage }) {
  return <div className="oss-seats" aria-label={c.confirmed + " confirmed, " + c.awaiting + " awaiting, " + c.unfilled + " open of " + c.required}>
    {Array.from({ length: c.required }).map((_, i) => <i key={i} className={i < c.confirmed ? "c" : i < c.confirmed + c.awaiting ? "a" : ""} />)}
  </div>;
}

/* ── layout primitives: so pages don't all open with four tiles ─────────── */
export type Tone4 = "ok" | "warn" | "bad" | "accent" | "neutral" | "urgent";
const TONE_VAR: Record<Tone4, string> = { ok: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)", accent: "var(--accent)", neutral: "var(--neutral)", urgent: "#F6881F" };
export const toneVar = (t?: Tone4) => (t ? TONE_VAR[t] : "var(--ink)");

/** One quiet strip of figures in a single card, divided by hairlines. Use when the numbers are context, not the headline. */
export function Ribbon({ items, className }: { items: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone4; onClick?: () => void }[]; className?: string }) {
  return (
    <div className={"oss-ribbon" + (className ? " " + className : "")}>
      {items.map((x, i) => {
        const inner = <><span className="l">{x.label}</span><span className="v" style={x.tone ? { color: toneVar(x.tone) } : undefined}>{x.value}</span>{x.sub && <span className="s">{x.sub}</span>}</>;
        return x.onClick ? <button key={i} className="it" onClick={x.onClick}>{inner}</button> : <div key={i} className="it">{inner}</div>;
      })}
    </div>
  );
}

/** Donut gauge. `value` of `max`, centre shows `label` (defaults to value) and `sub`. */
export function Ring({ value, max, size = 96, stroke = 9, tone = "accent", label, sub, track }: { value: number; max: number; size?: number; stroke?: number; tone?: Tone4; label?: ReactNode; sub?: ReactNode; track?: string }) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  const p = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <span className="oss-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track || "var(--track)"} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={toneVar(tone)} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <span className="in"><b style={{ fontSize: Math.round(size * 0.24) }}>{label ?? value}</b>{sub && <small>{sub}</small>}</span>
    </span>
  );
}

/** Segmented bar with optional legend: confirmed / awaiting / open, or any parts of a whole. */
export function Meter({ parts, total, height = 10, legend = true }: { parts: { n: number; tone: Tone4; label: string }[]; total?: number; height?: number; legend?: boolean }) {
  const t = total ?? parts.reduce((a, b) => a + b.n, 0);
  return (
    <div className="oss-meter">
      <div className="bar" style={{ height }}>{parts.map((p, i) => p.n > 0 && <i key={i} style={{ width: (t ? (p.n / t) * 100 : 0) + "%", background: toneVar(p.tone) }} title={p.n + " " + p.label} />)}</div>
      {legend && <div className="lg">{parts.map((p, i) => <span key={i}><i style={{ background: toneVar(p.tone) }} /><b>{p.n}</b>{p.label}</span>)}</div>}
    </div>
  );
}

/** Page hero: a banner card in place of the page title + tiles, for a record or a "now" page. */
export function Hero({ eyebrow, title, sub, aside, children, back, actions, tone }: { eyebrow?: ReactNode; title: ReactNode; sub?: ReactNode; aside?: ReactNode; children?: ReactNode; back?: { label: string; go: () => void }; actions?: ReactNode; tone?: "accent" | "urgent" | "plain" }) {
  return (
    <section className={"oss-hero " + (tone || "accent")}>
      <div className="main">
        {back && <button className="oss-back" onClick={back.go}><Icon d={I.back} size={14} />{back.label}</button>}
        {eyebrow && <div className="oss-eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
        {actions && <div className="acts">{actions}</div>}
        {children}
      </div>
      {aside && <div className="aside">{aside}</div>}
    </section>
  );
}

/** Funnel: horizontal stages narrowing, with the step-to-step conversion between them. */
export function Funnel({ stages, onPick, active }: { stages: { id?: string; label: string; n: number; sub?: ReactNode; tone?: Tone4 }[]; onPick?: (id: string) => void; active?: string }) {
  const max = Math.max(1, ...stages.map((x) => x.n));
  return (
    <div className="oss-funnel">
      {stages.map((x, i) => {
        const prev = i > 0 ? stages[i - 1].n : 0;
        const body = <><span className="lab">{x.label}</span><span className="bar"><i style={{ width: Math.max(4, (x.n / max) * 100) + "%", background: toneVar(x.tone || "accent") }} /></span><b className="n">{x.n}</b>{x.sub && <span className="sub">{x.sub}</span>}</>;
        return (
          <div key={i} className="st">
            {i > 0 && <span className="conv">{prev ? Math.round((x.n / prev) * 100) + "%" : "-"}</span>}
            {onPick && x.id ? <button className={"row" + (active === x.id ? " on" : "")} onClick={() => onPick(x.id!)}>{body}</button> : <div className="row">{body}</div>}
          </div>);
      })}
    </div>
  );
}

/** Stepper: a pipeline of states with counts, e.g. approved, queued, sent, accepted. */
export function Steps({ steps }: { steps: { label: string; n: ReactNode; sub?: ReactNode; tone?: Tone4; on?: boolean }[] }) {
  return (
    <ol className="oss-steps">
      {steps.map((x, i) => (
        <li key={i} className={x.on ? "on" : ""}>
          <span className="dot" style={x.tone ? { background: toneVar(x.tone), borderColor: "transparent" } : undefined} />
          <span className="l">{x.label}</span>
          <b className="n" style={x.tone ? { color: toneVar(x.tone) } : undefined}>{x.n}</b>
          {x.sub && <span className="s">{x.sub}</span>}
        </li>))}
    </ol>
  );
}

/** A big figure with a label, no card. For heroes and side panels. */
export function Figure({ value, label, sub, tone, size = "md" }: { value: ReactNode; label: ReactNode; sub?: ReactNode; tone?: Tone4; size?: "sm" | "md" | "lg" }) {
  return <div className={"oss-figure " + size}><span className="l">{label}</span><b style={tone ? { color: toneVar(tone) } : undefined}>{value}</b>{sub && <span className="s">{sub}</span>}</div>;
}

/* ── category colour: one meaning per hue, used the same way on every page ─ */
/** Event kinds and regions each own a hue (--k-1 to --k-6). Status keeps ok/warn/bad; orange stays urgent-only. */
const KIND_IDX: Record<string, number> = { Concert: 1, Sport: 2, Corporate: 3, Conference: 4, Festival: 5, Exhibition: 6 };
const REGION_IDX: Record<string, number> = { Dublin: 4, Leinster: 2, Munster: 1, Connacht: 5, Ulster: 6 };
export const kindVar = (kind: string) => "var(--k-" + (KIND_IDX[kind] || 4) + ")";
export const regionVar = (region: string) => "var(--k-" + (REGION_IDX[region] || 4) + ")";
/** Each OSS desk owns a hue, the same on every page. */
const DESK_IDX: Record<string, number> = { "Dublin events desk": 4, "Stadia and sport desk": 2, "Live music and theatre desk": 1, "Corporate and hospitality desk": 3, "Cork and Munster desk": 6, "West and North desk": 5 };
export const deskVar = (desk: string) => "var(--k-" + (DESK_IDX[desk] || 4) + ")";
/** Stable hue for anything else with a name (clients, roles). */
export const hueVar = (key: string) => { let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return "var(--k-" + ((h % 6) + 1) + ")"; };
/** Tinted label in a category colour. */
export function Tag({ c, children, solid, dot = true, title }: { c: string; children: ReactNode; solid?: boolean; dot?: boolean; title?: string }) {
  return <span className={"oss-tagc" + (solid ? " solid" : "")} style={{ ["--c" as any]: c }} title={title}>{dot && !solid && <i />}{children}</span>;
}

/* ── Ireland map: equirectangular, cos(lat) corrected, coastline simplified ─ */
const COAST: [number, number][] = [[55.38, -7.37], [55.24, -6.95], [55.21, -6.52], [55.22, -6.15], [55.05, -5.98], [54.85, -5.74], [54.67, -5.75], [54.55, -5.48], [54.38, -5.47], [54.22, -5.85], [54.05, -6.06], [54.01, -6.36], [53.86, -6.24], [53.72, -6.25], [53.55, -6.1], [53.39, -6.06], [53.28, -6.11], [53.15, -6.06], [52.97, -6.0], [52.8, -6.14], [52.6, -6.2], [52.4, -6.36], [52.18, -6.36], [52.18, -6.58], [52.12, -6.93], [52.15, -7.15], [52.08, -7.6], [51.95, -7.85], [51.86, -8.1], [51.8, -8.27], [51.7, -8.5], [51.6, -8.85], [51.53, -9.3], [51.45, -9.82], [51.6, -9.75], [51.65, -10.15], [51.8, -10.05], [51.9, -10.35], [52.05, -10.05], [52.1, -10.5], [52.27, -10.1], [52.27, -9.85], [52.45, -9.75], [52.56, -9.93], [52.65, -9.62], [52.8, -9.5], [52.97, -9.43], [53.13, -9.27], [53.17, -9.02], [53.27, -9.05], [53.25, -9.5], [53.4, -10.2], [53.49, -10.02], [53.6, -9.85], [53.8, -9.95], [53.95, -10.2], [54.1, -9.95], [54.25, -10.05], [54.3, -9.6], [54.33, -9.35], [54.22, -9.2], [54.27, -8.85], [54.3, -8.6], [54.48, -8.28], [54.62, -8.45], [54.62, -8.75], [54.7, -8.75], [54.85, -8.45], [54.98, -8.45], [55.15, -8.28], [55.2, -7.98], [55.27, -7.63], [55.15, -7.47], [55.38, -7.37]];
const LAT0 = 51.35, LAT1 = 55.45, LNG0 = -10.65, LNG1 = -5.35, KX = Math.cos((53.4 * Math.PI) / 180);
export const MAP_W = Math.round((LNG1 - LNG0) * KX * 100), MAP_H = Math.round((LAT1 - LAT0) * 100);
export const project = (lat: number, lng: number): [number, number] => [(lng - LNG0) * KX * 100, (LAT1 - lat) * 100];
const COAST_D = COAST.map(([a, b], i) => { const [x, y] = project(a, b); return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1); }).join("") + "Z";
export interface MapPin { id: string; lat: number; lng: number; c: string; r?: number; label?: string; pulse?: boolean; on?: boolean }
/** Pins on a quiet silhouette of Ireland. `r` scales with headcount; `pulse` marks live work. */
export function IrelandMap({ pins, onPick, height = 420, labels = true }: { pins: MapPin[]; onPick?: (id: string) => void; height?: number; labels?: boolean }) {
  return (
    <svg className="oss-ireland" viewBox={`0 0 ${MAP_W} ${MAP_H}`} style={{ height, maxWidth: "100%" }} role="img" aria-label="Map of Ireland with today's events">
      <defs><pattern id="oss-dots" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.1" fill="var(--track)" /></pattern></defs>
      <path d={COAST_D} fill="url(#oss-dots)" stroke="var(--border-strong)" strokeWidth="1.2" strokeLinejoin="round" />
      {pins.slice().sort((a, b) => Number(!!a.on) - Number(!!b.on)).map((p) => { const [x, y] = project(p.lat, p.lng); const r = p.r || 6; return (
        <g key={p.id} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} className={"pin" + (p.on ? " on" : "") + (onPick ? " click" : "")} onClick={onPick ? () => onPick(p.id) : undefined} style={{ ["--c" as any]: p.c }}>
          {p.pulse && <circle r={r + 6} className="halo" />}
          <circle r={r} className="core" />
          {labels && p.label && <text x={r + 5} y={4} className="lbl">{p.label}</text>}
          <title>{p.label}</title>
        </g>); })}
    </svg>
  );
}
