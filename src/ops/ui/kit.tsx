/* UI kit for the OSS events app: icons, buttons, status, tables, tabs, form
   fields, drawers, dialogs, menus and toasts. Plain CSS in ops.css. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Tone } from "../selectors";
import { useToasts } from "../store";

/* ── icons (24px grid, stroke) ──────────────────────────────────────────── */
export const I = {
  today: "M3 10.5 12 3l9 7.5V21H3z M9 21v-7h6v7",
  events: "M4 6h16v14H4z M4 10h16 M8 3v5 M16 3v5",
  crew: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1 M16 3.5a4 4 0 0 1 0 7.5 M22 21v-1a6 6 0 0 0-4-5.6",
  comms: "M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z",
  hours: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7v5l3 2",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z M8.5 12l2.5 2.5 4.5-5",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M20 20l-3.5-3.5",
  plus: "M12 5v14 M5 12h14",
  chevL: "M15 18l-6-6 6-6", chevR: "M9 6l6 6-6 6", chevD: "M6 9l6 6 6-6", chevU: "M6 15l6-6 6 6",
  check: "M5 12.5l4.5 4.5L19 7",
  x: "M6 6l12 12 M18 6 6 18",
  alert: "M12 9v4 M12 17h.01 M10.3 3.9 2.4 18a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 11v5 M12 8h.01",
  phone: "M5 4h3.5l1.8 4.5-2.3 1.4a11 11 0 0 0 6.1 6.1l1.4-2.3L20 15.5V19a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  send: "M22 2 11 13 M22 2l-7 20-4-9-9-4z",
  pin: "M12 21s-7-6.2-7-11a7 7 0 1 1 14 0c0 4.8-7 11-7 11z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0",
  download: "M12 3v12 M7 10l5 5 5-5 M5 21h14",
  upload: "M12 17V5 M7 10l5-5 5 5 M5 21h14",
  refresh: "M20 11a8 8 0 0 0-14.9-4 M4 4v4h4 M4 13a8 8 0 0 0 14.9 4 M20 20v-4h-4",
  edit: "M4 20h4L19 9l-4-4L4 16z M14 6l4 4",
  trash: "M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3",
  lock: "M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  time: "M12 21a9 9 0 1 0-9-9 M3 4v5h5 M12 7v5l3 2",
  qr: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h2v2h-2z M18 18h2v2h-2z M14 18h2 M18 14h2",
  gps: "M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  wifiOff: "M2 2l20 20 M8.5 16.5a5 5 0 0 1 7 0 M5 12.5a10 10 0 0 1 5.2-2.8 M19 12.5a10 10 0 0 0-2.2-1.6 M2 8.8a15 15 0 0 1 4.2-2.6 M22 8.8A15 15 0 0 0 10.7 5 M12 20h.01",
  jobs: "M4 8h16v12H4z M9 8V5h6v3 M4 13h16",
  list: "M8 6h12 M8 12h12 M8 18h12 M4 6h.01 M4 12h.01 M4 18h.01",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4",
  client: "M4 21V5l8-2v18 M12 9h8v12 M8 8h.01 M8 12h.01 M8 16h.01 M16 13h.01 M16 17h.01 M2 21h20",
  sync: "M17 1l4 4-4 4 M3 11V9a4 4 0 0 1 4-4h14 M7 23l-4-4 4-4 M21 13v2a4 4 0 0 1-4 4H3",
  arrowR: "M5 12h14 M13 6l6 6-6 6",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  filter: "M3 5h18l-7 8v6l-4 2v-8z",
  bus: "M5 17h14V6a3 3 0 0 0-3-3H8a3 3 0 0 0-3 3z M5 11h14 M8 21v-4 M16 21v-4 M8 14h.01 M16 14h.01",
  logout: "M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4 M10 17l5-5-5-5 M15 12H3",
  play: "M7 4v16l13-8z",
  standby: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M10 9v6 M14 9v6"
};
export function Icon({ d, size = 16, sw = 1.8, className }: { d: string; size?: number; sw?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={d === I.more ? 3 : sw}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d.split(" M").map((p, i) => <path key={i} d={(i ? "M" : "") + p} />)}
    </svg>
  );
}

