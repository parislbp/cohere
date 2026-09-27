/**
 * The seven project templates, inlined from `src-tauri/resources/templates/` with the
 * `{{INCLUDE:block}}` splices already applied. `scaffold()` mirrors `templates::scaffold` in Rust:
 * same folder shape, same placeholder substitution, same texref manifest.
 */
import type { TemplateInfo } from "../types";
import { basename, notFound, pad2, slug } from "./util";

export const TEMPLATES: readonly TemplateInfo[] = [
  {
    key: "blank",
    name: "Blank",
    shortName: "Blank",
    icon: "tplBlank",
    description: "A single main.tex with the essentials: article class, a title, one section, a bibliography file.",
    documentclass: "article",
    unit: "section", unitCmd: "section", subCmd: "subsection", unitDir: "sections", unitLabel: "sec",
    abstractPage: false, toc: false, appendices: false, twocolumn: false,
    defaults: { units: 0, subunits: 0, appendices: 0 },
    prompts: { subtitle: false, tagline: false },
  },
  {
    key: "project",
    name: "Project report",
    shortName: "Project",
    icon: "tplProject",
    description: "Title page, abstract + reading guide, contents, numbered chapters, appendices, bibliography (report class)",
    documentclass: "report",
    unit: "chapter", unitCmd: "chapter", subCmd: "section", unitDir: "chapters", unitLabel: "ch",
    abstractPage: true, toc: true, appendices: true, twocolumn: false,
    defaults: { units: 3, subunits: 2, appendices: 1 },
    prompts: { subtitle: true, tagline: true },
  },
  {
    key: "brief",
    name: "Brief",
    shortName: "Brief",
    icon: "tplBrief",
    description: "No cover page: title block, inline abstract, numbered sections, appendices, references (article class)",
    documentclass: "article",
    unit: "section", unitCmd: "section", subCmd: "subsection", unitDir: "sections", unitLabel: "sec",
    abstractPage: true, toc: false, appendices: true, twocolumn: false,
    defaults: { units: 4, subunits: 1, appendices: 1 },
    prompts: { subtitle: true, tagline: false },
  },
  {
    key: "periodical",
    name: "Periodical (two columns)",
    shortName: "Periodical",
    icon: "tplPeriodical",
    description: "Two-column article: spanning title block and abstract, numbered sections, appendices, references (article class, 10pt)",
    documentclass: "article",
    unit: "section", unitCmd: "section", subCmd: "subsection", unitDir: "sections", unitLabel: "sec",
    abstractPage: true, toc: false, appendices: true, twocolumn: true,
    defaults: { units: 4, subunits: 1, appendices: 0 },
    prompts: { subtitle: true, tagline: false },
  },
  {
    key: "minimal",
    name: "Minimal",
    shortName: "Minimal",
    icon: "tplMinimal",
    description: "Blank canvas with the house table/equation styles: one-line title, numbered sections, references (article class)",
    documentclass: "article",
    unit: "section", unitCmd: "section", subCmd: "subsection", unitDir: "sections", unitLabel: "sec",
    abstractPage: false, toc: false, appendices: true, twocolumn: false,
    defaults: { units: 2, subunits: 0, appendices: 0 },
    prompts: { subtitle: false, tagline: false },
  },
  {
    key: "paper",
    name: "Paper (two columns)",
    shortName: "Paper, 2-column",
    icon: "tplPaper2",
    description: "House paper style in two columns: warm sheet, paneled abstract spanning both columns, hairline sections with accent numbers, framed figures, faded version foot (article class, 10pt)",
    documentclass: "article",
    unit: "section", unitCmd: "section", subCmd: "subsection", unitDir: "sections", unitLabel: "sec",
    abstractPage: true, toc: false, appendices: true, twocolumn: true,
    defaults: { units: 5, subunits: 2, appendices: 0 },
    prompts: { subtitle: true, tagline: true },
  },
  {
    key: "paper-single",
    name: "Paper (one column)",
    shortName: "Paper, 1-column",
    icon: "tplPaper1",
    description: "House paper style in one column: warm sheet, paneled abstract, hairline sections with accent numbers that can each start a page, framed figures, faded version foot (article class, 11pt)",
    documentclass: "article",
    unit: "section", unitCmd: "section", subCmd: "subsection", unitDir: "sections", unitLabel: "sec",
    abstractPage: true, toc: false, appendices: true, twocolumn: false,
    defaults: { units: 5, subunits: 2, appendices: 0 },
    prompts: { subtitle: true, tagline: true },
  },
];

export const templateByKey = (key: string): TemplateInfo | undefined => TEMPLATES.find((t) => t.key === key);

// ── shared blocks (_shared/blocks/*.tex) ─────────────────────────────────────────────────────

const PACKAGES = String.raw`% ---------------------------------------------------------------- core packages
\usepackage{amsmath,amssymb,amsthm,bm,mathtools}
\usepackage{microtype}
\usepackage[dvipsnames,table]{xcolor}
\usepackage{graphicx}
\graphicspath{{figures/}}
\usepackage{setspace}
\setstretch{1.15}
\usepackage{titlesec}
\usepackage{enumitem}
\setlist{itemsep=2pt,topsep=3pt,leftmargin=1.5em}
\usepackage{parskip}
\usepackage{caption}
\captionsetup{font=small,labelfont=bf,skip=6pt}
\usepackage{listings}
\usepackage{needspace}`;

const TABLES = String.raw`% ---------------------------------------------------------------- tables
% Hairline rules in a warm grey, generous row height, bold small headers.
%   L{width}  left-aligned fixed-width column      Y  left-aligned stretch column (tabularx/xltabular)
%   \rs       hairline separator between body rows  \thead{..}  header cell
\usepackage{booktabs,tabularx,array,multirow,colortbl}
\definecolor{hair}{HTML}{C9C4B8}
\definecolor{paper}{HTML}{F4F2EE}
\newcolumntype{L}[1]{>{\raggedright\arraybackslash}p{#1}}
\newcolumntype{Y}{>{\raggedright\arraybackslash}X}
\newcommand{\rs}{\arrayrulecolor{hair}\specialrule{0.3pt}{0pt}{0pt}\arrayrulecolor{black}}
\renewcommand{\arraystretch}{1.28}
\newcommand{\thead}[1]{\textbf{\small #1}}`;

const CODE = String.raw`% ---------------------------------------------------------------- code
\lstset{basicstyle=\ttfamily\footnotesize,breaklines=true,breakatwhitespace=false,columns=fullflexible,keepspaces=true,
        frame=single,rulecolor=\color{hair},backgroundcolor=\color{paper},xleftmargin=4pt,framexleftmargin=4pt,postbreak=\mbox{\textcolor{gray}{$\hookrightarrow$}\space}}`;

const MACROS = String.raw`% ---------------------------------------------------------------- macros
\newcommand{\code}[1]{\texttt{#1}}
\newcommand{\kind}[1]{\textsf{\textbf{#1}}}
\newcommand{\usd}{\$}
\newcommand{\dt}{\Delta t}
% add project notation here, e.g.
% \newcommand{\Tset}{\mathcal{T}}`;

const BIB = String.raw`% ---------------------------------------------------------------- bibliography (biblatex + biber; latexmk runs biber automatically)
\usepackage[backend=biber,style=numeric-comp,sorting=none,maxbibnames=6,giveninits=true]{biblatex}
\addbibresource{references/ref.bib}`;

const HYPERREF = String.raw`% ---------------------------------------------------------------- links (load last)
\usepackage[colorlinks=true,linkcolor=NavyBlue,citecolor=NavyBlue,urlcolor=NavyBlue]{hyperref}
\hypersetup{pdftitle={\doctitle},pdfauthor={\docauthor}}`;

// ── main.tex per template ────────────────────────────────────────────────────────────────────

