/// <reference types="vite/client" />
/**
 * Route every `invoke()` through the in-memory backend so the app runs in a plain browser
 * (`npm run dev:mock`, or any URL with `?mock=1`) and under Playwright.
 */
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { MockBackend, type MockOptions } from "./mockBackend";
import { isRecord } from "./util";

declare global {
  interface Window {
    /** The live mock instance, for e2e tests to inspect and prod. */
    __COHERE_MOCK__?: MockBackend;
  }
}

export function installMockBackend(options: MockOptions = {}): MockBackend {
  const backend = new MockBackend(options);
  mockWindows("main");
  mockIPC(async (cmd, payload) => backend.handle(cmd, isRecord(payload) ? payload : {}));
  window.__COHERE_MOCK__ = backend;
  return backend;
}

export function isMockBackendRequested(): boolean {
  if (import.meta.env.VITE_MOCK_BACKEND === "1") return true;
  if (typeof location === "undefined") return false;
  return new URLSearchParams(location.search).get("mock") === "1";
}
