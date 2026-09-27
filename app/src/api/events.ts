/** Backend → frontend events (compile progress). */
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { CompileLogEvent, CompileStatusEvent } from "./types";

export function onCompileLog(handler: (e: CompileLogEvent) => void): Promise<UnlistenFn> {
  return listen<CompileLogEvent>("compile:log", (ev) => handler(ev.payload));
}

export function onCompileStatus(handler: (e: CompileStatusEvent) => void): Promise<UnlistenFn> {
  return listen<CompileStatusEvent>("compile:status", (ev) => handler(ev.payload));
}
