import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  type CollectionReference,
  type DocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/firebase";
import { timeEntryFromMap, parseDate, type TimeEntryModel } from "@/models/types";
import { getOrCreateProjectContentKey } from "./keyManagementService";
import { getProjectOwnerId } from "./projectService";
import { decryptText, encryptText } from "@/lib/crypto";

/** Port of time_tracking_service.dart — projects/{projectId}/timeEntries */

const timeEntriesCollection = (projectId: string): CollectionReference =>
  collection(db, "projects", projectId, "timeEntries");

async function decryptTimeEntryDoc(
  snapshot: DocumentSnapshot,
  projectId: string
): Promise<TimeEntryModel> {
  const data = { ...((snapshot.data() as Record<string, unknown>) ?? {}) };
  const encryptedDescription = (data.descriptionEnc as string | undefined) ?? null;
  if (encryptedDescription && encryptedDescription.trim()) {
    const ownerId = await getProjectOwnerId(projectId);
    const projectKey = await getOrCreateProjectContentKey(projectId, ownerId ?? "");
    if (projectKey) {
      data.description = await decryptText(encryptedDescription, projectKey);
    }
  }
  return timeEntryFromMap(snapshot.id, data);
}

export function watchTimeEntries(
  projectId: string,
  onChange: (entries: TimeEntryModel[]) => void
): Unsubscribe {
  return onSnapshot(
    query(timeEntriesCollection(projectId), orderBy("startTime", "desc")),
    (snapshot) => {
      void Promise.all(
        snapshot.docs.map((d) => decryptTimeEntryDoc(d, projectId))
      ).then(onChange);
    }
  );
}

export async function getTimeEntries(projectId: string): Promise<TimeEntryModel[]> {
  const snapshot = await getDocs(
    query(timeEntriesCollection(projectId), orderBy("startTime", "desc"))
  );
  return Promise.all(snapshot.docs.map((d) => decryptTimeEntryDoc(d, projectId)));
}

export async function getTotalTimeForProject(projectId: string): Promise<number> {
  const entries = await getTimeEntries(projectId);
  return entries.reduce((total, entry) => total + entry.durationMinutes, 0);
}

export async function startTimer(params: {
  projectId: string;
  taskId?: string | null;
  userId: string;
  username: string;
  description?: string;
}): Promise<string> {
  const docRef = doc(timeEntriesCollection(params.projectId));
  const ownerId = await getProjectOwnerId(params.projectId);
  const projectKey = await getOrCreateProjectContentKey(params.projectId, ownerId ?? "");
  const description = params.description ?? "";

  const data: Record<string, unknown> = {
    projectId: params.projectId,
    taskId: params.taskId ?? null,
    userId: params.userId,
    username: params.username,
    description,
    durationMinutes: 0,
    startTime: Timestamp.fromDate(new Date()),
    endTime: null,
    createdAt: Timestamp.fromDate(new Date()),
  };
  if (description.trim() && projectKey) {
    data.description = "";
    data.descriptionEnc = await encryptText(description, projectKey);
  }
  await setDoc(docRef, data);
  return docRef.id;
}

export async function stopTimer(projectId: string, entryId: string): Promise<void> {
  const snapshot = await getDoc(doc(timeEntriesCollection(projectId), entryId));
  const data = snapshot.data();
  if (!data) return;
  const startTime = parseDate(data.startTime) ?? new Date();
  const endTime = new Date();
  const durationMinutes = Math.floor((endTime.getTime() - startTime.getTime()) / 60000);
  await updateDoc(doc(timeEntriesCollection(projectId), entryId), {
    endTime: Timestamp.fromDate(endTime),
    durationMinutes,
  });
}

export async function addTimeEntry(params: {
  projectId: string;
  taskId?: string | null;
  userId: string;
  username: string;
  description: string;
  durationMinutes: number;
  startTime: Date;
}): Promise<void> {
  const docRef = doc(timeEntriesCollection(params.projectId));
  const ownerId = await getProjectOwnerId(params.projectId);
  const projectKey = await getOrCreateProjectContentKey(params.projectId, ownerId ?? "");

  const endTime = new Date(
    params.startTime.getTime() + params.durationMinutes * 60000
  );
  const data: Record<string, unknown> = {
    projectId: params.projectId,
    taskId: params.taskId ?? null,
    userId: params.userId,
    username: params.username,
    description: params.description,
    durationMinutes: params.durationMinutes,
    startTime: Timestamp.fromDate(params.startTime),
    endTime: Timestamp.fromDate(endTime),
    createdAt: Timestamp.fromDate(new Date()),
  };
  if (params.description.trim() && projectKey) {
    data.description = "";
    data.descriptionEnc = await encryptText(params.description, projectKey);
  }
  await setDoc(docRef, data);
}

export async function deleteTimeEntry(projectId: string, entryId: string): Promise<void> {
  await deleteDoc(doc(timeEntriesCollection(projectId), entryId));
}

export async function getActiveTimer(
  projectId: string,
  userId: string
): Promise<TimeEntryModel | null> {
  const snapshot = await getDocs(
    query(
      timeEntriesCollection(projectId),
      where("userId", "==", userId),
      where("endTime", "==", null),
      limit(1)
    )
  );
  if (snapshot.empty) return null;
  return decryptTimeEntryDoc(snapshot.docs[0], projectId);
}