/* ── buttons ────────────────────────────────────────────────────────────── */
type BtnKind = "primary" | "secondary" | "ghost" | "quiet" | "danger";
export function Btn({ kind = "secondary", size, icon, children, onClick, disabled, block, title, type = "button", iconOnly, className }: {
  kind?: BtnKind; size?: "sm" | "lg"; icon?: string; children?: ReactNode; onClick?: () => void; disabled?: boolean; block?: boolean;
  title?: string; type?: "button" | "submit"; iconOnly?: boolean; className?: string;
}) {
  const cls = ["btn", kind !== "secondary" && kind, size, block && "block", iconOnly && "icon", className].filter(Boolean).join(" ");
  return (
    <button type={type} className={cls} onClick={onClick} disabled={disabled} title={title} aria-label={iconOnly ? title : undefined}>
      {icon && <Icon d={icon} size={size === "lg" ? 18 : 15} />}
      {children}
    </button>
  );
}

/* ── status ─────────────────────────────────────────────────────────────── */
export const Status = ({ tone, children, plain, title }: { tone: Tone; children: ReactNode; plain?: boolean; title?: string }) =>
  <span className={"status " + tone + (plain ? " plain" : "")} title={title}>{children}</span>;
export const Count = ({ n, tone }: { n: number; tone?: "bad" | "warn" | "accent" }) => (n > 0 ? <span className={"count" + (tone ? " " + tone : "")}>{n > 999 ? "999+" : n}</span> : null);
export const Tag = ({ children, sim, title }: { children: ReactNode; sim?: boolean; title?: string }) => <span className={"tag" + (sim ? " sim" : "")} title={title}>{children}</span>;
export const Sim = ({ children = "Simulated" }: { children?: ReactNode }) => <span className="tag sim" title="Demo only: no external system is connected">{children}</span>;
export function Meter({ value, max, tone }: { value: number; max: number; tone?: Tone }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <span className={"meter" + (tone ? " " + tone : "")} role="img" aria-label={value + " of " + max}><i style={{ width: pct + "%" }} /></span>;
}
export const initials = (name: string) => name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
export const Avatar = ({ name, size }: { name: string; size?: "sm" | "lg" }) => <span className={"avatar" + (size ? " " + size : "")} aria-hidden="true">{initials(name)}</span>;

