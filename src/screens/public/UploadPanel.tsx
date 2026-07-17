import { useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { uploadFilesViaPublicLink } from "@/services/publicLinkService";
import { readKeyFragment } from "@/services/fileKeyService";
import { Spinner, ProgressBar } from "@/components/ui";
import { IconFile, IconUpload } from "@/components/Icons";

const MAX_FILE_SIZE = 750 * 1024 * 1024;
const UPLOAD_THROTTLE_KEY = "sts_last_upload_submit";
const UPLOAD_THROTTLE_MS = 5_000;

/** Casual-abuse deterrent only — the real gate is storage.rules' per-file
 * size cap and the anonymous-auth requirement (see storage.rules). */
function isThrottled(): boolean {
  const last = Number(window.localStorage.getItem(UPLOAD_THROTTLE_KEY) ?? "0");
  return Date.now() - last < UPLOAD_THROTTLE_MS;
}

/**
 * Shared dropzone/file-list/upload UI, used by both the standalone customer
 * upload page (PublicCustomerUploadScreen) and the "Dateien hochladen" tab
 * on the master review portal (PublicMasterShareScreen) — same tested
 * validation + progress logic in one place instead of duplicated twice.
 */
export function UploadPanel({ projectId, ownerId }: { projectId: string; ownerId: string }) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const totalSizeLabel = useMemo(() => {
    const totalBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes < 1024) return `${totalBytes} B`;
    if (totalBytes < 1024 * 1024) return `${(totalBytes / 1024).toFixed(1)} KB`;
    if (totalBytes < 1024 * 1024 * 1024) {
      return `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(totalBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }, [selectedFiles]);

  const acceptFiles = (files: File[]) => {
    const accepted: File[] = [];
    const rejections: string[] = [];
    for (const file of files) {
      if (file.size === 0) {
        rejections.push(`„${file.name}" ist leer und wurde nicht hinzugefuegt.`);
      } else if (file.size > MAX_FILE_SIZE) {
        rejections.push(`„${file.name}" ist zu gross (max. 750 MB) und wurde nicht hinzugefuegt.`);
      } else {
        accepted.push(file);
      }
    }
    setSelectedFiles(accepted);
    setSuccessMessage(null);
    setError(rejections.length > 0 ? rejections.join(" ") : null);
  };

  const onSelectFiles = (event: ChangeEvent<HTMLInputElement>) => {
    acceptFiles(Array.from(event.target.files ?? []));
  };

  const onDropFiles = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragActive(false);
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length === 0) return;
    acceptFiles(files);
  };

  const onUpload = async () => {
    if (selectedFiles.length === 0) return;
    if (isThrottled()) {
      setError("Bitte warte kurz, bevor du erneut hochlaedst.");
      return;
    }
    setUploading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      window.localStorage.setItem(UPLOAD_THROTTLE_KEY, String(Date.now()));
      const prepared = await Promise.all(
        selectedFiles.map(async (file) => ({
          name: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
        }))
      );

      await uploadFilesViaPublicLink({
        projectId,
        ownerId,
        files: prepared,
        encryptKey: readKeyFragment(),
        onProgress: (fileIndex, fileProgress) => {
          const aggregate = (fileIndex + fileProgress) / prepared.length;
          setProgress(Math.round(aggregate * 100));
        },
      });

      setSelectedFiles([]);
      setProgress(100);
      setSuccessMessage(
        `${prepared.length} Datei${prepared.length === 1 ? "" : "en"} erfolgreich hochgeladen.`
      );
    } catch (e) {
      setError(
        (e as Error).message || "Der Upload ist fehlgeschlagen. Bitte spaeter erneut versuchen."
      );
    } finally {
      setUploading(false);
      window.setTimeout(() => setProgress(null), 1000);
    }
  };

  return (
    <>
      {error && <div className="public-link-alert">{error}</div>}
      {successMessage && <div className="public-link-success">{successMessage}</div>}

      <label
        className="public-link-dropzone"
        style={
          dragActive
            ? {
                borderColor: "rgb(152 122 255 / 0.78)",
                boxShadow: "0 0 0 4px rgb(126 95 255 / 0.12)",
              }
            : undefined
        }
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDropFiles}
      >
        <input hidden type="file" multiple onChange={onSelectFiles} />
        <div className="public-link-empty-icon" style={{ marginBottom: 12 }}>
          <IconUpload />
        </div>
        <div className="public-link-panel-title" style={{ fontSize: "1.05rem" }}>
          Dateien ziehen oder auswaehlen
        </div>
        <div className="public-link-panel-copy" style={{ marginTop: 8 }}>
          Klicke in diese Flaeche oder ziehe mehrere Dateien direkt hier hinein.
        </div>
      </label>

      {selectedFiles.length > 0 ? (
        <div className="public-link-preview">
          <div className="public-link-panel-header" style={{ marginBottom: 14 }}>
            <div>
              <div className="public-link-panel-title" style={{ fontSize: "1.05rem" }}>
                Ausgewaehlte Dateien
              </div>
              <div className="public-link-panel-copy">
                {selectedFiles.length} Datei(en) · Gesamtgroesse {totalSizeLabel}
              </div>
            </div>
          </div>

          <div className="public-link-file-list">
            {selectedFiles.map((file) => (
              <div key={`${file.name}-${file.size}`} className="public-link-file-row">
                <span>{file.name}</span>
                <span>{Math.max(1, Math.round(file.size / 1024))} KB</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="public-link-empty">
          <div>
            <div className="public-link-empty-icon">
              <IconFile />
            </div>
            <h2>Noch keine Dateien ausgewaehlt</h2>
            <div className="public-link-panel-copy" style={{ marginTop: 10 }}>
              Waehle Dateien aus oder ziehe sie in den Upload-Bereich.
            </div>
          </div>
        </div>
      )}

      {progress !== null && (
        <div>
          <ProgressBar value={progress / 100} />
          <div className="public-link-panel-copy" style={{ marginTop: 6 }}>
            {progress}%
          </div>
        </div>
      )}

      <div className="public-link-actions">
        <button
          className="public-link-button"
          disabled={uploading || selectedFiles.length === 0}
          onClick={() => void onUpload()}
        >
          {uploading ? <Spinner /> : <IconUpload />}
          Dateien hochladen
        </button>
      </div>
    </>
  );
}
