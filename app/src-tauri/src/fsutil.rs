//! Filesystem helpers: atomic writes, directory copy, zip, size.

use std::fs;
use std::io::{Read, Write};
use std::path::Path;

use walkdir::WalkDir;
use zip::write::SimpleFileOptions;

use crate::error::{AppError, Result};

pub const IGNORED_NAMES: [&str; 3] = [".DS_Store", "Thumbs.db", ".git"];

pub fn is_ignored(name: &str) -> bool {
    IGNORED_NAMES.contains(&name)
}

/// Write via a temp file in the same directory and rename, so readers never see a torn file.
pub fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let dir = path
        .parent()
        .ok_or_else(|| AppError::invalid("path has no parent"))?;
    fs::create_dir_all(dir)?;
    let tmp = dir.join(format!(
        ".{}.tmp-{}",
        path.file_name().map(|s| s.to_string_lossy()).unwrap_or_default(),
        uuid::Uuid::new_v4().simple()
    ));
    {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
    }
    fs::rename(&tmp, path)?;
    Ok(())
}

pub fn copy_file_atomic(from: &Path, to: &Path) -> Result<u64> {
    let bytes = fs::read(from)?;
    write_atomic(to, &bytes)?;
    Ok(bytes.len() as u64)
}

/// Recursive copy skipping ignored names. Returns the number of files copied.
pub fn copy_dir(src: &Path, dst: &Path) -> Result<usize> {
    let mut n = 0;
    fs::create_dir_all(dst)?;
    for entry in WalkDir::new(src).min_depth(1).into_iter().filter_entry(|e| !is_ignored(&e.file_name().to_string_lossy())) {
        let entry = entry.map_err(|e| AppError::other(e.to_string()))?;
        let rel = entry.path().strip_prefix(src).map_err(|e| AppError::other(e.to_string()))?;
        let target = dst.join(rel);
        if entry.file_type().is_dir() {
            fs::create_dir_all(&target)?;
        } else if entry.file_type().is_file() {
            if let Some(p) = target.parent() {
                fs::create_dir_all(p)?;
            }
            fs::copy(entry.path(), &target)?;
            n += 1;
        }
    }
    Ok(n)
}

pub fn dir_size(path: &Path) -> u64 {
    WalkDir::new(path)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| e.metadata().ok())
        .map(|m| m.len())
        .sum()
}

pub fn file_count(path: &Path) -> usize {
    WalkDir::new(path)
        .into_iter()
        .filter_entry(|e| !is_ignored(&e.file_name().to_string_lossy()))
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .count()
}

/// Zip `src_dir` into `dest` (written atomically). Files are stored relative to `src_dir`,
/// optionally under `prefix/`. Returns the byte size of the archive.
pub fn zip_dir(src_dir: &Path, dest: &Path, prefix: Option<&str>) -> Result<u64> {
    let mut buf = Vec::new();
    {
        let cursor = std::io::Cursor::new(&mut buf);
        let mut zw = zip::ZipWriter::new(cursor);
        let opts = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        for entry in WalkDir::new(src_dir).min_depth(1).sort_by_file_name().into_iter().filter_entry(|e| !is_ignored(&e.file_name().to_string_lossy())) {
            let entry = entry.map_err(|e| AppError::other(e.to_string()))?;
            let rel = entry.path().strip_prefix(src_dir).map_err(|e| AppError::other(e.to_string()))?;
            let rel_s = rel.components().map(|c| c.as_os_str().to_string_lossy().into_owned()).collect::<Vec<_>>().join("/");
            let name = match prefix {
                Some(p) => format!("{p}/{rel_s}"),
                None => rel_s,
            };
            if entry.file_type().is_dir() {
                zw.add_directory(format!("{name}/"), opts)?;
            } else if entry.file_type().is_file() {
                zw.start_file(name, opts)?;
                let mut f = fs::File::open(entry.path())?;
                let mut data = Vec::new();
                f.read_to_end(&mut data)?;
                zw.write_all(&data)?;
            }
        }
        zw.finish()?;
    }
    write_atomic(dest, &buf)?;
    Ok(buf.len() as u64)
}

/// True when the bytes look like text: valid UTF-8 and no NUL in the first 8 KiB.
pub fn looks_like_text(bytes: &[u8]) -> bool {
    let head = &bytes[..bytes.len().min(8192)];
    if head.contains(&0u8) {
        return false;
    }
    std::str::from_utf8(bytes).is_ok()
}

pub const TEXT_EXTENSIONS: [&str; 40] = [
    "tex", "bib", "sty", "cls", "bst", "bbx", "cbx", "lbx", "dbx", "def", "ltx", "dtx", "ins", "clo", "fd", "cfg",
    "txt", "md", "markdown", "json", "yaml", "yml", "toml", "csv", "tsv", "dat", "log", "ini", "py", "r", "jl", "sh",
    "mk", "tikz", "pgf", "svg", "html", "xml", "aux", "gitignore",
];

pub const IMAGE_EXTENSIONS: [&str; 7] = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];

pub fn extension(name: &str) -> String {
    let lower = name.to_lowercase();
    if lower == "makefile" {
        return "mk".into();
    }
    Path::new(&lower)
        .extension()
        .map(|e| e.to_string_lossy().into_owned())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_write_and_copy() {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join("a/b/c.txt");
        write_atomic(&p, b"hello").unwrap();
        assert_eq!(fs::read_to_string(&p).unwrap(), "hello");
        assert!(fs::read_dir(p.parent().unwrap()).unwrap().count() == 1, "temp file must be gone");
        let q = dir.path().join("copy.txt");
        assert_eq!(copy_file_atomic(&p, &q).unwrap(), 5);
    }

    #[test]
    fn zip_and_copy_dir() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("src");
        fs::create_dir_all(src.join("chapters")).unwrap();
        fs::write(src.join("main.tex"), "x").unwrap();
        fs::write(src.join("chapters/a.tex"), "y").unwrap();
        fs::write(src.join(".DS_Store"), "junk").unwrap();
        let out = dir.path().join("out.zip");
        let size = zip_dir(&src, &out, Some("proj")).unwrap();
        assert!(size > 0);
        let f = fs::File::open(&out).unwrap();
        let mut z = zip::ZipArchive::new(f).unwrap();
        let names: Vec<String> = (0..z.len()).map(|i| z.by_index(i).unwrap().name().to_string()).collect();
        assert!(names.contains(&"proj/main.tex".to_string()));
        assert!(names.contains(&"proj/chapters/a.tex".to_string()));
        assert!(!names.iter().any(|n| n.contains("DS_Store")));
        let dst = dir.path().join("dst");
        assert_eq!(copy_dir(&src, &dst).unwrap(), 2);
        assert_eq!(file_count(&dst), 2);
    }

    #[test]
    fn text_detection() {
        assert!(looks_like_text(b"\\documentclass{article}"));
        assert!(!looks_like_text(b"%PDF-1.7\0\x01"));
        assert_eq!(extension("Makefile"), "mk");
        assert_eq!(extension("a.TEX"), "tex");
    }
}
