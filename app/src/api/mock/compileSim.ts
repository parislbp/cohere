/** Fabricated latexmk / LaTeX output for the mock compiler: log lines, diagnostics and PDF page text. */
import type { Diagnostic, EngineId } from "../types";
import { basename, naturalCompare } from "./util";

export interface BadCommand {
  file: string;
  line: number;
  text: string;
}

const BAD = "\\badcommand";
const UNIT_FILE = /^(chapters|sections)\/[^/]+\.tex$/;

export const engineFlag = (engine: EngineId): string => (engine === "xelatex" ? "-pdfxe" : engine === "lualatex" ? "-pdflua" : "-pdf");

const ENGINE_BANNER: Record<EngineId, string> = {
  pdflatex: "This is pdfTeX, Version 3.141592653-2.6-1.40.26 (TeX Live 2024) (preloaded format=pdflatex)",
  xelatex: "This is XeTeX, Version 3.141592653-2.6-0.999996 (TeX Live 2024) (preloaded format=xelatex)",
  lualatex: "This is LuaHBTeX, Version 1.18.0 (TeX Live 2024)",
};

/**
 * The .tex files that become pages of the mock PDF: everything directly under chapters/ or sections/,
 * in the order main.tex `\input`s them, then any stragglers in natural order.
 */
export function unitTexFiles(paths: Iterable<string>, mainText: string): string[] {
  const all = [...paths].filter((p) => UNIT_FILE.test(p)).sort(naturalCompare);
  const ordered: string[] = [];
  for (const m of mainText.matchAll(/\\input\{([^}]+)\}/g)) {
    const target = m[1].endsWith(".tex") ? m[1] : `${m[1]}.tex`;
    if (all.includes(target) && !ordered.includes(target)) ordered.push(target);
  }
  return [...ordered, ...all.filter((p) => !ordered.includes(p))];
}

export function findBadCommand(files: ReadonlyMap<string, { text?: string }>): BadCommand | null {
  for (const path of [...files.keys()].filter((p) => p.endsWith(".tex")).sort()) {
    const text = files.get(path)?.text;
    if (text === undefined) continue;
    const lines = text.split("\n");
    const idx = lines.findIndex((l) => l.includes(BAD));
    if (idx >= 0) return { file: path, line: idx + 1, text: lines[idx] };
  }
  return null;
}

/** TeX prints the source line up to the offending token, then the remainder indented beneath it. */
function errorContext(bad: BadCommand): string {
  const cut = bad.text.indexOf(BAD) + BAD.length;
  const head = `l.${bad.line} ${bad.text.slice(0, cut).trimStart()}`;
  const rest = bad.text.slice(cut);
  return rest.trim() === "" ? head : `${head}\n${" ".repeat(head.length)}${rest}`;
}

export function errorDiagnostics(bad: BadCommand, mainFile: string): Diagnostic[] {
  return [
    { severity: "error", file: bad.file, line: bad.line, message: "Undefined control sequence.", detail: errorContext(bad), source: "latex" },
    { severity: "warning", file: mainFile, line: 7, message: "Reference `sec:missing' on page 1 undefined on input line 7.", detail: "", source: "latex" },
    { severity: "info", file: bad.file, line: 2, message: "Overfull \\hbox (12.3pt too wide) in paragraph at lines 2--13", detail: "", source: "latex" },
  ];
}

export function cleanDiagnostics(file: string): Diagnostic[] {
  return [{ severity: "info", file, line: 6, message: "Overfull \\hbox (4.6pt too wide) in paragraph at lines 6--8", detail: "", source: "latex" }];
}

export interface SimulatedRun {
  engine: EngineId;
  mainFile: string;
  buildDir: string;
  synctex: boolean;
  pages: number;
  bytes: number;
  bad: BadCommand | null;
}

const stemOf = (mainFile: string): string => basename(mainFile).replace(/\.tex$/, "");

