/**
 * Cohere icon drawings — the single source of truth for both the React `Icon`
 * component and the static preview generator (`gen-preview.mjs`).
 *
 * Every value is the inner markup of a 20×20 SVG. The host `<svg>` supplies
 * `fill="none" stroke="currentColor" stroke-width stroke-linecap="round"
 * stroke-linejoin="round"`, so drawings only carry geometry. Coordinates sit on
 * the integer / half-pixel grid wherever the shape allows it (curves and
 * rotated geometry are the exception), with ~2px of optical padding.
 *
 * Only tiny accent dots are filled (`fill="currentColor"`); everything else is
 * a 1.5px line.
 */

export const ICON_NAMES = [
  "home",
  "settings",
  "palette",
  "motion",
  "search",
  "plus",
  "minus",
  "close",
  "check",
  "chevronDown",
  "chevronUp",
  "chevronLeft",
  "chevronRight",
  "chevronsLeft",
  "chevronsRight",
  "more",
  "dots",
  "file",
  "fileTex",
  "fileBib",
  "fileImage",
  "filePdf",
  "fileText",
  "folder",
  "folderOpen",
  "newFile",
  "newFolder",
  "upload",
  "download",
  "downloadZip",
  "downloadPdf",
  "export",
  "trash",
  "rename",
  "archive",
  "unarchive",
  "compile",
  "stop",
  "refresh",
  "snapshot",
  "version",
  "history",
  "sidebar",
  "panelLeftCollapse",
  "panelLeftExpand",
  "outline",
  "pdf",
  "eye",
  "eyeOff",
  "warning",
  "error",
  "info",
  "success",
  "sun",
  "moon",
  "grip",
  "external",
  "copy",
  "command",
  "zoomIn",
  "zoomOut",
  "fitWidth",
  "fitPage",
  "clock",
  "note",
  "tag",
  "filter",
  "list",
  "book",
  "quote",
  "link",
  "bolt",
  "spinner",
  "arrowUp",
  "arrowDown",
  "arrowLeft",
  "arrowRight",
  "undo",
  "redo",
  "textWrap",
  "hash",
  "terminal",
  "log",
  "cursorText",
  "checkbox",
  "checkboxChecked",
  "checkboxIndeterminate",
  "library",
  "template",
  "layoutSplit",
  "maximize",
  "minimize",
  "tplBlank",
  "tplProject",
  "tplBrief",
  "tplPeriodical",
  "tplMinimal",
  "tplPaper2",
  "tplPaper1",
  "star",
  "starFilled",
  "starOff",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/** A tiny filled accent dot (the only filled primitive in the set). */
const dot = (cx: number, cy: number, r = 1): string =>
  `<circle cx="${cx}" cy="${cy}" r="${r}" fill="currentColor" stroke="none"/>`;

/** Document outline with a folded top-right corner (11×15, corner 4). */
const FILE =
  '<path d="M11.5 2.5H5.5A1 1 0 0 0 4.5 3.5V16.5A1 1 0 0 0 5.5 17.5H14.5A1 1 0 0 0 15.5 16.5V6.5Z"/>' +
  '<path d="M11.5 2.5V6.5H15.5"/>';

/** Template sheet: slightly wider than FILE, no page lines of its own (12×15, dog-ear 3.5). */
const SHEET =
  '<path d="M10.5 2.5H4.5A1 1 0 0 0 3.5 3.5V16.5A1 1 0 0 0 4.5 17.5H15.5A1 1 0 0 0 16.5 16.5V8.5Z"/>' +
  '<path d="M10.5 2.5V8.5H16.5"/>';

/** Five-point star on the 20-grid, centred at (10, 10.5). */
const STAR = '<path d="M10 3L12.1 7.6L17 8.2L13.4 11.6L14.4 16.5L10 14.1L5.6 16.5L6.6 11.6L3 8.2L7.9 7.6Z"/>';

/** Closed folder with a tab. */
const FOLDER =
  '<path d="M2.5 15.5V5.5A1 1 0 0 1 3.5 4.5H7.5L9.5 6.5H16.5A1 1 0 0 1 17.5 7.5V15.5A1 1 0 0 1 16.5 16.5H3.5A1 1 0 0 1 2.5 15.5Z"/>';

/** Storage box: lid + open-topped body. */
const BOX =
  '<rect x="2.5" y="3" width="15" height="4" rx="1"/>' +
  '<path d="M3.5 7V16A1 1 0 0 0 4.5 17H15.5A1 1 0 0 0 16.5 16V7"/>';

/** Shallow tray used by upload / download / export. */
const TRAY = '<path d="M3.5 13.5V15.5A1 1 0 0 0 4.5 16.5H15.5A1 1 0 0 0 16.5 15.5V13.5"/>';

/** Magnifier: lens at (9,9) r=6 with a handle to the lower right. */
const MAGNIFIER = '<circle cx="9" cy="9" r="6"/><path d="M13.5 13.5L17.5 17.5"/>';

/** Framed panel 15×13 shared by sidebar / layout icons. */
const PANEL = '<rect x="2.5" y="3.5" width="15" height="13" rx="1.5"/>';

/** Rounded 14×14 square used by the checkbox family. */
const CHECKBOX = '<rect x="3" y="3" width="14" height="14" rx="2.5"/>';

/** Almond eye outline. */
const EYE =
  '<path d="M2.5 10C5 5.75 7.5 4.5 10 4.5S15 5.75 17.5 10C15 14.25 12.5 15.5 10 15.5S5 14.25 2.5 10Z"/>';

const CIRCLE = '<circle cx="10" cy="10" r="7.5"/>';

export const ICON_PATHS: Record<IconName, string> = {
  // ── navigation & app ────────────────────────────────────────────────────
  home:
    '<path d="M2.5 10L10 3L17.5 10"/>' +
    '<path d="M4.5 8.5V17H15.5V8.5"/>' +
    '<path d="M8.5 17V12.5H11.5V17"/>',
  // Six-tooth gear: tips on r=7.75, roots on r=5.75, straight flanks (computed, then rounded to 0.01).
  settings:
    '<path d="M8.52 2.39A7.75 7.75 0 0 1 11.48 2.39L11.68 4.5A5.75 5.75 0 0 1 13.92 5.79L15.85 4.92A7.75 7.75 0 0 1 17.33 7.48L15.6 8.71A5.75 5.75 0 0 1 15.6 11.29L17.33 12.52A7.75 7.75 0 0 1 15.85 15.08L13.92 14.21A5.75 5.75 0 0 1 11.68 15.5L11.48 17.61A7.75 7.75 0 0 1 8.52 17.61L8.32 15.5A5.75 5.75 0 0 1 6.08 14.21L4.15 15.08A7.75 7.75 0 0 1 2.67 12.52L4.4 11.29A5.75 5.75 0 0 1 4.4 8.71L2.67 7.48A7.75 7.75 0 0 1 4.15 4.92L6.08 5.79A5.75 5.75 0 0 1 8.32 4.5Z"/>' +
    '<circle cx="10" cy="10" r="2.5"/>',
  palette:
    '<path d="M10 2.5A7.5 7.5 0 0 0 10 17.5A7.5 7.5 0 0 0 17.25 12C15.75 12 14.75 11.25 14.75 10C14.75 8.75 15.75 8 17.25 8A7.5 7.5 0 0 0 10 2.5Z"/>' +
    dot(6, 10.5) +
    dot(7.5, 7) +
    dot(11.5, 5.5),
  motion: '<path d="M2 10C4 5 6 5 8 10S12 15 14 10"/>' + dot(17, 10, 1.25),
  search: MAGNIFIER,

  // ── primitives ──────────────────────────────────────────────────────────
  plus: '<path d="M10 4V16M4 10H16"/>',
  minus: '<path d="M4 10H16"/>',
  close: '<path d="M5 5L15 15M15 5L5 15"/>',
  check: '<path d="M3.5 10.5L8 15L16.5 5.5"/>',
  chevronDown: '<path d="M5 7.5L10 12.5L15 7.5"/>',
  chevronUp: '<path d="M5 12.5L10 7.5L15 12.5"/>',
  chevronLeft: '<path d="M12.5 5L7.5 10L12.5 15"/>',
  chevronRight: '<path d="M7.5 5L12.5 10L7.5 15"/>',
  chevronsLeft: '<path d="M10 5.5L5.5 10L10 14.5M14.5 5.5L10 10L14.5 14.5"/>',
  chevronsRight: '<path d="M10 5.5L14.5 10L10 14.5M5.5 5.5L10 10L5.5 14.5"/>',
  more: dot(4.5, 10, 1.25) + dot(10, 10, 1.25) + dot(15.5, 10, 1.25),
  dots: dot(10, 4.5, 1.25) + dot(10, 10, 1.25) + dot(10, 15.5, 1.25),

  // ── files & folders ─────────────────────────────────────────────────────
  file: FILE,
  fileTex: FILE + '<path d="M7.5 9.5H12.5M10 9.5V15"/>',
  // Closing quotation marks: a citation file.
  fileBib:
    FILE +
    '<path d="M8.75 12.5C8.75 11.5 8 11 7.5 11A1 1 0 1 1 8.75 10"/>' +
    '<path d="M12.75 12.5C12.75 11.5 12 11 11.5 11A1 1 0 1 1 12.75 10"/>',
  fileImage: FILE + '<path d="M6 15.5L9 11.5L11.5 14.5L13 13L14 14"/>' + dot(12.5, 10),
  filePdf: FILE + '<path d="M8 15.5V9.5H10.25A1.75 1.75 0 0 1 10.25 13H8"/>',
  fileText: FILE + '<path d="M7 10H13M7 12.5H13M7 15H10.5"/>',
  folder: FOLDER,
  folderOpen:
    '<path d="M2.5 16.5V5.5A1 1 0 0 1 3.5 4.5H7.5L9.5 6.5H15.5A1 1 0 0 1 16.5 7.5V9.5"/>' +
    '<path d="M2.5 16.5L5 9.5H17.5L15.5 16.5Z"/>',
  newFile: FILE + '<path d="M10 10V15M7.5 12.5H12.5"/>',
  newFolder: FOLDER + '<path d="M10 9V14M7.5 11.5H12.5"/>',

  // ── transfer ────────────────────────────────────────────────────────────
  upload: TRAY + '<path d="M10 13V3.5M6.5 7L10 3.5L13.5 7"/>',
  download: TRAY + '<path d="M10 3.5V13M6.5 9.5L10 13L13.5 9.5"/>',
  downloadZip: BOX + '<path d="M10 9.5V14.5M7.5 12L10 14.5L12.5 12"/>',
  downloadPdf: FILE + '<path d="M10 9V15M7.5 12.5L10 15L12.5 12.5"/>',
  export:
    '<path d="M3.5 12.5V15.5A1 1 0 0 0 4.5 16.5H15.5A1 1 0 0 0 16.5 15.5V12.5"/>' +
    '<path d="M7 12.5L15.5 4M10 4H15.5V9.5"/>',

  // ── file actions ────────────────────────────────────────────────────────
  trash:
    '<path d="M3.5 5.5H16.5"/>' +
    '<path d="M7.5 5.5V4A1 1 0 0 1 8.5 3H11.5A1 1 0 0 1 12.5 4V5.5"/>' +
    '<path d="M5 5.5V16A1.5 1.5 0 0 0 6.5 17.5H13.5A1.5 1.5 0 0 0 15 16V5.5"/>' +
    '<path d="M8.5 9V14M11.5 9V14"/>',
  rename: '<path d="M3.5 16.5L4.25 13.25L14 3.5L16.5 6L6.75 15.75Z"/><path d="M12.5 5L15 7.5"/>',
  archive: BOX + '<path d="M8 10.5H12"/>',
  unarchive: BOX + '<path d="M10 14.5V9.5M7.5 12L10 9.5L12.5 12"/>',

  // ── build & history ─────────────────────────────────────────────────────
  compile: '<path d="M7 4.5V15.5L16 10Z"/>',
  stop: '<rect x="4.5" y="4.5" width="11" height="11" rx="1.5"/>',
  refresh: '<path d="M17 10A7 7 0 1 1 14.95 5.05L17 7"/><path d="M17 3V7H13"/>',
  snapshot:
    '<path d="M2.5 7A1.5 1.5 0 0 1 4 5.5H6.5L8 3.5H12L13.5 5.5H16A1.5 1.5 0 0 1 17.5 7V15A1.5 1.5 0 0 1 16 16.5H4A1.5 1.5 0 0 1 2.5 15Z"/>' +
    '<circle cx="10" cy="11" r="3"/>',
  version:
    '<path d="M3.5 2.5H9.5L16.44 9.44A1.5 1.5 0 0 1 16.44 11.56L11.56 16.44A1.5 1.5 0 0 1 9.44 16.44L2.5 9.5V3.5A1 1 0 0 1 3.5 2.5Z"/>' +
    dot(6, 6),
  history:
    '<path d="M3 10A7 7 0 1 0 5.05 5.05L3 7"/>' +
    '<path d="M3 3V7H7"/>' +
    '<path d="M10 6.5V10.5L12.5 12"/>',

  // ── layout & panes ──────────────────────────────────────────────────────
  sidebar: PANEL + '<path d="M7.5 3.5V16.5"/>',
  panelLeftCollapse: PANEL + '<path d="M7.5 3.5V16.5"/><path d="M13.5 7.5L11 10L13.5 12.5"/>',
  panelLeftExpand: PANEL + '<path d="M7.5 3.5V16.5"/><path d="M11.5 7.5L14 10L11.5 12.5"/>',
  outline: '<path d="M3.5 5.5H16.5M7.5 10H16.5M7.5 14.5H16.5"/>',
  pdf:
    '<path d="M11.5 2.5H5.5A1 1 0 0 0 4.5 3.5V16.5A1 1 0 0 0 5.5 17.5H8"/>' +
    '<path d="M11.5 2.5L15.5 6.5V9"/>' +
    '<path d="M11.5 2.5V6.5H15.5"/>' +
    '<circle cx="12.5" cy="13" r="3"/>' +
    '<path d="M14.6 15.1L17 17.5"/>',
  eye: EYE + '<circle cx="10" cy="10" r="2.5"/>',
  // The slash cuts the pupil in two so the centre does not clot at small sizes.
  eyeOff:
    EYE +
    '<path d="M11.8 8.2A2.5 2.5 0 0 1 8.2 11.8M8.2 8.2A2.5 2.5 0 0 0 11.8 11.8"/>' +
    '<path d="M3.5 3.5L16.5 16.5"/>',

  // ── status ──────────────────────────────────────────────────────────────
  warning: '<path d="M10 3.5L17.5 16.5H2.5Z"/><path d="M10 7.5V11"/>' + dot(10, 13.5),
  error: CIRCLE + '<path d="M7.5 7.5L12.5 12.5M12.5 7.5L7.5 12.5"/>',
  info: CIRCLE + '<path d="M10 9.5V14"/>' + dot(10, 6.5),
  success: CIRCLE + '<path d="M6.5 10.5L9 13L13.5 7.5"/>',

  // ── theme ───────────────────────────────────────────────────────────────
  sun:
    '<circle cx="10" cy="10" r="3"/>' +
    '<path d="M10 2.5V4.5M10 15.5V17.5M2.5 10H4.5M15.5 10H17.5"/>' +
    '<path d="M4.7 4.7L6.1 6.1M13.9 6.1L15.3 4.7M4.7 15.3L6.1 13.9M13.9 13.9L15.3 15.3"/>',
  moon: '<path d="M7.5 3.5A7 7 0 1 0 16.5 12.5A6.5 6.5 0 0 1 7.5 3.5Z"/>',

  // ── misc UI ─────────────────────────────────────────────────────────────
  grip: dot(7.5, 5.5) + dot(12.5, 5.5) + dot(7.5, 10) + dot(12.5, 10) + dot(7.5, 14.5) + dot(12.5, 14.5),
  external:
    '<path d="M9 5H5.5A1 1 0 0 0 4.5 6V15A1 1 0 0 0 5.5 16H14.5A1 1 0 0 0 15.5 15V11.5"/>' +
    '<path d="M11.5 4H16.5V9M16.5 4L9.5 11"/>',
  copy:
    '<rect x="2.5" y="6.5" width="11" height="11" rx="1.5"/>' +
    '<path d="M6.5 6.5V4A1.5 1.5 0 0 1 8 2.5H16A1.5 1.5 0 0 1 17.5 4V12A1.5 1.5 0 0 1 16 13.5H13.5"/>',
  command:
    '<path d="M12.5 5V15A2.5 2.5 0 1 0 15 12.5H5A2.5 2.5 0 1 0 7.5 15V5A2.5 2.5 0 1 0 5 7.5H15A2.5 2.5 0 1 0 12.5 5Z"/>',
  zoomIn: MAGNIFIER + '<path d="M9 6.5V11.5M6.5 9H11.5"/>',
  zoomOut: MAGNIFIER + '<path d="M6.5 9H11.5"/>',
  fitWidth: '<path d="M3.5 5V15M16.5 5V15"/><path d="M6 10H14M8 8L6 10L8 12M12 8L14 10L12 12"/>',
  fitPage:
    '<path d="M3 6.5V4A1 1 0 0 1 4 3H6.5M13.5 3H16A1 1 0 0 1 17 4V6.5M17 13.5V16A1 1 0 0 1 16 17H13.5M6.5 17H4A1 1 0 0 1 3 16V13.5"/>' +
    '<rect x="6.5" y="6.5" width="7" height="7" rx="1"/>',
  clock: CIRCLE + '<path d="M10 5.5V10L13 12"/>',
  note:
    '<path d="M4 2.5H16A1.5 1.5 0 0 1 17.5 4V12.5L12.5 17.5H4A1.5 1.5 0 0 1 2.5 16V4A1.5 1.5 0 0 1 4 2.5Z"/>' +
    '<path d="M17.5 12.5H14A1.5 1.5 0 0 0 12.5 14V17.5"/>' +
    '<path d="M6.5 7.5H13.5M6.5 11H10.5"/>',
  tag: '<path d="M8 4.5H16A1.5 1.5 0 0 1 17.5 6V14A1.5 1.5 0 0 1 16 15.5H8L2.5 10Z"/>' + dot(7, 10),
  filter: '<path d="M2.5 3.5H17.5L11.5 10.5V16.5L8.5 14.5V10.5Z"/>',
  list: dot(4, 5.5) + dot(4, 10) + dot(4, 14.5) + '<path d="M7.5 5.5H17M7.5 10H17M7.5 14.5H17"/>',
  book:
    '<path d="M10 5.5C8 4 5.5 3.5 2.5 4V15.5C5.5 15 8 15.5 10 17C12 15.5 14.5 15 17.5 15.5V4C14.5 3.5 12 4 10 5.5Z"/>' +
    '<path d="M10 5.5V17"/>',
  quote:
    '<path d="M3.5 14.5C5.5 13.5 7 12 7 9.5V6.5A1 1 0 0 0 6 5.5H3.5A1 1 0 0 0 2.5 6.5V9A1 1 0 0 0 3.5 10H7"/>' +
    '<path d="M14 14.5C16 13.5 17.5 12 17.5 9.5V6.5A1 1 0 0 0 16.5 5.5H14A1 1 0 0 0 13 6.5V9A1 1 0 0 0 14 10H17.5"/>',
  link:
    '<g transform="rotate(-45 10 10)">' +
    '<path d="M11.5 5.75H6A3 3 0 0 0 6 11.75H11.5"/>' +
    '<path d="M8.5 14.25H14A3 3 0 0 0 14 8.25H8.5"/>' +
    "</g>",
  bolt: '<path d="M11 2.5L4.5 11.5H10L9 17.5L15.5 8.5H10Z"/>',
  spinner: '<path d="M10 3A7 7 0 1 1 3 10"/>',

  // ── arrows ──────────────────────────────────────────────────────────────
  arrowUp: '<path d="M10 16.5V3.5M4.5 9L10 3.5L15.5 9"/>',
  arrowDown: '<path d="M10 3.5V16.5M4.5 11L10 16.5L15.5 11"/>',
  arrowLeft: '<path d="M16.5 10H3.5M9 4.5L3.5 10L9 15.5"/>',
  arrowRight: '<path d="M3.5 10H16.5M11 4.5L16.5 10L11 15.5"/>',
  undo: '<path d="M3.5 9H10.5A6 6 0 0 1 16.5 15"/><path d="M7 5.5L3.5 9L7 12.5"/>',
  redo: '<path d="M16.5 9H9.5A6 6 0 0 0 3.5 15"/><path d="M13 5.5L16.5 9L13 12.5"/>',

  // ── editor ──────────────────────────────────────────────────────────────
  textWrap:
    '<path d="M3.5 5.5H16.5M3.5 14.5H7"/>' +
    '<path d="M3.5 10H13A2.25 2.25 0 0 1 13 14.5H10.5"/>' +
    '<path d="M12.5 12.5L10.5 14.5L12.5 16.5"/>',
  hash: '<path d="M3.5 7.5H16.5M3.5 12.5H16.5M8 3.5L6 16.5M14 3.5L12 16.5"/>',
  terminal: '<path d="M3.5 5L8.5 10L3.5 15M10.5 15H16.5"/>',
  log: PANEL + '<path d="M5.5 7H10.5M5.5 10H14.5M5.5 13H8.5"/>',
  cursorText:
    '<path d="M10 5.5V14.5"/>' +
    '<path d="M7.5 3.5H8A2 2 0 0 1 10 5.5A2 2 0 0 1 12 3.5H12.5"/>' +
    '<path d="M7.5 16.5H8A2 2 0 0 0 10 14.5A2 2 0 0 0 12 16.5H12.5"/>',
  checkbox: CHECKBOX,
  checkboxChecked: CHECKBOX + '<path d="M6.5 10L9 12.5L13.5 7.5"/>',
  checkboxIndeterminate: CHECKBOX + '<path d="M6.5 10H13.5"/>',

  // ── documents & templates ───────────────────────────────────────────────
  // Two upright books sharing a spine line, a third leaning against them.
  library: '<path d="M2.5 3H10.5V17H2.5Z"/><path d="M6.5 3V17"/><path d="M10.5 3H14.5L17 17H13Z"/>',
  template:
    PANEL +
    '<rect x="6" y="7" width="8" height="6" rx="1" stroke-dasharray="2 1.75" stroke-linecap="butt"/>',
  layoutSplit: PANEL + '<path d="M10 3.5V16.5"/>',
  maximize: '<path d="M11.5 3.5H16.5V8.5M16.5 3.5L11 9M8.5 16.5H3.5V11.5M3.5 16.5L9 11"/>',
  minimize: '<path d="M16.5 8.5H11.5V3.5M11.5 8.5L17 3M3.5 11.5H8.5V16.5M8.5 11.5L3 17"/>',

  // ── project templates (Library type column) — each a distinct object, not a sheet variant ─
  // Blank: an empty sheet with a text cursor.
  tplBlank: SHEET + '<path d="M9.5 11V14.5"/><path d="M8.5 11H10.5M8.5 14.5H10.5"/>',
  // Project (report): a bound book — front cover with a spine band and a title block.
  tplProject: '<path d="M4.5 3.5H14.5A1.5 1.5 0 0 1 16 5V15A1.5 1.5 0 0 1 14.5 16.5H4.5Z"/><path d="M4.5 3.5A1 1 0 0 0 3.5 4.5V15.5A1 1 0 0 0 4.5 16.5"/><path d="M6.5 3.5V16.5"/><path d="M9 7.5H13M9 9.5H12"/>',
  // Brief: a memo sheet — heavy title bar, then a few justified lines.
  tplBrief: SHEET + '<path d="M6 6.5H10" stroke-width="2.2"/><path d="M6 10H13.5M6 12.5H13.5M6 15H11"/>',
  // Periodical: a newspaper — masthead rule, two text columns and a small picture box.
  tplPeriodical: '<rect x="3" y="3.5" width="14" height="13" rx="1.2"/><path d="M3 7H17"/><path d="M5 9.5H9M5 11.5H9M5 13.5H9"/><rect x="11" y="9.5" width="4" height="4" rx="0.6"/>',
  // Paper, one column: the panelled abstract above a full-width body.
  tplPaper1: SHEET + '<rect x="6" y="6.5" width="5" height="3" rx="0.6" fill="currentColor" stroke="none" opacity="0.35"/><path d="M6 12H14M6 14.5H12.5"/>',
  // Paper, two columns: the panelled abstract spanning two narrow columns.
  tplPaper2: SHEET + '<rect x="6" y="6.5" width="8" height="2.5" rx="0.6" fill="currentColor" stroke="none" opacity="0.35"/><path d="M6 11.5H9M6 13.5H9M6 15.5H9M11 11.5H14M11 13.5H14M11 15.5H14"/>',
  // Minimal: a rounded card with one dot — the least possible.
  tplMinimal: '<rect x="4" y="3.5" width="12" height="13" rx="2"/>' + dot(10, 10, 1.4),

  // ── favourites ──────────────────────────────────────────────────────────
  star: STAR,
  starFilled: STAR.replace("<path ", '<path fill="currentColor" '),
  starOff: STAR + '<path d="M4 16L16 4"/>',
};
