import { useEffect, useState } from "react";
import { useI18n } from "@/i18n";
import { checkForUpdate, installUpdateAndRestart, type AvailableUpdate } from "@/services/updateService";
import { Modal, ProgressBar } from "./ui";
import { IconDownload, IconRefresh } from "./Icons";

const RECHECK_INTERVAL_MS = 30 * 60 * 1000;

/** Checks for an app update shortly after startup, then keeps re-checking
 *  every 30 minutes for as long as the app stays open. As soon as an
 *  update is found, shows a dismissible popup with a one-click
 *  "install & restart" action. No-ops outside the Tauri desktop shell. */
export function UpdateNotifier() {
  const { t } = useI18n();
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const runCheck = () => {
      void checkForUpdate().then((result) => {
        if (!cancelled && result) {
          setUpdate(result);
          setDismissed(false);
        }
      });
    };
    const startTimer = window.setTimeout(runCheck, 2500);
    const interval = window.setInterval(runCheck, RECHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
      window.clearInterval(interval);
    };
  }, []);

  if (!update || dismissed) return null;

  const onInstall = async () => {
    setInstalling(true);
    setError(null);
    try {
      await installUpdateAndRestart((downloaded, total) => {
        setProgress(total ? downloaded / total : 0);
      });
    } catch (e) {
      setError((e as Error).message || t("update.installFailed"));
      setInstalling(false);
    }
  };

  return (
    <Modal
      title={t("update.available")}
      onClose={() => !installing && setDismissed(true)}
      footer={
        !installing ? (
          <>
            <button className="btn btn-secondary" onClick={() => setDismissed(true)}>
              {t("update.later")}
            </button>
            <button className="btn btn-primary" onClick={() => void onInstall()}>
              <IconDownload /> {t("update.installNow")}
            </button>
          </>
        ) : undefined
      }
    >
      <p className="text-small" style={{ marginBottom: 10 }}>
        {t("update.newVersion", { version: update.version, current: update.currentVersion })}
      </p>
      {update.body && (
        <div
          className="text-small text-muted"
          style={{
            whiteSpace: "pre-wrap",
            background: "var(--surface-2)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 12px",
            marginBottom: 12,
            maxHeight: 180,
            overflowY: "auto",
          }}
        >
          {update.body}
        </div>
      )}

      {installing && (
        <div style={{ marginTop: 8 }}>
          <div className="row" style={{ marginBottom: 8, gap: 8 }}>
            <IconRefresh className="spin-slow" style={{ width: 15, height: 15 }} />
            <span className="text-small">{t("update.installing")}</span>
          </div>
          <ProgressBar value={progress} />
        </div>
      )}

      {error && (
        <div className="text-small" style={{ color: "var(--danger)", marginTop: 10 }}>
          {error}
        </div>
      )}
    </Modal>
  );
}
