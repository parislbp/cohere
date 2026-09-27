/**
 * TypeScript mirror of the Rust types in src-tauri/src (serde camelCase).
 * Keep the two in step: a field added in Rust is added here and vice versa.
 */

export type ThemeId = "paper" | "mist" | "ink" | "graphite";
export type MotionId = "off" | "slow" | "normal" | "fast";
export type EngineId = "pdflatex" | "xelatex" | "lualatex";

export interface EditorSettings {
  fontSize: number;
  fontFamily: string;
  lineWrap: boolean;
  lineNumbers: boolean;
  tabSize: number;
  spellcheck: boolean;
  highlightActiveLine: boolean;
  bracketMatching: boolean;
  autoCloseBrackets: boolean;
  autocomplete: boolean;
}

export interface UiSettings {
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  editorFraction: number;
  sidebarSections: [number, number, number];
  sidebarFolded: [boolean, boolean, boolean];
  showArchived: boolean;
  pdfZoom: string;
  problemsOpen: boolean;
  statusLine: boolean;
}

export interface Settings {
  version: number;
  theme: ThemeId;
  motion: MotionId;
  engine: EngineId;
  texBinDir: string | null;
  shellEscape: boolean;
  synctex: boolean;
  compileOnSave: boolean;
  autosaveMs: number;
  tooltips: boolean;
  tooltipDelayMs: number;
  /** Look for a newer release at launch — the only network request Cohere makes on its own. */
  checkUpdates: boolean;
  editor: EditorSettings;
  ui: UiSettings;
}

export interface TexInfo {
  found: boolean;
  binDir: string | null;
  source: string;
  latexmkVersion: string | null;
  pdflatex: boolean;
  xelatex: boolean;
  lualatex: boolean;
  biber: boolean;
  bibtex: boolean;
  candidates: string[];
}

export interface AppInfo {
  version: string;
  dataDir: string;
  identifier: string;
  /** `tauri dev` build: its own data directory, no update checks. */
  dev: boolean;
  tex: TexInfo;
  themes: ThemeId[];
  motions: MotionId[];
  engines: EngineId[];
}

export interface TemplateDefaults {
  units: number;
  subunits: number;
  appendices: number;
}

export interface TemplateInfo {
  key: string;
  name: string;
  /** Two or three words for tight spaces: "Paper, 2-column". */
  shortName: string;
  /** Icon name in the icon set (tplProject, tplBrief, …). */
  icon: string;
  description: string;
  documentclass: string;
  unit: "chapter" | "section";
  unitCmd: string;
  subCmd: string;
  unitDir: string;
  unitLabel: string;
  abstractPage: boolean;
  toc: boolean;
  appendices: boolean;
  twocolumn: boolean;
  defaults: TemplateDefaults;
  prompts: { subtitle: boolean; tagline: boolean };
}

export interface ProjectSummary {
  id: string;
  title: string;
  topic: string | null;
  template: string;
  created: string;
  modified: string;
  archived: boolean;
  favorite: boolean;
  mainFile: string;
  engine: EngineId | null;
  lastOpenedFile: string | null;
  hasOutput: boolean;
  fileCount: number;
  versionCount: number;
  sizeBytes: number;
}

export interface NewProject {
  title: string;
  topic?: string | null;
  template: string;
  subtitle?: string;
  tagline?: string;
  description?: string;
  author?: string | null;
  units?: number | null;
  subunits?: number | null;
  appendices?: number | null;
}

/** `undefined` = leave unchanged; `null` (where allowed) = clear. */
export interface ProjectMetaUpdate {
  title?: string;
  favorite?: boolean;
  topic?: string | null;
  engine?: EngineId | null;
  mainFile?: string;
  lastOpenedFile?: string | null;
}

export interface FileNode {
  name: string;
  path: string;
  kind: "file" | "dir";
  size: number;
  modified: string | null;
  ext: string;
  children?: FileNode[];
}

export interface FileContent {
  path: string;
  text: string | null;
  binary: boolean;
  image: boolean;
  size: number;
  modified: string | null;
  ext: string;
}

export interface FileStat {
  path: string;
  size: number;
  modified: string | null;
}

export type Severity = "error" | "warning" | "info";

