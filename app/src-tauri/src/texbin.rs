//! Locate the TeX Live / MacTeX binaries and report what is available.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TexInfo {
    pub found: bool,
    pub bin_dir: Option<String>,
    pub source: String,
    pub latexmk_version: Option<String>,
    pub pdflatex: bool,
    pub xelatex: bool,
    pub lualatex: bool,
    pub biber: bool,
    pub bibtex: bool,
    pub candidates: Vec<String>,
}

fn has(dir: &Path, tool: &str) -> bool {
    dir.join(tool).is_file()
}

fn texlive_dirs() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir("/usr/local/texlive") {
        let mut years: Vec<PathBuf> = rd.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.is_dir()).collect();
        years.sort();
        years.reverse();
        for y in years {
            for arch in ["universal-darwin", "aarch64-darwin", "x86_64-darwin"] {
                let b = y.join("bin").join(arch);
                if b.is_dir() {
                    out.push(b);
                }
            }
        }
    }
    out
}

fn from_path_env() -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    for dir in std::env::split_paths(&path) {
        if has(&dir, "latexmk") && (has(&dir, "pdflatex") || has(&dir, "xelatex")) {
            return Some(dir);
        }
    }
    None
}

/// Order: explicit override → MacTeX symlink dir → newest TeX Live → Homebrew → PATH.
pub fn locate(override_dir: Option<&str>) -> TexInfo {
    let mut candidates: Vec<(String, PathBuf)> = Vec::new();
    if let Some(o) = override_dir.filter(|s| !s.trim().is_empty()) {
        candidates.push(("settings".into(), PathBuf::from(o.trim())));
    }
    candidates.push(("MacTeX".into(), PathBuf::from("/Library/TeX/texbin")));
    for d in texlive_dirs() {
        candidates.push(("TeX Live".into(), d));
    }
    candidates.push(("Homebrew".into(), PathBuf::from("/opt/homebrew/bin")));
    candidates.push(("Homebrew".into(), PathBuf::from("/usr/local/bin")));
    if let Some(p) = from_path_env() {
        candidates.push(("PATH".into(), p));
    }

    let names: Vec<String> = candidates.iter().map(|(_, p)| p.to_string_lossy().into_owned()).collect();
    for (source, dir) in &candidates {
        if has(dir, "latexmk") && has(dir, "pdflatex") {
            return describe(dir, source, names);
        }
    }
    TexInfo { found: false, bin_dir: None, source: "none".into(), latexmk_version: None, pdflatex: false, xelatex: false, lualatex: false, biber: false, bibtex: false, candidates: names }
}

fn describe(dir: &Path, source: &str, candidates: Vec<String>) -> TexInfo {
    let version = Command::new(dir.join("latexmk"))
        .arg("--version")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .and_then(|s| s.lines().find(|l| l.contains("Version")).map(|l| l.trim().to_string()));
    TexInfo {
        found: true,
        bin_dir: Some(dir.to_string_lossy().into_owned()),
        source: source.into(),
        latexmk_version: version,
        pdflatex: has(dir, "pdflatex"),
        xelatex: has(dir, "xelatex"),
        lualatex: has(dir, "lualatex"),
        biber: has(dir, "biber"),
        bibtex: has(dir, "bibtex"),
        candidates,
    }
}

/// PATH value for child processes: the TeX bin dir first, then the user's PATH plus the usual macOS dirs.
pub fn child_path(bin_dir: &str) -> String {
    let mut parts: Vec<String> = vec![bin_dir.to_string()];
    if let Some(p) = std::env::var_os("PATH") {
        parts.extend(std::env::split_paths(&p).map(|x| x.to_string_lossy().into_owned()));
    }
    for d in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"] {
        if !parts.iter().any(|x| x == d) {
            parts.push(d.into());
        }
    }
    parts.join(":")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locate_does_not_panic_and_reports_candidates() {
        let info = locate(Some("/definitely/not/here"));
        assert!(!info.candidates.is_empty());
        assert!(info.candidates[0].contains("/definitely/not/here"));
    }

    #[test]
    fn child_path_prepends_bin() {
        let p = child_path("/tex/bin");
        assert!(p.starts_with("/tex/bin:"));
        assert!(p.contains("/usr/bin"));
    }
}
