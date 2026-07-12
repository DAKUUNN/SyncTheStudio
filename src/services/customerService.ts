import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  onSnapshot,
  Timestamp,
  type CollectionReference,
  type DocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/firebase";
import { customerFromMap, type CustomerModel } from "@/models/types";
import { getOrCreateUserContentKey } from "./keyManagementService";
import { decryptText, encryptText } from "@/lib/crypto";

/** Port of customer_service.dart — notes are AES-encrypted (notesEnc). */

const customersCollection = (userId: string): CollectionReference =>
  collection(db, "users", userId, "customers");

async function decryptCustomerDoc(
  snapshot: DocumentSnapshot,
  userId: string
): Promise<CustomerModel> {
  const data = { ...((snapshot.data() as Record<string, unknown>) ?? {}) };
  const encryptedNotes = (data.notesEnc as string | undefined) ?? null;
  if (encryptedNotes && encryptedNotes.trim()) {
    const userKey = await getOrCreateUserContentKey(userId);
    data.notes = await decryptText(encryptedNotes, userKey);
  }
  data.id = snapshot.id;
  return customerFromMap(data);
}

export async function getCustomers(userId: string): Promise<CustomerModel[]> {
  try {
    const snapshot = await getDocs(
      query(customersCollection(userId), orderBy("createdAt", "desc"))
    );
    return Promise.all(snapshot.docs.map((d) => decryptCustomerDoc(d, userId)));
  } catch {
    return [];
  }
}

export function watchCustomers(
  userId: string,
  onChange: (customers: CustomerModel[]) => void
): Unsubscribe {
  return onSnapshot(
    query(customersCollection(userId), orderBy("createdAt", "desc")),
    (snapshot) => {
      void Promise.all(snapshot.docs.map((d) => decryptCustomerDoc(d, userId))).then(
        onChange
      );
    }
  );
}

export async function getCustomer(
  userId: string,
  customerId: string
): Promise<CustomerModel | null> {
  try {
    const snapshot = await getDoc(doc(customersCollection(userId), customerId));
    return snapshot.exists() ? decryptCustomerDoc(snapshot, userId) : null;
  } catch {
    return null;
  }
}

export interface CustomerInput {
  name?: string;
  email?: string;
  phone?: string;
  notes?: string;
  discord?: string;
  instagram?: string;
  spotify?: string;
  appleMusic?: string;
  clientMemory?: Record<string, string>;
  referenceTracks?: string[];
}

export async function createCustomer(
  userId: string,
  input: CustomerInput & { name: string }
): Promise<string> {
  const userKey = await getOrCreateUserContentKey(userId);
  const docRef = await addDoc(customersCollection(userId), {
    name: input.name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    notes: null,
    notesEnc: input.notes ? await encryptText(input.notes, userKey) : null,
    discord: input.discord ?? null,
    instagram: input.instagram ?? null,
    spotify: input.spotify ?? null,
    appleMusic: input.appleMusic ?? null,
    clientMemory: input.clientMemory ?? {},
    referenceTracks: input.referenceTracks ?? [],
    ownerId: userId,
    createdAt: Timestamp.fromDate(new Date()),
  });
  return docRef.id;
}

export async function updateCustomer(
  userId: string,
  customerId: string,
  input: CustomerInput
): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.email !== undefined) updates.email = input.email;
  if (input.phone !== undefined) updates.phone = input.phone;
  if (input.notes !== undefined) {
    const userKey = await getOrCreateUserContentKey(userId);
    updates.notes = null;
    updates.notesEnc = await encryptText(input.notes, userKey);
  }
  if (input.discord !== undefined) updates.discord = input.discord;
  if (input.instagram !== undefined) updates.instagram = input.instagram;
  if (input.spotify !== undefined) updates.spotify = input.spotify;
  if (input.appleMusic !== undefined) updates.appleMusic = input.appleMusic;
  if (input.clientMemory !== undefined) updates.clientMemory = input.clientMemory;
  if (input.referenceTracks !== undefined) updates.referenceTracks = input.referenceTracks;
  await updateDoc(doc(customersCollection(userId), customerId), updates);
}

export async function deleteCustomer(userId: string, customerId: string): Promise<void> {
  await deleteDoc(doc(customersCollection(userId), customerId));
}
