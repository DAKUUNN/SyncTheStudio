import { useState } from "react";
import { useAuth } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import type { ProjectModel } from "@/models/types";
import { exportProjectAsFolder } from "@/services/exportService";
import { updateProjectStatus, addHistoryEntry, removeAttachment } from "@/services/projectService";
import { deleteAttachmentByUrl } from "@/services/storageService";
import { getMastersOnce, deleteMasterVersion } from "@/services/masterService";
import { COMPLETED_STATUS_ID } from "@/services/customizationService";
import { Modal, Spinner } from "@/components/ui";
import { IconCheckCircle } from "@/components/Icons";

/** "Sauber wegheften": full folder export, then status → Abgeschlossen,
 *  optionally deleting the cloud copies of attachments and masters to
 *  free up storage. Deletion only runs after a successful export, so
 *  nothing is lost if the user cancels the folder picker. */
export function ArchiveProjectModal({
  project,
  onDone,
  onClose,
}: {
  project: ProjectModel;
  onDone: () => Promise<void>;
  onClose: () => void;
}) {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { t } = useI18n();

  const [deleteCloudFiles, setDeleteCloudFiles] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);

  const onArchive = async () => {
    if (!currentUser) return;
    setBusy(true);
    try {
      const folder = await exportProjectAsFolder({
        userId: currentUser.id,
        project,
        includeAttachments: true,
        includeMasters: true,
        onProgress: setProgressLabel,
      });
      if (!folder) {
        // user cancelled the folder picker — abort without touching anything
        setBusy(false);
        setProgressLabel(null);
        return;
      }

      let cleanupFailures = 0;
      if (deleteCloudFiles) {
        setProgressLabel(t("archive.deletingCloud"));
        for (const url of project.attachments) {
          try {
            await removeAttachment(currentUser.id, project.id, url);
            await deleteAttachmentByUrl(url);
          } catch {
            cleanupFailures++;
          }
        }
        for (const master of await getMastersOnce(project.id)) {
          try {
            await deleteMasterVersion(project.id, master.id);
          } catch {
            cleanupFailures++;
          }
        }
      }

      await updateProjectStatus(currentUser.id, project.id, COMPLETED_STATUS_ID);
      await addHistoryEntry(
        project.id,
        currentUser.id,
        currentUser.username,
        `Projekt archiviert (Export: ${folder})`
      );

      showToast(
        cleanupFailures > 0
          ? t("archive.doneWithFailures", { count: cleanupFailures })
          : t("archive.done"),
        cleanupFailures > 0 ? "warning" : "success"
      );
      onClose();
      await onDone();
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusy(false);
      setProgressLabel(null);
    }
  };

  return (
    <Modal
      title={t("archive.title")}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button className="btn btn-secondary" disabled={busy} onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => void onArchive()}>
            {busy ? <Spinner /> : <IconCheckCircle />}
            {t("archive.start")}
          </button>
        </>
      }
    >
      <p className="text-small text-muted" style={{ marginBottom: 12 }}>
        {t("archive.description")}
      </p>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={deleteCloudFiles}
          disabled={busy}
          onChange={(e) => setDeleteCloudFiles(e.target.checked)}
        />
        <span className="text-small">{t("archive.deleteCloudOption")}</span>
      </label>
      {deleteCloudFiles && (
        <div className="text-xs" style={{ color: "var(--danger)", marginTop: 6 }}>
          {t("archive.deleteCloudWarning")}
        </div>
      )}
      {busy && progressLabel && (
        <div className="text-xs text-muted" style={{ marginTop: 12 }}>
          {progressLabel}
        </div>
      )}
    </Modal>
  );
}
