# OSS Recruitment: event staffing demo

A simple, working event staffing system for OSS Recruitment's events division, built after three discovery calls
with Shane and Daniele. One shared dataset drives three experiences: the office platform, the supervisor app and the
crew app.

Frontend only, with fictional sample data. WhatsApp, Bullhorn, Sage, location checks and QR codes are simulated and
labelled as such wherever they appear. Nothing is sent to anyone.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173/today
npm run verify:ops   # 27 scenario checks for the events engine
npm run typecheck
npm run build
```

- **Office**: `/today`. Switch **Office | Supervisor | Crew** in the top bar to open a phone beside the office view.
- **Phones**: `/m/crew` and `/m/supervisor` open the apps full screen (use these on a real phone).
- **Previous full platform**: `/advanced` (also kept on the `advanced-platform` branch).

Changes are saved in this browser and survive refreshes; other tabs on the same computer stay in sync.
**Reset demo data** in the demo clock menu (top bar) starts again from this morning.

## What's in it

| Area | What it does |
| --- | --- |
| Today | What needs attention this morning, the day's counts and every shift with staffing (green, amber, red, grey) and attendance. |
| Events | Calendar (Day by default, Week, Month) with filters; New event; the event workspace (overview, shifts and roster, messages, attendance, timesheets, instructions); Clients. |
| Crew | Searchable list of about 1,040 workers with availability, skills, area, bookings, weekly hours, compliance and contact; profiles; register a worker; assign to an event. |
| Communications | Event and direct threads, messages to one worker, an event crew, selected or unconfirmed workers, structured replies with tallies, WhatsApp preview. |
| Timesheets | Built from clock-in and clock-out; supervisor then office approval; five-hour minimum shown separately; Sage CSV export; Bullhorn sync preview. |
| Compliance | Valid, expiring, expired and missing documents; verification queue; renewal requests; filtered CSV report; restricted document view. |
| Settings | Rules, integrations, team and access, audit log. |

## Demo data

Generated from the day you open it, so Today is always today. The demo clock starts at 07:45.

- **Today**: RDS build (finished), National Aquatic Centre gala (three crew not replying, flagged at 45 minutes),
  Guinness Storehouse lunch, 3Arena load-in and show (one place open, four on standby), Aviva Stadium match day
  ("requires five additional workers, eight eligible available"), Convention Centre Dublin dinner (2 of 12).
- **Yesterday**: timesheets waiting for the office, including a three-hour shift paid at five hours and a missing clock-out.
- **Ahead**: two weeks of bookings, Electric Picnic 2027 and the Ryder Cup 2027 (seven days, four locations, eight
  supervisors, about 860 positions on peak days).
- **Phone personas**: Ciarán (3Arena load-in today), Maria (Stamp 2, close to 20 hours), Priya (Stamp 2 permission
  expired), Tomasz (3Arena show tonight), Aoife (offer for tonight's dinner). Supervisors: Bianca and colleagues.
  Real OSS people appear by first name only; every worker is fictional.

## Demo clock

The clock pill in the top bar moves demo time forward (+15 min, +1 hour, +3 hours, next morning, or jump to the next
reminder or shift milestone). As time moves:

- 24 hours before a shift, confirmed crew are asked to reconfirm.
- 2 hours before, they're asked for their travelling status.
- 45 minutes before, anyone who hasn't replied is flagged and a replacement is recommended (standby first).
- Simulated crew (everyone except the phone personas) reply, clock in and clock out. Turn this off in the same menu.

## Five scenarios to walk through

1. **Last-minute request**: New event, add a 10-person set-up shift and a 20-person event shift, save, then
   Find crew, Select best, Send offers. Simulate replies (or accept on a crew phone). The first acceptances fill the
   roster; later ones join standby.
2. **Dropouts**: demo clock, "Three crew cancel tonight's 3Arena show". Today shows the shortfall; open 3Arena,
   confirm standby workers or send replacement offers.
3. **Ryder Cup**: Events, Ryder Cup 2027, Shifts and roster. Staffing by day, filter by location or supervisor,
   find crew for one location and day.
4. **Attendance and payroll**: jump to 12:00, crew phone as Ciarán, Clock in (try "240 m away" first), +3 hours,
   Clock out: 3 hours worked, 5 paid. Supervisor phone as Marek, Approvals. Timesheets, approve, Sage export.
5. **Expired documentation**: crew phone as Priya (blocked), upload the renewed work authorisation. Compliance,
   Awaiting verification, Verify. Offer her tonight's dinner shift and accept on her phone.

## Rules (all in Settings)

Clock-in radius (50 m, per location too), clock-in window, missing clock-out alert, minimum paid hours (5), unpaid
break, overtime flags (flag only, to validate with OSS), sample pay rates, reminder timings (24 h, 2 h, 45 min),
automatic reassignment (off), offer expiry, Stamp 2 limits (20 h term, 40 h holidays; no limit for others, warning
over 48 h), document expiry warnings and reminders, qualifications per role.

Compliance blocks (photo ID, work authorisation, required qualifications, unverified documents) and double bookings
can never be overridden. Availability, travel time between venues and Stamp 2 hours can be, with a recorded reason.

## Where things are

| | |
| --- | --- |
| Design and plan | `docs/superpowers/specs/2026-11-24-oss-simplified-demo-design.md`, `docs/superpowers/plans/2026-11-24-oss-simplified-demo.md` |
| Model, selectors, engine | `src/ops/model.ts`, `src/ops/selectors.ts`, `src/ops/engine/` |
| Seed (date-relative) | `src/ops/seed/` |
| Store and router | `src/ops/store.ts`, `src/ops/router.ts` |
| Office screens | `src/ops/office/` |
| Phone apps | `src/ops/phone/` |
| Styles | `src/ops/styles/ops.css` |
| Scenario checks | `tests/ops-scenarios.ts` |
| Previous Pulse platform | `src/advanced/`, `src/oss/`, `src/views/`, `src/logic/` (`npm run verify` runs its 48 checks) |
