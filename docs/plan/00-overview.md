# Cohere — overview

*Cohere: to hold together. A desk for long-form writing in LaTeX that is private, local, fast, and mine.*

## The problem

Long-form writing needs a place that is always ready, distraction-free, and trustworthy. The existing options fail in specific ways:

| tool | what breaks |
|---|---|
| Word | fights structure; no separation of content and typesetting; poor for equations and references |
| Obsidian | notes, not documents; the habit does not survive because there is no artefact at the end |
| Overleaf | the right model (source + PDF side by side, compile button, outline) but remote, metered, and not private |
| texref CLI (built earlier) | correct output and structure, but a terminal and a viewer are not a writing desk |

Cohere takes Overleaf's working model — projects, files, editor, compiled PDF, outline — and rebuilds it as a native macOS app on top of the MacTeX installation already on the machine, with all data in the local app-data directory and nothing leaving the laptop.

## Product statement

A Tauri 2 desktop app (Rust core, React + TypeScript front end) with two screens:

1. **Library** — every project as one row; create (blank or from the four house templates), open, rename, archive, delete, export as zip or PDF. No scrolling: rows that do not fit paginate.
2. **Editor** — three columns: a collapsible sidebar (files · outline · outputs), a LaTeX editor with syntax colouring, completions and compile diagnostics in the gutter, and a PDF pane that refreshes in place after every compile. Versions snapshot the PDF together with a full copy of the sources.

Everything visible is deliberately quiet: icon buttons instead of labels, tooltips (with shortcuts) instead of paragraphs, one accent hue per theme, gradients that only vary lightness and opacity, and motion that can be slowed, sped up, or switched off.

## Principles

1. **Local only.** No network calls. Data lives in `~/Library/Application Support/com.cohere.desk/`. Export is a copy out; nothing is synced.
2. **The system TeX is the compiler.** Cohere finds MacTeX/TeX Live and runs `latexmk`. Shipping a TeX distribution is a later, separate decision (see 07-distribution).
3. **Never lose text.** Atomic writes, autosave with a short debounce, save on blur/compile/close, deleted projects go to a trash folder, and versions are immutable snapshots.
4. **Errors are first-class.** Every compile produces structured diagnostics (file, line, severity, message, context) from the real TeX log; they appear in the gutter, inline, in a problems panel, and as a count in the status line.
5. **No text bloat.** If a label can be a tooltip, it is a tooltip. Tooltips always render above everything and float toward the centre of the window.
6. **Robust before rich.** v0.1 has the writing loop end to end and nothing half-finished. Snippets, `@`/`\` palettes, SyncTeX, and AI hooks are later and designed for (see 09-extensibility).
7. **Portable.** One `app/` folder builds the DMG; templates are embedded in the binary; the Rust side has no runtime dependencies beyond TeX.

## Scope

### v0.1.0 (this build)

- Library: list · search-as-you-type · sort · pagination-to-fit · select · new (7 templates, paged five at a time) · rename/topic · archive/unarchive filter · delete (to trash) · export zip · export PDF
- Editor: file tree (new file/folder, add files, rename, delete, set main, context menu) · outline (per file, click-to-jump, follows cursor) · outputs (current PDF card, versions: create/rename/delete/export PDF or bundle) · tabs · CodeMirror 6 LaTeX language (own tokenizer), highlighting per theme, completions (commands, environments, labels, cite keys, files), environment auto-close, folding, search, bracket matching · compile button + ⌘⇧↩ · streamed latexmk log · diagnostics from the log (gutter, underline, problems panel, status counts) · PDF pane (pdf.js) that keeps its place on reload, zoom/fit/page controls, export · autosave · resizable columns and sidebar sections · collapsible sidebar
- Settings: 4 themes · motion off/slow/normal/fast · tooltips on/off + delay · editor (font, size, wrap, numbers, tab, spellcheck, completions, brackets) · compiler (engine, TeX detection and override, shell-escape, SyncTeX, compile-on-save, autosave delay) · about (version, data dir reveal)
- Tests: Rust unit tests (paths, settings, templates, library, files, versions, log parser on real fixtures), Vitest unit + component tests, Playwright e2e against the mock backend

### v0.2 (next)

SyncTeX forward/inverse search · project-wide outline · quick-open (⌘P) · drag-and-drop in the file tree and from Finder · rename-safe `\input` rewriting · duplicate project · version preview/restore · problems panel filters by file · word-count goals · templates view

### later

Snippet palette on `\` and `@` (tables, figures, equations from the house style) · KaTeX hover preview for math · spell-check dictionary management · Git integration · bundled TeX (see 07) · code signing, notarization, updater · AI assistance hooks (local models first)

## Repository layout

```
cohere/
├── app/                      the Tauri + React application (this is what builds the DMG)
│   ├── src/                  React front end
│   ├── src-tauri/            Rust core, templates, icons, tauri.conf.json
│   ├── e2e/                  Playwright tests against the mock backend
│   └── brand/                logo source
└── docs/
    ├── plan/                 this plan (00–09)
    └── documentation/        user-facing documentation per release (v0.1.0.md)
```
