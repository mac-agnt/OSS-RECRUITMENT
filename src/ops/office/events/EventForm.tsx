/* Create or edit an event: client (pick or add), location (pick or add), shifts
   with roles and numbers, supervisors, instructions, PPE and qualifications. */

import { useMemo, useState } from "react";
import type { DocType, Need } from "../../model";
import { DOC_LABEL, PPE_OPTIONS, QUAL_TYPES, ROLES } from "../../model";
import * as E from "../../engine";
import * as Q from "../../selectors";
import { go, useRoute } from "../../router";
import { office, useOps } from "../../store";
import { addDays, dayKey, fmtTime } from "../../time";
import { Btn, Field, I, Notice, Panel, Select, useId } from "../../ui/kit";
import { Page } from "../common";

interface ShiftDraft { key: string; id?: string; label: string; date: string; start: string; end: string; needs: Need[]; supervisorId: string; venueId: string; locked: number }
let k = 0;
const key = () => "sd" + ++k;

const COUNTIES = ["Dublin", "Cork", "Limerick", "Galway", "Kildare", "Laois", "Wicklow", "Meath", "Louth", "Kerry", "Clare", "Waterford", "Tipperary", "Kilkenny", "Wexford", "Westmeath", "Sligo", "Mayo", "Donegal"];