/* ── layout ─────────────────────────────────────────────────────────────── */
export function Panel({ title, meta, right, children, flush, className, id }: { title?: ReactNode; meta?: ReactNode; right?: ReactNode; children: ReactNode; flush?: boolean; className?: string; id?: string }) {
  return (
    <section className={"panel" + (className ? " " + className : "")} id={id}>
      {(title || right) && <div className="panel-h"><div className="stack" style={{ gap: 1 }}>{typeof title === "string" ? <h2>{title}</h2> : title}{meta && <span className="meta">{meta}</span>}</div>{right && <div className="row wrap">{right}</div>}</div>}
      <div className={"panel-b" + (flush ? " flush" : "")}>{children}</div>
    </section>
  );
}
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty"><b>{title}</b>{children && <div>{children}</div>}{action && <div style={{ marginTop: 12 }}>{action}</div>}</div>;
}
export function Notice({ tone, children, icon }: { tone?: "warn" | "bad" | "ok" | "info"; children: ReactNode; icon?: string }) {
  return <div className={"notice" + (tone ? " " + tone : "")} role={tone === "bad" ? "alert" : undefined}><Icon d={icon || (tone === "ok" ? I.check : tone === "info" || !tone ? I.info : I.alert)} />
    <div className="grow">{children}</div></div>;
}
export const KV = ({ items }: { items: [ReactNode, ReactNode][] }) => (
  <dl className="kv">{items.map(([k, v], i) => <div key={i} style={{ display: "contents" }}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
);

/* ── tabs, segmented ────────────────────────────────────────────────────── */
export function Tabs<T extends string>({ items, value, onChange, label }: { items: { id: T; label: string; n?: number; tone?: "bad" | "warn" | "accent" }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((t) => <button key={t.id} role="tab" aria-selected={value === t.id} className={value === t.id ? "on" : ""} onClick={() => onChange(t.id)}>
        {t.label}{t.n !== undefined && t.n > 0 && <Count n={t.n} tone={t.tone} />}</button>)}
    </div>
  );
}
export function Seg<T extends string>({ items, value, onChange, label }: { items: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {items.map((t) => <button key={t.id} role="radio" aria-checked={value === t.id} className={value === t.id ? "on" : ""} onClick={() => onChange(t.id)}>{t.label}</button>)}
    </div>
  );
}

/* ── form fields ────────────────────────────────────────────────────────── */
let fid = 0;
export const useId = (prefix = "f") => { const r = useRef(""); if (!r.current) r.current = prefix + "-" + ++fid; return r.current; };
export function Field({ label, help, err, children, id }: { label: ReactNode; help?: ReactNode; err?: ReactNode; children: ReactNode; id?: string }) {
  return <div className="field"><label htmlFor={id}>{label}</label>{children}{help && !err && <span className="help">{help}</span>}{err && <span className="err" role="alert">{err}</span>}</div>;
}
export function Search({ value, onChange, placeholder, label, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; label?: string; autoFocus?: boolean }) {
  return (
    <div className="searchbox">
      <Icon d={I.search} size={15} />
      <input className="input" type="search" value={value} placeholder={placeholder} aria-label={label || placeholder} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
export function Select({ value, onChange, options, label, id, sm, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label?: string; id?: string; sm?: boolean; placeholder?: string }) {
  return (
    <select id={id} className={"select" + (sm ? " sm" : "")} value={value} aria-label={id ? undefined : label} onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
export const Check = ({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children?: ReactNode; disabled?: boolean }) => (
  <label className="check"><input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />{children}</label>
);
export const Toggle = ({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: ReactNode }) => (
  <label className="toggle"><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} /><i />{children}</label>
);

/* ── table ──────────────────────────────────────────────────────────────── */
export interface Col<R> { key: string; label: ReactNode; render: (r: R) => ReactNode; cls?: string; width?: string | number; hide?: "md" | "sm" }
export function Table<R>({ cols, rows, rowKey, onRow, empty, selected, onSelect, foot, maxHeight, groupBy, label }: {
  cols: Col<R>[]; rows: R[]; rowKey: (r: R) => string; onRow?: (r: R) => void; empty?: ReactNode; label?: string;
  selected?: Set<string>; onSelect?: (key: string, on: boolean) => void; foot?: ReactNode; maxHeight?: number; groupBy?: (r: R) => string;
}) {
  if (!rows.length) return <>{empty || <Empty title="Nothing to show" />}</>;
  const allOn = !!selected && rows.every((r) => selected.has(rowKey(r)));
  const hideCls = (c: Col<R>) => [c.cls, c.hide ? "hide-" + c.hide : ""].filter(Boolean).join(" ") || undefined;
  let last = "";
  return (
    <div className="tbl-wrap" style={maxHeight ? { maxHeight } : undefined}>
      <table className="tbl" aria-label={label}>
        <thead><tr>
          {onSelect && <th className="check"><input type="checkbox" aria-label="Select all" checked={allOn} onChange={(e) => rows.forEach((r) => onSelect(rowKey(r), e.target.checked))} /></th>}
          {cols.map((c) => <th key={c.key} className={hideCls(c)} style={c.width ? { width: c.width } : undefined}>{c.label}</th>)}
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const k = rowKey(r);
            const g = groupBy?.(r);
            const head = g !== undefined && g !== last ? (last = g, <tr key={"g-" + g}><td className="group" colSpan={cols.length + (onSelect ? 1 : 0)}>{g}</td></tr>) : null;
            return [head,
              <tr key={k} className={(onRow ? "click " : "") + (selected?.has(k) ? "sel" : "")} onClick={onRow ? () => onRow(r) : undefined}
                tabIndex={onRow ? 0 : undefined} onKeyDown={onRow ? (e) => { if (e.key === "Enter") onRow(r); } : undefined}>
                {onSelect && <td className="check" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label="Select row" checked={!!selected?.has(k)} onChange={(e) => onSelect(k, e.target.checked)} /></td>}
                {cols.map((c) => <td key={c.key} className={hideCls(c)} data-label={typeof c.label === "string" && c.label ? c.label : undefined}>{c.render(r)}</td>)}
              </tr>];
          })}
        </tbody>
        {foot && <tfoot>{foot}</tfoot>}
      </table>
    </div>
  );
}
export function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (total <= size) return null;
  return (
    <div className="pager">
      <span>{page * size + 1}-{Math.min(total, (page + 1) * size)} of {total.toLocaleString("en-IE")}</span>
      <div className="row">
        <Btn size="sm" icon={I.chevL} disabled={page === 0} onClick={() => onPage(page - 1)} title="Previous page" iconOnly />
        <span className="num">Page {page + 1} of {pages}</span>
        <Btn size="sm" icon={I.chevR} disabled={page >= pages - 1} onClick={() => onPage(page + 1)} title="Next page" iconOnly />
      </div>
    </div>
  );
}

