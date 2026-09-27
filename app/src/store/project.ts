/**
 * Project store — the open editing session: file tree, open buffers with autosave,
 * compile state + diagnostics, the current PDF, and versions.
 */
import { create } from "zustand";
import * as api from "@/api";
import { onCompileLog, onCompileStatus } from "@/api/events";
import type { CompileResult, CompileStatus, Diagnostic, FileNode, OutputInfo, ProjectSummary, VersionInfo } from "@/api/types";
import { basename, dirname, joinPath } from "@/lib/format";
import { useLibraryStore } from "./library";
import { useSettingsStore } from "./settings";
import { errorMessage, toast } from "./ui";

export interface Buffer {
  path: string;
  text: string;
  savedText: string;
  dirty: boolean;
  saving: boolean;
  savedAt: number | null;
  binary: boolean;
  image: boolean;
  ext: string;
  error: string | null;
}

export type SessionCompileStatus = "idle" | "running" | CompileStatus;

/** What the outline panel lists: the active file's headings, or the whole document from the main file. */
export type OutlineScope = "file" | "project";

const OUTLINE_SCOPE_KEY = "cohere.outlineScope";

/** Whole-document outline by default; "file" only when the user chose it. */
function readOutlineScope(): OutlineScope {
  try {
    return localStorage.getItem(OUTLINE_SCOPE_KEY) === "file" ? "file" : "project";
  } catch {
    return "project";
  }
}

export interface Jump {
  path: string;
  line: number;
  seq: number;
}


interface ProjectState {
  projectId: string | null;
  project: ProjectSummary | null;
  /** Absolute path of the project's src/ folder (for reveal-in-Finder). */
  srcDir: string | null;
  tree: FileNode[];
  buffers: Record<string, Buffer>;
  openPaths: string[];
  activePath: string | null;
  selectedDir: string;
  cursorLine: number;
  diagnostics: Diagnostic[];
  compileStatus: SessionCompileStatus;
  compileResult: CompileResult | null;
  compileLog: string[];
  output: OutputInfo | null;
  pdfData: Uint8Array | null;
  pdfLoading: boolean;
  versions: VersionInfo[];
  loading: boolean;
  jump: Jump | null;
  outlineScope: OutlineScope;

  open: (id: string) => Promise<void>;
  close: () => Promise<void>;
  openFile: (path: string, opts?: { line?: number }) => Promise<void>;
  closeFile: (path: string) => void;
  setActive: (path: string) => void;
  setSelectedDir: (dir: string) => void;
  setText: (path: string, text: string) => void;
  setCursorLine: (line: number) => void;
  saveFile: (path: string) => Promise<void>;
  saveAll: () => Promise<void>;
  compile: () => Promise<void>;
  cancelCompile: () => Promise<void>;
  refreshTree: () => Promise<void>;
  createFile: (dir: string, name: string, content?: string) => Promise<FileNode>;
  createFolder: (dir: string, name: string) => Promise<FileNode>;
  renameEntry: (from: string, to: string) => Promise<void>;
  deleteEntry: (path: string) => Promise<void>;
  importFiles: (dir: string, sources: string[]) => Promise<FileNode[]>;
  setMainFile: (path: string) => Promise<void>;
  loadPdf: () => Promise<void>;
  createVersion: (name: string, note: string) => Promise<VersionInfo>;
  renameVersion: (vid: string, name: string, note: string) => Promise<void>;
  deleteVersion: (vid: string) => Promise<void>;
  jumpTo: (path: string, line: number) => Promise<void>;
  clearJump: () => void;
  setOutlineScope: (scope: OutlineScope) => void;
  toggleOutlineScope: () => void;
}

const saveTimers = new Map<string, number>();
let eventsBound = false;
let jumpSeq = 0;