export default function EventForm({ id }: { id?: string }) {
  const s = useOps();
  const r = useRoute();
  const existing = id ? Q.event(s, id) : undefined;
  const today = dayKey(s.clock);
  const [name, setName] = useState(existing?.name || "");
  const [clientId, setClientId] = useState(existing?.clientId || r.q.get("client") || "");
  const [venueId, setVenueId] = useState(existing?.venueId || "");
  const [supervisorId, setSupervisorId] = useState(existing?.supervisorId || "S1");
  const [instructions, setInstructions] = useState(existing?.instructions || "");
  const [ppe, setPpe] = useState<string[]>(existing?.ppe || ["Hi-vis vest", "OSS lanyard"]);
  const [quals, setQuals] = useState<DocType[]>(existing?.quals || []);
  const [shifts, setShifts] = useState<ShiftDraft[]>(() => existing
    ? Q.shiftsOf(s, existing.id).map((x) => ({ key: key(), id: x.id, label: x.label, date: dayKey(x.start), start: fmtTime(x.start), end: fmtTime(x.end), needs: x.needs.map((n) => ({ ...n })),
      supervisorId: x.supervisorId || "", venueId: x.venueId || "", locked: Q.confirmedOf(s, x.id).length }))
    : [{ key: key(), label: "Event crew", date: r.q.get("date") || addDays(today, 1), start: "17:00", end: "23:00", needs: [{ role: "Event crew", count: 10 }], supervisorId: "", venueId: "", locked: 0 }]);
  const [err, setErr] = useState("");
  const [newClient, setNewClient] = useState<null | { name: string; contact: string; email: string; phone: string }>(null);
  const [newVenue, setNewVenue] = useState<null | { name: string; address: string; county: string; meeting: string }>(null);
  const ids = { name: useId(), client: useId(), venue: useId(), sup: useId(), ins: useId() };
  const sups = s.users.filter((u) => u.kind === "supervisor");
  const total = useMemo(() => shifts.reduce((t, x) => t + x.needs.reduce((m, n) => m + (n.count || 0), 0), 0), [shifts]);
  const patch = (k2: string, p: Partial<ShiftDraft>) => setShifts((l) => l.map((x) => (x.key === k2 ? { ...x, ...p } : x)));

  const save = () => {
    setErr("");
    const res = office(E.saveEvent, {
      id, name, clientId, venueId, supervisorId, instructions, ppe, quals,
      shifts: shifts.map((x) => ({ id: x.id, label: x.label, date: x.date, start: x.start, end: x.end, needs: x.needs, supervisorId: x.supervisorId || undefined, venueId: x.venueId || undefined }))
    });
    if (res.ok) go("/events/" + res.data.id + "?tab=roster");
    else setErr(res.msg);
  };
  const addClient = () => {
    if (!newClient) return;
    const res = office(E.createClient, newClient);
    if (res.ok) { setClientId(res.data.id); setNewClient(null); }
  };
  const addVenue = () => {
    if (!newVenue) return;
    const res = office(E.createVenue, newVenue);
    if (res.ok) { setVenueId(res.data.id); setNewVenue(null); }
  };

  return (
    <Page title={existing ? "Edit " + existing.name : "New event"} sub={existing ? "Changes to times are sent to the confirmed crew, who are asked to reconfirm." : "Set up the event and its shifts. You can find crew straight after saving."}
      back={existing ? { to: "/events/" + existing.id, label: existing.name } : { to: "/events", label: "Events" }} narrow>
      <div className="stack g16">
        <Panel title="Details">
          <div className="stack g12">
            <Field label="Event name" id={ids.name} help="For example: 3Arena: concert night">
              <input id={ids.name} className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Venue: what it is" />
            </Field>
            <div className="grid2">
              <div className="stack g8">
                <Field label="Client" id={ids.client}>
                  <Select id={ids.client} value={clientId} onChange={setClientId} placeholder="Choose a client" options={s.clients.map((c) => ({ value: c.id, label: c.name }))} />
                </Field>
                {!newClient ? <button className="linkbtn small" style={{ alignSelf: "flex-start" }} onClick={() => setNewClient({ name: "", contact: "", email: "", phone: "" })}>+ New client</button> : (
                  <div className="panel" style={{ padding: 12 }}>
                    <div className="stack g8">
                      <input className="input sm" placeholder="Company name" aria-label="Company name" value={newClient.name} onChange={(e) => setNewClient({ ...newClient, name: e.target.value })} />
                      <input className="input sm" placeholder="Contact name" aria-label="Contact name" value={newClient.contact} onChange={(e) => setNewClient({ ...newClient, contact: e.target.value })} />
                      <div className="grid2"><input className="input sm" placeholder="Email" aria-label="Email" value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
                        <input className="input sm" placeholder="Phone" aria-label="Phone" value={newClient.phone} onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })} /></div>
                      <div className="row"><Btn size="sm" kind="primary" onClick={addClient}>Add client</Btn><Btn size="sm" kind="quiet" onClick={() => setNewClient(null)}>Cancel</Btn></div>
                    </div>
                  </div>
                )}
              </div>
              <div className="stack g8">
                <Field label="Location" id={ids.venue}>
                  <Select id={ids.venue} value={venueId} onChange={setVenueId} placeholder="Choose a location" options={s.venues.map((v) => ({ value: v.id, label: v.name }))} />
                </Field>
                {!newVenue ? <button className="linkbtn small" style={{ alignSelf: "flex-start" }} onClick={() => setNewVenue({ name: "", address: "", county: "Dublin", meeting: "" })}>+ New location</button> : (
                  <div className="panel" style={{ padding: 12 }}>
                    <div className="stack g8">
                      <input className="input sm" placeholder="Location name" aria-label="Location name" value={newVenue.name} onChange={(e) => setNewVenue({ ...newVenue, name: e.target.value })} />
                      <input className="input sm" placeholder="Address" aria-label="Address" value={newVenue.address} onChange={(e) => setNewVenue({ ...newVenue, address: e.target.value })} />
                      <div className="grid2"><Select sm label="County" value={newVenue.county} onChange={(v) => setNewVenue({ ...newVenue, county: v })} options={COUNTIES.map((c) => ({ value: c, label: c }))} />
                        <input className="input sm" placeholder="Meeting point" aria-label="Meeting point" value={newVenue.meeting} onChange={(e) => setNewVenue({ ...newVenue, meeting: e.target.value })} /></div>
                      <span className="tiny dim">Clock-in radius starts at {s.rules.radiusM} m and can be changed per location.</span>
                      <div className="row"><Btn size="sm" kind="primary" onClick={addVenue}>Add location</Btn><Btn size="sm" kind="quiet" onClick={() => setNewVenue(null)}>Cancel</Btn></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <Field label="Supervisor" id={ids.sup} help="Shifts can have their own supervisor below.">
              <Select id={ids.sup} value={supervisorId} onChange={setSupervisorId} options={sups.map((u) => ({ value: u.id, label: u.name }))} />
            </Field>
          </div>
        </Panel>

        <Panel title="Shifts" meta={shifts.length + " shift" + (shifts.length === 1 ? "" : "s") + ", " + total + " positions"}
          right={<Btn size="sm" icon={I.plus} onClick={() => setShifts((l) => [...l, { key: key(), label: l.length ? "Shift " + (l.length + 1) : "Event crew", date: l[l.length - 1]?.date || addDays(today, 1), start: "08:00", end: "13:00", needs: [{ role: "Stagehand", count: 10 }], supervisorId: "", venueId: "", locked: 0 }])}>Add shift</Btn>}>
          <div className="stack g12">
            {shifts.map((x, i) => (
              <div key={x.key} className="panel" style={{ padding: 14, background: "var(--surface-2)" }}>
                <div className="stack g12">
                  <div className="row between"><span className="strong">Shift {i + 1}</span>
                    <div className="row">
                      <Btn size="sm" kind="quiet" onClick={() => setShifts((l) => [...l.slice(0, i + 1), { ...x, key: key(), id: undefined, locked: 0, label: x.label + " (copy)" }, ...l.slice(i + 1)])}>Duplicate</Btn>
                      {shifts.length > 1 && <Btn size="sm" kind="quiet" icon={I.trash} disabled={x.locked > 0} title={x.locked ? "Has confirmed crew" : "Remove shift"} onClick={() => setShifts((l) => l.filter((z) => z.key !== x.key))}>Remove</Btn>}
                    </div>
                  </div>
                  <div className="grid4">
                    <Field label="Name"><input className="input" value={x.label} onChange={(e) => patch(x.key, { label: e.target.value })} placeholder="Set-up crew" /></Field>
                    <Field label="Date"><input className="input" type="date" value={x.date} min={x.id ? undefined : today} onChange={(e) => patch(x.key, { date: e.target.value })} /></Field>
                    <Field label="Start"><input className="input" type="time" value={x.start} onChange={(e) => patch(x.key, { start: e.target.value })} /></Field>
                    <Field label="Finish" help="Earlier than start means next day"><input className="input" type="time" value={x.end} onChange={(e) => patch(x.key, { end: e.target.value })} /></Field>
                  </div>
                  <div className="stack g8">
                    <span className="small strong">Workers needed by role</span>
                    {x.needs.map((n, j) => (
                      <div key={j} className="row">
                        <div style={{ flex: "1 1 220px", maxWidth: 280 }}><Select label="Role" value={n.role} onChange={(v) => patch(x.key, { needs: x.needs.map((z, q) => (q === j ? { ...z, role: v } : z)) })} options={ROLES.map((ro) => ({ value: ro, label: ro }))} /></div>
                        <input className="input num" type="number" min={1} max={500} aria-label={"Number of " + n.role} style={{ width: 90 }} value={n.count}
                          onChange={(e) => patch(x.key, { needs: x.needs.map((z, q) => (q === j ? { ...z, count: Math.max(0, Number(e.target.value)) } : z)) })} />
                        {x.needs.length > 1 && <Btn kind="quiet" size="sm" icon={I.x} iconOnly title="Remove role" onClick={() => patch(x.key, { needs: x.needs.filter((_, q) => q !== j) })} />}
                      </div>
                    ))}
                    <button className="linkbtn small" style={{ alignSelf: "flex-start" }} onClick={() => patch(x.key, { needs: [...x.needs, { role: ROLES.find((ro) => !x.needs.some((z) => z.role === ro)) || "Steward", count: 4 }] })}>+ Add role</button>
                  </div>
                  <div className="grid2">
                    <Field label="Shift supervisor"><Select value={x.supervisorId} onChange={(v) => patch(x.key, { supervisorId: v })} placeholder="Same as event" options={sups.map((u) => ({ value: u.id, label: u.name }))} /></Field>
                    <Field label="Shift location"><Select value={x.venueId} onChange={(v) => patch(x.key, { venueId: v })} placeholder="Same as event" options={s.venues.map((v) => ({ value: v.id, label: v.name }))} /></Field>
                  </div>
                  {x.locked > 0 && <span className="tiny dim">{x.locked} confirmed workers. Reducing a role below its confirmed crew is blocked.</span>}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Instructions and requirements">
          <div className="stack g12">
            <Field label="Job instructions" id={ids.ins} help="Shown to crew in the app with the shift. Meeting point comes from the location.">
              <textarea id={ids.ins} className="textarea" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Where to report, who to ask for, briefing time, dress code." />
            </Field>
            <div className="stack g8">
              <span className="small strong">PPE and uniform</span>
              <div className="row wrap">{PPE_OPTIONS.map((p) => <button key={p} className={"chip" + (ppe.includes(p) ? " on" : "")} aria-pressed={ppe.includes(p)} onClick={() => setPpe((l) => (l.includes(p) ? l.filter((z) => z !== p) : [...l, p]))}>{p}</button>)}</div>
            </div>
            <div className="stack g8">
              <span className="small strong">Qualifications for every worker on this event</span>
              <div className="row wrap">{QUAL_TYPES.map((t) => <button key={t} className={"chip" + (quals.includes(t) ? " on" : "")} aria-pressed={quals.includes(t)} onClick={() => setQuals((l) => (l.includes(t) ? l.filter((z) => z !== t) : [...l, t]))}>{DOC_LABEL[t]}</button>)}</div>
              <span className="tiny dim">Role rules apply on top: {Object.entries(s.rules.roleQuals).filter(([, v]) => v.length).map(([ro, v]) => ro.toLowerCase() + " needs " + v.map((t) => DOC_LABEL[t].toLowerCase()).join(", ")).join("; ")}. Photo ID and, where needed, work authorisation are always checked.</span>
            </div>
          </div>
        </Panel>

        {err && <Notice tone="bad">{err}</Notice>}
        <div className="formbar">
          <Btn onClick={() => go(existing ? "/events/" + existing.id : "/events")}>Cancel</Btn>
          <Btn kind="primary" icon={I.check} onClick={save}>{existing ? "Save changes" : "Create event"}</Btn>
        </div>
      </div>
    </Page>
  );
}
