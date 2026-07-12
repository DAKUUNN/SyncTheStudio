import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
  type CollectionReference,
  type Unsubscribe,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/firebase";
import { invitationFromDocument, type InvitationModel } from "@/models/types";
import { createNotification } from "./notificationService";

/** Port of invitation_service.dart — collection project_invitations */

const invitationsCollection = (): CollectionReference =>
  collection(db, "project_invitations");

export async function createInvitation(params: {
  projectId: string;
  projectName: string;
  ownerId: string;
  ownerName: string;
  inviterId: string;
  inviterName?: string | null;
  invitedUserId: string;
  invitedUserName?: string | null;
}): Promise<string> {
  const existingPending = await getDocs(
    query(
      invitationsCollection(),
      where("projectId", "==", params.projectId),
      where("invitedUserId", "==", params.invitedUserId),
      where("status", "==", "pending"),
      limit(1)
    )
  );
  if (!existingPending.empty) return existingPending.docs[0].id;

  const docRef = await addDoc(invitationsCollection(), {
    projectId: params.projectId,
    projectName: params.projectName,
    ownerId: params.ownerId,
    ownerName: params.ownerName,
    inviterId: params.inviterId,
    inviterName: params.inviterName ?? null,
    invitedUserId: params.invitedUserId,
    invitedUserName: params.invitedUserName ?? null,
    status: "pending",
    createdAt: Timestamp.fromDate(new Date()),
  });

  try {
    await createNotification({
      senderId: params.inviterId,
      senderName: params.inviterName ?? params.ownerName,
      title: "Projekt-Einladung",
      message: `${params.inviterName ?? params.ownerName} hat dich zu "${params.projectName}" eingeladen.`,
      type: "invitation",
      priority: 1,
      targetUserId: params.invitedUserId,
      projectId: params.projectId,
    });
  } catch {
    // notification best-effort
  }

  return docRef.id;
}

export async function getPendingInvitations(userId: string): Promise<InvitationModel[]> {
  try {
    const snapshot = await getDocs(
      query(
        invitationsCollection(),
        where("invitedUserId", "==", userId),
        where("status", "==", "pending"),
        orderBy("createdAt", "desc")
      )
    );
    return snapshot.docs.map(invitationFromDocument);
  } catch {
    return [];
  }
}

export function watchPendingInvitations(
  userId: string,
  onChange: (invitations: InvitationModel[]) => void
): Unsubscribe {
  return onSnapshot(
    query(
      invitationsCollection(),
      where("invitedUserId", "==", userId),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    ),
    (snapshot) => onChange(snapshot.docs.map(invitationFromDocument))
  );
}

export async function acceptInvitation(invitationId: string): Promise<void> {
  await httpsCallable(functions, "acceptProjectInvitation")({ invitationId });
}

export async function declineInvitation(invitationId: string): Promise<void> {
  const invitationRef = doc(invitationsCollection(), invitationId);
  const snapshot = await getDoc(invitationRef);
  const data = snapshot.data() as Record<string, unknown> | undefined;

  await updateDoc(invitationRef, {
    status: "rejected",
    respondedAt: Timestamp.fromDate(new Date()),
  });

  const ownerId = String(data?.ownerId ?? "").trim();
  const projectId = String(data?.projectId ?? "");
  const projectName = String(data?.projectName ?? "Projekt");
  const invitedUserName = (data?.invitedUserName as string | undefined) ?? null;

  if (ownerId) {
    try {
      await createNotification({
        senderId: String(data?.invitedUserId ?? ""),
        senderName: invitedUserName ?? "Teammitglied",
        title: "Einladung abgelehnt",
        message: `${invitedUserName ?? "Ein Teammitglied"} hat die Einladung für "${projectName}" abgelehnt.`,
        type: "system",
        priority: 0,
        targetUserId: ownerId,
        projectId,
      });
    } catch {
      // best-effort
    }
  }
}

export async function hasPendingInvitation(
  projectId: string,
  invitedUserId: string
): Promise<boolean> {
  try {
    const snapshot = await getDocs(
      query(
        invitationsCollection(),
        where("projectId", "==", projectId),
        where("invitedUserId", "==", invitedUserId),
        where("status", "==", "pending"),
        limit(1)
      )
    );
    return !snapshot.empty;
  } catch {
    return false;
  }
}

export async function deleteInvitation(invitationId: string): Promise<void> {
  await deleteDoc(doc(invitationsCollection(), invitationId));
}
