/* Clients: promoters, stadium operators, venues and caterers OSS staffs for.
   Each account carries its standards, preferred crew, do-not-rebook list,
   portal, sign-off contact and the hours delivered. */

import "../../styles/oss-biz.css";
import { useState } from "react";
import type { EventBooking, OssState } from "../model";
import * as Q from "../selectors";
import { ACCOUNTS, dnrList, preferredCrew, CALL_SHEETS } from "../industry";
import { navigate, openDrawer, setUi, useOss } from "../store";
import { tabOf } from "../modules";
import { fmtDate, fmtHM, fmtTime, zoned } from "../time";
import { Av, Btn, Card, Cov, Faces, Figure, Hero, hueVar, I, Icon, IrelandMap, kindVar, KV, Page, regionVar, Ring, Row, St, Steps, Tag } from "../ui/kit";
import { DateBadge } from "../ui/Shell";

export default function Clients() {
  const s = useOss();
  const f = s.ui.focus;
  if (f?.kind === "client" && Q.clientOf(s, f.id)) return <ClientPage s={s} id={f.id} />;
  const tab = tabOf(s, "Clients");
  if (tab === "requests") return <SignOff s={s} />;
  if (tab === "venues") return <Venues s={s} />;
  return <Accounts s={s} />;
}

const CLIENT_CODE: Record<string, string> = { C01: "AIKEN", C02: "LES", C03: "NSES", C04: "QSE", C05: "DPS" };
const codeOf = (id: string) => CLIENT_CODE[id] || ACCOUNTS[id]?.code.split("-")[1] || id;
/** Which kind of work a client mostly books, from its sector: drives the colour. */
const sectorKind = (sector: string) => /music|concert|promot|theatre/i.test(sector) ? "Concert" : /sport|stadium|racecourse|motorsport/i.test(sector) ? "Sport" : /conference/i.test(sector) ? "Conference" : /festival|market/i.test(sector) ? "Festival" : /exhibit/i.test(sector) ? "Exhibition" : "Corporate";
const hoursOf = (s: OssState, clientId: string) => Q.lines(s, { clientId }).reduce((t, l) => t + l.payableMin, 0);
const nextEvent = (s: OssState, clientId: string) => s.events.filter((e) => e.clientId === clientId && !e.historical && e.status !== "cancelled" && Q.eventPhase(s, e) !== "completed").sort((x, y) => x.date.localeCompare(y.date))[0];
const tierTone = (t: string) => (t === "Key account" ? "info" : t === "New" ? "warn" : "neutral") as "info" | "warn" | "neutral";
const portalTone = (p: string) => (p === "Live" ? "ok" : p === "Invited" ? "info" : "neutral") as "ok" | "info" | "neutral";
const evDate = (e: EventBooking) => zoned(e.date, "12:00");

/** Client monogram: the short code OSS uses on rosters and invoices. */
function Code({ id, big }: { id: string; big?: boolean }) {
  return <span className={"cl-code" + (big ? " big" : "")} style={{ ["--c" as any]: hueVar(id) }}>{codeOf(id)}</span>;
}

