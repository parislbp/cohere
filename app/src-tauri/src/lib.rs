//! Cohere — a local-first LaTeX writing desk.

pub mod commands;
pub mod compile;
pub mod error;
pub mod files;
pub mod fsutil;
pub mod library;
pub mod logparse;
pub mod paths;
pub mod settings;
pub mod state;
pub mod templates;
pub mod texbin;
pub mod texinstall;
pub mod uninstall;
pub mod updater;
pub mod versions;
pub mod window;

use tauri::Manager;

use crate::paths::Paths;
use crate::state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updater::UpdaterState::default())
        .setup(|app| {
            let data_dir = match std::env::var_os("COHERE_DATA_DIR") {
                Some(dir) => std::path::PathBuf::from(dir),
                None => dev_or_release_data_dir(app.path().app_data_dir()?),
            };
            let paths = Paths::new(data_dir)?;
            let state = AppState::new(paths);
            app.manage(state);
            if let Some(main) = app.get_webview_window("main") {
                window::hide_native_window_buttons(&main);
            }
            // Warm the TeX detection in the background so the first compile does not pay for it.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                let st = handle.state::<AppState>();
                let _ = st.tex(false);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_app_info,
            commands::get_settings,
            commands::save_settings,
            commands::detect_tex,
            commands::install_tex,
            commands::cancel_tex_install,
            commands::remove_tex,
            commands::tex_install_status,
            commands::app_footprint,
            commands::remove_cohere,
            updater::check_update,
            updater::install_update,
            commands::list_templates,
            commands::list_projects,
            commands::get_project,
            commands::create_project,
            commands::update_project,
            commands::archive_project,
            commands::delete_project,
            commands::export_project_zip,
            commands::export_project_pdf,
            commands::open_project,
            commands::list_tree,
            commands::read_file,
            commands::read_file_bytes,
            commands::write_file,
            commands::create_file,
            commands::create_folder,
            commands::rename_entry,
            commands::delete_entry,
            commands::import_files,
            commands::compile_project,
            commands::cancel_compile,
            commands::read_output_pdf,
            commands::get_output_info,
            commands::read_output_log,
            commands::clean_build,
            commands::list_versions,
            commands::create_version,
            commands::rename_version,
            commands::delete_version,
            commands::export_version,
            commands::read_version_pdf,
            commands::next_version_name,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Cohere");
}

/// `tauri dev` keeps its own library (`<identifier>.dev`) so hacking on the app never touches
/// the projects of the installed copy. Release builds use the plain identifier directory.
fn dev_or_release_data_dir(release_dir: std::path::PathBuf) -> std::path::PathBuf {
    if cfg!(debug_assertions) {
        let name = release_dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "com.cohere.desk".into());
        release_dir.with_file_name(format!("{name}.dev"))
    } else {
        release_dir
    }
}
