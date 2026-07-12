import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  writeBatch,
  Timestamp,
  serverTimestamp,
  type CollectionReference,
  type DocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/firebase";
import {
  taskFromMap,
  commentFromDocument,
  type TaskModel,
  type CommentModel,
} from "@/models/types";
import { getOrCreateProjectContentKey } from "./keyManagementService";
import { getProjectOwnerId } from "./projectService";
import { decryptText, encryptText } from "@/lib/crypto";

/** Port of task_service.dart + comment_service.dart
 *  Layout: projects/{projectId}/tasks/{taskId}(/comments/{commentId}) */

const tasksCollection = (projectId: string): CollectionReference =>
  collection(db, "projects", projectId, "tasks");

const commentsCollection = (projectId: string, taskId: string): CollectionReference =>
  collection(db, "projects", projectId, "tasks", taskId, "comments");

async function decryptTaskDoc(
  snapshot: DocumentSnapshot,
  projectId: string
): Promise<TaskModel> {
  const data = { ...((snapshot.data() as Record<string, unknown>) ?? {}) };
  const encryptedDescription = (data.descriptionEnc as string | undefined) ?? null;
  if (encryptedDescription && encryptedDescription.trim()) {
    const ownerId = await getProjectOwnerId(projectId);
    const projectKey = await getOrCreateProjectContentKey(projectId, ownerId ?? "");
    if (projectKey) {
      data.description = await decryptText(encryptedDescription, projectKey);
    }
  }
  data.id = snapshot.id;
  return taskFromMap(data);
}

export async function getTasks(projectId: string): Promise<TaskModel[]> {
  try {
    const snapshot = await getDocs(query(tasksCollection(projectId), orderBy("order")));
    return Promise.all(snapshot.docs.map((d) => decryptTaskDoc(d, projectId)));
  } catch {
    return [];
  }
}

export function watchTasks(
  projectId: string,
  onChange: (tasks: TaskModel[]) => void
): Unsubscribe {
  return onSnapshot(query(tasksCollection(projectId), orderBy("order")), (snapshot) => {
    void Promise.all(snapshot.docs.map((d) => decryptTaskDoc(d, projectId))).then(
      onChange
    );
  });
}

export async function createTask(params: {
  projectId: string;
  title: string;
  description?: string | null;
  dueDate?: Date | null;
  createdBy?: string | null;
}): Promise<void> {
  const existing = await getTasks(params.projectId);
  const ownerId = await getProjectOwnerId(params.projectId);
  const projectKey = await getOrCreateProjectContentKey(params.projectId, ownerId ?? "");

  const data: Record<string, unknown> = {
    projectId: params.projectId,
    title: params.title,
    description: params.description ?? null,
    isCompleted: false,
    createdAt: Timestamp.fromDate(new Date()),
    completedAt: null,
    dueDate: params.dueDate ? Timestamp.fromDate(params.dueDate) : null,
    createdBy: params.createdBy ?? null,
    subtasks: {},
    order: existing.length,
  };

  if (params.description && params.description.trim() && projectKey) {
    data.description = null;
    data.descriptionEnc = await encryptText(params.description, projectKey);
  }

  await addDoc(tasksCollection(params.projectId), data);
}

export async function toggleTask(
  projectId: string,
  taskId: string,
  isCompleted: boolean
): Promise<void> {
  await updateDoc(doc(tasksCollection(projectId), taskId), {
    isCompleted,
    completedAt: isCompleted ? serverTimestamp() : null,
  });
}

export async function deleteTask(projectId: string, taskId: string): Promise<void> {
  await deleteDoc(doc(tasksCollection(projectId), taskId));
}

export async function addSubtask(
  projectId: string,
  taskId: string,
  title: string
): Promise<void> {
  const docRef = doc(tasksCollection(projectId), taskId);
  const snapshot = await getDoc(docRef);
  const data = snapshot.data();
  if (!data) return;
  const subtasks = { ...((data.subtasks as Record<string, unknown>) ?? {}) };
  const subtaskId = `${Date.now()}`;
  subtasks[subtaskId] = {
    title,
    isCompleted: false,
    createdAt: Timestamp.fromDate(new Date()),
  };
  await updateDoc(docRef, { subtasks });
}

