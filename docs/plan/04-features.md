# Features and acceptance criteria

Status legend: ✅ built · 🔶 partial · ⬜ planned. (Kept current in 08-roadmap.)

## Library

| id | feature | acceptance | status |
|---|---|---|---|
| L1 | List projects | Rows show title (serif), topic or —, modified as `DD MM YYYY` (exact datetime on hover), newest first | ✅ |
| L2 | Pagination to fit | Never scrolls; row count adapts to window height; pager `‹ n / m ›` centred; resizing re-paginates | ✅ |
| L3 | Search | `search` button toggles a centred bar; filters title/topic/template as you type; Esc closes; ⌘F opens | ✅ |
| L4 | New project | Dialog: 7 templates (cards + tooltips, paged five at a time), title (required), topic, subtitle where relevant, structure steppers; creates and opens | ✅ |
| L5 | Hover actions | zip · pdf · rename · archive/unarchive · delete appear on hover/focus with tooltips | ✅ |
| L6 | Rename / topic | Dialog edits title and topic; clearing topic removes it | ✅ |
| L7 | Archive filter | Toggle between projects and archived (counts); archived rows dimmed and not openable; unarchive from row | ✅ |
| L8 | Delete | Confirm dialog; project folder moves to `.trash/`; bulk delete for selection | ✅ |
| L9 | Export zip / PDF | Native save dialog; zip contains `tx.<slug>/…`; PDF only when compiled; toast with Reveal | ✅ |
| L10 | Selection + bulk | Checkbox column, header select-page, bulk archive/delete/clear | ✅ |
| L11 | Sorting | Title / topic / modified with direction arrow | ✅ |
| L12 | Duplicate project | Copy `src/` into a new project | ⬜ v0.2 |
| L13 | Templates view | Browse/preview templates separately | ⬜ later |

## Editor — files

| id | feature | acceptance | status |
|---|---|---|---|
| F1 | Tree | Dirs first, natural sort, per-type icons, `main` badge, unsaved dot, folder expand/collapse | ✅ |
| F2 | New file / folder | Header icons and context menu; target is the selected folder; `.tex` appended when no extension; conflicts reported | ✅ |
| F3 | Add files | Native multi-select; copied into the selected folder; name clashes get ` (2)` | ✅ |
| F4 | Rename | Dialog with the stem preselected; open buffers/tabs follow; main file setting follows | ✅ |
| F5 | Delete | Confirm; main file protected; buffers/tabs closed | ✅ |
| F6 | Set main file | Context menu on `.tex` files | ✅ |
| F7 | Export project | zip via header icon | ✅ |
| F8 | Drag-and-drop move / Finder drop | | ⬜ v0.2 |
| F9 | Rewrite `\input{}` on rename | | ⬜ v0.2 |

## Editor — writing

