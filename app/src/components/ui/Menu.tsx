/** Anchored popover menu. Positioned toward the viewport centre; closes on outside click / Escape. */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "@/components/icons";
import { place, type Side } from "@/lib/placement";
import { shortcutLabel } from "@/lib/keys";

export interface MenuItem {
  id: string;
  label: ReactNode;
  icon?: IconName;
  kbd?: string;
  meta?: string;
  danger?: boolean;
  disabled?: boolean;
  on?: boolean;
  onSelect?: () => void;
}

export type MenuEntry = MenuItem | { sep: true } | { title: string };

export interface MenuProps {
  open: boolean;
  onClose: () => void;
  /** Anchor element or a fixed point (context menus). */
  anchor: HTMLElement | { x: number; y: number } | null;
  items: MenuEntry[];
  side?: Side | "auto";
  align?: "start" | "center" | "end";
  minWidth?: number;
}

export function Menu({ open, onClose, anchor, items, side = "auto", align = "start", minWidth }: MenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; side: Side } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const el = ref.current;
    if (!el) return;
    const rect = anchor instanceof HTMLElement ? anchor.getBoundingClientRect() : { left: anchor.x, top: anchor.y, width: 0, height: 0 };
    const p = place({ left: rect.left, top: rect.top, width: rect.width, height: rect.height }, { width: el.offsetWidth, height: el.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }, {
      side,
      align,
      offset: anchor instanceof HTMLElement ? 6 : 2,
    });
    setPos(p);
  }, [open, anchor, side, align, items.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const onScroll = () => onClose();
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setPos(null);
  }, [open]);

  if (!open || !anchor) return null;
  const layer = document.getElementById("layer-overlays") ?? document.body;
  return createPortal(
    <div
      ref={ref}
      role="menu"
      className="menu"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, minWidth, ["--menu-origin" as string]: pos?.side === "top" ? "bottom center" : "top center" }}
    >
      {items.map((it, i) => {
        if ("sep" in it) return <div key={`sep-${i}`} className="menu__sep" />;
        if ("title" in it) return <div key={`t-${i}`} className="menu__title">{it.title}</div>;
        return (
          <button
            key={it.id}
            role="menuitem"
            className={["menu__item", it.danger && "menu__item--danger", it.on && "is-on"].filter(Boolean).join(" ")}
            disabled={it.disabled}
            onClick={() => {
              it.onSelect?.();
              onClose();
            }}
          >
            {it.icon ? <Icon name={it.icon} size={15} /> : <span style={{ width: 15 }} />}
            <span className="menu__item__label">{it.label}</span>
            {it.meta && <span className="menu__item__meta">{it.meta}</span>}
            {it.kbd && <kbd className="kbd">{shortcutLabel(it.kbd)}</kbd>}
            {it.on && <Icon name="check" size={13} />}
          </button>
        );
      })}
    </div>,
    layer,
  );
}

/** Hook for the common "button opens a menu" case. */
export function useMenu() {
  const [anchor, setAnchor] = useState<HTMLElement | { x: number; y: number } | null>(null);
  return {
    open: anchor !== null,
    anchor,
    openAt: (a: HTMLElement | { x: number; y: number }) => setAnchor(a),
    toggle: (el: HTMLElement) => setAnchor((cur) => (cur ? null : el)),
    close: () => setAnchor(null),
  };
}
