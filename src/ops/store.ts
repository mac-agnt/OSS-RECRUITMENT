/* One shared local store. Office, supervisor and crew screens all read it, so a
   change on the phone shows up on the desk at once. Saved in this browser only,
   under its own key; other tabs on this computer stay in sync. */

import { useSyncExternalStore } from "react";
import type { OpsState, Result, Ui } from "./model";
import { buildSeed, OPS_VERSION } from "./seed";
import { todayKey } from "./time";

const KEY = "oss-ops-demo:" + OPS_VERSION;

function fresh(): OpsState { return buildSeed(todayKey()); }
function load(): OpsState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as OpsState;
      if (s && s.version === OPS_VERSION && Array.isArray(s.workers)) return s;
    }
  } catch { /* storage unavailable or corrupt: start from the seed */ }
  return fresh();
}

let state: OpsState = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveError = false;

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); saveError = false; }
    catch { if (!saveError) { saveError = true; toast(false, "Changes can't be saved in this browser (storage is full or blocked). They will last until you close the tab."); } }
  }, 150);
}
function commit(next: OpsState) {
  state = next;
  persist();
  listeners.forEach((f) => f());
}

export const getState = () => state;
export function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function useOps(): OpsState { return useSyncExternalStore(subscribe, getState, getState); }

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try { const s = JSON.parse(e.newValue) as OpsState; if (s.version === OPS_VERSION) { state = s; listeners.forEach((f) => f()); } } catch { /* ignore */ }
  });
}

/* ── toasts ─────────────────────────────────────────────────────────────── */
export interface Toast { id: number; ok: boolean; text: string }
let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
let toastN = 0;
export function toast(ok: boolean, text: string) {
  const t = { id: ++toastN, ok, text };
  toasts = toasts.concat([t]).slice(-3);
  toastListeners.forEach((f) => f());
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); toastListeners.forEach((f) => f()); }, ok ? 4200 : 7000);
}
export function useToasts() {
  return useSyncExternalStore((f) => { toastListeners.add(f); return () => { toastListeners.delete(f); }; }, () => toasts, () => toasts);
}

/* ── actions ────────────────────────────────────────────────────────────── */
type Fn<A extends unknown[]> = (d: OpsState, ...args: A) => Result;
function runOn<A extends unknown[]>(actor: string, fn: Fn<A>, args: A): Result {
  const d: OpsState = structuredClone(state);
  d.actor = actor;
  let r: Result;
  try { r = fn(d, ...args); }
  catch (e) { console.error(e); return { ok: false, msg: "That didn't work: " + (e as Error).message }; }
  delete d.actor;
  commit(d);
  return r;
}
/** Run an engine action as a person (office user, supervisor or worker id), then show the result. */
export function act<A extends unknown[]>(actor: string, fn: Fn<A>, ...args: A): Result {
  const r = runOn(actor, fn, args);
  toast(r.ok, r.msg);
  return r;
}
/** Same, without a toast (the screen shows the result inline). */
export function actQuiet<A extends unknown[]>(actor: string, fn: Fn<A>, ...args: A): Result {
  return runOn(actor, fn, args);
}
/** The signed-in office user acts. */
export const office = <A extends unknown[]>(fn: Fn<A>, ...args: A) => act(state.ui.officeId, fn, ...args);

export function setUi(patch: Partial<Ui>) { commit({ ...state, ui: { ...state.ui, ...patch } }); }

export function resetDemo() {
  const keep = { theme: state.ui.theme, view: state.ui.view };
  const next = fresh();
  next.ui = { ...next.ui, ...keep };
  commit(next);
  toast(true, "Demo data reset to this morning, 07:45.");
}

/* Dev-only handle for automated checks; not present in production builds. */
if (import.meta.env.DEV && typeof window !== "undefined") (window as unknown as Record<string, unknown>).__ops = { getState, setUi, resetDemo, act };
