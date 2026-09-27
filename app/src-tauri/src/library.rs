//! The Library: every project's manifest, plus create / update / archive / delete / export.

use std::fs;
use std::path::Path;

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};
use crate::fsutil;
use crate::paths::{Paths, ProjectPaths};
use crate::templates::{self, ScaffoldOptions};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectManifest {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub topic: Option<String>,
    pub template: String,
    pub created: DateTime<Utc>,
    pub modified: DateTime<Utc>,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub favorite: bool,
    #[serde(default = "default_main")]
    pub main_file: String,
    #[serde(default)]
    pub engine: Option<String>,
    #[serde(default)]
    pub last_opened_file: Option<String>,
}

fn default_main() -> String {
    "main.tex".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    #[serde(flatten)]
    pub manifest: ProjectManifest,
    pub has_output: bool,
    pub file_count: usize,
    pub version_count: usize,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewProject {
    pub title: String,
    #[serde(default)]
    pub topic: Option<String>,
    pub template: String,
    #[serde(default)]
    pub subtitle: String,
    #[serde(default)]
    pub tagline: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub author: Option<String>,
    pub units: Option<u32>,
    pub subunits: Option<u32>,
    pub appendices: Option<u32>,
}

/// Three-state fields: absent = leave unchanged, `null` = clear, value = set.
/// serde folds `null` into the outer `None` by default, so these use `double_option`.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectMetaUpdate {
    pub title: Option<String>,
    pub favorite: Option<bool>,
    #[serde(default, deserialize_with = "double_option")]
    pub topic: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub engine: Option<Option<String>>,
    pub main_file: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub last_opened_file: Option<Option<String>>,
}

fn double_option<'de, T, D>(de: D) -> std::result::Result<Option<Option<T>>, D::Error>
where
    T: serde::Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    serde::Deserialize::deserialize(de).map(Some)
}

pub fn load_manifest(pp: &ProjectPaths) -> Result<ProjectManifest> {
    let text = fs::read_to_string(pp.manifest()).map_err(|_| AppError::not_found("project"))?;
    Ok(serde_json::from_str(&text)?)
}

pub fn save_manifest(pp: &ProjectPaths, m: &ProjectManifest) -> Result<()> {
    fsutil::write_atomic(&pp.manifest(), serde_json::to_string_pretty(m)?.as_bytes())
}

pub fn summary(pp: &ProjectPaths, m: ProjectManifest) -> ProjectSummary {
    let version_count = fs::read_dir(pp.versions()).map(|rd| rd.filter_map(|e| e.ok()).filter(|e| e.path().is_dir()).count()).unwrap_or(0);
    ProjectSummary {
        has_output: pp.output_pdf().is_file(),
        file_count: fsutil::file_count(&pp.src()),
        version_count,
        size_bytes: fsutil::dir_size(&pp.src()),
        manifest: m,
    }
}

pub fn list(paths: &Paths) -> Result<Vec<ProjectSummary>> {
    let mut out = Vec::new();
    for entry in fs::read_dir(paths.projects_dir())? {
        let entry = entry?;
        if !entry.path().is_dir() {
            continue;
        }
        let pp = ProjectPaths::new(entry.path());
        match load_manifest(&pp) {
            Ok(m) => out.push(summary(&pp, m)),
            Err(e) => log::warn!("skipping {:?}: {e}", entry.path()),
        }
    }
    out.sort_by(|a, b| b.manifest.modified.cmp(&a.manifest.modified));
    Ok(out)
}

pub fn get(paths: &Paths, id: &str) -> Result<ProjectSummary> {
    let pp = paths.project(id)?;
    let m = load_manifest(&pp)?;
    Ok(summary(&pp, m))
}

