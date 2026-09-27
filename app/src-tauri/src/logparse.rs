//! LaTeX log parsing → structured diagnostics with file and line.
//!
//! We always run with `-file-line-error`, so errors arrive as `./path.tex:12: message`.
//! Warnings do not carry a file, so we track TeX's `(file … )` nesting to attribute them.
//! TeX wraps lines at 79 columns; we unwrap those first. Biber `.blg` files are parsed too.

use std::collections::HashSet;
use std::path::Path;

use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Diagnostic {
    pub severity: Severity,
    pub file: Option<String>,
    pub line: Option<u32>,
    pub message: String,
    #[serde(default)]
    pub detail: String,
    pub source: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
    Error,
    Warning,
    Info,
}

const MAX_PRINT_LINE: usize = 79;

/// Undo TeX's hard wrapping: a line of exactly 79 characters continues on the next line.
pub fn unwrap_lines(text: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut carry: Option<String> = None;
    for raw in text.lines() {
        let line = raw.trim_end_matches('\r');
        match carry.take() {
            Some(mut prev) => {
                prev.push_str(line);
                if line.chars().count() == MAX_PRINT_LINE {
                    carry = Some(prev);
                } else {
                    out.push(prev);
                }
            }
            None => {
                if line.chars().count() == MAX_PRINT_LINE {
                    carry = Some(line.to_string());
                } else {
                    out.push(line.to_string());
                }
            }
        }
    }
    if let Some(c) = carry {
        out.push(c);
    }
    out
}

struct Patterns {
    file_line_error: Regex,
    bang_error: Regex,
    latex_warning: Regex,
    package_warning: Regex,
    package_continuation: Regex,
    font_warning: Regex,
    box_warning: Regex,
    on_input_line: Regex,
    lines_range: Regex,
    l_context: Regex,
    output_written: Regex,
    fatal: Regex,
}

