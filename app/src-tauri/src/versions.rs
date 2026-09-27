//! Versions: immutable snapshots of a project — the compiled PDF plus a zip of `src/`.

use std::fs;
use std::path::Path;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};
use crate::fsutil;
use crate::paths::ProjectPaths;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionInfo {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub note: String,
    pub created: DateTime<Utc>,
    pub pdf_bytes: u64,
    pub bundle_bytes: u64,
    pub file_count: usize,
    pub has_pdf: bool,
}

fn version_file(dir: &Path) -> std::path::PathBuf {
    dir.join("version.json")
}

pub fn list(pp: &ProjectPaths) -> Result<Vec<VersionInfo>> {
    let mut out = Vec::new();
    let Ok(rd) = fs::read_dir(pp.versions()) else { return Ok(out) };
    for entry in rd {
        let entry = entry?;
        if !entry.path().is_dir() {
            continue;
        }
        match fs::read_to_string(version_file(&entry.path())).and_then(|t| serde_json::from_str::<VersionInfo>(&t).map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))) {
            Ok(v) => out.push(v),
            Err(e) => log::warn!("skipping version {:?}: {e}", entry.path()),
        }
    }
    out.sort_by(|a, b| b.created.cmp(&a.created));
    Ok(out)
}

pub fn next_default_name(pp: &ProjectPaths) -> String {
    let n = list(pp).map(|v| v.len()).unwrap_or(0) + 1;
    format!("v{n}")
}

pub fn create(pp: &ProjectPaths, name: &str, note: &str) -> Result<VersionInfo> {
    let name = name.trim();
    let name = if name.is_empty() { next_default_name(pp) } else { name.to_string() };
    if name.len() > 120 {
        return Err(AppError::invalid("version name is too long"));
    }
    let now = Utc::now();
    let id = format!("{}-{}", now.format("%Y%m%d-%H%M%S"), &uuid::Uuid::new_v4().simple().to_string()[..6]);
    let dir = pp.version(&id)?;
    fs::create_dir_all(&dir)?;
    let bundle_bytes = fsutil::zip_dir(&pp.src(), &dir.join("src.zip"), Some("src"))?;
    let (pdf_bytes, has_pdf) = if pp.output_pdf().is_file() {
        (fsutil::copy_file_atomic(&pp.output_pdf(), &dir.join("main.pdf"))?, true)
    } else {
        (0, false)
    };
    if pp.output_log().is_file() {
        let _ = fs::copy(pp.output_log(), dir.join("main.log"));
    }
    let info = VersionInfo { id, name, note: note.trim().to_string(), created: now, pdf_bytes, bundle_bytes, file_count: fsutil::file_count(&pp.src()), has_pdf };
    fsutil::write_atomic(&version_file(&dir), serde_json::to_string_pretty(&info)?.as_bytes())?;
    Ok(info)
}

pub fn delete(pp: &ProjectPaths, vid: &str) -> Result<()> {
    let dir = pp.version(vid)?;
    if !dir.is_dir() {
        return Err(AppError::not_found("version"));
    }
    fs::remove_dir_all(dir)?;
    Ok(())
}

pub fn rename(pp: &ProjectPaths, vid: &str, name: &str, note: Option<&str>) -> Result<VersionInfo> {
    let dir = pp.version(vid)?;
    let text = fs::read_to_string(version_file(&dir)).map_err(|_| AppError::not_found("version"))?;
    let mut v: VersionInfo = serde_json::from_str(&text)?;
    if !name.trim().is_empty() {
        v.name = name.trim().to_string();
    }
    if let Some(n) = note {
        v.note = n.trim().to_string();
    }
    fsutil::write_atomic(&version_file(&dir), serde_json::to_string_pretty(&v)?.as_bytes())?;
    Ok(v)
}

/// `kind` is `pdf` or `bundle`; copies the artefact to `dest`.
pub fn export(pp: &ProjectPaths, vid: &str, kind: &str, dest: &Path) -> Result<u64> {
    let dir = pp.version(vid)?;
    let src = match kind {
        "pdf" => dir.join("main.pdf"),
        "bundle" | "zip" => dir.join("src.zip"),
        _ => return Err(AppError::invalid(format!("unknown export kind {kind}"))),
    };
    if !src.is_file() {
        return Err(AppError::not_found(format!("this version has no {kind}")));
    }
    fsutil::copy_file_atomic(&src, dest)
}

pub fn read_pdf(pp: &ProjectPaths, vid: &str) -> Result<Vec<u8>> {
    let dir = pp.version(vid)?;
    let p = dir.join("main.pdf");
    if !p.is_file() {
        return Err(AppError::not_found("this version has no PDF"));
    }
    Ok(fs::read(p)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_lifecycle() {
        let d = tempfile::tempdir().unwrap();
        let pp = ProjectPaths::new(d.path().join("p"));
        pp.ensure_dirs().unwrap();
        fs::write(pp.src().join("main.tex"), "x").unwrap();
        let v1 = create(&pp, "", "first").unwrap();
        assert_eq!(v1.name, "v1");
        assert!(!v1.has_pdf);
        fs::write(pp.output_pdf(), b"%PDF-1.7 fake").unwrap();
        let v2 = create(&pp, "  release  ", "").unwrap();
        assert_eq!(v2.name, "release");
        assert!(v2.has_pdf && v2.pdf_bytes > 0);
        let all = list(&pp).unwrap();
        assert_eq!(all.len(), 2);
        assert_eq!(all[0].id, v2.id, "newest first");
        let out = d.path().join("x.pdf");
        assert!(export(&pp, &v2.id, "pdf", &out).unwrap() > 0);
        assert!(export(&pp, &v1.id, "pdf", &out).is_err());
        assert!(export(&pp, &v1.id, "bundle", &d.path().join("b.zip")).unwrap() > 0);
        let r = rename(&pp, &v1.id, "draft", Some("n")).unwrap();
        assert_eq!((r.name.as_str(), r.note.as_str()), ("draft", "n"));
        delete(&pp, &v1.id).unwrap();
        assert_eq!(list(&pp).unwrap().len(), 1);
        assert!(delete(&pp, "../x").is_err());
    }
}
