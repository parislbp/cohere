import { describe, expect, it } from "vitest";
import { buildProjectOutline, findInputs, makeSource, normalizePath, projectItemAtCursor, resolveInputPath, type FileSource } from "./projectOutline";

function memorySource(files: Record<string, string>): FileSource & { reads: string[] } {
  const reads: string[] = [];
  return {
    reads,
    read(path) {
      reads.push(path);
      return Promise.resolve(path in files ? files[path] : null);
    },
  };
}

function existsIn(files: Record<string, string>): (p: string) => boolean {
  return (p) => p in files;
}

describe("findInputs", () => {
  it("recognises every inclusion form and joins import directories", () => {
    const text = [
      "\\input{chapters/intro}",
      "\\include{./chapters/methods.tex}",
      "\\subfile{parts/a}",
      "\\import{sections/}{results}",
      "\\subimport{sub}{deep}",
      "\\import{}{bare}",
      "\\InputIfFileExists{maybe}{}{}",
      "\\input {spaced}",
    ].join("\n");
    expect(findInputs(text)).toEqual([
      { path: "chapters/intro", line: 1, kind: "input" },
      { path: "chapters/methods.tex", line: 2, kind: "include" },
      { path: "parts/a", line: 3, kind: "subfile" },
      { path: "sections/results", line: 4, kind: "import" },
      { path: "sub/deep", line: 5, kind: "import" },
      { path: "bare", line: 6, kind: "import" },
      { path: "maybe", line: 7, kind: "input" },
      { path: "spaced", line: 8, kind: "input" },
    ]);
  });

  it("keeps several inclusions on one line in source order", () => {
    expect(findInputs("\\import{d}{b} \\input{a}").map((r) => r.path)).toEqual(["d/b", "a"]);
  });

  it("skips commented lines, comment tails and verbatim bodies", () => {
    const text = ["% \\input{commented}", "\\input{kept} % \\input{tail}", "\\begin{verbatim}", "\\input{verb}", "\\end{verbatim}", "\\begin{comment}", "\\include{hidden}", "\\end{comment}", "text \\% \\input{escaped-percent}"].join("\n");
    expect(findInputs(text).map((r) => r.path)).toEqual(["kept", "escaped-percent"]);
  });

  it("ignores graphics, pdf and includeonly, plus macro or # paths", () => {
    const text = ["\\includegraphics{fig.png}", "\\includepdf{doc.pdf}", "\\includeonly{a,b}", "\\input{\\chapterdir/a}", "\\input{#1}", "\\import{\\root}{x}", "\\input{}", "\\inputencoding{utf8}"].join("\n");
    expect(findInputs(text)).toEqual([]);
  });
});

describe("normalizePath", () => {
  it("collapses . and .. segments", () => {
    expect(normalizePath("a/./b/../c")).toBe("a/c");
    expect(normalizePath("./x")).toBe("x");
    expect(normalizePath("../y")).toBe("../y");
  });
});

describe("resolveInputPath", () => {
  const files = { "main.tex": "", "chapters/a.tex": "", "chapters/b.tex": "", "chapters/data.txt": "", "shared/pre.tex": "" };
  const exists = existsIn(files);

  it("resolves from the project root first and appends .tex", () => {
    expect(resolveInputPath("chapters/a", "main.tex", exists)).toBe("chapters/a.tex");
    expect(resolveInputPath("chapters/a.tex", "main.tex", exists)).toBe("chapters/a.tex");
    expect(resolveInputPath("./chapters/data.txt", "main.tex", exists)).toBe("chapters/data.txt");
  });

  it("prefers the root over the including file's folder", () => {
    // From chapters/a.tex, `chapters/b` must resolve to chapters/b.tex, not chapters/chapters/b.tex.
    expect(resolveInputPath("chapters/b", "chapters/a.tex", exists)).toBe("chapters/b.tex");
  });

  it("falls back to a sibling of the including file", () => {
    expect(resolveInputPath("b", "chapters/a.tex", exists)).toBe("chapters/b.tex");
    expect(resolveInputPath("../shared/pre", "chapters/a.tex", exists)).toBe("shared/pre.tex");
  });

  it("returns null for unknown, macro or empty paths", () => {
    expect(resolveInputPath("nope", "main.tex", exists)).toBeNull();
    expect(resolveInputPath("\\dir/a", "main.tex", exists)).toBeNull();
    expect(resolveInputPath("", "main.tex", exists)).toBeNull();
    expect(resolveInputPath("../outside", "main.tex", exists)).toBeNull();
  });
});

