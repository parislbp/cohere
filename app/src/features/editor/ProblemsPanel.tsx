/** Problems drawer: diagnostics grouped by severity (click → jump), plus the raw latexmk output. */
import { useMemo, useState } from "react";
import type { Diagnostic, Severity } from "@/api/types";
import { Icon, type IconName } from "@/components/icons";
import { EmptyState, IconButton, Segmented, Tooltip } from "@/components/ui";
import { useProjectStore } from "@/store/project";

const SEV_ICON: Record<Severity, IconName> = { error: "error", warning: "warning", info: "info" };
const ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function ProblemsPanel({ height, onClose }: { height: number; onClose: () => void }) {
  const diagnostics = useProjectStore((s) => s.diagnostics);
  const log = useProjectStore((s) => s.compileLog);
  const status = useProjectStore((s) => s.compileStatus);
  const result = useProjectStore((s) => s.compileResult);
  const jumpTo = useProjectStore((s) => s.jumpTo);
  const [tab, setTab] = useState<"problems" | "log">("problems");
  const [filter, setFilter] = useState<Severity | "all">("all");

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
    for (const d of diagnostics) c[d.severity]++;
    return c;
  }, [diagnostics]);

  const shown = useMemo(() => diagnostics.filter((d) => filter === "all" || d.severity === filter).slice().sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || (a.file ?? "").localeCompare(b.file ?? "") || (a.line ?? 0) - (b.line ?? 0)), [diagnostics, filter]);

  return (
    <div className="problems" style={{ ["--problems-h" as string]: `${height}px` }} data-testid="problems-panel">
      <div className="problems__head">
        <Segmented
          size="sm"
          ariaLabel="Problems or log"
          value={tab}
          onChange={setTab}
          options={[
            { id: "problems", label: `problems${diagnostics.length ? ` · ${diagnostics.length}` : ""}` },
            { id: "log", label: "log" },
          ]}
        />
        <span className="grow" />
        {tab === "problems" && (
          <Segmented
            size="sm"
            ariaLabel="Filter by severity"
            value={filter}
            onChange={setFilter}
            options={[
              { id: "all", label: "all" },
              { id: "error", label: String(counts.error), icon: "error", tip: "errors", ariaLabel: `Errors (${counts.error})` },
              { id: "warning", label: String(counts.warning), icon: "warning", tip: "warnings", ariaLabel: `Warnings (${counts.warning})` },
              { id: "info", label: String(counts.info), icon: "info", tip: "boxes and notes", ariaLabel: `Notes (${counts.info})` },
            ]}
          />
        )}
        <IconButton icon="close" label="Hide" kbd="Mod-Shift-m" size="sm" onClick={onClose} />
      </div>
      <div className="problems__body">
        {tab === "log" ? (
          <pre className="log">
            {log.length === 0 ? (status === "idle" ? "Compile to see latexmk's output here." : "…") : log.map((l, i) => <div key={i} className={l.startsWith("$ ") ? "log__line--cmd" : /error|Emergency stop|Fatal/i.test(l) ? "log__line--err" : undefined}>{l}</div>)}
            {result && <div className="muted">{`\n— ${result.status} in ${(result.durationMs / 1000).toFixed(1)} s (exit ${result.exitCode ?? "?"})`}</div>}
          </pre>
        ) : shown.length === 0 ? (
          <EmptyState icon={status === "idle" ? "compile" : "success"} title={status === "idle" ? "Not compiled yet" : diagnostics.length ? "Nothing at this level" : "No problems"}>
            {status === "idle" ? "⌘⇧↩ compiles the main file." : ""}
          </EmptyState>
        ) : (
          shown.map((d, i) => <ProblemRow key={i} d={d} onJump={() => d.file && d.line && void jumpTo(d.file, d.line)} />)
        )}
      </div>
    </div>
  );
}

function ProblemRow({ d, onJump }: { d: Diagnostic; onJump: () => void }) {
  const canJump = !!(d.file && d.line);
  return (
    <Tooltip content={canJump ? "Jump to the line" : d.file ? "No line number for this one" : `${d.source} — not tied to a file`} display="block" side="top">
      <button className={`prob prob--${d.severity}`} onClick={onJump} disabled={!canJump} data-testid={`problem-${d.severity}`}>
        <Icon name={SEV_ICON[d.severity]} size={13} />
        <span className="prob__loc">{d.file ? `${d.file}${d.line ? `:${d.line}` : ""}` : d.source}</span>
        <span className="prob__msg">{d.message}</span>
        {d.detail && <span className="prob__detail">{d.detail}</span>}
      </button>
    </Tooltip>
  );
}