| id | feature | acceptance | status |
|---|---|---|---|
| E1 | LaTeX highlighting | Own tokenizer: comments, commands (generic/keyword/sectioning), env names, math (inline/display/environments), verbatim bodies, refs/cites/labels, options, braces, specials, numbers; colours per theme | ✅ |
| E2 | Completions | after `\` (curated commands with snippets), `\begin{` (environments incl. used ones), `\ref{` (labels from open files + document), `\cite{` (keys from `.bib` files), `\input{`/`\includegraphics{` (project files) | ✅ |
| E3 | Environment auto-close | Enter at end of `\begin{x}` without a matching `\end{x}` inserts it | ✅ |
| E4 | Folding | environments and sectioning blocks | ✅ |
| E5 | Search, brackets, history, indentation | CodeMirror standard set; tab size and wrap from settings | ✅ |
| E6 | Tabs | multiple files, dirty marker, close, remembers undo history and scroll per file | ✅ |
| E7 | Autosave | debounce (setting), on blur/compile/close/tab-close; atomic write; status shows saving/saved | ✅ |
| E8 | Outline | per-file sections, click-to-jump, follows cursor, count | ✅ |
| E9 | Project-wide outline (across `\input`) | | ⬜ v0.2 |
| E10 | Image preview | png/jpg/gif/webp/svg open as preview instead of text | ✅ |
| E11 | Word count | prose words excluding commands/math in status line | ✅ |
| E12 | Snippet palette (`\`, `@`) | house-style table/figure/equation blocks | ⬜ later |
| E13 | Math hover preview (KaTeX) | | ⬜ later |

## Compile and diagnostics

| id | feature | acceptance | status |
|---|---|---|---|
| C1 | Compile | button + ⌘⇧↩; `latexmk` with engine, nonstopmode, file-line-error, synctex, optional shell-escape; saves first | ✅ |
| C2 | Streamed log | latexmk output lines appear live in the log tab | ✅ |
| C3 | Cancel | stop button kills the process; status `cancelled` | ✅ |
| C4 | Diagnostics | errors with file:line + TeX context, warnings (LaTeX/package/font) with input lines, over/underfull boxes, biber warnings, latexmk failures; deduped | ✅ |
| C5 | Editor markers | gutter markers, squiggles, hover messages for the open file; problems panel with filters; status counts; click-to-jump opens the file | ✅ |
| C6 | Result chip | `✓ 1.9 s` / `1 error · 2 warn`; click toggles problems | ✅ |
| C7 | PDF publish | fresh PDF copied atomically to `output/`; log and synctex kept; page count from log | ✅ |
| C8 | TeX detection | MacTeX/TeX Live/Homebrew/PATH; settings card, re-detect, override directory; clear error when missing | ✅ |
| C9 | Engines | pdfLaTeX, XeLaTeX, LuaLaTeX (availability from detection) | ✅ |
| C10 | SyncTeX jump (PDF ↔ source) | | ⬜ v0.2 |
| C11 | Compile on save | optional | ✅ |

## PDF

| id | feature | acceptance | status |
|---|---|---|---|
| P1 | Viewer | pdf.js, lazy page rendering at device pixel ratio, stable layout before render | ✅ |
| P2 | Keeps place | reload after compile restores scroll ratio and page; no flash | ✅ |
| P3 | Zoom | fit width / fit page / steps / ⌘wheel / percent label → 100% | ✅ |
| P4 | Pages | prev/next, type a page, `n / m` | ✅ |
| P5 | Export | save dialog, toast with Reveal | ✅ |
| P6 | States | no PDF yet / compiling (progress bar) / failed (banner, previous PDF stays) | ✅ |

## Versions

| id | feature | acceptance | status |
|---|---|---|---|
| V1 | Create | snapshot = `src.zip` + `main.pdf` (+ log) + `version.json`; default name `vN`; note | ✅ |
| V2 | List | newest first, name + date, hover details | ✅ |
| V3 | Export | PDF or bundle to a chosen path | ✅ |
| V4 | Rename / note · delete | | ✅ |
| V5 | Preview / restore a version | | ⬜ v0.2 |

## Settings and chrome

| id | feature | acceptance | status |
|---|---|---|---|
| S1 | Themes | paper · mist · ink · graphite; instant; persisted; early paint from localStorage | ✅ |
| S2 | Motion | off/slow/normal/fast scales every animation; off disables all but spinners | ✅ |
| S3 | Tooltips | global on/off + delay; max z-index; toward centre; shortcuts inside | ✅ |
| S4 | Editor settings | font size/family, wrap, numbers, tab, active line, brackets, auto-close, completions, spellcheck | ✅ |
| S5 | Compiler settings | engine, shell-escape, SyncTeX, TeX dir, compile on save, autosave delay | ✅ |
| S6 | About | version, data dir reveal, shortcuts | ✅ |
| S7 | Window | 1440×900 default, min 1024×640, overlay title bar, state remembered | ✅ |
| S8 | Uninstall from settings (remove app + data) | | ⬜ distribution phase |
