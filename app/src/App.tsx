import { useEffect } from "react";
import { Toasts, TooltipProvider } from "@/components/ui";
import { TopBar } from "@/components/layout/TopBar";
import { LibraryView } from "@/features/library/LibraryView";
import { EditorView } from "@/features/editor/EditorView";
import { SettingsDialog } from "@/features/settings/SettingsDialog";
import { CommandPalette } from "@/features/palette/CommandPalette";
import { matchesShortcut, SHORTCUTS } from "@/lib/keys";
import { flushSettings, useSettingsStore } from "@/store/settings";
import { useProjectStore } from "@/store/project";
import { useUiStore } from "@/store/ui";
import { useLibraryStore } from "@/store/library";
import "./components/layout/layout.css";

export function App() {
  const load = useSettingsStore((s) => s.load);
  const loaded = useSettingsStore((s) => s.loaded);
  const view = useUiStore((s) => s.view);
  const paletteOpen = useUiStore((s) => s.paletteOpen);
  const setPalette = useUiStore((s) => s.setPalette);

  useEffect(() => {
    void load();
  }, [load]);

  useGlobalShortcuts();

  useEffect(() => {
    const onHide = () => {
      void useProjectStore.getState().saveAll();
      void flushSettings();
    };
    window.addEventListener("blur", onHide);
    window.addEventListener("beforeunload", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("blur", onHide);
      window.removeEventListener("beforeunload", onHide);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, []);

  return (
    <TooltipProvider>
      <div className="shell" data-view={view}>
        <TopBar />
        <main className="shell__main">{loaded ? view === "editor" ? <EditorView /> : <LibraryView /> : <div className="shell__boot" />}</main>
      </div>
      <SettingsDialog />
      <CommandPalette open={paletteOpen} onClose={() => setPalette(false)} />
      <Toasts />
    </TooltipProvider>
  );
}

function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = useUiStore.getState();
      if (matchesShortcut(e, SHORTCUTS.palette)) {
        e.preventDefault();
        ui.setPalette(!ui.paletteOpen);
        return;
      }
      if (matchesShortcut(e, SHORTCUTS.settings)) {
        e.preventDefault();
        if (ui.settingsOpen) ui.closeSettings();
        else ui.openSettings();
        return;
      }
      if (matchesShortcut(e, SHORTCUTS.library) || matchesShortcut(e, SHORTCUTS.libraryAlt)) {
        e.preventDefault();
        void goToLibrary();
        return;
      }
      if (ui.view === "library") {
        const lib = useLibraryStore.getState();
        if (matchesShortcut(e, SHORTCUTS.find)) {
          e.preventDefault();
          lib.toggleSearch(true);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

export async function goToLibrary(): Promise<void> {
  const proj = useProjectStore.getState();
  await proj.close();
  useUiStore.getState().setView("library");
  void useLibraryStore.getState().load();
}
