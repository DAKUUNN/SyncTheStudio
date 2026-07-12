import { useEffect, useState } from "react";
import { useAuth } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import type { ProjectModel } from "@/models/types";
import { getProjects } from "@/services/projectService";
import {
  exportProjectsToCSV,
  exportCustomersToCSV,
  exportTimeEntriesToCSV,
  generateFullBackup,
  exportProjectAsFolder,
} from "@/services/exportService";
import { Spinner } from "@/components/ui";
import { IconExport, IconFile, IconUsers, IconClock, IconFolder } from "@/components/Icons";

export function ExportScreen() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { t } = useI18n();

  const [projects, setProjects] = useState<ProjectModel[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [includeOptions, setIncludeOptions] = useState({
    projectText: true,
    todoList: true,
    chatLogs: true,
    timeTracking: true,
    history: true,
  });

  useEffect(() => {
    if (!currentUser) return;
    void getProjects(currentUser.id).then((list) => {
      setProjects(list);
      if (list.length > 0) setSelectedProjectId(list[0].id);
    });
  }, [currentUser?.id]);

  if (!currentUser) return null;

  const runExport = async (key: string, action: () => Promise<string | null>) => {
    setBusy(key);
    try {
      const path = await action();
      if (path) {
        showToast(t("export.done", { path }), "success");
      }
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const exportCards = [
    {
      key: "projects",
      icon: <IconFile />,
      title: t("export.projectsCsv"),
      description: t("export.projectsCsvDescription"),
      action: () => exportProjectsToCSV(currentUser.id),
    },
    {
      key: "customers",
      icon: <IconUsers />,
      title: t("export.customersCsv"),
      description: t("export.customersCsvDescription"),
      action: () => exportCustomersToCSV(currentUser.id),
    },
    {
      key: "time",
      icon: <IconClock />,
      title: t("export.timeCsv"),
      description: t("export.timeCsvDescription"),
      action: () => exportTimeEntriesToCSV(currentUser.id),
    },
    {
      key: "backup",
      icon: <IconExport />,
      title: t("export.backup"),
      description: t("export.backupDescription"),
      action: () => generateFullBackup(currentUser.id),
    },
  ];

  const selectedProject = projects.find((project) => project.id === selectedProjectId);

  return (
    <div className="content-narrow">
      <h1 style={{ marginBottom: 4 }}>{t("export.title")}</h1>
      <div className="text-small text-muted" style={{ marginBottom: 18 }}>
        {t("export.subtitle")}
      </div>

      <div className="stats-grid" style={{ marginBottom: 20, gridTemplateColumns: "1fr 1fr" }}>
        {exportCards.map((card) => (
          <div key={card.key} className="card card-pad">
            <div className="row" style={{ marginBottom: 8 }}>
              <div
                className="stat-icon"
                style={{
                  background: "var(--primary-soft)",
                  color: "var(--primary)",
                  marginBottom: 0,
                }}
              >
                {card.icon}
              </div>
              <div className="grow">
                <div className="text-small" style={{ fontWeight: 700 }}>
                  {card.title}
                </div>
                <div className="text-xs text-muted">{card.description}</div>
              </div>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              disabled={busy !== null}
              onClick={() => void runExport(card.key, card.action)}
            >
              {busy === card.key ? <Spinner /> : <IconExport />}
              {t("export.start")}
            </button>
          </div>
        ))}
      </div>

      <div className="card card-pad">
        <div className="section-title">
          <IconFolder style={{ width: 13, height: 13, verticalAlign: -2 }} />{" "}
          {t("export.projectFolder")}
        </div>
        <p className="text-small text-muted" style={{ marginBottom: 12 }}>
          {t("export.projectFolderDescription")}
        </p>
        <div className="field">
          <label className="field-label">{t("export.selectProject")}</label>
          <select
            className="select"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginBottom: 12 }}>
          {(
            [
              ["projectText", t("export.includeInfo")],
              ["todoList", t("export.includeTasks")],
              ["chatLogs", t("export.includeChat")],
              ["timeTracking", t("export.includeTime")],
              ["history", t("export.includeHistory")],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="checkbox-row">
              <input
                type="checkbox"
                checked={includeOptions[key]}
                onChange={(e) =>
                  setIncludeOptions((prev) => ({ ...prev, [key]: e.target.checked }))
                }
              />
              <span className="text-small">{label}</span>
            </label>
          ))}
        </div>
        <button
          className="btn btn-primary"
          disabled={!selectedProject || busy !== null}
          onClick={() =>
            void runExport("folder", () =>
              exportProjectAsFolder({
                userId: currentUser.id,
                project: selectedProject!,
                includeProjectText: includeOptions.projectText,
                includeTodoList: includeOptions.todoList,
                includeChatLogs: includeOptions.chatLogs,
                includeTimeTracking: includeOptions.timeTracking,
                includeHistory: includeOptions.history,
              })
            )
          }
        >
          {busy === "folder" ? <Spinner /> : <IconFolder />}
          {t("export.exportFolder")}
        </button>
      </div>
    </div>
  );
}
