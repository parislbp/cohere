# Architecture

## Shape

```
┌──────────────────────────────── Tauri 2 window (WKWebView) ────────────────────────────────┐
│  React 18 + TypeScript (Vite)                                                                │
│  ┌───────────┐ ┌───────────────┐ ┌────────────┐ ┌───────────────┐ ┌──────────────┐          │
│  │ design/   │ │ components/   │ │ store/     │ │ features/     │ │ api/         │          │
│  │ tokens    │ │ ui primitives │ │ zustand    │ │ library       │ │ typed invoke │          │
│  │ 4 themes  │ │ icons, brand  │ │ settings   │ │ editor        │ │ events       │          │
│  │ motion    │ │ layout        │ │ library    │ │ settings      │ │ mock backend │          │
│  └───────────┘ └───────────────┘ │ project    │ └───────────────┘ └──────┬───────┘          │
│                                  │ ui         │                          │ invoke / listen   │
│                                  └────────────┘                          ▼                   │
├──────────────────────────────────── IPC (serde, camelCase) ──────────────────────────────────┤
│  Rust core (src-tauri/src)                                                                   │
│  commands.rs ── thin validators ──▶ library · files · compile · versions · templates · settings│
│  state.rs  (Paths, Settings cache, TexInfo cache, Compiler jobs)                              │
│  compile.rs ── spawns latexmk ── streams stdout/stderr as events ── logparse.rs ── PDF publish │
│  paths.rs  (safe_join, ids)   fsutil.rs (atomic write, zip, copy)   texbin.rs (find MacTeX)  │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
            ~/Library/Application Support/com.cohere.desk/   (settings.json · projects/<id>/ · .trash/)
                                  │
                                  ▼
            /Library/TeX/texbin · /usr/local/texlive/<year>/bin/universal-darwin   (latexmk, pdflatex, biber…)
```

Decisions:

- **Tauri commands, not a local HTTP server.** Frontier used a Python API; Cohere's core is small, synchronous file work plus one long-running child process, which fits Rust commands and events exactly and keeps the app a single binary.
- **One error type.** `AppError { kind, message }` is serialised for every command; the front end normalises it to `CohereError` so any UI can `toast(errorMessage(e))`.
- **Binary IPC for bytes.** PDFs and images return `tauri::ipc::Response` (raw bytes), never base64.
- **Blocking work off the async runtime.** `compile_project` runs `latexmk` inside `spawn_blocking`; output streams over `compile:log` / `compile:status` events so the UI stays live and can cancel.
- **Templates embedded.** `include_dir!` bakes `resources/templates/` into the binary; the renderer mirrors the texref CLI (`{{INCLUDE:block}}`, `{{KEY}}`) so both tools produce identical projects.

## Data layout

```
<data dir>/
├── settings.json                      Settings (every field has a default; unknown values are clamped)
├── projects/<uuid>/
│   ├── project.json                   ProjectManifest: title, topic, template, created, modified, archived, mainFile, engine, lastOpenedFile
│   ├── src/                           the LaTeX tree the user edits (main.tex, chapters/, references/ref.bib, figures/, Makefile, tex.json …)
│   ├── build/                         latexmk -outdir: .aux .log .fls .fdb_latexmk .bbl .bcf .synctex.gz, intermediate pdf
│   ├── output/                        main.pdf · main.log · main.synctex.gz · meta.json (OutputInfo) — published atomically after a build
│   └── versions/<stamp-id>/           version.json · main.pdf · src.zip (full source bundle) · main.log
└── .trash/<uuid>-<stamp>/             deleted projects, whole folder, recoverable by hand
```

`src/` is also a valid texref project (`tex.json`, `Makefile`), so an exported zip works with the `tex-*` shell commands.

## Rust modules

