import {
  autocompletion,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { indentUnit } from "@codemirror/language";
import { Prec, type Extension, type Line, type Text } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { escapeRegExp, stripLineComment, VERBATIM_ENVIRONMENTS } from "../outline";

export interface CompletionData {
  labels: string[];
  citeKeys: string[];
  /** Project source files; may include `.bib` paths, which only surface for bibliography commands. */
  texFiles: string[];
  imageFiles: string[];
  environments?: string[];
}

type CompletionType = "keyword" | "function" | "text" | "variable" | "class";

/** `[label, snippet template (null = insert the label), type, detail, info?, boost?]` */
type CommandSpec = readonly [string, string | null, CompletionType, string, string?, number?];

// ---------------------------------------------------------------- commands

const GREEK: readonly (readonly [string, string])[] = [
  ["alpha", "α"], ["beta", "β"], ["gamma", "γ"], ["delta", "δ"], ["epsilon", "ϵ"], ["varepsilon", "ε"],
  ["zeta", "ζ"], ["eta", "η"], ["theta", "θ"], ["vartheta", "ϑ"], ["iota", "ι"], ["kappa", "κ"],
  ["lambda", "λ"], ["mu", "μ"], ["nu", "ν"], ["xi", "ξ"], ["pi", "π"], ["rho", "ρ"], ["sigma", "σ"],
  ["tau", "τ"], ["upsilon", "υ"], ["phi", "ϕ"], ["varphi", "φ"], ["chi", "χ"], ["psi", "ψ"], ["omega", "ω"],
  ["Gamma", "Γ"], ["Delta", "Δ"], ["Theta", "Θ"], ["Lambda", "Λ"], ["Xi", "Ξ"], ["Pi", "Π"], ["Sigma", "Σ"],
  ["Upsilon", "Υ"], ["Phi", "Φ"], ["Psi", "Ψ"], ["Omega", "Ω"],
];

const OPERATORS: readonly string[] = [
  "sin", "cos", "tan", "arcsin", "arccos", "arctan", "sinh", "cosh", "tanh", "log", "ln", "exp",
  "max", "min", "sup", "inf", "arg", "det", "dim", "ker", "deg", "gcd", "Pr",
];

const COMMANDS: readonly CommandSpec[] = [
  // sectioning & front matter
  ["\\part", "\\part{${title}}", "keyword", "{title}", "Top-level division (book/report)", 1],
  ["\\chapter", "\\chapter{${title}}", "keyword", "{title}", "Chapter heading (book/report)", 3],
  ["\\section", "\\section{${title}}", "keyword", "{title}", "Section heading", 5],
  ["\\section*", "\\section*{${title}}", "keyword", "{title}", "Unnumbered section", 1],
  ["\\subsection", "\\subsection{${title}}", "keyword", "{title}", "Subsection heading", 4],
  ["\\subsection*", "\\subsection*{${title}}", "keyword", "{title}", "Unnumbered subsection"],
  ["\\subsubsection", "\\subsubsection{${title}}", "keyword", "{title}", "Sub-subsection heading", 2],
  ["\\paragraph", "\\paragraph{${title}}", "keyword", "{title}", "Run-in paragraph heading"],
  ["\\subparagraph", "\\subparagraph{${title}}", "keyword", "{title}", "Run-in sub-paragraph heading"],
  ["\\appendix", null, "keyword", "", "Switch to appendix numbering"],
  ["\\tableofcontents", null, "keyword", "", "Insert the table of contents", 1],
  ["\\listoffigures", null, "keyword", "", "Insert the list of figures"],
  ["\\listoftables", null, "keyword", "", "Insert the list of tables"],
  ["\\maketitle", null, "keyword", "", "Typeset the title block", 1],
  ["\\title", "\\title{${title}}", "keyword", "{title}", "Document title"],
  ["\\author", "\\author{${name}}", "keyword", "{name}", "Document author(s)"],
  ["\\date", "\\date{${\\today}}", "keyword", "{date}", "Document date"],
  ["\\today", null, "text", "", "Today's date"],
  ["\\thanks", "\\thanks{${text}}", "function", "{text}", "Title-page footnote"],

  // preamble & structure
  ["\\documentclass", "\\documentclass[${options}]{${class}}", "keyword", "[opts]{class}", "Set the document class", 2],
  ["\\usepackage", "\\usepackage{${package}}", "keyword", "{package}", "Load a package", 4],
  ["\\RequirePackage", "\\RequirePackage{${package}}", "keyword", "{package}", "Load a package from class/package code"],
  ["\\newcommand", "\\newcommand{\\${name}}{${definition}}", "keyword", "{\\name}{def}", "Define a new macro", 2],
  ["\\renewcommand", "\\renewcommand{\\${name}}{${definition}}", "keyword", "{\\name}{def}", "Redefine an existing macro", 1],
  ["\\providecommand", "\\providecommand{\\${name}}{${definition}}", "keyword", "{\\name}{def}", "Define a macro unless it already exists"],
  ["\\newenvironment", "\\newenvironment{${name}}{${begin}}{${end}}", "keyword", "{name}{begin}{end}", "Define a new environment"],
  ["\\newtheorem", "\\newtheorem{${name}}{${Heading}}", "keyword", "{name}{Heading}", "Declare a theorem-like environment"],
  ["\\theoremstyle", "\\theoremstyle{${plain}}", "keyword", "{style}", "amsthm style for the following \\newtheorem"],
  ["\\DeclareMathOperator", "\\DeclareMathOperator{\\${name}}{${text}}", "keyword", "{\\name}{text}", "Define an upright operator like \\sin"],
  ["\\setlength", "\\setlength{\\${length}}{${value}}", "function", "{\\length}{value}", "Set a length register"],
  ["\\graphicspath", "\\graphicspath{{${figures/}}}", "keyword", "{{dir/}}", "Search path for \\includegraphics"],
  ["\\hypersetup", "\\hypersetup{${options}}", "keyword", "{options}", "hyperref options"],
  ["\\geometry", "\\geometry{${options}}", "keyword", "{options}", "geometry: page layout options"],
  ["\\pagestyle", "\\pagestyle{${plain}}", "keyword", "{style}", "Header/footer style"],
  ["\\thispagestyle", "\\thispagestyle{${empty}}", "keyword", "{style}", "Header/footer style for this page only"],
  ["\\pagenumbering", "\\pagenumbering{${arabic}}", "keyword", "{style}", "Page number style (arabic, roman, …)"],
  ["\\input", "\\input{${file}}", "keyword", "{file}", "Insert a file's contents here", 2],
  ["\\include", "\\include{${file}}", "keyword", "{file}", "Include a chapter file (page break, \\includeonly-aware)", 1],
  ["\\includeonly", "\\includeonly{${files}}", "keyword", "{files}", "Limit \\include to these files"],
  ["\\begin", "\\begin{${env}}\n\t${}\n\\end{${env}}", "keyword", "{env} … \\end{env}", "Environment block", 6],
  ["\\end", "\\end{${env}}", "keyword", "{env}", "Close an environment", 1],
  ["\\bibliography", "\\bibliography{${refs}}", "keyword", "{file}", "BibTeX bibliography file(s)"],
  ["\\bibliographystyle", "\\bibliographystyle{${plain}}", "keyword", "{style}", "BibTeX style"],
  ["\\addbibresource", "\\addbibresource{${refs.bib}}", "keyword", "{file.bib}", "biblatex bibliography file"],
  ["\\printbibliography", null, "keyword", "", "Print the biblatex bibliography"],

  // references, citations, links
  ["\\label", "\\label{${key}}", "keyword", "{key}", "Mark a point for cross-referencing", 4],
  ["\\ref", "\\ref{${key}}", "keyword", "{key}", "Reference a label's number", 4],
  ["\\eqref", "\\eqref{${key}}", "keyword", "{key}", "Reference an equation, with parentheses", 2],
  ["\\pageref", "\\pageref{${key}}", "keyword", "{key}", "Reference a label's page"],
  ["\\autoref", "\\autoref{${key}}", "keyword", "{key}", "hyperref: reference with automatic type name", 1],
  ["\\cref", "\\cref{${key}}", "keyword", "{key}", "cleveref: reference with type name", 1],
  ["\\Cref", "\\Cref{${key}}", "keyword", "{key}", "cleveref: capitalised reference"],
  ["\\nameref", "\\nameref{${key}}", "keyword", "{key}", "Reference a heading's title"],
  ["\\cite", "\\cite{${key}}", "keyword", "{key}", "Cite a bibliography entry", 4],
  ["\\citep", "\\citep{${key}}", "keyword", "{key}", "natbib: parenthetical citation"],
  ["\\citet", "\\citet{${key}}", "keyword", "{key}", "natbib: textual citation"],
  ["\\parencite", "\\parencite{${key}}", "keyword", "{key}", "biblatex: parenthetical citation"],
  ["\\textcite", "\\textcite{${key}}", "keyword", "{key}", "biblatex: textual citation"],
  ["\\autocite", "\\autocite{${key}}", "keyword", "{key}", "biblatex: style-dependent citation"],
  ["\\footcite", "\\footcite{${key}}", "keyword", "{key}", "biblatex: citation in a footnote"],
  ["\\nocite", "\\nocite{${key}}", "keyword", "{key}", "Add an entry without citing it (* for all)"],
  ["\\footnote", "\\footnote{${text}}", "function", "{text}", "Footnote", 3],
  ["\\url", "\\url{${url}}", "function", "{url}", "Typeset a URL"],
  ["\\href", "\\href{${url}}{${text}}", "function", "{url}{text}", "Hyperlink with display text"],
  ["\\hyperref", "\\hyperref[${key}]{${text}}", "function", "[key]{text}", "Link text to a label"],

  // text formatting
  ["\\textbf", "\\textbf{${text}}", "function", "{text}", "Bold", 5],
  ["\\textit", "\\textit{${text}}", "function", "{text}", "Italic", 4],
  ["\\emph", "\\emph{${text}}", "function", "{text}", "Emphasis (context-aware italic)", 5],
  ["\\texttt", "\\texttt{${text}}", "function", "{text}", "Monospace", 3],
  ["\\textsc", "\\textsc{${text}}", "function", "{text}", "Small caps", 1],
  ["\\textsf", "\\textsf{${text}}", "function", "{text}", "Sans-serif"],
  ["\\textrm", "\\textrm{${text}}", "function", "{text}", "Roman (serif)"],
  ["\\textsl", "\\textsl{${text}}", "function", "{text}", "Slanted"],
  ["\\textup", "\\textup{${text}}", "function", "{text}", "Upright"],
  ["\\textmd", "\\textmd{${text}}", "function", "{text}", "Medium weight"],
  ["\\textnormal", "\\textnormal{${text}}", "function", "{text}", "Reset to the normal font"],
  ["\\underline", "\\underline{${text}}", "function", "{text}", "Underline"],
  ["\\textsuperscript", "\\textsuperscript{${text}}", "function", "{text}", "Superscript in text"],
  ["\\textsubscript", "\\textsubscript{${text}}", "function", "{text}", "Subscript in text"],
  ["\\MakeUppercase", "\\MakeUppercase{${text}}", "function", "{text}", "Uppercase text"],
  ["\\bfseries", null, "text", "", "Bold until the end of the group"],
  ["\\itshape", null, "text", "", "Italic until the end of the group"],
  ["\\ttfamily", null, "text", "", "Monospace until the end of the group"],
  ["\\scshape", null, "text", "", "Small caps until the end of the group"],
  ["\\sffamily", null, "text", "", "Sans-serif until the end of the group"],
  ["\\rmfamily", null, "text", "", "Roman until the end of the group"],
  ["\\normalfont", null, "text", "", "Reset the font"],
  ["\\tiny", null, "text", "", "Font size: tiny"],
  ["\\scriptsize", null, "text", "", "Font size: scriptsize"],
  ["\\footnotesize", null, "text", "", "Font size: footnotesize"],
  ["\\small", null, "text", "", "Font size: small", 1],
  ["\\normalsize", null, "text", "", "Font size: normal"],
  ["\\large", null, "text", "", "Font size: large", 1],
  ["\\Large", null, "text", "", "Font size: Large"],
  ["\\LARGE", null, "text", "", "Font size: LARGE"],
  ["\\huge", null, "text", "", "Font size: huge"],
  ["\\Huge", null, "text", "", "Font size: Huge"],
  ["\\code", "\\code{${text}}", "function", "{text}", "Cohere macro: inline code (\\texttt)", 2],
  ["\\kind", "\\kind{${text}}", "function", "{text}", "Cohere macro: bold sans category label", 1],
  ["\\LaTeX", null, "text", "", "The LaTeX logo"],
  ["\\TeX", null, "text", "", "The TeX logo"],
  ["\\ldots", null, "text", "", "Ellipsis …", 1],
  ["\\dots", null, "text", "", "Ellipsis (context-aware)", 1],
  ["\\textbackslash", null, "text", "", "A literal backslash"],
  ["\\textasciitilde", null, "text", "", "A literal tilde"],
  ["\\textendash", null, "text", "", "En dash –"],
  ["\\textemdash", null, "text", "", "Em dash —"],
  ["\\verb", "\\verb|${code}|", "function", "|code|", "Inline verbatim"],

  // paragraphs, spacing, boxes, lengths
  ["\\par", null, "text", "", "End the paragraph"],
  ["\\noindent", null, "text", "", "Suppress paragraph indentation", 2],
  ["\\indent", null, "text", "", "Force paragraph indentation"],
  ["\\centering", null, "text", "", "Centre the rest of the group", 3],
  ["\\raggedright", null, "text", "", "Left-align the rest of the group"],
  ["\\raggedleft", null, "text", "", "Right-align the rest of the group"],
  ["\\newline", null, "text", "", "Line break", 1],
  ["\\linebreak", null, "text", "", "Line break (justified)"],
  ["\\newpage", null, "text", "", "Page break", 2],
  ["\\clearpage", null, "text", "", "Page break, flushing floats", 2],
  ["\\cleardoublepage", null, "text", "", "Page break to an odd page"],
  ["\\pagebreak", null, "text", "", "Encourage a page break"],
  ["\\nopagebreak", null, "text", "", "Discourage a page break"],
  ["\\hfill", null, "text", "", "Stretchable horizontal space", 2],
  ["\\vfill", null, "text", "", "Stretchable vertical space", 1],
  ["\\hspace", "\\hspace{${1em}}", "function", "{length}", "Horizontal space", 1],
  ["\\hspace*", "\\hspace*{${1em}}", "function", "{length}", "Horizontal space, kept at line ends"],
  ["\\vspace", "\\vspace{${1em}}", "function", "{length}", "Vertical space", 2],
  ["\\vspace*", "\\vspace*{${1em}}", "function", "{length}", "Vertical space, kept at page ends"],
  ["\\quad", null, "text", "", "1em horizontal space"],
  ["\\qquad", null, "text", "", "2em horizontal space"],
  ["\\enspace", null, "text", "", "0.5em horizontal space"],
  ["\\smallskip", null, "text", "", "Small vertical skip"],
  ["\\medskip", null, "text", "", "Medium vertical skip"],
  ["\\bigskip", null, "text", "", "Big vertical skip"],
  ["\\phantom", "\\phantom{${text}}", "function", "{text}", "Invisible box the size of its content"],
  ["\\mbox", "\\mbox{${text}}", "function", "{text}", "Unbreakable box"],
  ["\\fbox", "\\fbox{${text}}", "function", "{text}", "Framed box"],
  ["\\parbox", "\\parbox{${width}}{${text}}", "function", "{width}{text}", "Paragraph box of a given width"],
  ["\\makebox", "\\makebox[${width}]{${text}}", "function", "[width]{text}", "Box of a given width"],
  ["\\rule", "\\rule{${width}}{${height}}", "function", "{width}{height}", "Filled rectangle"],
  ["\\textwidth", null, "variable", "", "Width of the text block", 2],
  ["\\linewidth", null, "variable", "", "Width of the current line", 2],
  ["\\columnwidth", null, "variable", "", "Width of the current column"],
  ["\\textheight", null, "variable", "", "Height of the text block"],
  ["\\parindent", null, "variable", "", "Paragraph indentation"],
  ["\\parskip", null, "variable", "", "Space between paragraphs"],
  ["\\baselineskip", null, "variable", "", "Line spacing"],
  ["\\arraystretch", null, "variable", "", "Table row height factor (via \\renewcommand)"],

  // lists, floats, tables
  ["\\item", "\\item ${}", "keyword", "", "List item", 6],
  ["\\item[label]", "\\item[${label}] ${}", "keyword", "[label]", "List item with a custom label", 1],
  ["\\caption", "\\caption{${text}}", "keyword", "{text}", "Float caption", 4],
  ["\\includegraphics", "\\includegraphics[width=${0.8}\\textwidth]{${file}}", "keyword", "[width=…]{file}", "Insert an image", 5],
  ["\\subcaption", "\\subcaption{${text}}", "keyword", "{text}", "subcaption: sub-figure caption"],
  ["\\captionof", "\\captionof{${figure}}{${text}}", "keyword", "{type}{text}", "Caption outside a float"],
  ["\\hline", null, "text", "", "Horizontal table rule", 2],
  ["\\cline", "\\cline{${1-2}}", "function", "{i-j}", "Partial horizontal rule"],
  ["\\toprule", null, "text", "", "booktabs: top rule", 3],
  ["\\midrule", null, "text", "", "booktabs: middle rule", 3],
  ["\\bottomrule", null, "text", "", "booktabs: bottom rule", 3],
  ["\\cmidrule", "\\cmidrule(lr){${1-2}}", "function", "(lr){i-j}", "booktabs: partial rule"],
  ["\\specialrule", "\\specialrule{${0.3pt}}{${0pt}}{${0pt}}", "function", "{width}{above}{below}", "booktabs: custom rule"],
  ["\\addlinespace", null, "text", "", "booktabs: extra space between rows"],
  ["\\rs", null, "text", "", "Cohere macro: hairline table rule", 2],
  ["\\thead", "\\thead{${text}}", "function", "{text}", "Cohere macro: bold small table header cell", 2],
  ["\\multicolumn", "\\multicolumn{${2}}{${c}}{${text}}", "function", "{n}{align}{text}", "Cell spanning n columns", 1],
  ["\\multirow", "\\multirow{${2}}{*}{${text}}", "function", "{n}{width}{text}", "multirow: cell spanning n rows"],
  ["\\tabularnewline", null, "text", "", "Row end (alternative to \\\\)"],
  ["\\arraybackslash", null, "text", "", "Restore \\\\ after \\raggedright in a column spec"],
  ["\\resizebox", "\\resizebox{${\\textwidth}}{!}{${content}}", "function", "{w}{h}{content}", "graphicx: scale content to a size"],
  ["\\scalebox", "\\scalebox{${0.8}}{${content}}", "function", "{factor}{content}", "graphicx: scale content"],
  ["\\rotatebox", "\\rotatebox{${90}}{${content}}", "function", "{angle}{content}", "graphicx: rotate content"],
  ["\\FloatBarrier", null, "text", "", "placeins: flush pending floats"],

  // common environments as blocks
  ["\\begin{itemize}", "\\begin{itemize}\n\t\\item ${}\n\\end{itemize}", "class", "…", "Bulleted list", 2],
  ["\\begin{enumerate}", "\\begin{enumerate}\n\t\\item ${}\n\\end{enumerate}", "class", "…", "Numbered list", 2],
  ["\\begin{description}", "\\begin{description}\n\t\\item[${term}] ${}\n\\end{description}", "class", "…", "Labelled list"],
  ["\\begin{figure}", "\\begin{figure}[${htbp}]\n\t\\centering\n\t\\includegraphics[width=${0.8}\\textwidth]{${file}}\n\t\\caption{${caption}}\n\t\\label{fig:${key}}\n\\end{figure}", "class", "…", "Figure float with image, caption and label", 2],
  ["\\begin{table}", "\\begin{table}[${htbp}]\n\t\\centering\n\t\\caption{${caption}}\n\t\\label{tab:${key}}\n\t\\begin{tabular}{${ll}}\n\t\t\\toprule\n\t\t${header} \\\\\n\t\t\\midrule\n\t\t${row} \\\\\n\t\t\\bottomrule\n\t\\end{tabular}\n\\end{table}", "class", "…", "Table float with a booktabs tabular", 2],
  ["\\begin{equation}", "\\begin{equation}\n\t${}\n\t\\label{eq:${key}}\n\\end{equation}", "class", "…", "Numbered display equation", 2],
  ["\\begin{align}", "\\begin{align}\n\t${} \\\\\n\t${}\n\\end{align}", "class", "…", "Aligned equations", 1],
  ["\\begin{theorem}", "\\begin{theorem}\n\t${}\n\\end{theorem}", "class", "…", "Theorem"],
  ["\\begin{lemma}", "\\begin{lemma}\n\t${}\n\\end{lemma}", "class", "…", "Lemma"],
  ["\\begin{definition}", "\\begin{definition}\n\t${}\n\\end{definition}", "class", "…", "Definition"],
  ["\\begin{proof}", "\\begin{proof}\n\t${}\n\\end{proof}", "class", "…", "Proof (amsthm)"],
  ["\\begin{abstract}", "\\begin{abstract}\n\t${}\n\\end{abstract}", "class", "…", "Abstract"],

  // math
  ["\\frac", "\\frac{${num}}{${den}}", "function", "{num}{den}", "Fraction", 5],
  ["\\dfrac", "\\dfrac{${num}}{${den}}", "function", "{num}{den}", "Display-style fraction"],
  ["\\tfrac", "\\tfrac{${num}}{${den}}", "function", "{num}{den}", "Text-style fraction"],
  ["\\binom", "\\binom{${n}}{${k}}", "function", "{n}{k}", "Binomial coefficient"],
  ["\\sqrt", "\\sqrt{${x}}", "function", "{x}", "Square root", 3],
  ["\\sqrt[n]", "\\sqrt[${n}]{${x}}", "function", "[n]{x}", "n-th root"],
  ["\\sum", "\\sum_{${i=1}}^{${n}}", "function", "_{}^{}", "Summation", 3],
  ["\\prod", "\\prod_{${i=1}}^{${n}}", "function", "_{}^{}", "Product"],
  ["\\int", "\\int_{${a}}^{${b}}", "function", "_{}^{}", "Integral", 2],
  ["\\iint", null, "text", "", "Double integral"],
  ["\\oint", null, "text", "", "Contour integral"],
  ["\\lim", "\\lim_{${x \\to \\infty}}", "function", "_{}", "Limit", 1],
  ["\\infty", null, "text", "", "∞", 2],
  ["\\partial", null, "text", "", "∂", 1],
  ["\\nabla", null, "text", "", "∇"],
  ["\\cdot", null, "text", "", "·", 2],
  ["\\cdots", null, "text", "", "⋯"],
  ["\\vdots", null, "text", "", "⋮"],
  ["\\ddots", null, "text", "", "⋱"],
  ["\\times", null, "text", "", "×", 2],
  ["\\div", null, "text", "", "÷"],
  ["\\pm", null, "text", "", "±", 1],
  ["\\mp", null, "text", "", "∓"],
  ["\\leq", null, "text", "", "≤", 2],
  ["\\geq", null, "text", "", "≥", 2],
  ["\\neq", null, "text", "", "≠", 2],
  ["\\approx", null, "text", "", "≈", 1],
  ["\\equiv", null, "text", "", "≡"],
  ["\\sim", null, "text", "", "∼"],
  ["\\simeq", null, "text", "", "≃"],
  ["\\propto", null, "text", "", "∝"],
  ["\\ll", null, "text", "", "≪"],
  ["\\gg", null, "text", "", "≫"],
  ["\\in", null, "text", "", "∈", 1],
  ["\\notin", null, "text", "", "∉"],
  ["\\subset", null, "text", "", "⊂"],
  ["\\subseteq", null, "text", "", "⊆"],
  ["\\supset", null, "text", "", "⊃"],
  ["\\cup", null, "text", "", "∪"],
  ["\\cap", null, "text", "", "∩"],
  ["\\setminus", null, "text", "", "∖"],
  ["\\emptyset", null, "text", "", "∅"],
  ["\\forall", null, "text", "", "∀"],
  ["\\exists", null, "text", "", "∃"],
  ["\\neg", null, "text", "", "¬"],
  ["\\land", null, "text", "", "∧"],
  ["\\lor", null, "text", "", "∨"],
  ["\\implies", null, "text", "", "⟹"],
  ["\\iff", null, "text", "", "⟺"],
  ["\\to", null, "text", "", "→", 2],
  ["\\rightarrow", null, "text", "", "→"],
  ["\\leftarrow", null, "text", "", "←"],
  ["\\Rightarrow", null, "text", "", "⇒", 1],
  ["\\Leftarrow", null, "text", "", "⇐"],
  ["\\leftrightarrow", null, "text", "", "↔"],
  ["\\Leftrightarrow", null, "text", "", "⇔"],
  ["\\mapsto", null, "text", "", "↦"],
  ["\\left", "\\left${(} ${} \\right${)}", "function", "( … \\right)", "Auto-sized delimiter pair", 2],
  ["\\right", null, "text", "", "Closing auto-sized delimiter"],
  ["\\langle", null, "text", "", "⟨"],
  ["\\rangle", null, "text", "", "⟩"],
  ["\\lfloor", null, "text", "", "⌊"],
  ["\\rfloor", null, "text", "", "⌋"],
  ["\\lceil", null, "text", "", "⌈"],
  ["\\rceil", null, "text", "", "⌉"],
  ["\\lvert", null, "text", "", "| (opening)"],
  ["\\rvert", null, "text", "", "| (closing)"],
  ["\\hat", "\\hat{${x}}", "function", "{x}", "Hat accent", 1],
  ["\\bar", "\\bar{${x}}", "function", "{x}", "Bar accent", 1],
  ["\\vec", "\\vec{${x}}", "function", "{x}", "Vector arrow", 1],
  ["\\tilde", "\\tilde{${x}}", "function", "{x}", "Tilde accent"],
  ["\\dot", "\\dot{${x}}", "function", "{x}", "Dot accent"],
  ["\\ddot", "\\ddot{${x}}", "function", "{x}", "Double-dot accent"],
  ["\\overline", "\\overline{${x}}", "function", "{x}", "Overline"],
  ["\\widehat", "\\widehat{${x}}", "function", "{x}", "Wide hat"],
  ["\\widetilde", "\\widetilde{${x}}", "function", "{x}", "Wide tilde"],
  ["\\overbrace", "\\overbrace{${x}}^{${label}}", "function", "{x}^{label}", "Brace above"],
  ["\\underbrace", "\\underbrace{${x}}_{${label}}", "function", "{x}_{label}", "Brace below"],
  ["\\mathbf", "\\mathbf{${x}}", "function", "{x}", "Bold math", 2],
  ["\\mathrm", "\\mathrm{${x}}", "function", "{x}", "Upright math", 2],
  ["\\mathit", "\\mathit{${x}}", "function", "{x}", "Italic math"],
  ["\\mathcal", "\\mathcal{${X}}", "function", "{X}", "Calligraphic letters", 1],
  ["\\mathbb", "\\mathbb{${R}}", "function", "{X}", "Blackboard bold letters", 2],
  ["\\mathfrak", "\\mathfrak{${X}}", "function", "{X}", "Fraktur letters"],
  ["\\mathsf", "\\mathsf{${x}}", "function", "{x}", "Sans-serif math"],
  ["\\mathtt", "\\mathtt{${x}}", "function", "{x}", "Monospace math"],
  ["\\boldsymbol", "\\boldsymbol{${x}}", "function", "{x}", "Bold symbols (amsmath)", 1],
  ["\\operatorname", "\\operatorname{${name}}", "function", "{name}", "Upright operator name", 1],
  ["\\text", "\\text{${text}}", "function", "{text}", "Text inside math", 3],
  ["\\intertext", "\\intertext{${text}}", "function", "{text}", "Text between aligned rows"],
  ["\\tag", "\\tag{${label}}", "function", "{label}", "Custom equation tag"],
  ["\\nonumber", null, "text", "", "Suppress the equation number"],
  ["\\notag", null, "text", "", "Suppress the equation number (amsmath)"],
  ["\\displaystyle", null, "text", "", "Display-style math sizing"],
  ["\\textstyle", null, "text", "", "Text-style math sizing"],
  ["\\limits", null, "text", "", "Limits above and below the operator"],
  ["\\substack", "\\substack{${a} \\\\ ${b}}", "function", "{a \\\\ b}", "Stacked subscript lines"],
  ["\\bmod", null, "text", "", "mod (binary operator)"],
  ["\\pmod", "\\pmod{${n}}", "function", "{n}", "(mod n)"],
  ...GREEK.map((entry): CommandSpec => [`\\${entry[0]}`, null, "text", "", `Greek letter ${entry[1]}`]),
  ...OPERATORS.map((op): CommandSpec => [`\\${op}`, null, "text", "", `Operator ${op}`]),
];

function toCompletion(spec: CommandSpec): Completion {
  const [label, template, type, detail, info, boost] = spec;
  const base: Completion = { label, type };
  if (detail !== "") base.detail = detail;
  if (info !== undefined) base.info = info;
  if (boost !== undefined) base.boost = boost;
  return template === null ? base : snippetCompletion(template, base);
}

/** Curated command completions (shared across editors; the completion list is immutable). */
export const COMMAND_COMPLETIONS: readonly Completion[] = COMMANDS.map(toCompletion);

// ---------------------------------------------------------------- environments

const ENVIRONMENT_SPECS: readonly (readonly [string, string])[] = [
  ["document", "structure"], ["abstract", "structure"], ["titlepage", "structure"], ["appendices", "structure"],
  ["frame", "beamer"], ["columns", "beamer"], ["column", "beamer"], ["block", "beamer"],
  ["figure", "float"], ["figure*", "float"], ["table", "float"], ["table*", "float"], ["wrapfigure", "float"],
  ["subfigure", "float"], ["subtable", "float"], ["sidewaysfigure", "float"], ["sidewaystable", "float"],
  ["tabular", "table"], ["tabular*", "table"], ["tabularx", "table"], ["xltabular", "table"], ["longtable", "table"],
  ["array", "math"], ["threeparttable", "table"], ["tabbing", "table"],
  ["itemize", "list"], ["enumerate", "list"], ["description", "list"], ["itemize*", "list"], ["enumerate*", "list"], ["list", "list"],
  ["equation", "math"], ["equation*", "math"], ["align", "math"], ["align*", "math"], ["alignat", "math"], ["alignat*", "math"],
  ["gather", "math"], ["gather*", "math"], ["multline", "math"], ["multline*", "math"], ["flalign", "math"],
  ["split", "math"], ["cases", "math"], ["dcases", "math"], ["aligned", "math"], ["gathered", "math"],
  ["matrix", "math"], ["pmatrix", "math"], ["bmatrix", "math"], ["Bmatrix", "math"], ["vmatrix", "math"], ["Vmatrix", "math"],
  ["smallmatrix", "math"], ["subequations", "math"], ["eqnarray", "math"], ["displaymath", "math"], ["math", "math"],
  ["center", "alignment"], ["flushleft", "alignment"], ["flushright", "alignment"],
  ["quote", "text"], ["quotation", "text"], ["verse", "text"], ["minipage", "box"], ["multicols", "layout"], ["landscape", "layout"],
  ["verbatim", "verbatim"], ["verbatim*", "verbatim"], ["lstlisting", "code"], ["minted", "code"], ["comment", "comment"],
  ["filecontents", "file"], ["filecontents*", "file"],
  ["theorem", "theorem"], ["lemma", "theorem"], ["proposition", "theorem"], ["corollary", "theorem"], ["definition", "theorem"],
  ["proof", "theorem"], ["remark", "theorem"], ["example", "theorem"], ["conjecture", "theorem"],
  ["tikzpicture", "graphics"], ["axis", "pgfplots"], ["thebibliography", "bibliography"],
  ["algorithm", "algorithm"], ["algorithmic", "algorithm"], ["framed", "box"], ["mdframed", "box"], ["tcolorbox", "box"],
];

const ENVIRONMENT_DETAILS: ReadonlyMap<string, string> = new Map(ENVIRONMENT_SPECS);
/** Curated environment names (in display order). */
export const ENVIRONMENT_NAMES: readonly string[] = ENVIRONMENT_SPECS.map((e) => e[0]);

// ---------------------------------------------------------------- context detection

const REF_ARG_RE = /\\(?:ref|eqref|autoref|cref|Cref|pageref|nameref|vref|Vref|vpageref|hyperref)\*?(?:\[[^\]]*\])*[{[]([^}\]]*)$/;
const CITE_ARG_RE =
  /\\(?:cite|Cite|parencite|Parencite|textcite|Textcite|autocite|Autocite|footcite|footfullcite|fullcite|smartcite|supercite|citep|citet|citealp|citealt|nocite|citeauthor|citeyear|citeyearpar)\*?(?:\[[^\]]*\])*\{([^}]*)$/;
