/* Recruitment: from application to active crew. Phone screen, group induction,
   right to work and documents, then live in OSS Crew. The funnel shows how many
   reach each step; the board below is where people are moved on. The Ryder Cup
   2027 build needs 800 to 900 people, so the campaign has its own plan. */

import "../../styles/oss-crew.css";
import { useState } from "react";
import type { Applicant, ApplicantStage, Induction, OssState } from "../model";
import { advanceApplicant, bookInduction, pipeline, withdrawApplicant } from "../industry";
import { run, useOss } from "../store";
import { tabOf } from "../modules";
import { fmtDate, fmtTime, ms } from "../time";
import { Av, Btn, Card, Faces, Figure, Funnel, Hero, hueVar, I, Icon, Page, regionVar, Ring, St, Tag } from "../ui/kit";
import { regionOfW } from "./Staff";

export default function Recruitment() {
  const s = useOss();
  const tab = tabOf(s, "Recruitment");
  if (tab === "inductions") return <Inductions s={s} />;
  if (tab === "ryder") return <Ryder s={s} />;
  return <Pipeline s={s} />;
}

const ORDER: ApplicantStage[] = ["applied", "screened", "induction", "inducted", "docs", "active"];
const NEXT: Record<string, string> = { applied: "Phone screen", screened: "Book induction", induction: "Mark inducted", inducted: "Docs received", docs: "Activate", active: "" };
const SHORT: Record<string, string> = { applied: "Applied", screened: "Phone screened", induction: "Induction booked", inducted: "Inducted", docs: "Documents", active: "Active crew" };
const rtwTone = (r: string) => (r.startsWith("Stamp 2") ? "warn" : r.startsWith("Stamp") ? "info" : "neutral") as "warn" | "info" | "neutral";
const booked = (s: OssState, ind: Induction) => s.ext.applicants.filter((a) => a.inductionId === ind.id && a.stage === "induction");
const AREA_REGION: Record<string, string> = { "Limerick city": "Munster", Castletroy: "Munster", Adare: "Munster", Ennis: "Munster", Shannon: "Munster", "Newcastle West": "Munster", Kilmallock: "Munster", Raheen: "Munster", Annacotty: "Munster",
  "Cork city": "Munster", Douglas: "Munster", Nenagh: "Munster", Tralee: "Munster", Limerick: "Munster", "Galway city": "Connacht", Salthill: "Connacht", Bray: "Leinster", Naas: "Leinster", Drogheda: "Leinster" };
const areaRegion = (a: string) => AREA_REGION[a] || "Dublin";
const CAMP_HUE: Record<string, string> = { "Ryder Cup 2027": "var(--k-5)", "Winter season": "var(--k-6)" };

/** Horizontal bars in category colour: where applications come from, where people live. */
function Bars({ rows, total }: { rows: { k: string; n: number; c: string }[]; total: number }) {
  return <div className="rc-bars">{rows.map((r) => (
    <div key={r.k} className="rc-bar" style={{ ["--c" as any]: r.c }}><span className="k"><i />{r.k}</span><span className="track"><i style={{ width: (r.n / Math.max(1, total)) * 100 + "%" }} /></span><b>{r.n}</b></div>))}</div>;
}

