import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { useAuth } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import type { UserModel } from "@/models/types";
import {
  getAllUsers,
  toggleUserActive,
  updateUserRole,
  updateUserPlan,
  lockUser,
  deleteUserDoc,
  adminResetUserPassword,
} from "@/services/authService";
import { getAdminStats, type AdminStats } from "@/services/adminStatsService";
import { createNotification } from "@/services/notificationService";
import { Avatar, ConfirmDialog, LoadingCenter, Modal, timeAgo } from "@/components/ui";
import {
  IconUsers,
  IconChart,
  IconLock,
  IconUnlock,
  IconTrash,
  IconKey,
  IconRefresh,
  IconBell,
} from "@/components/Icons";

type AdminTab = "users" | "stats" | "broadcast";

export function AdminScreen() {
  const { currentUser, isAdmin } = useAuth();
  const { t } = useI18n();
  const [tab, setTab] = useState<AdminTab>("users");

  if (!currentUser || !isAdmin) {
    return (
      <div className="content-narrow">
        <div className="card card-pad" style={{ textAlign: "center" }}>
          <h2>{t("admin.noAccess")}</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="content-wide">
      <h1 style={{ marginBottom: 16 }}>Admin</h1>
      <div className="tabs" style={{ marginBottom: 18 }}>
        <button className={`tab${tab === "users" ? " active" : ""}`} onClick={() => setTab("users")}>
          <IconUsers style={{ width: 14, height: 14 }} /> {t("admin.usersTab")}
        </button>
        <button className={`tab${tab === "stats" ? " active" : ""}`} onClick={() => setTab("stats")}>
          <IconChart style={{ width: 14, height: 14 }} /> {t("admin.statsTab")}
        </button>
        <button
          className={`tab${tab === "broadcast" ? " active" : ""}`}
          onClick={() => setTab("broadcast")}
        >
          <IconBell style={{ width: 14, height: 14 }} /> {t("admin.broadcastTab")}
        </button>
      </div>

      {tab === "users" && <AdminUsers />}
      {tab === "stats" && <AdminStatsView />}
      {tab === "broadcast" && <AdminBroadcast />}
    </div>
  );
}

function AdminUsers() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { t, lang } = useI18n();

  const [users, setUsers] = useState<UserModel[] | null>(null);
  const [searchText, setSearchText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<UserModel | null>(null);
  const [passwordTarget, setPasswordTarget] = useState<UserModel | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const reload = async () => setUsers(await getAllUsers());

  useEffect(() => {
    void reload();
  }, []);

  const filtered = useMemo(() => {
    if (!users) return [];
    const q = searchText.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (user) =>
        user.username.toLowerCase().includes(q) || user.email.toLowerCase().includes(q)
    );
  }, [users, searchText]);

  if (users === null) return <LoadingCenter />;

  const run = async (action: () => Promise<unknown>, successKey: string) => {
    try {
      await action();
      await reload();
      showToast(t(successKey), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-title">
          {t("admin.usersTab")} ({users.length})
        </div>
        <div className="row">
          <input
            className="input"
            style={{ width: 220 }}
            placeholder={`${t("search.title")}…`}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <button className="icon-btn" onClick={() => void reload()}>
            <IconRefresh />
          </button>
        </div>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>{t("admin.colUser")}</th>
            <th>{t("admin.colRole")}</th>
            <th>{t("admin.colPlan")}</th>
            <th>{t("admin.colStatus")}</th>
            <th>{t("admin.colLastSeen")}</th>
            <th style={{ width: 150 }} />
          </tr>
        </thead>
        <tbody>
          {filtered.map((user) => {
            const isSelf = user.id === currentUser?.id;
            return (
              <tr key={user.id}>
                <td>
                  <div className="row">
                    <Avatar
                      name={user.username}
                      url={user.avatarUrl}
                      size={30}
                      online={user.isOnline}
                    />
                    <div>
                      <div style={{ fontWeight: 600 }}>{user.username}</div>
                      <div className="text-xs text-muted">{user.email}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <select
                    className="select"
                    style={{ width: 110, padding: "4px 26px 4px 8px" }}
                    value={user.role}
                    disabled={isSelf}
                    onChange={(e) =>
                      void run(() => updateUserRole(user.id, e.target.value), "admin.roleChanged")
                    }
                  >
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td>
                  <select
                    className="select"
                    style={{ width: 100, padding: "4px 26px 4px 8px" }}
                    value={user.plan}
                    onChange={(e) =>
                      void run(() => updateUserPlan(user.id, e.target.value), "admin.planChanged")
                    }
                  >
                    <option value="free">Free</option>
                    <option value="vip">VIP</option>
                  </select>
                </td>
                <td>
                  <div className="row row-wrap" style={{ gap: 4 }}>
                    <span
                      className="badge"
                      style={{
                        background: user.isActive ? "var(--success-soft)" : "var(--danger-soft)",
                        color: user.isActive ? "var(--success)" : "var(--danger)",
                        cursor: "pointer",
                      }}
                      onClick={() =>
                        void run(() => toggleUserActive(user.id), "admin.activeToggled")
                      }
                    >
                      {user.isActive ? t("admin.active") : t("admin.inactive")}
                    </span>
                    {user.locked && (
                      <span className="badge" style={{ background: "var(--warning-soft)", color: "var(--warning)" }}>
                        {t("admin.locked")}
                      </span>
                    )}
                  </div>
                </td>
                <td className="text-xs text-muted">
                  {user.lastSeenAt ? timeAgo(user.lastSeenAt, lang) : "—"}
                </td>
                <td>
                  <div className="row" style={{ gap: 2, justifyContent: "flex-end" }}>
                    <button
                      className="icon-btn"
                      title={user.locked ? t("admin.unlock") : t("admin.lock")}
                      disabled={isSelf}
                      onClick={() =>
                        void run(() => lockUser(user.id, !user.locked), "admin.lockToggled")
                      }
                    >
                      {user.locked ? <IconUnlock /> : <IconLock />}
                    </button>
                    <button
                      className="icon-btn"
                      title={t("admin.resetPassword")}
                      onClick={() => setPasswordTarget(user)}
                    >
                      <IconKey />
                    </button>
                    <button
                      className="icon-btn"
                      title={t("common.delete")}
                      disabled={isSelf}
                      onClick={() => setDeleteTarget(user)}
                    >
                      <IconTrash />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {deleteTarget && (
        <ConfirmDialog
          title={t("admin.deleteUserTitle")}
          message={t("admin.deleteUserConfirm", { username: deleteTarget.username })}
          confirmLabel={t("common.delete")}
          danger
          onConfirm={() => {
            void run(() => deleteUserDoc(deleteTarget.id), "admin.userDeleted");
            setDeleteTarget(null);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {passwordTarget && (
        <Modal
          title={t("admin.resetPassword")}
          onClose={() => setPasswordTarget(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setPasswordTarget(null)}>
                {t("common.cancel")}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  void adminResetUserPassword(passwordTarget.id, newPassword).then(
                    (ok) => {
                      showToast(
                        ok ? t("admin.passwordReset") : t("common.error"),
                        ok ? "success" : "error"
                      );
                      setPasswordTarget(null);
                      setNewPassword("");
                    }
                  );
                }}
              >
                {t("common.ok")}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field-label">
              {t("admin.newPasswordFor", { username: passwordTarget.username })}
            </label>
            <input
              className="input"
              type="password"
              autoFocus
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

function AdminStatsView() {
  const { t } = useI18n();
  const [stats, setStats] = useState<AdminStats | null>(null);

  useEffect(() => {
    void getAdminStats().then(setStats);
  }, []);

  if (!stats) return <LoadingCenter />;

  const monthData = Object.entries(stats.projectsByMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, count]) => ({ month, count }));

  const statusData = Object.entries(stats.projectsByStatus).map(([status, count]) => ({
    status,
    count,
  }));

  return (
    <div>
      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-value">{stats.totalUsers}</div>
          <div className="stat-label">{t("admin.totalUsers")}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.activeUsers}</div>
          <div className="stat-label">{t("admin.activeUsers")}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.totalProjects}</div>
          <div className="stat-label">{t("admin.totalProjects")}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.completedProjects}</div>
          <div className="stat-label">{t("home.completedProjects")}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.totalCustomers}</div>
          <div className="stat-label">{t("admin.totalCustomers")}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.totalTimeTrackedHours}h</div>
          <div className="stat-label">{t("admin.hoursTracked")}</div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div className="card card-pad">
          <div className="section-title">{t("admin.projectsPerMonth")}</div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="month" fontSize={11} stroke="var(--text-muted)" />
                <YAxis allowDecimals={false} fontSize={11} stroke="var(--text-muted)" />
                <Tooltip />
                <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card card-pad">
          <div className="section-title">{t("admin.projectsByStatus")}</div>
          <div style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" allowDecimals={false} fontSize={11} stroke="var(--text-muted)" />
                <YAxis type="category" dataKey="status" width={110} fontSize={11} stroke="var(--text-muted)" />
                <Tooltip />
                <Bar dataKey="count" fill="var(--accent)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <div className="card-title">{t("admin.topUsers")}</div>
        </div>
        {stats.topUsers.map((user, index) => (
          <div key={user.userId} className="list-row">
            <span className="text-small mono text-faint" style={{ width: 22 }}>
              #{index + 1}
            </span>
            <Avatar name={user.userName} size={28} />
            <span className="grow text-small" style={{ fontWeight: 600 }}>
              {user.userName}
            </span>
            <span className="badge" style={{ background: "var(--primary-soft)", color: "var(--primary)" }}>
              {user.projectCount} {t("nav.projects")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminBroadcast() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { t } = useI18n();
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState(0);
  const [sending, setSending] = useState(false);

  const onSend = async () => {
    if (!currentUser || !title.trim() || !message.trim()) return;
    setSending(true);
    try {
      await createNotification({
        senderId: currentUser.id,
        senderName: currentUser.username,
        title: title.trim(),
        message: message.trim(),
        type: "system",
        priority,
      });
      setTitle("");
      setMessage("");
      showToast(t("admin.broadcastSent"), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="card card-pad" style={{ maxWidth: 620 }}>
      <div className="section-title">{t("admin.broadcastTitle")}</div>
      <p className="text-small text-muted" style={{ marginBottom: 12 }}>
        {t("admin.broadcastDescription")}
      </p>
      <div className="field">
        <label className="field-label">{t("admin.broadcastSubject")}</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="field">
        <label className="field-label">{t("admin.broadcastMessage")}</label>
        <textarea
          className="textarea"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="field-label">{t("admin.broadcastPriority")}</label>
        <select
          className="select"
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value))}
        >
          <option value={0}>Normal</option>
          <option value={1}>{t("admin.priorityHigh")}</option>
        </select>
      </div>
      <button
        className="btn btn-primary"
        disabled={sending || !title.trim() || !message.trim()}
        onClick={() => void onSend()}
      >
        <IconBell /> {t("admin.sendBroadcast")}
      </button>
    </div>
  );
}
