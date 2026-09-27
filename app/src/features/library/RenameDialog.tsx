import { useEffect, useState } from "react";
import type { ProjectSummary } from "@/api/types";
import { Button, Dialog, Field, TextInput } from "@/components/ui";
import { useLibraryStore } from "@/store/library";
import { errorMessage, toast } from "@/store/ui";

export function RenameDialog({ project, onClose }: { project: ProjectSummary | null; onClose: () => void }) {
  const rename = useLibraryStore((s) => s.rename);
  const [title, setTitle] = useState("");
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setTitle(project.title);
      setTopic(project.topic ?? "");
      setError(null);
    }
  }, [project]);

  const submit = async () => {
    if (!project) return;
    const t = title.trim();
    if (!t) {
      setError("A title is required");
      return;
    }
    setBusy(true);
    try {
      await rename(project.id, t, topic.trim() || null);
      toast("Saved", "ok");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={!!project}
      onClose={onClose}
      title="Rename"
      width="narrow"
      onSubmit={submit}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={busy}>
            save
          </Button>
        </>
      }
    >
      <Field label="Title" error={error}>
        <TextInput line data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} onFocus={(e) => e.target.select()} />
      </Field>
      <Field label="Topic" info="Optional. Clear it to remove the topic.">
        <TextInput line value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="optional" />
      </Field>
    </Dialog>
  );
}