/* ── accounts ────────────────────────────────────────────────────────────── */
type SortKey = "hours" | "events" | "fill" | "name" | "upcoming";
function Accounts({ s }: { s: OssState }) {
  const [sort, setSort] = useState<SortKey>("hours");
  const [kind, setKind] = useState("all");
  const list = s.clients.map((c) => ({ c, a: ACCOUNTS[c.id], k: sectorKind(c.sector), up: s.events.filter((e) => e.clientId === c.id && !e.historical && e.status !== "cancelled" && Q.eventPhase(s, e) !== "completed").length })).filter((x) => x.a).sort((x, y) => y.a.hoursYtd - x.a.hoursYtd);
  const total = list.reduce((t, x) => t + x.a.hoursYtd, 0);
  const events = list.reduce((t, x) => t + x.a.eventsYtd, 0);
  const live = list.filter((x) => x.a.portal === "Live").length;
  const keys = list.filter((x) => x.a.tier === "Key account").slice(0, 6);
  const kinds = Array.from(new Set(list.map((x) => x.k)));
  const table = list.filter((x) => kind === "all" || x.k === kind).slice().sort((x, y) => sort === "name" ? x.c.name.localeCompare(y.c.name) : sort === "events" ? y.a.eventsYtd - x.a.eventsYtd : sort === "fill" ? y.a.fill12 - x.a.fill12 : sort === "upcoming" ? y.up - x.up : y.a.hoursYtd - x.a.hoursYtd);
  const maxH = Math.max(1, ...list.map((x) => x.a.hoursYtd));
  const th = (k: SortKey, l: string, num = false) => <th className={num ? "num" : ""}><button className={"cl-sort" + (sort === k ? " on" : "")} onClick={() => setSort(k)} aria-pressed={sort === k}>{l}{sort === k && <Icon d={I.down} size={11} />}</button></th>;
  return (
    <Page eyebrow="Clients" title="Client accounts" sub={list.length + " accounts, " + events.toLocaleString("en-IE") + " events and " + total.toLocaleString("en-IE") + " hours delivered this year. " + live + " clients watch their staffing live in a portal."}
      actions={<><Btn icon={I.briefcase} onClick={() => navigate("Portals", "overview")}>Portals</Btn><Btn kind="primary" icon={I.plus} onClick={() => navigate("Events", "upcoming", { kind: "new", id: "booking" })}>New booking</Btn></>}>
      <div className="cl-share" aria-label="Share of hours delivered this year">
        <div className="cl-share-h"><b>{total.toLocaleString("en-IE")}h</b><span>delivered this year, by client</span></div>
        <div className="cl-share-bar">{list.map(({ c, a }) => <button key={c.id} style={{ width: (a.hoursYtd / total) * 100 + "%", background: hueVar(c.id) }} title={c.name + ": " + a.hoursYtd.toLocaleString("en-IE") + "h"} onClick={() => setUi({ focus: { kind: "client", id: c.id } })} />)}</div>
        <div className="cl-share-lg">{list.slice(0, 8).map(({ c, a }) => <span key={c.id}><i style={{ background: hueVar(c.id) }} /><b>{codeOf(c.id)}</b>{Math.round((a.hoursYtd / total) * 100)}%</span>)}{list.length > 8 && <span className="oss-muted">and {list.length - 8} more</span>}</div>
      </div>
      <div className="oss-rule"><span>Key accounts</span></div>
      <div className="cl-grid">
        {keys.map(({ c }, i) => <AccountCard key={c.id} s={s} id={c.id} size={i === 0 ? "feature" : i === 1 ? "tall" : "small"} />)}
      </div>
      <div className="oss-rule"><span>Every account</span></div>
      <section className="oss-card cl-league" aria-label="All client accounts">
        <div className="cl-league-h">
          <div className="cl-kinds">
            <button className={kind === "all" ? "on" : ""} onClick={() => setKind("all")}>All work <span>{list.length}</span></button>
            {kinds.map((k) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)} style={{ ["--c" as any]: kindVar(k) }}><i />{k}<span>{list.filter((x) => x.k === k).length}</span></button>)}
          </div>
        </div>
        <div className="oss-tw">
          <table className="oss-table cl-lt">
            <thead><tr>{th("name", "Client")}<th>Work</th><th>Tier</th><th>Account manager</th>{th("events", "Events", true)}{th("hours", "Hours this year", true)}{th("fill", "Filled, 12 months", true)}{th("upcoming", "Coming up", true)}<th>Portal</th></tr></thead>
            <tbody>
              {table.map(({ c, a, k, up }) => (
                <tr key={c.id} className="click" tabIndex={0} onClick={() => setUi({ focus: { kind: "client", id: c.id } })} onKeyDown={(e) => { if (e.key === "Enter") setUi({ focus: { kind: "client", id: c.id } }); }}>
                  <td><span className="oss-row" style={{ gap: 10 }}><Code id={c.id} /><span style={{ minWidth: 0 }}><span className="strong">{c.name}</span><div className="oss-tiny oss-muted">{c.sector}</div></span></span></td>
                  <td><Tag c={kindVar(k)}>{k}</Tag></td>
                  <td><St tone={tierTone(a.tier)}>{a.tier}</St></td>
                  <td><span className="oss-row" style={{ gap: 8 }}><Av name={Q.nameOf(s, a.manager)} size="sm" /><span className="oss-small">{Q.nameOf(s, a.manager)}</span></span></td>
                  <td className="num">{a.eventsYtd}</td>
                  <td className="num"><span className="cl-hbar"><i style={{ width: (a.hoursYtd / maxH) * 100 + "%", background: hueVar(c.id) }} /></span>{a.hoursYtd.toLocaleString("en-IE")}</td>
                  <td className="num"><span className={"cl-fill" + (a.fill12 >= 97 ? " hi" : a.fill12 < 94 ? " lo" : "")}>{a.fill12}%</span></td>
                  <td className="num">{up || "-"}</td>
                  <td><St tone={portalTone(a.portal)}>{a.portal}</St></td>
                </tr>))}
            </tbody>
          </table>
        </div>
      </section>
    </Page>
  );
}

