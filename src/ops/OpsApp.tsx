import "./styles/ops.css";
import { useEffect } from "react";
import { go, useRoute } from "./router";
import { useOps } from "./store";
import { Toasts } from "./ui/kit";
import Shell from "./office/Shell";
import { PhoneFull } from "./phone/PhoneDock";

export default function OpsApp() {
  const s = useOps();
  const r = useRoute();
  useEffect(() => { if (r.path === "/") go("/today", { replace: true }); }, [r.path]);
  useEffect(() => { document.body.style.background = s.ui.theme === "dark" ? "#0c1319" : "#f5f6f8"; }, [s.ui.theme]);
  return (
    <div className="ops" data-theme={s.ui.theme}>
      {r.parts[0] === "m" ? <PhoneFull app={r.parts[1] === "supervisor" ? "supervisor" : "crew"} /> : <Shell />}
      <Toasts />
    </div>
  );
}
