# OSS simplified demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the simplified OSS event staffing demo (six areas, office + supervisor + crew on one dataset) as the default app, with the old Pulse demo kept at `/advanced`.

**Architecture:** New React app in `src/ops/` with its own typed model, deterministic date-relative seed, selectors (all derived numbers), engine (all mutations, audited) and a local store persisted to `localStorage`. Office screens and two phone apps render from the same store. `src/App.tsx` lazy-loads the untouched Pulse app for `/advanced`.

**Tech Stack:** React 18, TypeScript 5.6 (strict), Vite 6, plain CSS. No new dependencies.

Scope note: this plan fixes contracts (types, exported names, routes, acceptance checks) rather than repeating every
line of UI code; engine behaviour is pinned by the scenario script in Task 3, which is written before the engine.

## Global Constraints

- No new npm dependencies. React 18.3.1, TypeScript ~5.6.3, Vite ^6.
- Old demo untouched: no edits under `src/oss/`, `src/views/`, `src/logic/`, `src/components/`, `src/runtime/`, `src/styles/` except moving CSS imports into `src/advanced/AdvancedApp.tsx`.
- Storage key prefix `oss-ops-demo:`; never read, write or delete `oss-pulse-demo:` keys.
- Light theme default, accent `#064B68`, hover `#007BAE`. Status colours always paired with text and numbers.
- Copy: plain operational English, Irish context, 24-hour times, Europe/Dublin, euro. No exclamation marks. No em dashes in UI copy.
- Simulated integrations (WhatsApp, Bullhorn, Sage, GPS, QR) are labelled "Simulated" wherever they appear.
- Real people: first names only (Daniele, Bianca, Shane) with `@example.test` contact details. All crew fictional.
- Every engine mutation writes an audit entry and returns `{ ok, msg, data? }`.
- `npm run typecheck` and `npm run verify:ops` must pass at every commit from Task 3 on.

## File map

| File | Responsibility |
| --- | --- |
| `src/main.tsx` | Mount `<App/>` only. |
| `src/App.tsx` | Choose Pulse (`/advanced`, `#advanced`) or the ops app. |
| `src/advanced/AdvancedApp.tsx` | Old CSS imports + `LogicHost(PulseLogic, AppShell)`. |
| `src/ops/model.ts` | All entity types, `Rules`, `OpsState`. |
| `src/ops/time.ts` | Re-export `src/oss/time` helpers plus `weekStart`, `hm`, `atDay`. |
| `src/ops/rand.ts` | Deterministic `hash(str)`, `pick`, `chance`. |
| `src/ops/seed/*.ts` | `buildSeed(todayKey): OpsState` (people, places, events, history). |
| `src/ops/selectors.ts` | Lookups, coverage, status, eligibility, candidates, attendance, timesheet lines, compliance, alerts, milestones. |
| `src/ops/engine/*.ts` | Actions grouped by area, re-exported from `engine/index.ts`. |
| `src/ops/store.ts` | State, persistence, cross-tab sync, `act`, toasts, reset. |
| `src/ops/router.ts` | Path router: `useRoute`, `go`, `Link`. |
| `src/ops/ui/*.tsx` | Kit: buttons, status, table, tabs, drawer, modal, fields, toasts, icons. |
| `src/ops/office/**` | Shell and the six areas plus Settings and demo controls. |
| `src/ops/phone/**` | Phone dock, crew app, supervisor app, WhatsApp preview. |
| `src/ops/styles/ops.css` | Tokens (light/dark) and component styles. |
| `tests/ops-scenarios.ts` | Engine scenario checks (`npm run verify:ops`). |

## Contracts

### Result and actor
```ts
export interface Result { ok: boolean; msg: string; data?: any }
// Every action: (d: OpsState, ...args) => Result. The acting person is d.actor (user id or worker id),
// set by store.act(actorId, fn, ...args) and removed before commit.
```

### Selectors (exported names used by UI)
`worker, user, client, venue, event, shift, asg, offer` (lookups);
`shiftsOf(s, eventId)`, `asgsOfShift(s, shiftId)`, `asgsOfWorker(s, workerId)`, `offersOfShift`, `offersOfWorker`, `docsOf`;
`need(sh)`, `coverage(s, shiftId, role?) -> Cov`, `eventCov(s, eventId) -> Cov`, `staffStatus(s, eventId) -> { tone, label, detail }`;
`asgView(s, asgId) -> AsgView` (travel state, clock state, flags, exceptions);
`attendance(s, shiftIds) -> AttCounts`; `docState(s, workerId, type, at) -> DocView`; `compliance(s, workerId) -> CompView`;
`availabilityAt(s, workerId, start, end)`; `weekMinutes(s, workerId, anyIsoInWeek)`; `weekLimit(s, worker)`;
`eligibility(s, workerId, shiftId, role) -> Elig`; `candidates(s, shiftId, role, f?) -> Cand[]`; `eligibleAvailable(s, shiftId, role)`;
`line(s, asgId) -> Line | null`, `lines(s, f) -> Line[]`, `lineTotals(lines)`;
`alerts(s) -> Alert[]`; `todayStats(s)`; `eventsOnDay(s, dayKey)`; `milestones(s)`; `threadsFor(s, who)`.

