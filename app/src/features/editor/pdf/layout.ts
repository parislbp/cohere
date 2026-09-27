/**
 * Arithmetic page layout. Positions are derived from page sizes rather than measured from the DOM
 * so they are available synchronously (before paint, and in environments without layout).
 */
import type { PageSize } from "./zoom";

export interface PageBox {
  /** CSS pixels, rounded so page edges sit on device pixels. */
  width: number;
  height: number;
  /** Distance from the top of the scroll content to the top of the page. */
  top: number;
}

export interface PageLayout {
  scale: number;
  padding: number;
  gap: number;
  boxes: PageBox[];
  /** Total scroll content height, including padding. */
  totalHeight: number;
}

/**
 * Where the top edge of the viewport sits relative to the content: the page under it plus an offset
 * expressed as a fraction of that page's height (so it survives scale changes). While the edge is
 * in the padding/gap above the page the offset is kept in pixels so the top of the document stays
 * pinned at 0. `ratio` is the fallback when the page no longer exists after a reload.
 */
export interface ScrollAnchor {
  pageIndex: number;
  offsetFraction: number | null;
  offsetPx: number;
  ratio: number;
}

export const EMPTY_LAYOUT: PageLayout = { scale: 1, padding: 0, gap: 0, boxes: [], totalHeight: 0 };

export function computeLayout(sizes: readonly PageSize[], scale: number, padding: number, gap: number): PageLayout {
  const boxes: PageBox[] = [];
  let y = padding;
  sizes.forEach((size, i) => {
    const width = Math.max(1, Math.round(size.width * scale));
    const height = Math.max(1, Math.round(size.height * scale));
    boxes.push({ width, height, top: y });
    y += height + (i < sizes.length - 1 ? gap : 0);
  });
  return { scale, padding, gap, boxes, totalHeight: sizes.length ? y + padding : 0 };
}

/** Index of the first page whose bottom edge is below `y` (clamped to the last page). */
export function pageIndexAtOffset(layout: PageLayout, y: number): number {
  const { boxes } = layout;
  if (boxes.length === 0) return -1;
  let lo = 0;
  let hi = boxes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (boxes[mid].top + boxes[mid].height > y) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Index of the page whose vertical midpoint is nearest `y`. */
export function pageIndexNearestCenter(layout: PageLayout, y: number): number {
  const { boxes } = layout;
  if (boxes.length === 0) return -1;
  const midpoint = (i: number) => boxes[i].top + boxes[i].height / 2;
  let lo = 0;
  let hi = boxes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (midpoint(mid) < y) lo = mid + 1;
    else hi = mid;
  }
  // `lo` is the first page with midpoint >= y; the previous one may be closer.
  if (lo > 0 && y - midpoint(lo - 1) < midpoint(lo) - y) return lo - 1;
  return lo;
}

export function captureAnchor(layout: PageLayout, scrollTop: number): ScrollAnchor | null {
  const pageIndex = pageIndexAtOffset(layout, scrollTop);
  if (pageIndex < 0) return null;
  const box = layout.boxes[pageIndex];
  const offsetPx = scrollTop - box.top;
  return {
    pageIndex,
    offsetFraction: offsetPx >= 0 ? offsetPx / box.height : null,
    offsetPx,
    ratio: layout.totalHeight > 0 ? scrollTop / layout.totalHeight : 0,
  };
}

/** Scroll offset that puts the anchored content back at the top of the viewport in `layout`. */
export function resolveAnchor(anchor: ScrollAnchor, layout: PageLayout): number {
  const box = layout.boxes[anchor.pageIndex];
  if (!box) return Math.max(0, anchor.ratio * layout.totalHeight);
  const offset = anchor.offsetFraction !== null ? anchor.offsetFraction * box.height : anchor.offsetPx;
  return Math.max(0, Math.round(box.top + offset));
}

/** Scroll offset for navigating to a page: its top edge with the preceding gap visible. */
export function scrollTopForPage(layout: PageLayout, index: number): number {
  const box = layout.boxes[index];
  if (!box) return 0;
  return Math.max(0, box.top - layout.gap);
}
