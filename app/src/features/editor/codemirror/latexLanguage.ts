import {
  LanguageSupport,
  StreamLanguage,
  foldService,
  syntaxHighlighting,
  type IndentContext,
  type StringStream,
} from "@codemirror/language";
import type { EditorState, Extension, Line, Text } from "@codemirror/state";
import { tags } from "@lezer/highlight";
import { escapeRegExp, stripLineComment, VERBATIM_ENVIRONMENTS } from "../outline";
import { latexEnvironmentKeymap } from "./latexCompletions";
import { latexHighlightStyle, latexTags } from "./latexHighlight";

export { latexTags } from "./latexHighlight";

// ---------------------------------------------------------------- vocabulary

/** Sectioning commands (LaTeX + KOMA-Script unnumbered variants) and their outline levels. */
export const SECTIONING_LEVELS: Readonly<Record<string, number>> = {
  part: -1,
  addpart: -1,
  chapter: 0,
  addchap: 0,
  section: 1,
  addsec: 1,
  subsection: 2,
  subsubsection: 3,
  paragraph: 4,
  subparagraph: 5,
};
const SECTIONING_COMMANDS: ReadonlySet<string> = new Set(Object.keys(SECTIONING_LEVELS));

const STRUCTURE_KEYWORDS: ReadonlySet<string> = new Set([
  "documentclass", "usepackage", "RequirePackage", "begin", "end", "input", "include", "subfile", "includegraphics",
  "newcommand", "renewcommand", "providecommand", "newenvironment", "renewenvironment", "def", "let", "newtheorem",
  "label", "ref", "eqref", "autoref", "cref", "Cref", "pageref", "nameref", "vref",
  "cite", "parencite", "textcite", "autocite", "footcite", "nocite", "citep", "citet", "citeauthor", "citeyear",
  "bibliography", "bibliographystyle", "addbibresource", "printbibliography",
  "tableofcontents", "listoffigures", "listoftables", "maketitle", "title", "author", "date", "caption", "item", "appendix",
]);

/** Commands whose braced argument is a label or a citation-key list. */
const REF_ARG_COMMANDS: ReadonlySet<string> = new Set([
  "label", "ref", "eqref", "autoref", "cref", "Cref", "pageref", "nameref", "vref", "Vref", "vpageref",
  "cite", "Cite", "parencite", "Parencite", "textcite", "Textcite", "autocite", "Autocite", "footcite", "footfullcite",
  "fullcite", "smartcite", "supercite", "nocite", "citep", "citet", "citealp", "citealt", "citeauthor", "citeyear", "citeyearpar",
]);

/** Commands whose braced argument is a file path, package name or URL (read raw: no `%` comments inside). */
const STRING_ARG_COMMANDS: ReadonlySet<string> = new Set([
  "input", "include", "includeonly", "subfile", "includegraphics", "includesvg", "includepdf", "includestandalone",
  "addbibresource", "bibliography", "bibliographystyle", "usepackage", "RequirePackage", "documentclass",
  "url", "href", "path", "nolinkurl", "lstinputlisting", "verbatiminput", "graphicspath",
]);

/** `\verb|...|`-style commands: the next character is the delimiter. */
const INLINE_VERBATIM_COMMANDS: ReadonlySet<string> = new Set(["verb", "Verb", "lstinline"]);

export const MATH_ENVIRONMENTS: ReadonlySet<string> = new Set([
  "equation", "equation*", "align", "align*", "alignat", "alignat*", "flalign", "flalign*", "gather", "gather*",
  "multline", "multline*", "eqnarray", "eqnarray*", "displaymath", "math", "split", "cases", "dcases", "rcases",
  "pmatrix", "bmatrix", "Bmatrix", "matrix", "vmatrix", "Vmatrix", "smallmatrix", "array", "subequations",
  "gathered", "aligned", "alignedat", "IEEEeqnarray", "IEEEeqnarray*", "empheq",
]);

