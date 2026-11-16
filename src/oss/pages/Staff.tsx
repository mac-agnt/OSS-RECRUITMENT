/* Crew: the employee register. A master-detail directory (list on the left, the
   person's whole file on the right), a who's-free heatmap, the document expiry
   runway with the review queue, and the on-site registration desk that checks
   for duplicates as you type. */

import "../../styles/oss-crew.css";
import { useMemo, useState } from "react";
import type { OssState, Region, Worker, WorkerDocument } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { docLabel } from "../seed";
import { profile, reliability, stamp2Check, STAMP2_CAP_MIN, weekMinutes } from "../industry";
import { navigate, openDrawer, run, runQuiet, useOss } from "../store";
import { tabOf } from "../modules";
import { addDays, dayKey, fmtDate, fmtDayMonth, fmtHM, fmtTime, ms, weekday, zoned } from "../time";
import { Av, Btn, Card, Chip, Drawer, Field, hueVar, I, Icon, Meter, Page, regionVar, Ring, Row, S, Search, Seg, St, Tag, deskVar } from "../ui/kit";
import { DESKS } from "../network";

export default function Staff() {
  const s = useOss();
  const tab = tabOf(s, "Staff");
  if (tab === "availability") return <Availability s={s} />;
  if (tab === "documents") return <Documents s={s} />;
  if (tab === "register") return <Register s={s} />;
  return <Directory s={s} />;
}

const AREAS = ["Dublin city", "Tallaght", "Clondalkin", "Lucan", "Swords", "Blanchardstown", "Bray", "Naas", "Drogheda", "Navan", "Kilkenny", "Athlone", "Cork city", "Douglas", "Limerick city", "Castletroy", "Ennis", "Killarney", "Waterford", "Galway city", "Castlebar", "Sligo", "Letterkenny", "Cavan"];
const ROLES = ["Event crew", "Steward", "Stagehand", "General operative", "Catering assistant", "Bar staff", "Site crew", "Usher", "Car park marshal", "Accreditation", "Hospitality host"];
const REGIONS: Region[] = ["Dublin", "Leinster", "Munster", "Connacht", "Ulster"];
const RTWS = ["Irish citizen", "EU citizen", "Stamp 2 (student)", "Stamp 4", "Stamp 1G"];
/* Story crew predate the region field; their towns are all in Dublin or the commuter belt. */
const COMMUTER = new Set(["Bray", "Naas", "Drogheda"]);
export const regionOfW = (w: Worker): Region => w.region || (COMMUTER.has(w.locality) ? "Leinster" : "Dublin");
const PAGE = 60;

/** Everything the crew list needs per person, worked out once per state change instead of per row. */
function useCrewIndex(s: OssState) {
  return useMemo(() => {
    const now = ms(s.clock);
    const up = new Map<string, number>(); const desks = new Map<string, Set<string>>();
    for (const a of s.assignments) {
      if (a.status !== "confirmed") continue;
      const sh = Q.shiftOf(s, a.shiftId); const ev = Q.eventOf(s, sh.eventId);
      if (ms(sh.end) > now) up.set(a.workerId, (up.get(a.workerId) || 0) + 1);
      const set = desks.get(a.workerId) || new Set<string>(); set.add(Q.deskOf(ev)); desks.set(a.workerId, set);
    }
    const issue = new Set<string>();
    for (const d of s.documents) if (!issue.has(d.workerId) && (d.review === "pending" || ["expired", "expiring"].includes(Q.docStatusToday(s, d)))) issue.add(d.workerId);
    const subm = new Set<string>();
    for (const r of s.availRules) subm.add(r.workerId);
    for (const x of s.availExceptions) if (!/^Confirmed availability/.test(x.note || "")) subm.add(x.workerId);
    const prof = new Map(s.workers.map((w) => [w.id, profile(w)]));
    return { up, desks, issue, subm, prof };
  }, [s.assignments, s.documents, s.availRules, s.availExceptions, s.workers, s.clock]);
}

/** Crew by region: a coloured bar you can click to filter. */
function RegionBar({ counts, total, value, onPick }: { counts: Record<string, number>; total: number; value: string; onPick: (r: string) => void }) {
  return (
    <div className="cw-regions" role="tablist" aria-label="Filter by region">
      <button className={"all" + (value === "all" ? " on" : "")} onClick={() => onPick("all")} role="tab" aria-selected={value === "all"}><b>{total}</b><span>All of Ireland</span></button>
      {REGIONS.map((r) => (
        <button key={r} className={value === r ? "on" : ""} onClick={() => onPick(value === r ? "all" : r)} role="tab" aria-selected={value === r} style={{ ["--c" as any]: regionVar(r) }}>
          <span className="top"><i /><span>{r}</span></span>
          <b>{counts[r] || 0}</b>
          <span className="bar"><i style={{ width: Math.round(((counts[r] || 0) / Math.max(1, total)) * 100) + "%" }} /></span>
        </button>))}
    </div>
  );
}
const DOC_SHORT: Record<string, string> = { MH: "Manual Handling", SP: "Safe Pass", HACCP: "Food Safety", FA: "First Aid" };
const DOC_HUE: Record<string, string> = { MH: "var(--k-2)", SP: "var(--k-6)", HACCP: "var(--k-3)", FA: "var(--k-1)" };
const DAY3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const rtwShort = (r: string) => (r.startsWith("Stamp 2") ? "Stamp 2" : r === "Irish citizen" ? "Irish" : r === "EU citizen" ? "EU" : r);
const rtwTone = (r: string) => (r.startsWith("Stamp 2") ? "warn" : r.startsWith("Stamp") ? "info" : "neutral") as "warn" | "info" | "neutral";
const docTone = (st: Q.DocState) => (st === "valid" ? "ok" : st === "expiring" || st === "pending" ? "warn" : "bad") as "ok" | "warn" | "bad";
const docWord: Record<Q.DocState, string> = { valid: "Valid", expiring: "Renew soon", expired: "Expired", pending: "To review", missing: "Missing", rejected: "Rejected" };
const day = (k: string) => zoned(k, "12:00");