const TEX_FILE_ARG_RE = /\\(?:input|include|subfile|includeonly)\{([^}]*)$/;
const IMAGE_ARG_RE = /\\includegraphics\*?(?:\[[^\]]*\])?\{([^}]*)$/;
const BIB_ARG_RE = /\\(addbibresource|bibliography)\{([^}]*)$/;
const ENV_ARG_RE = /\\(begin|end)\{([\w*]*)$/;
const COMMAND_PREFIX_RE = /\\([a-zA-Z@]*)$/;

const LABEL_SCAN_RE = /\\label\s*\{([^}]+)\}/g;
const BEGIN_SCAN_RE = /\\begin\{(\w+\*?)\}/g;
const ENV_TOKEN_RE = /\\(begin|end)\s*\{([^}]+)\}/g;

const LIST_ITEM_VALID = /^[^,{}\s]*$/;
const PATH_VALID = /^[^,{}]*$/;
const ENV_VALID = /^[\w*]*$/;
const COMMAND_VALID = /^\\[a-zA-Z@]*$/;

/** The item being typed in a comma-separated argument, and where it starts. */
function listSegment(arg: string, pos: number): { from: number; text: string } {
  const seg = arg.slice(arg.lastIndexOf(",") + 1).replace(/^\s+/, "");
  return { from: pos - seg.length, text: seg };
}

