import { useState } from "react";
import { pickFiles } from "@/lib/filePicker";
import { useAuth } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import { uploadAvatar, deleteAvatar } from "@/services/storageService";
import { Avatar, Modal, formatDate } from "@/components/ui";
import { IconEdit, IconLock, IconUpload } from "@/components/Icons";

export function ProfileScreen() {
  const { currentUser, updateOwnProfile, changePassword, error, clearError } = useAuth();
  const { showToast } = useToast();
  const { t, lang } = useI18n();

  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [username, setUsername] = useState(currentUser?.username ?? "");
  const [email, setEmail] = useState(currentUser?.email ?? "");
  const [bio, setBio] = useState(currentUser?.bio ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (!currentUser) return null;

  const onPickAvatar = async () => {
    const selected = await pickFiles({
      multiple: false,
      accept: "image/png,image/jpeg,image/webp",
      dialogFilters: [{ name: "Bilder", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    const file = selected?.[0];
    if (!file) return;
    setBusy(true);
    try {
      if (currentUser.avatarUrl) {
        await deleteAvatar(currentUser.avatarUrl);
      }
      const url = await uploadAvatar(file.bytes, currentUser.id, file.name);
      await updateOwnProfile({ avatarUrl: url });
      showToast(t("profile.avatarUpdated"), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const onSaveProfile = async () => {
    setBusy(true);
    const ok = await updateOwnProfile({
      username: username.trim() || undefined,
      email: email.trim() || undefined,
      bio,
    });
    setBusy(false);
    if (ok) {
      setEditOpen(false);
      showToast(t("profile.updated"), "success");
    }
  };

  const onChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      showToast(t("register.passwordsDontMatch"), "error");
      return;
    }
    if (newPassword.length < 6) {
      showToast(t("register.passwordMin"), "error");
      return;
    }
    setBusy(true);
    const ok = await changePassword({ currentPassword, newPassword });
    setBusy(false);
    if (ok) {
      setPasswordOpen(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      showToast(t("profile.passwordChanged"), "success");
    }
  };

  const planLabel =
    currentUser.role === "admin" ? "Admin" : currentUser.plan === "vip" ? "Premium" : "Free";

  return (
    <div className="content-narrow">
      <h1 style={{ marginBottom: 18 }}>{t("nav.profile")}</h1>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 18 }}>
          <div style={{ position: "relative" }}>
            <Avatar
              name={currentUser.username}
              url={currentUser.avatarUrl}
              size={78}
              online={currentUser.isOnline || undefined}
            />
            <button
              className="icon-btn"
              disabled={busy}
              style={{
                position: "absolute",
                right: -6,
                bottom: -6,
                background: "var(--surface)",
                border: "1px solid var(--border-strong)",
              }}
              title={t("profile.changeAvatar")}
              onClick={() => void onPickAvatar()}
            >
              <IconUpload style={{ width: 14, height: 14 }} />
            </button>
          </div>
          <div className="grow">
            <div className="row" style={{ gap: 8 }}>
              <h2>{currentUser.username}</h2>
              <span
                className="badge"
                style={{
                  background:
                    planLabel === "Free" ? "var(--surface-2)" : "var(--primary-soft)",
                  color: planLabel === "Free" ? "var(--text-muted)" : "var(--primary)",
                }}
              >
                {planLabel}
              </span>
            </div>
            <div className="text-small text-muted">{currentUser.email}</div>
            {currentUser.bio && (
              <div className="text-small" style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>
                {currentUser.bio}
              </div>
            )}
            <div className="text-xs text-faint" style={{ marginTop: 6 }}>
              {t("profile.memberSince", {
                date: formatDate(currentUser.createdAt, lang),
              })}
            </div>
          </div>
        </div>
        <div className="divider" />
        <div className="row">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setUsername(currentUser.username);
              setEmail(currentUser.email);
              setBio(currentUser.bio ?? "");
              clearError();
              setEditOpen(true);
            }}
          >
            <IconEdit /> {t("profile.editProfile")}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              clearError();
              setPasswordOpen(true);
            }}
          >
            <IconLock /> {t("profile.changePassword")}
          </button>
        </div>
      </div>

      {editOpen && (
        <Modal
          title={t("profile.editProfile")}
          onClose={() => setEditOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setEditOpen(false)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={() => void onSaveProfile()}>
                {t("common.save")}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field-label">{t("register.usernameLabel")}</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} />
          </div>
          <div className="field">
            <label className="field-label">{t("register.emailLabel")}</label>
            <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <div className="field-hint">{t("profile.emailChangeNote")}</div>
          </div>
          <div className="field">
            <label className="field-label">Bio</label>
            <textarea className="textarea" value={bio} onChange={(e) => setBio(e.target.value)} />
            <div className="field-hint">{t("profile.bioEncrypted")}</div>
          </div>
          {error && (
            <div className="text-small" style={{ color: "var(--danger)" }}>
              {error}
            </div>
          )}
        </Modal>
      )}

      {passwordOpen && (
        <Modal
          title={t("profile.changePassword")}
          onClose={() => setPasswordOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setPasswordOpen(false)}>
                {t("common.cancel")}
              </button>
              <button
                className="btn btn-primary"
                disabled={busy}
                onClick={() => void onChangePassword()}
              >
                {t("common.change")}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field-label">{t("profile.currentPassword")}</label>
            <input
              className="input"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label">{t("profile.newPassword")}</label>
            <input
              className="input"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label">{t("register.confirmPasswordLabel")}</label>
            <input
              className="input"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </div>
          {error && (
            <div className="text-small" style={{ color: "var(--danger)" }}>
              {error}
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
