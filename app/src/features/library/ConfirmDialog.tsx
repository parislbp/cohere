import type { ReactNode } from "react";
import { Button, Dialog } from "@/components/ui";

export function ConfirmDialog({ open, onClose, onConfirm, title, body, confirmLabel = "confirm", danger = false }: { open: boolean; onClose: () => void; onConfirm: () => void | Promise<void>; title: ReactNode; body?: ReactNode; confirmLabel?: string; danger?: boolean }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      width="narrow"
      onSubmit={() => void onConfirm()}
      testId="confirm-dialog"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} data-autofocus>
            cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={() => void onConfirm()} data-testid="confirm-yes">
            {confirmLabel}
          </Button>
        </>
      }
    >
      {body && <p className="dim" style={{ fontSize: "var(--text-sm)", lineHeight: 1.5 }}>{body}</p>}
    </Dialog>
  );
}
