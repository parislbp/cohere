# Distribution ✅ (implemented in 0.2.0 — see `10-release.md` for the runbook)

> Status: everything in *Goals* shipped in 0.2.0. Decisions taken: Apple Silicon only · macOS 12+ · GitHub Releases host both the DMG and the updater manifest (`latest.json`) · TeX strategy **A + C** (system TeX, else *Install TeX for Cohere*) · uninstall from Settings › About. The sections below are the original design, kept for the reasoning.

## Goals

1. `Cohere.app` in a signed, notarized DMG that installs by drag.
2. A clean uninstall path from inside the app.
3. Updates with signed manifests, driven by a `build + push` command.
4. A defensible answer to "what about TeX?".

## Build

- `npm run tauri build` → `src-tauri/target/release/bundle/{macos/Cohere.app, dmg/Cohere_0.1.0_aarch64.dmg}`. Targets `dmg` + `app` are already in `tauri.conf.json`.
- Universal binary: `tauri build --target universal-apple-darwin` (needs the `x86_64-apple-darwin` rust target installed). Decide per release; Apple Silicon only is acceptable for a personal app.
- Release profile: LTO, `opt-level = "s"`, `strip`, `panic = "abort"` already set. Expected size: app ≈ 12–16 MB (pdf.js and CodeMirror dominate the front end).
- DMG assets: background with the mark and an arrow to Applications; window size and icon positions in `bundle.macOS.dmg` (eos has a working `build-dmg.sh` to borrow from).

## Signing and notarization

- `bundle.macOS.signingIdentity`: "Developer ID Application: …" (the eos identity exists).
- Hardened runtime entitlements: none special (no JIT, no camera). If a bundled TeX is executed later, add `com.apple.security.cs.allow-unsigned-executable-memory` only if needed by luatex.
- Notarize with `xcrun notarytool submit --wait` using an app-specific password in the keychain (`keyset`/`keyget` from zsystem), then `xcrun stapler staple`.
- Script: `app/scripts/release.sh` — version bump (tauri.conf.json, package.json, Cargo.toml), build, sign, notarize, staple, checksum, write `dist/`.

## TeX strategy (the real question)

| option | size | pros | cons |
|---|---|---|---|
| **A. Use the system MacTeX (v0.1 behaviour)** | 0 | zero bloat, full TeX Live, user already has it | requires install; detection + guidance UI needed |
| **B. Bundle a minimal TeX Live as a resource** (BasicTeX-like: `latexmk`, `pdflatex`, `xelatex`, `lualatex`, `biber`, and the packages the templates use: `booktabs tabularx xltabular titlesec tocloft enumitem parskip caption listings needspace microtype xcolor tikz pgf adjustbox setspace amsmath mathtools biblatex hyperref fancyhdr geometry mwe`) | ~300–450 MB | works out of the box; reproducible | huge DMG; TeX Live licensing is fine (LPPL/GPL mix) but binaries must be signed individually (`sign-binaries.sh` pattern from eos); `tlmgr` updates inside an app bundle are awkward → install to `~/Library/Application Support/com.cohere.desk/texlive/` on first run instead of inside the `.app` |
| **C. Download-on-first-run installer** | app small; downloads ~350 MB | small DMG; can update independently | needs network once; hosting the tarball (R2 as eos does) |
| **D. Tectonic** (single-binary XeTeX-based engine that fetches packages on demand) | ~30 MB binary | tiny, self-contained, cached packages | no `latexmk` (Tectonic has its own driver), on-demand downloads need network, some packages behave differently; `-file-line-error` semantics differ → log parser adjustments |

Recommendation: ship **A** now with a first-run check ("TeX not found → Install MacTeX / BasicTeX (link) or point Cohere at a bin directory"), then implement **C** as the "Install a private TeX" button in Settings › Compiler that downloads a pinned, signed tarball into the data dir and adds it to detection. Keep B as a fallback for an "offline" DMG variant. Revisit D if a Tectonic-compatible latexmk shim proves reliable.

Note for any bundled/private TeX: run `mktexlsr`/`fmtutil` once after unpack; set `TEXMFVAR`/`TEXMFHOME` under the data dir so the bundle stays read-only; expose the path in the detection card with source "Cohere".

## Uninstall (Settings › About › "Remove Cohere…")

1. Confirm with the total size (projects, versions, private TeX).
2. Optional: export every project as a zip to a chosen folder first.
3. Move `~/Library/Application Support/com.cohere.desk` and `~/Library/Preferences/com.cohere.desk.plist`, `~/Library/Saved Application State/com.cohere.desk.savedState`, `~/Library/WebKit/com.cohere.desk`, `~/Library/Caches/com.cohere.desk` to the Trash via a small Rust command (uses `trash` crate or `osascript`).
4. Move `/Applications/Cohere.app` to the Trash (needs no privilege when installed by drag) and quit.

## Updater

- `tauri-plugin-updater` with a minisign keypair (`tauri signer generate`); public key in `tauri.conf.json` `plugins.updater.pubkey`; `bundle.createUpdaterArtifacts: true`.
- Manifest hosting: reuse the eos Cloudflare R2 + Worker pattern (`update-manifest.json` with version, notes, `platforms.darwin-aarch64.{url,signature}`).
- In-app: check on launch (opt-in setting), show a quiet chip in the top bar, download + install + relaunch with progress in a dialog.
- Command: `npm run release -- 0.2.0 "notes"` → bump, build, sign, notarize, staple, sign updater artifact, upload DMG + `.tar.gz` + `.sig`, write manifest, push.

## Privacy

No telemetry. The only network use is the optional update check and the optional TeX download, both explicit and off by default.
