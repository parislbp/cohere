/** "Install TeX for Cohere": drives the backend installer and mirrors its event stream. */
import { create } from "zustand";
import * as api from "@/api";
import { onTexInstall } from "@/api/events";
import type { TexInstallEvent, TexInstallPhase } from "@/api/types";
import { errorMessage } from "@/store/ui";
import { useSettingsStore } from "@/store/settings";

export const PHASES: { id: TexInstallPhase; label: string; hint: string }[] = [
  { id: "download", label: "download", hint: "install-tl from the CTAN mirror network (≈ 6 MB)" },
  { id: "install", label: "core", hint: "TeX Live scheme-basic (≈ 100 MB, the long step)" },
  { id: "packages", label: "packages", hint: "only what Cohere's templates use" },
  { id: "verify", label: "verify", hint: "latexmk compiles a probe document" },
];

interface TexInstallState {
  open: boolean;
  running: boolean;
  phase: TexInstallPhase | null;
  progress: number | null;
  line: string | null;
  log: string[];
  error: string | null;
  binDir: string | null;
  openDialog: () => void;
  closeDialog: () => void;
  start: () => Promise<void>;
  cancel: () => Promise<void>;
  reset: () => void;
}

let bound = false;
async function bind(apply: (e: TexInstallEvent) => void) {
  if (bound) return;
  bound = true;
  await onTexInstall(apply);
}

export const useTexInstallStore = create<TexInstallState>((set, get) => ({
  open: false,
  running: false,
  phase: null,
  progress: null,
  line: null,
  log: [],
  error: null,
  binDir: null,

  openDialog: () => set({ open: true }),
  closeDialog: () => {
    if (!get().running) set({ open: false });
    else set({ open: false }); // keeps running in the background; the dialog can be reopened from Settings
  },

  start: async () => {
    if (get().running) return;
    await bind((e) => {
      const st = get();
      const log = e.line ? [...st.log, e.line].slice(-400) : st.log;
      const patch: Partial<TexInstallState> = { log, line: e.line ?? st.line };
      if (e.phase === "done") {
        Object.assign(patch, { running: false, phase: "done", progress: 1, binDir: e.binDir, error: null });
        void useSettingsStore.getState().redetectTex();
      } else if (e.phase === "error" || e.phase === "cancelled") {
        Object.assign(patch, { running: false, phase: e.phase, error: e.line, progress: null });
        void useSettingsStore.getState().redetectTex();
      } else {
        Object.assign(patch, { phase: e.phase, progress: e.progress ?? (e.phase !== st.phase ? 0 : st.progress) });
      }
      set(patch);
    });
    set({ running: true, open: true, phase: "download", progress: 0, line: null, log: [], error: null, binDir: null });
    try {
      await api.tex.install();
    } catch (e) {
      set({ running: false, phase: "error", error: errorMessage(e) });
    }
  },

  cancel: async () => {
    try {
      await api.tex.cancelInstall();
    } catch {
      /* the run may have just finished */
    }
  },

  reset: () => set({ phase: null, progress: null, line: null, log: [], error: null, binDir: null }),
}));
