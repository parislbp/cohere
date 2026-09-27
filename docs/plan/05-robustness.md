# Robustness

## Never lose text

| risk | defence |
|---|---|
| crash mid-write | every write goes to `.<name>.tmp-<uuid>` in the same directory, `fsync`, then `rename` — readers see the old or the new file, never a torn one |
| forgetting to save | autosave after `autosaveMs` of quiet (default 800 ms), plus save-all on compile, window blur, visibility change, project close, tab close, and ⌘S |
| stale write racing a newer edit | the store captures the text being written; on success it only marks clean if the buffer still equals that text |
| accidental delete | projects move to `.trash/<id>-<stamp>/`; UI confirms; main file cannot be deleted; versions are immutable copies |
| rename breaking open editors | buffers, tabs, active path and the main-file setting are remapped when a file or folder is renamed |

## Never trust a path

- Every relative path from the UI goes through `safe_join`: normalises separators, rejects `..`, absolute paths, prefixes and empty segments; the result is always inside `src/`.
- Ids (projects, versions) must match `[A-Za-z0-9_-]{1,80}`.
- Names are trimmed and refuse `/`, `\`, NUL, `.` and `..`.
- Import copies files *into* the project; it never links or references external paths.

## Compile

- `latexmk -interaction=nonstopmode -file-line-error -recorder` so TeX never waits on stdin and errors carry `file:line`.
- `max_print_line=10000` in the child environment removes TeX's 79-column wrapping; the parser still unwraps 79-column lines for logs produced elsewhere.
- Output streams as events; the UI never blocks on a compile. `spawn_blocking` keeps the Tauri runtime free.
- A second compile on the same project is refused (`conflict`) while one runs; cancel kills the child and reports `cancelled`.
- The PDF is published only if the build produced a file newer than the job start and the job was not cancelled; otherwise the previous PDF stays and the UI says so.
- Missing TeX is a clear, actionable error (`tex` kind) with a settings link, not a stack trace.
- `shell-escape` is opt-in and labelled as a trust decision.

## Log parsing

Built against real fixtures generated with pdflatex/biber (`src-tauri/tests/fixtures/`):

- `errors_warnings.log` — undefined control sequences in two files, runaway argument, bad math delimiter cascade, undefined reference/citation, overfull hbox, package warning with continuation lines
- `missing_package.log` — fatal `File … not found`, emergency stop, no PDF
- `clean.log` — success with page count
- `biber.blg` — missing database entry warning

Strategies: `-file-line-error` lines are authoritative; `!` errors fall back to the file stack; the file stack pushes `None` for non-file parentheses so `(rerunfilecheck)`-style text cannot pop a real file; warnings join their indented continuation lines; diagnostics are deduped by (severity, file, line, message); absolute paths inside `src/` are made relative so they match editor paths.

## Front end

- Errors from any command are normalised (`CohereError`) and surfaced as toasts with the backend message verbatim.
- Stores are the single source of truth; components never call `invoke` directly except through `src/api`.
- The PDF viewer swaps documents without unmounting and cancels stale render tasks; a bad PDF reports an error banner and keeps the previous document.
- CodeMirror keeps one `EditorState` per open file so undo history and scroll survive tab switches; external text changes are applied as a single transaction.
- Settings are clamped both in Rust (`normalised`) and tolerated on the front end (unknown theme → paper).
- Early theme paint from `localStorage` avoids a flash before the backend answers.

## Performance budgets

| operation | target |
|---|---|
| library list of 200 projects | < 150 ms (one `read_dir` + manifests) |
| open project | < 300 ms to first paint of tree + editor |
| keystroke → highlight | 60 fps; stream tokenizer is linear |
| autosave write | < 20 ms (atomic rename) |
| compile UI latency | log line visible < 50 ms after latexmk prints it |
| PDF reload after compile | previous pages stay on screen; new pages render lazily; position restored on the next frame |
| theme switch | one attribute change; CSS variables only |

## Compatibility

- macOS 12+ (WKWebView Safari 15+): pdf.js legacy build, no `color-mix`, no `:has()` reliance, `-webkit-` prefixes for backdrop-filter and background-clip.
- Apple Silicon and Intel: TeX bin detection tries `universal-darwin`, `aarch64-darwin`, `x86_64-darwin`.
- No network access; works offline.

## Observability

- `compile:log` events give the raw latexmk transcript in the log tab; `main.log` is viewable in full from the Outputs card.
- `cargo test` covers the Rust modules; Vitest covers stores, libs, tokenizer, completions, outline, mock backend; Playwright covers the UI flows.
- `console.warn` for degraded paths (settings unreadable → defaults; skipped broken manifests).
