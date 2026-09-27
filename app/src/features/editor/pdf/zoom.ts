import type { PdfZoom } from "./types";

export const ZOOM_STEPS: readonly number[] = [50, 67, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400];
export const MIN_ZOOM_PERCENT = 25;
export const MAX_ZOOM_PERCENT = 400;

/** Bounds for computed fit scales so a degenerate container never collapses or explodes pages. */
const MIN_SCALE = 0.1;
const MAX_SCALE = 10;
/** A step this close (relative) to the current percent counts as "already there" when stepping. */
const STEP_TOLERANCE = 0.02;

export interface PageSize {
  width: number;
  height: number;
}

export interface ViewportSize {
  width: number;
  height: number;
}

export function clampZoomPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 100;
  return Math.min(MAX_ZOOM_PERCENT, Math.max(MIN_ZOOM_PERCENT, percent));
}

export function normalizeZoom(zoom: PdfZoom): PdfZoom {
  return typeof zoom === "number" ? clampZoomPercent(zoom) : zoom;
}

/**
 * Next preset step from an effective percent. Steps within the tolerance of the current value are
 * skipped so zooming out of, say, 100.4% lands on 90 rather than a visually identical 100.
 */
export function stepZoom(percent: number, direction: 1 | -1): number {
  if (direction > 0) {
    const threshold = percent * (1 + STEP_TOLERANCE);
    const next = ZOOM_STEPS.find((step) => step > threshold);
    return next ?? Math.max(ZOOM_STEPS[ZOOM_STEPS.length - 1], clampZoomPercent(percent));
  }
  const threshold = percent * (1 - STEP_TOLERANCE);
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < threshold) return ZOOM_STEPS[i];
  }
  return Math.min(ZOOM_STEPS[0], clampZoomPercent(percent));
}

function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** Effective scale for a zoom mode. Falls back to 1 while the container is unmeasured. */
export function scaleForZoom(zoom: PdfZoom, pages: readonly PageSize[], viewport: ViewportSize, padding: number): number {
  if (typeof zoom === "number") return clampZoomPercent(zoom) / 100;
  if (pages.length === 0) return 1;
  const availableWidth = viewport.width - 2 * padding;
  const availableHeight = viewport.height - 2 * padding;
  if (zoom === "width") {
    const widest = pages.reduce((max, page) => Math.max(max, page.width), 0);
    if (availableWidth <= 0 || widest <= 0) return 1;
    return clampScale(availableWidth / widest);
  }
  const first = pages[0];
  if (availableWidth <= 0 || availableHeight <= 0 || first.width <= 0 || first.height <= 0) return 1;
  return clampScale(Math.min(availableWidth / first.width, availableHeight / first.height));
}
