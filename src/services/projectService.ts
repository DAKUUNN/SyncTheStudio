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
  where,
  onSnapshot,
  Timestamp,
  serverTimestamp,
  type CollectionReference,
  type Unsubscribe,
} from "firebase/firestore";
import { ref as storageRef, deleteObject, listAll } from "firebase/storage";
import { auth, db, storage } from "@/firebase";
import {
  projectFromDocument,
  historyEntryFromMap,
  parseStringMap,
  parseStringList,
  type ProjectModel,
  type ProjectHistoryEntry,
  type ProjectPriority,
} from "@/models/types";
import { generateKeyBase64 } from "@/lib/crypto";

/** Port of project_service.dart — identical Firestore layout:
 *  users/{uid}/projects/{id}, shared_projects/{id}, projects/{id} (root metadata) */

export const ROLE_OWNER = "owner";
export const ROLE_MEMBER = "member";

const projectsCollection = (userId: string): CollectionReference =>
  collection(db, "users", userId, "projects");
const sharedProjectsCollection = (): CollectionReference =>
  collection(db, "shared_projects");

function sortByUpdatedDesc(projects: ProjectModel[]): ProjectModel[] {
  return [...projects].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}

export async function getProjects(userId: string): Promise<ProjectModel[]> {
  try {
    const snapshot = await getDocs(projectsCollection(userId));
    return sortByUpdatedDesc(snapshot.docs.map(projectFromDocument));
  } catch {
    return [];
  }
}

export function watchProjects(
  userId: string,
  onChange: (projects: ProjectModel[]) => void
): Unsubscribe {
  return onSnapshot(projectsCollection(userId), (snapshot) => {
    onChange(sortByUpdatedDesc(snapshot.docs.map(projectFromDocument)));
  });
}

export async function getSharedProjects(userId: string): Promise<ProjectModel[]> {
  try {
    const snapshot = await getDocs(
      query(sharedProjectsCollection(), where("sharedWith", "array-contains", userId))
    );
    return sortByUpdatedDesc(snapshot.docs.map(projectFromDocument));
  } catch {
    return [];
  }
}

export function watchSharedProjects(
  userId: string,
  onChange: (projects: ProjectModel[]) => void
): Unsubscribe {
  return onSnapshot(
    query(sharedProjectsCollection(), where("sharedWith", "array-contains", userId)),
    (snapshot) => {
      onChange(sortByUpdatedDesc(snapshot.docs.map(projectFromDocument)));
    }
  );
}

export async function getOwnActiveProjectCount(userId: string): Promise<number> {
  try {
    const snapshot = await getDocs(projectsCollection(userId));
    return snapshot.docs.length;
  } catch {
    return 0;
  }
}

export async function getSharedActiveProjectCount(userId: string): Promise<number> {
  try {
    const snapshot = await getDocs(
      query(sharedProjectsCollection(), where("sharedWith", "array-contains", userId))
    );
    return snapshot.docs.filter((d) => {
      const ownerId = String(d.data().ownerId ?? "").trim();
      return ownerId !== userId;
    }).length;
  } catch {
    return 0;
  }
}

export async function getProject(
  userId: string,
  projectId: string
): Promise<ProjectModel | null> {
  try {
    const snapshot = await getDoc(doc(projectsCollection(userId), projectId));
    return snapshot.exists() ? projectFromDocument(snapshot) : null;
  } catch {
    return null;
  }
}

export async function getSharedProject(projectId: string): Promise<ProjectModel | null> {
  try {
    const snapshot = await getDoc(doc(sharedProjectsCollection(), projectId));
    return snapshot.exists() ? projectFromDocument(snapshot) : null;
  } catch {
    return null;
  }
}

export async function getProjectOwnerId(projectId: string): Promise<string | null> {
  try {
    const sharedDoc = await getDoc(doc(sharedProjectsCollection(), projectId));
    if (sharedDoc.exists()) {
      const ownerId = String(sharedDoc.data()?.ownerId ?? "").trim();
      if (ownerId) return ownerId;
    }
    const currentUserId = auth.currentUser?.uid;
    if (!currentUserId) return null;
    const ownDoc = await getDoc(doc(projectsCollection(currentUserId), projectId));
    if (ownDoc.exists()) {
      const ownerId = String(ownDoc.data()?.ownerId ?? "").trim();
      return ownerId || currentUserId;
    }
  } catch {
    // fall through
  }
  return null;
}

