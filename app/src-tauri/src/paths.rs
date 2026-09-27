//! Where everything lives on disk.
//!
//! ```text
//! <app data dir>/                      ~/Library/Application Support/<identifier>/
//! ├── settings.json
//! ├── projects/<id>/
//! │   ├── project.json                 manifest (title, topic, template, dates, archived, main file)
//! │   ├── src/                         the LaTeX tree the user edits
//! │   ├── build/                       latexmk aux + intermediate output
//! │   ├── output/                      main.pdf · main.log · main.synctex.gz · meta.json
//! │   └── versions/<vid>/              version.json · main.pdf · src.zip
//! └── .trash/<id>-<stamp>/             deleted projects, recoverable by hand
//! ```

use std::path::{Component, Path, PathBuf};

use crate::error::{AppError, Result};

#[derive(Debug, Clone)]
pub struct Paths {
    pub root: PathBuf,
}

impl Paths {
    pub fn new(root: PathBuf) -> Result<Self> {
        let p = Paths { root };
        std::fs::create_dir_all(p.projects_dir())?;
        std::fs::create_dir_all(p.trash_dir())?;
        Ok(p)
    }

    pub fn settings_file(&self) -> PathBuf {
        self.root.join("settings.json")
    }

    pub fn projects_dir(&self) -> PathBuf {
        self.root.join("projects")
    }

    pub fn trash_dir(&self) -> PathBuf {
        self.root.join(".trash")
    }

    pub fn project(&self, id: &str) -> Result<ProjectPaths> {
        validate_id(id)?;
        Ok(ProjectPaths::new(self.projects_dir().join(id)))
    }
}

#[derive(Debug, Clone)]
pub struct ProjectPaths {
    pub root: PathBuf,
}

impl ProjectPaths {
    pub fn new(root: PathBuf) -> Self {
        ProjectPaths { root }
    }

    pub fn manifest(&self) -> PathBuf {
        self.root.join("project.json")
    }
    pub fn src(&self) -> PathBuf {
        self.root.join("src")
    }
    pub fn build(&self) -> PathBuf {
        self.root.join("build")
    }
    pub fn output(&self) -> PathBuf {
        self.root.join("output")
    }
    pub fn versions(&self) -> PathBuf {
        self.root.join("versions")
    }
    pub fn version(&self, vid: &str) -> Result<PathBuf> {
        validate_id(vid)?;
        Ok(self.versions().join(vid))
    }
    pub fn output_pdf(&self) -> PathBuf {
        self.output().join("main.pdf")
    }
    pub fn output_log(&self) -> PathBuf {
        self.output().join("main.log")
    }
    pub fn output_synctex(&self) -> PathBuf {
        self.output().join("main.synctex.gz")
    }
    pub fn output_meta(&self) -> PathBuf {
        self.output().join("meta.json")
    }

    pub fn ensure_dirs(&self) -> Result<()> {
        for d in [self.src(), self.build(), self.output(), self.versions()] {
            std::fs::create_dir_all(d)?;
        }
        Ok(())
    }

    /// Resolve a user-supplied relative path inside `src/`, refusing anything that escapes it.
    pub fn src_path(&self, rel: &str) -> Result<PathBuf> {
        safe_join(&self.src(), rel)
    }
}

/// Ids are uuids or `stamp-uuid` strings we generate ourselves; anything else is refused
/// so an id can never be used to walk the filesystem.
pub fn validate_id(id: &str) -> Result<()> {
    if id.is_empty() || id.len() > 80 {
        return Err(AppError::invalid("bad id"));
    }
    if !id
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(AppError::invalid(format!("bad id: {id}")));
    }
    Ok(())
}

/// Join `rel` onto `base` after normalising it: no absolute paths, no `..`, no empty segments.
/// An empty `rel` means `base` itself.
pub fn safe_join(base: &Path, rel: &str) -> Result<PathBuf> {
    let rel = rel.trim().replace('\\', "/");
    let mut out = base.to_path_buf();
    if rel.is_empty() || rel == "." {
        return Ok(out);
    }
    let candidate = Path::new(&rel);
    for comp in candidate.components() {
        match comp {
            Component::Normal(seg) => {
                if seg.is_empty() {
                    return Err(AppError::invalid("bad path segment"));
                }
                out.push(seg);
            }
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(AppError::invalid(format!("path escapes project: {rel}")));
            }
        }
    }
    Ok(out)
}

/// Relative path as a forward-slash string (what the frontend sees).
pub fn rel_string(base: &Path, full: &Path) -> String {
    full.strip_prefix(base)
        .unwrap_or(full)
        .components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect::<Vec<_>>()
        .join("/")
}

/// Sanitise a file or folder name typed by the user.
pub fn clean_name(name: &str) -> Result<String> {
    let n = name.trim();
    if n.is_empty() {
        return Err(AppError::invalid("name is empty"));
    }
    if n == "." || n == ".." || n.contains('/') || n.contains('\\') || n.contains('\0') {
        return Err(AppError::invalid(format!("invalid name: {n}")));
    }
    if n.len() > 200 {
        return Err(AppError::invalid("name is too long"));
    }
    Ok(n.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_join_accepts_nested() {
        let base = Path::new("/base");
        assert_eq!(
            safe_join(base, "chapters/ch_01.tex").unwrap(),
            PathBuf::from("/base/chapters/ch_01.tex")
        );
        assert_eq!(safe_join(base, "").unwrap(), PathBuf::from("/base"));
        assert_eq!(safe_join(base, "./a/./b").unwrap(), PathBuf::from("/base/a/b"));
    }

    #[test]
    fn safe_join_rejects_escape() {
        let base = Path::new("/base");
        assert!(safe_join(base, "../x").is_err());
        assert!(safe_join(base, "a/../../x").is_err());
        assert!(safe_join(base, "/etc/passwd").is_err());
    }

    #[test]
    fn ids() {
        assert!(validate_id("3f2a-77").is_ok());
        assert!(validate_id("../x").is_err());
        assert!(validate_id("").is_err());
    }

    #[test]
    fn names() {
        assert_eq!(clean_name("  main.tex ").unwrap(), "main.tex");
        assert!(clean_name("a/b").is_err());
        assert!(clean_name("..").is_err());
    }
}
