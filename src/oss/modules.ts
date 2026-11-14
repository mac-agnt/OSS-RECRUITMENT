/* Top-bar pages per module. PulseLogic renders these as the context tabs, so
   the sliding highlight (NavThumb) measures them like any other tab. */

import type { OssState } from "./model";
import { batchSummary, isActiveInvite, lines, openExceptions, replacementQueue } from "./selectors";

export interface ModTab { id: string; label: string; count?: (s: OssState) => number }
export interface Mod { page: string; hint: string; search: string; tabs: ModTab[] }

const pendingCorr = (s: OssState) => s.corrections.filter((c) => c.status === "proposed").length;
const readyLines = (s: OssState) => lines(s).filter((l) => l.status === "ready").length;
const blockedItems = (s: OssState) => s.batches.reduce((n, b) => n + batchSummary(s, b.id).blocked, 0);
const pendingDocs = (s: OssState) => s.documents.filter((d) => d.review === "pending").length;

export const MODULES: Record<string, Mod> = {
  Events: { page: "Events", hint: "EVENTS", search: "Search bookings, clients and venues", tabs: [
    { id: "overview", label: "Overview" }, { id: "calendar", label: "Calendar" }, { id: "bookings", label: "Bookings" },
    { id: "clients", label: "Clients & venues" }, { id: "programme", label: "Programme planning" }] },
  Workforce: { page: "Workforce", hint: "WORKFORCE · 96 SAMPLE PROFILES", search: "Search workers", tabs: [
    { id: "people", label: "People" }, { id: "availability", label: "Availability" }, { id: "documents", label: "Documents", count: pendingDocs },
    { id: "registration", label: "Registration" }, { id: "history", label: "History" }] },
  Staffing: { page: "Staffing", hint: "STAFFING", search: "Search shifts and workers", tabs: [
    { id: "allocation", label: "Allocation" }, { id: "invitations", label: "Invitations", count: (s) => s.invitations.filter((i) => isActiveInvite(s, i)).length },
    { id: "replacements", label: "Replacements", count: (s) => replacementQueue(s).filter((r) => r.open).length }, { id: "standby", label: "Standby" }, { id: "coverage", label: "Coverage" }] },
  "Live Operations": { page: "Live Operations", hint: "LIVE OPERATIONS", search: "Search the roster", tabs: [
    { id: "today", label: "Today" }, { id: "arrivals", label: "Arrivals" }, { id: "attendance", label: "Attendance" },
    { id: "exceptions", label: "Exceptions", count: (s) => openExceptions(s).length }] },
  Timesheets: { page: "Timesheets", hint: "TIMESHEETS", search: "Search hours", tabs: [
    { id: "review", label: "Review" }, { id: "corrections", label: "Corrections", count: pendingCorr }, { id: "approvals", label: "Approvals", count: readyLines },
    { id: "reports", label: "Client reports" }, { id: "handover", label: "Bullhorn handover", count: blockedItems }] },
  Work: { page: "Work", hint: "WORK", search: "Search tasks and messages", tabs: [
    { id: "mine", label: "My work", count: (s) => s.tasks.filter((t) => t.ownerId === s.ui.personaId && t.status !== "done").length },
    { id: "board", label: "Team board" }, { id: "approvals", label: "Approvals" }, { id: "comms", label: "Communications" }, { id: "automations", label: "Automations" }] },
  Agents: { page: "Agents", hint: "AGENTS · HUMAN APPROVAL REQUIRED", search: "Search agents", tabs: [
    { id: "agents", label: "Agents" }, { id: "runs", label: "Run history" }, { id: "approvals", label: "Approvals", count: (s) => s.proposals.filter((p) => p.status === "pending").length }] },
  Dashboard: { page: "Dashboard", hint: "DASHBOARD", search: "Search the dashboard", tabs: [
    { id: "executive", label: "Executive" }, { id: "staffing", label: "Staffing" }, { id: "attendance", label: "Attendance" }, { id: "hours", label: "Hours & handover" }] },
  Activity: { page: "Activity", hint: "ACTIVITY · AUDIT TRAIL", search: "Search the audit trail", tabs: [
    { id: "all", label: "All activity" }, { id: "operations", label: "Operations" }, { id: "systems", label: "Systems & approvals" }] },
  Settings: { page: "Settings", hint: "SETTINGS", search: "Search settings", tabs: [
    { id: "org", label: "Organisation" }, { id: "teams", label: "Teams & access" }, { id: "systems", label: "Systems" }, { id: "rules", label: "Rules" },
    { id: "governance", label: "Governance" }, { id: "ai", label: "AI controls" }, { id: "experience", label: "Experience" }] }
};
export const tabOf = (s: OssState, page: string) => s.ui.tabs[page] || MODULES[page]?.tabs[0].id;
