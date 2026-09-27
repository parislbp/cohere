/**
 * Top bar: a drag region. Left: the brand (which cross-fades into the window controls on hover),
 * then in the editor the back-to-library button and the project title. Right: global icons.
 */
import { useRef } from "react";
import { MOTIONS, THEMES, type MotionId, type ThemeId } from "@/api/types";
import { Wordmark } from "@/components/brand/Brand";
import { IconButton, Menu, useMenu } from "@/components/ui";
import { SHORTCUTS } from "@/lib/keys";
import { useProjectStore } from "@/store/project";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";
import { goToLibrary } from "@/App";
import { WindowControls } from "./WindowControls";

export function TopBar() {
  const view = useUiStore((s) => s.view);
  const openSettings = useUiStore((s) => s.openSettings);
  const theme = useSettingsStore((s) => s.settings.theme);
  const motion = useSettingsStore((s) => s.settings.motion);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const setMotion = useSettingsStore((s) => s.setMotion);
  const project = useProjectStore((s) => s.project);

  const themeMenu = useMenu();
  const motionMenu = useMenu();
  const themeBtn = useRef<HTMLButtonElement>(null);
  const motionBtn = useRef<HTMLButtonElement>(null);
  const themeMeta = THEMES.find((t) => t.id === theme);

  return (
    <header className="topbar" data-tauri-drag-region>
      <div className="topbar__left">
        <div className="topbar__slot">
          <Wordmark size={16} className="topbar__brand" />
          <WindowControls />
        </div>
      </div>

      <div className="topbar__center">
        {view === "editor" && (
          <span className="topbar__title serif truncate" title={project?.title}>
            {project?.title ?? ""}
          </span>
        )}
      </div>

      <div className="topbar__right">
        {view === "editor" && <IconButton icon="home" label="Library" kbd={SHORTCUTS.library} onClick={() => void goToLibrary()} />}
        <IconButton ref={themeBtn} icon="palette" label="Theme" hint={themeMeta ? `${themeMeta.name} — ${themeMeta.blurb}` : undefined} on={themeMenu.open} onClick={() => themeBtn.current && themeMenu.toggle(themeBtn.current)} />
        <IconButton ref={motionBtn} icon="motion" label="Animation speed" hint={MOTIONS.find((m) => m.id === motion)?.name} on={motionMenu.open} onClick={() => motionBtn.current && motionMenu.toggle(motionBtn.current)} />
        <IconButton icon="settings" label="Settings" kbd={SHORTCUTS.settings} onClick={() => openSettings()} />
      </div>

      <Menu
        open={themeMenu.open}
        anchor={themeMenu.anchor}
        onClose={themeMenu.close}
        align="end"
        items={[
          { title: "light" },
          ...THEMES.filter((t) => t.mode === "light").map((t) => ({ id: t.id, label: t.name, meta: t.blurb, icon: "sun" as const, on: theme === t.id, onSelect: () => setTheme(t.id as ThemeId) })),
          { title: "dark" },
          ...THEMES.filter((t) => t.mode === "dark").map((t) => ({ id: t.id, label: t.name, meta: t.blurb, icon: "moon" as const, on: theme === t.id, onSelect: () => setTheme(t.id as ThemeId) })),
        ]}
        minWidth={220}
      />
      <Menu
        open={motionMenu.open}
        anchor={motionMenu.anchor}
        onClose={motionMenu.close}
        align="end"
        items={[{ title: "animation" }, ...MOTIONS.map((m) => ({ id: m.id, label: m.name, meta: m.scale === 0 ? "none" : `×${m.scale}`, on: motion === m.id, onSelect: () => setMotion(m.id as MotionId) }))]}
        minWidth={180}
      />
    </header>
  );
}
