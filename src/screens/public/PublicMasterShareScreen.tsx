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
} from "@/components/Icons";

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
          <aside className="public-link-hero">
            <span className="public-link-kicker">Private Master Review</span>
            <h1 className="public-link-title">Studio Master Link</h1>
            <p className="public-link-subtitle">
              Sicherer, dunkler Review-Space fuer freigegebene Master-Versionen. A/B
              vergleichen, anhoeren und Revisionspunkte direkt einreichen.
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
  const [slotAId, setSlotAId] = useState(masters[0]?.id ?? "");
  const [slotBId, setSlotBId] = useState(masters[1]?.id ?? masters[0]?.id ?? "");
  const [activeSlot, setActiveSlot] = useState<"A" | "B">("A");
  const [urlCache, setUrlCache] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

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

  useEffect(() => {
    urlCacheRef.current = urlCache;
  }, [urlCache]);

  useEffect(
    () => () => {
      Object.values(urlCacheRef.current).forEach((url) => URL.revokeObjectURL(url));
    },
    []
  );

  const activeMasterId = activeSlot === "A" ? slotAId : slotBId;
  const activeMaster = useMemo(
    () => masters.find((m) => m.id === activeMasterId) ?? null,
    [masters, activeMasterId]
  );
  const slotAMaster = useMemo(() => masters.find((m) => m.id === slotAId) ?? null, [masters, slotAId]);
  const slotBMaster = useMemo(() => masters.find((m) => m.id === slotBId) ?? null, [masters, slotBId]);

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
    if (slotAId) void loadMaster(slotAId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotAId]);

  useEffect(() => {
    const audio = audioRef.current;
    const url = activeMasterId ? urlCache[activeMasterId] : undefined;
    if (audio && url && audio.src !== url) {
      audio.src = url;
      audio.load();
    }
  }, [activeMasterId, urlCache]);

  const switchToSlot = async (slot: "A" | "B") => {
    if (slot === activeSlot) return;
    const audio = audioRef.current;
    wasPlayingRef.current = !!audio && !audio.paused;
    pendingSeekRef.current = audio ? audio.currentTime : 0;
    setActiveSlot(slot);
    const targetId = slot === "A" ? slotAId : slotBId;
    await loadMaster(targetId);
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
        <div className="ab-slots">
          <div className={`ab-slot${activeSlot === "A" ? " active" : ""}`}>
            <button className="ab-slot-toggle" onClick={() => void switchToSlot("A")}>
              <span className="ab-slot-label">A</span>
              {slotAMaster?.versionName ?? "—"}
            </button>
            <select
              className="public-link-select"
              value={slotAId}
              onChange={(e) => {
                setSlotAId(e.target.value);
                void loadMaster(e.target.value);
              }}
            >
              {masters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.versionName}
                </option>
              ))}
            </select>
          </div>

          <div className="ab-vs">VS</div>

          <div className={`ab-slot${activeSlot === "B" ? " active" : ""}`}>
            <button className="ab-slot-toggle" onClick={() => void switchToSlot("B")}>
              <span className="ab-slot-label">B</span>
              {slotBMaster?.versionName ?? "—"}
            </button>
            <select
              className="public-link-select"
              value={slotBId}
              onChange={(e) => {
                setSlotBId(e.target.value);
                void loadMaster(e.target.value);
              }}
            >
              {masters.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.versionName}
                </option>
              ))}
            </select>
          </div>
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
                <div className="ab-player-title">
                  {activeMaster?.originalFileName ?? "Kein Master ausgewaehlt"}
                </div>
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
              {allowDownload && activeMaster && (
                <button
                  className="public-link-button-secondary"
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
          Trage jeden gewuenschten Aenderungspunkt einzeln ein. Beim Absenden landen sie
          direkt als Aufgaben im Projekt.
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

        <div className="row" style={{ gap: 8, marginBottom: 12 }}>
          <input
            className="public-link-input"
            style={{ flex: 1 }}
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
            <IconCheck style={{ width: 13, height: 13, verticalAlign: -2 }} /> Revision
            gesendet — {points.length === 0 ? "die Punkte sind" : ""} jetzt im Projekt als
            Aufgaben sichtbar.
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
