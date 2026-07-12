import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/firebase";
import { generateKeyBase64 } from "@/lib/crypto";

/** Port of key_management_service.dart — content keys stored in Firestore. */

export async function getOrCreateUserContentKey(userId: string): Promise<string> {
  const ref = doc(db, "users", userId, "private", "security");
  const snapshot = await getDoc(ref);
  const existing = (snapshot.data()?.contentKey as string | undefined)?.trim();
  if (existing) return existing;

  const key = generateKeyBase64();
  await setDoc(ref, { contentKey: key, updatedAt: serverTimestamp() }, { merge: true });
  return key;
}

const projectKeyCache = new Map<string, string>();

export async function getOrCreateProjectContentKey(
  projectId: string,
  ownerId: string
): Promise<string | null> {
  const currentUserId = auth.currentUser?.uid;
  if (!currentUserId) return null;

  const cached = projectKeyCache.get(projectId);
  if (cached) return cached;

  const sharedDoc = await getDoc(doc(db, "shared_projects", projectId));
  const sharedKey = (sharedDoc.data()?.contentKey as string | undefined)?.trim();
  if (sharedKey) {
    projectKeyCache.set(projectId, sharedKey);
    return sharedKey;
  }

  const ownDoc = await getDoc(doc(db, "users", currentUserId, "projects", projectId));
  const ownKey = (ownDoc.data()?.contentKey as string | undefined)?.trim();
  if (ownKey) {
    projectKeyCache.set(projectId, ownKey);
    return ownKey;
  }

  if (currentUserId !== ownerId) return null;

  const newKey = generateKeyBase64();
  await setDoc(
    doc(db, "users", ownerId, "projects", projectId),
    { contentKey: newKey, encryptionVersion: 1, updatedAt: serverTimestamp() },
    { merge: true }
  );
  await setDoc(
    doc(db, "projects", projectId),
    { ownerId, contentKey: newKey, encryptionVersion: 1, updatedAt: serverTimestamp() },
    { merge: true }
  );
  if (sharedDoc.exists()) {
    await setDoc(
      doc(db, "shared_projects", projectId),
      { contentKey: newKey, encryptionVersion: 1, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }
  projectKeyCache.set(projectId, newKey);
  return newKey;
}

export function clearProjectKeyCache(): void {
  projectKeyCache.clear();
}
