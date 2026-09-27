import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PdfViewer, type PdfViewerProps } from "./PdfViewer";
import type { PdfViewerHandle, PdfViewerState } from "./types";
import { destroyDocument, loadPdfDocument } from "./pdfjs";
import type { PDFDocumentProxy } from "./pdfjs";

interface FakeRenderTask {
  promise: Promise<void>;
  cancel: () => void;
}

interface FakePage {
  pageNumber: number;
  getViewport: (params: { scale: number }) => { width: number; height: number; scale: number };
  render: (params: unknown) => FakeRenderTask;
  cleanup: () => void;
}

interface FakeDoc {
  numPages: number;
  getPage: (n: number) => Promise<FakePage>;
  destroy: ReturnType<typeof vi.fn>;
}

const fakes = vi.hoisted(() => {
  const docs: FakeDoc[] = [];
  const createDoc = (numPages: number, render?: FakePage["render"]): FakeDoc => {
    const pages = Array.from({ length: numPages }, (_, i): FakePage => ({
      pageNumber: i + 1,
      getViewport: ({ scale }) => ({ width: 612 * scale, height: 792 * scale, scale }),
      render: render ?? (() => ({ promise: Promise.resolve(), cancel() {} })),
      cleanup() {},
    }));
    const doc: FakeDoc = {
      numPages,
      getPage: async (n) => pages[n - 1],
      destroy: vi.fn(async () => {}),
    };
    docs.push(doc);
    return doc;
  };
  return { docs, createDoc };
});

vi.mock("./pdfjs", () => ({
  loadPdfDocument: vi.fn(async (_data: Uint8Array) => fakes.createDoc(2)),
  destroyDocument: vi.fn(async (doc: { destroy(): Promise<void> } | null | undefined) => {
    await doc?.destroy();
  }),
}));

const asDoc = (doc: FakeDoc) => doc as unknown as PDFDocumentProxy;
const bytes = () => new Uint8Array([0x25, 0x50, 0x44, 0x46]);
const pagesIn = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>(".pdf-page"));
const viewerIn = (container: HTMLElement) => container.querySelector<HTMLElement>(".pdf-viewer")!;

function setup(overrides: Partial<PdfViewerProps> = {}) {
  const ref = createRef<PdfViewerHandle>();
  const onState = vi.fn<(state: PdfViewerState) => void>();
  const base: PdfViewerProps = { data: bytes(), zoom: 100, onState, ...overrides };
  const utils = render(<PdfViewer ref={ref} {...base} />);
  const rerender = (next: Partial<PdfViewerProps>) => utils.rerender(<PdfViewer ref={ref} {...base} {...next} />);
  const handle = () => ref.current!;
  const untilLoaded = (count = 2) => waitFor(() => expect(pagesIn(utils.container)).toHaveLength(count));
  return { ...utils, ref, onState, rerender, handle, untilLoaded };
}

