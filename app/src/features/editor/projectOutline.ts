/**
 * Project-wide outline: follows `\input`/`\include`/`\subfile`/`\import` from the main
 * file and splices each included file's headings into the document order.
 */
import * as api from "@/api";
import { dirname, joinPath } from "@/lib/format";
import { parseOutline, stripLineComment, VERBATIM_ENVIRONMENTS, type OutlineItem } from "./outline";

export interface ProjectOutlineItem extends OutlineItem {
  /** Project-relative path of the file the heading lives in; `line` is 1-based within it. */
  file: string;
}

export interface FileSource {
  /** Text of a project-relative file, or null when it cannot be read as text. */
  read(path: string): Promise<string | null>;
}

export type InputKind = "input" | "include" | "subfile" | "import";

export interface InputRef {
  /** Path as written (normalised: no leading `./`), before resolution. */
  path: string;
  /** 1-based line of the command. */
  line: number;
  kind: InputKind;
}

export interface MissingInput {
  from: string;
  raw: string;
  line: number;
}

export interface ProjectOutline {
  items: ProjectOutlineItem[];
  /** Files visited, in document order (main file first). */
  files: string[];
  missing: MissingInput[];
}

export interface BuildOptions {
  /** Maximum nesting of includes to follow. Default 8. */
  maxDepth?: number;
  /** Maximum number of files to read. Default 300. */
  maxFiles?: number;
}

const ONE_ARG_RE = /\\(input|include|subfile|InputIfFileExists)(?![a-zA-Z@])\s*\{([^{}]*)\}/g;
const TWO_ARG_RE = /\\(import|subimport)\*?(?![a-zA-Z@])\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g;
const BEGIN_RE = /\\begin\s*\{([^}]*)\}/g;
const APPENDIX_RE = /\\appendix(?![a-zA-Z@])/;

const KIND_OF: Readonly<Record<string, InputKind>> = {
  input: "input",
  InputIfFileExists: "input",
  include: "include",
  subfile: "subfile",
  import: "import",
  subimport: "import",
};

/** Trims, drops leading `./` segments and rejects paths LaTeX would expand at runtime. */
function cleanInputPath(raw: string): string | null {
  if (raw.includes("#") || raw.includes("\\")) return null;
  let p = raw.trim();
  while (p.startsWith("./")) p = p.slice(2);
  return p === "" ? null : p;
}

/** Resolves `.` and `..` segments; leading `..` are kept (they point outside the project). */
export function normalizePath(path: string): string {
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length > 0 && out[out.length - 1] !== "..") out.pop();
      else out.push("..");
    } else {
      out.push(seg);
    }
  }
  return out.join("/");
}

/**
 * Walks lines the way `parseOutline` does (comments cut, verbatim bodies skipped),
 * calling `visit` with each effective line. Returns nothing; used by the scanners below.
 */
function eachCodeLine(text: string, visit: (line: string, lineNo: number) => void): void {
  const lines = text.split(/\r\n?|\n/);
  let verbatimEnv: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (verbatimEnv !== null) {
      if (lines[i].includes(`\\end{${verbatimEnv}}`)) verbatimEnv = null;
      continue;
    }
    let line = stripLineComment(lines[i]);
    for (const m of line.matchAll(BEGIN_RE)) {
      const env = m[1].trim();
      if (!VERBATIM_ENVIRONMENTS.has(env)) continue;
      const at = m.index ?? 0;
      if (!line.includes(`\\end{${env}}`, at)) verbatimEnv = env;
      line = line.slice(0, at);
      break;
    }
    visit(line, i + 1);
  }
}

/** File-inclusion commands in `text`, in order. `\includegraphics`, `\includepdf`, `\includeonly` are not inclusions. */
export function findInputs(text: string): InputRef[] {
  const out: InputRef[] = [];
  eachCodeLine(text, (line, lineNo) => {
    const found: { at: number; ref: InputRef }[] = [];
    for (const m of line.matchAll(ONE_ARG_RE)) {
      const path = cleanInputPath(m[2]);
      if (path) found.push({ at: m.index ?? 0, ref: { path, line: lineNo, kind: KIND_OF[m[1]] } });
    }
    for (const m of line.matchAll(TWO_ARG_RE)) {
      if (m[2].includes("\\") || m[2].includes("#")) continue;
      const dir = cleanInputPath(m[2]);
      const file = cleanInputPath(m[3]);
      if (!file) continue;
      found.push({ at: m.index ?? 0, ref: { path: dir ? joinPath(dir, file) : file, line: lineNo, kind: KIND_OF[m[1]] } });
    }
    found.sort((a, b) => a.at - b.at);
    for (const f of found) out.push(f.ref);
  });
  return out;
}

/**
 * 1-based lines that switch the document into appendix mode: an uncommented `\appendix` or the
 * templates' `\startappendices`, counted only after `\begin{document}` (the preamble defines
 * `\startappendices` with `\appendix` inside it, which must not count) and never inside a
 * `\newcommand`/`\renewcommand` line.
 */
