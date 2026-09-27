import { foldable, getIndentation } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { latex, latexLanguage } from "./latexLanguage";

interface Token {
  name: string;
  text: string;
}

function tokens(text: string): Token[] {
  const tree = latexLanguage.parser.parse(text);
  const out: Token[] = [];
  tree.iterate({
    enter(node) {
      if (node.name !== "Document") out.push({ name: node.name, text: text.slice(node.from, node.to) });
    },
  });
  return out;
}

function named(toks: Token[], name: string): string[] {
  return toks.filter((t) => t.name === name).map((t) => t.text);
}

function names(toks: Token[]): string[] {
  return toks.map((t) => t.name);
}

describe("latex tokenizer", () => {
  it("tokenises comments to end of line, but not escaped percent signs", () => {
    const toks = tokens("Hello % world\n100\\% sure % really\n");
    expect(named(toks, "comment")).toEqual(["% world", "% really"]);
    expect(named(toks, "command")).toEqual(["\\%"]);
  });

  it("recognises comments inside math", () => {
    const toks = tokens("$x % note\n+ 1$ after");
    expect(named(toks, "comment")).toEqual(["% note"]);
    expect(named(toks, "mathDelim")).toEqual(["$", "$"]);
    expect(named(toks, "number")).toEqual(["1"]);
  });

  it("tokenises generic, single-character and starred commands", () => {
    const toks = tokens("\\textbf{x} \\, \\@ \\$ \\& \\_ \\# \\; \\! \\  \\foo* \\\\");
    expect(named(toks, "command")).toEqual(["\\textbf", "\\,", "\\@", "\\$", "\\&", "\\_", "\\#", "\\;", "\\!", "\\ ", "\\foo*"]);
    expect(named(toks, "special")).toEqual(["\\\\"]);
    expect(named(toks, "brace")).toEqual(["{", "}"]);
  });

  it("classifies sectioning commands and structure keywords", () => {
    const toks = tokens("\\chapter{A}\n\\section*{Intro}\n\\subsection{B}\n\\usepackage{amsmath}\n\\maketitle\n\\item x");
    expect(named(toks, "sectioning")).toEqual(["\\chapter", "\\section*", "\\subsection"]);
    expect(named(toks, "keyword")).toEqual(["\\usepackage", "\\maketitle", "\\item"]);
    expect(named(toks, "string")).toEqual(["amsmath"]);
  });

  it("gives environment names their own token in \\begin and \\end", () => {
    const toks = tokens("\\begin{itemize}\n\\item a\n\\end{itemize}");
    expect(named(toks, "keyword")).toEqual(["\\begin", "\\item", "\\end"]);
    expect(named(toks, "envName")).toEqual(["itemize", "itemize"]);
  });

  it("tokenises inline math with content, scripts and numbers", () => {
    const toks = tokens("Let $x^2 + 1$ and \\(a_i\\) hold.");
    expect(named(toks, "mathDelim")).toEqual(["$", "$", "\\(", "\\)"]);
    expect(named(toks, "special")).toEqual(["^", "_"]);
    expect(named(toks, "number")).toEqual(["2", "1"]);
    expect(named(toks, "mathContent").join("")).toContain("x");
    expect(named(toks, "mathContent").join("")).toContain("+");
    expect(toks.filter((t) => t.name === "mathContent").some((t) => t.text.includes("hold"))).toBe(false);
  });

  it("tokenises display math with $$ and \\[ \\]", () => {
    const toks = tokens("\\[ E = mc^2 \\]\n$$ a $$ text");
    expect(named(toks, "mathDelim")).toEqual(["\\[", "\\]", "$$", "$$"]);
    expect(named(toks, "number")).toEqual(["2"]);
    expect(toks.some((t) => t.name === "mathContent" && t.text.includes("text"))).toBe(false);
  });

  it("treats math environments as math and returns to text after \\end", () => {
    const toks = tokens("\\begin{align}\n a &= \\frac{1}{2} \\label{eq:half} \\\\\n b &= 3\n\\end{align}\nthen \\textbf{bold}");
    expect(named(toks, "envName")).toEqual(["align", "align"]);
    expect(named(toks, "mathCommand")).toEqual(["\\frac"]);
    expect(named(toks, "keyword")).toEqual(["\\begin", "\\label", "\\end"]);
    expect(named(toks, "ref")).toEqual(["eq:half"]);
    expect(named(toks, "special")).toEqual(["&", "\\\\", "&"]);
    expect(named(toks, "number")).toEqual(["1", "2", "3"]);
    expect(named(toks, "command")).toEqual(["\\textbf"]);
  });

  it("keeps nested math environments inside math and exits on the outer \\end", () => {
    const toks = tokens("\\begin{equation}\n f = \\begin{cases} 1 & x \\\\ 0 & y \\end{cases}\n\\end{equation}\nafter \\emph{x}");
    expect(named(toks, "envName")).toEqual(["equation", "cases", "cases", "equation"]);
    expect(named(toks, "command")).toEqual(["\\emph"]);
    expect(named(toks, "mathCommand")).toEqual([]);
  });

  it("marks commands inside math as math commands", () => {
    const toks = tokens("$\\alpha + \\sqrt[3]{x}$");
    expect(named(toks, "mathCommand")).toEqual(["\\alpha", "\\sqrt"]);
    expect(named(toks, "option")).toEqual(["3"]);
    expect(named(toks, "command")).toEqual([]);
  });

  it("reads verbatim bodies raw until the matching \\end", () => {
    const toks = tokens("\\begin{verbatim}\n\\foo % not a comment\n  $x$ {\n\\end{verbatim}\n\\bar % real");
    expect(named(toks, "verbatim")).toEqual(["\\foo % not a comment", "  $x$ {"]);
    expect(named(toks, "comment")).toEqual(["% real"]);
    expect(named(toks, "envName")).toEqual(["verbatim", "verbatim"]);
    expect(named(toks, "command")).toEqual(["\\bar"]);
    expect(named(toks, "mathDelim")).toEqual([]);
  });

  it("does not stop verbatim at \\end of a different environment", () => {
    const toks = tokens("\\begin{lstlisting}[language=Python]\nprint(1)\n\\end{verbatim}\nx = 2\n\\end{lstlisting}\ndone");
    expect(named(toks, "option")).toEqual(["[language=Python]"]);
    expect(named(toks, "verbatim")).toEqual(["print(1)", "\\end{verbatim}", "x = 2"]);
    expect(named(toks, "envName")).toEqual(["lstlisting", "lstlisting"]);
  });

  it("styles the comment environment body as a comment", () => {
    const toks = tokens("\\begin{comment}\n\\section{Hidden}\n\\end{comment}\n\\section{Shown}");
    expect(named(toks, "comment")).toEqual(["\\section{Hidden}"]);
    expect(named(toks, "sectioning")).toEqual(["\\section"]);
  });

  it("handles inline \\verb with arbitrary delimiters", () => {
    const toks = tokens("Use \\verb|\\foo{%}| or \\verb+a b+ here \\textit{x}");
    expect(named(toks, "verbatim")).toEqual(["|\\foo{%}|", "+a b+"]);
    expect(named(toks, "command")).toEqual(["\\verb", "\\verb", "\\textit"]);
    expect(named(toks, "comment")).toEqual([]);
  });

  it("tokenises label, ref and cite arguments as refs, including optional arguments", () => {
    const toks = tokens("\\label{sec:intro} \\ref{sec:intro} \\cite[p.~3]{knuth84,lamport94} \\eqref{eq:1} \\parencite{a}");
    expect(named(toks, "ref")).toEqual(["sec:intro", "sec:intro", "knuth84,lamport94", "eq:1", "a"]);
    expect(named(toks, "option")).toEqual(["p.~3"]);
    expect(named(toks, "keyword")).toEqual(["\\label", "\\ref", "\\cite", "\\eqref", "\\parencite"]);
  });

  it("tokenises file and package arguments as strings", () => {
    const toks = tokens(
      "\\documentclass[11pt,a4paper]{article}\n\\usepackage[utf8]{inputenc}\n\\input{chapters/intro}\n\\includegraphics[width=0.8\\textwidth]{figs/plot.pdf}\n\\url{https://x.org/a%20b}",
    );
    expect(named(toks, "string")).toEqual(["article", "inputenc", "chapters/intro", "figs/plot.pdf", "https://x.org/a%20b"]);
    expect(named(toks, "option")).toEqual(["11pt,a4paper", "utf8", "width=0.8\\textwidth"]);
    expect(named(toks, "comment")).toEqual([]);
  });

  it("only treats brackets as optional arguments directly after a command", () => {
    const toks = tokens("[not an option] \\item[label] text [nor this] \\begin{figure}[htbp]");
    expect(named(toks, "option")).toEqual(["label", "htbp"]);
    expect(named(toks, "brace")).toEqual(["[", "]", "{", "}[", "]"]);
  });

  it("marks tildes, ampersands, dashes and quotes as special", () => {
    const toks = tokens("a~b & c -- d --- e ``quoted'' f");
    expect(named(toks, "special")).toEqual(["~", "&", "--", "---", "``", "''"]);
  });

  it("only highlights numbers with units or before a command in text", () => {
    const toks = tokens("\\hspace{10pt} 0.5\\textwidth -2em and 2024 people");
    expect(named(toks, "number")).toEqual(["10pt", "0.5", "-2em"]);
  });

  it("ends an unclosed $ at the next blank line", () => {
    const toks = tokens("costs $5 today\nstill math\n\nNew paragraph \\textbf{bold} $ok$");
    expect(toks.some((t) => t.name === "mathContent" && t.text.includes("still math"))).toBe(true);
    expect(named(toks, "command")).toEqual(["\\textbf"]);
    expect(named(toks, "mathDelim")).toEqual(["$", "$", "$"]);
  });

  it("lets a stray \\end{document} or unknown \\end leave math state alone", () => {
    const toks = tokens("\\end{itemize} $x$ \\textbf{y}");
    expect(named(toks, "command")).toEqual(["\\textbf"]);
    expect(named(toks, "envName")).toEqual(["itemize"]);
  });

  it("keeps braces as brace tokens for bracket matching", () => {
    const toks = tokens("\\frac{a}{b} {plain}");
    expect(named(toks, "brace")).toEqual(["{", "}{", "}", "{", "}"]);
    expect(names(toks)).not.toContain("mathContent");
  });
});

