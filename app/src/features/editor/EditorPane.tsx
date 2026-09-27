/** Source column: tabs · editor (or image preview) · problems drawer · status line. */
import { useEffect, useMemo, useState } from "react";
import * as api from "@/api";
import { Icon } from "@/components/icons";
import { EmptyState, IconButton, Resizer, Tooltip } from "@/components/ui";
import { basename, clamp, formatRelative } from "@/lib/format";
import { SHORTCUTS } from "@/lib/keys";
import { useProjectStore } from "@/store/project";
import { useSettingsStore } from "@/store/settings";
import { TexEditor } from "./TexEditor";
import { ProblemsPanel } from "./ProblemsPanel";

export function EditorPane() {
  const openPaths = useProjectStore((s) => s.openPaths);
  const activePath = useProjectStore((s) => s.activePath);
  const buffers = useProjectStore((s) => s.buffers);
  const setActive = useProjectStore((s) => s.setActive);
  const closeFile = useProjectStore((s) => s.closeFile);
  const problemsOpen = useSettingsStore((s) => s.settings.ui.problemsOpen);
  const statusLine = useSettingsStore((s) => s.settings.ui.statusLine);
  const sidebarCollapsed = useSettingsStore((s) => s.settings.ui.sidebarCollapsed);
  const fontSize = useSettingsStore((s) => s.settings.editor.fontSize);
  const setUi = useSettingsStore((s) => s.setUi);
  const setEditor = useSettingsStore((s) => s.setEditor);
  const [problemsH, setProblemsH] = useState(220);

  const active = activePath ? buffers[activePath] : undefined;
  const anyDirty = useMemo(() => Object.values(buffers).some((b) => b.dirty), [buffers]);
  const anySaving = useMemo(() => Object.values(buffers).some((b) => b.saving), [buffers]);
  const lastSaved = useMemo(() => Math.max(0, ...Object.values(buffers).map((b) => b.savedAt ?? 0)), [buffers]);

  return (
    <div className="source">
      <div className="tabs" role="tablist">
        {openPaths.map((p) => {
          const b = buffers[p];
          const isActive = p === activePath;
          return (
            <Tooltip key={p} content={p} side="bottom" display="contents">
              <div role="tab" aria-selected={isActive} className={["tab", isActive && "is-active", b?.dirty && "is-dirty"].filter(Boolean).join(" ")} onClick={() => setActive(p)} onAuxClick={(e) => e.button === 1 && closeFile(p)} data-testid="tab">
                <span className="tab__name">{basename(p)}</span>
                {b?.dirty ? <span className="tab__dot" aria-label="unsaved" /> : null}
                <IconButton
                  icon="close"
                  label="Close"
                  kbd={SHORTCUTS.closeTab}
                  size="sm"
                  className="tab__close"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeFile(p);
                  }}
                />
              </div>
            </Tooltip>
          );
        })}
        <div className="tabs__spacer" />
        <div className="tabs__save" aria-live="polite">
          {anySaving ? (
            <>
              <Icon name="spinner" size={11} className="ch-icon--spin" /> saving
            </>
          ) : anyDirty ? (
            <span>unsaved</span>
          ) : lastSaved ? (
            <>
              <Icon name="check" size={11} /> saved {formatRelative(new Date(lastSaved))}
            </>
          ) : null}
        </div>
        <div className="tabs__tools">
          <IconButton icon="zoomOut" label="Smaller editor text" kbd={SHORTCUTS.fontDown} size="sm" onClick={() => setEditor({ fontSize: clamp(fontSize - 1, 9, 32) })} disabled={fontSize <= 9} />
          <Tooltip content="Editor text size — click for the default" side="bottom">
            <button className="tabs__size tnum" onClick={() => setEditor({ fontSize: 12 })}>
              {fontSize}
            </button>
          </Tooltip>
          <IconButton icon="zoomIn" label="Larger editor text" kbd={SHORTCUTS.fontUp} size="sm" onClick={() => setEditor({ fontSize: clamp(fontSize + 1, 9, 32) })} disabled={fontSize >= 32} />
          <span className="hair-v" style={{ height: 14, margin: "0 4px" }} />
          <IconButton icon={sidebarCollapsed ? "panelLeftExpand" : "panelLeftCollapse"} label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"} kbd={SHORTCUTS.sidebar} size="sm" onClick={() => setUi({ sidebarCollapsed: !sidebarCollapsed })} />
        </div>
      </div>

      {!activePath ? (
        <div className="source__empty">
          <EmptyState icon="fileTex" title="Open a file">
            Pick one from the files list.
          </EmptyState>
        </div>
      ) : active?.binary ? (
        <BinaryPreview path={activePath} image={active.image} />
      ) : (
        <TexEditor />
      )}

      {problemsOpen && (
        <>
          <Resizer direction="row" onDelta={(d) => setProblemsH((h) => clamp(h - d, 100, 600))} onReset={() => setProblemsH(220)} label="Resize problems panel" />
          <ProblemsPanel height={problemsH} onClose={() => setUi({ problemsOpen: false })} />
        </>
      )}
      {statusLine && <StatusLine />}
    </div>
  );
}

