/** Editor: [sidebar | editor | pdf] with draggable dividers; the sidebar collapses to zero. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Resizer } from "@/components/ui";
import { matchesShortcut, SHORTCUTS } from "@/lib/keys";
import { clamp } from "@/lib/format";
import { useProjectStore } from "@/store/project";
import { useSettingsStore } from "@/store/settings";
import { Sidebar } from "./Sidebar";
import { EditorPane } from "./EditorPane";
import { PdfPane } from "./PdfPane";
import "./editor.css";

export function EditorView() {
  const ui = useSettingsStore((s) => s.settings.ui);
  const setUi = useSettingsStore((s) => s.setUi);
  const loading = useProjectStore((s) => s.loading);
  const compile = useProjectStore((s) => s.compile);
  const saveAll = useProjectStore((s) => s.saveAll);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const inEditor = (e: KeyboardEvent) => (e.target as HTMLElement | null)?.closest?.(".cm-editor") != null;
    const toggleSidebar = () => setUi({ sidebarCollapsed: !useSettingsStore.getState().settings.ui.sidebarCollapsed });
    const onKey = (e: KeyboardEvent) => {
      // CodeMirror (and any other focused widget) claims its own keys by calling preventDefault;
      // the event still bubbles here, so respect that instead of double-handling.
      if (e.defaultPrevented) return;
      if (matchesShortcut(e, SHORTCUTS.compile)) {
        e.preventDefault();
        void compile();
      } else if (matchesShortcut(e, SHORTCUTS.save)) {
        e.preventDefault();
        void saveAll();
      } else if (matchesShortcut(e, SHORTCUTS.sidebar)) {
        e.preventDefault();
        toggleSidebar();
      } else if (matchesShortcut(e, SHORTCUTS.sidebarArrow) && !inEditor(e)) {
        // ⌥← keeps its word-jump meaning inside the editor; elsewhere it toggles the sidebar
        e.preventDefault();
        toggleSidebar();
      } else if (matchesShortcut(e, SHORTCUTS.gutter)) {
        e.preventDefault();
        const st = useSettingsStore.getState();
        st.setEditor({ lineNumbers: !st.settings.editor.lineNumbers });
      } else if (matchesShortcut(e, SHORTCUTS.fontUp) || matchesShortcut(e, SHORTCUTS.fontDown)) {
        e.preventDefault();
        const st = useSettingsStore.getState();
        const d = matchesShortcut(e, SHORTCUTS.fontUp) ? 1 : -1;
        st.setEditor({ fontSize: clamp(st.settings.editor.fontSize + d, 9, 32) });
      } else if (matchesShortcut(e, SHORTCUTS.problems)) {
        e.preventDefault();
        setUi({ problemsOpen: !useSettingsStore.getState().settings.ui.problemsOpen });
      } else if (matchesShortcut(e, SHORTCUTS.outlineScope)) {
        e.preventDefault();
        useProjectStore.getState().toggleOutlineScope();
      }
    };
    // Status-line toggles run in the capture phase so CodeMirror's own ⌘⇧↓ / ⌥↓ bindings never see them.
    const onKeyCapture = (e: KeyboardEvent) => {
      if (matchesShortcut(e, SHORTCUTS.statusLine) || matchesShortcut(e, SHORTCUTS.statusLineAlt)) {
        e.preventDefault();
        e.stopPropagation();
        setUi({ statusLine: !useSettingsStore.getState().settings.ui.statusLine });
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keydown", onKeyCapture, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keydown", onKeyCapture, true);
    };
  }, [compile, saveAll, setUi]);

  const sidebarW = ui.sidebarCollapsed ? 0 : ui.sidebarWidth;
  const rest = Math.max(0, width - sidebarW);
  const editorW = Math.round(rest * ui.editorFraction);

  const onSidebarDelta = useCallback(
    (d: number) => {
      const s = useSettingsStore.getState().settings.ui;
      if (s.sidebarCollapsed) return;
      setUi({ sidebarWidth: clamp(s.sidebarWidth + d, 180, 560) });
    },
    [setUi],
  );
  const onSplitDelta = useCallback(
    (d: number) => {
      const s = useSettingsStore.getState().settings.ui;
      const sw = s.sidebarCollapsed ? 0 : s.sidebarWidth;
      const avail = Math.max(1, (wrapRef.current?.clientWidth ?? width) - sw);
      setUi({ editorFraction: clamp(s.editorFraction + d / avail, 0.2, 0.8) });
    },
    [setUi, width],
  );

  return (
    <div className={["editor", ui.sidebarCollapsed && "is-sidebar-collapsed", loading && "is-loading"].filter(Boolean).join(" ")} ref={wrapRef}>
      <aside className="editor__sidebar" style={{ width: sidebarW }} aria-hidden={ui.sidebarCollapsed}>
        <div className="editor__sidebar-inner" style={{ width: ui.sidebarWidth }}>
          <Sidebar />
        </div>
      </aside>
      {!ui.sidebarCollapsed && <Resizer direction="col" onDelta={onSidebarDelta} onReset={() => setUi({ sidebarWidth: 260 })} label="Resize sidebar" />}
      <section className="editor__pane editor__pane--source" style={{ width: editorW }}>
        <EditorPane />
      </section>
      <Resizer direction="col" onDelta={onSplitDelta} onReset={() => setUi({ editorFraction: 0.5 })} label="Resize editor and PDF" />
      <section className="editor__pane editor__pane--pdf">
        <PdfPane />
      </section>
    </div>
  );
}
