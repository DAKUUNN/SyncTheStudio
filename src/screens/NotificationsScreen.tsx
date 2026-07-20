import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/stores/authStore";
import { useI18n } from "@/i18n";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  isNotificationActionable,
  type NotificationModel,
  type NotificationPreferences,
} from "@/models/types";
import {
  watchNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  loadNotificationPreferences,
  type NotificationFeedFilter,
} from "@/services/notificationService";
import { EmptyState, timeAgo } from "@/components/ui";
import { IconBell, IconCheck, IconTrash } from "@/components/Icons";

const FILTERS: NotificationFeedFilter[] = [
  "all",
  "unread",
  "invitation",
  "deadline",
  "projectUpdate",
  "system",
  "chat",
];

export function NotificationsScreen() {
  const { currentUser } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  const [preferences, setPreferences] = useState<NotificationPreferences>(
    DEFAULT_NOTIFICATION_PREFERENCES
  );
  const [filter, setFilter] = useState<NotificationFeedFilter>("all");
  const [items, setItems] = useState<NotificationModel[]>([]);

  useEffect(() => {
    if (!currentUser) return;
    void loadNotificationPreferences(currentUser.id).then(setPreferences);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser) return;
    const unsubscribe = watchNotifications(currentUser.id, preferences, filter, setItems);
    return unsubscribe;
  }, [currentUser?.id, preferences, filter]);

  if (!currentUser) return null;

  const filterLabel = (value: NotificationFeedFilter): string => {
    switch (value) {
      case "all":
        return t("notifications.filterAll");
      case "unread":
        return t("notifications.filterUnread");
      case "invitation":
        return t("notifications.filterInvitations");
      case "deadline":
        return t("notifications.filterDeadlines");
      case "projectUpdate":
        return t("notifications.filterProjects");
      case "system":
        return t("notifications.filterSystem");
      case "chat":
        return t("notifications.filterChat");
    }
  };

  const typeColor = (type: string): string => {
    switch (type) {
      case "invitation":
        return "var(--primary)";
      case "deadline":
        return "var(--danger)";
      case "project_update":
        return "var(--accent)";
      case "chat":
      case "chat_message":
        return "var(--success)";
      default:
        return "var(--text-muted)";
    }
  };

  return (
    <div className="content-narrow">
      <div className="row row-between" style={{ marginBottom: 16 }}>
        <h1>{t("notifications.title")}</h1>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => void markAllAsRead(currentUser.id)}
        >
          <IconCheck /> {t("notifications.markAllRead")}
        </button>
      </div>

      <div className="row row-wrap" style={{ marginBottom: 16 }}>
        {FILTERS.map((value) => (
          <button
            key={value}
            className={`chip${filter === value ? " active" : ""}`}
            onClick={() => setFilter(value)}
          >
            {filterLabel(value)}
          </button>
        ))}
      </div>

      <div className="card">
        {items.length === 0 ? (
          <EmptyState icon={<IconBell />} title={t("notifications.emptyTitle")} />
        ) : (
          items.map((item) => (
            <div
              key={item.id}
              className="list-row clickable"
              style={{ opacity: item.isRead ? 0.62 : 1 }}
              onClick={() => {
                void markAsRead(item.id, currentUser.id);
                if (item.type === "invitation") navigate("/inbox");
                else if (item.projectId) {
                  navigate(`/projects/${item.projectId}`, {
                    state: item.screen ? { tab: item.screen } : undefined,
                  });
                }
              }}
            >
              <div
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 5,
                  background: item.isRead ? "var(--border-strong)" : typeColor(item.type),
                  flexShrink: 0,
                }}
              />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="text-small" style={{ fontWeight: item.isRead ? 500 : 700 }}>
                  {item.title}
                  {isNotificationActionable(item) && !item.isRead && (
                    <span
                      className="badge"
                      style={{
                        marginLeft: 6,
                        background: "var(--warning-soft)",
                        color: "var(--warning)",
                      }}
                    >
                      {t("notifications.actionRequired")}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted" style={{ whiteSpace: "pre-wrap" }}>
                  {item.message}
                </div>
                <div className="text-xs text-faint" style={{ marginTop: 2 }}>
                  {item.senderName ?? "System"} · {timeAgo(item.createdAt, lang)}
                </div>
              </div>
              <button
                className="icon-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteNotification(item.id);
                }}
              >
                <IconTrash />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
