import { lintGutter, setDiagnostics, type Diagnostic as CmDiagnostic } from "@codemirror/lint";
import type { Extension, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { Diagnostic } from "@/api/types";

const MAX_MESSAGE_LENGTH = 600;

function normalisePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^(?:\.\/)+/, "");
}

function stripTexExtension(path: string): string {
  return path.replace(/\.(tex|ltx|sty|cls|bib)$/i, "");
}

function hasExtension(path: string): boolean {
  return /\.[A-Za-z0-9]+$/.test(path.slice(path.lastIndexOf("/") + 1));
}

/**
 * Whether a diagnostic's file refers to the open file. Both sides are normalised;
 * a missing extension on either side (`main` vs `main.tex`) is tolerated, as is a
 * log path that is an absolute/longer form of the project-relative path.
 */
export function sameFile(diagFile: string, filePath: string): boolean {
  const a = normalisePath(diagFile);
  const b = normalisePath(filePath);
  if (a === "" || b === "") return false;
  if (a === b) return true;
  if ((!hasExtension(a) || !hasExtension(b)) && stripTexExtension(a) === stripTexExtension(b)) return true;
  return a.endsWith("/" + b) || b.endsWith("/" + a);
}

function formatMessage(diag: Diagnostic): string {
  const detail = diag.detail.trim();
  const full = detail === "" ? diag.message : `${diag.message}\n${detail}`;
  return full.length > MAX_MESSAGE_LENGTH ? full.slice(0, MAX_MESSAGE_LENGTH - 1) + "…" : full;
}

/**
 * Converts compiler diagnostics for `filePath` into CodeMirror diagnostics anchored
 * to the trimmed extent of their line (a zero-length point on blank lines).
 */
export function toCmDiagnostics(diags: readonly Diagnostic[], filePath: string, doc: Text): CmDiagnostic[] {
  const out: CmDiagnostic[] = [];
  for (const diag of diags) {
    if (diag.line === null || diag.file === null || !sameFile(diag.file, filePath)) continue;
    const lineNumber = Math.min(Math.max(Math.trunc(diag.line), 1), doc.lines);
    const line = doc.line(lineNumber);
    const trimmed = line.text.trim();
    const from = trimmed === "" ? line.from : line.from + line.text.indexOf(trimmed);
    const to = trimmed === "" ? line.from : from + trimmed.length;
    out.push({ from, to, severity: diag.severity, message: formatMessage(diag), source: diag.source });
  }
  return out;
}

export function applyDiagnostics(view: EditorView, diags: readonly Diagnostic[], filePath: string): void {
  view.dispatch(setDiagnostics(view.state, toCmDiagnostics(diags, filePath, view.state.doc)));
}

const underline = (colour: string) => ({
  backgroundImage: "none",
  textDecoration: `underline wavy ${colour}`,
  textDecorationSkipInk: "none",
  textUnderlineOffset: "3px",
});

const marker = (colour: string) => ({
  content: "normal",
  width: "0.65em",
  height: "0.65em",
  marginTop: "0.2em",
  borderRadius: "50%",
  background: colour,
});

/** Theme-driven lint styling: wavy underlines and round gutter dots in the `--diag-*` colours. */
const diagnosticsTheme = EditorView.baseTheme({
  ".cm-lintRange.cm-lintRange-error": underline("var(--diag-error)"),
  ".cm-lintRange.cm-lintRange-warning": underline("var(--diag-warning)"),
  ".cm-lintRange.cm-lintRange-info": underline("var(--diag-info)"),
  ".cm-lintPoint.cm-lintPoint-error:after": { borderBottomColor: "var(--diag-error)" },
  ".cm-lintPoint.cm-lintPoint-warning:after": { borderBottomColor: "var(--diag-warning)" },
  ".cm-lintPoint.cm-lintPoint-info:after": { borderBottomColor: "var(--diag-info)" },
  ".cm-lint-marker.cm-lint-marker-error": marker("var(--diag-error)"),
  ".cm-lint-marker.cm-lint-marker-warning": marker("var(--diag-warning)"),
  ".cm-lint-marker.cm-lint-marker-info": marker("var(--diag-info)"),
});

export const diagnosticsExtension: Extension = [lintGutter({ hoverTime: 200 }), diagnosticsTheme];
