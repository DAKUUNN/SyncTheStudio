import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/stores/authStore";
import { useI18n } from "@/i18n";
import type { ActivityFeedEntry } from "@/services/projectService";
import { getRecentActivityAcrossProjects } from "@/services/projectService";
import { EmptyState, LoadingCenter, timeAgo } from "@/components/ui";
import { IconHistory, IconSearch } from "@/components/Icons";

export function ActivityScreen() {
  const { currentUser } = useAuth();
  const { t, lang } = useI18n();
  const [entries, setEntries] = useState<ActivityFeedEntry[] | null>(null);
  const [search, setSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    void getRecentActivityAcrossProjects(currentUser.id, 150).then(setEntries);
  }, [currentUser?.id]);

  const projectOptions = useMemo(() => {
    if (!entries) return [];
    const map = new Map<string, string>();
    for (const e of entries) map.set(e.projectId, e.projectName);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [entries]);

  const userOptions = useMemo(() => {
    if (!entries) return [];
    return [...new Set(entries.map((e) => e.userName))].sort((a, b) => a.localeCompare(b));
  }, [entries]);

  const filtered = useMemo(() => {
    if (!entries) return [];
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (projectFilter && e.projectId !== projectFilter) return false;
      if (userFilter && e.userName !== userFilter) return false;
      if (!q) return true;
      return (
        e.action.toLowerCase().includes(q) ||
        e.projectName.toLowerCase().includes(q) ||
        e.userName.toLowerCase().includes(q) ||
        (e.fieldName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [entries, search, projectFilter, userFilter]);

  if (entries === null) return <LoadingCenter />;

  return (
    <div className="content-narrow">
      <h1 style={{ marginBottom: 4 }}>{t("activity.title")}</h1>
      <div className="text-small text-muted" style={{ marginBottom: 18 }}>
        {t("activity.subtitle")}
      </div>

      <div className="card card-pad" style={{ marginBottom: 16, paddingBottom: 14 }}>
        <div className="row row-wrap" style={{ gap: 10 }}>
          <div style={{ position: "relative", maxWidth: 260, flex: 1 }}>
            <IconSearch
              style={{
                position: "absolute",
                left: 11,
                top: "50%",
                transform: "translateY(-50%)",
                width: 14,
                height: 14,
                color: "var(--text-faint)",
              }}
            />
            <input
              className="input"
              style={{ paddingLeft: 32 }}
              placeholder={`${t("search.title")}…`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="select"
            style={{ maxWidth: 220 }}
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="">{t("activity.allProjects")}</option>
            {projectOptions.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
          <select
            className="select"
            style={{ maxWidth: 200 }}
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
          >
            <option value="">{t("activity.allUsers")}</option>
            {userOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<IconHistory />}
            title={t("activity.emptyTitle")}
            subtitle={t("activity.emptySubtitle")}
          />
        ) : (
          filtered.map((entry) => (
            <div key={`${entry.projectId}-${entry.id}-${entry.timestamp.getTime()}`} className="list-row">
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
                <div className="text-xs text-muted">
                  {entry.userName} · {entry.projectName}
                </div>
              </div>
              <span className="text-xs text-faint" style={{ whiteSpace: "nowrap" }}>
                {timeAgo(entry.timestamp, lang)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
