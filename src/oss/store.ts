/* One shared local store. Office, OSS Crew and supervisor views all read it,
   so a change on the phone shows up on the desk immediately. Persisted to this
   browser only, under its own namespaced, versioned key. */

import { useSyncExternalStore } from "react";
import type { OssState, UiState } from "./model";
import type { Result } from "./engine";
import { SEED_VERSION } from "./seed";
import { buildStage } from "./stages";
import { resolveRoute } from "./modules";

const KEY = "oss-pulse-demo:" + SEED_VERSION;
const OLD_PREFIX = "oss-pulse-demo:";

function load(): OssState {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as OssState;
      if (s && s.seedVersion === SEED_VERSION && s.ui) return { ...s, ui: { ...s.ui, drawer: null } };
    }
    // Only this demo's own older keys are removed.
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(OLD_PREFIX) && k !== KEY) window.localStorage.removeItem(k);
    }
  } catch { /* storage unavailable: start from the seed */ }
  return buildStage(1);
}

let state: OssState = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota or privacy mode */ }
  }, 120);
}
function commit(next: OssState) {
  state = next;
  persist();
  listeners.forEach((f) => f());
}

export const getState = () => state;
export function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function useOss(): OssState { return useSyncExternalStore(subscribe, getState, getState); }

/* toasts */
export interface Toast { id: number; ok: boolean; text: string; action?: { label: string; run: () => void } }
let toasts: Toast[] = [];
const toastListeners = new Set<() => void>();
let toastN = 0;
export function toast(ok: boolean, text: string, action?: Toast["action"]) {
  const t = { id: ++toastN, ok, text, action };
  toasts = toasts.concat([t]).slice(-3);
  toastListeners.forEach((f) => f());
  setTimeout(() => { toasts = toasts.filter((x) => x.id !== t.id); toastListeners.forEach((f) => f()); }, ok ? 4200 : 7000);
}
export function useToasts() { return useSyncExternalStore((f) => { toastListeners.add(f); return () => { toastListeners.delete(f); }; }, () => toasts, () => toasts); }

/** Run an engine action on a draft copy, then commit. Rejections are committed too: they are audited. */
export function run<A extends any[]>(fn: (d: OssState, ...args: A) => Result, ...args: A): Result {
  const d: OssState = structuredClone(state);
  const r = fn(d, ...args);
  d.ui = { ...d.ui, dirty: true };
  commit(d);
  toast(r.ok, r.message);
  return r;
}
/** Run an action as another office user (e.g. Mark on the supervisor phone), in one commit. */
export function runAs<A extends any[]>(personaId: string, fn: (d: OssState, ...args: A) => Result, ...args: A): Result {
  const d: OssState = structuredClone(state);
  const prev = d.ui.personaId;
  d.ui.personaId = personaId;
  const r = fn(d, ...args);
  d.ui = { ...d.ui, personaId: prev, dirty: true };
  commit(d);
  toast(r.ok, r.message);
  return r;
}
/** Same as run, without a toast (for inline feedback). */
export function runQuiet<A extends any[]>(fn: (d: OssState, ...args: A) => Result, ...args: A): Result {
  const d: OssState = structuredClone(state);
  const r = fn(d, ...args);
  d.ui = { ...d.ui, dirty: true };
  commit(d);
  return r;
}

export function setUi(patch: Partial<UiState>) { commit({ ...state, ui: { ...state.ui, ...patch } }); }
const toTop = () => { if (typeof document !== "undefined") document.querySelector("[data-scroll-main]")?.scrollTo(0, 0); };
export function setTab(page: string, tab: string) { setUi({ tabs: { ...state.ui.tabs, [page]: tab }, focus: null }); toTop(); }
export function openDrawer(kind: string, id: string) {
  if (kind === "event") { navigate("Events", "upcoming", { kind: "event", id }); return; }
  setUi({ drawer: { kind, id } });
}
export function closeDrawer() { setUi({ drawer: null }); }

export function loadStage(n: number) {
  const keep = { role: state.ui.role, phoneOpen: state.ui.phoneOpen, tabs: state.ui.tabs };
  const next = buildStage(n);
  next.ui = { ...next.ui, ...keep };
  commit(next);
}
export function resetDemo() { const keep = { tabs: {} }; const next = buildStage(1); next.ui = { ...next.ui, ...keep }; commit(next); }

/* navigation bridge: PulseLogic registers its page switcher here */
let goHandler: ((page: string) => void) | null = null;
export function registerNav(fn: (page: string) => void) { goHandler = fn; }
export function navigate(rawPage: string, rawTab?: string, focus?: { kind: string; id: string } | null) {
  const [page, tab] = resolveRoute(rawPage, rawTab);
  const patch: Partial<UiState> = {};
  if (tab) patch.tabs = { ...state.ui.tabs, [page]: tab };
  if (focus !== undefined) patch.focus = focus;
  patch.drawer = null;
  setUi(patch);
  goHandler?.(page);
  toTop();
}

/* Dev-only handle for automated page sweeps; not present in production builds. */
if (import.meta.env.DEV && typeof window !== "undefined") (window as any).__oss = { navigate, setTab, loadStage, getState, openDrawer, setUi };
