/** ⌘K — a searchable list of every command with its shortcut. Arrow keys move, Enter runs, Esc closes. */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/icons";
import { Kbd } from "@/components/ui";
import { buildCommands, filterCommands, GROUP_LABEL, type Command } from "./commands";
import "./palette.css";

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [all, setAll] = useState<Command[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setAll(buildCommands());
    setQuery("");
    setIndex(0);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const shown = useMemo(() => filterCommands(all, query).slice(0, 60), [all, query]);
  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [index]);

  if (!open) return null;

  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    void c.run();
  };

  const layer = document.getElementById("layer-overlays") ?? document.body;
  let lastGroup: string | null = null;
  return createPortal(
    <div className="scrim palette__scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Commands" data-testid="command-palette">
        <div className="palette__search">
          <Icon name="command" size={15} />
          <input
            ref={inputRef}
            className="palette__input"
            placeholder="type a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(shown.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                run(shown[index]);
              } else if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
            aria-label="Search commands"
            aria-activedescendant={shown[index] ? `cmd-${shown[index].id}` : undefined}
            spellCheck={false}
            autoComplete="off"
          />
          <Kbd spec="Escape" />
        </div>
        <div className="palette__list" ref={listRef} role="listbox">
          {shown.length === 0 && <div className="palette__empty">nothing matches “{query}”</div>}
          {shown.map((c, i) => {
            const header = !query && c.group !== lastGroup ? GROUP_LABEL[c.group] : null;
            lastGroup = c.group;
            return (
              <div key={c.id}>
                {header && <div className="palette__group">{header}</div>}
                <button
                  id={`cmd-${c.id}`}
                  role="option"
                  aria-selected={i === index}
                  data-index={i}
                  className={["palette__item", i === index && "is-active"].filter(Boolean).join(" ")}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => run(c)}
                >
                  <span className="palette__icon">{c.icon ? <Icon name={c.icon} size={14} /> : null}</span>
                  <span className="palette__title">{c.title}</span>
                  {c.state && <span className="palette__state">{c.state}</span>}
                  {c.kbd && <Kbd spec={c.kbd} />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    layer,
  );
}
