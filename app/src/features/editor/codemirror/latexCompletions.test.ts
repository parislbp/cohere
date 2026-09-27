import { CompletionContext, type Completion, type CompletionResult } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";
import {
  closeEnvironmentOnEnter,
  COMMAND_COMPLETIONS,
  ENVIRONMENT_NAMES,
  latexCompletion,
  latexCompletionSource,
  type CompletionData,
} from "./latexCompletions";
import { latex } from "./latexLanguage";

const data: CompletionData = {
  labels: ["sec:intro", "fig:plot"],
  citeKeys: ["knuth84", "lamport94"],
  texFiles: ["chapters/intro.tex", "chapters/methods.tex", "refs.bib"],
  imageFiles: ["figs/plot.pdf", "figs/logo.png"],
  environments: ["mytheorem"],
};

/** `doc` contains a single `|` marking the cursor. */
function complete(doc: string, explicit = false): { result: CompletionResult | null; pos: number } {
  const pos = doc.indexOf("|");
  const text = doc.slice(0, pos) + doc.slice(pos + 1);
  const state = EditorState.create({ doc: text, extensions: [latex(), latexCompletion(() => data)] });
  const result = latexCompletionSource(() => data)(new CompletionContext(state, pos, explicit));
  return { result, pos };
}

function labels(result: CompletionResult | null): string[] {
  return (result?.options ?? []).map((o: Completion) => o.label);
}

describe("latexCompletionSource", () => {
  it("completes commands after a backslash, including the backslash in the range", () => {
    const { result, pos } = complete("Intro \\sec|");
    expect(result?.from).toBe(pos - 4);
    const got = labels(result);
    expect(got).toContain("\\section");
    expect(got).toContain("\\section*");
    expect(got).toContain("\\subsection");
    expect(got).toContain("\\frac");
    expect(got.every((l) => l.startsWith("\\"))).toBe(true);
  });

  it("uses snippets for commands with arguments and plain inserts otherwise", () => {
    const section = COMMAND_COMPLETIONS.find((c) => c.label === "\\section");
    const alpha = COMMAND_COMPLETIONS.find((c) => c.label === "\\alpha");
    expect(typeof section?.apply).toBe("function");
    expect(alpha?.apply).toBeUndefined();
    expect(section?.type).toBe("keyword");
    expect(section?.boost).toBeGreaterThan(0);
  });

  it("offers a curated command list of roughly 180+ entries with unique labels", () => {
    expect(COMMAND_COMPLETIONS.length).toBeGreaterThan(180);
    expect(new Set(COMMAND_COMPLETIONS.map((c) => c.label)).size).toBe(COMMAND_COMPLETIONS.length);
    for (const house of ["\\toprule", "\\midrule", "\\bottomrule", "\\specialrule", "\\multicolumn", "\\thead", "\\rs", "\\code", "\\kind"]) {
      expect(COMMAND_COMPLETIONS.some((c) => c.label === house)).toBe(true);
    }
  });

  it("completes environment names inside \\begin{ from the curated list, data and the document", () => {
    const { result, pos } = complete("\\begin{myenv}\nx\n\\end{myenv}\n\\begin{ali|");
    expect(result?.from).toBe(pos - 3);
    const got = labels(result);
    expect(got).toContain("align");
    expect(got).toContain("align*");
    expect(got).toContain("mytheorem");
    expect(got).toContain("myenv");
    expect(got.length).toBeGreaterThanOrEqual(ENVIRONMENT_NAMES.length);
    expect(new Set(got).size).toBe(got.length);
  });

  it("boosts the innermost open environment when completing \\end{", () => {
    const { result } = complete("\\begin{itemize}\n\\begin{enumerate}\n\\item x\n\\end{|");
    const first = result?.options[0];
    expect(first?.label).toBe("enumerate");
    expect(first?.boost).toBe(99);
    expect(labels(result)).toContain("itemize");
  });

  it("completes labels from data and from the document inside \\ref{", () => {
    const { result, pos } = complete("\\label{eq:main}\nSee \\ref{|");
    expect(result?.from).toBe(pos);
    expect(labels(result)).toEqual(["sec:intro", "fig:plot", "eq:main"]);
    expect(result?.options[0].type).toBe("variable");
  });

  it("completes the segment after the last comma in \\cite{", () => {
    const { result, pos } = complete("\\cite{a, b|");
    expect(result?.from).toBe(pos - 1);
    expect(labels(result)).toEqual(["knuth84", "lamport94"]);
  });

  it("handles optional arguments before the citation braces", () => {
    const { result } = complete("\\parencite[see][p.~3]{kn|");
    expect(labels(result)).toEqual(["knuth84", "lamport94"]);
  });

  it("completes tex files without their extension inside \\input{, excluding .bib files", () => {
    const { result, pos } = complete("\\input{|");
    expect(result?.from).toBe(pos);
    expect(labels(result)).toEqual(["chapters/intro", "chapters/methods"]);
  });

  it("completes image files inside \\includegraphics[...]{", () => {
    const { result } = complete("\\includegraphics[width=0.8\\textwidth]{fi|");
    expect(labels(result)).toEqual(["figs/plot.pdf", "figs/logo.png"]);
  });

  it("completes .bib files for bibliography commands", () => {
    expect(labels(complete("\\addbibresource{|").result)).toEqual(["refs.bib"]);
    expect(labels(complete("\\bibliography{|").result)).toEqual(["refs"]);
  });

  it("returns nothing in plain text or inside comments", () => {
    expect(complete("plain words|").result).toBeNull();
    expect(complete("% see \\sec|").result).toBeNull();
    expect(complete("a \\cite{x} and \\ref{y} then|").result).toBeNull();
  });
});

