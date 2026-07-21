import { useEffect, useRef } from "react";
import { useAuth } from "@/stores/authStore";
import { useIsDesktopTauri } from "@/lib/platform";
import { useI18n } from "@/i18n";
import { startTimer, stopTimer } from "@/services/timeTrackingService";
import {
  getAutoTrackProjectId,
  getCustomKeywordsRaw,
  getFrontmostAppName,
  getStoredActiveEntry,
  isKnownDawName,
  setStoredActiveEntry,
  type DawActiveEntry,
} from "@/services/dawTrackerService";

const POLL_MS = 6000;
/** Don't stop the timer on a brief alt-tab away from the DAW (checking a
 *  browser reference, replying to a message) — only after it's been out
 *  of focus for this long. */
const STOP_GRACE_MS = 90_000;

/** Mounted once globally (see App.tsx). Desktop-only: polls which app is
 *  frontmost and auto starts/stops a time entry on the project the user
 *  assigned via the toggle in TimeTab, whenever a known DAW has focus. */
export function DawAutoTracker() {
  const { currentUser } = useAuth();
  const isDesktopTauri = useIsDesktopTauri();
  const { t } = useI18n();
  const activeEntryRef = useRef<DawActiveEntry | null>(null);
  const lastFocusedAtRef = useRef<number>(0);

  // A previous session may have quit while the DAW still had focus,
  // leaving a time entry open forever — close it on the next launch.
  useEffect(() => {
    const stale = getStoredActiveEntry();
    if (stale) {
      setStoredActiveEntry(null);
      void stopTimer(stale.projectId, stale.entryId).catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!isDesktopTauri || !currentUser) return;

    const stopActive = async () => {
      const entry = activeEntryRef.current;
      if (!entry) return;
      activeEntryRef.current = null;
      setStoredActiveEntry(null);
      await stopTimer(entry.projectId, entry.entryId).catch(() => {});
    };

    const tick = async () => {
      const projectId = getAutoTrackProjectId();
      if (!projectId) {
        await stopActive();
        return;
      }
      if (activeEntryRef.current && activeEntryRef.current.projectId !== projectId) {
        await stopActive();
      }

      const name = await getFrontmostAppName();
      const focused = !!name && isKnownDawName(name, getCustomKeywordsRaw());
      const now = Date.now();

      if (focused) {
        lastFocusedAtRef.current = now;
        if (!activeEntryRef.current) {
          const entryId = await startTimer({
            projectId,
            userId: currentUser.id,
            username: currentUser.username,
            description: t("time.autoTrackDescription"),
          }).catch(() => null);
          if (entryId) {
            const entry = { projectId, entryId };
            activeEntryRef.current = entry;
            setStoredActiveEntry(entry);
          }
        }
      } else if (activeEntryRef.current && now - lastFocusedAtRef.current > STOP_GRACE_MS) {
        await stopActive();
      }
    };

    const interval = window.setInterval(() => void tick(), POLL_MS);
    void tick();
    return () => window.clearInterval(interval);
  }, [isDesktopTauri, currentUser?.id, currentUser?.username, t]);

  return null;
}