beforeEach(() => {
  fakes.docs.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("PdfViewer", () => {
  it("renders a sized placeholder per page and paints a canvas into each", async () => {
    const { container, untilLoaded } = setup();
    await untilLoaded();
    const pages = pagesIn(container);
    for (const page of pages) {
      expect(page.style.width).toBe("612px");
      expect(page.style.height).toBe("792px");
    }
    expect(pages.map((p) => p.dataset.pageNumber)).toEqual(["1", "2"]);
    await waitFor(() => expect(pages.every((p) => p.dataset.phase === "ready")).toBe(true));
    expect(container.querySelectorAll("canvas")).toHaveLength(2);
    expect(vi.mocked(loadPdfDocument)).toHaveBeenCalledTimes(1);
  });

  it("renders bitmaps at the device pixel ratio while keeping the CSS size", async () => {
    const original = Object.getOwnPropertyDescriptor(window, "devicePixelRatio");
    Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });
    const renders: Array<{ canvas: HTMLCanvasElement; transform?: number[] }> = [];
    vi.mocked(loadPdfDocument).mockResolvedValueOnce(
      asDoc(
        fakes.createDoc(1, (params) => {
          renders.push(params as { canvas: HTMLCanvasElement; transform?: number[] });
          return { promise: Promise.resolve(), cancel() {} };
        }),
      ),
    );
    try {
      const { container, untilLoaded } = setup();
      await untilLoaded(1);
      await waitFor(() => expect(container.querySelector("canvas")).not.toBeNull());
      const canvas = container.querySelector("canvas")!;
      expect([canvas.width, canvas.height]).toEqual([1224, 1584]);
      expect([canvas.style.width, canvas.style.height]).toEqual(["612px", "792px"]);
      expect(renders[0].transform).toEqual([2, 0, 0, 2, 0, 0]);
    } finally {
      if (original) Object.defineProperty(window, "devicePixelRatio", original);
    }
  });

  it("reports page count, scale and zoom through onState", async () => {
    const { onState } = setup();
    await waitFor(() =>
      expect(onState).toHaveBeenLastCalledWith({ page: 1, pageCount: 2, scale: 1, zoom: 100, loading: false, error: null }),
    );
  });

  it("goToPage scrolls to the page and updates the reported page", async () => {
    const { container, onState, handle, untilLoaded } = setup();
    await untilLoaded();
    act(() => handle().goToPage(2));
    // padding 24 + page 792 + gap 14 = 830 is the top of page 2; the gap before it stays visible.
    expect(viewerIn(container).scrollTop).toBe(816);
    expect(handle().getState().page).toBe(2);
    await waitFor(() => expect(onState).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })));
    act(() => handle().goToPage(99));
    expect(handle().getState().page).toBe(2);
    act(() => handle().scrollToTop());
    expect(viewerIn(container).scrollTop).toBe(0);
    expect(handle().getState().page).toBe(1);
  });

  it("applies a pending goToPage once the document arrives", async () => {
    const { container, handle, untilLoaded } = setup();
    act(() => handle().goToPage(2));
    await untilLoaded();
    expect(viewerIn(container).scrollTop).toBe(816);
    expect(handle().getState().page).toBe(2);
  });

  it("re-sizes pages when the numeric zoom changes", async () => {
    const { container, handle, rerender, untilLoaded } = setup();
    await untilLoaded();
    rerender({ zoom: 200 });
    await waitFor(() => expect(pagesIn(container)[0].style.width).toBe("1224px"));
    expect(pagesIn(container)[0].style.height).toBe("1584px");
    expect(handle().getState()).toMatchObject({ scale: 2, zoom: 200 });
    // Fit modes fall back to scale 1 while the container is unmeasured (jsdom has no layout).
    rerender({ zoom: "width" });
    await waitFor(() => expect(handle().getState()).toMatchObject({ scale: 1, zoom: "width" }));
  });

  it("keeps the same content anchored at the top when zooming", async () => {
    const { container, rerender, untilLoaded } = setup();
    await untilLoaded();
    const viewer = viewerIn(container);
    // Top edge 70px into page 2 (page 2 starts at 830).
    viewer.scrollTop = 900;
    fireEvent.scroll(viewer);
    rerender({ zoom: 200 });
    // Page 2 now starts at 24 + 1584 + 14 = 1622; 70/792 of the doubled page height is 140.
    await waitFor(() => expect(viewer.scrollTop).toBe(1622 + 140));
  });

  it("cancels in-flight renders when the layout changes", async () => {
    const cancel = vi.fn();
    vi.mocked(loadPdfDocument).mockResolvedValueOnce(
      asDoc(fakes.createDoc(2, () => ({ promise: new Promise<void>(() => {}), cancel }))),
    );
    const { container, rerender, untilLoaded } = setup();
    await untilLoaded();
    expect(pagesIn(container).every((p) => p.classList.contains("is-rendering"))).toBe(true);
    rerender({ zoom: 150 });
    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(2));
  });

  it("destroys the document on unmount", async () => {
    const { unmount, untilLoaded } = setup();
    await untilLoaded();
    const doc = fakes.docs[0];
    expect(doc.destroy).not.toHaveBeenCalled();
    unmount();
    await waitFor(() => expect(doc.destroy).toHaveBeenCalledTimes(1));
    expect(vi.mocked(destroyDocument)).toHaveBeenCalledWith(doc);
  });

  it("renders no pages for null data", async () => {
    const { container, onState } = setup({ data: null });
    await waitFor(() =>
      expect(onState).toHaveBeenCalledWith(expect.objectContaining({ page: 0, pageCount: 0, loading: false, error: null })),
    );
    expect(pagesIn(container)).toHaveLength(0);
    expect(container.querySelector(".pdf-viewer")).not.toBeNull();
    expect(vi.mocked(loadPdfDocument)).not.toHaveBeenCalled();
  });

  it("keeps the previous document visible while the next loads, then swaps and preserves position", async () => {
    const { container, handle, rerender, untilLoaded } = setup();
    await untilLoaded();
    const first = fakes.docs[0];
    const viewer = viewerIn(container);
    viewer.scrollTop = 900;
    fireEvent.scroll(viewer);
    expect(handle().getState().page).toBe(2);

    let release!: () => void;
    vi.mocked(loadPdfDocument).mockImplementationOnce(
      () => new Promise<PDFDocumentProxy>((resolve) => (release = () => resolve(asDoc(fakes.createDoc(3))))),
    );
    rerender({ data: bytes() });
    await waitFor(() => expect(handle().getState().loading).toBe(true));
    expect(pagesIn(container)).toHaveLength(2);
    expect(first.destroy).not.toHaveBeenCalled();

    await act(async () => release());
    await untilLoaded(3);
    // Same page sizes: the exact pixel offset survives the reload.
    expect(viewer.scrollTop).toBe(900);
    expect(handle().getState()).toMatchObject({ page: 2, pageCount: 3, loading: false, error: null });
    await waitFor(() => expect(first.destroy).toHaveBeenCalledTimes(1));
    expect(fakes.docs[1].destroy).not.toHaveBeenCalled();
  });

  it("falls back to the relative position when the anchored page disappears", async () => {
    const { container, handle, rerender, untilLoaded } = setup();
    await untilLoaded();
    const viewer = viewerIn(container);
    viewer.scrollTop = 900;
    fireEvent.scroll(viewer);
    vi.mocked(loadPdfDocument).mockResolvedValueOnce(asDoc(fakes.createDoc(1)));
    rerender({ data: bytes() });
    await untilLoaded(1);
    // Old total height 24 + 792 + 14 + 792 + 24 = 1646; new total 840.
    expect(viewer.scrollTop).toBe((900 / 1646) * 840);
    expect(handle().getState().pageCount).toBe(1);
  });

  it("reports load errors and keeps the current document", async () => {
    const { container, handle, rerender, untilLoaded } = setup();
    await untilLoaded();
    vi.mocked(loadPdfDocument).mockRejectedValueOnce(Object.assign(new Error("bad xref"), { name: "InvalidPDFException" }));
    rerender({ data: bytes() });
    await waitFor(() => expect(handle().getState().error).toBe("The PDF is invalid or corrupted."));
    expect(handle().getState()).toMatchObject({ loading: false, pageCount: 2 });
    expect(pagesIn(container)).toHaveLength(2);
    expect(fakes.docs[0].destroy).not.toHaveBeenCalled();
  });

  it("discards a load that was superseded before it finished", async () => {
    const stale = fakes.createDoc(2);
    let release!: () => void;
    vi.mocked(loadPdfDocument).mockImplementationOnce(
      () => new Promise<PDFDocumentProxy>((resolve) => (release = () => resolve(asDoc(stale)))),
    );
    const { rerender, untilLoaded } = setup();
    rerender({ data: bytes() });
    await untilLoaded();
    const live = fakes.docs[1];
    await act(async () => release());
    await waitFor(() => expect(stale.destroy).toHaveBeenCalledTimes(1));
    expect(live.destroy).not.toHaveBeenCalled();
  });

  it("steps through zoom presets via the handle and reports through onZoomChange", async () => {
    const onZoomChange = vi.fn();
    const { handle, untilLoaded } = setup({ onZoomChange });
    await untilLoaded();
    act(() => handle().zoomIn());
    expect(onZoomChange).toHaveBeenLastCalledWith(110);
    act(() => handle().zoomOut());
    expect(onZoomChange).toHaveBeenLastCalledWith(90);
    act(() => handle().setZoom(1000));
    expect(onZoomChange).toHaveBeenLastCalledWith(400);
    act(() => handle().setZoom("page"));
    expect(onZoomChange).toHaveBeenLastCalledWith("page");
    act(() => handle().setZoom(100));
    expect(onZoomChange).toHaveBeenCalledTimes(4);
  });

  it("manages zoom itself when uncontrolled", async () => {
    const { container, handle, untilLoaded } = setup();
    await untilLoaded();
    act(() => handle().zoomIn());
    await waitFor(() => expect(pagesIn(container)[0].style.width).toBe(`${Math.round(612 * 1.1)}px`));
    expect(handle().getState()).toMatchObject({ zoom: 110, scale: 1.1 });
  });

  it("handles Cmd+= / Cmd+- / Cmd+0 only while focused", async () => {
    const onZoomChange = vi.fn();
    const { container, untilLoaded } = setup({ zoom: 150, onZoomChange });
    await untilLoaded();
    const viewer = viewerIn(container);
    expect(viewer.tabIndex).toBe(0);
    fireEvent.keyDown(document.body, { key: "=", metaKey: true });
    expect(onZoomChange).not.toHaveBeenCalled();
    viewer.focus();
    fireEvent.keyDown(viewer, { key: "=", metaKey: true });
    expect(onZoomChange).toHaveBeenLastCalledWith(175);
    fireEvent.keyDown(viewer, { key: "-", ctrlKey: true });
    expect(onZoomChange).toHaveBeenLastCalledWith(125);
    fireEvent.keyDown(viewer, { key: "0", metaKey: true });
    expect(onZoomChange).toHaveBeenLastCalledWith(100);
    fireEvent.keyDown(viewer, { key: "=" });
    expect(onZoomChange).toHaveBeenCalledTimes(3);
  });

  it("zooms with Cmd+wheel and swallows the browser zoom", async () => {
    const onZoomChange = vi.fn();
    const { container, untilLoaded } = setup({ onZoomChange });
    await untilLoaded();
    const viewer = viewerIn(container);
    const plain = new WheelEvent("wheel", { deltaY: -120, bubbles: true, cancelable: true });
    viewer.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(false);
    expect(onZoomChange).not.toHaveBeenCalled();
    const zoomIn = new WheelEvent("wheel", { deltaY: -60, metaKey: true, bubbles: true, cancelable: true });
    viewer.dispatchEvent(zoomIn);
    expect(zoomIn.defaultPrevented).toBe(true);
    expect(onZoomChange).toHaveBeenLastCalledWith(110);
  });
});
