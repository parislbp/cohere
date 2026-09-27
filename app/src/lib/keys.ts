/** Keyboard shortcut helpers. Shortcuts are written as "Mod-Shift-Enter" (Mod = ⌘ on macOS). */

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export interface Shortcut {
  key: string;
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
}

export function parseShortcut(spec: string): Shortcut {
  const parts = spec.split("-");
  const key = parts.pop() ?? "";
  const s: Shortcut = { key: key.length === 1 ? key.toLowerCase() : key };
  for (const p of parts) {
    const m = p.toLowerCase();
    if (m === "mod" || m === "cmd" || m === "meta") s.mod = true;
    else if (m === "shift") s.shift = true;
    else if (m === "alt" || m === "option") s.alt = true;
    else if (m === "ctrl" || m === "control") s.ctrl = true;
  }
  return s;
}

export function matchesShortcut(e: KeyboardEvent | React.KeyboardEvent, spec: string): boolean {
  const s = parseShortcut(spec);
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const modPressed = isMac ? e.metaKey : e.ctrlKey;
  if (key !== s.key) return false;
  if (!!s.mod !== modPressed) return false;
  if (!!s.shift !== e.shiftKey) return false;
  if (!!s.alt !== e.altKey) return false;
  if (s.ctrl !== undefined && !!s.ctrl !== e.ctrlKey) return false;
  return true;
}

/** Human-readable glyphs for the kbd chip: "Mod-Shift-Enter" → "⌘⇧↩". */
export function shortcutLabel(spec: string): string {
  const s = parseShortcut(spec);
  const out: string[] = [];
  if (s.ctrl) out.push("⌃");
  if (s.alt) out.push(isMac ? "⌥" : "Alt+");
  if (s.shift) out.push("⇧");
  if (s.mod) out.push(isMac ? "⌘" : "Ctrl+");
  const names: Record<string, string> = { Enter: "↩", Escape: "⎋", Backspace: "⌫", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Tab: "⇥", " ": "␣", ",": "," };
  out.push(names[s.key] ?? s.key.toUpperCase());
  return out.join("");
}

export const SHORTCUTS = {
  compile: "Mod-Shift-Enter",
  save: "Mod-s",
  sidebar: "Mod-1",
  sidebarArrow: "Alt-ArrowLeft",
  bold: "Mod-b",
  italic: "Mod-i",
  underline: "Mod-u",
  code: "Mod-Shift-c",
  gutter: "Mod-Shift-g",
  fontUp: "Mod-Alt-=",
  fontDown: "Mod-Alt--",
  settings: "Mod-,",
  library: "Mod-Shift-h",
  libraryAlt: "Mod-Shift-l",
  statusLine: "Mod-Shift-ArrowDown",
  statusLineAlt: "Alt-ArrowDown",
  problems: "Mod-Shift-m",
  find: "Mod-f",
  newFile: "Mod-n",
  closeTab: "Mod-w",
  nextTab: "Mod-Alt-ArrowRight",
  prevTab: "Mod-Alt-ArrowLeft",
  zoomIn: "Mod-=",
  zoomOut: "Mod--",
  outlineScope: "Mod-Shift-0",
  palette: "Mod-k",
} as const;
