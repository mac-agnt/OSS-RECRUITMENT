import "./styles/ops.css";
import { Component, useEffect, type ReactNode } from "react";
import { go, useRoute } from "./router";
import { resetDemo, useOps } from "./store";
import { Toasts } from "./ui/kit";
import Shell from "./office/Shell";
import { PhoneFull } from "./phone/PhoneDock";

/** Keeps one broken screen from blanking the whole app; offers a way back. */
class Boundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  componentDidCatch(err: Error) { console.error(err); }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div className="o-page narrow"><div className="panel" style={{ padding: 24 }}>
        <h1>Something went wrong on this screen</h1>
        <p className="dim" style={{ margin: "8px 0 16px" }}>{this.state.err.message}</p>
        <div className="row wrap">
          <button className="btn primary" onClick={() => { this.setState({ err: null }); go("/today"); }}>Go to Today</button>
          <button className="btn" onClick={() => { resetDemo(); this.setState({ err: null }); go("/today"); }}>Reset demo data</button>
        </div>
      </div></div>
    );
  }
}

export default function OpsApp() {
  const s = useOps();
  const r = useRoute();
  useEffect(() => { if (r.path === "/") go("/today", { replace: true }); }, [r.path]);
  useEffect(() => { document.body.style.background = s.ui.theme === "dark" ? "#0c1319" : "#f5f6f8"; }, [s.ui.theme]);
  return (
    <div className="ops" data-theme={s.ui.theme}>
      <Boundary key={r.path}>{r.parts[0] === "m" ? <PhoneFull app={r.parts[1] === "supervisor" ? "supervisor" : "crew"} /> : <Shell />}</Boundary>
      <Toasts />
    </div>
  );
}
