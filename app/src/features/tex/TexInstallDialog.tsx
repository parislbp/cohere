/**
 * "Install TeX for Cohere": a private TeX Live in the data folder holding only what the templates
 * need. Four steps with live progress, a collapsible log, cancel at any point.
 */
import { useEffect, useRef, useState } from "react";
import { Button, Dialog } from "@/components/ui";
import { Icon } from "@/components/icons";
import { PHASES, useTexInstallStore } from "@/store/texInstall";
import type { TexInstallPhase } from "@/api/types";
import "@/features/updater/updater.css";

const ORDER: TexInstallPhase[] = ["download", "install", "packages", "verify"];

export function TexInstallDialog() {
  const { open, running, phase, progress, line, log, error, binDir, closeDialog, start, cancel, reset } = useTexInstallStore();
  const [showLog, setShowLog] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (showLog) logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [log, showLog]);

  const idx = phase ? ORDER.indexOf(phase) : -1;
  const finished = phase === "done";
  const failed = phase === "error" || phase === "cancelled";
  const idle = !running && !finished && !failed;

  return (
    <Dialog
      open={open}
      onClose={closeDialog}
      closeOnScrim={!running}
      width="default"
      className="texi"
      testId="tex-install-dialog"
      title={
        <span className="row" style={{ gap: 8 }}>
          <Icon name="download" size={15} />
          Install TeX for Cohere
        </span>
      }
      footer={
        <>
          <span className="grow field__hint">{running ? "you can close this window — the install keeps going" : finished ? "Settings › Compiler shows the new installation" : "about 400 MB · a few minutes · network needed once"}</span>
          {running ? (
            <Button variant="ghost" icon="stop" onClick={() => void cancel()} data-testid="tex-install-cancel">
              cancel
            </Button>
          ) : (
            <Button variant="ghost" onClick={closeDialog}>
              {finished ? "done" : "close"}
            </Button>
          )}
          {idle && (
            <Button variant="primary" icon="download" onClick={() => void start()} data-testid="tex-install-start">
              install
            </Button>
          )}
          {failed && (
            <Button
              variant="primary"
              icon="refresh"
              onClick={() => {
                reset();
                void start();
              }}
            >
              try again
            </Button>
          )}
        </>
      }
    >
      <div className="update__body">
        {idle && (
          <>
            <p className="texi__intro">
              Cohere compiles with <code>latexmk</code> and the TeX engines. None were found on this Mac, so Cohere can install its own copy: TeX Live's basic scheme plus the packages the built-in templates use — nothing else, and nothing outside Cohere's data folder.
            </p>
            <p className="texi__intro">Prefer the full distribution? Install MacTeX and press re-detect instead; Cohere will find it.</p>
          </>
        )}
        <div className="texi__steps" aria-label="Steps">
          {PHASES.map((p, i) => {
            const done = finished || i < idx;
            const active = running && i === idx;
            return (
              <div key={p.id} className={["texi__step", done && "is-done", active && "is-active"].filter(Boolean).join(" ")} title={p.hint} data-testid={`tex-step-${p.id}`} data-state={done ? "done" : active ? "active" : "pending"}>
                <span className="caps">{p.label}</span>
                <div className="texi__bar">
                  <div className="texi__fill" style={{ width: `${Math.round((active ? progress ?? 0 : done ? 1 : 0) * 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        {(running || failed) && <div className="texi__line">{line ?? "…"}</div>}
        {finished && (
          <div className="texi__result" data-testid="tex-install-done">
            <Icon name="success" size={14} />
            <span>
              TeX for Cohere is ready at <span className="mono">{binDir}</span>. Compile away.
            </span>
          </div>
        )}
        {failed && (
          <div className="texi__result is-error">
            <Icon name={phase === "cancelled" ? "info" : "error"} size={14} />
            <span>{phase === "cancelled" ? "Installation cancelled — the partial files were removed." : error ?? "The installation failed."}</span>
          </div>
        )}
        {log.length > 0 && (
          <div>
            <Button size="sm" variant="ghost" icon={showLog ? "chevronDown" : "chevronRight"} onClick={() => setShowLog((v) => !v)}>
              {showLog ? "hide log" : `show log · ${log.length} lines`}
            </Button>
            {showLog && (
              <pre className="texi__log" ref={logRef}>
                {log.join("\n")}
              </pre>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}
