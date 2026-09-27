/**
 * Seven seed projects for browser dev and e2e tests. Trees come from the real template scaffold,
 * then a few files are rewritten with realistic prose. Every timestamp hangs off `SEED_BASE`.
 */
import type { EngineId } from "../types";
import { latexLog, pdfPages, unitTexFiles } from "./compileSim";
import type { MockFile, MockProject, MockVersion } from "./mockBackend";
import { buildMultiPagePdf, buildSamplePdf } from "./samplePdf";
import { scaffold } from "./templates";
import { MOCK_DATA_DIR, PNG_1X1, addParentDirs, byteLength } from "./util";

export const SEED_BASE = new Date("2026-09-21T09:00:00Z");
const DAY = 86_400_000;
const daysAgo = (days: number): Date => new Date(SEED_BASE.getTime() - days * DAY);

export const SEED_IDS = {
  mtm: "seed-mtm",
  storage: "seed-storage-revenue",
  convex: "seed-convex-notes",
  grant: "seed-grant-ldes",
  periodical: "seed-power-markets-q",
  scratch: "seed-scratch",
  thesis: "seed-thesis-outline",
} as const;

interface SeedSpec {
  id: string;
  title: string;
  topic: string | null;
  template: string;
  subtitle?: string;
  tagline?: string;
  description?: string;
  units?: number;
  subunits?: number;
  appendices?: number;
  createdDaysAgo: number;
  modifiedDaysAgo: number;
  archived?: boolean;
  favorite?: boolean;
  engine?: EngineId;
  lastOpenedFile?: string;
  /** Relative path → text; replaces or adds files after scaffolding. */
  overrides?: Record<string, string>;
  binaries?: Record<string, Uint8Array>;
}

function buildProject(spec: SeedSpec): MockProject {
  const created = daysAgo(spec.createdDaysAgo);
  const modified = daysAgo(spec.modifiedDaysAgo);
  const built = scaffold(
    spec.template,
    {
      title: spec.title,
      subtitle: spec.subtitle,
      tagline: spec.tagline,
      description: spec.description,
      units: spec.units ?? null,
      subunits: spec.subunits ?? null,
      appendices: spec.appendices ?? null,
    },
    created,
  );
  const files = new Map<string, MockFile>();
  for (const [path, text] of built.files) files.set(path, { text, modified: created.toISOString() });
  for (const [path, text] of Object.entries(spec.overrides ?? {})) files.set(path, { text, modified: modified.toISOString() });
  for (const [path, bytes] of Object.entries(spec.binaries ?? {})) files.set(path, { bytes, modified: created.toISOString() });
  const dirs = new Set<string>(built.dirs);
  for (const path of files.keys()) addParentDirs(dirs, path);
  return {
    id: spec.id,
    title: spec.title,
    topic: spec.topic,
    template: spec.template,
    created: created.toISOString(),
    modified: modified.toISOString(),
    archived: spec.archived ?? false,
    favorite: spec.favorite ?? false,
    mainFile: built.mainFile,
    engine: spec.engine ?? null,
    lastOpenedFile: spec.lastOpenedFile ?? null,
    files,
    dirs,
    output: null,
    pdf: null,
    log: "",
    versions: [],
    diagnostics: [],
  };
}

const bundleBytes = (files: Map<string, MockFile>): number => {
  let total = 0;
  for (const f of files.values()) total += f.bytes ? f.bytes.length : byteLength(f.text ?? "");
  return total;
};

/** Give a project a finished compile: PDF, output metadata, log and a couple of versions. */
function withOutput(p: MockProject, compiledAt: Date): void {
  const engine: EngineId = "pdflatex";
  const unitFiles = unitTexFiles(p.files.keys(), p.files.get(p.mainFile)?.text ?? "");
  const pdf = buildMultiPagePdf(pdfPages({ title: p.title, template: p.template, engine, date: compiledAt, files: p.files, unitFiles }));
  const run = { engine, mainFile: p.mainFile, buildDir: `${MOCK_DATA_DIR}/projects/${p.id}/build`, synctex: true, pages: 1 + unitFiles.length, bytes: pdf.length, bad: null };
  p.pdf = pdf;
  p.log = latexLog(run, unitFiles, compiledAt);
  p.diagnostics = [
    { severity: "warning", file: "sections/section_02.tex", line: 9, message: "Citation `ercot2024protocols' on page 2 undefined on input line 9.", detail: "", source: "latex" },
  ];
  p.output = {
    path: `${MOCK_DATA_DIR}/projects/${p.id}/output/main.pdf`,
    bytes: pdf.length,
    compiledAt: compiledAt.toISOString(),
    pages: run.pages,
    engine,
    durationMs: 2140,
    errorCount: 0,
    warningCount: 1,
    hasSynctex: true,
  };
  const version = (id: string, name: string, note: string, created: Date, versionPdf: Uint8Array): MockVersion => ({
    info: { id, name, note, created: created.toISOString(), pdfBytes: versionPdf.length, bundleBytes: bundleBytes(p.files), fileCount: p.files.size, hasPdf: true },
    pdf: versionPdf,
    files: new Map(p.files),
  });
  p.versions = [
    version("20260901-101500-3fa2c1", "v1", "first complete draft", daysAgo(20), buildSamplePdf([p.title, "v1 — first complete draft", "compiled by the mock backend"])),
    version("20260915-164200-b71e09", "v2", "after reviewer comments", daysAgo(6), pdf),
  ];
}

