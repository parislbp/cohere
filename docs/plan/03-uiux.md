# UI / UX

## Screens

### Library

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ●●●  ◎ Cohere                                              🎨  ∿  ⚙          │  top bar (drag)
├──────────────────────────────────────────────────────────────────────────────┤
│                              L I B R A R Y                                   │  thin serif, gradient
│                        [  search  |   new   ]                                │  seamless pair
│                        ( 🔍 title, topic or template… )                      │  slides open on search
│  ☐  Title                          Topic         Modified                    │  caps header, sortable
│  ☐  MTM v1.2 — Market & Technology  Energy       21 09 2026   ⇩zip ⇩pdf ✎ ▢ 🗑 │  actions on hover
│  ☐  Storage Revenue Streams         Markets      19 09 2026                  │
│  …  (exactly as many rows as fit; never scrolls)                              │
│  [ 6 | ▢ 1 ]  ·  ‹ 1 / 2 ›                                    6 of 7         │  archived toggle · pager · count
└──────────────────────────────────────────────────────────────────────────────┘
```

- **Open**: click title (or double-click row). Archived rows are dimmed; clicking shows "Archived — unarchive to open".
- **Row actions** (fade/slide in on hover or focus): download bundle (.zip), download PDF (quiet when none compiled), rename · topic, archive/unarchive, delete. Each is an icon with a tooltip.
- **Selection**: checkbox column; header checkbox selects the page; a bulk bar appears (archive/unarchive, delete, clear).
- **Search**: the `search` button toggles a centred bar; typing filters title/topic/template instantly; Escape closes and clears. ⌘F opens it.
- **New**: dialog with template cards paged five at a time with ⟨ ⟩ pagers (blank, project, brief, periodical, minimal, paper, paper-single), title, topic, optional subtitle (templates that use one), and structure steppers (chapters/sections × sub-units, appendices) — each with an info tooltip. Create opens the editor.
- **Pagination-to-fit**: row height 44px; the table measures its area with a `ResizeObserver` and shows `floor((height − header) / 44)` rows; the pager is centred in the footer.
- **Sorting**: click a column header (title, topic, modified); the arrow shows direction.
- **Empty states**: no projects → serif "Nothing here yet" with a primary `new project`; no matches; no archived.

### Editor

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ●●●  ◧  ⌂  MTM v1.2 — Market…        [▶ compile] ✓ 1.9 s          ⌂ 🎨 ∿ ⚙  │
├───────────┬──────────────────────────────────┬───────────────────────────────┤
│ FILES  ＋▭⇧⇪│ main.tex × chapter_01.tex ●  saved 4 s ago │ ‹ 3 ▸ / 12  −  fit  +  ⇔ ▢  ⇪ │
│ ▸ chapters │ 12 \section{Introduction}          │                               │
│   main.tex │ 13 Text with an undefined \bad…   │        ┌─────────────┐        │
│ ▸ references│ ●  ~~~~~~~~~~~~~~~~~~~~~~~~~~     │        │   page 3    │        │
│ ▸ figures  │ 14                                 │        │             │        │
│──────────  │                                    │        └─────────────┘        │
│ OUTLINE  3 │                                    │                               │
│ § Introduc…│                                    │                               │
│  §§ Scope  │                                    │                               │
│──────────  │────────────────────────────────────│                               │
│ OUTPUTS  📷│ problems · 3   [all|✗1|⚠2|ℹ0]   × │                               │
│ ▤ main.pdf │ ✗ main.tex:13  Undefined control… │                               │
│ 12 p · 402K│ ⚠ main.tex:7   Reference `sec:…   │                               │
│ ─────────  │────────────────────────────────────│                               │
│ VERSIONS + │ ✗1 · ⚠2              ln 13 · 812 w · pdflatex                     │
│ v2  21 09  │                                    │                               │
└───────────┴──────────────────────────────────┴───────────────────────────────┘
```

- **Columns**: sidebar · source · PDF with two drag handles (double-click resets). ⌘B or the panel icon collapses the sidebar to zero with a width transition.
- **Sidebar sections** share height by draggable fractions (10% floor each).
  - *Files*: header icons — new file, new folder, add files (native picker, copied in), export project zip. Tree with chevrons, per-type icons, `main` badge, unsaved dot; click opens, folder click selects it as the target for new items; right-click context menu (new file/folder here, add files, set as main, rename, delete). Deleting the main file is disabled.
  - *Outline*: sections of the active file (`\part`…`\subparagraph`, starred marked, appendix chapters marked `app`), indented by level, count badge; click jumps and centres the line; the item containing the cursor is highlighted.
  - *Outputs*: current PDF card (name, pages · size · relative time; hover shows exact time, engine, duration; actions: log, reveal in Finder, export). Thin divider. Versions: `+` creates a snapshot (name defaults to `vN`, optional note); rows show name + date, hover reveals export (menu: PDF / bundle), rename, delete.
- **Tabs**: one per open file, dirty dot, close on hover, middle-click closes; the right end shows saving / unsaved / saved n ago.
- **Editor**: CodeMirror 6 with the LaTeX language; gutter markers and squiggles for diagnostics; hover shows the message and TeX context; completions after `\`, in `\begin{`, `\ref{`, `\cite{`, `\input{`, `\includegraphics{`; Enter after `\begin{x}` inserts the matching `\end{x}`; folding of environments and sections; ⌘F search panel; bracket matching; optional spellcheck; wrap toggle.
- **Compile**: top-bar `compile` (⌘⇧↩) → `stop` while running; a chip shows `✓ 1.9 s`, `1 error · 2 warn` or `3 warnings` and toggles the problems panel. The PDF pane shows a thin accent progress bar while compiling, an "showing the previous PDF" banner when a build failed, and page/zoom controls (fit width/page, ±, percent → 100%). The viewer preserves scroll position and page across reloads.
- **Problems panel** (⌘⇧M or status click): severity filters, rows `file:line message` + context, click jumps to the line (opening the file if needed); `log` tab streams latexmk output.
- **Status line**: `errors · warnings` toggle, `ln N`, word count, engine.

### Settings (⌘,)

Left nav: Appearance (4 theme cards rendered in their own theme, motion segmented with a live dot demo, tooltips on/off + delay) · Editor (font size/family, tab size, wrap, numbers, active line, brackets, auto-close, completions, spellcheck, autosave delay, compile on save) · Compiler (engine segmented with availability, shell escape, SyncTeX, TeX detection card with re-detect, bin directory override) · About (wordmark, version, data dir + reveal, templates, shortcut cheat-sheet).

## Global chrome

Top-right on every screen: **home** (editor only), **theme** (menu: light/dark groups with blurbs), **animation speed** (menu: off ×0 · slow ×1.6 · normal · fast ×0.6), **settings**. All tooltipped with shortcuts.

## Keyboard

| shortcut | action |
|---|---|
| ⌘⇧↩ | compile |
| ⌘S | save all (autosave runs anyway) |
| ⌘B | toggle sidebar |
| ⌘⇧M | toggle problems |
| ⌘, | settings |
| ⌘⇧L | back to Library |
| ⌘F | find (library: search; editor: CodeMirror search) |
| ⌘W | close tab (editor) |
| ⌘= / ⌘− / ⌘0 | PDF zoom in / out / 100% when the PDF has focus |
| Esc | close dialog / menu / search |

## Tooltip rules

1. Every icon-only control has a tooltip; it *is* the label.
2. Tooltips render in a dedicated layer at the maximum z-index and are positioned toward the centre of the viewport (below anchors in the top half, above anchors in the bottom half), clamped 8px from the edges, flipping if they do not fit.
3. A shortcut, when one exists, appears as a kbd chip inside the tooltip.
4. Delay is a setting (default 350 ms); focus shows immediately; any scroll, key, or click hides.
5. Where a label needs explanation, an `InfoTip` glyph carries it instead of helper text.

## Feedback

- Toasts (bottom centre, 3.4 s; errors 6 s) confirm exports ("Reveal" action), version saves, deletions, and report failures with the backend message verbatim.
- Destructive actions confirm in a narrow dialog; delete moves to trash, never hard-deletes.
- Saving state is visible but quiet (tab dot, "saving" spinner, "saved 4 s ago").
- Compile progress is visible in three places at once without a modal: the chip, the PDF progress bar, and the log tab.
