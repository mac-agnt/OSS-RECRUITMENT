/* The previous Pulse-based OSS demo, kept intact as the advanced experience.
   Loaded only at /advanced (or #advanced), so the default app never pulls in its
   code, data or styles. */

import "../styles/base.css";
import "../styles/pulse.css";
import "../styles/interactions.css";
import "../styles/oss.css";
import "../styles/mobile.css";
import { LogicHost } from "../runtime/logic";
import PulseLogic from "../logic/PulseLogic";
import AppShell from "../views/AppShell";

/* ── Backgrounds: change these per client ──────────────────────────────────
   Any CSS colour works (#hex, rgb(), oklch()). One colour each; the shading
   is worked out for you. */
const config = {
  /** Abstract background behind the Dashboard's KPI band. Hidden in the light theme. */
  dashboardBackdrop: "#064B68",
  /** Show the Dashboard background at all. */
  kpiBackdropOn: true,
  /** Wash behind the Records hero (Files and Contacts) and the New record dialog.
      Leave as "" to use the current theme's own gradient. */
  recordsBackdrop: "",
};

export default function AdvancedApp() {
  return <LogicHost logic={PulseLogic} view={AppShell} props={config} />;
}
