/** Release notes are Markdown from CHANGELOG.md; render the subset we write: headings, bullets, paragraphs, `code`, **bold**. */
import { Fragment, type ReactNode } from "react";

type Block = { kind: "h"; level: number; text: string } | { kind: "ul"; items: string[] } | { kind: "p"; text: string };

export function parseNotes(md: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (para.length) out.push({ kind: "p", text: para.join(" ") });
    para = [];
    if (list) out.push({ kind: "ul", items: list });
    list = null;
  };
  for (const raw of md.replace(/\r/g, "").split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    const li = /^\s*[-*•]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flush();
    } else if (h) {
      flush();
      out.push({ kind: "h", level: h[1].length, text: h[2] });
    } else if (li) {
      if (para.length) flush();
      (list ??= []).push(li[1]);
    } else if (list && /^\s{2,}\S/.test(raw)) {
      list[list.length - 1] += ` ${line.trim()}`;
    } else {
      if (list) flush();
      para.push(line.trim());
    }
  }
  flush();
  return out;
}

export function inline(text: string): ReactNode {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("`") && p.endsWith("`")) return <code key={i}>{p.slice(1, -1)}</code>;
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}

export function Notes({ text }: { text: string }) {
  const blocks = parseNotes(text);
  if (!blocks.length) return <p className="notes__empty">No release notes for this version.</p>;
  return (
    <div className="notes" data-testid="release-notes">
      {blocks.map((b, i) => {
        if (b.kind === "h") return <div key={i} className={`notes__h notes__h${Math.min(3, b.level)}`}>{inline(b.text)}</div>;
        if (b.kind === "ul")
          return (
            <ul key={i} className="notes__ul">
              {b.items.map((it, j) => (
                <li key={j}>{inline(it)}</li>
              ))}
            </ul>
          );
        return <p key={i}>{inline(b.text)}</p>;
      })}
    </div>
  );
}
