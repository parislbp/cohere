/**
 * Outline panel. Two scopes: the active file's headings, or the whole document — the
 * main file with every `\input`/`\include` spliced in, so multi-file books read as one.
 * The current item follows the cursor; clicking jumps (opening the file if needed).
 */
import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Icon } from "@/components/icons";
import { EmptyState, IconButton, Tooltip } from "@/components/ui";
import { basename, plural } from "@/lib/format";
import { SHORTCUTS } from "@/lib/keys";
import { flattenTree, useProjectStore, type Buffer } from "@/store/project";
import { outlineItemAtLine, parseOutline, type OutlineItem } from "./outline";
import { buildProjectOutline, makeSource, projectItemAtCursor, type MissingInput, type ProjectOutlineItem } from "./projectOutline";
import { SectionHead, type SectionProps } from "./Sidebar";
import "./outline.css";

const KIND_ABBR: Record<OutlineItem["kind"], string> = {
  part: "part",
  chapter: "ch",
  section: "§",
  subsection: "§§",
  subsubsection: "§§§",
  paragraph: "¶",
  subparagraph: "¶¶",
};

interface ProjectOutlineState {
  items: ProjectOutlineItem[];
  missing: MissingInput[];
  ready: boolean;
}

const EMPTY_PROJECT: ProjectOutlineState = { items: [], missing: [], ready: false };

function fileBadge(path: string): string {
  return basename(path).replace(/\.tex$/i, "");
}