pub fn create(paths: &Paths, input: NewProject) -> Result<ProjectSummary> {
    let title = input.title.trim().to_string();
    if title.is_empty() {
        return Err(AppError::invalid("title is required"));
    }
    if title.len() > 200 {
        return Err(AppError::invalid("title is too long"));
    }
    templates::get(&input.template)?;
    let id = uuid::Uuid::new_v4().to_string();
    let pp = paths.project(&id)?;
    pp.ensure_dirs()?;
    let opts = ScaffoldOptions {
        title: title.clone(),
        subtitle: input.subtitle.clone(),
        tagline: input.tagline.clone(),
        description: input.description.clone(),
        author: input.author.clone().filter(|a| !a.trim().is_empty()).unwrap_or_else(|| "Paris Blaisdell-Pijuan, Ph.D.".into()),
        version: "0.1.0".into(),
        units: input.units,
        subunits: input.subunits,
        appendices: input.appendices,
    };
    let main_file = match templates::scaffold(&input.template, &pp.src(), &opts) {
        Ok(m) => m,
        Err(e) => {
            let _ = fs::remove_dir_all(&pp.root);
            return Err(e);
        }
    };
    let now = Utc::now();
    let m = ProjectManifest {
        id: id.clone(),
        title,
        topic: input.topic.map(|t| t.trim().to_string()).filter(|t| !t.is_empty()),
        template: input.template,
        created: now,
        modified: now,
        archived: false,
        favorite: false,
        main_file,
        engine: None,
        last_opened_file: None,
    };
    save_manifest(&pp, &m)?;
    Ok(summary(&pp, m))
}

pub fn update_meta(paths: &Paths, id: &str, upd: ProjectMetaUpdate) -> Result<ProjectSummary> {
    let pp = paths.project(id)?;
    let mut m = load_manifest(&pp)?;
    if let Some(t) = upd.title {
        let t = t.trim().to_string();
        if t.is_empty() {
            return Err(AppError::invalid("title is required"));
        }
        m.title = t;
    }
    if let Some(topic) = upd.topic {
        m.topic = topic.map(|t| t.trim().to_string()).filter(|t| !t.is_empty());
    }
    if let Some(fav) = upd.favorite {
        m.favorite = fav;
    }
    if let Some(engine) = upd.engine {
        m.engine = engine.filter(|e| crate::settings::ENGINES.contains(&e.as_str()));
    }
    if let Some(main) = upd.main_file {
        let p = pp.src_path(&main)?;
        if !p.is_file() {
            return Err(AppError::not_found(format!("{main}")));
        }
        m.main_file = main;
    }
    if let Some(last) = upd.last_opened_file {
        m.last_opened_file = last;
    }
    m.modified = Utc::now();
    save_manifest(&pp, &m)?;
    Ok(summary(&pp, m))
}

pub fn set_archived(paths: &Paths, id: &str, archived: bool) -> Result<ProjectSummary> {
    let pp = paths.project(id)?;
    let mut m = load_manifest(&pp)?;
    m.archived = archived;
    m.modified = Utc::now();
    save_manifest(&pp, &m)?;
    Ok(summary(&pp, m))
}

/// Bump `modified` without rewriting anything else (called after file writes).
pub fn touch(paths: &Paths, id: &str) -> Result<()> {
    let pp = paths.project(id)?;
    let mut m = load_manifest(&pp)?;
    m.modified = Utc::now();
    save_manifest(&pp, &m)
}

/// Move the whole project folder into `.trash/<id>-<stamp>` (never a hard delete).
pub fn delete(paths: &Paths, id: &str) -> Result<()> {
    let pp = paths.project(id)?;
    if !pp.root.is_dir() {
        return Err(AppError::not_found("project"));
    }
    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let dest = paths.trash_dir().join(format!("{id}-{stamp}"));
    fs::rename(&pp.root, &dest).or_else(|_| {
        fsutil::copy_dir(&pp.root, &dest)?;
        fs::remove_dir_all(&pp.root)?;
        Ok::<(), AppError>(())
    })?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub bytes: u64,
}

pub fn export_zip(paths: &Paths, id: &str, dest: &Path) -> Result<ExportResult> {
    let pp = paths.project(id)?;
    let m = load_manifest(&pp)?;
    let prefix = format!("tx.{}", slug(&m.title));
    let bytes = fsutil::zip_dir(&pp.src(), dest, Some(&prefix))?;
    Ok(ExportResult { path: dest.to_string_lossy().into_owned(), bytes })
}