describe("buildProjectOutline", () => {
  it("splices included files' headings in document order", async () => {
    const files = {
      "main.tex": ["\\documentclass{book}", "\\begin{document}", "\\chapter{One}", "\\input{chapters/a}", "\\chapter{Three}", "\\end{document}"].join("\n"),
      "chapters/a.tex": ["\\chapter{Two}", "\\section{Two A}", "\\input{chapters/nested}", "\\section{Two C}"].join("\n"),
      "chapters/nested.tex": "\\section{Two B}",
    };
    const res = await buildProjectOutline("main.tex", memorySource(files), existsIn(files));
    expect(res.items.map((i) => [i.title, i.file, i.line])).toEqual([
      ["One", "main.tex", 3],
      ["Two", "chapters/a.tex", 1],
      ["Two A", "chapters/a.tex", 2],
      ["Two B", "chapters/nested.tex", 1],
      ["Two C", "chapters/a.tex", 4],
      ["Three", "main.tex", 5],
    ]);
    expect(res.files).toEqual(["main.tex", "chapters/a.tex", "chapters/nested.tex"]);
    expect(res.missing).toEqual([]);
    expect(res.items.map((i) => i.id)).toEqual(["main.tex#3", "chapters/a.tex#1", "chapters/a.tex#2", "chapters/nested.tex#1", "chapters/a.tex#4", "main.tex#5"]);
    expect(new Set(res.items.map((i) => i.id)).size).toBe(res.items.length);
  });

  it("carries \\appendix across files", async () => {
    const files = {
      "main.tex": ["\\chapter{Body}", "\\appendix", "\\input{app}", "\\chapter{Later}"].join("\n"),
      "app.tex": ["\\chapter{Appendix A}", "\\section{Detail}"].join("\n"),
    };
    const res = await buildProjectOutline("main.tex", memorySource(files), existsIn(files));
    expect(res.items.map((i) => [i.title, i.appendix])).toEqual([
      ["Body", false],
      ["Appendix A", true],
      ["Detail", true],
      ["Later", true],
    ]);
  });

  it("honours an \\appendix inside an included file for everything after it", async () => {
    const files = {
      "main.tex": ["\\input{a}", "\\chapter{After}"].join("\n"),
      "a.tex": ["\\chapter{Before}", "\\appendix", "\\chapter{Inside}"].join("\n"),
    };
    const res = await buildProjectOutline("main.tex", memorySource(files), existsIn(files));
    expect(res.items.map((i) => [i.title, i.appendix])).toEqual([
      ["Before", false],
      ["Inside", true],
      ["After", true],
    ]);
  });

  it("terminates on cycles and visits each file once", async () => {
    const files = {
      "main.tex": ["\\section{Main}", "\\input{a}"].join("\n"),
      "a.tex": ["\\section{A}", "\\input{a}", "\\input{main}", "\\input{b}"].join("\n"),
      "b.tex": ["\\section{B}", "\\input{a}"].join("\n"),
    };
    const source = memorySource(files);
    const res = await buildProjectOutline("main.tex", source, existsIn(files));
    expect(res.items.map((i) => i.title)).toEqual(["Main", "A", "B"]);
    expect(res.files).toEqual(["main.tex", "a.tex", "b.tex"]);
    expect(source.reads).toEqual(["main.tex", "a.tex", "b.tex"]);
    expect(res.missing).toEqual([]);
  });

  it("reports inputs that do not resolve", async () => {
    const files = {
      "main.tex": ["\\section{Intro}", "\\input{chapters/ghost}", "\\include{alsoGhost}", "\\section{Outro}"].join("\n"),
    };
    const res = await buildProjectOutline("main.tex", memorySource(files), existsIn(files));
    expect(res.items.map((i) => i.title)).toEqual(["Intro", "Outro"]);
    expect(res.missing).toEqual([
      { from: "main.tex", raw: "chapters/ghost", line: 2 },
      { from: "main.tex", raw: "alsoGhost", line: 3 },
    ]);
  });

  it("respects depth and file limits", async () => {
    const files: Record<string, string> = { "main.tex": "\\section{0}\n\\input{f1}" };
    for (let i = 1; i <= 12; i++) files[`f${i}.tex`] = `\\section{${i}}\n\\input{f${i + 1}}`;
    const exists = existsIn(files);
    const deep = await buildProjectOutline("main.tex", memorySource(files), exists, { maxDepth: 3 });
    expect(deep.items.map((i) => i.title)).toEqual(["0", "1", "2", "3"]);
    const few = await buildProjectOutline("main.tex", memorySource(files), exists, { maxFiles: 2 });
    expect(few.files).toEqual(["main.tex", "f1.tex"]);
    expect(few.items.map((i) => i.title)).toEqual(["0", "1"]);
  });

  it("returns an empty outline when the main file cannot be read", async () => {
    const res = await buildProjectOutline("main.tex", memorySource({}), () => false);
    expect(res).toEqual({ items: [], files: [], missing: [] });
  });

  it("keeps ids unique when two headings share a line", async () => {
    const files = { "main.tex": "\\section{A} \\section{B}" };
    const res = await buildProjectOutline("main.tex", memorySource(files), existsIn(files));
    expect(res.items.map((i) => i.id)).toEqual(["main.tex#1", "main.tex#1:2"]);
  });
});

