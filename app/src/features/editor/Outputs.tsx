/** Outputs: the current PDF card, then versions (snapshot = PDF + full source bundle). */
import { useEffect, useRef, useState } from "react";
import type { VersionInfo } from "@/api/types";
import * as api from "@/api";
import { Icon } from "@/components/icons";
import { Button, Dialog, EmptyState, Field, IconButton, Menu, TextInput, Tooltip, useMenu } from "@/components/ui";
import { formatBytes, formatDateTime, formatDayMonthYear, formatDuration, formatRelative, plural, slugify } from "@/lib/format";
import { pickSavePath, reveal } from "@/lib/native";
import { useProjectStore } from "@/store/project";
import { errorMessage, toast } from "@/store/ui";
import { ConfirmDialog } from "@/features/library/ConfirmDialog";
import { SectionHead, type SectionProps } from "./Sidebar";

export function Outputs({ folded, onToggle }: SectionProps) {
  const project = useProjectStore((s) => s.project);
  const output = useProjectStore((s) => s.output);
  const versions = useProjectStore((s) => s.versions);
  const compileStatus = useProjectStore((s) => s.compileStatus);
  const { createVersion, deleteVersion, renameVersion } = useProjectStore();
  const [snapOpen, setSnapOpen] = useState(false);
  const [editing, setEditing] = useState<VersionInfo | null>(null);
  const [deleting, setDeleting] = useState<VersionInfo | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    const handlers: Record<string, () => void> = {
      "cohere:new-version": () => setSnapOpen(true),
      "cohere:export-pdf": () => void exportPdf(),
      "cohere:show-log": () => setLogOpen(true),
    };
    for (const [k, fn] of Object.entries(handlers)) window.addEventListener(k, fn);
    return () => {
      for (const [k, fn] of Object.entries(handlers)) window.removeEventListener(k, fn);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id, output?.path]);

  const exportPdf = async () => {
    if (!project || !output) return;
    const dest = await pickSavePath(`${slugify(project.title)}.pdf`, "pdf");
    if (!dest) return;
    try {
      const r = await api.library.exportPdf(project.id, dest);
      toast("PDF exported", "ok", { action: { label: "Reveal", run: () => void reveal(r.path) } });
    } catch (e) {
      toast(errorMessage(e), "err");
    }
  };

  return (
    <>
      <SectionHead title="outputs" tip={folded ? "Show outputs" : "The latest compiled PDF and archived versions · click to fold"} folded={folded} onToggle={onToggle} />
      {!folded && (
      <div className="sect__body">
        {output ? (
          <div className="outcard" data-testid="output-card">
            <Icon name="pdf" size={20} className="outcard__icon" />
            <div className="outcard__body">
              <Tooltip content={`compiled ${formatDateTime(output.compiledAt)}`} hint={`${output.engine} · ${formatDuration(output.durationMs)}${output.errorCount ? ` · ${plural(output.errorCount, "error")}` : ""}`} display="block">
                <span className="outcard__name truncate">main.pdf</span>
              </Tooltip>
              <span className="outcard__meta">
                {output.pages != null && `${plural(output.pages, "page")} · `}
                {formatBytes(output.bytes)} · {formatRelative(output.compiledAt)}
              </span>
            </div>
            <div className="outcard__actions">
              <IconButton icon="log" label="Compile log" size="sm" onClick={() => setLogOpen(true)} />
              <IconButton icon="external" label="Reveal in Finder" size="sm" onClick={() => void reveal(output.path)} />
              <IconButton icon="export" label="Export PDF" size="sm" onClick={exportPdf} />
            </div>
          </div>
        ) : (
          <div className="outcard" style={{ opacity: 0.8 }}>
            <Icon name="pdf" size={20} className="outcard__icon" style={{ color: "var(--ink-4)" }} />
            <div className="outcard__body">
              <span className="outcard__name">{compileStatus === "running" ? "compiling…" : "no PDF yet"}</span>
              <span className="outcard__meta">{compileStatus === "running" ? "the PDF appears here when done" : "compile to produce main.pdf"}</span>
            </div>
          </div>
        )}

        <div className="hair-h" style={{ margin: "6px 4px" }} />

        <div className="versions__head">
          <span className="versions__title">versions</span>
          {versions.length > 0 && <span className="badge">{versions.length}</span>}
          <IconButton icon="snapshot" label="New version" hint="snapshot the PDF + all source files" size="sm" onClick={() => setSnapOpen(true)} />
        </div>
        {versions.length === 0 ? (
          <EmptyState icon="version" title="No versions yet">
            A version freezes the PDF and every source file.
          </EmptyState>
        ) : (
          <div role="list" aria-label="Versions">
            {versions.map((v) => (
              <VersionRow key={v.id} v={v} onEdit={() => setEditing(v)} onDelete={() => setDeleting(v)} />
            ))}
          </div>
        )}
      </div>
      )}

      <SnapshotDialog
        open={snapOpen}
        onClose={() => setSnapOpen(false)}
        onCreate={async (name, note) => {
          try {
            const v = await createVersion(name, note);
            toast(`Version ${v.name} saved`, "ok");
            setSnapOpen(false);
          } catch (e) {
            toast(errorMessage(e), "err");
          }
        }}
        hasPdf={!!output}
      />
      <EditVersionDialog
        v={editing}
        onClose={() => setEditing(null)}
        onSave={async (name, note) => {
          if (!editing) return;
          try {
            await renameVersion(editing.id, name, note);
            setEditing(null);
          } catch (e) {
            toast(errorMessage(e), "err");
          }
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={`Delete version ${deleting?.name ?? ""}?`}
        body="The snapshot's PDF and source bundle are removed. The live project is untouched."
        confirmLabel="delete"
        danger
        onConfirm={async () => {
          const v = deleting;
          setDeleting(null);
          if (!v) return;
          try {
            await deleteVersion(v.id);
            toast("Version deleted", "ok");
          } catch (e) {
            toast(errorMessage(e), "err");
          }
        }}
      />
      <LogDialog open={logOpen} onClose={() => setLogOpen(false)} />
    </>
  );
}

function VersionRow({ v, onEdit, onDelete }: { v: VersionInfo; onEdit: () => void; onDelete: () => void }) {
  const project = useProjectStore((s) => s.project);
  const menu = useMenu();
  const btn = useRef<HTMLButtonElement>(null);

  const doExport = async (kind: "pdf" | "bundle") => {
    if (!project) return;
    const base = `${slugify(project.title)}_${slugify(v.name)}`;
    const dest = await pickSavePath(kind === "pdf" ? `${base}.pdf` : `${base}.zip`, kind === "pdf" ? "pdf" : "zip");
    if (!dest) return;
    try {
      const r = await api.versions.export(project.id, v.id, kind, dest);
      toast(kind === "pdf" ? "PDF exported" : "Bundle exported", "ok", { action: { label: "Reveal", run: () => void reveal(r.path) } });
    } catch (e) {
      toast(errorMessage(e), "err");
    }
  };

  return (
    <div className="vrow" role="listitem" data-testid="version-row">
      <Tooltip content={v.note || `${plural(v.fileCount, "file")} · bundle ${formatBytes(v.bundleBytes)}${v.hasPdf ? ` · PDF ${formatBytes(v.pdfBytes)}` : " · no PDF"}`} hint={formatDateTime(v.created)} display="block">
        <span className="vrow__name">{v.name}</span>
      </Tooltip>
      <span className="vrow__date">{formatDayMonthYear(v.created)}</span>
      <div className="vrow__actions">
        <IconButton ref={btn} icon="export" label="Export…" size="sm" onClick={() => btn.current && menu.toggle(btn.current)} />
        <IconButton icon="rename" label="Rename · note" size="sm" onClick={onEdit} />
        <IconButton icon="trash" label="Delete version" size="sm" variant="danger" onClick={onDelete} />
      </div>
      <Menu
        open={menu.open}
        anchor={menu.anchor}
        onClose={menu.close}
        align="end"
        items={[
          { id: "pdf", label: "PDF", icon: "downloadPdf", disabled: !v.hasPdf, meta: v.hasPdf ? formatBytes(v.pdfBytes) : "none", onSelect: () => void doExport("pdf") },
          { id: "zip", label: "Source bundle (.zip)", icon: "downloadZip", meta: formatBytes(v.bundleBytes), onSelect: () => void doExport("bundle") },
        ]}
      />
    </div>
  );
}

function SnapshotDialog({ open, onClose, onCreate, hasPdf }: { open: boolean; onClose: () => void; onCreate: (name: string, note: string) => Promise<void>; hasPdf: boolean }) {
  const project = useProjectStore((s) => s.project);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open || !project) return;
    setNote("");
    setName("");
    api.versions.nextName(project.id).then(setName).catch(() => setName("v1"));
  }, [open, project]);
  const submit = async () => {
    setBusy(true);
    await onCreate(name, note);
    setBusy(false);
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New version"
      width="narrow"
      onSubmit={submit}
      testId="snapshot-dialog"
      footer={
        <>
          <span className="grow field__hint">{hasPdf ? "freezes main.pdf and all source files" : "no PDF yet — the bundle is saved without one"}</span>
          <Button variant="ghost" onClick={onClose}>
            cancel
          </Button>
          <Button variant="primary" icon="snapshot" onClick={submit} loading={busy} data-testid="create-version">
            save version
          </Button>
        </>
      }
    >
      <Field label="Name">
        <TextInput line data-autofocus value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.target.select()} />
      </Field>
      <Field label="Note" info="What changed, for future you. Shows on hover in the versions list.">
        <TextInput line value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
      </Field>
    </Dialog>
  );
}

