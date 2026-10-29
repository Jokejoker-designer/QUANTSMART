import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { WorkspaceGate } from "./shell/WorkspaceGate.tsx";
import "./styles.css";
import "./owner.css";
import "./theme/tokens.css"; // loaded LAST → re-skins every page to the package navy/neon system
import "./pages/coefficients.css"; // shared research tables and numeric controls

import "./responsive.css";

const el = document.getElementById("root");
if (el) {
  createRoot(el).render(
    <React.StrictMode>
      <WorkspaceGate><App /></WorkspaceGate>
    </React.StrictMode>,
  );
}
