import { useState } from "react";
import type { OssState } from "../model";
import * as E from "../engine";
import * as Q from "../selectors";
import { navigate, run, useOss } from "../store";
import { tabOf } from "../modules";
import { Btn, Card, Empty, I, Page, S, Seg, St, Table } from "../ui/kit";
import { when } from "../ui/fmt";
import AgentFace from "../../components/AgentFace";

export default function Agents() {
  const s = useOss();
  const tab = tabOf(s, "Agents");
  if (tab === "runs") return <Runs s={s} />;
  if (tab === "approvals") return <Proposals s={s} />;
  return <AgentList s={s} />;
}

const agentName = (id: string) => E.AGENTS.find((a) => a.id === id)?.name || id;
const lastRun = (s: OssState, id: string) => s.agentRuns.filter((r) => r.agentId === id).pop();

function AgentList({ s }: { s: OssState }) {
  const [sel, setSel] = useState("briefing");
  const a = E.AGENTS.find((x) => x.id === sel)!;
  const r = lastRun(s, sel);
  const pend = s.proposals.filter((p) => p.agentId === sel && p.status === "pending");
  const paused = !!s.agentsPaused[sel];
  return (
    <Page title="Agents" sub="Seven operational helpers. They read the shared records and propose; people decide invitations, document approval, clock corrections and hour approval. Outputs are deterministic demo logic, not model calls.">
      <div className="oss-grid oss-side-main" style={{ alignItems: "start", gridTemplateColumns: "320px minmax(0,1fr)" }}>
        <Card pad={false}>
          <div className="oss-list" style={{ padding: "4px 0" }}>
            {E.AGENTS.map((x) => { const lr = lastRun(s, x.id); const np = s.proposals.filter((p) => p.agentId === x.id && p.status === "pending").length; return (
              <button key={x.id} className="oss-attn" style={{ padding: "10px 14px", alignItems: "center", background: sel === x.id ? "var(--accent-faint)" : undefined }} onClick={() => setSel(x.id)} aria-pressed={sel === x.id}>
                <AgentFace shape={x.shape} state={s.agentsPaused[x.id] ? "idle" : np ? "waiting" : "complete"} tint={x.tint} size="34" />
                <span style={{ flex: 1, minWidth: 0 }}><div className="t">{x.name}</div><div className="s">{lr ? "Last run " + when(lr.at) : "Not run"}{np ? " · " + np + " waiting" : ""}</div></span>
              </button>); })}
          </div>
        </Card>
        <div style={{ display: "grid", gap: 14 }}>
          <Card title={<span style={{ display: "flex", alignItems: "center", gap: 10 }}><AgentFace shape={a.shape} state={paused ? "idle" : "working"} tint={a.tint} size="30" />{a.name}</span>}
            right={<><St tone={paused ? "neutral" : "ok"}>{paused ? "Paused" : "Enabled"}</St><Btn kind="primary" icon={I.play} disabled={paused} onClick={() => run(E.runAgent, sel)}>Run now</Btn></>}>
            <div className="oss-small" style={{ lineHeight: 1.6 }}>{a.job}</div>
            <div className="oss-kv" style={{ marginTop: 12 }}>
              <div><div className="k">Reads</div><div className="v">{a.inputs}</div></div>
              <div><div className="k">Scope</div><div className="v">{a.scope}</div></div>
              <div><div className="k">Last run</div><div className="v">{r ? when(r.at) + " · " + (r.trigger === "run_now" ? "on request" : "scheduled (seeded)") : "Never"}</div></div>
            </div>
          </Card>
          <Card title="Current findings" meta={r ? "From the run at " + when(r.at) : undefined}>
            {r ? <>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }} className="oss-small">{r.findings.map((f, i) => <li key={i}>{f}</li>)}</ul>
              <div className="oss-pills" style={{ marginTop: 12 }}>{r.evidence.map((e, i) => <button key={i} className="oss-btn sm" onClick={() => navigate(e.page, e.tab, e.focus ? { kind: "event", id: e.focus } : undefined)}>Evidence: {e.label}</button>)}</div>
              {r.trigger !== "run_now" && <div className="oss-small oss-muted" style={{ marginTop: 10 }}>Seeded run from earlier today. Press Run now to recompute from the current records.</div>}
            </> : <Empty title="No runs yet" />}
          </Card>
          <Card title="Proposed actions" pad={false}>
            <Table rows={pend} rowKey={(p) => p.id} empty={<Empty title="Nothing waiting for a decision" />}
              cols={[{ key: "t", label: "Proposal", render: (p) => <span><span className="strong">{p.title}</span><div className="oss-tiny oss-muted" style={{ marginTop: 3 }}>{p.detail}</div></span> },
                { key: "a", label: "", render: (p) => <span style={{ display: "flex", gap: 6 }}><Btn size="sm" kind="primary" onClick={() => run(E.decideProposal, p.id, true)}>Approve</Btn><Btn size="sm" onClick={() => run(E.decideProposal, p.id, false)}>Dismiss</Btn></span> }]} />
          </Card>
        </div>
      </div>
    </Page>
  );
}

