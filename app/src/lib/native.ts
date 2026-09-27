/** Native dialogs and Finder integration via Tauri plugins (mocked in browser mode). */
import { open, save, ask } from "@tauri-apps/plugin-dialog";
import { openPath, revealItemInDir } from "@tauri-apps/plugin-opener";

export async function pickSavePath(defaultName: string, kind: "pdf" | "zip"): Promise<string | null> {
  const filters = kind === "pdf" ? [{ name: "PDF", extensions: ["pdf"] }] : [{ name: "Zip archive", extensions: ["zip"] }];
  const path = await save({ defaultPath: defaultName, filters, title: kind === "pdf" ? "Export PDF" : "Export project bundle" });
  return typeof path === "string" && path ? path : null;
}

export async function pickFiles(title = "Add files"): Promise<string[]> {
  const res = await open({ multiple: true, directory: false, title });
  if (!res) return [];
  return Array.isArray(res) ? res : [res];
}

export async function confirmNative(message: string, title = "Cohere"): Promise<boolean> {
  try {
    return await ask(message, { title, kind: "warning" });
  } catch {
    return window.confirm(message);
  }
}

export async function reveal(path: string): Promise<void> {
  try {
    await revealItemInDir(path);
  } catch (e) {
    console.warn("reveal failed", e);
  }
}

export async function openExternal(path: string): Promise<void> {
  try {
    await openPath(path);
  } catch (e) {
    console.warn("open failed", e);
  }
}