function findAppendixLines(text: string): number[] {
  const out: number[] = [];
  let inBody = !/\\begin\{document\}/.test(text); // a file without a preamble (an \input) is all body
  eachCodeLine(text, (line, lineNo) => {
    if (!inBody) {
      if (/\\begin\{document\}/.test(line)) inBody = true;
      return;
    }
    if (/\\(re)?newcommand|\\def\\/.test(line)) return;
    if (APPENDIX_RE.test(line) || /\\startappendices(?![a-zA-Z@])/.test(line)) out.push(lineNo);
  });
  return out;
}

/**
 * Where an inclusion points. LaTeX resolves paths against the compile directory (the
 * main file's folder = project root), so root-relative candidates come first; the
 * including file's own folder is tried as a fallback for `\subfile`/`import`-style layouts.
 */
export function resolveInputPath(raw: string, fromFile: string, exists: (p: string) => boolean): string | null {
  const cleaned = cleanInputPath(raw);
  if (!cleaned) return null;
  const rootRel = normalizePath(cleaned);
  const sibling = normalizePath(joinPath(dirname(fromFile), cleaned));
  const candidates: string[] = [];
  for (const base of [rootRel, sibling]) {
    if (base === "" || base.startsWith("../")) continue;
    for (const c of [base, `${base}.tex`]) if (!candidates.includes(c)) candidates.push(c);
  }
  for (const c of candidates) if (exists(c)) return c;
  return null;
}

type Event = { line: number; order: number; kind: "item"; item: OutlineItem } | { line: number; order: number; kind: "input"; ref: InputRef } | { line: number; order: number; kind: "appendix" };

interface BuildContext {
  source: FileSource;
  exists: (p: string) => boolean;
  maxDepth: number;
  maxFiles: number;
  items: ProjectOutlineItem[];
  files: string[];
  missing: MissingInput[];
  visited: Set<string>;
  ids: Set<string>;
  appendix: boolean;
}

function uniqueId(ctx: BuildContext, file: string, line: number): string {
  const base = `${file}#${line}`;
  let id = base;
  for (let n = 2; ctx.ids.has(id); n++) id = `${base}:${n}`;
  ctx.ids.add(id);
  return id;
}

async function walkFile(ctx: BuildContext, file: string, depth: number): Promise<void> {
  if (ctx.visited.has(file) || ctx.files.length >= ctx.maxFiles) return;
  ctx.visited.add(file);
  const text = await ctx.source.read(file);
  if (text === null) return;
  ctx.files.push(file);

  // Interleave headings, inclusions and \appendix by line so the output is in document order.
  // Ties on the same line keep source order: headings first, then inclusions.
  const events: Event[] = [];
  for (const item of parseOutline(text)) events.push({ line: item.line, order: 0, kind: "item", item });
  for (const line of findAppendixLines(text)) events.push({ line, order: 1, kind: "appendix" });
  for (const ref of findInputs(text)) events.push({ line: ref.line, order: 2, kind: "input", ref });
  events.sort((a, b) => a.line - b.line || a.order - b.order);

  for (const ev of events) {
    if (ev.kind === "appendix") {
      ctx.appendix = true;
    } else if (ev.kind === "item") {
      ctx.items.push({ ...ev.item, id: uniqueId(ctx, file, ev.item.line), appendix: ev.item.appendix || ctx.appendix, file });
    } else {
      const target = resolveInputPath(ev.ref.path, file, ctx.exists);
      if (target === null) {
        ctx.missing.push({ from: file, raw: ev.ref.path, line: ev.line });
      } else if (depth < ctx.maxDepth) {
        await walkFile(ctx, target, depth + 1);
      }
    }
  }
}

/** Depth-first expansion of the main file. Each file is visited once; cycles and limits are guarded. */
export async function buildProjectOutline(mainFile: string, source: FileSource, exists: (p: string) => boolean, opts?: BuildOptions): Promise<ProjectOutline> {
  const ctx: BuildContext = {
    source,
    exists,
    maxDepth: opts?.maxDepth ?? 8,
    maxFiles: opts?.maxFiles ?? 300,
    items: [],
    files: [],
    missing: [],
    visited: new Set(),
    ids: new Set(),
    appendix: false,
  };
  await walkFile(ctx, mainFile, 0);
  return { items: ctx.items, files: ctx.files, missing: ctx.missing };
}

/** The heading the cursor falls under: the last item in `file` starting at or before `line`, else null. */
export function projectItemAtCursor(items: readonly ProjectOutlineItem[], file: string | null, line: number): ProjectOutlineItem | null {
  if (!file) return null;
  let found: ProjectOutlineItem | null = null;
  for (const it of items) {
    if (it.file === file && it.line <= line) found = it;
  }
  return found;
}

/**
 * A `FileSource` backed by open buffers (always fresh) with the backend as a fallback for
 * unopened files. Reads are memoised in `cache` — pass one in to keep it across rebuilds.
 */
export function makeSource(projectId: string, buffers: Record<string, { text: string; binary: boolean }>, cache: Map<string, Promise<string | null>> = new Map()): FileSource {
  return {
    read(path) {
      const buf = buffers[path];
      if (buf) return Promise.resolve(buf.binary ? null : buf.text);
      let p = cache.get(path);
      if (!p) {
        p = api.files
          .read(projectId, path)
          .then((c) => (c.binary ? null : c.text ?? ""))
          .catch(() => null);
        cache.set(path, p);
      }
      return p;
    },
  };
}
