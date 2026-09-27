//! Project templates, embedded in the binary from `resources/templates/`.
//!
//! The renderer mirrors texref's: `{{INCLUDE:block}}` splices `_shared/blocks/<block>.tex`,
//! `{{KEY}}` substitutes from a context map. A "blank" template is generated in code.

use std::collections::BTreeMap;
use std::path::Path;

use chrono::{Datelike, Local};
use include_dir::{include_dir, Dir};
use regex::Regex;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, Result};
use crate::fsutil;

static TEMPLATES: Dir<'static> = include_dir!("$CARGO_MANIFEST_DIR/resources/templates");

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateDefaults {
    pub units: u32,
    pub subunits: u32,
    pub appendices: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplatePrompts {
    #[serde(default)]
    pub subtitle: bool,
    #[serde(default)]
    pub tagline: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateInfo {
    pub key: String,
    pub name: String,
    /// Two or three words for tight spaces (the Library's type column): "Paper, 2-column".
    pub short_name: String,
    /// Icon name in the front-end icon set.
    pub icon: String,
    pub description: String,
    pub documentclass: String,
    pub unit: String,
    pub unit_cmd: String,
    pub sub_cmd: String,
    pub unit_dir: String,
    pub unit_label: String,
    pub abstract_page: bool,
    pub toc: bool,
    pub appendices: bool,
    pub twocolumn: bool,
    pub defaults: TemplateDefaults,
    pub prompts: TemplatePrompts,
}

#[derive(Debug, Deserialize)]
struct RawTemplate {
    key: Option<String>,
    name: String,
    #[serde(default)]
    short_name: Option<String>,
    #[serde(default)]
    icon: Option<String>,
    description: String,
    documentclass: String,
    unit: String,
    unit_cmd: String,
    sub_cmd: String,
    unit_dir: String,
    unit_label: String,
    #[serde(rename = "abstract")]
    abstract_page: bool,
    toc: bool,
    appendices: bool,
    twocolumn: bool,
    defaults: TemplateDefaults,
    #[serde(default = "default_prompts")]
    prompts: TemplatePrompts,
}

fn default_prompts() -> TemplatePrompts {
    TemplatePrompts { subtitle: false, tagline: false }
}

pub fn blank_template() -> TemplateInfo {
    TemplateInfo {
        key: "blank".into(),
        name: "Blank".into(),
        short_name: "Blank".into(),
        icon: "tplBlank".into(),
        description: "A single main.tex with the essentials: article class, a title, one section, a bibliography file.".into(),
        documentclass: "article".into(),
        unit: "section".into(),
        unit_cmd: "section".into(),
        sub_cmd: "subsection".into(),
        unit_dir: "sections".into(),
        unit_label: "sec".into(),
        abstract_page: false,
        toc: false,
        appendices: false,
        twocolumn: false,
        defaults: TemplateDefaults { units: 0, subunits: 0, appendices: 0 },
        prompts: default_prompts(),
    }
}

fn default_icon(key: &str) -> String {
    match key {
        "project" => "tplProject",
        "brief" => "tplBrief",
        "periodical" => "tplPeriodical",
        "minimal" => "tplMinimal",
        "paper" => "tplPaper2",
        "paper-single" => "tplPaper1",
        _ => "fileTex",
    }
    .into()
}

pub fn list() -> Vec<TemplateInfo> {
    let mut out = vec![blank_template()];
    let mut found: Vec<TemplateInfo> = Vec::new();
    for dir in TEMPLATES.dirs() {
        let key = dir.path().file_name().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        if key.starts_with('_') {
            continue;
        }
        let Some(meta) = dir.get_file(dir.path().join("template.json")) else { continue };
        let Some(text) = meta.contents_utf8() else { continue };
        match serde_json::from_str::<RawTemplate>(text) {
            Ok(raw) => found.push(TemplateInfo {
                short_name: raw.short_name.unwrap_or_else(|| raw.name.clone()),
                icon: raw.icon.unwrap_or_else(|| default_icon(raw.key.as_deref().unwrap_or(&key))),
                key: raw.key.unwrap_or(key),
                name: raw.name,
                description: raw.description,
                documentclass: raw.documentclass,
                unit: raw.unit,
                unit_cmd: raw.unit_cmd,
                sub_cmd: raw.sub_cmd,
                unit_dir: raw.unit_dir,
                unit_label: raw.unit_label,
                abstract_page: raw.abstract_page,
                toc: raw.toc,
                appendices: raw.appendices,
                twocolumn: raw.twocolumn,
                defaults: raw.defaults,
                prompts: raw.prompts,
            }),
            Err(e) => log::warn!("template {key}: bad template.json: {e}"),
        }
    }
    let order = |k: &str| match k {
        "project" => 0,
        "brief" => 1,
        "periodical" => 2,
        "minimal" => 3,
        "paper" => 4,
        "paper-single" => 5,
        _ => 9,
    };
    found.sort_by_key(|t| (order(&t.key), t.key.clone()));
    out.extend(found);
    out
}

pub fn get(key: &str) -> Result<TemplateInfo> {
    list()
        .into_iter()
        .find(|t| t.key == key)
        .ok_or_else(|| AppError::not_found(format!("template '{key}'")))
}

fn shared(rel: &str) -> Result<String> {
    TEMPLATES
        .get_file(format!("_shared/{rel}"))
        .and_then(|f| f.contents_utf8())
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::not_found(format!("template resource _shared/{rel}")))
}

fn template_file(key: &str, rel: &str) -> Result<String> {
    TEMPLATES
        .get_file(format!("{key}/{rel}"))
        .and_then(|f| f.contents_utf8())
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::not_found(format!("template resource {key}/{rel}")))
}