/* ── overlays ───────────────────────────────────────────────────────────── */
function useEsc(fn: () => void) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") fn(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [fn]);
}
export function Drawer({ title, sub, onClose, children, footer, wide }: { title: ReactNode; sub?: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEsc(onClose);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className={"drawer" + (wide ? " wide" : "")} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined} ref={ref} tabIndex={-1}>
        <div className="drawer-h"><div className="grow"><h2>{title}</h2>{sub && <div className="sub">{sub}</div>}</div><Btn kind="quiet" icon={I.x} iconOnly title="Close" onClick={onClose} /></div>
        <div className="drawer-b">{children}</div>
        {footer && <div className="drawer-f">{footer}</div>}
      </div>
    </>
  );
}
export function Dialog({ title, children, onClose, actions }: { title: string; children: ReactNode; onClose: () => void; actions: ReactNode }) {
  useEsc(onClose);
  return (
    <>
      <div className="scrim" onClick={onClose} aria-hidden="true" />
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div style={{ margin: "8px 0 16px", color: "var(--body)" }}>{children}</div>
        <div className="formbar">{actions}</div>
      </div>
    </>
  );
}
/** A button that opens a small menu or panel below it. */
export function Popover({ button, children, align = "right", width }: { button: (open: boolean, toggle: () => void) => ReactNode; children: (close: () => void) => ReactNode; align?: "left" | "right"; width?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", h); window.addEventListener("keydown", k);
    return () => { document.removeEventListener("mousedown", h); window.removeEventListener("keydown", k); };
  }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      {button(open, () => setOpen((o) => !o))}
      {open && <div className="popover" style={{ [align]: 0, top: "calc(100% + 6px)", width }}>{children(() => setOpen(false))}</div>}
    </div>
  );
}

/* ── toasts ─────────────────────────────────────────────────────────────── */
export function Toasts() {
  const list = useToasts();
  return (
    <div className="toasts" aria-live="polite" role="status">
      {list.map((t) => <div key={t.id} className={"toast" + (t.ok ? "" : " bad")}><Icon d={t.ok ? I.check : I.alert} /><span>{t.text}</span></div>)}
    </div>
  );
}

/* ── CSV download ───────────────────────────────────────────────────────── */
export function csvCell(v: unknown): string {
  const s = String(v ?? "");
  // Neutralise spreadsheet formulas and quote when needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
  return /[",\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe;
}
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const text = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
