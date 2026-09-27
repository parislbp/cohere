/**
 * Themed traffic lights. The native buttons are hidden by the Rust side; these sit in the same
 * spot and only appear while the top bar is hovered, cross-fading with the brand.
 */
import { useCallback } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Tooltip } from "@/components/ui";

async function withWindow(fn: (w: ReturnType<typeof getCurrentWindow>) => Promise<unknown>) {
  if (!("__TAURI_INTERNALS__" in window)) return;
  try {
    await fn(getCurrentWindow());
  } catch (e) {
    console.warn("window control failed", e);
  }
}

export function WindowControls() {
  const close = useCallback(() => void withWindow((w) => w.close()), []);
  const minimize = useCallback(() => void withWindow((w) => w.minimize()), []);
  const zoom = useCallback(
    (alt: boolean) =>
      void withWindow(async (w) => {
        if (alt || (await w.isFullscreen())) return w.setFullscreen(!(await w.isFullscreen()));
        return w.toggleMaximize();
      }),
    [],
  );
  return (
    <div className="lights" role="group" aria-label="Window controls">
      <Tooltip content="Close" side="bottom">
        <button className="light light--close" aria-label="Close window" onClick={close}>
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" />
          </svg>
        </button>
      </Tooltip>
      <Tooltip content="Minimize" side="bottom">
        <button className="light light--min" aria-label="Minimize window" onClick={minimize}>
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M3 6h6" />
          </svg>
        </button>
      </Tooltip>
      <Tooltip content="Zoom" hint="⌥ click for full screen" side="bottom">
        <button className="light light--max" aria-label="Zoom window" onClick={(e) => zoom(e.altKey)}>
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M6 3v6M3 6h6" />
          </svg>
        </button>
      </Tooltip>
    </div>
  );
}