function ApplicantCard({ s, a }: { s: OssState; a: Applicant }) {
  const ind = a.inductionId ? s.ext.inductions.find((x) => x.id === a.inductionId) : undefined;
  const days = Math.max(0, Math.round((ms(s.clock) - ms(a.appliedAt)) / 864e5));
  return (
    <div className="rc-card">
      <div className="oss-row"><Av name={a.name} size="sm" /><span style={{ minWidth: 0, flex: 1 }}><div className="t">{a.name}</div><div className="s"><i className="cw-rdot" style={{ background: regionVar(areaRegion(a.area)) }} />{a.roles.join(", ")} · {a.area}</div></span></div>
      <div className="oss-row" style={{ gap: 6, flexWrap: "wrap" }}>
        <Tag c={CAMP_HUE[a.campaign] || hueVar(a.campaign)} dot={false}>{a.campaign === "Ryder Cup 2027" ? "Ryder Cup" : "Winter"}</Tag>
        <St tone={rtwTone(a.rtw)}>{a.rtw.replace(" (student)", "")}</St>
        <span className="oss-tiny oss-muted">{a.source} · {days ? days + "d ago" : "today"}</span>
      </div>
      {ind && a.stage === "induction" && <div className="rc-ind"><Icon d={I.cal} size={12} />{fmtDate(ind.at)} {fmtTime(ind.at)} · {ind.place.split(",")[0]}</div>}
      {(a.stage === "inducted" || a.stage === "docs") && <div className="rc-docs">{([["Manual Handling", a.docs.mh], ["Safe Pass", a.docs.sp], ["Right to work", a.docs.rtw], ["Bank and PPS", a.docs.bank]] as [string, boolean][]).map(([l, v]) => <span key={l} className={v ? "y" : ""}><Icon d={v ? I.check : I.minus} size={10} sw={2.6} />{l}</span>)}</div>}
      {NEXT[a.stage] && <div className="oss-row" style={{ gap: 6 }}>
        <span style={{ flex: 1 }}><Btn size="sm" kind="primary" block onClick={() => run(advanceApplicant, a.id)}>{NEXT[a.stage]}</Btn></span>
        {a.stage !== "docs" && <button className="oss-iconbtn" style={{ width: 30, height: 30 }} title="Withdraw" aria-label={"Withdraw " + a.name} onClick={() => run(withdrawApplicant, a.id)}><Icon d={I.x} size={12} /></button>}
      </div>}
    </div>
  );
}

