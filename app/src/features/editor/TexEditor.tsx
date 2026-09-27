/**
 * The CodeMirror host. One EditorView; one EditorState per open file (undo history and scroll
 * survive tab switches). Settings are live via compartments. Diagnostics come from the store.
 */
import { useEffect, useMemo, useRef } from "react";
import { EditorState, Compartment, type Extension } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, dropCursor, highlightSpecialChars, rectangularSelection, crosshairCursor, scrollPastEnd } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit } from "@codemirror/language";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { useProjectStore } from "@/store/project";
import { useSettingsStore } from "@/store/settings";
import { latex } from "./codemirror/latexLanguage";
import { latexCompletionSource, latexEnvironmentKeymap } from "./codemirror/latexCompletions";
import { snippetPaletteSource } from "./codemirror/snippets";
import { formattingKeymap, wrapCommand } from "./codemirror/formatting";
import { applyDiagnostics, diagnosticsExtension } from "./codemirror/diagnostics";
import { editorTheme } from "./codemirror/editorTheme";
import { useCompletionData } from "./completionData";

interface FileState {
  state: EditorState;
  scrollTop: number;
}

export function TexEditor() {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const statesRef = useRef<Map<string, FileState>>(new Map());
  const currentPath = useRef<string | null>(null);
  const suppress = useRef(false);

  const activePath = useProjectStore((s) => s.activePath);
  const bufferText = useProjectStore((s) => (s.activePath ? s.buffers[s.activePath]?.text : undefined));
  const diagnostics = useProjectStore((s) => s.diagnostics);
  const jump = useProjectStore((s) => s.jump);
  const editorSettings = useSettingsStore((s) => s.settings.editor);
  const getCompletionData = useCompletionData();

  const compartments = useMemo(
    () => ({
      lineNumbers: new Compartment(),
      wrap: new Compartment(),
      activeLine: new Compartment(),
      brackets: new Compartment(),
      closeBrackets: new Compartment(),
      completion: new Compartment(),
      spell: new Compartment(),
      tab: new Compartment(),
    }),
    [],
  );

  const settingsExtensions = (): Record<keyof typeof compartments, Extension> => ({
    lineNumbers: editorSettings.lineNumbers ? [lineNumbers(), highlightActiveLineGutter()] : [],
    wrap: editorSettings.lineWrap ? EditorView.lineWrapping : [],
    activeLine: editorSettings.highlightActiveLine ? highlightActiveLine() : [],
    brackets: editorSettings.bracketMatching ? bracketMatching() : [],
    closeBrackets: editorSettings.autoCloseBrackets ? closeBrackets() : [],
    // `\` completes commands/environments/labels/cites/files; `@` opens the snippet palette.
    completion: editorSettings.autocomplete
      ? autocompletion({ override: [snippetPaletteSource, latexCompletionSource(getCompletionData)], icons: false, activateOnTyping: true, maxRenderedOptions: 40 })
      : autocompletion({ override: [snippetPaletteSource], icons: false, activateOnTyping: true }),
    spell: EditorView.contentAttributes.of({ spellcheck: editorSettings.spellcheck ? "true" : "false", autocorrect: "off", autocapitalize: "off" }),
    tab: [indentUnit.of(" ".repeat(editorSettings.tabSize)), EditorState.tabSize.of(editorSettings.tabSize)],
  });

  const baseExtensions = (): Extension[] => {
    const s = settingsExtensions();
    return [
      compartments.lineNumbers.of(s.lineNumbers),
      compartments.wrap.of(s.wrap),
      compartments.activeLine.of(s.activeLine),
      compartments.brackets.of(s.brackets),
      compartments.closeBrackets.of(s.closeBrackets),
      compartments.completion.of(s.completion),
      compartments.spell.of(s.spell),
      compartments.tab.of(s.tab),
      history(),
      drawSelection(),
      dropCursor(),
      highlightSpecialChars(),
      indentOnInput(),
      rectangularSelection(),
      crosshairCursor(),
      highlightSelectionMatches(),
      foldGutter({ openText: "▾", closedText: "▸" }),
      search({ top: true }),
      scrollPastEnd(),
      latex(),
      latexEnvironmentKeymap,
      // ⌘B/⌘I/⌘U/⌘⇧C wrap the selection; \code exists in every template but Blank.
      formattingKeymap({ codeMacro: () => (useProjectStore.getState().project?.template === "blank" ? "texttt" : "code") }),
      diagnosticsExtension,
      editorTheme,
      keymap.of([
        {
          key: "Mod-s",
          run: () => {
            void useProjectStore.getState().saveAll();
            return true;
          },
        },
        {
          key: "Mod-Shift-Enter",
          run: () => {
            void useProjectStore.getState().compile();
            return true;
          },
        },
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      EditorView.updateListener.of((u) => {
        const path = currentPath.current;
        if (!path) return;
        if (u.docChanged && !suppress.current) useProjectStore.getState().setText(path, u.state.doc.toString());
        if (u.selectionSet || u.docChanged) {
          const line = u.state.doc.lineAt(u.state.selection.main.head).number;
          useProjectStore.getState().setCursorLine(line);
        }
      }),
    ];
  };

  // Mount the view once.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({ state: EditorState.create({ doc: "", extensions: baseExtensions() }), parent: host });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Command palette: wrap the selection in a macro.
  useEffect(() => {
    const onFormat = (e: Event) => {
      const view = viewRef.current;
      const macro = (e as CustomEvent<string>).detail;
      if (!view || !macro) return;
      const name = macro === "code" && useProjectStore.getState().project?.template === "blank" ? "texttt" : macro;
      wrapCommand(name)(view);
      view.focus();
    };
    window.addEventListener("cohere:format", onFormat);
    return () => window.removeEventListener("cohere:format", onFormat);
  }, []);

  // Swap state when the active file changes.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const prev = currentPath.current;
    if (prev) statesRef.current.set(prev, { state: view.state, scrollTop: view.scrollDOM.scrollTop });
    currentPath.current = activePath;
    if (!activePath) {
      view.setState(EditorState.create({ doc: "", extensions: baseExtensions() }));
      return;
    }
    const buf = useProjectStore.getState().buffers[activePath];
    const saved = statesRef.current.get(activePath);
    suppress.current = true;
    if (saved && saved.state.doc.toString() === (buf?.text ?? "")) {
      view.setState(saved.state);
      requestAnimationFrame(() => {
        view.scrollDOM.scrollTop = saved.scrollTop;
      });
    } else {
      view.setState(EditorState.create({ doc: buf?.text ?? "", extensions: baseExtensions() }));
    }
    suppress.current = false;
    applyDiagnostics(view, useProjectStore.getState().diagnostics, activePath);
    useProjectStore.getState().setCursorLine(view.state.doc.lineAt(view.state.selection.main.head).number);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath]);

  // External text changes (e.g. buffer reloaded) — only when the doc actually differs.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !activePath || bufferText === undefined) return;
    const cur = view.state.doc.toString();
    if (cur !== bufferText) {
      suppress.current = true;
      view.dispatch({ changes: { from: 0, to: cur.length, insert: bufferText } });
      suppress.current = false;
    }
  }, [bufferText, activePath]);

  // Live settings.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const s = settingsExtensions();
    view.dispatch({
      effects: (Object.keys(compartments) as (keyof typeof compartments)[]).map((k) => compartments[k].reconfigure(s[k])),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorSettings, compartments]);

  // Diagnostics.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !activePath) return;
    applyDiagnostics(view, diagnostics, activePath);
  }, [diagnostics, activePath]);

  // Jump to line.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !jump || jump.path !== activePath) return;
    const line = Math.max(1, Math.min(jump.line, view.state.doc.lines));
    const l = view.state.doc.line(line);
    view.dispatch({ selection: { anchor: l.from }, effects: EditorView.scrollIntoView(l.from, { y: "center" }) });
    view.focus();
    useProjectStore.getState().clearJump();
  }, [jump, activePath]);

  const style = { ["--editor-font-size" as string]: `${editorSettings.fontSize}px`, ["--editor-font-family" as string]: editorSettings.fontFamily };
  return <div ref={hostRef} className="source__cm" style={style} data-testid="tex-editor" />;
}