export interface CreateProjectParams {
  userId: string;
  name: string;
  customerId?: string | null;
  customerName?: string | null;
  projectType: string;
  priority: ProjectPriority;
  statusId?: string | null;
  deadline?: Date | null;
  notifyBeforeMinutes?: number;
  workspaceLink?: string | null;
  referenceLink?: string | null;
  referenceFileUrl?: string | null;
  referenceFileName?: string | null;
  bpm?: number | null;
  musicalKey?: string | null;
  dawProjectPath?: string | null;
  category?: string | null;
  customField1?: string | null;
  customField2?: string | null;
  customField3?: string | null;
  customField4?: string | null;
  customField5?: string | null;
}

export async function createProject(params: CreateProjectParams): Promise<string> {
  const now = new Date();
  const resolvedStatusId = (params.statusId ?? "neu").trim().toLowerCase();
  const contentKey = generateKeyBase64();

  const docRef = await addDoc(projectsCollection(params.userId), {
    name: params.name,
    customerId: params.customerId ?? null,
    customerName: params.customerName ?? null,
    projectType: params.projectType,
    priority: params.priority,
    status: resolvedStatusId,
    deadline: params.deadline ? Timestamp.fromDate(params.deadline) : null,
    notifyBeforeMinutes: params.notifyBeforeMinutes ?? 60,
    workspaceLink: params.workspaceLink ?? null,
    attachments: [],
    attachmentNames: {},
    sharedWith: [],
    memberRoles: { [params.userId]: ROLE_OWNER },
    referenceLink: params.referenceLink ?? null,
    referenceFileUrl: params.referenceFileUrl ?? null,
    referenceFileName: params.referenceFileName ?? null,
    bpm: params.bpm ?? null,
    musicalKey: params.musicalKey ?? null,
    dawProjectPath: params.dawProjectPath ?? null,
    category: params.category ?? null,
    contentKey,
    encryptionVersion: 1,
    customField1: params.customField1 ?? null,
    customField2: params.customField2 ?? null,
    customField3: params.customField3 ?? null,
    customField4: params.customField4 ?? null,
    customField5: params.customField5 ?? null,
    ownerId: params.userId,
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  });

  await setDoc(
    doc(db, "projects", docRef.id),
    {
      ownerId: params.userId,
      projectName: params.name,
      customerName: params.customerName ?? null,
      contentKey,
      encryptionVersion: 1,
      createdAt: Timestamp.fromDate(now),
      updatedAt: Timestamp.fromDate(now),
    },
    { merge: true }
  );

  return docRef.id;
}

export interface UpdateProjectParams {
  userId: string;
  projectId: string;
  name?: string;
  customerId?: string;
  customerName?: string;
  projectType?: string;
  priority?: ProjectPriority;
  statusId?: string;
  deadline?: Date;
  notifyBeforeMinutes?: number;
  workspaceLink?: string;
  attachments?: string[];
  referenceLink?: string;
  referenceFileUrl?: string;
  referenceFileName?: string;
  bpm?: number | null;
  musicalKey?: string;
  dawProjectPath?: string;
  category?: string;
  customField1?: string;
  customField2?: string;
  customField3?: string;
  customField4?: string;
  customField5?: string;
}

