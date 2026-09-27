//! Files inside a project's `src/`: tree listing, read, atomic write, create, rename, delete, import.

use std::fs;
use std::path::Path;

use chrono::{DateTime, Utc};
use serde::Serialize;

use crate::error::{AppError, Result};
use crate::fsutil;
use crate::paths::{self, ProjectPaths};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub kind: String,
    pub size: u64,
    pub modified: Option<DateTime<Utc>>,
    pub ext: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<FileNode>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub path: String,
    pub text: Option<String>,
    pub binary: bool,
    pub image: bool,
    pub size: u64,
    pub modified: Option<DateTime<Utc>>,
    pub ext: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileStat {
    pub path: String,
    pub size: u64,
    pub modified: Option<DateTime<Utc>>,
}

const MAX_TEXT_BYTES: u64 = 8 * 1024 * 1024;

fn mtime(meta: &fs::Metadata) -> Option<DateTime<Utc>> {
    meta.modified().ok().map(DateTime::<Utc>::from)
}

fn natural_key(name: &str) -> (Vec<(u8, u64, String)>,) {
    let mut key = Vec::new();
    let mut chars = name.chars().peekable();
    while let Some(&c) = chars.peek() {
        if c.is_ascii_digit() {
            let mut n = 0u64;
            while let Some(&d) = chars.peek() {
                if d.is_ascii_digit() {
                    n = n.saturating_mul(10).saturating_add(d as u64 - '0' as u64);
                    chars.next();
                } else {
                    break;
                }
            }
            key.push((0, n, String::new()));
        } else {
            let mut s = String::new();
            while let Some(&d) = chars.peek() {
                if d.is_ascii_digit() {
                    break;
                }
                s.push(d.to_ascii_lowercase());
                chars.next();
            }
            key.push((1, 0, s));
        }
    }
    (key,)
}

pub fn tree(pp: &ProjectPaths) -> Result<Vec<FileNode>> {
    let src = pp.src();
    fs::create_dir_all(&src)?;
    walk(&src, &src)
}

fn walk(base: &Path, dir: &Path) -> Result<Vec<FileNode>> {
    let mut nodes = Vec::new();
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if fsutil::is_ignored(&name) || name.starts_with(".tmp-") || name.starts_with(".main.") {
            continue;
        }
        let meta = entry.metadata()?;
        let full = entry.path();
        let rel = paths::rel_string(base, &full);
        if meta.is_dir() {
            nodes.push(FileNode { name, path: rel, kind: "dir".into(), size: 0, modified: mtime(&meta), ext: String::new(), children: Some(walk(base, &full)?) });
        } else if meta.is_file() {
            let ext = fsutil::extension(&name);
            nodes.push(FileNode { name, path: rel, kind: "file".into(), size: meta.len(), modified: mtime(&meta), ext, children: None });
        }
    }
    nodes.sort_by(|a, b| {
        let da = a.kind == "dir";
        let db = b.kind == "dir";
        db.cmp(&da).then_with(|| natural_key(&a.name).cmp(&natural_key(&b.name)))
    });
    Ok(nodes)
}

pub fn read(pp: &ProjectPaths, rel: &str) -> Result<FileContent> {
    let p = pp.src_path(rel)?;
    let meta = fs::metadata(&p).map_err(|_| AppError::not_found(rel))?;
    if !meta.is_file() {
        return Err(AppError::invalid(format!("{rel} is not a file")));
    }
    let name = p.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let ext = fsutil::extension(&name);
    let image = fsutil::IMAGE_EXTENSIONS.contains(&ext.as_str()) && ext != "svg";
    let textual_ext = fsutil::TEXT_EXTENSIONS.contains(&ext.as_str());
    if meta.len() > MAX_TEXT_BYTES || image {
        return Ok(FileContent { path: rel.into(), text: None, binary: true, image, size: meta.len(), modified: mtime(&meta), ext });
    }
    let bytes = fs::read(&p)?;
    if textual_ext || fsutil::looks_like_text(&bytes) {
        let text = String::from_utf8_lossy(&bytes).into_owned();
        Ok(FileContent { path: rel.into(), text: Some(text), binary: false, image: false, size: meta.len(), modified: mtime(&meta), ext })
    } else {
        Ok(FileContent { path: rel.into(), text: None, binary: true, image: false, size: meta.len(), modified: mtime(&meta), ext })
    }
}

pub fn read_bytes(pp: &ProjectPaths, rel: &str) -> Result<Vec<u8>> {
    let p = pp.src_path(rel)?;
    if !p.is_file() {
        return Err(AppError::not_found(rel));
    }
    Ok(fs::read(p)?)
}

pub fn write(pp: &ProjectPaths, rel: &str, text: &str) -> Result<FileStat> {
    let p = pp.src_path(rel)?;
    if rel.trim().is_empty() {
        return Err(AppError::invalid("path is required"));
    }
    fsutil::write_atomic(&p, text.as_bytes())?;
    let meta = fs::metadata(&p)?;
    Ok(FileStat { path: rel.into(), size: meta.len(), modified: mtime(&meta) })
}

/// Create an empty (or seeded) file. `rel` is the full relative path including name.
pub fn create_file(pp: &ProjectPaths, rel: &str, content: Option<&str>) -> Result<FileNode> {
    let p = pp.src_path(rel)?;
    let name = p.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    paths::clean_name(&name)?;
    if p.exists() {
        return Err(AppError::Conflict(format!("{rel} already exists")));
    }
    fsutil::write_atomic(&p, content.unwrap_or("").as_bytes())?;
    node_for(pp, &p)
}

