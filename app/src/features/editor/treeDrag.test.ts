import { describe, expect, it } from "vitest";
import { canMove, dropTargetFor, movedPath, toLogicalPoint } from "./treeDrag";

function el(html: string): Element {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root.firstElementChild!;
}

describe("tree drag helpers", () => {
  it("resolves the folder under a point", () => {
    const tree = el(`<div data-dropzone="root"><div data-path="chapters" data-kind="dir"><span id="a">chapters</span></div><div data-path="chapters/ch_01.tex" data-kind="file"><span id="b">ch</span></div><div id="c">gap</div></div>`);
    document.body.appendChild(tree);
    expect(dropTargetFor(tree.querySelector("#a"))).toBe("chapters");
    expect(dropTargetFor(tree.querySelector("#b"))).toBe("chapters");
    expect(dropTargetFor(tree.querySelector("#c"))).toBe("");
    expect(dropTargetFor(document.body)).toBeNull();
    expect(dropTargetFor(null)).toBeNull();
    tree.remove();
  });

  it("refuses no-op and self-nesting moves", () => {
    expect(canMove("main.tex", "file", "chapters")).toBe(true);
    expect(canMove("main.tex", "file", "")).toBe(false);
    expect(canMove("chapters/ch_01.tex", "file", "chapters")).toBe(false);
    expect(canMove("chapters", "dir", "chapters")).toBe(false);
    expect(canMove("chapters", "dir", "chapters/sub")).toBe(false);
    expect(canMove("chapters", "dir", "figures")).toBe(true);
    expect(canMove("chapters", "dir", "")).toBe(false);
  });

  it("builds the destination path", () => {
    expect(movedPath("chapters/ch_01.tex", "")).toBe("ch_01.tex");
    expect(movedPath("ch_01.tex", "chapters/old")).toBe("chapters/old/ch_01.tex");
  });

  it("converts physical drop positions to CSS pixels", () => {
    expect(toLogicalPoint({ x: 200, y: 100 }, 2)).toEqual({ x: 100, y: 50 });
  });
});
