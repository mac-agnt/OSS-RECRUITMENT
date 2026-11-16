/* Portals: every outside view of OSS Pulse in one place. Client portals (live
   staffing, attendance on the day, hours sign-off), the OSS Crew app and the
   supervisor app. Each is previewed from live records; open any of them as
   that person. */

import { useState } from "react";
import type { OssState } from "../model";
import * as Q from "../selectors";
import { ACCOUNTS, signOffHours } from "../industry";
import { navigate, run, setUi, useOss } from "../store";
import { tabOf } from "../modules";
import { fmtDate, fmtHM, fmtTime, hourOf, ms, zoned } from "../time";
import { Av, Btn, Card, Cov, Figure, Hero, hueVar, I, Icon, Meter, Page, Ring, Row, RIcon, St, Table } from "../ui/kit";

export default function Portals() {
  const s = useOss();
  const tab = tabOf(s, "Portals");
  if (tab === "client") return <ClientPortal s={s} />;
  if (tab === "crew") return <CrewApp s={s} />;
  return <Overview s={s} />;
}

/* About nine in ten active crew have signed in to the app; the rest are mid-migration from TeamTrack. */
const crewLive = (s: OssState) => Math.round(s.workers.filter((w) => w.status === "active").length * 0.91);
const openClient = (s: OssState, id: string) => setUi({ tabs: { ...s.ui.tabs, Portals: "client" }, focus: { kind: "client", id } });

