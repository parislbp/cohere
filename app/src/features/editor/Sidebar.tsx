/** Sidebar: three stacked sections — files, outline, outputs — each foldable and resizable. */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/icons";
import { Resizer, Tooltip } from "@/components/ui";
import { useSettingsStore } from "@/store/settings";
import { FileTree } from "./FileTree";
import { OutlinePanel } from "./OutlinePanel";
import { Outputs } from "./Outputs";

const MIN_FRACTION = 0.1;

export type SectionIndex = 0 | 1 | 2;

export function Sidebar() {
  const sections = useSettingsStore((s) => s.settings.ui.sidebarSections);
  const folded = useSettingsStore((s) => s.settings.ui.sidebarFolded);
  const setUi = useSettingsStore((s) => s.setUi);
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(600);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    setHeight(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const toggle = useCallback(
    (i: SectionIndex) => {
      const cur = useSettingsStore.getState().settings.ui.sidebarFolded;
      const next: [boolean, boolean, boolean] = [...cur] as [boolean, boolean, boolean];
      next[i] = !next[i];
      if (next.every(Boolean)) return; // keep at least one section open
      setUi({ sidebarFolded: next });
    },
    [setUi],
  );

  // Move `delta` px between section i and i+1, keeping every section above the minimum.
  const onDelta = useCallback(
    (i: 0 | 1) => (delta: number) => {
      const cur = useSettingsStore.getState().settings.ui.sidebarSections;
      const h = Math.max(1, height);
      const d = delta / h;
      const next: [number, number, number] = [...cur] as [number, number, number];
      const a = next[i];
      const b = next[i + 1];
      const moved = Math.max(-(a - MIN_FRACTION), Math.min(b - MIN_FRACTION, d));
      next[i] = a + moved;
      next[i + 1] = b - moved;
      setUi({ sidebarSections: next });
    },
    [height, setUi],
  );

  // flex-grow values below a total of 1 leave free space unused, so open sections share
  // the space in proportion to their fractions but always sum to 1.
  const openSum = sections.reduce((acc, f, i) => acc + (folded[i] ? 0 : f), 0) || 1;
  const style = (i: SectionIndex) => (folded[i] ? { flex: "none" } : { flex: `${sections[i] / openSum} 1 0` });
  const divider = (i: 0 | 1) =>
    !folded[i] && !folded[i + 1] ? (
      <Resizer direction="row" onDelta={onDelta(i)} onReset={() => setUi({ sidebarSections: [0.5, 0.25, 0.25] })} label={i === 0 ? "Resize files and outline" : "Resize outline and outputs"} />
    ) : (
      <div className="hair-h" />
    );

  return (
    <div className="sidebar" ref={ref}>
      <div className={["sect", folded[0] && "is-folded"].filter(Boolean).join(" ")} style={style(0)}>
        <FileTree folded={folded[0]} onToggle={() => toggle(0)} />
      </div>
      {divider(0)}
      <div className={["sect", folded[1] && "is-folded"].filter(Boolean).join(" ")} style={style(1)}>
        <OutlinePanel folded={folded[1]} onToggle={() => toggle(1)} />
      </div>
      {divider(1)}
      <div className={["sect", folded[2] && "is-folded"].filter(Boolean).join(" ")} style={style(2)}>
        <Outputs folded={folded[2]} onToggle={() => toggle(2)} />
      </div>
    </div>
  );
}

export interface SectionProps {
  folded: boolean;
  onToggle: () => void;
}

/** Section header: chevron + title toggle the fold; actions on the right stay clickable. */
export function SectionHead({ title, tip, folded, onToggle, badge, actions }: { title: string; tip?: ReactNode; folded: boolean; onToggle: () => void; badge?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="sect-head">
      <Tooltip content={tip ?? (folded ? `Show ${title}` : `Hide ${title}`)} side="bottom" display="block" className="grow">
        <button className="sect-head__toggle" onClick={onToggle} aria-expanded={!folded} aria-label={`${folded ? "Show" : "Hide"} ${title}`}>
          <Icon name="chevronRight" size={11} className={["sect-head__chev", !folded && "is-open"].filter(Boolean).join(" ")} />
          <span className="sect-head__title">{title}</span>
        </button>
      </Tooltip>
      {badge}
      {actions && !folded && <div className="sect-head__actions">{actions}</div>}
    </div>
  );
}