function bindEvents() {
  if (eventsBound) return;
  eventsBound = true;
  void onCompileLog((e) => {
    const s = useProjectStore.getState();
    if (e.projectId !== s.projectId) return;
    useProjectStore.setState({ compileLog: [...s.compileLog.slice(-800), e.line] });
  });
  void onCompileStatus((e) => {
    const s = useProjectStore.getState();
    if (e.projectId !== s.projectId) return;
    if (e.status === "running") useProjectStore.setState({ compileStatus: "running" });
  });
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projectId: null,
  project: null,
  srcDir: null,
  tree: [],
  buffers: {},
  openPaths: [],
  activePath: null,
  selectedDir: "",
  cursorLine: 1,
  diagnostics: [],
  compileStatus: "idle",
  compileResult: null,
  compileLog: [],
  output: null,
  pdfData: null,
  pdfLoading: false,
  versions: [],
  loading: false,
  jump: null,
  outlineScope: readOutlineScope(),

  open: async (id) => {
    bindEvents();
    const prev = get();
    if (prev.projectId && prev.projectId !== id) await prev.close();
    set({ loading: true, projectId: id, buffers: {}, openPaths: [], activePath: null, diagnostics: [], compileResult: null, compileLog: [], pdfData: null, jump: null });
    try {
      const detail = await api.files.open(id);
      set({
        project: detail.project,
        srcDir: detail.srcDir,
        tree: detail.tree,
        output: detail.output,
        versions: detail.versions,
        compileStatus: detail.compiling ? "running" : "idle",
        loading: false,
        selectedDir: "",
      });
      const first = detail.project.lastOpenedFile && findNode(detail.tree, detail.project.lastOpenedFile) ? detail.project.lastOpenedFile : detail.project.mainFile;
      await get().openFile(first);
      if (detail.output) void get().loadPdf();
    } catch (e) {
      set({ loading: false, projectId: null, project: null });
      throw e;
    }
  },

  close: async () => {
    await get().saveAll();
    for (const t of saveTimers.values()) window.clearTimeout(t);
    saveTimers.clear();
    const id = get().projectId;
    if (id) {
      try {
        const p = await api.library.get(id);
        useLibraryStore.getState().upsert(p);
      } catch {
        /* project may have been deleted */
      }
    }
    set({ projectId: null, project: null, srcDir: null, tree: [], buffers: {}, openPaths: [], activePath: null, diagnostics: [], compileStatus: "idle", compileResult: null, compileLog: [], output: null, pdfData: null, versions: [], jump: null });
  },

  openFile: async (path, opts) => {
    const { projectId, buffers, openPaths } = get();
    if (!projectId) return;
    if (!buffers[path]) {
      try {
        const c = await api.files.read(projectId, path);
        const buf: Buffer = { path, text: c.text ?? "", savedText: c.text ?? "", dirty: false, saving: false, savedAt: null, binary: c.binary, image: c.image, ext: c.ext, error: null };
        set((s) => ({ buffers: { ...s.buffers, [path]: buf } }));
      } catch (e) {
        toast(errorMessage(e), "err");
        return;
      }
    }
    set({ openPaths: openPaths.includes(path) ? openPaths : [...openPaths, path], activePath: path, selectedDir: dirname(path) });
    if (opts?.line) set({ jump: { path, line: opts.line, seq: ++jumpSeq } });
    const proj = get().project;
    if (proj && proj.lastOpenedFile !== path) {
      api.library.update(projectId, { lastOpenedFile: path }).then((p) => set({ project: p })).catch(() => {});
    }
  },

  closeFile: (path) => {
    const s = get();
    const buf = s.buffers[path];
    if (buf?.dirty) void s.saveFile(path);
    const openPaths = s.openPaths.filter((p) => p !== path);
    let activePath = s.activePath;
    if (activePath === path) {
      const i = s.openPaths.indexOf(path);
      activePath = openPaths[Math.min(i, openPaths.length - 1)] ?? null;
    }
    const buffers = { ...s.buffers };
    if (!buf?.dirty) delete buffers[path];
    set({ openPaths, activePath, buffers });
  },

  setActive: (path) => {
    if (get().buffers[path]) set({ activePath: path, selectedDir: dirname(path) });
  },
  setSelectedDir: (dir) => set({ selectedDir: dir }),

  setText: (path, text) => {
    const s = get();
    const buf = s.buffers[path];
    if (!buf || buf.text === text) return;
    set({ buffers: { ...s.buffers, [path]: { ...buf, text, dirty: text !== buf.savedText } } });
    const delay = useSettingsStore.getState().settings.autosaveMs;
    const existing = saveTimers.get(path);
    if (existing) window.clearTimeout(existing);
    saveTimers.set(
      path,
      window.setTimeout(() => {
        saveTimers.delete(path);
        void get().saveFile(path);
      }, delay),
    );
  },

  setCursorLine: (line) => {
    if (get().cursorLine !== line) set({ cursorLine: line });
  },

  saveFile: async (path) => {
    const s = get();
    const buf = s.buffers[path];
    const id = s.projectId;
    if (!id || !buf || !buf.dirty || buf.binary) return;
    const text = buf.text;
    set((st) => ({ buffers: { ...st.buffers, [path]: { ...st.buffers[path], saving: true } } }));
    try {
      await api.files.write(id, path, text);
      set((st) => {
        const cur = st.buffers[path];
        if (!cur) return {};
        return { buffers: { ...st.buffers, [path]: { ...cur, savedText: text, dirty: cur.text !== text, saving: false, savedAt: Date.now(), error: null } } };
      });
      const wasClosed = !get().openPaths.includes(path);
      if (wasClosed) {
        set((st) => {
          const buffers = { ...st.buffers };
          if (!buffers[path]?.dirty) delete buffers[path];
          return { buffers };
        });
      }
      if (useSettingsStore.getState().settings.compileOnSave && get().compileStatus !== "running") void get().compile();
    } catch (e) {
      set((st) => ({ buffers: { ...st.buffers, [path]: { ...st.buffers[path], saving: false, error: errorMessage(e) } } }));
      toast(`Could not save ${basename(path)}: ${errorMessage(e)}`, "err");
    }
  },

  saveAll: async () => {
    const s = get();
    for (const t of saveTimers.values()) window.clearTimeout(t);
    saveTimers.clear();
    await Promise.all(Object.values(s.buffers).filter((b) => b.dirty).map((b) => s.saveFile(b.path)));
  },

  compile: async () => {
    const s = get();
    const id = s.projectId;
    if (!id || s.compileStatus === "running") return;
    await s.saveAll();
    set({ compileStatus: "running", compileLog: [], compileResult: null });
    try {
      const result = await api.compile.run(id);
      set({ compileStatus: result.status, compileResult: result, diagnostics: result.diagnostics, output: result.output ?? get().output });
      if (result.pdfUpdated) await get().loadPdf();
      if (result.status === "failed") toast(`Compile failed — ${result.errorCount} error${result.errorCount === 1 ? "" : "s"}`, "err");
    } catch (e) {
      const message = errorMessage(e);
      set({
        compileStatus: "failed",
        diagnostics: [{ severity: "error", file: null, line: null, message, detail: "", source: "latexmk" }],
        compileResult: null,
      });
      toast(message, "err");
    }
  },

  cancelCompile: async () => {
    const id = get().projectId;
    if (!id) return;
    try {
      await api.compile.cancel(id);
    } catch {
      /* not running */
    }
  },

  refreshTree: async () => {
    const id = get().projectId;
    if (!id) return;
    try {
      set({ tree: await api.files.tree(id) });
    } catch (e) {
      toast(errorMessage(e), "err");
    }
  },

  createFile: async (dir, name, content) => {
    const id = get().projectId;
    if (!id) throw new Error("no project");
    const node = await api.files.createFile(id, joinPath(dir, name), content);
    await get().refreshTree();
    await get().openFile(node.path);
    return node;
  },

  createFolder: async (dir, name) => {
    const id = get().projectId;
    if (!id) throw new Error("no project");
    const node = await api.files.createFolder(id, joinPath(dir, name));
    await get().refreshTree();
    set({ selectedDir: node.path });
    return node;
  },

  renameEntry: async (from, to) => {
    const id = get().projectId;
    if (!id) return;
    await get().saveAll();
    await api.files.rename(id, from, to);
    set((s) => {
      const buffers: Record<string, Buffer> = {};
      for (const [p, b] of Object.entries(s.buffers)) {
        const np = p === from ? to : p.startsWith(from + "/") ? to + p.slice(from.length) : p;
        buffers[np] = { ...b, path: np };
      }
      const remap = (p: string) => (p === from ? to : p.startsWith(from + "/") ? to + p.slice(from.length) : p);
      return { buffers, openPaths: s.openPaths.map(remap), activePath: s.activePath ? remap(s.activePath) : null };
    });
    const proj = get().project;
    if (proj && proj.mainFile === from) {
      const p = await api.library.update(id, { mainFile: to });
      set({ project: p });
    }
    await get().refreshTree();
  },

  deleteEntry: async (path) => {
    const id = get().projectId;
    if (!id) return;
    await api.files.remove(id, path);
    set((s) => {
      const gone = (p: string) => p === path || p.startsWith(path + "/");
      const buffers: Record<string, Buffer> = {};
      for (const [p, b] of Object.entries(s.buffers)) if (!gone(p)) buffers[p] = b;
      const openPaths = s.openPaths.filter((p) => !gone(p));
      const activePath = s.activePath && !gone(s.activePath) ? s.activePath : openPaths[openPaths.length - 1] ?? null;
      return { buffers, openPaths, activePath };
    });
    await get().refreshTree();
  },

  importFiles: async (dir, sources) => {
    const id = get().projectId;
    if (!id) return [];
    const nodes = await api.files.import(id, dir, sources);
    await get().refreshTree();
    return nodes;
  },

  setMainFile: async (path) => {
    const id = get().projectId;
    if (!id) return;
    const p = await api.library.update(id, { mainFile: path });
    set({ project: p });
  },

  loadPdf: async () => {
    const id = get().projectId;
    if (!id) return;
    set({ pdfLoading: true });
    try {
      const bytes = await api.compile.readPdf(id);
      if (get().projectId === id) set({ pdfData: bytes, pdfLoading: false });
    } catch {
      set({ pdfLoading: false });
    }
  },

  createVersion: async (name, note) => {
    const id = get().projectId;
    if (!id) throw new Error("no project");
    await get().saveAll();
    const v = await api.versions.create(id, name, note);
    set((s) => ({ versions: [v, ...s.versions] }));
    return v;
  },

  renameVersion: async (vid, name, note) => {
    const id = get().projectId;
    if (!id) return;
    const v = await api.versions.rename(id, vid, name, note);
    set((s) => ({ versions: s.versions.map((x) => (x.id === vid ? v : x)) }));
  },

  deleteVersion: async (vid) => {
    const id = get().projectId;
    if (!id) return;
    await api.versions.remove(id, vid);
    set((s) => ({ versions: s.versions.filter((v) => v.id !== vid) }));
  },

  jumpTo: async (path, line) => {
    await get().openFile(path, { line });
    set({ jump: { path, line, seq: ++jumpSeq } });
  },
  clearJump: () => set({ jump: null }),

  setOutlineScope: (scope) => {
    set({ outlineScope: scope });
    try {
      localStorage.setItem(OUTLINE_SCOPE_KEY, scope);
    } catch {
      /* private mode */
    }
  },
  toggleOutlineScope: () => get().setOutlineScope(get().outlineScope === "file" ? "project" : "file"),
}));

export function findNode(tree: FileNode[], path: string): FileNode | null {
  for (const n of tree) {
    if (n.path === path) return n;
    if (n.children) {
      const hit = findNode(n.children, path);
      if (hit) return hit;
    }
  }
  return null;
}

export function flattenTree(tree: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  const walk = (nodes: FileNode[]) => {
    for (const n of nodes) {
      out.push(n);
      if (n.children) walk(n.children);
    }
  };
  walk(tree);
  return out;
}
