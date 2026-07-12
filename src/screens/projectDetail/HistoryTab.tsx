import { useEffect, useState } from "react";
import { useAuth } from "@/stores/authStore";
import { useI18n } from "@/i18n";
import type { ProjectHistoryEntry, ProjectModel } from "@/models/types";
import { getProjectHistory } from "@/services/projectService";
import { LoadingCenter, formatDateTime } from "@/components/ui";
import { IconHistory } from "@/components/Icons";

export function HistoryTab({ project }: { project: ProjectModel }) {
  const { currentUser } = useAuth();
  const { t, lang } = useI18n();
  const [history, setHistory] = useState<ProjectHistoryEntry[] | null>(null);

  useEffect(() => {
    void getProjectHistory(project.id, currentUser?.id).then(setHistory);
  }, [project.id, currentUser?.id]);

  if (history === null) return <LoadingCenter />;

  return (
    <div className="content-narrow" style={{ margin: 0, maxWidth: 720 }}>
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            {t("projectDetail.tabHistory")} ({history.length})
          </div>
        </div>
        {history.length === 0 ? (
          <div className="empty-state">
            <IconHistory />
            <h3>{t("history.emptyTitle")}</h3>
          </div>
        ) : (
          history.map((entry) => (
            <div key={entry.id + entry.timestamp.getTime()} className="list-row">
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  background: "var(--primary)",
                  flexShrink: 0,
                }}
              />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="text-small" style={{ fontWeight: 600 }}>
                  {entry.action}
                  {entry.fieldName && (
                    <span className="text-muted" style={{ fontWeight: 400 }}>
                      {" "}
                      — {entry.fieldName}: {entry.oldValue ?? "—"} → {entry.newValue ?? "—"}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted">{entry.userName}</div>
              </div>
              <span className="text-xs text-faint" style={{ whiteSpace: "nowrap" }}>
                {formatDateTime(entry.timestamp, lang)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
