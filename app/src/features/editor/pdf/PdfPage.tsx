import { memo, useCallback, useEffect, useRef, useState } from "react";
import type { PDFPageProxy } from "./pdfjs";
import { cx, isRenderingCancelled, outputScaleFor } from "./utils";

export interface PdfPageProps {
  page: PDFPageProxy;
  /** 0-based. */
  index: number;
  /** CSS pixel size of the placeholder (already rounded). */
  width: number;
  height: number;
  /** Unscaled page width, used to derive a render scale that lands exactly on `width`. */
  baseWidth: number;
  devicePixelRatio: number;
  /** Within the render window; when false the bitmap is dropped to bound memory. */
  visible: boolean;
  register: (index: number, el: HTMLDivElement | null) => void;
}

type Phase = "empty" | "rendering" | "ready" | "failed";

function releaseCanvas(canvas: HTMLCanvasElement): void {
  // Zero-sizing frees the backing store immediately instead of waiting for GC (matters in WebKit).
  canvas.width = 0;
  canvas.height = 0;
}

function clearHost(host: HTMLElement): void {
  for (const child of Array.from(host.children)) {
    if (child instanceof HTMLCanvasElement) releaseCanvas(child);
  }
  host.replaceChildren();
}

export const PdfPage = memo(function PdfPage({
  page,
  index,
  width,
  height,
  baseWidth,
  devicePixelRatio,
  visible,
  register,
}: PdfPageProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>("empty");

  const setElement = useCallback((el: HTMLDivElement | null) => register(index, el), [register, index]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    if (!visible) {
      clearHost(host);
      setPhase("empty");
      try {
        page.cleanup();
      } catch {
        // The page may belong to a document that is already destroyed.
      }
      return;
    }

    // Double buffering: keep the previous bitmap (CSS-stretched to the new size) on screen until the
    // fresh one is ready, so zooming and recompiling never flash to a blank page.
    const shown = host.firstElementChild instanceof HTMLCanvasElement ? host.firstElementChild : null;
    if (shown) {
      shown.style.width = `${width}px`;
      shown.style.height = `${height}px`;
    } else {
      setPhase("rendering");
    }

    const canvas = document.createElement("canvas");
    const dpr = outputScaleFor(width, height, devicePixelRatio);
    const viewport = page.getViewport({ scale: width / baseWidth });
    canvas.width = Math.floor(viewport.width * dpr);
    canvas.height = Math.floor(viewport.height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    let active = true;
    let settled = false;
    let task: ReturnType<PDFPageProxy["render"]>;
    try {
      task = page.render({ canvas, viewport, transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0] });
    } catch {
      releaseCanvas(canvas);
      setPhase(shown ? "ready" : "failed");
      return;
    }

    task.promise.then(
      () => {
        settled = true;
        if (!active) {
          releaseCanvas(canvas);
          return;
        }
        clearHost(host);
        host.append(canvas);
        setPhase("ready");
      },
      (err: unknown) => {
        settled = true;
        releaseCanvas(canvas);
        if (!active || isRenderingCancelled(err)) return;
        setPhase(shown ? "ready" : "failed");
      },
    );

    return () => {
      active = false;
      if (!settled) task.cancel();
    };
  }, [page, visible, width, height, baseWidth, devicePixelRatio]);

  return (
    <div
      ref={setElement}
      className={cx("pdf-page", phase === "rendering" && "is-rendering")}
      style={{ width, height }}
      data-page-number={index + 1}
      data-phase={phase}
      role="img"
      aria-label={`Page ${index + 1}`}
    >
      <div ref={hostRef} className="pdf-page-canvas" />
    </div>
  );
});

export default PdfPage;