export async function updateProject(params: UpdateProjectParams): Promise<void> {
  const now = new Date();
  const sharedDocRef = doc(sharedProjectsCollection(), params.projectId);
  const sharedDoc = await getDoc(sharedDocRef);

  let currentData: Record<string, unknown> | null = null;
  let ownerId: string | null = null;

  if (sharedDoc.exists()) {
    currentData = sharedDoc.data() as Record<string, unknown>;
    ownerId = (currentData.ownerId as string | undefined) ?? null;
  } else {
    const ownDoc = await getDoc(doc(projectsCollection(params.userId), params.projectId));
    if (ownDoc.exists()) {
      currentData = ownDoc.data() as Record<string, unknown>;
      ownerId = (currentData.ownerId as string | undefined) ?? null;
    }
  }

  const previousStatusValue = (currentData?.status as string | undefined) ?? null;

  const updates: Record<string, unknown> = { updatedAt: Timestamp.fromDate(now) };
  if (params.name !== undefined) updates.name = params.name;
  if (params.customerId !== undefined) updates.customerId = params.customerId;
  if (params.customerName !== undefined) updates.customerName = params.customerName;
  if (params.projectType !== undefined) updates.projectType = params.projectType;
  if (params.priority !== undefined) updates.priority = params.priority;

  const resolvedStatusId = params.statusId?.trim().toLowerCase();
  if (resolvedStatusId) {
    updates.status = resolvedStatusId;
    updates.completedAt =
      resolvedStatusId === "abgeschlossen" ? Timestamp.fromDate(now) : null;
  }
  if (params.deadline !== undefined) {
    updates.deadline = Timestamp.fromDate(params.deadline);
  }
  if (params.notifyBeforeMinutes !== undefined) {
    updates.notifyBeforeMinutes = params.notifyBeforeMinutes;
  }
  if (params.workspaceLink !== undefined) updates.workspaceLink = params.workspaceLink;
  if (params.attachments !== undefined) {
    updates.attachments = params.attachments;
    const currentNames = parseStringMap(currentData?.attachmentNames);
    for (const url of Object.keys(currentNames)) {
      if (!params.attachments.includes(url)) delete currentNames[url];
    }
    updates.attachmentNames = currentNames;
  }
  if (params.referenceLink !== undefined) updates.referenceLink = params.referenceLink;
  if (params.referenceFileUrl !== undefined) {
    updates.referenceFileUrl = params.referenceFileUrl;
  }
  if (params.referenceFileName !== undefined) {
    updates.referenceFileName = params.referenceFileName;
  }
  if (params.bpm !== undefined) updates.bpm = params.bpm;
  if (params.musicalKey !== undefined) updates.musicalKey = params.musicalKey;
  if (params.dawProjectPath !== undefined) updates.dawProjectPath = params.dawProjectPath;
  if (params.category !== undefined) updates.category = params.category;
  if (params.customField1 !== undefined) updates.customField1 = params.customField1;
  if (params.customField2 !== undefined) updates.customField2 = params.customField2;
  if (params.customField3 !== undefined) updates.customField3 = params.customField3;
  if (params.customField4 !== undefined) updates.customField4 = params.customField4;
  if (params.customField5 !== undefined) updates.customField5 = params.customField5;

  if (sharedDoc.exists()) {
    await updateDoc(sharedDocRef, updates);
    if (ownerId) {
      try {
        await updateDoc(doc(projectsCollection(ownerId), params.projectId), updates);
      } catch {
        // owner copy may not exist
      }
    }
  } else {
    await updateDoc(doc(projectsCollection(params.userId), params.projectId), updates);
  }

  const rootUpdates: Record<string, unknown> = { updatedAt: Timestamp.fromDate(now) };
  if (params.name !== undefined) rootUpdates.projectName = params.name;
  if (params.customerName !== undefined) rootUpdates.customerName = params.customerName;
  await setDoc(doc(db, "projects", params.projectId), rootUpdates, { merge: true });

  const nextStatusValue = updates.status as string | undefined;
  const shouldClearCompletedAt =
    nextStatusValue !== undefined &&
    nextStatusValue !== "abgeschlossen" &&
    previousStatusValue === "abgeschlossen";
  if (shouldClearCompletedAt) {
    if (sharedDoc.exists()) {
      await updateDoc(sharedDocRef, { completedAt: null });
      if (ownerId) {
        try {
          await updateDoc(doc(projectsCollection(ownerId), params.projectId), {
            completedAt: null,
          });
        } catch {
          // ignore
        }
      }
    } else {
      await updateDoc(doc(projectsCollection(params.userId), params.projectId), {
        completedAt: null,
      });
    }
  }
}

export async function updateProjectStatus(
  userId: string,
  projectId: string,
  statusId: string
): Promise<void> {
  await updateProject({ userId, projectId, statusId });
}

