/** UI store: which view is showing, open dialogs, toasts. */
import { create } from "zustand";

export type View = "library" | "editor";
export type ToastKind = "ok" | "err" | "info";

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; run: () => void };
  timeout: number;
}

interface UiState {
  view: View;
  settingsOpen: boolean;
  settingsTab: "appearance" | "editor" | "compiler" | "about";
  paletteOpen: boolean;
  toasts: Toast[];
  setView: (view: View) => void;
  openSettings: (tab?: UiState["settingsTab"]) => void;
  closeSettings: () => void;
  setPalette: (open: boolean) => void;
  toast: (message: string, kind?: ToastKind, opts?: { action?: Toast["action"]; timeout?: number }) => number;
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

export const useUiStore = create<UiState>((set, get) => ({
  view: "library",
  settingsOpen: false,
  settingsTab: "appearance",
  paletteOpen: false,
  toasts: [],

  setView: (view) => set({ view }),
  openSettings: (tab) => set({ settingsOpen: true, settingsTab: tab ?? get().settingsTab }),
  closeSettings: () => set({ settingsOpen: false }),
  setPalette: (paletteOpen) => set({ paletteOpen }),

  toast: (message, kind = "info", opts) => {
    const id = ++toastSeq;
    const timeout = opts?.timeout ?? (kind === "err" ? 6000 : 3400);
    const toast: Toast = { id, kind, message, action: opts?.action, timeout };
    set({ toasts: [...get().toasts, toast].slice(-4) });
    if (timeout > 0) window.setTimeout(() => get().dismissToast(id), timeout);
    return id;
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (message: string, kind: ToastKind = "info", opts?: { action?: Toast["action"]; timeout?: number }) => useUiStore.getState().toast(message, kind, opts);

/** Normalise any thrown value into a toast-able message. */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Something went wrong";
}