const PROJECT_MAIN = String.raw`% {{FOLDER}}/main.tex — {{TITLE}}
% texref · project template · created {{CREATED}}
% Build: make · make launch (Skim watch) · make name NAME=<pdf> · make archive TAG=<tag>
% =====================================================================================================================
\documentclass[11pt,letterpaper]{report}
\usepackage[margin=1in]{geometry}
${PACKAGES}
\usepackage{xltabular}
${TABLES}
${CODE}

% ---------------------------------------------------------------- document metadata (edit here)
\newcommand{\doctitle}{{{TITLE}}}
\newcommand{\docsubtitle}{{{SUBTITLE}}}
\newcommand{\doctagline}{{{TAGLINE}}}
\newcommand{\docauthor}{{{AUTHOR}}}
\newcommand{\docdate}{{{DATE}}}
\newcommand{\docversion}{{{VERSION}}}
% Foot of the title page, right below the date. Extend with \quad\textperiodcentered\quad, e.g.
%   version \docversion \quad\textperiodcentered\quad inputs book v0.3.2 \quad\textperiodcentered\quad supersedes v0.1.0
\newcommand{\docfootline}{version \docversion}

% ---------------------------------------------------------------- chapter/section styling
\usepackage[titles]{tocloft}
\titleformat{\chapter}[hang]{\normalfont\LARGE\bfseries}{\thechapter\quad}{0pt}{}
\titlespacing*{\chapter}{0pt}{0pt}{18pt}
\titleformat{\section}{\normalfont\large\bfseries}{\thesection\quad}{0pt}{}
\titlespacing*{\section}{0pt}{14pt}{6pt}
\titleformat{\subsection}{\normalfont\normalsize\bfseries}{\thesubsection\quad}{0pt}{}
\titlespacing*{\subsection}{0pt}{10pt}{4pt}
% Appendices print "Appendix A" on its own line with the (optional) name beneath; the TOC reads "Appendix A" too.
\newcommand{\startappendices}{%
  \appendix
  \titleformat{\chapter}[display]{\normalfont\LARGE\bfseries}{Appendix~\thechapter}{4pt}{\Large}
  \titlespacing*{\chapter}{0pt}{0pt}{18pt}
  \addtocontents{toc}{\protect\renewcommand{\protect\cftchappresnum}{Appendix~}\protect\setlength{\protect\cftchapnumwidth}{6.8em}}%
}

% ---------------------------------------------------------------- theorems
\newtheorem{definition}{Definition}[chapter]
\newtheorem{proposition}{Proposition}[chapter]
\newtheorem{assumption}{Assumption}[chapter]

${MACROS}
${BIB}
${HYPERREF}

\begin{document}

% =====================================================================================================================
\begin{titlepage}
\centering
\vspace*{3cm}
{\Huge\bfseries \doctitle\par}
\vspace{10pt}
{\Large \docsubtitle\par}
\vspace{6pt}
{\large \doctagline\par}
\vspace{3cm}
{\large \docauthor\par}
\vfill
{\normalsize \docdate\par}
\vspace{4pt}
{\small \docfootline\par}
\end{titlepage}

% =====================================================================================================================
\clearpage
\thispagestyle{plain}
\input{{{UNIT_DIR}}/abstract}

% =====================================================================================================================
\clearpage
\pagestyle{plain}
\tableofcontents

% =====================================================================================================================
% >>> texref:units  (managed by tex-add / tex-rm — edit order here if you must, keep the markers)
{{UNIT_INPUTS}}
% <<< texref:units

% =====================================================================================================================
\startappendices
% >>> texref:appendices
{{APPENDIX_INPUTS}}
% <<< texref:appendices

% =====================================================================================================================
\clearpage
\printbibliography[heading=bibintoc]

\end{document}
`;

const BRIEF_MAIN = String.raw`% {{FOLDER}}/main.tex — {{TITLE}}
% texref · brief template · created {{CREATED}}
% Build: make · make launch (Skim watch) · make name NAME=<pdf> · make archive TAG=<tag>
% =====================================================================================================================
\documentclass[11pt,letterpaper]{article}
\usepackage[margin=1in]{geometry}
${PACKAGES}
\usepackage{xltabular}
${TABLES}
${CODE}

% ---------------------------------------------------------------- document metadata (edit here)
\newcommand{\doctitle}{{{TITLE}}}
\newcommand{\docsubtitle}{{{SUBTITLE}}}
\newcommand{\docauthor}{{{AUTHOR}}}
\newcommand{\docdate}{{{DATE}}}
\newcommand{\docversion}{{{VERSION}}}
\newcommand{\docfootline}{version \docversion}

% ---------------------------------------------------------------- headings
\titleformat{\section}{\normalfont\large\bfseries}{\thesection\quad}{0pt}{}
\titlespacing*{\section}{0pt}{14pt}{6pt}
\titleformat{\subsection}{\normalfont\normalsize\bfseries}{\thesubsection\quad}{0pt}{}
\titlespacing*{\subsection}{0pt}{10pt}{4pt}
\titleformat{\subsubsection}{\normalfont\normalsize\itshape}{\thesubsubsection\quad}{0pt}{}
\titlespacing*{\subsubsection}{0pt}{8pt}{3pt}
% Appendices print "Appendix A" on its own line with the (optional) name beneath.
\newcommand{\startappendices}{%
  \appendix
  \titleformat{\section}[display]{\normalfont\large\bfseries}{Appendix~\thesection}{2pt}{\large}
  \titlespacing*{\section}{0pt}{18pt}{8pt}
}

% ---------------------------------------------------------------- running header
\usepackage{fancyhdr}
\pagestyle{fancy}
\fancyhf{}
\fancyhead[L]{\small\itshape \doctitle}
\fancyhead[R]{\small \thepage}
\renewcommand{\headrulewidth}{0.3pt}
\renewcommand{\headrule}{\hbox to\headwidth{\color{hair}\leaders\hrule height \headrulewidth\hfill}}
\fancypagestyle{plain}{\fancyhf{}\renewcommand{\headrulewidth}{0pt}}

% ---------------------------------------------------------------- theorems
\newtheorem{definition}{Definition}[section]
\newtheorem{proposition}{Proposition}[section]
\newtheorem{assumption}{Assumption}[section]

${MACROS}
${BIB}
${HYPERREF}

\begin{document}
\thispagestyle{plain}

% =====================================================================================================================
\begin{center}
{\LARGE\bfseries \doctitle\par}
\vspace{6pt}
{\large \docsubtitle\par}
\vspace{10pt}
{\normalsize \docauthor\par}
\vspace{3pt}
{\small \docdate \quad\textperiodcentered\quad \docfootline\par}
\end{center}
\vspace{2pt}
{\color{hair}\hrule height 0.3pt}
\vspace{10pt}

\input{{{UNIT_DIR}}/abstract}

% =====================================================================================================================
% >>> texref:units  (managed by tex-add / tex-rm — edit order here if you must, keep the markers)
{{UNIT_INPUTS}}
% <<< texref:units

% =====================================================================================================================
\startappendices
% >>> texref:appendices
{{APPENDIX_INPUTS}}
% <<< texref:appendices

% =====================================================================================================================
\printbibliography

\end{document}
`;