function Runs({ s }: { s: OssState }) {
  const [f, setF] = useState("all");
  const runs = s.agentRuns.filter((r) => f === "all" || r.agentId === f).slice().reverse();
  return (
    <Page title="Run history" sub="Every run, its findings and the records it pointed at.">
      <Card pad={false} title={<Seg value={f} onChange={setF} options={[{ id: "all", label: "All" }].concat(E.AGENTS.map((a) => ({ id: a.id, label: a.name })))} />}>
        <Table rows={runs} rowKey={(r) => r.id}
          cols={[{ key: "w", label: "When", nowrap: true, render: (r) => when(r.at) }, { key: "a", label: "Agent", render: (r) => agentName(r.agentId) },
            { key: "t", label: "Trigger", render: (r) => r.trigger === "run_now" ? "On request" : "Scheduled" },
            { key: "f", label: "Findings", render: (r) => <span className="oss-small">{r.findings.slice(0, 3).join(" ")}{r.findings.length > 3 ? " (+" + (r.findings.length - 3) + ")" : ""}</span> },
            { key: "p", label: "Proposals", num: true, render: (r) => r.proposalIds.length || "—" }]} />
      </Card>
    </Page>
  );
}

function Proposals({ s }: { s: OssState }) {
  const [f, setF] = useState<"pending" | "approved" | "dismissed">("pending");
  const list = s.proposals.filter((p) => p.status === f).slice().reverse();
  return (
    <Page title="Approvals" sub="Agent proposals waiting for a person. Approving runs the same action, with the same permission checks, as doing it by hand.">
      <Card pad={false} title={<Seg value={f} onChange={setF} options={[{ id: "pending", label: "Pending", n: s.proposals.filter((p) => p.status === "pending").length }, { id: "approved", label: "Approved", n: s.proposals.filter((p) => p.status === "approved").length }, { id: "dismissed", label: "Dismissed", n: s.proposals.filter((p) => p.status === "dismissed").length }]} />}>
        <Table rows={list} rowKey={(p) => p.id} empty={<Empty title="Nothing here" />}
          cols={[{ key: "a", label: "Agent", render: (p) => agentName(p.agentId) }, { key: "t", label: "Proposal", render: (p) => <span><span className="strong">{p.title}</span><div className="oss-tiny oss-muted">{p.detail}</div></span> },
            { key: "w", label: "Proposed", nowrap: true, render: (p) => when(p.at) },
            { key: "d", label: "Decision", render: (p) => p.status === "pending" ? <span style={{ display: "flex", gap: 6 }}><Btn size="sm" kind="primary" onClick={() => run(E.decideProposal, p.id, true)}>Approve</Btn><Btn size="sm" onClick={() => run(E.decideProposal, p.id, false)}>Dismiss</Btn></span>
              : <span className="oss-small"><S s={p.status === "approved" ? "Approved" : "Withdrawn"} /><div className="oss-tiny oss-muted">{Q.nameOf(s, p.decidedBy!)} · {when(p.decidedAt)}{p.result ? " · " + p.result : ""}</div></span> }]} />
      </Card>
    </Page>
  );
}
