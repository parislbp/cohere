//! "Install TeX for Cohere" — a private, portable TeX Live inside the data directory holding
//! only what the built-in templates need (≈ 400 MB instead of MacTeX's 5 GB).
//!
//! ```text
//! <data>/texlive/
//! ├── .installer/          install-tl-unx.tar.gz + the unpacked installer (removed afterwards)
//! ├── cohere.profile       the answers install-tl was given
//! └── tl/                  TEXDIR — portable install: bin/<arch>, texmf-dist, texmf-var, …
//! ```
//!
//! Phases, each streamed on the `tex-install:event` event: `download` (install-tl, ≈ 6 MB),
//! `install` (scheme-basic through install-tl), `packages` (tlmgr install …), `verify`
//! (latexmk compiles a probe document). Network is used only by `download`, `install` and
//! `packages`, all of which talk to the CTAN mirror network.

use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Serialize;

use crate::error::{AppError, Result};
use crate::texbin;

pub const INSTALLER_URL: &str = "https://mirror.ctan.org/systems/texlive/tlnet/install-tl-unx.tar.gz";
pub const EVENT: &str = "tex-install:event";

/// Everything the five templates load (`\usepackage` / `\RequirePackage`), plus the drivers.
/// tlmgr pulls dependencies itself, so this list only has to name what the sources mention.
pub const PACKAGES: &[&str] = &[
    "latexmk", "latex-bin", "biber", "biblatex", "logreq",
    "amsmath", "amsfonts", "amscls", "tools", "graphics", "hyperref", "url",
    "booktabs", "caption", "colortbl", "enumitem", "etoolbox", "fancyhdr", "geometry",
    "lettrine", "listings", "mathtools", "microtype", "multirow", "needspace", "parskip",
    "setspace", "xltabular", "ltablex", "tcolorbox", "environ", "trimspaces",
    "pgf", "titlesec", "tocloft", "xcolor", "float", "bookmark",
    "cm-super", "lm", "ec", "fontspec", "xetex", "luatex", "luaotfload", "lualibs",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TexInstallEvent {
    /// download · install · packages · verify · done · error · cancelled
    pub phase: String,
    pub line: Option<String>,
    /// 0..1 within the current phase when the tool reports counts.
    pub progress: Option<f32>,
    pub bin_dir: Option<String>,
}

pub trait Sink: Send + Sync {
    fn event(&self, ev: TexInstallEvent);
}

impl Sink for tauri::AppHandle {
    fn event(&self, ev: TexInstallEvent) {
        use tauri::Emitter;
        let _ = self.emit(EVENT, ev);
    }
}

pub fn root(data_dir: &Path) -> PathBuf {
    data_dir.join("texlive")
}

pub fn texdir(data_dir: &Path) -> PathBuf {
    root(data_dir).join("tl")
}

/// The bin directory of a completed private install, if any (latexmk arrives in the packages step,
/// so its presence is what separates a finished install from an interrupted one).
pub fn installed_bin(data_dir: &Path) -> Option<PathBuf> {
    bin_with(data_dir, &["latexmk", "pdflatex"])
}

/// The bin directory right after install-tl (core only).
fn core_bin(data_dir: &Path) -> Option<PathBuf> {
    bin_with(data_dir, &["tlmgr", "pdflatex"])
}

fn bin_with(data_dir: &Path, tools: &[&str]) -> Option<PathBuf> {
    let bin = texdir(data_dir).join("bin");
    let mut arches: Vec<PathBuf> = std::fs::read_dir(bin).ok()?.filter_map(|e| e.ok()).map(|e| e.path()).filter(|p| p.is_dir()).collect();
    arches.sort();
    arches.into_iter().find(|d| tools.iter().all(|t| d.join(t).is_file()))
}

/// Bytes used by the private install (0 when absent).
pub fn size_on_disk(data_dir: &Path) -> u64 {
    walkdir::WalkDir::new(root(data_dir)).into_iter().filter_map(|e| e.ok()).filter_map(|e| e.metadata().ok()).filter(|m| m.is_file()).map(|m| m.len()).sum()
}

/// install-tl profile: portable (everything under TEXDIR), no docs/sources, no PATH edits.
pub fn profile(texdir: &Path) -> String {
    format!(
        "selected_scheme scheme-basic\nTEXDIR {dir}\nTEXMFLOCAL {dir}/texmf-local\nTEXMFSYSCONFIG {dir}/texmf-config\nTEXMFSYSVAR {dir}/texmf-var\nTEXMFCONFIG {dir}/texmf-config\nTEXMFVAR {dir}/texmf-var\nTEXMFHOME {dir}/texmf-home\ninstopt_adjustpath 0\ninstopt_adjustrepo 1\ninstopt_letter 1\ninstopt_portable 1\ninstopt_write18_restricted 1\ntlpdbopt_autobackup 0\ntlpdbopt_backupdir tlpkg/backups\ntlpdbopt_create_formats 1\ntlpdbopt_desktop_integration 0\ntlpdbopt_file_assocs 0\ntlpdbopt_generate_updmap 0\ntlpdbopt_install_docfiles 0\ntlpdbopt_install_srcfiles 0\ntlpdbopt_post_code 1\n",
        dir = texdir.display()
    )
}

/// A probe document exercising the packages Cohere's templates lean on most.
pub const PROBE_TEX: &str = "\\documentclass{article}\n\\usepackage{booktabs,tabularx,enumitem,titlesec,microtype,xcolor,tikz,hyperref}\n\\begin{document}\n\\section{Cohere}\nTeX is ready. \\begin{tabular}{ll}\\toprule a & b\\\\\\bottomrule\\end{tabular}\n\\tikz\\draw (0,0) circle (2pt);\n\\end{document}\n";

pub struct Installer {
    cancel: AtomicBool,
    child: Mutex<Option<u32>>,
    running: AtomicBool,
}

impl Default for Installer {
    fn default() -> Self {
        Installer { cancel: AtomicBool::new(false), child: Mutex::new(None), running: AtomicBool::new(false) }
    }
}

impl Installer {
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }

    pub fn cancel(&self) {
        self.cancel.store(true, Ordering::SeqCst);
        if let Ok(g) = self.child.lock() {
            if let Some(pid) = *g {
                unsafe {
                    libc_kill(pid as i32);
                }
            }
        }
    }

    /// Blocking. Returns the bin directory on success.
    pub fn run(self: &Arc<Self>, sink: &(impl Sink + ?Sized), data_dir: &Path) -> Result<PathBuf> {
        if self.running.swap(true, Ordering::SeqCst) {
            return Err(AppError::Conflict("a TeX installation is already running".into()));
        }
        self.cancel.store(false, Ordering::SeqCst);
        let result = self.run_inner(sink, data_dir);
        self.running.store(false, Ordering::SeqCst);
        match &result {
            Ok(bin) => sink.event(TexInstallEvent { phase: "done".into(), line: Some("TeX for Cohere is ready".into()), progress: Some(1.0), bin_dir: Some(bin.to_string_lossy().into_owned()) }),
            Err(e) if self.cancel.load(Ordering::SeqCst) => sink.event(TexInstallEvent { phase: "cancelled".into(), line: Some(e.to_string()), progress: None, bin_dir: None }),
            Err(e) => sink.event(TexInstallEvent { phase: "error".into(), line: Some(e.to_string()), progress: None, bin_dir: None }),
        }
        result
    }

    fn check_cancel(&self) -> Result<()> {
        if self.cancel.load(Ordering::SeqCst) {
            Err(AppError::other("installation cancelled"))
        } else {
            Ok(())
        }
    }

    fn run_inner(self: &Arc<Self>, sink: &(impl Sink + ?Sized), data_dir: &Path) -> Result<PathBuf> {
        let root = root(data_dir);
        let texdir = texdir(data_dir);
        let stage = root.join(".installer");
        let _ = std::fs::remove_dir_all(&stage);
        std::fs::create_dir_all(&stage)?;

        // 1 · download install-tl
        say(sink, "download", format!("fetching install-tl from {INSTALLER_URL}"), Some(0.0));
        let tarball = stage.join("install-tl-unx.tar.gz");
        self.stream(sink, "download", Command::new("/usr/bin/curl").args(["-fL", "--retry", "3", "--connect-timeout", "20", "--silent", "--show-error", "-o"]).arg(&tarball).arg(INSTALLER_URL), None)?;
        self.check_cancel()?;
        if !tarball.is_file() {
            return Err(AppError::Tex("the installer download did not produce a file".into()));
        }
        say(sink, "download", "unpacking the installer".into(), Some(0.9));
        self.stream(sink, "download", Command::new("/usr/bin/tar").arg("xzf").arg(&tarball).arg("-C").arg(&stage), None)?;
        let installer_dir = std::fs::read_dir(&stage)?.filter_map(|e| e.ok()).map(|e| e.path()).find(|p| p.is_dir() && p.join("install-tl").is_file()).ok_or_else(|| AppError::Tex("install-tl was not found inside the archive".into()))?;

        // 2 · scheme-basic via install-tl
        let _ = std::fs::remove_dir_all(&texdir);
        std::fs::create_dir_all(&texdir)?;
        let profile_path = root.join("cohere.profile");
        std::fs::write(&profile_path, profile(&texdir))?;
        say(sink, "install", "installing the TeX Live core (scheme-basic, this is the long step)".into(), Some(0.0));
        let mut cmd = Command::new("/usr/bin/perl");
        cmd.arg(installer_dir.join("install-tl")).arg("-profile").arg(&profile_path).arg("-no-gui").current_dir(&installer_dir).env("TEXLIVE_INSTALL_NO_WELCOME", "1").env("TEXLIVE_INSTALL_ENV_NOCHECK", "1");
        self.stream(sink, "install", &mut cmd, Some(install_progress))?;
        self.check_cancel()?;
        let bin = core_bin(data_dir).ok_or_else(|| AppError::Tex("install-tl finished but no bin directory with tlmgr and pdflatex appeared".into()))?;

        // 3 · the packages the templates use
        say(sink, "packages", format!("adding {} packages", PACKAGES.len()), Some(0.0));
        let mut cmd = Command::new(bin.join("tlmgr"));
        cmd.arg("install").args(PACKAGES).env("PATH", texbin::child_path(&bin.to_string_lossy()));
        self.stream(sink, "packages", &mut cmd, Some(packages_progress))?;
        self.check_cancel()?;
        if installed_bin(data_dir).is_none() {
            return Err(AppError::Tex("tlmgr finished but latexmk is missing — the package step did not complete".into()));
        }

        // 4 · verify
        say(sink, "verify", "compiling a probe document with latexmk".into(), Some(0.0));
        let probe = stage.join("probe");
        std::fs::create_dir_all(&probe)?;
        std::fs::write(probe.join("probe.tex"), PROBE_TEX)?;
        let mut cmd = Command::new(bin.join("latexmk"));
        cmd.args(["-pdf", "-interaction=nonstopmode", "-halt-on-error", "probe.tex"]).current_dir(&probe).env("PATH", texbin::child_path(&bin.to_string_lossy()));
        self.stream(sink, "verify", &mut cmd, None)?;
        if !probe.join("probe.pdf").is_file() {
            return Err(AppError::Tex("the probe document did not compile — the installation is incomplete".into()));
        }
        let _ = std::fs::remove_dir_all(&stage);
        Ok(bin)
    }

    /// Run a command, forwarding each output line as an event; fail on a non-zero exit.
    fn stream(self: &Arc<Self>, sink: &(impl Sink + ?Sized), phase: &str, cmd: &mut Command, progress: Option<fn(&str) -> Option<f32>>) -> Result<()> {
        self.check_cancel()?;
        let mut child = cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| AppError::Tex(format!("could not start {:?}: {e}", cmd.get_program())))?;
        *self.child.lock().map_err(|_| AppError::other("lock"))? = Some(child.id());
        let (tx, rx) = std::sync::mpsc::channel::<String>();
        let mut handles = Vec::new();
        for pipe in [child.stdout.take().map(|p| Box::new(p) as Box<dyn Read + Send>), child.stderr.take().map(|p| Box::new(p) as Box<dyn Read + Send>)].into_iter().flatten() {
            let tx = tx.clone();
            handles.push(std::thread::spawn(move || {
                let mut reader = BufReader::new(pipe);
                let mut buf = Vec::with_capacity(256);
                loop {
                    buf.clear();
                    match reader.read_until(b'\n', &mut buf) {
                        Ok(0) | Err(_) => break,
                        Ok(_) => {}
                    }
                    let text = String::from_utf8_lossy(&buf);
                    for piece in text.split('\r') {
                        let line = piece.trim_end_matches('\n').trim_end();
                        if !line.is_empty() && tx.send(line.to_string()).is_err() {
                            return;
                        }
                    }
                }
            }));
        }
        drop(tx);
        for line in rx {
            let p = progress.and_then(|f| f(&line));
            sink.event(TexInstallEvent { phase: phase.into(), line: Some(line), progress: p, bin_dir: None });
        }
        for h in handles {
            let _ = h.join();
        }
        let status = child.wait()?;
        *self.child.lock().map_err(|_| AppError::other("lock"))? = None;
        self.check_cancel()?;
        if !status.success() {
            return Err(AppError::Tex(format!("{} exited with {}", Path::new(cmd.get_program()).file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default(), status.code().map(|c| c.to_string()).unwrap_or_else(|| "a signal".into()))));
        }
        Ok(())
    }
}

