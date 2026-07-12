import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n";
import { decryptBytes } from "@/lib/crypto";
import { getPublicLinkToken } from "@/lib/publicLinkUrl";
import type { MasterVersionModel } from "@/models/types";
import {
  ensureAnonymousAuth,
  getPublicMasterShareByToken,
  getPublicMasterVersions,
  verifyPublicLinkPassword,
  type PublicMasterShareAccess,
} from "@/services/publicLinkService";
import { submitMasterFeedback } from "@/services/masterService";
import { createTasksFromRevisionPoints } from "@/services/taskService";
import { Spinner, formatDateTime } from "@/components/ui";
import {
  IconDownload,
  IconLink,
  IconLock,
  IconMusic,
  IconPlay,
  IconPause,
  IconPlus,
  IconTrash,
  IconCheck,
  IconVolume,
} from "@/components/Icons";

const VOLUME_STORAGE_KEY = "sts_master_review_volume";

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

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function loadStoredVolume(): number {
  if (typeof window === "undefined") return 1;
  const saved = window.localStorage.getItem(VOLUME_STORAGE_KEY);
  const parsed = saved ? Number(saved) : NaN;
  return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : 1;
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
              <>
                <h1 className="public-link-title">{share.projectName}</h1>
                {share.customerName && (
                  <div className="public-link-subtitle">{share.customerName}</div>
                )}
                {share.expiresAt && (
                  <div className="public-link-panel-copy" style={{ marginTop: 10 }}>
                    Dieser Link laeuft am {formatDateTime(share.expiresAt, lang)} ab.
                  </div>
                )}

                <div className="public-link-stack" style={{ marginTop: 20 }}>
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
                    <MasterCompareStudio
                      projectId={share.projectId}
                      masters={masters}
                      allowDownload={share.allowDownload}
                      authorNameDefault={share.customerName ?? ""}
                    />
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

function MasterCompareStudio({
  projectId,
  masters,
  allowDownload,
  authorNameDefault,
}: {
  projectId: string;
  masters: MasterVersionModel[];
  allowDownload: boolean;
  authorNameDefault: string;
}) {
  const [activeMasterId, setActiveMasterId] = useState(masters[0]?.id ?? "");
  const [urlCache, setUrlCache] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState<number>(loadStoredVolume);

  const [points, setPoints] = useState<string[]>([]);
  const [pointDraft, setPointDraft] = useState("");
  const [authorName, setAuthorName] = useState(authorNameDefault);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const urlCacheRef = useRef<Record<string, string>>({});
  const pendingSeekRef = useRef<number | null>(null);
  const wasPlayingRef = useRef(false);
  const volumeRef = useRef(volume);

  useEffect(() => {
    urlCacheRef.current = urlCache;
  }, [urlCache]);

  useEffect(() => {
    volumeRef.current = volume;
    if (audioRef.current) audioRef.current.volume = volume;
  }, [volume]);

  useEffect(
    () => () => {
      Object.values(urlCacheRef.current).forEach((url) => URL.revokeObjectURL(url));
    },
    []
  );

  const activeMaster = useMemo(
    () => masters.find((m) => m.id === activeMasterId) ?? null,
    [masters, activeMasterId]
  );

  const loadMaster = async (masterId: string) => {
    if (!masterId || urlCacheRef.current[masterId]) return;
    const master = masters.find((m) => m.id === masterId);
    if (!master) return;
    setLoadingId(masterId);
    setLoadError(null);
    try {
      const blob = await fetchDecryptedBlob(master);
      const url = URL.createObjectURL(blob);
      urlCacheRef.current = { ...urlCacheRef.current, [masterId]: url };
      setUrlCache((prev) => ({ ...prev, [masterId]: url }));
    } catch (e) {
      setLoadError((e as Error).message || "Audio konnte nicht geladen werden.");
    } finally {
      setLoadingId(null);
    }
  };

  useEffect(() => {
    if (activeMasterId) void loadMaster(activeMasterId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    const url = activeMasterId ? urlCache[activeMasterId] : undefined;
    if (audio && url && audio.src !== url) {
      audio.src = url;
      audio.load();
    }
  }, [activeMasterId, urlCache]);

  const switchToVersion = async (masterId: string) => {
    if (masterId === activeMasterId) return;
    const audio = audioRef.current;
    wasPlayingRef.current = !!audio && !audio.paused;
    pendingSeekRef.current = audio ? audio.currentTime : 0;
    setActiveMasterId(masterId);
    await loadMaster(masterId);
  };

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  const onSeek = (value: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  };

  const onVolumeChange = (value: number) => {
    setVolume(value);
    window.localStorage.setItem(VOLUME_STORAGE_KEY, String(value));
  };

  const onDownload = async (master: MasterVersionModel) => {
    setDownloadingId(master.id);
    setLoadError(null);
    try {
      const blob = await fetchDecryptedBlob(master);
      downloadBlob(blob, master.originalFileName || `${master.versionName}.bin`);
    } catch (e) {
      setLoadError((e as Error).message || "Der Download konnte nicht gestartet werden.");
    } finally {
      setDownloadingId(null);
    }
  };

  const addPoint = () => {
    const trimmed = pointDraft.trim();
    if (!trimmed) return;
    setPoints((prev) => [...prev, trimmed]);
    setPointDraft("");
  };

  const removePoint = (index: number) => {
    setPoints((prev) => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async () => {
    if (points.length === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await ensureAnonymousAuth();
      const createdTitles = await submitMasterFeedback({
        projectId,
        authorName: authorName || "Kunde",
        versionId: activeMaster?.id ?? "",
        versionName: activeMaster?.versionName ?? "",
        points,
      });
      await createTasksFromRevisionPoints(
        projectId,
        createdTitles,
        authorName.trim() || "Kunde"
      );
      setPoints([]);
      setSubmitted(true);
    } catch (e) {
      setSubmitError((e as Error).message || "Die Revision konnte nicht gesendet werden.");
    } finally {
      setSubmitting(false);
    }
  };

  const isBusy = loadingId === activeMasterId;

  return (
    <div className="public-link-stack">
      <audio
        ref={audioRef}
        hidden
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
        onEnded={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={(e) => {
          const audio = e.currentTarget;
          audio.volume = volumeRef.current;
          if (pendingSeekRef.current !== null) {
            audio.currentTime = Math.min(pendingSeekRef.current, audio.duration || pendingSeekRef.current);
            pendingSeekRef.current = null;
          }
          if (wasPlayingRef.current) {
            void audio.play();
            wasPlayingRef.current = false;
          }
        }}
      />

      <div className="ab-studio">
        <div className="ab-version-list">
          {masters.map((m) => (
            <button
              key={m.id}
              className={`ab-version-pill${m.id === activeMasterId ? " active" : ""}`}
              onClick={() => void switchToVersion(m.id)}
            >
              {m.versionName}
            </button>
          ))}
        </div>

        <div className="ab-player">
          {isBusy ? (
            <div className="ab-player-loading">
              <Spinner /> Audio wird geladen…
            </div>
          ) : (
            <>
              <button className="ab-play-btn" onClick={togglePlay} disabled={!activeMaster}>
                {isPlaying ? <IconPause /> : <IconPlay />}
              </button>
              <div className="ab-player-body">
                <input
                  className="ab-seek"
                  type="range"
                  min={0}
                  max={duration || 0}
                  step={0.1}
                  value={Math.min(currentTime, duration || 0)}
                  onChange={(e) => onSeek(Number(e.target.value))}
                />
                <div className="ab-player-times">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
              </div>
              <div className="ab-volume">
                <IconVolume style={{ width: 15, height: 15 }} />
                <input
                  className="ab-volume-slider"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(e) => onVolumeChange(Number(e.target.value))}
                />
              </div>
              {allowDownload && activeMaster && (
                <button
                  className="public-link-button-secondary ab-download-btn"
                  disabled={downloadingId === activeMaster.id}
                  onClick={() => void onDownload(activeMaster)}
                  title="Aktive Version herunterladen"
                >
                  {downloadingId === activeMaster.id ? <Spinner /> : <IconDownload />}
                </button>
              )}
            </>
          )}
        </div>

        {loadError && <div className="public-link-alert">{loadError}</div>}
      </div>

      <div className="public-link-item" style={{ marginTop: 4 }}>
        <div className="public-link-item-title" style={{ marginBottom: 4 }}>
          Revisionsliste
        </div>
        <div className="public-link-panel-copy" style={{ marginBottom: 12 }}>
          Ein Punkt pro Zeile — trag ein, was geaendert werden soll.
        </div>

        <div className="field" style={{ marginBottom: 10 }}>
          <label className="public-link-label">Dein Name (optional)</label>
          <input
            className="public-link-input"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            placeholder="Kunde"
          />
        </div>

        <div className="row ab-add-point-row" style={{ gap: 8, marginBottom: 12 }}>
          <input
            className="public-link-input"
            style={{ flex: 1, minWidth: 0 }}
            placeholder="z. B. Hall bei 00:56 reinpacken"
            value={pointDraft}
            onChange={(e) => setPointDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addPoint();
            }}
          />
          <button className="public-link-button-secondary" onClick={addPoint} type="button">
            <IconPlus /> Hinzufuegen
          </button>
        </div>

        {points.length > 0 && (
          <div className="ab-points-list">
            {points.map((point, index) => (
              <div key={`${point}-${index}`} className="ab-point-row">
                <span>{point}</span>
                <button className="icon-btn" onClick={() => removePoint(index)} type="button">
                  <IconTrash style={{ width: 13, height: 13 }} />
                </button>
              </div>
            ))}
          </div>
        )}

        {submitError && <div className="public-link-alert" style={{ marginTop: 10 }}>{submitError}</div>}
        {submitted && (
          <div className="public-link-success" style={{ marginTop: 10 }}>
            <IconCheck style={{ width: 13, height: 13, verticalAlign: -2 }} /> Danke! Deine
            Revision wurde gesendet.
          </div>
        )}

        <div style={{ marginTop: 14 }}>
          <button
            className="public-link-button"
            disabled={points.length === 0 || submitting}
            onClick={() => void onSubmit()}
          >
            {submitting ? <Spinner /> : <IconCheck />}
            Revision abschicken{points.length > 0 ? ` (${points.length})` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