/** The eight stdout lines streamed as `compile:log` events. */
export function latexmkLines(run: SimulatedRun): string[] {
  const stem = stemOf(run.mainFile);
  const head = [
    `Latexmk: applying rule '${run.engine}'...`,
    `Rule '${run.engine}': Rules & subrules not known to be previously run:`,
    `Running '${run.engine}  -interaction=nonstopmode -file-line-error -recorder ${run.synctex ? "-synctex=1 " : ""}-output-directory="${run.buildDir}"  "${run.mainFile}"'`,
    ENGINE_BANNER[run.engine],
  ];
  const written = `Output written on build/${stem}.pdf (${run.pages} page${run.pages === 1 ? "" : "s"}, ${run.bytes} bytes).`;
  if (run.bad) {
    return [...head, `./${run.bad.file}:${run.bad.line}: Undefined control sequence.`, errorContext(run.bad).split("\n")[0], written, "Latexmk: Errors, so I did not complete making targets"];
  }
  return [...head, `Latexmk: applying rule 'biber ${stem}'...`, `Run number 2 of rule '${run.engine}'`, written, `Latexmk: All targets (build/${stem}.pdf) are up-to-date`];
}

/** A plausible `main.log` for the Log panel. */
export function latexLog(run: SimulatedRun, unitFiles: string[], date: Date): string {
  const stem = stemOf(run.mainFile);
  const lines = [
    `${ENGINE_BANNER[run.engine]}  ${date.toDateString()}`,
    " restricted \\write18 enabled.",
    " %&-line parsing enabled.",
    `**${run.mainFile}`,
    `(./${run.mainFile}`,
    "LaTeX2e <2023-11-01> patch level 1",
    "L3 programming layer <2024-02-20>",
    "(/usr/local/texlive/2024/texmf-dist/tex/latex/base/report.cls",
    "Document Class: report 2023/05/17 v1.4n Standard LaTeX document class)",
    "(/usr/local/texlive/2024/texmf-dist/tex/latex/biblatex/biblatex.sty)",
    "(/usr/local/texlive/2024/texmf-dist/tex/latex/hyperref/hyperref.sty)",
    `No file build/${stem}.aux.`,
  ];
  for (const f of unitFiles) {
    if (run.bad && run.bad.file === f) {
      lines.push(`(./${f}`, `./${f}:${run.bad.line}: Undefined control sequence.`, ...errorContext(run.bad).split("\n"), "", ")");
    } else {
      lines.push(`(./${f})`);
    }
  }
  if (run.bad) {
    lines.push("", "LaTeX Warning: Reference `sec:missing' on page 1 undefined on input line 7.", "", "Overfull \\hbox (12.3pt too wide) in paragraph at lines 2--13");
  } else {
    lines.push("", "Overfull \\hbox (4.6pt too wide) in paragraph at lines 6--8");
  }
  lines.push(
    `(./build/${stem}.aux)`,
    ")",
    `Output written on build/${stem}.pdf (${run.pages} page${run.pages === 1 ? "" : "s"}, ${run.bytes} bytes).`,
    `Transcript written on build/${stem}.log.`,
    "",
  );
  return lines.join("\n");
}

export interface PdfPageSource {
  title: string;
  template: string;
  engine: EngineId;
  date: Date;
  files: ReadonlyMap<string, { text?: string }>;
  unitFiles: string[];
}

/** Cover page, then one page per unit file with its heading and the first lines of prose. */
export function pdfPages(src: PdfPageSource): string[][] {
  const cover = [
    src.title,
    `${src.template} template, compiled with ${src.engine}`,
    "compiled by the mock backend",
    src.date.toUTCString(),
    "",
    `${src.unitFiles.length} unit file${src.unitFiles.length === 1 ? "" : "s"}`,
  ];
  const pages = [cover];
  src.unitFiles.forEach((path, i) => {
    const text = src.files.get(path)?.text ?? "";
    const heading = /\\(?:chapter|section|subsection)\*?\{([^}]*)\}/.exec(text);
    const prose = text
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l !== "" && !l.startsWith("%") && !l.startsWith("\\"))
      .slice(0, 8)
      .map((l) => (l.length > 84 ? `${l.slice(0, 81)}...` : l));
    pages.push([`${i + 1}  ${heading ? heading[1] : basename(path)}`, path, "", ...prose]);
  });
  return pages;
}
