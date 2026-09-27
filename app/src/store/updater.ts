/**
 * Update flow. `checkAtLaunch` runs once, quietly: only an *available* update opens the dialog.
 * `checkNow` is the user asking (About tab, ⌘K) and always reports back — up to date, error, or offer.
 */
import { create } from "zustand";
import * as api from "@/api";
import { onUpdateProgress } from "@/api/events";
import type { UpdateCheck, UpdateProgress } from "@/api/types";
import { errorMessage } from "@/store/ui";

export type UpdateStatus = "idle" | "checking" | "upToDate" | "available" | "downloading" | "installing" | "restarting" | "error" | "disabled";

interface UpdaterState {
  status: UpdateStatus;
  check: UpdateCheck | null;
  progress: UpdateProgress | null;
  error: string | null;
  dialogOpen: boolean;
  /** Versions the user said "later" to, for this session only. */
  skipped: string[];
  lastCheckedAt: number | null;
  checkAtLaunch: () => Promise<void>;
  checkNow: () => Promise<void>;
  install: () => Promise<void>;
  openDialog: () => void;
  later: () => void;
}

let progressBound = false;
async function bindProgress(set: (p: Partial<UpdaterState>) => void) {
  if (progressBound) return;
  progressBound = true;
  await onUpdateProgress((p) => {
    set({ progress: p, status: p.phase });
  });
}

async function runCheck(set: (p: Partial<UpdaterState>) => void, get: () => UpdaterState, quiet: boolean): Promise<UpdateCheck | null> {
  if (get().status === "checking" || get().status === "downloading" || get().status === "installing") return null;
  set({ status: "checking", error: null });
  try {
    const check = await api.app.checkUpdate();
    set({ check, lastCheckedAt: Date.now() });
    if (check.disabled) {
      set({ status: "disabled" });
      return check;
    }
    if (check.available) {
      const show = !quiet || !get().skipped.includes(check.version ?? "");
      set({ status: "available", dialogOpen: show || get().dialogOpen });
    } else {
      set({ status: "upToDate" });
    }
    return check;
  } catch (e) {
    set({ status: "error", error: errorMessage(e) });
    return null;
  }
}

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  status: "idle",
  check: null,
  progress: null,
  error: null,
  dialogOpen: false,
  skipped: [],
  lastCheckedAt: null,

  checkAtLaunch: async () => {
    await runCheck(set, get, true);
  },

  checkNow: async () => {
    const check = await runCheck(set, get, false);
    if (check?.available) set({ dialogOpen: true });
  },

  install: async () => {
    if (get().status !== "available") return;
    await bindProgress(set);
    set({ status: "downloading", progress: { phase: "downloading", downloaded: 0, total: null }, error: null, dialogOpen: true });
    try {
      await api.app.installUpdate();
      // The backend relaunches ~400 ms after this resolves; keep the final state on screen.
      set({ status: "restarting" });
    } catch (e) {
      set({ status: "error", error: errorMessage(e), progress: null });
    }
  },

  openDialog: () => set({ dialogOpen: true }),

  later: () => {
    const v = get().check?.version;
    set({ dialogOpen: false, skipped: v ? [...new Set([...get().skipped, v])] : get().skipped });
  },
}));

/** Human line for the About tab. */
export function updateStatusLabel(s: Pick<UpdaterState, "status" | "check" | "error" | "lastCheckedAt">): string {
  switch (s.status) {
    case "idle":
      return "not checked yet";
    case "checking":
      return "checking…";
    case "upToDate":
      return "up to date";
    case "available":
      return `version ${s.check?.version ?? "?"} is available`;
    case "downloading":
      return "downloading…";
    case "installing":
      return "installing…";
    case "restarting":
      return "relaunching…";
    case "disabled":
      return s.check?.disabled ? `checks are off in this ${s.check.disabled}` : "checks are off";
    case "error":
      return s.error ?? "check failed";
  }
}
