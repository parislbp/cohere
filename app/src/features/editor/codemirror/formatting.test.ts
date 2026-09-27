import { describe, expect, it } from "vitest";
import { EditorSelection, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { formattingKeymap, wrapCommand } from "./formatting";

function view(doc: string, anchor: number, head = anchor): EditorView {
  const state = EditorState.create({ doc, selection: EditorSelection.single(anchor, head), extensions: [formattingKeymap()] });
  return new EditorView({ state, parent: document.body });
}

describe("formatting commands", () => {
  it("wraps a selection in the macro and keeps the text selected", () => {
    const v = view("say hello there", 4, 9);
    wrapCommand("textbf")(v);
    expect(v.state.doc.toString()).toBe("say \\textbf{hello} there");
    const r = v.state.selection.main;
    expect(v.state.sliceDoc(r.from, r.to)).toBe("hello");
    v.destroy();
  });

  it("unwraps when the selection is already inside the macro, or is the whole macro", () => {
    const v = view("say \\textbf{hello} there", 12, 17);
    wrapCommand("textbf")(v);
    expect(v.state.doc.toString()).toBe("say hello there");
    expect(v.state.sliceDoc(v.state.selection.main.from, v.state.selection.main.to)).toBe("hello");
    const w = view("a \\emph{b} c", 2, 10);
    wrapCommand("emph")(w);
    expect(w.state.doc.toString()).toBe("a b c");
    v.destroy();
    w.destroy();
  });

  it("wraps the word under an empty cursor, or inserts an empty wrapper", () => {
    const v = view("plain words", 8);
    wrapCommand("emph")(v);
    expect(v.state.doc.toString()).toBe("plain \\emph{words}");
    const w = view("end ", 4);
    wrapCommand("underline")(w);
    expect(w.state.doc.toString()).toBe("end \\underline{}");
    expect(w.state.selection.main.head).toBe("end \\underline{".length);
    v.destroy();
    w.destroy();
  });

  it("handles multiple selections in one transaction", () => {
    const state = EditorState.create({ doc: "one two", selection: EditorSelection.create([EditorSelection.range(0, 3), EditorSelection.range(4, 7)]), extensions: [EditorState.allowMultipleSelections.of(true)] });
    const v = new EditorView({ state, parent: document.body });
    wrapCommand("textbf")(v);
    expect(v.state.doc.toString()).toBe("\\textbf{one} \\textbf{two}");
    expect(v.state.selection.ranges.map((r) => v.state.sliceDoc(r.from, r.to))).toEqual(["one", "two"]);
    v.destroy();
  });

  it("uses the configured code macro", () => {
    const state = EditorState.create({ doc: "x", selection: EditorSelection.single(0, 1), extensions: [formattingKeymap({ codeMacro: () => "texttt" })] });
    const v = new EditorView({ state, parent: document.body });
    wrapCommand(() => "texttt")(v);
    expect(v.state.doc.toString()).toBe("\\texttt{x}");
    v.destroy();
  });
});
