import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/firebase";
import {
  masterVersionFromDocument,
  parseDate,
  parseStringList,
  parseStringMap,
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
  };
}

export async function getPublicCustomerUploadByToken(
  token: string
): Promise<PublicCustomerUploadAccess | null> {
  const data = await lookupPublicDoc("public_uploads", token);
  if (!data) return null;
  return toPublicBase(data);
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

function mergeAttachmentData(
  data: Record<string, unknown> | undefined,
  attachment: AttachmentUploadResult
): { attachments: string[]; attachmentNames: Record<string, string> } {
  const attachments = parseStringList(data?.attachments);
  const attachmentNames = parseStringMap(data?.attachmentNames);
  if (!attachments.includes(attachment.url)) attachments.push(attachment.url);
  attachmentNames[attachment.url] = attachment.fileName;
  return { attachments, attachmentNames };
}

async function syncAttachmentIntoProjectCopies(
  projectId: string,
  ownerId: string,
  attachment: AttachmentUploadResult
): Promise<void> {
  const ownerRef = doc(db, "users", ownerId, "projects", projectId);
  const sharedRef = doc(db, "shared_projects", projectId);
  const rootRef = doc(db, "projects", projectId);

  const [ownerSnapshot, sharedSnapshot] = await Promise.all([
    getDoc(ownerRef),
    getDoc(sharedRef),
  ]);

  if (ownerSnapshot.exists()) {
    const merged = mergeAttachmentData(
      ownerSnapshot.data() as Record<string, unknown> | undefined,
      attachment
    );
    await updateDoc(ownerRef, {
      ...merged,
      updatedAt: serverTimestamp(),
    });
  }

  if (sharedSnapshot.exists()) {
    const merged = mergeAttachmentData(
      sharedSnapshot.data() as Record<string, unknown> | undefined,
      attachment
    );
    await updateDoc(sharedRef, {
      ...merged,
      updatedAt: serverTimestamp(),
    });
  }

  await setDoc(rootRef, { updatedAt: serverTimestamp() }, { merge: true });
}

export async function uploadFilesViaPublicLink(params: {
  projectId: string;
  ownerId: string;
  files: { bytes: Uint8Array; name: string }[];
  onProgress?: (fileIndex: number, progress: number) => void;
}): Promise<AttachmentUploadResult[]> {
  const normalizedOwnerId = params.ownerId.trim();
  if (!normalizedOwnerId) {
    throw new Error("Projektbesitzer konnte nicht ermittelt werden.");
  }

  const uploaded: AttachmentUploadResult[] = [];
  for (let index = 0; index < params.files.length; index++) {
    const file = params.files[index];
    const result = await uploadAttachment({
      fileBytes: file.bytes,
      fileName: file.name,
      projectId: params.projectId,
        onProgress: (progress) => params.onProgress?.(index, progress),
    });
    await syncAttachmentIntoProjectCopies(params.projectId, normalizedOwnerId, result);
    uploaded.push(result);
  }
  return uploaded;
}
