# OSS Pulse

Frontend demo of an event staffing operating platform for OSS (Outsource Staffing Solutions), built on the Pulse v5 Harbour template. Synthetic sample data only: no backend, no live integrations, nothing is sent to anyone.

The centre of the demo is one connected workflow:

booking → two shifts → availability → individual invitations → acceptance → cancellation → replacement → arrival → verified attendance → corrected and approved hours → simulated Bullhorn handover.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173 (the desktop preview uses 5176)
npm run verify     # 45 scenario checks against the brief's numbers
npm run typecheck
npm run build
```

Open `/#crew` or `/#supervisor` on a phone to start in the employee or supervisor view.

## Where things are

| Area | Where |
| --- | --- |
| Entities, seed (Thu 12 Nov 2026 16:00), stages | `src/oss/model.ts`, `src/oss/seed.ts`, `src/oss/stages.ts` |
| Actions (audited), selectors (every total) | `src/oss/engine.ts`, `src/oss/selectors.ts` |
| Shared store (office, crew and supervisor read the same records) | `src/oss/store.ts` |
| Module pages | `src/oss/pages/` |
| OSS Crew and supervisor phone views | `src/oss/phone/` |
| Record drawers, UI kit, shell pieces | `src/oss/ui/` |
| Home chat answers (deterministic) | `src/oss/answers.ts` |
| Pulse shell, Home, Records and Ontology (kept) | `src/views/`, `src/logic/PulseLogic.js` (`ossOverrides`) |
| Scenario checks | `tests/scenario.ts` |

Demo state persists in this browser under its own versioned key. **Demo controls** (header chip) load the five stages, move scenario time and reset everything.

## Shortest path through the story

1. Home: 3Arena 25/30, 11 unfilled, one blocked five-hour handover. Ask "What needs attention before Saturday?".
2. Staffing, Allocation: Eoin blocked (Manual Handling valid through 13 Nov only).
3. Header **Crew** (Aidan): Schedule, Sat 14, available 07:00–14:00 and unavailable after; accept set-up, decline event crew. Office shows 26/30, then Sean accepts.
4. Agents, Staffing Assistant proposal or Allocation: invite Leah, Adam, Sofia; accept on their phones. 30/30.
5. Demo controls, Event day: Chloé cancels on her phone (19/20); Replacements, invite Orla; Orla accepts (20/20).
6. Owen reports running late; clock in at 240 m (rejected) then 42 m (accepted).
7. Hours review stage: Supervisor (Mark) proposes Niamh's 23:30 clock-out; office approves as Aoife; approve 30 lines (170h10m worked, 171h10m payable); export the client CSV.
8. Bullhorn handover: send the 3Arena batch; resolve Jamie's mapping and retry only his row (BH-1111-01 becomes 12/12, 60h).
9. Records, Ontology: graph plus the record lineage for Niamh.

## Template rules kept

See `CLAUDE.md`. Agents stays directly under Home in the side rail (the template's lock takes precedence over the brief's suggested order), Records opens on Ontology, and the Home centre holds only the status pill, greeting, subline, ask box and thread; briefing, metrics and attention items live in the right widget rail. Do not run `npm run import-design` on this copy.
