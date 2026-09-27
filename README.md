# Cohere

*To hold together.* A local-first LaTeX writing desk for macOS: a library of projects, house
templates, a syntax-aware editor with compile diagnostics, the PDF beside it, and versioned
snapshots — on your own machine, with no account and nothing sent anywhere.

Cohere takes the working model of Overleaf (source and PDF side by side, one compile button,
an outline) and rebuilds it as a quiet native app on top of the TeX Live already on the Mac.
If there is none, it installs a private, minimal one for itself.

## Install

Download **[cohere-0.2.1.dmg](https://github.com/parislbp/cohere/releases/download/v0.2.1/cohere-0.2.1.dmg)**
(all versions on the [releases page](https://github.com/parislbp/cohere/releases)), open it, drag Cohere to Applications. Signed and notarized; Apple Silicon; macOS 12 or newer.

Cohere checks this repository's releases for updates when it starts (you can turn that off) and
installs them in place after verifying their signature. That check is the only network request
the app makes on its own.

## What it does

- **Library** — every project one row: create from a template (blank · project · brief ·
  periodical · minimal · paper · paper-single), open, favourite, archive, export as zip or PDF.
- **Editor** — files · project-wide outline · outputs in a sidebar; CodeMirror 6 with LaTeX
  colouring, completions, a snippet palette on `@`, ⌘B/I/U; compile with `latexmk`, problems
  in the gutter and a log tab; the PDF refreshes in place; versions freeze PDF + sources.
- **⌘K** — every command in one searchable palette, with its shortcut.
- **Four themes** (paper · mist · ink · graphite), tooltips instead of paragraphs, motion you can
  slow down or switch off.
- **Never lose text** — autosave, atomic writes, deleted projects go to `.trash`, truncated PDFs
  are refused rather than published.

User guide: [`docs/documentation/v0.2.0.md`](docs/documentation/v0.2.0.md).

## Repository

```
app/            the Tauri 2 app — Rust core (src-tauri/) · React 18 + TypeScript front end (src/) · Playwright e2e
app/scripts/    build · release · install · uninstall · secret scan
docs/plan/      design and architecture (00–10), roadmap
docs/documentation/   the user guide per version
docs/releases/  release notes (also the GitHub Release text and the in-app update notes)
CHANGELOG.md    all releases, newest first
Makefile        make dev · check · build · release VERSION=x.y.z · install · uninstall
```

## Develop

```bash
make setup      # node modules + git hooks (once)
make dev        # tauri dev — its own library folder, never the installed app's projects
make check      # typecheck · lint · vitest · cargo test
make e2e        # Playwright against the in-memory mock backend
```

Requirements: Xcode command line tools, Rust (stable), Node 22, a TeX Live for the compile tests
(`make dev` works without one — the app will offer to install TeX for itself).

## Release

```bash
make release VERSION=0.3.0      # bump · check · signed+notarized DMG · changelog · tag · push · GitHub Release
make install                    # the DMG you just built → /Applications
```

The runbook, including what lives in the keychain and why nothing secret is in this repository,
is [`docs/plan/10-release.md`](docs/plan/10-release.md).

## License

MIT — see [LICENSE](LICENSE).
