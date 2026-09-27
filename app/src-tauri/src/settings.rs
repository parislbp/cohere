//! settings.json — user preferences. Every field has a default so older files keep loading.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::fsutil;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    /// Bumped when a default changes in a way existing files should adopt (see `normalised`).
    /// Files without it are treated as version 0 so they migrate.
    #[serde(default)]
    pub version: u32,
    pub theme: String,
    pub motion: String,
    pub engine: String,
    pub tex_bin_dir: Option<String>,
    pub shell_escape: bool,
    pub synctex: bool,
    pub compile_on_save: bool,
    pub autosave_ms: u32,
    pub tooltips: bool,
    pub tooltip_delay_ms: u32,
    /// Look for a newer release on GitHub at launch (the only network request Cohere makes on its own).
    pub check_updates: bool,
    pub editor: EditorSettings,
    pub ui: UiSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct EditorSettings {
    pub font_size: u32,
    pub font_family: String,
    pub line_wrap: bool,
    pub line_numbers: bool,
    pub tab_size: u32,
    pub spellcheck: bool,
    pub highlight_active_line: bool,
    pub bracket_matching: bool,
    pub auto_close_brackets: bool,
    pub autocomplete: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct UiSettings {
    pub sidebar_collapsed: bool,
    pub sidebar_width: f64,
    pub editor_fraction: f64,
    pub sidebar_sections: [f64; 3],
    pub sidebar_folded: [bool; 3],
    pub show_archived: bool,
    pub pdf_zoom: String,
    pub problems_open: bool,
    pub status_line: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            version: SETTINGS_VERSION,
            theme: "paper".into(),
            motion: "normal".into(),
            engine: "pdflatex".into(),
            tex_bin_dir: None,
            shell_escape: false,
            synctex: true,
            compile_on_save: false,
            autosave_ms: 800,
            tooltips: true,
            tooltip_delay_ms: 350,
            check_updates: true,
            editor: EditorSettings::default(),
            ui: UiSettings::default(),
        }
    }
}

impl Default for EditorSettings {
    fn default() -> Self {
        EditorSettings {
            font_size: 11,
            font_family: "SF Mono, Menlo, Consolas, monospace".into(),
            line_wrap: true,
            line_numbers: true,
            tab_size: 2,
            spellcheck: true,
            highlight_active_line: true,
            bracket_matching: true,
            auto_close_brackets: true,
            autocomplete: true,
        }
    }
}

impl Default for UiSettings {
    fn default() -> Self {
        UiSettings {
            sidebar_collapsed: false,
            sidebar_width: 260.0,
            editor_fraction: 0.5,
            sidebar_sections: [0.5, 0.25, 0.25],
            sidebar_folded: [false, false, true],
            show_archived: false,
            pdf_zoom: "width".into(),
            problems_open: false,
            status_line: true,
        }
    }
}

pub const SETTINGS_VERSION: u32 = 4;
pub const THEMES: [&str; 4] = ["paper", "mist", "ink", "graphite"];
pub const MOTIONS: [&str; 4] = ["off", "slow", "normal", "fast"];
pub const ENGINES: [&str; 3] = ["pdflatex", "xelatex", "lualatex"];

impl Settings {
    pub fn load(path: &Path) -> Settings {
        let (s, _) = Self::load_reporting(path);
        s
    }

    /// Load and normalise; the flag says whether the file on disk is older than `SETTINGS_VERSION`
    /// (or missing/unreadable) so the caller can write the migrated form back once.
    pub fn load_reporting(path: &Path) -> (Settings, bool) {
        let (raw, readable) = match std::fs::read_to_string(path) {
            Ok(text) => match serde_json::from_str::<Settings>(&text) {
                Ok(s) => (s, true),
                Err(e) => {
                    log::warn!("settings.json unreadable ({e}); using defaults");
                    (Settings::default(), false)
                }
            },
            Err(_) => (Settings::default(), false),
        };
        let stale = !readable || raw.version < SETTINGS_VERSION;
        (raw.normalised(), stale)
    }

    pub fn save(&self, path: &Path) -> Result<()> {
        let text = serde_json::to_string_pretty(self)?;
        fsutil::write_atomic(path, text.as_bytes())
    }

