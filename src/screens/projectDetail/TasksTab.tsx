import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import { useIsIOS } from "@/lib/platform";
import { isProjectViewer, type CommentModel, type ProjectModel, type TaskModel } from "@/models/types";
import {
  watchTasks,
  createTask,
  toggleTask,
  deleteTask,
  addSubtask,
  toggleSubtask,
  deleteSubtask,
  reorderTasks,
  setTaskDueDate,
  watchComments,
  addComment,
  deleteComment,
} from "@/services/taskService";
import { Modal, ProgressBar, formatDate } from "@/components/ui";
import {
  IconPlus,
  IconTrash,
  IconCheckCircle,
  IconChevronDown,
  IconChevronRight,
  IconMessage,
  IconCalendar,
  IconSearch,
} from "@/components/Icons";

function isVoiceNoteUrl(value: string): boolean {
  return value.startsWith("http") && value.includes("/voiceNotes%2F");
}

export function TasksTab({ project }: { project: ProjectModel }) {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { t, lang } = useI18n();
  const isIOS = useIsIOS();

  const [tasks, setTasks] = useState<TaskModel[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [commentsTask, setCommentsTask] = useState<TaskModel | null>(null);
  const [dragTaskId, setDragTaskId] = useState<string | null>(null);
  const [dueDateTask, setDueDateTask] = useState<TaskModel | null>(null);
  const [dueDateValue, setDueDateValue] = useState("");
  const [search, setSearch] = useState("");
  const [showCompleted, setShowCompleted] = useState(true);

  const isViewer = currentUser ? isProjectViewer(project, currentUser.id) : false;

  useEffect(() => {
    const unsubscribe = watchTasks(project.id, setTasks);
    return unsubscribe;
  }, [project.id]);

  const completedCount = tasks.filter((task) => task.isCompleted).length;
  const progress = tasks.length > 0 ? completedCount / tasks.length : 0;

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(
      (task) =>
        task.title.toLowerCase().includes(q) ||
        (task.description?.toLowerCase().includes(q) ?? false)
    );
  }, [tasks, search]);

  const openTasks = filteredTasks.filter((task) => !task.isCompleted);
  const doneTasks = filteredTasks.filter((task) => task.isCompleted);

  const onAddTask = async () => {
    if (!currentUser || !newTitle.trim()) return;
    if (isViewer) {
      showToast(t("team.viewerActionBlocked"), "warning");
      return;
    }
    try {
      await createTask({
        projectId: project.id,
        title: newTitle.trim(),
        description: newDescription.trim() || null,
        createdBy: currentUser.username,
      });
      setNewTitle("");
      setNewDescription("");
      setAddOpen(false);
      showToast(t("tasks.created"), "success");
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  const guardViewer = (): boolean => {
    if (!isViewer) return false;
    showToast(t("team.viewerActionBlocked"), "warning");
    return true;
  };

  const toggleExpanded = (taskId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const onDropOnTask = async (targetTask: TaskModel) => {
    if (!dragTaskId || dragTaskId === targetTask.id) return;
    const current = [...tasks];
    const fromIndex = current.findIndex((task) => task.id === dragTaskId);
    const toIndex = current.findIndex((task) => task.id === targetTask.id);
    if (fromIndex < 0 || toIndex < 0) return;
    const [moved] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, moved);
    setTasks(current);
    setDragTaskId(null);
    await reorderTasks(project.id, current);
  };

  const renderTaskRow = (task: TaskModel) => {
    const isExpanded = expanded.has(task.id);
    const subCompleted = task.subtasks.filter((s) => s.isCompleted).length;
    return (
      <div
        key={task.id}
        style={{ borderBottom: "1px solid var(--border)" }}
        draggable={!isIOS}
        onDragStart={() => setDragTaskId(task.id)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => void onDropOnTask(task)}
      >
        <div className="list-row" style={{ borderBottom: "none" }}>
          <input
            type="checkbox"
            checked={task.isCompleted}
            onChange={(e) => void toggleTask(project.id, task.id, e.target.checked)}
          />
          <div
            className="grow"
            style={{ minWidth: 0, cursor: "pointer" }}
            onClick={() => toggleExpanded(task.id)}
          >
            <div
              className="text-small row"
              style={{
                fontWeight: 600,
                gap: 6,
                textDecoration: task.isCompleted ? "line-through" : "none",
                opacity: task.isCompleted ? 0.55 : 1,
              }}
            >
              {task.title}
              {task.subtasks.length > 0 && (
                <span className="text-xs text-faint">
                  {subCompleted}/{task.subtasks.length}
                </span>
              )}
            </div>
            {task.description && isVoiceNoteUrl(task.description) ? (
              <audio
                controls
                src={task.description}
                style={{ height: 28, marginTop: 4, maxWidth: 260 }}
              />
            ) : (
              task.description && (
                <div className="text-xs text-muted truncate">{task.description}</div>
              )
            )}
          </div>
          {task.dueDate && (
            <span
              className="text-xs"
              style={{
                color:
                  !task.isCompleted && task.dueDate.getTime() < Date.now()
                    ? "var(--danger)"
                    : "var(--text-muted)",
              }}
            >
              <IconCalendar style={{ width: 11, height: 11, verticalAlign: -1 }} />{" "}
              {formatDate(task.dueDate, lang)}
            </span>
          )}
          <button
            className="icon-btn"
            title={t("tasks.comments")}
            onClick={() => setCommentsTask(task)}
          >
            <IconMessage />
          </button>
          <button
            className="icon-btn"
            title={t("tasks.setDueDate")}
            onClick={() => {
              // window.prompt is not supported in Tauri WebViews — modal instead.
              setDueDateValue(
                task.dueDate
                  ? task.dueDate.toISOString().slice(0, 10)
                  : new Date().toISOString().slice(0, 10)
              );
              setDueDateTask(task);
            }}
          >
            <IconCalendar />
          </button>
          <button
            className="icon-btn"
            title={t("common.delete")}
            onClick={() => !guardViewer() && void deleteTask(project.id, task.id)}
          >
            <IconTrash />
          </button>
          <button className="icon-btn" onClick={() => toggleExpanded(task.id)}>
            {isExpanded ? <IconChevronDown /> : <IconChevronRight />}
          </button>
        </div>

        {isExpanded && (
          <div style={{ padding: "0 16px 12px 46px" }}>
            {task.subtasks.map((subtask) => (
              <div key={subtask.id} className="row" style={{ padding: "4px 0" }}>
                <input
                  type="checkbox"
                  checked={subtask.isCompleted}
                  onChange={() => void toggleSubtask(project.id, task.id, subtask.id)}
                />
                <span
                  className="grow text-small"
                  style={{
                    textDecoration: subtask.isCompleted ? "line-through" : "none",
                    opacity: subtask.isCompleted ? 0.55 : 1,
                  }}
                >
                  {subtask.title}
                </span>
                <button
                  className="icon-btn"
                  style={{ width: 24, height: 24 }}
                  onClick={() =>
                    !guardViewer() && void deleteSubtask(project.id, task.id, subtask.id)
                  }
                >
                  <IconTrash style={{ width: 13, height: 13 }} />
                </button>
              </div>
            ))}
            <SubtaskInput
              placeholder={t("tasks.addSubtask")}
              onSubmit={(title) => !guardViewer() && void addSubtask(project.id, task.id, title)}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="content-narrow" style={{ margin: 0, maxWidth: 780 }}>
      <div className="card">
        <div className="card-header">
          <div className="grow">
            <div className="card-title">
              {t("projectDetail.tabTasks")} ({completedCount}/{tasks.length})
            </div>
            {tasks.length > 0 && (
              <div style={{ marginTop: 8, maxWidth: 320 }}>
                <ProgressBar value={progress} />
              </div>
            )}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>
            <IconPlus /> {t("tasks.add")}
          </button>
        </div>

        {tasks.length > 0 && (
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ position: "relative" }}>
              <IconSearch
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 14,
                  height: 14,
                  color: "var(--text-faint)",
                }}
              />
              <input
                className="input"
                style={{ paddingLeft: 32, maxWidth: 320 }}
                placeholder={`${t("search.title")}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        )}

        {tasks.length === 0 ? (
          <div className="empty-state">
            <IconCheckCircle />
            <h3>{t("tasks.emptyTitle")}</h3>
            <div className="text-small text-muted">{t("tasks.emptySubtitle")}</div>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="text-small text-muted" style={{ padding: "20px 16px" }}>
            {t("search.noResults")}
          </div>
        ) : (
          <>
            {openTasks.map(renderTaskRow)}
            {doneTasks.length > 0 && (
              <>
                <button
                  className="row"
                  style={{
                    width: "100%",
                    padding: "10px 16px",
                    background: "var(--surface-2)",
                    fontWeight: 600,
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                  }}
                  onClick={() => setShowCompleted((v) => !v)}
                >
                  {showCompleted ? <IconChevronDown /> : <IconChevronRight />}
                  {t("tasks.completedSection", { count: doneTasks.length })}
                </button>
                {showCompleted && doneTasks.map(renderTaskRow)}
              </>
            )}
          </>
        )}
      </div>

      {addOpen && (
        <Modal
          title={t("tasks.add")}
          onClose={() => setAddOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setAddOpen(false)}>
                {t("common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={() => void onAddTask()}>
                {t("common.add")}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field-label">{t("tasks.titleLabel")}</label>
            <input
              className="input"
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void onAddTask();
              }}
            />
          </div>
          <div className="field">
            <label className="field-label">{t("tasks.descriptionLabel")}</label>
            <textarea
              className="textarea"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
            />
          </div>
        </Modal>
      )}

      {commentsTask && (
        <CommentsModal
          project={project}
          task={commentsTask}
          onClose={() => setCommentsTask(null)}
        />
      )}

      {dueDateTask && (
        <Modal
          title={t("tasks.setDueDate")}
          onClose={() => setDueDateTask(null)}
          footer={
            <>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  void setTaskDueDate(project.id, dueDateTask.id, null);
                  setDueDateTask(null);
                }}
              >
                {t("common.reset")}
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const parsed = dueDateValue.trim()
                    ? new Date(`${dueDateValue}T12:00:00`)
                    : null;
                  if (parsed && Number.isNaN(parsed.getTime())) return;
                  void setTaskDueDate(project.id, dueDateTask.id, parsed);
                  setDueDateTask(null);
                }}
              >
                {t("common.save")}
              </button>
            </>
          }
        >
          <div className="field">
            <label className="field-label">{dueDateTask.title}</label>
            <input
              className="input"
              type="date"
              autoFocus
              value={dueDateValue}
              onChange={(e) => setDueDateValue(e.target.value)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}

function SubtaskInput({
  placeholder,
  onSubmit,
}: {
  placeholder: string;
  onSubmit: (title: string) => void;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="row" style={{ marginTop: 6 }}>
      <input
        className="input"
        style={{ padding: "5px 9px", fontSize: "0.8125rem" }}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) {
            onSubmit(value.trim());
            setValue("");
          }
        }}
      />
    </div>
  );
}

function CommentsModal({
  project,
  task,
  onClose,
}: {
  project: ProjectModel;
  task: TaskModel;
  onClose: () => void;
}) {
  const { currentUser } = useAuth();
  const { t, lang } = useI18n();
  const [comments, setComments] = useState<CommentModel[]>([]);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const unsubscribe = watchComments(project.id, task.id, setComments);
    return unsubscribe;
  }, [project.id, task.id]);

  const onAdd = async () => {
    if (!currentUser || !draft.trim()) return;
    await addComment({
      projectId: project.id,
      taskId: task.id,
      userId: currentUser.id,
      username: currentUser.username,
      userAvatarUrl: currentUser.avatarUrl,
      content: draft.trim(),
    });
    setDraft("");
  };

  return (
    <Modal title={`${t("tasks.comments")} — ${task.title}`} onClose={onClose}>
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          className="input grow"
          placeholder={t("tasks.commentHint")}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void onAdd();
          }}
        />
        <button className="btn btn-primary btn-sm" onClick={() => void onAdd()}>
          {t("common.add")}
        </button>
      </div>
      {comments.length === 0 ? (
        <div className="text-small text-muted">{t("tasks.noComments")}</div>
      ) : (
        comments.map((comment) => (
          <div
            key={comment.id}
            className="list-row"
            style={{ paddingLeft: 0, paddingRight: 0, alignItems: "flex-start" }}
          >
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row" style={{ gap: 6 }}>
                <span className="text-small" style={{ fontWeight: 700 }}>
                  {comment.username}
                </span>
                <span className="text-xs text-faint">
                  {comment.createdAt.toLocaleString(lang)}
                </span>
              </div>
              <div className="text-small" style={{ whiteSpace: "pre-wrap" }}>
                {comment.content}
              </div>
            </div>
            {currentUser?.id === comment.userId && (
              <button
                className="icon-btn"
                onClick={() => void deleteComment(project.id, task.id, comment.id)}
              >
                <IconTrash />
              </button>
            )}
          </div>
        ))
      )}
    </Modal>
  );
}
