/** Settings store: loads from the backend, applies theme/motion to <html>, persists with a debounce. */
import { create } from "zustand";
import * as api from "@/api";
import type { AppInfo, EngineId, MotionId, Settings, TexInfo, ThemeId } from "@/api/types";

export const DEFAULT_SETTINGS: Settings = {
  version: 3,
  theme: "paper",
  motion: "normal",
  engine: "pdflatex",
  texBinDir: null,
  shellEscape: false,
  synctex: true,
  compileOnSave: false,
  autosaveMs: 800,
  tooltips: true,
  tooltipDelayMs: 350,
  editor: {
    fontSize: 11,
    fontFamily: "SF Mono, Menlo, Consolas, monospace",
    lineWrap: true,
    lineNumbers: true,
    tabSize: 2,
    spellcheck: true,
    highlightActiveLine: true,
    bracketMatching: true,
    autoCloseBrackets: true,
    autocomplete: true,
  },
  ui: {
    sidebarCollapsed: false,
    sidebarWidth: 260,
    editorFraction: 0.5,
    sidebarSections: [0.5, 0.25, 0.25],
    sidebarFolded: [false, false, true],
    showArchived: false,
    pdfZoom: "width",
    problemsOpen: false,
    statusLine: true,
  },
};

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

interface SettingsState {
  settings: Settings;
  loaded: boolean;
  appInfo: AppInfo | null;
  load: () => Promise<void>;
  update: (patch: DeepPartial<Settings>) => void;
  setTheme: (theme: ThemeId) => void;
  setMotion: (motion: MotionId) => void;
  setEngine: (engine: EngineId) => void;
  setUi: (patch: Partial<Settings["ui"]>) => void;
  setEditor: (patch: Partial<Settings["editor"]>) => void;
  redetectTex: () => Promise<TexInfo | null>;
}

export function applyDocumentTheme(settings: Pick<Settings, "theme" | "motion">): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", settings.theme);
  document.documentElement.setAttribute("data-motion", settings.motion);
  try {
    localStorage.setItem("cohere.theme", settings.theme);
    localStorage.setItem("cohere.motion", settings.motion);
  } catch {
    /* private mode */
  }
}

/** Read the last theme before the backend answers, so the first paint is right. */
export function earlySettings(): Settings {
  const s = structuredClone(DEFAULT_SETTINGS);
  try {
    const t = localStorage.getItem("cohere.theme") as ThemeId | null;
    const m = localStorage.getItem("cohere.motion") as MotionId | null;
    if (t && ["paper", "mist", "ink", "graphite"].includes(t)) s.theme = t;
    if (m && ["off", "slow", "normal", "fast"].includes(m)) s.motion = m;
  } catch {
    /* ignore */
  }
  return s;
}

function merge(base: Settings, patch: DeepPartial<Settings>): Settings {
  return {
    ...base,
    ...(patch as Partial<Settings>),
    editor: { ...base.editor, ...(patch.editor ?? {}) },
    ui: { ...base.ui, ...(patch.ui ?? {}) } as Settings["ui"],
  };
}

let saveTimer: number | null = null;
function scheduleSave(get: () => SettingsState) {
  if (saveTimer) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    saveTimer = null;
    try {
      await api.settings.save(get().settings);
    } catch (e) {
      console.warn("settings save failed", e);
    }
  }, 350);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  settings: earlySettings(),
  loaded: false,
  appInfo: null,

  load: async () => {
    try {
      const [settings, appInfo] = await Promise.all([api.settings.get(), api.app.info()]);
      applyDocumentTheme(settings);
      set({ settings, appInfo, loaded: true });
    } catch (e) {
      console.warn("settings load failed; using defaults", e);
      applyDocumentTheme(get().settings);
      set({ loaded: true });
    }
  },

  update: (patch) => {
    const next = merge(get().settings, patch);
    applyDocumentTheme(next);
    set({ settings: next });
    scheduleSave(get);
  },

  setTheme: (theme) => get().update({ theme }),
  setMotion: (motion) => get().update({ motion }),
  setEngine: (engine) => get().update({ engine }),
  setUi: (patch) => get().update({ ui: patch }),
  setEditor: (patch) => get().update({ editor: patch }),

  redetectTex: async () => {
    try {
      const tex = await api.app.detectTex();
      const info = get().appInfo;
      if (info) set({ appInfo: { ...info, tex } });
      return tex;
    } catch {
      return null;
    }
  },
}));

/** Flush any pending settings save (called before the window closes). */
export async function flushSettings(): Promise<void> {
  if (saveTimer) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
    try {
      await api.settings.save(useSettingsStore.getState().settings);
    } catch {
      /* ignore */
    }
  }
}
