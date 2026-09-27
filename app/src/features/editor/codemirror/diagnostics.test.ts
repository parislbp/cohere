import { diagnosticCount, forEachDiagnostic } from "@codemirror/lint";
import { EditorState, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import type { Diagnostic } from "@/api/types";
import { applyDiagnostics, diagnosticsExtension, sameFile, toCmDiagnostics } from "./diagnostics";

function diag(overrides: Partial<Diagnostic>): Diagnostic {
  return { severity: "error", file: "main.tex", line: 1, message: "Undefined control sequence", detail: "", source: "latex", ...overrides };
}

const doc = Text.of(["\\documentclass{article}", "  \\usepackage{amsmath}  ", "", "\\begin{document}", "text"]);

describe("sameFile", () => {
  it("normalises ./ prefixes and tolerates a missing extension", () => {
    expect(sameFile("./main.tex", "main.tex")).toBe(true);
    expect(sameFile("main", "main.tex")).toBe(true);
    expect(sameFile("main.tex", "main")).toBe(true);
    expect(sameFile("./chapters/intro.tex", "chapters/intro.tex")).toBe(true);
  });

  it("matches an absolute log path against a project-relative path", () => {
    expect(sameFile("/Users/me/project/chapters/intro.tex", "chapters/intro.tex")).toBe(true);
  });

  it("rejects different files", () => {
    expect(sameFile("other.tex", "main.tex")).toBe(false);
    expect(sameFile("main.bib", "main.tex")).toBe(false);
    expect(sameFile("submain.tex", "main.tex")).toBe(false);
    expect(sameFile("", "main.tex")).toBe(false);
  });
});

describe("toCmDiagnostics", () => {
  it("keeps only diagnostics for the given file that have a line", () => {
    const out = toCmDiagnostics(
      [
        diag({ file: "main.tex", line: 1 }),
        diag({ file: "./main.tex", line: 2 }),
        diag({ file: "main", line: 4 }),
        diag({ file: "other.tex", line: 1 }),
        diag({ file: null, line: 1 }),
        diag({ file: "main.tex", line: null }),
      ],
      "main.tex",
      doc,
    );
    expect(out).toHaveLength(3);
  });

  it("anchors the range to the trimmed extent of the line", () => {
    const [d] = toCmDiagnostics([diag({ line: 2 })], "main.tex", doc);
    const line = doc.line(2);
    expect(d.from).toBe(line.from + 2);
    expect(d.to).toBe(line.from + 2 + "\\usepackage{amsmath}".length);
  });

  it("uses a zero-length range at the start of blank lines", () => {
    const [d] = toCmDiagnostics([diag({ line: 3 })], "main.tex", doc);
    expect(d.from).toBe(doc.line(3).from);
    expect(d.to).toBe(doc.line(3).from);
  });

  it("clamps out-of-range lines into the document", () => {
    const [high, low] = toCmDiagnostics([diag({ line: 999 }), diag({ line: 0 })], "main.tex", doc);
    expect(high.from).toBe(doc.line(doc.lines).from);
    expect(low.from).toBe(doc.line(1).from);
  });

  it("maps severity and source and appends detail to the message", () => {
    const [d] = toCmDiagnostics([diag({ severity: "warning", source: "package", detail: "l.12 \\foo" })], "main.tex", doc);
    expect(d.severity).toBe("warning");
    expect(d.source).toBe("package");
    expect(d.message).toBe("Undefined control sequence\nl.12 \\foo");
    const [info] = toCmDiagnostics([diag({ severity: "info" })], "main.tex", doc);
    expect(info.severity).toBe("info");
    expect(info.message).toBe("Undefined control sequence");
  });

  it("caps very long messages at 600 characters", () => {
    const [d] = toCmDiagnostics([diag({ detail: "x".repeat(2000) })], "main.tex", doc);
    expect(d.message.length).toBe(600);
    expect(d.message.endsWith("…")).toBe(true);
  });
});

describe("applyDiagnostics", () => {
  it("installs diagnostics into a live view", () => {
    const view = new EditorView({
      state: EditorState.create({ doc: doc.toString(), extensions: [diagnosticsExtension] }),
      parent: document.body,
    });
    try {
      applyDiagnostics(view, [diag({ line: 1 }), diag({ line: 5, severity: "warning" }), diag({ file: "other.tex" })], "main.tex");
      expect(diagnosticCount(view.state)).toBe(2);
      const severities: string[] = [];
      forEachDiagnostic(view.state, (d) => severities.push(d.severity));
      expect(severities).toEqual(["error", "warning"]);
      applyDiagnostics(view, [], "main.tex");
      expect(diagnosticCount(view.state)).toBe(0);
    } finally {
      view.destroy();
    }
  });
});
