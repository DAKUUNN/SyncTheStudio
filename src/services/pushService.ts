import { doc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";

/** Requests notification permission, registers for APNs, exchanges the
 *  device token for an FCM token (native side), and stores it under the
 *  user's doc so a Cloud Function can target sends via
 *  `admin.messaging().send()`. Token is the Firestore doc ID so
 *  re-registering the same device is a no-op merge, not a duplicate. */
export async function registerPushToken(userId: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  const result = await invoke<{ fcmToken: string }>("plugin:push-token|register");
  if (!result.fcmToken) return;

  await setDoc(
    doc(db, "users", userId, "pushTokens", result.fcmToken),
    { platform: "ios", updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function removePushToken(userId: string, token: string): Promise<void> {
  try {
    await deleteDoc(doc(db, "users", userId, "pushTokens", token));
  } catch {
    // best-effort
  }
}
