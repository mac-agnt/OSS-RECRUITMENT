/* Canonical entity shapes for the OSS Pulse demo. Every screen reads these
   through selectors; nothing keeps its own copy of a total. */

export type ID = string;

export interface AdminUser {
  id: ID; name: string; role: string; email: string; team: string; initials: string;
  known?: boolean; perms: Perm[];
}
export type Perm = "allocate" | "approve_docs" | "approve_hours" | "edit_hours" | "handover" | "supervise" | "manage" | "message";

export interface Team { id: ID; name: string; members: ID[]; note: string }

export interface Worker {
  id: ID; name: string; roles: string[]; locality: string; email: string; mobile: string;
  joined: string; status: "active" | "pending_compliance";
  priorShifts: number; priorVenues: string[]; registeredBy?: ID; registeredAt?: string;
}

export interface Client { id: ID; name: string; provenance: string; fictional: boolean; sector: string }
export interface ClientContact { id: ID; clientId: ID; name: string; role: string; email: string; phone: string }

export interface Venue {
  id: ID; name: string; area: string; meetingPoint: string; meetingConfirmed: boolean;
  geofenceM: number; supervisorId: ID; qrToken: string; methods: ("gps" | "qr")[];
}

export type BookingStatus = "confirmed" | "pending" | "cancelled";
export interface EventBooking {
  id: ID; name: string; clientId: ID; venueId: ID | null; date: string; status: BookingStatus;
  ownerId: ID; approverId: ID; supervisorId: ID; ppe: string[]; brief: string; createdAt: string;
  pendingNote?: string; indicativePositions?: number; historical?: boolean; sample?: boolean;
}

export interface Shift {
  id: ID; eventId: ID; label: string; roles: string[]; start: string; end: string; required: number;
  requiredDocs: DocType[]; ppe: string[]; version: number;
}

export type DocType = "MH" | "SP" | "HACCP" | "FA";
export interface WorkerDocument {
  id: ID; workerId: ID; type: DocType; issuer: string; file: string; issued: string; expires: string;
  review: "approved" | "pending" | "rejected"; reviewer?: ID; reviewedAt?: string; uploadedAt: string;
}

export interface AvailabilityRule { id: ID; workerId: ID; weekday: number; start: string; end: string }
export interface AvailabilityException {
  id: ID; workerId: ID; start: string; end: string; kind: "available" | "unavailable" | "holiday"; note?: string; createdAt: string;
}

export type InvStatus = "sent" | "accepted" | "declined" | "withdrawn";
export interface Invitation {
  id: ID; shiftId: ID; workerId: ID; sentAt: string; sentBy: ID; version: number; status: InvStatus;
  expiresAt: string; respondedAt?: string; flags: string[]; kind: "standard" | "replacement";
  replacesAssignmentId?: ID; reminders: string[];
}

export interface Assignment {
  id: ID; shiftId: ID; workerId: ID; invitationId: ID; status: "confirmed" | "cancelled" | "withdrawn";
  acceptedAt: string; cancelledAt?: string; cancelReason?: string; replacementFor?: ID; shiftVersion: number;
}

export interface StandbyEntry { id: ID; shiftId: ID; workerId: ID; order: number; willing: boolean; note: string; contact: string }

export type JourneyStatus = "on_the_way" | "running_late" | "on_site" | "issue";
export interface JourneyUpdate { id: ID; assignmentId: ID; status: JourneyStatus; at: string; eta?: string; message?: string }

export type ClockResult = "verified" | "rejected" | "review" | "awaiting_sync";
export interface ClockEntry {
  id: ID; assignmentId: ID; kind: "in" | "out"; at: string; method: "gps" | "qr" | "offline" | "supervisor";
  distanceM?: number; accuracyM?: number; token?: string; result: ClockResult; reason: string; eventKey: string;
  syncedAt?: string;
}

export type ExceptionType = "missing_in" | "missing_out" | "outside" | "poor_accuracy" | "denied" | "offline" | "bad_token";
export interface AttendanceException {
  id: ID; assignmentId: ID; type: ExceptionType; status: "open" | "resolved"; ownerId: ID; reason: string;
  nextAction: string; createdAt: string; resolvedAt?: string; resolution?: string; key: string;
}

export interface CorrectionRequest {
  id: ID; assignmentId: ID; field: "in" | "out"; original: string | null; proposed: string; reason: string; note: string;
  requestedBy: ID; requestedAt: string; status: "proposed" | "approved" | "rejected"; decidedBy?: ID; decidedAt?: string;
}

export interface TimesheetApproval { id: ID; assignmentId: ID; version: number; approvedBy: ID; approvedAt: string; status: "approved" | "reopened"; reopenReason?: string }

export interface Thread { id: ID; kind: "direct" | "event"; workerId?: ID; eventId?: ID; title: string }
export interface Message {
  id: ID; threadId: ID; from: { kind: "office" | "worker" | "system"; id: ID }; body: string; at: string;
  kind: "direct" | "event" | "bulk" | "reminder" | "invitation" | "cancellation" | "reply";
  recipients: ID[]; audience?: string; receipts: Record<ID, { delivered: string; read?: string; ack?: string }>;
  related?: { type: string; id: ID };
}