describe("latex language support", () => {
  function state(doc: string): EditorState {
    return EditorState.create({ doc, extensions: [latex()] });
  }

  it("indents environment bodies and dedents \\end lines", () => {
    const s = state("\\begin{itemize}\n\\item a\n\\end{itemize}\nafter");
    expect(getIndentation(s, s.doc.line(2).from)).toBe(2);
    expect(getIndentation(s, s.doc.line(3).from)).toBe(0);
    expect(getIndentation(s, s.doc.line(4).from)).toBe(0);
  });

  it("does not indent inside document, but nests other environments", () => {
    const s = state("\\begin{document}\n\\begin{enumerate}\n\\begin{itemize}\nx\n\\end{itemize}\n\\end{enumerate}\n\\end{document}");
    expect(getIndentation(s, s.doc.line(2).from)).toBe(0);
    expect(getIndentation(s, s.doc.line(3).from)).toBe(2);
    expect(getIndentation(s, s.doc.line(4).from)).toBe(4);
    expect(getIndentation(s, s.doc.line(5).from)).toBe(2);
    expect(getIndentation(s, s.doc.line(6).from)).toBe(0);
  });

  it("indents display math blocks", () => {
    const s = state("\\[\nx = 1\n\\]\ntext");
    expect(getIndentation(s, s.doc.line(2).from)).toBe(2);
    expect(getIndentation(s, s.doc.line(3).from)).toBe(0);
    expect(getIndentation(s, s.doc.line(4).from)).toBe(0);
  });

  it("exposes LaTeX language data", () => {
    const s = state("x");
    expect(s.languageDataAt<{ line: string }>("commentTokens", 0)[0]).toEqual({ line: "%" });
    expect(s.languageDataAt<string>("wordChars", 0)[0]).toContain("\\");
    expect(s.languageDataAt<{ brackets: string[] }>("closeBrackets", 0)[0].brackets).toContain("$");
  });

  it("folds environments from the \\begin line to the matching \\end", () => {
    const s = state("\\begin{itemize}\n\\begin{itemize}\n\\item x\n\\end{itemize}\n\\item y\n\\end{itemize}\nafter");
    const l1 = s.doc.line(1);
    const l6 = s.doc.line(6);
    expect(foldable(s, l1.from, l1.to)).toEqual({ from: l1.to, to: l6.from });
    const l2 = s.doc.line(2);
    const l4 = s.doc.line(4);
    expect(foldable(s, l2.from, l2.to)).toEqual({ from: l2.to, to: l4.from });
    const l3 = s.doc.line(3);
    expect(foldable(s, l3.from, l3.to)).toBeNull();
  });

  it("does not fold environments opened and closed on one line, nor unclosed ones", () => {
    const s = state("\\begin{center}x\\end{center}\n\\begin{itemize}\n\\item y");
    const l1 = s.doc.line(1);
    const l2 = s.doc.line(2);
    expect(foldable(s, l1.from, l1.to)).toBeNull();
    expect(foldable(s, l2.from, l2.to)).toBeNull();
  });

  it("folds sections up to the next heading of the same or higher level", () => {
    const s = state("\\section{A}\ntext\n\\subsection{A.1}\nmore\n\n\\section{B}\nlast\n\\end{document}");
    const l1 = s.doc.line(1);
    const l3 = s.doc.line(3);
    const l4 = s.doc.line(4);
    const l6 = s.doc.line(6);
    const l7 = s.doc.line(7);
    expect(foldable(s, l1.from, l1.to)).toEqual({ from: l1.to, to: l4.to });
    expect(foldable(s, l3.from, l3.to)).toEqual({ from: l3.to, to: l4.to });
    expect(foldable(s, l6.from, l6.to)).toEqual({ from: l6.to, to: l7.to });
  });
});
