/** Compile button + result chip (lives at the left of the PDF toolbar). */
import { Icon } from "@/components/icons";
import { Tooltip } from "@/components/ui";
import { formatDuration, plural } from "@/lib/format";
import { SHORTCUTS } from "@/lib/keys";
import { useProjectStore } from "@/store/project";
import { useSettingsStore } from "@/store/settings";

export function CompileCluster() {
  const status = useProjectStore((s) => s.compileStatus);
  const result = useProjectStore((s) => s.compileResult);
  const output = useProjectStore((s) => s.output);
  const compile = useProjectStore((s) => s.compile);
  const cancel = useProjectStore((s) => s.cancelCompile);
  const project = useProjectStore((s) => s.project);
  const engine = useSettingsStore((s) => s.settings.engine);
  const setUi = useSettingsStore((s) => s.setUi);
  const problemsOpen = useSettingsStore((s) => s.settings.ui.problemsOpen);
  const running = status === "running";

  return (
    <div className="compile">
      {running ? (
        <Tooltip content="Stop the running compile" side="bottom">
          <button className="compile__btn is-running" onClick={() => void cancel()} data-testid="compile-stop">
            <Icon name="stop" size={14} />
            <span>stop</span>
          </button>
        </Tooltip>
      ) : (
        <Tooltip content={`Compile ${project?.mainFile ?? "main.tex"} · ${project?.engine ?? engine}`} kbd={SHORTCUTS.compile} side="bottom">
          <button className="compile__btn" onClick={() => void compile()} data-testid="compile-button">
            <Icon name="compile" size={14} />
            <span>compile</span>
          </button>
        </Tooltip>
      )}
      {running ? (
        <span className="compile__status">
          <Icon name="spinner" size={12} className="ch-icon--spin" /> compiling…
        </span>
      ) : result ? (
        <Tooltip content={problemsOpen ? "Hide problems" : "Show problems"} kbd={SHORTCUTS.problems} hint={result.output?.pages != null ? `${plural(result.output.pages, "page")} · ${result.engine} · ${formatDuration(result.durationMs)}` : result.engine} side="bottom">
          <button
            className={["compile__status", result.status === "success" && "compile__status--ok", result.errorCount > 0 && "compile__status--err", result.errorCount === 0 && result.warningCount > 0 && "compile__status--warn"].filter(Boolean).join(" ")}
            onClick={() => setUi({ problemsOpen: !problemsOpen })}
            data-testid="compile-status"
          >
            <Icon name={result.errorCount > 0 ? "error" : result.warningCount > 0 ? "warning" : "success"} size={12} />
            {result.status === "cancelled" ? "cancelled" : result.errorCount > 0 ? `${plural(result.errorCount, "error")}${result.warningCount ? ` · ${result.warningCount} warn` : ""}` : result.warningCount > 0 ? `${plural(result.warningCount, "warning")}` : formatDuration(result.durationMs)}
          </button>
        </Tooltip>
      ) : output ? (
        <Tooltip content="Last build" hint={`${output.engine} · ${formatDuration(output.durationMs)}`} side="bottom">
          <span className="compile__engine">{project?.engine ?? engine}</span>
        </Tooltip>
      ) : null}
    </div>
  );
}