export async function replaceProjectStatusForUser(params: {
  userId: string;
  fromStatusId: string;
  toStatusId: string;
}): Promise<void> {
  const fromId = params.fromStatusId.trim().toLowerCase();
  const toId = params.toStatusId.trim().toLowerCase();
  if (!fromId || !toId || fromId === toId) return;

  const now = Timestamp.fromDate(new Date());
  const completedAt = toId === "abgeschlossen" ? now : null;

  const ownSnapshot = await getDocs(
    query(projectsCollection(params.userId), where("status", "==", fromId))
  );
  for (const d of ownSnapshot.docs) {
    await updateDoc(d.ref, { status: toId, completedAt, updatedAt: now });
  }

  const sharedSnapshot = await getDocs(
    query(
      sharedProjectsCollection(),
      where("ownerId", "==", params.userId),
      where("status", "==", fromId)
    )
  );
  for (const d of sharedSnapshot.docs) {
    await updateDoc(d.ref, { status: toId, completedAt, updatedAt: now });
  }
}

export async function toggleFavorite(
  userId: string,
  projectId: string,
  isFavorite: boolean
): Promise<void> {
  await updateDoc(doc(projectsCollection(userId), projectId), {
    isFavorite,
    updatedAt: serverTimestamp(),
  });
}

// ── Attachments ─────────────────────────────────────────────────

export async function addAttachment(
  userId: string,
  projectId: string,
  attachmentUrl: string,
  fileName?: string | null
): Promise<void> {
  const normalizedFileName = fileName?.trim();
  const sharedDocRef = doc(sharedProjectsCollection(), projectId);
  const sharedDoc = await getDoc(sharedDocRef);

  if (sharedDoc.exists()) {
    const data = sharedDoc.data() as Record<string, unknown>;
    const attachments = parseStringList(data.attachments);
    const attachmentNames = parseStringMap(data.attachmentNames);
    if (!attachments.includes(attachmentUrl)) attachments.push(attachmentUrl);
    if (normalizedFileName) attachmentNames[attachmentUrl] = normalizedFileName;

    await updateDoc(sharedDocRef, {
      attachments,
      attachmentNames,
      updatedAt: Timestamp.fromDate(new Date()),
    });

    const ownerId = String(data.ownerId ?? "").trim();
    if (ownerId) {
      try {
        await updateDoc(doc(projectsCollection(ownerId), projectId), {
          attachments,
          attachmentNames,
          updatedAt: Timestamp.fromDate(new Date()),
        });
      } catch {
        // ignore
      }
    }
  } else {
    const ownDocRef = doc(projectsCollection(userId), projectId);
    const ownDoc = await getDoc(ownDocRef);
    if (!ownDoc.exists()) return;
    const data = ownDoc.data() as Record<string, unknown>;
    const attachments = parseStringList(data.attachments);
    const attachmentNames = parseStringMap(data.attachmentNames);
    if (!attachments.includes(attachmentUrl)) attachments.push(attachmentUrl);
    if (normalizedFileName) attachmentNames[attachmentUrl] = normalizedFileName;
    await updateDoc(ownDocRef, {
      attachments,
      attachmentNames,
      updatedAt: Timestamp.fromDate(new Date()),
    });
  }
}

export async function removeAttachment(
  userId: string,
  projectId: string,
  attachmentUrl: string
): Promise<void> {
  const sharedDocRef = doc(sharedProjectsCollection(), projectId);
  const sharedDoc = await getDoc(sharedDocRef);

  if (sharedDoc.exists()) {
    const data = sharedDoc.data() as Record<string, unknown>;
    const attachments = parseStringList(data.attachments).filter(
      (u) => u !== attachmentUrl
    );
    const attachmentNames = parseStringMap(data.attachmentNames);
    delete attachmentNames[attachmentUrl];

    await updateDoc(sharedDocRef, {
      attachments,
      attachmentNames,
      updatedAt: Timestamp.fromDate(new Date()),
    });

    const ownerId = String(data.ownerId ?? "").trim();
    if (ownerId) {
      try {
        await updateDoc(doc(projectsCollection(ownerId), projectId), {
          attachments,
          attachmentNames,
          updatedAt: Timestamp.fromDate(new Date()),
        });
      } catch {
        // ignore
      }
    }
  } else {
    const ownDocRef = doc(projectsCollection(userId), projectId);
    const ownDoc = await getDoc(ownDocRef);
    if (!ownDoc.exists()) return;
    const data = ownDoc.data() as Record<string, unknown>;
    const attachments = parseStringList(data.attachments).filter(
      (u) => u !== attachmentUrl
    );
    const attachmentNames = parseStringMap(data.attachmentNames);
    delete attachmentNames[attachmentUrl];
    await updateDoc(ownDocRef, {
      attachments,
      attachmentNames,
      updatedAt: Timestamp.fromDate(new Date()),
    });
  }
}