const PERIODICAL_MAIN = String.raw`% {{FOLDER}}/main.tex — {{TITLE}}
% texref · periodical template (two columns) · created {{CREATED}}
% Build: make · make launch (Skim watch) · make name NAME=<pdf> · make archive TAG=<tag>
% Two-column notes: xltabular/longtable cannot be used; use tabularx on \columnwidth inside table,
% or table*/figure* (with \textwidth) to span both columns. See {{UNIT_DIR}}/{{FIRST_UNIT_FILE}}.
% =====================================================================================================================
\documentclass[10pt,letterpaper,twocolumn]{article}
\usepackage[margin=0.85in,columnsep=20pt]{geometry}
${PACKAGES}
\setstretch{1.08}
${TABLES}
${CODE}

% ---------------------------------------------------------------- document metadata (edit here)
\newcommand{\doctitle}{{{TITLE}}}
\newcommand{\docsubtitle}{{{SUBTITLE}}}
\newcommand{\docauthor}{{{AUTHOR}}}
\newcommand{\docdate}{{{DATE}}}
\newcommand{\docversion}{{{VERSION}}}
\newcommand{\docfootline}{version \docversion}

% ---------------------------------------------------------------- headings
\titleformat{\section}{\normalfont\large\bfseries}{\thesection\quad}{0pt}{}
\titlespacing*{\section}{0pt}{12pt}{5pt}
\titleformat{\subsection}{\normalfont\normalsize\bfseries}{\thesubsection\quad}{0pt}{}
\titlespacing*{\subsection}{0pt}{8pt}{3pt}
\titleformat{\subsubsection}{\normalfont\normalsize\itshape}{\thesubsubsection\quad}{0pt}{}
\titlespacing*{\subsubsection}{0pt}{6pt}{2pt}
% Appendices print "Appendix A" on its own line with the (optional) name beneath.
\newcommand{\startappendices}{%
  \appendix
  \titleformat{\section}[display]{\normalfont\large\bfseries}{Appendix~\thesection}{2pt}{\large}
  \titlespacing*{\section}{0pt}{16pt}{6pt}
}
% Title block + abstract spanning both columns
\makeatletter
\newcommand{\spanningtop}[1]{\twocolumn[\begin{@twocolumnfalse}#1\end{@twocolumnfalse}]}
\makeatother

% ---------------------------------------------------------------- running header
\usepackage{fancyhdr}
\pagestyle{fancy}
\fancyhf{}
\fancyhead[L]{\small\itshape \doctitle}
\fancyhead[R]{\small \thepage}
\renewcommand{\headrulewidth}{0.3pt}
\renewcommand{\headrule}{\hbox to\headwidth{\color{hair}\leaders\hrule height \headrulewidth\hfill}}
\fancypagestyle{plain}{\fancyhf{}\renewcommand{\headrulewidth}{0pt}}

% ---------------------------------------------------------------- theorems
\newtheorem{definition}{Definition}[section]
\newtheorem{proposition}{Proposition}[section]

${MACROS}
${BIB}
\renewcommand*{\bibfont}{\small}
${HYPERREF}

\begin{document}

% =====================================================================================================================
\spanningtop{%
\begin{center}
{\LARGE\bfseries \doctitle\par}
\vspace{6pt}
{\large \docsubtitle\par}
\vspace{8pt}
{\normalsize \docauthor\par}
\vspace{2pt}
{\small \docdate \quad\textperiodcentered\quad \docfootline\par}
\end{center}
\vspace{2pt}
\input{{{UNIT_DIR}}/abstract}
\vspace{12pt}
}
\thispagestyle{plain}

% =====================================================================================================================
% >>> texref:units  (managed by tex-add / tex-rm — edit order here if you must, keep the markers)
{{UNIT_INPUTS}}
% <<< texref:units

% =====================================================================================================================
\startappendices
% >>> texref:appendices
{{APPENDIX_INPUTS}}
% <<< texref:appendices

% =====================================================================================================================
\printbibliography

\end{document}
`;

const MINIMAL_MAIN = String.raw`% {{FOLDER}}/main.tex — {{TITLE}}
% texref · minimal template · created {{CREATED}}
% Build: make · make launch (Skim watch) · make name NAME=<pdf> · make archive TAG=<tag>
% =====================================================================================================================
\documentclass[11pt,letterpaper]{article}
\usepackage[margin=1in]{geometry}
${PACKAGES}
\usepackage{xltabular}
${TABLES}
${CODE}

% ---------------------------------------------------------------- document metadata (edit here)
\newcommand{\doctitle}{{{TITLE}}}
\newcommand{\docauthor}{{{AUTHOR}}}
\newcommand{\docdate}{{{DATE}}}
\newcommand{\docversion}{{{VERSION}}}

% ---------------------------------------------------------------- headings
\titleformat{\section}{\normalfont\large\bfseries}{\thesection\quad}{0pt}{}
\titlespacing*{\section}{0pt}{14pt}{6pt}
\titleformat{\subsection}{\normalfont\normalsize\bfseries}{\thesubsection\quad}{0pt}{}
\titlespacing*{\subsection}{0pt}{10pt}{4pt}
\newcommand{\startappendices}{%
  \appendix
  \titleformat{\section}[display]{\normalfont\large\bfseries}{Appendix~\thesection}{2pt}{\large}
}

${MACROS}
${BIB}
${HYPERREF}

\begin{document}

% =====================================================================================================================
\noindent{\LARGE\bfseries \doctitle\par}
\vspace{4pt}
\noindent{\normalsize \docauthor \quad\textperiodcentered\quad \docdate \quad\textperiodcentered\quad version \docversion\par}
\vspace{6pt}
{\color{hair}\hrule height 0.3pt}
\vspace{10pt}

% =====================================================================================================================
% >>> texref:units  (managed by tex-add / tex-rm — edit order here if you must, keep the markers)
{{UNIT_INPUTS}}
% <<< texref:units

% =====================================================================================================================
\startappendices
% >>> texref:appendices
{{APPENDIX_INPUTS}}
% <<< texref:appendices

% =====================================================================================================================
\printbibliography

\end{document}
`;

/** Generated in code on the Rust side too (`BLANK_MAIN`). */
export const BLANK_MAIN = String.raw`% main.tex — {{TITLE}}
\documentclass[11pt,letterpaper]{article}
\usepackage[margin=1in]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\graphicspath{{figures/}}
\usepackage{booktabs}
\usepackage[dvipsnames]{xcolor}
\usepackage{parskip}
\usepackage[backend=biber,style=numeric-comp]{biblatex}
\addbibresource{references/ref.bib}
\usepackage[colorlinks=true,linkcolor=NavyBlue,citecolor=NavyBlue,urlcolor=NavyBlue]{hyperref}

\title{{{TITLE}}}
\author{{{AUTHOR}}}
\date{{{DATE}}}

\begin{document}
\maketitle

\section{Introduction}
Begin here.

\printbibliography
\end{document}
`;

