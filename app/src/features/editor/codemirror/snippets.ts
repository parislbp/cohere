/**
 * The `@` palette: type `@` (at a word boundary) and pick a block — table, figure, equation,
 * section, list, reference… — inserted in the house style with tab-stops (`${…}` fields; ⇥ moves on).
 * Fixed list for now; the same shape can later be fed from templates or a model.
 */
import { snippetCompletion, type Completion, type CompletionContext, type CompletionResult } from "@codemirror/autocomplete";

export type SnippetGroup = "structure" | "float" | "math" | "list" | "text" | "reference" | "theorem" | "code" | "misc";

export interface SnippetDef {
  /** Palette label, without the `@`. */
  key: string;
  group: SnippetGroup;
  detail: string;
  info: string;
  /** CodeMirror snippet template: `${name}` fields, `${}` for the final cursor position. */
  template: string;
  /** Extra palette entries that insert the same block (e.g. `fig` → `figure`). */
  aliases?: string[];
}

export const SNIPPETS: readonly SnippetDef[] = [
  // ── floats ──────────────────────────────────────────────────────────────
  {
    key: "table",
    aliases: ["tab"],
    group: "float",
    detail: "house-style table (xltabular)",
    info: "Page-breaking table with repeating header, hairline \\rs rows, one stretch Y column.",
    template: `{\\small
\\begin{xltabular}{\\textwidth}{@{}L{2.4cm} Y L{2.6cm}@{}}
\\caption{\${Caption}.}\\label{tab:\${key}}\\\\
\\toprule
\\thead{\${Column}} & \\thead{\${Definition}} & \\thead{\${Notes}} \\\\\\midrule
\\endfirsthead
\\toprule
\\thead{\${Column}} & \\thead{\${Definition}} & \\thead{\${Notes}} \\\\\\midrule
\\endhead
\\midrule\\multicolumn{3}{r}{\\footnotesize\\itshape continued on next page}\\\\
\\endfoot
\\bottomrule
\\endlastfoot
\${row} & \${…} & \${…} \\\\\\rs
\${row} & \${…} & \${…} \\\\
\\end{xltabular}}
\${}`,
  },
  {
    key: "tabular",
    group: "float",
    detail: "small floating table",
    info: "A table float with booktabs rules; use for tables that fit on one page.",
    template: `\\begin{table}[htbp]\\centering\\small
\\caption{\${Caption}.}\\label{tab:\${key}}
\\begin{tabularx}{\\textwidth}{@{}L{3cm} Y@{}}
\\toprule
\\thead{\${Column}} & \\thead{\${Definition}} \\\\\\midrule
\${row} & \${…} \\\\\\rs
\${row} & \${…} \\\\
\\bottomrule
\\end{tabularx}
\\end{table}
\${}`,
  },
  {
    key: "figure",
    aliases: ["fig", "image"],
    group: "float",
    detail: "figure with caption",
    info: "\\includegraphics from figures/ (the \\graphicspath is set), caption and label.",
    template: `\\begin{figure}[htbp]\\centering
\\includegraphics[width=\${0.8}\\textwidth]{\${file}}
\\caption{\${Caption}.}
\\label{fig:\${key}}
\\end{figure}
\${}`,
  },
  {
    key: "subfigures",
    group: "float",
    detail: "two figures side by side",
    info: "Two minipages sharing one figure environment.",
    template: `\\begin{figure}[htbp]\\centering
\\begin{minipage}[t]{0.48\\textwidth}\\centering
\\includegraphics[width=\\linewidth]{\${left}}
\\caption{\${Left caption}.}\\label{fig:\${left-key}}
\\end{minipage}\\hfill
\\begin{minipage}[t]{0.48\\textwidth}\\centering
\\includegraphics[width=\\linewidth]{\${right}}
\\caption{\${Right caption}.}\\label{fig:\${right-key}}
\\end{minipage}
\\end{figure}
\${}`,
  },
  // ── math ────────────────────────────────────────────────────────────────
  {
    key: "equation",
    aliases: ["eq"],
    group: "math",
    detail: "numbered equation",
    info: "\\begin{equation} … \\end{equation} with a label; refer to it with \\eqref{eq:key}.",
    template: `\\begin{equation}
\\label{eq:\${key}}
\${math}
\\end{equation}
\${}`,
  },
  {
    key: "align",
    group: "math",
    detail: "aligned equations",
    info: "Several numbered lines aligned at &; end each with \\\\.",
    template: `\\begin{align}
\${lhs} &= \${rhs} \\label{eq:\${key-a}}\\\\
\${lhs} &= \${rhs} \\label{eq:\${key-b}}
\\end{align}
\${}`,
  },
  {
    key: "display",
    aliases: ["math"],
    group: "math",
    detail: "unnumbered display math",
    info: "Display math between \\[ and \\], centred on its own line, no number.",
    template: `\\[
\${math}
\\]
\${}`,
  },
  {
    key: "inline",
    group: "math",
    detail: "inline math",
    info: "$ … $ inside a sentence.",
    template: `$\${math}$\${}`,
  },
  {
    key: "cases",
    group: "math",
    detail: "piecewise definition",
    info: "A cases block inside an equation.",
    template: `\\begin{equation}
\\label{eq:\${key}}
\${f(x)} = \\begin{cases} \${a} & \\text{if } \${cond},\\\\ \${b} & \\text{otherwise.} \\end{cases}
\\end{equation}
\${}`,
  },
  {
    key: "matrix",
    group: "math",
    detail: "2×2 matrix (pmatrix)",
    info: "Parenthesised matrix; swap pmatrix for bmatrix/vmatrix as needed.",
    template: `\\begin{pmatrix} \${a} & \${b} \\\\ \${c} & \${d} \\end{pmatrix}\${}`,
  },
  {
    key: "frac",
    group: "math",
    detail: "fraction",
    info: "\\frac{numerator}{denominator}.",
    template: `\\frac{\${num}}{\${den}}\${}`,
  },
  {
    key: "sum",
    group: "math",
    detail: "sum with limits",
    info: "\\sum with lower and upper limits, e.g. \\sum_{i=1}^{n}.",
    template: `\\sum_{\${i=1}}^{\${n}} \${term}\${}`,
  },
  // ── structure ───────────────────────────────────────────────────────────
  {
    key: "chapter",
    aliases: ["ch"],
    group: "structure",
    detail: "chapter with label",
    info: "For report-class projects; the label follows the ch:NN convention.",
    template: `\\chapter{\${Title}}
\\label{ch:\${key}}

\${}`,
  },
  {
    key: "section",
    aliases: ["sec"],
    group: "structure",
    detail: "section with label",
    info: "\\section{…} plus \\label{sec:…}.",
    template: `\\section{\${Title}}
\\label{sec:\${key}}

\${}`,
  },
  {
    key: "subsection",
    aliases: ["subsec"],
    group: "structure",
    detail: "subsection with label",
    info: "\\subsection{…} plus \\label{sec:…}.",
    template: `\\subsection{\${Title}}
\\label{sec:\${key}}

\${}`,
  },
  {
    key: "subsubsection",
    group: "structure",
    detail: "subsubsection",
    info: "\\subsubsection{…} — the third heading level.",
    template: `\\subsubsection{\${Title}}
\${}`,
  },
  {
    key: "paragraph",
    aliases: ["para"],
    group: "structure",
    detail: "run-in paragraph heading",
    info: "\\paragraph{Heading.} text — the house style for short labelled paragraphs.",
    template: `\\paragraph{\${Heading}.} \${}`,
  },
  {
    key: "abstract",
    group: "structure",
    detail: "abstract block",
    info: "Centered heading plus a paragraph, as in the project template's abstract page.",
    template: `\\begin{center}\\LARGE\\textbf{Abstract}\\end{center}
\\vspace{6pt}
\\noindent
\${text}
\${}`,
  },
  {
    key: "input",
    group: "structure",
    detail: "include another file",
    info: "\\input{path-without-extension}.",
    template: `\\input{\${chapters/chapter_01}}\${}`,
  },
  {
    key: "appendices",
    group: "structure",
    detail: "start the appendices",
    info: "The templates' \\startappendices switch: 'Appendix A' headings and TOC entries.",
    template: `\\startappendices
\\chapter{\${Optional appendix name}}
\\label{app:\${a}}

\${}`,
  },
  // ── lists ───────────────────────────────────────────────────────────────
  {
    key: "itemize",
    aliases: ["bullets"],
    group: "list",
    detail: "bulleted list",
    info: "\\begin{itemize} with two items.",
    template: `\\begin{itemize}
\\item \${first}
\\item \${second}
\\end{itemize}
\${}`,
  },
  {
    key: "enumerate",
    aliases: ["numbered"],
    group: "list",
    detail: "numbered list",
    info: "\\begin{enumerate} with two items.",
    template: `\\begin{enumerate}
\\item \${first}
\\item \${second}
\\end{enumerate}
\${}`,
  },
  {
    key: "description",
    group: "list",
    detail: "term · definition list",
    info: "\\begin{description} with \\item[Term] entries.",
    template: `\\begin{description}
\\item[\${Term}.] \${definition}
\\item[\${Term}.] \${definition}
\\end{description}
\${}`,
  },
  // ── references ──────────────────────────────────────────────────────────
  {
    key: "cite",
    group: "reference",
    detail: "citation",
    info: "\\cite{key} — keys complete from references/ref.bib.",
    template: `\\cite{\${key}}\${}`,
  },
  {
    key: "ref",
    group: "reference",
    detail: "cross-reference",
    info: "Section~\\ref{…} with a non-breaking space.",
    template: `\${Section}~\\ref{\${label}}\${}`,
  },
  {
    key: "eqref",
    group: "reference",
    detail: "equation reference",
    info: "\\eqref{eq:…} renders as (n).",
    template: `\\eqref{eq:\${key}}\${}`,
  },
  {
    key: "label",
    group: "reference",
    detail: "label",
    info: "\\label{…}; prefixes: ch: sec: tab: fig: eq: app:.",
    template: `\\label{\${prefix:key}}\${}`,
  },
  {
    key: "footnote",
    group: "reference",
    detail: "footnote",
    info: "\\footnote{…} right after the word it belongs to.",
    template: `\\footnote{\${text}}\${}`,
  },
  {
    key: "url",
    group: "reference",
    detail: "hyperlink",
    info: "\\href{url}{text} (hyperref is loaded).",
    template: `\\href{\${https://}}{\${text}}\${}`,
  },
  // ── text ────────────────────────────────────────────────────────────────
  { key: "emph", group: "text", detail: "emphasis", info: "\\emph{…} — italic emphasis that flips back inside italic text.", template: `\\emph{\${text}}\${}` },
  { key: "bold", group: "text", detail: "bold", info: "\\textbf{…} — bold text.", template: `\\textbf{\${text}}\${}` },
  { key: "code", group: "text", detail: "inline code", info: "The house \\code{…} macro (typewriter).", template: `\\code{\${text}}\${}` },
  {
    key: "quote",
    group: "text",
    detail: "block quotation",
    info: "\\begin{quote} … \\end{quote}",
    template: `\\begin{quote}
\${text}
\\end{quote}
\${}`,
  },
  {
    key: "columns",
    group: "text",
    detail: "two side-by-side text columns",
    info: "Two minipages for parallel text.",
    template: `\\noindent\\begin{minipage}[t]{0.48\\textwidth}
\${left}
\\end{minipage}\\hfill
\\begin{minipage}[t]{0.48\\textwidth}
\${right}
\\end{minipage}
\${}`,
  },
  // ── theorem-like ────────────────────────────────────────────────────────
  {
    key: "definition",
    aliases: ["def"],
    group: "theorem",
    detail: "definition environment",
    info: "Numbered per chapter/section in the templates.",
    template: `\\begin{definition}[\${Name}]
\\label{def:\${key}}
\${text}
\\end{definition}
\${}`,
  },
  {
    key: "proposition",
    aliases: ["prop"],
    group: "theorem",
    detail: "proposition environment",
    info: "Numbered per chapter/section in the templates.",
    template: `\\begin{proposition}[\${Name}]
\\label{prop:\${key}}
\${statement}
\\end{proposition}
\${}`,
  },
  {
    key: "assumption",
    group: "theorem",
    detail: "assumption environment",
    info: "Numbered per chapter/section in the templates.",
    template: `\\begin{assumption}
\\label{ass:\${key}}
\${text}
\\end{assumption}
\${}`,
  },
  {
    key: "proof",
    group: "theorem",
    detail: "proof",
    info: "\\begin{proof} … \\end{proof} (amsthm).",
    template: `\\begin{proof}
\${text}
\\end{proof}
\${}`,
  },
  // ── code ────────────────────────────────────────────────────────────────
  {
    key: "listing",
    aliases: ["lst", "codeblock"],
    group: "code",
    detail: "code block (listings)",
    info: "\\begin{lstlisting} in the house style (paper background, hairline frame).",
    template: `\\begin{lstlisting}
\${code}
\\end{lstlisting}
\${}`,
  },
  {
    key: "verbatim",
    group: "code",
    detail: "verbatim block",
    info: "Text reproduced exactly, no commands interpreted.",
    template: `\\begin{verbatim}
\${text}
\\end{verbatim}
\${}`,
  },
  // ── misc ────────────────────────────────────────────────────────────────
  {
    key: "todo",
    group: "misc",
    detail: "TODO note (comment)",
    info: "A comment line the outline and future tooling can pick up.",
    template: `% TODO: \${what}\${}`,
  },
  {
    key: "comment",
    group: "misc",
    detail: "comment out a block",
    info: "\\begin{comment} … \\end{comment}; needs \\usepackage{comment} (or verbatim) in the preamble.",
    template: `\\begin{comment}
\${text}
\\end{comment}
\${}`,
  },
  {
    key: "newcommand",
    aliases: ["macro"],
    group: "misc",
    detail: "define a macro",
    info: "\\newcommand{\\name}{…}; add it near the notation macros in the preamble.",
    template: `\\newcommand{\\\${name}}{\${expansion}}\${}`,
  },
  {
    key: "pagebreak",
    group: "misc",
    detail: "page break",
    info: "\\clearpage flushes floats and starts a new page.",
    template: `\\clearpage
\${}`,
  },
];

