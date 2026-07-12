import {
  collection,
  doc,
  addDoc,
  setDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type CollectionReference,
  type DocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/firebase";
import { chatMessageFromMap, type ChatMessageModel } from "@/models/types";
import { getOrCreateProjectContentKey } from "./keyManagementService";
import { getProjectOwnerId } from "./projectService";
import { decryptText, encryptText } from "@/lib/crypto";

/** Port of chat_service.dart — chats/{projectId}/messages, AES-encrypted. */

const messagesCollection = (projectId: string): CollectionReference =>
  collection(db, "chats", projectId, "messages");

async function decryptChatMessageDoc(
  snapshot: DocumentSnapshot,
  projectId: string
): Promise<ChatMessageModel> {
  const data = { ...((snapshot.data() as Record<string, unknown>) ?? {}) };
  const encryptedMessage = (data.messageEnc as string | undefined) ?? null;
  if (encryptedMessage && encryptedMessage.trim()) {
    const currentUserId = auth.currentUser?.uid ?? "";
    const ownerId = (await getProjectOwnerId(projectId)) ?? currentUserId;
    const projectKey = await getOrCreateProjectContentKey(projectId, ownerId);
    if (projectKey) {
      const decrypted = await decryptText(encryptedMessage, projectKey);
      data.message = decrypted;
      data.text = decrypted;
    }
  }
  return chatMessageFromMap(snapshot.id, data);
}

export async function sendMessage(params: {
  projectId: string;
  userId: string;
  username: string;
  userAvatarUrl?: string | null;
  message: string;
  participantIds?: string[];
  ownerId?: string | null;
}): Promise<void> {
  const ownerIdForKey =
    params.ownerId?.trim() ||
    (await getProjectOwnerId(params.projectId)) ||
    params.userId;
  const projectKey = await getOrCreateProjectContentKey(params.projectId, ownerIdForKey);

  await addDoc(messagesCollection(params.projectId), {
    projectId: params.projectId,
    userId: params.userId,
    username: params.username,
    userAvatarUrl: params.userAvatarUrl ?? null,
    message: "",
    messageEnc: projectKey ? await encryptText(params.message, projectKey) : params.message,
    senderId: params.userId,
    senderName: params.username,
    text: "",
    timestamp: serverTimestamp(),
  });

  const participants = new Set<string>();
  for (const id of params.participantIds ?? []) {
    if (id.trim()) participants.add(id);
  }
  participants.add(params.userId);
  if (params.ownerId?.trim()) participants.add(params.ownerId);

  const chatDocData: Record<string, unknown> = {
    projectId: params.projectId,
    updatedAt: serverTimestamp(),
  };
  if (participants.size > 0) chatDocData.sharedWith = [...participants];
  if (params.ownerId?.trim()) chatDocData.ownerId = params.ownerId;

  await setDoc(doc(db, "chats", params.projectId), chatDocData, { merge: true });
}

export function watchMessages(
  projectId: string,
  onChange: (messages: ChatMessageModel[]) => void
): Unsubscribe {
  return onSnapshot(
    query(messagesCollection(projectId), orderBy("timestamp", "asc")),
    (snapshot) => {
      void Promise.all(
        snapshot.docs.map((d) => decryptChatMessageDoc(d, projectId))
      ).then(onChange);
    }
  );
}

export async function deleteMessage(projectId: string, messageId: string): Promise<void> {
  await deleteDoc(doc(messagesCollection(projectId), messageId));
}