const PAPERSTYLE = String.raw`% ---------------------------------------------------------------- paper style
% The house paper look: warm sheet, default Computer Modern text and headings, hairline section rules with the
% number in accent, a paneled abstract, framed figures, accent-bordered pull quotes, a faded version foot.
% No font packages are loaded, so the text matches the other house templates; add them here if wanted.
\usepackage{etoolbox}
\usepackage{lettrine}
\usepackage{tikz}
\usepackage[most]{tcolorbox}

% ---- palette (hair and paper come from the tables block) ------------------------------------------------------------
\definecolor{sheet}{HTML}{FBFAF7}      % page
\definecolor{ink}{HTML}{1A1A1A}
\definecolor{ink2}{HTML}{3D3B38}
\definecolor{ink3}{HTML}{6E6A63}
\definecolor{ink4}{HTML}{A39E94}
\definecolor{hairtwo}{HTML}{E3DFD6}
\definecolor{accent}{HTML}{1F4E79}
\definecolor{accentsoft}{HTML}{DCE6F1}
\pagecolor{sheet}                      % comment out for a white page
\color{ink}

% ---- tables: roman body, small sans uppercase headers, heavier top/bottom rules, hairlines between rows -----------
\setlength{\heavyrulewidth}{0.9pt}
\setlength{\lightrulewidth}{0.55pt}
\renewcommand{\arraystretch}{1.22}
\renewcommand{\thead}[1]{{\sffamily\bfseries\scriptsize\textls[70]{\MakeUppercase{#1}}}}
\newenvironment{papertable}{\par\small}{\par}      % wrap a table to set it small
\captionsetup{font={small},labelfont={bf},labelsep=period,justification=justified,skip=8pt}
\captionsetup[table]{position=above,skip=8pt}

% ---- headings: house roman bold, number in accent, hairline above a section unless it starts a page --------------
\newif\ifsecrule \secruletrue
\titleformat{\section}
  {\ifsecrule\color{hair}\titlerule[0.3pt]\vspace{13pt}\fi\global\secruletrue\color{ink}\normalfont\large\bfseries}
  {\textcolor{accent}{\normalfont\normalsize\thesection}}{1.1em}{}
\titlespacing*{\section}{0pt}{22pt}{6pt}
\titleformat{\subsection}
  {\normalfont\normalsize\bfseries\color{ink}}
  {\textcolor{accent}{\normalfont\normalsize\bfseries\thesubsection}}{0.75em}{}
\titlespacing*{\subsection}{0pt}{12pt}{4pt}
\titleformat{\subsubsection}
  {\normalfont\normalsize\itshape\color{ink}}
  {\textcolor{accent}{\normalfont\normalsize\thesubsubsection}}{0.75em}{}
\titlespacing*{\subsubsection}{0pt}{9pt}{3pt}
\newcommand{\startappendices}{%
  \appendix
  \titleformat{\section}[display]
    {\color{hair}\titlerule[0.3pt]\vspace{13pt}\color{ink}\normalfont\large\bfseries}
    {\textcolor{accent}{\normalfont\normalsize Appendix~\thesection}}{2pt}{}
  \titlespacing*{\section}{0pt}{22pt}{8pt}
}
% \deck{...} right after \section: an italic one-line standfirst.
\newcommand{\deck}[1]{\vspace{-3pt}\noindent{\itshape\color{ink2}#1\par}\vspace{9pt}}
% \lead{I}{t was the best of times}: two-line accent drop cap on the opening paragraph.
\renewcommand{\LettrineFontHook}{\color{accent}}
\renewcommand{\LettrineTextFont}{\normalfont}      % no small caps after the initial
\newcommand{\lead}[2]{\lettrine[lines=2,lhang=0.04,findent=3pt,nindent=0pt]{#1}{#2}}

% ---- panels -------------------------------------------------------------------------------------------------------
\tcbset{paperpanel/.style={enhanced,breakable,sharp corners,frame hidden,boxrule=0pt,colback=paper,boxsep=0pt,
                           left=14pt,right=14pt,top=11pt,bottom=12pt,before skip=10pt,after skip=14pt}}
\newtcolorbox{summary}{paperpanel,borderline north={1.5pt}{0pt}{accent}}                 % abstract / executive summary
\newtcolorbox{eqpanel}{enhanced,sharp corners,colback=paper,colframe=hair,boxrule=0.3pt,boxsep=0pt,
                       left=10pt,right=10pt,top=8pt,bottom=8pt,before skip=10pt,after skip=10pt}
\newtcolorbox{eqhero}{enhanced,sharp corners,colback=white,colframe=accent,boxrule=0.5pt,boxsep=0pt,
                      left=10pt,right=10pt,top=10pt,bottom=10pt,before skip=12pt,after skip=12pt}
\newtcolorbox{figframe}{enhanced,sharp corners,colback=white,colframe=hairtwo,boxrule=0.3pt,boxsep=0pt,
                        left=6pt,right=6pt,top=8pt,bottom=4pt}
\newtcolorbox{pullquote}{enhanced,blanker,breakable,borderline west={1.5pt}{0pt}{accent},boxsep=0pt,
                         left=12pt,top=2pt,bottom=2pt,before skip=8pt,after skip=8pt}
% \panelhead{Abstract}: small-caps accent label at the top of a panel.
\newcommand{\panelhead}[1]{{\sffamily\bfseries\scriptsize\color{accent}\textls[180]{\MakeUppercase{#1}}\par}\vspace{7pt}}
% \readingguide{...}: hairline, then a labelled guide line, inside the summary panel.
\newcommand{\readingguide}[1]{\par\vspace{9pt}{\color{hair}\hrule height 0.3pt}\vspace{8pt}%
  {\small\color{ink2}{\sffamily\bfseries\scriptsize\textls[90]{READING GUIDE}}\ \ #1\par}}
% \eqnote{...}: a small line under an equation in a panel (number, units, a gloss).
\newcommand{\eqnote}[1]{\par\vspace{5pt}{\centering\footnotesize\color{ink3}#1\par}}
% \pill{A} / \pillaccent{B}: rounded tags for short codes in tables.
\newcommand{\pill}[1]{\tikz[baseline=(p.base)]\node[draw=hair,line width=0.3pt,rounded corners=5pt,inner xsep=4pt,inner ysep=1.6pt,font=\sffamily\bfseries\tiny,text=ink2](p){#1};}
\newcommand{\pillaccent}[1]{\tikz[baseline=(p.base)]\node[draw=accent,line width=0.4pt,rounded corners=5pt,inner xsep=4pt,inner ysep=1.6pt,font=\sffamily\bfseries\tiny,text=accent](p){#1};}
% \colophon{...}: hairline and a small muted closing note.
\newcommand{\colophon}[1]{\par\vspace{22pt}{\color{hair}\hrule height 0.3pt}\vspace{8pt}{\footnotesize\color{ink3}#1\par}}

% ---- running header (hairline, as in the other house templates) and faded version in the foot -----------------------
\usepackage{fancyhdr}
\setlength{\headheight}{22pt}
\pagestyle{fancy}
\fancyhf{}
\fancyhead[L]{\small\itshape\docshorttitle}
\fancyhead[R]{\small\thepage}
\fancyfoot[R]{\scriptsize\color{ink4}v\docversion}
\renewcommand{\headrulewidth}{0.3pt}
\renewcommand{\headrule}{\hbox to\headwidth{\color{hair}\leaders\hrule height \headrulewidth\hfill}}
\fancypagestyle{plain}{\fancyhf{}\fancyfoot[R]{\scriptsize\color{ink4}v\docversion}\renewcommand{\headrulewidth}{0pt}}`;

const PAPER_MAIN = String.raw`% {{FOLDER}}/main.tex — {{TITLE}}
% texref · paper template (two columns) · created {{CREATED}}
% Build: make · make launch (Skim watch) · make name NAME=<pdf> · make archive TAG=<tag>
% Two-column notes: xltabular/longtable cannot be used; use tabularx on \columnwidth inside table,
% or table*/figure* (with \textwidth) to span both columns. See {{UNIT_DIR}}/{{FIRST_UNIT_FILE}}.
% Default LaTeX fonts, as in the other house templates. Style macros (defined in the paperstyle block): \deck{..} \lead{X}{..} \panelhead{..} \readingguide{..} \eqnote{..}
%   \pill{A} \pillaccent{B} \colophon{..}   environments: summary · eqpanel · eqhero · figframe · pullquote · papertable
% =====================================================================================================================
\documentclass[10pt,letterpaper,twocolumn]{article}
\usepackage[margin=0.8in,columnsep=24pt]{geometry}
% ---------------------------------------------------------------- core packages
\usepackage{amsmath,amssymb,amsthm,mathtools}
\usepackage{microtype}
\usepackage[dvipsnames,table]{xcolor}
\usepackage{graphicx}
\graphicspath{{figures/}}
\usepackage{setspace}
\usepackage{titlesec}
\usepackage{enumitem}
\setlist{itemsep=3pt,topsep=4pt,leftmargin=1.35em}
\usepackage{parskip}
\usepackage{caption}
\usepackage{listings}
\usepackage{needspace}
${TABLES}
${CODE}
${PAPERSTYLE}
\usepackage{bm}
\setstretch{1.08}
\setlength{\columnseprule}{0.3pt}
\makeatletter   % color the column rule (the kernel draws it with \normalcolor; multicol's \columnseprulecolor does not apply)
\patchcmd{\@outputdblcol}{\normalcolor\vrule}{\color{hairtwo}\vrule}{}{}
\makeatother

% ---------------------------------------------------------------- document metadata (edit here)
\newcommand{\doctitle}{{{TITLE}}}
\newcommand{\docshorttitle}{\doctitle}          % running header; shorten if the title is long
\newcommand{\docsubtitle}{{{SUBTITLE}}}
\newcommand{\doceyebrow}{{{TAGLINE}}}           % small letterspaced line above the title, e.g. "Frontier · Diligence Brief"
\newcommand{\docauthor}{{{AUTHOR}}}
\newcommand{\docdate}{{{DATE}}}
\newcommand{\docversion}{{{VERSION}}}           % prints faded at the foot of every page

% ---------------------------------------------------------------- theorems
\newtheorem{definition}{Definition}[section]
\newtheorem{proposition}{Proposition}[section]
\newtheorem{assumption}{Assumption}[section]

% Title block + abstract spanning both columns
\makeatletter
\newcommand{\spanningtop}[1]{\twocolumn[\begin{@twocolumnfalse}#1\end{@twocolumnfalse}]}
\makeatother
% Sections flow in the columns. Put \unitpage before a \section to start it on a fresh page (rule suppressed).
\newcommand{\unitpage}{\clearpage\secrulefalse}

${MACROS}
${BIB}
\renewcommand*{\bibfont}{\small}
${HYPERREF}
\hypersetup{linkcolor=accent,citecolor=accent,urlcolor=accent}

\begin{document}

% =====================================================================================================================
\spanningtop{%
\begin{center}
\ifdefempty{\doceyebrow}{}{{\sffamily\scriptsize\bfseries\color{ink3}\textls[180]{\MakeUppercase{\doceyebrow}}\par}\vspace{14pt}}
{\LARGE\bfseries \doctitle\par}
\vspace{6pt}
{\large\itshape\color{ink2} \docsubtitle\par}
\vspace{10pt}
{\normalsize \docauthor\par}
\vspace{3pt}
{\small\color{ink3} \docdate\par}
\end{center}
\vspace{10pt}
\input{{{UNIT_DIR}}/abstract}
\vspace{10pt}
}
\thispagestyle{plain}
\secrulefalse   % the first section sits under the abstract panel without a hairline

% =====================================================================================================================
% >>> texref:units  (managed by tex-add / tex-rm — edit order here if you must, keep the markers)
{{UNIT_INPUTS}}
% <<< texref:units

% =====================================================================================================================
\startappendices
% >>> texref:appendices
{{APPENDIX_INPUTS}}
% <<< texref:appendices

% =====================================================================================================================
\printbibliography

\colophon{\textbf{Colophon.} \doctitle, version \docversion.}

\end{document}
`;

