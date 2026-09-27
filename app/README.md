# Cohere — app

A local-first LaTeX writing desk for macOS. Tauri 2 (Rust) + React 18 + TypeScript + CodeMirror 6 + pdf.js, compiling with the machine's MacTeX/TeX Live through `latexmk`.

## Run

```bash
npm install --cache ~/.npm-cohere-cache   # the shared ~/.npm cache has root-owned files
npm run tauri dev                          # the app (alias: tdev inside app/)
npm run dev:mock                           # browser-only UI at http://localhost:1420/?mock=1 (in-memory backend)
```

Data lives in `~/Library/Application Support/com.cohere.desk/`. Set `COHERE_DATA_DIR=/some/dir` to use another location (useful for testing).

## Check

```bash
npm run check        # typecheck · lint · vitest · cargo test
npm run test         # vitest only
npm run test:rust    # cargo test in src-tauri
npm run e2e          # Playwright against the mock backend (first: npx playwright install chromium webkit)
```

## Layout

```
src/
  api/          typed invoke wrappers, events, TS mirror of Rust types, mock backend
  design/       tokens · 4 themes · motion · base · component classes
  components/   ui primitives (Tooltip, Button, Dialog, Menu…), icons, brand, layout (TopBar)
  store/        zustand: settings · ui · library · project (editing session)
  features/     library · editor (tree, outline, outputs, CodeMirror LaTeX, problems, PDF) · settings
src-tauri/
  src/          Rust core: paths · fsutil · settings · templates · library · files · texbin · compile · logparse · versions · state · commands · lib
  resources/    embedded project templates (blank, project, brief, periodical, minimal)
  tests/        real pdflatex/biber log fixtures for the parser
e2e/            Playwright specs
brand/          logo source (SVG → icons via `npx tauri icon`)
```

See `../docs/plan/` for the architecture, design system, UX, features, robustness, testing and distribution plans, and `../docs/documentation/` for user documentation.