// ── Sharing ─────────────────────────────────────────────────────

export async function addToSharedProjects(
  projectId: string,
  ownerId: string,
  ownerName: string,
  invitedUserId: string
): Promise<void> {
  const projectDoc = await getDoc(doc(projectsCollection(ownerId), projectId));
  if (!projectDoc.exists()) return;
  const projectData = projectDoc.data() as Record<string, unknown>;

  const sharedWith = new Set<string>(parseStringList(projectData.sharedWith));
  sharedWith.add(invitedUserId);
  sharedWith.add(ownerId);
  const memberRoles = parseStringMap(projectData.memberRoles);
  memberRoles[ownerId] = ROLE_OWNER;

  await setDoc(
    doc(sharedProjectsCollection(), projectId),
    {
      ...projectData,
      sharedWith: [...sharedWith],
      memberRoles,
      isShared: true,
      ownerId,
      ownerName,
      sharedAt: Timestamp.fromDate(new Date()),
    },
    { merge: true }
  );

  await updateDoc(doc(projectsCollection(ownerId), projectId), {
    sharedWith: [...sharedWith],
    memberRoles,
  });
}

export async function leaveSharedProject(
  projectId: string,
  userId: string
): Promise<void> {
  const sharedDocRef = doc(sharedProjectsCollection(), projectId);
  const projectDoc = await getDoc(sharedDocRef);
  if (!projectDoc.exists()) return;
  const data = projectDoc.data() as Record<string, unknown>;
  const ownerId = String(data.ownerId ?? "").trim();
  if (ownerId && ownerId === userId) {
    throw new Error("Der Besitzer kann ein geteiltes Projekt nicht verlassen.");
  }

  const sharedWith = parseStringList(data.sharedWith).filter((id) => id !== userId);
  const memberRoles = parseStringMap(data.memberRoles);
  delete memberRoles[userId];
  const updates = {
    sharedWith,
    memberRoles,
    updatedAt: Timestamp.fromDate(new Date()),
  };

  await updateDoc(sharedDocRef, updates);

  if (ownerId) {
    try {
      await updateDoc(doc(projectsCollection(ownerId), projectId), updates);
    } catch {
      // ignore stale owner copy
    }
  }

  try {
    await deleteDoc(doc(projectsCollection(userId), projectId));
  } catch {
    // member copy may already be gone
  }
}

export async function updateProjectMemberRole(params: {
  projectId: string;
  ownerId: string;
  memberId: string;
  role: string;
}): Promise<void> {
  const normalizedRole = params.role.trim();
  if (params.memberId !== params.ownerId && !normalizedRole) {
    throw new Error("Projektrolle darf nicht leer sein");
  }
  if (normalizedRole.length > 48) {
    throw new Error("Projektrolle darf maximal 48 Zeichen haben");
  }

  const ownRef = doc(projectsCollection(params.ownerId), params.projectId);
  const ownDoc = await getDoc(ownRef);
  if (!ownDoc.exists()) throw new Error("Projekt nicht gefunden");

  const memberRoles = parseStringMap(ownDoc.data()?.memberRoles);
  memberRoles[params.ownerId] = ROLE_OWNER;
  memberRoles[params.memberId] =
    params.memberId === params.ownerId ? ROLE_OWNER : normalizedRole;

  await updateDoc(ownRef, {
    memberRoles,
    updatedAt: Timestamp.fromDate(new Date()),
  });

  const sharedRef = doc(sharedProjectsCollection(), params.projectId);
  const sharedDoc = await getDoc(sharedRef);
  if (sharedDoc.exists()) {
    await updateDoc(sharedRef, {
      memberRoles,
      updatedAt: Timestamp.fromDate(new Date()),
    });
  }
}