const PAPER_SINGLE_MAIN = String.raw`% {{FOLDER}}/main.tex — {{TITLE}}
% texref · paper template (one column) · created {{CREATED}}
% Build: make · make launch (Skim watch) · make name NAME=<pdf> · make archive TAG=<tag>
% Default LaTeX fonts, as in the other house templates. Style macros (defined in the paperstyle block): \deck{..} \lead{X}{..} \panelhead{..} \readingguide{..} \eqnote{..}
%   \pill{A} \pillaccent{B} \colophon{..}   environments: summary · eqpanel · eqhero · figframe · pullquote · papertable
% Put \unitpage on the line before a \section to start it on a fresh page (the hairline above it is suppressed).
% =====================================================================================================================
\documentclass[11pt,letterpaper]{article}
\usepackage[margin=1in]{geometry}
% ---------------------------------------------------------------- core packages
\usepackage{amsmath,amssymb,amsthm,mathtools}
\usepackage{microtype}
\usepackage[dvipsnames,table]{xcolor}
\usepackage{graphicx}
\graphicspath{{figures/}}
\usepackage{setspace}
\usepackage{titlesec}
\usepackage{enumitem}
\setlist{itemsep=3pt,topsep=4pt,leftmargin=1.35em}
\usepackage{parskip}
\usepackage{caption}
\usepackage{listings}
\usepackage{needspace}
\usepackage{xltabular}
${TABLES}
${CODE}
${PAPERSTYLE}
\usepackage{bm}
\setstretch{1.15}

% ---------------------------------------------------------------- document metadata (edit here)
\newcommand{\doctitle}{{{TITLE}}}
\newcommand{\docshorttitle}{\doctitle}          % running header; shorten if the title is long
\newcommand{\docsubtitle}{{{SUBTITLE}}}
\newcommand{\doceyebrow}{{{TAGLINE}}}           % small letterspaced line above the title, e.g. "Frontier · Diligence Brief"
\newcommand{\docauthor}{{{AUTHOR}}}
\newcommand{\docdate}{{{DATE}}}
\newcommand{\docversion}{{{VERSION}}}           % prints faded at the foot of every page

% ---------------------------------------------------------------- theorems
\newtheorem{definition}{Definition}[section]
\newtheorem{proposition}{Proposition}[section]
\newtheorem{assumption}{Assumption}[section]

% \unitpage before a \section: fresh page, no hairline above the heading.
\newcommand{\unitpage}{\clearpage\secrulefalse}

${MACROS}
${BIB}
${HYPERREF}
\hypersetup{linkcolor=accent,citecolor=accent,urlcolor=accent}

\begin{document}
\thispagestyle{plain}

% =====================================================================================================================
\begin{center}
\ifdefempty{\doceyebrow}{}{{\sffamily\scriptsize\bfseries\color{ink3}\textls[180]{\MakeUppercase{\doceyebrow}}\par}\vspace{14pt}}
{\LARGE\bfseries \doctitle\par}
\vspace{6pt}
{\large\itshape\color{ink2} \docsubtitle\par}
\vspace{10pt}
{\normalsize \docauthor\par}
\vspace{3pt}
{\small\color{ink3} \docdate\par}
\end{center}
\vspace{12pt}

\input{{{UNIT_DIR}}/abstract}
\secrulefalse   % the first section sits under the abstract panel without a hairline

% =====================================================================================================================
% >>> texref:units  (managed by tex-add / tex-rm — edit order here if you must, keep the markers)
{{UNIT_INPUTS}}
% <<< texref:units

% =====================================================================================================================
\startappendices
% >>> texref:appendices
{{APPENDIX_INPUTS}}
% <<< texref:appendices

% =====================================================================================================================
\printbibliography

\colophon{\textbf{Colophon.} \doctitle, version \docversion.}

\end{document}
`;

const PAPER_ABSTRACT = String.raw`% {{UNIT_DIR}}/abstract.tex — abstract panel spanning both columns (typeset inside \spanningtop in main.tex)
% =====================================================================================================================
\begin{summary}
\panelhead{Abstract}
[Abstract placeholder, structured: one sentence of context, the problem, the approach, what is shown, and the implication. Two-column papers are skimmed; put the claim in the first two sentences.]
\readingguide{{{READING_GUIDE}}}
\end{summary}
`;

const PAPER_SINGLE_ABSTRACT = String.raw`% {{UNIT_DIR}}/abstract.tex — abstract panel (inline, no separate page)
% =====================================================================================================================
\begin{summary}
\panelhead{Abstract}
[Abstract placeholder, structured: one sentence of context, the problem, the approach, what is shown, and the implication. Write it last; it is the only part most readers finish.]
\readingguide{{{READING_GUIDE}}}
\end{summary}
`;

const MAINS: Record<string, string> = { project: PROJECT_MAIN, brief: BRIEF_MAIN, periodical: PERIODICAL_MAIN, minimal: MINIMAL_MAIN, paper: PAPER_MAIN, "paper-single": PAPER_SINGLE_MAIN };

// ── abstracts ────────────────────────────────────────────────────────────────────────────────

const PROJECT_ABSTRACT = String.raw`% {{UNIT_DIR}}/abstract.tex — abstract page and reading guide
% =====================================================================================================================
\vspace*{2cm}
\begin{center}\LARGE\textbf{Abstract}\end{center}
\vspace{6pt}
\noindent
[Abstract placeholder. One paragraph, 150--250 words. Open with the object of the document and the question it answers. Then the method or structure in two or three sentences: what is formulated, what is computed, what is assumed. Close with what the reader takes away---the deliverable, the headline result, or the decision the document supports. Write it last; it is the only part most readers finish.]

\vfill
\noindent\small\textbf{Reading guide.} {{READING_GUIDE}}
`;

const BRIEF_ABSTRACT = String.raw`% {{UNIT_DIR}}/abstract.tex — abstract paragraph (inline, no separate page)
% =====================================================================================================================
\noindent\textbf{Abstract.}
[Abstract placeholder. Three to five sentences: the question, the approach, the answer. A brief is read in one sitting, so put the result here and let the sections carry the argument.]

\vspace{6pt}
\noindent\small\textbf{Reading guide.} {{READING_GUIDE}}
\normalsize
\vspace{4pt}
{\color{hair}\hrule height 0.3pt}
\vspace{6pt}
`;

const PERIODICAL_ABSTRACT = String.raw`% {{UNIT_DIR}}/abstract.tex — abstract spanning both columns (typeset inside \spanningtop in main.tex)
% =====================================================================================================================
{\color{hair}\hrule height 0.3pt}
\vspace{8pt}
\begin{center}
\begin{minipage}{0.92\textwidth}
\small\noindent\textbf{Abstract.}
[Abstract placeholder. Three to five sentences: the question, the approach, the answer. Two-column pieces are skimmed; put the number or the claim in the first sentence.]
\par\vspace{4pt}
\noindent\textbf{Reading guide.} {{READING_GUIDE}}
\end{minipage}
\end{center}
\vspace{6pt}
{\color{hair}\hrule height 0.3pt}
`;

const ABSTRACTS: Record<string, string> = { project: PROJECT_ABSTRACT, brief: BRIEF_ABSTRACT, periodical: PERIODICAL_ABSTRACT, paper: PAPER_ABSTRACT, "paper-single": PAPER_SINGLE_ABSTRACT };

// ── stubs (_shared/stubs/*.tex) ──────────────────────────────────────────────────────────────

