import type { OssState } from "../model";
import { fmtDate, fmtDateTime, fmtTime } from "../time";
import { openDrawer } from "../store";
import { nameOf } from "../selectors";

export const when = (iso?: string) => (iso ? fmtDateTime(iso) : "-");
export const span = (a: string, b: string) => fmtDate(a) + ", " + fmtTime(a) + "-" + fmtTime(b);
export const hm = (a?: string) => (a ? fmtTime(a) : "-");

/** A link that opens the canonical record drawer. */
export function RecLink({ kind, id, children }: { kind: string; id: string; children: any }) {
  return <button className="oss-link" onClick={(e) => { e.stopPropagation(); openDrawer(kind, id); }}>{children}</button>;
}
export const WorkerLink = ({ s, id }: { s: OssState; id: string }) => <RecLink kind="worker" id={id}>{nameOf(s, id)}</RecLink>;

export function csvCell(v: unknown): string {
  let t = v === null || v === undefined ? "" : String(v);
  // Formula-injection guard: text cells that start like a formula are prefixed.
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const body = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