function union(...lists: readonly (readonly string[] | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    for (const item of list ?? []) {
      const s = item.trim();
      if (s !== "" && !seen.has(s)) {
        seen.add(s);
        out.push(s);
      }
    }
  }
  return out;
}

function scanDoc(doc: Text, re: RegExp): string[] {
  const out: string[] = [];
  for (const m of doc.toString().matchAll(re)) out.push(m[1]);
  return out;
}

function extensionOf(path: string): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(path);
  return m ? m[1].toLowerCase() : "";
}

function stripExtension(path: string, ext: string): string {
  return path.toLowerCase().endsWith(ext) ? path.slice(0, -ext.length) : path;
}

/** Environments opened before `pos` and not yet closed (innermost last), ignoring commented lines. */
function openEnvironmentsBefore(doc: Text, pos: number): string[] {
  const stack: string[] = [];
  const lastLine = doc.lineAt(pos).number;
  for (let n = 1; n <= lastLine; n++) {
    const line = doc.line(n);
    const text = stripLineComment(n === lastLine ? line.text.slice(0, pos - line.from) : line.text);
    for (const m of text.matchAll(ENV_TOKEN_RE)) {
      const name = m[2].trim();
      if (m[1] === "begin") {
        stack.push(name);
      } else {
        const idx = stack.lastIndexOf(name);
        if (idx >= 0) stack.length = idx;
      }
    }
  }
  return stack;
}