const UNIT_STUB = String.raw`% {{FILE}}
% =====================================================================================================================
\{{UNIT_CMD}}{{{TITLE}}}
\label{{{LABEL}}}

[Placeholder. State what this {{UNIT}} establishes and why it comes here. Two or three sentences that a reader can use to decide whether to read on.]
{{EXAMPLES}}{{SUBUNITS}}`;

const SUBUNIT_STUB = String.raw`

\{{SUB_CMD}}{{{TITLE}}}
\label{{{LABEL}}}
[Placeholder for {{SUBUNIT}} {{N}} of {{UNIT}} {{UNIT_N}}.]
`;

const EXAMPLES_STUB = String.raw`
The remainder of this {{UNIT}} is a worked example of the house style---a table, an equation, a figure and a citation---to copy from and then delete. The conventions follow \cite{knuth1984}; the optimisation vocabulary follows \cite{boyd2004convex}.

% ---- table: xltabular breaks across pages; header repeats; hairline \rs between body rows ------------------------
{\small
\begin{xltabular}{\textwidth}{@{}L{1.0cm} L{2.9cm} Y L{3.3cm}@{}}
\caption{Example table. Fixed-width \code{L} columns for short cells, one stretch \code{Y} column for prose.}\label{tab:{{LABEL_SLUG}}-example}\\
\toprule
\thead{Kind} & \thead{Name} & \thead{Definition and test} & \thead{Home} \\\midrule
\endfirsthead
\toprule
\thead{Kind} & \thead{Name} & \thead{Definition and test} & \thead{Home} \\\midrule
\endhead
\midrule\multicolumn{4}{r}{\footnotesize\itshape continued on next page}\\
\endfoot
\bottomrule
\endlastfoot
\kind{S} & Settlement stream & A published price times a quantity the decision controls, settled on a defined clock. \emph{Test:} does the coefficient multiply a decision variable? & Objective \eqref{eq:{{LABEL_SLUG}}-example} \\\rs
\kind{M} & Multiplier & A factor that scales what is paid or gates what may be offered. & Coefficients \\\rs
\kind{C} & Constraint & A rule that shapes the feasible set and never pays. Its dual is the opportunity cost of relaxing it. & Constraints \\
\end{xltabular}}

% ---- equation ------------------------------------------------------------------------------------------------------
\begin{equation}
\label{eq:{{LABEL_SLUG}}-example}
\max_{x\in\mathcal{X}}\quad \sum_{t\in\mathcal{T}}\lambda_t\,x_t\,\dt \;-\; c\sum_{t\in\mathcal{T}} x_t\,\dt
\qquad\text{s.t.}\qquad 0\le x_t\le \bar{x}\quad\forall t .
\end{equation}
Reading \eqref{eq:{{LABEL_SLUG}}-example} term by term: revenue at price $\lambda_t$, a unit cost $c$, and a capacity bound $\bar x$. Table~\ref{tab:{{LABEL_SLUG}}-example} names the kind of each term.

% ---- figure --------------------------------------------------------------------------------------------------------
\begin{figure}[htbp]\centering
\includegraphics[width=0.55\textwidth]{example-image}
\caption{Example figure. Place image files in \code{figures/}; \code{\textbackslash graphicspath} already points there.}
\label{fig:{{LABEL_SLUG}}-example}
\end{figure}
`;

const EXAMPLES_TWOCOL_STUB = String.raw`
The remainder of this {{UNIT}} is a worked example of the house style in two columns---a column-width table, a full-width table, an equation, a figure and a citation---to copy from and then delete. The conventions follow \cite{knuth1984}; the optimisation vocabulary follows \cite{boyd2004convex}.

% ---- column-width table (tabularx on \columnwidth; longtable/xltabular cannot be used in two-column mode) ----------
\begin{table}[htbp]\centering\small
\caption{Column-width table.}\label{tab:{{LABEL_SLUG}}-col}
\begin{tabularx}{\columnwidth}{@{}L{0.9cm} Y@{}}
\toprule
\thead{Kind} & \thead{Definition} \\\midrule
\kind{S} & A published price times a quantity the decision controls. \\\rs
\kind{M} & A factor that scales what is paid. \\\rs
\kind{C} & A rule that shapes the feasible set and never pays. \\
\bottomrule
\end{tabularx}
\end{table}

% ---- equation ------------------------------------------------------------------------------------------------------
\begin{equation}
\label{eq:{{LABEL_SLUG}}-example}
\max_{x\in\mathcal{X}}\ \sum_{t\in\mathcal{T}}(\lambda_t - c)\,x_t\,\dt
\quad\text{s.t.}\quad 0\le x_t\le \bar{x}.
\end{equation}
Reading \eqref{eq:{{LABEL_SLUG}}-example} term by term: revenue at price $\lambda_t$, a unit cost $c$, and a capacity bound $\bar x$. Table~\ref{tab:{{LABEL_SLUG}}-col} names the kind of each term; Table~\ref{tab:{{LABEL_SLUG}}-wide} spans both columns.

% ---- full-width table (table* floats to the top of the next page) --------------------------------------------------
\begin{table*}[t]\centering\small
\caption{Full-width table across both columns (\code{table*}).}\label{tab:{{LABEL_SLUG}}-wide}
\begin{tabularx}{\textwidth}{@{}L{1.0cm} L{2.9cm} Y L{3.3cm}@{}}
\toprule
\thead{Kind} & \thead{Name} & \thead{Definition and test} & \thead{Home} \\\midrule
\kind{S} & Settlement stream & A published price times a quantity the decision controls, settled on a defined clock. \emph{Test:} does the coefficient multiply a decision variable? & Objective \eqref{eq:{{LABEL_SLUG}}-example} \\\rs
\kind{M} & Multiplier & A factor that scales what is paid or gates what may be offered. & Coefficients \\\rs
\kind{C} & Constraint & A rule that shapes the feasible set and never pays. Its dual is the opportunity cost of relaxing it. & Constraints \\
\bottomrule
\end{tabularx}
\end{table*}

% ---- figure --------------------------------------------------------------------------------------------------------
\begin{figure}[htbp]\centering
\includegraphics[width=0.9\columnwidth]{example-image}
\caption{Column-width figure. Use \code{figure*} for a two-column-wide figure.}
\label{fig:{{LABEL_SLUG}}-example}
\end{figure}
`;

const APPENDIX_STUB = String.raw`% {{FILE}}
% =====================================================================================================================
% Appendix {{LETTER}}. The heading prints "Appendix {{LETTER}}" on its own line with the optional name below;
% leave the argument empty (\{{UNIT_CMD}}{}) for an unnamed appendix.
\{{UNIT_CMD}}{{{TITLE}}}
\label{{{LABEL}}}

[Placeholder. Supporting material referenced from the body: schemas, derivations, long tables, checklists.]
`;

// ── shared project files (_shared/README.md, Makefile, ref.bib, gitignore) ───────────────────

