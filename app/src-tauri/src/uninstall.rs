//! Settings › About › "Remove Cohere…": export every project (optional), move the data
//! directory, the per-app Library folders and the app bundle itself to the Trash, then quit.
//! Nothing is deleted outright — everything can be dragged back out of the Trash.

use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{AppError, Result};
use crate::library;
use crate::paths::Paths;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Footprint {
    pub data_dir: String,
    pub data_bytes: u64,
    pub tex_bytes: u64,
    pub projects: usize,
    pub app_bundle: Option<String>,
    pub library_dirs: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemovalReport {
    pub exported: usize,
    pub trashed: Vec<String>,
    pub skipped: Vec<String>,
}

fn dir_size(p: &Path) -> u64 {
    walkdir::WalkDir::new(p).into_iter().filter_map(|e| e.ok()).filter_map(|e| e.metadata().ok()).filter(|m| m.is_file()).map(|m| m.len()).sum()
}

/// The running `.app` bundle, if this process lives inside one that is not a build tree.
pub fn app_bundle() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    // Cohere.app/Contents/MacOS/cohere → Cohere.app
    let bundle = exe.parent()?.parent()?.parent()?.to_path_buf();
    if bundle.extension().map(|e| e == "app").unwrap_or(false) && !bundle.to_string_lossy().contains("/target/") {
        Some(bundle)
    } else {
        None
    }
}

/// Per-app folders macOS creates next to the data directory.
pub fn library_dirs(identifier: &str) -> Vec<PathBuf> {
    let Some(home) = std::env::var_os("HOME").map(PathBuf::from) else { return Vec::new() };
    let lib = home.join("Library");
    vec![
        lib.join("Preferences").join(format!("{identifier}.plist")),
        lib.join("Saved Application State").join(format!("{identifier}.savedState")),
        lib.join("WebKit").join(identifier),
        lib.join("Caches").join(identifier),
        lib.join("HTTPStorages").join(identifier),
    ]
    .into_iter()
    .filter(|p| p.exists())
    .collect()
}

pub fn footprint(paths: &Paths, identifier: &str) -> Result<Footprint> {
    let projects = library::list(paths).map(|v| v.len()).unwrap_or(0);
    Ok(Footprint {
        data_dir: paths.root.to_string_lossy().into_owned(),
        data_bytes: dir_size(&paths.root),
        tex_bytes: crate::texinstall::size_on_disk(&paths.root),
        projects,
        app_bundle: app_bundle().map(|p| p.to_string_lossy().into_owned()),
        library_dirs: library_dirs(identifier).into_iter().map(|p| p.to_string_lossy().into_owned()).collect(),
    })
}

/// Move `path` into `~/.Trash`, adding a numeric suffix when the name is taken.
pub fn trash(path: &Path) -> Result<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from).ok_or_else(|| AppError::other("HOME is not set"))?;
    let bin = home.join(".Trash");
    std::fs::create_dir_all(&bin)?;
    let name = path.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "item".into());
    let mut target = bin.join(&name);
    let mut n = 1;
    while target.exists() {
        n += 1;
        target = bin.join(format!("{name} {n}"));
    }
    match std::fs::rename(path, &target) {
        Ok(()) => Ok(target),
        Err(_) => {
            // Different volume (or a permission quirk): copy, then remove.
            copy_tree(path, &target)?;
            if path.is_dir() {
                std::fs::remove_dir_all(path)?;
            } else {
                std::fs::remove_file(path)?;
            }
            Ok(target)
        }
    }
}

fn copy_tree(from: &Path, to: &Path) -> Result<()> {
    if from.is_dir() {
        std::fs::create_dir_all(to)?;
        for entry in std::fs::read_dir(from)? {
            let entry = entry?;
            copy_tree(&entry.path(), &to.join(entry.file_name()))?;
        }
    } else {
        std::fs::copy(from, to)?;
    }
    Ok(())
}

/// Export every project as `tx.<slug>.zip` into `dir`, then trash the data directory,
/// the Library folders and the app bundle. The caller quits the app afterwards.
pub fn remove_everything(paths: &Paths, identifier: &str, export_dir: Option<&Path>) -> Result<RemovalReport> {
    let mut report = RemovalReport { exported: 0, trashed: Vec::new(), skipped: Vec::new() };
    if let Some(dir) = export_dir {
        std::fs::create_dir_all(dir)?;
        for p in library::list(paths)? {
            let dest = unique(dir, &format!("tx.{}.zip", library::slug(&p.manifest.title)));
            library::export_zip(paths, &p.manifest.id, &dest)?;
            report.exported += 1;
        }
    }
    let mut targets: Vec<PathBuf> = vec![paths.root.clone()];
    targets.extend(library_dirs(identifier));
    if let Some(app) = app_bundle() {
        targets.push(app);
    }
    for t in targets {
        match trash(&t) {
            Ok(_) => report.trashed.push(t.to_string_lossy().into_owned()),
            Err(e) => report.skipped.push(format!("{}: {e}", t.display())),
        }
    }
    Ok(report)
}

fn unique(dir: &Path, name: &str) -> PathBuf {
    let mut p = dir.join(name);
    let mut n = 1;
    while p.exists() {
        n += 1;
        let stem = name.trim_end_matches(".zip");
        p = dir.join(format!("{stem} {n}.zip"));
    }
    p
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trash_moves_into_the_users_trash_with_unique_names() {
        let home = tempfile::tempdir().unwrap();
        let prev = std::env::var_os("HOME");
        std::env::set_var("HOME", home.path());
        let work = tempfile::tempdir().unwrap();
        let a = work.path().join("thing");
        std::fs::create_dir_all(a.join("sub")).unwrap();
        std::fs::write(a.join("sub/f.txt"), "x").unwrap();
        let t1 = trash(&a).unwrap();
        assert!(t1.join("sub/f.txt").is_file());
        assert!(!a.exists());
        std::fs::create_dir_all(&a).unwrap();
        let t2 = trash(&a).unwrap();
        assert_ne!(t1, t2);
        assert!(t2.ends_with("thing 2"));
        match prev {
            Some(v) => std::env::set_var("HOME", v),
            None => std::env::remove_var("HOME"),
        }
    }

    #[test]
    fn app_bundle_is_none_under_cargo() {
        assert!(app_bundle().is_none());
    }
}
