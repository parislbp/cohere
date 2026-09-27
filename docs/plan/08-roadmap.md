# Roadmap and progress

Working log for the build. Milestones are ordered; each has a definition of done. Status is updated as work lands.

## M0 — Foundations ✅

- [x] Workspace `cohere/{app,docs}`; templates copied from texref into `src-tauri/resources/templates`
- [x] Rust core: paths, fsutil, settings, templates (renderer + scaffold for 7 templates), library, files, versions, texbin, compile (streamed), logparse (real fixtures), state, commands (37), lib
- [x] `cargo test`: 27 tests green
- [x] Tauri config (overlay title bar, CSP, capabilities, icons from the Cohere mark)
- [x] Vite + React + TS + Vitest + Playwright + ESLint scaffold; `@/` alias; test setup with browser API stubs

## M1 — Design system and primitives ✅

- [x] Tokens, 4 themes, motion scale, base, component classes
- [x] Tooltip system (max z-index, toward-centre placement, kbd chips, global toggle/delay), Button/IconButton, Dialog, Menu, inputs, Toasts, Pager, Resizer, EmptyState, GradientText
- [x] Icon set (original line icons, path data + React wrapper)
- [x] Brand mark + wordmark

## M2 — Library ✅

- [x] Store (filter/sort/pagination/selection/CRUD) + unit tests
- [x] View: title, seamless search/new, collapsible search, fit-to-height table, hover actions, archived toggle, bulk bar, pager
- [x] Dialogs: new project (templates + structure), rename/topic, confirm delete
- [x] Export zip/pdf with native save dialog and Reveal toast

## M3 — Editor ✅

- [x] Project store: buffers, autosave, tabs, tree ops, compile state, PDF bytes, versions, jump-to-line
- [x] Layout: three resizable columns, collapsible sidebar, three resizable sections
- [x] File tree with header actions and context menu; image preview
- [x] LaTeX language for CodeMirror: tokenizer, highlight style per theme, completions, environment auto-close, folding, diagnostics bridge
- [x] Outline panel (per file)
- [x] Outputs: current PDF card, versions (create/rename/delete/export)
- [x] Compile cluster, streamed log, problems panel, status line
- [x] PDF pane: pdf.js viewer that keeps its place, zoom/fit/pages, states

## M4 — Settings and chrome ✅

- [x] Settings dialog: appearance (theme cards, motion, tooltips), editor, compiler (TeX detection card, override), about
- [x] Top bar: brand/crumb/title, compile cluster, theme + motion menus, settings
- [x] Global shortcuts

## M5 — Verification ✅

- [x] Mock backend for browser dev and e2e (`npm run dev:mock`, `?mock=1`)
- [x] Vitest: libs, stores, tokenizer, completions, outline, diagnostics, icons, PDF viewer, mock backend — 328 tests
- [x] Playwright e2e (Chromium): library (7), editor (6), compile/diagnostics/versions (4), themes/motion/tooltips/settings (4) — 21 specs; WebKit opt-in (`PW_WEBKIT=1`) because the frozen macOS-14 WebKit build does not launch with this Playwright
- [x] Rust: 29 tests including a real-TeX integration test (`compile::tests`) that runs `latexmk` on a scaffolded project, publishes the PDF/SyncTeX, then injects an undefined command and checks the attributed `main.tex:line` error while a PDF is still produced
- [x] `tauri dev` launches; the WKWebView connects to Vite HMR; Rust hot-rebuild verified
- [x] Screenshots per theme reviewed (Library, Library hover/tooltip, New project, Editor with diagnostics in paper and ink, Settings)
- [ ] Manual QA checklist (06-testing) on the real window — for the user's first session

## M6 — Documentation ✅

- [x] `docs/documentation/v0.1.0.md` — user documentation
- [x] `app/README.md` — developer quick start

## M7 — First-use refinements ✅ (2026-09-21, after the first hands-on session)