| module | responsibility | key functions |
|---|---|---|
| `paths.rs` | data-dir layout, id validation, `safe_join` (rejects `..`, absolute, empty segments), `clean_name` | `Paths`, `ProjectPaths`, `safe_join`, `rel_string` |
| `fsutil.rs` | atomic write (temp + rename + fsync), dir copy, zip (deflate, ignores `.DS_Store`), text detection, extensions | `write_atomic`, `zip_dir`, `copy_dir`, `looks_like_text` |
| `settings.rs` | `Settings` with defaults + `normalised()` clamps; load/save | `Settings::load/save/normalised` |
| `templates.rs` | embedded templates, `{{INCLUDE}}`/`{{KEY}}` renderer, scaffold (units, subunits, appendices, reading guide, texref manifest), blank template | `list`, `get`, `render`, `scaffold` |
| `library.rs` | manifests, list (modified desc), create (scaffold → manifest, rollback on failure), update meta, archive, touch, delete-to-trash, export zip/pdf | `list`, `create`, `update_meta`, `set_archived`, `delete`, `export_zip`, `export_pdf` |
| `files.rs` | tree (dirs first, natural sort), read (text/binary/image), atomic write, create, rename (refuses moving a folder into itself), delete, import with `(2)` dedupe | `tree`, `read`, `write`, `create_file`, `rename`, `delete`, `import` |
| `texbin.rs` | locate TeX: settings override → `/Library/TeX/texbin` → newest `/usr/local/texlive/*/bin/*darwin` → Homebrew → PATH; report engines, biber, latexmk version | `locate`, `child_path` |
| `compile.rs` | `latexmk` invocation (`-pdf|-pdfxe|-pdflua -interaction=nonstopmode -file-line-error -recorder -outdir=build [-synctex=1] [-shell-escape]`), env `max_print_line=10000`, stream events, parse logs (`.log`, `.blg`, latexmk stdout), publish PDF/log/synctex atomically, status classification, cancel | `Compiler::run/cancel`, `read_output_info` |
| `logparse.rs` | 79-column unwrap, `file:line:` errors with `l.N` context, `!` errors via file stack, LaTeX/package/font warnings with continuation lines, over/underfull boxes, page count, fatal detection, biber `WARN/ERROR`, latexmk failures; file stack with `None` placeholders for non-file parentheses | `parse_latex_log`, `parse_biber_log`, `parse_latexmk_output` |
| `versions.rs` | snapshot (zip of src + copy of PDF + log + version.json), list newest first, rename/note, delete, export pdf/bundle, default name `vN` | `create`, `list`, `rename`, `delete`, `export` |
| `state.rs` | `AppState { paths, settings: Mutex, tex: Mutex<Option<TexInfo>>, compiler: Arc<Compiler> }` | `settings`, `replace_settings`, `tex(force)` |
| `commands.rs` | the IPC surface (37 commands) | see below |
| `lib.rs` | builder: plugins (dialog, opener, window-state), setup (data dir from `app_data_dir()` or `COHERE_DATA_DIR`), warm TeX detection in a thread | `run` |

## IPC surface

| domain | commands |
|---|---|
| app / settings | `get_app_info` · `get_settings` · `save_settings` · `detect_tex` |
| templates | `list_templates` |
| library | `list_projects` · `get_project` · `create_project` · `update_project` · `archive_project` · `delete_project` · `export_project_zip` · `export_project_pdf` |
| files | `open_project` (summary + tree + output + versions + compiling) · `list_tree` · `read_file` · `read_file_bytes` · `write_file` · `create_file` · `create_folder` · `rename_entry` · `delete_entry` · `import_files` |
| compile | `compile_project` (async) · `cancel_compile` · `read_output_pdf` · `get_output_info` · `read_output_log` · `clean_build` |
| versions | `list_versions` · `create_version` · `rename_version` · `delete_version` · `export_version` · `read_version_pdf` · `next_version_name` |
| events | `compile:log { projectId, job, stream, line }` · `compile:status { projectId, job, status }` |

Types are mirrored by hand in `src/api/types.ts`; a field added in Rust is added there (both use camelCase via serde).

## Front-end layers