### Engine (exported names)
Events: `createClient, updateClient, createVenue, saveEvent(EventForm), cancelEvent, setVenueRadius`.
Staffing: `sendOffers(d, shiftId, role, workerIds, opts?)`, `respondOffer(d, offerId, "accept" | "decline", via, note?)`,
`withdrawOffer, assignManual(d, shiftId, role, workerId, reason?)`, `removeAssignment(d, asgId, reason)`,
`cancelByWorker(d, asgId, reason, via)`, `addStandby, removeStandby, moveStandby`,
`offerReplacement(d, asgId, workerId)`, `confirmFromStandby(d, asgId, standbyId)`.
Crew: `registerWorker, updateWorker, setWeek, addOff, removeOff, uploadDoc, verifyDoc, registerEmergency, activateWorker`.
Comms: `sendMessage(d, MsgForm)`, `requestStatus(d, shiftIds)`, `replyCode(d, workerId, asgId, code, extra?)`, `workerText`, `markRead`.
Attendance: `clockIn(d, asgId, ClockOpts)`, `clockOut(d, asgId, ClockOpts)`, `syncOffline(d, asgId)`, `supervisorClock(d, asgId, kind, hhmm, note)`,
`correctClock(d, asgId, kind, hhmm, note)`, `resolveException(d, exId, note)`.
Timesheets: `approveSupervisor(d, asgIds)`, `approveOffice(d, asgIds)`, `reopenLine(d, asgId, reason)`, `exportSage(d, asgIds) -> data.csv`, `syncBullhorn(d)`.
Time: `advance(d, toIso)` (automations + simulated crowd), `simulateDropouts(d, shiftId, n)`, `simulateReplies(d, shiftId)`.
Settings: `setRule(d, key, value)`, `setRate(d, role, value)`.

### Routes
`/today`, `/events?view=day|week|month&date=YYYY-MM-DD`, `/events/new`, `/events/:id?tab=overview|roster|comms|attendance|timesheets|instructions`,
`/events/:id/edit`, `/clients`, `/clients/:id`, `/crew`, `/crew/new`, `/crew/:id`, `/comms`, `/comms/:threadId`, `/timesheets`,
`/compliance`, `/settings/rules|integrations|team|audit`, `/m/crew`, `/m/supervisor`, `/advanced`.

---

### Task 1: Boot split and app skeleton

**Files:** Create `src/advanced/AdvancedApp.tsx`, `src/ops/OpsApp.tsx`, `src/ops/router.ts`, `src/ops/styles/ops.css`; modify `src/App.tsx`, `src/main.tsx`, `index.html` (title).

- [ ] Move the five CSS imports from `src/main.tsx` into `AdvancedApp.tsx`; `AdvancedApp` renders `LogicHost` exactly as `App.tsx` does today.
- [ ] `App.tsx`: `const advanced = location.pathname.startsWith("/advanced") || location.hash === "#advanced"`; lazy import `AdvancedApp` when true, else render `OpsApp`.
- [ ] `router.ts`: `useRoute()` (pathname parts + query via `useSyncExternalStore` on `popstate`), `go(path, replace?)`, `<Link to>` that calls `go` on plain left click.
- [ ] Check: `npm run typecheck` passes; `/advanced` renders the old Home (greeting "Good afternoon, Shane"); `/` renders the ops shell placeholder.
- [ ] Commit.

### Task 2: Model, time helpers, deterministic seed

**Files:** Create `src/ops/model.ts`, `src/ops/time.ts`, `src/ops/rand.ts`, `src/ops/seed/{index,people,places,events,history}.ts`.

- [ ] Types per the spec's data model (exact field names live in `model.ts`; selectors and engine import from there only).
- [ ] `buildSeed(todayKey)` returns a full `OpsState` with clock `zoned(todayKey, "07:45")`, deterministic for a given day.
- [ ] Seed acceptance (checked in Task 3): today has 6 events; Aviva stewards short 5 with exactly 8 eligible available;
      CCD 2/12; 3Arena show 19/20 with 4 standby; NAC 16/16 with 3 flagged non-responders; RDS complete;
      yesterday has a 3 h shift paid 5 h and one missing clock-out; Ryder Cup has 7 days, 4 locations, 8 supervisors, peak day ~860 positions;
      persona workers exist (Ciarán, Maria Stamp 2 near 20 h, Priya Stamp 2 expired, Tomasz, Aoife).
- [ ] Commit.

### Task 3: Scenario checks first, then selectors and engine

**Files:** Create `tests/ops-scenarios.ts`, `src/ops/selectors.ts`, `src/ops/engine/{core,events,staffing,crew,comms,attendance,timesheets,time,settings,index}.ts`; modify `package.json` (`verify:ops` script, mirror of `verify`).

