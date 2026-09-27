import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { destroyDocument, loadPdfDocument } from "./pdfjs";
import type { PDFDocumentProxy, PDFPageProxy } from "./pdfjs";
import { PdfPage } from "./PdfPage";
import {
  EMPTY_LAYOUT,
  captureAnchor,
  computeLayout,
  pageIndexNearestCenter,
  resolveAnchor,
  scrollTopForPage,
  type PageLayout,
  type ScrollAnchor,
} from "./layout";
import { normalizeZoom, scaleForZoom, stepZoom, type PageSize, type ViewportSize } from "./zoom";
import { currentDevicePixelRatio, cx, describePdfError } from "./utils";
import type { PdfViewerHandle, PdfViewerState, PdfZoom } from "./types";
import "./pdf.css";

export interface PdfViewerProps {
  /** Raw PDF bytes. A new identity triggers a reload; `null` shows an empty container. */
  data: Uint8Array | null;
  zoom: PdfZoom;
  /** Called when the user or the handle changes zoom. Without it the viewer manages zoom itself. */
  onZoomChange?: (zoom: PdfZoom) => void;
  /** Throttled to animation frames. */
  onState?: (state: PdfViewerState) => void;
  className?: string;
  /** Space around the page stack, in CSS px. */
  padding?: number;
  /** Space between pages, in CSS px. */
  gap?: number;
}

interface PageEntry {
  page: PDFPageProxy;
  size: PageSize;
}

interface LoadedDocument {
  doc: PDFDocumentProxy;
  pages: PageEntry[];
}

/** Accumulated wheel delta (px) per zoom step, so trackpads do not race through the presets. */
const WHEEL_ZOOM_THRESHOLD = 40;
const RESIZE_DEBOUNCE_MS = 60;
const EMPTY_VISIBLE: ReadonlySet<number> = new Set();

function sameState(a: PdfViewerState, b: PdfViewerState): boolean {
  return (
    a.page === b.page &&
    a.pageCount === b.pageCount &&
    a.scale === b.scale &&
    a.zoom === b.zoom &&
    a.loading === b.loading &&
    a.error === b.error
  );
}