/** Builds the whole-document outline, debounced, with disk reads cached until the tree or open-file set changes. */
function useProjectOutline(enabled: boolean, projectId: string | null, mainFile: string | null, buffers: Record<string, Buffer>, treeKey: string, existsRef: MutableRefObject<(p: string) => boolean>): ProjectOutlineState {
  const [state, setState] = useState<ProjectOutlineState>(EMPTY_PROJECT);
  const cache = useRef(new Map<string, Promise<string | null>>());
  const bufferKeys = Object.keys(buffers).sort().join("\n");

  useEffect(() => {
    cache.current = new Map();
  }, [projectId, treeKey, bufferKeys]);

  useEffect(() => {
    if (!enabled || !projectId || !mainFile) {
      setState(EMPTY_PROJECT);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void buildProjectOutline(mainFile, makeSource(projectId, buffers, cache.current), existsRef.current).then((res) => {
        if (!cancelled) setState({ items: res.items, missing: res.missing, ready: true });
      });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [enabled, projectId, mainFile, buffers, treeKey, existsRef]);

  return state;
}

export function OutlinePanel({ folded, onToggle }: SectionProps) {
  const projectId = useProjectStore((s) => s.projectId);
  const mainFile = useProjectStore((s) => s.project?.mainFile ?? null);
  const tree = useProjectStore((s) => s.tree);
  const buffers = useProjectStore((s) => s.buffers);
  const activePath = useProjectStore((s) => s.activePath);
  const text = useProjectStore((s) => (s.activePath ? s.buffers[s.activePath]?.text ?? "" : ""));
  const cursorLine = useProjectStore((s) => s.cursorLine);
  const jumpTo = useProjectStore((s) => s.jumpTo);
  const scope = useProjectStore((s) => s.outlineScope);
  const toggleOutlineScope = useProjectStore((s) => s.toggleOutlineScope);
  const projectScope = scope === "project";

  // ── file scope: re-parse shortly after typing stops ──
  const [fileItems, setFileItems] = useState<OutlineItem[]>([]);
  useEffect(() => {
    if (projectScope) return;
    const t = window.setTimeout(() => setFileItems(parseOutline(text)), 180);
    return () => window.clearTimeout(t);
  }, [text, projectScope]);

  // ── project scope ──
  const filePaths = useMemo(() => new Set(flattenTree(tree).filter((n) => n.kind === "file").map((n) => n.path)), [tree]);
  const treeKey = useMemo(() => [...filePaths].sort().join("\n"), [filePaths]);
  const existsRef = useRef<(p: string) => boolean>(() => false);
  existsRef.current = (p) => filePaths.has(p) || p in buffers;
  const project = useProjectOutline(projectScope, projectId, mainFile, buffers, treeKey, existsRef);

  const items: readonly (OutlineItem | ProjectOutlineItem)[] = projectScope ? project.items : fileItems;
  const current = useMemo(
    () => (projectScope ? projectItemAtCursor(project.items, activePath, cursorLine) : outlineItemAtLine(fileItems, cursorLine)),
    [projectScope, project.items, fileItems, activePath, cursorLine],
  );
  const minLevel = useMemo(() => (items.length ? Math.min(...items.map((i) => i.level)) : 0), [items]);

  const tip = folded
    ? "Show outline"
    : projectScope
      ? mainFile
        ? `Whole document from ${basename(mainFile)} · click to fold`
        : "Whole document"
      : activePath
        ? `Sections in ${basename(activePath)} · click to fold`
        : "Sections of the open file";

  const scopeAction = (
    <IconButton
      icon="book"
      size="sm"
      on={projectScope}
      label={projectScope ? "This file only" : "Whole document"}
      kbd={SHORTCUTS.outlineScope}
      hint={mainFile ? `follows \\input from ${basename(mainFile)}` : "follows \\input from the main file"}
      onClick={toggleOutlineScope}
    />
  );

  const body = () => {
    if (projectScope) {
      if (!mainFile) return <EmptyState icon="book" title="No main file">Set a main file to outline the whole document.</EmptyState>;
      if (!project.ready) return null;
      if (project.items.length === 0) {
        return (
          <EmptyState icon="outline" title="No sections yet">
            \section, \chapter and friends in {basename(mainFile)} and its inputs appear here.
          </EmptyState>
        );
      }
    } else {
      if (!activePath) return <EmptyState title="No file open" />;
      if (fileItems.length === 0) {
        return (
          <EmptyState icon="outline" title="No sections yet">
            \section, \chapter and friends appear here.
          </EmptyState>
        );
      }
    }
    let prevFile: string | null = null;
    return (
      <>
        <div className="outline" role="tree" aria-label="Outline">
          {items.map((it) => {
            const file = "file" in it ? it.file : activePath;
            const showFile = projectScope && file !== null && file !== prevFile;
            prevFile = file;
            return (
              <button
                key={it.id}
                role="treeitem"
                className={["onode", `onode--${Math.max(0, it.level)}`, it.kind === "part" && "onode--part", current?.id === it.id && "is-current"].filter(Boolean).join(" ")}
                style={{ ["--depth" as string]: Math.max(0, it.level - minLevel) }}
                onClick={() => file && void jumpTo(file, it.line)}
                title={`${projectScope && file ? `${file}:` : "line "}${it.line}${it.label ? ` · \\label{${it.label}}` : ""}`}
              >
                <span className="onode__kind">{it.appendix && it.kind === "chapter" ? "app" : KIND_ABBR[it.kind]}</span>
                <span className="onode__title">{it.title || <span className="muted">(untitled)</span>}</span>
                {showFile && file && <span className="onode__file">{fileBadge(file)}</span>}
                {it.starred && <Icon name="hash" size={10} className="onode__star" />}
              </button>
            );
          })}
        </div>
        {projectScope && project.missing.length > 0 && (
          <Tooltip
            content={project.missing.map((m, i) => (
              <div key={i}>{`${m.from}:${m.line} → ${m.raw}`}</div>
            ))}
            side="top"
            display="block"
            wide
          >
            <div className="outline__missing">{plural(project.missing.length, "input", "inputs")} not found</div>
          </Tooltip>
        )}
      </>
    );
  };

  return (
    <>
      <SectionHead
        title="outline"
        tip={tip}
        folded={folded}
        onToggle={onToggle}
        badge={items.length > 0 && !folded ? <span className="badge">{items.length}</span> : undefined}
        actions={scopeAction}
      />
      {!folded && <div className="sect__body">{body()}</div>}
    </>
  );
}
