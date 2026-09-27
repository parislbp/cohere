import { describe, expect, it } from "vitest";
import { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { SNIPPETS, SNIPPET_COMPLETIONS, snippetPaletteSource } from "./snippets";

function source(doc: string, pos = doc.length, explicit = false) {
  const state = EditorState.create({ doc });
  return snippetPaletteSource(new CompletionContext(state, pos, explicit));
}

describe("@ snippet palette", () => {
  it("offers blocks after @ at a word boundary and filters by the typed prefix", () => {
    const r = source("Some text @tab");
    expect(r).not.toBeNull();
    expect(r!.from).toBe("Some text ".length);
    const labels = r!.options.map((o) => o.label);
    expect(labels).toContain("@table");
    expect(labels).toContain("@tabular");
    expect(labels).toContain("@figure");
  });

  it("works at the start of a line and after an opening brace", () => {
    expect(source("@")).not.toBeNull();
    expect(source("line one\n@eq")).not.toBeNull();
    expect(source("\\emph{@")).not.toBeNull();
  });

  it("does not fire inside e-mail-like text", () => {
    expect(source("paris@example")).toBeNull();
    expect(source("a@")).toBeNull();
  });

  it("every snippet has a unique @label, balanced environments and a final cursor field", () => {
    const seen = new Set<string>();
    for (const c of SNIPPET_COMPLETIONS) {
      expect(c.label.startsWith("@")).toBe(true);
      expect(seen.has(c.label)).toBe(false);
      seen.add(c.label);
    }
    for (const def of SNIPPETS) {
      const begins = def.template.match(/\\begin\{(\w+\*?)\}/g) ?? [];
      const ends = def.template.match(/\\end\{(\w+\*?)\}/g) ?? [];
      expect(ends.length, `${def.key} environments balanced`).toBe(begins.length);
      expect(def.template.includes("${}"), `${def.key} ends with a cursor field`).toBe(true);
      expect(def.info.length).toBeGreaterThan(10);
    }
  });

  it("covers the core blocks", () => {
    const keys = new Set(SNIPPETS.map((s) => s.key));
    for (const k of ["table", "figure", "equation", "align", "section", "subsection", "itemize", "enumerate", "cite", "ref", "footnote", "definition", "proposition", "listing"]) {
      expect(keys.has(k), k).toBe(true);
    }
    expect(SNIPPET_COMPLETIONS.some((c) => c.label === "@fig")).toBe(true);
  });
});
