import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { getProjects, getSharedProjects } from "./projectService";
import { translate, getCurrentLanguageCode } from "@/i18n";

/** Port of deadline_notification_service.dart — desktop notifications for
 *  upcoming project deadlines, checked periodically while the app runs. */

const NOTIFIED_KEY = "deadline_notified_v1";
let intervalHandle: number | null = null;

async function ensurePermission(): Promise<boolean> {
  try {
    if (await isPermissionGranted()) return true;
    const permission = await requestPermission();
    return permission === "granted";
  } catch {
    return false;
  }
}

function loadNotified(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? "{}") as Record<
      string,
      number
    >;
  } catch {
    return {};
  }
}

function saveNotified(notified: Record<string, number>): void {
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(notified));
}

export async function checkDeadlinesNow(userId: string): Promise<void> {
  const granted = await ensurePermission();
  if (!granted) return;

  const [ownProjects, sharedProjects] = await Promise.all([
    getProjects(userId),
    getSharedProjects(userId),
  ]);
  const projectMap = new Map<string, (typeof ownProjects)[number]>();
  for (const project of ownProjects) projectMap.set(project.id, project);
  for (const project of sharedProjects) projectMap.set(project.id, project);
  const projects = [...projectMap.values()];
  const notified = loadNotified();
  const now = Date.now();
  const lang = getCurrentLanguageCode();

  for (const project of projects) {
    if (!project.deadline) continue;
    if (project.statusValue === "abgeschlossen") continue;

    const deadlineMs = project.deadline.getTime();
    const notifyAtMs = deadlineMs - project.notifyBeforeMinutes * 60000;
    const alreadyNotified = notified[project.id] === deadlineMs;

    if (now >= notifyAtMs && now < deadlineMs && !alreadyNotified) {
      sendNotification({
        title: translate(lang, "app.name"),
        body: `${project.name}${
          project.customerName ? ` (${project.customerName})` : ""
        } — Deadline: ${project.deadline.toLocaleString()}`,
      });
      notified[project.id] = deadlineMs;
    }
  }
  saveNotified(notified);
}

export function startDeadlineWatcher(userId: string): void {
  stopDeadlineWatcher();
  void checkDeadlinesNow(userId);
  intervalHandle = window.setInterval(() => {
    void checkDeadlinesNow(userId);
  }, 5 * 60 * 1000);
}

export function stopDeadlineWatcher(): void {
  if (intervalHandle !== null) {
    window.clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
