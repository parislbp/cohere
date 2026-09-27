/** Settings: appearance · editor · compiler · about. Every control has a tooltip instead of paragraphs. */
import { useEffect, useState } from "react";
import { ENGINES, MOTIONS, THEMES, type EngineId, type MotionId, type ThemeId } from "@/api/types";
import { Icon } from "@/components/icons";
import { Button, Dialog, InfoTip, Segmented, Stepper, Switch, TextInput, Tooltip } from "@/components/ui";
import { confirmNative, reveal } from "@/lib/native";
import * as api from "@/api";
import { useTexInstallStore } from "@/store/texInstall";
import { updateStatusLabel, useUpdaterStore } from "@/store/updater";
import { formatBytes } from "@/lib/format";
import { RemoveDialog } from "./RemoveDialog";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";
import "./settings.css";

type Tab = "appearance" | "editor" | "compiler" | "about";

export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen);
  const tab = useUiStore((s) => s.settingsTab);
  const close = useUiStore((s) => s.closeSettings);
  const openSettings = useUiStore((s) => s.openSettings);
  return (
    <Dialog open={open} onClose={close} title="Settings" width="wide" className="settings" testId="settings-dialog">
      <div className="settings__layout">
        <nav className="settings__nav" aria-label="Settings sections">
          {(
            [
              ["appearance", "palette", "Appearance"],
              ["editor", "cursorText", "Editor"],
              ["compiler", "compile", "Compiler"],
              ["about", "info", "About"],
            ] as [Tab, "palette" | "cursorText" | "compile" | "info", string][]
          ).map(([id, icon, label]) => (
            <button key={id} className={["settings__navitem", tab === id && "is-on"].filter(Boolean).join(" ")} onClick={() => openSettings(id)}>
              <Icon name={icon} size={15} />
              {label}
            </button>
          ))}
        </nav>
        <div className="settings__panel">
          {tab === "appearance" && <AppearanceTab />}
          {tab === "editor" && <EditorTab />}
          {tab === "compiler" && <CompilerTab />}
          {tab === "about" && <AboutTab />}
        </div>
      </div>
    </Dialog>
  );
}

function Row({ label, info, children }: { label: string; info?: string; children: React.ReactNode }) {
  return (
    <div className="srow">
      <span className="srow__label">
        {label}
        {info && <InfoTip content={info} />}
      </span>
      <span className="srow__control">{children}</span>
    </div>
  );
}

function AppearanceTab() {
  const s = useSettingsStore((st) => st.settings);
  const { setTheme, setMotion, update } = useSettingsStore();
  return (
    <>
      <div className="settings__section">
        <span className="caps">theme</span>
        <div className="themecards" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <Tooltip key={t.id} content={t.blurb} side="bottom" display="block">
              <button role="radio" aria-checked={s.theme === t.id} className={["themecard", s.theme === t.id && "is-on"].filter(Boolean).join(" ")} data-theme={t.id} onClick={() => setTheme(t.id as ThemeId)} data-testid={`theme-${t.id}`}>
                <span className="themecard__preview">
                  <span className="themecard__bar" />
                  <span className="themecard__line" />
                  <span className="themecard__line themecard__line--short" />
                  <span className="themecard__accent" />
                  <span className="themecard__accents" aria-hidden>
                    <i style={{ background: "var(--a1)" }} />
                    <i style={{ background: "var(--a2)" }} />
                    <i style={{ background: "var(--a3)" }} />
                    <i style={{ background: "var(--a4)" }} />
                    <i style={{ background: "var(--a5)" }} />
                  </span>
                </span>
                <span className="themecard__name serif">{t.name}</span>
                <span className="themecard__mode">{t.mode}</span>
              </button>
            </Tooltip>
          ))}
        </div>
      </div>
      <div className="settings__section">
        <span className="caps">motion</span>
        <Row label="Animation speed" info="Scales every transition. Off removes them entirely; spinners keep moving.">
          <Segmented ariaLabel="Animation speed" value={s.motion} onChange={(v) => setMotion(v as MotionId)} options={MOTIONS.map((m) => ({ id: m.id, label: m.name }))} />
        </Row>
        <div className="motion-demo" aria-hidden>
          <span className="motion-demo__dot" />
          <span className="motion-demo__dot" />
          <span className="motion-demo__dot" />
        </div>
      </div>
      <div className="settings__section">
        <span className="caps">tooltips</span>
        <Row label="Show tooltips" info="Hover hints on icons and controls. Keyboard shortcuts show inside them.">
          <Switch on={s.tooltips} onChange={(v) => update({ tooltips: v })} label="Show tooltips" />
        </Row>
        <Row label="Delay" info="Milliseconds before a tooltip appears.">
          <Stepper value={s.tooltipDelayMs} onChange={(v) => update({ tooltipDelayMs: v })} min={0} max={2000} label="Tooltip delay" />
        </Row>
      </div>
    </>
  );
}