/* ── directory: master-detail ────────────────────────────────────────────── */
type DirKey = "all" | "upcoming" | "issue" | "nosub" | "new" | "leaders";
function Directory({ s }: { s: OssState }) {
  const [q, setQ] = useState("");
  const [chip, setChip] = useState<DirKey>("all");
  const [role, setRole] = useState("all");
  const [region, setRegion] = useState("all");
  const [rtw, setRtw] = useState("all");
  const [desk, setDesk] = useState("all");
  const [limit, setLimit] = useState(PAGE);
  const [pick, setPick] = useState<string | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const [bulk, setBulk] = useState(false);
  const [patch, setPatch] = useState<{ locality: string; addRole: string }>({ locality: "", addRole: "" });
  const ix = useCrewIndex(s);
  const tests: Record<DirKey, (w: Worker) => boolean> = { all: () => true, upcoming: (w) => (ix.up.get(w.id) || 0) > 0, issue: (w) => ix.issue.has(w.id), nosub: (w) => !ix.subm.has(w.id), new: (w) => w.status === "pending_compliance", leaders: (w) => !!ix.prof.get(w.id)?.teamLeader };
  const ql = q.toLowerCase();
  const pre = s.workers.filter((w) => (!q || (w.name + " " + w.locality + " " + w.roles.join(" ") + " " + w.mobile).toLowerCase().includes(ql)) && (role === "all" || w.roles.includes(role))
    && (rtw === "all" || ix.prof.get(w.id)?.rtw === rtw) && (desk === "all" || !!ix.desks.get(w.id)?.has(desk)));
  const regionCounts: Record<string, number> = {};
  for (const w of pre) { const r = regionOfW(w); regionCounts[r] = (regionCounts[r] || 0) + 1; }
  const base = region === "all" ? pre : pre.filter((w) => regionOfW(w) === region);
  const rows = base.filter(tests[chip]).sort((a, b) => a.name.localeCompare(b.name));
  const n = (k: DirKey) => base.filter(tests[k]).length;
  const cur = rows.find((w) => w.id === pick) || rows[0];
  const toggle = (id: string) => setSel((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.concat([id])));
  const reset = <T,>(f: (v: T) => void) => (v: T) => { f(v); setLimit(PAGE); };
  /* When the list and the file are stacked (narrow screens, phone open), jump to the file. */
  const choose = (id: string) => {
    setPick(id);
    const md = document.querySelector(".cw-md");
    if (md && getComputedStyle(md).gridTemplateColumns.trim().split(/\s+/).length === 1) {
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() => document.querySelector(".cw-profile")?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" }));
    }
  };
  const preview = sel.map((id) => Q.worker(s, id)).map((w) => ({ w, changes: [patch.locality && w.locality !== patch.locality ? "Area: " + w.locality + " to " + patch.locality : "", patch.addRole && !w.roles.includes(patch.addRole) ? "Add role: " + patch.addRole : ""].filter(Boolean) }));
  const CHIPS: [DirKey, string][] = [["all", "Everyone"], ["upcoming", "Working soon"], ["leaders", "Team leaders"], ["issue", "Document attention"], ["nosub", "No availability"], ["new", "New, checks pending"]];
  const filtered = role !== "all" || rtw !== "all" || desk !== "all" || !!q;
  return (
    <Page eyebrow="Crew · register" title="Crew" sub={s.workers.length + " people OSS can offer event work to, in every province. Pick a person to see their whole file: reliability, right to work, hours, documents, licences and what clients think of them."}
      actions={<><Btn disabled={!sel.length} icon={I.sliders} onClick={() => setBulk(true)}>Edit {sel.length || ""} selected</Btn><Btn kind="primary" icon={I.plus} onClick={() => navigate("Staff", "register")}>Register someone</Btn></>}>
      {bulk && <Drawer title={"Edit " + sel.length + " profiles"} eyebrow="Bulk update" onClose={() => setBulk(false)}
        footer={<><Btn kind="primary" disabled={!preview.some((p) => p.changes.length)} onClick={() => { const r = run(E.bulkUpdateWorkers, sel, { locality: patch.locality || undefined, addRole: patch.addRole || undefined }); if (r.ok) { setBulk(false); setSel([]); } }}>Apply to {preview.filter((p) => p.changes.length).length}</Btn><Btn onClick={() => setBulk(false)}>Cancel</Btn></>}>
        <div className="oss-grid oss-g2">
          <Field label="Set area"><select className="oss-input" value={patch.locality} onChange={(e) => setPatch({ ...patch, locality: e.target.value })}><option value="">No change</option>{AREAS.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Add role"><select className="oss-input" value={patch.addRole} onChange={(e) => setPatch({ ...patch, addRole: e.target.value })}><option value="">No change</option>{ROLES.map((x) => <option key={x}>{x}</option>)}</select></Field>
        </div>
        <div className="oss-section"><h3>What changes</h3>
          <div className="oss-rows" style={{ margin: "0 -12px" }}>{preview.map((p) => <Row key={p.w.id} lead={<Av name={p.w.name} size="sm" />} title={p.w.name} sub={p.changes.length ? p.changes.join(" · ") : "No change"} />)}</div>
        </div>
      </Drawer>}
      <RegionBar counts={regionCounts} total={pre.length} value={region} onPick={reset(setRegion)} />
      <div className="cw-chips" role="tablist" aria-label="Filter crew">
        {CHIPS.map(([k, l]) => <button key={k} role="tab" aria-selected={chip === k} className={chip === k ? "on" : ""} onClick={() => { setChip(k); setLimit(PAGE); }}><b>{n(k)}</b><span>{l}</span></button>)}
      </div>
      <div className="cw-md">
        <section className="oss-card cw-list" aria-label="Crew list">
          <div className="cw-list-h">
            <Search value={q} onChange={reset(setQ)} placeholder="Name, phone, role or area" style={{ flex: "1 1 auto", minWidth: 0 }} />
          </div>
          <div className="cw-filters">
            <select className="oss-input cw-select" value={role} onChange={(e) => reset(setRole)(e.target.value)} aria-label="Filter by role"><option value="all">All roles</option>{ROLES.map((r) => <option key={r}>{r}</option>)}</select>
            <select className="oss-input cw-select" value={rtw} onChange={(e) => reset(setRtw)(e.target.value)} aria-label="Filter by right to work"><option value="all">Any right to work</option>{RTWS.map((r) => <option key={r}>{r}</option>)}</select>
            <select className="oss-input cw-select" value={desk} onChange={(e) => reset(setDesk)(e.target.value)} aria-label="Filter by desk worked for"><option value="all">Any desk</option>{DESKS.map((d) => <option key={d}>{d}</option>)}</select>
          </div>
          <div className="cw-list-meta"><span>{rows.length.toLocaleString("en-IE")} {rows.length === 1 ? "person" : "people"}{region !== "all" ? " in " + region : ""}</span>
            {filtered && <button className="oss-link" onClick={() => { setQ(""); setRole("all"); setRtw("all"); setDesk("all"); setLimit(PAGE); }}>Clear filters</button>}
            {sel.length > 0 && <button className="oss-link" onClick={() => setSel([])}>Clear {sel.length} selected</button>}</div>
          <div className="cw-list-b">
            {rows.slice(0, limit).map((w) => {
              const p = ix.prof.get(w.id)!; const rel = reliability(p); const nx = ix.up.get(w.id) || 0; const r = regionOfW(w);
              return (
                <div key={w.id} role="button" tabIndex={0} className={"cw-row" + (cur?.id === w.id ? " on" : "")} aria-pressed={cur?.id === w.id}
                  onClick={(e) => { if ((e.target as HTMLElement).closest("input")) return; choose(w.id); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(w.id); } }}>
                  <input type="checkbox" aria-label={"Select " + w.name} checked={sel.includes(w.id)} onChange={() => toggle(w.id)} />
                  <Av name={w.name} size="sm" />
                  <span className="m"><b>{w.name}</b><span><i className="cw-rdot" style={{ background: regionVar(r) }} title={r} />{w.roles.join(", ")} · {w.locality}</span></span>
                  <span className="e">
                    <span className={"rel" + (rel < 95 ? " lo" : "")} title="Turned up, last 90 days">{rel}%</span>
                    {w.status === "pending_compliance" ? <St tone="warn">New</St> : <span className={"cw-rtw " + rtwTone(p.rtw)}>{rtwShort(p.rtw)}</span>}
                    {nx > 0 && <span className="cw-on" title={nx + " confirmed shift" + (nx > 1 ? "s" : "")}>{nx}</span>}
                  </span>
                </div>);
            })}
            {rows.length > limit && <button className="cw-more" onClick={() => setLimit(limit + PAGE * 2)}>Show {Math.min(PAGE * 2, rows.length - limit)} more of {rows.length - limit}</button>}
            {!rows.length && <div className="oss-empty"><b>Nobody matches</b><Btn size="sm" onClick={() => { setQ(""); setChip("all"); setRole("all"); setRegion("all"); setRtw("all"); setDesk("all"); }}>Clear filters</Btn></div>}
          </div>
        </section>
        {cur ? <Profile s={s} w={cur} desks={Array.from(ix.desks.get(cur.id) || [])} /> : <section className="oss-card cw-profile"><div className="oss-empty"><b>Pick someone</b>Their file opens here.</div></section>}
      </div>
    </Page>
  );
}