function AccountCard({ s, id, size }: { s: OssState; id: string; size: "feature" | "tall" | "small" }) {
  const c = Q.clientOf(s, id), a = ACCOUNTS[id];
  const next = nextEvent(s, id);
  const pref = preferredCrew(id), dnr = dnrList(id);
  const upcoming = s.events.filter((e) => e.clientId === id && !e.historical && e.status !== "cancelled" && Q.eventPhase(s, e) !== "completed").sort((x, y) => x.date.localeCompare(y.date));
  return (
    <button className={"cl-card " + size} onClick={() => setUi({ focus: { kind: "client", id } })}>
      <div className="cl-card-top">
        <Code id={id} />
        <span className="grow" style={{ minWidth: 0 }}><b className="cl-name">{c.name}</b><span className="oss-small oss-dim">{c.sector}</span></span>
        <St tone={tierTone(a.tier)}>{a.tier}</St>
      </div>
      <div className="cl-card-mid">
        <Ring value={a.fill12} max={100} size={size === "small" ? 76 : 96} stroke={size === "small" ? 7 : 9} tone={a.fill12 >= 95 ? "accent" : "warn"} label={a.fill12 + "%"} sub="filled" />
        <div className="cl-figs">
          <Figure size="sm" label="Events this year" value={a.eventsYtd} />
          <Figure size="sm" label="Hours this year" value={a.hoursYtd.toLocaleString("en-IE")} />
          {size !== "small" && <Figure size="sm" label="Hours this week" value={fmtHM(hoursOf(s, id))} />}
        </div>
      </div>
      {size === "feature" && <div className="cl-std">{a.standards.map((x) => <span key={x} className="oss-pill"><Icon d={I.shield} size={12} />{x}</span>)}</div>}
      {size !== "small" && upcoming.length > 0 && (
        <div className="cl-next">
          {upcoming.slice(0, size === "feature" ? 3 : 2).map((e) => (
            <span key={e.id} className="cl-next-row"><span className="d">{fmtDate(evDate(e))}</span><span className="t">{e.name.split(":")[0]}</span>{e.status === "pending" ? <St tone="neutral">Pending</St> : <span style={{ width: 120 }}><Cov c={Q.eventCoverage(s, e.id)} compact /></span>}</span>))}
        </div>)}
      <div className="cl-card-foot">
        <span className="cl-mgr"><Av name={Q.nameOf(s, a.manager)} size="sm" /><span className="oss-tiny oss-dim">{Q.nameOf(s, a.manager)}</span></span>
        {pref.length > 0 && <Faces names={pref.map((w) => Q.nameOf(s, w))} max={size === "small" ? 3 : 5} />}
        <span className="grow" />
        {dnr.length > 0 && <St tone="bad">{dnr.length} do not rebook</St>}
        <St tone={portalTone(a.portal)}>Portal {a.portal.toLowerCase()}</St>
      </div>
      {size === "small" && <div className="oss-tiny oss-dim" style={{ marginTop: 10 }}>Next: {next ? next.name.split(":")[0] + ", " + fmtDate(evDate(next)) : "nothing booked"}</div>}
    </button>
  );
}