export async function updateProjectMemberPermission(params: {
  projectId: string;
  ownerId: string;
  memberId: string;
  permission: "viewer" | "editor";
}): Promise<void> {
  if (params.memberId === params.ownerId) return; // owner always has full access

  const ownRef = doc(projectsCollection(params.ownerId), params.projectId);
  const ownDoc = await getDoc(ownRef);
  if (!ownDoc.exists()) throw new Error("Projekt nicht gefunden");

  const memberPermissions = parseStringMap(ownDoc.data()?.memberPermissions);
  memberPermissions[params.memberId] = params.permission;

  await updateDoc(ownRef, {
    memberPermissions,
    updatedAt: Timestamp.fromDate(new Date()),
  });

  const sharedRef = doc(sharedProjectsCollection(), params.projectId);
  const sharedDoc = await getDoc(sharedRef);
  if (sharedDoc.exists()) {
    await updateDoc(sharedRef, {
      memberPermissions,
      updatedAt: Timestamp.fromDate(new Date()),
    });
  }
}

// ── Role presets (users/{uid}/private/projectRoles) ─────────────

export async function getProjectRolePresets(userId: string): Promise<string[]> {
  try {
    const snapshot = await getDoc(doc(db, "users", userId, "private", "projectRoles"));
    const raw = snapshot.data()?.presets;
    if (!Array.isArray(raw)) return [];
    const presets = raw
      .map((item) => String(item ?? "").trim())
      .filter((item) => item.length > 0);
    presets.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
    return presets;
  } catch {
    return [];
  }
}