pub fn create_folder(pp: &ProjectPaths, rel: &str) -> Result<FileNode> {
    let p = pp.src_path(rel)?;
    let name = p.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    paths::clean_name(&name)?;
    if p.exists() {
        return Err(AppError::Conflict(format!("{rel} already exists")));
    }
    fs::create_dir_all(&p)?;
    node_for(pp, &p)
}

/// Rename or move within `src/`. `to` is a full relative path.
pub fn rename(pp: &ProjectPaths, from: &str, to: &str) -> Result<FileNode> {
    let a = pp.src_path(from)?;
    let b = pp.src_path(to)?;
    if !a.exists() {
        return Err(AppError::not_found(from));
    }
    let name = b.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    paths::clean_name(&name)?;
    if b.exists() {
        return Err(AppError::Conflict(format!("{to} already exists")));
    }
    if a.is_dir() && b.starts_with(&a) {
        return Err(AppError::invalid("cannot move a folder into itself"));
    }
    if let Some(parent) = b.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::rename(&a, &b)?;
    node_for(pp, &b)
}

pub fn delete(pp: &ProjectPaths, rel: &str) -> Result<()> {
    if rel.trim().is_empty() || rel == "." {
        return Err(AppError::invalid("refusing to delete the project root"));
    }
    let p = pp.src_path(rel)?;
    if !p.exists() {
        return Err(AppError::not_found(rel));
    }
    if p.is_dir() {
        fs::remove_dir_all(&p)?;
    } else {
        fs::remove_file(&p)?;
    }
    Ok(())
}

/// Copy external files into `dest_dir` (relative folder inside src). Name clashes get ` (2)` suffixes.
pub fn import(pp: &ProjectPaths, dest_dir: &str, sources: &[String]) -> Result<Vec<FileNode>> {
    let dir = pp.src_path(dest_dir)?;
    fs::create_dir_all(&dir)?;
    let mut out = Vec::new();
    for s in sources {
        let sp = Path::new(s);
        if !sp.is_file() {
            return Err(AppError::not_found(s.clone()));
        }
        let name = sp.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        paths::clean_name(&name)?;
        let target = unique_name(&dir, &name);
        fs::copy(sp, &target)?;
        out.push(node_for(pp, &target)?);
    }
    Ok(out)
}

fn unique_name(dir: &Path, name: &str) -> std::path::PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let p = Path::new(name);
    let stem = p.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| name.to_string());
    let ext = p.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    for i in 2..1000 {
        let c = dir.join(format!("{stem} ({i}){ext}"));
        if !c.exists() {
            return c;
        }
    }
    dir.join(format!("{stem}-{}{ext}", uuid::Uuid::new_v4().simple()))
}

fn node_for(pp: &ProjectPaths, full: &Path) -> Result<FileNode> {
    let meta = fs::metadata(full)?;
    let name = full.file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let rel = paths::rel_string(&pp.src(), full);
    Ok(if meta.is_dir() {
        FileNode { name, path: rel, kind: "dir".into(), size: 0, modified: mtime(&meta), ext: String::new(), children: Some(vec![]) }
    } else {
        let ext = fsutil::extension(&name);
        FileNode { name, path: rel, kind: "file".into(), size: meta.len(), modified: mtime(&meta), ext, children: None }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pp() -> (tempfile::TempDir, ProjectPaths) {
        let d = tempfile::tempdir().unwrap();
        let pp = ProjectPaths::new(d.path().join("p"));
        pp.ensure_dirs().unwrap();
        (d, pp)
    }

    #[test]
    fn crud_roundtrip() {
        let (_d, pp) = pp();
        create_folder(&pp, "chapters").unwrap();
        create_file(&pp, "chapters/ch_10.tex", Some("x")).unwrap();
        create_file(&pp, "chapters/ch_2.tex", None).unwrap();
        create_file(&pp, "main.tex", Some("\\documentclass{article}")).unwrap();
        assert!(create_file(&pp, "main.tex", None).is_err(), "conflict");
        let t = tree(&pp).unwrap();
        assert_eq!(t[0].name, "chapters");
        let kids = t[0].children.as_ref().unwrap();
        assert_eq!(kids.iter().map(|k| k.name.as_str()).collect::<Vec<_>>(), vec!["ch_2.tex", "ch_10.tex"], "natural sort");
        let c = read(&pp, "main.tex").unwrap();
        assert_eq!(c.text.as_deref(), Some("\\documentclass{article}"));
        write(&pp, "main.tex", "new").unwrap();
        assert_eq!(read(&pp, "main.tex").unwrap().text.as_deref(), Some("new"));
        rename(&pp, "chapters/ch_2.tex", "chapters/intro.tex").unwrap();
        assert!(read(&pp, "chapters/intro.tex").is_ok());
        assert!(rename(&pp, "chapters", "chapters/sub").is_err());
        delete(&pp, "chapters").unwrap();
        assert!(read(&pp, "chapters/intro.tex").is_err());
        assert!(delete(&pp, "").is_err());
        assert!(read(&pp, "../project.json").is_err());
    }

    #[test]
    fn import_dedupes_names() {
        let (d, pp) = pp();
        let ext = d.path().join("fig.png");
        fs::write(&ext, b"\x89PNG\0\0").unwrap();
        create_folder(&pp, "figures").unwrap();
        let a = import(&pp, "figures", &[ext.to_string_lossy().into_owned()]).unwrap();
        let b = import(&pp, "figures", &[ext.to_string_lossy().into_owned()]).unwrap();
        assert_eq!(a[0].path, "figures/fig.png");
        assert_eq!(b[0].path, "figures/fig (2).png");
        let c = read(&pp, "figures/fig.png").unwrap();
        assert!(c.binary && c.image);
    }
}
