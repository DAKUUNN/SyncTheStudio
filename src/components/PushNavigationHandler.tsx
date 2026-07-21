import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/stores/authStore";
import { useIsIOS, useIsDesktopTauri } from "@/lib/platform";
import { startDesktopPushWatcher, stopDesktopPushWatcher } from "@/services/pushNotificationWatcher";

/** Mounted once globally (see App.tsx). Makes tapping/clicking a push
 *  notification — chat message, master feedback, customer upload — jump
 *  straight to the relevant project tab instead of just opening the app.
 *  iOS gets this from the real APNs push tap (native Swift plugin, see
 *  plugins-push/ios/Sources/PushTokenPlugin.swift); desktop has no OS push
 *  at all, so it runs its own local-notification watcher instead. */
export function PushNavigationHandler() {
  const { currentUser } = useAuth();
  const isIOS = useIsIOS();
  const isDesktopTauri = useIsDesktopTauri();
  const navigate = useNavigate();

  const goTo = (projectId: string, screen: string | null) => {
    navigate(`/projects/${projectId}`, { state: screen ? { tab: screen } : undefined });
  };

  useEffect(() => {
    if (!currentUser) return;

    if (isIOS) {
      let unregister: (() => void) | null = null;
      void import("@tauri-apps/api/core").then(({ addPluginListener }) => {
        void addPluginListener<{ projectId?: string; screen?: string }>(
          "push-token",
          "notificationTapped",
          (payload) => {
            if (payload.projectId) goTo(payload.projectId, payload.screen ?? null);
          }
        ).then((listener) => {
          unregister = () => void listener.unregister();
        });
      });
      return () => unregister?.();
    }

    if (isDesktopTauri) {
      startDesktopPushWatcher(currentUser.id, goTo);
      return () => stopDesktopPushWatcher();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, isIOS, isDesktopTauri]);

  return null;
}
