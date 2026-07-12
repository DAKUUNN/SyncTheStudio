import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  type CollectionReference,
  type DocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/firebase";
import {
  templateFromMap,
  projectTypeFromDocument,
  defaultProjectTypes,
  type ProjectTemplateModel,
  type ProjectTypeModel,
} from "@/models/types";
import { getOrCreateUserContentKey } from "./keyManagementService";
import { decryptText, encryptText } from "@/lib/crypto";

/** Port of template_service.dart + project_type_service.dart */

const templatesCollection = (userId: string): CollectionReference =>
  collection(db, "users", userId, "projectTemplates");

const typesCollection = (userId: string): CollectionReference =>
  collection(db, "users", userId, "projectTypes");

async function decryptTemplateDoc(
  snapshot: DocumentSnapshot,
  userId: string
): Promise<ProjectTemplateModel> {
  const data = { ...((snapshot.data() as Record<string, unknown>) ?? {}) };
  const userKey = await getOrCreateUserContentKey(userId);
  const encryptedDescription = (data.descriptionEnc as string | undefined) ?? null;
  const encryptedNotes = (data.notesEnc as string | undefined) ?? null;
  if (encryptedDescription && encryptedDescription.trim()) {
    data.description = await decryptText(encryptedDescription, userKey);
  }
  if (encryptedNotes && encryptedNotes.trim()) {
    data.notes = await decryptText(encryptedNotes, userKey);
  }
  return templateFromMap(snapshot.id, data);
}

export function watchTemplates(
  userId: string,
  onChange: (templates: ProjectTemplateModel[]) => void
): Unsubscribe {
  return onSnapshot(
    query(templatesCollection(userId), orderBy("createdAt", "desc")),
    (snapshot) => {
      void Promise.all(snapshot.docs.map((d) => decryptTemplateDoc(d, userId))).then(
        onChange
      );
    }
  );
}

export async function getTemplates(userId: string): Promise<ProjectTemplateModel[]> {
  const snapshot = await getDocs(
    query(templatesCollection(userId), orderBy("createdAt", "desc"))
  );
  return Promise.all(snapshot.docs.map((d) => decryptTemplateDoc(d, userId)));
}

export async function createTemplate(params: {
  userId: string;
  name: string;
  description?: string | null;
  projectType?: string | null;
  priority?: string | null;
  customerName?: string | null;
  notes?: string | null;
}): Promise<string> {
  const userKey = await getOrCreateUserContentKey(params.userId);
  const docRef = await addDoc(templatesCollection(params.userId), {
    name: params.name,
    description: null,
    descriptionEnc: params.description
      ? await encryptText(params.description, userKey)
      : null,
    projectType: params.projectType ?? null,
    priority: params.priority ?? null,
    customerName: params.customerName ?? null,
    notes: null,
    notesEnc: params.notes ? await encryptText(params.notes, userKey) : null,
    createdAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function deleteTemplate(userId: string, templateId: string): Promise<void> {
  await deleteDoc(doc(templatesCollection(userId), templateId));
}

// ── Project types ────────────────────────────────────────────────

export async function getProjectTypes(userId: string): Promise<ProjectTypeModel[]> {
  try {
    const customSnapshot = await getDocs(typesCollection(userId));
    const customTypes = customSnapshot.docs.map(projectTypeFromDocument);
    const defaults = defaultProjectTypes(userId);

    const seenNames = new Set<string>();
    const allTypes: ProjectTypeModel[] = [];
    const addIfUniqueName = (type: ProjectTypeModel) => {
      const normalizedName = type.name.trim().toLowerCase();
      if (!normalizedName || seenNames.has(normalizedName)) return;
      seenNames.add(normalizedName);
      allTypes.push(type);
    };
    defaults.forEach(addIfUniqueName);
    customTypes.forEach(addIfUniqueName);
    return allTypes;
  } catch {
    return defaultProjectTypes(userId);
  }
}

export async function createProjectType(params: {
  userId: string;
  name: string;
  color: string;
}): Promise<string> {
  const docRef = await addDoc(typesCollection(params.userId), {
    name: params.name,
    color: params.color,
    isDefault: false,
    ownerId: params.userId,
    createdAt: Timestamp.fromDate(new Date()),
  });
  return docRef.id;
}

export async function updateProjectType(params: {
  userId: string;
  typeId: string;
  name?: string;
  color?: string;
}): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (params.name !== undefined) updates.name = params.name;
  if (params.color !== undefined) updates.color = params.color;
  await updateDoc(doc(typesCollection(params.userId), params.typeId), updates);
}

export async function deleteProjectType(userId: string, typeId: string): Promise<void> {
  await deleteDoc(doc(typesCollection(userId), typeId));
}
