/**
 * The command registry behind ⌘K. Commands are plain data with a `run`; the list is built per
 * open (so it reflects the current view, project and settings) and filtered with a small fuzzy match.
 */
import { MOTIONS, THEMES, type MotionId, type ThemeId } from "@/api/types";
import type { IconName } from "@/components/icons";
import { SHORTCUTS } from "@/lib/keys";
import { useLibraryStore } from "@/store/library";
import { useProjectStore } from "@/store/project";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";
import { goToLibrary } from "@/App";

export type CommandGroup = "navigate" | "project" | "editor" | "view" | "appearance" | "settings";

export interface Command {
  id: string;
  title: string;
  group: CommandGroup;
  icon?: IconName;
  /** Shortcut spec ("Mod-Shift-Enter") shown as a kbd chip. */
  kbd?: string;
  /** Extra words that should match but are not shown. */
  keywords?: string;
  /** Current state for toggles, shown as a small suffix. */
  state?: string;
  run: () => unknown;
}

export const GROUP_LABEL: Record<CommandGroup, string> = {
  navigate: "navigate",
  project: "project",
  editor: "editor",
  view: "view",
  appearance: "appearance",
  settings: "settings",
};

/** Build the command list for the current app state. */
export function buildCommands(): Command[] {
  const ui = useUiStore.getState();
  const settings = useSettingsStore.getState();
  const s = settings.settings;
  const proj = useProjectStore.getState();
  const inEditor = ui.view === "editor" && !!proj.projectId;
  const cmds: Command[] = [];

  // ── navigate ──
  if (inEditor) cmds.push({ id: "nav.library", title: "Back to the Library", group: "navigate", icon: "home", kbd: SHORTCUTS.library, run: () => void goToLibrary() });
  cmds.push({ id: "nav.settings", title: "Open Settings", group: "navigate", icon: "settings", kbd: SHORTCUTS.settings, run: () => ui.openSettings() });
  cmds.push({ id: "nav.settings.compiler", title: "Settings › Compiler", group: "navigate", icon: "compile", keywords: "engine tex latexmk", run: () => ui.openSettings("compiler") });
  cmds.push({ id: "nav.settings.editor", title: "Settings › Editor", group: "navigate", icon: "cursorText", keywords: "font wrap spellcheck autosave", run: () => ui.openSettings("editor") });
  if (!inEditor) cmds.push({ id: "lib.new", title: "New project", group: "project", icon: "plus", kbd: SHORTCUTS.newFile, keywords: "create template", run: () => window.dispatchEvent(new CustomEvent("cohere:new-project")) });
  if (!inEditor) cmds.push({ id: "lib.search", title: "Search the Library", group: "navigate", icon: "search", kbd: SHORTCUTS.find, run: () => useLibraryStore.getState().toggleSearch(true) });
  if (!inEditor) {
    const lib = useLibraryStore.getState();
    cmds.push({ id: "lib.archived", title: lib.showArchived ? "Show active projects" : "Show archived projects", group: "view", icon: "archive", run: () => lib.setShowArchived(!lib.showArchived) });
    cmds.push({ id: "lib.fav", title: "Cycle favourites filter", group: "view", icon: "star", state: lib.favFilter, run: () => lib.cycleFavFilter() });
  }

  // ── project / editor ──
  if (inEditor) {
    cmds.push({ id: "proj.compile", title: proj.compileStatus === "running" ? "Stop compiling" : "Compile", group: "project", icon: proj.compileStatus === "running" ? "stop" : "compile", kbd: SHORTCUTS.compile, keywords: "build latexmk pdf", run: () => (proj.compileStatus === "running" ? proj.cancelCompile() : proj.compile()) });
    cmds.push({ id: "proj.save", title: "Save all files", group: "project", icon: "check", kbd: SHORTCUTS.save, run: () => proj.saveAll() });
    cmds.push({ id: "proj.version", title: "New version (snapshot)", group: "project", icon: "snapshot", keywords: "archive freeze", run: () => window.dispatchEvent(new CustomEvent("cohere:new-version")) });
    cmds.push({ id: "proj.newfile", title: "New file", group: "project", icon: "newFile", keywords: "create tex", run: () => window.dispatchEvent(new CustomEvent("cohere:new-file")) });
    cmds.push({ id: "proj.newfolder", title: "New folder", group: "project", icon: "newFolder", run: () => window.dispatchEvent(new CustomEvent("cohere:new-folder")) });
    cmds.push({ id: "proj.addfiles", title: "Add files…", group: "project", icon: "upload", keywords: "import upload image", run: () => window.dispatchEvent(new CustomEvent("cohere:add-files")) });
    cmds.push({ id: "proj.reveal", title: "Reveal project in Finder", group: "project", icon: "external", keywords: "folder open path", run: () => window.dispatchEvent(new CustomEvent("cohere:reveal")) });
    cmds.push({ id: "proj.exportzip", title: "Export project as .zip", group: "project", icon: "downloadZip", keywords: "bundle download", run: () => window.dispatchEvent(new CustomEvent("cohere:export-zip")) });
    cmds.push({ id: "proj.exportpdf", title: "Export PDF", group: "project", icon: "downloadPdf", keywords: "download", run: () => window.dispatchEvent(new CustomEvent("cohere:export-pdf")) });
    cmds.push({ id: "proj.log", title: "Show compile log", group: "project", icon: "log", run: () => window.dispatchEvent(new CustomEvent("cohere:show-log")) });

    cmds.push({ id: "ed.bold", title: "Bold (\\textbf)", group: "editor", kbd: SHORTCUTS.bold, run: () => window.dispatchEvent(new CustomEvent("cohere:format", { detail: "textbf" })) });
    cmds.push({ id: "ed.emph", title: "Emphasis (\\emph)", group: "editor", kbd: SHORTCUTS.italic, keywords: "italic", run: () => window.dispatchEvent(new CustomEvent("cohere:format", { detail: "emph" })) });
    cmds.push({ id: "ed.underline", title: "Underline", group: "editor", kbd: SHORTCUTS.underline, run: () => window.dispatchEvent(new CustomEvent("cohere:format", { detail: "underline" })) });
    cmds.push({ id: "ed.code", title: "Code (\\code)", group: "editor", kbd: SHORTCUTS.code, keywords: "monospace texttt", run: () => window.dispatchEvent(new CustomEvent("cohere:format", { detail: "code" })) });
    cmds.push({ id: "ed.fontup", title: "Larger editor text", group: "editor", icon: "zoomIn", kbd: SHORTCUTS.fontUp, run: () => settings.setEditor({ fontSize: Math.min(32, s.editor.fontSize + 1) }) });
    cmds.push({ id: "ed.fontdown", title: "Smaller editor text", group: "editor", icon: "zoomOut", kbd: SHORTCUTS.fontDown, run: () => settings.setEditor({ fontSize: Math.max(9, s.editor.fontSize - 1) }) });
    cmds.push({ id: "ed.gutter", title: "Toggle line numbers", group: "editor", icon: "hash", kbd: SHORTCUTS.gutter, state: s.editor.lineNumbers ? "on" : "off", run: () => settings.setEditor({ lineNumbers: !s.editor.lineNumbers }) });
    cmds.push({ id: "ed.wrap", title: "Toggle line wrapping", group: "editor", icon: "textWrap", state: s.editor.lineWrap ? "on" : "off", run: () => settings.setEditor({ lineWrap: !s.editor.lineWrap }) });
    cmds.push({ id: "ed.spell", title: "Toggle spell check", group: "editor", state: s.editor.spellcheck ? "on" : "off", run: () => settings.setEditor({ spellcheck: !s.editor.spellcheck }) });

    cmds.push({ id: "view.sidebar", title: s.ui.sidebarCollapsed ? "Show sidebar" : "Hide sidebar", group: "view", icon: s.ui.sidebarCollapsed ? "panelLeftExpand" : "panelLeftCollapse", kbd: SHORTCUTS.sidebar, run: () => settings.setUi({ sidebarCollapsed: !s.ui.sidebarCollapsed }) });
    cmds.push({ id: "view.outline", title: proj.outlineScope === "project" ? "Outline: this file only" : "Outline: whole document", group: "view", icon: "book", kbd: SHORTCUTS.outlineScope, keywords: "toc sections", run: () => proj.toggleOutlineScope() });
    cmds.push({ id: "view.problems", title: s.ui.problemsOpen ? "Hide problems" : "Show problems", group: "view", icon: "warning", kbd: SHORTCUTS.problems, keywords: "errors warnings log", run: () => settings.setUi({ problemsOpen: !s.ui.problemsOpen }) });
    cmds.push({ id: "view.status", title: s.ui.statusLine ? "Hide status line" : "Show status line", group: "view", kbd: SHORTCUTS.statusLine, run: () => settings.setUi({ statusLine: !s.ui.statusLine }) });
    const names = ["files", "outline", "outputs"] as const;
    names.forEach((n, i) => cmds.push({ id: `view.fold.${n}`, title: `${s.ui.sidebarFolded[i] ? "Show" : "Fold"} ${n} section`, group: "view", icon: "chevronDown", run: () => { const f = [...s.ui.sidebarFolded] as [boolean, boolean, boolean]; f[i] = !f[i]; if (!f.every(Boolean)) settings.setUi({ sidebarFolded: f }); } }));
  }

  // ── appearance ──
  for (const t of THEMES) cmds.push({ id: `theme.${t.id}`, title: `Theme: ${t.name}`, group: "appearance", icon: t.mode === "dark" ? "moon" : "sun", keywords: `${t.mode} ${t.blurb}`, state: s.theme === t.id ? "current" : undefined, run: () => settings.setTheme(t.id as ThemeId) });
  for (const m of MOTIONS) cmds.push({ id: `motion.${m.id}`, title: `Animation: ${m.name}`, group: "appearance", icon: "motion", state: s.motion === m.id ? "current" : undefined, run: () => settings.setMotion(m.id as MotionId) });
  cmds.push({ id: "tips", title: s.tooltips ? "Turn tooltips off" : "Turn tooltips on", group: "settings", icon: "info", run: () => settings.update({ tooltips: !s.tooltips }) });
  cmds.push({ id: "engine.next", title: "Switch engine", group: "settings", icon: "compile", state: s.engine, keywords: "pdflatex xelatex lualatex", run: () => { const order = ["pdflatex", "xelatex", "lualatex"] as const; settings.setEngine(order[(order.indexOf(s.engine) + 1) % order.length]); } });
  const order: CommandGroup[] = ["navigate", "project", "editor", "view", "appearance", "settings"];
  return cmds
    .map((c, i) => ({ c, i }))
    .sort((a, b) => order.indexOf(a.c.group) - order.indexOf(b.c.group) || a.i - b.i)
    .map(({ c }) => c);
}

