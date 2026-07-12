import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import { validateEmail, validatePassword, validateUsername } from "@/lib/validators";

export function RegisterScreen() {
  const { register, error, clearError, isLoading } = useAuth();
  const { showToast } = useToast();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [validation, setValidation] = useState<string | null>(null);

  // Reset stale auth errors carried over from the login screen
  useEffect(() => {
    clearError();
  }, [clearError]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();

    const usernameError = validateUsername(username, t);
    if (usernameError) return setValidation(usernameError);
    const emailError = validateEmail(email, t);
    if (emailError) return setValidation(emailError);
    const passwordError = validatePassword(password, t);
    if (passwordError) return setValidation(passwordError);
    if (password !== confirm) {
      return setValidation(t("register.passwordsDontMatch"));
    }
    setValidation(null);

    const success = await register({
      email: email.trim(),
      password,
      username: username.trim(),
    });
    if (success) {
      showToast(
        `${t("register.successTitle")} ${t("register.successMessage")}`,
        "success"
      );
      navigate("/login");
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-brand">
        <img src="/logo.png" alt="" />
        <span className="auth-brand-name">{t("app.name")}</span>
      </div>

      <div className="auth-card">
        <h1>{t("register.title")}</h1>

        <form onSubmit={onSubmit}>
            <div className="field">
              <label className="field-label">{t("register.usernameLabel")}</label>
              <input
                className="input"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("register.usernameHint")}
              />
            </div>
            <div className="field">
              <label className="field-label">{t("register.emailLabel")}</label>
              <input
                className="input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("register.emailHint")}
              />
            </div>
            <div className="field">
              <label className="field-label">{t("register.passwordLabel")}</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("register.passwordHint")}
              />
            </div>
            <div className="field">
              <label className="field-label">{t("register.confirmPasswordLabel")}</label>
              <input
                className="input"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder={t("register.passwordHint")}
              />
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
              {t("register.title")}
            </button>
          </form>

        <div className="text-small text-muted" style={{ marginTop: 16, textAlign: "center" }}>
          <Link to="/login" style={{ color: "var(--primary)", fontWeight: 600 }}>
            {t("login.signIn")}
          </Link>
        </div>
      </div>
    </div>
  );
}