fn say(sink: &(impl Sink + ?Sized), phase: &str, line: String, progress: Option<f32>) {
    sink.event(TexInstallEvent { phase: phase.into(), line: Some(line), progress, bin_dir: None });
}

/// install-tl prints `Installing [0042/0123, time/total: 00:31/01:32]: name [12k]`.
pub fn install_progress(line: &str) -> Option<f32> {
    let start = line.find("Installing [")? + "Installing [".len();
    let rest = &line[start..];
    let end = rest.find(',')?;
    let (a, b) = rest[..end].split_once('/')?;
    let (a, b): (f32, f32) = (a.trim().parse().ok()?, b.trim().parse().ok()?);
    if b > 0.0 {
        Some((a / b).clamp(0.0, 1.0))
    } else {
        None
    }
}

/// tlmgr prints `[12/57, 00:10/00:45] install: name [34k]`.
pub fn packages_progress(line: &str) -> Option<f32> {
    let line = line.trim_start();
    let rest = line.strip_prefix('[')?;
    let end = rest.find(',')?;
    let (a, b) = rest[..end].split_once('/')?;
    let (a, b): (f32, f32) = (a.trim().parse().ok()?, b.trim().parse().ok()?);
    if b > 0.0 {
        Some((a / b).clamp(0.0, 1.0))
    } else {
        None
    }
}

