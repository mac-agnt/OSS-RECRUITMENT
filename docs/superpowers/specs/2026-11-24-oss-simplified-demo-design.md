# OSS Recruitment: simplified event staffing demo

Status: approved 24 Nov 2026. Source brief: "OSS Recruitment, Platform Demo Refinement" (pasted brief, sections 1 to 23).

## Goal

Replace the default OSS demo with a simple, fully working event staffing system that Daniele could use tomorrow:
six areas, three connected experiences (office, supervisor phone, crew phone), one shared dataset, every primary
button working, changes persisted. The previous Pulse demo stays available, unchanged, as the advanced experience.

## Decisions

| Topic | Decision |
| --- | --- |
| Pulse template rules (Agents under Home, Ontology) | The brief wins for this copy. Pulse shell, its engine and data stay untouched in `src/oss`, `src/views`, `src/logic`, reachable at `/advanced` (and `/#advanced`), and frozen on branch `advanced-platform` (e793b35). CLAUDE.md notes the exception. |
| Default theme | Light, OSS navy `#064B68` accent, white surfaces. Dark theme available from the user menu. |
| Architecture | New app in `src/ops/` with its own model, seed, selectors, engine and store, built from the proven `src/oss` rules. No backend. |
| Dates | Seed is generated relative to the real current date (Europe/Dublin). The demo clock starts today at 07:45 and only moves forward through demo controls. |
| People | Office: Daniele (events coordinator, primary user), Shane (director), plus fictional colleagues. Supervisors: Bianca and fictional colleagues. First names only for real people, demo contact details only. All crew fictional. |
| Storage | `localStorage` key prefix `oss-ops-demo:` (the old demo's `oss-pulse-demo:` keys are never touched). Cross-tab sync through the `storage` event. "Reset demo data" rebuilds the seed. |
| Integrations | WhatsApp, Bullhorn, Sage, GPS and QR are simulated and labelled as such everywhere. No external calls. |

## Information architecture

Side rail: **Today, Events, Crew, Communications, Timesheets, Compliance**, Settings at the bottom.

- Events has tabs Calendar and Clients. Settings has Rules, Integrations, Team & access, Audit log.
- Top bar: page title, search, view switch **Office | Supervisor | Crew**, demo clock, user menu (theme, switch office user).
- Supervisor and Crew open a phone frame docked beside the office screen on desktop, full screen on phones
  (`/m/supervisor`, `/m/crew`).
- Routes: `/today`, `/events`, `/events/new`, `/events/:id`, `/events/:id/edit`, `/clients`, `/clients/:id`, `/crew`,
  `/crew/new`, `/crew/:id`, `/comms`, `/comms/:threadId`, `/timesheets`, `/compliance`, `/settings/:tab`, `/advanced`.

## Data model (src/ops/model.ts)

- **User**: office or supervisor, with permissions (`allocate`, `message`, `approve_hours`, `view_docs`, `verify_docs`,
  `supervise`, `manage`, `payroll`).
- **Worker**: name, contact, area/county, roles (skills), work authorisation category (Irish, EU/EEA, UK, Stamp 2,
  Stamp 4, Stamp 1G), status (`active`, `pending_verification`), Bullhorn reference and sync state, weekly availability
  pattern (Mon to Sun: all day, daytime, evenings, off, not set) plus unavailable dates, emergency registration details.
- **Doc**: type (ID, work authorisation, manual handling, Safe Pass, food safety, first aid, PSA licence), masked reference,
  issue and expiry dates, verification status (`verified`, `pending`, `rejected`), file placeholder, who uploaded.
- **Client**: name, contact name, email, phone. **Venue**: name, address, county, coordinates, clock-in radius, meeting point.
- **Event**: name, client, venue, supervisor, status (`confirmed`, `cancelled`), instructions, PPE, required qualifications, project.
- **Shift**: event, label, start/end, needs by role (`[{ role, count }]`), optional venue and supervisor override, version.
- **Offer**: shift, worker, role, status (`sent`, `accepted`, `declined`, `withdrawn`, `filled`), expiry, kind (`standard`,
  `replacement`), replaces, batch, channels.
- **Assignment**: shift, worker, role, status (`confirmed`, `cancelled`, `stood_down`, `removed`), source (`offer`, `manual`,
  `replacement`, `emergency`), override reason, reconfirmed time, no-response flag.
- **Standby**: ordered per shift and role.
- **StatusUpdate**: structured response (`confirmed`, `declined`, `on_way`, `late`, `arrived`, `lost`, `cant_make`) with ETA/note and channel.
- **ClockEvent**: in/out, method (`gps`, `qr`, `supervisor`, `correction`), distance, result (`ok`, `rejected`, `pending_sync`), note.
- **Exception**: late, no-show, missing clock-out, outside radius, offline, no response. Open or resolved with note.
- **TsApproval**: supervisor or office stage. **PayrollExport** and **BullhornSync** records (simulated).
- **Thread / Message**: event, direct or group threads; message kind (message, offer, instructions, reminder, reconfirm,
  travel, status request, reply, system), channels (app, WhatsApp simulated), structured reply options, receipts.
- **Rules** (all configurable in Settings): clock-in radius 50 m, clock-in window, minimum paid hours 5 (on), break rule,
  overtime flags (past scheduled finish; daily threshold off, "to validate"), pay rates by role (sample), reminder timings
  24 h / 2 h / 45 min, automatic reassignment (off), offer expiry, Stamp 2 weekly threshold 20 h, general weekly warning 48 h,
  document expiry warning 30 days and reminder schedule, missed clock-out alert, travel buffer between venues.
- **Audit**: every action, actor, time, summary, simulated flag.

## Rules engine (src/ops/engine.ts)

1. **Eligibility** per worker and shift role. Hard blocks (never overridable): ID or required work authorisation missing,
   expired or unverified; required qualification missing, expired at shift end or unverified; overlapping shift; worker
   pending verification. Soft blocks (override with recorded reason): unavailable, inside travel buffer, weekly hours over the
   worker's threshold (20 h only for Stamp 2; 48 h warning for everyone). Warnings: availability not set, document expiring.
2. **Offers, first come first served**: offers may go to more workers than open places. Each acceptance re-checks eligibility;
   accepted workers are confirmed until the role is full; later acceptances go to standby. Duplicate offers, double booking and
   overbooking are impossible.
3. **Manual allocation**: assign directly; soft blocks need a reason that is stored on the assignment and in the audit log.
4. **Replacements**: a replacement offer names the assignment it replaces. When the replacement accepts, the original is stood
   down in the same action. If the original replies first, open replacement offers are withdrawn. Never both confirmed.
5. **Automations on the demo clock** (deduplicated): T-24 h reconfirmation request; T-2 h travel status request; T-45 min
   flag non-responders as potentially unavailable and recommend a replacement (standby first, then best eligible);
   optional automatic reassignment sends the replacement offer itself; missed clock-out alert; document expiry reminders.
6. **Structured replies** update assignment and attendance state everywhere: Confirmed (reconfirm), Declined / Cannot make the
   shift (cancel, shortfall raised), On my way, Running late (ETA), Arrived, Cannot find the location (supervisor alerted).
7. **Attendance**: GPS within the venue radius, QR token, or supervisor-recorded. Outside radius is rejected and logged.
   Offline captures are pending until synced, then confirmed. Location is captured only at the clock action.
   Supervisor corrections require a note and keep the original record.
8. **Timesheets** derive from attendance: scheduled, actual, break, payable (minimum top-up shown separately), rate, estimated
   pay, overtime flags. Stages: in progress, missing clock, awaiting supervisor, awaiting office, approved, exported.
   Sage export marks lines exported and produces a CSV. Bullhorn sync is a simulated preview with per-row status.
9. **Shortfalls**: any confirmed role short of its need raises an alert with the number of eligible available workers and a
   direct "review and send offers" action.

## Demo data (src/ops/seed.ts)

Deterministic from the real date. About 1,000 fictional crew (Dublin heavy, nationwide), Stamp 2 students, Bullhorn refs.

- **Yesterday**: Guinness Storehouse evening reception (one forgotten clock-out, awaiting office review); Aviva Stadium
  3-hour corporate box service (3 h worked, 5 h payable, supervisor approved). Older history exported to Sage.
- **Today** (clock 07:45): RDS early set-up (completed, grey); National Aquatic Centre gala 08:30 (fully staffed, crew
  travelling, two running late, three not responding, flagged at T-45); Guinness Storehouse lunch (green); 3Arena concert
  load-in and show (show crew 19/20, amber, standby list ready for the dropout scenario); Aviva Stadium match day (stewards
  short by 5 with exactly 8 eligible available, amber); Convention Centre Dublin awards dinner (2/12, red).
- **Next two weeks**: mixed green, amber and red bookings at the same venues.
- **Electric Picnic 2027** (Stradbally): build, festival and derig shifts, partially staffed.
- **Ryder Cup 2027** (Adare Manor): 46 shifts over seven days at four locations with eight supervisors, around
  860 positions on peak days, partially staffed with offers out.
- Named crew personas for the phone (flagged so simulated crowd activity never acts for them), a Stamp 2 worker near 20 h,
  a worker whose Stamp 2 permission has expired (scenario 5), and workers with expiring and missing documents.

## Screens

- **Today**: compact count strip (events, required, confirmed, outstanding, not responded, attendance exceptions, urgent
  compliance), "Needs attention" actions, today's event board with status colour, text and numbers. Row click opens the event.
- **Events**: calendar with Day (default, today), Week, Month; filters for client, supervisor, location, status, search;
  New event form (client select or create, location select or create, shifts with roles and counts, supervisors,
  instructions, PPE, qualifications); edit. **Event workspace** tabs: Overview, Shifts & roster (find crew, offers, manual
  assign, standby, replace, remove), Communications, Attendance, Timesheets, Instructions. Large projects group shifts by
  day and location with per-group totals.
- **Clients** (Events tab): essential details, locations, upcoming and past events, create event from the client.
- **Crew**: searchable list with filters (available on date, skill, valid documents, location, has assignments, weekly hours),
  paged for 1,000+. Profile: contact, availability (editable), qualifications and documents, upcoming and previous shifts,
  hours, messages, Bullhorn reference and sync. Register worker (duplicate check). Assign to event from the profile.
- **Communications**: threads by event and person; compose to one worker, an event crew, selected workers or unconfirmed
  workers; templates (job offer, shift instructions, reminder, status request); response tallies; WhatsApp preview (simulated).
- **Timesheets**: day and week views, filters, approve one or a batch, Sage export preview and CSV download, Bullhorn sync
  preview, weekly hours warnings.
- **Compliance**: valid, expiring, expired, missing, awaiting verification; review queue (verify or reject with note);
  workers needing attention; filtered report with CSV export; documents visible only to users with `view_docs`.
- **Settings**: rules, integrations (Bullhorn, Sage, WhatsApp, each labelled simulated), team & access, audit log.
- **Supervisor phone**: my events; per event: required, confirmed, travelling, delayed, arrived, clocked in, missing,
  standby; message all, request status update, contact one, request replacement, register emergency worker (pending
  verification, cannot clock in until verified), record attendance, correct exceptions with note, approve timesheets.
- **Crew phone**: Jobs, My shifts, Clock in/out, Messages, Profile. Accept/decline offers, directions, instructions and
  PPE, travel status, clock in/out with timer (GPS, QR, simulated no signal), hours and estimated earnings, availability,
  upload or renew documents. WhatsApp preview toggle shows the same messages as WhatsApp.
- **Demo controls** (discreet clock pill): +15 min, +1 h, jump to the next reminder milestone or shift start/end,
  scenario helpers (three dropouts at 3Arena, simulated arrivals), simulated crowd activity toggle, reset demo data.

## Testing

- `npm run verify:ops`: engine checks for the five scenarios and the full chain (create event, find crew, offers, accept,
  roster, reminders, travel status, clock in, clock out, approve, export).
- `npm run typecheck`, `npm run build`.
- Browser pass at 1440 px and 375 px for all three roles, console clean, data consistent across views, refresh keeps changes.

## Out of scope

Real integrations, a backend, authentication, client portal, recruitment pipeline, analytics dashboards, agents UI, maps.
