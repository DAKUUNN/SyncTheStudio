import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/stores/authStore";
import { useI18n } from "@/i18n";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@/models/types";
import { watchNotifications } from "@/services/notificationService";
import {
  watchPendingInvitations,
  finalizeAcceptedInvitationsForOwner,
} from "@/services/invitationService";
import { getProjects } from "@/services/projectService";
import { Avatar } from "./ui";
import {
  IconHome,
  IconFolder,
  IconUsers,
  IconUser,
  IconInbox,
  IconSearch,
  IconBell,
  IconSettings,
  IconShield,
  IconLogout,
  IconPlus,
  IconExport,
} from "./Icons";

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  action: () => void;
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { currentUser, isAdmin, logout } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  const [unreadCount, setUnreadCount] = useState(0);
  const [inboxCount, setInboxCount] = useState(0);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    const prefs: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES;
    const unsubNotifications = watchNotifications(
      currentUser.id,
      prefs,
      "unread",
      (items) => setUnreadCount(items.length)
    );
    const unsubInvitations = watchPendingInvitations(currentUser.id, (items) =>
      setInboxCount(items.length)
    );
    void finalizeAcceptedInvitationsForOwner(currentUser.id, currentUser.username);
    return () => {
      unsubNotifications();
      unsubInvitations();
    };
  }, [currentUser?.id]);

  // Global shortcut: Cmd/Ctrl+K opens the command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        navigate("/projects/new");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  const navItems = useMemo(
    () => [
      { path: "/", icon: <IconHome className="nav-icon" />, label: t("nav.home") },
      {
        path: "/projects",
        icon: <IconFolder className="nav-icon" />,
        label: t("nav.projects"),
      },
      {
        path: "/customers",
        icon: <IconUsers className="nav-icon" />,
        label: t("nav.customers"),
      },
      {
        path: "/inbox",
        icon: <IconInbox className="nav-icon" />,
        label: t("inbox.title"),
        badge: inboxCount,
      },
    ],
    [t, inboxCount]
  );

  const bottomNavItems = useMemo(
    () => [
      {
        path: "/profile",
        icon: <IconUser className="nav-icon" />,
        label: t("nav.profile"),
      },
      {
        path: "/settings",
        icon: <IconSettings className="nav-icon" />,
        label: t("settings.title"),
      },
      ...(isAdmin
        ? [
            {
              path: "/admin",
              icon: <IconShield className="nav-icon" />,
              label: "Admin",
            },
          ]
        : []),
    ],
    [t, isAdmin]
  );

  const isActive = useCallback(
    (path: string) => {
      if (path === "/") return location.pathname === "/";
      return location.pathname.startsWith(path);
    },
    [location.pathname]
  );

  if (!currentUser) return null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img src="/logo.png" alt="" className="brand-logo" />
          <div>
            <div className="brand-name">{t("app.name")}</div>
            <div className="brand-tagline">{t("app.tagline")}</div>
          </div>
        </div>

        <div className="sidebar-section">
          <button
            className="btn btn-primary btn-block"
            onClick={() => navigate("/projects/new")}
          >
            <IconPlus /> {t("home.newProject")}
          </button>
        </div>

        <div className="sidebar-section">
          {navItems.map((item) => (
            <button
              key={item.path}
              className={`nav-item${isActive(item.path) ? " active" : ""}`}
              onClick={() => navigate(item.path)}
            >
              {item.icon}
              {item.label}
              {item.badge ? <span className="nav-badge">{item.badge}</span> : null}
            </button>
          ))}
        </div>

        <div className="sidebar-section">
          <div className="sidebar-label">{t("settings.title")}</div>
          {bottomNavItems.map((item) => (
            <button
              key={item.path}
              className={`nav-item${isActive(item.path) ? " active" : ""}`}
              onClick={() => navigate(item.path)}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
          <button className="nav-item" onClick={() => navigate("/export")}>
            <IconExport className="nav-icon" />
            {t("export.title")}
          </button>
        </div>

        <div className="sidebar-footer">
          <div className="row">
            <Avatar
              name={currentUser.username}
              url={currentUser.avatarUrl}
              size={34}
              online
            />
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="text-small truncate" style={{ fontWeight: 600 }}>
                {currentUser.username}
              </div>
              <div className="text-xs text-muted truncate">
                {currentUser.plan === "vip" ? "Premium" : currentUser.role === "admin" ? "Admin" : "Free"}
              </div>
            </div>
            <button
              className="icon-btn"
              title={t("common.logout")}
              onClick={() => void logout()}
            >
              <IconLogout />
            </button>
          </div>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setPaletteOpen(true)}
            style={{ minWidth: 220, justifyContent: "flex-start", fontWeight: 500 }}
          >
            <IconSearch style={{ width: 14, height: 14 }} />
            <span className="text-muted">{t("search.title")}…</span>
            <span className="kbd" style={{ marginLeft: "auto" }}>
              ⌘K
            </span>
          </button>
          <div className="topbar-spacer" />
          <button
            className="icon-btn"
            title={t("notifications.title")}
            onClick={() => navigate("/notifications")}
          >
            <IconBell />
            {unreadCount > 0 && (
              <span className="badge-dot">{unreadCount > 99 ? "99+" : unreadCount}</span>
            )}
          </button>
        </header>

        <main className="content">{children}</main>
      </div>

      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onNavigate={(path) => {
            setPaletteOpen(false);
            navigate(path);
          }}
        />
      )}
    </div>
  );
}

