import { emit, listen } from "@tauri-apps/api/event";
import { ask, open, save } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { beforeAll, describe, expect, it } from "vitest";
import * as api from "@/api";
import type { CompileLogEvent, CompileStatusEvent, EngineId, FileNode, ProjectSummary } from "@/api";
import { call } from "@/api/client";
import { installMockBackend, isMockBackendRequested } from "./installMock";
import type { MockBackend } from "./mockBackend";
import { SAMPLE_PDF, buildMultiPagePdf, buildSamplePdf } from "./samplePdf";
import { SEED_IDS } from "./seed";

let backend: MockBackend;
// A ticking clock so every `modified`/`created` the backend stamps is strictly increasing.
let clock = Date.parse("2026-09-21T12:00:00Z");

beforeAll(() => {
  localStorage.clear();
  backend = installMockBackend({ latencyMs: 0, now: () => new Date((clock += 1000)) });
});

async function kindOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof api.CohereError ? e.kind : `unexpected: ${String(e)}`;
  }
}

const ascii = (bytes: Uint8Array): string => Array.from(bytes, (b) => String.fromCharCode(b)).join("");
const names = (nodes: FileNode[]): string[] => nodes.map((n) => n.name);
const child = (nodes: FileNode[], name: string): FileNode | undefined => nodes.find((n) => n.name === name);
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("install", () => {
  it("exposes the instance for e2e tests and is not requested by default here", () => {
    expect(window.__COHERE_MOCK__).toBe(backend);
    expect(isMockBackendRequested()).toBe(false);
  });
});