function simple(label: string, type: CompletionType, detail?: string, boost?: number): Completion {
  const c: Completion = { label, type };
  if (detail !== undefined && detail !== "") c.detail = detail;
  if (boost !== undefined) c.boost = boost;
  return c;
}

/**
 * Context-sensitive completion source: commands after `\`, environment names in
 * `\begin{`/`\end{`, labels, citation keys and file paths inside the matching arguments.
 */
export function latexCompletionSource(
  getData: () => CompletionData,
): (context: CompletionContext) => CompletionResult | null {
  return (context) => {
    const { state, pos } = context;
    if (context.tokenBefore(["comment", "verbatim"])) return null;
    const line = state.doc.lineAt(pos);
    const before = line.text.slice(0, pos - line.from);
    let m: RegExpExecArray | null;

    if ((m = ENV_ARG_RE.exec(before))) {
      const data = getData();
      const names = union(ENVIRONMENT_NAMES, data.environments, scanDoc(state.doc, BEGIN_SCAN_RE));
      const open = m[1] === "end" ? openEnvironmentsBefore(state.doc, pos - m[0].length) : [];
      const innermost = open.length > 0 ? open[open.length - 1] : null;
      return {
        from: pos - m[2].length,
        options: union(innermost === null ? [] : [innermost], names).map((name) =>
          simple(name, "class", ENVIRONMENT_DETAILS.get(name) ?? "environment", name === innermost ? 99 : undefined),
        ),
        validFor: ENV_VALID,
      };
    }

    if ((m = REF_ARG_RE.exec(before))) {
      const seg = listSegment(m[1], pos);
      const labels = union(getData().labels, scanDoc(state.doc, LABEL_SCAN_RE));
      return { from: seg.from, options: labels.map((l) => simple(l, "variable", "label")), validFor: LIST_ITEM_VALID };
    }

    if ((m = CITE_ARG_RE.exec(before))) {
      const seg = listSegment(m[1], pos);
      const keys = union(getData().citeKeys);
      return { from: seg.from, options: keys.map((k) => simple(k, "variable", "citation")), validFor: LIST_ITEM_VALID };
    }

    if ((m = TEX_FILE_ARG_RE.exec(before))) {
      const seg = listSegment(m[1], pos);
      const files = union(getData().texFiles).filter((f) => extensionOf(f) !== "bib");
      return {
        from: seg.from,
        options: files.map((f) => simple(stripExtension(f, ".tex"), "text", extensionOf(f) || "file")),
        validFor: PATH_VALID,
      };
    }

    if ((m = IMAGE_ARG_RE.exec(before))) {
      const files = union(getData().imageFiles);
      return {
        from: pos - m[1].length,
        options: files.map((f) => simple(f, "text", extensionOf(f) || "image")),
        validFor: PATH_VALID,
      };
    }

    if ((m = BIB_ARG_RE.exec(before))) {
      const seg = listSegment(m[2], pos);
      const stripBib = m[1] === "bibliography";
      const files = union(getData().texFiles).filter((f) => extensionOf(f) === "bib");
      return {
        from: seg.from,
        options: files.map((f) => simple(stripBib ? stripExtension(f, ".bib") : f, "text", "bib")),
        validFor: PATH_VALID,
      };
    }

    if ((m = COMMAND_PREFIX_RE.exec(before))) {
      return { from: pos - m[0].length, options: COMMAND_COMPLETIONS, validFor: COMMAND_VALID };
    }
    return null;
  };
}

