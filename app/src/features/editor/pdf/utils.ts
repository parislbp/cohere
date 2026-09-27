/** Helpers that must not import pdf.js so tests can mock `./pdfjs` in isolation. */

export const MAX_DEVICE_PIXEL_RATIO = 3;
/** Matches pdf.js's default `maxCanvasPixels`; keeps a single bitmap under ~128 MB. */
export const MAX_CANVAS_PIXELS = 2 ** 25;

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function currentDevicePixelRatio(): number {
  const raw = typeof window !== "undefined" ? window.devicePixelRatio : 1;
  return Number.isFinite(raw) && raw > 0 ? raw : 1;
}

/** Device pixels per CSS pixel to render at, capped for memory and canvas size limits. */
export function outputScaleFor(cssWidth: number, cssHeight: number, devicePixelRatio: number): number {
  const dpr = Math.min(MAX_DEVICE_PIXEL_RATIO, Math.max(1, devicePixelRatio));
  const area = cssWidth * cssHeight;
  if (area <= 0) return dpr;
  return Math.min(dpr, Math.sqrt(MAX_CANVAS_PIXELS / area));
}

function errorName(err: unknown): string {
  if (typeof err !== "object" || err === null) return "";
  const name = (err as { name?: unknown }).name;
  return typeof name === "string" ? name : "";
}

export function isRenderingCancelled(err: unknown): boolean {
  return errorName(err) === "RenderingCancelledException";
}

export function describePdfError(err: unknown): string {
  switch (errorName(err)) {
    case "InvalidPDFException":
      return "The PDF is invalid or corrupted.";
    case "PasswordException":
      return "The PDF is password protected.";
    case "MissingPDFException":
      return "The PDF could not be found.";
    case "UnexpectedResponseException":
      return "The PDF could not be read.";
  }
  if (typeof err === "object" && err !== null) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  if (typeof err === "string" && err) return err;
  return "The PDF could not be loaded.";
}
