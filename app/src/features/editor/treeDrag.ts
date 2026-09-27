/**
 * Drag and drop for the file tree.
 *
 * Internal moves use pointer events (not HTML5 dnd) so they work identically in WKWebView and in
 * the browser, with a custom ghost and drop highlight. Files dropped from Finder arrive through
 * Tauri's drag-drop events (paths); in the browser the HTML5 `drop` event supplies names for the mock.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { FileNode } from "@/api/types";
import { basename, dirname, joinPath } from "@/lib/format";

/** Which folder a point over the tree means. `""` is the project root; `null` means "not over the tree". */
export function dropTargetFor(el: Element | null): string | null {
  const node = el?.closest<HTMLElement>("[data-path]");
  if (node) {
    const path = node.dataset.path ?? "";
    return node.dataset.kind === "dir" ? path : dirname(path);
  }
  return el?.closest("[data-dropzone]") ? "" : null;
}

/** A move is meaningful when the destination is a different folder and not inside the dragged folder. */
export function canMove(from: string, kind: FileNode["kind"], toDir: string): boolean {
  if (dirname(from) === toDir) return false;
  if (kind === "dir" && (toDir === from || toDir.startsWith(from + "/"))) return false;
  return true;
}

export function movedPath(from: string, toDir: string): string {
  return joinPath(toDir, basename(from));
}

export interface DragState {
  node: FileNode;
  x: number;
  y: number;
  /** Folder under the pointer, "" for root, null when not over the tree. */
  target: string | null;
  valid: boolean;
}

interface Options {
  onMove: (from: string, to: string) => Promise<void> | void;
  /** Expand a collapsed folder the pointer lingers over. */
  onHoverDir?: (path: string) => void;
  threshold?: number;
  hoverExpandMs?: number;
}

export function useTreeDrag({ onMove, onHoverDir, threshold = 6, hoverExpandMs = 550 }: Options) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const pending = useRef<{ node: FileNode; x: number; y: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClick = useRef(false);
  const hoverTimer = useRef<number | null>(null);
  const hoverPath = useRef<string | null>(null);

  const update = useCallback((next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  }, []);

  const clearHover = useCallback(() => {
    if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    hoverPath.current = null;
  }, []);

  const end = useCallback(() => {
    pending.current = null;
    clearHover();
    document.body.classList.remove("is-tree-dragging");
    update(null);
  }, [clearHover, update]);

  useEffect(() => {
    const onMoveEvt = (e: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      const cur = dragRef.current;
      if (!cur) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < threshold) return;
        document.body.classList.add("is-tree-dragging");
      }
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const target = dropTargetFor(under);
      const valid = target !== null && canMove(p.node.path, p.node.kind, target);
      update({ node: p.node, x: e.clientX, y: e.clientY, target, valid });

      const dirEl = under?.closest<HTMLElement>('[data-path][data-kind="dir"]');
      const dirPath = dirEl?.dataset.path ?? null;
      if (dirPath !== hoverPath.current) {
        clearHover();
        if (dirPath && onHoverDir) {
          hoverPath.current = dirPath;
          hoverTimer.current = window.setTimeout(() => onHoverDir(dirPath), hoverExpandMs);
        }
      }
    };
    const onUp = () => {
      const cur = dragRef.current;
      if (cur) {
        suppressClick.current = true;
        window.setTimeout(() => (suppressClick.current = false), 0);
        if (cur.valid && cur.target !== null) void onMove(cur.node.path, movedPath(cur.node.path, cur.target));
      }
      end();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dragRef.current) end();
    };
    window.addEventListener("pointermove", onMoveEvt);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", onMoveEvt);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
    };
  }, [threshold, hoverExpandMs, onMove, onHoverDir, update, end, clearHover]);

  const begin = useCallback((node: FileNode, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    pending.current = { node, x: e.clientX, y: e.clientY };
  }, []);

  /** True once right after a drag finished, so the trailing click does not open/toggle the node. */
  const consumeClick = useCallback(() => {
    const s = suppressClick.current;
    suppressClick.current = false;
    return s;
  }, []);

  return { drag, begin, consumeClick };
}

/** Physical → CSS pixels for Tauri drag-drop positions. */
export function toLogicalPoint(pos: { x: number; y: number }, scale = window.devicePixelRatio || 1): { x: number; y: number } {
  return { x: pos.x / scale, y: pos.y / scale };
}
