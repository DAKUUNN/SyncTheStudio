import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  writeBatch,
  arrayUnion,
  Timestamp,
  type CollectionReference,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/firebase";
import {
  notificationFromDocument,
  isNotificationActionable,
  isNotificationReadForUser,
  isNotificationTypeEnabled,
  isInQuietHours,
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationModel,
  type NotificationPreferences,
} from "@/models/types";

/** Port of notification_service.dart — collection app_admin_notifications */

export type NotificationFeedFilter =
  | "all"
  | "unread"
  | "invitation"
  | "deadline"
  | "projectUpdate"
  | "system"
  | "chat";

const notificationsCollection = (): CollectionReference =>
  collection(db, "app_admin_notifications");

function isChatType(type: string): boolean {
  return type === "chat" || type === "chat_message";
}

function isVisibleForUser(item: NotificationModel, userId: string): boolean {
  const hasDirectTarget = !!item.targetUserId?.trim();
  const hasTargetList = item.targetUserIds.length > 0;
  if (!hasDirectTarget && !hasTargetList) return true;
  if (item.targetUserId === userId) return true;
  return item.targetUserIds.includes(userId);
}

function matchesFilter(item: NotificationModel, filter: NotificationFeedFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "unread":
      return !item.isRead;
    case "invitation":
      return item.type === "invitation";
    case "deadline":
      return item.type === "deadline";
    case "projectUpdate":
      return item.type === "project_update";
    case "system":
      return item.type === "system";
    case "chat":
      return isChatType(item.type);
  }
}

function compareIntelligent(
  a: NotificationModel,
  b: NotificationModel,
  preferences: NotificationPreferences
): number {
  const aReadWeight = a.isRead ? 1 : 0;
  const bReadWeight = b.isRead ? 1 : 0;
  if (aReadWeight !== bReadWeight) return aReadWeight - bReadWeight;

  const aQuiet = isInQuietHours(preferences, a.createdAt) ? 1 : 0;
  const bQuiet = isInQuietHours(preferences, b.createdAt) ? 1 : 0;
  if (aQuiet !== bQuiet) return aQuiet - bQuiet;

  const aAction = isNotificationActionable(a) ? 1 : 0;
  const bAction = isNotificationActionable(b) ? 1 : 0;
  if (aAction !== bAction) return bAction - aAction;

  if (a.priority !== b.priority) return b.priority - a.priority;
  return b.createdAt.getTime() - a.createdAt.getTime();
}

export function buildFeed(params: {
  notifications: NotificationModel[];
  userId: string;
  preferences: NotificationPreferences;
  filter: NotificationFeedFilter;
}): NotificationModel[] {
  const items = params.notifications
    .filter((item) => isVisibleForUser(item, params.userId))
    .filter((item) => isNotificationTypeEnabled(params.preferences, item.type))
    .map((item) => ({
      ...item,
      isRead: isNotificationReadForUser(item, params.userId),
    }))
    .filter((item) => matchesFilter(item, params.filter));

  if (params.preferences.intelligentSortingEnabled) {
    items.sort((a, b) => compareIntelligent(a, b, params.preferences));
  } else {
    items.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }
  return items;
}

export function watchNotifications(
  userId: string,
  preferences: NotificationPreferences,
  filter: NotificationFeedFilter,
  onChange: (items: NotificationModel[]) => void
): Unsubscribe {
  return onSnapshot(
    query(notificationsCollection(), orderBy("createdAt", "desc"), limit(500)),
    (snapshot) => {
      const items = snapshot.docs.map(notificationFromDocument);
      onChange(buildFeed({ notifications: items, userId, preferences, filter }));
    }
  );
}

export async function getNotifications(
  userId: string,
  preferences?: NotificationPreferences,
  filter: NotificationFeedFilter = "all"
): Promise<NotificationModel[]> {
  try {
    const snapshot = await getDocs(
      query(notificationsCollection(), orderBy("createdAt", "desc"), limit(300))
    );
    const items = snapshot.docs.map(notificationFromDocument);
    return buildFeed({
      notifications: items,
      userId,
      preferences: preferences ?? DEFAULT_NOTIFICATION_PREFERENCES,
      filter,
    });
  } catch {
    return [];
  }
}

export async function getUnreadCount(
  userId: string,
  preferences?: NotificationPreferences
): Promise<number> {
  const unread = await getNotifications(userId, preferences, "unread");
  return unread.length;
}

