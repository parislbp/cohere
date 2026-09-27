/**
 * Document outline extraction (sectioning commands → tree), plus a few small,
 * dependency-free LaTeX text utilities shared with the CodeMirror language layer.
 */

export type OutlineKind =
  | "part"
  | "chapter"
  | "section"
  | "subsection"
  | "subsubsection"
  | "paragraph"
  | "subparagraph";

export interface OutlineItem {
  id: string;
  kind: OutlineKind;
  level: number;
  title: string;
  /** 1-based line number of the sectioning command. */
  line: number;
  starred: boolean;
  label: string | null;
  /** True for headings that follow an (uncommented) `\appendix`. */
  appendix: boolean;
}

export interface OutlineTreeNode extends OutlineItem {
  children: OutlineTreeNode[];
}

export const OUTLINE_LEVELS: Readonly<Record<OutlineKind, number>> = {
  part: -1,
  chapter: 0,
  section: 1,
  subsection: 2,
  subsubsection: 3,
  paragraph: 4,
  subparagraph: 5,
};

/** Environments whose bodies are raw text: no commands, comments or headings inside. */
export const VERBATIM_ENVIRONMENTS: ReadonlySet<string> = new Set([
  "verbatim",
  "verbatim*",
  "lstlisting",
  "minted",
  "comment",
  "filecontents",
  "filecontents*",
  "Verbatim",
]);

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Cuts a line at the first unescaped `%`. */
export function stripLineComment(line: string): string {
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "\\") {
      i++;
    } else if (ch === "%") {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * Index just past the group opened by the `{` or `[` at `text[open]`, honouring
 * `\`-escapes and nested groups (a `]` inside braces does not close a `[` group).
 * Returns -1 when the group is not closed within `text`.
 */
export function matchGroup(text: string, open: number): number {
  const openCh = text[open];
  const closeCh = openCh === "[" ? "]" : "}";
  let depth = 0;
  let braces = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === "\\") {
      i++;
      continue;
    }
    if (openCh !== "{") {
      if (ch === "{") braces++;
      else if (ch === "}") braces = Math.max(0, braces - 1);
      if (braces > 0) continue;
    }
    if (ch === openCh) depth++;
    else if (ch === closeCh && --depth === 0) return i + 1;
  }
  return -1;
}

const WRAPPER_RE =
  /\\(?:emph|textbf|textit|texttt|textsc|textsf|textrm|textmd|textup|textsl|textnormal|underline|uline|mathrm|mathit|mathbf|mathsf|mathtt|boldsymbol|code|kind|thead|mbox|text|hbox|MakeUppercase|MakeLowercase|uppercase|lowercase)\s*(?=\{)/;
const TEXORPDF_RE = /\\texorpdfstring\s*(?=\{)/;
// Private-use placeholders keep escaped braces safe from the stray-brace removal below.
const BRACE_L = "\uE000";
const BRACE_R = "\uE001";

/** Replaces `\cmd{inner}` at the given match with `inner` (or drops the command if unbalanced). */
function unwrapAt(s: string, index: number, length: number): string {
  const open = index + length;
  const end = matchGroup(s, open);
  if (end < 0) return s.slice(0, index) + s.slice(open);
  return s.slice(0, index) + s.slice(open + 1, end - 1) + s.slice(end);
}

/** Reduces a heading's LaTeX source to plain display text. */
export function cleanTitle(raw: string): string {
  let s = raw;
  // \texorpdfstring{tex}{plain} → plain
  for (let m = TEXORPDF_RE.exec(s), guard = 0; m && guard < 50; m = TEXORPDF_RE.exec(s), guard++) {
    const firstOpen = m.index + m[0].length;
    const firstEnd = matchGroup(s, firstOpen);
    if (firstEnd < 0 || s[firstEnd] !== "{") {
      s = s.slice(0, m.index) + s.slice(firstOpen);
      continue;
    }
    const secondEnd = matchGroup(s, firstEnd);
    const plain = secondEnd < 0 ? s.slice(firstEnd + 1) : s.slice(firstEnd + 1, secondEnd - 1);
    s = s.slice(0, m.index) + plain + (secondEnd < 0 ? "" : s.slice(secondEnd));
  }
  for (let m = WRAPPER_RE.exec(s), guard = 0; m && guard < 200; m = WRAPPER_RE.exec(s), guard++) {
    s = unwrapAt(s, m.index, m[0].length);
  }
  s = s
    .replace(/\\\{/g, BRACE_L)
    .replace(/\\\}/g, BRACE_R)
    .replace(/\\&/g, "&")
    .replace(/\\%/g, "%")
    .replace(/\\_/g, "_")
    .replace(/\\\$/g, "$")
    .replace(/\\#/g, "#")
    .replace(/\\,/g, "\u2009")
    .replace(/\\\\\*?/g, " ")
    .replace(/\\ /g, " ")
    .replace(/~/g, " ")
    .replace(/\\[a-zA-Z@]+\*?/g, "")
    .replace(/\\[^a-zA-Z@\s]/g, "")
    .replace(/[{}$]/g, "")
    .split(BRACE_L)
    .join("{")
    .split(BRACE_R)
    .join("}")
    .replace(/[ \t\r\n\f\v]+/g, " ")
    .trim();
  return s;
}

const SECTION_RE = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)(?![a-zA-Z@])/g;
const HEADING_TEST_RE = /\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?(?![a-zA-Z@])/;
const BEGIN_RE = /\\begin\s*\{([^}]*)\}/g;
const LABEL_RE = /\\label\s*\{([^}]*)\}/;
const APPENDIX_RE = /\\appendix(?![a-zA-Z@])/;

function skipBlanks(text: string, pos: number): number {
  while (pos < text.length && (text[pos] === " " || text[pos] === "\t")) pos++;
  return pos;
}

/** Contents of the group at `pos` (or the rest of the line if unclosed) and the index after it. */
function readGroup(text: string, pos: number): { inner: string; end: number } {
  const end = matchGroup(text, pos);
  if (end < 0) return { inner: text.slice(pos + 1), end: text.length };
  return { inner: text.slice(pos + 1, end - 1), end };
}

/** A `\label` on the next non-empty line, unless that line starts another heading. */
function labelOnFollowingLine(lines: readonly string[], from: number): string | null {
  for (let j = from; j < lines.length; j++) {
    const l = stripLineComment(lines[j]);
    if (l.trim() === "") continue;
    if (HEADING_TEST_RE.test(l)) return null;
    const m = LABEL_RE.exec(l);
    return m ? m[1].trim() : null;
  }
  return null;
}

/** Line-based scan for sectioning commands; comments and verbatim-like bodies are skipped. */
export function parseOutline(text: string): OutlineItem[] {
  const lines = text.split(/\r\n?|\n/);
  const items: OutlineItem[] = [];
  let verbatimEnv: string | null = null;
  let appendix = false;
  // `\appendix` only counts in the document body and outside macro definitions: the templates'
  // preamble defines `\startappendices` with `\appendix` inside, which must not flip the flag.
  let inBody = !/\\begin\{document\}/.test(text);

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
    if (!inBody && /\\begin\{document\}/.test(line)) inBody = true;
    const definesMacro = /\\(re)?newcommand|\\def\\/.test(line);
    const appendixAt = inBody && !definesMacro ? (APPENDIX_RE.exec(line)?.index ?? (/\\startappendices(?![a-zA-Z@])/.exec(line)?.index ?? -1)) : -1;

    for (const m of line.matchAll(SECTION_RE)) {
      const kind = m[1] as OutlineKind;
      const at = m.index ?? 0;
      let pos = skipBlanks(line, at + m[0].length);
      let short: string | null = null;
      if (line[pos] === "[") {
        const g = readGroup(line, pos);
        short = g.inner;
        pos = skipBlanks(line, g.end);
      }
      let titleRaw: string;
      let afterTitle: number;
      if (line[pos] === "{") {
        const g = readGroup(line, pos);
        titleRaw = g.inner;
        afterTitle = g.end;
      } else if (short !== null) {
        titleRaw = short;
        afterTitle = pos;
      } else {
        continue;
      }

      let label: string | null = null;
      const inner = LABEL_RE.exec(titleRaw);
      if (inner) {
        label = inner[1].trim();
        titleRaw = titleRaw.replace(inner[0], "");
      }
      if (label === null) {
        const same = LABEL_RE.exec(line.slice(afterTitle));
        if (same) label = same[1].trim();
      }
      if (label === null) label = labelOnFollowingLine(lines, i + 1);

      items.push({
        id: `${kind}:${i + 1}:${at}`,
        kind,
        level: OUTLINE_LEVELS[kind],
        title: cleanTitle(titleRaw),
        line: i + 1,
        starred: m[2] === "*",
        label,
        appendix: appendix || (appendixAt >= 0 && appendixAt < at),
      });
    }
    if (appendixAt >= 0) appendix = true;
  }
  return items;
}

/** Nests items by level: an item's children are the following items with a greater level. */
export function buildOutlineTree(items: readonly OutlineItem[]): OutlineTreeNode[] {
  const roots: OutlineTreeNode[] = [];
  const stack: OutlineTreeNode[] = [];
  for (const item of items) {
    const node: OutlineTreeNode = { ...item, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) stack.pop();
    if (stack.length > 0) stack[stack.length - 1].children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
}

/** The heading the given (1-based) line falls under: the last item starting at or before it. */
export function outlineItemAtLine(items: readonly OutlineItem[], line: number): OutlineItem | null {
  let lo = 0;
  let hi = items.length - 1;
  let found: OutlineItem | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].line <= line) {
      found = items[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
