import { useEffect, useState } from "react";
import Dashboard from "./pages/Dashboard";
import Wizard from "./pages/Wizard";
import Settings from "./pages/Settings";

type Page = "dashboard" | "settings";

export default function App(): React.ReactElement {
  const [page, setPage] = useState<Page>("dashboard");
  const [wizardDone, setWizardDone] = useState<boolean | null>(null);

  useEffect(() => {
    window.companion.getSettings().then((s) => {
      setWizardDone(s.wizardComplete);
    });
  }, []);

  if (wizardDone === null) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        <div style={{ color: "#555" }}>Loading…</div>
      </div>
    );
  }

  if (!wizardDone) {
    return (
      <Wizard
        onComplete={() => {
          window.companion.setSettings({ wizardComplete: true });
          setWizardDone(true);
        }}
      />
    );
  }

  if (page === "settings") {
    return <Settings onBack={() => setPage("dashboard")} />;
  }

  return <Dashboard onOpenSettings={() => setPage("settings")} />;
}
