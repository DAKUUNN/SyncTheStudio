import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAuth } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import {
  isProjectOverdue,
  priorityColor,
  priorityLabel,
  type ProjectModel,
  type CustomStatus,
} from "@/models/types";
import {
  getProject,
  getSharedProject,
  deleteProject,
  updateProjectStatus,
  leaveSharedProject,
  addHistoryEntry,
} from "@/services/projectService";
import {
  getStatuses,
  labelForStatusId,
  colorForStatusId,
} from "@/services/customizationService";
import { Badge, ConfirmDialog, LoadingCenter, formatDate, formatDateTime } from "@/components/ui";
import {
  IconArrowLeft,
  IconEdit,
  IconTrash,
  IconLink,
  IconInfo,
  IconFile,
  IconUsers,
  IconMessage,
  IconCheckCircle,
  IconClock,
  IconHistory,
  IconLogout,
  IconAlert,
} from "@/components/Icons";
import { FilesTab } from "./FilesTab";
import { TeamTab } from "./TeamTab";
import { ChatTab } from "./ChatTab";
import { TasksTab } from "./TasksTab";
import { TimeTab } from "./TimeTab";
import { HistoryTab } from "./HistoryTab";
import { ProjectDetailTour } from "@/components/ProjectDetailTour";

type DetailTab = "info" | "files" | "team" | "chat" | "tasks" | "time" | "history";