/* ── overview: the three outside views, previewed from live records ─────── */
function Overview({ s }: { s: OssState }) {
  const rows = s.clients.map((c) => ({ c, a: ACCOUNTS[c.id], evs: s.events.filter((e) => e.clientId === c.id && !e.historical) })).filter((r) => r.a).sort((x, y) => (x.a.portal === "Live" ? 0 : x.a.portal === "Invited" ? 1 : 2) - (y.a.portal === "Live" ? 0 : y.a.portal === "Invited" ? 1 : 2) || y.a.hoursYtd - x.a.hoursYtd);
  const hero = Q.eventCoverage(s, "EVT-001");
  const heroEv = Q.eventOf(s, "EVT-001");
  const toSign = Q.lines(s, { clientId: "C01" }).filter((l) => !s.ext.signoffs[l.event.id]);
  const me = Q.worker(s, s.ui.crewWorkerId);
  const myAsg = s.assignments.filter((a) => a.workerId === me.id && a.status === "confirmed").map((a) => Q.shiftOf(s, a.shiftId)).filter((x) => ms(x.end) > ms(s.clock)).sort((a, b) => a.start.localeCompare(b.start))[0];
  const myInv = s.invitations.find((i) => i.workerId === me.id && Q.isActiveInvite(s, i));
  const supShifts = Q.shiftsOfEvent(s, "EVT-001");
  const supAsg = s.assignments.filter((a) => supShifts.some((x) => x.id === a.shiftId) && a.status === "confirmed");
  const onSite = supAsg.filter((a) => Q.verifiedIn(s, a.id) && !Q.verifiedOut(s, a.id)).length;
  const fixes = Q.openExceptions(s).length;
  const live = rows.filter((r) => r.a.portal === "Live").length;
  return (
    <Page eyebrow="Portals" title="What people outside the office see" sub="A portal for each client, the OSS Crew app for staff and the supervisor app for site leads. All three run on the same records as this screen, so nobody is working off an old spreadsheet.">
      <div className="pt-frames">
        <section className="pt-col">
          <div className="pt-browser mini" aria-hidden="true">
            <div className="pt-chrome"><i /><i /><i /><span><Icon d={I.shield} size={10} />Client portal · Aiken Promotions</span></div>
            <div className="pt-mini">
              <div className="oss-tiny oss-muted">Your next event</div>
              <b className="pt-mini-t">{heroEv.name.split(":")[0]}</b>
              <div className="oss-tiny oss-dim">{fmtDate(zoned(heroEv.date, "12:00"))} · {Q.venueOf(s, heroEv.venueId)?.name}</div>
              <div style={{ marginTop: 12 }}><Meter height={8} total={hero.required} parts={[{ n: hero.confirmed, tone: "accent", label: "confirmed" }, { n: hero.awaiting, tone: "neutral", label: "awaiting" }]} /></div>
              <div className="pt-mini-row"><span>Hours to sign off</span><b>{toSign.length ? fmtHM(toSign.reduce((t, l) => t + l.payableMin, 0)) : "None"}</b></div>
            </div>
          </div>
          <div className="pt-about">
            <div className="oss-row" style={{ gap: 10 }}><RIcon d={I.briefcase} tone="info" /><span className="grow"><b>Client portal</b><span className="oss-tiny oss-dim">{live} of {rows.length} clients live</span></span></div>
            <ul className="pt-list"><li><Icon d={I.check} size={12} sw={2.4} />Live staffing for every booking</li><li><Icon d={I.check} size={12} sw={2.4} />Who is on site on the day</li><li><Icon d={I.check} size={12} sw={2.4} />Hours to sign off before invoicing</li><li className="no"><Icon d={I.x} size={12} sw={2.4} />Never crew phone numbers, documents or pay</li></ul>
            <Btn kind="primary" block icon={I.briefcase} onClick={() => openClient(s, "C01")}>Open as Aiken Promotions</Btn>
          </div>
        </section>
        <section className="pt-col">
          <div className="pt-phone" aria-hidden="true">
            <div className="pt-notch" />
            <div className="pt-mini">
              <div className="oss-tiny oss-muted">OSS Crew</div>
              <b className="pt-mini-t">Hi {me.name.split(" ")[0]}</b>
              {myInv ? <div className="pt-mini-card hot"><span className="oss-tiny">New offer</span><b>{Q.eventOf(s, Q.shiftOf(s, myInv.shiftId).eventId).name.split(":")[0]}</b><span className="oss-tiny oss-dim">{Q.shiftOf(s, myInv.shiftId).label} · {fmtTime(Q.shiftOf(s, myInv.shiftId).start)}</span><span className="pt-mini-btns"><i>Accept</i><i className="g">Decline</i></span></div>
                : myAsg ? <div className="pt-mini-card"><span className="oss-tiny">Next shift</span><b>{Q.eventOf(s, myAsg.eventId).name.split(":")[0]}</b><span className="oss-tiny oss-dim">{fmtDate(myAsg.start)} · {fmtTime(myAsg.start)}</span></div>
                : <div className="pt-mini-card"><span className="oss-tiny">No shifts booked</span><b>Add your availability</b></div>}
              <div className="pt-mini-row"><span>Hours this week</span><b>{fmtHM(Q.lines(s, { workerId: me.id }).reduce((t, l) => t + l.payableMin, 0))}</b></div>
              <div className="pt-tabbar"><i className="on" /><i /><i /><i /></div>
            </div>
          </div>
          <div className="pt-about">
            <div className="oss-row" style={{ gap: 10 }}><RIcon d={I.phone} tone="ok" /><span className="grow"><b>OSS Crew app</b><span className="oss-tiny oss-dim">{crewLive(s)} of {s.workers.length} crew signed in</span></span></div>
            <ul className="pt-list"><li><Icon d={I.check} size={12} sw={2.4} />Shift offers to accept or decline</li><li><Icon d={I.check} size={12} sw={2.4} />Availability, schedule and call sheets</li><li><Icon d={I.check} size={12} sw={2.4} />Check-in at the venue and their hours</li><li><Icon d={I.check} size={12} sw={2.4} />Document uploads and messages</li></ul>
            <Btn block icon={I.phone} onClick={() => setUi({ phoneOpen: true, role: "crew" })}>Open as {me.name}</Btn>
          </div>
        </section>
        <section className="pt-col">
          <div className="pt-phone" aria-hidden="true">
            <div className="pt-notch" />
            <div className="pt-mini">
              <div className="oss-tiny oss-muted">Supervisor · {Q.nameOf(s, "U05")}</div>
              <b className="pt-mini-t">{Q.venueOf(s, heroEv.venueId)?.name}</b>
              <div className="pt-mini-big"><b>{onSite}</b><span>of {supAsg.length} on site</span></div>
              <div className="pt-mini-card row"><span className="oss-tiny">Venue QR for check-in</span><span className="pt-qr"><Icon d={I.qr} size={22} sw={1.4} /></span></div>
              <div className="pt-mini-row"><span>Times to fix</span><b>{fixes}</b></div>
            </div>
          </div>
          <div className="pt-about">
            <div className="oss-row" style={{ gap: 10 }}><RIcon d={I.pin} tone="warn" /><span className="grow"><b>Supervisor app</b><span className="oss-tiny oss-dim">{s.users.filter((u) => u.perms.includes("supervise")).length} people can use it</span></span></div>
            <ul className="pt-list"><li><Icon d={I.check} size={12} sw={2.4} />Tonight's roster and who has arrived</li><li><Icon d={I.check} size={12} sw={2.4} />Venue QR for check-in at the gate</li><li><Icon d={I.check} size={12} sw={2.4} />Fix a missed clock with a note</li><li className="no"><Icon d={I.x} size={12} sw={2.4} />Can't approve hours or change pay</li></ul>
            <Btn block icon={I.pin} onClick={() => setUi({ phoneOpen: true, role: "supervisor" })}>Open supervisor app</Btn>
          </div>
        </section>
      </div>
      <div className="oss-gap" />
      <Card pad={false} title="Client portals" meta="One per client. They see their own staffing live and sign off hours." icon={I.briefcase}>
        <Table rows={rows} rowKey={(r) => r.c.id}
          cols={[{ key: "n", label: "Client", render: (r) => <span className="oss-row"><span className="pt-dot" style={{ background: hueVar(r.c.id) }} /><span><span className="strong">{r.c.name}</span><div className="oss-tiny oss-muted">{r.c.sector}</div></span></span> },
            { key: "ct", label: "Portal contact", render: (r) => { const ct = s.contacts.find((x) => x.clientId === r.c.id); return ct ? <span className="oss-small">{ct.name}<div className="oss-tiny oss-muted">{ct.role}</div></span> : "-"; } },
            { key: "code", label: "Invite code", render: (r) => <span className="oss-mono" style={{ color: "var(--ink)" }}>{r.a.code}</span> },
            { key: "b", label: "Booked", num: true, render: (r) => r.evs.reduce((n, e) => n + Q.eventCoverage(s, e.id).required, 0) },
            { key: "c", label: "Confirmed", num: true, render: (r) => r.evs.reduce((n, e) => n + Q.eventCoverage(s, e.id).confirmed, 0) },
            { key: "h", label: "Hours to sign off", num: true, render: (r) => { const ls = Q.lines(s, { clientId: r.c.id }).filter((l) => !s.ext.signoffs[l.event.id]); return ls.length ? fmtHM(ls.reduce((t, l) => t + l.payableMin, 0)) : "-"; } },
            { key: "s", label: "", render: (r) => <span className="oss-row" style={{ gap: 6, justifyContent: "flex-end" }}><St tone={r.a.portal === "Live" ? "ok" : r.a.portal === "Invited" ? "info" : "neutral"}>{r.a.portal}</St>{r.a.portal !== "Not set up" ? <Btn size="sm" kind="primary" onClick={() => openClient(s, r.c.id)}>Open as client</Btn> : <Btn size="sm">Set up</Btn>}</span> }]} />
      </Card>
    </Page>
  );
}

