import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/stores/authStore";
import { useI18n } from "@/i18n";
import type { ProjectModel } from "@/models/types";
import { getProjects, getSharedProjects } from "@/services/projectService";
import { getTasks } from "@/services/taskService";
import { LoadingCenter, EmptyState, Modal } from "@/components/ui";
import { IconCalendar, IconFolder, IconCheckCircle, IconChevronRight } from "@/components/Icons";

interface CalendarEvent {
  date: Date;
  type: "project" | "task";
  projectId: string;
  projectName: string;
  title: string;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function sameDay(a: Date, b: Date): boolean {
  return dayKey(a) === dayKey(b);
}

/** Monday-first 6x7 grid covering the full month plus lead/trail days from
 *  the adjacent months, so the grid is always a complete 42-cell rectangle. */
function buildMonthGrid(monthStart: Date): Date[] {
  const firstWeekday = (monthStart.getDay() + 6) % 7; // 0 = Monday
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - firstWeekday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function CalendarScreen() {
  const { currentUser } = useAuth();
  const { t, lang } = useI18n();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [monthStart, setMonthStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const [own, shared] = await Promise.all([
        getProjects(currentUser.id),
        getSharedProjects(currentUser.id),
      ]);
      const byId = new Map<string, ProjectModel>();
      for (const project of [...own, ...shared]) byId.set(project.id, project);
      const projects = [...byId.values()];

      const projectEvents: CalendarEvent[] = projects
        .filter((p) => p.deadline)
        .map((p) => ({
          date: p.deadline as Date,
          type: "project",
          projectId: p.id,
          projectName: p.name,
          title: p.name,
        }));

      const taskEventLists = await Promise.all(
        projects.map(async (project) => {
          const tasks = await getTasks(project.id);
          return tasks
            .filter((task) => task.dueDate && !task.isCompleted)
            .map<CalendarEvent>((task) => ({
              date: task.dueDate as Date,
              type: "task",
              projectId: project.id,
              projectName: project.name,
              title: task.title,
            }));
        })
      );

      if (cancelled) return;
      setEvents([...projectEvents, ...taskEventLists.flat()]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  const grid = useMemo(() => buildMonthGrid(monthStart), [monthStart]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = dayKey(event.date);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.date.getTime() - b.date.getTime());
    }
    return map;
  }, [events]);

  const today = new Date();
  const weekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(lang, { weekday: "short" });
    // 2024-01-01 was a Monday — a stable Monday-first reference week.
    return Array.from({ length: 7 }, (_, i) => formatter.format(new Date(2024, 0, 1 + i)));
  }, [lang]);

  const monthLabel = monthStart.toLocaleDateString(lang, { month: "long", year: "numeric" });

  const goToMonth = (delta: number) => {
    setMonthStart((prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1));
    setSelectedDay(null);
  };

  const selectedEvents = selectedDay ? eventsByDay.get(dayKey(selectedDay)) ?? [] : [];

  if (!currentUser) return null;

  return (
    <div className="content-narrow">
      <h1 style={{ marginBottom: 4 }}>{t("calendar.title")}</h1>
      <div className="text-small text-muted" style={{ marginBottom: 18 }}>
        {t("calendar.subtitle")}
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row row-between" style={{ marginBottom: 14 }}>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => goToMonth(-1)}>
              ‹
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => {
                const now = new Date();
                setMonthStart(new Date(now.getFullYear(), now.getMonth(), 1));
                setSelectedDay(null);
              }}
            >
              {t("calendar.today")}
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => goToMonth(1)}>
              ›
            </button>
          </div>
          <div style={{ fontWeight: 700, textTransform: "capitalize" }}>{monthLabel}</div>
        </div>

        {loading ? (
          <LoadingCenter />
        ) : (
          <div className="calendar-grid">
            {weekdayLabels.map((label) => (
              <div key={label} className="calendar-weekday">
                {label}
              </div>
            ))}
            {grid.map((day) => {
              const inMonth = day.getMonth() === monthStart.getMonth();
              const isToday = sameDay(day, today);
              const dayEvents = eventsByDay.get(dayKey(day)) ?? [];
              const overflow = dayEvents.length > 3 ? dayEvents.length - 3 : 0;
              return (
                <button
                  key={day.toISOString()}
                  className={`calendar-day${inMonth ? "" : " calendar-day-outside"}${
                    isToday ? " calendar-day-today" : ""
                  }`}
                  onClick={() => dayEvents.length > 0 && setSelectedDay(day)}
                  disabled={dayEvents.length === 0}
                >
                  <span className="calendar-day-number">{day.getDate()}</span>
                  <div className="calendar-day-events">
                    {dayEvents.slice(0, 3).map((event, i) => (
                      <span
                        key={i}
                        className={`calendar-event-pill calendar-event-${event.type}`}
                        title={`${event.projectName} — ${event.title}`}
                      >
                        {event.title}
                      </span>
                    ))}
                    {overflow > 0 && (
                      <span className="calendar-event-more">
                        {t("calendar.more", { count: overflow })}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {!loading && events.length === 0 && (
        <EmptyState icon={<IconCalendar />} title={t("calendar.emptyTitle")} />
      )}

      {selectedDay && (
        <Modal
          title={selectedDay.toLocaleDateString(lang, {
            weekday: "long",
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
          onClose={() => setSelectedDay(null)}
        >
          {selectedEvents.map((event, i) => (
            <button
              key={i}
              className="list-row"
              style={{ width: "100%", textAlign: "left", cursor: "pointer" }}
              onClick={() => navigate(`/projects/${event.projectId}`)}
            >
              <div
                className="stat-icon"
                style={{
                  background: "var(--primary-soft)",
                  color: "var(--primary)",
                  marginBottom: 0,
                  width: 32,
                  height: 32,
                }}
              >
                {event.type === "project" ? <IconFolder /> : <IconCheckCircle />}
              </div>
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="text-small" style={{ fontWeight: 600 }}>
                  {event.title}
                </div>
                <div className="text-xs text-muted">
                  {event.type === "project"
                    ? t("calendar.deadlineOf", { project: event.projectName })
                    : event.projectName}
                </div>
              </div>
              <IconChevronRight style={{ width: 14, height: 14 }} />
            </button>
          ))}
        </Modal>
      )}
    </div>
  );
}