function EditorTab() {
  const e = useSettingsStore((st) => st.settings.editor);
  const setEditor = useSettingsStore((st) => st.setEditor);
  const autosave = useSettingsStore((st) => st.settings.autosaveMs);
  const compileOnSave = useSettingsStore((st) => st.settings.compileOnSave);
  const statusLine = useSettingsStore((st) => st.settings.ui.statusLine);
  const setUi = useSettingsStore((st) => st.setUi);
  const update = useSettingsStore((st) => st.update);
  return (
    <>
      <div className="settings__section">
        <span className="caps">type</span>
        <Row label="Font size">
          <Stepper value={e.fontSize} onChange={(v) => setEditor({ fontSize: v })} min={9} max={32} label="Editor font size" />
        </Row>
        <Row label="Font family" info="Any installed monospace font, comma-separated fallbacks.">
          <TextInput size="sm" mono value={e.fontFamily} onChange={(ev) => setEditor({ fontFamily: ev.target.value })} style={{ width: 260 }} />
        </Row>
        <Row label="Tab size">
          <Stepper value={e.tabSize} onChange={(v) => setEditor({ tabSize: v })} min={1} max={8} label="Tab size" />
        </Row>
      </div>
      <div className="settings__section">
        <span className="caps">behaviour</span>
        <Row label="Wrap long lines">
          <Switch on={e.lineWrap} onChange={(v) => setEditor({ lineWrap: v })} label="Wrap long lines" />
        </Row>
        <Row label="Line numbers" info="The gutter with line numbers and fold markers. ⌘⇧G toggles it from the editor.">
          <Switch on={e.lineNumbers} onChange={(v) => setEditor({ lineNumbers: v })} label="Line numbers" />
        </Row>
        <Row label="Status line" info="The strip under the editor with problem counts, cursor line, word count and engine. ⌘⇧↓ or ⌥↓ toggles it.">
          <Switch on={statusLine} onChange={(v) => setUi({ statusLine: v })} label="Status line" />
        </Row>
        <Row label="Highlight current line">
          <Switch on={e.highlightActiveLine} onChange={(v) => setEditor({ highlightActiveLine: v })} label="Highlight current line" />
        </Row>
        <Row label="Match brackets" info="Highlights the matching brace, bracket or parenthesis at the cursor.">
          <Switch on={e.bracketMatching} onChange={(v) => setEditor({ bracketMatching: v })} label="Match brackets" />
        </Row>
        <Row label="Auto-close brackets" info="Typing { inserts }. Also closes $ for inline math.">
          <Switch on={e.autoCloseBrackets} onChange={(v) => setEditor({ autoCloseBrackets: v })} label="Auto-close brackets" />
        </Row>
        <Row label="Completions" info="Commands after \, environments in \begin{, labels in \ref{, keys in \cite{, files in \input{.">
          <Switch on={e.autocomplete} onChange={(v) => setEditor({ autocomplete: v })} label="Completions" />
        </Row>
        <Row label="Spell check" info="The system spell checker underlines prose; LaTeX commands are still flagged sometimes.">
          <Switch on={e.spellcheck} onChange={(v) => setEditor({ spellcheck: v })} label="Spell check" />
        </Row>
      </div>
      <div className="settings__section">
        <span className="caps">saving</span>
        <Row label="Autosave after" info="Milliseconds of quiet before a changed file is written. Files also save on compile, blur and close.">
          <Stepper value={autosave} onChange={(v) => update({ autosaveMs: v })} min={200} max={10000} label="Autosave delay" />
        </Row>
        <Row label="Compile on save" info="Recompile automatically after every autosave. Handy for short documents.">
          <Switch on={compileOnSave} onChange={(v) => update({ compileOnSave: v })} label="Compile on save" />
        </Row>
      </div>
    </>
  );
}