/* ── pipeline: funnel + board ────────────────────────────────────────────── */
function Pipeline({ s }: { s: OssState }) {
  const [camp, setCamp] = useState<"all" | "Ryder Cup 2027" | "Winter season">("all");
  const [stage, setStage] = useState<ApplicantStage | null>(null);
  const cols = pipeline(s, camp === "all" ? undefined : camp);
  const all = s.ext.applicants.filter((a) => camp === "all" || a.campaign === camp);
  const live = all.filter((a) => a.stage !== "withdrawn");
  const reached = (st: ApplicantStage) => live.filter((a) => ORDER.indexOf(a.stage) >= ORDER.indexOf(st)).length;
  const here = (st: ApplicantStage) => live.filter((a) => a.stage === st).length;
  const week = all.filter((a) => ms(a.appliedAt) > ms(s.clock) - 7 * 864e5).length;
  const active = here("active");
  const conv = live.length ? Math.round((active / live.length) * 100) : 0;
  const nextInd = s.ext.inductions.filter((x) => ms(x.at) > ms(s.clock)).sort((a, b) => a.at.localeCompare(b.at))[0];
  const seats = nextInd ? nextInd.capacity - booked(s, nextInd).length : 0;
  const shown = stage ? cols.filter((c) => c.stage === stage) : cols;
  return (
    <Page eyebrow="Crew · recruitment" title="From application to active crew" sub="Screen, induct, collect right to work and documents, then switch them on in OSS Crew. Email and mobile are checked at every step, so nobody is on the books twice."
      actions={<div className="oss-seg rc-camp">{(["all", "Ryder Cup 2027", "Winter season"] as const).map((c) => <button key={c} className={camp === c ? "on" : ""} onClick={() => { setCamp(c); setStage(null); }}>{c === "all" ? "All campaigns" : c}</button>)}</div>}>
      <section className="oss-card rc-top" aria-label="Recruitment funnel">
        <div className="rc-funnel">
          <div className="rc-h"><b>How far people get</b><span>{stage ? <button className="oss-link" onClick={() => setStage(null)}>Show every stage</button> : "Click a stage to see just those people"}</span></div>
          <Funnel active={stage || undefined} onPick={(id) => setStage((p) => (p === id ? null : (id as ApplicantStage)))}
            stages={ORDER.map((st) => ({ id: st, label: SHORT[st], n: reached(st), sub: here(st) + " at this step now", tone: st === "active" ? "ok" : st === "docs" || st === "inducted" ? "warn" : "accent" }))} />
        </div>
        <div className="rc-side">
          <Figure size="lg" label="In the pipeline" value={live.length - active} sub={week + " applied in the last 7 days"} />
          <Figure label="Made active" value={active} sub={conv + "% of everyone still in play"} tone="ok" />
          <div className="rc-next">
            <span className="oss-eyebrow">Next induction</span>
            {nextInd ? <><b>{fmtDate(nextInd.at)}, {fmtTime(nextInd.at)}</b><span>{nextInd.place.split(",")[0]} · {seats} seat{seats === 1 ? "" : "s"} left</span></> : <span>None scheduled</span>}
          </div>
        </div>
      </section>
      <div className="rc-mix">
        <Card title="Where applications come from" meta={all.length + " applications" + (camp === "all" ? " across both campaigns" : ", " + camp)} icon={I.link}>
          <Bars total={all.length} rows={Array.from(all.reduce((m, a) => m.set(a.source, (m.get(a.source) || 0) + 1), new Map<string, number>())).sort((x, y) => y[1] - x[1]).slice(0, 7).map(([k, n]) => ({ k, n, c: hueVar(k) }))} />
        </Card>
        <Card title="Where they live" meta="By province" icon={I.map}>
          <Bars total={all.length} rows={["Munster", "Dublin", "Leinster", "Connacht"].map((r) => ({ k: r, n: all.filter((a) => areaRegion(a.area) === r).length, c: regionVar(r) }))} />
        </Card>
        <Card title="By campaign" meta="Still in play, by step" icon={I.filter}>
          <div className="rc-camps">{(["Ryder Cup 2027", "Winter season"] as const).map((c) => { const l = s.ext.applicants.filter((a) => a.campaign === c && a.stage !== "withdrawn"); return (
            <div key={c} className="rc-campcard" style={{ ["--c" as any]: CAMP_HUE[c] }}>
              <span className="k"><i />{c}</span><b>{l.length}</b>
              <span className="seg">{ORDER.map((st) => { const n = l.filter((a) => a.stage === st).length; return <i key={st} title={SHORT[st] + ": " + n} style={{ flex: Math.max(n, 0.0001), opacity: 0.35 + ORDER.indexOf(st) * 0.13 }} />; })}</span>
              <span className="oss-tiny oss-dim">{l.filter((a) => a.stage === "active").length} active · {l.filter((a) => a.stage === "induction").length} booked on an induction</span>
            </div>); })}</div>
        </Card>
      </div>
      <div className={"oss-board rc-board" + (stage ? " one" : "")}>
        {shown.map((c) => (
          <div key={c.stage} className={"oss-lane " + (c.stage === "active" ? "ok" : c.stage === "docs" || c.stage === "inducted" ? "warn" : "")}>
            <h3><span className="oss-dot" />{c.label}<span className="n">{c.list.length}</span></h3>
            <div className={stage ? "rc-wide" : "rc-col"}>
              {c.list.slice(0, stage ? 60 : 7).map((a) => <ApplicantCard key={a.id} s={s} a={a} />)}
            </div>
            {!stage && c.list.length > 7 && <button className="rc-more" onClick={() => setStage(c.stage)}>+{c.list.length - 7} more</button>}
            {!c.list.length && <div className="empty">Nobody at this step</div>}
          </div>))}
      </div>
    </Page>
  );
}

