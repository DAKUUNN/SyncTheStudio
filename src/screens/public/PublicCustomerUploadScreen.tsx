import { useEffect, useMemo, useState, type ChangeEvent, type DragEvent } from "react";
import { getPublicLinkToken } from "@/lib/publicLinkUrl";
import {
  getPublicCustomerUploadByToken,
  uploadFilesViaPublicLink,
  verifyPublicLinkPassword,
  type PublicCustomerUploadAccess,
} from "@/services/publicLinkService";
import { Spinner, ProgressBar } from "@/components/ui";
import { IconFile, IconLink, IconLock, IconUpload } from "@/components/Icons";

const MAX_FILE_SIZE = 750 * 1024 * 1024;

export function PublicCustomerUploadScreen() {
  const [linkData, setLinkData] = useState<PublicCustomerUploadAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [accessGranted, setAccessGranted] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    const token = getPublicLinkToken();
    if (!token) {
      setError("Dieser Link ist ungueltig.");
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const nextLink = await getPublicCustomerUploadByToken(token);
        if (!nextLink) {
          setError("Dieser Link wurde nicht gefunden.");
          return;
        }
        if (!nextLink.isActive) {
          setError("Dieser Upload-Link ist deaktiviert.");
          return;
        }
        setLinkData(nextLink);
        if (!nextLink.hasPassword) {
          setAccessGranted(true);
        }
      } catch (e) {
        setError((e as Error).message || "Der Upload-Link konnte nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalSizeLabel = useMemo(() => {
    const totalBytes = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    if (totalBytes < 1024) return `${totalBytes} B`;
    if (totalBytes < 1024 * 1024) return `${(totalBytes / 1024).toFixed(1)} KB`;
    if (totalBytes < 1024 * 1024 * 1024) {
      return `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
    }
    return `${(totalBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }, [selectedFiles]);

  const onUnlock = async () => {
    if (!linkData) return;
    setVerifying(true);
    setError(null);
    try {
      const matches = await verifyPublicLinkPassword({
        password,
        passwordHash: linkData.passwordHash,
        passwordSalt: linkData.passwordSalt,
      });
      if (!matches) {
        setError("Das Passwort ist nicht korrekt.");
        return;
      }
      setAccessGranted(true);
      setPassword("");
    } finally {
      setVerifying(false);
    }
  };

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
    if (!linkData || selectedFiles.length === 0) return;
    setUploading(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const prepared = await Promise.all(
        selectedFiles.map(async (file) => ({
          name: file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
        }))
      );

      await uploadFilesViaPublicLink({
        projectId: linkData.projectId,
        ownerId: linkData.ownerId,
        files: prepared,
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

  const heading = linkData
    ? `${linkData.customerName || "Kunde"} – ${linkData.projectName} STEMS Upload`
    : "STEMS Upload";

  return (
    <div className="public-link-page">
      <div className="public-link-wrap">
        <div className="public-link-shell">
          <section className="public-link-panel">
            <div className="public-link-brand-row">
              <img src="/logo.png" alt="" />
              <span>SyncTheStudio</span>
            </div>

            {loading ? (
              <div className="public-link-loading">
                <div>
                  <Spinner large />
                  <div style={{ marginTop: 14 }}>Wird geladen…</div>
                </div>
              </div>
            ) : error && !linkData ? (
              <div className="public-link-empty">
                <div>
                  <div className="public-link-empty-icon">
                    <IconLink />
                  </div>
                  <h2>Link nicht verfuegbar</h2>
                  <div className="public-link-panel-copy" style={{ marginTop: 10 }}>
                    {error}
                  </div>
                </div>
              </div>
            ) : linkData ? (
              <>
                <h1 className="public-link-title">{heading}</h1>

                <div className="public-link-stack" style={{ marginTop: 20 }}>
                  {linkData.hasPassword && !accessGranted && (
                    <div className="public-link-gate">
                      <div className="public-link-panel-title" style={{ fontSize: "1.05rem", marginBottom: 8 }}>
                        Passwort entsperren
                      </div>
                      <div className="public-link-panel-copy" style={{ marginBottom: 14 }}>
                        Dieser Upload-Link ist geschuetzt. Gib zuerst das vergebene Passwort ein.
                      </div>
                      <label className="public-link-label">Passwort</label>
                      <input
                        className="public-link-input"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void onUnlock();
                        }}
                      />
                      {error && <div className="public-link-alert" style={{ marginTop: 12 }}>{error}</div>}
                      <div style={{ marginTop: 14 }}>
                        <button
                          className="public-link-button"
                          disabled={verifying}
                          onClick={() => void onUnlock()}
                        >
                          {verifying ? <Spinner /> : <IconLock />}
                          Zugriff freischalten
                        </button>
                      </div>
                    </div>
                  )}

                  {accessGranted && error && <div className="public-link-alert">{error}</div>}
                  {accessGranted && successMessage && (
                    <div className="public-link-success">{successMessage}</div>
                  )}

                  {accessGranted && (
                    <>
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
                  )}
                </div>
              </>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