export interface WorkflowTask {
  id: ID; title: string; ownerId: ID; due: string; priority: "High" | "Medium" | "Low"; dept: string;
  status: "open" | "in_progress" | "blocked" | "done"; related?: { type: string; id: ID; label: string };
  kind: "fill_gaps" | "doc_review" | "mapping" | "venue" | "replacement" | "chase" | "general" | "attendance";
  createdAt: string; doneAt?: string; source: string; doneReason?: string;
}

export interface AgentProposal {
  id: ID; agentId: ID; at: string; title: string; detail: string; status: "pending" | "approved" | "dismissed";
  action?: { type: string; payload: any }; decidedBy?: ID; decidedAt?: string; result?: string;
}
export interface AgentRun {
  id: ID; agentId: ID; at: string; trigger: "scheduled" | "run_now" | "seed"; findings: string[];
  evidence: { label: string; page: string; tab?: string; focus?: string }[]; proposalIds: ID[];
}

export interface IntegrationMapping {
  id: ID; entityType: "worker" | "client"; localId: ID; remoteId: string | null; status: "mapped" | "missing";
  confirmedBy?: ID; confirmedAt?: string; note: string;
}

export interface HandoverBatch { id: ID; label: string; createdAt: string; createdBy: ID; scope: string }
export interface HandoverSnapshot {
  timesheetId: string; version: number; workerId: ID; candidateId: string | null; clientId: ID; clientRemoteId: string | null;
  eventId: ID; shiftId: ID; workDate: string; scheduledStart: string; scheduledEnd: string; approvedStart: string; approvedEnd: string;
  workedMin: number; breakMin: number; topupMin: number; payableMin: number; extraMin: number;
  approvedBy: ID; approvedAt: string; correction: string | null; transferKey: string;
}
export interface HandoverItem {
  id: ID; batchId: ID; assignmentId: ID; version: number; transferKey: string; snapshot: HandoverSnapshot;
  state: "queued" | "accepted" | "blocked" | "failed"; error?: string; receipt?: string; attempts: { at: string; result: string }[];
}

export interface AuditEvent {
  id: ID; at: string; actor: string; action: string; entity: { type: string; id: ID; label: string };
  summary: string; before?: string; after?: string; result: "ok" | "rejected" | "simulated";
  category: "operations" | "systems" | "approvals"; story?: StoryKey;
}
export type StoryKey = "A" | "B" | "C" | "D" | "E" | "F";

export interface ProgrammePlan {
  id: ID; name: string; kind: "ryder" | "festival"; indicativeWorkers: number; status: string; note: string;
  months: { month: string; demand: number }[];
}

export interface Rules {
  geofenceM: number; maxAccuracyM: number; travelBufferMin: number; minimumOn: boolean; minimumMin: number;
  dayBeforeH: number; arrivalPromptH: number; missedClockMin: number; inviteExpiryH: number;
  breakMin: number; renewalWarnDays: number;
}

export interface Automation { id: ID; name: string; trigger: string; recipient: string; timing: string; conditions: string; on: boolean; key: keyof Rules | null }
export interface AutomationRun { id: ID; automationId: ID; at: string; key: string; summary: string; targets: number }

export interface Decision { id: ID; topic: string; assumption: string; owner: string; effect: string; status: "Confirmed from source" | "Demo assumption" | "To validate" | "To agree" }

export interface UiState {
  stage: number; role: "office" | "crew" | "supervisor"; personaId: ID; crewWorkerId: ID;
  tabs: Record<string, string>; focus: { kind: string; id: ID } | null; phoneOpen: boolean;
  drawer: { kind: string; id: ID } | null; dirty: boolean;
}

export interface OssState {
  seedVersion: string; clock: string; seq: number;
  users: AdminUser[]; teams: Team[]; workers: Worker[]; clients: Client[]; contacts: ClientContact[]; venues: Venue[];
  events: EventBooking[]; shifts: Shift[]; documents: WorkerDocument[];
  availRules: AvailabilityRule[]; availExceptions: AvailabilityException[];
  invitations: Invitation[]; assignments: Assignment[]; standby: StandbyEntry[];
  journeys: JourneyUpdate[]; clocks: ClockEntry[]; exceptions: AttendanceException[]; corrections: CorrectionRequest[];
  approvals: TimesheetApproval[]; threads: Thread[]; messages: Message[]; tasks: WorkflowTask[];
  agentRuns: AgentRun[]; proposals: AgentProposal[]; agentsPaused: Record<ID, boolean>;
  mappings: IntegrationMapping[]; batches: HandoverBatch[]; items: HandoverItem[];
  audit: AuditEvent[]; programmes: ProgrammePlan[]; rules: Rules; automations: Automation[]; autoRuns: AutomationRun[];
  decisions: Decision[]; openShiftRequests: { id: ID; shiftId: ID; workerId: ID; at: string; status: "requested" | "invited" | "declined" }[];
  ui: UiState;
}
