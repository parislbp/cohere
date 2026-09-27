# Extensibility

Where the seams are, so the later features fit without rewrites.

## Extension points

| seam | how to extend |
|---|---|
| **Commands** | add a function in a Rust module, wrap it in `commands.rs`, register in `lib.rs`, mirror the type in `src/api/types.ts`, add a call in `src/api/index.ts`, and a case in `src/api/mock/mockBackend.ts` (the mock must stay complete so e2e keeps working) |
| **Templates** | drop a folder in `src-tauri/resources/templates/<key>/` with `template.json`, `main.tex`, optional `abstract.tex`; shared blocks in `_shared/blocks/`; it appears in the New dialog automatically (`templates::list` sorts known keys first) |
| **Themes** | add a `[data-theme="x"]` block in `themes.css` with the full variable set, add to `THEMES` in `types.ts` and `settings::THEMES` in Rust |
| **Editor extensions** | `TexEditor` composes CodeMirror extensions in `baseExtensions()`; settings-driven ones live in compartments; new language features belong in `codemirror/` |
| **Completions** | `latexCompletions.ts` takes a `getData()` provider; add sources (e.g. package macros) by extending `CompletionData` and `completionData.ts` |
| **Diagnostics** | `logparse.rs` returns `Diagnostic { severity, file, line, message, detail, source }`; new sources (chktex, a linter) just push more of them |
| **Sidebar sections** | `Sidebar.tsx` stacks `<sect>` blocks with fraction sizing; a fourth section adds a fraction and a resizer |
| **Top bar** | `TopBar.tsx` grid; the centre slot is per-view (`CompileCluster` in editor) |
| **Keyboard** | `lib/keys.ts` `SHORTCUTS` map; global handlers in `App.tsx`/`EditorView.tsx`; editor-scoped ones in the CodeMirror keymap |
| **Native integration** | `lib/native.ts` wraps plugins; the mock intercepts `plugin:dialog|*` and `plugin:opener|*` |

## Planned super-features and their hooks

### Snippet palette on `\` and `@`
- CodeMirror completion source with a custom `renderer` per option (a small preview of the table/figure/equation block), plus a command palette dialog (`Dialog` + fuzzy list) bound to `@`.
- Snippets live as `.tex` stubs in `_shared/snippets/` (shared with texref's planned `tex-table` etc.) and load via `include_dir!` → `list_snippets` command.

### SyncTeX (v0.2)
- Rust: `synctex view -i line:col:file -o main.pdf` and `synctex edit -o page:x:y:main.pdf` via the TeX binaries (`synctex` ships with TeX Live), parsing the `Page:`/`h:`/`v:`/`Input:`/`Line:` fields.
- Front end: `PdfViewer` exposes page geometry; double-click a page → `edit` → `jumpTo(file, line)`; ⌘-click in the editor → `view` → viewer highlights a rectangle overlay.

### Project-wide outline
- `parseOutline` per file is pure; a `useProjectOutline` hook walks `\input`/`\include` from the main file (files loaded via `read_file`, cached by modified time) and concatenates with file offsets. The `OutlinePanel` gains a `file | project` segmented toggle.

### Quick open (⌘P)
- Fuzzy over `flattenTree(tree)`; reuse the Menu/Dialog primitives.

### Version restore / preview
- `read_version_pdf` already exists; add `extract_version_to_new_project(vid)` (unzip `src.zip` into a fresh project) — non-destructive restore.

### Git
- Optional per-project `git init` in `src/`; commit on version create; show a small history list. Rust `git2` or shelling out to `git`.

### AI assistance (later, local first)
- A `features/assist/` slice with a provider interface `{ complete(prompt, context) }`; first provider = a local llama-server (eos already runs one); context = current selection + outline + bibliography keys. Entry points: a `@` palette action, a right-click "rewrite selection", and a compile-error explainer that takes `Diagnostic.detail` as input. No provider is loaded unless the user turns it on.

### Bundled TeX / updater
- See 07-distribution; `texbin::locate` gets one more candidate (`<data dir>/texlive/bin`) and a `source: "Cohere"` label.

## Conventions to keep

- camelCase over IPC; hand-mirrored types; every command mocked.
- No colour literals in components; only CSS variables.
- Icon buttons always carry a tooltip; explanatory text goes into `InfoTip`s.
- Motion uses `--dur-*` only.
- Stores own state; components render; `src/api` is the only place `invoke` is called.
- Tests accompany every module (`*.test.ts(x)` beside the code; fixtures under `src-tauri/tests/fixtures`).