describe("closeEnvironmentOnEnter", () => {
  const views: EditorView[] = [];
  afterEach(() => {
    for (const v of views.splice(0)) v.destroy();
  });

  function view(doc: string, cursor: number): EditorView {
    const v = new EditorView({
      state: EditorState.create({ doc, selection: { anchor: cursor }, extensions: [latex()] }),
      parent: document.body,
    });
    views.push(v);
    return v;
  }

  it("inserts an indented body and the matching \\end for an unclosed \\begin", () => {
    const doc = "\\begin{itemize}";
    const v = view(doc, doc.length);
    expect(closeEnvironmentOnEnter(v)).toBe(true);
    expect(v.state.doc.toString()).toBe("\\begin{itemize}\n  \n\\end{itemize}");
    expect(v.state.selection.main.head).toBe(doc.length + 3);
  });

  it("keeps the current indentation and allows optional arguments", () => {
    const doc = "  \\begin{figure}[htbp]";
    const v = view(doc, doc.length);
    expect(closeEnvironmentOnEnter(v)).toBe(true);
    expect(v.state.doc.toString()).toBe("  \\begin{figure}[htbp]\n    \n  \\end{figure}");
  });

  it("does not indent the body of the document environment", () => {
    const doc = "\\begin{document}";
    const v = view(doc, doc.length);
    expect(closeEnvironmentOnEnter(v)).toBe(true);
    expect(v.state.doc.toString()).toBe("\\begin{document}\n\n\\end{document}");
    expect(v.state.selection.main.head).toBe(doc.length + 1);
  });

  it("falls through when the environment is already closed (nesting-aware)", () => {
    const closed = "\\begin{itemize}\n\\item x\n\\end{itemize}";
    expect(closeEnvironmentOnEnter(view(closed, "\\begin{itemize}".length))).toBe(false);
    const nested = "\\begin{itemize}\n\\begin{itemize}\n\\end{itemize}";
    expect(closeEnvironmentOnEnter(view(nested, "\\begin{itemize}".length))).toBe(true);
  });

  it("falls through when the cursor is not at the end of the line or the line has no \\begin", () => {
    expect(closeEnvironmentOnEnter(view("\\begin{itemize} x", 5))).toBe(false);
    expect(closeEnvironmentOnEnter(view("just text", 9))).toBe(false);
    expect(closeEnvironmentOnEnter(view("% \\begin{itemize}", 17))).toBe(false);
    expect(closeEnvironmentOnEnter(view("\\begin{center}x\\end{center}", 27))).toBe(false);
  });
});