/* ── the client portal, rendered as the client sees it ───────────────────── */
function ClientPortal({ s }: { s: OssState }) {
  const cid = s.ui.focus?.kind === "client" ? s.ui.focus.id : "C01";
  const c = Q.clientOf(s, cid), a = ACCOUNTS[cid];
  const contact = s.contacts.find((x) => x.clientId === cid);
  const evs = s.events.filter((e) => e.clientId === cid && !e.historical).sort((x, y) => x.date.localeCompare(y.date));
  const live = evs.find((e) => Q.eventPhase(s, e) === "live");
  const toSign = s.events.filter((e) => e.clientId === cid && Q.lines(s, { eventId: e.id }).length && !s.ext.signoffs[e.id]);
  const signed = s.events.filter((e) => e.clientId === cid && s.ext.signoffs[e.id]);
  const [open, setOpen] = useState<string | null>(null);
  const req = evs.reduce((n, e) => n + Q.eventCoverage(s, e.id).required, 0);
  const conf = evs.reduce((n, e) => n + Q.eventCoverage(s, e.id).confirmed, 0);
  const onSite = live ? s.assignments.filter((x) => x.status === "confirmed" && Q.shiftOf(s, x.shiftId).eventId === live.id && Q.verifiedIn(s, x.id) && !Q.verifiedOut(s, x.id)).length : 0;
  const due = toSign.reduce((t, e) => t + Q.lines(s, { eventId: e.id }).reduce((n, l) => n + l.payableMin, 0), 0);
  const h = hourOf(s.clock);
  const who = contact && !/desk|team|office|bookings/i.test(contact.name) ? contact.name.split(" ")[0] : c.name.split(" ")[0] + " team";
  const hello = (h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening") + ", " + who;
  return (
    <Page eyebrow={"Portals · viewing as " + (contact?.name || c.name)} title={"Client portal: " + c.name} sub="This is the client's own view. Live numbers only: no crew phone numbers, documents or pay."
      actions={<select className="oss-input" style={{ width: 240, borderRadius: 999 }} value={cid} onChange={(e) => setUi({ focus: { kind: "client", id: e.target.value } })} aria-label="Client">{s.clients.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}>
      <div className="pt-browser">
        <div className="pt-chrome"><i /><i /><i /><span><Icon d={I.shield} size={11} />OSS client portal · {c.name}</span></div>
        <div className="pt-brand">
          <img className="oss-logo-w" src="/brand/oss-logo-white.png" alt="OSS" style={{ height: 22 }} /><img className="oss-logo-c" src="/brand/oss-logo.png" alt="OSS" style={{ height: 22 }} />
          <span className="oss-small oss-dim grow">Staffing portal</span>
          <span className="oss-tiny oss-muted">{contact?.name || "Client"}</span><Av name={contact?.name || c.name} size="sm" />
        </div>
        <div className="pt-body">
          <div className="pt-welcome">
            <div className="grow" style={{ minWidth: 0 }}>
              <h2>{hello}</h2>
              <p>Here is your staffing with OSS for {c.name}. Numbers update as crew accept offers and check in.</p>
              {live && <div className="pt-live"><span className="oss-tag live">Live now</span><b>{live.name.split(":")[0]}</b><span>{onSite} of our crew on site</span></div>}
            </div>
            <div className="pt-welcome-figs">
              <Ring value={conf} max={req || 1} size={104} stroke={9} label={req ? Math.round((conf / req) * 100) + "%" : "-"} sub="confirmed" />
              <div className="pt-figcol">
                <Figure size="sm" label="Positions confirmed" value={conf + " of " + req} />
                <Figure size="sm" label="Upcoming events" value={evs.filter((e) => Q.eventPhase(s, e) !== "completed").length} />
                <Figure size="sm" label="Hours to sign off" value={due ? fmtHM(due) : "None"} tone={due ? "accent" : undefined} />
              </div>
            </div>
          </div>
          <div className="oss-grid oss-g75" style={{ alignItems: "start" }}>
            <Card title="Your events" meta="Tap one to see each shift" icon={I.cal} flush>
              <div className="oss-rows">{evs.map((e) => <div key={e.id}>
                <Row onClick={() => setOpen(open === e.id ? null : e.id)} lead={<RIcon d={I.cal} tone={Q.eventPhase(s, e) === "live" ? "ok" : undefined} />} title={e.name} sub={fmtDate(zoned(e.date, "12:00")) + " · " + (Q.venueOf(s, e.venueId)?.name || "Venue to confirm")}
                  end={e.status === "pending" ? <St tone="neutral">Awaiting your headcount</St> : <span style={{ width: 170 }}><Cov c={Q.eventCoverage(s, e.id)} compact /></span>} />
                {open === e.id && <div style={{ padding: "0 14px 12px 60px" }}>{Q.shiftsOfEvent(s, e.id).map((x) => <div key={x.id} className="oss-row oss-small" style={{ padding: "4px 0" }}><span className="grow">{x.label} · {fmtTime(x.start)} to {fmtTime(x.end)}</span><span className="oss-tab">{Q.shiftCoverage(s, x.id).confirmed}/{x.required} confirmed</span></div>)}</div>}
              </div>)}
                {!evs.length && <div className="oss-small oss-muted" style={{ padding: "4px 12px 12px" }}>No bookings yet.</div>}</div>
            </Card>
            <div className="oss-stack">
              <Card title="Hours to sign off" meta="Approve before OSS invoices" icon={I.check} flush>
                <div className="oss-rows">
                  {toSign.map((e) => { const ls = Q.lines(s, { eventId: e.id }); const t = ls.reduce((n, l) => n + l.payableMin, 0); const ready = ls.every((l) => l.status === "approved" || l.status === "exported");
                    return <Row key={e.id} title={e.name.split(":")[0] + ", " + fmtDate(zoned(e.date, "12:00"))} sub={ls.length + " people · " + fmtHM(t) + (ready ? " · approved by OSS" : " · OSS still checking")}
                      end={<Btn size="sm" kind="primary" disabled={!ready} onClick={() => run(signOffHours, e.id, (contact?.name || "Client") + ", " + c.name, t)}>Sign off</Btn>} />; })}
                  {signed.map((e) => <Row key={e.id} lead={<RIcon d={I.check} tone="ok" />} title={e.name.split(":")[0]} sub={"Signed off " + fmtDate(s.ext.signoffs[e.id].at) + " " + fmtTime(s.ext.signoffs[e.id].at)} />)}
                  {!toSign.length && !signed.length && <div className="oss-small oss-muted" style={{ padding: "4px 12px 12px" }}>Nothing to sign off yet.</div>}
                </div>
              </Card>
              <Card title="Your OSS contact" icon={I.user}>
                <div className="oss-row"><Av name={Q.nameOf(s, a.manager)} /><span><b className="oss-ink">{Q.nameOf(s, a.manager)}</b><div className="oss-tiny oss-muted">Account manager. Message them about any booking.</div></span></div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}

/* ── the crew app, as the office sees adoption ───────────────────────────── */
function CrewApp({ s }: { s: OssState }) {
  const names = new Set(s.workers.map((w) => w.name));
  const recent = s.audit.filter((a) => names.has(a.actor) || a.actor === "OSS Crew").slice(-8).reverse();
  const replied = s.invitations.filter((i) => i.respondedAt);
  const avg = replied.length ? Math.round(replied.reduce((t, i) => t + (ms(i.respondedAt!) - ms(i.sentAt)) / 60000, 0) / replied.length) : 0;
  const avail = s.workers.length - Q.notSubmitted(s).length;
  return (
    <div className="oss-page">
      <Hero eyebrow="Portals · OSS Crew" title="The OSS Crew app" sub="Offers, availability, schedule, messages, check-in and hours for every crew member. Works on any phone, no app store needed for the pilot."
        actions={<><Btn kind="primary" icon={I.phone} onClick={() => setUi({ phoneOpen: true, role: "crew" })}>Open as crew</Btn><Btn icon={I.pin} onClick={() => setUi({ phoneOpen: true, role: "supervisor" })}>Open as supervisor</Btn></>}
        aside={<>
          <Ring value={crewLive(s)} max={s.workers.length} size={118} stroke={10} label={crewLive(s)} sub={"of " + s.workers.length + " on it"} />
          <div className="pt-figcol">
            <Figure size="sm" label="Average reply to an offer" value={fmtHM(avg)} sub="Send to accept or decline" />
            <Figure size="sm" label="Availability up to date" value={avail + " of " + s.workers.length} sub={Q.notSubmitted(s).length + " still to add it"} />
            <Figure size="sm" label="Documents on file" value={s.documents.length.toLocaleString("en-IE")} sub={s.documents.filter((d) => d.review === "pending").length + " waiting for review"} />
          </div>
        </>} />
      <div className="oss-grid oss-g2" style={{ alignItems: "start" }}>
        <Card title="From the app, latest" meta="Replies, availability, check-ins" icon={I.wave} flush>
          <div className="oss-rows">{recent.map((a) => <Row key={a.id} lead={<Av name={a.actor} size="sm" />} title={a.summary} wrap sub={fmtDate(a.at) + ", " + fmtTime(a.at)} />)}
            {!recent.length && <div className="oss-small oss-muted" style={{ padding: "4px 12px 12px" }}>Nothing from crew yet.</div>}</div>
        </Card>
        <Card title="Getting crew onto the app" icon={I.qr}>
          <div className="oss-row" style={{ gap: 18, alignItems: "flex-start" }}>
            <div style={{ width: 120, height: 120, borderRadius: 18, background: "var(--surface-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink)", flex: "none" }}><Icon d={I.qr} size={64} sw={1.3} /></div>
            <div className="oss-small" style={{ lineHeight: 1.65, color: "var(--body)" }}>New crew get a text with their link after registration. Existing TeamTrack crew are imported and invited in waves before January. On site, supervisors show the venue QR at the staff entrance for check-in.</div>
          </div>
          <div className="pt-waves">
            {([["Registered in OSS Pulse", s.workers.length], ["Signed in to the app", crewLive(s)], ["Availability added", avail]] as [string, number][]).map(([l, n]) => (
              <div key={l} className="pt-wave"><span>{l}</span><span className="bar"><i style={{ width: (n / s.workers.length) * 100 + "%" }} /></span><b>{n}</b></div>))}
          </div>
        </Card>
      </div>
      <div className="oss-gap" />
      <div><Btn kind="ghost" icon={I.back} onClick={() => navigate("Portals", "overview")}>All portals</Btn></div>
    </div>
  );
}
