/** Project-wide data for completions: cite keys from .bib files, labels from open buffers, file paths. */
import { useEffect, useMemo, useRef } from "react";
import * as api from "@/api";
import type { FileNode } from "@/api/types";
import { flattenTree, useProjectStore } from "@/store/project";
import type { CompletionData } from "./codemirror/latexCompletions";

const BIB_KEY = /@\w+\s*\{\s*([^,\s}]+)\s*,/g;
const LABEL = /\\label\{([^}]+)\}/g;

export function extractBibKeys(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(BIB_KEY)) out.push(m[1]);
  return out;
}

export function extractLabels(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(LABEL)) out.push(m[1]);
  return out;
}

const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "pdf", "eps", "svg", "gif", "webp"]);

export function classifyFiles(tree: FileNode[]): { texFiles: string[]; imageFiles: string[]; bibFiles: string[] } {
  const files = flattenTree(tree).filter((n) => n.kind === "file");
  return {
    texFiles: files.filter((n) => n.ext === "tex" || n.ext === "bib").map((n) => n.path),
    imageFiles: files.filter((n) => IMAGE_EXT.has(n.ext) && !n.path.startsWith("build/")).map((n) => n.path),
    bibFiles: files.filter((n) => n.ext === "bib").map((n) => n.path),
  };
}

/** Returns a stable getter the completion source calls on demand. */
export function useCompletionData(): () => CompletionData {
  const tree = useProjectStore((s) => s.tree);
  const projectId = useProjectStore((s) => s.projectId);
  const buffers = useProjectStore((s) => s.buffers);
  const compileStatus = useProjectStore((s) => s.compileStatus);
  const citeRef = useRef<string[]>([]);
  const dataRef = useRef<CompletionData>({ labels: [], citeKeys: [], texFiles: [], imageFiles: [] });

  const files = useMemo(() => classifyFiles(tree), [tree]);

  // Cite keys: read every .bib once per project (and again after each compile, when they may have changed).
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const keys: string[] = [];
      for (const p of files.bibFiles) {
        const buf = buffers[p];
        if (buf && !buf.binary) {
          keys.push(...extractBibKeys(buf.text));
          continue;
        }
        try {
          const c = await api.files.read(projectId, p);
          if (c.text) keys.push(...extractBibKeys(c.text));
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) citeRef.current = Array.from(new Set(keys));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, files.bibFiles.join("|"), compileStatus]);

  useEffect(() => {
    const labels = new Set<string>();
    for (const b of Object.values(buffers)) if (!b.binary) for (const l of extractLabels(b.text)) labels.add(l);
    dataRef.current = { labels: [...labels], citeKeys: citeRef.current, texFiles: files.texFiles, imageFiles: files.imageFiles };
  }, [buffers, files]);

  return () => ({ ...dataRef.current, citeKeys: citeRef.current });
}
