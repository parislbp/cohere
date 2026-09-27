import { describe, expect, it } from "vitest";
import { buildOutlineTree, cleanTitle, matchGroup, outlineItemAtLine, parseOutline, stripLineComment } from "./outline";

const sample = [
  "\\documentclass{article}",
  "\\begin{document}",
  "\\section{Introduction}",
  "\\label{sec:intro}",
  "Some text. % \\section{Not a heading}",
  "\\subsection*{Background \\emph{and} \\textbf{more}} \\label{sec:bg}",
  "\\begin{comment}",
  "\\section{Hidden}",
  "\\end{comment}",
  "\\subsection[Short]{A long title with {nested {braces}}}",
  "",
  "\\label{sec:long}",
  "\\section{Methods}",
  "\\subsubsection{Details\\label{sec:details}}",
  "\\appendix",
  "\\section{Extra\\%~stuff}",
  "\\end{document}",
].join("\n");

describe("text utilities", () => {
  it("strips comments but keeps escaped percent signs", () => {
    expect(stripLineComment("a \\% b % c")).toBe("a \\% b ");
    expect(stripLineComment("no comment")).toBe("no comment");
    expect(stripLineComment("% all")).toBe("");
  });

  it("matches nested and escaped groups", () => {
    expect(matchGroup("{a{b}c}d", 0)).toBe(7);
    expect(matchGroup("{a\\}b}", 0)).toBe(6);
    expect(matchGroup("{open", 0)).toBe(-1);
    expect(matchGroup("[x{]}y]z", 0)).toBe(7);
  });

  it("cleans titles", () => {
    expect(cleanTitle("The \\emph{best} of \\textbf{both {worlds}}")).toBe("The best of both worlds");
    expect(cleanTitle("Tables~\\& \\code{code}\\\\ done 100\\%")).toBe("Tables & code done 100%");
    expect(cleanTitle("The $n$-body problem")).toBe("The n-body problem");
    expect(cleanTitle("\\texorpdfstring{$\\alpha$}{alpha}-decay")).toBe("alpha-decay");
    expect(cleanTitle("Spaces\\,and\\ more   here")).toBe("Spaces\u2009and more here");
    expect(cleanTitle("\\LaTeX{} rocks_{x}")).toBe("rocks_x");
    expect(cleanTitle("Set \\{a, b\\}")).toBe("Set {a, b}");
  });
});

describe("parseOutline", () => {
  const items = parseOutline(sample);

  it("finds headings with kinds, levels and 1-based lines, skipping comments and verbatim-like bodies", () => {
    expect(items.map((i) => [i.kind, i.level, i.line])).toEqual([
      ["section", 1, 3],
      ["subsection", 2, 6],
      ["subsection", 2, 10],
      ["section", 1, 13],
      ["subsubsection", 3, 14],
      ["section", 1, 16],
    ]);
  });

  it("cleans titles and prefers the long title over the short one", () => {
    expect(items.map((i) => i.title)).toEqual([
      "Introduction",
      "Background and more",
      "A long title with nested braces",
      "Methods",
      "Details",
      "Extra% stuff",
    ]);
  });

  it("detects starred headings", () => {
    expect(items.map((i) => i.starred)).toEqual([false, true, false, false, false, false]);
  });

  it("picks up labels on the same line, the next non-empty line or inside the title", () => {
    expect(items.map((i) => i.label)).toEqual(["sec:intro", "sec:bg", "sec:long", null, "sec:details", null]);
  });

  it("flags headings after \\appendix", () => {
    expect(items.map((i) => i.appendix)).toEqual([false, false, false, false, false, true]);
    const same = parseOutline("\\section{A}\n\\appendix \\section{B}");
    expect(same.map((i) => i.appendix)).toEqual([false, true]);
    expect(parseOutline("\\appendixname\n\\section{A}")[0].appendix).toBe(false);
  });

  it("assigns unique ids", () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it("supports every sectioning kind and ignores look-alike commands", () => {
    const all = parseOutline("\\part{P}\n\\chapter{C}\n\\paragraph{Pa}\n\\subparagraph{Sp}\n\\sectionmark{x}\n\\renewcommand{\\section}{y}");
    expect(all.map((i) => [i.kind, i.level])).toEqual([
      ["part", -1],
      ["chapter", 0],
      ["paragraph", 4],
      ["subparagraph", 5],
    ]);
  });

  it("handles a title that is not closed on the line", () => {
    const [item] = parseOutline("\\section{Unclosed title");
    expect(item.title).toBe("Unclosed title");
  });
});

describe("buildOutlineTree", () => {
  it("nests items by level", () => {
    const items = parseOutline(
      ["\\part{P}", "\\chapter{C1}", "\\section{S1}", "\\subsection{S1a}", "\\subsubsection{S1a1}", "\\section{S2}", "\\chapter{C2}", "\\section{S3}"].join("\n"),
    );
    const tree = buildOutlineTree(items);
    expect(tree.map((n) => n.title)).toEqual(["P"]);
    expect(tree[0].children.map((n) => n.title)).toEqual(["C1", "C2"]);
    expect(tree[0].children[0].children.map((n) => n.title)).toEqual(["S1", "S2"]);
    expect(tree[0].children[0].children[0].children.map((n) => n.title)).toEqual(["S1a"]);
    expect(tree[0].children[0].children[0].children[0].children.map((n) => n.title)).toEqual(["S1a1"]);
    expect(tree[0].children[1].children.map((n) => n.title)).toEqual(["S3"]);
  });

  it("treats a deeper heading without a parent as a root", () => {
    const tree = buildOutlineTree(parseOutline("\\subsection{Orphan}\n\\section{S}\n\\subsection{Child}"));
    expect(tree.map((n) => n.title)).toEqual(["Orphan", "S"]);
    expect(tree[1].children.map((n) => n.title)).toEqual(["Child"]);
  });
});

describe("outlineItemAtLine", () => {
  const items = parseOutline(sample);

  it("returns the last heading at or before the line", () => {
    expect(outlineItemAtLine(items, 1)).toBeNull();
    expect(outlineItemAtLine(items, 3)?.title).toBe("Introduction");
    expect(outlineItemAtLine(items, 5)?.title).toBe("Introduction");
    expect(outlineItemAtLine(items, 12)?.title).toBe("A long title with nested braces");
    expect(outlineItemAtLine(items, 999)?.title).toBe("Extra% stuff");
    expect(outlineItemAtLine([], 3)).toBeNull();
  });
});