/* ── inductions: session tickets ─────────────────────────────────────────── */
function Inductions({ s }: { s: OssState }) {
  const waiting = s.ext.applicants.filter((a) => a.stage === "screened");
  const total = s.ext.inductions.reduce((n, x) => n + x.capacity, 0);
  const taken = s.ext.inductions.reduce((n, x) => n + booked(s, x).length, 0);
  return (
    <Page eyebrow="Crew · inductions" title="Group inductions" sub="Two hours: OSS standards, health and safety, manual handling, the OSS Crew app, uniform sizes and right to work checks. Booked people get the details by text."
      actions={<span className="rc-seatsum"><b>{taken}</b> of {total} seats booked across {s.ext.inductions.length} sessions</span>}>
      <div className="oss-grid oss-g75" style={{ alignItems: "start" }}>
        <div className="rc-tickets">
          {s.ext.inductions.map((ind) => {
            const list = booked(s, ind);
            const full = list.length >= ind.capacity;
            const past = ms(ind.at) < ms(s.clock);
            return (
              <article key={ind.id} className={"rc-ticket" + (past ? " past" : "")}>
                <div className="stub">
                  <span className="dw">{fmtDate(ind.at).split(" ")[0]}</span>
                  <b>{fmtDate(ind.at).split(" ")[1]}</b>
                  <span className="mo">{fmtDate(ind.at).split(" ")[2] || "Nov"}</span>
                  <span className="tm">{fmtTime(ind.at)}</span>
                </div>
                <div className="body">
                  <div className="top">
                    <div className="grow">
                      <div className="kind">{ind.kind}</div>
                      <div className="oss-small oss-dim">{ind.place} · hosted by {s.users.find((u) => u.id === ind.host)?.name}</div>
                    </div>
                    <Ring value={list.length} max={ind.capacity} size={64} stroke={7} tone={full ? "warn" : "accent"} label={list.length + "/" + ind.capacity} sub={full ? "full" : "booked"} />
                  </div>
                  <div className="who">
                    {list.length ? <><Faces names={list.map((a) => a.name)} max={8} /><span className="oss-tiny oss-dim">{list.slice(0, 2).map((a) => a.name).join(", ")}{list.length > 2 ? " and " + (list.length - 2) + " more" : ""}</span></> : <span className="oss-small oss-muted">No one booked yet.</span>}
                  </div>
                  <div className="oss-tiny oss-muted">Bring photo ID, PPS number and proof of right to work.</div>
                </div>
              </article>);
          })}
        </div>
        <Card title="Screened, not yet booked" meta={waiting.length + " people waiting for a seat"} icon={I.users} flush>
          <div className="oss-rows">
            {waiting.map((a) => (
              <div key={a.id} className="oss-r">
                <Av name={a.name} size="sm" />
                <div className="main"><div className="t">{a.name}</div><div className="s">{a.roles.join(", ")} · {a.rtw.replace(" (student)", "")}</div></div>
                <div className="end"><select className="oss-input rc-book" value="" onChange={(e) => e.target.value && run(bookInduction, a.id, e.target.value)} aria-label={"Book " + a.name}>
                  <option value="">Book onto…</option>{s.ext.inductions.map((i) => <option key={i.id} value={i.id} disabled={booked(s, i).length >= i.capacity}>{fmtDate(i.at)} {fmtTime(i.at)}</option>)}</select></div>
              </div>))}
            {!waiting.length && <div className="oss-empty"><b>Everyone screened is booked</b>Phone-screen more applicants from the pipeline.</div>}
          </div>
        </Card>
      </div>
    </Page>
  );
}