function BinaryPreview({ path, image }: { path: string; image: boolean }) {
  const projectId = useProjectStore((s) => s.projectId);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!projectId || !image) return;
    let objectUrl: string | null = null;
    api.files
      .readBytes(projectId, path)
      .then((bytes) => {
        const ext = path.split(".").pop()?.toLowerCase() ?? "png";
        const mime = ext === "svg" ? "image/svg+xml" : ext === "jpg" ? "image/jpeg" : `image/${ext}`;
        objectUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
        setUrl(objectUrl);
      })
      .catch(() => setUrl(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [projectId, path, image]);
  return (
    <div className="source__preview">
      {image ? url ? <img src={url} alt={basename(path)} /> : <EmptyState title="Loading image…" /> : <EmptyState icon="file" title={basename(path)}>Binary file — no preview.</EmptyState>}
    </div>
  );
}

function StatusLine() {
  const cursorLine = useProjectStore((s) => s.cursorLine);
  const activePath = useProjectStore((s) => s.activePath);
  const text = useProjectStore((s) => (s.activePath ? s.buffers[s.activePath]?.text ?? "" : ""));
  const diagnostics = useProjectStore((s) => s.diagnostics);
  const problemsOpen = useSettingsStore((s) => s.settings.ui.problemsOpen);
  const setUi = useSettingsStore((s) => s.setUi);
  const project = useProjectStore((s) => s.project);
  const engine = useSettingsStore((s) => s.settings.engine);

  const words = useMemo(() => countWords(text), [text]);
  const errs = diagnostics.filter((d) => d.severity === "error").length;
  const warns = diagnostics.filter((d) => d.severity === "warning").length;

  return (
    <div className="statusline">
      <Tooltip content="Problems from the last compile" kbd={SHORTCUTS.problems} side="top">
        <button className={["statusline__item", errs && "is-err", !errs && warns && "is-warn"].filter(Boolean).join(" ")} onClick={() => setUi({ problemsOpen: !problemsOpen })} data-testid="problems-toggle">
          <Icon name={errs ? "error" : warns ? "warning" : "success"} size={12} />
          {errs} · {warns}
        </button>
      </Tooltip>
      <span className="statusline__spacer" />
      {activePath && (
        <>
          <Tooltip content="Cursor line" side="top">
            <span className="statusline__item">ln {cursorLine}</span>
          </Tooltip>
          <Tooltip content="Words in this file (approximate; commands excluded)" side="top">
            <span className="statusline__item">{words} w</span>
          </Tooltip>
        </>
      )}
      <Tooltip content={`Compiles ${project?.mainFile ?? "main.tex"} with ${project?.engine ?? engine}`} side="top">
        <span className="statusline__item">{project?.engine ?? engine}</span>
      </Tooltip>
    </div>
  );
}

/** Rough prose word count: strip comments, commands and math. */
export function countWords(text: string): number {
  const stripped = text
    .replace(/(^|[^\\])%.*$/gm, "$1")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]*\$/g, " ")
    .replace(/\\\[[\s\S]*?\\\]/g, " ")
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?/g, " ")
    .replace(/[{}[\]&~^_\\]/g, " ");
  const words = stripped.match(/[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'’-]*/g);
  return words ? words.length : 0;
}