// ── realistic content ────────────────────────────────────────────────────────────────────────

const MTM_ABSTRACT = String.raw`% chapters/abstract.tex — abstract page and reading guide
% =====================================================================================================================
\vspace*{2cm}
\begin{center}\LARGE\textbf{Abstract}\end{center}
\vspace{6pt}
\noindent
The Market \& Technology Model (MTM) is a linear model of what a grid-scale battery earns in an organised power market. It separates the settlement streams an asset can access from the multipliers that scale them and the constraints that bound them, so that a change in market rules can be traced to a change in one coefficient. Version 1.2 adds ancillary-service co-optimisation and a degradation-aware cycling constraint. The document closes with a worked ERCOT case and the assumptions a reader must accept before reusing the numbers.

\vfill
\noindent\small\textbf{Reading guide.} Chapter~\ref{ch:01} sets out the market structure. Chapter~\ref{ch:02} formulates the model. Appendix~\ref{app:a} lists the input data.
`;

const MTM_CHAPTER_01 = String.raw`% chapters/chapter_01.tex
% =====================================================================================================================
\chapter{Market structure}
\label{ch:01}

This chapter sets out the settlement streams a grid-scale battery can access in an organised power market, and the multipliers and constraints that shape each one. The taxonomy follows the ERCOT protocols \cite{ercot2024protocols}; the optimisation vocabulary follows \cite{boyd2004convex}.

\section{Settlement streams}
\label{ch:01:s1}
A settlement stream is a published price times a quantity the decision controls, settled on a defined clock. Version 1.2 models three: day-ahead energy, real-time energy and the ancillary-service products that clear alongside them.

\section{Multipliers and constraints}
\label{ch:01:s2}
Text with an undefined \badcommand
Multipliers scale what is paid or gate what may be offered; constraints shape the feasible set and never pay. The dual of a binding constraint is the opportunity cost of relaxing it, which is the number the technology chapters are built to interpret.
`;

const MTM_CHAPTER_02 = String.raw`% chapters/chapter_02.tex
% =====================================================================================================================
\chapter{Model formulation}
\label{ch:02}

The model maximises settled revenue net of cycling cost over a horizon $\mathcal{T}$ at resolution $\dt$:
\begin{equation}
\label{eq:ch-02-objective}
\max_{p,\,r}\quad \sum_{t\in\mathcal{T}} \big(\lambda^{\mathrm{E}}_t\,p_t + \lambda^{\mathrm{AS}}_t\,r_t\big)\,\dt \;-\; c^{\mathrm{cyc}} \sum_{t\in\mathcal{T}} |p_t|\,\dt .
\end{equation}

\section{State of charge}
\label{ch:02:s1}
Energy in storage evolves as $e_{t+1} = e_t - p_t\,\dt/\eta$ for discharge and $e_{t+1} = e_t - p_t\,\eta\,\dt$ for charge, with $0 \le e_t \le \bar e$.

\section{Reserve headroom}
\label{ch:02:s2}
A reserve award $r_t$ must be deliverable for the full sustained-duration requirement, which couples the ancillary stream to the state-of-charge trajectory through $r_t \le \min(\bar p - p_t,\; e_t / \tau)$.
`;

const STORAGE_ABSTRACT = String.raw`% sections/abstract.tex — abstract paragraph (inline, no separate page)
% =====================================================================================================================
\noindent\textbf{Abstract.}
Battery storage earns from four kinds of settlement: energy arbitrage, ancillary services, capacity payments and avoided network charges. This brief names each stream, states the multiplier and constraint that govern it, and shows with 2025 ERCOT data that arbitrage alone recovers under half of a two-hour system's cost of capital. The stack matters more than any single stream.

\vspace{6pt}
\noindent\small\textbf{Reading guide.} Section~\ref{sec:01} defines the streams. Section~\ref{sec:02} quantifies them. Section~\ref{sec:03} discusses what changes as more storage clears. Appendix~\ref{app:a} lists the data sources.
\normalsize
\vspace{4pt}
{\color{hair}\hrule height 0.3pt}
\vspace{6pt}
`;

const STORAGE_SECTION_01 = String.raw`% sections/section_01.tex
% =====================================================================================================================
\section{The four streams}
\label{sec:01}

Each stream is a published price times a quantity the operator controls. Figure~\ref{fig:sec-01-stack} shows how they layer for a representative two-hour asset.

\begin{figure}[htbp]\centering
\includegraphics[width=0.85\textwidth]{revenue-stack}
\caption{Annual revenue by stream for a 100\,MW / 200\,MWh asset, 2025 prices.}
\label{fig:sec-01-stack}
\end{figure}

\subsection{Energy arbitrage}
\label{sec:01:s1}
Charge when the real-time price is low, discharge when it is high; the spread net of round-trip losses is the margin.
`;

