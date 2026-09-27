//! Run latexmk for a project, stream its output as events, then parse logs into diagnostics
//! and publish the PDF atomically into `output/`.

use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Instant, SystemTime};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

/// Where progress goes: the Tauri event bus in the app, a collector in tests.
pub trait Sink: Send + Sync {
    fn log(&self, ev: CompileLogEvent);
    fn status(&self, ev: CompileStatusEvent);
}

impl Sink for AppHandle {
    fn log(&self, ev: CompileLogEvent) {
        let _ = self.emit("compile:log", ev);
    }
    fn status(&self, ev: CompileStatusEvent) {
        let _ = self.emit("compile:status", ev);
    }
}

use crate::error::{AppError, Result};
use crate::fsutil;
use crate::logparse::{self, Diagnostic, Severity};
use crate::paths::ProjectPaths;
use crate::texbin;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OutputInfo {
    pub path: String,
    pub bytes: u64,
    pub compiled_at: DateTime<Utc>,
    pub pages: Option<u32>,
    pub engine: String,
    pub duration_ms: u64,
    #[serde(default)]
    pub error_count: usize,
    #[serde(default)]
    pub warning_count: usize,
    #[serde(default)]
    pub has_synctex: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileResult {
    pub status: String,
    pub ok: bool,
    pub duration_ms: u64,
    pub engine: String,
    pub command: String,
    pub exit_code: Option<i32>,
    pub output: Option<OutputInfo>,
    pub diagnostics: Vec<Diagnostic>,
    pub error_count: usize,
    pub warning_count: usize,
    pub log_tail: String,
    pub pdf_updated: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileLogEvent {
    pub project_id: String,
    pub job: u64,
    pub stream: String,
    pub line: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CompileStatusEvent {
    pub project_id: String,
    pub job: u64,
    pub status: String,
}

pub struct Job {
    child: Mutex<Option<Child>>,
    cancelled: AtomicBool,
}

#[derive(Default)]
pub struct Compiler {
    jobs: Mutex<HashMap<String, Arc<Job>>>,
    counter: Mutex<u64>,
}

pub struct CompileRequest<'a> {
    pub project_id: &'a str,
    pub paths: &'a ProjectPaths,
    pub main_file: &'a str,
    pub engine: &'a str,
    pub tex_bin_dir: &'a str,
    pub shell_escape: bool,
    pub synctex: bool,
}

impl Compiler {
    pub fn is_running(&self, project_id: &str) -> bool {
        self.jobs.lock().map(|j| j.contains_key(project_id)).unwrap_or(false)
    }

    pub fn cancel(&self, project_id: &str) -> bool {
        let job = self.jobs.lock().ok().and_then(|j| j.get(project_id).cloned());
        if let Some(job) = job {
            job.cancelled.store(true, Ordering::SeqCst);
            if let Ok(mut guard) = job.child.lock() {
                if let Some(child) = guard.as_mut() {
                    let _ = child.kill();
                }
            }
            true
        } else {
            false
        }
    }

    pub fn run(&self, app: &(impl Sink + Clone + 'static), req: CompileRequest<'_>) -> Result<CompileResult> {
        if self.is_running(req.project_id) {
            return Err(AppError::Conflict("a compile is already running for this project".into()));
        }
        let job_no = {
            let mut c = self.counter.lock().map_err(|_| AppError::other("lock"))?;
            *c += 1;
            *c
        };
        let job = Arc::new(Job { child: Mutex::new(None), cancelled: AtomicBool::new(false) });
        self.jobs.lock().map_err(|_| AppError::other("lock"))?.insert(req.project_id.to_string(), job.clone());
        let result = run_job(app, &req, job_no, &job);
        self.jobs.lock().map_err(|_| AppError::other("lock"))?.remove(req.project_id);
        result
    }
}

fn engine_flag(engine: &str) -> &'static str {
    match engine {
        "xelatex" => "-pdfxe",
        "lualatex" => "-pdflua",
        _ => "-pdf",
    }
}

fn emit_status(app: &impl Sink, project_id: &str, job: u64, status: &str) {
    app.status(CompileStatusEvent { project_id: project_id.into(), job, status: status.into() });
}

fn run_job(app: &(impl Sink + Clone + 'static), req: &CompileRequest<'_>, job_no: u64, job: &Arc<Job>) -> Result<CompileResult> {
    let pp = req.paths;
    pp.ensure_dirs()?;
    let main_path = pp.src_path(req.main_file)?;
    if !main_path.is_file() {
        return Err(AppError::not_found(format!("main file {} not found", req.main_file)));
    }
    let engine = if crate::settings::ENGINES.contains(&req.engine) { req.engine } else { "pdflatex" };
    let started = Instant::now();
    let started_sys = SystemTime::now();

    let mut args: Vec<String> = vec![
        engine_flag(engine).into(),
        "-interaction=nonstopmode".into(),
        "-file-line-error".into(),
        "-recorder".into(),
        format!("-outdir={}", pp.build().to_string_lossy()),
    ];
    if req.synctex {
        args.push("-synctex=1".into());
    }
    if req.shell_escape {
        args.push("-shell-escape".into());
    }
    args.push(req.main_file.to_string());
    let command_line = format!("latexmk {}", args.join(" "));
    emit_status(app, req.project_id, job_no, "running");
    app.log(CompileLogEvent { project_id: req.project_id.into(), job: job_no, stream: "cohere".into(), line: format!("$ {command_line}") });

    let mut child = Command::new(Path::new(req.tex_bin_dir).join("latexmk"))
        .args(&args)
        .current_dir(pp.src())
        .env("PATH", texbin::child_path(req.tex_bin_dir))
        .env("max_print_line", "10000")
        .env("error_line", "254")
        .env("half_error_line", "238")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::Tex(format!("could not start latexmk in {}: {e}", req.tex_bin_dir)))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    *job.child.lock().map_err(|_| AppError::other("lock"))? = Some(child);

    let collected = Arc::new(Mutex::new(String::new()));
    let mut readers = Vec::new();
    for (stream, pipe) in [("stdout", stdout.map(|s| Box::new(s) as Box<dyn std::io::Read + Send>)), ("stderr", stderr.map(|s| Box::new(s) as Box<dyn std::io::Read + Send>))] {
        let Some(pipe) = pipe else { continue };
        let app = app.clone();
        let pid = req.project_id.to_string();
        let collected = collected.clone();
        readers.push(std::thread::spawn(move || {
            // Read raw bytes: pdflatex echoes 8-bit characters as-is, and a `lines()` reader would stop
            // at the first invalid UTF-8 byte, close the pipe, and kill the engine with SIGPIPE.
            let mut reader = BufReader::new(pipe);
            let mut buf: Vec<u8> = Vec::with_capacity(512);
            loop {
                buf.clear();
                match reader.read_until(b'\n', &mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(_) => {}
                }
                let line = String::from_utf8_lossy(&buf).trim_end_matches(['\n', '\r']).to_string();
                if let Ok(mut c) = collected.lock() {
                    c.push_str(&line);
                    c.push('\n');
                }
                app.log(CompileLogEvent { project_id: pid.clone(), job: job_no, stream: stream.into(), line });
            }
        }));
    }
    for r in readers {
        let _ = r.join();
    }
    let status = {
        let mut guard = job.child.lock().map_err(|_| AppError::other("lock"))?;
        match guard.as_mut() {
            Some(c) => c.wait().ok(),
            None => None,
        }
    };
    let exit_code = status.and_then(|s| s.code());
    let cancelled = job.cancelled.load(Ordering::SeqCst);
    let duration_ms = started.elapsed().as_millis() as u64;
    let stdout_text = collected.lock().map(|c| c.clone()).unwrap_or_default();

    // ── logs → diagnostics ───────────────────────────────────────────────────
    let stem = Path::new(req.main_file).file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "main".into());
    let log_path = pp.build().join(format!("{stem}.log"));
    // Logs carry raw 8-bit bytes too; a strict UTF-8 read would drop the whole log.
    let log_text = fs::read(&log_path).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default();
    let summary = logparse::parse_latex_log(&log_text, Some(&pp.src()));
    let mut diagnostics = summary.diagnostics;
    let blg = pp.build().join(format!("{stem}.blg"));
    if let Ok(t) = fs::read(&blg).map(|b| String::from_utf8_lossy(&b).into_owned()) {
        if t.contains("Biber") {
            diagnostics.extend(logparse::parse_biber_log(&t));
        }
    }
    diagnostics.extend(logparse::parse_latexmk_output(&stdout_text));
    let warning_count = diagnostics.iter().filter(|d| d.severity == Severity::Warning).count();

    // ── publish the PDF if this run produced one ─────────────────────────────
    let built_pdf = pp.build().join(format!("{stem}.pdf"));
    let mut pdf_updated = false;
    let mut output: Option<OutputInfo> = None;
    let mut error_count = diagnostics.iter().filter(|d| d.severity == Severity::Error).count();
    if let Ok(meta) = fs::metadata(&built_pdf) {
        let fresh = meta.modified().map(|m| m >= started_sys - std::time::Duration::from_secs(2)).unwrap_or(true);
        let complete = pdf_is_complete(&built_pdf);
        if fresh && !cancelled && !complete {
            diagnostics.push(Diagnostic { severity: Severity::Error, file: None, line: None, message: "the engine stopped before finishing the PDF (truncated output) — see the log".into(), detail: tail(&stdout_text, 12), source: "latexmk".into() });
        }
        error_count = diagnostics.iter().filter(|d| d.severity == Severity::Error).count();
        if fresh && !cancelled && complete {
            let bytes = fsutil::copy_file_atomic(&built_pdf, &pp.output_pdf())?;
            pdf_updated = true;
            if log_path.is_file() {
                let _ = fsutil::copy_file_atomic(&log_path, &pp.output_log());
            }
            let synctex = pp.build().join(format!("{stem}.synctex.gz"));
            let has_synctex = synctex.is_file() && fsutil::copy_file_atomic(&synctex, &pp.output_synctex()).is_ok();
            let info = OutputInfo { path: pp.output_pdf().to_string_lossy().into_owned(), bytes, compiled_at: Utc::now(), pages: summary.pages, engine: engine.into(), duration_ms, error_count, warning_count, has_synctex };
            let _ = fsutil::write_atomic(&pp.output_meta(), serde_json::to_string_pretty(&info)?.as_bytes());
            output = Some(info);
        }
    }
    if output.is_none() {
        output = read_output_info(pp);
    }
    if !pdf_updated && log_path.is_file() {
        let _ = fsutil::copy_file_atomic(&log_path, &pp.output_log());
    }

    let status_str = if cancelled {
        "cancelled"
    } else if exit_code == Some(0) && error_count == 0 {
        "success"
    } else if pdf_updated {
        "errors"
    } else {
        "failed"
    };
    if !pdf_updated && !cancelled && error_count == 0 && exit_code != Some(0) {
        diagnostics.push(Diagnostic { severity: Severity::Error, file: None, line: None, message: format!("latexmk exited with code {} without producing a PDF", exit_code.map(|c| c.to_string()).unwrap_or_else(|| "?".into())), detail: tail(&stdout_text, 20), source: "latexmk".into() });
    }
    let error_count = diagnostics.iter().filter(|d| d.severity == Severity::Error).count();
    emit_status(app, req.project_id, job_no, status_str);

    Ok(CompileResult {
        status: status_str.into(),
        ok: status_str == "success",
        duration_ms,
        engine: engine.into(),
        command: command_line,
        exit_code,
        output,
        diagnostics,
        error_count,
        warning_count,
        log_tail: tail(&stdout_text, 40),
        pdf_updated,
    })
}

/// A finished PDF ends with `%%EOF` (possibly followed by a newline); a killed engine leaves it short.
fn pdf_is_complete(path: &Path) -> bool {
    let Ok(mut f) = fs::File::open(path) else { return false };
    let Ok(meta) = f.metadata() else { return false };
    let len = meta.len();
    if len < 32 {
        return false;
    }
    use std::io::{Read, Seek, SeekFrom};
    let start = len.saturating_sub(1024);
    if f.seek(SeekFrom::Start(start)).is_err() {
        return false;
    }
    let mut buf = Vec::new();
    if f.read_to_end(&mut buf).is_err() {
        return false;
    }
    String::from_utf8_lossy(&buf).contains("%%EOF")
}

fn tail(text: &str, n: usize) -> String {
    let lines: Vec<&str> = text.lines().collect();
    let start = lines.len().saturating_sub(n);
    lines[start..].join("\n")
}

pub fn read_output_info(pp: &ProjectPaths) -> Option<OutputInfo> {
    let text = fs::read_to_string(pp.output_meta()).ok()?;
    let mut info: OutputInfo = serde_json::from_str(&text).ok()?;
    if !pp.output_pdf().is_file() {
        return None;
    }
    info.path = pp.output_pdf().to_string_lossy().into_owned();
    Some(info)
}

pub fn read_output_log(pp: &ProjectPaths) -> Result<String> {
    Ok(fs::read(pp.output_log()).map(|b| String::from_utf8_lossy(&b).into_owned()).unwrap_or_default())
}

pub fn clean_build(pp: &ProjectPaths) -> Result<()> {
    if pp.build().is_dir() {
        fs::remove_dir_all(pp.build())?;
    }
    fs::create_dir_all(pp.build())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::templates::{self, ScaffoldOptions};

    #[derive(Clone, Default)]
    struct Collector {
        logs: Arc<Mutex<Vec<CompileLogEvent>>>,
        statuses: Arc<Mutex<Vec<String>>>,
    }
    impl Sink for Collector {
        fn log(&self, ev: CompileLogEvent) {
            self.logs.lock().unwrap().push(ev);
        }
        fn status(&self, ev: CompileStatusEvent) {
            self.statuses.lock().unwrap().push(ev.status);
        }
    }

    fn opts(title: &str) -> ScaffoldOptions {
        ScaffoldOptions { title: title.into(), subtitle: String::new(), tagline: String::new(), description: String::new(), author: "A".into(), version: "0.1.0".into(), units: Some(2), subunits: Some(1), appendices: Some(1) }
    }

    /// Runs the real latexmk when a TeX installation is present; otherwise it is a no-op.
    #[test]
    fn compiles_a_scaffolded_project_with_real_tex() {
        let tex = texbin::locate(None);
        let Some(bin) = tex.bin_dir.clone() else {
            eprintln!("skipping: no TeX installation found");
            return;
        };
        let dir = tempfile::tempdir().unwrap();
        let pp = ProjectPaths::new(dir.path().join("p"));
        pp.ensure_dirs().unwrap();
        templates::scaffold("minimal", &pp.src(), &opts("Real Compile")).unwrap();

        let sink = Collector::default();
        let compiler = Compiler::default();
        let result = compiler
            .run(&sink, CompileRequest { project_id: "p", paths: &pp, main_file: "main.tex", engine: "pdflatex", tex_bin_dir: &bin, shell_escape: false, synctex: true })
            .unwrap();
        assert_eq!(result.status, "success", "log tail:\n{}", result.log_tail);
        assert!(result.pdf_updated);
        assert!(pp.output_pdf().is_file());
        assert!(pp.output_meta().is_file());
        assert!(pp.output_synctex().is_file(), "synctex copied");
        let out = result.output.expect("output info");
        assert!(out.pages.unwrap_or(0) >= 1);
        assert_eq!(result.error_count, 0);
        let statuses = sink.statuses.lock().unwrap().clone();
        assert_eq!(statuses.first().map(String::as_str), Some("running"));
        assert_eq!(statuses.last().map(String::as_str), Some("success"));
        assert!(sink.logs.lock().unwrap().iter().any(|l| l.line.contains("latexmk")));

        // pdflatex echoes 8-bit bytes raw (cp227.tcx); the reader must survive them and the engine must finish.
        let main = pp.src().join("main.tex");
        let text = fs::read_to_string(&main).unwrap();
        fs::write(&main, text.replace("\\begin{document}", "\\begin{document}\n\\typeout{raw bytes: ^^e9^^d0^^d4 ok}")).unwrap();
        let result = compiler
            .run(&sink, CompileRequest { project_id: "p", paths: &pp, main_file: "main.tex", engine: "pdflatex", tex_bin_dir: &bin, shell_escape: false, synctex: true })
            .unwrap();
        assert_eq!(result.status, "success", "8-bit terminal output must not kill the engine:\n{}", result.log_tail);
        assert!(result.output.as_ref().and_then(|o| o.pages).unwrap_or(0) >= 1);
        assert!(pdf_is_complete(&pp.output_pdf()));
        assert!(!pdf_is_complete(&pp.output_meta()), "a non-PDF is not complete");

        // now break it: an undefined command must yield an attributed error and still a PDF
        let main = pp.src().join("main.tex");
        let text = fs::read_to_string(&main).unwrap();
        fs::write(&main, text.replace("\\begin{document}", "\\begin{document}\nHello \\definitelyundefined here.")).unwrap();
        let result = compiler
            .run(&sink, CompileRequest { project_id: "p", paths: &pp, main_file: "main.tex", engine: "pdflatex", tex_bin_dir: &bin, shell_escape: false, synctex: false })
            .unwrap();
        assert_eq!(result.status, "errors", "log tail:\n{}", result.log_tail);
        let err = result.diagnostics.iter().find(|d| d.severity == Severity::Error).expect("an error diagnostic");
        assert_eq!(err.file.as_deref(), Some("main.tex"));
        assert!(err.line.is_some());
        assert!(err.message.contains("Undefined control sequence"));
        assert!(result.pdf_updated, "nonstopmode still produces a PDF");
    }
}
