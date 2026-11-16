# OSS Pulse

Event staffing platform demo for OSS Recruitment, built on the Pulse Harbour template. It covers OSS's requirements sheet and developer brief: bookings and staffing gaps, availability, individual shift offers, replacements, crew messaging, live attendance with venue check-in, timesheets with the five-hour minimum and overtime, and the handover of approved hours to Bullhorn. The OSS Crew employee app and a site supervisor app run in a phone frame beside the office view, on the same records.

Frontend only, with sample data. Nothing is sent to anyone. Messages, GPS and QR check-in, and Bullhorn are simulated.

## Company scale

The 3Arena story runs on the Dublin events desk. Around it the demo carries the rest of OSS, all synthetic and deterministic (`src/oss/network.ts`):

- Six desks: Dublin events, Stadia and sport, Live music and theatre, Corporate and hospitality, Cork and Munster, West and North. 18 office users.
- 856 crew across five regions, 19 clients, 26 venues nationwide with map coordinates.
- About 1,390 positions in the opening week across 27 events, plus bookings to the end of December.
- Clock-ins, desk approvals and Bullhorn sends for the other desks play forward with the story clock, so Event day shows 10 live events on Saturday afternoon.
- The story's own numbers are unchanged: `Q.windowTotals(s, { desk: "Dublin events desk" })` still reads 106 / 95 / 89.6%.

Colour has one meaning per hue: kind of work, desk and region use the category palette (`--k-1` to `--k-6`, `kindVar`, `deskVar`, `regionVar`); status keeps green, amber and red; orange is urgent only.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm run verify     # 48 scenario checks
npm run typecheck
npm run build
```

On a real phone, open `/#crew` or `/#supervisor` to go straight into the apps.

## Sidebar

| Group | Module | What it covers |
| --- | --- | --- |
| | Home | AI chat with suggested questions; rail with top-priority items, next events, replies waiting, compliance, briefing |
| | Agents | Operations room: each agent's work log with inline decisions, what it watches, can and never does, who signs off; the team on a 36-hour timeline and how work moves between them; an approval inbox showing exactly who or what each proposal affects |
| | Calendar | Month (events, inductions, payroll cut-off), week (crew needed vs free), season |
| | Clients | Accounts with fill rate, hours, preferred crew, do-not-rebook list, standards; sign-off; venues |
| | Dashboard | Control panel ("N things to do, M urgent") with one-click actions; executive metrics; year ahead |
| Run events | Events | Bookings, every event with staffing, call sheet, roles and team leaders, kit and welfare, hours and client sign-off |
| | Staffing | Allocate with Stamp 2 hours, 11-hour rest, reliability and client preferences on every candidate; responses; replacements |
| | Event day | Command centre for all of Ireland: live figures, crew-on-site curve, map of every event, needs-attention list, event cards, one event's crew in lanes; venue check-in; exceptions |
| | Timesheets | Rostered vs actual, 5-hour minimum, overtime, corrections, Bullhorn |
| Crew | Crew | Register, availability, documents, on-site registration |
| | Recruitment | Pipeline from application to active crew, group inductions, Ryder Cup 2027 plan |
| | Compliance | Right to work and the Stamp 2 20-hour cap, Working Time Act rest and breaks, licences and vetting per event |
| | Messages | Inbox, event and bulk messages, reminders |
| Portals | Portals | Client portal (live staffing, hours sign-off), OSS Crew app, supervisor app |
| Run the business | Reports, Records, Activity | Client and payroll exports, qualifications; Ontology; audit trail |

The bottom bar carries the story clock and opens the crew app, supervisor app and client portal.

## Walking the 3Arena story

The story clock in the bottom bar (dots + time) moves through the 3Arena story. It moves the scenario between five moments; everything else is clicked live.

1. **The booking call** (Thu 16:00). Dashboard shows 3Arena at 25/30. Events, open 3Arena: two shifts, who accepted, who hasn't answered, PPE.
2. **Phone, as Aidan Murphy.** Calendar: set Saturday free 07:00 to 14:00, not free after. Home: accept set-up crew, decline event crew. The office counts change straight away.
3. **Staffing, Allocate.** Pick the gap, tick Leah, Adam and Sofia (or approve the Staffing Assistant's proposal in Agents), send. Accept on their phones: 30/30.
4. **Event day** (story clock, step 3). Phone as Chloé Ryan: open the shift, "Can't make it". Staffing, Replacements shows the gap with the standby list; send Orla the offer, accept on Orla's phone.
5. **Owen running late.** Phone as Owen Clarke: open the shift, Running late, ETA 17:20. Story clock: Sat 16:50, then "Crew checks in", then Sat 17:12 (missed clock-in alert). Attendance shows him late. At Sat 17:20, Clock in at 240 m (rejected), then 42 m (accepted). Venue check-in shows every reading.
6. **Morning after** (step 4). Phone, Supervisor: Issues, fix Niamh's clock-out to 23:30. Timesheets, Corrections: approve it. Review: approve all 30 lines (170h rostered, 170h10m worked, +1h minimum, 171h10m payable, 1h30m overtime).
7. **Bullhorn.** Timesheets, Bullhorn: send the 3Arena hours (30 rows, 10,270 minutes). Jamie Allen's row from Wednesday is blocked: Match and retry. Reports, Client report: export the week to Excel.

"Start over" in the story clock resets everything.

## Where things are

| Area | Where |
| --- | --- |
| Records, seed (Thu 12 Nov 2026 16:00), story stages | `src/oss/model.ts`, `src/oss/seed.ts`, `src/oss/stages.ts` |
| Industry layer (right to work, rest, call sheets, clients, recruitment) and to-do engine | `src/oss/industry.ts`, `src/oss/extSeed.ts`, `src/oss/todo.ts` |
| Actions (all audited), selectors (every total) | `src/oss/engine.ts`, `src/oss/selectors.ts` |
| Shared store | `src/oss/store.ts` |
| Office pages | `src/oss/pages/` |
| OSS Crew and supervisor apps, check-in | `src/oss/phone/` |
| UI kit, drawers, shell pieces | `src/oss/ui/`, `src/styles/oss.css` |
| Pulse shell, Home, Records and Ontology (template) | `src/views/`, `src/logic/PulseLogic.js` (`ossOverrides`) |
| Scenario checks | `tests/scenario.ts` |

## Template rules kept

See `CLAUDE.md`. Agents sits directly under Home, Records opens on Ontology, and the Home centre holds only the pill, greeting, subline, ask box and thread. Do not run `npm run import-design` on this copy.