- [ ] Write `tests/ops-scenarios.ts` covering: seed acceptance above; Scenario 1 (new client, new venue, setup 10 + event 20,
      offers to 36, 32 accept: 30 confirmed, 2 standby, duplicate offer refused, overlapping shift refused);
      Scenario 2 (3 dropouts at 3Arena, standby confirm swaps, replacement offer accept stands down original, never both confirmed);
      Scenario 3 (Ryder Cup totals by day, location and supervisor; bulk offers to one location-day update totals);
      Scenario 4 (GPS 240 m rejected, 30 m ok, clock out after 3 h, payable 5 h, supervisor then office approval, Sage CSV contains the line, Bullhorn sync marks rows);
      Scenario 5 (expired Stamp 2 blocks offers and manual assign even with a reason; upload renewal is pending and still blocks; verify makes eligible; offer accepted);
      automations (T-24 reconfirm message once, T-2 travel message once, T-45 flags non-responders, auto-reassign sends one offer when on);
      structured replies (on_way, late with ETA, arrived, lost, cant_make cancels and raises shortfall).
- [ ] Run `npm run verify:ops`: fails (modules missing).
- [ ] Implement selectors and engine until every check passes.
- [ ] Commit.

### Task 4: Store, UI kit, office shell, demo controls

**Files:** Create `src/ops/store.ts`, `src/ops/ui/{icons,kit,table,overlay,fields,toast}.tsx`, `src/ops/office/{Shell,DemoClock,UserMenu}.tsx`.

- [ ] Store: `useOps`, `getState`, `act(actor, fn, ...args)`, `actQuiet`, `setUi`, `resetDemo`, `toast`, `useToasts`; persists (debounced) under `oss-ops-demo:<version>`; listens to `storage` for cross-tab updates.
- [ ] Shell: rail (logo, six areas with counts, Settings), top bar (title, search, Office/Supervisor/Crew switch, demo clock, user menu), phone dock area, mobile nav drawer under 900 px.
- [ ] Demo clock popover: +15 min, +1 h, +3 h, next milestones, scenario helpers, crowd toggle, reset (confirm dialog).
- [ ] Check in browser: navigation between all six areas, refresh keeps route and data, reset restores seed.
- [ ] Commit.

### Task 5: Today and Events

**Files:** Create `src/ops/office/Today.tsx`, `src/ops/office/events/{Calendar,EventForm,Workspace,Roster,FindCrew,Clients}.tsx`.

- [ ] Today: count strip, needs-attention list with working actions, event board (status colour + label + numbers), row opens workspace.
- [ ] Calendar: Day (default today) / Week / Month, prev/next/today, filters (client, supervisor, location, status, search); cards clickable.
- [ ] Event form: create and edit; inline create client and location; shifts with roles and counts, supervisor per shift, instructions, PPE, quals; validation messages.
- [ ] Workspace tabs: Overview, Shifts & roster, Communications, Attendance, Timesheets, Instructions; large events group by day and location with totals and filters.
- [ ] Find crew panel: filters (available, skill, valid docs, area, has assignments, weekly hours), select, Send offers (FCFS note when more than open places), Assign directly (override reason for soft blocks, hard blocks disabled with reason), standby actions, replacement actions, simulated replies helper.
- [ ] Clients tab: list, record (essentials, locations, upcoming/previous events, New event for client).
- [ ] Commit.

### Task 6: Crew, Communications, Timesheets, Compliance, Settings

**Files:** Create `src/ops/office/crew/{CrewList,CrewProfile,RegisterWorker}.tsx`, `src/ops/office/{Comms,Timesheets,Compliance,Settings}.tsx`.

- [ ] Crew list paged (50 per page) with search and filters; profile with every section in the spec; edit details and availability; assign to event; register with duplicate check.
- [ ] Comms: thread list (event, direct), thread view with reply tallies, compose with audiences and templates, WhatsApp preview.
- [ ] Timesheets: day/week, filters, statuses, approve one/batch, Sage export preview + CSV download, Bullhorn sync preview, weekly hour warnings.
- [ ] Compliance: status tabs with counts, review queue (verify/reject with note), restricted file view, report filters + CSV export.
- [ ] Settings: rules form (all `Rules` fields), integrations (Simulated badges, last sync), team & access, audit log with search.
- [ ] Commit.

### Task 7: Phone apps

**Files:** Create `src/ops/phone/{PhoneDock,CrewApp,SupervisorApp,WhatsApp,phone.css}.tsx`.

- [ ] Dock beside office on desktop; full screen at `/m/crew`, `/m/supervisor` and on narrow viewports when switching view.
- [ ] Crew app tabs Jobs, My shifts, Clock, Messages, Profile with every action in the spec; persona picker; WhatsApp preview toggle.
- [ ] Supervisor app: my events, event crew groups, actions in the spec, emergency registration, timesheet approval.
- [ ] Commit.

### Task 8: End-to-end verification and docs

- [ ] Browser: run the five scenarios and the full chain as office, supervisor and crew at 1440 px and 375 px; console clean.
- [ ] `npm run typecheck`, `npm run verify:ops`, `npm run verify`, `npm run build` pass.
- [ ] Update `README.md` (how to demo the five scenarios, what is simulated) and add the exception note to `CLAUDE.md`.
- [ ] Commit.
