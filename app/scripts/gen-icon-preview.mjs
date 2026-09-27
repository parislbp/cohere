#!/usr/bin/env node
// Generates static previews of the icon set from paths.ts (the single source of truth):
//   preview.html — every icon at 40px and 20px on light and dark backgrounds
//   preview.svg  — a sprite sheet (grid of icons with labels), handy for `rsvg-convert`
//
// Usage: node src/components/icons/gen-preview.mjs [--png /tmp/cohere-icons.png] [--zoom 2]

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

async function loadPaths() {
  try {
    return await import("../src/components/icons/paths.ts");
  } catch (err) {
    // Node < 22.18 only strips TypeScript types behind a flag: re-run ourselves with it.
    if (err?.code !== "ERR_UNKNOWN_FILE_EXTENSION" || process.env.COHERE_ICONS_RESPAWNED) throw err;
    const result = spawnSync(
      process.execPath,
      ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", ...process.argv.slice(1)],
      { stdio: "inherit", env: { ...process.env, COHERE_ICONS_RESPAWNED: "1" } },
    );
    process.exit(result.status ?? 1);
  }
}

const { ICON_NAMES, ICON_PATHS } = await loadPaths();

const args = process.argv.slice(2);
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
};
const pngPath = argValue("--png");
const zoom = Number(argValue("--zoom") ?? 2);

const STROKE_ATTRS =
  'fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

const svgFor = (name, size, extraAttrs = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="${size}" height="${size}" ${STROKE_ATTRS}${extraAttrs}>${ICON_PATHS[name]}</svg>`;

const THEMES = [
  { id: "light", label: "Light", bg: "#ffffff", fg: "#1d1d1f", muted: "#86868b", grid: "#ececf0" },
  { id: "dark", label: "Dark", bg: "#1c1c1e", fg: "#f2f2f7", muted: "#8e8e93", grid: "#2c2c2e" },
];

// ── preview.html ─────────────────────────────────────────────────────────────

const htmlSection = (theme) => `
  <section class="theme theme--${theme.id}" style="--bg:${theme.bg};--fg:${theme.fg};--muted:${theme.muted};--grid:${theme.grid}">
    <h2>${theme.label} · ${ICON_NAMES.length} icons</h2>
    <div class="grid">
      ${ICON_NAMES.map(
        (name) => `
      <figure>
        <div class="glyphs">${svgFor(name, 40)}${svgFor(name, 20)}</div>
        <figcaption>${name}</figcaption>
      </figure>`,
      ).join("")}
    </div>
  </section>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Cohere icons — preview</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 13px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", system-ui, sans-serif; }
  .theme { background: var(--bg); color: var(--fg); padding: 28px 32px 40px; }
  .theme h2 { margin: 0 0 20px; font-size: 15px; font-weight: 600; letter-spacing: 0.01em; color: var(--muted); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(124px, 1fr)); gap: 8px; }
  figure { margin: 0; padding: 14px 8px 10px; border-radius: 10px; background: var(--grid); display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .glyphs { display: flex; align-items: center; gap: 14px; height: 40px; }
  .glyphs svg { display: block; }
  figcaption { font-size: 11px; font-family: ui-monospace, "SF Mono", Menlo, monospace; color: var(--muted); }
</style>
</head>
<body>
${THEMES.map(htmlSection).join("\n")}
</body>
</html>
`;

// ── preview.svg (sprite sheet) ───────────────────────────────────────────────

const COLS = 8;
const CELL_W = 100;
const CELL_H = 72;
const ICON_SIZE = 40;
const HEADER_H = 32;
const PAD = 16;
const rows = Math.ceil(ICON_NAMES.length / COLS);
const panelW = COLS * CELL_W + PAD * 2;
const panelH = HEADER_H + rows * CELL_H + PAD;

const svgPanel = (theme, offsetY) => {
  const cells = ICON_NAMES.map((name, i) => {
    const x = PAD + (i % COLS) * CELL_W;
    const y = offsetY + HEADER_H + Math.floor(i / COLS) * CELL_H;
    const big = svgFor(name, ICON_SIZE, ` x="${x + 14}" y="${y + 8}"`).replace(' xmlns="http://www.w3.org/2000/svg"', "");
    const small = svgFor(name, 20, ` x="${x + 66}" y="${y + 18}"`).replace(' xmlns="http://www.w3.org/2000/svg"', "");
    return `${big}${small}<text x="${x + CELL_W / 2}" y="${y + 62}" text-anchor="middle" font-size="9" fill="${theme.muted}" stroke="none">${name}</text>`;
  });
  return `<g color="${theme.fg}">
  <rect x="0" y="${offsetY}" width="${panelW}" height="${panelH}" fill="${theme.bg}" stroke="none"/>
  <text x="${PAD}" y="${offsetY + 21}" font-size="11" font-weight="600" fill="${theme.muted}" stroke="none">Cohere icons · ${theme.label} · ${ICON_NAMES.length} icons · 40px and 20px</text>
  ${cells.join("\n  ")}
</g>`;
};

const sprite = `<svg xmlns="http://www.w3.org/2000/svg" width="${panelW}" height="${panelH * THEMES.length}" viewBox="0 0 ${panelW} ${panelH * THEMES.length}" font-family="-apple-system, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif">
${THEMES.map((theme, i) => svgPanel(theme, i * panelH)).join("\n")}
</svg>
`;

const out = join(here, "..", "brand", "icons");
writeFileSync(join(out, "preview.html"), html);
writeFileSync(join(out, "preview.svg"), sprite);
console.log(`wrote preview.html and preview.svg (${ICON_NAMES.length} icons, ${panelW}×${panelH * THEMES.length})`);

if (pngPath) {
  const result = spawnSync(
    "rsvg-convert",
    ["--zoom", String(zoom), join(here, "preview.svg"), "-o", pngPath],
    { stdio: "inherit", env: { ...process.env, PATH: `${process.env.PATH ?? ""}:/opt/homebrew/bin` } },
  );
  if (result.status === 0) console.log(`wrote ${pngPath}`);
  else console.error("rsvg-convert failed or is not installed; skipped PNG export");
}
