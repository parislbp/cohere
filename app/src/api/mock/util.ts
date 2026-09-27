/** Helpers shared by the mock backend modules: errors, paths, ids, text detection, timing. */
import type { AppErrorShape, EngineId, MotionId, ThemeId } from "../types";

export const MOCK_DATA_DIR = "/Users/demo/Library/Application Support/com.cohere.desk";

export const THEMES: readonly ThemeId[] = ["paper", "mist", "ink", "graphite"];
export const MOTIONS: readonly MotionId[] = ["off", "slow", "normal", "fast"];
export const ENGINES: readonly EngineId[] = ["pdflatex", "xelatex", "lualatex"];

export const isEngine = (v: unknown): v is EngineId => typeof v === "string" && (ENGINES as readonly string[]).includes(v);

// ── errors (thrown as the plain `{ kind, message }` objects Tauri would serialise) ────────────

export function appError(kind: AppErrorShape["kind"], message: string): AppErrorShape {
  return { kind, message };
}
export const notFound = (what: string): AppErrorShape => appError("not_found", what);
export const invalid = (what: string): AppErrorShape => appError("invalid", what);
export const conflict = (what: string): AppErrorShape => appError("conflict", what);

// ── argument narrowing ───────────────────────────────────────────────────────────────────────

export const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function str(v: unknown, name: string): string {
  if (typeof v !== "string") throw invalid(`invalid args: ${name} must be a string`);
  return v;
}
export function optStr(v: unknown, name: string): string | null {
  return v === undefined || v === null ? null : str(v, name);
}
export function bool(v: unknown, name: string): boolean {
  if (typeof v !== "boolean") throw invalid(`invalid args: ${name} must be a boolean`);
  return v;
}
export function optNum(v: unknown, name: string): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) throw invalid(`invalid args: ${name} must be a number`);
  return v;
}
export function obj(v: unknown, name: string): Record<string, unknown> {
  if (!isRecord(v)) throw invalid(`invalid args: ${name} must be an object`);
  return v;
}
export function strList(v: unknown, name: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === "string")) throw invalid(`invalid args: ${name} must be a list of strings`);
  return v as string[];
}

// ── paths (mirror of paths.rs) ───────────────────────────────────────────────────────────────

/** `safe_join`: forward slashes, no `..`, no absolute paths; `""` means the project root. */
export function normalizePath(rel: string): string {
  const s = rel.trim().replace(/\\/g, "/");
  if (s === "" || s === ".") return "";
  if (s.startsWith("/")) throw invalid(`path escapes project: ${s}`);
  const out: string[] = [];
  for (const seg of s.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") throw invalid(`path escapes project: ${s}`);
    out.push(seg);
  }
  return out.join("/");
}

export function cleanName(name: string): string {
  const n = name.trim();
  if (n === "") throw invalid("name is empty");
  if (n === "." || n === ".." || n.includes("/") || n.includes("\\") || n.includes("\0")) throw invalid(`invalid name: ${n}`);
  if (n.length > 200) throw invalid("name is too long");
  return n;
}

export function validateId(id: string): string {
  if (id.length === 0 || id.length > 80) throw invalid("bad id");
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw invalid(`bad id: ${id}`);
  return id;
}

export const basename = (path: string): string => path.slice(path.lastIndexOf("/") + 1);
export const parentOf = (path: string): string => {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
};

/** Register every ancestor directory of `path`, the way `create_dir_all` does on disk. */
export function addParentDirs(dirs: Set<string>, path: string): void {
  for (let d = parentOf(path); d !== ""; d = parentOf(d)) dirs.add(d);
}

/** Lower-cased extension without the dot; `Makefile` reports `mk` like the Rust side. */
export function extension(name: string): string {
  const lower = name.toLowerCase();
  if (lower === "makefile") return "mk";
  const i = lower.lastIndexOf(".");
  return i <= 0 ? "" : lower.slice(i + 1);
}

export const TEXT_EXTENSIONS: ReadonlySet<string> = new Set([
  "tex", "bib", "sty", "cls", "bst", "bbx", "cbx", "lbx", "dbx", "def", "ltx", "dtx", "ins", "clo", "fd", "cfg",
  "txt", "md", "markdown", "json", "yaml", "yml", "toml", "csv", "tsv", "dat", "log", "ini", "py", "r", "jl", "sh",
  "mk", "tikz", "pgf", "svg", "html", "xml", "aux", "gitignore",
]);
export const IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);
const IGNORED_NAMES: ReadonlySet<string> = new Set([".DS_Store", "Thumbs.db", ".git"]);

export const isIgnoredName = (name: string): boolean => IGNORED_NAMES.has(name);
/** Names the tree listing hides: ignored names plus atomic-write temp files. */
export const isHiddenName = (name: string): boolean => isIgnoredName(name) || name.startsWith(".tmp-") || name.startsWith(".main.");

// ── bytes & text ─────────────────────────────────────────────────────────────────────────────

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const utf8 = (text: string): Uint8Array => encoder.encode(text);
export const byteLength = (text: string): number => encoder.encode(text).length;
export const decodeUtf8 = (bytes: Uint8Array): string => decoder.decode(bytes);

/** Valid UTF-8 with no NUL in the first 8 KiB. */
export function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.subarray(0, 8192).includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

const base64ToBytes = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** A valid 1×1 transparent PNG, served for every image file in the mock. */
export const PNG_1X1: Uint8Array = base64ToBytes(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
);

// ── ordering ─────────────────────────────────────────────────────────────────────────────────

type NaturalPart = [kind: 0 | 1, num: number, text: string];

function naturalKey(name: string): NaturalPart[] {
  const parts: NaturalPart[] = [];
  for (const m of name.matchAll(/(\d+)|(\D+)/g)) {
    if (m[1] !== undefined) parts.push([0, Number(m[1]), ""]);
    else parts.push([1, 0, m[2].toLowerCase()]);
  }
  return parts;
}

/** Same ordering as `files::natural_key`: digit runs compare numerically, text case-insensitively. */
export function naturalCompare(a: string, b: string): number {
  const ka = naturalKey(a);
  const kb = naturalKey(b);
  const n = Math.min(ka.length, kb.length);
  for (let i = 0; i < n; i++) {
    const [ta, na, sa] = ka[i];
    const [tb, nb, sb] = kb[i];
    if (ta !== tb) return ta - tb;
    if (na !== nb) return na - nb;
    if (sa !== sb) return sa < sb ? -1 : 1;
  }
  return ka.length - kb.length;
}

// ── names, ids, time ─────────────────────────────────────────────────────────────────────────

export function slug(title: string): string {
  const s = title.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-{2,}/g, "-").replace(/^-+|-+$/g, "");
  return s === "" ? "project" : s;
}

function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(out);
  else for (let i = 0; i < n; i++) out[i] = Math.floor(Math.random() * 256);
  return out;
}

export const hex = (n: number): string => Array.from(randomBytes(Math.ceil(n / 2)), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, n);

export function uuid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const pad2 = (n: number): string => String(n).padStart(2, "0");

/** `%Y%m%d-%H%M%S` in UTC, the prefix Rust uses for version ids. */
export function stamp(d: Date): string {
  return `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}-${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}`;
}

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
