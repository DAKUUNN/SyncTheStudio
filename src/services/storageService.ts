import {
  ref as storageRef,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { storage } from "@/firebase";

/** Port of storage_service.dart */

export function getContentType(extension: string): string {
  switch (extension.toLowerCase()) {
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
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "gif":
      return "image/gif";
    case "webp":
      return "image/webp";
    case "pdf":
      return "application/pdf";
    case "zip":
      return "application/zip";
    case "doc":
      return "application/msword";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "xls":
      return "application/vnd.ms-excel";
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

function sanitizeStorageFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) return "attachment.bin";
  const sanitized = trimmed.replace(/[\\/:*?"<>|]/g, "_");
  return sanitized || "attachment.bin";
}

export async function uploadAvatar(
  imageBytes: Uint8Array,
  userId: string,
  originalFileName?: string
): Promise<string> {
  const extension = originalFileName?.includes(".")
    ? originalFileName.split(".").pop()!.toLowerCase()
    : "jpg";
  const path = `avatars/${userId}/${Date.now()}.${extension}`;
  const ref = storageRef(storage, path);
  const snapshot = await uploadBytes(ref, imageBytes as unknown as ArrayBuffer, {
    contentType: getContentType(extension),
    cacheControl: "public,max-age=3600",
  });
  return getDownloadURL(snapshot.ref);
}

export async function deleteAvatar(avatarUrl?: string | null): Promise<void> {
  if (!avatarUrl) return;
  try {
    await deleteObject(storageRef(storage, avatarUrl));
  } catch {
    // best-effort
  }
}

export interface AttachmentUploadResult {
  url: string;
  fileName: string;
  storagePath: string;
  contentType: string;
  fileSize: number;
}

export async function uploadAttachment(params: {
  fileBytes: Uint8Array;
  fileName: string;
  projectId: string;
  onProgress?: (progress: number) => void;
}): Promise<AttachmentUploadResult> {
  const fileNameOriginal = params.fileName.trim() || "attachment.bin";
  const extension = fileNameOriginal.includes(".")
    ? fileNameOriginal.split(".").pop()!
    : "";
  const safeOriginalName = sanitizeStorageFileName(fileNameOriginal);
  const storagePath = `attachments/${params.projectId}/${Date.now()}__${safeOriginalName}`;
  const contentType = getContentType(extension);

  const ref = storageRef(storage, storagePath);
  const task = uploadBytesResumable(ref, params.fileBytes as unknown as ArrayBuffer, {
    contentType,
    cacheControl: "public,max-age=86400",
  });

  await new Promise<void>((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot) => {
        params.onProgress?.(snapshot.bytesTransferred / snapshot.totalBytes);
      },
      reject,
      () => resolve()
    );
  });

  const url = await getDownloadURL(task.snapshot.ref);
  return {
    url,
    fileName: fileNameOriginal,
    storagePath,
    contentType,
    fileSize: params.fileBytes.length,
  };
}

export async function uploadReferenceSong(params: {
  fileBytes: Uint8Array;
  fileName: string;
  userId: string;
  projectId: string;
}): Promise<{ url: string; fileName: string }> {
  const extension = params.fileName.includes(".")
    ? params.fileName.split(".").pop()!
    : "bin";
  const storagePath = `references/${params.projectId}/${params.userId}_${Date.now()}.${extension}`;
  const ref = storageRef(storage, storagePath);
  const snapshot = await uploadBytes(ref, params.fileBytes as unknown as ArrayBuffer, {
    contentType: getContentType(extension),
    cacheControl: "public,max-age=86400",
  });
  const url = await getDownloadURL(snapshot.ref);
  return { url, fileName: params.fileName };
}

export async function deleteAttachmentByUrl(url: string): Promise<void> {
  if (!url) return;
  try {
    await deleteObject(storageRef(storage, url));
  } catch {
    // best-effort
  }
}
