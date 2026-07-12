import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/stores/authStore";
import { useI18n } from "@/i18n";
import { searchAll, emptySearchResults, type SearchResults } from "@/services/searchService";
import { Avatar, EmptyState, Spinner } from "@/components/ui";
import { IconSearch, IconFolder, IconUsers, IconCheckCircle } from "@/components/Icons";

export function SearchScreen() {
  const { currentUser } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(emptySearchResults());
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults(emptySearchResults());
      return;
    }
    debounceRef.current = window.setTimeout(() => {
      setSearching(true);
      void searchAll(query.trim(), currentUser.id)
        .then(setResults)
        .finally(() => setSearching(false));
    }, 350);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, currentUser?.id]);

  const total = results.projects.length + results.customers.length + results.tasks.length;

  return (
    <div className="content-narrow">
      <h1 style={{ marginBottom: 16 }}>{t("search.title")}</h1>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row">
          <IconSearch style={{ width: 18, height: 18, color: "var(--text-faint)" }} />
          <input
            className="input grow"
            autoFocus
            placeholder={t("search.hint")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching && <Spinner />}
        </div>
      </div>

      {query.trim() && !searching && total === 0 && (
        <div className="card">
          <EmptyState icon={<IconSearch />} title={t("search.noResults")} />
        </div>
      )}

      {results.projects.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">
              <IconFolder style={{ width: 15, height: 15, verticalAlign: -2 }} />{" "}
              {t("nav.projects")} ({results.projects.length})
            </div>
          </div>
          {results.projects.map((project) => (
            <div
              key={project.id}
              className="list-row clickable"
              onClick={() => navigate(`/projects/${project.id}`)}
            >
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="text-small truncate" style={{ fontWeight: 600 }}>
                  {project.name}
                </div>
                <div className="text-xs text-muted truncate">
                  {project.customerName || project.projectType}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {results.customers.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">
              <IconUsers style={{ width: 15, height: 15, verticalAlign: -2 }} />{" "}
              {t("nav.customers")} ({results.customers.length})
            </div>
          </div>
          {results.customers.map((customer) => (
            <div
              key={customer.id}
              className="list-row clickable"
              onClick={() => navigate("/customers")}
            >
              <Avatar name={customer.name} size={30} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="text-small truncate" style={{ fontWeight: 600 }}>
                  {customer.name}
                </div>
                <div className="text-xs text-muted truncate">{customer.email ?? "—"}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {results.tasks.length > 0 && (
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <IconCheckCircle style={{ width: 15, height: 15, verticalAlign: -2 }} />{" "}
              {t("projectDetail.tabTasks")} ({results.tasks.length})
            </div>
          </div>
          {results.tasks.map(({ task, projectName }) => (
            <div
              key={task.id}
              className="list-row clickable"
              onClick={() => navigate(`/projects/${task.projectId}`)}
            >
              <input type="checkbox" checked={task.isCompleted} readOnly />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="text-small truncate" style={{ fontWeight: 600 }}>
                  {task.title}
                </div>
                <div className="text-xs text-muted truncate">{projectName}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
