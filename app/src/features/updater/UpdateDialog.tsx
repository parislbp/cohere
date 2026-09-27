/** "A new version is ready": release notes, one button to install and relaunch, one to wait. */
import { Button, Dialog } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useUpdaterStore } from "@/store/updater";
import { formatBytes } from "@/lib/format";
import { Notes } from "./Notes";
import "./updater.css";

export function UpdateDialog() {
  const { dialogOpen, status, check, progress, error, install, later } = useUpdaterStore();
  const busy = status === "downloading" || status === "installing" || status === "restarting";
  if (!check?.available && status !== "error") return null;

  const pct = progress?.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : null;
  const phaseLabel = status === "downloading" ? (pct !== null ? `downloading · ${pct}%` : `downloading · ${formatBytes(progress?.downloaded ?? 0)}`) : status === "installing" ? "verifying and installing…" : status === "restarting" ? "relaunching Cohere…" : null;

  return (
    <Dialog
      open={dialogOpen}
      onClose={busy ? () => {} : later}
      closeOnScrim={!busy}
      width="default"
      className="update"
      testId="update-dialog"
      title={
        <span className="row" style={{ gap: 8 }}>
          <Icon name="download" size={15} />
          Cohere {check?.version ?? ""} is ready
        </span>
      }
      footer={
        <>
          <span className="grow field__hint">
            {phaseLabel ?? (check ? `you have ${check.currentVersion}${check.date ? ` · released ${check.date.slice(0, 10)}` : ""}` : "")}
          </span>
          {!busy && (
            <Button variant="ghost" onClick={later} data-testid="update-later">
              later
            </Button>
          )}
          <Button variant="primary" icon="download" onClick={() => void install()} loading={busy} disabled={busy || status === "error"} data-testid="update-install">
            install and relaunch
          </Button>
        </>
      }
    >
      <div className="update__body">
        {status === "error" && (
          <div className="update__error">
            <Icon name="error" size={14} />
            <span>{error}</span>
          </div>
        )}
        {busy && (
          <div className="update__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
            <div className={["update__fill", pct === null && "is-indeterminate"].filter(Boolean).join(" ")} style={pct !== null ? { width: `${pct}%` } : undefined} />
          </div>
        )}
        <Notes text={check?.notes ?? ""} />
        <p className="update__fine">
          The download is verified against Cohere's signing key before anything is replaced. Your projects are untouched — they live in your data folder, not in the app.
        </p>
      </div>
    </Dialog>
  );
}
