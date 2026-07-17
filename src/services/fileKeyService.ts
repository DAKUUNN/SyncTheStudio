import { doc, getDoc, setDoc, FieldPath, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";
import { generateKeyBase64, rsaWrapKey, rsaUnwrapKey } from "@/lib/crypto";
import { getPrivateKey, getPublicKeyOf, getUnlockedMasterKey } from "./keyService";
import type { ProjectModel } from "@/models/types";

/**
 * Per-project file key for the zero-knowledge file encryption. Unlike
 * the legacy contentKey (stored in plaintext in Firestore), this key
 * exists server-side ONLY wrapped per member:
 *
 *   projects/{id}.fileKeys = { [userId]: rsaWrap(fileKey, userPublicKey) }
 *
 * The owner creates it lazily on first encrypted upload and wraps it
 * for every member with a published public key. Members who joined
 * later get their entry backfilled next time the owner opens the
 * project's files. Public share/upload links carry the key in the URL
 * fragment instead (never sent to the server) — see masterService.
 */

const fileKeyCache = new Map<string, string>();

export function clearFileKeyCache(): void {
  fileKeyCache.clear();
}

async function readFileKeysMap(projectId: string): Promise<Record<string, string>> {
  const snapshot = await getDoc(doc(db, "projects", projectId));
  return (snapshot.data()?.fileKeys as Record<string, string> | undefined) ?? {};
}

/**
 * Unwraps (or creates, when owner) the project's file key. Returns null
 * when the current user can't get one — locked keys, member without a
 * backfilled entry yet, or missing key infrastructure. Callers fall
 * back to unencrypted legacy behavior in that case.
 */
export async function getOrCreateProjectFileKey(
  project: ProjectModel,
  currentUserId: string
): Promise<string | null> {
  const cached = fileKeyCache.get(project.id);
  if (cached) return cached;
  if (!getUnlockedMasterKey(currentUserId)) return null;

  const fileKeys = await readFileKeysMap(project.id);
  const wrappedForMe = fileKeys[currentUserId];

  if (wrappedForMe) {
    const privateKey = await getPrivateKey(currentUserId);
    if (!privateKey) return null;
    try {
      const fileKey = await rsaUnwrapKey(wrappedForMe, privateKey);
      fileKeyCache.set(project.id, fileKey);
      return fileKey;
    } catch {
      return null;
    }
  }

  // No entry for me. Only the owner may mint the key.
  if (project.ownerId !== currentUserId) return null;
  if (Object.keys(fileKeys).length > 0) {
    // key exists but owner's entry is missing — unrecoverable mismatch,
    // don't silently mint a second key over existing encrypted files
    return null;
  }

  const fileKey = generateKeyBase64();
  const wrapped: Record<string, string> = {};
  const memberIds = [currentUserId, ...project.sharedWith.filter((id) => id !== currentUserId)];
  for (const memberId of memberIds) {
    const publicKey = await getPublicKeyOf(memberId);
    if (publicKey) wrapped[memberId] = await rsaWrapKey(fileKey, publicKey);
  }
  if (!wrapped[currentUserId]) return null; // own public key missing — keys not provisioned

  await setDoc(
    doc(db, "projects", project.id),
    { fileKeys: wrapped, updatedAt: serverTimestamp() },
    { merge: true }
  );
  fileKeyCache.set(project.id, fileKey);
  return fileKey;
}

/**
 * Owner-side backfill: wraps the file key for members that joined after
 * the key was created. Safe to call often — no-ops quickly when
 * everyone is covered.
 */
export async function backfillMemberFileKeys(
  project: ProjectModel,
  currentUserId: string
): Promise<void> {
  if (project.ownerId !== currentUserId) return;
  const fileKey = await getOrCreateProjectFileKey(project, currentUserId);
  if (!fileKey) return;

  const fileKeys = await readFileKeysMap(project.id);
  for (const memberId of project.sharedWith) {
    if (fileKeys[memberId]) continue;
    const publicKey = await getPublicKeyOf(memberId);
    if (!publicKey) continue;
    try {
      await updateDoc(
        doc(db, "projects", project.id),
        new FieldPath("fileKeys", memberId),
        await rsaWrapKey(fileKey, publicKey)
      );
    } catch {
      // best-effort
    }
  }
}

/**
 * Resolves a master version's per-file key: legacy masters carry it in
 * plaintext (fileKey), zero-knowledge masters carry it wrapped with the
 * project file key (fileKeyWrapped). Returns null when locked out.
 */
export async function resolveMasterFileKey(
  master: { fileKey: string; fileKeyWrapped: string },
  projectFileKey: string | null
): Promise<string | null> {
  if (master.fileKey) return master.fileKey;
  if (!master.fileKeyWrapped || !projectFileKey) return null;
  try {
    const { unwrapKeyBase64 } = await import("@/lib/crypto");
    return await unwrapKeyBase64(master.fileKeyWrapped, projectFileKey);
  } catch {
    return null;
  }
}

// ── URL-fragment transport for public links ──────────────────────
// The fragment (#k=…) never reaches the server: browsers strip it from
// requests, so the stored share URL stays key-free and zero-knowledge
// holds even for public review/upload pages.

export function appendKeyFragment(url: string, fileKey: string | null): string {
  if (!fileKey) return url;
  return `${url}#k=${encodeURIComponent(fileKey)}`;
}

export function readKeyFragment(): string | null {
  const match = window.location.hash.match(/[#&]k=([^&]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}
