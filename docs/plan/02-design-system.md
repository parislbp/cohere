# Design system

## Intent

Quiet, crisp, editorial. A writing surface first; chrome that recedes. Influences: eos (layered surfaces, opacity-tiered text, one accent family, gradient-clipped brand text, glass) and frontier (plain CSS tokens on `data-theme`, glass buttons with a 1px lift on hover, viewport-clamped tooltips). Cohere differs from both: serif titles in Times, seamless button pairs, mono-hue gradients, no unicode-glyph icons, every control tooltipped.

## Tokens (`src/design/tokens.css`)

| group | tokens |
|---|---|
| type | `--font-ui` (system sans), `--font-serif` (Times New Roman), `--font-mono` (SF Mono → Menlo); sizes `--text-2xs` 10 · `--text-xs` 11 · `--text-sm` 12.5 · `--text-md` 13.5 · `--text-lg` 15 · `--text-xl` 18 · `--text-2xl` 24; `--track-caps` .09em |
| radii | `--r-xs` 4 · `--r-sm` 7 · `--r-md` 11 · `--r-lg` 16 · `--r-xl` 22 · `--r-full` |
| spacing | `--sp-1..9` on a 4px grid |
| motion | `--motion` (scale), `--ease` `cubic-bezier(.33,1,.5,1)`, `--ease-spring`, `--dur-1..5` = 110/170/260/420/700 ms × `--motion`; `--dur-spin` fixed |
| chrome | `--topbar-h` 44, `--traffic-w` 76 (space for traffic lights under `titleBarStyle: Overlay`), `--row-h` 44 |
| layers | `--z-tooltip: 2147483647`, menu 1100, overlay 1000, toast 1200 |

## Themes (`src/design/themes.css`)

Each theme defines the same variable set; components never reference a colour literal.

| role | paper (light, warm) | mist (light, cool) | ink (dark, warm) | graphite (dark, cool) |
|---|---|---|---|---|
| bg-0 / bg-1 / bg-2 / bg-3 | #ebe7de · #f4f1ea · #faf8f3 · #fff | #e3e7ec · #eef1f5 · #f6f8fb · #fff | #0e0e0c · #151411 · #1c1b17 · #25231e | #0c0e11 · #12151a · #191d24 · #21262f |
| ink (rgb, tiers .92/.66/.46/.26 light; .94/.70/.48/.26 dark) | 28,27,24 | 22,26,33 | 246,241,232 | 232,236,242 |
| accent · 2 · 3 | #14646b · #2a8189 · #0e484e | #3f6386 · #5a7fa3 · #2c4a68 | #d9b98c · #ebcfa5 · #b8976b | #86b9bf · #a6d1d6 · #6a9ba1 |
| status ok/warn/err/info | #2f8f5b · #b8860b · #b8443a · #3b6fa8 | #2f8a63 · #a97c0c · #b3403c · #3d6db0 | #86cea7 · #edca80 · #ed7f7f · #80aedd | #8fd3ab · #e9c682 · #ee8484 · #88b4e2 |
| pdf backdrop | #ddd8cc | #d6dbe2 | #0b0b0a | #090b0e |

Derived per theme: `--hair`/`--hair-2` (ink at 10/18% light, 8/16% dark), `--bevel-hi`, `--shadow-1..3`, `--bg-glass`, `--bg-overlay`, `--accent-glow/soft/softer`, `--sel`, `--focus-ring`, `--scroll-thumb`, `--editor-*`, 16 `--syn-*` syntax colours, 3 `--diag-*` colours.

**Gradients are mono-hue.** `--grad-title` is the accent hue at three lightness/opacity stops (e.g. paper: `rgba(14,72,78,.98) → rgba(20,100,107,.74) → rgba(42,129,137,.92)` at 135°). `--grad-accent` is the primary-button fill (three lightness stops). `--grad-backdrop` is two faint radial washes of the accent on the window background (plus a dark linear veil in dark themes).