function EditVersionDialog({ v, onClose, onSave }: { v: VersionInfo | null; onClose: () => void; onSave: (name: string, note: string) => Promise<void> }) {
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => {
    if (v) {
      setName(v.name);
      setNote(v.note);
    }
  }, [v]);
  return (
    <Dialog
      open={!!v}
      onClose={onClose}
      title="Edit version"
      width="narrow"
      onSubmit={() => void onSave(name, note)}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            cancel
          </Button>
          <Button variant="primary" onClick={() => void onSave(name, note)}>
            save
          </Button>
        </>
      }
    >
      <Field label="Name">
        <TextInput line data-autofocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Note">
        <TextInput line value={note} onChange={(e) => setNote(e.target.value)} placeholder="optional" />
      </Field>
    </Dialog>
  );
}

function LogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const project = useProjectStore((s) => s.project);
  const [text, setText] = useState<string>("");
  useEffect(() => {
    if (!open || !project) return;
    setText("loading…");
    api.compile.readLog(project.id).then((t) => setText(t || "(empty log)")).catch((e) => setText(errorMessage(e)));
  }, [open, project]);
  return (
    <Dialog open={open} onClose={onClose} title="main.log" width="wide">
      <pre className="log selectable" style={{ maxHeight: "60vh", overflow: "auto", margin: 0 }}>
        {text}
      </pre>
    </Dialog>
  );
}
