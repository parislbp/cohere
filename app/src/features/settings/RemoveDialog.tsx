/** Settings › About › Remove Cohere… — export everything first (optional), then move it all to the Trash and quit. */
import { useEffect, useState } from "react";
import * as api from "@/api";
import type { Footprint, RemovalReport } from "@/api/types";
import { Button, Checkbox, Dialog } from "@/components/ui";
import { Icon } from "@/components/icons";
import { formatBytes, plural } from "@/lib/format";
import { pickFolder } from "@/lib/native";
import { errorMessage } from "@/store/ui";
import "@/features/updater/updater.css";

export function RemoveDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [fp, setFp] = useState<Footprint | null>(null);
  const [doExport, setDoExport] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<RemovalReport | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setReport(null);
    api.app
      .footprint()
      .then(setFp)
      .catch((e) => setError(errorMessage(e)));
  }, [open]);

  const run = async () => {
    setError(null);
    let dir: string | null = null;
    if (doExport && (fp?.projects ?? 0) > 0) {
      dir = await pickFolder("Where should the project bundles go?");
      if (!dir) return;
    }
    setBusy(true);
    try {
      const r = await api.app.remove(dir);
      setReport(r);
      if (r.skipped.length) setError(`Some items could not be moved:\n${r.skipped.join("\n")}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const total = (fp?.dataBytes ?? 0);
  return (
    <Dialog
      open={open}
      onClose={busy ? () => {} : onClose}
      closeOnScrim={!busy}
      width="default"
      testId="remove-dialog"
      title={
        <span className="row" style={{ gap: 8 }}>
          <Icon name="trash" size={15} />
          Remove Cohere
        </span>
      }
      footer={
        <>
          <span className="grow field__hint">{report && !report.skipped.length ? "quitting…" : "everything goes to the Trash — nothing is deleted outright"}</span>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            keep Cohere
          </Button>
          <Button variant="danger" icon="trash" onClick={() => void run()} loading={busy} disabled={!fp || !!report} data-testid="remove-confirm">
            {doExport && (fp?.projects ?? 0) > 0 ? "export, then remove" : "remove"}
          </Button>
        </>
      }
    >
      <div className="update__body">
        {error && (
          <div className="update__error">
            <Icon name="error" size={14} />
            <span style={{ whiteSpace: "pre-wrap" }}>{error}</span>
          </div>
        )}
        {fp && (
          <>
            <ul className="remove__list">
              <li>
                <span>
                  {plural(fp.projects, "project")} and their versions
                </span>
                <span className="mono truncate" title={fp.dataDir}>
                  {fp.dataDir}
                </span>
                <span className="remove__size">{formatBytes(total - fp.texBytes)}</span>
              </li>
              {fp.texBytes > 0 && (
                <li>
                  <span>TeX for Cohere</span>
                  <span className="mono">texlive/</span>
                  <span className="remove__size">{formatBytes(fp.texBytes)}</span>
                </li>
              )}
              {fp.libraryDirs.map((d) => (
                <li key={d}>
                  <span>system files</span>
                  <span className="mono truncate" title={d}>
                    {d.replace(/^\/Users\/[^/]+/, "~")}
                  </span>
                </li>
              ))}
              <li>
                <span>the app</span>
                <span className="mono truncate">{fp.appBundle ?? "not installed as a bundle (development run) — skipped"}</span>
              </li>
            </ul>
            {fp.projects > 0 && <Checkbox checked={doExport} onChange={setDoExport} label={`Export ${plural(fp.projects, "project")} as zip bundles first`} />}
          </>
        )}
        {report && (
          <div className="texi__result">
            <Icon name="success" size={14} />
            <span>
              {report.exported ? `${plural(report.exported, "bundle")} exported · ` : ""}
              {plural(report.trashed.length, "item")} moved to the Trash.
            </span>
          </div>
        )}
      </div>
    </Dialog>
  );
}
