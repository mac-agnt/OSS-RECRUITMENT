/* Office shell: side rail with the six areas, top bar (search, role switch, demo
   clock, user), page router and the phone dock for the supervisor and crew apps. */

import { useEffect, useMemo, useState } from "react";
import type { OpsState } from "../model";
import * as Q from "../selectors";
import { go, Link, useRoute } from "../router";
import { getState, setUi, useOps } from "../store";
import { Avatar, Btn, Count, I, Icon, Popover, Seg } from "../ui/kit";
import DemoClock from "./DemoClock";
import Today from "./Today";
import Calendar from "./events/Calendar";
import EventForm from "./events/EventForm";
import Workspace from "./events/Workspace";
import { ClientList, ClientPage } from "./events/Clients";
import CrewList from "./crew/CrewList";
import CrewProfile from "./crew/CrewProfile";
import RegisterWorker from "./crew/RegisterWorker";
import Comms from "./Comms";
import Timesheets from "./Timesheets";
import Compliance from "./Compliance";
import Settings from "./Settings";
import PhoneDock from "../phone/PhoneDock";

const NAV = [
  { id: "today", label: "Today", icon: I.today, to: "/today" },
  { id: "events", label: "Events", icon: I.events, to: "/events" },
  { id: "crew", label: "Crew", icon: I.crew, to: "/crew" },
  { id: "comms", label: "Communications", icon: I.comms, to: "/comms" },
  { id: "timesheets", label: "Timesheets", icon: I.hours, to: "/timesheets" },
  { id: "compliance", label: "Compliance", icon: I.shield, to: "/compliance" }
];
const TITLES: Record<string, string> = { today: "Today", events: "Events", clients: "Events", crew: "Crew", comms: "Communications", timesheets: "Timesheets", compliance: "Compliance", settings: "Settings" };

function counts(s: OpsState) {
  const alerts = Q.alerts(s);
  return {
    today: alerts.filter((a) => a.tone === "bad").length,
    comms: Q.unreadForOffice(s).length,
    timesheets: Q.officeQueue(s),
    compliance: s.docs.filter((d) => d.status === "pending").length
  };
}

function Page() {
  const r = useRoute();
  const [a, b, c] = r.parts;
  switch (a) {
    case "today": return <Today />;
    case "events":
      if (!b) return <Calendar />;
      if (b === "new") return <EventForm />;
      return c === "edit" ? <EventForm id={b} /> : <Workspace id={b} />;
    case "clients": return b ? <ClientPage id={b} /> : <ClientList />;
    case "crew":
      if (!b) return <CrewList />;
      return b === "new" ? <RegisterWorker /> : <CrewProfile id={b} />;
    case "comms": return <Comms threadId={b} />;
    case "timesheets": return <Timesheets />;
    case "compliance": return <Compliance />;
    case "settings": return <Settings tab={b} />;
    default:
      return <div className="o-page"><div className="empty"><b>Page not found</b><Link to="/today">Go to Today</Link></div></div>;
  }
}

