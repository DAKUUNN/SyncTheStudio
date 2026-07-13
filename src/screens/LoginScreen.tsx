import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import { useIsIOS } from "@/lib/platform";
import { IconApple, IconEye, IconEyeOff } from "@/components/Icons";
import { Modal } from "@/components/ui";

export function LoginScreen() {
  const { login, loginWithApple, resetPassword, error, clearError, isLoading } = useAuth();
  const { showToast } = useToast();
  const { t } = useI18n();
  const isIOS = useIsIOS();
  const [appleBusy, setAppleBusy] = useState(false);

  const onAppleSignIn = async () => {
    clearError();
    setAppleBusy(true);
    const success = await loginWithApple();
    setAppleBusy(false);
    if (success) {
      showToast(t("login.successAs", { username: t("login.signInWithApple") }), "success");
    }
  };

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [validation, setValidation] = useState<string | null>(null);

  // Reset stale auth errors carried over from other auth screens
  useEffect(() => {
    clearError();
  }, [clearError]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    if (!identifier.trim()) {
      setValidation(t("login.emailOrUsernameRequired"));
      return;
    }
    if (!password) {
      setValidation(t("login.passwordRequired"));
      return;
    }
    if (password.length < 6) {
      setValidation(t("login.passwordMinLength"));
      return;
    }
    setValidation(null);

    const isEmail = identifier.includes("@");
    const success = await login({
      email: isEmail ? identifier.trim() : undefined,
      username: isEmail ? undefined : identifier.trim(),
      password,
    });
    if (success) {
      showToast(t("login.successAs", { username: identifier.trim() }), "success");
    }
  };

  const onReset = async () => {
    if (!resetEmail.trim()) return;
    const ok = await resetPassword(resetEmail.trim());
    if (ok) {
      showToast(t("profile.resetEmailSent"), "success");
      setResetOpen(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <img src="/logo.png" alt="" />
        <span className="auth-brand-name">{t("app.name")}</span>
      </div>

      <div className="auth-card">
        <h1>{t("login.signIn")}</h1>

        {isIOS && (
          <>
            <button
              type="button"
              className="btn btn-secondary btn-lg btn-block"
              style={{ marginBottom: 14 }}
              disabled={appleBusy || isLoading}
              onClick={() => void onAppleSignIn()}
            >
              <IconApple />{" "}
              {appleBusy ? t("login.appleSigningIn") : t("login.signInWithApple")}
            </button>
            <div className="auth-divider">
              <span>{t("common.or")}</span>
            </div>
          </>
        )}

        <form onSubmit={onSubmit}>
            <div className="field">
              <label className="field-label">{t("login.emailOrUsernameHint")}</label>
              <input
                className="input"
                autoFocus
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={t("login.emailOrUsernameHint")}
                autoComplete="username"
              />
            </div>

            <div className="field">
              <label className="field-label">{t("login.passwordHint")}</label>
              <div style={{ position: "relative" }}>
                <input
                  className="input"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("login.passwordHint")}
                  autoComplete="current-password"
                  style={{ paddingRight: 38 }}
                />
                <button
                  type="button"
                  className="icon-btn"
                  style={{ position: "absolute", right: 3, top: 3 }}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <IconEyeOff /> : <IconEye />}
                </button>
              </div>
            </div>

            {(validation || error) && (
              <div
                className="text-small"
                style={{
                  color: "var(--danger)",
                  background: "var(--danger-soft)",
                  borderRadius: "var(--radius-sm)",
                  padding: "8px 11px",
                  marginBottom: 14,
                }}
              >
                {validation ?? error}
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg btn-block"
              disabled={isLoading}
            >
              {isLoading ? t("login.signingIn") : t("login.signIn")}
            </button>
          </form>

          <div
            className="row row-between"
            style={{ marginTop: 16, fontSize: "0.8125rem" }}
          >
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setResetOpen(true)}
            >
              {t("profile.forgotPassword")}
            </button>
            <span className="text-muted">
              {t("login.noAccount")}{" "}
              <Link to="/register" style={{ color: "var(--primary)", fontWeight: 600 }}>
                {t("login.register")}
              </Link>
            </span>
          </div>
      </div>

      {resetOpen && (
        <Modal
          title={t("profile.resetPassword")}
          onClose={() => setResetOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setResetOpen(false)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={() => void onReset()}>
                {t("common.ok")}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field-label">{t("register.emailLabel")}</label>
            <input
              className="input"
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder={t("register.emailHint")}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
