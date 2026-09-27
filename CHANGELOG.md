# Changelog

Release notes for every version, newest first. Each entry is also the text of the
matching GitHub Release and is shown inside the app when an update is offered.

<!-- `make release` inserts the new version below this line. -->

## 0.2.0 — 2026-09-27

The first installable release: a signed, notarized app that keeps itself up to date.

### New

- **Install from a DMG.** Signed with a Developer ID and notarized by Apple — opens without warnings on Apple Silicon Macs running macOS 12 or newer.
- **In-app updates.** Cohere checks GitHub for a newer release at launch (Settings › About turns this off), shows the release notes, and installs with one click — every download is verified against the key built into the app before anything is replaced.
- **Install TeX for Cohere.** No TeX Live on the Mac? Cohere installs a private, portable one (≈ 420 MB) with only the packages its templates need, inside its own data folder. Remove it again from Settings › Compiler.
- **Remove Cohere.** Settings › About › remove Cohere… exports every project as a zip if you like, then moves the app, data and per-app system files to the Trash and quits.
- **⌘K command palette.** Every command in one searchable list, with its shortcut.

### Changed

- Opening a project shows the whole-document outline by default; the outputs section starts folded.
- `make dev` (or `tdev`) uses its own library folder, so hacking on Cohere never touches the installed app's projects.

### Fixed

- A compile no longer dies when TeX echoes an 8-bit character (`\typeout` of an accented word) — the engine was being killed mid-run and a truncated PDF published as a success. Truncated PDFs are now refused with a clear error.
- Section rules in the paper style no longer double at the top of a page.
