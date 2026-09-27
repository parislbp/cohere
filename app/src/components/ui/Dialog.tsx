/** Modal dialog in the overlay layer: scrim, Escape/click-out to close, focus moves inside. */
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./Button";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: "narrow" | "default" | "wide";
  closeOnScrim?: boolean;
  /** Called on Enter inside the dialog (not in textareas). */
  onSubmit?: () => void;
  className?: string;
  testId?: string;
}

const stack: symbol[] = [];

export function Dialog({ open, onClose, title, children, footer, width = "default", closeOnScrim = true, onSubmit, className, testId }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const token = useRef(Symbol("dialog"));
  // Callbacks live in refs so the open/close effect never re-runs on re-render
  // (re-running it would move focus around while the user is typing).
  const onCloseRef = useRef(onClose);
  const onSubmitRef = useRef(onSubmit);
  onCloseRef.current = onClose;
  onSubmitRef.current = onSubmit;

  useEffect(() => {
    if (!open) return;
    const me = token.current;
    stack.push(me);
    const previous = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelector<HTMLElement>("[data-autofocus], input, textarea, select, button:not([data-no-autofocus])");
      focusable?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (stack[stack.length - 1] !== me) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === "Enter" && onSubmitRef.current && !(e.target instanceof HTMLTextAreaElement) && !e.metaKey && !e.ctrlKey) {
        const t = e.target as HTMLElement;
        if (t.tagName === "BUTTON") return;
        e.preventDefault();
        onSubmitRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey, true);
      const i = stack.indexOf(me);
      if (i >= 0) stack.splice(i, 1);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  const layer = document.getElementById("layer-overlays") ?? document.body;
  return createPortal(
    <div
      className="scrim"
      onMouseDown={(e) => {
        if (closeOnScrim && e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} role="dialog" aria-modal="true" className={["dialog", width !== "default" && `dialog--${width}`, className].filter(Boolean).join(" ")} data-testid={testId}>
        {title !== undefined && (
          <div className="dialog__head">
            <div className="dialog__title">{title}</div>
            <IconButton icon="close" label="Close" kbd="Escape" size="sm" onClick={onClose} data-no-autofocus />
          </div>
        )}
        <div className="dialog__body">{children}</div>
        {footer && <div className="dialog__foot">{footer}</div>}
      </div>
    </div>,
    layer,
  );
}
