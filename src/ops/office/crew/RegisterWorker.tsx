/* Register a new worker. Registration is not verification: they can't be booked
   until their ID (and work authorisation, where needed) are verified. */

import { useState } from "react";
import type { Rtw } from "../../model";
import { ROLES, needsRtw } from "../../model";
import * as E from "../../engine";
import { go } from "../../router";
import { office } from "../../store";
import { Btn, Field, I, Notice, Panel, Select } from "../../ui/kit";
import { Page } from "../common";

const RTWS: Rtw[] = ["Irish citizen", "EU/EEA citizen", "UK citizen", "Stamp 2", "Stamp 4", "Stamp 1G"];
const COUNTIES = ["Dublin", "Cork", "Limerick", "Galway", "Kildare", "Laois", "Wicklow", "Meath", "Louth", "Kerry", "Clare", "Waterford", "Tipperary", "Kilkenny", "Wexford", "Westmeath", "Sligo", "Mayo", "Donegal"];

export default function RegisterWorker() {
  const [f, setF] = useState({ name: "", email: "", mobile: "", area: "", county: "Dublin", roles: [] as string[], rtw: "Irish citizen" as Rtw });
  const [err, setErr] = useState<{ msg: string; existing?: string; similar?: string[] } | null>(null);
  const save = (confirmNew = false) => {
    const r = office(E.registerWorker, f, confirmNew);
    if (r.ok) go("/crew/" + r.data.id + "?tab=documents");
    else setErr({ msg: r.msg, existing: r.data?.existing, similar: r.data?.similar });
  };
  return (
    <Page title="Register a worker" sub="Creates their OSS record and sends a welcome message with a link to the crew app (simulated)." back={{ to: "/crew", label: "Crew" }} narrow>
      <Panel title="Details">
        <div className="stack g12">
          <Field label="Full name"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
          <div className="grid2">
            <Field label="Mobile" help="Used for WhatsApp messages"><input className="input" inputMode="tel" value={f.mobile} onChange={(e) => setF({ ...f, mobile: e.target.value })} placeholder="08x xxx xxxx" /></Field>
            <Field label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          </div>
          <div className="grid2">
            <Field label="Area"><input className="input" value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} placeholder="For example: Tallaght" /></Field>
            <Field label="County"><Select value={f.county} onChange={(v) => setF({ ...f, county: v })} options={COUNTIES.map((c) => ({ value: c, label: c }))} /></Field>
          </div>
          <Field label="Work authorisation" help={needsRtw(f.rtw) ? "They'll need to upload their IRP card before they can be booked." : "Photo ID is enough."}>
            <Select value={f.rtw} onChange={(v) => setF({ ...f, rtw: v as Rtw })} options={RTWS.map((r) => ({ value: r, label: r }))} />
          </Field>
          <div className="stack g8"><span className="small strong">Skills</span>
            <div className="row wrap">{ROLES.map((r) => <button key={r} className={"chip" + (f.roles.includes(r) ? " on" : "")} aria-pressed={f.roles.includes(r)}
              onClick={() => setF({ ...f, roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] })}>{r}</button>)}</div></div>
          {err && <Notice tone="bad"><div className="stack g8"><span>{err.msg}</span>
            {err.existing && <Btn size="sm" onClick={() => go("/crew/" + err.existing)}>Open the existing record</Btn>}
            {err.similar && <div className="row"><Btn size="sm" onClick={() => go("/crew/" + err.similar![0])}>Open the similar record</Btn><Btn size="sm" kind="primary" onClick={() => save(true)}>It's a different person, register</Btn></div>}</div></Notice>}
          <div className="formbar"><Btn onClick={() => go("/crew")}>Cancel</Btn><Btn kind="primary" icon={I.check} onClick={() => save()}>Register</Btn></div>
        </div>
      </Panel>
    </Page>
  );
}
