/* A small path router for the OSS app. Routes live in the URL, so a refresh or a
   shared link opens the same screen, and the browser back button works. */

import { createElement, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent } from "react";

export interface Route { path: string; parts: string[]; q: URLSearchParams; href: string }

const listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());
if (typeof window !== "undefined") window.addEventListener("popstate", notify);

const snapshot = () => window.location.pathname + window.location.search;

let key = "";
let route: Route = { path: "/", parts: [], q: new URLSearchParams(), href: "/" };
function current(): Route {
  const k = snapshot();
  if (k !== key) {
    key = k;
    const path = window.location.pathname.replace(/\/+$/, "") || "/";
    route = { path, parts: path.split("/").filter(Boolean).map(decodeURIComponent), q: new URLSearchParams(window.location.search), href: k };
  }
  return route;
}

export function useRoute(): Route {
  return useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, current, current);
}

export function go(to: string, opts: { replace?: boolean; keepScroll?: boolean } = {}) {
  if (to !== snapshot()) {
    if (opts.replace) window.history.replaceState(null, "", to);
    else window.history.pushState(null, "", to);
    notify();
  }
  if (!opts.keepScroll) document.querySelector("[data-scroll]")?.scrollTo(0, 0);
}

/** Change query parameters on the current path (filters, tabs, calendar date). */
export function setQuery(patch: Record<string, string | null | undefined>, replace = true) {
  const q = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === "") q.delete(k);
    else q.set(k, v);
  }
  const s = q.toString();
  go(window.location.pathname + (s ? "?" + s : ""), { replace, keepScroll: true });
}

/** Build a path with a query string, skipping empty values. */
export function href(path: string, q?: Record<string, string | null | undefined>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q || {})) if (v) p.set(k, v);
  const s = p.toString();
  return path + (s ? "?" + s : "");
}

type LinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & { to: string };
export function Link({ to, onClick, ...rest }: LinkProps) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    go(to);
  };
  return createElement("a", { href: to, onClick: handle, ...rest });
}