describe("library", () => {
  let created: ProjectSummary;

  it("lists the seven seeded projects newest first", async () => {
    const list = await api.library.list();
    expect(list).toHaveLength(7);
    const stamps = list.map((p) => p.modified);
    expect(stamps).toEqual([...stamps].sort().reverse());
    expect(list.map((p) => p.title)).toContain("MTM v1.2 — Market & Technology Model");
    expect(list.filter((p) => p.archived)).toHaveLength(1);
    expect(list.filter((p) => p.hasOutput).map((p) => p.id)).toEqual([SEED_IDS.storage]);
    expect(list.find((p) => p.id === SEED_IDS.storage)?.versionCount).toBe(2);
    expect(list.every((p) => p.fileCount > 0 && p.sizeBytes > 0)).toBe(true);
    expect(list.find((p) => p.id === SEED_IDS.scratch)?.topic).toBeNull();
  });

  it("creates a project from a template and scaffolds its tree", async () => {
    created = await api.library.create({ title: "  New Model ", topic: " Energy ", template: "project", units: 2, subunits: 1, appendices: 1 });
    expect(created.title).toBe("New Model");
    expect(created.topic).toBe("Energy");
    expect(created.mainFile).toBe("main.tex");
    expect(created.hasOutput).toBe(false);
    const list = await api.library.list();
    expect(list).toHaveLength(8);
    expect(list[0].id).toBe(created.id);

    const detail = await api.files.open(created.id);
    expect(detail.compiling).toBe(false);
    expect(names(detail.tree)).toEqual(["chapters", "figures", "references", "main.tex"]);
    expect(names(child(detail.tree, "chapters")?.children ?? [])).toEqual(["abstract.tex", "appendix_a.tex", "chapter_01.tex", "chapter_02.tex"]);
    const main = await api.files.read(created.id, "main.tex");
    expect(main.text).toContain("\\input{chapters/chapter_02}");
    expect(main.text).toContain("\\input{chapters/appendix_a}");
    expect(main.text).toContain("\\newcommand{\\doctitle}{New Model}");
    expect(main.text).not.toMatch(/\{\{[A-Z_]+\}\}/);
    const ch1 = await api.files.read(created.id, "chapters/chapter_01.tex");
    expect(ch1.text).toContain("\\label{ch:01:s1}");
    expect(ch1.text).toContain("xltabular");
  });

  it("scaffolds the blank template like the Rust BLANK_MAIN", async () => {
    const p = await api.library.create({ title: "Scratch", template: "blank" });
    const tree = await api.files.tree(p.id);
    expect(names(tree)).toEqual(["figures", "references", "main.tex"]);
    const main = await api.files.read(p.id, "main.tex");
    expect(main.text).toContain("\\title{Scratch}");
    expect(main.text).toContain("\\section{Introduction}");
    await api.library.remove(p.id);
  });

  it("rejects bad input with the right error kinds", async () => {
    expect(await kindOf(api.library.create({ title: "   ", template: "project" }))).toBe("invalid");
    expect(await kindOf(api.library.create({ title: "x", template: "nope" }))).toBe("not_found");
    expect(await kindOf(api.library.get("../etc"))).toBe("invalid");
    expect(await kindOf(api.library.get("missing-project"))).toBe("not_found");
  });

  it("updates metadata: null clears the topic, undefined leaves it", async () => {
    const before = await api.library.get(created.id);
    const renamed = await api.library.update(created.id, { title: " Renamed " });
    expect(renamed.title).toBe("Renamed");
    expect(renamed.topic).toBe("Energy");
    expect(renamed.modified > before.modified).toBe(true);
    expect((await api.library.update(created.id, { topic: null })).topic).toBeNull();
    expect((await api.library.update(created.id, { topic: "  " })).topic).toBeNull();
    expect((await api.library.update(created.id, { engine: "xelatex" })).engine).toBe("xelatex");
    expect((await api.library.update(created.id, { engine: "nope" as EngineId })).engine).toBeNull();
    expect((await api.library.update(created.id, { lastOpenedFile: "chapters/chapter_01.tex" })).lastOpenedFile).toBe("chapters/chapter_01.tex");
    expect((await api.library.update(created.id, { mainFile: "chapters/chapter_01.tex" })).mainFile).toBe("chapters/chapter_01.tex");
    expect(await kindOf(api.library.update(created.id, { mainFile: "nope.tex" }))).toBe("not_found");
    expect(await kindOf(api.library.update(created.id, { title: "  " }))).toBe("invalid");
    expect((await api.library.get(created.id)).title).toBe("Renamed");
  });

  it("archives and unarchives", async () => {
    expect((await api.library.archive(created.id, true)).archived).toBe(true);
    expect((await api.library.get(created.id)).archived).toBe(true);
    expect((await api.library.archive(created.id, false)).archived).toBe(false);
  });

  it("exports a zip of the sources and refuses a pdf export before compiling", async () => {
    const zip = await api.library.exportZip(created.id, "/Users/demo/Desktop/out.zip");
    expect(zip).toEqual({ path: "/Users/demo/Desktop/out.zip", bytes: expect.any(Number) });
    expect(zip.bytes).toBeGreaterThan(0);
    expect(await kindOf(api.library.exportPdf(created.id, "/Users/demo/Desktop/x.pdf"))).toBe("not_found");
  });

  it("deletes a project", async () => {
    await api.library.remove(created.id);
    expect(await kindOf(api.library.get(created.id))).toBe("not_found");
    expect(await kindOf(api.library.remove(created.id))).toBe("not_found");
    expect(await api.library.list()).toHaveLength(7);
  });
});

