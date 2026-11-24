/* Phone apps beside the office (desktop) or full screen (/m/crew, /m/supervisor
   and on phones). The persona picker is a demo control: it chooses who the
   phone belongs to. */

import { useMemo, useState } from "react";
import * as Q from "../selectors";
import { go } from "../router";
import { setUi, useOps } from "../store";
import { Btn, I, Icon, Seg, Select } from "../ui/kit";
import CrewApp from "./CrewApp";
import SupervisorApp from "./SupervisorApp";

function PersonaPicker({ app }: { app: "crew" | "supervisor" }) {
  const s = useOps();
  const [other, setOther] = useState(false);
  const [q, setQ] = useState("");
  const personas = s.workers.filter((w) => w.persona);
  const matches = useMemo(() => (q.trim().length > 1 ? s.workers.filter((w) => w.name.toLowerCase().includes(q.toLowerCase())).slice(0, 6) : []), [q, s.workers]);
  if (app === "supervisor") return (
    <div style={{ width: 150 }}><Select sm label="Supervisor" value={s.ui.supervisorId} onChange={(v) => setUi({ supervisorId: v })}
      options={s.users.filter((u) => u.kind === "supervisor").map((u) => ({ value: u.id, label: u.name }))} /></div>
  );
  const cur = Q.worker(s, s.ui.crewId);
  const opts = personas.map((w) => ({ value: w.id, label: w.name }));
  if (cur && !cur.persona) opts.push({ value: cur.id, label: cur.name });
  return (
    <div className="row" style={{ position: "relative" }}>
      <div style={{ width: 160 }}><Select sm label="Worker" value={s.ui.crewId} onChange={(v) => setUi({ crewId: v })} options={opts} /></div>
      <Btn size="sm" kind="quiet" icon={I.search} iconOnly title="View as another worker" onClick={() => setOther((x) => !x)} />
      {other && (
        <div className="popover" style={{ right: 0, top: "calc(100% + 6px)", width: 260 }}>
          <input className="input sm" autoFocus placeholder="Search any worker" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search any worker" />
          {matches.map((w) => <button key={w.id} className="item" onClick={() => { setUi({ crewId: w.id }); setOther(false); setQ(""); }}>{w.name}<span className="tiny dim">{w.roles[0]}</span></button>)}
        </div>
      )}
    </div>
  );
}

export default function PhoneDock() {
  const s = useOps();
  const app = s.ui.view === "supervisor" ? "supervisor" : "crew";
  return (
    <aside className="dock" aria-label={app === "crew" ? "Crew app" : "Supervisor app"}>
      <div className="dock-h">
        <Seg label="Phone app" value={app} onChange={(v) => setUi({ view: v })} items={[{ id: "supervisor", label: "Supervisor" }, { id: "crew", label: "Crew" }]} />
        <PersonaPicker app={app} />
        <span className="grow" />
        <a className="btn quiet sm icon" href={"/m/" + app} target="_blank" rel="noreferrer" title="Open full screen in a new tab" aria-label="Open full screen"><Icon d={I.arrowR} /></a>
        <Btn size="sm" kind="quiet" icon={I.x} iconOnly title="Close the phone" onClick={() => setUi({ view: "office" })} />
      </div>
      <div className="dock-b">
        <div className="device"><div className="screen">{app === "crew" ? <CrewApp /> : <SupervisorApp />}</div></div>
      </div>
    </aside>
  );
}

export function PhoneFull({ app }: { app: "crew" | "supervisor" }) {
  return (
    <div className="m-full">
      <div className="m-demo">
        <span className="tag sim">Demo</span>
        <span className="dim">Viewing as</span>
        <PersonaPicker app={app} />
        <span className="grow" />
        <Seg label="Phone app" value={app} onChange={(v) => go("/m/" + v, { replace: true })} items={[{ id: "supervisor", label: "Supervisor" }, { id: "crew", label: "Crew" }]} />
        <Btn size="sm" kind="ghost" onClick={() => { setUi({ view: "office" }); go("/today"); }}>Office</Btn>
      </div>
      <div className="m-app-wrap">{app === "crew" ? <CrewApp /> : <SupervisorApp />}</div>
    </div>
  );
}