function CompilerTab() {
  const s = useSettingsStore((st) => st.settings);
  const info = useSettingsStore((st) => st.appInfo);
  const { setEngine, update, redetectTex } = useSettingsStore();
  const [binDir, setBinDir] = useState(s.texBinDir ?? "");
  const [checking, setChecking] = useState(false);
  useEffect(() => setBinDir(s.texBinDir ?? ""), [s.texBinDir]);
  const tex = info?.tex;
  const available = (id: EngineId) => (tex ? tex[id] : true);
  const texInstall = useTexInstallStore();
  const [privateBytes, setPrivateBytes] = useState<number | null>(null);
  useEffect(() => {
    if (tex?.source === "Cohere") void api.tex.status().then((st) => setPrivateBytes(st.bytes)).catch(() => setPrivateBytes(null));
  }, [tex?.source, tex?.binDir]);

  return (
    <>
      <div className="settings__section">
        <span className="caps">engine</span>
        <Row label="LaTeX engine" info="Which program latexmk drives. Templates here are written for pdfLaTeX; use XeLaTeX or LuaLaTeX for system fonts.">
          <Segmented ariaLabel="Engine" value={s.engine} onChange={(v) => setEngine(v as EngineId)} options={ENGINES.map((e) => ({ id: e.id, label: e.name, tip: available(e.id) ? e.blurb : `${e.name} not found in the TeX bin directory`, disabled: !available(e.id) }))} />
        </Row>
        <Row label="Shell escape" info="Lets packages like minted run external programs. Only enable for documents you trust.">
          <Switch on={s.shellEscape} onChange={(v) => update({ shellEscape: v })} label="Shell escape" />
        </Row>
        <Row label="SyncTeX" info="Writes main.synctex.gz so a future update can jump between PDF and source.">
          <Switch on={s.synctex} onChange={(v) => update({ synctex: v })} label="SyncTeX" />
        </Row>
      </div>
      <div className="settings__section">
        <span className="caps">tex installation</span>
        <div className={["texcard", tex?.found ? "is-ok" : "is-missing"].filter(Boolean).join(" ")} data-testid="tex-card">
          <Icon name={tex?.found ? "success" : "warning"} size={16} />
          <div className="texcard__body">
            {tex?.found ? (
              <>
                <span className="texcard__title">
                  {tex.source} · <span className="mono">{tex.binDir}</span>
                </span>
                <span className="texcard__meta">
                  {tex.latexmkVersion ?? "latexmk"} · {["pdflatex", "xelatex", "lualatex", "biber", "bibtex"].filter((k) => tex[k as keyof typeof tex]).join(" · ")}
                </span>
              </>
            ) : (
              <>
                <span className="texcard__title">{texInstall.running ? "Installing TeX for Cohere…" : "No TeX installation found"}</span>
                <span className="texcard__meta">{texInstall.running ? "progress in the install window" : "Let Cohere install a private, minimal TeX Live — or install MacTeX and re-detect."}</span>
              </>
            )}
          </div>
          {!tex?.found && (
            <Button size="sm" variant="primary" icon="download" onClick={() => texInstall.openDialog()} tip="A private TeX Live (≈ 400 MB) inside Cohere's data folder, with only the packages the templates use" data-testid="tex-install-open">
              {texInstall.running ? "progress" : "install TeX"}
            </Button>
          )}
          {tex?.found && tex.source === "Cohere" && (
            <Button
              size="sm"
              icon="trash"
              onClick={async () => {
                const ok = await confirmNative(`Remove TeX for Cohere (${formatBytes(privateBytes)})? Compiling needs a TeX installation; you can install it again any time.`, "Remove TeX for Cohere");
                if (!ok) return;
                await api.tex.remove();
                await redetectTex();
              }}
              tip={`Delete Cohere's private TeX Live${privateBytes ? ` (${formatBytes(privateBytes)})` : ""}`}
            >
              remove
            </Button>
          )}
          <Button
            size="sm"
            icon="refresh"
            loading={checking}
            onClick={async () => {
              setChecking(true);
              await redetectTex();
              setChecking(false);
            }}
            tip="Search again for latexmk and the engines"
          >
            re-detect
          </Button>
        </div>
        <Row label="Bin directory" info="Optional override. The folder that contains latexmk and pdflatex, e.g. /Library/TeX/texbin.">
          <span className="row" style={{ gap: 6 }}>
            <TextInput
              size="sm"
              mono
              value={binDir}
              placeholder="auto-detect"
              onChange={(ev) => setBinDir(ev.target.value)}
              onBlur={() => {
                const v = binDir.trim() || null;
                if (v !== s.texBinDir) {
                  update({ texBinDir: v });
                  window.setTimeout(() => void redetectTex(), 400);
                }
              }}
              style={{ width: 280 }}
            />
          </span>
        </Row>
      </div>
    </>
  );
}

