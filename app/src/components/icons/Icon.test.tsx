import { render, screen } from "@testing-library/react";
import { ICON_NAMES, ICON_PATHS, Icon, IconSearch, IconWarning } from "./index";

const DRAWING_SELECTOR = "path, circle, line, rect, polyline, polygon, ellipse";

function getSvg(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector("svg");
  if (!svg) throw new Error("expected an <svg> to be rendered");
  return svg;
}

describe("ICON_PATHS", () => {
  it("has exactly one drawing per icon name", () => {
    expect(Object.keys(ICON_PATHS).sort()).toEqual([...ICON_NAMES].sort());
    for (const name of ICON_NAMES) {
      expect(ICON_PATHS[name].trim().length, `${name} has markup`).toBeGreaterThan(0);
    }
  });
});

describe("Icon", () => {
  it.each(ICON_NAMES)("renders %s as a 20×20 svg with at least one drawing child", (name) => {
    const { container } = render(<Icon name={name} />);
    const svg = getSvg(container);
    expect(svg).toHaveAttribute("viewBox", "0 0 20 20");
    expect(svg.querySelectorAll(DRAWING_SELECTOR).length).toBeGreaterThan(0);
    expect(svg).toHaveAttribute("data-icon", name);
  });

  it.each(ICON_NAMES)("%s only fills with none or currentColor", (name) => {
    const { container } = render(<Icon name={name} />);
    const svg = getSvg(container);
    expect(svg).toHaveAttribute("fill", "none");
    for (const el of svg.querySelectorAll("[fill]")) {
      expect(["none", "currentColor"], `${name}: <${el.tagName}> fill`).toContain(el.getAttribute("fill"));
    }
    for (const el of svg.querySelectorAll("[style]")) {
      expect(el.getAttribute("style"), `${name}: inline style`).not.toMatch(/fill\s*:/);
    }
  });

  it("inherits the line style from the svg root", () => {
    const { container } = render(<Icon name="home" />);
    const svg = getSvg(container);
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg).toHaveAttribute("stroke-width", "1.5");
    expect(svg).toHaveAttribute("stroke-linecap", "round");
    expect(svg).toHaveAttribute("stroke-linejoin", "round");
  });

  it("is decorative by default and hidden from assistive tech", () => {
    const { container } = render(<Icon name="search" />);
    const svg = getSvg(container);
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
    expect(svg.querySelector("title")).toBeNull();
  });

  it("renders a <title> and exposes role=img when a title is given", () => {
    const { container } = render(<Icon name="search" title="Search files" />);
    const svg = getSvg(container);
    expect(screen.getByTitle("Search files").closest("svg")).toBe(svg);
    expect(svg).toHaveAttribute("role", "img");
    expect(svg).not.toHaveAttribute("aria-hidden");
    expect(svg.querySelector("title")?.textContent).toBe("Search files");
  });

  it("escapes markup-significant characters in the title", () => {
    const { container } = render(<Icon name="info" title="Tom & <Jerry>" />);
    const svg = getSvg(container);
    expect(svg.querySelector("title")?.textContent).toBe("Tom & <Jerry>");
    expect(svg.querySelectorAll("*").length).toBe(svg.querySelectorAll("title, " + DRAWING_SELECTOR).length);
  });

  it("defaults to 18px and accepts a custom size", () => {
    const { container, rerender } = render(<Icon name="plus" />);
    const svg = getSvg(container);
    expect(svg).toHaveAttribute("width", "18");
    expect(svg).toHaveAttribute("height", "18");
    rerender(<Icon name="plus" size={24} />);
    expect(svg).toHaveAttribute("width", "24");
    expect(svg).toHaveAttribute("height", "24");
  });

  it("accepts a custom stroke width", () => {
    const { container } = render(<Icon name="plus" strokeWidth={2} />);
    expect(getSvg(container)).toHaveAttribute("stroke-width", "2");
  });

  it("merges the ch-icon class with a caller class and forwards other props", () => {
    const onClick = vi.fn();
    const { container } = render(<Icon name="close" className="ch-icon--spin toolbar" onClick={onClick} />);
    const svg = getSvg(container);
    expect(svg).toHaveClass("ch-icon", "ch-icon--spin", "toolbar");
    svg.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("keeps the ch-icon class when no className is passed", () => {
    const { container } = render(<Icon name="close" />);
    expect(getSvg(container).getAttribute("class")).toBe("ch-icon");
  });
});

describe("named convenience components", () => {
  it("render the same markup as <Icon name=…>", () => {
    const named = render(<IconSearch size={20} title="Search" />);
    const generic = render(<Icon name="search" size={20} title="Search" />);
    expect(getSvg(named.container).outerHTML).toBe(getSvg(generic.container).outerHTML);
  });

  it("have a readable displayName", () => {
    expect(IconWarning.displayName).toBe("Icon(warning)");
  });
});