export function ProjectDetailScreen() {
  const { projectId } = useParams<{ projectId: string }>();
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  const [project, setProject] = useState<ProjectModel | null>(null);
  const [statuses, setStatuses] = useState<CustomStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DetailTab>("info");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const reload = useCallback(async () => {
    if (!currentUser || !projectId) return;
    let loaded = await getProject(currentUser.id, projectId);
    if (!loaded) loaded = await getSharedProject(projectId);
    setProject(loaded);
    setLoading(false);
  }, [currentUser?.id, projectId]);

  useEffect(() => {
    void reload();
    if (currentUser) void getStatuses(currentUser.id).then(setStatuses);
  }, [reload, currentUser?.id]);

  const isOwner = useMemo(
    () =>
      !!project &&
      !!currentUser &&
      (project.ownerId === currentUser.id || project.ownerId.trim() === ""),
    [project, currentUser]
  );

  const onStatusChange = async (statusId: string) => {
    if (!currentUser || !project) return;
    try {
      await updateProjectStatus(currentUser.id, project.id, statusId);
      await addHistoryEntry(project.id, currentUser.id, currentUser.username, "Status geändert", {
        fieldName: "Status",
        oldValue: labelForStatusId(project.statusValue, statuses),
        newValue: labelForStatusId(statusId, statuses),
      });
      await reload();
      showToast(t("projectDetail.statusUpdated"), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  const onDelete = async () => {
    if (!currentUser || !project) return;
    setConfirmDelete(false);
    try {
      await deleteProject(currentUser.id, project.id);
      showToast(t("projectDetail.deleted", { name: project.name }), "success");
      navigate("/projects");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  const onLeave = async () => {
    if (!currentUser || !project) return;
    setConfirmLeave(false);
    try {
      await leaveSharedProject(project.id, currentUser.id);
      showToast(t("projectDetail.left"), "success");
      navigate("/projects");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  if (!currentUser) return null;
  if (loading) return <LoadingCenter />;
  if (!project) {
    return (
      <div className="content-narrow">
        <div className="card card-pad" style={{ textAlign: "center" }}>
          <h2>{t("projectDetail.notFound")}</h2>
          <button
            className="btn btn-secondary"
            style={{ marginTop: 12 }}
            onClick={() => navigate("/projects")}
          >
            <IconArrowLeft /> {t("nav.projects")}
          </button>
        </div>
      </div>
    );
  }

  const tabs: { id: DetailTab; label: string; icon: React.ReactNode }[] = [
    { id: "info", label: t("projectDetail.tabInfo"), icon: <IconInfo style={{ width: 14, height: 14 }} /> },
    { id: "files", label: t("projectDetail.tabFiles"), icon: <IconFile style={{ width: 14, height: 14 }} /> },
    { id: "team", label: t("projectDetail.tabTeam"), icon: <IconUsers style={{ width: 14, height: 14 }} /> },
    { id: "chat", label: t("projectDetail.tabChat"), icon: <IconMessage style={{ width: 14, height: 14 }} /> },
    { id: "tasks", label: t("projectDetail.tabTasks"), icon: <IconCheckCircle style={{ width: 14, height: 14 }} /> },
    { id: "time", label: t("projectDetail.tabTime"), icon: <IconClock style={{ width: 14, height: 14 }} /> },
    { id: "history", label: t("projectDetail.tabHistory"), icon: <IconHistory style={{ width: 14, height: 14 }} /> },
  ];

  return (
    <div className="content-wide">
      <div className="row row-between row-wrap" style={{ marginBottom: 14 }}>
        <div className="row" style={{ minWidth: 0 }}>
          <button className="icon-btn" onClick={() => navigate("/projects")}>
            <IconArrowLeft />
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 className="truncate">{project.name}</h1>
            <div className="text-small text-muted truncate">
              {project.customerName || "—"} · {project.projectType}
            </div>
          </div>
        </div>
        <div className="row row-wrap">
          <select
            className="select"
            style={{ width: "auto" }}
            value={project.statusValue}
            onChange={(e) => void onStatusChange(e.target.value)}
          >
            {statuses.map((status) => (
              <option key={status.id} value={status.id}>
                {labelForStatusId(status.id, statuses)}
              </option>
            ))}
            {!statuses.some((s) => s.id === project.statusValue) && (
              <option value={project.statusValue}>
                {labelForStatusId(project.statusValue, statuses)}
              </option>
            )}
          </select>
          <button
            className="btn btn-secondary"
            onClick={() => navigate(`/projects/${project.id}/edit`)}
          >
            <IconEdit /> {t("common.edit")}
          </button>
          {isOwner ? (
            <button className="btn btn-danger-soft btn-sm" onClick={() => setConfirmDelete(true)}>
              <IconTrash /> {t("common.delete")}
            </button>
          ) : (
            <button className="btn btn-secondary btn-sm" onClick={() => setConfirmLeave(true)}>
              <IconLogout /> {t("projectDetail.leave")}
            </button>
          )}
        </div>
      </div>

      <div className="row row-wrap" style={{ marginBottom: 14, gap: 8 }}>
        <Badge color={colorForStatusId(project.statusValue, statuses)}>
          {labelForStatusId(project.statusValue, statuses)}
        </Badge>
        <Badge color={priorityColor(project.priority)}>
          {priorityLabel(project.priority)}
        </Badge>
        {project.deadline && (
          <Badge color={isProjectOverdue(project) ? "#DC2626" : "#64748B"}>
            {isProjectOverdue(project) && (
              <IconAlert style={{ width: 12, height: 12 }} />
            )}
            {formatDateTime(project.deadline, lang)}
          </Badge>
        )}
        {project.bpm != null && <Badge color="#8B5CF6">{project.bpm} BPM</Badge>}
        {project.musicalKey && <Badge color="#0EA5A4">{project.musicalKey}</Badge>}
      </div>

      <div className="tabs" style={{ marginBottom: 18 }}>
        {tabs.map((item) => (
          <button
            key={item.id}
            data-tour={`project-tab-${item.id}`}
            className={`tab${tab === item.id ? " active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {tab === "info" && (
        <InfoTab project={project} statuses={statuses} />
      )}
      {tab === "files" && (
        <FilesTab project={project} isOwner={isOwner} onChanged={reload} />
      )}
      {tab === "team" && (
        <TeamTab project={project} isOwner={isOwner} onChanged={reload} />
      )}
      {tab === "chat" && <ChatTab project={project} />}
      {tab === "tasks" && <TasksTab project={project} />}
      {tab === "time" && <TimeTab project={project} />}
      {tab === "history" && <HistoryTab project={project} />}

      {confirmDelete && (
        <ConfirmDialog
          title={t("projectDetail.deleteTitle")}
          message={t("projectDetail.deleteConfirm", { name: project.name })}
          confirmLabel={t("common.delete")}
          danger
          onConfirm={() => void onDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      {confirmLeave && (
        <ConfirmDialog
          title={t("projectDetail.leaveTitle")}
          message={t("projectDetail.leaveConfirm", { name: project.name })}
          confirmLabel={t("projectDetail.leave")}
          danger
          onConfirm={() => void onLeave()}
          onCancel={() => setConfirmLeave(false)}
        />
      )}

      <ProjectDetailTour ready={tab === "info"} />
    </div>
  );
}

function InfoTab({
  project,
  statuses,
}: {
  project: ProjectModel;
  statuses: CustomStatus[];
}) {
  const { t, lang } = useI18n();
  const { showToast } = useToast();

  const openExternal = async (url: string) => {
    try {
      await openUrl(url);
    } catch {
      showToast(t("common.error"), "error");
    }
  };

  const infoRows: { label: string; value: React.ReactNode }[] = [
    { label: t("projectDetail.infoCustomer"), value: project.customerName || "—" },
    { label: t("projectDetail.infoType"), value: project.projectType },
    {
      label: t("projectDetail.infoStatus"),
      value: labelForStatusId(project.statusValue, statuses),
    },
    { label: t("projectDetail.infoPriority"), value: priorityLabel(project.priority) },
    {
      label: t("projectDetail.infoDeadline"),
      value: project.deadline ? formatDateTime(project.deadline, lang) : "—",
    },
    { label: "BPM", value: project.bpm ?? "—" },
    { label: t("createProject.keyLabel"), value: project.musicalKey || "—" },
    { label: t("projectDetail.infoCategory"), value: project.category || "—" },
    {
      label: t("projectDetail.infoCreated"),
      value: formatDate(project.createdAt, lang),
    },
    {
      label: t("projectDetail.infoUpdated"),
      value: formatDate(project.updatedAt, lang),
    },
  ];

  const customFieldEntries = [
    project.customField1,
    project.customField2,
    project.customField3,
    project.customField4,
    project.customField5,
  ]
    .map((value, index) => ({ value, index }))
    .filter((entry) => entry.value && entry.value.trim());

  return (
    <div
      className="detail-2col-grid"
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
        gap: 16,
        alignItems: "start",
      }}
    >
      <div className="card">
        <div className="card-header">
          <div className="card-title">{t("projectDetail.tabInfo")}</div>
        </div>
        <div className="card-pad" style={{ paddingTop: 10 }}>
          {infoRows.map((row) => (
            <div
              key={row.label}
              className="row row-between"
              style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}
            >
              <span className="text-small text-muted">{row.label}</span>
              <span className="text-small" style={{ fontWeight: 600, textAlign: "right" }}>
                {row.value}
              </span>
            </div>
          ))}
          {customFieldEntries.length > 0 && (
            <>
              <div className="section-title" style={{ marginTop: 16 }}>
                {t("createProject.sectionCustom")}
              </div>
              {customFieldEntries.map((entry) => (
                <div
                  key={entry.index}
                  className="row row-between"
                  style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}
                >
                  <span className="text-small text-muted">Custom {entry.index + 1}</span>
                  <span className="text-small" style={{ fontWeight: 600 }}>
                    {entry.value}
                  </span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card card-pad">
          <div className="section-title">{t("projectDetail.linksTitle")}</div>
          {project.workspaceLink ? (
            <button
              className="btn btn-secondary btn-block"
              style={{ justifyContent: "flex-start", marginBottom: 8 }}
              onClick={() => void openExternal(project.workspaceLink!)}
            >
              <IconLink /> Workspace
            </button>
          ) : null}
          {project.referenceLink ? (
            <button
              className="btn btn-secondary btn-block"
              style={{ justifyContent: "flex-start", marginBottom: 8 }}
              onClick={() => void openExternal(project.referenceLink!)}
            >
              <IconLink /> {t("projectDetail.referenceLink")}
            </button>
          ) : null}
          {project.referenceFileUrl ? (
            <button
              className="btn btn-secondary btn-block"
              style={{ justifyContent: "flex-start", marginBottom: 8 }}
              onClick={() => void openExternal(project.referenceFileUrl!)}
            >
              <IconFile />
              <span className="truncate">
                {project.referenceFileName || t("projectDetail.referenceFile")}
              </span>
            </button>
          ) : null}
          {!project.workspaceLink && !project.referenceLink && !project.referenceFileUrl && (
            <div className="text-small text-muted">{t("projectDetail.noLinks")}</div>
          )}
        </div>

        {project.dawProjectPath && (
          <div className="card card-pad">
            <div className="section-title">{t("createProject.dawPathLabel")}</div>
            <div className="mono text-xs" style={{ wordBreak: "break-all" }}>
              {project.dawProjectPath}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