const CONVEX_SECTION_01 = String.raw`% sections/section_01.tex
% =====================================================================================================================
\section{Convex sets and functions}
\label{sec:01}

A set $C$ is convex if the segment between any two of its points stays inside it: $\theta x + (1-\theta) y \in C$ for all $\theta \in [0,1]$ \cite{boyd2004convex}. A function is convex when its epigraph is a convex set.

\begin{definition}
$f$ is convex on $\operatorname{dom} f$ if $f(\theta x + (1-\theta)y) \le \theta f(x) + (1-\theta) f(y)$.
\end{definition}

Notes to self: the first-order condition $f(y) \ge f(x) + \nabla f(x)^\top (y-x)$ is the workhorse for every bound in chapters 4--5.
`;

const CONVEX_SECTION_02 = String.raw`% sections/section_02.tex
% =====================================================================================================================
\section{Duality}
\label{sec:02}

The Lagrangian $L(x,\lambda,\nu) = f_0(x) + \sum_i \lambda_i f_i(x) + \sum_j \nu_j h_j(x)$ gives the dual function $g(\lambda,\nu) = \inf_x L$, which is concave whatever the primal is.

Weak duality $d^\star \le p^\star$ always holds; strong duality needs a constraint qualification such as Slater's condition. The KKT conditions are then necessary and sufficient.
`;

// ── the seven projects ───────────────────────────────────────────────────────────────────────

export function seedProjects(): MockProject[] {
  const mtm = buildProject({
    id: SEED_IDS.mtm,
    title: "MTM v1.2 — Market & Technology Model",
    favorite: true,
    topic: "Modelling",
    template: "project",
    subtitle: "Market & Technology Model",
    tagline: "Revenue streams, multipliers and constraints for grid storage",
    description: "Linear model of storage revenue in organised power markets.",
    units: 2,
    subunits: 2,
    appendices: 1,
    createdDaysAgo: 34,
    modifiedDaysAgo: 0.3,
    lastOpenedFile: "chapters/chapter_01.tex",
    overrides: { "chapters/abstract.tex": MTM_ABSTRACT, "chapters/chapter_01.tex": MTM_CHAPTER_01, "chapters/chapter_02.tex": MTM_CHAPTER_02 },
  });

  const storage = buildProject({
    id: SEED_IDS.storage,
    title: "Storage Revenue Streams",
    topic: "Finance",
    template: "brief",
    subtitle: "A settlement-stream taxonomy for battery assets",
    units: 3,
    subunits: 1,
    appendices: 1,
    createdDaysAgo: 27,
    modifiedDaysAgo: 1.2,
    lastOpenedFile: "sections/section_01.tex",
    overrides: { "sections/abstract.tex": STORAGE_ABSTRACT, "sections/section_01.tex": STORAGE_SECTION_01 },
    binaries: { "figures/revenue-stack.png": new Uint8Array(PNG_1X1) },
  });
  withOutput(storage, daysAgo(1.2));

  const convex = buildProject({
    id: SEED_IDS.convex,
    title: "Reading Notes: Convex Optimization",
    favorite: true,
    topic: "Notes",
    template: "minimal",
    units: 2,
    subunits: 0,
    createdDaysAgo: 15,
    modifiedDaysAgo: 3.5,
    overrides: { "sections/section_01.tex": CONVEX_SECTION_01, "sections/section_02.tex": CONVEX_SECTION_02 },
  });

  const grant = buildProject({
    id: SEED_IDS.grant,
    title: "Grant Brief: Long-Duration Storage",
    topic: "Energy",
    template: "brief",
    subtitle: "Proposal narrative, v0.2",
    description: "Narrative section of the LDES demonstration proposal.",
    units: 4,
    subunits: 1,
    appendices: 1,
    createdDaysAgo: 9,
    modifiedDaysAgo: 6,
  });

  const periodical = buildProject({
    id: SEED_IDS.periodical,
    title: "Periodical: Power Markets Quarterly",
    topic: "Markets",
    template: "periodical",
    subtitle: "Q3 2026",
    units: 3,
    subunits: 1,
    appendices: 0,
    engine: "xelatex",
    createdDaysAgo: 40,
    modifiedDaysAgo: 12,
  });

  const scratch = buildProject({
    id: SEED_IDS.scratch,
    title: "Minimal Scratch",
    topic: null,
    template: "blank",
    createdDaysAgo: 22.5,
    modifiedDaysAgo: 22,
  });

  const thesis = buildProject({
    id: SEED_IDS.thesis,
    title: "Thesis Outline",
    topic: "Research",
    template: "project",
    subtitle: "Working outline",
    tagline: "Chapters, claims and the evidence each one needs",
    units: 3,
    subunits: 2,
    appendices: 1,
    archived: true,
    createdDaysAgo: 60,
    modifiedDaysAgo: 38,
  });

  return [mtm, storage, convex, grant, periodical, scratch, thesis];
}