function Profile({ s, w, desks }: { s: OssState; w: Worker; desks: string[] }) {
  const p = profile(w);
  const rel = reliability(p);
  const st2 = stamp2Check(s, w.id);
  const wk = weekMinutes(s, w.id);
  const now = ms(s.clock);
  const shifts = Q.asgByWorker(s, w.id).map((a) => ({ a, x: Q.shiftOf(s, a.shiftId) })).sort((m, n) => m.x.start.localeCompare(n.x.start));
  const upcomingFirst = shifts.filter(({ x }) => ms(x.end) > now).concat(shifts.filter(({ x }) => ms(x.end) <= now).reverse());
  const docs = Q.rowsBy(s.documents, "worker", (d) => d.workerId, w.id).slice().sort((a, b) => a.expires.localeCompare(b.expires));
  const rules = Q.rowsBy(s.availRules, "worker", (r) => r.workerId, w.id);
  const region = regionOfW(w);
  const relTone = rel >= 97 ? "ok" : rel >= 90 ? "warn" : "bad";
  return (
    <section className="oss-card cw-profile" aria-label={w.name}>
      <header className="cw-ph">
        <Av name={w.name} size="xl" />
        <div className="grow">
          <div className="oss-eyebrow">{w.status === "active" ? "Active crew" : "New, checks pending"} · on the books since {w.joined.slice(0, 4)}</div>
          <h2>{w.name}</h2>
          <div className="sub">{w.roles.join(", ")} · {w.locality}</div>
          <div className="oss-pills" style={{ marginTop: 10 }}>
            <Tag c={regionVar(region)}>{region}</Tag>
            {desks.map((d) => <Tag key={d} c={deskVar(d)} dot={false}>{d.replace(" desk", "")}</Tag>)}
            <St tone={rtwTone(p.rtw)}>{p.rtw}</St>
            {p.teamLeader && <St tone="info">Team leader</St>}
            {p.radio && <St tone="neutral">Radio trained</St>}
            {p.preferredBy.length > 0 && <St tone="ok">Requested by {p.preferredBy.length} client{p.preferredBy.length > 1 ? "s" : ""}</St>}
            {p.dnr.length > 0 && <St tone="bad">Do not rebook: {p.dnr.length}</St>}
          </div>
        </div>
        <div className="cw-acts">
          <Btn kind="primary" icon={I.doc} onClick={() => openDrawer("worker", w.id)}>Full file</Btn>
          <Btn icon={I.plus} onClick={() => navigate("Staffing", "allocate")}>Offer a shift</Btn>
          <Btn icon={I.msg} onClick={() => navigate("Messages", "compose")}>Message</Btn>
        </div>
      </header>

      <div className="cw-pgrid">
        <div className="cw-blk">
          <h4>Reliability, last 90 days</h4>
          <div className="cw-rel">
            <Ring value={p.attended} max={Math.max(1, p.shifts90)} size={92} tone={relTone} label={rel + "%"} sub="turned up" />
            <div className="cw-relnums">
              <div><b>{p.shifts90}</b><span>Shifts</span></div>
              <div><b style={p.noShows ? { color: "var(--bad)" } : undefined}>{p.noShows}</b><span>No-shows</span></div>
              <div><b style={p.lateCancels ? { color: "var(--warn)" } : undefined}>{p.lateCancels}</b><span>Late cancels</span></div>
              <div><b style={p.lates ? { color: "var(--warn)" } : undefined}>{p.lates}</b><span>Late arrivals</span></div>
            </div>
          </div>
          <div className="oss-tiny oss-dim" style={{ marginTop: 10 }}>Client rating {p.rating.toFixed(1)} of 5 · {w.priorShifts} OSS shifts in total</div>
        </div>
        <div className="cw-blk">
          <h4>Hours this week</h4>
          {st2 ? <>
            <div className="cw-big"><b style={{ color: st2.total > STAMP2_CAP_MIN ? "var(--bad)" : st2.near ? "var(--warn)" : undefined }}>{fmtHM(st2.total)}</b><span>of the 20h Stamp 2 term-time cap</span></div>
            <Meter total={Math.max(STAMP2_CAP_MIN, st2.total)} height={10} parts={[{ n: st2.earlier, tone: "neutral", label: "worked Mon to Thu" }, { n: st2.booked, tone: st2.total > STAMP2_CAP_MIN ? "bad" : "accent", label: "booked Fri to Sun" }, { n: Math.max(0, STAMP2_CAP_MIN - st2.total), tone: "ok", label: "left" }]} />
          </> : <>
            <div className="cw-big"><b>{fmtHM(wk.total)}</b><span>booked Mon 9 to Sun 15 Nov</span></div>
            <div className="oss-small oss-dim">{p.rtw} has no weekly hours cap. The 48-hour average and 11 hours' rest still apply.</div>
          </>}
        </div>
      </div>

      <div className="cw-blk">
        <h4>Shifts, next first</h4>
        {upcomingFirst.length ? <div className="cw-shifts">{upcomingFirst.slice(0, 6).map(({ a, x }) => { const ev = Q.eventOf(s, x.eventId); const up = ms(x.end) > now; return (
          <button key={a.id} className="cw-shift" onClick={() => navigate("Events", "upcoming", { kind: "event", id: ev.id })}>
            <span className="d"><b>{fmtDate(x.start).split(" ")[1]}</b><span>{fmtDate(x.start).split(" ")[0]}</span></span>
            <span className="m"><b>{ev.name.split(":")[0]}</b><span>{x.label} · {fmtTime(x.start)} to {fmtTime(x.end)}</span></span>
            {a.status === "confirmed" ? <St tone={up ? "info" : "neutral"}>{up ? "Booked" : "Worked"}</St> : <St tone="bad">Cancelled</St>}
          </button>); })}</div>
          : <div className="oss-small oss-muted">No shifts on file in this window. {w.priorShifts ? w.priorShifts + " earlier shifts in Bullhorn." : ""}</div>}
      </div>

      <div className="cw-pgrid">
        <div className="cw-blk">
          <h4>Documents</h4>
          {docs.length ? <div className="cw-docs">{docs.map((d) => { const st = Q.docStatusToday(s, d); return (
            <div key={d.id} className={"cw-docchip " + docTone(st)}><b>{DOC_SHORT[d.type] || d.type}</b><span>{st === "pending" ? "Uploaded, to review" : docWord[st] + " · " + fmtDayMonth(day(d.expires)) + " " + d.expires.slice(0, 4)}</span></div>); })}</div>
            : <div className="oss-small oss-muted">Nothing on file yet. They upload in OSS Crew.</div>}
          <h4 style={{ marginTop: 18 }}>Licences and vetting</h4>
          {p.licences.length ? <div className="oss-pills">{p.licences.map((l) => <span key={l} className="oss-pill"><Icon d={I.shield} size={12} />{l}</span>)}</div> : <div className="oss-small oss-muted">None beyond the documents above.</div>}
        </div>
        <div className="cw-blk">
          <h4>With clients</h4>
          <div className="oss-list oss-small">
            {p.preferredBy.map((c) => <div key={c} className="oss-row"><St tone="ok">Preferred</St><span>{Q.clientOf(s, c).name} asks for {w.name.split(" ")[0]} by name</span></div>)}
            {p.dnr.map((d) => <div key={d.clientId} className="oss-row" style={{ alignItems: "flex-start" }}><St tone="bad">Do not rebook</St><span>{Q.clientOf(s, d.clientId).name}: {d.reason}</span></div>)}
            {!p.preferredBy.length && !p.dnr.length && <div className="oss-muted">No client preferences recorded.</div>}
          </div>
          <h4 style={{ marginTop: 18 }}>Practical</h4>
          <dl className="cw-kv">
            <dt>Mobile</dt><dd>{w.mobile}</dd>
            <dt>Usually free</dt><dd>{rules.length ? rules.map((r) => DAY3[r.weekday]).join(", ") : Q.hasSubmittedAvailability(s, w.id) ? "Specific dates" : "Not submitted"}</dd>
            <dt>Gets there by</dt><dd>{p.transport}</dd>
            <dt>Uniform</dt><dd>{p.uniform}</dd>
            <dt>Languages</dt><dd>{p.languages.join(", ")}</dd>
          </dl>
        </div>
      </div>
    </section>
  );
}