/**
 * Fuzzy match: every query character must appear in order; contiguous runs, word starts and
 * matches at the beginning score higher. Returns null when the query does not match.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase().replace(/\s+/g, "");
  if (!q) return 0;
  const t = text.toLowerCase();
  let ti = 0;
  let score = 0;
  let streak = 0;
  for (const ch of q) {
    const at = t.indexOf(ch, ti);
    if (at < 0) return null;
    const wordStart = at === 0 || /[\s\W_]/.test(t[at - 1]!);
    score += (at === ti && ti > 0 ? 6 + streak : 0) + (wordStart ? 8 : 1) - Math.min(at - ti, 20) * 0.25;
    streak = at === ti ? streak + 1 : 0;
    ti = at + 1;
  }
  if (t.startsWith(q)) score += 30;
  else if (t.includes(q)) score += 12;
  return score - t.length * 0.02;
}

export function filterCommands(cmds: Command[], query: string): Command[] {
  const q = query.trim();
  if (!q) return cmds;
  return cmds
    .map((c) => ({ c, s: Math.max(fuzzyScore(q, c.title) ?? -Infinity, (fuzzyScore(q, `${c.title} ${c.keywords ?? ""} ${GROUP_LABEL[c.group]}`) ?? -Infinity) - 4) }))
    .filter((x) => x.s > -Infinity)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.c);
}