    /// Clamp enums/ranges so a hand-edited file cannot put the UI in an impossible state,
    /// and migrate older files to changed defaults.
    pub fn normalised(mut self) -> Settings {
        if self.version < 2 {
            // v2: the editor default shrank to 11px; earlier files carried the old 14.
            self.editor.font_size = 11;
            self.version = 2;
        }
        if self.version < 3 {
            // v3: the outputs section starts folded so files and the outline get the room.
            self.ui.sidebar_folded[2] = true;
            self.version = 3;
        }
        if self.version < 4 {
            // v4: the launch update check arrived; older files never said no to it.
            self.check_updates = true;
            self.version = 4;
        }
        if !THEMES.contains(&self.theme.as_str()) {
            self.theme = "paper".into();
        }
        if !MOTIONS.contains(&self.motion.as_str()) {
            self.motion = "normal".into();
        }
        if !ENGINES.contains(&self.engine.as_str()) {
            self.engine = "pdflatex".into();
        }
        self.autosave_ms = self.autosave_ms.clamp(200, 10_000);
        self.tooltip_delay_ms = self.tooltip_delay_ms.clamp(0, 3000);
        self.editor.font_size = self.editor.font_size.clamp(9, 32);
        self.editor.tab_size = self.editor.tab_size.clamp(1, 8);
        self.ui.sidebar_width = self.ui.sidebar_width.clamp(180.0, 600.0);
        self.ui.editor_fraction = self.ui.editor_fraction.clamp(0.2, 0.8);
        let sum: f64 = self.ui.sidebar_sections.iter().sum();
        if !(0.99..=1.01).contains(&sum) || self.ui.sidebar_sections.iter().any(|v| *v < 0.08) {
            self.ui.sidebar_sections = UiSettings::default().sidebar_sections;
        }
        if let Some(dir) = &self.tex_bin_dir {
            if dir.trim().is_empty() {
                self.tex_bin_dir = None;
            }
        }
        self
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn load_reports_when_the_file_is_behind() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("settings.json");
        std::fs::write(&p, r#"{"version":3,"theme":"ink"}"#).unwrap();
        let (s, stale) = Settings::load_reporting(&p);
        assert!(stale);
        assert_eq!(s.theme, "ink");
        assert_eq!(s.version, SETTINGS_VERSION);
        s.save(&p).unwrap();
        let (_, stale) = Settings::load_reporting(&p);
        assert!(!stale, "once written back the file is current");
    }

    #[test]
    fn defaults_roundtrip() {
        let s = Settings::default();
        let text = serde_json::to_string(&s).unwrap();
        let back: Settings = serde_json::from_str(&text).unwrap();
        assert_eq!(back.theme, "paper");
        assert_eq!(back.editor.font_size, 11);
        assert_eq!(back.version, SETTINGS_VERSION);
    }

    #[test]
    fn partial_file_fills_defaults_and_normalises() {
        let s: Settings = serde_json::from_str(r#"{"version":2,"theme":"nope","editor":{"fontSize":99}}"#).unwrap();
        let s = s.normalised();
        assert_eq!(s.theme, "paper");
        assert_eq!(s.editor.font_size, 32);
        assert_eq!(s.motion, "normal");
        assert!(s.ui.status_line);
    }

    #[test]
    fn old_files_migrate_to_the_new_editor_size() {
        let s: Settings = serde_json::from_str(r#"{"editor":{"fontSize":14}}"#).unwrap();
        let s = s.normalised();
        assert_eq!(s.editor.font_size, 11);
        assert_eq!(s.version, SETTINGS_VERSION);
        assert_eq!(s.ui.sidebar_folded, [false, false, true]);
        assert!(s.check_updates, "v4 turns the launch update check on for older files");
        let again: Settings = serde_json::from_str(r#"{"version":3,"editor":{"fontSize":14},"ui":{"sidebarFolded":[false,false,false]}}"#).unwrap();
        let again = again.normalised();
        assert_eq!(again.editor.font_size, 14, "a v3 file keeps the user's choice");
        assert_eq!(again.ui.sidebar_folded, [false, false, false]);
        let v4: Settings = serde_json::from_str(r#"{"version":4,"checkUpdates":false}"#).unwrap();
        assert!(!v4.normalised().check_updates, "a v4 file keeps the user's choice");
    }
}