describe("files", () => {
  let id: string;

  beforeAll(async () => {
    id = (await api.library.create({ title: "Files Fixture", template: "brief", units: 1, subunits: 0, appendices: 0 })).id;
  });

  it("reads and writes text files, bumping modified stamps", async () => {
    const before = await api.files.read(id, "main.tex");
    expect(before.binary).toBe(false);
    expect(before.image).toBe(false);
    expect(before.ext).toBe("tex");
    expect(before.text).toContain("\\begin{document}");
    const project = await api.library.get(id);

    const stat = await api.files.write(id, "main.tex", "% rewritten\n\\documentclass{article}\n");
    expect(stat.path).toBe("main.tex");
    expect(stat.size).toBe("% rewritten\n\\documentclass{article}\n".length);
    expect(stat.modified).not.toBeNull();
    const after = await api.files.read(id, "main.tex");
    expect(after.text).toBe("% rewritten\n\\documentclass{article}\n");
    expect(after.size).toBe(stat.size);
    expect((await api.library.get(id)).modified > project.modified).toBe(true);

    const bytes = await api.files.readBytes(id, "main.tex");
    expect(new TextDecoder().decode(bytes)).toBe(after.text);
    await api.files.createFile(id, "Makefile", "all:\n");
    expect((await api.files.read(id, "Makefile")).ext).toBe("mk");
  });

  it("writes to a new path and rejects escapes, missing files and folders", async () => {
    await api.files.write(id, "notes/scratch.tex", "x");
    expect((await api.files.read(id, "notes/scratch.tex")).text).toBe("x");
    expect(await kindOf(api.files.read(id, "../project.json"))).toBe("invalid");
    expect(await kindOf(api.files.read(id, "/etc/passwd"))).toBe("invalid");
    expect(await kindOf(api.files.read(id, "nope.tex"))).toBe("not_found");
    expect(await kindOf(api.files.read(id, "sections"))).toBe("invalid");
    expect(await kindOf(api.files.write(id, "  ", "x"))).toBe("invalid");
    expect(await kindOf(api.files.readBytes(id, "nope.bin"))).toBe("not_found");
  });

  it("creates, renames and deletes files and folders with conflicts", async () => {
    const folder = await api.files.createFolder(id, "drafts");
    expect(folder).toMatchObject({ name: "drafts", path: "drafts", kind: "dir", size: 0, ext: "", children: [] });
    const file = await api.files.createFile(id, "drafts/ch_10.tex", "ten");
    expect(file).toMatchObject({ name: "ch_10.tex", path: "drafts/ch_10.tex", kind: "file", size: 3, ext: "tex" });
    await api.files.createFile(id, "drafts/ch_2.tex");
    expect((await api.files.read(id, "drafts/ch_2.tex")).text).toBe("");
    expect(await kindOf(api.files.createFile(id, "drafts/ch_10.tex"))).toBe("conflict");
    expect(await kindOf(api.files.createFolder(id, "drafts"))).toBe("conflict");
    expect(await kindOf(api.files.createFile(id, "drafts/"))).toBe("conflict");
    expect(await kindOf(api.files.createFile(id, ""))).toBe("invalid");
    expect(await kindOf(api.files.createFolder(id, "../outside"))).toBe("invalid");

    const tree = await api.files.tree(id);
    expect(names(child(tree, "drafts")?.children ?? [])).toEqual(["ch_2.tex", "ch_10.tex"]);
    const lastDir = tree.map((n) => n.kind).lastIndexOf("dir");
    expect(tree.findIndex((n) => n.kind === "file")).toBeGreaterThan(lastDir);

    const moved = await api.files.rename(id, "drafts/ch_2.tex", "drafts/intro.tex");
    expect(moved.path).toBe("drafts/intro.tex");
    expect(await kindOf(api.files.read(id, "drafts/ch_2.tex"))).toBe("not_found");
    expect(await kindOf(api.files.rename(id, "drafts/intro.tex", "drafts/ch_10.tex"))).toBe("conflict");
    expect(await kindOf(api.files.rename(id, "drafts", "drafts/sub"))).toBe("invalid");
    expect(await kindOf(api.files.rename(id, "missing.tex", "x.tex"))).toBe("not_found");

    const movedDir = await api.files.rename(id, "drafts", "archive/drafts");
    expect(movedDir.kind).toBe("dir");
    expect((await api.files.read(id, "archive/drafts/intro.tex")).path).toBe("archive/drafts/intro.tex");
    expect(names(await api.files.tree(id))).toContain("archive");

    await api.files.remove(id, "archive/drafts/intro.tex");
    expect(names(child(child(await api.files.tree(id), "archive")?.children ?? [], "drafts")?.children ?? [])).toEqual(["ch_10.tex"]);
    await api.files.remove(id, "archive");
    expect(await kindOf(api.files.read(id, "archive/drafts/ch_10.tex"))).toBe("not_found");
    expect(names(await api.files.tree(id))).not.toContain("archive");
    expect(await kindOf(api.files.remove(id, ""))).toBe("invalid");
    expect(await kindOf(api.files.remove(id, "nope"))).toBe("not_found");
  });

  it("imports files, de-duplicating names like the Rust side", async () => {
    const nodes = await api.files.import(id, "figures", ["/Users/demo/Desktop/fig.png", "/Users/demo/Desktop/fig.png", "/Users/demo/Desktop/data.csv"]);
    expect(nodes.map((n) => n.path)).toEqual(["figures/fig.png", "figures/fig (2).png", "figures/data.csv"]);
    const png = await api.files.read(id, "figures/fig.png");
    expect(png).toMatchObject({ binary: true, image: true, text: null, ext: "png" });
    const bytes = await api.files.readBytes(id, "figures/fig.png");
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect((await api.files.read(id, "figures/data.csv")).text).toContain("t,price,soc");
    expect((await api.files.read(id, "figures/revenue-stack.png".replace("revenue-stack", "fig (2)"))).image).toBe(true);
  });

  it("serves the seeded figure as an image", async () => {
    const fig = await api.files.read(SEED_IDS.storage, "figures/revenue-stack.png");
    expect(fig.binary && fig.image).toBe(true);
    expect((await api.files.readBytes(SEED_IDS.storage, "figures/revenue-stack.png")).length).toBeGreaterThan(20);
  });
});