const README = `# {{FOLDER}}

**{{TITLE}}**{{SUBTITLE_MD}}

{{DESCRIPTION_MD}}

| | |
|---|---|
| template | \`{{TEMPLATE}}\` — {{TEMPLATE_DESC}} |
| author | {{AUTHOR}} |
| created | {{CREATED}} |
| version | {{VERSION}} |
| managed by | texref (\`tex-*\` commands) · manifest \`tex.json\` |

## Layout

\`\`\`
{{FOLDER}}/
├── main.tex            preamble, title page, \\input list (texref keeps the marked blocks in sync)
├── main.pdf            current build
├── Makefile            build targets (below)
├── tex.json            project manifest — do not delete; tex-* commands verify it
├── {{UNIT_DIR}}/{{LAYOUT_TREE}}
├── references/ref.bib  bibliography (biblatex + biber)
├── figures/            images (\\graphicspath is set here)
├── aux/                build artifacts — safe to wipe
└── versions/           archived PDFs (make archive / tex-archive)
\`\`\`

## Build

| command | does |
|---|---|
| \`make\` | compile \`main.tex\` → \`main.pdf\` |
| \`make launch\` | compile, open in Skim, then watch — save any \`.tex\`/\`.bib\` and it recompiles; Skim reloads |
| \`make watch\` | watch without opening a viewer |
| \`make name NAME=foo\` | compile to \`foo.pdf\` (\`make foo.pdf\` also works; \`make name\` alone prompts) |
| \`make archive TAG=v0.2.0\` | copy \`main.pdf\` → \`versions/{{NAME}}_<date>_v0.2.0.pdf\` |
| \`make clean\` / \`make wipe\` | remove \`aux/*\` / also remove \`main.pdf\` |
| \`make count\` | word count |
| \`make help\` | list targets |

## Manage (from anywhere inside the project)

| command | does |
|---|---|
| \`tex-status\` | verify structure and show the manifest |
| \`tex-add\` | add a {{UNIT}} (asks title, number of {{SUBUNIT}}s) |
| \`tex-add appendix\` | add an appendix |
| \`tex-rm\` | remove a {{UNIT}} (interactive; file is moved to \`aux/removed/\`) |
| \`tex-ref\` | add a bibliography entry interactively |
| \`tex-ref list\` | list bibliography keys |
| \`tex-archive\` | archive \`main.pdf\` into \`versions/\` with a version tag and note |

## Conventions

- Title metadata lives at the top of \`main.tex\` (\`\\doctitle\`, \`\\docsubtitle\`, \`\\docauthor\`, \`\\docdate\`, \`\\docversion\`, \`\\docfootline\`).
- Labels: \`{{UNIT_LABEL}}:01\`, \`{{UNIT_LABEL}}:01:s1\` for its {{SUBUNIT}}s, \`app:a\` for appendices, \`tab:\`, \`fig:\`, \`eq:\` for floats and equations.
- Tables: \`\\toprule\`/\`\\midrule\`/\`\\bottomrule\` with \`\\rs\` hairlines between body rows, \`\\thead{}\` headers, \`Y\` stretch columns. See {{UNIT_DIR}}/{{FIRST_UNIT_FILE}} for a worked example.
- Bibliography: \`\\cite{key}\`; add entries with \`tex-ref\` or edit \`references/ref.bib\`.
`;

const MAKEFILE = `# {{FOLDER}} — texref project Makefile ({{TEMPLATE}} template)
#
#   make                        compile main.tex → main.pdf
#   make launch                 compile, open in Skim, then watch: save any .tex/.bib and it recompiles
#   make name NAME=report_v1    compile to report_v1.pdf   (make name alone prompts; or: make report_v1.pdf)
#   make archive [TAG=v0.2.0]   copy main.pdf → versions/{{NAME}}_<date>[_TAG].pdf
#   make help                   list all targets
#
# All auxiliary files (.aux .log .toc .bbl .bcf .fls .fdb_latexmk …) live in aux/; only PDFs sit at top level.

PROJECT  := {{NAME}}
TEX      := main.tex
JOB      := main
PDF      := $(JOB).pdf
AUX      := aux
VERSIONS := versions
VIEWER   := Skim
ENGINE   := -pdf
LATEXMK  := latexmk $(ENGINE) -synctex=1 -interaction=nonstopmode -file-line-error -auxdir=$(AUX) -outdir=.
DATE     := $(shell date +%Y-%m-%d)
NAME     ?=
TAG      ?=

.DEFAULT_GOAL := main
.PHONY: main launch watch open name archive clean wipe count help

main: | $(AUX)               ## compile main.tex → main.pdf
	$(LATEXMK) $(TEX)

launch: main                 ## compile, open in Skim, watch and recompile on save (^C to stop)
	@open -a "$(VIEWER)" "$(PDF)"
	@echo "  watching $(TEX) — save to recompile · ^C to stop"
	$(LATEXMK) -pvc -view=none $(TEX)

watch: | $(AUX)              ## watch and recompile on save, no viewer
	$(LATEXMK) -pvc -view=none $(TEX)

open:                        ## open main.pdf in Skim
	@open -a "$(VIEWER)" "$(PDF)"

name: | $(AUX)               ## compile to <NAME>.pdf        make name NAME=report_v1
	@n="$(NAME)"; if [ -z "$$n" ]; then printf "  pdf name (without .pdf) › "; read n; fi; \\
	test -n "$$n" || { echo "  aborted"; exit 1; }; \\
	$(LATEXMK) -jobname="$\${n%.pdf}" $(TEX)

%.pdf: $(TEX) | $(AUX)       ## make <anything>.pdf compiles main.tex under that job name
	$(LATEXMK) -jobname=$* $(TEX)

archive: main | $(VERSIONS)  ## copy main.pdf → versions/<project>_<date>[_TAG].pdf
	@out="$(VERSIONS)/$(PROJECT)_$(DATE)$(if $(TAG),_$(TAG),).pdf"; \\
	cp "$(PDF)" "$$out" && echo "  archived → $$out"

clean:                       ## remove build artifacts in aux/ (keeps PDFs)
	-@$(LATEXMK) -c $(TEX) >/dev/null 2>&1
	@rm -rf $(AUX)/* && echo "  cleaned $(AUX)/"

wipe: clean                  ## clean + remove main.pdf and synctex
	@rm -f $(PDF) $(JOB).synctex.gz && echo "  removed $(PDF)"

count:                       ## word count via texcount
	@texcount -inc -total -brief $(TEX)

$(AUX) $(VERSIONS):
	@mkdir -p $@

help:                        ## show this help
	@echo ""
	@echo "  {{FOLDER}} — make targets"
	@echo "  ─────────────────────────────────────────────────────────────"
	@grep -E '^[a-zA-Z_%.]+:.*?## ' $(MAKEFILE_LIST) | sed -E 's/^([a-zA-Z_%.]+):[^#]*## (.*)/\\1|\\2/' | awk -F'|' '{printf "  %-10s %s\\n", $$1, $$2}'
	@echo ""
`;

const REF_BIB = String.raw`% references/ref.bib — {{FOLDER}}
% Managed by texref (tex-ref adds entries interactively); hand edits are fine.
% Key convention: <firstauthor><year>[<word>], e.g. knuth1984, boyd2004convex

@book{knuth1984,
  author    = {Knuth, Donald E.},
  title     = {The {\TeX}book},
  publisher = {Addison-Wesley},
  address   = {Reading, MA},
  year      = {1984}
}

@book{boyd2004convex,
  author    = {Boyd, Stephen and Vandenberghe, Lieven},
  title     = {Convex Optimization},
  publisher = {Cambridge University Press},
  year      = {2004}
}

@article{dantzig1955,
  author    = {Dantzig, George B.},
  title     = {Linear Programming under Uncertainty},
  journal   = {Management Science},
  volume    = {1},
  number    = {3--4},
  pages     = {197--206},
  year      = {1955},
  doi       = {10.1287/mnsc.1.3-4.197}
}

@report{ercot2024protocols,
  author      = {{ERCOT}},
  title       = {Nodal Protocols},
  institution = {Electric Reliability Council of Texas},
  type        = {Market rules},
  year        = {2024},
  url         = {https://www.ercot.com/mktrules/nprotocols},
  urldate     = {2026-09-21}
}

@online{latexmk,
  author  = {Collins, John},
  title   = {latexmk: fully automated {\LaTeX} document generation},
  year    = {2024},
  url     = {https://ctan.org/pkg/latexmk},
  urldate = {2026-09-21}
}
`;

const GITIGNORE = `# texref project
aux/
*.synctex.gz
*.synctex(busy)
.DS_Store
`;

// ── rendering (templates::render) ────────────────────────────────────────────────────────────

export type Ctx = Record<string, string>;

