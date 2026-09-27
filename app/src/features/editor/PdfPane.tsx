/** PDF column: toolbar (pages, zoom, fit, export) over the headless viewer, with state overlays. */
import { useCallback, useRef, useState } from "react";
import * as api from "@/api";
import { Icon } from "@/components/icons";
import { EmptyState, IconButton, Tooltip } from "@/components/ui";
import { plural, slugify } from "@/lib/format";
import { pickSavePath, reveal } from "@/lib/native";
import { useProjectStore } from "@/store/project";
import { useSettingsStore } from "@/store/settings";
import { errorMessage, toast } from "@/store/ui";
import { PdfViewer } from "./pdf/PdfViewer";
import type { PdfViewerHandle, PdfViewerState, PdfZoom } from "./pdf/types";
import { CompileCluster } from "./CompileCluster";

function parseZoom(s: string): PdfZoom {
  if (s === "width" || s === "page") return s;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : "width";
}

export function PdfPane() {
  const pdfData = useProjectStore((s) => s.pdfData);
  const output = useProjectStore((s) => s.output);
  const compileStatus = useProjectStore((s) => s.compileStatus);
  const result = useProjectStore((s) => s.compileResult);
  const project = useProjectStore((s) => s.project);
  const zoomSetting = useSettingsStore((s) => s.settings.ui.pdfZoom);
  const setUi = useSettingsStore((s) => s.setUi);
  const viewer = useRef<PdfViewerHandle>(null);
  const [state, setState] = useState<PdfViewerState>({ page: 0, pageCount: 0, scale: 1, zoom: "width", loading: false, error: null });
  const [pageInput, setPageInput] = useState<string | null>(null);
  const zoom = parseZoom(zoomSetting);
  const onState = useCallback((s: PdfViewerState) => setState(s), []);
  const setZoom = (z: PdfZoom) => setUi({ pdfZoom: String(z) });

  const exportPdf = async () => {
    if (!project || !output) return;
    const dest = await pickSavePath(`${slugify(project.title)}.pdf`, "pdf");
    if (!dest) return;
    try {
      const r = await api.library.exportPdf(project.id, dest);
      toast("PDF exported", "ok", { action: { label: "Reveal", run: () => void reveal(r.path) } });
    } catch (e) {
      toast(errorMessage(e), "err");
    }
  };

  const zoomLabel = zoom === "width" ? "fit" : zoom === "page" ? "page" : `${Math.round(state.scale * 100)}%`;

  return (
    <div className="pdfpane">
      <div className="pdfbar">
        <div className="pdfbar__left">
          <CompileCluster />
        </div>
        <div className="pdfbar__pages">
          <IconButton icon="chevronUp" label="Previous page" size="sm" disabled={state.page <= 1} onClick={() => viewer.current?.goToPage(state.page - 1)} />
          <Tooltip content="Page — type a number and press Enter">
            <input
              aria-label="Page"
              value={pageInput ?? (state.page || "")}
              onChange={(e) => setPageInput(e.target.value)}
              onBlur={() => setPageInput(null)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const n = parseInt(pageInput ?? "", 10);
                  if (n) viewer.current?.goToPage(n);
                  setPageInput(null);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              disabled={!state.pageCount}
            />
          </Tooltip>
          <span className="pdfbar__of">/ {state.pageCount || "–"}</span>
          <IconButton icon="chevronDown" label="Next page" size="sm" disabled={!state.pageCount || state.page >= state.pageCount} onClick={() => viewer.current?.goToPage(state.page + 1)} />
        </div>
        <div className="pdfbar__right">
        <IconButton icon="zoomOut" label="Zoom out" kbd="Mod--" size="sm" disabled={!pdfData} onClick={() => viewer.current?.zoomOut()} />
        <Tooltip content="Current zoom — click for 100%">
          <button className="pdfbar__zoom" onClick={() => setZoom(100)} disabled={!pdfData}>
            {zoomLabel}
          </button>
        </Tooltip>
        <IconButton icon="zoomIn" label="Zoom in" kbd="Mod-=" size="sm" disabled={!pdfData} onClick={() => viewer.current?.zoomIn()} />
        <IconButton icon="fitWidth" label="Fit width" size="sm" on={zoom === "width"} disabled={!pdfData} onClick={() => setZoom("width")} />
        <IconButton icon="fitPage" label="Fit page" size="sm" on={zoom === "page"} disabled={!pdfData} onClick={() => setZoom("page")} />
        <span className="hair-v" style={{ height: 16, margin: "0 4px" }} />
        <IconButton icon="export" label="Export PDF" size="sm" disabled={!output} onClick={exportPdf} />
        </div>
      </div>
      <div className="pdfpane__body">
        {compileStatus === "running" && <div className="pdfpane__compiling" aria-hidden />}
        <PdfViewer ref={viewer} data={pdfData} zoom={zoom} onZoomChange={setZoom} onState={onState} />
        {!pdfData && (
          <div className="pdfpane__overlay">
            {compileStatus === "running" ? (
              <EmptyState icon="pdf" title="Compiling…">
                the PDF appears here when latexmk finishes
              </EmptyState>
            ) : compileStatus === "failed" ? (
              <EmptyState icon="error" title="No PDF was produced">
                {result ? `${plural(result.errorCount, "error")} — open problems for details` : "check the compile log"}
              </EmptyState>
            ) : (
              <EmptyState icon="pdf" title="No PDF yet">
                compile to see the document here
              </EmptyState>
            )}
          </div>
        )}
        {pdfData && result && result.errorCount > 0 && compileStatus !== "running" && (
          <div className="pdfpane__banner pdfpane__banner--err">
            <Icon name="warning" size={13} />
            {result.pdfUpdated ? `built with ${plural(result.errorCount, "error")}` : `showing the previous PDF — ${plural(result.errorCount, "error")}`}
          </div>
        )}
        {state.error && (
          <div className="pdfpane__banner pdfpane__banner--err">
            <Icon name="error" size={13} />
            {state.error}
          </div>
        )}
      </div>
    </div>
  );
}
