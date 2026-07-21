import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { useAuth } from "@/stores/authStore";
import { useToast } from "@/stores/toastStore";
import { useI18n } from "@/i18n";
import { useIsDesktopTauri } from "@/lib/platform";
import type { ProjectModel } from "@/models/types";
import { getProjects } from "@/services/projectService";
import {
  exportProjectsToCSV,
  exportCustomersToCSV,
  exportTimeEntriesToCSV,
  generateFullBackup,
  exportProjectAsFolder,
} from "@/services/exportService";
import { pickBackupFile, importFullBackup, type BackupSummary } from "@/services/importService";
import { Spinner, ConfirmDialog } from "@/components/ui";
import {
  IconExport,
  IconFile,
  IconUsers,
  IconClock,
  IconFolder,
  IconDownload,
  IconWifi,
} from "@/components/Icons";

export function ExportScreen() {
  const { currentUser } = useAuth();
  const { showToast } = useToast();
  const { t } = useI18n();
  const isDesktopTauri = useIsDesktopTauri();
  const navigate = useNavigate();

  const [projects, setProjects] = useState<ProjectModel[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [includeOptions, setIncludeOptions] = useState({
    projectText: true,
    todoList: true,
    chatLogs: true,
    timeTracking: true,
    history: true,
    attachments: true,
    masters: true,
  });
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [dawProject, setDawProject] = useState<{ path: string; isDirectory: boolean } | null>(
    null
  );
  const [importSummary, setImportSummary] = useState<BackupSummary | null>(null);
  const [importProgress, setImportProgress] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    void getProjects(currentUser.id).then((list) => {
      setProjects(list);
      if (list.length > 0) setSelectedProjectId(list[0].id);
    });
  }, [currentUser?.id]);

  const onPickBackup = async () => {
    try {
      const summary = await pickBackupFile();
      if (summary) setImportSummary(summary);
    } catch (e) {
      showToast((e as Error).message, "error");
    }
  };

  const onRunImport = async () => {
    if (!importSummary || !currentUser) return;
    const backup = importSummary.data;
    setImportSummary(null);
    setBusy("import");
    try {
      const result = await importFullBackup({
        userId: currentUser.id,
        username: currentUser.username,
        backup,
        onProgress: setImportProgress,
      });
      showToast(
        t("import.done", { projects: result.projects, customers: result.customers }),
        "success"
      );
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setBusy(null);
      setImportProgress(null);
    }
  };

  const pickDawProject = async (directory: boolean) => {
    const selected = await openDialog({
      directory,
      recursive: directory,
      multiple: false,
      title: t("export.dawPickTitle"),
      defaultPath: selectedProject?.dawProjectPath || undefined,
      ...(directory
        ? {}
        : { filters: [{ name: "ZIP", extensions: ["zip", "7z", "rar", "tar", "gz"] }] }),
    });
    if (!selected || typeof selected !== "string") return;
    setDawProject({ path: selected, isDirectory: directory });
  };

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
      setProgressLabel(null);
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

      {isDesktopTauri && (
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
            onChange={(e) => {
              setSelectedProjectId(e.target.value);
              setDawProject(null);
            }}
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
              ["attachments", t("export.includeAttachments")],
              ["masters", t("export.includeMasters")],
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
        <div className="field" style={{ marginBottom: 12 }}>
          <label className="field-label">{t("export.dawSection")}</label>
          <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
            {t("export.dawDescription")}
          </div>
          {dawProject ? (
            <div className="row" style={{ gap: 8 }}>
              <div
                className="mono text-xs grow truncate"
                style={{
                  padding: "8px 10px",
                  background: "var(--surface-2)",
                  borderRadius: "var(--radius-sm)",
                }}
                title={dawProject.path}
              >
                {dawProject.path}
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setDawProject(null)}
              >
                {t("common.remove")}
              </button>
            </div>
          ) : (
            <div className="row" style={{ gap: 8 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => void pickDawProject(false)}
              >
                <IconFile /> {t("export.dawPickFile")}
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => void pickDawProject(true)}
              >
                <IconFolder /> {t("export.dawPickFolder")}
              </button>
            </div>
          )}
        </div>
        <button
          className="btn btn-primary"
          disabled={!selectedProject || busy !== null}
          onClick={() =>
            void runExport("folder", async () => {
              const result = await exportProjectAsFolder({
                userId: currentUser.id,
                project: selectedProject!,
                includeProjectText: includeOptions.projectText,
                includeTodoList: includeOptions.todoList,
                includeChatLogs: includeOptions.chatLogs,
                includeTimeTracking: includeOptions.timeTracking,
                includeHistory: includeOptions.history,
                includeAttachments: includeOptions.attachments,
                includeMasters: includeOptions.masters,
                dawProjectPath: dawProject?.path ?? null,
                dawProjectIsDirectory: dawProject?.isDirectory ?? false,
                onProgress: setProgressLabel,
              });
              if (result && result.skippedCount > 0) {
                showToast(t("archive.doneWithSkipped", { count: result.skippedCount }), "warning");
              }
              return result?.folder ?? null;
            })
          }
        >
          {busy === "folder" ? <Spinner /> : <IconFolder />}
          {t("export.exportFolder")}
        </button>
        {busy === "folder" && progressLabel && (
          <div className="text-xs text-muted" style={{ marginTop: 10 }}>
            {progressLabel}
          </div>
        )}
      </div>
      )}

      <div className="card card-pad" style={{ marginTop: 20 }}>
        <div className="section-title">
          <IconDownload style={{ width: 13, height: 13, verticalAlign: -2 }} />{" "}
          {t("import.title")}
        </div>
        <p className="text-small text-muted" style={{ marginBottom: 12 }}>
          {t("import.description")}
        </p>
        <button
          className="btn btn-secondary btn-sm"
          disabled={busy !== null}
          onClick={() => void onPickBackup()}
        >
          {busy === "import" ? <Spinner /> : <IconDownload />}
          {t("import.pickFile")}
        </button>
        {busy === "import" && importProgress && (
          <div className="text-xs text-muted" style={{ marginTop: 10 }}>
            {importProgress}
          </div>
        )}
      </div>

      {isDesktopTauri && (
        <div className="card card-pad" style={{ marginTop: 20 }}>
          <div className="section-title">
            <IconWifi style={{ width: 13, height: 13, verticalAlign: -2 }} />{" "}
            {t("lanTransfer.title")}
          </div>
          <p className="text-small text-muted" style={{ marginBottom: 12 }}>
            {t("lanTransfer.exportCardDescription")}
          </p>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate("/lan-transfer")}>
            <IconWifi /> {t("lanTransfer.exportCardOpen")}
          </button>
        </div>
      )}

      {importSummary && (
        <ConfirmDialog
          title={t("import.confirmTitle")}
          message={t("import.confirmMessage", {
            projects: importSummary.projectCount,
            customers: importSummary.customerCount,
            date: importSummary.generatedAt
              ? new Date(importSummary.generatedAt).toLocaleDateString()
              : "—",
          })}
          confirmLabel={t("import.confirm")}
          onConfirm={() => void onRunImport()}
          onCancel={() => setImportSummary(null)}
        />
      )}
    </div>
  );
}
