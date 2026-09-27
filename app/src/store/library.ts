/** Library store: the list of projects, filtering, selection, and project-level actions. */
import { create } from "zustand";
import * as api from "@/api";
import type { NewProject, ProjectSummary, TemplateInfo } from "@/api/types";

export type SortKey = "modified" | "title" | "topic";
export type FavFilter = "all" | "fav" | "nonfav";
export const FAV_CYCLE: FavFilter[] = ["all", "fav", "nonfav"];

interface LibraryState {
  projects: ProjectSummary[];
  templates: TemplateInfo[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  query: string;
  searchOpen: boolean;
  showArchived: boolean;
  favFilter: FavFilter;
  sort: SortKey;
  sortDir: "asc" | "desc";
  selected: Set<string>;
  page: number;

  load: () => Promise<void>;
  loadTemplates: () => Promise<void>;
  setQuery: (q: string) => void;
  toggleSearch: (open?: boolean) => void;
  setShowArchived: (v: boolean) => void;
  cycleFavFilter: () => void;
  setFavFilter: (f: FavFilter) => void;
  setSort: (key: SortKey) => void;
  setPage: (p: number) => void;
  toggleSelect: (id: string) => void;
  selectMany: (ids: string[], on: boolean) => void;
  clearSelection: () => void;

  create: (input: NewProject) => Promise<ProjectSummary>;
  rename: (id: string, title: string, topic: string | null) => Promise<ProjectSummary>;
  archive: (id: string, archived: boolean) => Promise<void>;
  favorite: (id: string, favorite: boolean) => Promise<void>;
  remove: (id: string) => Promise<void>;
  upsert: (p: ProjectSummary) => void;
}

function replace(list: ProjectSummary[], p: ProjectSummary): ProjectSummary[] {
  const i = list.findIndex((x) => x.id === p.id);
  if (i < 0) return [p, ...list];
  const next = list.slice();
  next[i] = p;
  return next;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  projects: [],
  templates: [],
  loaded: false,
  loading: false,
  error: null,
  query: "",
  searchOpen: false,
  showArchived: false,
  favFilter: "all",
  sort: "modified",
  sortDir: "desc",
  selected: new Set(),
  page: 1,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const projects = await api.library.list();
      set({ projects, loaded: true, loading: false });
    } catch (e) {
      set({ loading: false, loaded: true, error: e instanceof Error ? e.message : String(e) });
    }
  },
  loadTemplates: async () => {
    if (get().templates.length) return;
    try {
      set({ templates: await api.templates.list() });
    } catch (e) {
      console.warn("templates", e);
    }
  },

  setQuery: (query) => set({ query, page: 1 }),
  toggleSearch: (open) =>
    set((s) => {
      const next = open ?? !s.searchOpen;
      return next ? { searchOpen: true } : { searchOpen: false, query: "", page: 1 };
    }),
  setShowArchived: (showArchived) => set({ showArchived, page: 1, selected: new Set() }),
  cycleFavFilter: () => set((s) => ({ favFilter: FAV_CYCLE[(FAV_CYCLE.indexOf(s.favFilter) + 1) % FAV_CYCLE.length], page: 1 })),
  setFavFilter: (favFilter) => set({ favFilter, page: 1 }),
  setSort: (key) =>
    set((s) => (s.sort === key ? { sortDir: s.sortDir === "asc" ? "desc" : "asc" } : { sort: key, sortDir: key === "modified" ? "desc" : "asc", page: 1 })),
  setPage: (page) => set({ page }),
  toggleSelect: (id) =>
    set((s) => {
      const selected = new Set(s.selected);
      if (selected.has(id)) selected.delete(id);
      else selected.add(id);
      return { selected };
    }),
  selectMany: (ids, on) =>
    set((s) => {
      const selected = new Set(s.selected);
      for (const id of ids) {
        if (on) selected.add(id);
        else selected.delete(id);
      }
      return { selected };
    }),
  clearSelection: () => set({ selected: new Set() }),

  create: async (input) => {
    const p = await api.library.create(input);
    set((s) => ({ projects: replace(s.projects, p), page: 1 }));
    return p;
  },
  rename: async (id, title, topic) => {
    const p = await api.library.update(id, { title, topic });
    set((s) => ({ projects: replace(s.projects, p) }));
    return p;
  },
  archive: async (id, archived) => {
    const p = await api.library.archive(id, archived);
    set((s) => {
      const selected = new Set(s.selected);
      selected.delete(id);
      return { projects: replace(s.projects, p), selected };
    });
  },
  favorite: async (id, favorite) => {
    // optimistic: the star flips immediately, then reconciles with the backend
    set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, favorite } : p)) }));
    try {
      const p = await api.library.favorite(id, favorite);
      set((s) => ({ projects: replace(s.projects, p) }));
    } catch (e) {
      set((s) => ({ projects: s.projects.map((p) => (p.id === id ? { ...p, favorite: !favorite } : p)) }));
      throw e;
    }
  },
  remove: async (id) => {
    await api.library.remove(id);
    set((s) => {
      const selected = new Set(s.selected);
      selected.delete(id);
      return { projects: s.projects.filter((p) => p.id !== id), selected };
    });
  },
  upsert: (p) => set((s) => ({ projects: replace(s.projects, p) })),
}));

/** Pure filter + sort, shared by the view and tests. */
export function filterProjects(projects: ProjectSummary[], query: string, showArchived: boolean, sort: SortKey = "modified", dir: "asc" | "desc" = "desc", fav: FavFilter = "all"): ProjectSummary[] {
  const q = query.trim().toLowerCase();
  const out = projects.filter(
    (p) =>
      p.archived === showArchived &&
      (fav === "all" || (fav === "fav") === p.favorite) &&
      (q === "" || p.title.toLowerCase().includes(q) || (p.topic ?? "").toLowerCase().includes(q) || p.template.toLowerCase().includes(q)),
  );
  const cmp = (a: ProjectSummary, b: ProjectSummary): number => {
    switch (sort) {
      case "title":
        return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      case "topic":
        return (a.topic ?? "").localeCompare(b.topic ?? "", undefined, { sensitivity: "base" }) || a.title.localeCompare(b.title);
      default:
        return a.modified.localeCompare(b.modified);
    }
  };
  out.sort((a, b) => (dir === "asc" ? cmp(a, b) : cmp(b, a)));
  return out;
}

/** Rows that fit in `height` px without scrolling (at least 1). */
export function rowsThatFit(height: number, rowHeight: number, reserved = 0): number {
  return Math.max(1, Math.floor((height - reserved) / rowHeight));
}

export function paginate<T>(items: T[], page: number, pageSize: number): { slice: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const p = Math.min(Math.max(1, page), pages);
  return { slice: items.slice((p - 1) * pageSize, p * pageSize), page: p, pages };
}