export const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(function PdfViewer(
  { data, zoom: zoomProp, onZoomChange, onState, className, padding = 24, gap = 14 },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState<LoadedDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewport, setViewport] = useState<ViewportSize>({ width: 0, height: 0 });
  const [visible, setVisible] = useState<ReadonlySet<number>>(EMPTY_VISIBLE);

  // Controlled when `onZoomChange` is given (the prop is the truth); otherwise the internal copy,
  // seeded and re-synced from the prop, lets the handle and shortcuts work on their own.
  const [internalZoom, setInternalZoom] = useState<PdfZoom>(() => normalizeZoom(zoomProp));
  useLayoutEffect(() => {
    setInternalZoom(normalizeZoom(zoomProp));
  }, [zoomProp]);
  const zoom = onZoomChange ? normalizeZoom(zoomProp) : internalZoom;

  const onStateRef = useRef(onState);
  const onZoomChangeRef = useRef(onZoomChange);
  const zoomRef = useRef(zoom);
  useLayoutEffect(() => {
    onStateRef.current = onState;
    onZoomChangeRef.current = onZoomChange;
    zoomRef.current = zoom;
  });

  const sizes = useMemo<PageSize[]>(() => loaded?.pages.map((entry) => entry.size) ?? [], [loaded]);
  const scale = useMemo(() => scaleForZoom(zoom, sizes, viewport, padding), [zoom, sizes, viewport, padding]);
  const layout = useMemo(() => computeLayout(sizes, scale, padding, gap), [sizes, scale, padding, gap]);

  const layoutRef = useRef<PageLayout>(EMPTY_LAYOUT);
  const anchorRef = useRef<ScrollAnchor | null>(null);
  const pendingPageRef = useRef<number | null>(null);
  const stateRef = useRef<PdfViewerState>({ page: 0, pageCount: 0, scale, zoom, loading: false, error: null });

  // ---- state reporting (rAF-throttled) -------------------------------------------------------

  const frameRef = useRef<number | null>(null);
  const notify = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      onStateRef.current?.(stateRef.current);
    });
  }, []);

  const patchState = useCallback(
    (patch: Partial<PdfViewerState>) => {
      const next = { ...stateRef.current, ...patch };
      if (sameState(next, stateRef.current)) return;
      stateRef.current = next;
      notify();
    },
    [notify],
  );

  useEffect(() => {
    notify();
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [notify]);

  useEffect(() => {
    patchState({ pageCount: layout.boxes.length, scale: layout.scale, zoom, loading, error });
  }, [layout, zoom, loading, error, patchState]);

  // ---- document loading -----------------------------------------------------------------------

  useEffect(() => {
    if (!data) {
      setLoaded(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      const doc = await loadPdfDocument(data);
      try {
        if (cancelled) throw new Error("superseded");
        const proxies = await Promise.all(Array.from({ length: doc.numPages }, (_, i) => doc.getPage(i + 1)));
        if (cancelled) throw new Error("superseded");
        const pages = proxies.map<PageEntry>((page) => {
          const { width, height } = page.getViewport({ scale: 1 });
          return { page, size: { width, height } };
        });
        // The previous document stays mounted until this commit; PdfPage swaps bitmaps in place.
        setLoaded({ doc, pages });
        setError(null);
        setLoading(false);
      } catch (err) {
        void destroyDocument(doc);
        throw err;
      }
    })().catch((err: unknown) => {
      if (cancelled) return;
      setError(describePdfError(err));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [data]);

  // Destroy the previous document only after the commit that replaced it, so in-flight renders on
  // its pages have already been cancelled by their own effect cleanups.
  const currentDocRef = useRef<LoadedDocument | null>(null);
  useEffect(() => {
    const previous = currentDocRef.current;
    currentDocRef.current = loaded;
    if (previous && previous !== loaded) void destroyDocument(previous.doc);
  }, [loaded]);
  useEffect(
    () => () => {
      void destroyDocument(currentDocRef.current?.doc);
      currentDocRef.current = null;
    },
    [],
  );

  // ---- container measurement --------------------------------------------------------------------

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const width = el.clientWidth;
      const height = el.clientHeight;
      setViewport((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
    };
    measure();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new ResizeObserver(() => {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(measure, RESIZE_DEBOUNCE_MS);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (timer !== null) clearTimeout(timer);
    };
  }, []);

  // Moving the window to a display with a different density changes the DPR; re-render so pages
  // stay crisp. A `resolution` media query fires exactly when the current ratio stops matching.
  const [devicePixelRatio, setDevicePixelRatio] = useState(currentDevicePixelRatio);
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    let media: MediaQueryList | null = null;
    const watch = () => {
      media?.removeEventListener("change", watch);
      const dpr = currentDevicePixelRatio();
      setDevicePixelRatio(dpr);
      media = window.matchMedia(`(resolution: ${dpr}dppx)`);
      media.addEventListener("change", watch);
    };
    watch();
    return () => media?.removeEventListener("change", watch);
  }, []);

  // ---- lazy rendering window (IntersectionObserver) ---------------------------------------------

  const pageElements = useRef(new Map<number, HTMLDivElement>());
  const elementIndex = useRef(new WeakMap<Element, number>());
  const observerRef = useRef<IntersectionObserver | null>(null);

  const register = useCallback((index: number, el: HTMLDivElement | null) => {
    const previous = pageElements.current.get(index);
    if (previous && previous !== el) {
      observerRef.current?.unobserve(previous);
      pageElements.current.delete(index);
    }
    if (el) {
      pageElements.current.set(index, el);
      elementIndex.current.set(el, index);
      observerRef.current?.observe(el);
    }
  }, []);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        setVisible((prev) => {
          let next: Set<number> | null = null;
          for (const entry of entries) {
            const index = elementIndex.current.get(entry.target);
            if (index === undefined || entry.isIntersecting === prev.has(index)) continue;
            next ??= new Set(prev);
            if (entry.isIntersecting) next.add(index);
            else next.delete(index);
          }
          return next ?? prev;
        });
      },
      // ±1 viewport: render slightly ahead of the scroll, drop bitmaps further away.
      { root, rootMargin: "100% 0px", threshold: 0 },
    );
    observerRef.current = observer;
    for (const el of pageElements.current.values()) observer.observe(el);
    return () => {
      observer.disconnect();
      observerRef.current = null;
    };
  }, []);

  // Pages removed by a shorter document can no longer be visible.
  const pageCount = layout.boxes.length;
  useEffect(() => {
    setVisible((prev) => {
      let next: Set<number> | null = null;
      for (const index of prev) {
        if (index < pageCount) continue;
        next ??= new Set(prev);
        next.delete(index);
      }
      return next ?? prev;
    });
  }, [pageCount]);

  // ---- scroll position: anchoring across layout changes ---------------------------------------

  const syncScrollState = useCallback(
    (el: HTMLDivElement, current: PageLayout) => {
      anchorRef.current = captureAnchor(current, el.scrollTop);
      patchState({ page: pageIndexNearestCenter(current, el.scrollTop + el.clientHeight / 2) + 1 });
    },
    [patchState],
  );

  // Navigation reports the requested page immediately; the scroll event that follows re-derives it.
  const jumpToPage = useCallback(
    (el: HTMLDivElement, current: PageLayout, index: number) => {
      el.scrollTop = scrollTopForPage(current, index);
      anchorRef.current = captureAnchor(current, el.scrollTop);
      patchState({ page: index + 1 });
    },
    [patchState],
  );

  useLayoutEffect(() => {
    const el = containerRef.current;
    const previous = layoutRef.current;
    layoutRef.current = layout;
    if (!el) return;
    if (layout.boxes.length === 0) {
      anchorRef.current = null;
      patchState({ page: 0 });
      return;
    }
    if (previous.scale !== layout.scale) el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
    if (pendingPageRef.current !== null) {
      const index = Math.min(layout.boxes.length, pendingPageRef.current) - 1;
      pendingPageRef.current = null;
      jumpToPage(el, layout, index);
      return;
    }
    if (previous.boxes.length > 0 && anchorRef.current) el.scrollTop = resolveAnchor(anchorRef.current, layout);
    syncScrollState(el, layout);
  }, [layout, patchState, jumpToPage, syncScrollState]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el || layoutRef.current.boxes.length === 0) return;
    syncScrollState(el, layoutRef.current);
  }, [syncScrollState]);

  // ---- zoom --------------------------------------------------------------------------------------

  const applyZoom = useCallback((next: PdfZoom) => {
    const normalized = normalizeZoom(next);
    if (normalized === zoomRef.current) return;
    if (onZoomChangeRef.current) onZoomChangeRef.current(normalized);
    else setInternalZoom(normalized);
  }, []);

  const zoomIn = useCallback(() => applyZoom(stepZoom(layoutRef.current.scale * 100, 1)), [applyZoom]);
  const zoomOut = useCallback(() => applyZoom(stepZoom(layoutRef.current.scale * 100, -1)), [applyZoom]);

  // React registers wheel listeners as passive, so preventing the browser's own zoom needs a native one.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let accumulated = 0;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) {
        accumulated = 0;
        return;
      }
      event.preventDefault();
      accumulated +=
        event.deltaMode === WheelEvent.DOM_DELTA_PIXEL ? event.deltaY : Math.sign(event.deltaY) * WHEEL_ZOOM_THRESHOLD;
      if (Math.abs(accumulated) < WHEEL_ZOOM_THRESHOLD) return;
      const direction = accumulated < 0 ? 1 : -1;
      accumulated = 0;
      applyZoom(stepZoom(layoutRef.current.scale * 100, direction));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyZoom]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    switch (event.key) {
      case "=":
      case "+":
        event.preventDefault();
        zoomIn();
        break;
      case "-":
      case "_":
        event.preventDefault();
        zoomOut();
        break;
      case "0":
        event.preventDefault();
        applyZoom(100);
        break;
    }
  };

  // ---- imperative handle --------------------------------------------------------------------------

  const goToPage = useCallback(
    (n: number) => {
      if (!Number.isFinite(n)) return;
      const wanted = Math.max(1, Math.round(n));
      const el = containerRef.current;
      const current = layoutRef.current;
      if (!el || current.boxes.length === 0) {
        // Nothing laid out yet (still loading): apply once the pages arrive.
        pendingPageRef.current = wanted;
        return;
      }
      jumpToPage(el, current, Math.min(current.boxes.length, wanted) - 1);
    },
    [jumpToPage],
  );

  const scrollToTop = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTop = 0;
    el.scrollLeft = 0;
    handleScroll();
  }, [handleScroll]);

  useImperativeHandle(
    ref,
    () => ({
      goToPage,
      zoomIn,
      zoomOut,
      setZoom: applyZoom,
      scrollToTop,
      getState: () => stateRef.current,
    }),
    [goToPage, zoomIn, zoomOut, applyZoom, scrollToTop],
  );

  return (
    <div
      ref={containerRef}
      className={cx("pdf-viewer", className)}
      tabIndex={0}
      role="document"
      aria-label="PDF preview"
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
    >
      {loaded && (
        <div className="pdf-pages" style={{ padding, gap }}>
          {loaded.pages.map((entry, index) => (
            <PdfPage
              key={index}
              index={index}
              page={entry.page}
              width={layout.boxes[index].width}
              height={layout.boxes[index].height}
              baseWidth={entry.size.width}
              devicePixelRatio={devicePixelRatio}
              visible={visible.has(index)}
              register={register}
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default PdfViewer;