export async function createNotification(params: {
  senderId: string;
  senderName: string;
  title: string;
  message: string;
  type?: string;
  priority?: number;
  targetUserId?: string | null;
  targetUserIds?: string[];
  projectId?: string | null;
}): Promise<string> {
  const docRef = await addDoc(notificationsCollection(), {
    title: params.title,
    message: params.message,
    senderId: params.senderId,
    senderName: params.senderName,
    type: params.type ?? "system",
    priority: params.priority ?? 0,
    targetUserId: params.targetUserId ?? null,
    targetUserIds: params.targetUserIds ?? [],
    projectId: params.projectId ?? null,
    createdAt: Timestamp.fromDate(new Date()),
    isRead: false,
    readBy: [],
  });
  return docRef.id;
}

export async function markAsRead(notificationId: string, userId?: string): Promise<void> {
  try {
    if (userId?.trim()) {
      await updateDoc(doc(notificationsCollection(), notificationId), {
        readBy: arrayUnion(userId),
      });
    } else {
      await updateDoc(doc(notificationsCollection(), notificationId), { isRead: true });
    }
  } catch {
    // best-effort
  }
}

export async function markAllAsRead(userId: string): Promise<void> {
  try {
    const snapshot = await getDocs(
      query(notificationsCollection(), orderBy("createdAt", "desc"), limit(300))
    );
    const batch = writeBatch(db);
    let hasChanges = false;
    for (const d of snapshot.docs) {
      const item = notificationFromDocument(d);
      if (!isVisibleForUser(item, userId)) continue;
      if (isNotificationReadForUser(item, userId)) continue;
      batch.update(d.ref, { readBy: arrayUnion(userId) });
      hasChanges = true;
    }
    if (hasChanges) await batch.commit();
  } catch {
    // best-effort
  }
}

export async function markChatNotificationsAsReadForProject(
  userId: string,
  projectId: string
): Promise<void> {
  const normalizedUserId = userId.trim();
  const normalizedProjectId = projectId.trim();
  if (!normalizedUserId || !normalizedProjectId) return;
  try {
    const snapshot = await getDocs(
      query(
        notificationsCollection(),
        where("projectId", "==", normalizedProjectId),
        where("targetUserId", "==", normalizedUserId),
        where("type", "in", ["chat", "chat_message"]),
        limit(200)
      )
    );
    if (snapshot.empty) return;
    const batch = writeBatch(db);
    let hasUpdates = false;
    for (const d of snapshot.docs) {
      const item = notificationFromDocument(d);
      if (isNotificationReadForUser(item, normalizedUserId)) continue;
      batch.update(d.ref, { readBy: arrayUnion(normalizedUserId) });
      hasUpdates = true;
    }
    if (hasUpdates) await batch.commit();
  } catch {
    // best-effort
  }
}

export async function deleteNotification(notificationId: string): Promise<void> {
  try {
    await deleteDoc(doc(notificationsCollection(), notificationId));
  } catch {
    // best-effort
  }
}

// ── Notification preferences (users/{uid}/private/notificationPrefs) ──

import { getDoc, setDoc } from "firebase/firestore";
import { notificationPreferencesFromMap } from "@/models/types";

const PREFS_STORAGE_KEY = "notification_preferences";

export async function loadNotificationPreferences(
  userId: string
): Promise<NotificationPreferences> {
  try {
    const snapshot = await getDoc(
      doc(db, "users", userId, "private", "notificationPrefs")
    );
    if (snapshot.exists()) {
      return notificationPreferencesFromMap(snapshot.data() as Record<string, unknown>);
    }
  } catch {
    // fall back to local
  }
  try {
    const raw = localStorage.getItem(`${userId}_${PREFS_STORAGE_KEY}`);
    if (raw) {
      return notificationPreferencesFromMap(JSON.parse(raw) as Record<string, unknown>);
    }
  } catch {
    // ignore
  }
  return DEFAULT_NOTIFICATION_PREFERENCES;
}

export async function saveNotificationPreferences(
  userId: string,
  prefs: NotificationPreferences
): Promise<void> {
  localStorage.setItem(`${userId}_${PREFS_STORAGE_KEY}`, JSON.stringify(prefs));
  try {
    await setDoc(
      doc(db, "users", userId, "private", "notificationPrefs"),
      { ...prefs },
      { merge: true }
    );
  } catch {
    // cloud sync best-effort
  }
}
