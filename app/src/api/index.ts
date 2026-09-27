/** The whole backend surface, grouped by domain. Each function maps 1:1 to a Rust command. */
import { call, callBytes } from "./client";
import type {
  AppInfo,
  CompileResult,
  EngineId,
  ExportResult,
  FileContent,
  FileNode,
  FileStat,
  NewProject,
  OutputInfo,
  ProjectDetail,
  ProjectMetaUpdate,
  ProjectSummary,
  Settings,
  TemplateInfo,
  TexInfo,
  VersionInfo,
} from "./types";

export const app = {
  info: () => call<AppInfo>("get_app_info"),
  detectTex: () => call<TexInfo>("detect_tex"),
};

export const settings = {
  get: () => call<Settings>("get_settings"),
  save: (s: Settings) => call<Settings>("save_settings", { settings: s }),
};

export const templates = {
  list: () => call<TemplateInfo[]>("list_templates"),
};

export const library = {
  list: () => call<ProjectSummary[]>("list_projects"),
  get: (id: string) => call<ProjectSummary>("get_project", { id }),
  create: (input: NewProject) => call<ProjectSummary>("create_project", { input }),
  update: (id: string, update: ProjectMetaUpdate) => call<ProjectSummary>("update_project", { id, update }),
  archive: (id: string, archived: boolean) => call<ProjectSummary>("archive_project", { id, archived }),
  favorite: (id: string, favorite: boolean) => call<ProjectSummary>("update_project", { id, update: { favorite } }),
  remove: (id: string) => call<void>("delete_project", { id }),
  exportZip: (id: string, dest: string) => call<ExportResult>("export_project_zip", { id, dest }),
  exportPdf: (id: string, dest: string) => call<ExportResult>("export_project_pdf", { id, dest }),
};

export const files = {
  open: (id: string) => call<ProjectDetail>("open_project", { id }),
  tree: (id: string) => call<FileNode[]>("list_tree", { id }),
  read: (id: string, path: string) => call<FileContent>("read_file", { id, path }),
  readBytes: (id: string, path: string) => callBytes("read_file_bytes", { id, path }),
  write: (id: string, path: string, text: string) => call<FileStat>("write_file", { id, path, text }),
  createFile: (id: string, path: string, content?: string) => call<FileNode>("create_file", { id, path, content: content ?? null }),
  createFolder: (id: string, path: string) => call<FileNode>("create_folder", { id, path }),
  rename: (id: string, from: string, to: string) => call<FileNode>("rename_entry", { id, from, to }),
  remove: (id: string, path: string) => call<void>("delete_entry", { id, path }),
  import: (id: string, destDir: string, sources: string[]) => call<FileNode[]>("import_files", { id, destDir, sources }),
};

export const compile = {
  run: (id: string, engine?: EngineId) => call<CompileResult>("compile_project", { id, options: engine ? { engine } : null }),
  cancel: (id: string) => call<boolean>("cancel_compile", { id }),
  readPdf: (id: string) => callBytes("read_output_pdf", { id }),
  outputInfo: (id: string) => call<OutputInfo | null>("get_output_info", { id }),
  readLog: (id: string) => call<string>("read_output_log", { id }),
  cleanBuild: (id: string) => call<void>("clean_build", { id }),
};

export const versions = {
  list: (id: string) => call<VersionInfo[]>("list_versions", { id }),
  create: (id: string, name: string, note: string) => call<VersionInfo>("create_version", { id, name, note }),
  rename: (id: string, vid: string, name: string, note?: string) => call<VersionInfo>("rename_version", { id, vid, name, note: note ?? null }),
  remove: (id: string, vid: string) => call<void>("delete_version", { id, vid }),
  export: (id: string, vid: string, kind: "pdf" | "bundle", dest: string) => call<ExportResult>("export_version", { id, vid, kind, dest }),
  readPdf: (id: string, vid: string) => callBytes("read_version_pdf", { id, vid }),
  nextName: (id: string) => call<string>("next_version_name", { id }),
};

export * from "./types";
export { CohereError, isTauri } from "./client";
