/**
 * In-memory stand-in for the Rust backend. Every Tauri command the frontend invokes is handled
 * here with the same argument names, return shapes and error kinds as `src-tauri/src/commands.rs`.
 * Wire it up with `installMockBackend()`; e2e tests can reach the instance via `window.__COHERE_MOCK__`.
 */
import type {
  AppInfo,
  CompileLogEvent,
  CompileResult,
  CompileStatus,
  CompileStatusEvent,
  Diagnostic,
  EngineId,
  ExportResult,
  FileContent,
  FileNode,
  FileStat,
  OutputInfo,
  ProjectDetail,
  ProjectSummary,
  Settings,
  TemplateInfo,
  TexInfo,
  TexInstallEvent,
  UpdateCheck,
  VersionInfo,
} from "../types";
import { cleanDiagnostics, engineFlag, errorDiagnostics, findBadCommand, latexLog, latexmkLines, pdfPages, unitTexFiles } from "./compileSim";
import { buildMultiPagePdf } from "./samplePdf";
import { seedProjects } from "./seed";
import { DEFAULT_AUTHOR, TEMPLATES, scaffold, templateByKey } from "./templates";
import {
  ENGINES,
  IMAGE_EXTENSIONS,
  MOCK_DATA_DIR,
  MOTIONS,
  PNG_1X1,
  TEXT_EXTENSIONS,
  THEMES,
  addParentDirs,
  appError,
  basename,
  bool,
  byteLength,
  cleanName,
  conflict,
  decodeUtf8,
  extension,
  hex,
  invalid,
  isEngine,
  isHiddenName,
  isIgnoredName,
  isRecord,
  looksLikeText,
  naturalCompare,
  normalizePath,
  notFound,
  obj,
  optNum,
  optStr,
  parentOf,
  sleep,
  stamp,
  str,
  strList,
  utf8,
  uuid,
  validateId,
} from "./util";

// ── state shapes ─────────────────────────────────────────────────────────────────────────────

export interface MockFile {
  text?: string;
  bytes?: Uint8Array;
  modified: string;
}

export interface MockVersion {
  info: VersionInfo;
  pdf: Uint8Array | null;
  /** Snapshot of `src/` at the time of the version (stands in for `src.zip`). */
  files: Map<string, MockFile>;
}

export interface MockProject {
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
  files: Map<string, MockFile>;
  /** Every directory, explicit or implied by a file path, so emptied folders survive like they do on disk. */
  dirs: Set<string>;
  output: OutputInfo | null;
  pdf: Uint8Array | null;
  log: string;
  versions: MockVersion[];
  diagnostics: Diagnostic[];
}

export interface MockOptions {
  /** Artificial IPC delay per command (default 25 ms); event-plugin calls are never delayed. */
  latencyMs?: number;
  seed?: () => MockProject[];
  now?: () => Date;
  /** Pretend no TeX is installed (also `?notex=1`). */
  noTex?: boolean;
  /** Offer this version as an available update (also `?update=0.9.0`). */
  update?: string | null;
  /** Speed factor for simulated long jobs (TeX install, update download); 1 = realistic-ish seconds. */
  speed?: number;
}

export interface RecordedCall {
  cmd: string;
  args: Record<string, unknown>;
}

interface CompileJob {
  no: number;
  cancelled: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  wake: (() => void) | null;
}

/** What `mockIPC` hangs on `window.__TAURI_INTERNALS__` for callback delivery. */
interface TauriInternals {
  runCallback?: (id: number, data: unknown) => void;
  callbacks?: Map<number, unknown>;
}

const SETTINGS_KEY = "cohere.mock.settings";
const MAX_RECORDED_CALLS = 1000;
/** Gaps between streamed log lines (40–80 ms) plus a final pause: a compile takes about 600 ms. */
const LOG_GAPS_MS = [60, 45, 80, 50, 70, 40, 75, 55];
const FINAL_GAP_MS = 125;

const TEX_INFO: TexInfo = {
  found: true,
  binDir: "/Library/TeX/texbin",
  source: "MacTeX",
  latexmkVersion: "Latexmk, John Collins, 7 Apr. 2024. Version 4.86a",
  pdflatex: true,
  xelatex: true,
  lualatex: true,
  biber: true,
  bibtex: true,
  candidates: ["/Library/TeX/texbin", "/usr/local/texlive/2024/bin/universal-darwin", "/opt/homebrew/bin", "/usr/local/bin"],
};

// ── settings (mirror of settings.rs) ─────────────────────────────────────────────────────────

