/**
 * Zoom mode of the viewer.
 * - `"width"`: scale so the widest page fills the container width (minus padding).
 * - `"page"`: scale so the whole first page fits in the container.
 * - `number`: percent, 25..400, where 100% renders one PDF point per CSS pixel (`scale = n / 100`).
 */
export type PdfZoom = "width" | "page" | number;

export interface PdfViewerState {
  /** 1-based page nearest the vertical centre of the viewport; 0 when nothing is loaded. */
  page: number;
  pageCount: number;
  /** Effective render scale (PDF points → CSS pixels). */
  scale: number;
  zoom: PdfZoom;
  loading: boolean;
  error: string | null;
}

export interface PdfViewerHandle {
  goToPage(n: number): void;
  zoomIn(): void;
  zoomOut(): void;
  setZoom(z: PdfZoom): void;
  scrollToTop(): void;
  getState(): PdfViewerState;
}
