//! The IPC surface. Thin wrappers: validate → call a module → return serialisable data.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::ipc::Response;
use tauri::{AppHandle, Manager, State};

use crate::compile::{self, CompileRequest, CompileResult, OutputInfo};
use crate::error::{AppError, Result};
use crate::files::{self, FileContent, FileNode, FileStat};
use crate::library::{self, ExportResult, NewProject, ProjectMetaUpdate, ProjectSummary};
use crate::settings::Settings;
use crate::state::AppState;
use crate::templates::{self, TemplateInfo};
use crate::texbin::TexInfo;
use crate::texinstall;
use crate::uninstall::{self, Footprint, RemovalReport};
use crate::versions::{self, VersionInfo};

// ── app / settings ───────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub data_dir: String,
    pub identifier: String,
    /// True for `tauri dev` builds (separate data directory, no update checks).
    pub dev: bool,
    pub tex: TexInfo,
    pub themes: Vec<&'static str>,
    pub motions: Vec<&'static str>,
    pub engines: Vec<&'static str>,
}

#[tauri::command]
pub fn get_app_info(app: AppHandle, state: State<'_, AppState>) -> Result<AppInfo> {
    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        data_dir: state.paths.root.to_string_lossy().into_owned(),
        identifier: app.config().identifier.clone(),
        dev: cfg!(debug_assertions),
        tex: state.tex(false)?,
        themes: crate::settings::THEMES.to_vec(),
        motions: crate::settings::MOTIONS.to_vec(),
        engines: crate::settings::ENGINES.to_vec(),
    })
}

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> Result<Settings> {
    state.settings()
}

#[tauri::command]
pub fn save_settings(state: State<'_, AppState>, settings: Settings) -> Result<Settings> {
    state.replace_settings(settings)
}

#[tauri::command]
pub fn detect_tex(state: State<'_, AppState>) -> Result<TexInfo> {
    state.tex(true)
}

// ── private TeX install ──────────────────────────────────────────────────────

/// Starts the installer in the background; progress arrives on `tex-install:event`.
#[tauri::command]
pub fn install_tex(app: AppHandle, state: State<'_, AppState>) -> Result<()> {
    if state.tex_installer.is_running() {
        return Err(AppError::Conflict("a TeX installation is already running".into()));
    }
    let installer = state.tex_installer.clone();
    let data_dir = state.paths.root.clone();
    std::thread::spawn(move || {
        let ok = installer.run(&app, &data_dir).is_ok();
        // Refresh detection so the new bin directory is picked up (or a failed attempt is cleared).
        let st = app.state::<AppState>();
        let _ = st.tex(true);
        if !ok {
            let _ = texinstall::remove(&data_dir);
        }
    });
    Ok(())
}

#[tauri::command]
pub fn cancel_tex_install(state: State<'_, AppState>) -> Result<()> {
    state.tex_installer.cancel();
    Ok(())
}

#[tauri::command]
pub fn remove_tex(state: State<'_, AppState>) -> Result<TexInfo> {
    if state.tex_installer.is_running() {
        return Err(AppError::Conflict("wait for the running installation to finish or cancel it".into()));
    }
    texinstall::remove(&state.paths.root)?;
    state.tex(true)
}

#[tauri::command]
pub fn tex_install_status(state: State<'_, AppState>) -> Result<TexInstallStatus> {
    Ok(TexInstallStatus { running: state.tex_installer.is_running(), installed_bin: texinstall::installed_bin(&state.paths.root).map(|p| p.to_string_lossy().into_owned()), bytes: texinstall::size_on_disk(&state.paths.root) })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TexInstallStatus {
    pub running: bool,
    pub installed_bin: Option<String>,
    pub bytes: u64,
}

// ── remove Cohere ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn app_footprint(app: AppHandle, state: State<'_, AppState>) -> Result<Footprint> {
    uninstall::footprint(&state.paths, &app.config().identifier)
}

/// Exports (optional), trashes everything and quits. Returns only when something could not be moved.
#[tauri::command]
pub fn remove_cohere(app: AppHandle, state: State<'_, AppState>, export_dir: Option<String>) -> Result<RemovalReport> {
    let report = uninstall::remove_everything(&state.paths, &app.config().identifier, export_dir.as_deref().map(std::path::Path::new))?;
    if report.skipped.is_empty() {
        std::thread::spawn(move || {
            std::thread::sleep(std::time::Duration::from_millis(1200));
            app.exit(0);
        });
    }
    Ok(report)
}

// ── templates ────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_templates() -> Vec<TemplateInfo> {
    templates::list()
}

