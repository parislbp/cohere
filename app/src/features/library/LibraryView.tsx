/**
 * Library — every project, one thin serif title, two seamless buttons, a list that never scrolls
 * (rows that do not fit go to the next page), hover-revealed actions.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ProjectSummary, TemplateInfo } from "@/api/types";
import { ICON_NAMES, Icon, type IconName } from "@/components/icons";
import { Button, Checkbox, EmptyState, GradientText, IconButton, Pager, Segmented, TextInput, Tooltip } from "@/components/ui";
import { formatDateTime, formatDaysAgo, plural, slugify } from "@/lib/format";
import { pickSavePath, reveal } from "@/lib/native";
import * as api from "@/api";
import { filterProjects, paginate, rowsThatFit, useLibraryStore, type FavFilter, type SortKey } from "@/store/library";
import { useProjectStore } from "@/store/project";
import { errorMessage, toast, useUiStore } from "@/store/ui";
import { NewProjectDialog } from "./NewProjectDialog";
import { RenameDialog } from "./RenameDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import "./library.css";

const ROW_H = 44;

export function LibraryView() {
  const projects = useLibraryStore((s) => s.projects);
  const loaded = useLibraryStore((s) => s.loaded);
  const error = useLibraryStore((s) => s.error);
  const query = useLibraryStore((s) => s.query);
  const searchOpen = useLibraryStore((s) => s.searchOpen);
  const showArchived = useLibraryStore((s) => s.showArchived);
  const sort = useLibraryStore((s) => s.sort);
  const sortDir = useLibraryStore((s) => s.sortDir);
  const favFilter = useLibraryStore((s) => s.favFilter);
  const page = useLibraryStore((s) => s.page);
  const selected = useLibraryStore((s) => s.selected);
  const templates = useLibraryStore((s) => s.templates);
  const { load, loadTemplates, setQuery, toggleSearch, setShowArchived, cycleFavFilter, setSort, setPage, toggleSelect, selectMany, clearSelection } = useLibraryStore();

  const [newOpen, setNewOpen] = useState(false);
  const [renaming, setRenaming] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState<ProjectSummary[] | null>(null);
  const [pageSize, setPageSize] = useState(8);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void load();
    void loadTemplates();
  }, [load, loadTemplates]);

  useEffect(() => {
    if (searchOpen) requestAnimationFrame(() => searchRef.current?.focus());
  }, [searchOpen]);

  // Command palette entry points.
  useEffect(() => {
    const onNew = () => setNewOpen(true);
    window.addEventListener("cohere:new-project", onNew);
    return () => window.removeEventListener("cohere:new-project", onNew);
  }, []);

  // Rows that fit without scrolling: measure the list area, subtract the header row.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => setPageSize(rowsThatFit(el.clientHeight, ROW_H, 34));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const filtered = useMemo(() => filterProjects(projects, query, showArchived, sort, sortDir, favFilter), [projects, query, showArchived, sort, sortDir, favFilter]);
  const templateByKey = useMemo(() => new Map(templates.map((t) => [t.key, t])), [templates]);
  const { slice, page: cur, pages } = useMemo(() => paginate(filtered, page, pageSize), [filtered, page, pageSize]);
  useEffect(() => {
    if (cur !== page) setPage(cur);
  }, [cur, page, setPage]);

  const visibleSelected = slice.filter((p) => selected.has(p.id)).length;
  const allVisible = slice.length > 0 && visibleSelected === slice.length;
  const archivedCount = projects.filter((p) => p.archived).length;
  const activeCount = projects.length - archivedCount;

  const openProject = useProjectStore((s) => s.open);
  const setView = useUiStore((s) => s.setView);
  const onOpen = useCallback(
    async (p: ProjectSummary) => {
      if (p.archived) {
        toast("Archived — unarchive to open", "info");
        return;
      }
      try {
        await openProject(p.id);
        setView("editor");
      } catch (e) {
        toast(errorMessage(e), "err");
      }
    },
    [openProject, setView],
  );

  const sortIcon = (key: SortKey) => (sort === key ? (sortDir === "asc" ? "arrowUp" : "arrowDown") : undefined);

  return (
    <div className="library anim-fade">
      <header className="library__head">
        <GradientText as="h1" className="library__title serif">
          Library
        </GradientText>
        <div className="library__actions" role="group" aria-label="Library actions">
          <Button variant="ghost" className="library__btn library__btn--quiet" on={searchOpen} icon="search" onClick={() => toggleSearch()} tip="Filter projects as you type" kbd="Mod-f">
            search
          </Button>
          <Button variant="primary" className="library__btn" icon="plus" onClick={() => setNewOpen(true)} tip="Blank or from a template" kbd="Mod-n" data-testid="new-project-button">
            new
          </Button>
        </div>
        <div className={["library__search", searchOpen && "is-open"].filter(Boolean).join(" ")} aria-hidden={!searchOpen}>
          <div className="library__search-inner">
            <Icon name="search" size={14} className="library__search-icon" />
            <TextInput
              ref={searchRef}
              ghost
              placeholder="title, topic or template…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") toggleSearch(false);
              }}
              aria-label="Search projects"
              tabIndex={searchOpen ? 0 : -1}
            />
            {query && <IconButton icon="close" label="Clear" size="sm" onClick={() => setQuery("")} />}
          </div>
        </div>
      </header>

      <div className="library__list" ref={listRef}>
        {!loaded ? (
          <div className="library__loading">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shimmer" style={{ height: 30, margin: "7px 0", opacity: 0.6 - i * 0.12 }} />
            ))}
          </div>
        ) : error ? (
          <EmptyState icon="warning" title="The library could not be read">
            {error}
          </EmptyState>
        ) : filtered.length === 0 ? (
          projects.length === 0 ? (
            <EmptyState icon="library" title="Nothing here yet">
              Start with a blank page or one of the four templates — <b>new</b> above.
            </EmptyState>
          ) : (
            <EmptyState icon={showArchived ? "archive" : "search"} title={showArchived ? "No archived projects" : "No matches"}>
              {showArchived ? "Archived projects appear here and cannot be opened until unarchived." : `Nothing matches “${query}”.`}
            </EmptyState>
          )
        ) : (
          <table className="ptable" role="grid" aria-label="Projects">
            <thead>
              <tr className={["ptable__head", visibleSelected > 0 && "has-selection"].filter(Boolean).join(" ")}>
                <th className="ptable__check">
                  <Checkbox checked={allVisible} mixed={!allVisible && visibleSelected > 0} onChange={(on) => selectMany(slice.map((p) => p.id), on)} label={allVisible ? "Deselect all on this page" : "Select all on this page"} />
                </th>
                <th className="ptable__type" aria-label="Type" />
                <th>
                  <SortHeader label="Title" active={sort === "title"} icon={sortIcon("title")} onClick={() => setSort("title")} />
                </th>
                <th className="ptable__topic">
                  <SortHeader label="Topic" active={sort === "topic"} icon={sortIcon("topic")} onClick={() => setSort("topic")} />
                </th>
                <th className="ptable__date">
                  <SortHeader label="Modified" active={sort === "modified"} icon={sortIcon("modified")} onClick={() => setSort("modified")} align="center" />
                </th>
                <th className="ptable__fav">
                  <FavHeader filter={favFilter} onCycle={cycleFavFilter} />
                </th>
                <th className="ptable__actions" aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {slice.map((p, i) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  template={templateByKey.get(p.template)}
                  index={i}
                  selected={selected.has(p.id)}
                  onSelect={() => toggleSelect(p.id)}
                  onOpen={() => onOpen(p)}
                  onRename={() => setRenaming(p)}
                  onDelete={() => setDeleting([p])}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <footer className="library__foot">
        <div className="library__foot-left">{selected.size > 0 && <BulkBar ids={[...selected]} projects={projects} onDelete={(ps) => setDeleting(ps)} onClear={clearSelection} />}</div>
        <div className="library__foot-center">
          <Segmented
            size="sm"
            ariaLabel="Show projects or archived"
            value={showArchived ? "archived" : "projects"}
            onChange={(v) => setShowArchived(v === "archived")}
            options={[
              { id: "projects", label: <span className="tnum">{activeCount}</span>, icon: "library", tip: `${plural(activeCount, "project")}`, ariaLabel: `Projects (${activeCount})` },
              { id: "archived", label: <span className="tnum">{archivedCount}</span>, icon: "archive", tip: `${plural(archivedCount, "archived project")}`, ariaLabel: `Archived (${archivedCount})` },
            ]}
          />
          <Pager page={cur} pages={pages} onChange={setPage} />
        </div>
        <div className="library__foot-right muted tnum">{query ? `${filtered.length} match${filtered.length === 1 ? "" : "es"}` : ""}</div>
      </footer>

      <NewProjectDialog open={newOpen} onClose={() => setNewOpen(false)} />
      <RenameDialog project={renaming} onClose={() => setRenaming(null)} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={deleting && deleting.length > 1 ? `Delete ${deleting.length} projects?` : "Delete this project?"}
        body={deleting && deleting.length === 1 ? `“${deleting[0].title}” moves to the app's trash folder; it can be recovered by hand from the data directory.` : "They move to the app's trash folder; they can be recovered by hand from the data directory."}
        confirmLabel="delete"
        danger
        onConfirm={async () => {
          const ps = deleting ?? [];
          setDeleting(null);
          const remove = useLibraryStore.getState().remove;
          let n = 0;
          for (const p of ps) {
            try {
              await remove(p.id);
              n++;
            } catch (e) {
              toast(errorMessage(e), "err");
            }
          }
          if (n) toast(n === 1 ? "Project deleted" : `${n} projects deleted`, "ok");
        }}
      />
    </div>
  );
}

function SortHeader({ label, active, icon, onClick, align }: { label: string; active: boolean; icon?: "arrowUp" | "arrowDown"; onClick: () => void; align?: "right" | "center" }) {
  return (
    <Tooltip content={`Sort by ${label.toLowerCase()}`}>
      <button className={["ptable__sort", active && "is-active", align && `ptable__sort--${align}`].filter(Boolean).join(" ")} onClick={onClick}>
        <span className="caps">{label}</span>
        {icon && <Icon name={icon} size={11} />}
      </button>
    </Tooltip>
  );
}

const FAV_LABEL: Record<FavFilter, { icon: IconName; tip: string; next: string }> = {
  all: { icon: "star", tip: "All projects", next: "favourites only" },
  fav: { icon: "starFilled", tip: "Favourites only", next: "everything but favourites" },
  nonfav: { icon: "starOff", tip: "Everything but favourites", next: "all projects" },
};

function FavHeader({ filter, onCycle }: { filter: FavFilter; onCycle: () => void }) {
  const meta = FAV_LABEL[filter];
  return (
    <Tooltip content={meta.tip} hint={`click → ${meta.next}`}>
      <button className={["ptable__favhead", filter !== "all" && "is-active"].filter(Boolean).join(" ")} onClick={onCycle} aria-label={`Favourite filter: ${meta.tip}`} data-testid="fav-filter">
        <Icon name={meta.icon} size={13} />
      </button>
    </Tooltip>
  );
}

function templateIcon(t: TemplateInfo | undefined, key: string): IconName {
  const wanted = t?.icon ?? "";
  if ((ICON_NAMES as readonly string[]).includes(wanted)) return wanted as IconName;
  return key === "blank" ? "tplBlank" : "fileTex";
}

function ProjectRow({ project: p, template, index, selected, onSelect, onOpen, onRename, onDelete }: { project: ProjectSummary; template: TemplateInfo | undefined; index: number; selected: boolean; onSelect: () => void; onOpen: () => void; onRename: () => void; onDelete: () => void }) {
  const archive = useLibraryStore((s) => s.archive);
  const favorite = useLibraryStore((s) => s.favorite);
  const [busy, setBusy] = useState<string | null>(null);
  const typeName = template?.shortName ?? (p.template === "blank" ? "Blank" : p.template);

  const exportZip = async () => {
    const dest = await pickSavePath(`tx.${slugify(p.title)}.zip`, "zip");
    if (!dest) return;
    setBusy("zip");
    try {
      const r = await api.library.exportZip(p.id, dest);
      toast("Bundle exported", "ok", { action: { label: "Reveal", run: () => void reveal(r.path) } });
    } catch (e) {
      toast(errorMessage(e), "err");
    } finally {
      setBusy(null);
    }
  };
  const exportPdf = async () => {
    if (!p.hasOutput) {
      toast("No compiled PDF yet — open the project and compile", "info");
      return;
    }
    const dest = await pickSavePath(`${slugify(p.title)}.pdf`, "pdf");
    if (!dest) return;
    setBusy("pdf");
    try {
      const r = await api.library.exportPdf(p.id, dest);
      toast("PDF exported", "ok", { action: { label: "Reveal", run: () => void reveal(r.path) } });
    } catch (e) {
      toast(errorMessage(e), "err");
    } finally {
      setBusy(null);
    }
  };
  const toggleArchive = async () => {
    setBusy("archive");
    try {
      await archive(p.id, !p.archived);
      toast(p.archived ? "Unarchived" : "Archived", "ok");
    } catch (e) {
      toast(errorMessage(e), "err");
    } finally {
      setBusy(null);
    }
  };

  return (
    <tr
      className={["prow", selected && "is-selected", p.archived && "is-archived", "anim-fade"].filter(Boolean).join(" ")}
      style={{ animationDelay: `calc(${index} * 18ms * var(--motion))` }}
      onDoubleClick={onOpen}
      data-testid="project-row"
      data-project-id={p.id}
    >
      <td className="ptable__check">
        <Checkbox checked={selected} onChange={onSelect} label={selected ? "Deselect" : "Select"} />
      </td>
      <td className="ptable__type">
        <Tooltip content={typeName} side="bottom">
          <span className="prow__type" data-tpl={p.template} tabIndex={-1} aria-label={typeName}>
            <Icon name={templateIcon(template, p.template)} size={16} strokeWidth={1.4} />
          </span>
        </Tooltip>
      </td>
      <td className="ptable__title">
        <Tooltip content={p.archived ? "Archived — unarchive to open" : `Open · ${plural(p.fileCount, "file")}${p.versionCount ? ` · ${plural(p.versionCount, "version")}` : ""}`} hint={p.archived ? undefined : p.title} display="block" side="bottom">
          <button className="prow__open truncate" onClick={onOpen} disabled={p.archived} aria-label={`Open ${p.title}`}>
            <span className="prow__title truncate">{p.title}</span>
            {p.archived && <Icon name="archive" size={12} className="prow__flag" />}
          </button>
        </Tooltip>
      </td>
      <td className="ptable__topic">
        <span className="prow__topic truncate" title={p.topic ?? undefined}>
          {p.topic ?? <span className="prow__none">—</span>}
        </span>
      </td>
      <td className="ptable__date">
        <Tooltip content={formatDateTime(p.modified)} hint={`created ${formatDateTime(p.created)}`}>
          <span className="prow__date tnum">{formatDaysAgo(p.modified)}</span>
        </Tooltip>
      </td>
      <td className="ptable__fav">
        <IconButton
          icon={p.favorite ? "starFilled" : "star"}
          label={p.favorite ? "Remove from favourites" : "Add to favourites"}
          size="sm"
          className={["prow__fav", p.favorite && "is-on"].filter(Boolean).join(" ")}
          onClick={async () => {
            try {
              await favorite(p.id, !p.favorite);
            } catch (e) {
              toast(errorMessage(e), "err");
            }
          }}
          data-testid="fav-toggle"
        />
      </td>
      <td className="ptable__actions">
        <div className="prow__actions" role="group" aria-label={`Actions for ${p.title}`}>
          <IconButton icon="downloadZip" label="Download bundle (.zip)" size="sm" onClick={exportZip} spin={busy === "zip"} />
          <IconButton icon="downloadPdf" label={p.hasOutput ? "Download PDF" : "No PDF compiled yet"} size="sm" onClick={exportPdf} spin={busy === "pdf"} className={p.hasOutput ? undefined : "iconbtn--quiet"} />
          <IconButton icon="rename" label="Rename · topic" size="sm" onClick={onRename} />
          <IconButton icon={p.archived ? "unarchive" : "archive"} label={p.archived ? "Unarchive" : "Archive"} size="sm" onClick={toggleArchive} spin={busy === "archive"} />
          <IconButton icon="trash" label="Delete" size="sm" variant="danger" onClick={onDelete} />
        </div>
      </td>
    </tr>
  );
}

function BulkBar({ ids, projects, onDelete, onClear }: { ids: string[]; projects: ProjectSummary[]; onDelete: (ps: ProjectSummary[]) => void; onClear: () => void }) {
  const archive = useLibraryStore((s) => s.archive);
  const ps = projects.filter((p) => ids.includes(p.id));
  const allArchived = ps.every((p) => p.archived);
  return (
    <div className="bulk anim-sink" role="toolbar" aria-label="Selected projects">
      <span className="tnum dim">{plural(ps.length, "selected", "selected")}</span>
      <IconButton
        icon={allArchived ? "unarchive" : "archive"}
        label={allArchived ? "Unarchive selected" : "Archive selected"}
        size="sm"
        onClick={async () => {
          for (const p of ps) {
            try {
              await archive(p.id, !allArchived);
            } catch (e) {
              toast(errorMessage(e), "err");
            }
          }
          onClear();
        }}
      />
      <IconButton icon="trash" label="Delete selected" size="sm" variant="danger" onClick={() => onDelete(ps)} />
      <IconButton icon="close" label="Clear selection" size="sm" onClick={onClear} />
    </div>
  );
}
