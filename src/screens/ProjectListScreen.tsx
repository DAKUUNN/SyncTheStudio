import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import { useIsIOS } from "@/lib/platform";
import {
  isProjectOverdue,
  priorityColor,
  priorityLabel,
  PROJECT_PRIORITIES,
  type ProjectModel,
  type ProjectPriority,
  type CustomStatus,
} from "@/models/types";
import {
  watchProjects,
  watchSharedProjects,
  toggleFavorite,
  deleteProject,
  updateProjectStatus,
} from "@/services/projectService";
import {
  getStatuses,
  labelForStatusId,
  colorForStatusId,
  sortOrderForStatusId,
} from "@/services/customizationService";
import { Badge, ConfirmDialog, EmptyState, formatDate } from "@/components/ui";
import {
  IconPlus,
  IconFolder,
  IconStar,
  IconGrid,
  IconList,
  IconColumns,
  IconAlert,
  IconTrash,
  IconUsers,
} from "@/components/Icons";

type ViewMode = "grid" | "list" | "board";
type OwnershipTab = "all" | "own" | "shared";
type SortMode = "status" | "updated" | "deadline" | "name" | "priority";

const VIEW_MODE_KEY = "project_view_mode";

export function ProjectListScreen() {
  const { currentUser } = useAuth();
  const { t, lang } = useI18n();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [ownProjects, setOwnProjects] = useState<ProjectModel[]>([]);
  const [sharedProjects, setSharedProjects] = useState<ProjectModel[]>([]);
  const [statuses, setStatuses] = useState<CustomStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_MODE_KEY) as ViewMode) || "grid"
  );
  const [ownershipTab, setOwnershipTab] = useState<OwnershipTab>(
    searchParams.get("tab") === "shared" ? "shared" : "all"
  );
  const [statusFilter, setStatusFilter] = useState<string | null>(
    searchParams.get("filter")
  );
  const [priorityFilter, setPriorityFilter] = useState<ProjectPriority | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const isIOS = useIsIOS();
  // The board (kanban) view is desktop-only — horizontal drag columns
  // don't fit a phone. A previously stored "board" preference falls
  // back to the grid.
  const effectiveViewMode: ViewMode = isIOS && viewMode === "board" ? "grid" : viewMode;
  // mobile-only: the chip rows collapse behind a "Filter" toggle
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount =
    (ownershipTab !== "all" ? 1 : 0) +
    (statusFilter ? 1 : 0) +
    (priorityFilter ? 1 : 0) +
    (favoritesOnly ? 1 : 0);
  const [searchText, setSearchText] = useState("");
  const [sortMode, setSortMode] = useState<SortMode>("status");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    const unsubOwn = watchProjects(currentUser.id, (projects) => {
      setOwnProjects(projects);
      setLoading(false);
    });
    const unsubShared = watchSharedProjects(currentUser.id, setSharedProjects);
    void getStatuses(currentUser.id).then(setStatuses);
    return () => {
      unsubOwn();
      unsubShared();
    };
  }, [currentUser?.id]);

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  const allProjects = useMemo(() => {
    if (!currentUser) return [];
    const map = new Map<string, ProjectModel>();
    if (ownershipTab !== "shared") {
      for (const project of ownProjects) map.set(project.id, project);
    }
    if (ownershipTab !== "own") {
      for (const project of sharedProjects) {
        if (ownershipTab === "shared" && project.ownerId === currentUser.id) continue;
        if (!map.has(project.id)) map.set(project.id, project);
      }
    }
    return [...map.values()];
  }, [ownProjects, sharedProjects, ownershipTab, currentUser]);

  const filtered = useMemo(() => {
    let list = allProjects;
    if (statusFilter) {
      list = list.filter((p) => p.statusValue === statusFilter);
    }
    if (priorityFilter) {
      list = list.filter((p) => p.priority === priorityFilter);
    }
    if (favoritesOnly) {
      list = list.filter((p) => p.isFavorite);
    }
    const q = searchText.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.customerName?.toLowerCase().includes(q) ?? false) ||
          p.projectType.toLowerCase().includes(q)
      );
    }
    const priorityOrder: Record<ProjectPriority, number> = {
      dringend: 0,
      hoch: 1,
      mittel: 2,
      niedrig: 3,
    };

    const sorted = [...list];
    switch (sortMode) {
      case "status":
        sorted.sort((a, b) => {
          const byStatus =
            sortOrderForStatusId(a.statusValue, statuses) -
            sortOrderForStatusId(b.statusValue, statuses);
          if (byStatus !== 0) return byStatus;
          const byPriority = priorityOrder[a.priority] - priorityOrder[b.priority];
          if (byPriority !== 0) return byPriority;
          return b.updatedAt.getTime() - a.updatedAt.getTime();
        });
        break;
      case "updated":
        sorted.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        break;
      case "deadline":
        sorted.sort((a, b) => {
          const aTime = a.deadline?.getTime() ?? Infinity;
          const bTime = b.deadline?.getTime() ?? Infinity;
          return aTime - bTime;
        });
        break;
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "priority":
        sorted.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
        break;
    }
    return sorted;
  }, [allProjects, statusFilter, priorityFilter, favoritesOnly, searchText, sortMode, statuses]);

  const onToggleFavorite = async (project: ProjectModel) => {
    if (!currentUser) return;
    try {
      await toggleFavorite(currentUser.id, project.id, !project.isFavorite);
    } catch {
      showToast(t("common.error"), "error");
    }
  };

  const toggleSelected = (projectId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  const onBulkDelete = async () => {
    if (!currentUser) return;
    setConfirmBulkDelete(false);
    let deleted = 0;
    for (const id of selectedIds) {
      try {
        await deleteProject(currentUser.id, id);
        deleted++;
      } catch (e) {
        showToast((e as Error).message, "error");
      }
    }
    showToast(t("projects.bulkDeleted", { count: deleted }), "success");
    setSelectedIds(new Set());
    setSelectionMode(false);
  };

  if (!currentUser) return null;

  return (
    <div className="content-wide">
      <div className="row row-between row-wrap" style={{ marginBottom: 16 }}>
        <div>
          <h1>{t("nav.projects")}</h1>
          <div className="text-small text-muted">
            {t("projects.countLabel", { count: filtered.length })}
          </div>
        </div>
        <div className="row">
          {selectionMode ? (
            <>
              <span className="text-small text-muted">
                {t("projects.selectedCount", { count: selectedIds.size })}
              </span>
              <button
                className="btn btn-danger btn-sm"
                disabled={selectedIds.size === 0}
                onClick={() => setConfirmBulkDelete(true)}
              >
                <IconTrash /> {t("common.delete")}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setSelectionMode(false);
                  setSelectedIds(new Set());
                }}
              >
                {t("common.cancel")}
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setSelectionMode(true)}
              >
                {t("projects.select")}
              </button>
              <button className="btn btn-primary" onClick={() => navigate("/projects/new")}>
                <IconPlus /> {t("home.newProject")}
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16, paddingBottom: 14 }}>
        <div className="row row-wrap" style={{ marginBottom: 10 }}>
          <input
            className="input"
            style={{ maxWidth: 280 }}
            placeholder={`${t("search.title")}…`}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <select
            className="select"
            style={{ maxWidth: 180 }}
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
          >
            <option value="status">{t("projects.sortStatus")}</option>
            <option value="updated">{t("projects.sortUpdated")}</option>
            <option value="deadline">{t("projects.sortDeadline")}</option>
            <option value="name">{t("projects.sortName")}</option>
            <option value="priority">{t("projects.sortPriority")}</option>
          </select>
          <div className="grow" />
          <div className="row" style={{ gap: 4 }}>
            <button
              className={`icon-btn${viewMode === "grid" ? " active" : ""}`}
              style={viewMode === "grid" ? { color: "var(--primary)", background: "var(--primary-soft)" } : undefined}
              onClick={() => setViewMode("grid")}
              title="Grid"
            >
              <IconGrid />
            </button>
            <button
              className="icon-btn"
              style={viewMode === "list" ? { color: "var(--primary)", background: "var(--primary-soft)" } : undefined}
              onClick={() => setViewMode("list")}
              title="Liste"
            >
              <IconList />
            </button>
            {!isIOS && (
              <button
                className="icon-btn"
                style={viewMode === "board" ? { color: "var(--primary)", background: "var(--primary-soft)" } : undefined}
                onClick={() => setViewMode("board")}
                title="Board"
              >
                <IconColumns />
              </button>
            )}
          </div>
          <button
            className={`chip mobile-filter-toggle${filtersOpen || activeFilterCount > 0 ? " active" : ""}`}
            onClick={() => setFiltersOpen((v) => !v)}
          >
            {t("projects.filters")}
            {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
        </div>

        <div className={`row row-wrap project-filters-advanced${filtersOpen ? " open" : ""}`}>
          <button
            className={`chip${ownershipTab === "all" ? " active" : ""}`}
            onClick={() => setOwnershipTab("all")}
          >
            {t("projects.tabAll")}
          </button>
          <button
            className={`chip${ownershipTab === "own" ? " active" : ""}`}
            onClick={() => setOwnershipTab("own")}
          >
            {t("projects.tabOwn")}
          </button>
          <button
            className={`chip${ownershipTab === "shared" ? " active" : ""}`}
            onClick={() => setOwnershipTab("shared")}
          >
            <IconUsers style={{ width: 13, height: 13 }} /> {t("projects.tabShared")}
          </button>
          <span style={{ width: 1, height: 20, background: "var(--border)" }} />
          <button
            className={`chip${statusFilter === null ? " active" : ""}`}
            onClick={() => setStatusFilter(null)}
          >
            {t("projects.allStatuses")}
          </button>
          {statuses.map((status) => (
            <button
              key={status.id}
              className={`chip${statusFilter === status.id ? " active" : ""}`}
              onClick={() =>
                setStatusFilter(statusFilter === status.id ? null : status.id)
              }
            >
              <span
                className="dot"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  background: colorForStatusId(status.id, statuses),
                }}
              />
              {labelForStatusId(status.id, statuses)}
            </button>
          ))}
          <span style={{ width: 1, height: 20, background: "var(--border)" }} />
          <select
            className="select"
            style={{ width: "auto", padding: "4px 28px 4px 10px", fontSize: "0.7813rem" }}
            value={priorityFilter ?? ""}
            onChange={(e) =>
              setPriorityFilter((e.target.value || null) as ProjectPriority | null)
            }
          >
            <option value="">{t("projects.allPriorities")}</option>
            {PROJECT_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabel(priority)}
              </option>
            ))}
          </select>
          <button
            className={`chip${favoritesOnly ? " active" : ""}`}
            onClick={() => setFavoritesOnly((v) => !v)}
          >
            <IconStar style={{ width: 13, height: 13 }} /> {t("projects.favorites")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading-center">
          <div className="spinner spinner-lg" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<IconFolder />}
            title={t("projects.emptyTitle")}
            subtitle={t("projects.emptySubtitle")}
            action={
              <button className="btn btn-primary" onClick={() => navigate("/projects/new")}>
                <IconPlus /> {t("home.newProject")}
              </button>
            }
          />
        </div>
      ) : effectiveViewMode === "board" ? (
        <BoardView
          projects={filtered}
          statuses={statuses}
          onOpen={(id) => navigate(`/projects/${id}`)}
          onStatusChange={async (project, statusId) => {
            try {
              await updateProjectStatus(currentUser.id, project.id, statusId);
            } catch {
              showToast(t("common.error"), "error");
            }
          }}
        />
      ) : effectiveViewMode === "list" ? (
        <div className="card">
          {filtered.map((project) => (
            <div
              key={project.id}
              className="list-row clickable"
              onClick={() =>
                selectionMode
                  ? toggleSelected(project.id)
                  : navigate(`/projects/${project.id}`)
              }
            >
              {selectionMode && (
                <input
                  type="checkbox"
                  checked={selectedIds.has(project.id)}
                  onChange={() => toggleSelected(project.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
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
                <div className="row" style={{ gap: 6 }}>
                  <span className="truncate" style={{ fontWeight: 600 }}>
                    {project.name}
                  </span>
                  {project.isFavorite && (
                    <IconStar
                      style={{ width: 13, height: 13, color: "var(--warning)", fill: "var(--warning)" }}
                    />
                  )}
                  {project.sharedWith.length > 0 && (
                    <IconUsers style={{ width: 13, height: 13, color: "var(--text-faint)" }} />
                  )}
                </div>
                <div className="text-xs text-muted truncate">
                  {project.customerName || "—"} · {project.projectType}
                </div>
              </div>
              {project.deadline && (
                <span
                  className="text-xs"
                  style={{
                    color: isProjectOverdue(project) ? "var(--danger)" : "var(--text-muted)",
                    fontWeight: isProjectOverdue(project) ? 700 : 400,
                  }}
                >
                  {isProjectOverdue(project) && (
                    <IconAlert style={{ width: 12, height: 12, verticalAlign: -2 }} />
                  )}{" "}
                  {formatDate(project.deadline, lang)}
                </span>
              )}
              <Badge color={colorForStatusId(project.statusValue, statuses)}>
                {labelForStatusId(project.statusValue, statuses)}
              </Badge>
              <Badge color={priorityColor(project.priority)}>
                {priorityLabel(project.priority)}
              </Badge>
            </div>
          ))}
        </div>
      ) : (
        <div className="project-grid">
          {filtered.map((project) => (
            <div
              key={project.id}
              className={`project-card${selectedIds.has(project.id) ? " selected" : ""}`}
              onClick={() =>
                selectionMode
                  ? toggleSelected(project.id)
                  : navigate(`/projects/${project.id}`)
              }
            >
              <div className="row row-between">
                <Badge color={colorForStatusId(project.statusValue, statuses)}>
                  {labelForStatusId(project.statusValue, statuses)}
                </Badge>
                <button
                  className="icon-btn"
                  style={{ width: 26, height: 26 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    void onToggleFavorite(project);
                  }}
                >
                  <IconStar
                    style={{
                      width: 15,
                      height: 15,
                      color: project.isFavorite ? "var(--warning)" : "var(--text-faint)",
                      fill: project.isFavorite ? "var(--warning)" : "none",
                    }}
                  />
                </button>
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.9375rem" }} className="truncate">
                  {project.name}
                </div>
                <div className="text-xs text-muted truncate">
                  {project.customerName || "—"}
                </div>
              </div>
              <div className="row row-wrap" style={{ gap: 6 }}>
                <span className="chip" style={{ cursor: "default", pointerEvents: "none" }}>
                  {project.projectType}
                </span>
                <Badge color={priorityColor(project.priority)}>
                  {priorityLabel(project.priority)}
                </Badge>
              </div>
              <div className="row row-between text-xs text-muted" style={{ marginTop: "auto" }}>
                <span>
                  {project.deadline ? (
                    <span
                      style={
                        isProjectOverdue(project)
                          ? { color: "var(--danger)", fontWeight: 700 }
                          : undefined
                      }
                    >
                      {formatDate(project.deadline, lang)}
                    </span>
                  ) : (
                    t("projects.noDeadline")
                  )}
                </span>
                <span className="row" style={{ gap: 6 }}>
                  {project.sharedWith.length > 0 && (
                    <span className="row" style={{ gap: 3 }}>
                      <IconUsers style={{ width: 12, height: 12 }} />
                      {project.sharedWith.length}
                    </span>
                  )}
                  {project.attachments.length > 0 && (
                    <span>{project.attachments.length} 📎</span>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmBulkDelete && (
        <ConfirmDialog
          title={t("projects.deleteTitle")}
          message={t("projects.bulkDeleteConfirm", { count: selectedIds.size })}
          confirmLabel={t("common.delete")}
          danger
          onConfirm={() => void onBulkDelete()}
          onCancel={() => setConfirmBulkDelete(false)}
        />
      )}
    </div>
  );
}

function BoardView({
  projects,
  statuses,
  onOpen,
  onStatusChange,
}: {
  projects: ProjectModel[];
  statuses: CustomStatus[];
  onOpen: (id: string) => void;
  onStatusChange: (project: ProjectModel, statusId: string) => Promise<void>;
}) {
  const { lang, t } = useI18n();
  const isIOS = useIsIOS();
  const columns = useMemo(() => {
    const byStatus = new Map<string, ProjectModel[]>();
    for (const status of statuses) byStatus.set(status.id, []);
    for (const project of projects) {
      const key = byStatus.has(project.statusValue)
        ? project.statusValue
        : statuses[0]?.id ?? "neu";
      byStatus.get(key)?.push(project);
    }
    return statuses
      .slice()
      .sort(
        (a, b) =>
          sortOrderForStatusId(a.id, statuses) - sortOrderForStatusId(b.id, statuses)
      )
      .map((status) => ({ status, items: byStatus.get(status.id) ?? [] }));
  }, [projects, statuses]);

  return (
    <div className="board">
      {columns.map(({ status, items }) => (
        <div
          key={status.id}
          className="board-column"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            const projectId = e.dataTransfer.getData("text/project-id");
            const project = projects.find((p) => p.id === projectId);
            if (project && project.statusValue !== status.id) {
              void onStatusChange(project, status.id);
            }
          }}
        >
          <div className="board-column-header">
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: 5,
                background: colorForStatusId(status.id, statuses),
              }}
            />
            {labelForStatusId(status.id, statuses)}
            <span className="text-xs text-faint" style={{ marginLeft: "auto" }}>
              {items.length}
            </span>
          </div>
          {items.map((project) => (
            <div
              key={project.id}
              className="card card-pad"
              style={{ padding: 12, cursor: "pointer" }}
              draggable={!isIOS}
              onDragStart={(e) =>
                e.dataTransfer.setData("text/project-id", project.id)
              }
              onClick={() => onOpen(project.id)}
            >
              <div style={{ fontWeight: 600, fontSize: "0.8438rem" }} className="truncate">
                {project.name}
              </div>
              <div className="text-xs text-muted truncate" style={{ marginBottom: 8 }}>
                {project.customerName || project.projectType}
              </div>
              <div className="row row-between">
                <Badge color={priorityColor(project.priority)}>
                  {priorityLabel(project.priority)}
                </Badge>
                {project.deadline && (
                  <span
                    className="text-xs"
                    style={{
                      color: isProjectOverdue(project)
                        ? "var(--danger)"
                        : "var(--text-muted)",
                    }}
                  >
                    {formatDate(project.deadline, lang)}
                  </span>
                )}
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="text-xs text-faint" style={{ padding: "10px 6px" }}>
              {t("projects.emptyColumn")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
