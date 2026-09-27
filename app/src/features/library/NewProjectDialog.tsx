/** New project: pick a template, name it, choose the structure, create and open. */
import { useEffect, useMemo, useState } from "react";
import type { TemplateInfo } from "@/api/types";
import { Button, Dialog, Field, Stepper, TextInput, Tooltip } from "@/components/ui";
import { useLibraryStore } from "@/store/library";
import { useProjectStore } from "@/store/project";
import { errorMessage, toast, useUiStore } from "@/store/ui";

/** Template cards shown per page in the picker; ⟨ ⟩ pagers step one page at a time. */
export const TEMPLATE_PAGE = 5;

/** "Untitled Project", then "Untitled Project 2", … skipping titles already taken. */
export function nextUntitled(existing: string[]): string {
  const taken = new Set(existing.map((t) => t.trim().toLowerCase()));
  if (!taken.has("untitled project")) return "Untitled Project";
  for (let n = 2; n < 10_000; n++) {
    if (!taken.has(`untitled project ${n}`)) return `Untitled Project ${n}`;
  }
  return `Untitled Project ${Date.now()}`;
}

export function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const templates = useLibraryStore((s) => s.templates);
  const projects = useLibraryStore((s) => s.projects);
  const loadTemplates = useLibraryStore((s) => s.loadTemplates);
  const create = useLibraryStore((s) => s.create);
  const openProject = useProjectStore((s) => s.open);
  const setView = useUiStore((s) => s.setView);

  const [templateKey, setTemplateKey] = useState("project");
  const [page, setPage] = useState(0);
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [topic, setTopic] = useState("");
  const [units, setUnits] = useState<number | null>(null);
  const [subunits, setSubunits] = useState<number | null>(null);
  const [appendices, setAppendices] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      void loadTemplates();
      setTitle("");
      setSubtitle("");
      setTopic("");
      setUnits(null);
      setSubunits(null);
      setAppendices(null);
      setError(null);
    }
  }, [open, loadTemplates]);

  const tmpl: TemplateInfo | undefined = useMemo(() => templates.find((t) => t.key === templateKey) ?? templates[0], [templates, templateKey]);
  const pageCount = Math.max(1, Math.ceil(templates.length / TEMPLATE_PAGE));
  // Open on the page that holds the selected template, and never sit on a page that no longer exists.
  useEffect(() => {
    if (!open) return;
    const idx = Math.max(0, templates.findIndex((t) => t.key === (tmpl?.key ?? templateKey)));
    setPage(Math.min(Math.floor(idx / TEMPLATE_PAGE), pageCount - 1));
  }, [open, templates, tmpl?.key, templateKey, pageCount]);
  const pageTemplates = useMemo(() => templates.slice(page * TEMPLATE_PAGE, page * TEMPLATE_PAGE + TEMPLATE_PAGE), [templates, page]);
  const hasStructure = !!tmpl && tmpl.key !== "blank";
  const hasAppendices = hasStructure && !!tmpl?.appendices;
  const hasSubtitle = !!tmpl?.prompts.subtitle;
  const unitWord = tmpl?.unit ?? "section";
  const subWord = unitWord === "chapter" ? "section" : "subsection";
  const untitled = useMemo(() => nextUntitled(projects.map((p) => p.title)), [projects]);

  const submit = async () => {
    if (!tmpl || busy) return;
    const t = title.trim() || untitled;
    setBusy(true);
    setError(null);
    try {
      const p = await create({
        title: t,
        topic: topic.trim() || null,
        template: tmpl.key,
        subtitle: hasSubtitle ? subtitle.trim() : "",
        units: hasStructure ? units ?? tmpl.defaults.units : null,
        subunits: hasStructure ? subunits ?? tmpl.defaults.subunits : null,
        appendices: hasAppendices ? appendices ?? tmpl.defaults.appendices : null,
      });
      onClose();
      toast(`“${p.title}” created`, "ok");
      await openProject(p.id);
      setView("editor");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New project"
      width="wide"
      className="newproj"
      onSubmit={submit}
      testId="new-project-dialog"
      footer={
        <>
          <span className="grow newproj__desc">{tmpl ? tmpl.description : ""}</span>
          <Button variant="primary" onClick={submit} loading={busy} icon="plus" data-testid="create-project">
            create
          </Button>
        </>
      }
    >
      <div className="tcards-wrap">
        <button type="button" className="tcards__pg" aria-label="Previous templates" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} data-testid="templates-prev">
          ⟨
        </button>
        <div className="tcards" role="radiogroup" aria-label="Template">
          {pageTemplates.map((t) => (
            <Tooltip key={t.key} content={t.description} wide side="bottom" display="block">
              <button type="button" role="radio" aria-checked={t.key === tmpl?.key} className={["tcard", t.key === tmpl?.key && "is-on"].filter(Boolean).join(" ")} onClick={() => setTemplateKey(t.key)} data-testid={`template-${t.key}`}>
                <div className={["tcard__thumb", t.key === "blank" && "tcard__thumb--blank", t.toc && "tcard__thumb--cover", t.twocolumn && "tcard__thumb--twocol", t.key.startsWith("paper") && "tcard__thumb--paper"].filter(Boolean).join(" ")} />
                <span className="tcard__name">{t.name.replace(/\s*\(.*\)$/, "")}</span>
                <span className="tcard__meta">{t.key === "blank" ? "one file" : t.twocolumn ? "two columns · article" : t.key.startsWith("paper") ? "one column · article" : `${t.documentclass} · ${t.unit}s`}</span>
              </button>
            </Tooltip>
          ))}
        </div>
        <button type="button" className="tcards__pg" aria-label="More templates" disabled={page >= pageCount - 1} onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} data-testid="templates-next">
          ⟩
        </button>
      </div>
      {pageCount > 1 && (
        <div className="tcards__pages" aria-hidden="true">
          {Array.from({ length: pageCount }, (_, i) => (
            <span key={i} className={["tcards__dot", i === page && "is-on"].filter(Boolean).join(" ")} />
          ))}
        </div>
      )}

      <div className="newproj__center">
      <div className="newproj__grid">
        <Field label="Title" error={error}>
          <TextInput data-autofocus line value={title} onChange={(e) => setTitle(e.target.value)} placeholder={untitled} data-testid="new-title" />
        </Field>
        <Field label="Topic" info="Optional. Shown in the Library and used by search.">
          <TextInput line value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="optional" data-testid="new-topic" />
        </Field>
        <Field label="Subtitle" info={hasSubtitle ? "Goes under the title on the first page. Optional." : "This template has no subtitle line."} disabled={!hasSubtitle}>
          <TextInput line value={subtitle} onChange={(e) => setSubtitle(e.target.value)} placeholder="optional" disabled={!hasSubtitle} />
        </Field>
        <Field label={`${unitWord[0].toUpperCase()}${unitWord.slice(1)}s`} info={hasStructure ? `Numbered ${unitWord} files under ${tmpl?.unitDir}/, each already \\input in main.tex.` : "This template is a single file — no numbered units."} disabled={!hasStructure}>
          <Stepper value={hasStructure ? units ?? tmpl?.defaults.units ?? 0 : 0} onChange={setUnits} min={0} max={60} label={`${unitWord}s`} disabled={!hasStructure} />
        </Field>
        <Field label={`${subWord[0].toUpperCase()}${subWord.slice(1)}s each`} info={hasStructure ? `Placeholder ${subWord}s inside every ${unitWord}.` : "Not used by this template."} disabled={!hasStructure}>
          <Stepper value={hasStructure ? subunits ?? tmpl?.defaults.subunits ?? 0 : 0} onChange={setSubunits} min={0} max={20} label={`${subWord}s per ${unitWord}`} disabled={!hasStructure} />
        </Field>
        <Field label="Appendices" info={hasAppendices ? "Lettered appendices after the body; “Appendix A” prints on its own line with the optional name beneath." : "This template has no appendix block."} disabled={!hasAppendices}>
          <Stepper value={hasAppendices ? appendices ?? tmpl?.defaults.appendices ?? 0 : 0} onChange={setAppendices} min={0} max={26} label="appendices" disabled={!hasAppendices} />
        </Field>
      </div>
      </div>
    </Dialog>
  );
}
