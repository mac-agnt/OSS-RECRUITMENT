/* Entity shapes for the OSS events app. Office, supervisor and crew screens all
   read one OpsState through selectors; only engine actions change it. */

export type ID = string;

/* ── people ─────────────────────────────────────────────────────────────── */
export type Perm = "allocate" | "message" | "approve_hours" | "view_docs" | "verify_docs" | "supervise" | "manage" | "payroll";
export interface User {
  id: ID; name: string; title: string; kind: "office" | "supervisor";
  email: string; phone: string; perms: Perm[];
}

export type Region = "Dublin" | "Leinster" | "Munster" | "Connacht" | "Ulster";
/** Work authorisation category. Irish, EU/EEA and UK citizens need ID only. */
export type Rtw = "Irish citizen" | "EU/EEA citizen" | "UK citizen" | "Stamp 2" | "Stamp 4" | "Stamp 1G";
/** One weekday of the availability pattern: all day, daytime, evenings, off, not set. */
export type Avail = "a" | "d" | "e" | "x" | "?";

export interface DayOff { id: ID; from: string; to: string; note: string }
export interface Worker {
  id: ID; name: string; email: string; mobile: string;
  area: string; county: string; region: Region;
  roles: string[]; rtw: Rtw; status: "active" | "pending_verification";
  joined: string; bullhornId: string | null; bullhornState: "synced" | "pending" | "not_linked";
  /** Seven characters, Monday to Sunday, each an Avail code. */
  week: string;
  /** Dates (YYYY-MM-DD, inclusive) the worker is not available. */
  off: DayOff[];
  /** Named demo personas act only through the phone; simulated crew activity skips them. */
  persona?: boolean;
  emergency?: { by: ID; at: string; eventId: ID | null };
  note?: string;
}

/* ── documents ──────────────────────────────────────────────────────────── */
export type DocType = "ID" | "RTW" | "MH" | "SP" | "HACCP" | "FA" | "PSA";
export interface Doc {
  id: ID; workerId: ID; type: DocType; name: string; ref: string;
  issued: string; expires: string | null;
  status: "verified" | "pending" | "rejected";
  file: string; uploadedAt: string; uploadedBy: ID;
  verifiedBy?: ID; verifiedAt?: string; note?: string;
}

/* ── clients, venues, events ────────────────────────────────────────────── */
export interface Client { id: ID; name: string; contact: string; email: string; phone: string; bullhornId: string | null; createdAt: string }
export interface Venue {
  id: ID; name: string; address: string; county: string; lat: number; lng: number;
  /** Clock-in radius in metres. Defaults to the global rule; can be set per venue. */
  radiusM: number; meeting: string; qr: boolean;
}
export interface Event {
  id: ID; name: string; clientId: ID; venueId: ID; supervisorId: ID; status: "confirmed" | "cancelled";
  instructions: string; ppe: string[]; quals: DocType[]; project?: string;
  createdAt: string; createdBy: ID; cancelReason?: string;
}
export interface Need { role: string; count: number }
export interface Shift {
  id: ID; eventId: ID; label: string; start: string; end: string; needs: Need[];
  /** Location and supervisor overrides for multi-site events. */
  venueId?: ID; supervisorId?: ID; version: number;
}

/* ── staffing ───────────────────────────────────────────────────────────── */
export type OfferStatus = "sent" | "accepted" | "declined" | "withdrawn" | "filled";
export interface Offer {
  id: ID; shiftId: ID; workerId: ID; role: string; status: OfferStatus;
  sentAt: string; sentBy: ID; expiresAt: string; respondedAt?: string;
  kind: "standard" | "replacement"; replaces?: ID; batch?: ID; note?: string;
}
export type AsgStatus = "confirmed" | "cancelled" | "stood_down" | "removed";
export interface Assignment {
  id: ID; shiftId: ID; workerId: ID; role: string; status: AsgStatus;
  source: "offer" | "manual" | "replacement"; offerId?: ID; at: string; by: ID;
  override?: { reason: string; rules: string[] };
  reconfirmedAt?: string;
  /** Set when the 45-minute check finds no reply; cleared by any reply. */
  flaggedAt?: string;
  endedAt?: string; endReason?: string; replaces?: ID; replacedBy?: ID;
  /** Demo: only the phone persona acts on this booking (no simulated replies or clock-ins). */
  manual?: boolean;
}
export interface Standby { id: ID; shiftId: ID; workerId: ID; role: string; order: number; at: string; source: "accepted_full" | "office" }

/** Structured replies a worker can give. */
export type Code = "confirmed" | "declined" | "on_way" | "late" | "arrived" | "lost" | "cant_make";
export interface Update { id: ID; asgId: ID; code: Code; at: string; eta?: string; note?: string; via: "app" | "whatsapp" | "supervisor" | "office" }

/* ── attendance ─────────────────────────────────────────────────────────── */
export interface ClockEvent {
  id: ID; asgId: ID; kind: "in" | "out"; at: string;
  method: "gps" | "qr" | "supervisor" | "correction";
  distanceM?: number; result: "ok" | "rejected" | "pending_sync"; reason: string; by: ID;
  syncedAt?: string; note?: string;
}
export type ExType = "late" | "no_show" | "missing_out" | "outside" | "offline" | "no_response" | "lost";
export interface Exception {
  id: ID; asgId: ID; type: ExType; status: "open" | "resolved"; at: string; detail: string; key: string;
  resolvedAt?: string; resolvedBy?: ID; note?: string;
}

