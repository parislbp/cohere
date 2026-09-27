/**
 * Text formatting commands: wrap the selection in a LaTeX macro, or unwrap it when it already is.
 * Empty selection inside a word wraps that word; elsewhere it inserts `\macro{}` with the cursor inside.
 * Runs over every selection range and dispatches a single transaction so multi-cursor edits stay atomic.
 */
import { EditorSelection, type ChangeSpec, type SelectionRange } from "@codemirror/state";
import { EditorView, keymap, type Command } from "@codemirror/view";
import type { Extension } from "@codemirror/state";

const WORD = /[\p{L}\p{N}'’-]/u;

function wordAround(doc: string, pos: number): { from: number; to: number } | null {
  let from = pos;
  let to = pos;
  while (from > 0 && WORD.test(doc[from - 1]!)) from--;
  while (to < doc.length && WORD.test(doc[to]!)) to++;
  return from === to ? null : { from, to };
}

interface Wrap {
  changes: ChangeSpec[];
  /** New selection range after the edit, in post-change coordinates handled by mapping below. */
  range: SelectionRange;
}

/** Compute one range's edit. `open` is `\macro{`, `close` is `}`. */
export function wrapRange(state: { doc: { toString(): string }; }, range: SelectionRange, open: string, close: string): Wrap {
  const doc = state.doc.toString();
  let { from, to } = range;

  // Already wrapped exactly: `\textbf{sel}` selected as a whole, or `sel` selected inside the wrapper → unwrap.
  const selected = doc.slice(from, to);
  if (from < to && selected.startsWith(open) && selected.endsWith(close) && selected.length >= open.length + close.length) {
    const inner = selected.slice(open.length, selected.length - close.length);
    return { changes: [{ from, to, insert: inner }], range: EditorSelection.range(from, from + inner.length) };
  }
  if (doc.slice(from - open.length, from) === open && doc.slice(to, to + close.length) === close) {
    return {
      changes: [
        { from: from - open.length, to: from, insert: "" },
        { from: to, to: to + close.length, insert: "" },
      ],
      range: EditorSelection.range(from - open.length, to - open.length),
    };
  }

  if (from === to) {
    const w = wordAround(doc, from);
    if (w) {
      from = w.from;
      to = w.to;
    } else {
      return { changes: [{ from, insert: open + close }], range: EditorSelection.cursor(from + open.length) };
    }
  }
  const text = doc.slice(from, to);
  return { changes: [{ from, to, insert: open + text + close }], range: EditorSelection.range(from + open.length, from + open.length + text.length) };
}

/** Build a CodeMirror command that toggles `\macro{…}` around each selection. */
export function wrapCommand(macro: string | (() => string)): Command {
  return (view: EditorView) => {
    const name = typeof macro === "function" ? macro() : macro;
    const open = `\\${name}{`;
    const close = "}";
    const state = view.state;
    // Process ranges from last to first so earlier offsets stay valid, then rebuild the selection.
    const ranges = state.selection.ranges.slice().sort((a, b) => a.from - b.from);
    const changes: ChangeSpec[] = [];
    const newRanges: SelectionRange[] = [];
    let shift = 0;
    for (const r of ranges) {
      const w = wrapRange(state, r, open, close);
      changes.push(...w.changes);
      const delta = deltaOf(w.changes);
      newRanges.push(EditorSelection.range(w.range.anchor + shift, w.range.head + shift));
      shift += delta;
    }
    view.dispatch({ changes, selection: EditorSelection.create(newRanges), scrollIntoView: true, userEvent: "input.format" });
    return true;
  };
}

function deltaOf(changes: ChangeSpec[]): number {
  let d = 0;
  for (const c of changes) {
    if (typeof c === "object" && c !== null && "from" in c) {
      const spec = c as { from: number; to?: number; insert?: string | { length: number } };
      const removed = (spec.to ?? spec.from) - spec.from;
      const inserted = typeof spec.insert === "string" ? spec.insert.length : spec.insert?.length ?? 0;
      d += inserted - removed;
    }
  }
  return d;
}

export interface FormattingOptions {
  /** The house `\code{}` macro exists in every template but Blank; fall back to `\texttt` there. */
  codeMacro?: () => string;
}

/** ⌘B bold · ⌘I emphasis · ⌘U underline · ⌘⇧C code. Placed ahead of the default keymap (which binds ⌘I). */
export function formattingKeymap(opts: FormattingOptions = {}): Extension {
  return keymap.of([
    { key: "Mod-b", run: wrapCommand("textbf"), preventDefault: true },
    { key: "Mod-i", run: wrapCommand("emph"), preventDefault: true },
    { key: "Mod-u", run: wrapCommand("underline"), preventDefault: true },
    { key: "Mod-Shift-c", run: wrapCommand(opts.codeMacro ?? (() => "code")), preventDefault: true },
  ]);
}
