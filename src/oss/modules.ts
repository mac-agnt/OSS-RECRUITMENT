/* Top-bar pages per module. PulseLogic renders these as the context tabs, so
   the sliding highlight (NavThumb) measures them like any other tab.
   The module list follows OSS's own requirements sheet: dashboard, events,
   staffing, employee records, communication, live attendance, timesheets,
   reporting and the audit trail. */

import type { OssState } from "./model";
import { isActiveInvite, lines, openExceptions, replacementQueue } from "./selectors";

export interface ModTab { id: string; label: string; count?: (s: OssState) => number }
export interface Mod { page: string; hint: string; search: string; tabs: ModTab[] }

const pendingCorr = (s: OssState) => s.corrections.filter((c) => c.status === "proposed").length;
const blockedItems = (s: OssState) => s.items.filter((i) => i.state === "blocked" || i.state === "failed").length;
const pendingDocs = (s: OssState) => s.documents.filter((d) => d.review === "pending").length;
const toApprove = (s: OssState) => lines(s).filter((l) => l.status === "ready" || l.status === "needs_review").length;
const unreadFromCrew = (s: OssState) => s.messages.filter((m) => m.from.kind === "worker" && !m.receipts.office?.read).length;

const pipelineOpen = (s: OssState) => s.ext.applicants.filter((a) => a.stage !== "active" && a.stage !== "withdrawn").length;

export const MODULES: Record<string, Mod> = {
  Calendar: { page: "Calendar", hint: "CALENDAR", search: "Search the calendar", tabs: [
    { id: "month", label: "Month" }, { id: "week", label: "Week" }, { id: "season", label: "Season" }] },
  Clients: { page: "Clients", hint: "CLIENTS", search: "Search clients", tabs: [
    { id: "accounts", label: "Accounts" }, { id: "requests", label: "Requests & sign-off" }, { id: "venues", label: "Venues" }] },
  Dashboard: { page: "Dashboard", hint: "CONTROL PANEL", search: "Search the control panel", tabs: [
    { id: "overview", label: "Control panel" }, { id: "executive", label: "Executive" }, { id: "year", label: "Year ahead" }] },
  Recruitment: { page: "Recruitment", hint: "RECRUITMENT", search: "Search applicants", tabs: [
    { id: "pipeline", label: "Pipeline", count: pipelineOpen }, { id: "inductions", label: "Inductions" }, { id: "ryder", label: "Ryder Cup 2027" }] },
  Compliance: { page: "Compliance", hint: "COMPLIANCE", search: "Search compliance", tabs: [
    { id: "rtw", label: "Right to work" }, { id: "hours", label: "Working time" }, { id: "licences", label: "Licences & vetting" }] },
  Portals: { page: "Portals", hint: "PORTALS", search: "Search all portals", tabs: [
    { id: "overview", label: "All portals" }, { id: "client", label: "Client portal" }, { id: "crew", label: "Crew app" }] },
  Events: { page: "Events", hint: "RUN EVENTS", search: "Search events, clients and venues", tabs: [
    { id: "upcoming", label: "Upcoming" }, { id: "bookings", label: "All bookings" }, { id: "callsheets", label: "Call sheets" }] },
  Staffing: { page: "Staffing", hint: "STAFFING", search: "Search shifts and staff", tabs: [
    { id: "allocate", label: "Allocate" },
    { id: "responses", label: "Responses", count: (s) => s.invitations.filter((i) => isActiveInvite(s, i)).length },
    { id: "replacements", label: "Replacements", count: (s) => replacementQueue(s).filter((r) => r.open).length }] },
  Staff: { page: "Staff", hint: "CREW", search: "Search crew", tabs: [
    { id: "directory", label: "Directory" }, { id: "availability", label: "Availability" },
    { id: "documents", label: "Documents", count: pendingDocs }, { id: "register", label: "Register" }] },
  Messages: { page: "Messages", hint: "MESSAGES", search: "Search messages", tabs: [
    { id: "inbox", label: "Inbox", count: unreadFromCrew }, { id: "compose", label: "New message" }, { id: "reminders", label: "Reminders" }] },
  Attendance: { page: "Attendance", hint: "EVENT DAY", search: "Search the roster", tabs: [
    { id: "board", label: "Live board" }, { id: "map", label: "Venue check-in" },
    { id: "exceptions", label: "Exceptions", count: (s) => openExceptions(s).length }] },
  Timesheets: { page: "Timesheets", hint: "TIMESHEETS", search: "Search hours", tabs: [
    { id: "review", label: "Review", count: toApprove }, { id: "corrections", label: "Corrections", count: pendingCorr },
    { id: "bullhorn", label: "Bullhorn", count: blockedItems }] },
  Reports: { page: "Reports", hint: "REPORTS", search: "Search reports", tabs: [
    { id: "client", label: "Client report" }, { id: "hours", label: "Hours & overtime" },
    { id: "payroll", label: "Payroll export" }, { id: "qualifications", label: "Qualifications" }] },
  Agents: { page: "Agents", hint: "AGENTS", search: "Search agents", tabs: [
    { id: "agents", label: "Agents" }, { id: "proposals", label: "Proposals", count: (s) => s.proposals.filter((p) => p.status === "pending").length }] },
  Activity: { page: "Activity", hint: "AUDIT TRAIL", search: "Search the audit trail", tabs: [
    { id: "live", label: "Everything" }, { id: "audit", label: "Audit trail" }] },
  Settings: { page: "Settings", hint: "SETTINGS", search: "Search settings", tabs: [
    { id: "org", label: "Organisation" }, { id: "team", label: "Team & access" }, { id: "rules", label: "Rules" },
    { id: "integrations", label: "Integrations" }, { id: "appearance", label: "Appearance" }] }
};
export const tabOf = (s: OssState, page: string) => {
  const t = s.ui.tabs[page];
  return t && MODULES[page]?.tabs.some((x) => x.id === t) ? t : MODULES[page]?.tabs[0].id;
};