export function latexCompletion(getData: () => CompletionData): Extension {
  return autocompletion({ override: [latexCompletionSource(getData)], icons: false, activateOnTyping: true });
}

// ---------------------------------------------------------------- environment auto-close

/** Name of the last `\begin{...}` on the line that is not closed on the same line. */
function unclosedBeginOnLine(text: string): string | null {
  let found: string | null = null;
  for (const m of text.matchAll(ENV_TOKEN_RE)) {
    if (m[1] !== "begin") continue;
    const name = m[2].trim();
    if (name !== "" && !text.includes(`\\end{${name}}`, (m.index ?? 0) + m[0].length)) found = name;
  }
  return found;
}

/** Whether an `\end{name}` after `line` closes the `\begin{name}` on it (nesting-aware). */
function hasMatchingEnd(doc: Text, line: Line, name: string): boolean {
  const re = new RegExp(`\\\\(begin|end)\\s*\\{${escapeRegExp(name)}\\}`, "g");
  let depth = 1;
  for (let n = line.number + 1; n <= doc.lines; n++) {
    const text = stripLineComment(doc.line(n).text);
    for (let m = re.exec(text); m; m = re.exec(text)) {
      depth += m[1] === "begin" ? 1 : -1;
      if (depth === 0) return true;
    }
  }
  return false;
}

