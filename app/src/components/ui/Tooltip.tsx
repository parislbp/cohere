/**
 * Tooltip system. One portal layer at the maximum z-index; placement always floats toward
 * the viewport centre (see lib/placement). Wrap any element:
 *
 *   <Tooltip content="Compile" kbd="Mod-Shift-Enter"><button …/></Tooltip>
 *
 * Global on/off and delay come from the settings store.
 */
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { place, type Side } from "@/lib/placement";
import { shortcutLabel } from "@/lib/keys";
import { useSettingsStore } from "@/store/settings";

interface TipRequest {
  id: number;
  anchor: HTMLElement;
  content: ReactNode;
  kbd?: string;
  hint?: string;
  side: Side | "auto";
  wide: boolean;
}

interface TooltipCtx {
  show: (req: Omit<TipRequest, "id">) => number;
  hide: (id: number) => void;
  enabled: boolean;
  delay: number;
}

const Ctx = createContext<TooltipCtx | null>(null);

export function TooltipProvider({ children }: { children: ReactNode }) {
  const enabled = useSettingsStore((s) => s.settings.tooltips);
  const delay = useSettingsStore((s) => s.settings.tooltipDelayMs);
  const [active, setActive] = useState<TipRequest | null>(null);
  const seq = useRef(0);

  const show = useCallback((req: Omit<TipRequest, "id">) => {
    const id = ++seq.current;
    setActive({ ...req, id });
    return id;
  }, []);
  const hide = useCallback((id: number) => {
    setActive((cur) => (cur && cur.id === id ? null : cur));
  }, []);

  useEffect(() => {
    if (!active) return;
    const off = () => setActive(null);
    window.addEventListener("scroll", off, true);
    window.addEventListener("resize", off);
    window.addEventListener("keydown", off);
    window.addEventListener("mousedown", off);
    return () => {
      window.removeEventListener("scroll", off, true);
      window.removeEventListener("resize", off);
      window.removeEventListener("keydown", off);
      window.removeEventListener("mousedown", off);
    };
  }, [active]);

  const value = useMemo(() => ({ show, hide, enabled, delay }), [show, hide, enabled, delay]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {active && <TipLayer req={active} />}
    </Ctx.Provider>
  );
}

function TipLayer({ req }: { req: TipRequest }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; side: Side } | null>(null);
  const [visible, setVisible] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!req.anchor.isConnected) return;
    const a = req.anchor.getBoundingClientRect();
    const size = { width: el.offsetWidth, height: el.offsetHeight };
    const p = place({ left: a.left, top: a.top, width: a.width, height: a.height }, size, { width: window.innerWidth, height: window.innerHeight }, { side: req.side, offset: 7 });
    setPos(p);
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, [req]);

  const layer = document.getElementById("layer-tooltips") ?? document.body;
  const dy = pos?.side === "top" ? "-3px" : "3px";
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className={`tooltip${req.wide ? " tooltip--wide" : ""}${visible ? " is-visible" : ""}`}
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? -9999, ["--tip-dy" as string]: dy }}
      data-side={pos?.side}
    >
      <span>
        {req.content}
        {req.hint && <div className="tooltip__hint">{req.hint}</div>}
      </span>
      {req.kbd && <kbd className="kbd tooltip__kbd">{shortcutLabel(req.kbd)}</kbd>}
    </div>,
    layer,
  );
}

export interface TooltipProps {
  content: ReactNode;
  /** Shortcut spec, rendered as a kbd chip: "Mod-Shift-Enter". */
  kbd?: string;
  /** Second, dimmer line. */
  hint?: string;
  side?: Side | "auto";
  wide?: boolean;
  /** Wrapper display; use "block" for full-width rows. */
  display?: "inline" | "block" | "contents";
  disabled?: boolean;
  delay?: number;
  className?: string;
  children: ReactNode;
}

export function Tooltip({ content, kbd, hint, side = "auto", wide = false, display = "inline", disabled = false, delay, className, children }: TooltipProps) {
  const ctx = useContext(Ctx);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | null>(null);
  const idRef = useRef<number | null>(null);

  const clear = useCallback(() => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    if (idRef.current != null && ctx) {
      ctx.hide(idRef.current);
      idRef.current = null;
    }
  }, [ctx]);

  const arm = useCallback(
    (immediate = false) => {
      if (!ctx || !ctx.enabled || disabled || content == null || content === "") return;
      const el = wrapRef.current;
      if (!el) return;
      clear();
      const wait = immediate ? 0 : delay ?? ctx.delay;
      timer.current = window.setTimeout(() => {
        const anchor = (el.firstElementChild as HTMLElement | null) ?? el;
        idRef.current = ctx.show({ anchor, content, kbd, hint, side, wide });
      }, wait);
    },
    [ctx, disabled, content, kbd, hint, side, wide, delay, clear],
  );

  useEffect(() => clear, [clear]);

  const style = display === "block" ? { display: "flex", minWidth: 0 } : display === "contents" ? { display: "contents" } : { display: "inline-flex" };
  return (
    <span
      ref={wrapRef}
      className={className}
      style={style}
      onMouseEnter={() => arm()}
      onMouseLeave={clear}
      onFocus={() => arm(true)}
      onBlur={clear}
      onMouseDown={clear}
    >
      {children}
    </span>
  );
}

/** A small info glyph that carries a tooltip — for places where text would be bloat. */
export function InfoTip({ content, wide }: { content: ReactNode; wide?: boolean }) {
  return (
    <Tooltip content={content} wide={wide}>
      <span className="infotip" aria-label="info" tabIndex={0}>
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="10" cy="10" r="7.25" />
          <path d="M10 9v4.5" />
          <circle cx="10" cy="6.5" r="0.4" fill="currentColor" />
        </svg>
      </span>
    </Tooltip>
  );
}