export function defaultSettings(): Settings {
  return {
    version: 4,
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
    checkUpdates: true,
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
}

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
const boolOr = (v: unknown, fallback: boolean): boolean => (typeof v === "boolean" ? v : fallback);
const strOr = (v: unknown, fallback: string): string => (typeof v === "string" ? v : fallback);
const clampNum = (v: unknown, min: number, max: number, fallback: number): number =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const clampInt = (v: unknown, min: number, max: number, fallback: number): number => Math.round(clampNum(v, min, max, fallback));

function sidebarSections(v: unknown): [number, number, number] {
  const fallback = defaultSettings().ui.sidebarSections;
  if (!Array.isArray(v) || v.length !== 3 || !v.every((x) => typeof x === "number" && Number.isFinite(x))) return fallback;
  const [a, b, c] = v as [number, number, number];
  const sum = a + b + c;
  if (sum < 0.99 || sum > 1.01 || Math.min(a, b, c) < 0.08) return fallback;
  return [a, b, c];
}

/** Fill missing fields with defaults and clamp ranges, like `Settings::normalised` after a serde load. */
export function normaliseSettings(input: unknown): Settings {
  const d = defaultSettings();
  const o = isRecord(input) ? input : {};
  const e = isRecord(o.editor) ? o.editor : {};
  const u = isRecord(o.ui) ? o.ui : {};
  const texBinDir = typeof o.texBinDir === "string" && o.texBinDir.trim() !== "" ? o.texBinDir : null;
  const version = typeof o.version === "number" ? o.version : 0;
  const editorIn = isRecord(o.editor) ? o.editor : {};
  // v2 migration mirrors settings.rs: older files adopt the smaller editor default
  const migratedFont = version < 2 ? 11 : editorIn.fontSize;
  const foldedIn = isRecord(o.ui) && Array.isArray(o.ui.sidebarFolded) && o.ui.sidebarFolded.length === 3 ? (o.ui.sidebarFolded.map((x) => x === true) as [boolean, boolean, boolean]) : d.ui.sidebarFolded;
  if (version < 3) foldedIn[2] = true;
  const checkUpdates = version < 4 ? true : typeof o.checkUpdates === "boolean" ? o.checkUpdates : d.checkUpdates;
  return {
    version: 4,
    checkUpdates,
    theme: pick(o.theme, THEMES, d.theme),
    motion: pick(o.motion, MOTIONS, d.motion),
    engine: pick(o.engine, ENGINES, d.engine),
    texBinDir,
    shellEscape: boolOr(o.shellEscape, d.shellEscape),
    synctex: boolOr(o.synctex, d.synctex),
    compileOnSave: boolOr(o.compileOnSave, d.compileOnSave),
    autosaveMs: clampInt(o.autosaveMs, 200, 10_000, d.autosaveMs),
    tooltips: boolOr(o.tooltips, d.tooltips),
    tooltipDelayMs: clampInt(o.tooltipDelayMs, 0, 3000, d.tooltipDelayMs),
    editor: {
      fontSize: clampInt(migratedFont, 9, 32, d.editor.fontSize),
      fontFamily: strOr(e.fontFamily, d.editor.fontFamily),
      lineWrap: boolOr(e.lineWrap, d.editor.lineWrap),
      lineNumbers: boolOr(e.lineNumbers, d.editor.lineNumbers),
      tabSize: clampInt(e.tabSize, 1, 8, d.editor.tabSize),
      spellcheck: boolOr(e.spellcheck, d.editor.spellcheck),
      highlightActiveLine: boolOr(e.highlightActiveLine, d.editor.highlightActiveLine),
      bracketMatching: boolOr(e.bracketMatching, d.editor.bracketMatching),
      autoCloseBrackets: boolOr(e.autoCloseBrackets, d.editor.autoCloseBrackets),
      autocomplete: boolOr(e.autocomplete, d.editor.autocomplete),
    },
    ui: {
      sidebarCollapsed: boolOr(u.sidebarCollapsed, d.ui.sidebarCollapsed),
      sidebarWidth: clampNum(u.sidebarWidth, 180, 600, d.ui.sidebarWidth),
      editorFraction: clampNum(u.editorFraction, 0.2, 0.8, d.ui.editorFraction),
      sidebarSections: sidebarSections(u.sidebarSections),
      sidebarFolded: foldedIn,
      showArchived: boolOr(u.showArchived, d.ui.showArchived),
      pdfZoom: strOr(u.pdfZoom, d.ui.pdfZoom),
      problemsOpen: boolOr(u.problemsOpen, d.ui.problemsOpen),
      statusLine: boolOr(u.statusLine, d.ui.statusLine),
    },
  };
}

function loadPersistedSettings(): Settings {
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return normaliseSettings(JSON.parse(raw));
    }
  } catch {
    // unreadable storage or corrupt JSON: fall through to defaults, like Settings::load does
  }
  return defaultSettings();
}

function persistSettings(settings: Settings): void {
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // storage unavailable (private mode, quota): settings simply live in memory
  }
}

// ── file helpers ─────────────────────────────────────────────────────────────────────────────

const fileSize = (f: MockFile): number => (f.bytes ? f.bytes.length : byteLength(f.text ?? ""));
const fileBytes = (f: MockFile): Uint8Array => (f.bytes ? new Uint8Array(f.bytes) : utf8(f.text ?? ""));
const isIgnoredPath = (path: string): boolean => path.split("/").some(isIgnoredName);
const fileCount = (p: MockProject): number => [...p.files.keys()].filter((k) => !isIgnoredPath(k)).length;

function sizeBytes(p: MockProject): number {
  let total = 0;
  for (const f of p.files.values()) total += fileSize(f);
  return total;
}

const joinPath = (dir: string, name: string): string => (dir === "" ? name : `${dir}/${name}`);

/** Stand-in content for `import_files`: the mock cannot read the user's disk, so it invents plausible bytes. */
function fakeImport(source: string, name: string): Pick<MockFile, "text" | "bytes"> {
  const ext = extension(name);
  if (IMAGE_EXTENSIONS.has(ext) && ext !== "svg") return { bytes: new Uint8Array(PNG_1X1) };
  switch (ext) {
    case "svg":
      return { text: `<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="#C9C4B8"/></svg>\n` };
    case "csv":
      return { text: "t,price,soc\n0,24.10,0.50\n1,31.75,0.62\n2,18.40,0.41\n" };
    case "bib":
      return { text: `@misc{imported,\n  title = {Imported from ${basename(source)}},\n  year  = {2026}\n}\n` };
    default:
      return { text: `% imported from ${source}\n` };
  }
}

// ── the backend ──────────────────────────────────────────────────────────────────────────────

export class MockBackend {
  readonly projects = new Map<string, MockProject>();
  readonly templates: TemplateInfo[] = TEMPLATES.map((t) => ({ ...t, defaults: { ...t.defaults }, prompts: { ...t.prompts } }));
  readonly appInfo: AppInfo;
  /** Every non-event command received, oldest first (capped), for tests to inspect. */
  readonly calls: RecordedCall[] = [];
  settings: Settings;
  latencyMs: number;
  noTex: boolean;
  offeredUpdate: string | null;
  private readonly speed: number;
  private texInstalled = false;
  private texInstallRunning = false;
  private texInstallCancelled = false;
  private readonly now: () => Date;
  private readonly listeners = new Map<string, Set<number>>();
  private readonly jobs = new Map<string, CompileJob>();
  private jobCounter = 0;