describe("compile", () => {
  it("reports errors for the \\badcommand project and streams status + log events", async () => {
    const statuses: CompileStatusEvent[] = [];
    const logs: CompileLogEvent[] = [];
    const stopStatus = await listen<CompileStatusEvent>("compile:status", (e) => statuses.push(e.payload));
    const stopLog = await listen<CompileLogEvent>("compile:log", (e) => logs.push(e.payload));

    const result = await api.compile.run(SEED_IDS.mtm);
    expect(result.status).toBe("errors");
    expect(result.ok).toBe(false);
    expect(result.pdfUpdated).toBe(true);
    expect(result.engine).toBe("pdflatex");
    expect(result.command).toMatch(/^latexmk -pdf -interaction=nonstopmode -file-line-error -recorder -outdir=.* -synctex=1 main\.tex$/);
    expect(result.exitCode).not.toBe(0);
    expect(result.errorCount).toBe(1);
    expect(result.warningCount).toBe(1);
    const error = result.diagnostics.find((d) => d.severity === "error");
    expect(error).toMatchObject({ file: "chapters/chapter_01.tex", line: 14, message: "Undefined control sequence.", source: "latex" });
    expect(error?.detail).toBe("l.14 Text with an undefined \\badcommand");
    expect(result.diagnostics.map((d) => d.severity)).toEqual(["error", "warning", "info"]);
    expect(result.diagnostics[1].file).toBe("main.tex");
    expect(result.output).toMatchObject({ pages: 5, engine: "pdflatex", errorCount: 1, warningCount: 1, hasSynctex: true });
    expect(result.output?.bytes).toBeGreaterThan(0);
    expect(result.logTail).toContain("Undefined control sequence");

    expect(statuses.map((s) => s.status)).toEqual(["running", "errors"]);
    expect(statuses[0]).toMatchObject({ projectId: SEED_IDS.mtm, job: statuses[1].job });
    expect(logs.length).toBeGreaterThanOrEqual(9);
    expect(logs[0]).toMatchObject({ projectId: SEED_IDS.mtm, stream: "cohere" });
    expect(logs[0].line.startsWith("$ latexmk -pdf")).toBe(true);
    expect(logs.slice(1).every((l) => l.stream === "stdout")).toBe(true);

    const pdf = await api.compile.readPdf(SEED_IDS.mtm);
    expect(ascii(pdf.subarray(0, 5))).toBe("%PDF-");
    expect(ascii(pdf)).toContain("/Count 5");
    expect((await api.compile.outputInfo(SEED_IDS.mtm))?.pages).toBe(5);
    expect(await api.compile.readLog(SEED_IDS.mtm)).toContain("./chapters/chapter_01.tex:14: Undefined control sequence.");
    expect((await api.library.get(SEED_IDS.mtm)).hasOutput).toBe(true);
    const exported = await api.library.exportPdf(SEED_IDS.mtm, "/Users/demo/Desktop/mtm.pdf");
    expect(exported).toEqual({ path: "/Users/demo/Desktop/mtm.pdf", bytes: pdf.length });

    await stopStatus();
    await stopLog();
  });

  it("compiles a clean project successfully with the requested engine", async () => {
    expect(await kindOf(api.compile.readPdf(SEED_IDS.convex))).toBe("not_found");
    expect(await api.compile.outputInfo(SEED_IDS.convex)).toBeNull();
    const result = await api.compile.run(SEED_IDS.convex, "lualatex");
    expect(result.status).toBe("success");
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.engine).toBe("lualatex");
    expect(result.command).toContain("latexmk -pdflua ");
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].severity).toBe("info");
    expect(result.output).toMatchObject({ pages: 3, engine: "lualatex", errorCount: 0, warningCount: 0 });
    expect(result.durationMs).toBeGreaterThan(300);
    expect((await api.compile.outputInfo(SEED_IDS.convex))?.engine).toBe("lualatex");
    expect((await api.files.open(SEED_IDS.convex)).output?.pages).toBe(3);
    await api.compile.cleanBuild(SEED_IDS.convex);
  });

  it("uses the project engine, refuses a concurrent compile and can be cancelled", async () => {
    const first = api.compile.run(SEED_IDS.periodical);
    await wait(30);
    expect((await api.files.open(SEED_IDS.periodical)).compiling).toBe(true);
    expect(await kindOf(api.compile.run(SEED_IDS.periodical))).toBe("conflict");
    expect(await api.compile.cancel(SEED_IDS.periodical)).toBe(true);
    const result = await first;
    expect(result.status).toBe("cancelled");
    expect(result.engine).toBe("xelatex");
    expect(result.pdfUpdated).toBe(false);
    expect(result.output).toBeNull();
    expect(result.exitCode).toBeNull();
    expect(await api.compile.cancel(SEED_IDS.periodical)).toBe(false);
    expect((await api.files.open(SEED_IDS.periodical)).compiling).toBe(false);
    expect(await kindOf(api.compile.run("missing-project"))).toBe("not_found");
  });
});