| layer | contents |
|---|---|
| `design/` | `tokens.css` (type, radii, spacing, durations, layers), `themes.css` (paper · mist · ink · graphite), `motion.css` (`--motion` scale, keyframes, off = 0s), `base.css` (reset, scrollbars, gradient text, drag region), `components.css` (btn, iconbtn, input, seg, checkbox, switch, card, kbd, badge, tooltip, menu, dialog, toast, pager, resizer, empty, sect-head) |
| `components/ui` | `Tooltip` + `TooltipProvider` + `InfoTip`, `Button`, `IconButton`, `Dialog`, `Menu` + `useMenu`, `TextInput`, `Field`, `Checkbox`, `Switch`, `Stepper`, `Segmented`, `Toasts`, `Pager`, `Resizer`, `EmptyState`, `GradientText`, `Kbd`, `Spinner` |
| `components/icons` | ~95 original line icons as path data (`paths.ts`) rendered by `Icon` |
| `components/brand` | `Mark`, `Wordmark` |
| `components/layout` | `TopBar` (drag region, brand/crumb/title, compile cluster, global icons + theme/motion menus) |
| `store/` | `settings` (load, deep update, apply `data-theme`/`data-motion`, debounced save), `ui` (view, settings dialog, toasts), `library` (projects, query, archived filter, sort, selection, pagination helpers, CRUD), `project` (session: tree, buffers, autosave timers, tabs, cursor line, diagnostics, compile status/log/result, output, pdf bytes, versions, jump-to-line) |
| `features/library` | `LibraryView` (header, seamless buttons, collapsible search, fit-to-height table, pager, archived toggle, bulk bar), `NewProjectDialog`, `RenameDialog`, `ConfirmDialog` |
| `features/editor` | `EditorView` (3 columns + resizers), `Sidebar` (3 sections + row resizers), `FileTree`, `OutlinePanel`, `Outputs`, `EditorPane` (tabs, editor/preview, problems, status), `TexEditor` (CodeMirror host with compartments), `codemirror/` (latexLanguage, latexHighlight, latexCompletions, diagnostics, editorTheme), `outline.ts`, `completionData.ts`, `ProblemsPanel`, `CompileCluster`, `PdfPane`, `pdf/` (PdfViewer, layout, zoom, pdfjs worker) |
| `features/settings` | `SettingsDialog` (appearance, editor, compiler, about) |
| `api/` | `client.ts` (`call`, `callBytes`, `CohereError`), `index.ts` (grouped commands), `events.ts`, `types.ts`, `mock/` (in-memory backend for browser dev and e2e) |

## Runtime flows

**Open a project.** `open_project` → store sets tree/output/versions → opens `lastOpenedFile` or `mainFile` → `read_output_pdf` → PDF pane renders.

**Type.** CodeMirror `updateListener` → `store.setText` marks dirty, restarts the per-file timer (`autosaveMs`) → `write_file` (atomic) → clean; tab dot and status "saved n ago" follow. Blur, compile, close, and tab close flush immediately.

**Compile.** `saveAll` → `compile_project` → Rust spawns `latexmk` in `src/` with `-outdir=../build` → each output line is an event appended to the log panel → on exit: parse `build/main.log` (+ `.blg`, stdout) → diagnostics; if a fresh PDF exists copy it to `output/main.pdf` + write `meta.json` → result → store applies diagnostics to the open editor, updates the problems panel/status, and reloads PDF bytes (viewer keeps scroll position and page).

**Version.** `saveAll` → `create_version` zips `src/`, copies `output/main.pdf` + log, writes `version.json` → list updates; export copies the artefact to a user-chosen path.

## Security

- All file paths from the UI pass through `safe_join`; ids through `validate_id`.
- CSP: `default-src 'self'`; styles allow inline (CodeMirror injects a style sheet); workers from `self`/blob (pdf.js); no remote connections.
- Capabilities: core defaults, window controls, dialog open/save/ask, opener reveal/open, window-state.
- `shell-escape` is off by default and labelled as a trust decision in Settings.