/* ── Ryder Cup 2027 ──────────────────────────────────────────────────────── */
const PLAN: { m: string; need: number; what: string }[] = [
  { m: "Nov", need: 160, what: "Campaign live on Indeed, the OSS website and college jobs fairs. Limerick open day on 26 Nov" },
  { m: "Dec", need: 230, what: "Phone screens for every Munster applicant within a week" },
  { m: "Jan", need: 320, what: "Platform live for recruitment and inductions" },
  { m: "Feb", need: 410, what: "Monthly inductions in Limerick start" },
  { m: "Mar", need: 500, what: "Team leaders picked from current crew" },
  { m: "Apr", need: 580, what: "Accreditation photos collected" },
  { m: "May", need: 650, what: "Uniform sizes locked with the supplier" },
  { m: "Jun", need: 720, what: "Stamp 2 students move to 40 hours" },
  { m: "Jul", need: 790, what: "Shuttle buses from Limerick city booked" },
  { m: "Aug", need: 850, what: "Build-up crews rostered" },
  { m: "Sep", need: 850, what: "Tournament week" }
];
function Ryder({ s }: { s: OssState }) {
  const target = 850;
  const camp = s.ext.applicants.filter((a) => a.campaign === "Ryder Cup 2027");
  /* Cleared for Adare: active crew based in Munster, plus campaign recruits already active. */
  const base = s.workers.filter((w) => w.status === "active" && regionOfW(w) === "Munster").length;
  const stages = pipeline(s, "Ryder Cup 2027");
  const have = base + camp.filter((a) => a.stage === "active").length;
  const local = camp.filter((a) => ["Limerick", "Limerick city", "Adare", "Castletroy", "Raheen", "Annacotty", "Kilmallock", "Newcastle West"].includes(a.area)).length;
  const live = camp.filter((a) => a.stage !== "withdrawn");
  const reached = (st: ApplicantStage) => live.filter((a) => ORDER.indexOf(a.stage) >= ORDER.indexOf(st)).length;
  const max = target;
  return (
    <Page bare>
      <Hero eyebrow="Recruitment · Ryder Cup 2027, Adare Manor" title="Building the Ryder Cup crew" sub="800 to 900 people across build-up and tournament week, most of them based in Limerick and Munster. The plan works back from September."
        aside={<>
          <Ring value={have} max={target} size={150} stroke={13} label={have} sub={"of ~" + target + " cleared"} tone="ok" />
          <div className="rc-heroside">
            <Figure label="Still to recruit" value={Math.max(0, target - have)} sub={have >= PLAN[0].need ? "Ahead of the November target of " + PLAN[0].need : "Over the next 10 months"} tone="warn" />
            <Figure label="Campaign applicants" value={camp.length} sub={local + " local to Adare and Limerick"} />
          </div>
        </>} />
      <div className="oss-grid oss-g75" style={{ alignItems: "start" }}>
        <Card title="Recruitment plan" meta="Cleared crew needed by the end of each month" icon={I.chart} pad={false}>
          <div className="rc-plan">
            {PLAN.map((p, k) => {
              const h = (p.need / max) * 100;
              const got = k === 0 ? Math.min(p.need, have) : 0;
              return (
                <div key={p.m} className={"col" + (p.m === "Sep" ? " peak" : "") + (k === 0 ? " now" : "")}>
                  <span className="num">{p.need}</span>
                  <div className="bar" style={{ height: h + "%" }}><i style={{ height: (got / p.need) * 100 + "%" }} /></div>
                  <span className="lab">{p.m}</span>
                </div>);
            })}
          </div>
          <div className="oss-legend" style={{ padding: "4px 20px 18px" }}><span><i style={{ background: "var(--accent)" }} />Cleared now</span><span><i style={{ background: "var(--accent-soft)", outline: "1px dashed var(--accent-line)" }} />Still to recruit</span></div>
        </Card>
        <Card title="Campaign funnel" meta={live.length + " applicants still in play"} icon={I.filter}>
          <Funnel stages={stages.map((st) => ({ label: SHORT[st.stage], n: reached(st.stage), tone: st.stage === "active" ? "ok" : "accent" }))} />
        </Card>
      </div>
      <Card title="What has to be true, month by month" meta="From now to tournament week" icon={I.list}>
        <ol className="rc-road">
          {PLAN.map((p, k) => (
            <li key={p.m} className={k === 0 ? "now" : ""}>
              <span className="m">{p.m}</span>
              <span className="dot" />
              <span className="w">{p.what}</span>
              <span className="n">{p.need}</span>
            </li>))}
        </ol>
      </Card>
    </Page>
  );
}
