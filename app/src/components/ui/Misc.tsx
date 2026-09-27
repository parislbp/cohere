/** Toasts, Pager, Resizer, EmptyState, GradientText, Kbd. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { useUiStore } from "@/store/ui";
import { shortcutLabel } from "@/lib/keys";
import { IconButton } from "./Button";

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  if (toasts.length === 0) return null;
  const icon: Record<string, IconName> = { ok: "success", err: "error", info: "info" };
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.kind}`} role="status">
          <Icon name={icon[t.kind]} size={15} />
          <span className="truncate" style={{ maxWidth: 380 }}>
            {t.message}
          </span>
          {t.action && (
            <button
              className="toast__action"
              onClick={() => {
                t.action?.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <IconButton icon="close" label="Dismiss" size="sm" onClick={() => dismiss(t.id)} />
        </div>
      ))}
    </div>
  );
}

export function Pager({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="pager" role="navigation" aria-label="pages">
      <IconButton icon="chevronLeft" label="Previous page" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)} />
      <span className="pager__num">
        <b>{page}</b> / {pages}
      </span>
      <IconButton icon="chevronRight" label="Next page" size="sm" disabled={page >= pages} onClick={() => onChange(page + 1)} />
    </div>
  );
}

export interface ResizerProps {
  direction: "col" | "row";
  /** Called with the pointer delta since the previous call. */
  onDelta: (delta: number) => void;
  onEnd?: () => void;
  onReset?: () => void;
  label?: string;
}

export function Resizer({ direction, onDelta, onEnd, onReset, label }: ResizerProps) {
  const [dragging, setDragging] = useState(false);
  const last = useRef(0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      last.current = direction === "col" ? e.clientX : e.clientY;
      setDragging(true);
      document.body.classList.add(direction === "col" ? "is-resizing-col" : "is-resizing-row");
    },
    [direction],
  );
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const cur = direction === "col" ? e.clientX : e.clientY;
      const d = cur - last.current;
      if (d !== 0) {
        last.current = cur;
        onDelta(d);
      }
    },
    [dragging, direction, onDelta],
  );
  const stop = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    document.body.classList.remove("is-resizing-col", "is-resizing-row");
    onEnd?.();
  }, [dragging, onEnd]);

  useEffect(() => () => document.body.classList.remove("is-resizing-col", "is-resizing-row"), []);

  return (
    <div
      role="separator"
      aria-orientation={direction === "col" ? "vertical" : "horizontal"}
      aria-label={label ?? "Resize"}
      className={["resizer", `resizer--${direction}`, dragging && "is-dragging"].filter(Boolean).join(" ")}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onDoubleClick={onReset}
    />
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: IconName; title: ReactNode; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty anim-fade">
      {icon && <Icon name={icon} size={26} strokeWidth={1.2} />}
      <div className="empty__title serif">{title}</div>
      {children && <div>{children}</div>}
      {action && <div style={{ marginTop: 6 }}>{action}</div>}
    </div>
  );
}

export function GradientText({ children, className, as: Tag = "span" }: { children: ReactNode; className?: string; as?: "span" | "h1" | "h2" | "div" }) {
  return <Tag className={["gradient-text", className].filter(Boolean).join(" ")}>{children}</Tag>;
}

export function Kbd({ spec }: { spec: string }) {
  return <kbd className="kbd">{shortcutLabel(spec)}</kbd>;
}

export function Spinner({ size = 14 }: { size?: number }) {
  return <Icon name="spinner" size={size} className="ch-icon--spin" />;
}
