/**
 * Floating-element placement (tooltips, menus). Pure functions so they are testable.
 * Rule: float toward the centre of the viewport so nothing is ever clipped off-screen.
 */

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Side = "top" | "bottom" | "left" | "right";

export interface Placement {
  left: number;
  top: number;
  side: Side;
}

export interface PlaceOptions {
  /** Preferred side; "auto" picks the side facing the viewport centre. */
  side?: Side | "auto";
  /** Gap between anchor and float. */
  offset?: number;
  /** Minimum distance from the viewport edges. */
  margin?: number;
  /** Align the float's start edge with the anchor's instead of centring. */
  align?: "center" | "start" | "end";
}

/** Choose the vertical side with more room, biased toward the viewport centre. */
export function autoSide(anchor: Rect, viewport: Size): Side {
  const anchorCenterY = anchor.top + anchor.height / 2;
  return anchorCenterY < viewport.height / 2 ? "bottom" : "top";
}

export function place(anchor: Rect, float: Size, viewport: Size, opts: PlaceOptions = {}): Placement {
  const offset = opts.offset ?? 8;
  const margin = opts.margin ?? 8;
  const align = opts.align ?? "center";
  let side: Side = opts.side && opts.side !== "auto" ? opts.side : autoSide(anchor, viewport);

  const fits = (s: Side): boolean => {
    switch (s) {
      case "bottom":
        return anchor.top + anchor.height + offset + float.height + margin <= viewport.height;
      case "top":
        return anchor.top - offset - float.height - margin >= 0;
      case "right":
        return anchor.left + anchor.width + offset + float.width + margin <= viewport.width;
      case "left":
        return anchor.left - offset - float.width - margin >= 0;
    }
  };
  if (!fits(side)) {
    const flipped: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };
    if (fits(flipped[side])) side = flipped[side];
  }

  let left: number;
  let top: number;
  if (side === "top" || side === "bottom") {
    top = side === "bottom" ? anchor.top + anchor.height + offset : anchor.top - offset - float.height;
    if (align === "start") left = anchor.left;
    else if (align === "end") left = anchor.left + anchor.width - float.width;
    else left = anchor.left + anchor.width / 2 - float.width / 2;
  } else {
    left = side === "right" ? anchor.left + anchor.width + offset : anchor.left - offset - float.width;
    if (align === "start") top = anchor.top;
    else if (align === "end") top = anchor.top + anchor.height - float.height;
    else top = anchor.top + anchor.height / 2 - float.height / 2;
  }

  left = clampToViewport(left, float.width, viewport.width, margin);
  top = clampToViewport(top, float.height, viewport.height, margin);
  return { left: Math.round(left), top: Math.round(top), side };
}

function clampToViewport(pos: number, size: number, extent: number, margin: number): number {
  const max = Math.max(margin, extent - size - margin);
  return Math.min(Math.max(pos, margin), max);
}