/* ── one account ─────────────────────────────────────────────────────────── */
function ClientPage({ s, id }: { s: OssState; id: string }) {
  const c = Q.clientOf(s, id), a = ACCOUNTS[id];
  const evs = s.events.filter((e) => e.clientId === id).sort((x, y) => x.date.localeCompare(y.date));
  const upcoming = evs.filter((e) => !e.historical && Q.eventPhase(s, e) !== "completed");
  const pref = preferredCrew(id), dnr = dnrList(id);
  const contacts = s.contacts.filter((x) => x.clientId === id);
  const mapped = s.mappings.find((m) => m.localId === id);
  const withHours = evs.filter((e) => Q.lines(s, { eventId: e.id }).length);
  return (
    <div className="oss-page">
      <Hero back={{ label: "Clients", go: () => setUi({ focus: null }) }} eyebrow={c.sector + " · " + a.tier}
        title={<span className="cl-hero-t"><Code id={id} big />{c.name}</span>}
        sub={"Account managed by " + Q.nameOf(s, a.manager) + ". Hours signed off by " + a.signOff + ". Bullhorn client " + (mapped?.remoteId || "not matched yet") + "."}
        actions={<><Btn kind="primary" icon={I.briefcase} onClick={() => navigate("Portals", "client", { kind: "client", id })}>Open their portal</Btn><Btn icon={I.plus} onClick={() => navigate("Events", "upcoming", { kind: "new", id: "booking" })}>New booking</Btn></>}
        aside={<>
          <Ring value={a.fill12} max={100} size={120} stroke={10} tone={a.fill12 >= 95 ? "accent" : "warn"} label={a.fill12 + "%"} sub="filled, 12 months" />
          <div className="cl-hero-figs">
            <Figure label="Events this year" value={a.eventsYtd} sub={upcoming.length + " coming up"} />
            <Figure label="Hours this week" value={fmtHM(hoursOf(s, id))} sub="Approved and draft" />
            <Figure label="Portal" value={a.portal} sub={a.code !== "-" ? "Invite code " + a.code : "Not set up yet"} tone={a.portal === "Live" ? "ok" : undefined} />
          </div>
        </>} />
      <div className="oss-grid oss-main-side" style={{ alignItems: "start" }}>
        <div className="oss-stack">
          <Card title="Bookings" meta={evs.length + " this season · " + upcoming.length + " still to run"} icon={I.cal} flush>
            <div className="oss-rows">{evs.map((e) => <Row key={e.id} lead={<DateBadge iso={evDate(e)} />} title={e.name} onClick={() => navigate("Events", "upcoming", { kind: "event", id: e.id })}
              sub={(Q.venueOf(s, e.venueId)?.name || "Venue to confirm") + (CALL_SHEETS[e.id] ? " · call sheet ready" : "")}
              end={e.status === "pending" ? <St tone="neutral">Pending</St> : e.historical || Q.eventPhase(s, e) === "completed" ? (s.ext.signoffs[e.id] ? <St tone="ok">Signed off</St> : <St tone="neutral">Finished</St>) : <span style={{ width: 160 }}><Cov c={Q.eventCoverage(s, e.id)} compact /></span>} />)}</div>
          </Card>
          <Card title="Hours and sign-off" meta="Every event with timesheet lines" icon={I.check} flush>
            <div className="oss-rows">
              {withHours.map((e) => {
                const ls = Q.lines(s, { eventId: e.id }); const so = s.ext.signoffs[e.id];
                return <Row key={e.id} lead={<DateBadge iso={evDate(e)} />} title={e.name.split(":")[0]} sub={ls.length + " lines · " + fmtHM(ls.reduce((t, l) => t + l.payableMin, 0)) + " payable"}
                  end={so ? <St tone="ok">Signed by {so.by.split(",")[0]}, {fmtDate(so.at)} {fmtTime(so.at)}</St> : <St tone="neutral">Not signed off</St>} />;
              })}
              {!withHours.length && <div className="oss-small oss-muted" style={{ padding: "4px 12px 12px" }}>No hours recorded for this client yet.</div>}
            </div>
          </Card>
          <div className="oss-grid oss-g2">
            <Card title="Preferred crew" meta="Asked for by name, offered first" icon={I.users} flush>
              <div className="oss-rows">{pref.map((w) => <Row key={w} lead={<Av name={Q.nameOf(s, w)} size="sm" />} title={Q.nameOf(s, w)} sub={Q.worker(s, w)?.roles.join(", ")} onClick={() => openDrawer("worker", w)} />)}
                {!pref.length && <div className="oss-small oss-muted" style={{ padding: "4px 12px 12px" }}>No preferences recorded.</div>}</div>
            </Card>
            <Card title="Do not rebook" meta="Never offered this client's shifts" icon={I.x} flush>
              <div className="oss-rows">{dnr.map((d) => <Row key={d.workerId} lead={<Av name={Q.nameOf(s, d.workerId)} size="sm" />} title={Q.nameOf(s, d.workerId)} sub={d.reason} wrap onClick={() => openDrawer("worker", d.workerId)} />)}
                {!dnr.length && <div className="oss-small oss-muted" style={{ padding: "4px 12px 12px" }}>Nobody on the list.</div>}</div>
            </Card>
          </div>
        </div>
        <div className="oss-stack">
          <Card title="Standards on every job" meta="Checked before anyone is offered a shift" icon={I.shield}>
            <div className="cl-checks">{a.standards.map((x) => <div key={x} className="cl-check"><Icon d={I.check} size={13} sw={2.2} />{x}</div>)}</div>
          </Card>
          <Card title="Contacts" icon={I.user} flush>
            <div className="oss-rows">{contacts.map((x) => <Row key={x.id} lead={<Av name={x.name} size="sm" />} title={x.name} sub={x.role + " · " + x.phone} />)}
              {!contacts.length && <div className="oss-small oss-muted" style={{ padding: "4px 12px 12px" }}>No contacts on file.</div>}</div>
          </Card>
          <Card title="Account" icon={I.briefcase}><KV items={[["Account manager", Q.nameOf(s, a.manager)], ["Tier", a.tier], ["Hours this year", a.hoursYtd.toLocaleString("en-IE") + "h"], ["Signs off hours", a.signOff], ["Bullhorn client", mapped?.remoteId || "Not matched"]]} /></Card>
        </div>
      </div>
    </div>
  );
}

