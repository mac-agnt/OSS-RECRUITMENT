import { lazy, Suspense } from "react";
import OpsApp from "./ops/OpsApp";

/* Two experiences share this bundle entry:
   - the simplified OSS events app (default), in src/ops;
   - the previous Pulse demo, kept unchanged at /advanced (or #advanced). */
const AdvancedApp = lazy(() => import("./advanced/AdvancedApp"));

const isAdvanced = () =>
  typeof window !== "undefined" && (window.location.pathname.startsWith("/advanced") || window.location.hash === "#advanced");

export default function App() {
  if (isAdvanced()) {
    return (
      <Suspense fallback={null}>
        <AdvancedApp />
      </Suspense>
    );
  }
  return <OpsApp />;
}
