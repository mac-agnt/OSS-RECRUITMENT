/* Shifts & roster: what each shift needs, who is confirmed, offers out, standby,
   replacements for non-responders, and the Find crew panel for offers. */

import { useEffect, useMemo, useState } from "react";
import type { Assignment, Event, OpsState, Shift } from "../../model";
import * as E from "../../engine";
import * as Q from "../../selectors";
import { go, setQuery, useRoute } from "../../router";
import { office, useOps } from "../../store";
import { dayKey, fmtDay, fmtTime, ms, relTime, span } from "../../time";
import { Avatar, Btn, Check, Dialog, Drawer, I, Icon, Notice, Pager, Search, Select, Status, Tag } from "../../ui/kit";
import { firstWord, venueLabel, supName } from "../common";

/* ── find crew ──────────────────────────────────────────────────────────── */
export function FindCrew({ shiftId, role: role0, replaces, onClose }: { shiftId: string; role?: string; replaces?: string; onClose: () => void }) {
  const s = useOps();
  const sh = Q.shift(s, shiftId);
  const ev = Q.event(s, sh.eventId);
  const [role, setRole] = useState(role0 || (replaces ? Q.asg(s, replaces).role : sh.needs.find((n) => Q.coverage(s, sh.id, n.role).outstanding)?.role || sh.needs[0].role));
  const [q, setQ] = useState("");
  const [available, setAvailable] = useState(true);
  const [validDocs, setValidDocs] = useState(true);
  const [county, setCounty] = useState("");
  const [free, setFree] = useState(false);
  const [maxH, setMaxH] = useState("");
  const [showBlocked, setShowBlocked] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [reason, setReason] = useState("");
  const [askReason, setAskReason] = useState<string[] | null>(null);
  const c = Q.coverage(s, sh.id, role);
  const list = useMemo(() => Q.candidates(s, sh.id, role, { q, available, validDocs, county: county || undefined, noAssignments: free, maxWeekH: maxH ? Number(maxH) : undefined, showBlocked }),
    [s, sh.id, role, q, available, validDocs, county, free, maxH, showBlocked]);
  useEffect(() => { setSel(new Set()); setPage(0); setAskReason(null); }, [role, q, available, validDocs, county, free, maxH, showBlocked]);
  const pageRows = list.slice(page * 40, page * 40 + 40);
  const toggle = (id: string, on: boolean) => setSel((x) => { const n = new Set(x); if (on) n.add(id); else n.delete(id); return n; });
  const pickable = list.filter((x) => x.e.status !== "hard" && !x.offered);
  const replacing = replaces ? Q.asg(s, replaces) : undefined;
  const send = () => {
    const ids = [...sel];
    const res = replacing ? office(E.offerReplacement, replacing.id, ids[0]) : office(E.sendOffers, sh.id, role, ids);
    if (res.ok) onClose();
  };
  const assign = () => {
    const id = [...sel][0];
    const res = office(E.assignManual, sh.id, role, id, reason);
    if (res.ok) onClose();
    else if (res.data?.needsReason) setAskReason(res.data.needsReason);
  };
  const standby = () => { for (const id of sel) office(E.addStandby, sh.id, role, id); setSel(new Set()); };
  const counties = [...new Set(s.workers.map((w) => w.county))].sort();
  return (
    <Drawer wide onClose={onClose} title={replacing ? "Replace " + Q.worker(s, replacing.workerId).name : "Find crew: " + role}
      sub={<>{ev.name} · {sh.label} · {fmtDay(dayKey(sh.start))} {span(sh.start, sh.end)} · <b className="ink">{c.outstanding} open</b>, {c.offered} offers out, {c.standby} on standby</>}
      footer={<>
        <span className="small dim grow">{sel.size} selected. {replacing ? "Their acceptance stands down " + Q.worker(s, replacing.workerId).name.split(" ")[0] + "." : "First to accept are confirmed; later acceptances join standby."}</span>
        {!replacing && <Btn disabled={!sel.size} onClick={standby}>Add to standby</Btn>}
        {!replacing && <Btn disabled={sel.size !== 1} onClick={assign} title="Book one worker straight away (you've spoken to them)">Assign directly</Btn>}
        <Btn kind="primary" icon={I.send} disabled={!sel.size || (!!replacing && sel.size !== 1)} onClick={send}>{replacing ? "Send replacement offer" : "Send " + (sel.size || "") + " offer" + (sel.size === 1 ? "" : "s")}</Btn>
      </>}>
      <div className="stack g12">
        <div className="toolbar" style={{ marginBottom: 0 }}>
          {sh.needs.length > 1 && !replacing && <div style={{ width: 200 }}><Select sm label="Role" value={role} onChange={setRole} options={sh.needs.map((n) => ({ value: n.role, label: n.role + " (" + Q.coverage(s, sh.id, n.role).outstanding + " open)" }))} /></div>}
          <Search value={q} onChange={setQ} placeholder="Search name or area" />
          <div style={{ width: 150 }}><Select sm label="County" value={county} onChange={setCounty} placeholder="Any county" options={counties.map((x) => ({ value: x, label: x }))} /></div>
          <div style={{ width: 170 }}><Select sm label="Weekly hours" value={maxH} onChange={setMaxH} placeholder="Any weekly hours" options={[{ value: "20", label: "Stays under 20 h" }, { value: "30", label: "Stays under 30 h" }, { value: "40", label: "Stays under 40 h" }]} /></div>
        </div>
        <div className="row wrap" style={{ gap: 16 }}>
          <Check checked={available} onChange={setAvailable}>Available that day</Check>
          <Check checked={validDocs} onChange={setValidDocs}>Valid documents</Check>
          <Check checked={free} onChange={setFree}>No other bookings</Check>
          <Check checked={showBlocked} onChange={setShowBlocked}>Show blocked</Check>
        </div>
        <div className="row between">
          <span className="small dim">{list.length} {list.length === 1 ? "worker" : "workers"} match. Best matches first: availability, local, standby, fewest bookings.</span>
          {!replacing && pickable.length > 0 && <button className="linkbtn small" onClick={() => setSel(new Set(pickable.slice(0, Math.max(1, Math.ceil(c.outstanding * 1.2))).map((x) => x.w.id)))}>Select best {Math.min(pickable.length, Math.max(1, Math.ceil(c.outstanding * 1.2)))}</button>}
        </div>
        {askReason && (
          <Notice tone="warn">
            <div className="stack g8">
              <span>Assigning {Q.worker(s, [...sel][0]).name} overrides: {askReason.join("; ")}. Record why (kept in the audit log). Compliance rules can never be overridden.</span>
              <textarea className="textarea" style={{ minHeight: 60 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: phoned her, she has swapped her day off" />
              <div className="row"><Btn kind="primary" size="sm" disabled={reason.trim().length < 5} onClick={assign}>Assign with override</Btn><Btn size="sm" kind="quiet" onClick={() => setAskReason(null)}>Cancel</Btn></div>
            </div>
          </Notice>
        )}
        <div className="panel">
          {!list.length && <div className="empty"><b>No one matches</b>Clear a filter, or tick Show blocked to see who is unavailable and why.</div>}
          {pageRows.map((x) => {
            const blocked = x.e.status === "hard";
            const shown = x.e.reasons.filter((r) => r.level !== "ok");
            return (
              <label key={x.w.id} className={"cand" + (blocked ? " blocked" : "")} style={{ cursor: blocked ? "default" : "pointer" }}>
                <input type="checkbox" disabled={blocked || x.offered} checked={sel.has(x.w.id)} onChange={(e) => toggle(x.w.id, e.target.checked)} aria-label={"Select " + x.w.name} style={{ marginTop: 3 }} />
                <div className="stack" style={{ gap: 2 }}>
                  <div className="row wrap"><span className="strong">{x.w.name}</span><span className="small dim">{x.w.area}{x.local ? "" : ", " + x.w.county}</span>
                    {x.standby && <Tag>Standby #{x.standby}</Tag>}{x.offered && <Tag>Offer sent</Tag>}{x.w.rtw === "Stamp 2" && <Tag>Stamp 2</Tag>}</div>
                  <div className="reasons">
                    {x.e.avail === "available" && <span className="reason ok"><Icon d={I.check} size={12} />{x.e.reasons.find((r) => r.code === "avail")?.label}</span>}
                    {shown.map((r, i) => <span key={i} className={"reason " + r.level}><Icon d={r.level === "hard" ? I.x : I.alert} size={12} />{r.label}</span>)}
                  </div>
                </div>
                <div className="stack num" style={{ gap: 0, alignItems: "flex-end" }}>
                  <span className="small">{Math.round(x.e.weekMin / 6) / 10}h this week</span>
                  <span className="tiny dim">{x.upcoming} upcoming</span>
                </div>
              </label>
            );
          })}
          <Pager page={page} size={40} total={list.length} onPage={setPage} />
        </div>
      </div>
    </Drawer>
  );
}

/* ── roster pieces ──────────────────────────────────────────────────────── */
function RemoveDialog({ a, onClose }: { a: Assignment; onClose: () => void }) {
  const s = useOps();
  const [reason, setReason] = useState("");
  return (
    <Dialog title={"Remove " + Q.worker(s, a.workerId).name + "?"} onClose={onClose}
      actions={<><Btn onClick={onClose}>Keep</Btn><Btn kind="danger" disabled={!reason.trim()} onClick={() => { if (office(E.removeAssignment, a.id, reason).ok) onClose(); }}>Remove from shift</Btn></>}>
      <div className="stack g8"><span>The place opens again and they get a message with your reason.</span>
        <input className="input" autoFocus placeholder="Reason, for example: client asked for fewer staff" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" /></div>
    </Dialog>
  );
}

function ShiftCard({ s, ev, sh, onFind }: { s: OpsState; ev: Event; sh: Shift; onFind: (shiftId: string, role?: string, replaces?: string) => void }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [removing, setRemoving] = useState<Assignment | null>(null);
  const [showOffers, setShowOffers] = useState(false);
  const [override, setOverride] = useState<{ standbyId: string; replaces?: string; rules: string[] } | null>(null);
  const [why, setWhy] = useState("");
  const promote = (standbyId: string, replaces?: string) => {
    const res = office(E.promoteStandby, standbyId, replaces);
    if (!res.ok && res.data?.needsReason) { setWhy(""); setOverride({ standbyId, replaces, rules: res.data.needsReason }); }
  };
  const st = Q.staffStatus(s, ev.id, [sh]);
  const conf = Q.confirmedOf(s, sh.id);
  const flagged = conf.filter((a) => a.flaggedAt);
  const recs = Q.replacementsFor(s, flagged.filter((a) => !s.offers.some((o) => o.replaces === a.id && Q.isOpenOffer(s, o))).map((a) => a.id));
  const offers = Q.offersOfShift(s, sh.id).filter((o) => Q.isOpenOffer(s, o));
  const standby = Q.standbyOf(s, sh.id);
  const ended = Q.asgsOfShift(s, sh.id).filter((a) => a.status !== "confirmed");
  const upcoming = ms(sh.start) > ms(s.clock);
  const rows = conf.filter((a) => !q || Q.worker(s, a.workerId).name.toLowerCase().includes(q.toLowerCase()));
  const pageRows = rows.slice(page * 25, page * 25 + 25);
  return (
    <div className="shift" id={"shift-" + sh.id}>
      <div className="shift-h">
        <div className="stack" style={{ gap: 2 }}>
          <div className="row wrap"><h3>{sh.label}</h3><Status tone={st.tone}>{st.label}</Status></div>
          <span className="small dim">{fmtDay(dayKey(sh.start))}, {span(sh.start, sh.end)} · {venueLabel(s, sh)} · Supervisor {supName(s, sh)}</span>
        </div>
        <div className="row wrap">
          {upcoming && <Btn size="sm" icon={I.comms} onClick={() => go("/comms?event=" + ev.id + "&shift=" + sh.id)}>Message</Btn>}
          {upcoming && Q.coverage(s, sh.id).outstanding > 0 && <Btn size="sm" kind="primary" icon={I.search} onClick={() => onFind(sh.id)}>Find crew</Btn>}
        </div>
      </div>
      <div className="needs">
        <div className="need-row head"><span>Role</span><span className="num">Needed</span><span className="num">Confirmed</span><span className="num">Open</span><span className="num">Offers out</span><span /></div>
        {sh.needs.map((n) => {
          const c = Q.coverage(s, sh.id, n.role);
          return (
            <div key={n.role} className="need-row">
              <span className="strong">{n.role}</span><span className="num">{n.count}</span>
              <span className={"num " + (c.outstanding ? "" : "tone-ok")}>{c.confirmed}</span>
              <span className={"num " + (c.outstanding ? "tone-bad strong" : "dim")}>{c.outstanding}</span>
              <span className="num">{c.offered}{c.standby ? <span className="dim"> · {c.standby} standby</span> : null}</span>
              <span className="acts">{upcoming && c.outstanding > 0 && <Btn size="sm" onClick={() => onFind(sh.id, n.role)}>Find {n.role.toLowerCase()}</Btn>}</span>
            </div>
          );
        })}
      </div>
      {flagged.map((a) => {
        const rec = recs.get(a.id);
        const w = Q.worker(s, a.workerId);
        const pending = s.offers.find((o) => o.replaces === a.id && Q.isOpenOffer(s, o));
        return (
          <div key={a.id} className="rec">
            <Icon d={I.alert} />
            <span className="grow"><b>{w.name}</b> ({a.role.toLowerCase()}) hasn't replied. Potentially unavailable.
              {pending ? <> Replacement offer out to <b>{Q.worker(s, pending.workerId).name}</b>.</> : rec ? <> Recommended: <b>{Q.worker(s, rec.workerId).name}</b>{rec.from === "standby" ? " (standby)" : " (eligible, available)"}.</> : " No eligible replacement available."}</span>
            <div className="row wrap">
              <Btn size="sm" icon={I.phone} onClick={() => go("/comms?worker=" + w.id)}>Contact</Btn>
              {!pending && rec?.standbyId && <Btn size="sm" kind="primary" onClick={() => promote(rec.standbyId!, a.id)}>Confirm {Q.worker(s, rec.workerId).name.split(" ")[0]}</Btn>}
              {!pending && rec && !rec.standbyId && <Btn size="sm" kind="primary" onClick={() => office(E.offerReplacement, a.id, rec.workerId)}>Offer to {Q.worker(s, rec.workerId).name.split(" ")[0]}</Btn>}
              <Btn size="sm" onClick={() => onFind(sh.id, a.role, a.id)}>Choose someone else</Btn>
            </div>
          </div>
        );
      })}
      <div style={{ borderTop: "1px solid var(--border)" }}>
        {conf.length > 12 && <div className="toolbar" style={{ padding: "10px 16px 0", marginBottom: 6 }}><Search value={q} onChange={(v) => { setQ(v); setPage(0); }} placeholder={"Search " + conf.length + " confirmed"} /></div>}
        {conf.length === 0 ? <div className="empty" style={{ padding: 20 }}>No one confirmed yet.</div> : (
          <div className="tbl-wrap">
            <table className="tbl" aria-label={"Confirmed crew, " + sh.label}>
              <thead><tr><th>Confirmed crew ({conf.length})</th><th className="hide-sm">Role</th><th>Status</th><th className="hide-md">Mobile</th><th /></tr></thead>
              <tbody>
                {pageRows.map((a) => {
                  const v = Q.asgView(s, a.id);
                  const owed = Q.owedReply(s, a);
                  return (
                    <tr key={a.id}>
                      <td><button className="linkbtn row" onClick={() => go("/crew/" + a.workerId)}><Avatar name={v.w.name} size="sm" />{v.w.name}</button>
                        {a.override && <div className="tiny tone-warn">Override: {a.override.reason}</div>}</td>
                      <td className="hide-sm">{a.role}</td>
                      <td><Status tone={v.tone}>{v.label}</Status>{owed && v.state === "upcoming" && <div className="tiny dim">{owed === "travel" ? "No reply to travel check" : "Not reconfirmed"}</div>}</td>
                      <td className="hide-md num">{v.w.mobile}</td>
                      <td className="r nowrap">
                        <Btn size="sm" kind="quiet" icon={I.comms} iconOnly title={"Message " + v.w.name} onClick={() => go("/comms?worker=" + a.workerId)} />
                        {upcoming && !v.inAt && <Btn size="sm" kind="quiet" icon={I.x} iconOnly title={"Remove " + v.w.name} onClick={() => setRemoving(a)} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <Pager page={page} size={25} total={rows.length} onPage={setPage} />
          </div>
        )}
      </div>
      {(offers.length > 0 || standby.length > 0 || ended.length > 0) && (
        <div style={{ borderTop: "1px solid var(--border)", padding: "10px 16px" }} className="stack g8">
          {offers.length > 0 && (
            <div className="stack g8">
              <div className="row wrap">
                <button className="linkbtn" onClick={() => setShowOffers((x) => !x)}>{offers.length} offer{offers.length === 1 ? "" : "s"} awaiting reply {showOffers ? "▴" : "▾"}</button>
                <Btn size="sm" kind="quiet" icon={I.play} onClick={() => office(E.simulateReplies, sh.id)} title="Demo only: crew who aren't phone personas reply now">Simulate replies</Btn>
                <Tag sim>Demo</Tag>
              </div>
              {showOffers && offers.map((o) => (
                <div key={o.id} className="row small">
                  <span className="strong">{Q.worker(s, o.workerId).name}</span><span className="dim">{o.role}{o.kind === "replacement" ? ", replacement" : ""} · sent {relTime(o.sentAt, s.clock)} · expires {fmtTime(o.expiresAt)}</span>
                  <span className="grow" />
                  <Btn size="sm" kind="quiet" onClick={() => office(E.withdrawOffer, o.id)}>Withdraw</Btn>
                </div>
              ))}
            </div>
          )}
          {standby.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              <span className="small strong">Standby ({standby.length})</span>
              {standby.map((b, i) => {
                const open = Q.coverage(s, sh.id, b.role).outstanding > 0;
                return (
                  <div key={b.id} className="row small wrap">
                    <span className="num dim">{i + 1}.</span><span className="strong">{Q.worker(s, b.workerId).name}</span><span className="dim">{b.role}{b.source === "accepted_full" ? ", accepted after full" : ""}</span>
                    <span className="grow" />
                    {upcoming && <Btn size="sm" kind={open ? "primary" : "secondary"} disabled={!open} title={open ? "Confirm onto the roster" : "No open place in this role"} onClick={() => promote(b.id)}>Confirm</Btn>}
                    <Btn size="sm" kind="quiet" icon={I.chevU} iconOnly title="Move up" onClick={() => office(E.moveStandby, b.id, -1)} />
                    <Btn size="sm" kind="quiet" icon={I.x} iconOnly title="Remove from standby" onClick={() => office(E.removeStandby, b.id)} />
                  </div>
                );
              })}
            </div>
          )}
          {ended.length > 0 && (
            <details>
              <summary className="small dim" style={{ cursor: "pointer" }}>{ended.length} no longer on this shift</summary>
              <div className="stack" style={{ gap: 4, marginTop: 6 }}>
                {ended.map((a) => <span key={a.id} className="small"><b className="ink">{Q.worker(s, a.workerId).name}</b> <span className="dim">{a.status === "cancelled" ? "cancelled" : a.status === "stood_down" ? "stood down" : "removed"} {a.endedAt ? relTime(a.endedAt, s.clock) : ""}: {a.endReason}</span></span>)}
              </div>
            </details>
          )}
        </div>
      )}
      {removing && <RemoveDialog a={removing} onClose={() => setRemoving(null)} />}
      {override && (
        <Dialog title="Confirm with an override?" onClose={() => setOverride(null)}
          actions={<><Btn onClick={() => setOverride(null)}>Cancel</Btn><Btn kind="primary" disabled={why.trim().length < 5}
            onClick={() => { if (office(E.promoteStandby, override.standbyId, override.replaces, why).ok) setOverride(null); }}>Confirm with reason</Btn></>}>
          <div className="stack g8"><span>This overrides: {override.rules.join("; ")}. The reason is kept in the audit log. Compliance rules can't be overridden.</span>
            <input className="input" autoFocus placeholder="Reason, for example: holiday week, agreed with the student" value={why} onChange={(e) => setWhy(e.target.value)} aria-label="Override reason" /></div>
        </Dialog>
      )}
    </div>
  );
}

/* ── the roster tab ─────────────────────────────────────────────────────── */
export default function Roster({ ev }: { ev: Event }) {
  const s = useOps();
  const r = useRoute();
  const all = Q.shiftsOf(s, ev.id);
  const big = all.length > 6;
  const days = [...new Set(all.map((x) => dayKey(x.start)))];
  const nowDay = dayKey(s.clock);
  const day = r.q.get("day") && days.includes(r.q.get("day")!) ? r.q.get("day")! : days.find((d) => d >= nowDay) || days[0];
  const [loc, setLoc] = useState("");
  const [sup, setSup] = useState("");
  const [find, setFind] = useState<{ shiftId: string; role?: string; replaces?: string } | null>(null);
  // Arriving from an alert (?fill=1) opens Find crew on the first short shift.
  useEffect(() => {
    if (r.q.get("fill") !== "1") return;
    const short = all.find((x) => ms(x.start) > ms(s.clock) && Q.coverage(s, x.id).outstanding > 0);
    if (short) setFind({ shiftId: short.id });
    setQuery({ fill: null });
  }, [r.q.get("fill")]);
  useEffect(() => {
    const id = r.q.get("shift");
    if (id) setTimeout(() => document.getElementById("shift-" + id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [r.q.get("shift")]);
  const shown = big ? all.filter((x) => dayKey(x.start) === day && (!loc || (x.venueId || ev.venueId) === loc) && (!sup || Q.shiftSupervisor(s, x) === sup)) : all;
  return (
    <div className="stack g12">
      {big && (
        <>
          <div className="panel">
            <div className="tbl-wrap">
              <table className="tbl" aria-label="Staffing by day">
                <thead><tr><th>Day</th><th className="r">Shifts</th><th className="r">Positions</th><th className="r">Confirmed</th><th className="r">Open</th><th className="r hide-sm">Offers out</th><th>Staffing</th></tr></thead>
                <tbody>
                  {days.map((d) => {
                    const shs = all.filter((x) => dayKey(x.start) === d);
                    const c = Q.eventCov(s, ev.id, shs);
                    const st = Q.staffStatus(s, ev.id, shs);
                    return (
                      <tr key={d} className={"click" + (d === day ? " sel" : "")} onClick={() => setQuery({ day: d })}>
                        <td className="strong">{fmtDay(d)}</td><td className="r num">{shs.length}</td><td className="r num">{c.required}</td><td className="r num">{c.confirmed}</td>
                        <td className={"r num " + (c.outstanding ? "tone-bad" : "")}>{c.outstanding}</td><td className="r num hide-sm">{c.offered}</td><td><Status tone={st.tone}>{Math.round((c.confirmed / Math.max(1, c.required)) * 100)}% filled</Status></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="toolbar">
            <span className="strong">{fmtDay(day)}</span>
            <div style={{ width: 230 }}><Select sm label="Location" value={loc} onChange={setLoc} placeholder="All locations" options={[...new Set(all.map((x) => x.venueId || ev.venueId))].map((v) => ({ value: v, label: Q.venue(s, v).name }))} /></div>
            <div style={{ width: 190 }}><Select sm label="Supervisor" value={sup} onChange={setSup} placeholder="All supervisors" options={[...new Set(all.map((x) => Q.shiftSupervisor(s, x)))].map((u) => ({ value: u, label: Q.user(s, u)?.name || u }))} /></div>
            <span className="small dim">{shown.length} of {all.filter((x) => dayKey(x.start) === day).length} shifts</span>
          </div>
        </>
      )}
      {!all.length && <Notice tone="warn">This event has no shifts. Edit the event to add one.</Notice>}
      {shown.map((sh) => <ShiftCard key={sh.id} s={s} ev={ev} sh={sh} onFind={(shiftId, role, replaces) => setFind({ shiftId, role, replaces })} />)}
      {find && <FindCrew shiftId={find.shiftId} role={find.role} replaces={find.replaces} onClose={() => setFind(null)} />}
    </div>
  );
}

export { firstWord };