const GROUP_ORDER: Record<SnippetGroup, number> = { structure: 0, float: 1, math: 2, list: 3, reference: 4, text: 5, theorem: 6, code: 7, misc: 8 };

function toCompletion(def: SnippetDef, label: string, isAlias: boolean): Completion {
  const c = snippetCompletion(def.template, {
    label: `@${label}`,
    displayLabel: isAlias ? `@${label} → ${def.key}` : `@${def.key}`,
    detail: def.detail,
    info: def.info,
    type: "keyword",
    boost: -GROUP_ORDER[def.group] - (isAlias ? 5 : 0),
    section: def.group,
  });
  return c;
}

export const SNIPPET_COMPLETIONS: readonly Completion[] = SNIPPETS.flatMap((def) => [toCompletion(def, def.key, false), ...(def.aliases ?? []).map((a) => toCompletion(def, a, true))]);

/** `@` must start a word: line start, whitespace, or an opening brace/bracket before it (so emails do not trigger). */
export function snippetPaletteSource(context: CompletionContext): CompletionResult | null {
  const m = context.matchBefore(/@[A-Za-z-]*$/);
  if (!m) return null;
  if (m.from > 0) {
    const before = context.state.sliceDoc(m.from - 1, m.from);
    if (!/[\s{[(]/.test(before)) return null;
  }
  if (m.from === m.to && !context.explicit) return null;
  return { from: m.from, options: SNIPPET_COMPLETIONS as Completion[], validFor: /^@[A-Za-z-]*$/ };
}