// ── library ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_projects(state: State<'_, AppState>) -> Result<Vec<ProjectSummary>> {
    library::list(&state.paths)
}

#[tauri::command]
pub fn get_project(state: State<'_, AppState>, id: String) -> Result<ProjectSummary> {
    library::get(&state.paths, &id)
}

#[tauri::command]
pub fn create_project(state: State<'_, AppState>, input: NewProject) -> Result<ProjectSummary> {
    library::create(&state.paths, input)
}

#[tauri::command]
pub fn update_project(state: State<'_, AppState>, id: String, update: ProjectMetaUpdate) -> Result<ProjectSummary> {
    library::update_meta(&state.paths, &id, update)
}

#[tauri::command]
pub fn archive_project(state: State<'_, AppState>, id: String, archived: bool) -> Result<ProjectSummary> {
    library::set_archived(&state.paths, &id, archived)
}

#[tauri::command]
pub fn delete_project(state: State<'_, AppState>, id: String) -> Result<()> {
    if state.compiler.is_running(&id) {
        state.compiler.cancel(&id);
    }
    library::delete(&state.paths, &id)
}

#[tauri::command]
pub fn export_project_zip(state: State<'_, AppState>, id: String, dest: String) -> Result<ExportResult> {
    library::export_zip(&state.paths, &id, &PathBuf::from(dest))
}

#[tauri::command]
pub fn export_project_pdf(state: State<'_, AppState>, id: String, dest: String) -> Result<ExportResult> {
    library::export_pdf(&state.paths, &id, &PathBuf::from(dest))
}

// ── files ────────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDetail {
    pub project: ProjectSummary,
    pub tree: Vec<FileNode>,
    pub output: Option<OutputInfo>,
    pub versions: Vec<VersionInfo>,
    pub compiling: bool,
    /// Absolute path of the project's `src/` folder (for reveal-in-Finder).
    pub src_dir: String,
}

#[tauri::command]
pub fn open_project(state: State<'_, AppState>, id: String) -> Result<ProjectDetail> {
    let pp = state.paths.project(&id)?;
    let project = library::get(&state.paths, &id)?;
    Ok(ProjectDetail { tree: files::tree(&pp)?, output: compile::read_output_info(&pp), versions: versions::list(&pp)?, compiling: state.compiler.is_running(&id), src_dir: pp.src().to_string_lossy().into_owned(), project })
}

#[tauri::command]
pub fn list_tree(state: State<'_, AppState>, id: String) -> Result<Vec<FileNode>> {
    files::tree(&state.paths.project(&id)?)
}

#[tauri::command]
pub fn read_file(state: State<'_, AppState>, id: String, path: String) -> Result<FileContent> {
    files::read(&state.paths.project(&id)?, &path)
}

#[tauri::command]
pub fn read_file_bytes(state: State<'_, AppState>, id: String, path: String) -> Result<Response> {
    Ok(Response::new(files::read_bytes(&state.paths.project(&id)?, &path)?))
}

#[tauri::command]
pub fn write_file(state: State<'_, AppState>, id: String, path: String, text: String) -> Result<FileStat> {
    let pp = state.paths.project(&id)?;
    let stat = files::write(&pp, &path, &text)?;
    library::touch(&state.paths, &id)?;
    Ok(stat)
}

#[tauri::command]
pub fn create_file(state: State<'_, AppState>, id: String, path: String, content: Option<String>) -> Result<FileNode> {
    let pp = state.paths.project(&id)?;
    let node = files::create_file(&pp, &path, content.as_deref())?;
    library::touch(&state.paths, &id)?;
    Ok(node)
}

#[tauri::command]
pub fn create_folder(state: State<'_, AppState>, id: String, path: String) -> Result<FileNode> {
    let pp = state.paths.project(&id)?;
    let node = files::create_folder(&pp, &path)?;
    library::touch(&state.paths, &id)?;
    Ok(node)
}

#[tauri::command]
pub fn rename_entry(state: State<'_, AppState>, id: String, from: String, to: String) -> Result<FileNode> {
    let pp = state.paths.project(&id)?;
    let node = files::rename(&pp, &from, &to)?;
    library::touch(&state.paths, &id)?;
    Ok(node)
}

#[tauri::command]
pub fn delete_entry(state: State<'_, AppState>, id: String, path: String) -> Result<()> {
    let pp = state.paths.project(&id)?;
    files::delete(&pp, &path)?;
    library::touch(&state.paths, &id)
}