/** Substitute `{{KEY}}` from `ctx`; unknown keys are left untouched. Blocks are pre-spliced above. */
export function render(text: string, ctx: Ctx): string {
  return text.replace(/\{\{([A-Z][A-Z0-9_]*)\}\}/g, (whole, key: string) => ctx[key] ?? whole);
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const longDate = (d: Date): string => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
const isoDate = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const isoDateTime = (d: Date): string => `${isoDate(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
const capitalise = (s: string): string => (s === "" ? s : s[0].toUpperCase() + s.slice(1));

export const DEFAULT_AUTHOR = "Paris Blaisdell-Pijuan, Ph.D.";

export interface ScaffoldOptions {
  title: string;
  subtitle?: string;
  tagline?: string;
  description?: string;
  author?: string;
  version?: string;
  units?: number | null;
  subunits?: number | null;
  appendices?: number | null;
}

export interface Scaffold {
  mainFile: string;
  /** Relative path → text. */
  files: Map<string, string>;
  /** Empty folders the Rust scaffold creates (`figures/`). */
  dirs: string[];
}

interface Unit {
  n: number;
  file: string;
  title: string;
  label: string;
  subunits: number;
}

interface Appendix {
  letter: string;
  file: string;
  title: string;
  label: string;
}

const clampCount = (value: number | null | undefined, fallback: number, max: number): number =>
  Math.max(0, Math.min(max, Math.floor(value ?? fallback)));

/** Write the full project tree for `key`. Throws `not_found` for an unknown template. */
export function scaffold(key: string, opts: ScaffoldOptions, now: Date): Scaffold {
  const t = templateByKey(key);
  if (!t) throw notFound(`template '${key}'`);
  const author = opts.author ?? DEFAULT_AUTHOR;
  const version = opts.version ?? "0.1.0";
  if (key === "blank") {
    const ctx: Ctx = { TITLE: opts.title, AUTHOR: author, DATE: longDate(now), FOLDER: `tx.${slug(opts.title)}` };
    const files = new Map<string, string>([
      ["main.tex", render(BLANK_MAIN, ctx)],
      ["references/ref.bib", render(REF_BIB, ctx)],
    ]);
    return { mainFile: "main.tex", files, dirs: ["figures"] };
  }

  const nUnits = clampCount(opts.units, t.defaults.units, 60);
  const nSub = clampCount(opts.subunits, t.defaults.subunits, 20);
  const nAppx = t.appendices ? clampCount(opts.appendices, t.defaults.appendices, 26) : 0;
  const subunitWord = t.unit === "chapter" ? "section" : "subsection";
  const name = slug(opts.title);
  const folder = `tx.${name}`;

  const units: Unit[] = Array.from({ length: nUnits }, (_, i) => {
    const n = i + 1;
    return { n, file: `${t.unitDir}/${t.unit}_${pad2(n)}.tex`, title: `${capitalise(t.unit)} ${n}`, label: `${t.unitLabel}:${pad2(n)}`, subunits: nSub };
  });
  const appendices: Appendix[] = Array.from({ length: nAppx }, (_, i) => {
    const letter = String.fromCharCode(65 + i);
    return { letter, file: `${t.unitDir}/appendix_${letter.toLowerCase()}.tex`, title: i === 0 ? `Appendix ${letter} title` : "", label: `app:${letter.toLowerCase()}` };
  });
  const inputs = (files: string[], empty: string): string => (files.length === 0 ? empty : files.map((f) => `\\input{${f.replace(/\.tex$/, "")}}`).join("\n"));

  const ctx: Ctx = {
    NAME: name,
    FOLDER: folder,
    TEMPLATE: t.key,
    TEMPLATE_DESC: t.description,
    TITLE: opts.title,
    SUBTITLE: opts.subtitle ?? "",
    TAGLINE: opts.tagline ?? "",
    DESCRIPTION: opts.description ?? "",
    AUTHOR: author,
    DATE: longDate(now),
    CREATED: isoDate(now),
    VERSION: version,
    UNIT: t.unit,
    UNIT_DIR: t.unitDir,
    UNIT_LABEL: t.unitLabel,
    SUBUNIT: subunitWord,
    UNIT_INPUTS: inputs(units.map((u) => u.file), "% (no units yet)"),
    APPENDIX_INPUTS: inputs(appendices.map((a) => a.file), "% (no appendices)"),
    READING_GUIDE: readingGuide(t, units, appendices),
    FIRST_UNIT_FILE: units.length > 0 ? basename(units[0].file) : `${t.unit}_01.tex`,
    SUBTITLE_MD: opts.subtitle ? ` — ${opts.subtitle}` : "",
    DESCRIPTION_MD: opts.description ? opts.description : "_No description yet._",
    LAYOUT_TREE: layoutTree(t, units, appendices),
  };

  const files = new Map<string, string>();
  files.set("main.tex", render(MAINS[t.key], ctx));
  if (t.abstractPage) files.set(`${t.unitDir}/abstract.tex`, render(ABSTRACTS[t.key], ctx));
  for (const u of units) files.set(u.file, renderUnit(t, u, u.n === 1));
  for (const a of appendices) files.set(a.file, renderAppendix(t, a));
  files.set("references/ref.bib", render(REF_BIB, ctx));
  // CLI companions are not scaffolded (see templates.rs); kept renderable for a texref-compatible export.
  void MAKEFILE;
  void README;
  void GITIGNORE;
  void texrefManifest;
  void folder;
  void now;
  return { mainFile: "main.tex", files, dirs: ["figures"] };
}

type ResolvedOptions = ScaffoldOptions & { author: string; version: string };

function renderUnit(t: TemplateInfo, u: Unit, rich: boolean): string {
  const subunitWord = t.unit === "chapter" ? "section" : "subsection";
  let subs = "";
  for (let k = 1; k <= u.subunits; k++) {
    subs += render(SUBUNIT_STUB, {
      SUB_CMD: t.subCmd,
      TITLE: `${capitalise(subunitWord)} ${k}`,
      LABEL: `${u.label}:s${k}`,
      SUBUNIT: subunitWord,
      UNIT: t.unit,
      N: String(k),
      UNIT_N: String(u.n),
    });
  }
  const examples = rich ? render(t.twocolumn ? EXAMPLES_TWOCOL_STUB : EXAMPLES_STUB, { UNIT: t.unit, LABEL_SLUG: u.label.replace(/:/g, "-") }) : "";
  const body = render(UNIT_STUB, { FILE: u.file, UNIT_CMD: t.unitCmd, TITLE: u.title, LABEL: u.label, UNIT: t.unit, EXAMPLES: examples, SUBUNITS: subs });
  return `${body.replace(/\n+$/, "")}\n`;
}

function renderAppendix(t: TemplateInfo, a: Appendix): string {
  return render(APPENDIX_STUB, { FILE: a.file, LETTER: a.letter, UNIT_CMD: t.unitCmd, TITLE: a.title, LABEL: a.label });
}

function readingGuide(t: TemplateInfo, units: Unit[], appendices: Appendix[]): string {
  const word = capitalise(t.unit);
  const parts = units.map((u) => `${word}~\\ref{${u.label}} [about ${t.unit} ${u.n}\\ldots].`);
  if (appendices.length === 1) parts.push(`Appendix~\\ref{${appendices[0].label}} [about appendix ${appendices[0].letter}\\ldots].`);
  else if (appendices.length > 1) parts.push(`Appendices~\\ref{${appendices[0].label}}--\\ref{${appendices[appendices.length - 1].label}} give [supporting material\\ldots].`);
  return parts.length === 0 ? "[Describe the order in which to read the document.]" : parts.join(" ");
}

function layoutTree(t: TemplateInfo, units: Unit[], appendices: Appendix[]): string {
  const lines = [...(t.abstractPage ? ["abstract.tex"] : []), ...units.map((u) => basename(u.file)), ...appendices.map((a) => basename(a.file))];
  if (lines.length === 0) return "";
  const last = lines.pop();
  return `${lines.map((l) => `\n│   ├── ${l}`).join("")}\n│   └── ${last}`;
}

function texrefManifest(t: TemplateInfo, name: string, folder: string, opts: ResolvedOptions, units: Unit[], appendices: Appendix[], now: Date): unknown {
  const stamp = isoDateTime(now);
  return {
    texref: { schema: 1, tool_version: "1.0.0", created: stamp, updated: stamp, origin: "cohere" },
    project: {
      name, folder, template: t.key, title: opts.title, subtitle: opts.subtitle ?? "",
      tagline: opts.tagline ?? "", description: opts.description ?? "", author: opts.author, version: opts.version,
    },
    build: { main: "main.tex", pdf: "main.pdf", aux: "aux", engine: "pdflatex", bib: "biber", viewer: "Skim" },
    layout: {
      unit: t.unit, unit_cmd: t.unitCmd, sub_cmd: t.subCmd, unit_dir: t.unitDir, unit_label: t.unitLabel,
      abstract: t.abstractPage, toc: t.toc, appendices: t.appendices, twocolumn: t.twocolumn,
      references: "references/ref.bib", figures: "figures", versions: "versions",
    },
    units: units.map((u) => ({ n: u.n, file: u.file, title: u.title, label: u.label, subunits: u.subunits })),
    appendices: appendices.map((a) => ({ letter: a.letter, file: a.file, title: a.title, label: a.label })),
    versions: [],
  };
}