**Gradient text** (`.gradient-text`): `background: var(--grad-title); -webkit-background-clip: text; color: transparent; -webkit-text-fill-color: transparent; display: inline-block; padding-bottom: .06em` with an `@supports not` fallback to solid accent. Used for "Library", the wordmark, and the About header.

## Motion (`src/design/motion.css`)

`<html data-motion="off|slow|normal|fast">` sets `--motion` to 0 / 1.6 / 1 / 0.6. Every transition and animation uses `--dur-*`, so one attribute governs all. With `off`, a global rule forces `transition-duration: 0s` and `animation-duration: 0s` on everything except `.spinner`/`.ch-icon--spin`, which keep `--dur-spin`. Entrance helpers: `.anim-fade`, `.anim-rise`, `.anim-sink`, `.anim-pop`. Micro-motion budget: hover lift 1px, press scale .985, row action reveal 4px slide, tooltip 3px rise, dialog pop from .975.

## Typography

- Titles and names: Times New Roman (`.serif`) — "Library" 22px, weight 300, tracking .22em, uppercase, gradient; project titles 15.5px; dialog titles 18px.
- UI: system sans 12.5–13.5px; `.caps` 10px uppercase tracked for section headers and table headers.
- Code/log/paths: `--font-mono` with tabular numerals.

## Components (`src/design/components.css` + `src/components/ui`)

| component | behaviour |
|---|---|
| `.btn` | 30px, glass fill, hairline, inset bevel, hover lift 1px + stronger hairline; variants `--primary` (accent gradient, glow on hover), `--ghost`, `--danger`, `--on`; `--seam` joins siblings into one pill (used for **search · new**); `--wide` 128px |
| `.iconbtn` | 28px square, ink-3 → ink-1 on hover, glass background; `--accent`, `--danger`, `--quiet`, `--on`; always wrapped in a `Tooltip` because it has no visible label |
| `Tooltip` | portal at `--z-tooltip`, placement via `lib/placement.ts` (side toward the viewport centre, clamped 8px from edges, flips when it does not fit), delay from settings, closes on scroll/keydown/mousedown, optional `kbd` chip and second `hint` line; `InfoTip` = a 14px info glyph carrying a tooltip |
| `Menu` | anchored popover (element or point for context menus), same placement rules, `title`/`sep` entries, `on` check mark, danger items |
| `Dialog` | scrim with blur, `.dialog` pop animation, Escape / scrim click closes, Enter submits, first field autofocuses, width `narrow`/default/`wide` |
| `Checkbox` / `Switch` / `Stepper` / `Segmented` | custom, keyboard-accessible, tooltips on segments |
| `Resizer` | 1px hairline with an 8px hit zone, accent on hover/drag, pointer capture, body cursor class while dragging, double-click resets |
| `Toasts` | bottom-centre pills, icon by kind, optional action ("Reveal"), auto-dismiss |
| `Pager` | `‹ 2 / 5 ›` in tabular numerals |
| `EmptyState` | icon + serif title + one line |

## Icons

Original 20×20 line icons, 1.5px stroke, round caps/joins, drawn on the pixel grid (`src/components/icons/paths.ts`). Rendered by `<Icon name size strokeWidth title/>`. Names cover files (tex/bib/image/pdf/text), tree actions, downloads (zip/pdf), archive/unarchive, compile/stop, snapshot/version, sidebar panels, outline, zoom/fit, statuses, themes, motion, and chrome.

## Layout rules

- Top bar 44px, grid `1fr auto 1fr`: left context, centred compile cluster, right global icons; whole bar is a drag region.
- Library column `min(920px, 100% − 64px)`, centred; table `table-layout: fixed`; footer grid `1fr auto 1fr` (filter · pager · count).
- Editor: sidebar (180–560px, collapsible with width transition) · source (20–80% of the remainder) · PDF; sidebar sections share height by fractions with a 10% floor.
- Scrollbars 9px, thumb = ink at 18%/16%, track transparent.
