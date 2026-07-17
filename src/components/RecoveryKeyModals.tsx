import { useState } from "react";
import { useAuth } from "@/stores/authStore";
import { useI18n } from "@/i18n";
import { copyText } from "@/lib/clipboard";
import { Modal } from "@/components/ui";
import { IconCopy, IconKey, IconCheck } from "@/components/Icons";

/** The two dialogs of the zero-knowledge file encryption:
 *  1. Show the recovery code exactly once after key creation.
 *  2. Ask for the recovery code after a mail password reset. */
export function RecoveryKeyModals() {
  const {
    pendingRecoveryCode,
    confirmRecoveryCodeSaved,
    needsRecoveryUnlock,
    submitRecoveryUnlock,
    dismissRecoveryUnlock,
  } = useAuth();
  const { t } = useI18n();

  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [unlockError, setUnlockError] = useState(false);
  const [unlockBusy, setUnlockBusy] = useState(false);

  const onUnlock = async () => {
    setUnlockBusy(true);
    setUnlockError(false);
    const ok = await submitRecoveryUnlock(codeInput);
    setUnlockBusy(false);
    if (!ok) setUnlockError(true);
    else setCodeInput("");
  };

  if (pendingRecoveryCode) {
    return (
      <Modal
        title={t("recovery.title")}
        onClose={() => {}}
        footer={
          <button
            className="btn btn-primary"
            disabled={!confirmed}
            onClick={() => {
              confirmRecoveryCodeSaved();
              setConfirmed(false);
              setCopied(false);
            }}
          >
            <IconCheck /> {t("recovery.done")}
          </button>
        }
      >
        <p className="text-small text-muted" style={{ marginBottom: 12 }}>
          {t("recovery.description")}
        </p>
        <div
          className="mono"
          style={{
            padding: "14px 16px",
            background: "var(--surface-2)",
            borderRadius: "var(--radius-sm)",
            fontSize: "1.05rem",
            fontWeight: 700,
            letterSpacing: "0.06em",
            textAlign: "center",
            marginBottom: 10,
            userSelect: "text",
          }}
        >
          {pendingRecoveryCode}
        </div>
        <button
          className="btn btn-secondary btn-sm"
          style={{ marginBottom: 12 }}
          onClick={() =>
            void copyText(pendingRecoveryCode).then((ok) => setCopied(ok))
          }
        >
          <IconCopy /> {copied ? t("common.copied") : t("recovery.copy")}
        </button>
        <div className="text-xs" style={{ color: "var(--danger)", marginBottom: 10 }}>
          {t("recovery.warning")}
        </div>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span className="text-small">{t("recovery.confirmSaved")}</span>
        </label>
      </Modal>
    );
  }

  if (needsRecoveryUnlock) {
    return (
      <Modal
        title={t("recovery.unlockTitle")}
        onClose={dismissRecoveryUnlock}
        footer={
          <>
            <button className="btn btn-secondary" onClick={dismissRecoveryUnlock}>
              {t("recovery.unlockLater")}
            </button>
            <button
              className="btn btn-primary"
              disabled={unlockBusy || codeInput.trim().length < 10}
              onClick={() => void onUnlock()}
            >
              <IconKey /> {t("recovery.unlock")}
            </button>
          </>
        }
      >
        <p className="text-small text-muted" style={{ marginBottom: 12 }}>
          {t("recovery.unlockDescription")}
        </p>
        <div className="field">
          <label className="field-label">{t("recovery.codeLabel")}</label>
          <input
            className="input mono"
            autoFocus
            placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onUnlock();
            }}
          />
          {unlockError && (
            <div className="field-hint" style={{ color: "var(--danger)" }}>
              {t("recovery.wrongCode")}
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return null;
}