/* ── sign-off: an approval queue in three lanes ──────────────────────────── */
function SignOff({ s }: { s: OssState }) {
  const done = s.events.filter((e) => Q.lines(s, { eventId: e.id }).length).map((e) => {
    const ls = Q.lines(s, { eventId: e.id });
    return { e, ls, t: ls.reduce((n, l) => n + l.payableMin, 0), so: s.ext.signoffs[e.id], approved: ls.every((l) => l.status === "approved" || l.status === "exported") };
  });
  const checking = done.filter((x) => !x.so && !x.approved), ready = done.filter((x) => !x.so && x.approved), signed = done.filter((x) => x.so);
  const [more, setMore] = useState<Record<string, boolean>>({});
  const lane = (k: string, l: typeof done, empty: string) => <>{(more[k] ? l : l.slice(0, 6)).map(card)}{l.length > 6 && <button className="cl-lane-more" onClick={() => setMore({ ...more, [k]: !more[k] })}>{more[k] ? "Show fewer" : "Show " + (l.length - 6) + " more"}</button>}{!l.length && <div className="cl-lane-empty">{empty}</div>}</>;
  const sum = (l: typeof done) => fmtHM(l.reduce((n, x) => n + x.t, 0));
  const card = (x: (typeof done)[number]) => (
    <div key={x.e.id} className="cl-q">
      <div className="oss-row" style={{ gap: 10, alignItems: "flex-start" }}>
        <DateBadge iso={x.ls[0]?.shift.start || evDate(x.e)} />
        <span className="grow" style={{ minWidth: 0 }}><b className="cl-q-t">{x.e.name.split(":")[0]}</b><span className="oss-tiny oss-dim">{Q.clientOf(s, x.e.clientId).name}</span></span>
        <Code id={x.e.clientId} />
      </div>
      <div className="cl-q-fig"><b>{fmtHM(x.t)}</b><span>{x.ls.length} lines</span></div>
      {x.so ? <div className="oss-tiny oss-dim"><Icon d={I.check} size={12} style={{ color: "var(--ok)", verticalAlign: -2 }} /> Signed by {x.so.by.split(",")[0]}, {fmtDate(x.so.at)} {fmtTime(x.so.at)}</div>
        : x.approved ? <Btn size="sm" kind="primary" block icon={I.send} onClick={() => navigate("Portals", "client", { kind: "client", id: x.e.clientId })}>Send for sign-off</Btn>
        : <Btn size="sm" block onClick={() => navigate("Timesheets", "review")}>Finish OSS approval</Btn>}
    </div>);
  return (
    <Page eyebrow="Clients · sign-off" title="Client sign-off" sub="Clients approve the hours for their event in the portal before OSS invoices. Disputes come back here with the clock records attached.">
      <div className="cl-steps"><Steps steps={[
        { label: "OSS checking hours", n: checking.length, sub: sum(checking), on: checking.length > 0 },
        { label: "Ready for the client", n: ready.length, sub: sum(ready), tone: ready.length ? "accent" : undefined, on: ready.length > 0 },
        { label: "Signed off by the client", n: signed.length, sub: sum(signed), tone: signed.length ? "ok" : undefined, on: signed.length > 0 }]} /></div>
      <div className="cl-lanes">
        <section className="cl-lane"><h3>OSS checking<span>{checking.length}</span></h3>{lane("c", checking, "Nothing waiting on OSS")}</section>
        <section className="cl-lane hot"><h3>Ready for the client<span>{ready.length}</span></h3>{lane("r", ready, "Approve hours in Timesheets and they land here")}</section>
        <section className="cl-lane"><h3>Signed off<span>{signed.length}</span></h3>{lane("s", signed, "No sign-offs yet")}</section>
      </div>
    </Page>
  );
}

