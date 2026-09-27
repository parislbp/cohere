/**
 * Thin, typed `invoke` wrapper. Every backend call goes through here so errors are
 * normalised to `CohereError` and the mock backend can be swapped in for browser dev / e2e.
 */
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import type { AppErrorShape } from "./types";

export class CohereError extends Error {
  kind: string;
  constructor(kind: string, message: string) {
    super(message);
    this.name = "CohereError";
    this.kind = kind;
  }
}

function normalise(err: unknown): CohereError {
  if (err instanceof CohereError) return err;
  if (err && typeof err === "object" && "message" in err) {
    const e = err as Partial<AppErrorShape>;
    return new CohereError(e.kind ?? "other", String(e.message));
  }
  if (typeof err === "string") return new CohereError("other", err);
  return new CohereError("other", "Something went wrong");
}

export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return (await tauriInvoke<T>(command, args)) as T;
  } catch (err) {
    throw normalise(err);
  }
}

/** Commands that return raw bytes (`tauri::ipc::Response`). */
export async function callBytes(command: string, args?: Record<string, unknown>): Promise<Uint8Array> {
  try {
    const res = await tauriInvoke<ArrayBuffer | Uint8Array | number[]>(command, args);
    if (res instanceof Uint8Array) return res;
    if (res instanceof ArrayBuffer) return new Uint8Array(res);
    return new Uint8Array(res as number[]);
  } catch (err) {
    throw normalise(err);
  }
}

export const isTauri = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window && !import.meta.env.VITE_MOCK_BACKEND;
