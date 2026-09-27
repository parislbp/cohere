import { describe, expect, it } from "vitest";
import { autoSide, place } from "./placement";

const vp = { width: 1200, height: 800 };
const tip = { width: 160, height: 32 };

describe("placement", () => {
  it("floats toward the viewport centre", () => {
    expect(autoSide({ left: 100, top: 20, width: 40, height: 20 }, vp)).toBe("bottom");
    expect(autoSide({ left: 100, top: 700, width: 40, height: 20 }, vp)).toBe("top");
  });

  it("centres horizontally under a top-left anchor and stays inside the viewport", () => {
    const p = place({ left: 4, top: 10, width: 24, height: 24 }, tip, vp);
    expect(p.side).toBe("bottom");
    expect(p.left).toBe(8);
    expect(p.top).toBe(10 + 24 + 8);
  });

  it("never overflows the right or bottom edge", () => {
    const p = place({ left: 1180, top: 780, width: 20, height: 20 }, tip, vp);
    expect(p.left + tip.width).toBeLessThanOrEqual(vp.width - 8);
    expect(p.side).toBe("top");
    expect(p.top).toBe(780 - 8 - 32);
  });

  it("flips when the preferred side does not fit", () => {
    const p = place({ left: 500, top: 5, width: 20, height: 20 }, tip, vp, { side: "top" });
    expect(p.side).toBe("bottom");
    const q = place({ left: 500, top: 400, width: 20, height: 20 }, tip, vp, { side: "top" });
    expect(q.side).toBe("top");
  });

  it("supports start alignment for menus", () => {
    const p = place({ left: 300, top: 100, width: 80, height: 28 }, { width: 200, height: 120 }, vp, { side: "bottom", align: "start", offset: 4 });
    expect(p.left).toBe(300);
    expect(p.top).toBe(132);
    const e = place({ left: 1100, top: 100, width: 80, height: 28 }, { width: 200, height: 120 }, vp, { side: "bottom", align: "end", offset: 4 });
    expect(e.left).toBe(980);
  });
});