export async function toggleSubtask(
  projectId: string,
  taskId: string,
  subtaskId: string
): Promise<void> {
  const docRef = doc(tasksCollection(projectId), taskId);
  const snapshot = await getDoc(docRef);
  const data = snapshot.data();
  if (!data) return;
  const subtasks = { ...((data.subtasks as Record<string, Record<string, unknown>>) ?? {}) };
  const subtask = subtasks[subtaskId];
  if (!subtask) return;
  subtasks[subtaskId] = { ...subtask, isCompleted: !(subtask.isCompleted ?? false) };
  await updateDoc(docRef, { subtasks });
}

export async function deleteSubtask(
  projectId: string,
  taskId: string,
  subtaskId: string
): Promise<void> {
  const docRef = doc(tasksCollection(projectId), taskId);
  const snapshot = await getDoc(docRef);
  const data = snapshot.data();
  if (!data) return;
  const subtasks = { ...((data.subtasks as Record<string, unknown>) ?? {}) };
  delete subtasks[subtaskId];
  await updateDoc(docRef, { subtasks });
}

export async function reorderTasks(projectId: string, tasks: TaskModel[]): Promise<void> {
  const batch = writeBatch(db);
  tasks.forEach((task, index) => {
    batch.update(doc(tasksCollection(projectId), task.id), { order: index });
  });
  await batch.commit();
}

export async function setTaskDueDate(
  projectId: string,
  taskId: string,
  dueDate: Date | null
): Promise<void> {
  await updateDoc(doc(tasksCollection(projectId), taskId), {
    dueDate: dueDate ? Timestamp.fromDate(dueDate) : null,
  });
}

// ── Comments ─────────────────────────────────────────────────────

export function watchComments(
  projectId: string,
  taskId: string,
  onChange: (comments: CommentModel[]) => void
): Unsubscribe {
  return onSnapshot(
    query(commentsCollection(projectId, taskId), orderBy("createdAt", "desc")),
    (snapshot) => {
      onChange(snapshot.docs.map(commentFromDocument));
    }
  );
}

export async function addComment(params: {
  projectId: string;
  taskId: string;
  userId: string;
  username: string;
  userAvatarUrl?: string | null;
  content: string;
}): Promise<void> {
  await addDoc(commentsCollection(params.projectId, params.taskId), {
    taskId: params.taskId,
    projectId: params.projectId,
    userId: params.userId,
    username: params.username,
    userAvatarUrl: params.userAvatarUrl ?? null,
    content: params.content,
    createdAt: serverTimestamp(),
  });
}

export async function deleteComment(
  projectId: string,
  taskId: string,
  commentId: string
): Promise<void> {
  await deleteDoc(doc(commentsCollection(projectId, taskId), commentId));
}

/**
 * Called from the public (anonymous) master review page when a customer
 * submits revision points — see firestore.rules' isActiveMasterShare()
 * exception on tasks create. Skips getTasks()/content-key reads (both
 * gated to project members) that createTask() needs; order uses a
 * timestamp so these always sort after manually-created tasks.
 */
export async function createTasksFromRevisionPoints(
  projectId: string,
  points: string[],
  createdBy: string
): Promise<void> {
  const base = Date.now();
  let index = 0;
  for (const point of points) {
    const trimmed = point.trim();
    if (!trimmed) continue;
    await setDoc(doc(tasksCollection(projectId)), {
      projectId,
      title: trimmed,
      description: null,
      isCompleted: false,
      createdAt: Timestamp.fromDate(new Date()),
      completedAt: null,
      dueDate: null,
      createdBy,
      subtasks: {},
      order: base + index,
    });
    index++;
  }
}

// ── Bulk import from templates (used by create screen) ──────────

export async function createTasksFromTitles(
  projectId: string,
  titles: string[],
  createdBy: string | null
): Promise<void> {
  let order = (await getTasks(projectId)).length;
  for (const title of titles) {
    const trimmed = title.trim();
    if (!trimmed) continue;
    await setDoc(doc(tasksCollection(projectId)), {
      projectId,
      title: trimmed,
      description: null,
      isCompleted: false,
      createdAt: Timestamp.fromDate(new Date()),
      completedAt: null,
      dueDate: null,
      createdBy,
      subtasks: {},
      order: order++,
    });
  }
}