function GlobalSearch() {
  const s = useOps();
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    const out: { to: string; label: string; sub: string; icon: string }[] = [];
    for (const e of s.events) if (e.name.toLowerCase().includes(t)) out.push({ to: "/events/" + e.id, label: e.name, sub: Q.client(s, e.clientId).name, icon: I.events });
    for (const w of s.workers) if (w.name.toLowerCase().includes(t) || w.mobile.replace(/\s/g, "").includes(t.replace(/\s/g, ""))) out.push({ to: "/crew/" + w.id, label: w.name, sub: w.roles.join(", ") + " · " + w.area, icon: I.user });
    for (const c of s.clients) if (c.name.toLowerCase().includes(t)) out.push({ to: "/clients/" + c.id, label: c.name, sub: "Client", icon: I.client });
    return out.slice(0, 9);
  }, [q, s]);
  return (
    <Popover width={360} align="left" button={(open, toggle) => (
      <button className="btn quiet" onClick={toggle} aria-expanded={open} title="Search events, crew and clients"><Icon d={I.search} /><span className="hide-sm">Search</span></button>
    )}>
      {(close) => (
        <div className="stack g8" style={{ padding: 4 }}>
          <div className="searchbox"><Icon d={I.search} size={15} /><input className="input" autoFocus placeholder="Events, crew, clients, mobile numbers" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" /></div>
          {q.trim().length >= 2 && !results.length && <div className="dim small" style={{ padding: "4px 8px" }}>No matches.</div>}
          {results.map((x) => (
            <button key={x.to} className="item" onClick={() => { close(); setQ(""); go(x.to); }}>
              <Icon d={x.icon} /><span className="stack" style={{ gap: 0 }}><span className="ink">{x.label}</span><span className="tiny dim">{x.sub}</span></span>
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

function UserMenu() {
  const s = useOps();
  const me = Q.user(s, s.ui.officeId)!;
  return (
    <Popover width={260} button={(open, toggle) => (
      <button className="btn quiet" onClick={toggle} aria-expanded={open} style={{ paddingLeft: 6 }}>
        <Avatar name={me.name} size="sm" /><span className="hide-sm">{me.name}</span><Icon d={I.chevD} size={14} />
      </button>
    )}>
      {(close) => (
        <>
          <div className="label">Signed in as (demo)</div>
          {s.users.filter((u) => u.kind === "office").map((u) => (
            <button key={u.id} className={"item" + (u.id === me.id ? " on" : "")} onClick={() => { setUi({ officeId: u.id }); close(); }}>
              <Avatar name={u.name} size="sm" /><span className="stack" style={{ gap: 0 }}><span>{u.name}</span><span className="tiny dim">{u.title}</span></span>
            </button>
          ))}
          <div className="sep" />
          <button className="item" onClick={() => { setUi({ theme: s.ui.theme === "light" ? "dark" : "light" }); close(); }}>
            <Icon d={s.ui.theme === "light" ? I.moon : I.sun} />{s.ui.theme === "light" ? "Dark theme" : "Light theme"}
          </button>
          <button className="item" onClick={() => { close(); if (window.innerWidth < 900) go("/m/supervisor"); else setUi({ view: "supervisor" }); }}><Icon d={I.phone} />Supervisor app</button>
          <button className="item" onClick={() => { close(); if (window.innerWidth < 900) go("/m/crew"); else setUi({ view: "crew" }); }}><Icon d={I.phone} />Crew app</button>
          <div className="sep" />
          <button className="item" onClick={() => { close(); go("/settings/rules"); }}><Icon d={I.settings} />Settings</button>
          <a className="item" href="/advanced" style={{ textDecoration: "none" }}><Icon d={I.arrowR} />Previous full platform</a>
        </>
      )}
    </Popover>
  );
}

export default function Shell() {
  const s = useOps();
  const r = useRoute();
  const [navOpen, setNavOpen] = useState(false);
  const c = useMemo(() => counts(s), [s]);
  const section = r.parts[0] || "today";
  const active = section === "clients" ? "events" : section;
  useEffect(() => { setNavOpen(false); }, [r.href]);
  const setView = (v: "office" | "supervisor" | "crew") => {
    if (v !== "office" && window.innerWidth < 900) { go("/m/" + v); return; }
    setUi({ view: v });
  };
  const badge: Record<string, React.ReactNode> = {
    today: <Count n={c.today} tone="bad" />, comms: <Count n={c.comms} tone="accent" />,
    timesheets: <Count n={c.timesheets} />, compliance: <Count n={c.compliance} tone="warn" />
  };
  return (
    <div className="o-app">
      {navOpen && <div className="scrim" style={{ zIndex: 64 }} onClick={() => setNavOpen(false)} aria-hidden="true" />}
      <nav className={"o-rail" + (navOpen ? " open" : "")} aria-label="Main">
        <div className="o-brand"><img src="/brand/oss-logo.png" alt="" /><div><b>OSS Recruitment</b><span>Event staffing</span></div></div>
        <div className="o-nav">
          {NAV.map((n) => (
            <Link key={n.id} to={n.to} className={active === n.id ? "on" : ""} aria-current={active === n.id ? "page" : undefined}>
              <Icon d={n.icon} size={18} />{n.label}<span className="count-slot" style={{ marginLeft: "auto" }}>{badge[n.id]}</span>
            </Link>
          ))}
        </div>
        <div className="o-rail-foot o-nav">
          <Link to="/settings/rules" className={active === "settings" ? "on" : ""}><Icon d={I.settings} size={18} />Settings</Link>
        </div>
      </nav>
      <div className="o-main">
        <header className="o-top">
          <Btn kind="quiet" icon={I.menu} iconOnly title="Menu" className="o-menu-btn" onClick={() => setNavOpen(true)} />
          <span className="title">{TITLES[active] || "OSS"}</span>
          <GlobalSearch />
          <div className="grow" />
          <div className="hide-sm"><Seg label="Demo view" value={s.ui.view} onChange={setView} items={[{ id: "office", label: "Office" }, { id: "supervisor", label: "Supervisor" }, { id: "crew", label: "Crew" }]} /></div>
          <DemoClock />
          <UserMenu />
        </header>
        <div className="o-scroll" data-scroll>
          <Page />
          <footer className="portal-bar">
            <div className="stack"><b>Out on site?</b><span>Open the supervisor portal to see who is attending, travelling, delayed or missing, or the worker app to see what crew see.</span></div>
            <div className="row wrap">
              <Btn kind="primary" icon={I.phone} onClick={() => go("/m/supervisor")}>Bring me to the supervisors' portal</Btn>
              <Btn icon={I.user} onClick={() => go("/m/crew")}>Worker app</Btn>
            </div>
          </footer>
        </div>
      </div>
      {s.ui.view !== "office" && <PhoneDock />}
    </div>
  );
}

export { getState };
