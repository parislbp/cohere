/** Project files: tree with header actions (new file/folder, upload, export) and a context menu. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileNode } from "@/api/types";
import * as api from "@/api";
import { Icon, type IconName } from "@/components/icons";
import { Button, Dialog, Field, IconButton, Menu, TextInput, Tooltip, type MenuEntry } from "@/components/ui";
import { basename, dirname, joinPath, slugify } from "@/lib/format";
import { pickFiles, pickSavePath, reveal } from "@/lib/native";
import { useProjectStore } from "@/store/project";
import { errorMessage, toast } from "@/store/ui";
import { ConfirmDialog } from "@/features/library/ConfirmDialog";
import { SectionHead, type SectionProps } from "./Sidebar";
import { dropTargetFor, toLogicalPoint, useTreeDrag } from "./treeDrag";
import { isTauri } from "@/api/client";

export function iconForFile(node: FileNode): IconName {
  if (node.kind === "dir") return "folder";
  switch (node.ext) {
    case "tex":
    case "sty":
    case "cls":
      return "fileTex";
    case "bib":
      return "fileBib";
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
    case "svg":
      return "fileImage";
    case "pdf":
      return "filePdf";
    case "md":
    case "txt":
    case "json":
    case "yaml":
    case "yml":
      return "fileText";
    default:
      return "file";
  }
}

type Prompt = { kind: "file"; dir: string } | { kind: "folder"; dir: string } | { kind: "rename"; path: string } | null;

export function FileTree({ folded, onToggle }: SectionProps) {
  const tree = useProjectStore((s) => s.tree);
  const project = useProjectStore((s) => s.project);
  const activePath = useProjectStore((s) => s.activePath);
  const selectedDir = useProjectStore((s) => s.selectedDir);
  const buffers = useProjectStore((s) => s.buffers);
  const srcDir = useProjectStore((s) => s.srcDir);
  const { openFile, setSelectedDir, createFile, createFolder, renameEntry, deleteEntry, importFiles, setMainFile } = useProjectStore();

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ node: FileNode | null; at: { x: number; y: number } } | null>(null);
  const [externalTarget, setExternalTarget] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const toggleDir = useCallback((path: string) => {
    setCollapsed((s) => {
      const n = new Set(s);
      if (n.has(path)) n.delete(path);
      else n.add(path);
      return n;
    });
  }, []);
  const expandDir = useCallback((path: string) => {
    setCollapsed((s) => {
      if (!s.has(path)) return s;
      const n = new Set(s);
      n.delete(path);
      return n;
    });
  }, []);

  // ── moving files and folders within the tree ──
  const moveEntry = useCallback(
    async (from: string, to: string) => {
      try {
        await renameEntry(from, to);
        toast(`Moved ${basename(from)} → ${dirname(to) || "root"}/`, "ok");
      } catch (e) {
        toast(errorMessage(e), "err");
      }
    },
    [renameEntry],
  );
  const { drag, begin: beginDrag, consumeClick } = useTreeDrag({ onMove: moveEntry, onHoverDir: expandDir });

  // ── files dropped from Finder ──
  const addDropped = useCallback(
    async (dir: string, sources: string[]) => {
      if (!sources.length) return;
      try {
        const nodes = await importFiles(dir, sources);
        toast(nodes.length === 1 ? `Added ${nodes[0].name} to ${dir || "root"}/` : `Added ${nodes.length} files to ${dir || "root"}/`, "ok");
      } catch (e) {
        toast(errorMessage(e), "err");
      }
    },
    [importFiles],
  );
  const targetAtPoint = useCallback((x: number, y: number): string | null => {
    const body = bodyRef.current;
    if (!body) return null;
    const r = body.getBoundingClientRect();
    if (x < r.left || x > r.right || y < r.top || y > r.bottom) return null;
    return dropTargetFor(document.elementFromPoint(x, y)) ?? "";
  }, []);
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    import("@tauri-apps/api/webview")
      .then(({ getCurrentWebview }) =>
        getCurrentWebview().onDragDropEvent((ev) => {
          const pl = ev.payload;
          if (pl.type === "leave") {
            setExternalTarget(null);
            return;
          }
          const { x, y } = toLogicalPoint(pl.position);
          const target = targetAtPoint(x, y);
          if (pl.type === "drop") {
            setExternalTarget(null);
            if (target !== null) void addDropped(target, pl.paths);
          } else {
            setExternalTarget(target);
          }
        }),
      )
      .then((fn) => {
        if (cancelled) fn();
        else unlisten = fn;
      })
      .catch((e) => console.warn("drag-drop events unavailable", e));
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [targetAtPoint, addDropped]);

  // Command palette entry points.
  useEffect(() => {
    const handlers: Record<string, () => void> = {
      "cohere:new-file": () => setPrompt({ kind: "file", dir: useProjectStore.getState().selectedDir }),
      "cohere:new-folder": () => setPrompt({ kind: "folder", dir: useProjectStore.getState().selectedDir }),
      "cohere:add-files": () => void upload(useProjectStore.getState().selectedDir),
      "cohere:reveal": () => revealFiles(),
      "cohere:export-zip": () => void exportZip(),
    };
    for (const [k, fn] of Object.entries(handlers)) window.addEventListener(k, fn);
    return () => {
      for (const [k, fn] of Object.entries(handlers)) window.removeEventListener(k, fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [srcDir, project?.id]);

  const revealFiles = () => {
    if (!srcDir) return;
    const rel = activePath ?? project?.mainFile ?? "";
    void reveal(rel ? `${srcDir}/${rel}` : srcDir);
  };

  const upload = async (dir: string) => {
    const files = await pickFiles("Add files to the project");
    if (!files.length) return;
    try {
      const nodes = await importFiles(dir, files);
      toast(nodes.length === 1 ? `Added ${nodes[0].name}` : `Added ${nodes.length} files`, "ok");
    } catch (e) {
      toast(errorMessage(e), "err");
    }
  };

  const exportZip = async () => {
    if (!project) return;
    const dest = await pickSavePath(`tx.${slugify(project.title)}.zip`, "zip");
    if (!dest) return;
    try {
      await useProjectStore.getState().saveAll();
      const r = await api.library.exportZip(project.id, dest);
      toast("Bundle exported", "ok", { action: { label: "Reveal", run: () => void reveal(r.path) } });
    } catch (e) {
      toast(errorMessage(e), "err");
    }
  };

  const contextItems = useMemo((): MenuEntry[] => {
    const node = ctx?.node ?? null;
    const dir = node ? (node.kind === "dir" ? node.path : dirname(node.path)) : "";
    const items: MenuEntry[] = [
      { id: "nf", label: "New file", icon: "newFile", onSelect: () => setPrompt({ kind: "file", dir }) },
      { id: "nd", label: "New folder", icon: "newFolder", onSelect: () => setPrompt({ kind: "folder", dir }) },
      { id: "up", label: "Add files…", icon: "upload", onSelect: () => void upload(dir) },
    ];
    if (node) {
      items.push({ sep: true });
      if (node.kind === "file" && node.ext === "tex" && project?.mainFile !== node.path) {
        items.push({ id: "main", label: "Set as main file", icon: "compile", onSelect: () => void setMainFile(node.path).then(() => toast(`${node.name} is now the main file`, "ok")) });
      }
      items.push({ id: "rn", label: "Rename…", icon: "rename", onSelect: () => setPrompt({ kind: "rename", path: node.path }) });
      if (srcDir) items.push({ id: "reveal", label: "Reveal in Finder", icon: "external", onSelect: () => void reveal(`${srcDir}/${node.path}`) });
      items.push({ id: "del", label: "Delete", icon: "trash", danger: true, disabled: project?.mainFile === node.path, onSelect: () => setDeleting(node.path) });
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, project, srcDir]);

  const submitPrompt = async (value: string) => {
    if (!prompt) return;
    const name = value.trim();
    if (!name) return;
    try {
      if (prompt.kind === "file") {
        const withExt = /\.[A-Za-z0-9]+$/.test(name) ? name : `${name}.tex`;
        await createFile(prompt.dir, withExt, withExt.endsWith(".tex") ? `% ${withExt}\n` : "");
      } else if (prompt.kind === "folder") {
        await createFolder(prompt.dir, name);
      } else {
        const to = joinPath(dirname(prompt.path), name);
        if (to !== prompt.path) await renameEntry(prompt.path, to);
      }
      setPrompt(null);
    } catch (e) {
      toast(errorMessage(e), "err");
    }
  };

  return (
    <>
      <SectionHead
        title="files"
        tip={folded ? "Show files" : selectedDir ? `New items go into ${selectedDir}/ · click to fold` : "New items go into the project root · click to fold"}
        folded={folded}
        onToggle={onToggle}
        actions={
          <>
            <IconButton icon="newFile" label="New file" hint={selectedDir ? `in ${selectedDir}/` : "in the root"} size="sm" onClick={() => setPrompt({ kind: "file", dir: selectedDir })} />
            <IconButton icon="newFolder" label="New folder" size="sm" onClick={() => setPrompt({ kind: "folder", dir: selectedDir })} />
            <IconButton icon="upload" label="Add files" hint="images, .bib, .tex… or drop them onto the tree" size="sm" onClick={() => void upload(selectedDir)} />
            <IconButton icon="external" label="Reveal in Finder" hint={srcDir ? "the project's src/ folder" : undefined} size="sm" onClick={revealFiles} disabled={!srcDir} />
            <IconButton icon="export" label="Export project (.zip)" size="sm" onClick={exportZip} />
          </>
        }
      />
      {!folded && (
      <div
        ref={bodyRef}
        className={["sect__body", "tree-body", externalTarget !== null && "is-external-over", drag && drag.target === "" && drag.valid && "is-drop-root", externalTarget === "" && "is-drop-root"].filter(Boolean).join(" ")}
        data-dropzone="root"
        onContextMenu={(e) => {
          e.preventDefault();
          setCtx({ node: null, at: { x: e.clientX, y: e.clientY } });
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelectedDir("");
        }}
        onDragOver={(e) => {
          if (isTauri()) return;
          e.preventDefault();
          setExternalTarget(dropTargetFor(e.target as Element) ?? "");
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setExternalTarget(null);
        }}
        onDrop={(e) => {
          if (isTauri()) return;
          e.preventDefault();
          const target = dropTargetFor(e.target as Element) ?? "";
          setExternalTarget(null);
          void addDropped(target, Array.from(e.dataTransfer.files).map((f) => f.name));
        }}
      >
        {externalTarget !== null && <div className="tree-drop-hint">add to {externalTarget ? `${externalTarget}/` : "project root"}</div>}
        <div className="tree" role="tree" aria-label="Project files">
          {tree.map((n) => (
            <TreeNode
              key={n.path}
              node={n}
              depth={0}
              collapsed={collapsed}
              activePath={activePath}
              selectedDir={selectedDir}
              mainFile={project?.mainFile ?? null}
              dirty={(p) => !!buffers[p]?.dirty}
              onToggle={toggleDir}
              onOpen={(p) => void openFile(p)}
              onSelectDir={setSelectedDir}
              onContext={(node, at) => setCtx({ node, at })}
              dropTarget={drag?.valid ? drag.target : externalTarget}
              dragging={drag?.node.path ?? null}
              onDragStart={beginDrag}
              consumeClick={consumeClick}
            />
          ))}
        </div>
      </div>
      )}
      {drag && (
        <div className={["tree-ghost", !drag.valid && "is-invalid"].filter(Boolean).join(" ")} style={{ left: drag.x + 12, top: drag.y + 10 }} aria-hidden>
          <Icon name={drag.node.kind === "dir" ? "folder" : iconForFile(drag.node)} size={13} />
          <span>{drag.node.name}</span>
          {drag.target !== null && drag.valid && <span className="tree-ghost__to">→ {drag.target || "root"}/</span>}
        </div>
      )}

      <Menu open={!!ctx} anchor={ctx?.at ?? null} onClose={() => setCtx(null)} items={contextItems} />

      <NamePrompt prompt={prompt} onClose={() => setPrompt(null)} onSubmit={submitPrompt} />

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete ${deleting ? basename(deleting) : ""}?`}
        body="This removes the file from the project on disk. Archived versions keep their own copy."
        confirmLabel="delete"
        danger
        onConfirm={async () => {
          const p = deleting;
          setDeleting(null);
          if (!p) return;
          try {
            await deleteEntry(p);
            toast("Deleted", "ok");
          } catch (e) {
            toast(errorMessage(e), "err");
          }
        }}
      />
    </>
  );
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  collapsed: Set<string>;
  activePath: string | null;
  selectedDir: string;
  mainFile: string | null;
  dirty: (p: string) => boolean;
  onToggle: (p: string) => void;
  onOpen: (p: string) => void;
  onSelectDir: (p: string) => void;
  onContext: (n: FileNode, at: { x: number; y: number }) => void;
  /** Folder currently highlighted as a drop destination ("" = root). */
  dropTarget: string | null;
  /** Path of the node being dragged, if any. */
  dragging: string | null;
  onDragStart: (node: FileNode, e: React.PointerEvent) => void;
  consumeClick: () => boolean;
}