/// Remove the private install entirely.
pub fn remove(data_dir: &Path) -> Result<()> {
    let r = root(data_dir);
    if r.is_dir() {
        std::fs::remove_dir_all(&r)?;
    }
    Ok(())
}

unsafe fn libc_kill(pid: i32) {
    extern "C" {
        fn kill(pid: i32, sig: i32) -> i32;
    }
    // SIGTERM; install-tl and tlmgr exit promptly and leave a partially written tree we then delete.
    kill(pid, 15);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn profile_is_portable_and_inside_texdir() {
        let p = profile(Path::new("/data/texlive/tl"));
        assert!(p.contains("selected_scheme scheme-basic\n"));
        assert!(p.contains("TEXDIR /data/texlive/tl\n"));
        assert!(p.contains("instopt_portable 1\n"));
        assert!(p.contains("instopt_adjustpath 0\n"));
        assert!(p.contains("tlpdbopt_install_docfiles 0\n"));
        assert!(p.contains("TEXMFVAR /data/texlive/tl/texmf-var\n"));
    }

    #[test]
    fn progress_lines_parse() {
        assert_eq!(install_progress("Installing [0042/0123, time/total: 00:31/01:32]: booktabs [12k]"), Some(42.0 / 123.0));
        assert_eq!(install_progress("Loading https://mirror"), None);
        assert_eq!(packages_progress("[12/57, 00:10/00:45] install: pgf [1234k]"), Some(12.0 / 57.0));
        assert_eq!(packages_progress("tlmgr: package repository https://mirror"), None);
    }

    #[test]
    fn package_list_covers_the_templates() {
        // Every \usepackage in the shipped templates must be provided by something in PACKAGES.
        let provides: &[(&str, &str)] = &[
            ("amssymb", "amsfonts"), ("amsthm", "amscls"), ("array", "tools"), ("graphicx", "graphics"), ("tikz", "pgf"), ("tabularx", "tools"), ("bm", "tools"), ("multirow", "multirow"),
        ];
        let names: Vec<String> = walkdir::WalkDir::new(concat!(env!("CARGO_MANIFEST_DIR"), "/resources/templates"))
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().extension().map(|x| x == "tex" || x == "sty").unwrap_or(false))
            .filter_map(|e| std::fs::read_to_string(e.path()).ok())
            .flat_map(|text| {
                let re = regex::Regex::new(r"\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{([^}]+)\}").unwrap();
                re.captures_iter(&text).map(|c| c[1].to_string()).collect::<Vec<_>>()
            })
            .flat_map(|list| list.split(',').map(|s| s.trim().to_string()).collect::<Vec<_>>())
            .collect();
        assert!(!names.is_empty());
        for n in names {
            let pkg = provides.iter().find(|(a, _)| *a == n).map(|(_, p)| *p).unwrap_or(n.as_str());
            assert!(PACKAGES.contains(&pkg), "template package {n} is not covered by PACKAGES");
        }
    }

    #[test]
    fn installed_bin_is_none_without_an_install() {
        let dir = tempfile::tempdir().unwrap();
        assert!(installed_bin(dir.path()).is_none());
        assert_eq!(size_on_disk(dir.path()), 0);
    }

    /// The real thing: downloads ≈ 120 MB and takes several minutes. Run by hand:
    /// `COHERE_TEX_INSTALL_TEST=1 cargo test --lib texinstall::tests::real_install -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn real_install() {
        if std::env::var_os("COHERE_TEX_INSTALL_TEST").is_none() {
            return;
        }
        struct Print;
        impl Sink for Print {
            fn event(&self, ev: TexInstallEvent) {
                if let Some(l) = ev.line {
                    eprintln!("[{}] {}", ev.phase, l);
                }
            }
        }
        let dir = tempfile::tempdir().unwrap();
        let inst = Arc::new(Installer::default());
        let bin = inst.run(&Print, dir.path()).expect("install succeeds");
        assert!(bin.join("latexmk").is_file());
        assert!(bin.join("biber").is_file());
        let info = texbin::locate(None, Some(bin.clone()));
        assert!(info.found);
        assert_eq!(info.source, "Cohere");
        eprintln!("size: {} MB", size_on_disk(dir.path()) / 1_000_000);
    }
}
