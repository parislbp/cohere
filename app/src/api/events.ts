/** Backend → frontend events (compile progress, update download, TeX install). */
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { CompileLogEvent, CompileStatusEvent, TexInstallEvent, UpdateProgress } from "./types";

export function onCompileLog(handler: (e: CompileLogEvent) => void): Promise<UnlistenFn> {
  return listen<CompileLogEvent>("compile:log", (ev) => handler(ev.payload));
}

export function onCompileStatus(handler: (e: CompileStatusEvent) => void): Promise<UnlistenFn> {
  return listen<CompileStatusEvent>("compile:status", (ev) => handler(ev.payload));
}

export function onUpdateProgress(handler: (e: UpdateProgress) => void): Promise<UnlistenFn> {
  return listen<UpdateProgress>("update:progress", (ev) => handler(ev.payload));
}

export function onTexInstall(handler: (e: TexInstallEvent) => void): Promise<UnlistenFn> {
  return listen<TexInstallEvent>("tex-install:event", (ev) => handler(ev.payload));
}