describe("versions", () => {
  it("snapshots, lists newest first, renames, exports and deletes", async () => {
    const id = SEED_IDS.convex;
    expect(await api.versions.nextName(id)).toBe("v1");
    const v1 = await api.versions.create(id, "", "first cut");
    expect(v1).toMatchObject({ name: "v1", note: "first cut", hasPdf: true });
    expect(v1.pdfBytes).toBeGreaterThan(0);
    expect(v1.bundleBytes).toBeGreaterThan(0);
    expect(v1.fileCount).toBeGreaterThan(3);
    expect(v1.id).toMatch(/^\d{8}-\d{6}-[0-9a-f]{6}$/);

    const v2 = await api.versions.create(id, "  release  ", "");
    expect(v2.name).toBe("release");
    const all = await api.versions.list(id);
    expect(all.map((v) => v.id)).toEqual([v2.id, v1.id]);
    expect((await api.library.get(id)).versionCount).toBe(2);
    expect(await api.versions.nextName(id)).toBe("v3");

    const renamed = await api.versions.rename(id, v1.id, "draft", "n");
    expect([renamed.name, renamed.note]).toEqual(["draft", "n"]);
    expect((await api.versions.rename(id, v1.id, "   ")).name).toBe("draft");

    const pdf = await api.versions.export(id, v1.id, "pdf", "/Users/demo/Desktop/v1.pdf");
    expect(pdf).toEqual({ path: "/Users/demo/Desktop/v1.pdf", bytes: v1.pdfBytes });
    const bundle = await api.versions.export(id, v1.id, "bundle", "/Users/demo/Desktop/v1.zip");
    expect(bundle.bytes).toBe(v1.bundleBytes);
    expect(await kindOf(call("export_version", { id, vid: v1.id, kind: "nope", dest: "/x" }))).toBe("invalid");
    expect(ascii((await api.versions.readPdf(id, v1.id)).subarray(0, 5))).toBe("%PDF-");

    await api.versions.remove(id, v1.id);
    expect((await api.versions.list(id)).map((v) => v.id)).toEqual([v2.id]);
    expect(await kindOf(api.versions.remove(id, v1.id))).toBe("not_found");
    expect(await kindOf(api.versions.remove(id, "../x"))).toBe("invalid");
    expect(await api.versions.nextName(id)).toBe("v2");
  });

  it("records versions without a PDF when nothing was compiled", async () => {
    const v = await api.versions.create(SEED_IDS.grant, "", "");
    expect(v).toMatchObject({ name: "v1", hasPdf: false, pdfBytes: 0 });
    expect(await kindOf(api.versions.export(SEED_IDS.grant, v.id, "pdf", "/x.pdf"))).toBe("not_found");
    expect(await kindOf(api.versions.readPdf(SEED_IDS.grant, v.id))).toBe("not_found");
    expect((await api.versions.export(SEED_IDS.grant, v.id, "bundle", "/x.zip")).bytes).toBe(v.bundleBytes);
  });

  it("ships the seeded project with two versions", async () => {
    const all = await api.versions.list(SEED_IDS.storage);
    expect(all.map((v) => v.name)).toEqual(["v2", "v1"]);
    expect(ascii((await api.versions.readPdf(SEED_IDS.storage, all[1].id)).subarray(0, 5))).toBe("%PDF-");
  });
});