function CommandPalette({
  onClose,
  onNavigate,
}: {
  onClose: () => void;
  onNavigate: (path: string) => void;
}) {
  const { t } = useI18n();
  const { currentUser } = useAuth();
  const [search, setSearch] = useState("");
  const [projectItems, setProjectItems] = useState<PaletteItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!currentUser) return;
    void getProjects(currentUser.id).then((projects) => {
      setProjectItems(
        projects.slice(0, 40).map((project) => ({
          id: `project-${project.id}`,
          label: project.name,
          hint: project.customerName ?? project.projectType,
          action: () => onNavigate(`/projects/${project.id}`),
        }))
      );
    });
  }, [currentUser?.id, onNavigate]);

  const staticItems: PaletteItem[] = useMemo(
    () => [
      { id: "new-project", label: t("home.newProject"), action: () => onNavigate("/projects/new") },
      { id: "projects", label: t("nav.projects"), action: () => onNavigate("/projects") },
      { id: "customers", label: t("nav.customers"), action: () => onNavigate("/customers") },
      { id: "inbox", label: t("inbox.title"), action: () => onNavigate("/inbox") },
      { id: "search", label: t("search.title"), action: () => onNavigate("/search") },
      { id: "notifications", label: t("notifications.title"), action: () => onNavigate("/notifications") },
      { id: "settings", label: t("settings.title"), action: () => onNavigate("/settings") },
      { id: "profile", label: t("nav.profile"), action: () => onNavigate("/profile") },
      { id: "export", label: t("export.title"), action: () => onNavigate("/export") },
    ],
    [t, onNavigate]
  );

  const filtered = useMemo(() => {
    const all = [...staticItems, ...projectItems];
    const q = search.trim().toLowerCase();
    if (!q) return all.slice(0, 12);
    return all
      .filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          (item.hint?.toLowerCase().includes(q) ?? false)
      )
      .slice(0, 12);
  }, [search, staticItems, projectItems]);

  useEffect(() => setSelectedIndex(0), [search]);

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className="modal"
        style={{ alignSelf: "start", marginTop: 90 }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "14px 16px 8px" }}>
          <input
            autoFocus
            className="input"
            placeholder={`${t("search.title")}…`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelectedIndex((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter" && filtered[selectedIndex]) {
                filtered[selectedIndex].action();
              }
            }}
          />
        </div>
        <div style={{ maxHeight: 340, overflowY: "auto", padding: "0 8px 10px" }}>
          {filtered.map((item, index) => (
            <button
              key={item.id}
              className="nav-item"
              style={
                index === selectedIndex
                  ? { background: "var(--user-nav-indicator)", color: "var(--user-nav-selected)" }
                  : undefined
              }
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={item.action}
            >
              <span className="grow truncate" style={{ textAlign: "left" }}>
                {item.label}
              </span>
              {item.hint && <span className="text-xs text-faint">{item.hint}</span>}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="text-small text-muted" style={{ padding: 12 }}>
              {t("search.noResults")}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