impl Patterns {
    fn new() -> Self {
        Patterns {
            file_line_error: Regex::new(r"^(?P<file>[^:\s][^:]*?):(?P<line>\d+):\s*(?P<msg>.*)$").unwrap(),
            bang_error: Regex::new(r"^!\s*(?P<msg>.+)$").unwrap(),
            latex_warning: Regex::new(r"^LaTeX Warning:\s*(?P<msg>.*)$").unwrap(),
            package_warning: Regex::new(r"^(?:Package|Class)\s+(?P<pkg>\S+)\s+Warning:\s*(?P<msg>.*)$").unwrap(),
            package_continuation: Regex::new(r"^\((?P<pkg>[^)\s]+)\)\s{2,}(?P<msg>.*)$").unwrap(),
            font_warning: Regex::new(r"^LaTeX Font Warning:\s*(?P<msg>.*)$").unwrap(),
            box_warning: Regex::new(r"^(?P<kind>Overfull|Underfull) \\(?P<box>[hv])box \((?P<amount>[^)]*)\)(?P<rest>.*)$").unwrap(),
            on_input_line: Regex::new(r"on input line (?P<line>\d+)").unwrap(),
            lines_range: Regex::new(r"at lines? (?P<a>\d+)(?:--(?P<b>\d+))?").unwrap(),
            l_context: Regex::new(r"^l\.(?P<line>\d+)\s?(?P<ctx>.*)$").unwrap(),
            output_written: Regex::new(r"Output written on .*?\((?P<pages>\d+) pages?, (?P<bytes>\d+) bytes\)").unwrap(),
            fatal: Regex::new(r"Fatal error occurred|Emergency stop|no output PDF file produced").unwrap(),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogSummary {
    pub diagnostics: Vec<Diagnostic>,
    pub pages: Option<u32>,
    pub pdf_bytes: Option<u64>,
    pub fatal: bool,
}

/// Parse a LaTeX `.log`. `src_root` is used to make absolute paths inside the project relative.
pub fn parse_latex_log(text: &str, src_root: Option<&Path>) -> LogSummary {
    let pats = Patterns::new();
    let lines = unwrap_lines(text);
    let mut diags: Vec<Diagnostic> = Vec::new();
    let mut stack: Vec<Option<String>> = Vec::new();
    let mut summary = LogSummary::default();

    let mut i = 0;
    while i < lines.len() {
        let line = &lines[i];

        if let Some(c) = pats.output_written.captures(line) {
            summary.pages = c.name("pages").and_then(|m| m.as_str().parse().ok());
            summary.pdf_bytes = c.name("bytes").and_then(|m| m.as_str().parse().ok());
        }
        if pats.fatal.is_match(line) {
            summary.fatal = true;
        }

        // ── errors with file:line (-file-line-error) ─────────────────────────
        if let Some(c) = pats.file_line_error.captures(line) {
            let file = c["file"].to_string();
            if looks_like_tex_path(&file) {
                let line_no: u32 = c["line"].parse().unwrap_or(0);
                let mut msg = c["msg"].trim().to_string();
                let mut detail = String::new();
                let (ctx, consumed) = collect_error_context(&lines, i + 1, &pats);
                if !ctx.is_empty() {
                    detail = ctx;
                }
                if msg.is_empty() {
                    msg = "Error".into();
                }
                if msg.starts_with("==>") {
                    msg = msg.trim_start_matches("==>").trim().to_string();
                    diags.push(Diagnostic { severity: Severity::Error, file: Some(norm_file(&file, src_root)), line: Some(line_no), message: msg, detail, source: "latex".into() });
                    i += 1 + consumed;
                    continue;
                }
                msg = strip_prefix_case(&msg, "LaTeX Error:").to_string();
                msg = strip_prefix_case(&msg, "Package ").to_string();
                diags.push(Diagnostic { severity: Severity::Error, file: Some(norm_file(&file, src_root)), line: Some(line_no), message: msg, detail, source: "latex".into() });
                i += 1 + consumed;
                continue;
            }
        }

        // ── errors without file:line ("! ...") ───────────────────────────────
        if let Some(c) = pats.bang_error.captures(line) {
            let mut msg = c["msg"].trim().to_string();
            msg = strip_prefix_case(&msg, "LaTeX Error:").to_string();
            let (ctx, consumed) = collect_error_context(&lines, i + 1, &pats);
            let line_no = find_l_line(&lines, i + 1, &pats);
            let file = current_file(&stack).map(|f| norm_file(&f, src_root));
            diags.push(Diagnostic { severity: Severity::Error, file, line: line_no, message: msg, detail: ctx, source: "latex".into() });
            i += 1 + consumed;
            continue;
        }

        // ── warnings ─────────────────────────────────────────────────────────
        if let Some(c) = pats.package_warning.captures(line) {
            let pkg = c["pkg"].to_string();
            let mut msg = c["msg"].trim().to_string();
            let mut j = i + 1;
            while j < lines.len() {
                if let Some(cc) = pats.package_continuation.captures(&lines[j]) {
                    if cc["pkg"] == pkg {
                        msg.push(' ');
                        msg.push_str(cc["msg"].trim());
                        j += 1;
                        continue;
                    }
                }
                break;
            }
            let line_no = pats.on_input_line.captures(&msg).and_then(|m| m["line"].parse().ok());
            let file = current_file(&stack).map(|f| norm_file(&f, src_root));
            diags.push(Diagnostic { severity: Severity::Warning, file, line: line_no, message: format!("{pkg}: {}", tidy(&msg)), detail: String::new(), source: "package".into() });
            i = j;
            continue;
        }
        if let Some(c) = pats.font_warning.captures(line) {
            let msg = c["msg"].trim().to_string();
            let mut full = msg.clone();
            let mut j = i + 1;
            while j < lines.len() && lines[j].starts_with("(Font)") {
                full.push(' ');
                full.push_str(lines[j].trim_start_matches("(Font)").trim());
                j += 1;
            }
            let line_no = pats.on_input_line.captures(&full).and_then(|m| m["line"].parse().ok());
            let file = current_file(&stack).map(|f| norm_file(&f, src_root));
            diags.push(Diagnostic { severity: Severity::Info, file, line: line_no, message: format!("Font: {}", tidy(&full)), detail: String::new(), source: "latex".into() });
            i = j;
            continue;
        }
        if let Some(c) = pats.latex_warning.captures(line) {
            let mut msg = c["msg"].trim().to_string();
            let mut j = i + 1;
            while j < lines.len() && lines[j].starts_with("               ") && !lines[j].trim().is_empty() {
                msg.push(' ');
                msg.push_str(lines[j].trim());
                j += 1;
            }
            let line_no = pats.on_input_line.captures(&msg).and_then(|m| m["line"].parse().ok());
            let file = current_file(&stack).map(|f| norm_file(&f, src_root));
            let severity = if msg.starts_with("There were undefined") || msg.starts_with("Label(s) may have changed") { Severity::Info } else { Severity::Warning };
            diags.push(Diagnostic { severity, file, line: line_no, message: tidy(&msg), detail: String::new(), source: "latex".into() });
            i = j;
            continue;
        }
        if let Some(c) = pats.box_warning.captures(line) {
            let kind = &c["kind"];
            let bx = &c["box"];
            let amount = &c["amount"];
            let rest = c["rest"].trim();
            let line_no = pats.lines_range.captures(rest).and_then(|m| m["a"].parse().ok());
            let file = current_file(&stack).map(|f| norm_file(&f, src_root));
            let mut detail = String::new();
            if i + 1 < lines.len() && !lines[i + 1].trim().is_empty() && !lines[i + 1].starts_with('(') {
                detail = lines[i + 1].trim().to_string();
            }
            diags.push(Diagnostic { severity: Severity::Info, file, line: line_no, message: format!("{kind} \\{bx}box ({amount}) {rest}"), detail, source: "latex".into() });
            i += 1;
            continue;
        }
        if line.starts_with("Runaway argument?") {
            // the following file:line error explains it; keep the runaway text as detail there
            i += 1;
            continue;
        }

        // ── file stack ───────────────────────────────────────────────────────
        track_files(line, &mut stack);
        i += 1;
    }

    summary.diagnostics = dedupe(diags);
    summary
}

fn strip_prefix_case<'a>(s: &'a str, prefix: &str) -> &'a str {
    if s.len() >= prefix.len() && s[..prefix.len()].eq_ignore_ascii_case(prefix) {
        s[prefix.len()..].trim_start()
    } else {
        s
    }
}

fn tidy(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn looks_like_tex_path(s: &str) -> bool {
    if s.is_empty() || s.contains(' ') && !s.contains('/') {
        return false;
    }
    if s.starts_with("./") || s.starts_with('/') || s.starts_with("../") {
        return true;
    }
    let lower = s.to_lowercase();
    ["tex", "sty", "cls", "def", "ltx", "clo", "fd", "cfg", "bib", "bbl", "aux", "toc", "out", "bbx", "cbx", "lbx", "dbx", "tikz", "pgf", "sty"].iter().any(|e| lower.ends_with(&format!(".{e}")))
}

/// Gather the `l.N …` context lines after an error (until a blank line), returning (detail, lines consumed).
fn collect_error_context(lines: &[String], start: usize, pats: &Patterns) -> (String, usize) {
    let mut ctx: Vec<String> = Vec::new();
    let mut j = start;
    let mut seen_l = false;
    while j < lines.len() {
        let l = &lines[j];
        if l.trim().is_empty() {
            if seen_l || ctx.len() > 6 {
                break;
            }
            j += 1;
            continue;
        }
        if l.starts_with('(') && looks_like_tex_path(l.trim_start_matches('(').split(|c: char| c.is_whitespace() || c == ')').next().unwrap_or("")) {
            break;
        }
        if pats.file_line_error.is_match(l) || pats.bang_error.is_match(l) || pats.latex_warning.is_match(l) || pats.package_warning.is_match(l) || pats.box_warning.is_match(l) {
            break;
        }
        if pats.l_context.is_match(l) {
            seen_l = true;
        }
        if ctx.len() >= 12 {
            break;
        }
        ctx.push(l.to_string());
        j += 1;
    }
    let text = ctx.iter().map(|s| s.trim_end().to_string()).filter(|s| !s.is_empty()).collect::<Vec<_>>().join("\n");
    (text, j - start)
}

fn find_l_line(lines: &[String], start: usize, pats: &Patterns) -> Option<u32> {
    for l in lines.iter().skip(start).take(12) {
        if let Some(c) = pats.l_context.captures(l) {
            return c["line"].parse().ok();
        }
    }
    None
}

/// Scan a line for `(path` opens and `)` closes, keeping `stack` in sync with TeX's input nesting.
/// Non-file parentheses push `None` so their closing `)` never pops a real file.
fn track_files(line: &str, stack: &mut Vec<Option<String>>) {
    let mut i = 0;
    while let Some(rel) = line[i..].find(|c| c == '(' || c == ')') {
        let pos = i + rel;
        if line.as_bytes()[pos] == b'(' {
            let rest = &line[pos + 1..];
            let token: String = rest.chars().take_while(|c| !c.is_whitespace() && *c != ')' && *c != '(').collect();
            if looks_like_tex_path(&token) {
                stack.push(Some(token.clone()));
                i = pos + 1 + token.len();
            } else {
                stack.push(None);
                i = pos + 1;
            }
        } else {
            stack.pop();
            i = pos + 1;
        }
    }
}

fn current_file(stack: &[Option<String>]) -> Option<String> {
    stack.iter().rev().find_map(|s| s.clone())
}

fn norm_file(f: &str, src_root: Option<&Path>) -> String {
    let mut s = f.trim().to_string();
    if let Some(root) = src_root {
        if let Ok(rel) = Path::new(&s).strip_prefix(root) {
            s = rel.to_string_lossy().into_owned();
        }
    }
    if let Some(stripped) = s.strip_prefix("./") {
        s = stripped.to_string();
    }
    s.replace('\\', "/")
}

fn dedupe(diags: Vec<Diagnostic>) -> Vec<Diagnostic> {
    let mut seen: HashSet<(Severity, Option<String>, Option<u32>, String)> = HashSet::new();
    diags
        .into_iter()
        .filter(|d| seen.insert((d.severity, d.file.clone(), d.line, d.message.clone())))
        .collect()
}

/// Parse a biber `.blg` log: `WARN - …` and `ERROR - …` lines.
pub fn parse_biber_log(text: &str) -> Vec<Diagnostic> {
    let re = Regex::new(r"^\[\d+\]\s+\S+>\s+(?P<level>WARN|ERROR)\s+-\s+(?P<msg>.*)$").unwrap();
    let mut out = Vec::new();
    for line in text.lines() {
        if let Some(c) = re.captures(line.trim_end()) {
            let sev = if &c["level"] == "ERROR" { Severity::Error } else { Severity::Warning };
            let msg = c["msg"].trim().to_string();
            if msg.starts_with("WARNINGS:") || msg.starts_with("ERRORS:") {
                continue;
            }
            out.push(Diagnostic { severity: sev, file: None, line: None, message: msg, detail: String::new(), source: "biber".into() });
        }
    }
    dedupe(out)
}

/// Parse latexmk's own stdout for failures that never reach a .log (missing engine, rule failures).
pub fn parse_latexmk_output(text: &str) -> Vec<Diagnostic> {
    let mut out = Vec::new();
    for line in text.lines() {
        let l = line.trim();
        if l.starts_with("Latexmk: Errors, so I did not complete") || l.starts_with("Collected error summary") {
            continue;
        }
        if l.contains("command not found") || l.starts_with("Latexmk: Could not find") || l.contains("Rule '") && l.contains("failed") && !l.contains("Reasons") {
            out.push(Diagnostic { severity: Severity::Error, file: None, line: None, message: l.to_string(), detail: String::new(), source: "latexmk".into() });
        }
        if l.starts_with("Latexmk: Missing input file") || l.starts_with("Latexmk: Failure to make") {
            out.push(Diagnostic { severity: Severity::Warning, file: None, line: None, message: l.trim_start_matches("Latexmk: ").to_string(), detail: String::new(), source: "latexmk".into() });
        }
    }
    dedupe(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> String {
        std::fs::read_to_string(format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"))).unwrap()
    }

    #[test]
    fn unwraps_79_column_lines() {
        let a = "x".repeat(79);
        let text = format!("{a}\nyy\nshort\n");
        let lines = unwrap_lines(&text);
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0].len(), 81);
        assert_eq!(lines[1], "short");
    }

    #[test]
    fn clean_log_has_no_errors_and_pages() {
        let s = parse_latex_log(&fixture("clean.log"), None);
        let errors: Vec<_> = s.diagnostics.iter().filter(|d| d.severity == Severity::Error).collect();
        assert!(errors.is_empty(), "{errors:?}");
        assert_eq!(s.pages, Some(1));
        assert!(!s.fatal);
    }

    #[test]
    fn errors_and_warnings_are_attributed() {
        let s = parse_latex_log(&fixture("errors_warnings.log"), None);
        let d = &s.diagnostics;
        let find = |file: &str, line: u32, needle: &str| {
            d.iter().find(|x| x.file.as_deref() == Some(file) && x.line == Some(line) && x.message.contains(needle)).unwrap_or_else(|| panic!("missing {file}:{line} {needle} in {d:#?}"))
        };
        let e1 = find("main.tex", 6, "Undefined control sequence");
        assert_eq!(e1.severity, Severity::Error);
        assert!(e1.detail.contains("\\badcommand"), "context captured: {}", e1.detail);
        let e2 = find("chapters/one.tex", 2, "Undefined control sequence");
        assert_eq!(e2.severity, Severity::Error);
        find("main.tex", 8, "File ended while scanning use of \\frac");
        find("main.tex", 9, "Bad math environment delimiter");
        let w = find("main.tex", 7, "Reference `sec:missing'");
        assert_eq!(w.severity, Severity::Warning);
        find("main.tex", 7, "Citation `nokey'");
        let over = d.iter().find(|x| x.message.starts_with("Overfull \\hbox")).expect("overfull");
        assert_eq!(over.line, Some(2));
        assert_eq!(over.severity, Severity::Info);
        let pkg = d.iter().find(|x| x.message.starts_with("rerunfilecheck:")).expect("package warning");
        assert!(pkg.message.contains("Rerun to get outlines right"), "continuation joined: {}", pkg.message);
        assert_eq!(s.pages, Some(1));
        assert!(!s.fatal);
        let n_err = d.iter().filter(|x| x.severity == Severity::Error).count();
        assert!(n_err >= 8, "expected the cascade of equation errors, got {n_err}");
    }

    #[test]
    fn missing_package_is_fatal_error() {
        let s = parse_latex_log(&fixture("missing_package.log"), None);
        assert!(s.fatal);
        let e = s.diagnostics.iter().find(|d| d.message.contains("nonexistentpackagexyz.sty' not found")).expect("missing file error");
        assert_eq!(e.severity, Severity::Error);
        assert_eq!(e.file.as_deref(), Some("main.tex"), "attributed via file stack");
        assert!(s.diagnostics.iter().any(|d| d.message.contains("Emergency stop") && d.line == Some(5)));
        assert_eq!(s.pages, None);
    }

    #[test]
    fn strips_src_root_from_absolute_paths() {
        let log = "(/Users/me/app/projects/x/src/main.tex\n/Users/me/app/projects/x/src/main.tex:3: Undefined control sequence.\nl.3 \\foo\n\n)";
        let s = parse_latex_log(log, Some(Path::new("/Users/me/app/projects/x/src")));
        assert_eq!(s.diagnostics[0].file.as_deref(), Some("main.tex"));
        assert_eq!(s.diagnostics[0].line, Some(3));
    }

    #[test]
    fn biber_warnings() {
        let d = parse_biber_log(&fixture("biber.blg"));
        assert_eq!(d.len(), 1);
        assert_eq!(d[0].severity, Severity::Warning);
        assert!(d[0].message.contains("nokey"));
    }

    #[test]
    fn latexmk_output() {
        let d = parse_latexmk_output("Latexmk: applying rule 'pdflatex'...\nsh: pdflatex: command not found\nLatexmk: Errors, so I did not complete making targets");
        assert_eq!(d.len(), 1);
        assert_eq!(d[0].severity, Severity::Error);
    }
}
