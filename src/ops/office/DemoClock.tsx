/* Discreet demo controls: the simulated clock, jumps to the next reminder or
   shift milestone, scenario helpers and the data reset. */

import { useState } from "react";
import * as E from "../engine";
import * as Q from "../selectors";
import { act, resetDemo, useOps } from "../store";
import { addMin, atDay, dayKey, fmtDay, fmtTime, ms, todayKey } from "../time";
import { Btn, Dialog, I, Icon, Popover, Toggle } from "../ui/kit";

export default function DemoClock() {
  const s = useOps();
  const [confirmReset, setConfirmReset] = useState(false);
  const me = s.ui.officeId;
  const move = (iso: string) => act(me, E.advance, iso);
  const day = dayKey(s.clock);
  const arena = Q.eventsOnDay(s, day).find((e) => e.name.startsWith("3Arena"));
  const show = arena && Q.shiftsOf(s, arena.id).find((x) => x.label === "Show crew" && ms(x.start) > ms(s.clock));
  const ms_ = Q.milestones(s).slice(0, 6);
  const stale = s.seedDay !== todayKey();
  return (
    <>
      <Popover width={340} button={(open, toggle) => (
        <button className="btn quiet" onClick={toggle} aria-expanded={open} title="Demo time and controls">
          <Icon d={I.time} /><span className="num">{fmtDay(day).replace(/^\w+ /, "")}, {fmtTime(s.clock)}</span><span className="tag sim hide-sm">Demo</span>
        </button>
      )}>
        {(close) => (
          <div className="stack g8" style={{ padding: 6 }}>
            <div>
              <div className="strong">Demo time: {fmtDay(day)}, {fmtTime(s.clock)}</div>
              <div className="tiny dim">Moves only forward. Reminders, travel checks and simulated crew run as it moves. Nothing is sent to anyone.</div>
            </div>
            <div className="row wrap">
              <Btn size="sm" onClick={() => move(addMin(s.clock, 15))}>+15 min</Btn>
              <Btn size="sm" onClick={() => move(addMin(s.clock, 60))}>+1 hour</Btn>
              <Btn size="sm" onClick={() => move(addMin(s.clock, 180))}>+3 hours</Btn>
              <Btn size="sm" onClick={() => move(atDay(dayKey(addMin(s.clock, 24 * 60)), "07:45"))}>Next morning</Btn>
            </div>
            {ms_.length > 0 && <>
              <div className="label" style={{ padding: "4px 0 0" }}>Jump to</div>
              {ms_.map((m) => (
                <button key={m.at} className="item" onClick={() => { move(m.at); close(); }}>
                  <span className="num strong" style={{ width: 44 }}>{fmtTime(m.at)}</span><span className="small">{m.label}{dayKey(m.at) !== day ? " (" + fmtDay(dayKey(m.at)) + ")" : ""}</span>
                </button>
              ))}
            </>}
            <div className="sep" />
            <div className="label" style={{ padding: 0 }}>Scenario helpers (simulated)</div>
            {show && <button className="item" onClick={() => { act(me, E.simulateDropouts, show.id, 3); close(); }}><Icon d={I.alert} />Three crew cancel tonight's 3Arena show</button>}
            <div style={{ padding: "4px 10px" }}>
              <Toggle on={s.ui.crowd} onChange={(v) => act(me, E.setCrowd, v)}>
                <span className="small">Simulated crew reply and clock in as time moves</span>
              </Toggle>
            </div>
            <div className="sep" />
            {stale && <div className="tiny dim" style={{ padding: "0 10px" }}>This demo data was created for {fmtDay(s.seedDay)}. Reset to start from today.</div>}
            <button className="item" onClick={() => { close(); setConfirmReset(true); }} style={{ color: "var(--bad)" }}><Icon d={I.refresh} />Reset demo data</button>
          </div>
        )}
      </Popover>
      {confirmReset && (
        <Dialog title="Reset the demo data?" onClose={() => setConfirmReset(false)}
          actions={<><Btn onClick={() => setConfirmReset(false)}>Keep my changes</Btn><Btn kind="danger" onClick={() => { resetDemo(); setConfirmReset(false); }}>Reset to 07:45 today</Btn></>}>
          Every change made in this browser (events, offers, replies, clock-ins, approvals) goes back to the starting sample data. This can't be undone.
        </Dialog>
      )}
    </>
  );
}
