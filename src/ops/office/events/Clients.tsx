/* Clients: essential details only (Bullhorn remains the CRM), their locations
   and events, and a shortcut to create an event for them. */

import { useMemo, useState } from "react";
import * as E from "../../engine";
import * as Q from "../../selectors";
import { go } from "../../router";
import { office, useOps } from "../../store";
import { dayKey, fmtDay, ms } from "../../time";
import { Btn, Drawer, Field, I, KV, Notice, Panel, Search, Status, Table } from "../../ui/kit";
import { Page } from "../common";
import { EventsTabs } from "./Calendar";

function ClientDrawer({ id, onClose }: { id?: string; onClose: () => void }) {
  const s = useOps();
  const c = id ? Q.client(s, id) : undefined;
  const [f, setF] = useState({ name: c?.name || "", contact: c?.contact || "", email: c?.email || "", phone: c?.phone || "" });
  const save = () => {
    const r = c ? office(E.updateClient, c.id, f) : office(E.createClient, f);
    if (r.ok) { onClose(); if (!c) go("/clients/" + r.data.id); }
  };
  return (
    <Drawer title={c ? "Edit " + c.name : "New client"} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="primary" onClick={save}>Save</Btn></>}>
      <div className="stack g12">
        <Field label="Company name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Contact name"><input className="input" value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></Field>
        <div className="grid2"><Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field></div>
      </div>
    </Drawer>
  );
}

export function ClientList() {
  const s = useOps();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const now = ms(s.clock);
  const rows = useMemo(() => s.clients.map((c) => {
    const evs = Q.eventsOfClient(s, c.id).filter((e) => e.status === "confirmed");
    const next = evs.map((e) => Q.eventSpan(s, e.id)).filter((x) => ms(x.end) > now).sort((a, b) => a.start.localeCompare(b.start))[0];
    return { c, upcoming: evs.filter((e) => ms(Q.eventSpan(s, e.id).end) > now).length, past: evs.filter((e) => ms(Q.eventSpan(s, e.id).end) <= now).length, next };
  }).filter((x) => !q || x.c.name.toLowerCase().includes(q.toLowerCase()) || x.c.contact.toLowerCase().includes(q.toLowerCase())), [s, q]);
  return (
    <Page title="Events" sub="Clients: who books, how to reach them, and their events." actions={<Btn kind="primary" icon={I.plus} onClick={() => setAdding(true)}>New client</Btn>}>
      <EventsTabs on="clients" />
      <div className="toolbar"><Search value={q} onChange={setQ} placeholder="Search clients or contacts" /></div>
      <div className="panel">
        <Table label="Clients" rows={rows} rowKey={(r) => r.c.id} onRow={(r) => go("/clients/" + r.c.id)} cols={[
          { key: "n", label: "Client", render: (r) => <span className="strong">{r.c.name}</span> },
          { key: "c", label: "Contact", render: (r) => r.c.contact || "-" },
          { key: "e", label: "Email", hide: "md", render: (r) => r.c.email || "-" },
          { key: "p", label: "Phone", hide: "sm", render: (r) => <span className="num nowrap">{r.c.phone || "-"}</span> },
          { key: "u", label: "Upcoming", cls: "r", render: (r) => <span className="num">{r.upcoming}</span> },
          { key: "x", label: "Next event", hide: "sm", render: (r) => (r.next ? fmtDay(dayKey(r.next.start)) : <span className="dim">None</span>) }]} />
      </div>
      {adding && <ClientDrawer onClose={() => setAdding(false)} />}
    </Page>
  );
}

export function ClientPage({ id }: { id: string }) {
  const s = useOps();
  const [editing, setEditing] = useState(false);
  const c = Q.client(s, id);
  if (!c) return <Page title="Client not found" back={{ to: "/clients", label: "Clients" }}><Notice tone="warn">No client with this reference.</Notice></Page>;
  const now = ms(s.clock);
  const evs = Q.eventsOfClient(s, c.id).slice().sort((a, b) => Q.eventSpan(s, a.id).start.localeCompare(Q.eventSpan(s, b.id).start));
  const upcoming = evs.filter((e) => ms(Q.eventSpan(s, e.id).end) > now && e.status === "confirmed");
  const past = evs.filter((e) => ms(Q.eventSpan(s, e.id).end) <= now || e.status === "cancelled").reverse();
  const venues = [...new Set(evs.flatMap((e) => [e.venueId, ...Q.shiftsOf(s, e.id).map((x) => x.venueId).filter(Boolean) as string[]]))].map((v) => Q.venue(s, v));
  const evCols = [
    { key: "n", label: "Event", render: (e: typeof evs[0]) => <span className="strong">{e.name}</span> },
    { key: "d", label: "Date", render: (e: typeof evs[0]) => fmtDay(dayKey(Q.eventSpan(s, e.id).start)) },
    { key: "c", label: "Crew", cls: "r", render: (e: typeof evs[0]) => { const cv = Q.eventCov(s, e.id); return <span className="num">{cv.confirmed}/{cv.required}</span>; } },
    { key: "s", label: "Staffing", render: (e: typeof evs[0]) => { const st = Q.staffStatus(s, e.id); return <Status tone={st.tone}>{st.label}</Status>; } }
  ];
  return (
    <Page title={c.name} sub={c.bullhornId ? "Bullhorn company " + c.bullhornId + " (simulated link)" : "Not yet in Bullhorn"} back={{ to: "/clients", label: "Clients" }}
      actions={<><Btn icon={I.edit} onClick={() => setEditing(true)}>Edit</Btn><Btn kind="primary" icon={I.plus} onClick={() => go("/events/new?client=" + c.id)}>New event for {c.name.split(" ")[0]}</Btn></>}>
      <div className="grid2" style={{ alignItems: "start" }}>
        <div className="stack g16">
          <Panel title="Contact"><KV items={[["Contact", c.contact || "-"], ["Email", c.email ? <a href={"mailto:" + c.email}>{c.email}</a> : "-"], ["Phone", c.phone || "-"]]} /></Panel>
          <Panel title="Event locations">{!venues.length ? <span className="dim">None yet.</span> : <div className="stack g8">{venues.map((v) => <div key={v.id} className="small"><b className="ink">{v.name}</b> <span className="dim">{v.address}</span></div>)}</div>}</Panel>
        </div>
        <div className="stack g16">
          <Panel title="Upcoming events" flush><Table label="Upcoming events" rows={upcoming} rowKey={(e) => e.id} onRow={(e) => go("/events/" + e.id)} cols={evCols} empty={<div className="empty">No upcoming events.</div>} /></Panel>
          <Panel title="Previous events" flush><Table label="Previous events" rows={past.slice(0, 20)} rowKey={(e) => e.id} onRow={(e) => go("/events/" + e.id)} cols={evCols} empty={<div className="empty">No previous events.</div>} /></Panel>
        </div>
      </div>
      {editing && <ClientDrawer id={c.id} onClose={() => setEditing(false)} />}
    </Page>
  );
}