- [x] Dialogs no longer steal focus while typing (effect keyed on `open` only; callbacks in refs)
- [x] Themed window controls: native traffic lights hidden via AppKit; Cohere draws them in theme colours, revealed on top-bar hover in place of the brand; brand flush left in both views
- [x] Library: separated faded **search** / primary **new**, all corners rounded; empty state centred, duplicate button removed; footer toggle centred; no inner focus ring in search
- [x] New project: fixed-height dialog, 3×2 field grid (title/topic/subtitle · units/sub-units/appendices), underline fields, greyed fields for templates that lack them, “Untitled Project N”, no cancel, readable italic description
- [x] Editor: brand + back + title top-left; sidebar toggle and editor text-size controls in the tabs row; compile (ghost, accent icon) + status chip at the left of the PDF toolbar; page controls centred; smaller default text (12) and a narrower gutter; ⌘1 / ⌥← / ⌘B sidebar, ⌘⇧G gutter, ⌘⌥± text size
- [x] Sidebar sections fold from their headers (persisted); snapshot camera lives on the versions row
- [x] Settings: fixed size, header + nav on one surface, page on a raised card with a rounded corner

## M8 — Second-session refinements ✅ (2026-09-21)

- [x] New project: fixed 880×~600 dialog, never scrolls; 3×2 grid centred in the free area; serif bold labels; subtle inset focus instead of the accent underline; no "Untitled" hint (the placeholder carries it)
- [x] Sidebar: open sections share all free space (flex-grow normalised to 1 — sub-1 totals left gaps); folded headers stack top/bottom; grips on the dividers; file actions flush right
- [x] Top bar: back arrow removed, project title centred; ⌘⇧H (and ⌘⇧L) home
- [x] Editor default 11px with a settings `version` migration (v2) so older files adopt it once
- [x] Status line toggle: setting + ⌘⇧↓ / ⌥↓ (capture-phase, override CodeMirror's bindings)
- [x] `@` snippet palette: 45 house-style blocks with tab-stops and aliases, composed with the `\` completion source; tests

## M9 — Third-session refinements ✅ (2026-09-23)

- [x] Library: wider list, smaller type, 12px column gutters; **type column** with a template glyph per row (`TemplateInfo.icon`/`shortName` from template.json, 7 templates incl. the two paper variants) and a hover tooltip; **favourite column** (`ProjectManifest.favorite`, header cycles all → favourites → non-favourites); checkboxes appear on hover/selection only; Modified as whole days; narrow columns centred; title/topic clip at 23ch
- [x] File tree: pointer-based drag and drop for moving files/folders (ghost, drop highlight, hover-to-expand, Esc cancels, no-op/self-nesting refused); Finder drops via Tauri drag-drop events (HTML5 fallback for the mock); **Reveal in Finder** in the header and context menu (`ProjectDetail.srcDir`)
- [x] Editor: ⌘B/⌘I/⌘U/⌘⇧C toggle-wrap commands (word under cursor, multi-selection, unwrap); ⌘B no longer toggles the sidebar; the window shortcut handler ignores `defaultPrevented` events so editor bindings never double-fire
- [x] Icons: `tplBlank … tplPaper1/2`, `star`, `starFilled`, `starOff`

## M10 — Fourth-session refinements ✅ (2026-09-24)

- [x] Five clustered accents per theme (`--a1..a5` + light/dark/soft/gradient): paper maroon·copper·gold·tan·burgundy, mist teal·viridian·lilac·pink·blue-purple, ink brass·terracotta·olive·rose·slate, graphite sea-glass·sky·lavender·mint·peach; traffic lights and template glyphs draw from them; swatches on the theme cards
- [x] Template icons redrawn as distinct objects (book, memo, newspaper, panelled paper ×2, card, cursor sheet); title/topic truncate at the column edge
- [x] Scaffolds emit only LaTeX files; `templates::cli_files` renders Makefile/README/.gitignore/tex.json for a future CLI-bundle export
- [x] Paper style: section hairline suppressed at page top (`\secrule`) — fixes the double rule; workbook project repaired (rule, TOC page, legend at foot, American spelling, CLI files removed)
- [x] Project-wide outline (`projectOutline.ts`): follows \input/\include/\subfile/\import in document order, cycle/limit guards, appendix carried across files (preamble macro definitions ignored), file badges, missing inputs listed; ⌘⇧0 toggles; scope persisted

## M11 — Fifth-session refinements ✅ (2026-09-24)

- [x] Compile robustness: latexmk stdout/stderr read as raw bytes (`read_until` + lossy UTF-8) — a single 8-bit character echoed by TeX used to close the pipe and kill the engine with SIGPIPE, leaving a truncated PDF that was published as a success; `pdf_is_complete` (`%%EOF` guard) now refuses to publish such a file and reports "engine stopped before finishing the PDF"; logs read lossily so page counts and diagnostics survive 8-bit logs. Real-TeX test covers `\typeout{^^e9…}`
- [x] SyncTeX forward search removed (Rust command, `PdfViewer.goToPosition`, `SyncHit`) — it was failing for the same reason as above; can return once click-to-jump is designed properly
- [x] Defaults on open: outputs section folded (settings v3 migration), outline in whole-document scope
- [x] ⌘K command palette: every command in one searchable list (fuzzy, ranks prefixes and word starts), grouped when empty, shows shortcuts and current state, arrow/Enter/Esc; components subscribe to `cohere:*` events for actions they own
- [x] Workbook project: compiles cleanly again (51 pages) after the fix above

## Later milestones

| milestone | content |
|---|---|
| **v0.2 — writing flow** | SyncTeX inverse (PDF → source) · quick open · `\input` rewrite on rename · duplicate project · version preview/restore · import zip/folder · CLI-bundle export |
| **v0.3 — distribution** | signed + notarized DMG · first-run TeX check · private TeX download (07) · uninstall from Settings · updater + `release` command |
| **v0.4 — super features** | `@` palette fed from templates/user snippets · KaTeX hover preview · templates view · spell-check dictionary · assistant (see 09) |
| **v0.5 — assistance** | local-model hooks (rewrite selection, explain error) · Git per project |

## Decisions log

| date | decision | why |
|---|---|---|
| 2026-09-21 | Tauri commands instead of a local HTTP service | one binary, no port, streaming via events is enough |
| 2026-09-21 | Own LaTeX stream tokenizer instead of legacy `stex` | token classes for sectioning/env/refs/math the theme can colour; verbatim + math states; foldable |
| 2026-09-21 | pdf.js legacy build | WKWebView on macOS 12/13 lacks newer JS features the modern build assumes |
| 2026-09-21 | Templates embedded with `include_dir!` | self-contained app; identical output to texref |
| 2026-09-21 | Data in app-data dir, projects as folders | plain files, recoverable, zip-exportable, Finder-friendly |
| 2026-09-21 | `-file-line-error` + `max_print_line=10000` | authoritative file:line, no wrapped paths |
| 2026-09-21 | Delete = move to `.trash` | recoverable by hand; no hard delete in v0.1 |
| 2026-09-21 | Mock backend behind `mockIPC` | same `invoke` code path in browser dev, component tests and Playwright |
| 2026-09-21 | Compiler emits through a `Sink` trait | `AppHandle` in the app, a collector in tests — lets `cargo test` run real latexmk |
| 2026-09-21 | `ProjectMetaUpdate` uses a double-option deserializer | JSON `null` must mean "clear" for topic/engine/lastOpenedFile; serde folds it into "absent" by default (caught by the mock-backend worker) |
| 2026-09-21 | Playwright on Chromium by default | the frozen WebKit build for macOS 14 fails to launch (`PushAPIEnabled`); WebKit stays opt-in |