/* ── venues ──────────────────────────────────────────────────────────────── */
function Venues({ s }: { s: OssState }) {
  const [region, setRegion] = useState("all");
  const [pick, setPick] = useState<string | null>(null);
  const regions = ["Dublin", "Leinster", "Munster", "Connacht", "Ulster"];
  const list = s.venues.filter((v) => region === "all" || (v.region || "Dublin") === region).sort((a, b) => (b.capacity || 0) - (a.capacity || 0));
  const bookings = (id: string) => s.events.filter((e) => e.venueId === id && !e.historical);
  const today = s.events.filter((e) => e.venueId && Q.eventPhase(s, e) === "live").map((e) => e.venueId);
  const pins = s.venues.filter((v) => v.lat && v.lng).map((v) => ({ id: v.id, lat: v.lat!, lng: v.lng!, c: regionVar(v.region || "Dublin"), r: 4 + Math.min(9, Math.sqrt((v.capacity || 1000) / 900)), label: v.id === pick || v.id === "V02" || ((v.capacity || 0) >= 12000 && !["Dublin", "Leinster"].includes(v.region || "Dublin")) ? v.name.split(",")[0] : undefined, pulse: today.includes(v.id), on: v.id === pick }));
  const cur = s.venues.find((v) => v.id === pick);
  return (
    <Page eyebrow="Clients · venues" title="Venues" sub={s.venues.length + " sites across Ireland with their check-in radius, QR codes, meeting points and supervisor. Live work pulses on the map."}>
      <div className="cl-vmap">
        <section className="oss-card cl-vmap-m" aria-label="Venue map">
          <IrelandMap pins={pins} height={460} onPick={(id) => setPick(id === pick ? null : id)} />
          <div className="cl-vmap-lg">{regions.map((r) => <span key={r}><i style={{ background: regionVar(r) }} />{r}</span>)}<span className="oss-muted">Dot size is capacity</span></div>
        </section>
        <div className="oss-stack">
          <section className="oss-card cl-vregions">
            <div className="cl-kinds">
              <button className={region === "all" ? "on" : ""} onClick={() => setRegion("all")}>All <span>{s.venues.length}</span></button>
              {regions.map((r) => <button key={r} className={region === r ? "on" : ""} onClick={() => setRegion(r)} style={{ ["--c" as any]: regionVar(r) }}><i />{r}<span>{s.venues.filter((v) => (v.region || "Dublin") === r).length}</span></button>)}
            </div>
          </section>
          {cur ? <section className="oss-card cl-vpick">
            <div className="oss-eyebrow">{cur.county || "Dublin"} · {cur.region || "Dublin"}</div>
            <h3>{cur.name}</h3>
            <div className="oss-small oss-dim">{cur.area}</div>
            <div className="cl-vpick-figs"><Figure size="sm" label="Capacity" value={(cur.capacity || 0).toLocaleString("en-IE")} /><Figure size="sm" label="Bookings" value={bookings(cur.id).length} /><Figure size="sm" label="Check-in" value={cur.methods.includes("qr") ? "GPS and QR" : "GPS"} sub={cur.geofenceM + " m radius"} /></div>
            <div className="oss-row" style={{ gap: 8, marginTop: 12 }}><Btn size="sm" kind="primary" onClick={() => openDrawer("venue", cur.id)}>Open venue</Btn><Btn size="sm" kind="ghost" onClick={() => setPick(null)}>Clear</Btn></div>
          </section> : <section className="oss-card cl-vpick empty"><span className="oss-small oss-dim">Pick a dot on the map to see the site.</span></section>}
        </div>
      </div>
      <div className="cl-venues">
        {list.map((v) => {
          const evs = bookings(v.id);
          const next = evs.filter((e) => Q.eventPhase(s, e) !== "completed").sort((x, y) => x.date.localeCompare(y.date))[0];
          const gps = v.methods.includes("gps"), qr = v.methods.includes("qr");
          const r = v.region || "Dublin";
          return (
            <section key={v.id} className={"cl-venue" + (v.id === pick ? " on" : "")}>
              <div className="cl-geo" aria-hidden="true" style={{ ["--c" as any]: regionVar(r) }}>
                {gps ? <><i className="r3" /><i className="r2" /><i className="r1" /><span className="pin"><Icon d={I.pin} size={16} /></span><span className="rad">{v.geofenceM} m</span></> : <span className="qr"><Icon d={I.qr} size={40} sw={1.3} /></span>}
              </div>
              <div className="cl-venue-b">
                <div className="oss-row" style={{ gap: 10, alignItems: "flex-start" }}>
                  <span className="grow" style={{ minWidth: 0 }}><b className="cl-name">{v.name}</b><span className="oss-small oss-dim">{v.area}</span></span>
                  {v.meetingConfirmed ? <St tone="ok">Meeting point set</St> : <St tone="warn">To confirm</St>}
                </div>
                <div className="oss-pills" style={{ marginTop: 12 }}>
                  <Tag c={regionVar(r)}>{v.county || "Dublin"}</Tag>
                  {v.capacity ? <span className="oss-pill"><Icon d={I.users} size={12} />{v.capacity.toLocaleString("en-IE")}</span> : null}
                  {gps && <span className="oss-pill"><Icon d={I.pin} size={12} />GPS within {v.geofenceM} m</span>}
                  {qr && <span className="oss-pill"><Icon d={I.qr} size={12} />Venue QR</span>}
                </div>
                <div className="cl-venue-mp"><Icon d={I.route} size={13} /><span>{v.meetingPoint}</span></div>
                <div className="oss-row" style={{ gap: 10, marginTop: 14 }}>
                  <Av name={Q.nameOf(s, v.supervisorId)} size="sm" /><span className="oss-tiny oss-dim grow">Supervisor {Q.nameOf(s, v.supervisorId)} · {evs.length} booking{evs.length === 1 ? "" : "s"}{next ? " · next " + fmtDate(evDate(next)) : ""}</span>
                  <Btn size="sm" onClick={() => openDrawer("venue", v.id)}>Open venue</Btn>
                </div>
              </div>
            </section>);
        })}
      </div>
    </Page>
  );
}
