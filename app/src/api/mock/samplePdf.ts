/**
 * A tiny PDF 1.4 writer: Letter pages, Helvetica, one block of text per page.
 * Offsets in the xref table are computed from the encoded bytes, so pdf.js and Preview accept the output.
 */

const encoder = new TextEncoder();

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 72;
const FONT_SIZE = 12;
const LEADING = 14;
const MAX_LINES_PER_PAGE = Math.floor((PAGE_H - 2 * MARGIN) / LEADING);

const REPLACEMENTS: Record<string, string> = {
  "\u2014": "-", "\u2013": "-", "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\u2026": "...", "\u00a0": " ", "\u00b7": "-",
};

/** Helvetica with WinAnsi encoding only covers Latin-1; keep the stream printable ASCII. */
function asciiSafe(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    out += code >= 0x20 && code < 0x7f ? ch : REPLACEMENTS[ch] ?? "?";
  }
  return out;
}

function pdfString(text: string): string {
  return `(${asciiSafe(text).replace(/[\\()]/g, (m) => `\\${m}`)})`;
}

function contentStream(lines: string[]): string {
  const ops = ["BT", `/F1 ${FONT_SIZE} Tf`, `${LEADING} TL`, `${MARGIN} ${PAGE_H - MARGIN - FONT_SIZE} Td`];
  lines.slice(0, MAX_LINES_PER_PAGE).forEach((line, i) => {
    if (i > 0) ops.push("T*");
    ops.push(`${pdfString(line)} Tj`);
  });
  ops.push("ET");
  return ops.join("\n");
}

/** One page per entry of `pages`; each entry is the list of text lines drawn on that page. */
export function buildMultiPagePdf(pages: string[][]): Uint8Array {
  const pageList = pages.length > 0 ? pages : [[]];
  // Object numbering: 1 catalog, 2 page tree, 3 font, then a (page, content) pair per page.
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageList.map((_, i) => `${4 + 2 * i} 0 R`).join(" ")}] /Count ${pageList.length} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  pageList.forEach((lines, i) => {
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + 2 * i} 0 R >>`,
    );
    const stream = contentStream(lines);
    objects.push(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
  });

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };
  const pushText = (text: string) => push(encoder.encode(text));

  pushText("%PDF-1.4\n");
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // binary-file marker comment
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(offset);
    pushText(`${i + 1} 0 obj\n${body}\nendobj\n`);
  });
  const xrefOffset = offset;
  // Every xref entry is exactly 20 bytes: 10-digit offset, space, 5-digit generation, space, type, space, newline.
  const entries = ["0000000000 65535 f ", ...offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n `)];
  pushText(`xref\n0 ${objects.length + 1}\n${entries.join("\n")}\n`);
  pushText(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

  const out = new Uint8Array(offset);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
}

export function buildSamplePdf(lines: string[]): Uint8Array {
  return buildMultiPagePdf([lines]);
}

export const SAMPLE_PDF: Uint8Array = buildSamplePdf(["Cohere", "sample output", "compiled by the mock backend"]);