export interface Diagnostic {
  severity: Severity;
  file: string | null;
  line: number | null;
  message: string;
  detail: string;
  source: "latex" | "package" | "biber" | "latexmk" | string;
}

export interface OutputInfo {
  path: string;
  bytes: number;
  compiledAt: string;
  pages: number | null;
  engine: EngineId | string;
  durationMs: number;
  errorCount: number;
  warningCount: number;
  hasSynctex: boolean;
}

export type CompileStatus = "success" | "errors" | "failed" | "cancelled";

export interface CompileResult {
  status: CompileStatus;
  ok: boolean;
  durationMs: number;
  engine: string;
  command: string;
  exitCode: number | null;
  output: OutputInfo | null;
  diagnostics: Diagnostic[];
  errorCount: number;
  warningCount: number;
  logTail: string;
  pdfUpdated: boolean;
}

export interface CompileLogEvent {
  projectId: string;
  job: number;
  stream: "stdout" | "stderr" | "cohere";
  line: string;
}

export interface CompileStatusEvent {
  projectId: string;
  job: number;
  status: "running" | CompileStatus;
}

export interface VersionInfo {
  id: string;
  name: string;
  note: string;
  created: string;
  pdfBytes: number;
  bundleBytes: number;
  fileCount: number;
  hasPdf: boolean;
}

export interface ProjectDetail {
  project: ProjectSummary;
  tree: FileNode[];
  output: OutputInfo | null;
  versions: VersionInfo[];
  compiling: boolean;
  /** Absolute path of the project's src/ folder. */
  srcDir: string;
}

export interface ExportResult {
  path: string;
  bytes: number;
}

export interface AppErrorShape {
  kind: "io" | "json" | "zip" | "not_found" | "invalid" | "conflict" | "tex" | "other" | string;
  message: string;
}

export const THEMES: { id: ThemeId; name: string; mode: "light" | "dark"; blurb: string }[] = [
  { id: "paper", name: "Paper", mode: "light", blurb: "warm white, ink and teal" },
  { id: "mist", name: "Mist", mode: "light", blurb: "cool grey, slate blue" },
  { id: "ink", name: "Ink", mode: "dark", blurb: "warm black, brass" },
  { id: "graphite", name: "Graphite", mode: "dark", blurb: "cool black, sea glass" },
];

export const MOTIONS: { id: MotionId; name: string; scale: number }[] = [
  { id: "off", name: "Off", scale: 0 },
  { id: "slow", name: "Slow", scale: 1.6 },
  { id: "normal", name: "Normal", scale: 1 },
  { id: "fast", name: "Fast", scale: 0.6 },
];

export const ENGINES: { id: EngineId; name: string; blurb: string }[] = [
  { id: "pdflatex", name: "pdfLaTeX", blurb: "fastest; the classic engine" },
  { id: "xelatex", name: "XeLaTeX", blurb: "system fonts via fontspec, Unicode" },
  { id: "lualatex", name: "LuaLaTeX", blurb: "Lua scripting, modern fonts" },
];

// ── updates ───────────────────────────────────────────────────────────────────

export interface UpdateCheck {
  currentVersion: string;
  available: boolean;
  version: string | null;
  notes: string | null;
  date: string | null;
  /** Set when this build cannot check (development). */
  disabled: string | null;
}

export interface UpdateProgress {
  phase: "downloading" | "installing" | "restarting";
  downloaded: number;
  total: number | null;
}

// ── private TeX install ───────────────────────────────────────────────────────

export type TexInstallPhase = "download" | "install" | "packages" | "verify" | "done" | "error" | "cancelled";

export interface TexInstallEvent {
  phase: TexInstallPhase;
  line: string | null;
  progress: number | null;
  binDir: string | null;
}

export interface TexInstallStatus {
  running: boolean;
  installedBin: string | null;
  bytes: number;
}

// ── remove Cohere ─────────────────────────────────────────────────────────────

export interface Footprint {
  dataDir: string;
  dataBytes: number;
  texBytes: number;
  projects: number;
  appBundle: string | null;
  libraryDirs: string[];
}

export interface RemovalReport {
  exported: number;
  trashed: string[];
  skipped: string[];
}
