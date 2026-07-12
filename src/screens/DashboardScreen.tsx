import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/stores/authStore";
import { useI18n } from "@/i18n";
import {
  isProjectOverdue,
  priorityColor,
  priorityLabel,
  type ProjectModel,
  type CustomStatus,
} from "@/models/types";
import { watchProjects, watchSharedProjects } from "@/services/projectService";
import { getStatuses, labelForStatusId, colorForStatusId } from "@/services/customizationService";
import { Badge, formatDate } from "@/components/ui";
import {
  IconFolder,
  IconUsers,
  IconClock,
  IconCheckCircle,
  IconPlus,
  IconInbox,
  IconAlert,
  IconCalendar,
  IconSearch,
} from "@/components/Icons";

type ReminderFocus = "today" | "week" | "overdue";

export function DashboardScreen() {
  const { currentUser } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  const [ownProjects, setOwnProjects] = useState<ProjectModel[]>([]);
  const [sharedProjects, setSharedProjects] = useState<ProjectModel[]>([]);
  const [statuses, setStatuses] = useState<CustomStatus[]>([]);
  const [focus, setFocus] = useState<ReminderFocus>("today");

  useEffect(() => {
    if (!currentUser) return;
    const unsubOwn = watchProjects(currentUser.id, setOwnProjects);
    const unsubShared = watchSharedProjects(currentUser.id, setSharedProjects);
    void getStatuses(currentUser.id).then(setStatuses);
    return () => {
      unsubOwn();
      unsubShared();
    };
  }, [currentUser?.id]);

  const allProjects = useMemo(() => {
    const map = new Map<string, ProjectModel>();
    for (const project of [...ownProjects, ...sharedProjects]) {
      map.set(project.id, project);
    }
    return [...map.values()];
  }, [ownProjects, sharedProjects]);

  const stats = useMemo(() => {
    const active = allProjects.filter((p) => p.statusValue !== "abgeschlossen");
    const completed = allProjects.filter((p) => p.statusValue === "abgeschlossen");
    const overdue = active.filter(isProjectOverdue);
    const favorites = allProjects.filter((p) => p.isFavorite);
    return { active, completed, overdue, favorites };
  }, [allProjects]);

  const reminders = useMemo(() => {
    const now = new Date();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const endOfWeek = new Date(endOfToday.getTime() + 6 * 24 * 3600 * 1000);
    const active = allProjects.filter(
      (p) => p.deadline && p.statusValue !== "abgeschlossen"
    );
    const list = active.filter((p) => {
      const deadline = p.deadline!;
      switch (focus) {
        case "today":
          return deadline >= now && deadline <= endOfToday;
        case "week":
          return deadline >= now && deadline <= endOfWeek;
        case "overdue":
          return deadline < now;
      }
    });
    return list.sort((a, b) => a.deadline!.getTime() - b.deadline!.getTime());
  }, [allProjects, focus]);

  const recentProjects = useMemo(
    () =>
      [...allProjects]
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        .slice(0, 6),
    [allProjects]
  );

  if (!currentUser) return null;

  const focusLabels: Record<ReminderFocus, string> = {
    today: t("home.focusToday"),
    week: t("home.focusWeek"),
    overdue: t("home.focusOverdue"),
  };

  return (
    <div className="content-wide">
      <div className="row row-between" style={{ marginBottom: 20 }}>
        <div>
          <h1>
            {t("home.welcome", { username: currentUser.username })}
          </h1>
          <div className="text-small text-muted">
            {new Date().toLocaleDateString(lang, {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => navigate("/projects/new")}>
          <IconPlus /> {t("home.newProject")}
        </button>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <StatCard
          icon={<IconFolder />}
          color="var(--primary)"
          value={stats.active.length}
          label={t("home.activeProjects")}
          onClick={() => navigate("/projects")}
        />
        <StatCard
          icon={<IconCheckCircle />}
          color="var(--success)"
          value={stats.completed.length}
          label={t("home.completedProjects")}
          onClick={() => navigate("/projects?filter=abgeschlossen")}
        />
        <StatCard
          icon={<IconAlert />}
          color="var(--danger)"
          value={stats.overdue.length}
          label={t("home.overdue")}
          onClick={() => navigate("/projects")}
        />
        <StatCard
          icon={<IconUsers />}
          color="var(--accent)"
          value={sharedProjects.filter((p) => p.ownerId !== currentUser.id).length}
          label={t("home.sharedWithMe")}
          onClick={() => navigate("/projects?tab=shared")}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.6fr) minmax(0, 1fr)",
          gap: 16,
          alignItems: "start",
        }}
      >
        <div className="card">
          <div className="card-header">
            <div className="card-title">{t("home.recentProjects")}</div>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate("/projects")}>
              {t("home.showAll")}
            </button>
          </div>
          {recentProjects.length === 0 ? (
            <div className="empty-state">
              <IconFolder />
              <h3>{t("projects.emptyTitle")}</h3>
              <div className="text-small text-muted">{t("projects.emptySubtitle")}</div>
            </div>
          ) : (
            recentProjects.map((project) => (
              <div
                key={project.id}
                className="list-row clickable"
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <div
                  style={{
                    width: 8,
                    height: 34,
                    borderRadius: 4,
                    background: colorForStatusId(project.statusValue, statuses),
                    flexShrink: 0,
                  }}
                />
                <div className="grow" style={{ minWidth: 0 }}>
                  <div className="truncate" style={{ fontWeight: 600 }}>
                    {project.name}
                  </div>
                  <div className="text-xs text-muted truncate">
                    {project.customerName || project.projectType}
                  </div>
                </div>
                <Badge color={colorForStatusId(project.statusValue, statuses)}>
                  {labelForStatusId(project.statusValue, statuses)}
                </Badge>
                <Badge color={priorityColor(project.priority)}>
                  {priorityLabel(project.priority)}
                </Badge>
              </div>
            ))
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card-header">
              <div className="card-title">{t("home.smartReminders")}</div>
            </div>
            <div className="card-pad" style={{ paddingTop: 12 }}>
              <div className="row row-wrap" style={{ marginBottom: 12 }}>
                {(["today", "week", "overdue"] as ReminderFocus[]).map((key) => (
                  <button
                    key={key}
                    className={`chip${focus === key ? " active" : ""}`}
                    onClick={() => setFocus(key)}
                  >
                    {key === "overdue" && <IconAlert style={{ width: 13, height: 13 }} />}
                    {key !== "overdue" && <IconCalendar style={{ width: 13, height: 13 }} />}
                    {focusLabels[key]}
                  </button>
                ))}
              </div>
              {reminders.length === 0 ? (
                <div className="text-small text-muted" style={{ padding: "6px 0" }}>
                  {t("home.noDeadlines")}
                </div>
              ) : (
                reminders.slice(0, 6).map((project) => (
                  <div
                    key={project.id}
                    className="row clickable"
                    style={{ padding: "7px 0", cursor: "pointer" }}
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    <IconClock
                      style={{
                        width: 15,
                        height: 15,
                        color: focus === "overdue" ? "var(--danger)" : "var(--warning)",
                        flexShrink: 0,
                      }}
                    />
                    <span className="grow truncate text-small" style={{ fontWeight: 500 }}>
                      {project.name}
                    </span>
                    <span className="text-xs text-muted">
                      {formatDate(project.deadline, lang)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card card-pad">
            <div className="section-title">{t("home.quickActions")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <QuickAction
                icon={<IconPlus />}
                label={t("home.newProject")}
                onClick={() => navigate("/projects/new")}
              />
              <QuickAction
                icon={<IconUsers />}
                label={t("nav.customers")}
                onClick={() => navigate("/customers")}
              />
              <QuickAction
                icon={<IconInbox />}
                label={t("inbox.title")}
                onClick={() => navigate("/inbox")}
              />
              <QuickAction
                icon={<IconSearch />}
                label={t("search.title")}
                onClick={() => navigate("/search")}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  color,
  value,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  color: string;
  value: number;
  label: string;
  onClick?: () => void;
}) {
  return (
    <div
      className="stat-card"
      style={{ cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
    >
      <div
        className="stat-icon"
        style={{
          background: `color-mix(in srgb, ${color} 13%, transparent)`,
          color,
        }}
      >
        {icon}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function QuickAction({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="btn btn-secondary"
      style={{ justifyContent: "flex-start", padding: "10px 12px" }}
      onClick={onClick}
    >
      {icon} <span className="truncate">{label}</span>
    </button>
  );
}
