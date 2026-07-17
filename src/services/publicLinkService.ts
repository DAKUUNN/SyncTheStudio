import {
  arrayUnion,
  collection,
  doc,
  FieldPath,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/firebase";
import {
  masterVersionFromDocument,
  parseDate,
  type MasterVersionModel,
} from "@/models/types";
import { hashSharePassword } from "@/lib/crypto";
import { uploadAttachment, type AttachmentUploadResult } from "./storageService";

/**
 * Public share pages must NEVER read `projects/{id}` directly — that document
 * carries the project's AES contentKey (used to encrypt notes/chat/tasks) and
 * is locked down to owner/collaborators only. Instead these read a dedicated
 * `public_master_shares/{token}` / `public_uploads/{token}` document that only
 * ever contains the safe subset of fields, kept in sync by masterService.ts
 * whenever the owner changes their share settings. See firestore.rules.
 */

interface PublicProjectLinkBase {
  projectId: string;
  ownerId: string;
  projectName: string;
  customerName: string | null;
  isActive: boolean;
  hasPassword: boolean;
  passwordHash: string | null;
  passwordSalt: string | null;
}

export interface PublicMasterShareAccess extends PublicProjectLinkBase {
  allowDownload: boolean;
  expiresAt: Date | null;
  /** Whether this project also has an active customer-upload link — lets the
   * review page offer a "Dateien hochladen" tab without a second link. */
  uploadActive: boolean;
}

export interface PublicCustomerUploadAccess extends PublicProjectLinkBase {}

async function lookupPublicDoc(
  collectionName: "public_master_shares" | "public_uploads",
  token: string
): Promise<Record<string, unknown> | null> {
  const normalizedToken = token.trim();
  if (!normalizedToken) return null;
  const snapshot = await getDoc(doc(db, collectionName, normalizedToken));
  if (!snapshot.exists()) return null;
  return (snapshot.data() as Record<string, unknown>) ?? {};
}

function toPublicBase(data: Record<string, unknown>): PublicProjectLinkBase {
  return {
    projectId: String(data.projectId ?? "").trim(),
    ownerId: String(data.ownerId ?? "").trim(),
    projectName: String(data.projectName ?? "Projekt").trim() || "Projekt",
    customerName: (data.customerName as string | undefined) ?? null,
    isActive: Boolean(data.isActive ?? false),
    hasPassword: Boolean(data.hasPassword ?? false),
    passwordHash: (data.passwordHash as string | undefined) ?? null,
    passwordSalt: (data.passwordSalt as string | undefined) ?? null,
  };
}

export async function getPublicMasterShareByToken(
  token: string
): Promise<PublicMasterShareAccess | null> {
  const data = await lookupPublicDoc("public_master_shares", token);
  if (!data) return null;
  return {
    ...toPublicBase(data),
    allowDownload: Boolean(data.allowDownload ?? false),
    expiresAt: parseDate(data.expiresAt),
    uploadActive: Boolean(data.uploadActive ?? false),
  };
}

export async function getPublicCustomerUploadByToken(
  token: string
): Promise<PublicCustomerUploadAccess | null> {
  const data = await lookupPublicDoc("public_uploads", token);
  if (!data) return null;
  return toPublicBase(data);
}

/**
 * Public share pages have no login. Storage write rules for these flows
 * require `signedIn()` (see storage.rules), so we sign the visitor in
 * anonymously before writing — a throwaway auth session, not a real account.
 */
export async function ensureAnonymousAuth(): Promise<void> {
  if (auth.currentUser) return;
  await signInAnonymously(auth);
}

export async function verifyPublicLinkPassword(params: {
  password: string;
  passwordHash: string | null;
  passwordSalt: string | null;
}): Promise<boolean> {
  if (!params.passwordHash || !params.passwordSalt) return true;
  const computed = await hashSharePassword(params.password.trim(), params.passwordSalt);
  return computed === params.passwordHash;
}

export async function getPublicMasterVersions(
  projectId: string
): Promise<MasterVersionModel[]> {
  const snapshot = await getDocs(
    query(collection(db, "projects", projectId, "masters"), orderBy("createdAt", "desc"))
  );
  return snapshot.docs.map(masterVersionFromDocument);
}

/**
 * The anonymous customer session can only ever *update* (not read) the
 * owner's private project doc / shared_projects — see firestore.rules'
 * isActiveCustomerUpload() exception. A read-then-merge would 403 on the
 * read, so this appends blindly with arrayUnion() + a single-map-key write
 * (via FieldPath, so a URL containing dots isn't parsed as nested paths).
 */
async function syncAttachmentIntoProjectCopies(
  projectId: string,
  ownerId: string,
  attachment: AttachmentUploadResult
): Promise<void> {
  const ownerRef = doc(db, "users", ownerId, "projects", projectId);
  const sharedRef = doc(db, "shared_projects", projectId);
  const rootRef = doc(db, "projects", projectId);

  const applyUpdate = (ref: typeof ownerRef) =>
    updateDoc(
      ref,
      "attachments",
      arrayUnion(attachment.url),
      new FieldPath("attachmentNames", attachment.url),
      attachment.fileName,
      // FieldPath keeps the URL as ONE segment (a dotted string path
      // would split on every dot in the URL)
      ...(attachment.iv
        ? [new FieldPath("attachmentMeta", attachment.url), { iv: attachment.iv }]
        : []),
      "updatedAt",
      serverTimestamp()
    );

  await Promise.allSettled([applyUpdate(ownerRef), applyUpdate(sharedRef)]);
  await setDoc(rootRef, { updatedAt: serverTimestamp() }, { merge: true });

  // Marker doc for the push notification to the owner — the Cloud
  // Function pushOnCustomerUpload listens on this subcollection.
  // Best-effort: a failed marker must never fail the actual upload.
  try {
    await setDoc(doc(collection(db, "projects", projectId, "customerUploads")), {
      fileName: attachment.fileName,
      createdAt: serverTimestamp(),
    });
  } catch {
    // ignore
  }
}

/**
 * Voice-note revisions recorded on the public master review page — see
 * storage.rules' voiceNotes/{projectId}/{fileName} match block, same
 * anonymous-auth pattern as attachments (cross-service Firestore checks
 * from Storage Rules don't work reliably in this project, see
 * storage.rules' comment on the attachments block).
 */
export async function uploadVoiceNote(projectId: string, blob: Blob): Promise<string> {
  await ensureAnonymousAuth();
  const extension = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
  const path = `voiceNotes/${projectId}/${Date.now()}.${extension}`;
  const ref = storageRef(storage, path);
  const snapshot = await uploadBytes(ref, blob, { contentType: blob.type || "audio/webm" });
  return getDownloadURL(snapshot.ref);
}

export async function uploadFilesViaPublicLink(params: {
  projectId: string;
  ownerId: string;
  files: { bytes: Uint8Array; name: string }[];
  /** Project file key from the link's URL fragment — uploads are
   *  encrypted in the customer's browser when present. */
  encryptKey?: string | null;
  onProgress?: (fileIndex: number, progress: number) => void;
}): Promise<AttachmentUploadResult[]> {
  const normalizedOwnerId = params.ownerId.trim();
  if (!normalizedOwnerId) {
    throw new Error("Projektbesitzer konnte nicht ermittelt werden.");
  }

  await ensureAnonymousAuth();

  const uploaded: AttachmentUploadResult[] = [];
  for (let index = 0; index < params.files.length; index++) {
    const file = params.files[index];
    const result = await uploadAttachment({
      fileBytes: file.bytes,
      fileName: file.name,
      projectId: params.projectId,
      encryptKey: params.encryptKey,
      onProgress: (progress) => params.onProgress?.(index, progress),
    });
    await syncAttachmentIntoProjectCopies(params.projectId, normalizedOwnerId, result);
    uploaded.push(result);
  }
  return uploaded;
}