const LENGTH_UNITS = "pt|pc|in|bp|cm|mm|dd|cc|sp|ex|em|mu|px|fil{1,3}";
const COMMAND_RE = /^\\([a-zA-Z@]+\*?)/;
const NUMBER_WITH_UNIT_RE = new RegExp(`^-?(?:\\d+\\.?\\d*|\\.\\d+)(${LENGTH_UNITS})?(?![a-zA-Z])`);
const MATH_NUMBER_RE = /^(?:\d+\.?\d*|\.\d+)/;
/** Plain prose: everything that cannot start a token of its own. */
const TEXT_RUN_RE = /[^\\%$&~{}[\]`'\-\d]/;
/** Math prose: stops at commands, delimiters, scripts, alignment, groups, comments and digits. */
const MATH_RUN_RE = /[^\\$^_&{}[\]%\d]/;

// ---------------------------------------------------------------- token names

const T = {
  comment: "comment",
  command: "command",
  mathCommand: "mathCommand",
  sectioning: "sectioning",
  envName: "envName",
  mathDelim: "mathDelim",
  mathContent: "mathContent",
  ref: "ref",
  option: "option",
  verbatim: "verbatim",
  special: "special",
  brace: "brace",
  keyword: "keyword",
  string: "string",
  number: "number",
} as const;

// ---------------------------------------------------------------- state

type Mode = "text" | "math" | "verbatim";
type ArgKind = "ref" | "string" | "envBegin" | "envEnd";

export interface LatexState {
  mode: Mode;
  /** Closer of delimiter-started math (`$`, `$$`, `\)`, `\]`); null while in environment math. */
  mathClose: string | null;
  /** Environment that opened the current math mode, if any. */
  mathEnv: string | null;
  /** Verbatim-like environment whose body is being read. */
  verbEnv: string | null;
  /** Still on the `\begin{<verbatim-like>}` line, where `[opts]` / `{lang}` may follow. */
  verbHeader: boolean;
  /** `\verb` was just read; the next character is its delimiter. */
  verbInline: boolean;
  /** Open environments, innermost last. */
  envStack: string[];
  /** Previous token was a command (or `\begin{env}`), so `[` opens an optional argument. */
  afterCommand: boolean;
  /** How to tokenise the contents of the next braced argument. */
  argKind: ArgKind | null;
  /** Brace depth inside the argument being read (0 = not inside one). */
  argDepth: number;
  /** Accumulated argument text (used for environment names). */
  argText: string;
  /** Inside a `[...]` optional argument, which may span lines. */
  inOption: boolean;
}

function startState(): LatexState {
  return {
    mode: "text",
    mathClose: null,
    mathEnv: null,
    verbEnv: null,
    verbHeader: false,
    verbInline: false,
    envStack: [],
    afterCommand: false,
    argKind: null,
    argDepth: 0,
    argText: "",
    inOption: false,
  };
}

function copyState(state: LatexState): LatexState {
  return { ...state, envStack: state.envStack.slice() };
}

function matchRe(stream: StringStream, re: RegExp): RegExpMatchArray | null {
  const m = stream.match(re);
  return typeof m === "object" ? m : null;
}

function resetArgument(state: LatexState): void {
  state.argKind = null;
  state.argDepth = 0;
  state.argText = "";
}

function enterMath(state: LatexState, close: string): void {
  state.mode = "math";
  state.mathClose = close;
  state.mathEnv = null;
}

function exitMath(state: LatexState): void {
  state.mode = "text";
  state.mathClose = null;
  state.mathEnv = null;
}

/** TeX forbids paragraph breaks in `$`/`\[` math and in arguments, so a blank line resets them. */
function paragraphBreak(state: LatexState): void {
  if (state.mode === "math" && state.mathClose !== null) exitMath(state);
  resetArgument(state);
  state.inOption = false;
  state.afterCommand = false;
  state.verbInline = false;
}

function beginEnvironment(state: LatexState, name: string): void {
  if (name === "") return;
  state.envStack.push(name);
  if (VERBATIM_ENVIRONMENTS.has(name)) {
    state.mode = "verbatim";
    state.verbEnv = name;
    state.verbHeader = true;
    state.mathClose = null;
    state.mathEnv = null;
  } else if (state.mode === "text" && MATH_ENVIRONMENTS.has(name)) {
    state.mode = "math";
    state.mathClose = null;
    state.mathEnv = name;
  }
}

function endEnvironment(state: LatexState, name: string): void {
  if (name === "") return;
  const idx = state.envStack.lastIndexOf(name);
  if (idx >= 0) state.envStack.length = idx;
  if (state.mode === "math" && state.mathEnv !== null && !state.envStack.includes(state.mathEnv)) exitMath(state);
}

// ---------------------------------------------------------------- tokenizer

function startLine(stream: StringStream, state: LatexState): void {
  state.afterCommand = false;
  state.verbInline = false;
  state.verbHeader = false;
  if (state.argKind === "envBegin" || state.argKind === "envEnd") resetArgument(state);
  else if (state.argDepth === 0 && !state.inOption) state.argKind = null;
  if (state.mode !== "verbatim" && /^\s*$/.test(stream.string)) paragraphBreak(state);
}

function commandToken(name: string, state: LatexState, inMath: boolean): string {
  const base = name.endsWith("*") ? name.slice(0, -1) : name;
  if (base === "begin") {
    state.argKind = "envBegin";
    return T.keyword;
  }
  if (base === "end") {
    state.argKind = "envEnd";
    return T.keyword;
  }
  state.afterCommand = true;
  if (REF_ARG_COMMANDS.has(base)) {
    state.argKind = "ref";
    return T.keyword;
  }
  if (inMath) return T.mathCommand;
  if (SECTIONING_COMMANDS.has(base)) return T.sectioning;
  if (STRING_ARG_COMMANDS.has(base)) {
    state.argKind = "string";
    return STRUCTURE_KEYWORDS.has(base) ? T.keyword : T.command;
  }
  if (INLINE_VERBATIM_COMMANDS.has(base)) {
    state.verbInline = true;
    state.afterCommand = false;
    return T.command;
  }
  return STRUCTURE_KEYWORDS.has(base) ? T.keyword : T.command;
}

function openBrace(stream: StringStream, state: LatexState, pendingArg: ArgKind | null): string {
  stream.next();
  if (pendingArg !== null) {
    state.argKind = pendingArg;
    state.argDepth = 1;
    state.argText = "";
  }
  return T.brace;
}

function openOption(stream: StringStream, state: LatexState, pendingArg: ArgKind | null): string {
  stream.next();
  state.inOption = true;
  state.afterCommand = true;
  state.argKind = pendingArg;
  return T.brace;
}

function textToken(stream: StringStream, state: LatexState): string | null {
  const pendingArg = state.argKind;
  const afterCommand = state.afterCommand;
  state.argKind = null;
  state.afterCommand = false;

  const ch = stream.peek();
  if (ch === undefined) return null;
  if (ch === "\\") {
    if (stream.match("\\[")) {
      enterMath(state, "\\]");
      return T.mathDelim;
    }
    if (stream.match("\\(")) {
      enterMath(state, "\\)");
      return T.mathDelim;
    }
    if (stream.match(/^\\\\\*?/)) {
      state.afterCommand = true;
      return T.special;
    }
    const m = matchRe(stream, COMMAND_RE);
    if (m) return commandToken(m[1], state, false);
    if (!stream.match(/^\\./)) stream.next();
    return T.command;
  }
  if (ch === "$") {
    const close = stream.match("$$") ? "$$" : "$";
    if (close === "$") stream.next();
    enterMath(state, close);
    return T.mathDelim;
  }
  if (ch === "{") return openBrace(stream, state, pendingArg);
  if (ch === "}") {
    stream.next();
    return T.brace;
  }
  if (ch === "[" && afterCommand) return openOption(stream, state, pendingArg);
  if (ch === "&" || ch === "~") {
    stream.next();
    return T.special;
  }
  if (stream.match("``") || stream.match("''") || stream.match("---") || stream.match("--")) return T.special;
  if (/[\d.-]/.test(ch)) {
    const num = matchRe(stream, NUMBER_WITH_UNIT_RE);
    if (num) return num[1] !== undefined || stream.peek() === "\\" ? T.number : null;
  }
  if (!stream.eatWhile(TEXT_RUN_RE)) stream.next();
  return null;
}

function mathToken(stream: StringStream, state: LatexState): string | null {
  const pendingArg = state.argKind;
  const afterCommand = state.afterCommand;
  state.argKind = null;
  state.afterCommand = false;

  const ch = stream.peek();
  if (ch === undefined) return null;
  if (state.mathClose !== null && stream.match(state.mathClose)) {
    exitMath(state);
    return T.mathDelim;
  }
  if (ch === "\\") {
    if (stream.match(/^\\\\\*?/)) {
      state.afterCommand = true;
      return T.special;
    }
    // A mismatched closer still ends math: better to recover than to leak math to the end of the file.
    if (stream.match("\\]") || stream.match("\\)")) {
      exitMath(state);
      return T.mathDelim;
    }
    if (stream.match("\\[") || stream.match("\\(")) return T.mathDelim;
    const m = matchRe(stream, COMMAND_RE);
    if (m) return commandToken(m[1], state, true);
    if (!stream.match(/^\\./)) stream.next();
    return T.mathCommand;
  }
  if (ch === "$") {
    if (!stream.match("$$")) stream.next();
    return T.mathDelim;
  }
  if (ch === "{") return openBrace(stream, state, pendingArg);
  if (ch === "}") {
    stream.next();
    return T.brace;
  }
  if (ch === "[" && afterCommand) return openOption(stream, state, pendingArg);
  if (ch === "^" || ch === "_" || ch === "&") {
    stream.next();
    return T.special;
  }
  if (matchRe(stream, MATH_NUMBER_RE)) return T.number;
  if (!stream.eatWhile(MATH_RUN_RE)) stream.next();
  return T.mathContent;
}

function argumentTokenName(kind: ArgKind | null): string {
  switch (kind) {
    case "ref":
      return T.ref;
    case "envBegin":
    case "envEnd":
      return T.envName;
    default:
      return T.string;
  }
}

/** Raw contents of a `{...}` argument (nested braces allowed), then its closing brace. */
function argumentToken(stream: StringStream, state: LatexState): string {
  const start = stream.pos;
  while (!stream.eol()) {
    const ch = stream.peek();
    if (ch === "}" && state.argDepth === 1) break;
    if (ch === "\\") stream.next();
    else if (ch === "{") state.argDepth++;
    else if (ch === "}") state.argDepth--;
    stream.next();
  }
  if (stream.pos > start) {
    const kind = state.argKind;
    if (kind === "envBegin" || kind === "envEnd") state.argText += stream.current();
    return argumentTokenName(kind);
  }
  stream.next();
  const kind = state.argKind;
  const name = state.argText.trim();
  resetArgument(state);
  if (kind === "envBegin") {
    beginEnvironment(state, name);
    state.afterCommand = true;
  } else if (kind === "envEnd") {
    endEnvironment(state, name);
  }
  return T.brace;
}

/** Contents of a `[...]` optional argument; `%` comments and `]` inside braces are respected. */
function optionToken(stream: StringStream, state: LatexState): string {
  const first = stream.peek();
  if (first === "%") {
    stream.skipToEnd();
    return T.comment;
  }
  if (first === "]") {
    stream.next();
    state.inOption = false;
    state.afterCommand = true;
    return T.brace;
  }
  let depth = 0;
  while (!stream.eol()) {
    const ch = stream.peek();
    if (ch === "%" || (ch === "]" && depth === 0)) break;
    if (ch === "\\") stream.next();
    else if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);
    stream.next();
  }
  return T.option;
}

/** `\verb<d>...<d>` (or `\lstinline{...}`), always confined to one line. */
function inlineVerbToken(stream: StringStream, state: LatexState): string | null {
  const ch = stream.peek();
  if (ch === "[") {
    const end = stream.string.indexOf("]", stream.pos);
    stream.pos = end < 0 ? stream.string.length : end + 1;
    return T.option;
  }
  state.verbInline = false;
  if (ch === undefined) return null;
  stream.next();
  if (/\s/.test(ch)) return null;
  const close = ch === "{" ? "}" : ch;
  const end = stream.string.indexOf(close, stream.pos);
  stream.pos = end < 0 ? stream.string.length : end + 1;
  return T.verbatim;
}

/**
 * Body of a verbatim-like environment. Returns `undefined` (after switching back to text
 * mode) when positioned exactly at the matching `\end{...}`, so it gets tokenised normally.
 */
function verbatimToken(stream: StringStream, state: LatexState): string | null | undefined {
  const env = state.verbEnv ?? "";
  if (state.verbHeader) {
    if (stream.eatSpace()) return null;
    const ch = stream.peek();
    if (ch === "[" || ch === "{") {
      const end = stream.string.indexOf(ch === "[" ? "]" : "}", stream.pos);
      stream.pos = end < 0 ? stream.string.length : end + 1;
      return ch === "[" ? T.option : T.string;
    }
    state.verbHeader = false;
  }
  const idx = stream.string.indexOf(`\\end{${env}}`, stream.pos);
  if (idx === stream.pos) {
    state.mode = "text";
    state.verbEnv = null;
    return undefined;
  }
  if (idx > stream.pos) stream.pos = idx;
  else stream.skipToEnd();
  return env === "comment" ? T.comment : T.verbatim;
}

function token(stream: StringStream, state: LatexState): string | null {
  if (stream.sol()) startLine(stream, state);
  if (state.mode === "verbatim") {
    const t = verbatimToken(stream, state);
    if (t !== undefined) return t;
  }
  if (state.verbInline) return inlineVerbToken(stream, state);
  if (state.inOption) return optionToken(stream, state);
  if (state.argDepth > 0) return argumentToken(stream, state);
  if (stream.eatSpace()) return null;
  if (stream.peek() === "%") {
    stream.skipToEnd();
    return T.comment;
  }
  return state.mode === "math" ? mathToken(stream, state) : textToken(stream, state);
}

function blankLine(state: LatexState): void {
  if (state.mode !== "verbatim") paragraphBreak(state);
}

// ---------------------------------------------------------------- indentation

const END_RE = /^\\end\s*\{([^}]*)/;

/** One unit per open environment (except `document`) and per open display-math block. */
function indent(state: LatexState, textAfter: string, cx: IndentContext): number | null {
  if (state.mode === "verbatim") return null;
  const open = state.envStack.filter((env) => env !== "document");
  const displayMath = state.mode === "math" && (state.mathClose === "\\]" || state.mathClose === "$$");
  let depth = open.length + (displayMath ? 1 : 0);
  const end = END_RE.exec(textAfter);
  if (end) {
    const name = end[1].trim();
    if (open.some((env) => env.startsWith(name))) depth--;
  } else if (displayMath && /^(\\\]|\$\$)/.test(textAfter)) {
    depth--;
  }
  return Math.max(0, depth) * cx.unit;
}

// ---------------------------------------------------------------- folding

const BEGIN_ENV_RE = /\\begin\s*\{([^}]+)\}/g;
const SECTION_FOLD_RE = /\\(part|addpart|chapter|addchap|section|addsec|subsection|subsubsection|paragraph|subparagraph)\*?\s*[[{]/;
const END_DOCUMENT_RE = /\\end\s*\{document\}|\\appendix(?![a-zA-Z@])/;
const MAX_FOLD_SCAN_LINES = 20000;

/** Folds from the end of a `\begin{env}` line to just before its (nesting-aware) `\end{env}`. */
function foldEnvironment(doc: Text, line: Line): { from: number; to: number } | null {
  const text = stripLineComment(line.text);
  for (const m of text.matchAll(BEGIN_ENV_RE)) {
    const name = m[1].trim();
    if (name === "") continue;
    const re = new RegExp(`\\\\(begin|end)\\s*\\{${escapeRegExp(name)}\\}`, "g");
    let depth = 1;
    re.lastIndex = (m.index ?? 0) + m[0].length;
    let closedOnLine = false;
    for (let mm = re.exec(text); mm; mm = re.exec(text)) {
      depth += mm[1] === "begin" ? 1 : -1;
      if (depth === 0) {
        closedOnLine = true;
        break;
      }
    }
    if (closedOnLine) continue;
    const last = Math.min(doc.lines, line.number + MAX_FOLD_SCAN_LINES);
    for (let n = line.number + 1; n <= last; n++) {
      const l = doc.line(n);
      const t = stripLineComment(l.text);
      re.lastIndex = 0;
      for (let mm = re.exec(t); mm; mm = re.exec(t)) {
        depth += mm[1] === "begin" ? 1 : -1;
        if (depth === 0) return { from: line.to, to: l.from + mm.index };
      }
    }
    return null;
  }
  return null;
}

function sectionLevel(text: string): number | null {
  const m = SECTION_FOLD_RE.exec(text);
  return m ? (SECTIONING_LEVELS[m[1]] ?? null) : null;
}

/** Folds a heading's body up to the last non-blank line before the next same-or-higher heading. */
function foldSection(doc: Text, line: Line): { from: number; to: number } | null {
  const level = sectionLevel(stripLineComment(line.text));
  if (level === null) return null;
  let lastContent = line.number;
  const last = Math.min(doc.lines, line.number + MAX_FOLD_SCAN_LINES);
  for (let n = line.number + 1; n <= last; n++) {
    const t = stripLineComment(doc.line(n).text);
    const lvl = sectionLevel(t);
    if ((lvl !== null && lvl <= level) || END_DOCUMENT_RE.test(t)) break;
    if (t.trim() !== "") lastContent = n;
  }
  if (lastContent === line.number) return null;
  return { from: line.to, to: doc.line(lastContent).to };
}

export const latexFoldService: Extension = foldService.of((state: EditorState, lineStart: number) => {
  const line = state.doc.lineAt(lineStart);
  return foldEnvironment(state.doc, line) ?? foldSection(state.doc, line);
});

// ---------------------------------------------------------------- language

export const latexLanguage = StreamLanguage.define<LatexState>({
  name: "latex",
  startState,
  copyState,
  token,
  blankLine,
  indent,
  languageData: {
    commentTokens: { line: "%" },
    closeBrackets: { brackets: ["(", "[", "{", "$"] },
    wordChars: "\\@:",
    indentOnInput: /^\s*(\\end\{|\\\]|\$\$)$/,
  },
  tokenTable: {
    command: latexTags.command,
    mathCommand: latexTags.mathCommand,
    sectioning: latexTags.sectioning,
    envName: latexTags.envName,
    mathDelim: latexTags.mathDelim,
    mathContent: latexTags.mathContent,
    ref: latexTags.ref,
    option: latexTags.option,
    verbatim: latexTags.verbatim,
    special: latexTags.special,
    brace: latexTags.brace,
    keyword: latexTags.keyword,
    comment: tags.comment,
    string: tags.string,
    number: tags.number,
  },
});

/** Language, highlighting, folding and the `\begin{...}` auto-close keymap, ready to drop into an editor. */
export function latex(): LanguageSupport {
  return new LanguageSupport(latexLanguage, [
    syntaxHighlighting(latexHighlightStyle),
    latexFoldService,
    latexEnvironmentKeymap,
  ]);
}
