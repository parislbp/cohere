//! Managed application state: data-dir paths, cached settings, TeX detection, running compiles.

use std::sync::{Arc, Mutex};

use crate::compile::Compiler;
use crate::error::{AppError, Result};
use crate::paths::Paths;
use crate::settings::Settings;
use crate::texbin::{self, TexInfo};

pub struct AppState {
    pub paths: Paths,
    pub settings: Mutex<Settings>,
    pub tex: Mutex<Option<TexInfo>>,
    pub compiler: Arc<Compiler>,
}

impl AppState {
    pub fn new(paths: Paths) -> Self {
        let settings = Settings::load(&paths.settings_file());
        AppState { paths, settings: Mutex::new(settings), tex: Mutex::new(None), compiler: Arc::new(Compiler::default()) }
    }

    pub fn settings(&self) -> Result<Settings> {
        Ok(self.settings.lock().map_err(|_| AppError::other("settings lock"))?.clone())
    }

    pub fn replace_settings(&self, s: Settings) -> Result<Settings> {
        let s = s.normalised();
        s.save(&self.paths.settings_file())?;
        let mut guard = self.settings.lock().map_err(|_| AppError::other("settings lock"))?;
        let tex_changed = guard.tex_bin_dir != s.tex_bin_dir;
        *guard = s.clone();
        drop(guard);
        if tex_changed {
            if let Ok(mut t) = self.tex.lock() {
                *t = None;
            }
        }
        Ok(s)
    }

    /// Detect TeX once and cache; `force` re-runs detection.
    pub fn tex(&self, force: bool) -> Result<TexInfo> {
        let mut guard = self.tex.lock().map_err(|_| AppError::other("tex lock"))?;
        if force || guard.is_none() {
            let override_dir = self.settings()?.tex_bin_dir;
            *guard = Some(texbin::locate(override_dir.as_deref()));
        }
        Ok(guard.clone().expect("set above"))
    }
}
