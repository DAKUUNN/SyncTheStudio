import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/firebase";
import { chatMessageFromMap, type ChatMessageModel } from "@/models/types";
import { getOrCreateProjectContentKey } from "./keyManagementService";
import { getProjectOwnerId } from "./projectService";
import { decryptText } from "@/lib/crypto";

/** One-shot decrypted chat fetch used by the export service. */
export async function getMessagesOnce(projectId: string): Promise<ChatMessageModel[]> {
  try {
    const snapshot = await getDocs(
      query(collection(db, "chats", projectId, "messages"), orderBy("timestamp", "asc"))
    );
    const ownerId = (await getProjectOwnerId(projectId)) ?? "";
    const projectKey = await getOrCreateProjectContentKey(projectId, ownerId);

    return Promise.all(
      snapshot.docs.map(async (d) => {
        const data = { ...((d.data() as Record<string, unknown>) ?? {}) };
        const encryptedMessage = (data.messageEnc as string | undefined) ?? null;
        if (encryptedMessage && encryptedMessage.trim() && projectKey) {
          data.message = await decryptText(encryptedMessage, projectKey);
        }
        return chatMessageFromMap(d.id, data);
      })
    );
  } catch {
    return [];
  }
}
