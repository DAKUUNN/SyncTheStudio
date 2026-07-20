import { collection, onSnapshot, orderBy, query, limit } from "firebase/firestore";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
  onAction,
} from "@tauri-apps/plugin-notification";
import type { PluginListener } from "@tauri-apps/api/core";
import { db } from "@/firebase";

/** Desktop-only: there's no APNs/FCM push on desktop (see pushService.ts),
 *  so chat/master-feedback/customer-upload events only reach a desktop
 *  session by watching the same app_admin_notifications collection the
 *  in-app bell uses and mirroring new arrivals into a native OS
 *  notification — with `extra` carrying the deep-link target so clicking
 *  it can jump straight to the right project/tab (see PushNavigationHandler). */

const DESKTOP_PUSH_TYPES = new Set(["chat_message", "master_feedback", "customer_upload"]);

let unsubscribeSnapshot: (() => void) | null = null;
let actionListener: PluginListener | null = null;
let started = false;

async function ensurePermission(): Promise<boolean> {
  try {
    if (await isPermissionGranted()) return true;
    const permission = await requestPermission();
    return permission === "granted";
  } catch {
    return false;
  }
}

export function startDesktopPushWatcher(
  userId: string,
  onNotificationClicked: (projectId: string, screen: string | null) => void
): void {
  if (started) return;
  started = true;

  void ensurePermission();

  void onAction((notification) => {
    const extra = notification.extra as { projectId?: string; screen?: string } | undefined;
    if (extra?.projectId) onNotificationClicked(extra.projectId, extra.screen ?? null);
  }).then((listener) => {
    actionListener = listener;
  });

  // Skip the initial backlog burst on (re)connect — only notify for
  // documents that arrive *after* this watcher starts.
  let skipInitial = true;
  unsubscribeSnapshot = onSnapshot(
    query(collection(db, "app_admin_notifications"), orderBy("createdAt", "desc"), limit(30)),
    (snapshot) => {
      if (skipInitial) {
        skipInitial = false;
        return;
      }
      for (const change of snapshot.docChanges()) {
        if (change.type !== "added") continue;
        const data = change.doc.data() as Record<string, unknown>;
        if (!DESKTOP_PUSH_TYPES.has(String(data.type ?? ""))) continue;
        if (data.targetUserId !== userId) continue;

        void sendNotification({
          title: String(data.title ?? ""),
          body: String(data.message ?? ""),
          extra: {
            projectId: String(data.projectId ?? ""),
            screen: String(data.screen ?? ""),
          },
        });
      }
    }
  );
}

export function stopDesktopPushWatcher(): void {
  started = false;
  unsubscribeSnapshot?.();
  unsubscribeSnapshot = null;
  void actionListener?.unregister();
  actionListener = null;
}