pub type Ctx = BTreeMap<String, String>;

/// Expand `{{INCLUDE:name}}` then `{{KEY}}`. Unknown keys are left untouched.
pub fn render(text: &str, ctx: &Ctx) -> String {
    let inc = Regex::new(r"\{\{INCLUDE:([a-z0-9_-]+)\}\}").unwrap();
    let with_blocks = inc.replace_all(text, |caps: &regex::Captures| {
        shared(&format!("blocks/{}.tex", &caps[1]))
            .map(|s| s.trim_end_matches('\n').to_string())
            .unwrap_or_else(|_| format!("% missing block {}", &caps[1]))
    });
    let ph = Regex::new(r"\{\{([A-Z][A-Z0-9_]*)\}\}").unwrap();
    ph.replace_all(&with_blocks, |caps: &regex::Captures| {
        ctx.get(&caps[1]).cloned().unwrap_or_else(|| caps[0].to_string())
    })
    .into_owned()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaffoldOptions {
    pub title: String,
    #[serde(default)]
    pub subtitle: String,
    #[serde(default)]
    pub tagline: String,
    #[serde(default)]
    pub description: String,
    #[serde(default = "default_author")]
    pub author: String,
    #[serde(default = "default_version")]
    pub version: String,
    pub units: Option<u32>,
    pub subunits: Option<u32>,
    pub appendices: Option<u32>,
}

fn default_author() -> String {
    "Paris Blaisdell-Pijuan, Ph.D.".into()
}
fn default_version() -> String {
    "0.1.0".into()
}

pub fn long_date() -> String {
    let now = Local::now();
    format!("{} {}, {}", now.format("%B"), now.day(), now.year())
}

fn slug(title: &str) -> String {
    let mut s: String = title
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    while s.contains("--") {
        s = s.replace("--", "-");
    }
    let s = s.trim_matches('-').to_string();
    if s.is_empty() { "project".into() } else { s }
}

struct Unit {
    n: u32,
    file: String,
    title: String,
    label: String,
    subunits: u32,
}

struct Appendix {
    letter: char,
    file: String,
    title: String,
    label: String,
}

/// Write a full project tree from a template into `src_dir`. Returns the main file name.
pub fn scaffold(key: &str, src_dir: &Path, opts: &ScaffoldOptions) -> Result<String> {
    std::fs::create_dir_all(src_dir)?;
    if key == "blank" {
        return scaffold_blank(src_dir, opts);
    }
    let t = get(key)?;
    let n_units = opts.units.unwrap_or(t.defaults.units).min(60);
    let n_sub = opts.subunits.unwrap_or(t.defaults.subunits).min(20);
    let n_appx = if t.appendices { opts.appendices.unwrap_or(t.defaults.appendices).min(26) } else { 0 };
    let subunit_word = if t.unit == "chapter" { "section" } else { "subsection" };
    let name = slug(&opts.title);
    let folder = format!("tx.{name}");

    let units: Vec<Unit> = (1..=n_units)
        .map(|n| Unit {
            n,
            file: format!("{}/{}_{:02}.tex", t.unit_dir, t.unit, n),
            title: format!("{} {}", capitalise(&t.unit), n),
            label: format!("{}:{:02}", t.unit_label, n),
            subunits: n_sub,
        })
        .collect();
    let appendices: Vec<Appendix> = (0..n_appx)
        .map(|i| {
            let letter = (b'A' + i as u8) as char;
            Appendix {
                letter,
                file: format!("{}/appendix_{}.tex", t.unit_dir, letter.to_ascii_lowercase()),
                title: if i == 0 { format!("Appendix {letter} title") } else { String::new() },
                label: format!("app:{}", letter.to_ascii_lowercase()),
            }
        })
        .collect();

    let unit_inputs = if units.is_empty() {
        "% (no units yet)".to_string()
    } else {
        units.iter().map(|u| format!("\\input{{{}}}", u.file.trim_end_matches(".tex"))).collect::<Vec<_>>().join("\n")
    };
    let appendix_inputs = if appendices.is_empty() {
        "% (no appendices)".to_string()
    } else {
        appendices.iter().map(|a| format!("\\input{{{}}}", a.file.trim_end_matches(".tex"))).collect::<Vec<_>>().join("\n")
    };

    let mut ctx: Ctx = BTreeMap::new();
    ctx.insert("NAME".into(), name.clone());
    ctx.insert("FOLDER".into(), folder.clone());
    ctx.insert("TEMPLATE".into(), t.key.clone());
    ctx.insert("TEMPLATE_DESC".into(), t.description.clone());
    ctx.insert("TITLE".into(), opts.title.clone());
    ctx.insert("SUBTITLE".into(), opts.subtitle.clone());
    ctx.insert("TAGLINE".into(), opts.tagline.clone());
    ctx.insert("DESCRIPTION".into(), opts.description.clone());
    ctx.insert("AUTHOR".into(), opts.author.clone());
    ctx.insert("DATE".into(), long_date());
    ctx.insert("CREATED".into(), Local::now().format("%Y-%m-%d").to_string());
    ctx.insert("VERSION".into(), opts.version.clone());
    ctx.insert("UNIT".into(), t.unit.clone());
    ctx.insert("UNIT_DIR".into(), t.unit_dir.clone());
    ctx.insert("UNIT_LABEL".into(), t.unit_label.clone());
    ctx.insert("SUBUNIT".into(), subunit_word.into());
    ctx.insert("UNIT_INPUTS".into(), unit_inputs);
    ctx.insert("APPENDIX_INPUTS".into(), appendix_inputs);
    ctx.insert("READING_GUIDE".into(), reading_guide(&t, &units, &appendices));
    ctx.insert(
        "FIRST_UNIT_FILE".into(),
        units.first().map(|u| Path::new(&u.file).file_name().unwrap().to_string_lossy().into_owned()).unwrap_or(format!("{}_01.tex", t.unit)),
    );
    ctx.insert("SUBTITLE_MD".into(), if opts.subtitle.is_empty() { String::new() } else { format!(" — {}", opts.subtitle) });
    ctx.insert("DESCRIPTION_MD".into(), if opts.description.is_empty() { "_No description yet._".into() } else { opts.description.clone() });
    ctx.insert("LAYOUT_TREE".into(), layout_tree(&t, &units, &appendices));

    // directories
    for d in [t.unit_dir.as_str(), "references", "figures"] {
        std::fs::create_dir_all(src_dir.join(d))?;
    }
    // main.tex
    fsutil::write_atomic(&src_dir.join("main.tex"), render(&template_file(&t.key, "main.tex")?, &ctx).as_bytes())?;
    // abstract
    if t.abstract_page {
        fsutil::write_atomic(&src_dir.join(&t.unit_dir).join("abstract.tex"), render(&template_file(&t.key, "abstract.tex")?, &ctx).as_bytes())?;
    }
    // units
    for u in &units {
        let body = render_unit(&t, u, u.n == 1)?;
        fsutil::write_atomic(&src_dir.join(&u.file), body.as_bytes())?;
    }
    for a in &appendices {
        let body = render_appendix(&t, a)?;
        fsutil::write_atomic(&src_dir.join(&a.file), body.as_bytes())?;
    }
    // Only what LaTeX needs lives in the project. The CLI conveniences (Makefile, README, tex.json,
    // .gitignore) are rendered on demand by `cli_files` for a texref-compatible export.
    fsutil::write_atomic(&src_dir.join("references/ref.bib"), render(&shared("ref.bib")?, &ctx).as_bytes())?;
    Ok("main.tex".into())
}

fn scaffold_blank(src_dir: &Path, opts: &ScaffoldOptions) -> Result<String> {
    std::fs::create_dir_all(src_dir.join("references"))?;
    std::fs::create_dir_all(src_dir.join("figures"))?;
    let mut ctx: Ctx = BTreeMap::new();
    ctx.insert("TITLE".into(), opts.title.clone());
    ctx.insert("AUTHOR".into(), opts.author.clone());
    ctx.insert("DATE".into(), long_date());
    ctx.insert("FOLDER".into(), format!("tx.{}", slug(&opts.title)));
    let main = render(BLANK_MAIN, &ctx);
    fsutil::write_atomic(&src_dir.join("main.tex"), main.as_bytes())?;
    fsutil::write_atomic(&src_dir.join("references/ref.bib"), render(&shared("ref.bib")?, &ctx).as_bytes())?;
    Ok("main.tex".into())
}

const BLANK_MAIN: &str = r#"% main.tex — {{TITLE}}
\documentclass[11pt,letterpaper]{article}
\usepackage[margin=1in]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\graphicspath{{figures/}}
\usepackage{booktabs}
\usepackage[dvipsnames]{xcolor}
\usepackage{parskip}
\usepackage[backend=biber,style=numeric-comp]{biblatex}
\addbibresource{references/ref.bib}
\usepackage[colorlinks=true,linkcolor=NavyBlue,citecolor=NavyBlue,urlcolor=NavyBlue]{hyperref}

\title{{{TITLE}}}
\author{{{AUTHOR}}}
\date{{{DATE}}}

\begin{document}
\maketitle

\section{Introduction}
Begin here.

\printbibliography
\end{document}
"#;

fn render_unit(t: &TemplateInfo, u: &Unit, rich: bool) -> Result<String> {
    let subunit_word = if t.unit == "chapter" { "section" } else { "subsection" };
    let mut subs = String::new();
    for k in 1..=u.subunits {
        let mut c: Ctx = BTreeMap::new();
        c.insert("SUB_CMD".into(), t.sub_cmd.clone());
        c.insert("TITLE".into(), format!("{} {}", capitalise(subunit_word), k));
        c.insert("LABEL".into(), format!("{}:s{}", u.label, k));
        c.insert("SUBUNIT".into(), subunit_word.into());
        c.insert("UNIT".into(), t.unit.clone());
        c.insert("N".into(), k.to_string());
        c.insert("UNIT_N".into(), u.n.to_string());
        subs.push_str(&render(&shared("stubs/subunit.tex")?, &c));
    }
    let examples = if rich {
        let stub = if t.twocolumn { "stubs/examples-twocol.tex" } else { "stubs/examples.tex" };
        let mut c: Ctx = BTreeMap::new();
        c.insert("UNIT".into(), t.unit.clone());
        c.insert("LABEL_SLUG".into(), u.label.replace(':', "-"));
        render(&shared(stub)?, &c)
    } else {
        String::new()
    };
    let mut c: Ctx = BTreeMap::new();
    c.insert("FILE".into(), u.file.clone());
    c.insert("UNIT_CMD".into(), t.unit_cmd.clone());
    c.insert("TITLE".into(), u.title.clone());
    c.insert("LABEL".into(), u.label.clone());
    c.insert("UNIT".into(), t.unit.clone());
    c.insert("EXAMPLES".into(), examples);
    c.insert("SUBUNITS".into(), subs);
    Ok(format!("{}\n", render(&shared("stubs/unit.tex")?, &c).trim_end_matches('\n')))
}

fn render_appendix(t: &TemplateInfo, a: &Appendix) -> Result<String> {
    let mut c: Ctx = BTreeMap::new();
    c.insert("FILE".into(), a.file.clone());
    c.insert("LETTER".into(), a.letter.to_string());
    c.insert("UNIT_CMD".into(), t.unit_cmd.clone());
    c.insert("TITLE".into(), a.title.clone());
    c.insert("LABEL".into(), a.label.clone());
    Ok(render(&shared("stubs/appendix.tex")?, &c))
}

fn reading_guide(t: &TemplateInfo, units: &[Unit], appendices: &[Appendix]) -> String {
    let word = capitalise(&t.unit);
    let mut parts: Vec<String> = units
        .iter()
        .map(|u| format!("{}~\\ref{{{}}} [about {} {}\\ldots].", word, u.label, t.unit, u.n))
        .collect();
    match appendices.len() {
        0 => {}
        1 => parts.push(format!("Appendix~\\ref{{{}}} [about appendix {}\\ldots].", appendices[0].label, appendices[0].letter)),
        _ => parts.push(format!(
            "Appendices~\\ref{{{}}}--\\ref{{{}}} give [supporting material\\ldots].",
            appendices[0].label,
            appendices[appendices.len() - 1].label
        )),
    }
    if parts.is_empty() {
        "[Describe the order in which to read the document.]".into()
    } else {
        parts.join(" ")
    }
}

fn layout_tree(t: &TemplateInfo, units: &[Unit], appendices: &[Appendix]) -> String {
    let mut lines: Vec<String> = Vec::new();
    if t.abstract_page {
        lines.push("abstract.tex".into());
    }
    lines.extend(units.iter().map(|u| Path::new(&u.file).file_name().unwrap().to_string_lossy().into_owned()));
    lines.extend(appendices.iter().map(|a| Path::new(&a.file).file_name().unwrap().to_string_lossy().into_owned()));
    if lines.is_empty() {
        return String::new();
    }
    let last = lines.pop().unwrap();
    let mut out = String::new();
    for l in lines {
        out.push_str(&format!("\n│   ├── {l}"));
    }
    out.push_str(&format!("\n│   └── {last}"));
    out
}

/// The texref CLI companions (Makefile, README.md, .gitignore, tex.json) for a project, rendered
/// from the shared templates so an exported bundle works with the `tex-*` shell commands.
/// Returns (relative path, contents).
pub fn cli_files(template_key: &str, title: &str, author: &str, version: &str, units: &[(String, String, u32)], appendices: &[(String, String)]) -> Result<Vec<(String, String)>> {
    let t = get(template_key).unwrap_or_else(|_| blank_template());
    let name = slug(title);
    let folder = format!("tx.{name}");
    let mut ctx: Ctx = BTreeMap::new();
    ctx.insert("NAME".into(), name.clone());
    ctx.insert("FOLDER".into(), folder.clone());
    ctx.insert("TEMPLATE".into(), t.key.clone());
    ctx.insert("TEMPLATE_DESC".into(), t.description.clone());
    ctx.insert("TITLE".into(), title.into());
    ctx.insert("SUBTITLE_MD".into(), String::new());
    ctx.insert("DESCRIPTION_MD".into(), "_Exported from Cohere._".into());
    ctx.insert("AUTHOR".into(), author.into());
    ctx.insert("CREATED".into(), Local::now().format("%Y-%m-%d").to_string());
    ctx.insert("VERSION".into(), version.into());
    ctx.insert("UNIT".into(), t.unit.clone());
    ctx.insert("UNIT_DIR".into(), t.unit_dir.clone());
    ctx.insert("UNIT_LABEL".into(), t.unit_label.clone());
    ctx.insert("SUBUNIT".into(), (if t.unit == "chapter" { "section" } else { "subsection" }).into());
    ctx.insert("FIRST_UNIT_FILE".into(), units.first().map(|u| Path::new(&u.0).file_name().unwrap().to_string_lossy().into_owned()).unwrap_or_else(|| format!("{}_01.tex", t.unit)));
    ctx.insert("LAYOUT_TREE".into(), String::new());
    let unit_objs: Vec<Unit> = units.iter().enumerate().map(|(i, (file, title, subunits))| Unit { n: i as u32 + 1, file: file.clone(), title: title.clone(), label: format!("{}:{:02}", t.unit_label, i + 1), subunits: *subunits }).collect();
    let appx_objs: Vec<Appendix> = appendices.iter().enumerate().map(|(i, (file, title))| { let letter = (b'A' + i as u8) as char; Appendix { letter, file: file.clone(), title: title.clone(), label: format!("app:{}", letter.to_ascii_lowercase()) } }).collect();
    let opts = ScaffoldOptions { title: title.into(), subtitle: String::new(), tagline: String::new(), description: String::new(), author: author.into(), version: version.into(), units: None, subunits: None, appendices: None };
    let manifest = texref_manifest(&t, &name, &folder, &opts, &unit_objs, &appx_objs);
    Ok(vec![
        ("Makefile".into(), render(&shared("Makefile")?, &ctx)),
        ("README.md".into(), render(&shared("README.md")?, &ctx)),
        (".gitignore".into(), shared("gitignore")?),
        ("tex.json".into(), serde_json::to_string_pretty(&manifest)?),
    ])
}

fn texref_manifest(t: &TemplateInfo, name: &str, folder: &str, opts: &ScaffoldOptions, units: &[Unit], appendices: &[Appendix]) -> serde_json::Value {
    let now = Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    serde_json::json!({
        "texref": { "schema": 1, "tool_version": "1.0.0", "created": now, "updated": now, "origin": "cohere" },
        "project": {
            "name": name, "folder": folder, "template": t.key, "title": opts.title, "subtitle": opts.subtitle,
            "tagline": opts.tagline, "description": opts.description, "author": opts.author, "version": opts.version
        },
        "build": { "main": "main.tex", "pdf": "main.pdf", "aux": "aux", "engine": "pdflatex", "bib": "biber", "viewer": "Skim" },
        "layout": {
            "unit": t.unit, "unit_cmd": t.unit_cmd, "sub_cmd": t.sub_cmd, "unit_dir": t.unit_dir, "unit_label": t.unit_label,
            "abstract": t.abstract_page, "toc": t.toc, "appendices": t.appendices, "twocolumn": t.twocolumn,
            "references": "references/ref.bib", "figures": "figures", "versions": "versions"
        },
        "units": units.iter().map(|u| serde_json::json!({"n": u.n, "file": u.file, "title": u.title, "label": u.label, "subunits": u.subunits})).collect::<Vec<_>>(),
        "appendices": appendices.iter().map(|a| serde_json::json!({"letter": a.letter.to_string(), "file": a.file, "title": a.title, "label": a.label})).collect::<Vec<_>>(),
        "versions": []
    })
}

fn capitalise(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
        None => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn has_placeholder(text: &str) -> bool {
        Regex::new(r"\{\{[A-Z][A-Z0-9_:]*\}\}").unwrap().is_match(text)
    }

    #[test]
    fn lists_templates_in_house_order() {
        let all = list();
        let keys: Vec<&str> = all.iter().map(|t| t.key.as_str()).collect();
        assert_eq!(keys, vec!["blank", "project", "brief", "periodical", "minimal", "paper", "paper-single"]);
        let short: Vec<&str> = all.iter().map(|t| t.short_name.as_str()).collect();
        assert_eq!(short, vec!["Blank", "Project", "Brief", "Periodical", "Minimal", "Paper, 2-column", "Paper, 1-column"]);
        assert!(all.iter().all(|t| t.icon.starts_with("tpl")), "every template has a type icon");
    }

    #[test]
    fn paper_templates_share_the_style_block() {
        // Both paper variants splice the same style block so their look cannot drift apart.
        for key in ["paper", "paper-single"] {
            let dir = tempfile::tempdir().unwrap();
            let opts = ScaffoldOptions {
                title: "Style".into(),
                subtitle: "Sub".into(),
                tagline: "Frontier · Brief".into(),
                description: String::new(),
                author: "A".into(),
                version: "0.1.0".into(),
                units: Some(2),
                subunits: Some(1),
                appendices: Some(0),
            };
            scaffold(key, dir.path(), &opts).unwrap();
            let main = std::fs::read_to_string(dir.path().join("main.tex")).unwrap();
            assert!(main.contains("\\definecolor{sheet}"), "{key} carries the paper palette");
            assert!(main.contains("\\newtcolorbox{summary}"), "{key} defines the summary panel");
            assert!(main.contains("\\doceyebrow}{Frontier · Brief}"), "{key} carries the tagline as the eyebrow");
            let abs = std::fs::read_to_string(dir.path().join("sections/abstract.tex")).unwrap();
            assert!(abs.contains("\\begin{summary}"), "{key} abstract uses the panel");
        }
        let two = get("paper").unwrap();
        let one = get("paper-single").unwrap();
        assert!(two.twocolumn && !one.twocolumn);
        assert!(two.prompts.tagline && one.prompts.tagline);
    }

    #[test]
    fn render_splices_blocks_and_keys() {
        let mut ctx = Ctx::new();
        ctx.insert("TITLE".into(), "Hello".into());
        let out = render("{{INCLUDE:tables}}\n\\title{{{TITLE}}} {{UNKNOWN}}", &ctx);
        assert!(out.contains("\\newcommand{\\rs}"));
        assert!(out.contains("\\title{Hello} {{UNKNOWN}}"));
    }

    #[test]
    fn scaffold_project_writes_tree() {
        let dir = tempfile::tempdir().unwrap();
        let opts = ScaffoldOptions {
            title: "Demo Model".into(),
            subtitle: "Sub".into(),
            tagline: "".into(),
            description: "".into(),
            author: "A".into(),
            version: "0.1.0".into(),
            units: Some(3),
            subunits: Some(2),
            appendices: Some(2),
        };
        let main = scaffold("project", dir.path(), &opts).unwrap();
        assert_eq!(main, "main.tex");
        let text = std::fs::read_to_string(dir.path().join("main.tex")).unwrap();
        assert!(text.contains("\\input{chapters/chapter_03}"));
        assert!(text.contains("\\input{chapters/appendix_b}"));
        assert!(!has_placeholder(&text), "no unresolved placeholders in main.tex");
        assert!(dir.path().join("chapters/abstract.tex").exists());
        assert!(dir.path().join("references/ref.bib").exists());
        for junk in ["tex.json", "Makefile", "README.md", ".gitignore", "figures/.gitkeep"] {
            assert!(!dir.path().join(junk).exists(), "{junk} must not be scaffolded into a Cohere project");
        }
        let cli = cli_files("project", "Demo Model", "A", "0.1.0", &[("chapters/chapter_01.tex".into(), "One".into(), 2)], &[]).unwrap();
        assert_eq!(cli.len(), 4);
        assert!(cli.iter().any(|(p, c)| p == "Makefile" && c.contains("latexmk")));
        assert!(cli.iter().any(|(p, c)| p == "tex.json" && c.contains("\"Demo Model\"")));
        let ch1 = std::fs::read_to_string(dir.path().join("chapters/chapter_01.tex")).unwrap();
        assert!(ch1.contains("\\label{ch:01:s2}"));
        assert!(ch1.contains("xltabular"));
        let ch2 = std::fs::read_to_string(dir.path().join("chapters/chapter_02.tex")).unwrap();
        assert!(!ch2.contains("xltabular"));
    }

    #[test]
    fn scaffold_blank_and_others() {
        for key in ["blank", "brief", "periodical", "minimal", "paper", "paper-single"] {
            let dir = tempfile::tempdir().unwrap();
            let opts = ScaffoldOptions {
                title: "T".into(),
                subtitle: String::new(),
                tagline: String::new(),
                description: String::new(),
                author: "A".into(),
                version: "0.1.0".into(),
                units: None,
                subunits: None,
                appendices: None,
            };
            scaffold(key, dir.path(), &opts).unwrap();
            let text = std::fs::read_to_string(dir.path().join("main.tex")).unwrap();
            assert!(text.contains("\\begin{document}"), "{key}");
            assert!(!has_placeholder(&text), "{key} has unresolved placeholders");
        }
    }
}