/* ── hours ──────────────────────────────────────────────────────────────── */
export interface Approval { id: ID; asgId: ID; stage: "supervisor" | "office"; by: ID; at: string; version: number; reopened?: string }
export interface PayExport {
  id: ID; at: string; by: ID; asgIds: ID[]; period: string; minutes: number; amount: number; file: string;
  /** The exact rows sent to payroll, frozen at export so later rate or time changes can't alter them. */
  rows?: (string | number)[][];
}
export interface SyncRun { id: ID; at: string; by: ID; scope: string; rows: number; summary: string }

/* ── messages ───────────────────────────────────────────────────────────── */
export interface Thread { id: ID; kind: "event" | "direct"; eventId?: ID; workerId?: ID; title: string }
export type MsgKind = "message" | "offer" | "instructions" | "reminder" | "reconfirm" | "travel" | "status" | "reply" | "system";
export interface Message {
  id: ID; threadId: ID; at: string;
  from: { kind: "office" | "supervisor" | "worker" | "system"; id: ID };
  body: string; kind: MsgKind;
  /** Worker ids, or "office" for messages from crew to the office. */
  to: ID[];
  channels: ("app" | "whatsapp")[];
  /** Structured reply buttons shown with the message. */
  asks?: Code[];
  ref?: { type: "offer" | "assignment" | "shift" | "event"; id: ID };
  code?: Code;
  /** Who has read it (worker ids or "office"). */
  read: Record<ID, string>;
}

/* ── rules, automation, audit ───────────────────────────────────────────── */
export interface Rules {
  radiusM: number; clockOpenMin: number;
  minimumOn: boolean; minimumMin: number;
  breakAfterMin: number; breakMin: number;
  otPastFinish: boolean; otDailyMin: number;
  reconfirmH: number; travelH: number; noReplyMin: number; autoReassign: boolean;
  offerExpiryH: number; missedOutMin: number; travelBufferMin: number;
  /** Stamp 2: 20 h in term time, 40 h in the holiday months (June to September, 15 Dec to 15 Jan). */
  stamp2WeekMin: number; stamp2HolidayMin: number; weekWarnMin: number;
  expiryWarnDays: number; expiryReminders: number[];
  rates: Record<string, number>;
  /** Qualifications every shift in a role needs, on top of the event's own list. */
  roleQuals: Record<string, DocType[]>;
}
export interface AutoRun { id: ID; key: string; at: string; kind: string; summary: string }
export interface Audit {
  id: ID; at: string; actor: string; action: string; summary: string;
  ref?: { type: string; id: ID }; sim?: boolean;
}

export interface Ui {
  view: "office" | "supervisor" | "crew";
  officeId: ID; supervisorId: ID; crewId: ID;
  whatsapp: boolean; theme: "light" | "dark"; crowd: boolean;
}

export interface OpsState {
  version: string; seedDay: string; clock: string; seq: number;
  users: User[]; workers: Worker[]; docs: Doc[]; clients: Client[]; venues: Venue[];
  events: Event[]; shifts: Shift[];
  offers: Offer[]; assignments: Assignment[]; standby: Standby[]; updates: Update[];
  clocks: ClockEvent[]; exceptions: Exception[];
  approvals: Approval[]; exports: PayExport[]; syncs: SyncRun[];
  threads: Thread[]; messages: Message[];
  rules: Rules; autoRuns: AutoRun[]; audit: Audit[]; ui: Ui;
  /** Acting person during an engine call. Set by the store, never persisted. */
  actor?: ID;
}

export interface Result { ok: boolean; msg: string; data?: any }

/* ── labels shared by every screen ──────────────────────────────────────── */
export const DOC_LABEL: Record<DocType, string> = {
  ID: "Photo ID", RTW: "Work authorisation", MH: "Manual handling", SP: "Safe Pass",
  HACCP: "Food safety (HACCP)", FA: "First aid", PSA: "PSA licence"
};
export const QUAL_TYPES: DocType[] = ["MH", "SP", "HACCP", "FA", "PSA"];
export const ROLES = [
  "Steward", "Event crew", "Stagehand", "General operative", "Catering assistant", "Bar staff",
  "Hospitality host", "Car park marshal", "Accreditation"
];
export const PPE_OPTIONS = [
  "Hi-vis vest", "Safety boots", "Gloves", "Hard hat", "Black uniform", "Non-slip shoes", "Rain jacket", "OSS lanyard"
];
export const CODE_LABEL: Record<Code, string> = {
  confirmed: "Confirmed", declined: "Declined", on_way: "On my way", late: "Running late",
  arrived: "Arrived", lost: "Cannot find the location", cant_make: "Cannot make the shift"
};
export const needsRtw = (rtw: Rtw) => rtw === "Stamp 2" || rtw === "Stamp 4" || rtw === "Stamp 1G";