pub fn export_pdf(paths: &Paths, id: &str, dest: &Path) -> Result<ExportResult> {
    let pp = paths.project(id)?;
    if !pp.output_pdf().is_file() {
        return Err(AppError::not_found("no compiled PDF yet — compile first"));
    }
    let bytes = fsutil::copy_file_atomic(&pp.output_pdf(), dest)?;
    Ok(ExportResult { path: dest.to_string_lossy().into_owned(), bytes })
}

pub fn slug(title: &str) -> String {
    let mut s: String = title.to_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    while s.contains("--") {
        s = s.replace("--", "-");
    }
    let s = s.trim_matches('-').to_string();
    if s.is_empty() { "project".into() } else { s }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn paths() -> (tempfile::TempDir, Paths) {
        let dir = tempfile::tempdir().unwrap();
        let p = Paths::new(dir.path().to_path_buf()).unwrap();
        (dir, p)
    }

    fn new_input(title: &str, template: &str) -> NewProject {
        NewProject {
            title: title.into(),
            topic: Some("Energy".into()),
            template: template.into(),
            subtitle: String::new(),
            tagline: String::new(),
            description: String::new(),
            author: None,
            units: Some(2),
            subunits: Some(1),
            appendices: Some(1),
        }
    }

    #[test]
    fn create_list_update_archive_delete() {
        let (_d, paths) = paths();
        let p = create(&paths, new_input("My Model", "project")).unwrap();
        assert_eq!(p.manifest.title, "My Model");
        assert!(p.file_count > 5);
        assert!(!p.has_output);

        let all = list(&paths).unwrap();
        assert_eq!(all.len(), 1);

        let p2 = update_meta(&paths, &p.manifest.id, ProjectMetaUpdate { title: Some("Renamed".into()), favorite: Some(true), topic: Some(None), engine: None, main_file: None, last_opened_file: None }).unwrap();
        assert_eq!(p2.manifest.title, "Renamed");
        assert_eq!(p2.manifest.topic, None);
        assert!(p2.manifest.favorite);
        let p2b = update_meta(&paths, &p.manifest.id, serde_json::from_str(r#"{"favorite":false}"#).unwrap()).unwrap();
        assert!(!p2b.manifest.favorite);

        let p3 = set_archived(&paths, &p.manifest.id, true).unwrap();
        assert!(p3.manifest.archived);

        let zip = paths.root.join("out.zip");
        let r = export_zip(&paths, &p.manifest.id, &zip).unwrap();
        assert!(r.bytes > 0);
        assert!(export_pdf(&paths, &p.manifest.id, &paths.root.join("x.pdf")).is_err());

        delete(&paths, &p.manifest.id).unwrap();
        assert!(list(&paths).unwrap().is_empty());
        assert_eq!(fs::read_dir(paths.trash_dir()).unwrap().count(), 1);
    }

    #[test]
    fn meta_update_distinguishes_absent_null_and_value() {
        let absent: ProjectMetaUpdate = serde_json::from_str(r#"{"title":"T"}"#).unwrap();
        assert!(absent.topic.is_none(), "absent → unchanged");
        let cleared: ProjectMetaUpdate = serde_json::from_str(r#"{"topic":null}"#).unwrap();
        assert_eq!(cleared.topic, Some(None), "null → clear");
        let set: ProjectMetaUpdate = serde_json::from_str(r#"{"topic":"Energy","lastOpenedFile":null}"#).unwrap();
        assert_eq!(set.topic, Some(Some("Energy".into())));
        assert_eq!(set.last_opened_file, Some(None));

        let (_d, paths) = paths();
        let p = create(&paths, new_input("Topic Test", "minimal")).unwrap();
        assert_eq!(p.manifest.topic.as_deref(), Some("Energy"));
        let upd: ProjectMetaUpdate = serde_json::from_str(r#"{"topic":null}"#).unwrap();
        let p2 = update_meta(&paths, &p.manifest.id, upd).unwrap();
        assert_eq!(p2.manifest.topic, None, "the Rename dialog can clear a topic");
    }

    #[test]
    fn rejects_bad_input() {
        let (_d, paths) = paths();
        assert!(create(&paths, new_input("   ", "project")).is_err());
        assert!(create(&paths, new_input("x", "nope")).is_err());
        assert!(get(&paths, "../etc").is_err());
    }
}
