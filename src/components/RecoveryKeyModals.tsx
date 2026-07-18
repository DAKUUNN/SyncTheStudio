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
    needsPasswordUnlock,
    submitPasswordUnlock,
    dismissPasswordUnlock,
  } = useAuth();
  const { t } = useI18n();

  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [useRecoveryFallback, setUseRecoveryFallback] = useState(false);
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

  const onPasswordUnlock = async () => {
    setUnlockBusy(true);
    setUnlockError(false);
    const ok = useRecoveryFallback
      ? await submitRecoveryUnlock(codeInput)
      : await submitPasswordUnlock(passwordInput);
    setUnlockBusy(false);
    if (!ok) {
      setUnlockError(true);
      return;
    }
    // recovery fallback unlocks via the other flag — close this one too
    dismissPasswordUnlock();
    setPasswordInput("");
    setCodeInput("");
    setUseRecoveryFallback(false);
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

  if (needsPasswordUnlock && !needsRecoveryUnlock) {
    return (
      <Modal
        title={t("e2eUnlock.title")}
        onClose={dismissPasswordUnlock}
        footer={
          <>
            <button className="btn btn-secondary" onClick={dismissPasswordUnlock}>
              {t("recovery.unlockLater")}
            </button>
            <button
              className="btn btn-primary"
              disabled={
                unlockBusy ||
                (useRecoveryFallback ? codeInput.trim().length < 10 : passwordInput.length === 0)
              }
              onClick={() => void onPasswordUnlock()}
            >
              <IconKey /> {t("recovery.unlock")}
            </button>
          </>
        }
      >
        <p className="text-small text-muted" style={{ marginBottom: 12 }}>
          {t("e2eUnlock.description")}
        </p>
        {useRecoveryFallback ? (
          <div className="field">
            <label className="field-label">{t("recovery.codeLabel")}</label>
            <input
              className="input mono"
              autoFocus
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onPasswordUnlock();
              }}
            />
          </div>
        ) : (
          <div className="field">
            <label className="field-label">{t("e2eUnlock.passwordLabel")}</label>
            <input
              className="input"
              type="password"
              autoFocus
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onPasswordUnlock();
              }}
            />
          </div>
        )}
        {unlockError && (
          <div className="text-xs" style={{ color: "var(--danger)", marginTop: 6 }}>
            {useRecoveryFallback ? t("recovery.wrongCode") : t("e2eUnlock.wrongPassword")}
          </div>
        )}
        <button
          className="btn btn-secondary btn-sm"
          style={{ marginTop: 12 }}
          onClick={() => {
            setUseRecoveryFallback((v) => !v);
            setUnlockError(false);
          }}
        >
          {useRecoveryFallback ? t("e2eUnlock.usePassword") : t("e2eUnlock.useRecovery")}
        </button>
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
