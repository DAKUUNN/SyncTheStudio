import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import { useIsDesktopTauri } from "@/lib/platform";
import { formatDuration, type ProjectModel, type TimeEntryModel } from "@/models/types";
import {
  watchTimeEntries,
  startTimer,
  stopTimer,
  addTimeEntry,
  deleteTimeEntry,
  getActiveTimer,
} from "@/services/timeTrackingService";
import {
  getAutoTrackProjectId,
  setAutoTrackProjectId,
  getCustomKeywordsRaw,
  setCustomKeywordsRaw,
} from "@/services/dawTrackerService";
import { Modal, formatDateTime } from "@/components/ui";
import { IconPlay, IconStop, IconPlus, IconTrash, IconTimer, IconZap } from "@/components/Icons";

export function TimeTab({ project }: { project: ProjectModel }) {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { t, lang } = useI18n();
  const isDesktopTauri = useIsDesktopTauri();

  const [entries, setEntries] = useState<TimeEntryModel[]>([]);
  const [activeTimerId, setActiveTimerId] = useState<string | null>(null);
  const [activeSince, setActiveSince] = useState<Date | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [timerDescription, setTimerDescription] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDescription, setManualDescription] = useState("");
  const [manualMinutes, setManualMinutes] = useState("60");
  const [manualDate, setManualDate] = useState(
    () => new Date().toISOString().slice(0, 10)
  );
  const [autoTrackEnabled, setAutoTrackEnabled] = useState(
    () => getAutoTrackProjectId() === project.id
  );
  const [dawKeywords, setDawKeywords] = useState(() => getCustomKeywordsRaw());

  useEffect(() => {
    const unsubscribe = watchTimeEntries(project.id, setEntries);
    if (currentUser) {
      void getActiveTimer(project.id, currentUser.id).then((entry) => {
        if (entry) {
          setActiveTimerId(entry.id);
          setActiveSince(entry.startTime);
        }
      });
    }
    return unsubscribe;
  }, [project.id, currentUser?.id]);

  // The DAW-auto-tracker (App.tsx) can start/stop a timer for this project
  // in the background — pick that up live via the entries subscription
  // instead of only reflecting timers started from this screen.
  useEffect(() => {
    if (!currentUser) return;
    const mine = entries.find((e) => e.userId === currentUser.id && !e.endTime);
    if (mine) {
      if (activeTimerId !== mine.id) {
        setActiveTimerId(mine.id);
        setActiveSince(mine.startTime);
      }
    } else if (activeTimerId) {
      setActiveTimerId(null);
      setActiveSince(null);
      setElapsed(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, currentUser?.id]);

  const onToggleAutoTrack = (enabled: boolean) => {
    setAutoTrackEnabled(enabled);
    setAutoTrackProjectId(enabled ? project.id : null);
  };

  const onSaveDawKeywords = (raw: string) => {
    setDawKeywords(raw);
    setCustomKeywordsRaw(raw);
  };

  useEffect(() => {
    if (!activeSince) return;
    const interval = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - activeSince.getTime()) / 1000));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [activeSince]);

  const totalMinutes = useMemo(
    () => entries.reduce((sum, entry) => sum + entry.durationMinutes, 0),
    [entries]
  );

  const onStart = async () => {
    if (!currentUser) return;
    try {
      const entryId = await startTimer({
        projectId: project.id,
        userId: currentUser.id,
        username: currentUser.username,
        description: timerDescription.trim(),
      });
      setActiveTimerId(entryId);
      setActiveSince(new Date());
      showToast(t("time.started"), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  const onStop = async () => {
    if (!activeTimerId) return;
    try {
      await stopTimer(project.id, activeTimerId);
      setActiveTimerId(null);
      setActiveSince(null);
      setElapsed(0);
      setTimerDescription("");
      showToast(t("time.stopped"), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  const onAddManual = async () => {
    if (!currentUser) return;
    const minutes = parseInt(manualMinutes, 10);
    if (Number.isNaN(minutes) || minutes <= 0) {
      showToast(t("time.invalidDuration"), "error");
      return;
    }
    try {
      await addTimeEntry({
        projectId: project.id,
        userId: currentUser.id,
        username: currentUser.username,
        description: manualDescription.trim(),
        durationMinutes: minutes,
        startTime: new Date(`${manualDate}T09:00:00`),
      });
      setManualOpen(false);
      setManualDescription("");
      setManualMinutes("60");
      showToast(t("time.entryAdded"), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(
      s
    ).padStart(2, "0")}`;
  };

  return (
    <div className="content-narrow" style={{ margin: 0, maxWidth: 780 }}>
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row row-between row-wrap">
          <div className="row">
            <div
              className="stat-icon"
              style={{
                background: activeTimerId ? "var(--danger-soft)" : "var(--primary-soft)",
                color: activeTimerId ? "var(--danger)" : "var(--primary)",
                marginBottom: 0,
              }}
            >
              <IconTimer />
            </div>
            <div>
              <div className="stat-value mono" style={{ fontSize: "1.375rem" }}>
                {activeTimerId ? formatElapsed(elapsed) : formatDuration(totalMinutes)}
              </div>
              <div className="stat-label">
                {activeTimerId ? t("time.running") : t("time.totalTracked")}
              </div>
            </div>
          </div>
          <div className="row row-wrap">
            {!activeTimerId ? (
              <>
                <input
                  className="input"
                  style={{ maxWidth: 240, minWidth: 160, flex: "1 1 160px" }}
                  placeholder={t("time.descriptionHint")}
                  value={timerDescription}
                  onChange={(e) => setTimerDescription(e.target.value)}
                />
                <button className="btn btn-primary" onClick={() => void onStart()}>
                  <IconPlay /> {t("time.start")}
                </button>
              </>
            ) : (
              <button className="btn btn-danger" onClick={() => void onStop()}>
                <IconStop /> {t("time.stop")}
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => setManualOpen(true)}>
              <IconPlus /> {t("time.addManual")}
            </button>
          </div>
        </div>
      </div>

      {isDesktopTauri && (
        <div className="card card-pad" style={{ marginBottom: 16 }}>
          <div className="row row-between" style={{ marginBottom: autoTrackEnabled ? 10 : 0 }}>
            <div className="row">
              <div
                className="stat-icon"
                style={{
                  background: autoTrackEnabled ? "var(--primary-soft)" : "var(--surface-2)",
                  color: autoTrackEnabled ? "var(--primary)" : "var(--text-muted)",
                  marginBottom: 0,
                }}
              >
                <IconZap />
              </div>
              <div>
                <div className="text-small" style={{ fontWeight: 700 }}>
                  {t("time.autoTrackTitle")}
                </div>
                <div className="text-xs text-muted">{t("time.autoTrackDescription2")}</div>
              </div>
            </div>
            <label className="checkbox-row" style={{ padding: 0 }}>
              <input
                type="checkbox"
                checked={autoTrackEnabled}
                onChange={(e) => onToggleAutoTrack(e.target.checked)}
              />
            </label>
          </div>
          {autoTrackEnabled && (
            <div className="field" style={{ marginTop: 4 }}>
              <label className="field-label">{t("time.autoTrackKeywordsLabel")}</label>
              <input
                className="input"
                placeholder={t("time.autoTrackKeywordsHint")}
                value={dawKeywords}
                onChange={(e) => onSaveDawKeywords(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <div className="card-title">
            {t("time.entriesTitle")} ({entries.length})
          </div>
          <span className="text-small text-muted">
            {t("time.total")}: {formatDuration(totalMinutes)}
          </span>
        </div>
        {entries.length === 0 ? (
          <div className="empty-state">
            <IconTimer />
            <h3>{t("time.emptyTitle")}</h3>
          </div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className="list-row">
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="text-small" style={{ fontWeight: 600 }}>
                  {entry.description || t("time.noDescription")}
                </div>
                <div className="text-xs text-muted">
                  {entry.username} · {formatDateTime(entry.startTime, lang)}
                </div>
              </div>
              <span
                className="badge"
                style={{
                  background: entry.endTime ? "var(--primary-soft)" : "var(--warning-soft)",
                  color: entry.endTime ? "var(--primary)" : "var(--warning)",
                }}
              >
                {entry.endTime ? formatDuration(entry.durationMinutes) : t("time.running")}
              </span>
              <button
                className="icon-btn"
                onClick={() => void deleteTimeEntry(project.id, entry.id)}
              >
                <IconTrash />
              </button>
            </div>
          ))
        )}
      </div>

      {manualOpen && (
        <Modal
          title={t("time.addManual")}
          onClose={() => setManualOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setManualOpen(false)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={() => void onAddManual()}>
                {t("common.add")}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field-label">{t("time.descriptionHint")}</label>
            <input
              className="input"
              autoFocus
              value={manualDescription}
              onChange={(e) => setManualDescription(e.target.value)}
            />
          </div>
          <div className="grid-2">
            <div className="field">
              <label className="field-label">{t("time.durationMinutes")}</label>
              <input
                className="input"
                type="number"
                min={1}
                value={manualMinutes}
                onChange={(e) => setManualMinutes(e.target.value)}
              />
            </div>
            <div className="field">
              <label className="field-label">{t("time.dateLabel")}</label>
              <input
                className="input"
                type="date"
                value={manualDate}
                onChange={(e) => setManualDate(e.target.value)}
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