/* Older links (chat answers, palette, saved tabs) map onto the current pages. */
const ALIAS: Record<string, [string, Record<string, string>]> = {
  "Workforce": ["Staff", { people: "directory", history: "directory", registration: "register" }],
  "Live Operations": ["Attendance", { today: "board", arrivals: "board", attendance: "board" }],
  "Work": ["Dashboard", { mine: "overview", board: "overview", approvals: "overview", comms: "overview", automations: "overview" }],
  "Staffing": ["Staffing", { allocation: "allocate", invitations: "responses", standby: "replacements", coverage: "allocate" }],
  "Timesheets": ["Timesheets", { approvals: "review", handover: "bullhorn", reports: "review" }],
  "Events": ["Events", { overview: "upcoming", programme: "upcoming", calendar: "upcoming", clients: "upcoming" }],
  "Activity": ["Activity", { all: "live", operations: "live", systems: "audit" }],
  "Agents": ["Agents", { runs: "agents", approvals: "proposals" }],
  "Dashboard": ["Dashboard", { staffing: "overview", attendance: "overview", hours: "overview" }],
  "Settings": ["Settings", { teams: "team", systems: "integrations", governance: "rules", ai: "rules", experience: "appearance" }]
};
export function resolveRoute(page: string, tab?: string): [string, string | undefined] {
  if (page === "Timesheets" && tab === "reports") return ["Reports", "client"];
  if (page === "Work" && (tab === "comms")) return ["Messages", "inbox"];
  if (page === "Work" && (tab === "automations")) return ["Messages", "reminders"];
  if (page === "Events" && tab === "programme") return ["Dashboard", "year"];
  if (page === "Events" && tab === "calendar") return ["Calendar", "month"];
  if (page === "Events" && tab === "clients") return ["Clients", "accounts"];
  const a = ALIAS[page];
  if (!a) return [page, tab];
  return [a[0], tab ? a[1][tab] || tab : undefined];
}
