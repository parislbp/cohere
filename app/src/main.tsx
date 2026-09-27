import React from "react";
import ReactDOM from "react-dom/client";
import "./design/index.css";
import { App } from "./App";
import { applyDocumentTheme, earlySettings } from "./store/settings";

applyDocumentTheme(earlySettings());

async function boot() {
  const wantMock = import.meta.env.VITE_MOCK_BACKEND === "1" || new URLSearchParams(location.search).has("mock");
  const hasTauri = "__TAURI_INTERNALS__" in window;
  if (wantMock || !hasTauri) {
    const { installMockBackend } = await import("./api/mock/installMock");
    installMockBackend();
    document.documentElement.setAttribute("data-mock", "1");
  }
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void boot();
