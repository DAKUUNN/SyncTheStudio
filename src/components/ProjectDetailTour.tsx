import { useAuth } from "@/stores/authStore";
import { TourRunner, type TourStep } from "./OnboardingTour";

const STEPS: TourStep[] = [
  { target: "project-tab-info", titleKey: "projectTour.info.title", descKey: "projectTour.info.desc" },
  { target: "project-tab-files", titleKey: "projectTour.files.title", descKey: "projectTour.files.desc" },
  { target: "project-tab-team", titleKey: "projectTour.team.title", descKey: "projectTour.team.desc" },
  { target: "project-tab-chat", titleKey: "projectTour.chat.title", descKey: "projectTour.chat.desc" },
  { target: "project-tab-tasks", titleKey: "projectTour.tasks.title", descKey: "projectTour.tasks.desc" },
  { target: "project-tab-time", titleKey: "projectTour.time.title", descKey: "projectTour.time.desc" },
  { target: "project-tab-history", titleKey: "projectTour.history.title", descKey: "projectTour.history.desc" },
];

const RESTART_EVENT = "sts:restart-project-tour";
const seenKey = (userId: string) => `sts_tour_project_seen_${userId}`;

export function restartProjectTour(userId: string): void {
  window.localStorage.removeItem(seenKey(userId));
  window.dispatchEvent(new Event(RESTART_EVENT));
}

/** Walks a first-time visitor through the project detail tabs (Info,
 *  Dateien, Team, Chat, Aufgaben, Zeit, Verlauf). Mount once the project
 *  has actually loaded so the tab bar exists in the DOM. */
export function ProjectDetailTour({ ready }: { ready: boolean }) {
  const { currentUser } = useAuth();
  if (!currentUser) return null;
  return (
    <TourRunner
      steps={STEPS}
      storageKey={seenKey(currentUser.id)}
      restartEventName={RESTART_EVENT}
      ready={ready}
      startDelay={500}
    />
  );
}