/* ── availability: heatmap ───────────────────────────────────────────────── */
type Av3 = "available" | "unavailable" | "unknown";
interface Cell { am: Av3; pm: Av3; booked: string | null; title: string }
interface Slot { s: number; e: number; from: number; to: number }
interface DaySlots { k: string; wd: number; am: Slot; pm: Slot }
const hm = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
/** Same rule as the availability selector (holiday or unavailable blocks, a one-off covers, else the weekly pattern), with each day's times worked out once. */
function slotState(s: OssState, wid: string, wd: number, sl: Slot): Av3 {
  const exs = Q.rowsBy(s.availExceptions, "worker", (x) => x.workerId, wid);
  for (const x of exs) if ((x.kind === "unavailable" || x.kind === "holiday") && ms(x.start) < sl.e && ms(x.end) > sl.s) return "unavailable";
  for (const x of exs) if (x.kind === "available" && ms(x.start) <= sl.s && ms(x.end) >= sl.e) return "available";
  for (const r of Q.rowsBy(s.availRules, "worker", (x) => x.workerId, wid)) if (r.weekday === wd && hm(r.start) <= sl.from && (hm(r.end) >= sl.to || (r.end === "23:59" && sl.to >= 23 * 60))) return "available";
  return "unknown";
}
function Availability({ s }: { s: OssState }) {
  const start = dayKey(s.clock);
  const [span, setSpan] = useState<"7" | "14">("14");
  const days = Array.from({ length: Number(span) }, (_, i) => addDays(start, i));
  const [pickDay, setPickDay] = useState<string | null>(null);
  const sel = pickDay && days.includes(pickDay) ? pickDay : days.find((k) => weekday(day(k)) === 6) || days[0];
  const [part, setPart] = useState<"am" | "pm">("pm");
  const [role, setRole] = useState("all");
  const [region, setRegion] = useState<string>("all");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(40);
  const slots: DaySlots[] = useMemo(() => days.map((k) => ({ k, wd: weekday(day(k)),
    am: { s: ms(zoned(k, "08:00")), e: ms(zoned(k, "13:00")), from: 480, to: 780 }, pm: { s: ms(zoned(k, "17:00")), e: ms(zoned(k, "23:00")), from: 1020, to: 1380 } })), [span, start]);
  const booked = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of s.assignments) { if (a.status !== "confirmed") continue; const sh = Q.shiftOf(s, a.shiftId); const k = a.workerId + "|" + dayKey(sh.start); if (!m.has(k)) m.set(k, Q.eventOf(s, sh.eventId).name.split(":")[0]); }
    return m;
  }, [s.assignments]);
  const pre = s.workers.filter((w) => (role === "all" || w.roles.includes(role)) && (!q || w.name.toLowerCase().includes(q.toLowerCase())));
  const regionCounts: Record<string, number> = {};
  for (const w of pre) { const r = regionOfW(w); regionCounts[r] = (regionCounts[r] || 0) + 1; }
  const people = (region === "all" ? pre : pre.filter((w) => regionOfW(w) === region)).sort((a, b) => a.name.localeCompare(b.name));
  const grid = useMemo(() => people.map((w) => ({ w, cells: slots.map((d): Cell => {
    const bk = booked.get(w.id + "|" + d.k) || null;
    const am = bk ? "unknown" : slotState(s, w.id, d.wd, d.am), pm = bk ? "unknown" : slotState(s, w.id, d.wd, d.pm);
    return { am, pm, booked: bk, title: bk ? "Booked: " + bk : "Morning: " + (am === "available" ? "free" : am === "unavailable" ? "not free" : "nothing set") + ". Evening: " + (pm === "available" ? "free" : pm === "unavailable" ? "not free" : "nothing set") };
  }) })), [s.availExceptions, s.availRules, booked, role, q, region, slots, s.workers]);
  const free = days.map((_, i) => grid.filter((r) => !r.cells[i].booked && (r.cells[i].am === "available" || r.cells[i].pm === "available")).length);
  const bookedN = days.map((_, i) => grid.filter((r) => r.cells[i].booked).length);
  const di = days.indexOf(sel);
  const availNow = grid.filter((r) => !r.cells[di].booked && r.cells[di][part] === "available");
  const nosub = Q.notSubmitted(s);
  const maxFree = Math.max(1, ...free.map((f, i) => f + bookedN[i]));
  const shown = grid.slice(0, limit);
  return (
    <Page eyebrow="Crew · availability" title="Who's free" sub="Crew set their own weekly pattern, one-off dates and holidays in OSS Crew. Each square is a day: top half the morning, bottom half the evening. Bars show free crew in colour and crew already booked in grey."
      actions={<Seg value={span} onChange={setSpan} label="Days shown" options={[{ id: "7", label: "7 days" }, { id: "14", label: "14 days" }]} />}>
      <RegionBar counts={regionCounts} total={pre.length} value={region} onPick={(r) => { setRegion(r); setLimit(40); }} />
      <div className="cw-toolbar">
        <div className="cw-rolechips">{["all", ...ROLES.slice(0, 7)].map((r) => <Chip key={r} on={role === r} onClick={() => { setRole(r); setLimit(40); }}>{r === "all" ? "All roles" : r}</Chip>)}</div>
        <Search value={q} onChange={(v) => { setQ(v); setLimit(40); }} placeholder="Find a person" style={{ width: 220 }} />
      </div>
      <div className="cw-avail">
        <section className="oss-card cw-heatcard" aria-label="Availability heatmap">
          <div className="cw-heat">
            <table className="cw-heat-t" style={{ ["--n" as any]: days.length }}>
              <thead>
                <tr className="spark"><th className="nm" />{days.map((k, i) => <th key={k}><span className="cw-spark two" title={free[i] + " free, " + bookedN[i] + " booked"}><i className="bk" style={{ height: Math.round((bookedN[i] / maxFree) * 100) + "%" }} /><i style={{ height: Math.round((free[i] / maxFree) * 100) + "%" }} /></span></th>)}</tr>
                <tr className="cnt"><th className="nm">Free</th>{days.map((k, i) => <th key={k}><span className="cw-cnt">{free[i]}</span></th>)}</tr>
                <tr>
                  <th className="nm">{people.length.toLocaleString("en-IE")} crew</th>
                  {days.map((k, i) => { const wd = weekday(day(k)); return (
                    <th key={k} className={(k === sel ? "on " : "") + (wd === 0 || wd === 6 ? "we" : "")}>
                      <button onClick={() => setPickDay(k)} aria-pressed={k === sel} title={free[i] + " free on " + fmtDate(day(k))}><span>{DAY3[wd]}</span><b>{fmtDate(day(k)).split(" ")[1]}</b></button>
                    </th>); })}
                </tr>
              </thead>
              <tbody>
                {shown.map(({ w, cells }) => (
                  <tr key={w.id}>
                    <th className="nm"><button onClick={() => openDrawer("worker", w.id)}><Av name={w.name} size="sm" /><span>{w.name}</span><i className="cw-rdot" style={{ background: regionVar(regionOfW(w)) }} /></button></th>
                    {cells.map((c, i) => <td key={i} className={days[i] === sel ? "on" : ""}>
                      <span className={"cw-cell" + (c.booked ? " bk" : "")} title={fmtDate(day(days[i])) + ". " + c.title}>
                        {c.booked ? <Icon d={I.check} size={11} sw={2.6} /> : <><i className={c.am} /><i className={c.pm} /></>}
                      </span></td>)}
                  </tr>))}
                {!grid.length && <tr><td colSpan={days.length + 1}><div className="oss-empty"><b>Nobody matches</b></div></td></tr>}
              </tbody>
            </table>
          </div>
          {grid.length > limit && <button className="cw-more" onClick={() => setLimit(limit + 80)}>Show {Math.min(80, grid.length - limit)} more of {grid.length - limit}</button>}
          <div className="cw-legend">
            <span><i className="cw-cell sm"><i className="available" /><i className="available" /></i>Free</span>
            <span><i className="cw-cell sm"><i className="available" /><i className="unavailable" /></i>Morning only</span>
            <span><i className="cw-cell sm"><i className="unavailable" /><i className="unavailable" /></i>Not free</span>
            <span><i className="cw-cell sm"><i className="unknown" /><i className="unknown" /></i>Nothing set</span>
            <span><i className="cw-cell sm bk" />Booked with OSS</span>
          </div>
        </section>
        <div className="oss-stack">
          <Card title={"Free " + fmtDate(day(sel))} meta={availNow.length + " " + (part === "am" ? "in the morning" : "in the evening") + (role === "all" ? "" : ", " + role.toLowerCase()) + (region === "all" ? "" : ", " + region)} icon={I.check} flush
            right={<div className="oss-seg"><button className={part === "am" ? "on" : ""} onClick={() => setPart("am")}>AM</button><button className={part === "pm" ? "on" : ""} onClick={() => setPart("pm")}>PM</button></div>}>
            <div className="oss-rows" style={{ maxHeight: 320, overflowY: "auto" }}>
              {availNow.slice(0, 40).map(({ w }) => <Row key={w.id} lead={<Av name={w.name} size="sm" />} title={w.name} sub={w.roles[0] + " · " + w.locality} onClick={() => openDrawer("worker", w.id)} />)}
              {availNow.length > 40 && <div className="oss-tiny oss-muted" style={{ padding: "6px 12px" }}>And {availNow.length - 40} more</div>}
              {!availNow.length && <div className="oss-small oss-muted" style={{ padding: "4px 12px 10px" }}>Nobody has said they're free then.</div>}
            </div>
            <div style={{ padding: "8px 12px 6px" }}><Btn size="sm" block icon={I.msg} disabled={!availNow.length} onClick={() => navigate("Messages", "compose")}>Message everyone free</Btn></div>
          </Card>
          <Card title={"No availability (" + nosub.length + ")"} meta="Can't be offered shifts until they do" icon={I.alert} flush
            right={<Btn size="sm" icon={I.send} disabled={!nosub.length} onClick={() => run(E.sendBulk, { workerIds: nosub.map((w) => w.id), body: "Please add your availability in OSS Crew so we can offer you shifts that suit you.", audience: "Availability not submitted" })}>Ask them</Btn>}>
            <div className="oss-rows" style={{ maxHeight: 260, overflowY: "auto" }}>{nosub.slice(0, 50).map((w) => <Row key={w.id} lead={<Av name={w.name} size="sm" />} title={w.name} sub={w.locality} onClick={() => openDrawer("worker", w.id)} />)}
              {nosub.length > 50 && <div className="oss-tiny oss-muted" style={{ padding: "6px 12px" }}>And {nosub.length - 50} more</div>}
              {!nosub.length && <div className="oss-small oss-muted" style={{ padding: "4px 12px 10px" }}>Everyone has given availability.</div>}</div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

/* ── documents: expiry runway + review queue ─────────────────────────────── */
function Documents({ s }: { s: OssState }) {
  const today = dayKey(s.clock);
  const [bucket, setBucket] = useState<number | "expired" | "all">("all");
  const [shiftCheck, setShiftCheck] = useState("SH-001B");
  const at = Q.shiftOf(s, shiftCheck) || s.shifts[0];
  const stat = useMemo(() => new Map(s.documents.map((d) => [d.id, Q.docStatusToday(s, d)])), [s.documents, s.clock, s.rules.renewalWarnDays]);
  const live = s.documents.filter((d) => d.review === "approved" && (stat.get(d.id) === "valid" || stat.get(d.id) === "expiring"));
  const soonShifts = s.shifts.filter((x) => { const e = Q.eventOf(s, x.eventId); return !e.historical && ms(x.end) > ms(s.clock) && ms(x.start) < ms(s.clock) + 14 * 864e5; }).sort((a, b) => a.start.localeCompare(b.start));
  const regionDocs = (r: Region) => live.filter((d) => regionOfW(Q.worker(s, d.workerId)) === r).length;
  const weeks = Array.from({ length: 13 }, (_, i) => ({ i, from: addDays(today, i * 7), to: addDays(today, i * 7 + 7) }));
  const inWeek = (d: WorkerDocument, i: number) => d.expires >= weeks[i].from && d.expires < weeks[i].to;
  const cols = weeks.map((wk) => live.filter((d) => inWeek(d, wk.i)));
  const expired = s.documents.filter((d) => ["expired", "rejected"].includes(stat.get(d.id)!));
  const pending = s.documents.filter((d) => d.review === "pending").sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const horizon = live.filter((d) => d.expires < weeks[12].to);
  const list = (bucket === "all" ? horizon : bucket === "expired" ? expired : cols[bucket]).slice().sort((a, b) => a.expires.localeCompare(b.expires));
  const max = Math.max(1, expired.length, ...cols.map((c) => c.length));
  const types = ["MH", "SP", "HACCP", "FA"] as const;
  const holders = (t: string) => new Set(s.documents.filter((d) => d.type === t && ["valid", "expiring"].includes(stat.get(d.id)!)).map((d) => d.workerId)).size;
  const remind = (d: WorkerDocument) => run(E.sendBulk, { workerIds: [d.workerId], body: "Your " + docLabel(d.type) + " expires on " + fmtDayMonth(day(d.expires)) + ". Please upload the renewal in OSS Crew.", audience: "Renewal reminder" });
  const listTitle = bucket === "all" ? "Expiring in the next 90 days" : bucket === "expired" ? "Expired or rejected" : "Expiring week of " + fmtDayMonth(day(weeks[bucket].from));
  return (
    <Page eyebrow="Crew · documents" title="Certificates and expiry" sub="Manual Handling, Safe Pass, Food Safety and First Aid. Validity is checked against the date of each shift, so a cert that runs out on Friday can't be offered for Saturday.">
      <section className="oss-card cw-runway" aria-label="Expiry runway">
        <div className="oss-card-h"><span className="ico"><Icon d={I.cal} size={16} /></span><div className="ttl"><h2>Expiry runway</h2><span className="meta">Approved certificates running out, week by week. Click a week to see who.</span></div>
          <div className="right"><button className={"oss-chip" + (bucket === "all" ? " on" : "")} onClick={() => setBucket("all")}>Next 90 days <span className="oss-muted">{horizon.length}</span></button></div></div>
        <div className="cw-rw">
          <button className={"col bad" + (bucket === "expired" ? " on" : "")} onClick={() => setBucket("expired")} title={expired.length + " expired or rejected"}>
            <span className="n">{expired.length}</span><span className="bar"><i style={{ height: (expired.length / max) * 100 + "%" }} /></span><span className="lab">Expired</span>
          </button>
          <span className="cw-rw-sep" aria-hidden="true" />
          {cols.map((c, i) => (
            <button key={i} className={"col" + (i < 5 ? " soon" : "") + (bucket === i ? " on" : "")} onClick={() => setBucket(i)} title={c.length + " expiring week of " + fmtDayMonth(day(weeks[i].from))}>
              <span className="n">{c.length || ""}</span><span className="bar"><i style={{ height: (c.length / max) * 100 + "%" }} /></span><span className="lab">{i === 0 ? "This wk" : fmtDayMonth(day(weeks[i].from))}</span>
            </button>))}
        </div>
      </section>
      <div className="oss-grid oss-g75" style={{ alignItems: "start" }}>
        <Card title={listTitle} meta={list.length + " certificate" + (list.length === 1 ? "" : "s")} icon={I.doc} flush
          right={<label className="oss-small oss-dim cw-validon">Valid on<select className="oss-input" value={shiftCheck} onChange={(e) => setShiftCheck(e.target.value)}>{(soonShifts.some((x) => x.id === shiftCheck) ? soonShifts : [at].concat(soonShifts)).map((x) => <option key={x.id} value={x.id}>{fmtDate(x.start)} · {Q.eventOf(s, x.eventId).name.split(":")[0]}, {x.label}</option>)}</select></label>}>
          <div className="oss-rows cw-docrows" style={{ maxHeight: 520, overflowY: "auto" }}>
            {list.map((d) => { const st = Q.docState(s, d.workerId, d.type, at.end); return (
              <Row key={d.id} lead={<Av name={Q.nameOf(s, d.workerId)} size="sm" />} title={Q.nameOf(s, d.workerId)} onClick={() => openDrawer("worker", d.workerId)}
                sub={docLabel(d.type) + " · expires " + fmtDate(day(d.expires)) + " " + d.expires.slice(0, 4)}
                end={<><St tone={st.state === "valid" ? "ok" : st.state === "expiring" ? "warn" : "bad"}>{st.state === "valid" ? "OK for " + fmtDate(at.start).split(" ")[0] : st.state === "expiring" ? "OK, renew soon" : st.state === "pending" ? "Not reviewed" : "Not valid " + fmtDate(at.start).split(" ")[0]}</St>
                  {stat.get(d.id) === "expiring" && <Btn size="sm" icon={I.bell} onClick={() => remind(d)}>Remind</Btn>}</>} />); })}
            {!list.length && <div className="oss-empty"><b>Nothing in this window</b>Pick another week on the runway.</div>}
          </div>
        </Card>
        <div className="oss-stack">
          <Card title="Review queue" meta={pending.length ? pending.length + " uploaded in OSS Crew" : "Nothing to review"} icon={I.upload} flush>
            <div className="cw-queue">
              {pending.map((d) => (
                <div key={d.id} className="cw-qitem">
                  <span className={"cw-dtype t-" + d.type}>{d.type === "HACCP" ? "FS" : d.type}</span>
                  <div className="m">
                    <b>{Q.nameOf(s, d.workerId)}</b>
                    <span>{docLabel(d.type)} · {d.issuer}</span>
                    <span>Uploaded {fmtDate(d.uploadedAt)} · expires {fmtDayMonth(day(d.expires))} {d.expires.slice(0, 4)}</span>
                  </div>
                  <div className="a"><Btn size="sm" kind="primary" onClick={() => run(E.reviewDocument, d.id, "approved")}>Approve</Btn><Btn size="sm" onClick={() => run(E.reviewDocument, d.id, "rejected")}>Reject</Btn></div>
                </div>))}
              {!pending.length && <div className="oss-small oss-muted" style={{ padding: "4px 12px 12px" }}>New uploads land here for the compliance team.</div>}
            </div>
          </Card>
          <Card title="Who holds what" meta="Valid today" icon={I.shield}>
            <div className="oss-bars">
              {types.map((t) => { const h = holders(t); return (
                <button key={t} className="oss-hbar" style={{ gridTemplateColumns: "120px minmax(0,1fr) 44px" }} onClick={() => navigate("Reports", "qualifications")}>
                  <span>{DOC_SHORT[t]}</span><span className="track"><i style={{ width: (h / s.workers.length) * 100 + "%", background: DOC_HUE[t] }} /></span><span className="val">{h}</span>
                </button>); })}
            </div>
            <div className="oss-small oss-dim" style={{ marginTop: 14, lineHeight: 1.55 }}>Shifts that need a certificate only offer work to people whose copy is approved and valid through the end of that shift.</div>
          </Card>
          <Card title="Valid certificates by region" meta={live.length.toLocaleString("en-IE") + " on file and in date"} icon={I.map}>
            <div className="cw-regbars">{REGIONS.map((r) => { const n = regionDocs(r); return (
              <div key={r} className="cw-regbar" style={{ ["--c" as any]: regionVar(r) }}><span className="k"><i />{r}</span><span className="track"><i style={{ width: (n / Math.max(1, live.length)) * 100 + "%" }} /></span><b>{n.toLocaleString("en-IE")}</b></div>); })}</div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

/* ── register on site: the gate desk ─────────────────────────────────────── */
function Register({ s }: { s: OssState }) {
  const [f, setF] = useState({ name: "", email: "", mobile: "", role: "Event crew", locality: "Dublin city" });
  const [res, setRes] = useState<E.Result | null>(null);
  const dup = useMemo(() => (f.email || f.mobile || f.name ? E.findDuplicates(s, f) : { exact: undefined, similar: [] as Worker[] }), [f, s.workers.length]);
  const recent = s.workers.filter((w) => w.registeredAt).reverse();
  const set = (p: Partial<typeof f>) => { setF({ ...f, ...p }); setRes(null); };
  const em = E.normEmail(f.email), ph = E.normPhone(f.mobile);
  const emHit = em ? s.workers.find((w) => E.normEmail(w.email) === em) : undefined;
  const phHit = ph.length >= 9 ? s.workers.find((w) => E.normPhone(w.mobile) === ph) : undefined;
  const filled = !!f.name.trim() && (!!f.email.trim() || !!f.mobile.trim());
  const created = !!res?.data?.created;
  const step = created ? 3 : filled ? 1 : 0;
  const check = (label: string, state: "idle" | "ok" | "warn" | "bad", text: string) => (
    <div className={"cw-check " + state}><span className="i"><Icon d={state === "ok" ? I.check : state === "idle" ? I.minus : I.alert} size={13} sw={2.4} /></span><b>{label}</b><span>{text}</span></div>);
  return (
    <Page eyebrow="Crew · register on site" title="Gate desk" sub="Built for a phone or tablet at the crew entrance. Email and mobile are checked against every existing profile while you type, so nobody ends up with two.">
      <div className="cw-desk">
        <section className="oss-card cw-deskform" aria-label="Register a new crew member">
          <div className="cw-deskband"><Icon d={I.qr} size={16} /><span>On-site registration</span><span className="grow" /><span className="oss-tiny">{fmtDate(s.clock)}, {fmtTime(s.clock)}</span></div>
          <div className="cw-deskb">
            <ol className="cw-steps">{["Details", "Duplicate check", "Profile created", "App link by text"].map((l, i) => <li key={l} className={(i <= step ? "on" : "") + (i === 2 && step === 3 ? " now" : "")}><span>{i < step || (step === 3 && i <= 3) ? <Icon d={I.check} size={11} sw={2.8} /> : i + 1}</span>{l}</li>)}</ol>
            <div className="cw-form">
              <Field label="Full name"><input className="oss-input" value={f.name} onChange={(e) => set({ name: e.target.value })} autoComplete="off" placeholder="First and last name" /></Field>
              <div className="oss-grid oss-g2">
                <Field label="Mobile"><input className="oss-input" type="tel" value={f.mobile} onChange={(e) => set({ mobile: e.target.value })} autoComplete="off" placeholder="08x xxx xxxx" /></Field>
                <Field label="Email"><input className="oss-input" type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} autoComplete="off" placeholder="name@example.com" /></Field>
              </div>
              <div className="oss-grid oss-g2">
                <Field label="Role"><select className="oss-input" value={f.role} onChange={(e) => set({ role: e.target.value })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
                <Field label="Area"><select className="oss-input" value={f.locality} onChange={(e) => set({ locality: e.target.value })}>{AREAS.map((r) => <option key={r}>{r}</option>)}</select></Field>
              </div>
            </div>
            <div className="cw-checks" aria-live="polite">
              {check("Email", !em ? "idle" : emHit ? "bad" : "ok", !em ? "Not entered" : emHit ? "Already on " + emHit.name + "'s profile" : "Not on any profile")}
              {check("Mobile", ph.length < 9 ? "idle" : phHit ? "bad" : "ok", ph.length < 9 ? "Not entered" : phHit ? "Already on " + phHit.name + "'s profile" : "Not on any profile")}
              {check("Name", !f.name.trim() ? "idle" : dup.similar.length ? "warn" : "ok", !f.name.trim() ? "Not entered" : dup.similar.length ? "Similar: " + dup.similar.slice(0, 3).map((w) => w.name).join(", ") : "No similar names")}
            </div>
            {dup.exact && <div className="oss-note warn"><b>Already registered:</b> {dup.exact.name}, matched on {E.normEmail(dup.exact.email) === em ? "email" : "mobile"}. No duplicate will be created.
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}><Btn size="sm" onClick={() => openDrawer("worker", dup.exact!.id)}>Open profile</Btn><Btn size="sm" onClick={() => run(E.sendBulk, { workerIds: [dup.exact!.id], body: "Please check your contact details and documents in OSS Crew are up to date.", audience: "Profile update request" })}>Ask them to update it</Btn></div></div>}
            {!dup.exact && <Btn kind="primary" size="lg" block disabled={!filled} onClick={() => setRes(runQuiet(E.registerWorker, f, "Shane Esler", !!(res && res.data?.similar)))}>{res?.data?.similar ? "Yes, create a new profile" : "Register"}</Btn>}
            {res && <div className={"oss-note " + (res.ok ? "ok" : "warn")}>{res.message}{res.data?.created && <> <button className="oss-link" onClick={() => openDrawer("worker", res.data.created)}>Open profile</button></>}</div>}
            <div className="oss-tiny oss-muted">Try a duplicate: aidan.murphy@example.test</div>
          </div>
        </section>
        <div className="oss-stack">
          <section className="oss-card cw-today" aria-label="Registered at the desk">
            <div className="cw-today-h"><b>{recent.length}</b><span>registered at the desk{recent.length ? "" : " so far"}</span></div>
            <div className="cw-badges">
              {recent.map((w) => (
                <button key={w.id} className="cw-badge" onClick={() => openDrawer("worker", w.id)}>
                  <Av name={w.name} />
                  <span className="m"><b>{w.name}</b><span>{w.roles[0]} · {w.locality}</span></span>
                  <S s="Pending compliance" />
                </button>))}
              {!recent.length && <div className="oss-small oss-muted">New registrations show here with their checks still to do.</div>}
            </div>
          </section>
          <Card title="What happens next" icon={I.list}>
            <div className="oss-timeline">
              <div className="info"><div className="oss-small oss-ink">Profile created, marked new</div><div className="oss-tiny oss-muted">Can't be offered shifts yet</div></div>
              <div><div className="oss-small oss-ink">They get the OSS Crew app link by text</div><div className="oss-tiny oss-muted">Add availability and upload documents</div></div>
              <div><div className="oss-small oss-ink">Compliance reviews the documents</div><div className="oss-tiny oss-muted">Manual Handling, Safe Pass, right to work</div></div>
              <div className="ok"><div className="oss-small oss-ink">Matched to Bullhorn and active</div><div className="oss-tiny oss-muted">Shows up in Allocate</div></div>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}