export async function saveProjectRolePreset(userId: string, role: string): Promise<void> {
  const normalizedRole = role.trim();
  if (!normalizedRole || normalizedRole === ROLE_OWNER) return;
  const existing = await getProjectRolePresets(userId);
  const next = [...existing];
  if (!next.some((item) => item.toLowerCase() === normalizedRole.toLowerCase())) {
    next.push(normalizedRole);
  }
  next.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  await setDoc(
    doc(db, "users", userId, "private", "projectRoles"),
    { presets: next.slice(0, 24), updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function deleteProjectRolePreset(
  userId: string,
  role: string
): Promise<void> {
  const normalizedRole = role.trim();
  if (!normalizedRole) return;
  const existing = await getProjectRolePresets(userId);
  const next = existing.filter(
    (item) => item.toLowerCase() !== normalizedRole.toLowerCase()
  );
  await setDoc(
    doc(db, "users", userId, "private", "projectRoles"),
    { presets: next, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

// ── History ─────────────────────────────────────────────────────

export async function addHistoryEntry(
  projectId: string,
  userId: string,
  userName: string,
  action: string,
  options?: { fieldName?: string; oldValue?: string; newValue?: string }
): Promise<void> {
  try {
    const historyEntry = {
      id: `${Date.now()}`,
      userId,
      userName,
      action,
      fieldName: options?.fieldName ?? null,
      oldValue: options?.oldValue ?? null,
      newValue: options?.newValue ?? null,
      timestamp: Timestamp.fromDate(new Date()),
    };

    const sharedRef = doc(sharedProjectsCollection(), projectId);
    const sharedDoc = await getDoc(sharedRef);
    if (sharedDoc.exists()) {
      const sharedData = sharedDoc.data() as Record<string, unknown>;
      const sharedHistory = Array.isArray(sharedData.history)
        ? [...(sharedData.history as Record<string, unknown>[])]
        : [];
      sharedHistory.unshift(historyEntry);
      await updateDoc(sharedRef, {
        history: sharedHistory,
        updatedAt: Timestamp.fromDate(new Date()),
      });

      const ownerId = String(sharedData.ownerId ?? "").trim();
      if (ownerId) {
        try {
          const ownerRef = doc(projectsCollection(ownerId), projectId);
          const ownerDoc = await getDoc(ownerRef);
          if (ownerDoc.exists()) {
            const ownerData = ownerDoc.data() as Record<string, unknown>;
            const ownerHistory = Array.isArray(ownerData.history)
              ? [...(ownerData.history as Record<string, unknown>[])]
              : [];
            ownerHistory.unshift(historyEntry);
            await updateDoc(ownerRef, {
              history: ownerHistory,
              updatedAt: Timestamp.fromDate(new Date()),
            });
          }
        } catch {
          // ignore owner sync errors
        }
      }
      return;
    }

    const ownRef = doc(projectsCollection(userId), projectId);
    const ownDoc = await getDoc(ownRef);
    if (ownDoc.exists()) {
      const ownData = ownDoc.data() as Record<string, unknown>;
      const ownHistory = Array.isArray(ownData.history)
        ? [...(ownData.history as Record<string, unknown>[])]
        : [];
      ownHistory.unshift(historyEntry);
      await updateDoc(ownRef, {
        history: ownHistory,
        updatedAt: Timestamp.fromDate(new Date()),
      });
    }
  } catch {
    // history is best-effort
  }
}

export async function getProjectHistory(
  projectId: string,
  userId?: string
): Promise<ProjectHistoryEntry[]> {
  try {
    const sharedDoc = await getDoc(doc(sharedProjectsCollection(), projectId));
    if (sharedDoc.exists()) {
      const history = sharedDoc.data()?.history;
      if (Array.isArray(history)) {
        return history.map((e) => historyEntryFromMap(e as Record<string, unknown>));
      }
      return [];
    }
    if (userId?.trim()) {
      const ownDoc = await getDoc(doc(projectsCollection(userId), projectId));
      if (ownDoc.exists()) {
        const history = ownDoc.data()?.history;
        if (Array.isArray(history)) {
          return history.map((e) => historyEntryFromMap(e as Record<string, unknown>));
        }
      }
    }
    return [];
  } catch {
    return [];
  }
}

export interface ActivityFeedEntry extends ProjectHistoryEntry {
  projectId: string;
  projectName: string;
}

/** Cross-project activity feed — reuses getProjectHistory() per project
 * (own + shared) rather than a new query shape, then merges + sorts. */
export async function getRecentActivityAcrossProjects(
  userId: string,
  maxItems = 100
): Promise<ActivityFeedEntry[]> {
  const [ownProjects, sharedProjects] = await Promise.all([
    getProjects(userId),
    getSharedProjects(userId),
  ]);
  const byId = new Map<string, ProjectModel>();
  for (const project of [...ownProjects, ...sharedProjects]) byId.set(project.id, project);
  const projects = [...byId.values()];

  const perProject = await Promise.all(
    projects.map(async (project) => {
      const history = await getProjectHistory(project.id, userId);
      return history.map((entry) => ({
        ...entry,
        projectId: project.id,
        projectName: project.name,
      }));
    })
  );

  return perProject
    .flat()
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, maxItems);
}

// ── Deletion (incl. storage cleanup) ────────────────────────────

function collectStorageUrls(data: Record<string, unknown>, urls: Set<string>): void {
  for (const url of parseStringList(data.attachments)) {
    if (url.trim()) urls.add(url);
  }
  const referenceFileUrl = data.referenceFileUrl;
  if (typeof referenceFileUrl === "string" && referenceFileUrl.trim()) {
    urls.add(referenceFileUrl);
  }
}

async function deleteStorageByUrl(url: string): Promise<void> {
  if (!url.trim()) return;
  try {
    await deleteObject(storageRef(storage, url));
  } catch {
    // best-effort
  }
}

async function deleteStorageFolderRecursive(path: string): Promise<void> {
  try {
    const listed = await listAll(storageRef(storage, path));
    for (const item of listed.items) {
      try {
        await deleteObject(item);
      } catch {
        // ignore
      }
    }
    for (const prefix of listed.prefixes) {
      await deleteStorageFolderRecursive(prefix.fullPath);
    }
  } catch {
    // ignore
  }
}

async function deleteReferenceFilesByProjectId(projectId: string): Promise<void> {
  await deleteStorageFolderRecursive(`references/${projectId}`);
}

async function deleteDocsInCollection(path: string[]): Promise<void> {
  try {
    const snapshot = await getDocs(collection(db, path.join("/")));
    for (const item of snapshot.docs) {
      await deleteDoc(item.ref);
    }
  } catch {
    // ignore
  }
}

async function deleteProjectFirestoreData(projectId: string): Promise<void> {
  try {
    const tasksSnapshot = await getDocs(collection(db, "projects", projectId, "tasks"));
    for (const taskDoc of tasksSnapshot.docs) {
      await deleteDocsInCollection([
        "projects",
        projectId,
        "tasks",
        taskDoc.id,
        "comments",
      ]);
      await deleteDoc(taskDoc.ref);
    }
  } catch {
    // ignore
  }

  await Promise.all([
    deleteDocsInCollection(["projects", projectId, "timeEntries"]),
    deleteDocsInCollection(["projects", projectId, "masters"]),
    deleteDocsInCollection(["projects", projectId, "masterFeedback"]),
    deleteDocsInCollection(["chats", projectId, "messages"]),
  ]);

  try {
    const invitationsSnapshot = await getDocs(
      query(collection(db, "project_invitations"), where("projectId", "==", projectId))
    );
    for (const invitationDoc of invitationsSnapshot.docs) {
      await deleteDoc(invitationDoc.ref);
    }
  } catch {
    // ignore
  }

  try {
    await deleteDoc(doc(db, "chats", projectId));
  } catch {
    // ignore
  }
}

export async function deleteProject(userId: string, projectId: string): Promise<void> {
  const storageUrls = new Set<string>();
  const sharedDocRef = doc(sharedProjectsCollection(), projectId);
  const sharedDoc = await getDoc(sharedDocRef);

  if (sharedDoc.exists()) {
    const sharedData = sharedDoc.data() as Record<string, unknown>;
    const ownerId = (sharedData.ownerId as string | undefined) ?? null;
    collectStorageUrls(sharedData, storageUrls);

    if (ownerId && ownerId !== userId) {
      throw new Error("Nur der Besitzer kann ein geteiltes Projekt löschen");
    }

    if (ownerId) {
      try {
        const ownerDoc = await getDoc(doc(projectsCollection(ownerId), projectId));
        if (ownerDoc.exists()) {
          collectStorageUrls(ownerDoc.data() as Record<string, unknown>, storageUrls);
        }
      } catch {
        // ignore
      }
    }

    const sharedWith = parseStringList(sharedData.sharedWith);
    for (const memberId of sharedWith) {
      try {
        const memberDoc = await getDoc(doc(projectsCollection(memberId), projectId));
        if (memberDoc.exists()) {
          collectStorageUrls(memberDoc.data() as Record<string, unknown>, storageUrls);
        }
      } catch {
        // ignore
      }
    }

    await deleteDoc(sharedDocRef);
    if (ownerId) {
      try {
        await deleteDoc(doc(projectsCollection(ownerId), projectId));
      } catch {
        // ignore
      }
    }
    for (const memberId of sharedWith) {
      try {
        await deleteDoc(doc(projectsCollection(memberId), projectId));
      } catch {
        // ignore
      }
    }
  } else {
    const ownDoc = await getDoc(doc(projectsCollection(userId), projectId));
    if (ownDoc.exists()) {
      collectStorageUrls(ownDoc.data() as Record<string, unknown>, storageUrls);
    }
    await deleteDoc(doc(projectsCollection(userId), projectId));
  }

  for (const url of storageUrls) {
    await deleteStorageByUrl(url);
  }
  await deleteProjectFirestoreData(projectId);
  await deleteStorageFolderRecursive(`attachments/${projectId}`);
  await deleteStorageFolderRecursive(`files/${projectId}`);
  await deleteStorageFolderRecursive(`masters/${projectId}`);
  await deleteReferenceFilesByProjectId(projectId);

  await deleteDoc(doc(db, "projects", projectId));
  try {
    await deleteDoc(doc(db, "comments", projectId));
    await deleteDoc(doc(db, "project_history", projectId));
  } catch {
    // ignore
  }
}
