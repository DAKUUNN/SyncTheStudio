import {
  collection,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  deleteField,
  Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import {
  ref as storageRef,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { db, storage } from "@/firebase";
import {
  masterVersionFromDocument,
  masterFeedbackFromDocument,
  parseDate,
  type MasterVersionModel,
  type MasterShareFeedback,
  type ProjectModel,
  type PublicMasterShare,
} from "@/models/types";
import { PublicLinkConfig } from "@/lib/publicLinkConfig";
import {
  encryptBytes,
  generateKeyBase64,
  generateIvBase64,
  hashSharePassword,
  uuid,
} from "@/lib/crypto";

/** Port of master_service.dart + customer_upload_service.dart */

const projectDoc = (projectId: string) => doc(db, "projects", projectId);
const mastersCollection = (projectId: string) =>
  collection(db, "projects", projectId, "masters");
const feedbackCollection = (projectId: string) =>
  collection(db, "projects", projectId, "masterFeedback");
const publicMasterSharesCollection = () => collection(db, "public_master_shares");
const publicUploadsCollection = () => collection(db, "public_uploads");

/**
 * The `projects/{id}` document itself is only readable by the owner/collaborators
 * (it carries the AES contentKey used to encrypt notes/chat/tasks). Public share
 * pages must never read it directly. Instead we mirror only the safe subset of
 * fields into a dedicated `public_master_shares/{token}` / `public_uploads/{token}`
 * document — readable by anyone who has the token, writable only by the project
 * owner — every time share settings change.
 */
async function syncPublicMasterShareDoc(projectId: string): Promise<void> {
  const snapshot = await getDoc(projectDoc(projectId));
  if (!snapshot.exists()) return;
  const data = (snapshot.data() as Record<string, unknown>) ?? {};
  const token = String(data.masterShareToken ?? "").trim();
  if (!token) return;

  await setDoc(doc(publicMasterSharesCollection(), token), {
    projectId,
    ownerId: String(data.ownerId ?? "").trim(),
    projectName: String(data.projectName ?? "Projekt").trim() || "Projekt",
    customerName: (data.customerName as string | undefined) ?? null,
    isActive: Boolean(data.masterShareActive ?? false),
    allowDownload: Boolean(data.masterShareAllowDownload ?? false),
    hasPassword: shareHasPassword(data),
    passwordHash: (data.masterSharePasswordHash as string | undefined) ?? null,
    passwordSalt: (data.masterSharePasswordSalt as string | undefined) ?? null,
    expiresAt: data.masterShareExpiresAt ?? null,
    updatedAt: serverTimestamp(),
  });
}

async function syncPublicUploadDoc(projectId: string): Promise<void> {
  const snapshot = await getDoc(projectDoc(projectId));
  if (!snapshot.exists()) return;
  const data = (snapshot.data() as Record<string, unknown>) ?? {};
  const token = String(data.customerUploadToken ?? "").trim();
  if (!token) return;

  await setDoc(doc(publicUploadsCollection(), token), {
    projectId,
    ownerId: String(data.ownerId ?? "").trim(),
    projectName: String(data.projectName ?? "Projekt").trim() || "Projekt",
    customerName: (data.customerName as string | undefined) ?? null,
    isActive: Boolean(data.customerUploadActive ?? false),
    hasPassword: uploadHasPassword(data),
    passwordHash: (data.customerUploadPasswordHash as string | undefined) ?? null,
    passwordSalt: (data.customerUploadPasswordSalt as string | undefined) ?? null,
    updatedAt: serverTimestamp(),
  });
}

function mimeTypeForExtension(extension: string): string {
  switch (extension) {
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "aiff":
    case "aif":
      return "audio/aiff";
    case "flac":
      return "audio/flac";
    case "m4a":
      return "audio/mp4";
    case "ogg":
      return "audio/ogg";
    default:
      return "audio/mpeg";
  }
}

export function watchMasters(
  projectId: string,
  onChange: (masters: MasterVersionModel[]) => void
): Unsubscribe {
  return onSnapshot(
    query(mastersCollection(projectId), orderBy("createdAt", "desc")),
    (snapshot) => onChange(snapshot.docs.map(masterVersionFromDocument))
  );
}

export function watchMasterFeedback(
  projectId: string,
  onChange: (feedback: MasterShareFeedback[]) => void
): Unsubscribe {
  return onSnapshot(
    query(feedbackCollection(projectId), orderBy("createdAt", "desc")),
    (snapshot) => onChange(snapshot.docs.map(masterFeedbackFromDocument))
  );
}

/**
 * Called from the public (anonymous) master review page — see
 * firestore.rules' isActiveMasterShare() exception on masterFeedback create.
 * Each revision point also becomes its own Task via
 * taskService.createTasksFromRevisionPoints(), called by the caller.
 */
export async function submitMasterFeedback(params: {
  projectId: string;
  authorName: string;
  versionId: string;
  versionName: string;
  points: string[];
}): Promise<string[]> {
  const trimmedPoints = params.points.map((p) => p.trim()).filter(Boolean);
  if (trimmedPoints.length === 0) return [];
  await setDoc(doc(feedbackCollection(params.projectId)), {
    projectId: params.projectId,
    kind: "revision",
    authorName: params.authorName.trim() || "Kunde",
    message: trimmedPoints.map((p) => `• ${p}`).join("\n"),
    versionId: params.versionId,
    versionName: params.versionName,
    timeSeconds: null,
    timeLabel: null,
    taskTitles: trimmedPoints,
    createdTaskCount: trimmedPoints.length,
    createdAt: serverTimestamp(),
  });
  return trimmedPoints;
}

export async function uploadMasterVersion(params: {
  project: ProjectModel;
  userId: string;
  fileBytes: Uint8Array;
  fileName: string;
  versionName: string;
}): Promise<void> {
  const fileKey = generateKeyBase64();
  const encrypted = await encryptBytes(params.fileBytes, fileKey);

  const extension = params.fileName.includes(".")
    ? params.fileName.split(".").pop()!.toLowerCase()
    : "bin";
  const storagePath = `masters/${params.project.id}/${Date.now()}.${
    extension === "bin" ? "enc" : `${extension}.enc`
  }`;

  const ref = storageRef(storage, storagePath);
  const snapshot = await uploadBytes(ref, encrypted.bytes as unknown as ArrayBuffer, {
    contentType: "application/octet-stream",
    cacheControl: "private,max-age=0,no-transform",
  });
  const fileUrl = await getDownloadURL(snapshot.ref);
  const masterId = uuid();

  await setDoc(
    projectDoc(params.project.id),
    {
      ownerId: params.project.ownerId,
      projectName: params.project.name,
      customerName: params.project.customerName,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(doc(mastersCollection(params.project.id), masterId), {
    projectId: params.project.id,
    versionName: params.versionName.trim() || params.fileName,
    originalFileName: params.fileName,
    fileUrl,
    storagePath,
    mimeType: mimeTypeForExtension(extension),
    fileSize: params.fileBytes.length,
    iv: encrypted.iv,
    fileKey,
    encrypted: true,
    createdBy: params.userId,
    createdAt: serverTimestamp(),
  });
}

export async function deleteMasterVersion(
  projectId: string,
  masterId: string
): Promise<void> {
  const snapshot = await getDoc(doc(mastersCollection(projectId), masterId));
  if (!snapshot.exists()) return;
  const storagePath = String(snapshot.data()?.storagePath ?? "").trim();
  if (storagePath) {
    try {
      await deleteObject(storageRef(storage, storagePath));
    } catch {
      // best-effort
    }
  }
  await deleteDoc(snapshot.ref);
}

// ── Public master share links ────────────────────────────────────

function shareHasPassword(data: Record<string, unknown>): boolean {
  const hash = String(data.masterSharePasswordHash ?? "").trim();
  const salt = String(data.masterSharePasswordSalt ?? "").trim();
  return !!hash && !!salt;
}

function shareExpiresAt(data: Record<string, unknown>): Date | null {
  return parseDate(data.masterShareExpiresAt);
}

export async function getCurrentPublicShare(
  projectId: string
): Promise<PublicMasterShare | null> {
  const snapshot = await getDoc(projectDoc(projectId));
  if (!snapshot.exists()) return null;
  const data = (snapshot.data() as Record<string, unknown>) ?? {};
  const token = String(data.masterShareToken ?? "").trim();
  if (!token) return null;

  const isActive =
    "masterShareActive" in data ? Boolean(data.masterShareActive ?? false) : true;
  const allowDownload = Boolean(data.masterShareAllowDownload ?? false);
  const hasPassword = shareHasPassword(data);
  const expiresAt = shareExpiresAt(data);
  const baseUrl = PublicLinkConfig.normalizeMasterShareBaseUrl(
    data.masterShareBaseUrl as string | undefined
  );

  // Self-healing: keeps the public pointer doc in sync even for links that
  // were created before `public_master_shares` existed, or if it ever
  // drifts — no separate migration needed.
  try {
    await syncPublicMasterShareDoc(projectId);
  } catch (e) {
    console.warn("Could not sync public master share pointer:", e);
  }

  return {
    token,
    isActive,
    allowDownload,
    hasPassword,
    expiresAt,
    baseUrl,
    url: PublicLinkConfig.buildMasterShareUrl(token, baseUrl),
  };
}

export async function createOrUpdatePublicShare(params: {
  project: ProjectModel;
  allowDownload: boolean;
  password?: string | null;
  clearPassword?: boolean;
  expiresAt?: Date | null;
  clearExpiresAt?: boolean;
  baseUrl?: string | null;
}): Promise<PublicMasterShare> {
  const existing = await getDoc(projectDoc(params.project.id));
  const existingData = (existing.data() as Record<string, unknown>) ?? {};
  const existingToken = String(existingData.masterShareToken ?? "").trim();
  const token = existingToken || uuid().replaceAll("-", "");
  const resolvedBaseUrl = PublicLinkConfig.normalizeMasterShareBaseUrl(
    params.baseUrl ?? (existingData.masterShareBaseUrl as string | undefined)
  );
  const preservedExpiresAt = params.clearExpiresAt
    ? null
    : params.expiresAt ?? shareExpiresAt(existingData);

  const normalizedPassword = params.password?.trim() ?? "";
  const passwordSalt = normalizedPassword ? generateIvBase64() : null;
  const passwordHash =
    normalizedPassword && passwordSalt
      ? await hashSharePassword(normalizedPassword, passwordSalt)
      : null;

  const updateData: Record<string, unknown> = {
    ownerId: params.project.ownerId,
    projectName: params.project.name,
    customerName: params.project.customerName,
    masterShareToken: token,
    masterShareBaseUrl: resolvedBaseUrl,
    masterShareAllowDownload: params.allowDownload,
    masterShareUpdatedAt: serverTimestamp(),
    masterShareActive: true,
  };

  if (passwordHash && passwordSalt) {
    updateData.masterSharePasswordHash = passwordHash;
    updateData.masterSharePasswordSalt = passwordSalt;
    updateData.masterSharePasswordUpdatedAt = serverTimestamp();
  } else if (params.clearPassword) {
    updateData.masterSharePasswordHash = deleteField();
    updateData.masterSharePasswordSalt = deleteField();
    updateData.masterSharePasswordUpdatedAt = deleteField();
  }

  if (params.expiresAt) {
    updateData.masterShareExpiresAt = Timestamp.fromDate(params.expiresAt);
  } else if (params.clearExpiresAt) {
    updateData.masterShareExpiresAt = deleteField();
  }

  await setDoc(projectDoc(params.project.id), updateData, { merge: true });
  await syncPublicMasterShareDoc(params.project.id);

  return {
    token,
    isActive: true,
    allowDownload: params.allowDownload,
    hasPassword: passwordHash
      ? true
      : !params.clearPassword && shareHasPassword(existingData),
    expiresAt: preservedExpiresAt,
    baseUrl: resolvedBaseUrl,
    url: PublicLinkConfig.buildMasterShareUrl(token, resolvedBaseUrl),
  };
}

export async function setPublicSharePassword(params: {
  project: ProjectModel;
  allowDownload: boolean;
  password: string;
}): Promise<PublicMasterShare> {
  const normalizedPassword = params.password.trim();
  if (normalizedPassword.length < 6) {
    throw new Error("Das Link-Passwort muss mindestens 6 Zeichen haben.");
  }
  return createOrUpdatePublicShare({
    project: params.project,
    allowDownload: params.allowDownload,
    password: normalizedPassword,
  });
}

export async function disablePublicShare(projectId: string): Promise<void> {
  await setDoc(
    projectDoc(projectId),
    { masterShareActive: false, masterShareUpdatedAt: serverTimestamp() },
    { merge: true }
  );
  await syncPublicMasterShareDoc(projectId);
}

// ── Public customer upload links ─────────────────────────────────

import type { PublicCustomerUploadLink } from "@/models/types";

function uploadHasPassword(data: Record<string, unknown>): boolean {
  const hash = String(data.customerUploadPasswordHash ?? "").trim();
  const salt = String(data.customerUploadPasswordSalt ?? "").trim();
  return !!hash && !!salt;
}

export async function getCurrentPublicUploadLink(
  projectId: string
): Promise<PublicCustomerUploadLink | null> {
  const snapshot = await getDoc(projectDoc(projectId));
  if (!snapshot.exists()) return null;
  const data = (snapshot.data() as Record<string, unknown>) ?? {};
  const token = String(data.customerUploadToken ?? "").trim();
  if (!token) return null;

  const isActive =
    "customerUploadActive" in data ? Boolean(data.customerUploadActive ?? false) : true;
  const baseUrl = PublicLinkConfig.normalizeCustomerUploadBaseUrl(
    data.customerUploadBaseUrl as string | undefined
  );

  // Self-healing: keeps the public pointer doc in sync even for links that
  // were created before `public_uploads` existed, or if it ever drifts —
  // no separate migration needed.
  try {
    await syncPublicUploadDoc(projectId);
  } catch (e) {
    console.warn("Could not sync public upload pointer:", e);
  }

  return {
    token,
    isActive,
    hasPassword: uploadHasPassword(data),
    baseUrl,
    url: PublicLinkConfig.buildCustomerUploadUrl(token, baseUrl),
  };
}

export async function createOrUpdatePublicUploadLink(params: {
  project: ProjectModel;
  baseUrl?: string | null;
  password?: string | null;
  clearPassword?: boolean;
}): Promise<PublicCustomerUploadLink> {
  const existing = await getDoc(projectDoc(params.project.id));
  const existingData = (existing.data() as Record<string, unknown>) ?? {};
  const existingToken = String(existingData.customerUploadToken ?? "").trim();
  const token = existingToken || uuid().replaceAll("-", "");
  const resolvedBaseUrl = PublicLinkConfig.normalizeCustomerUploadBaseUrl(
    params.baseUrl ?? (existingData.customerUploadBaseUrl as string | undefined)
  );
  const normalizedPassword = params.password?.trim() ?? "";
  const passwordSalt = normalizedPassword ? `${Date.now()}` : null;
  const passwordHash =
    normalizedPassword && passwordSalt
      ? await hashSharePassword(normalizedPassword, passwordSalt)
      : null;

  const updateData: Record<string, unknown> = {
    ownerId: params.project.ownerId,
    projectName: params.project.name,
    customerName: params.project.customerName,
    customerUploadToken: token,
    customerUploadBaseUrl: resolvedBaseUrl,
    customerUploadActive: true,
    customerUploadUpdatedAt: serverTimestamp(),
  };

  if (passwordHash && passwordSalt) {
    updateData.customerUploadPasswordHash = passwordHash;
    updateData.customerUploadPasswordSalt = passwordSalt;
    updateData.customerUploadPasswordUpdatedAt = serverTimestamp();
  } else if (params.clearPassword) {
    updateData.customerUploadPasswordHash = deleteField();
    updateData.customerUploadPasswordSalt = deleteField();
    updateData.customerUploadPasswordUpdatedAt = deleteField();
  }

  await setDoc(projectDoc(params.project.id), updateData, { merge: true });
  await syncPublicUploadDoc(params.project.id);

  return {
    token,
    isActive: true,
    hasPassword: passwordHash
      ? true
      : !params.clearPassword && uploadHasPassword(existingData),
    baseUrl: resolvedBaseUrl,
    url: PublicLinkConfig.buildCustomerUploadUrl(token, resolvedBaseUrl),
  };
}

export async function setPublicUploadPassword(params: {
  project: ProjectModel;
  password: string;
}): Promise<PublicCustomerUploadLink> {
  const normalizedPassword = params.password.trim();
  if (normalizedPassword.length < 6) {
    throw new Error("Das Upload-Passwort muss mindestens 6 Zeichen haben.");
  }
  return createOrUpdatePublicUploadLink({
    project: params.project,
    password: normalizedPassword,
  });
}

export async function clearPublicUploadPassword(
  project: ProjectModel
): Promise<PublicCustomerUploadLink> {
  return createOrUpdatePublicUploadLink({ project, clearPassword: true });
}

export async function disablePublicUploadLink(projectId: string): Promise<void> {
  await setDoc(
    projectDoc(projectId),
    { customerUploadActive: false, customerUploadUpdatedAt: serverTimestamp() },
    { merge: true }
  );
  await syncPublicUploadDoc(projectId);
}