  constructor(options: MockOptions = {}) {
    this.latencyMs = options.latencyMs ?? 25;
    this.now = options.now ?? (() => new Date());
    for (const p of (options.seed ?? seedProjects)()) this.projects.set(p.id, p);
    this.settings = loadPersistedSettings();
    const q = typeof location === "undefined" ? null : new URLSearchParams(location.search);
    this.noTex = options.noTex ?? q?.get("notex") === "1";
    this.offeredUpdate = options.update ?? q?.get("update") ?? null;
    this.speed = options.speed ?? 1;
    this.appInfo = {
      version: "0.1.0-mock",
      dataDir: MOCK_DATA_DIR,
      identifier: "com.cohere.desk",
      dev: false,
      tex: { ...TEX_INFO, candidates: [...TEX_INFO.candidates] },
      themes: [...THEMES],
      motions: [...MOTIONS],
      engines: [...ENGINES],
    };
  }

  /** Dispatch one IPC command exactly as the Rust `invoke_handler` would. */
  async handle(cmd: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!cmd.startsWith("plugin:event|")) {
      this.record(cmd, args);
      if (this.latencyMs > 0) await sleep(this.latencyMs);
    }
    switch (cmd) {
      // app / settings
      case "get_app_info":
        return { ...this.appInfo, tex: this.texInfo(), themes: [...THEMES], motions: [...MOTIONS], engines: [...ENGINES] };
      case "detect_tex":
        return this.texInfo();
      case "check_update":
        return this.checkUpdate();
      case "install_update":
        return this.installUpdate();
      case "install_tex":
        return this.installTex();
      case "cancel_tex_install":
        this.texInstallCancelled = true;
        return null;
      case "remove_tex":
        this.texInstalled = false;
        return this.texInfo();
      case "tex_install_status":
        return { running: this.texInstallRunning, installedBin: this.texInstalled ? `${MOCK_DATA_DIR}/texlive/tl/bin/universal-darwin` : null, bytes: this.texInstalled ? 412_000_000 : 0 };
      case "app_footprint":
        return { dataDir: MOCK_DATA_DIR, dataBytes: 48_300_000 + (this.texInstalled ? 412_000_000 : 0), texBytes: this.texInstalled ? 412_000_000 : 0, projects: this.projects.size, appBundle: "/Applications/Cohere.app", libraryDirs: ["/Users/you/Library/WebKit/com.cohere.desk", "/Users/you/Library/Saved Application State/com.cohere.desk.savedState"] };
      case "remove_cohere":
        return { exported: args.exportDir ? this.projects.size : 0, trashed: [MOCK_DATA_DIR, "/Applications/Cohere.app"], skipped: [] };
      case "get_settings":
        return normaliseSettings(this.settings);
      case "save_settings":
        return this.saveSettings(args.settings);
      // templates
      case "list_templates":
        return this.templates.map((t) => ({ ...t, defaults: { ...t.defaults }, prompts: { ...t.prompts } }));
      // library
      case "list_projects":
        return this.listProjects();
      case "get_project":
        return this.summary(this.project(args.id));
      case "create_project":
        return this.createProject(args.input);
      case "update_project":
        return this.updateProject(args.id, args.update);
      case "archive_project":
        return this.archiveProject(args.id, args.archived);
      case "delete_project":
        return this.deleteProject(args.id);
      case "export_project_zip":
        return this.exportZip(args.id, args.dest);
      case "export_project_pdf":
        return this.exportPdf(args.id, args.dest);
      // files
      case "open_project":
        return this.openProject(args.id);
      case "list_tree":
        return this.tree(this.project(args.id));
      case "read_file":
        return this.readFile(args.id, args.path);
      case "read_file_bytes":
        return this.readFileBytes(args.id, args.path);
      case "write_file":
        return this.writeFile(args.id, args.path, args.text);
      case "create_file":
        return this.createFile(args.id, args.path, args.content);
      case "create_folder":
        return this.createFolder(args.id, args.path);
      case "rename_entry":
        return this.renameEntry(args.id, args.from, args.to);
      case "delete_entry":
        return this.deleteEntry(args.id, args.path);
      case "import_files":
        return this.importFiles(args.id, args.destDir, args.sources);
      // compile
      case "compile_project":
        return this.compileProject(args.id, args.options);
      case "cancel_compile":
        return this.cancelCompile(args.id);
      case "read_output_pdf":
        return this.readOutputPdf(args.id);
      case "get_output_info":
        return this.outputInfo(this.project(args.id));
      case "read_output_log":
        return this.project(args.id).log;
      case "clean_build":
        this.project(args.id);
        return null;
      // versions
      case "list_versions":
        return this.listVersions(this.project(args.id));
      case "create_version":
        return this.createVersion(args.id, args.name, args.note);
      case "rename_version":
        return this.renameVersion(args.id, args.vid, args.name, args.note);
      case "delete_version":
        return this.deleteVersion(args.id, args.vid);
      case "export_version":
        return this.exportVersion(args.id, args.vid, args.kind, args.dest);
      case "read_version_pdf":
        return this.readVersionPdf(args.id, args.vid);
      case "next_version_name":
        return this.nextVersionName(this.project(args.id));
      // tauri plugins
      case "plugin:dialog|save":
        return this.dialogSave(args);
      case "plugin:dialog|open":
        return this.dialogOpen(args);
      case "plugin:dialog|ask":
      case "plugin:dialog|confirm":
        return true;
      case "plugin:dialog|message":
        return dialogMessageAnswer(args.buttons);
      case "plugin:opener|reveal_item_in_dir":
      case "plugin:opener|open_path":
      case "plugin:opener|open_url":
        return null;
      case "plugin:event|listen":
        return this.listen(str(args.event, "event"), args.handler);
      case "plugin:event|unlisten":
        if (typeof args.eventId === "number") this.listeners.get(str(args.event, "event"))?.delete(args.eventId);
        return null;
      case "plugin:event|emit":
      case "plugin:event|emit_to":
        this.emit(str(args.event, "event"), args.payload);
        return null;
      default:
        throw appError("other", `unknown command: ${cmd}`);
    }
  }

  // ── events ───────────────────────────────────────────────────────────────────────────────

  /** Deliver an event to every `listen()` handler registered for it, as the Rust side's `app.emit` would. */
  emit(event: string, payload: unknown): void {
    const ids = this.listeners.get(event);
    if (!ids) return;
    for (const id of [...ids]) this.deliver(event, id, payload);
  }

  private listen(event: string, handler: unknown): number {
    if (typeof handler !== "number") throw invalid("invalid args: handler must be a callback id");
    let ids = this.listeners.get(event);
    if (!ids) {
      ids = new Set();
      this.listeners.set(event, ids);
    }
    ids.add(handler);
    // The handler id doubles as the event id so `unlisten` (which calls unregisterCallback(eventId)) works.
    return handler;
  }

  private deliver(event: string, id: number, payload: unknown): void {
    if (typeof window === "undefined") return;
    const w = window as unknown as { __TAURI_INTERNALS__?: TauriInternals } & Record<string, unknown>;
    const internals = w.__TAURI_INTERNALS__;
    if (internals?.callbacks instanceof Map && !internals.callbacks.has(id)) {
      // `unlisten()` already dropped the callback; forget the stale listener quietly.
      this.listeners.get(event)?.delete(id);
      return;
    }
    const data = { event, id, payload };
    if (typeof internals?.runCallback === "function") {
      internals.runCallback(id, data);
      return;
    }
    // Real Tauri (and older mocks) register callbacks as `window._<id>`.
    const legacy = w[`_${id}`];
    if (typeof legacy === "function") (legacy as (d: unknown) => void)(data);
  }

  private emitStatus(projectId: string, job: number, status: CompileStatusEvent["status"]): void {
    const payload: CompileStatusEvent = { projectId, job, status };
    this.emit("compile:status", payload);
  }

  private emitLog(projectId: string, job: number, stream: CompileLogEvent["stream"], line: string): void {
    const payload: CompileLogEvent = { projectId, job, stream, line };
    this.emit("compile:log", payload);
  }

  private record(cmd: string, args: Record<string, unknown>): void {
    this.calls.push({ cmd, args });
    if (this.calls.length > MAX_RECORDED_CALLS) this.calls.splice(0, this.calls.length - MAX_RECORDED_CALLS);
  }

  // ── app / settings ───────────────────────────────────────────────────────────────────────

  private texInfo(): TexInfo {
    const tex = { ...TEX_INFO, candidates: [...TEX_INFO.candidates] };
    const override = this.settings.texBinDir;
    if (this.texInstalled) return { ...tex, binDir: `${MOCK_DATA_DIR}/texlive/tl/bin/universal-darwin`, source: "Cohere", latexmkVersion: "Latexmk, John Collins, 7 Apr. 2024. Version 4.86a" };
    if (this.noTex) return { found: false, binDir: null, source: "none", latexmkVersion: null, pdflatex: false, xelatex: false, lualatex: false, biber: false, bibtex: false, candidates: ["/Library/TeX/texbin", "/opt/homebrew/bin", "/usr/local/bin"] };
    return override ? { ...tex, binDir: override, source: "settings", candidates: [override, ...tex.candidates] } : tex;
  }

  // ── updates ──────────────────────────────────────────────────────────────────────────────

  private checkUpdate(): UpdateCheck {
    const current = this.appInfo.version;
    if (!this.offeredUpdate) return { currentVersion: current, available: false, version: null, notes: null, date: null, disabled: null };
    return {
      currentVersion: current,
      available: true,
      version: this.offeredUpdate,
      date: this.now().toISOString(),
      disabled: null,
      notes: `## Cohere ${this.offeredUpdate}\n\n- In-app updates: this dialog, signed downloads, install and relaunch\n- **Install TeX for Cohere** when no TeX Live is found\n- Settings › About › Remove Cohere…\n\n### Fixes\n\n- A compile no longer dies on 8-bit characters in \`\\typeout\`\n`,
    };
  }

  private installUpdate(): null {
    const total = 14_800_000;
    const steps = 12;
    let i = 0;
    const tick = () => {
      i += 1;
      if (i <= steps) {
        this.emit("update:progress", { phase: "downloading", downloaded: Math.round((total * i) / steps), total });
        setTimeout(tick, 120 / this.speed);
      } else if (i === steps + 1) {
        this.emit("update:progress", { phase: "installing", downloaded: total, total });
        setTimeout(tick, 600 / this.speed);
      } else {
        this.emit("update:progress", { phase: "restarting", downloaded: total, total });
      }
    };
    setTimeout(tick, 80 / this.speed);
    return null;
  }

  // ── TeX install (simulated) ───────────────────────────────────────────────────────────────

  private installTex(): null {
    if (this.texInstallRunning) throw conflict("a TeX installation is already running");
    this.texInstallRunning = true;
    this.texInstallCancelled = false;
    const send = (e: TexInstallEvent) => this.emit("tex-install:event", e);
    const phases: { phase: TexInstallEvent["phase"]; lines: string[] }[] = [
      { phase: "download", lines: ["fetching install-tl from https://mirror.ctan.org/systems/texlive/tlnet/install-tl-unx.tar.gz", "unpacking the installer"] },
      { phase: "install", lines: ["installing the TeX Live core (scheme-basic, this is the long step)", "Installing [0001/0123, time/total: ??:??/??:??]: hyphen-base [23k]", "Installing [0040/0123, time/total: 00:12/00:37]: latex [1234k]", "Installing [0090/0123, time/total: 00:28/00:37]: pdftex [890k]", "Installing [0123/0123, time/total: 00:37/00:37]: texlive-scripts [512k]", "running mktexlsr … done", "running fmtutil-sys --all … done"] },
      { phase: "packages", lines: ["adding 55 packages", "[1/55, ??:??/??:??] install: latexmk [78k]", "[20/55, 00:05/00:14] install: pgf [4567k]", "[40/55, 00:10/00:14] install: tcolorbox [345k]", "[55/55, 00:14/00:14] install: biber [12345k]", "running mktexlsr … done"] },
      { phase: "verify", lines: ["compiling a probe document with latexmk", "Latexmk: applying rule 'pdflatex'...", "Latexmk: All targets (probe.pdf) are up-to-date"] },
    ];
    let pi = 0;
    let li = 0;
    const step = () => {
      if (this.texInstallCancelled) {
        this.texInstallRunning = false;
        send({ phase: "cancelled", line: "installation cancelled", progress: null, binDir: null });
        return;
      }
      const ph = phases[pi];
      if (li < ph.lines.length) {
        const line = ph.lines[li];
        li += 1;
        const m = /\[0*(\d+)\/0*(\d+)/.exec(line);
        send({ phase: ph.phase, line, progress: m ? Number(m[1]) / Number(m[2]) : li === 1 ? 0 : null, binDir: null });
        setTimeout(step, 180 / this.speed);
      } else if (pi < phases.length - 1) {
        pi += 1;
        li = 0;
        setTimeout(step, 120 / this.speed);
      } else {
        this.texInstallRunning = false;
        this.texInstalled = true;
        send({ phase: "done", line: "TeX for Cohere is ready", progress: 1, binDir: `${MOCK_DATA_DIR}/texlive/tl/bin/universal-darwin` });
      }
    };
    setTimeout(step, 100 / this.speed);
    return null;
  }

  private saveSettings(raw: unknown): Settings {
    this.settings = normaliseSettings(raw);
    persistSettings(this.settings);
    return normaliseSettings(this.settings);
  }

  // ── library ──────────────────────────────────────────────────────────────────────────────

  private project(idArg: unknown): MockProject {
    const id = validateId(str(idArg, "id"));
    const p = this.projects.get(id);
    if (!p) throw notFound("project");
    return p;
  }

  private touch(p: MockProject): void {
    p.modified = this.now().toISOString();
  }

  private summary(p: MockProject): ProjectSummary {
    return {
      id: p.id,
      title: p.title,
      topic: p.topic,
      template: p.template,
      created: p.created,
      modified: p.modified,
      archived: p.archived,
      favorite: p.favorite,
      mainFile: p.mainFile,
      engine: p.engine,
      lastOpenedFile: p.lastOpenedFile,
      hasOutput: p.pdf !== null,
      fileCount: fileCount(p),
      versionCount: p.versions.length,
      sizeBytes: sizeBytes(p),
    };
  }

  private listProjects(): ProjectSummary[] {
    return [...this.projects.values()]
      .sort((a, b) => (a.modified === b.modified ? a.title.localeCompare(b.title) : a.modified < b.modified ? 1 : -1))
      .map((p) => this.summary(p));
  }

  private createProject(raw: unknown): ProjectSummary {
    const input = obj(raw, "input");
    const title = str(input.title, "input.title").trim();
    if (title === "") throw invalid("title is required");
    if (title.length > 200) throw invalid("title is too long");
    const template = str(input.template, "input.template");
    if (!templateByKey(template)) throw notFound(`template '${template}'`);
    const author = optStr(input.author, "input.author");
    const topic = optStr(input.topic, "input.topic")?.trim() ?? "";
    const now = this.now();
    const built = scaffold(
      template,
      {
        title,
        subtitle: optStr(input.subtitle, "input.subtitle") ?? "",
        tagline: optStr(input.tagline, "input.tagline") ?? "",
        description: optStr(input.description, "input.description") ?? "",
        author: author && author.trim() !== "" ? author : DEFAULT_AUTHOR,
        version: "0.1.0",
        units: optNum(input.units, "input.units"),
        subunits: optNum(input.subunits, "input.subunits"),
        appendices: optNum(input.appendices, "input.appendices"),
      },
      now,
    );
    const iso = now.toISOString();
    const p: MockProject = {
      id: uuid(),
      title,
      topic: topic === "" ? null : topic,
      template,
      created: iso,
      modified: iso,
      archived: false,
      favorite: false,
      mainFile: built.mainFile,
      engine: null,
      lastOpenedFile: null,
      files: new Map(),
      dirs: new Set(),
      output: null,
      pdf: null,
      log: "",
      versions: [],
      diagnostics: [],
    };
    for (const [path, text] of built.files) {
      p.files.set(path, { text, modified: iso });
      addParentDirs(p.dirs, path);
    }
    for (const d of built.dirs) p.dirs.add(d);
    this.projects.set(p.id, p);
    return this.summary(p);
  }

  /** `undefined` leaves a field alone, `null` clears it; validated up front so a failure changes nothing. */
  private updateProject(idArg: unknown, raw: unknown): ProjectSummary {
    const p = this.project(idArg);
    const u = obj(raw, "update");
    const next: Partial<Pick<MockProject, "title" | "topic" | "engine" | "mainFile" | "lastOpenedFile" | "favorite">> = {};
    if (u.favorite !== undefined) next.favorite = bool(u.favorite, "update.favorite");
    if (u.title !== undefined) {
      const title = str(u.title, "update.title").trim();
      if (title === "") throw invalid("title is required");
      next.title = title;
    }
    if (u.topic !== undefined) {
      const topic = optStr(u.topic, "update.topic")?.trim() ?? "";
      next.topic = topic === "" ? null : topic;
    }
    if (u.engine !== undefined) {
      const engine = optStr(u.engine, "update.engine");
      next.engine = isEngine(engine) ? engine : null;
    }
    if (u.mainFile !== undefined) {
      const main = str(u.mainFile, "update.mainFile");
      const path = normalizePath(main);
      if (!p.files.has(path)) throw notFound(main);
      next.mainFile = path;
    }
    if (u.lastOpenedFile !== undefined) next.lastOpenedFile = optStr(u.lastOpenedFile, "update.lastOpenedFile");
    Object.assign(p, next);
    this.touch(p);
    return this.summary(p);
  }

  private archiveProject(idArg: unknown, archivedArg: unknown): ProjectSummary {
    const p = this.project(idArg);
    p.archived = bool(archivedArg, "archived");
    this.touch(p);
    return this.summary(p);
  }

  /** The real backend moves the folder to `.trash/`; here it is simply forgotten. */
  private deleteProject(idArg: unknown): null {
    const id = validateId(str(idArg, "id"));
    if (this.jobs.has(id)) this.cancelCompile(id);
    if (!this.projects.delete(id)) throw notFound("project");
    return null;
  }

  private exportZip(idArg: unknown, destArg: unknown): ExportResult {
    const p = this.project(idArg);
    return { path: str(destArg, "dest"), bytes: sizeBytes(p) };
  }

  private exportPdf(idArg: unknown, destArg: unknown): ExportResult {
    const p = this.project(idArg);
    const dest = str(destArg, "dest");
    if (!p.pdf) throw notFound("no compiled PDF yet — compile first");
    return { path: dest, bytes: p.pdf.length };
  }

  // ── files ────────────────────────────────────────────────────────────────────────────────

  private openProject(idArg: unknown): ProjectDetail {
    const p = this.project(idArg);
    return { project: this.summary(p), tree: this.tree(p), output: this.outputInfo(p), versions: this.listVersions(p), compiling: this.jobs.has(p.id), srcDir: `${MOCK_DATA_DIR}/projects/${p.id}/src` };
  }

  private dirModified(p: MockProject, dir: string): string {
    const prefix = `${dir}/`;
    let newest = "";
    for (const [path, f] of p.files) if (path.startsWith(prefix) && f.modified > newest) newest = f.modified;
    return newest === "" ? p.modified : newest;
  }

  private fileNode(p: MockProject, path: string): FileNode {
    const name = basename(path);
    const f = p.files.get(path);
    if (f) return { name, path, kind: "file", size: fileSize(f), modified: f.modified, ext: extension(name) };
    return { name, path, kind: "dir", size: 0, modified: this.dirModified(p, path), ext: "", children: [] };
  }

  private tree(p: MockProject): FileNode[] {
    const build = (dir: string): FileNode[] => {
      const nodes: FileNode[] = [];
      for (const d of p.dirs) {
        if (parentOf(d) !== dir || isHiddenName(basename(d))) continue;
        nodes.push({ name: basename(d), path: d, kind: "dir", size: 0, modified: this.dirModified(p, d), ext: "", children: build(d) });
      }
      for (const [path, f] of p.files) {
        if (parentOf(path) !== dir || isHiddenName(basename(path))) continue;
        const name = basename(path);
        nodes.push({ name, path, kind: "file", size: fileSize(f), modified: f.modified, ext: extension(name) });
      }
      nodes.sort((a, b) => (a.kind === b.kind ? naturalCompare(a.name, b.name) : a.kind === "dir" ? -1 : 1));
      return nodes;
    };
    return build("");
  }

  private readFile(idArg: unknown, pathArg: unknown): FileContent {
    const p = this.project(idArg);
    const rel = str(pathArg, "path");
    const path = normalizePath(rel);
    const f = p.files.get(path);
    if (!f) {
      if (path === "" || p.dirs.has(path)) throw invalid(`${rel} is not a file`);
      throw notFound(rel);
    }
    const name = basename(path);
    const ext = extension(name);
    const base = { path, size: fileSize(f), modified: f.modified, ext };
    if (IMAGE_EXTENSIONS.has(ext) && ext !== "svg") return { ...base, text: null, binary: true, image: true };
    if (f.text !== undefined) return { ...base, text: f.text, binary: false, image: false };
    const bytes = f.bytes ?? new Uint8Array();
    if (TEXT_EXTENSIONS.has(ext) || looksLikeText(bytes)) return { ...base, text: decodeUtf8(bytes), binary: false, image: false };
    return { ...base, text: null, binary: true, image: false };
  }

  private readFileBytes(idArg: unknown, pathArg: unknown): Uint8Array {
    const p = this.project(idArg);
    const rel = str(pathArg, "path");
    const f = p.files.get(normalizePath(rel));
    if (!f) throw notFound(rel);
    return fileBytes(f);
  }

  private writeFile(idArg: unknown, pathArg: unknown, textArg: unknown): FileStat {
    const p = this.project(idArg);
    const rel = str(pathArg, "path");
    const text = str(textArg, "text");
    if (rel.trim() === "") throw invalid("path is required");
    const path = normalizePath(rel);
    if (path === "" || p.dirs.has(path)) throw appError("io", `${rel} is a directory`);
    const modified = this.now().toISOString();
    p.files.set(path, { text, modified });
    addParentDirs(p.dirs, path);
    this.touch(p);
    return { path, size: byteLength(text), modified };
  }

  private createFile(idArg: unknown, pathArg: unknown, contentArg: unknown): FileNode {
    const p = this.project(idArg);
    const rel = str(pathArg, "path");
    const path = normalizePath(rel);
    cleanName(basename(path));
    if (p.files.has(path) || p.dirs.has(path)) throw conflict(`${rel} already exists`);
    p.files.set(path, { text: optStr(contentArg, "content") ?? "", modified: this.now().toISOString() });
    addParentDirs(p.dirs, path);
    this.touch(p);
    return this.fileNode(p, path);
  }

  private createFolder(idArg: unknown, pathArg: unknown): FileNode {
    const p = this.project(idArg);
    const rel = str(pathArg, "path");
    const path = normalizePath(rel);
    cleanName(basename(path));
    if (p.files.has(path) || p.dirs.has(path)) throw conflict(`${rel} already exists`);
    p.dirs.add(path);
    addParentDirs(p.dirs, path);
    this.touch(p);
    return this.fileNode(p, path);
  }

  private renameEntry(idArg: unknown, fromArg: unknown, toArg: unknown): FileNode {
    const p = this.project(idArg);
    const fromRel = str(fromArg, "from");
    const toRel = str(toArg, "to");
    const from = normalizePath(fromRel);
    const to = normalizePath(toRel);
    const file = p.files.get(from);
    if (!file && !p.dirs.has(from)) throw notFound(fromRel);
    cleanName(basename(to));
    if (p.files.has(to) || p.dirs.has(to)) throw conflict(`${toRel} already exists`);
    if (!file && to.startsWith(`${from}/`)) throw invalid("cannot move a folder into itself");
    if (file) {
      p.files.delete(from);
      p.files.set(to, file);
    } else {
      const prefix = `${from}/`;
      for (const [path, f] of [...p.files]) {
        if (!path.startsWith(prefix)) continue;
        p.files.delete(path);
        p.files.set(`${to}/${path.slice(prefix.length)}`, f);
      }
      for (const d of [...p.dirs]) {
        if (d !== from && !d.startsWith(prefix)) continue;
        p.dirs.delete(d);
        p.dirs.add(d === from ? to : `${to}/${d.slice(prefix.length)}`);
      }
    }
    addParentDirs(p.dirs, to);
    this.touch(p);
    return this.fileNode(p, to);
  }

  private deleteEntry(idArg: unknown, pathArg: unknown): null {
    const p = this.project(idArg);
    const rel = str(pathArg, "path");
    if (rel.trim() === "" || rel === ".") throw invalid("refusing to delete the project root");
    const path = normalizePath(rel);
    if (path === "") throw invalid("refusing to delete the project root");
    if (p.files.delete(path)) {
      this.touch(p);
      return null;
    }
    if (!p.dirs.has(path)) throw notFound(rel);
    const prefix = `${path}/`;
    for (const k of [...p.files.keys()]) if (k.startsWith(prefix)) p.files.delete(k);
    for (const d of [...p.dirs]) if (d === path || d.startsWith(prefix)) p.dirs.delete(d);
    this.touch(p);
    return null;
  }

  private uniqueName(p: MockProject, dir: string, name: string): string {
    const exists = (path: string) => p.files.has(path) || p.dirs.has(path);
    if (!exists(joinPath(dir, name))) return joinPath(dir, name);
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    for (let i = 2; i < 1000; i++) {
      const candidate = joinPath(dir, `${stem} (${i})${ext}`);
      if (!exists(candidate)) return candidate;
    }
    return joinPath(dir, `${stem}-${hex(32)}${ext}`);
  }

  private importFiles(idArg: unknown, destArg: unknown, sourcesArg: unknown): FileNode[] {
    const p = this.project(idArg);
    const destDir = normalizePath(str(destArg, "destDir"));
    const sources = strList(sourcesArg, "sources");
    if (destDir !== "") {
      p.dirs.add(destDir);
      addParentDirs(p.dirs, destDir);
    }
    const out: FileNode[] = [];
    for (const source of sources) {
      const name = cleanName(basename(source.replace(/\\/g, "/")));
      const target = this.uniqueName(p, destDir, name);
      p.files.set(target, { ...fakeImport(source, name), modified: this.now().toISOString() });
      out.push(this.fileNode(p, target));
    }
    this.touch(p);
    return out;
  }

  // ── compile ──────────────────────────────────────────────────────────────────────────────

  private async compileProject(idArg: unknown, optionsArg: unknown): Promise<CompileResult> {
    const p = this.project(idArg);
    if (this.jobs.has(p.id)) throw conflict("a compile is already running for this project");
    const options = optionsArg === undefined || optionsArg === null ? null : obj(optionsArg, "options");
    const requested = options ? optStr(options.engine, "options.engine") : null;
    const main = p.files.get(p.mainFile);
    if (!main) throw notFound(`main file ${p.mainFile} not found`);
    const chosen = requested ?? p.engine ?? this.settings.engine;
    const engine: EngineId = isEngine(chosen) ? chosen : "pdflatex";
    const job: CompileJob = { no: ++this.jobCounter, cancelled: false, timer: null, wake: null };
    this.jobs.set(p.id, job);
    try {
      return await this.runJob(p, job, engine, main.text ?? "");
    } finally {
      this.jobs.delete(p.id);
    }
  }

  private async runJob(p: MockProject, job: CompileJob, engine: EngineId, mainText: string): Promise<CompileResult> {
    const started = performance.now();
    const buildDir = `${MOCK_DATA_DIR}/projects/${p.id}/build`;
    const args = [engineFlag(engine), "-interaction=nonstopmode", "-file-line-error", "-recorder", `-outdir=${buildDir}`];
    if (this.settings.synctex) args.push("-synctex=1");
    if (this.settings.shellEscape) args.push("-shell-escape");
    args.push(p.mainFile);
    const command = `latexmk ${args.join(" ")}`;
    this.emitStatus(p.id, job.no, "running");
    this.emitLog(p.id, job.no, "cohere", `$ ${command}`);

    const bad = findBadCommand(p.files);
    const unitFiles = unitTexFiles(p.files.keys(), mainText);
    const pdf = buildMultiPagePdf(pdfPages({ title: p.title, template: p.template, engine, date: this.now(), files: p.files, unitFiles }));
    const run = { engine, mainFile: p.mainFile, buildDir, synctex: this.settings.synctex, pages: 1 + unitFiles.length, bytes: pdf.length, bad };

    const stdout: string[] = [];
    for (const [i, line] of latexmkLines(run).entries()) {
      await this.pause(job, LOG_GAPS_MS[i % LOG_GAPS_MS.length]);
      if (job.cancelled) break;
      stdout.push(line);
      this.emitLog(p.id, job.no, "stdout", line);
    }
    if (!job.cancelled) await this.pause(job, FINAL_GAP_MS);

    const durationMs = Math.round(performance.now() - started);
    const base = { durationMs, engine, command, logTail: stdout.slice(-40).join("\n") };
    if (job.cancelled) {
      this.emitStatus(p.id, job.no, "cancelled");
      return { ...base, status: "cancelled", ok: false, exitCode: null, output: this.outputInfo(p), diagnostics: [], errorCount: 0, warningCount: 0, pdfUpdated: false };
    }

    const diagnostics = bad ? errorDiagnostics(bad, p.mainFile) : cleanDiagnostics(unitFiles[0] ?? p.mainFile);
    const errorCount = diagnostics.filter((d) => d.severity === "error").length;
    const warningCount = diagnostics.filter((d) => d.severity === "warning").length;
    const compiledAt = this.now();
    p.pdf = pdf;
    p.log = latexLog(run, unitFiles, compiledAt);
    p.diagnostics = diagnostics;
    p.output = {
      path: `${MOCK_DATA_DIR}/projects/${p.id}/output/main.pdf`,
      bytes: pdf.length,
      compiledAt: compiledAt.toISOString(),
      pages: run.pages,
      engine,
      durationMs,
      errorCount,
      warningCount,
      hasSynctex: this.settings.synctex,
    };
    p.modified = compiledAt.toISOString();
    const status: CompileStatus = errorCount > 0 ? "errors" : "success";
    this.emitStatus(p.id, job.no, status);
    return { ...base, status, ok: status === "success", exitCode: errorCount > 0 ? 12 : 0, output: { ...p.output }, diagnostics, errorCount, warningCount, pdfUpdated: true };
  }

  /** A cancellable delay: `cancelCompile` clears the timer and wakes the job immediately. */
  private pause(job: CompileJob, ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        job.timer = null;
        job.wake = null;
        resolve();
      };
      job.wake = done;
      job.timer = setTimeout(done, ms);
    });
  }

  cancelCompile(idArg: unknown): boolean {
    const job = typeof idArg === "string" ? this.jobs.get(idArg) : undefined;
    if (!job) return false;
    job.cancelled = true;
    if (job.timer) clearTimeout(job.timer);
    job.wake?.();
    return true;
  }

  private outputInfo(p: MockProject): OutputInfo | null {
    return p.pdf && p.output ? { ...p.output } : null;
  }

  private readOutputPdf(idArg: unknown): Uint8Array {
    const p = this.project(idArg);
    if (!p.pdf) throw notFound("no compiled PDF yet");
    return new Uint8Array(p.pdf);
  }

  // ── versions ─────────────────────────────────────────────────────────────────────────────

  private listVersions(p: MockProject): VersionInfo[] {
    return p.versions
      .map((v, index) => ({ v, index }))
      .sort((a, b) => (a.v.info.created === b.v.info.created ? b.index - a.index : a.v.info.created < b.v.info.created ? 1 : -1))
      .map(({ v }) => ({ ...v.info }));
  }

  private nextVersionName(p: MockProject): string {
    return `v${p.versions.length + 1}`;
  }

  private version(p: MockProject, vidArg: unknown): MockVersion {
    const vid = validateId(str(vidArg, "vid"));
    const v = p.versions.find((x) => x.info.id === vid);
    if (!v) throw notFound("version");
    return v;
  }

  private createVersion(idArg: unknown, nameArg: unknown, noteArg: unknown): VersionInfo {
    const p = this.project(idArg);
    const trimmed = str(nameArg, "name").trim();
    const name = trimmed === "" ? this.nextVersionName(p) : trimmed;
    if (name.length > 120) throw invalid("version name is too long");
    const now = this.now();
    const pdf = p.pdf ? new Uint8Array(p.pdf) : null;
    const info: VersionInfo = {
      id: `${stamp(now)}-${hex(6)}`,
      name,
      note: str(noteArg, "note").trim(),
      created: now.toISOString(),
      pdfBytes: pdf?.length ?? 0,
      bundleBytes: sizeBytes(p),
      fileCount: fileCount(p),
      hasPdf: pdf !== null,
    };
    p.versions.push({ info, pdf, files: new Map([...p.files].map(([path, f]) => [path, { ...f }])) });
    this.touch(p);
    return { ...info };
  }

  private renameVersion(idArg: unknown, vidArg: unknown, nameArg: unknown, noteArg: unknown): VersionInfo {
    const v = this.version(this.project(idArg), vidArg);
    const name = str(nameArg, "name").trim();
    if (name !== "") v.info.name = name;
    const note = optStr(noteArg, "note");
    if (note !== null) v.info.note = note.trim();
    return { ...v.info };
  }

  private deleteVersion(idArg: unknown, vidArg: unknown): null {
    const p = this.project(idArg);
    const v = this.version(p, vidArg);
    p.versions.splice(p.versions.indexOf(v), 1);
    return null;
  }

  private exportVersion(idArg: unknown, vidArg: unknown, kindArg: unknown, destArg: unknown): ExportResult {
    const v = this.version(this.project(idArg), vidArg);
    const kind = str(kindArg, "kind");
    const dest = str(destArg, "dest");
    if (kind === "pdf") {
      if (!v.pdf) throw notFound(`this version has no ${kind}`);
      return { path: dest, bytes: v.pdf.length };
    }
    if (kind === "bundle" || kind === "zip") return { path: dest, bytes: v.info.bundleBytes };
    throw invalid(`unknown export kind ${kind}`);
  }

  private readVersionPdf(idArg: unknown, vidArg: unknown): Uint8Array {
    const v = this.version(this.project(idArg), vidArg);
    if (!v.pdf) throw notFound("this version has no PDF");
    return new Uint8Array(v.pdf);
  }

  // ── tauri plugins ────────────────────────────────────────────────────────────────────────

  private dialogSave(args: Record<string, unknown>): string {
    const options = isRecord(args.options) ? args.options : {};
    const suggested = typeof options.defaultPath === "string" ? options.defaultPath.replace(/\\/g, "/") : "export.pdf";
    return `/Users/demo/Desktop/${basename(suggested) || "export.pdf"}`;
  }

  private dialogOpen(args: Record<string, unknown>): string | string[] {
    const options = isRecord(args.options) ? args.options : {};
    const multiple = options.multiple === true;
    if (options.directory === true) return multiple ? ["/Users/demo/Documents/figures"] : "/Users/demo/Documents/figures";
    const files = ["/Users/demo/Desktop/figure-1.png", "/Users/demo/Desktop/data.csv"];
    return multiple ? files : files[0];
  }
}

/**
 * `plugin:dialog|message` returns the label of the pressed button; `ask()`/`confirm()` in
 * @tauri-apps/plugin-dialog compare it with their affirmative label, so always "press" that one.
 */
function dialogMessageAnswer(buttons: unknown): string | null {
  if (buttons === undefined || buttons === null) return null;
  if (buttons === "YesNo" || buttons === "YesNoCancel") return "Yes";
  if (typeof buttons === "string") return "Ok";
  if (isRecord(buttons)) {
    if (Array.isArray(buttons.OkCancelCustom)) return String(buttons.OkCancelCustom[0]);
    if (Array.isArray(buttons.YesNoCancelCustom)) return String(buttons.YesNoCancelCustom[0]);
    if (typeof buttons.OkCustom === "string") return buttons.OkCustom;
  }
  return "Ok";
}
