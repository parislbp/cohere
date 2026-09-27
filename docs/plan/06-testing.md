# Testing

## Pyramid

```
         Playwright e2e (mock backend, real UI in Chromium + WebKit)      ~10 flows
      Vitest component/integration (RTL + jsdom, mocked IPC)             ~10 suites
   Vitest unit (libs, stores, tokenizer, completions, outline, mock)      ~15 suites
Rust unit tests (cargo test; real TeX log fixtures)                       ~30 tests
```

`npm run check` runs typecheck → lint → vitest → cargo test. `npm run e2e` runs Playwright (needs `npx playwright install chromium webkit` once).

## Rust (`cargo test` in `src-tauri`)

| module | tests |
|---|---|
| paths | nested joins, `..`/absolute rejection, id and name validation |
| fsutil | atomic write leaves no temp file, copy, zip contents and ignore list, text detection, extension mapping |
| settings | defaults roundtrip, partial file fills defaults and clamps |
| templates | seven templates listed in order, `{{INCLUDE}}`/`{{KEY}}` rendering, project scaffold tree (inputs, appendices, labels, worked example only in chapter 1, no unresolved placeholders), blank/brief/periodical/minimal/paper/paper-single scaffold, paper variants share the style block |
| library | create → list → rename/topic clear → archive → export zip → export pdf refused without output → delete to trash; bad input and bad ids rejected |
| files | CRUD roundtrip with natural sort, conflict, folder-into-itself refusal, path escape refusal, import dedupe, image detection |
| versions | snapshot with/without PDF, list order, export by kind, rename/note, delete, bad id |
| logparse | 79-column unwrap; clean log (no errors, pages); errors attributed to `main.tex:6` and `chapters/one.tex:2` with context; runaway argument; math cascade; reference/citation warnings on line 7; overfull hbox at line 2; package warning continuation joined; missing package fatal with stack attribution; absolute → relative paths; biber warnings; latexmk stdout failures |
| texbin | candidate reporting without panics; child PATH composition |

A `compile` integration test (behind `#[ignore]`, run manually when TeX is present) compiles a scaffolded project end to end and asserts `output/main.pdf` and `meta.json`.

## Vitest unit

| suite | covers |
|---|---|
| `lib/format` | DD MM YYYY, relative time buckets, bytes, durations, path helpers, slug |
| `lib/placement` | toward-centre side choice, clamping, flipping, start/end alignment |
| `store/library` | filter (archived, query on title/topic/template), sorting, rows-that-fit, pagination clamp |
| `codemirror/latexLanguage` | token names for comments, commands, sectioning, env names, inline/display math, verbatim bodies, ref/cite args, options, escapes |
| `codemirror/latexCompletions` | command, environment, label, cite (comma-aware), file completions; environment auto-close keymap |
| `codemirror/diagnostics` | mapping to CM diagnostics (file filter, line clamp, range, severity, detail) |
| `outline` | nested braces, short titles, comments skipped, labels on next line, appendix flag, tree, item-at-line |
| `api/mock/mockBackend` | every command through the real `src/api` layer; compile events via `listen`; errors by kind |
| `components/icons` | every icon renders a 20×20 svg with drawing children; no fills |
| `features/editor/pdf/PdfViewer` | placeholders sized from viewports, state callback, page navigation, zoom scale, cleanup |

## Vitest component (RTL, mocked IPC)

`installMockBackend({ latencyMs: 0 })` in `beforeEach`, render with `TooltipProvider`:

- `LibraryView`: renders rows from the mock, filters on typing, opens the new-project dialog, creates a project (row appears), archives and unarchives via the filter, delete confirm flow.
- `Tooltip`: appears after delay on hover, shows kbd chip, hides on scroll, respects the global toggle, stays inside the viewport.
- `SettingsDialog`: theme card click sets `data-theme`; motion sets `data-motion`; engine segmented disabled when unavailable.
- `EditorPane` + `ProblemsPanel`: diagnostics render grouped; click calls `jumpTo`; log tab shows streamed lines.

## Playwright e2e (`e2e/`, `npm run dev:mock` server)

Projects: `chromium` and `webkit` (closest to WKWebView). `baseURL` `http://localhost:1420/?mock=1`.

| spec | flow |
|---|---|
| `library.spec` | Library title visible; 6 rows (archived hidden); search filters to 1; archived toggle shows 1; hover reveals actions; rename dialog changes title; archive → row disappears → unarchive |
| `new-project.spec` | new → pick `brief` → title → create → editor opens with `main.tex` tab and tree |
| `editor.spec` | open project → editor shows highlighted tokens (`.cm-line` spans with syntax classes) → type text → tab shows dirty then saved → outline lists sections → click outline item scrolls |
| `compile.spec` | open the `\badcommand` project → compile → chip shows `1 error` → problems panel lists error with file:line → gutter marker present → click problem selects line; clean project → `✓` |
| `versions.spec` | create version → row appears → export menu → delete |
| `theme-motion.spec` | switch each theme via menu → `html[data-theme]` changes → colours differ; motion off → transitions 0s |
| `tooltips.spec` | hover an icon at the bottom-right → tooltip visible, within viewport, above anchor; top-left → below anchor |
| `sidebar.spec` | collapse/expand with ⌘B; drag resizer changes widths; sections resize |

Screenshots per theme are saved to `playwright-report/` for visual review (not pixel-diffed in v0.1).

## Manual QA checklist (real Tauri, real TeX)

1. `npm run tauri dev` → Library loads; theme persists across restarts.
2. New project from each template → compiles clean → PDF shows page count.
3. Introduce `\badcommand` → compile → gutter marker + problems row → fix → recompile → chip `✓`.
4. Remove the `.sty` package → compile fails → previous PDF stays, banner says so.
5. Rename a chapter file → open tab follows → compile still works (after fixing `\input` by hand — v0.2 automates).
6. Export zip → `unzip -l` shows `tx.<slug>/main.tex`; `cd` in and `make` builds with texref's Makefile.
7. Version → export PDF and bundle → files open.
8. Quit while typing → relaunch → text present (autosave on blur/beforeunload).
9. Delete project → appears in `.trash/`.
10. Settings: engines reflect detection; override to a bad dir → clear error on compile; re-detect fixes.