function TreeNode(props: TreeNodeProps) {
  const { node, depth, collapsed, activePath, selectedDir, mainFile, dirty, onToggle, onOpen, onSelectDir, onContext, dropTarget, dragging, onDragStart, consumeClick } = props;
  const isDir = node.kind === "dir";
  const open = isDir && !collapsed.has(node.path);
  const isActive = node.path === activePath;
  const isMain = node.path === mainFile;
  const isDropTarget = isDir && dropTarget === node.path;
  const isDragging = dragging === node.path || (dragging !== null && node.path.startsWith(dragging + "/"));
  return (
    <>
      <button
        role="treeitem"
        aria-expanded={isDir ? open : undefined}
        aria-selected={isActive}
        className={["tnode", isActive && "is-active", isDir && selectedDir === node.path && "is-selected-dir", isDropTarget && "is-drop-target", isDragging && "is-dragging"].filter(Boolean).join(" ")}
        style={{ ["--depth" as string]: depth }}
        data-path={node.path}
        data-kind={node.kind}
        onPointerDown={(e) => onDragStart(node, e)}
        onClick={() => {
          if (consumeClick()) return;
          if (isDir) {
            onSelectDir(node.path);
            onToggle(node.path);
          } else onOpen(node.path);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onContext(node, { x: e.clientX, y: e.clientY });
        }}
        title={node.path}
      >
        {isDir ? <Icon name="chevronRight" size={12} className={["tnode__chev", open && "is-open"].filter(Boolean).join(" ")} /> : <span style={{ width: 12 }} />}
        <Icon name={isDir ? (open ? "folderOpen" : "folder") : iconForFile(node)} size={14} className="tnode__icon" />
        <span className="tnode__name">{node.name}</span>
        {isMain && (
          <Tooltip content="Main file — this is what compiles">
            <span className="tnode__main">main</span>
          </Tooltip>
        )}
        {!isDir && dirty(node.path) && <span className="tnode__dirty" aria-label="unsaved" />}
      </button>
      {isDir && open && node.children && (
        <div className="tree__children">
          {node.children.map((c) => (
            <TreeNode key={c.path} {...props} node={c} depth={depth + 1} />
          ))}
        </div>
      )}
    </>
  );
}