function AboutTab() {
  const info = useSettingsStore((st) => st.appInfo);
  const s = useSettingsStore((st) => st.settings);
  const update = useSettingsStore((st) => st.update);
  const upd = useUpdaterStore();
  const [removeOpen, setRemoveOpen] = useState(false);
  const checking = upd.status === "checking";
  return (
    <>
      <div className="settings__section about">
        <div className="about__brand">
          <span className="about__word gradient-text serif">Cohere</span>
          <span className="about__tag">a local-first LaTeX writing desk</span>
        </div>
        <Row label="Version">
          <span className="row" style={{ gap: 8 }}>
            <span className="mono">{info?.version ?? "—"}</span>
            {info?.dev && <span className="dim">· development build</span>}
          </span>
        </Row>
        <Row label="Updates" info="Cohere asks GitHub for the latest release when it starts — the only network request it makes on its own. Updates are signed; the download is verified before anything is replaced.">
          <span className="row" style={{ gap: 8 }}>
            <Switch on={s.checkUpdates} onChange={(v) => update({ checkUpdates: v })} label="Check for updates at launch" />
            <span className="dim" data-testid="update-status">
              {updateStatusLabel(upd)}
            </span>
            <Button size="sm" icon={upd.status === "available" ? "download" : "refresh"} loading={checking} onClick={() => (upd.status === "available" ? upd.openDialog() : void upd.checkNow())} tip={upd.status === "available" ? "Show the update" : "Ask GitHub for the newest release now"} data-testid="update-check">
              {upd.status === "available" ? "install…" : "check now"}
            </Button>
          </span>
        </Row>
        <Row label="Data" info="Everything lives here: projects, builds, versions, settings. Deleted projects go to .trash inside it.">
          <span className="row" style={{ gap: 6 }}>
            <span className="mono truncate" style={{ maxWidth: 300 }}>
              {info?.dataDir ?? "—"}
            </span>
            {info?.dataDir && (
              <Button size="sm" icon="external" onClick={() => void reveal(info.dataDir)} tip="Reveal in Finder">
                reveal
              </Button>
            )}
          </span>
        </Row>
        <Row label="Templates" info="Blank, Project (report), Brief, Periodical (two columns), Minimal, Paper (two columns), Paper (one column) — embedded in the app; edit a project after creating it.">
          <span className="dim">blank · project · brief · periodical · minimal · paper · paper-single</span>
        </Row>
        <Row label="Shortcuts">
          <span className="about__keys">
            <kbd className="kbd">⌘K</kbd> commands <kbd className="kbd">⌘⇧↩</kbd> compile <kbd className="kbd">⌘S</kbd> save <kbd className="kbd">⌘1</kbd> <kbd className="kbd">⌥←</kbd> sidebar <kbd className="kbd">⌘B</kbd> <kbd className="kbd">⌘I</kbd> <kbd className="kbd">⌘U</kbd> <kbd className="kbd">⌘⇧C</kbd> bold · emph · underline · code <kbd className="kbd">⌘⇧G</kbd> gutter <kbd className="kbd">⌘⌥=</kbd> <kbd className="kbd">⌘⌥−</kbd> text size <kbd className="kbd">⌘⇧M</kbd> problems <kbd className="kbd">⌘⇧↓</kbd> <kbd className="kbd">⌥↓</kbd> status line <kbd className="kbd">⌘,</kbd> settings <kbd className="kbd">⌘⇧H</kbd> library
          </span>
        </Row>
        <Row label="Remove" info="Moves the app, your data folder (projects, versions, TeX for Cohere) and Cohere's system files to the Trash, then quits. You can export every project as a zip first.">
          <Button size="sm" variant="danger" icon="trash" onClick={() => setRemoveOpen(true)} data-testid="remove-open">
            remove Cohere…
          </Button>
        </Row>
      </div>
      <RemoveDialog open={removeOpen} onClose={() => setRemoveOpen(false)} />
    </>
  );
}
