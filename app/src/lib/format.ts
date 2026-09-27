/** Formatting helpers: dates as DD MM YYYY, byte sizes, relative times, durations. */

const pad2 = (n: number) => String(n).padStart(2, "0");

export function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** `21 09 2026` — the Library's modified column. */
export function formatDayMonthYear(value: string | Date | null | undefined): string {
  const d = parseDate(value);
  if (!d) return "—";
  return `${pad2(d.getDate())} ${pad2(d.getMonth() + 1)} ${d.getFullYear()}`;
}

/** `21 Sep 2026, 14:03` — tooltips and detail rows. */
export function formatDateTime(value: string | Date | null | undefined): string {
  const d = parseDate(value);
  if (!d) return "—";
  const month = d.toLocaleString("en-GB", { month: "short" });
  return `${d.getDate()} ${month} ${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** `just now`, `4 min ago`, `3 h ago`, `yesterday`, `6 days ago`, else DD MM YYYY. */
export function formatRelative(value: string | Date | null | undefined, now: Date = new Date()): string {
  const d = parseDate(value);
  if (!d) return "—";
  const diff = Math.max(0, now.getTime() - d.getTime());
  const s = Math.round(diff / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  return formatDayMonthYear(d);
}

/** Whole calendar days between `value` and `now`: `today`, `1 day ago`, `12 days ago`. */
export function formatDaysAgo(value: string | Date | null | undefined, now: Date = new Date()): string {
  const d = parseDate(value);
  if (!d) return "—";
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.max(0, Math.round((start(now) - start(d)) / 86_400_000));
  if (days === 0) return "today";
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s - m * 60)} s`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function basename(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] ?? path;
}

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? "" : path.slice(0, i);
}

export function extname(name: string): string {
  const base = basename(name);
  const i = base.lastIndexOf(".");
  return i <= 0 ? "" : base.slice(i + 1).toLowerCase();
}

export function joinPath(dir: string, name: string): string {
  return dir ? `${dir.replace(/\/+$/, "")}/${name}` : name;
}

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
