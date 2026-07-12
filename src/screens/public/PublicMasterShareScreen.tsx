import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { decryptBytes } from "@/lib/crypto";
import { getPublicLinkToken } from "@/lib/publicLinkUrl";
import { formatFileSize, type MasterVersionModel } from "@/models/types";
import {
  getPublicMasterShareByToken,
  getPublicMasterVersions,
  verifyPublicLinkPassword,
  type PublicMasterShareAccess,
} from "@/services/publicLinkService";
import { Spinner, formatDateTime } from "@/components/ui";
import { IconDownload, IconLink, IconLock, IconMusic } from "@/components/Icons";

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function fetchDecryptedBlob(master: MasterVersionModel): Promise<Blob> {
  const response = await fetch(master.fileUrl);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const encryptedBytes = new Uint8Array(await response.arrayBuffer());
  const plainBytes = master.encrypted
    ? await decryptBytes(encryptedBytes, master.iv, master.fileKey)
    : encryptedBytes;
  const buffer = plainBytes.buffer.slice(
    plainBytes.byteOffset,
    plainBytes.byteOffset + plainBytes.byteLength
  ) as ArrayBuffer;
  return new Blob([buffer], { type: master.mimeType || "audio/mpeg" });
}

export function PublicMasterShareScreen() {
  const { lang } = useI18n();
  const [share, setShare] = useState<PublicMasterShareAccess | null>(null);
  const [masters, setMasters] = useState<MasterVersionModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [password, setPassword] = useState("");
  const [accessGranted, setAccessGranted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewMasterId, setPreviewMasterId] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    };
  }, []);

  useEffect(() => {
    const token = getPublicLinkToken();
    if (!token) {
      setError("Dieser Link ist ungueltig.");
      setLoading(false);
      return;
    }

    void (async () => {
      try {
        const nextShare = await getPublicMasterShareByToken(token);
        if (!nextShare) {
          setError("Dieser Link wurde nicht gefunden.");
          return;
        }
        if (!nextShare.isActive) {
          setError("Dieser Link ist deaktiviert.");
          return;
        }
        if (nextShare.expiresAt && nextShare.expiresAt.getTime() <= Date.now()) {
          setError("Dieser Link ist abgelaufen.");
          return;
        }

        setShare(nextShare);
        if (!nextShare.hasPassword) {
          setAccessGranted(true);
        }
      } catch (e) {
        setError((e as Error).message || "Der Link konnte nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!share || !accessGranted) return;
    void getPublicMasterVersions(share.projectId)
      .then(setMasters)
      .catch((e) => setError((e as Error).message || "Master konnten nicht geladen werden."));
  }, [share?.projectId, accessGranted]);

  const onUnlock = async () => {
    if (!share) return;
    setVerifying(true);
    setError(null);
    try {
      const matches = await verifyPublicLinkPassword({
        password,
        passwordHash: share.passwordHash,
        passwordSalt: share.passwordSalt,
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

  const onPreview = async (master: MasterVersionModel) => {
    setBusyId(master.id);
    setError(null);
    try {
      const blob = await fetchDecryptedBlob(master);
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
      const nextPreviewUrl = URL.createObjectURL(blob);
      previewUrlRef.current = nextPreviewUrl;
      setPreviewUrl(nextPreviewUrl);
      setPreviewMasterId(master.id);
    } catch (e) {
      setError((e as Error).message || "Die Vorschau konnte nicht geladen werden.");
    } finally {
      setBusyId(null);
    }
  };

  const onDownload = async (master: MasterVersionModel) => {
    setBusyId(master.id);
    setError(null);
    try {
      const blob = await fetchDecryptedBlob(master);
      downloadBlob(blob, master.originalFileName || `${master.versionName}.bin`);
    } catch (e) {
      setError((e as Error).message || "Der Download konnte nicht gestartet werden.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="public-link-page">
      <div className="public-link-wrap">
        <div className="public-link-shell">
          <aside className="public-link-hero">
            <span className="public-link-kicker">Private Master Review</span>
            <h1 className="public-link-title">Studio Master Link</h1>
            <p className="public-link-subtitle">
              Sicherer, dunkler Review-Space fuer freigegebene Master-Versionen.
              Preview und Download laufen direkt ueber diesen Link.
            </p>

            {share && (
              <div className="public-link-meta">
                <span className="public-link-chip">{share.projectName}</span>
                <span className="public-link-chip">{share.customerName || "Ohne Kunde"}</span>
                <span className="public-link-chip">
                  {share.allowDownload ? "Download aktiv" : "Preview only"}
                </span>
                <span className="public-link-chip">
                  {share.hasPassword ? "Passwortgeschuetzt" : "Direkter Zugriff"}
                </span>
              </div>
            )}

            <div className="public-link-footnote">
              SyncTheStudio Public Review · optimiert fuer sichere Audio-Freigaben
            </div>
          </aside>

          <section className="public-link-panel">
            <div className="public-link-panel-header">
              <div>
                <div className="public-link-panel-title">Master Review</div>
                <div className="public-link-panel-copy">
                  {share?.expiresAt
                    ? `Dieser Link laeuft am ${formatDateTime(share.expiresAt, lang)} ab.`
                    : "Dieser Link hat aktuell kein Ablaufdatum."}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="public-link-loading">
                <div>
                  <Spinner large />
                  <div style={{ marginTop: 14 }}>Master-Seite wird geladen…</div>
                </div>
              </div>
            ) : error && !share ? (
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
            ) : share ? (
              <div className="public-link-stack">
                {share.hasPassword && !accessGranted && (
                  <div className="public-link-gate">
                    <div className="public-link-panel-title" style={{ fontSize: "1.05rem", marginBottom: 8 }}>
                      Passwort entsperren
                    </div>
                    <div className="public-link-panel-copy" style={{ marginBottom: 14 }}>
                      Dieser Review-Link ist geschuetzt. Gib das vergebene Passwort ein,
                      um die Master-Versionen zu sehen.
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

                {accessGranted && masters.length === 0 && (
                  <div className="public-link-empty">
                    <div>
                      <div className="public-link-empty-icon">
                        <IconMusic />
                      </div>
                      <h2>Keine Master-Versionen vorhanden</h2>
                      <div className="public-link-panel-copy" style={{ marginTop: 10 }}>
                        Fuer dieses Projekt wurden noch keine freigegebenen Master hochgeladen.
                      </div>
                    </div>
                  </div>
                )}

                {accessGranted && masters.length > 0 && (
                  <div className="public-link-stack">
                    {masters.map((master) => (
                      <article key={master.id} className="public-link-item">
                        <div className="public-link-item-top">
                          <div>
                            <div className="public-link-item-title">{master.versionName}</div>
                            <div className="public-link-item-copy">
                              {master.originalFileName} · {formatFileSize(master.fileSize)} · {formatDateTime(master.createdAt, lang)}
                            </div>
                          </div>
                          <div className="public-link-actions">
                            <button
                              className="public-link-button-secondary"
                              disabled={busyId === master.id}
                              onClick={() => void onPreview(master)}
                            >
                              {busyId === master.id ? <Spinner /> : <IconMusic />}
                              Preview
                            </button>
                            {share.allowDownload && (
                              <button
                                className="public-link-button"
                                disabled={busyId === master.id}
                                onClick={() => void onDownload(master)}
                              >
                                {busyId === master.id ? <Spinner /> : <IconDownload />}
                                Download
                              </button>
                            )}
                          </div>
                        </div>

                        {previewMasterId === master.id && previewUrl && (
                          <div className="public-link-preview" style={{ marginTop: 14 }}>
                            <div className="public-link-panel-copy" style={{ marginBottom: 10 }}>
                              Live Preview
                            </div>
                            <audio controls className="public-link-audio" src={previewUrl} />
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