#[tauri::command]
pub fn import_files(state: State<'_, AppState>, id: String, dest_dir: String, sources: Vec<String>) -> Result<Vec<FileNode>> {
    let pp = state.paths.project(&id)?;
    let nodes = files::import(&pp, &dest_dir, &sources)?;
    library::touch(&state.paths, &id)?;
    Ok(nodes)
}

// ── compile ──────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileOptions {
    pub engine: Option<String>,
}

#[tauri::command]
pub async fn compile_project(app: AppHandle, state: State<'_, AppState>, id: String, options: Option<CompileOptions>) -> Result<CompileResult> {
    let paths = state.paths.clone();
    let pp = paths.project(&id)?;
    let manifest = library::load_manifest(&pp)?;
    let settings = state.settings()?;
    let tex = state.tex(false)?;
    let Some(bin) = tex.bin_dir.clone() else {
        return Err(AppError::Tex("no TeX installation found — install MacTeX or set the TeX bin directory in Settings → Compiler".into()));
    };
    let engine = options.and_then(|o| o.engine).or(manifest.engine.clone()).unwrap_or(settings.engine.clone());
    // latexmk blocks; run it off the async runtime thread so the UI stays responsive.
    let compiler = state.compiler.clone();
    let app2 = app.clone();
    let result = tauri::async_runtime::spawn_blocking({
        let id = id.clone();
        let main_file = manifest.main_file.clone();
        let pp = pp.clone();
        let shell_escape = settings.shell_escape;
        let synctex = settings.synctex;
        move || {
            let req = CompileRequest { project_id: &id, paths: &pp, main_file: &main_file, engine: &engine, tex_bin_dir: &bin, shell_escape, synctex };
            compiler.run(&app2, req)
        }
    })
    .await
    .map_err(|e| AppError::other(format!("compile task failed: {e}")))??;
    library::touch(&paths, &id)?;
    Ok(result)
}

#[tauri::command]
pub fn cancel_compile(state: State<'_, AppState>, id: String) -> bool {
    state.compiler.cancel(&id)
}

#[tauri::command]
pub fn read_output_pdf(state: State<'_, AppState>, id: String) -> Result<Response> {
    let pp = state.paths.project(&id)?;
    let bytes = std::fs::read(pp.output_pdf()).map_err(|_| AppError::not_found("no compiled PDF yet"))?;
    Ok(Response::new(bytes))
}

#[tauri::command]
pub fn get_output_info(state: State<'_, AppState>, id: String) -> Result<Option<OutputInfo>> {
    Ok(compile::read_output_info(&state.paths.project(&id)?))
}

#[tauri::command]
pub fn read_output_log(state: State<'_, AppState>, id: String) -> Result<String> {
    compile::read_output_log(&state.paths.project(&id)?)
}

#[tauri::command]
pub fn clean_build(state: State<'_, AppState>, id: String) -> Result<()> {
    compile::clean_build(&state.paths.project(&id)?)
}

// ── versions ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_versions(state: State<'_, AppState>, id: String) -> Result<Vec<VersionInfo>> {
    versions::list(&state.paths.project(&id)?)
}

#[tauri::command]
pub fn create_version(state: State<'_, AppState>, id: String, name: String, note: String) -> Result<VersionInfo> {
    let pp = state.paths.project(&id)?;
    let v = versions::create(&pp, &name, &note)?;
    library::touch(&state.paths, &id)?;
    Ok(v)
}

#[tauri::command]
pub fn rename_version(state: State<'_, AppState>, id: String, vid: String, name: String, note: Option<String>) -> Result<VersionInfo> {
    versions::rename(&state.paths.project(&id)?, &vid, &name, note.as_deref())
}

#[tauri::command]
pub fn delete_version(state: State<'_, AppState>, id: String, vid: String) -> Result<()> {
    versions::delete(&state.paths.project(&id)?, &vid)
}

#[tauri::command]
pub fn export_version(state: State<'_, AppState>, id: String, vid: String, kind: String, dest: String) -> Result<ExportResult> {
    let bytes = versions::export(&state.paths.project(&id)?, &vid, &kind, &PathBuf::from(&dest))?;
    Ok(ExportResult { path: dest, bytes })
}

#[tauri::command]
pub fn read_version_pdf(state: State<'_, AppState>, id: String, vid: String) -> Result<Response> {
    Ok(Response::new(versions::read_pdf(&state.paths.project(&id)?, &vid)?))
}

#[tauri::command]
pub fn next_version_name(state: State<'_, AppState>, id: String) -> Result<String> {
    Ok(versions::next_default_name(&state.paths.project(&id)?))
}
