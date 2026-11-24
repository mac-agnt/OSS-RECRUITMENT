/* Small dialogs shared by the event workspace and Timesheets. */

import { useState } from "react";
import * as E from "../engine";
import * as Q from "../selectors";
import { office, useOps } from "../store";
import { fmtTime } from "../time";
import { Btn, Dialog } from "../ui/kit";

export function SetTime({ asgId, onClose }: { asgId: string; onClose: () => void }) {
  const s = useOps();
  const a = Q.asg(s, asgId), v = Q.asgView(s, asgId);
  const [kind, setKind] = useState<"in" | "out">(v.inAt ? "out" : "in");
  const [hm, setHm] = useState(kind === "out" ? fmtTime(v.sh.end) : fmtTime(v.sh.start));
  const [note, setNote] = useState("");
  return (
    <Dialog title={"Set " + v.w.name + "'s time"} onClose={onClose}
      actions={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={note.trim().length < 5} onClick={() => { if (office(E.correctClock, a.id, kind, hm, note).ok) onClose(); }}>Save with note</Btn></>}>
      <div className="stack g12">
        <div className="row">
          <button className={"chip" + (kind === "in" ? " on" : "")} onClick={() => setKind("in")}>Clock-in</button>
          <button className={"chip" + (kind === "out" ? " on" : "")} onClick={() => setKind("out")}>Clock-out</button>
          <input className="input" type="time" value={hm} onChange={(e) => setHm(e.target.value)} aria-label="Time" style={{ width: 130 }} />
        </div>
        <textarea className="textarea" style={{ minHeight: 64 }} placeholder="Audit note: how do you know the time?" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Audit note" />
        <span className="tiny dim">The original clock records are kept. The timesheet goes back for approval.</span>
      </div>
    </Dialog>
  );
}

export function ResolveDialog({ exId, onClose }: { exId: string; onClose: () => void }) {
  const s = useOps();
  const x = Q.exceptionById(s, exId);
  const [note, setNote] = useState("");
  return (
    <Dialog title="Resolve this issue" onClose={onClose}
      actions={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" disabled={note.trim().length < 3} onClick={() => { if (office(E.resolveException, exId, note).ok) onClose(); }}>Resolve</Btn></>}>
      <div className="stack g8"><span>{x.detail}</span><input className="input" autoFocus placeholder="Note for the audit log" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Note" /></div>
    </Dialog>
  );
}

