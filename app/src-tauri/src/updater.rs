//! In-app updates.
//!
//! `check_update` fetches `latest.json` from the GitHub Release marked *latest*, compares its
//! version with the running one and keeps the verified download description in memory.
//! `install_update` downloads the archive, checks its minisign signature against the public key
//! embedded in `tauri.conf.json`, swaps the app bundle and relaunches. Progress is streamed on
//! the `update:progress` event. Development builds never check unless `COHERE_UPDATER_DEV=1`.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::error::{AppError, Result};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheck {
    pub current_version: String,
    pub available: bool,
    pub version: Option<String>,
    pub notes: Option<String>,
    pub date: Option<String>,
    /// Set when checking is not possible for this build (e.g. development).
    pub disabled: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateProgress {
    /// downloading · installing · restarting
    pub phase: String,
    pub downloaded: u64,
    pub total: Option<u64>,
}

#[derive(Default)]
pub struct UpdaterState {
    pending: Mutex<Option<Update>>,
}

pub const PROGRESS_EVENT: &str = "update:progress";

fn friendly(e: tauri_plugin_updater::Error) -> AppError {
    let text = e.to_string();
    let lower = text.to_lowercase();
    if lower.contains("dns") || lower.contains("connect") || lower.contains("network") || lower.contains("timed out") || lower.contains("resolve") {
        AppError::other("Cohere could not reach GitHub to look for updates. Check the connection and try again.")
    } else if lower.contains("signature") {
        AppError::other("The downloaded update failed its signature check and was discarded.")
    } else {
        AppError::other(format!("Update check failed: {text}"))
    }
}

fn dev_disabled() -> bool {
    cfg!(debug_assertions) && std::env::var_os("COHERE_UPDATER_DEV").is_none()
}

#[tauri::command]
pub async fn check_update(app: AppHandle, st: State<'_, UpdaterState>) -> Result<UpdateCheck> {
    let current_version = app.package_info().version.to_string();
    if dev_disabled() {
        return Ok(UpdateCheck { current_version, available: false, version: None, notes: None, date: None, disabled: Some("development build".into()) });
    }
    let updater = app.updater().map_err(friendly)?;
    match updater.check().await.map_err(friendly)? {
        Some(update) => {
            let check = UpdateCheck {
                current_version,
                available: true,
                version: Some(update.version.clone()),
                notes: update.body.clone(),
                date: update.date.map(|d| d.to_string()),
                disabled: None,
            };
            *st.pending.lock().map_err(|_| AppError::other("updater lock"))? = Some(update);
            Ok(check)
        }
        None => {
            *st.pending.lock().map_err(|_| AppError::other("updater lock"))? = None;
            Ok(UpdateCheck { current_version, available: false, version: None, notes: None, date: None, disabled: None })
        }
    }
}

#[tauri::command]
pub async fn install_update(app: AppHandle, st: State<'_, UpdaterState>) -> Result<()> {
    let update = st.pending.lock().map_err(|_| AppError::other("updater lock"))?.clone().ok_or_else(|| AppError::invalid("no update is pending — check for updates first"))?;
    let downloaded = Arc::new(AtomicU64::new(0));
    let h1 = app.clone();
    let h2 = app.clone();
    let d1 = downloaded.clone();
    update
        .download_and_install(
            move |chunk, total| {
                let so_far = d1.fetch_add(chunk as u64, Ordering::Relaxed) + chunk as u64;
                let _ = h1.emit(PROGRESS_EVENT, UpdateProgress { phase: "downloading".into(), downloaded: so_far, total });
            },
            move || {
                let _ = h2.emit(PROGRESS_EVENT, UpdateProgress { phase: "installing".into(), downloaded: 0, total: None });
            },
        )
        .await
        .map_err(friendly)?;
    let _ = app.emit(PROGRESS_EVENT, UpdateProgress { phase: "restarting".into(), downloaded: 0, total: None });
    // Give the webview a moment to paint the final state before the process is replaced.
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(400));
        app.restart();
    });
    Ok(())
}

/// Shape of `latest.json` as published by `scripts/release.sh`; kept here so the test suite
/// guards the contract between the release script and the updater plugin.
#[derive(Debug, Clone, Serialize, serde::Deserialize, PartialEq)]
pub struct Manifest {
    pub version: String,
    pub notes: String,
    pub pub_date: String,
    pub platforms: std::collections::BTreeMap<String, Platform>,
}

#[derive(Debug, Clone, Serialize, serde::Deserialize, PartialEq)]
pub struct Platform {
    pub signature: String,
    pub url: String,
}

impl Manifest {
    pub fn for_release(repo: &str, version: &str, notes: &str, signature: &str, pub_date: &str) -> Manifest {
        let mut platforms = std::collections::BTreeMap::new();
        platforms.insert(
            "darwin-aarch64".into(),
            Platform { signature: signature.trim().into(), url: format!("https://github.com/{repo}/releases/download/v{version}/Cohere.app.tar.gz") },
        );
        Manifest { version: version.into(), notes: notes.into(), pub_date: pub_date.into(), platforms }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn manifest_points_at_the_tagged_release_asset() {
        let m = Manifest::for_release("parislbp/cohere", "0.2.0", "notes", "SIG\n", "2026-09-27T00:00:00Z");
        let p = &m.platforms["darwin-aarch64"];
        assert_eq!(p.url, "https://github.com/parislbp/cohere/releases/download/v0.2.0/Cohere.app.tar.gz");
        assert_eq!(p.signature, "SIG");
        let json = serde_json::to_string(&m).unwrap();
        assert!(json.contains("\"pub_date\""));
        let back: Manifest = serde_json::from_str(&json).unwrap();
        assert_eq!(back, m);
    }

    #[test]
    fn development_builds_do_not_check() {
        // cargo test runs with debug assertions; the guard must hold unless the override is set.
        std::env::remove_var("COHERE_UPDATER_DEV");
        assert!(dev_disabled());
    }
}