/**
 * Enter at the end of an unclosed `\begin{env}` line inserts an indented body line
 * and the matching `\end{env}`, leaving the cursor on the body line.
 */
export function closeEnvironmentOnEnter(view: EditorView): boolean {
  const { state } = view;
  const { main, ranges } = state.selection;
  if (ranges.length !== 1 || !main.empty) return false;
  const line = state.doc.lineAt(main.head);
  if (line.text.slice(main.head - line.from).trim() !== "") return false;
  const name = unclosedBeginOnLine(stripLineComment(line.text));
  if (name === null || hasMatchingEnd(state.doc, line, name)) return false;

  const indent = /^\s*/.exec(line.text)?.[0] ?? "";
  const flat = name === "document" || VERBATIM_ENVIRONMENTS.has(name);
  const inner = flat ? indent : indent + state.facet(indentUnit);
  view.dispatch({
    changes: { from: main.head, to: line.to, insert: `\n${inner}\n${indent}\\end{${name}}` },
    selection: { anchor: main.head + 1 + inner.length },
    scrollIntoView: true,
    userEvent: "input",
  });
  return true;
}

/** Runs above the default keymap but below the completion keymap, so Enter still accepts completions. */
export const latexEnvironmentKeymap: Extension = Prec.high(keymap.of([{ key: "Enter", run: closeEnvironmentOnEnter }]));
