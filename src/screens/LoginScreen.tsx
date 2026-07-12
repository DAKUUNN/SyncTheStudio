import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import { IconCheck, IconEye, IconEyeOff } from "@/components/Icons";
import { Modal } from "@/components/ui";

export function LoginScreen() {
  const { login, resetPassword, error, clearError, isLoading } = useAuth();
  const { showToast } = useToast();
  const { t } = useI18n();

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
      <div className="auth-hero">
        <div className="hero-logo">
          <div className="brand-logo">STS</div>
          {t("app.name")}
        </div>
        <div>
          <div className="hero-headline">
            Mix &amp; Master Projektmanagement für dein Studio.
          </div>
          <div className="hero-sub">
            Projekte, Kunden, Deadlines, Master-Versionen und Team-Chat — alles an
            einem Ort, Ende-zu-Ende organisiert.
          </div>
          <div className="hero-points">
            <div className="hero-point">
              <IconCheck /> Projekte &amp; Status-Workflows
            </div>
            <div className="hero-point">
              <IconCheck /> Verschlüsselte Notizen, Chats &amp; Master
            </div>
            <div className="hero-point">
              <IconCheck /> Kunden-Reviews über öffentliche Links
            </div>
            <div className="hero-point">
              <IconCheck /> Zeiterfassung &amp; Export
            </div>
          </div>
        </div>
        <div className="text-xs" style={{ color: "rgb(226 232 240 / 0.5)" }}>
          © {new Date().getFullYear()} SyncTheStudio
        </div>
      </div>

      <div className="auth-form-column">
        <div className="auth-card">
          <h1>{t("login.signIn")}</h1>
          <div className="auth-sub">{t("app.tagline")}</div>

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