describe("projectItemAtCursor", () => {
  it("finds the last heading in the cursor's file at or before the line", async () => {
    const files = {
      "main.tex": ["\\chapter{One}", "\\input{a}", "\\chapter{Three}"].join("\n"),
      "a.tex": ["text", "\\section{Two}", "more"].join("\n"),
    };
    const { items } = await buildProjectOutline("main.tex", memorySource(files), existsIn(files));
    expect(projectItemAtCursor(items, "main.tex", 2)?.title).toBe("One");
    expect(projectItemAtCursor(items, "main.tex", 3)?.title).toBe("Three");
    expect(projectItemAtCursor(items, "a.tex", 3)?.title).toBe("Two");
    expect(projectItemAtCursor(items, "a.tex", 1)).toBeNull();
    expect(projectItemAtCursor(items, "other.tex", 99)).toBeNull();
    expect(projectItemAtCursor(items, null, 1)).toBeNull();
  });
});

describe("makeSource", () => {
  it("serves open buffers and treats binary buffers as unreadable", async () => {
    const src = makeSource("p1", { "main.tex": { text: "hello", binary: false }, "img.png": { text: "", binary: true } });
    expect(await src.read("main.tex")).toBe("hello");
    expect(await src.read("img.png")).toBeNull();
  });

  it("ignores \\appendix in the preamble or inside macro definitions, and honours \\startappendices", async () => {
    const files: Record<string, string> = {
      "main.tex": "\\documentclass{report}\n\\newcommand{\\startappendices}{%\n  \\appendix\n}\n\\begin{document}\n\\chapter{Body}\n\\startappendices\n\\chapter{Extra}\n\\end{document}\n",
    };
    const source = { read: async (p: string) => files[p] ?? null };
    const { items } = await buildProjectOutline("main.tex", source, (p) => p in files);
    expect(items.map((i) => [i.title, i.appendix])).toEqual([
      ["Body", false],
      ["Extra", true],
    ]);
  });
});