describe("settings, templates and app info", () => {
  it("starts from the Rust defaults", async () => {
    const s = await api.settings.get();
    expect(s.theme).toBe("paper");
    expect(s.motion).toBe("normal");
    expect(s.engine).toBe("pdflatex");
    expect(s.texBinDir).toBeNull();
    expect(s.synctex).toBe(true);
    expect(s.autosaveMs).toBe(800);
    expect(s.editor.fontSize).toBe(11);
    expect(s.ui.sidebarFolded).toEqual([false, false, true]);
    expect(s.editor.fontFamily).toBe("SF Mono, Menlo, Consolas, monospace");
    expect(s.ui.sidebarSections).toEqual([0.5, 0.25, 0.25]);
    expect(s.ui.pdfZoom).toBe("width");
  });

  it("normalises and persists on save", async () => {
    const current = await api.settings.get();
    const saved = await api.settings.save({
      ...current,
      theme: "neon" as api.ThemeId,
      motion: "slow",
      texBinDir: "   ",
      autosaveMs: 5,
      tooltipDelayMs: 9999,
      editor: { ...current.editor, fontSize: 99, tabSize: 0 },
      ui: { ...current.ui, sidebarWidth: 50, editorFraction: 0.95, sidebarSections: [0.9, 0.05, 0.05] },
    });
    expect(saved.theme).toBe("paper");
    expect(saved.motion).toBe("slow");
    expect(saved.texBinDir).toBeNull();
    expect(saved.autosaveMs).toBe(200);
    expect(saved.tooltipDelayMs).toBe(3000);
    expect(saved.editor.fontSize).toBe(32);
    expect(saved.editor.tabSize).toBe(1);
    expect(saved.ui.sidebarWidth).toBe(180);
    expect(saved.ui.editorFraction).toBe(0.8);
    expect(saved.ui.sidebarSections).toEqual([0.5, 0.25, 0.25]);
    expect((await api.settings.get()).motion).toBe("slow");
    expect(localStorage.getItem("cohere.mock.settings")).toContain('"motion":"slow"');
    await api.settings.save({ ...saved, motion: "normal" });
  });

  it("lists the seven templates in the Rust order", async () => {
    const list = await api.templates.list();
    expect(list.map((t) => t.key)).toEqual(["blank", "project", "brief", "periodical", "minimal", "paper", "paper-single"]);
    expect(list[5]).toMatchObject({ twocolumn: true, prompts: { tagline: true } });
    expect(list[6]).toMatchObject({ twocolumn: false, abstractPage: true });
    expect(list[1]).toMatchObject({ name: "Project report", unit: "chapter", unitDir: "chapters", abstractPage: true, defaults: { units: 3, subunits: 2, appendices: 1 } });
    expect(list[3].twocolumn).toBe(true);
  });

  it("describes the app and a found TeX installation", async () => {
    const info = await api.app.info();
    expect(info.version).toBe("0.1.0-mock");
    expect(info.dataDir).toBe("/Users/demo/Library/Application Support/com.cohere.desk");
    expect(info.tex).toMatchObject({ found: true, binDir: "/Library/TeX/texbin", pdflatex: true, xelatex: true, lualatex: true });
    expect(info.tex.latexmkVersion).toContain("Version 4.86a");
    expect(info.themes).toEqual(["paper", "mist", "ink", "graphite"]);
    expect(info.engines).toEqual(["pdflatex", "xelatex", "lualatex"]);
    expect((await api.app.detectTex()).found).toBe(true);
  });
});

