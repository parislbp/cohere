/**
 * pdf.js glue. The legacy build is used for WKWebView compatibility; it bundles its own
 * core-js polyfills (including `Promise.withResolvers`, in both the main and worker bundles),
 * so no extra polyfill is needed here.
 */
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";

export type { PDFDocumentProxy, PDFPageProxy, PageViewport, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";

let workerConfigured = false;

function ensureWorker(): void {
  if (workerConfigured) return;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  workerConfigured = true;
}

/** Parses `data` into a document. The bytes are copied because pdf.js transfers the buffer to the worker. */
export async function loadPdfDocument(data: Uint8Array): Promise<PDFDocumentProxy> {
  ensureWorker();
  const task = pdfjs.getDocument({
    data: new Uint8Array(data),
    // The app CSP has no 'unsafe-eval'; pdf.js falls back to its interpreter for PostScript functions.
    isEvalSupported: false,
    verbosity: pdfjs.VerbosityLevel.ERRORS,
  });
  try {
    return await task.promise;
  } catch (err) {
    // A failed load still owns a worker; release it before surfacing the error.
    await task.destroy().catch(() => undefined);
    throw err;
  }
}

/** Destroys a document (and its worker), swallowing errors from documents that are already gone. */
export async function destroyDocument(doc: PDFDocumentProxy | null | undefined): Promise<void> {
  if (!doc) return;
  try {
    await doc.destroy();
  } catch {
    // Already destroyed or the worker is gone; nothing left to release.
  }
}