function NamePrompt({ prompt, onClose, onSubmit }: { prompt: Prompt; onClose: () => void; onSubmit: (value: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  useEffect(() => {
    if (!prompt) return;
    setValue(prompt.kind === "rename" ? basename(prompt.path) : "");
  }, [prompt]);
  if (!prompt) return null;
  const title = prompt.kind === "file" ? "New file" : prompt.kind === "folder" ? "New folder" : "Rename";
  const where = prompt.kind === "rename" ? dirname(prompt.path) : prompt.dir;
  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      width="narrow"
      onSubmit={() => void onSubmit(value)}
      footer={
        <>
          <span className="grow field__hint mono">{where ? `${where}/` : "project root"}</span>
          <Button variant="ghost" onClick={onClose}>
            cancel
          </Button>
          <Button variant="primary" onClick={() => void onSubmit(value)}>
            {prompt.kind === "rename" ? "rename" : "create"}
          </Button>
        </>
      }
    >
      <Field label="Name" hint={prompt.kind === "file" ? ".tex is added when no extension is given" : undefined}>
        <TextInput
          line
          data-autofocus
          mono
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={prompt.kind === "file" ? "chapter_04" : prompt.kind === "folder" ? "figures" : ""}
          onFocus={(e) => {
            if (prompt.kind === "rename") {
              const dot = e.target.value.lastIndexOf(".");
              e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
            }
          }}
        />
      </Field>
    </Dialog>
  );
}