describe("tauri plugins and events", () => {
  it("answers dialog plugin calls", async () => {
    expect(await save({ defaultPath: "/Users/demo/Documents/report.pdf" })).toBe("/Users/demo/Desktop/report.pdf");
    expect(await save()).toBe("/Users/demo/Desktop/export.pdf");
    expect(await open({ multiple: true })).toEqual(["/Users/demo/Desktop/figure-1.png", "/Users/demo/Desktop/data.csv"]);
    expect(await open({ multiple: false })).toBe("/Users/demo/Desktop/figure-1.png");
    expect(await ask("Delete this project?")).toBe(true);
    expect(await call("plugin:dialog|confirm", { message: "Sure?" })).toBe(true);
    expect(await call("plugin:dialog|message", { message: "Saved" })).toBeNull();
  });

  it("records opener calls", async () => {
    await revealItemInDir("/Users/demo/Desktop/report.pdf");
    const rec = backend.calls.find((c) => c.cmd === "plugin:opener|reveal_item_in_dir");
    expect(rec?.args).toEqual({ paths: ["/Users/demo/Desktop/report.pdf"] });
  });

  it("routes frontend emit() to listen() handlers and honours unlisten", async () => {
    const seen: unknown[] = [];
    const stop = await listen<{ n: number }>("mock:ping", (e) => seen.push(e.payload));
    await emit("mock:ping", { n: 1 });
    backend.emit("mock:ping", { n: 2 });
    expect(seen).toEqual([{ n: 1 }, { n: 2 }]);
    await stop();
    await emit("mock:ping", { n: 3 });
    expect(seen).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("rejects unknown commands with kind other", async () => {
    expect(await kindOf(call("no_such_command"))).toBe("other");
    expect(await kindOf(call("plugin:nope|thing"))).toBe("other");
  });
});

describe("samplePdf", () => {
  function checkStructure(pdf: Uint8Array, pages: number): void {
    const text = ascii(pdf);
    expect(text.startsWith("%PDF-1.4\n")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(text).toContain(`/Count ${pages}`);
    const startxref = Number(/startxref\n(\d+)\n%%EOF/.exec(text)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe("xref");
    const xref = text.slice(startxref).split("\n");
    const count = Number(xref[1].split(" ")[1]);
    expect(count).toBe(3 + 2 * pages + 1);
    for (let i = 0; i < count; i++) {
      const entry = xref[2 + i];
      expect(entry).toHaveLength(19);
      if (i === 0) continue;
      const offset = Number(entry.slice(0, 10));
      expect(text.slice(offset, offset + `${i} 0 obj`.length)).toBe(`${i} 0 obj`);
    }
    for (const m of text.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
      const start = (m.index ?? 0) + m[0].length;
      expect(text.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe("\nendstream");
    }
  }

  it("builds a valid single-page PDF with the given lines", () => {
    checkStructure(SAMPLE_PDF, 1);
    const text = ascii(SAMPLE_PDF);
    expect(text).toContain("/MediaBox [0 0 612 792]");
    expect(text).toContain("/BaseFont /Helvetica");
    expect(text).toContain("14 TL");
    expect(text).toContain("(Cohere) Tj");
    expect(text).toContain("(compiled by the mock backend) Tj");
  });

  it("escapes parentheses and backslashes and folds non-ASCII", () => {
    const text = ascii(buildSamplePdf(["a(b)\\c — d"]));
    expect(text).toContain("(a\\(b\\)\\\\c - d) Tj");
  });

  it("builds multi-page PDFs", () => {
    checkStructure(buildMultiPagePdf([["one"], ["two"], ["three"]]), 3);
    checkStructure(buildMultiPagePdf([]), 1);
  });
});
