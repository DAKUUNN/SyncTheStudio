import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  updatePassword as fbUpdatePassword,
  verifyBeforeUpdateEmail,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from "firebase/auth";
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
  limit,
  Timestamp,
  serverTimestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "@/firebase";
import { userFromMap, userFromDocument, type UserModel } from "@/models/types";
import { getCurrentLanguageCode } from "@/i18n";
import { getOrCreateUserContentKey } from "./keyManagementService";
import { decryptText, encryptText } from "@/lib/crypto";

/** Port of auth_service.dart (Apple Sign-In is not available on Windows builds). */

const usersCollection = () => collection(db, "users");

function defaultPreferredLanguageCode(): string {
  const normalized = getCurrentLanguageCode().trim().toLowerCase();
  return normalized || "en";
}

export function mapAuthError(code: string, message?: string): string {
  if (code.includes("keychain")) {
    return "Ein Keychain-Fehler ist aufgetreten. Bitte versuche es erneut.";
  }
  switch (code) {
    case "auth/email-already-in-use":
    case "email-already-in-use":
      return "Diese E-Mail-Adresse wird bereits verwendet";
    case "auth/invalid-email":
    case "invalid-email":
      return "Ungültige E-Mail-Adresse";
    case "auth/weak-password":
    case "weak-password":
      return "Passwort ist zu schwach (mindestens 6 Zeichen)";
    case "auth/user-not-found":
    case "user-not-found":
      return "Kein Benutzer mit dieser E-Mail gefunden";
    case "auth/wrong-password":
    case "wrong-password":
    case "auth/invalid-credential":
      return "Falsches Passwort";
    case "auth/user-disabled":
      return "Dieser Benutzer wurde deaktiviert";
    case "auth/too-many-requests":
      return "Zu viele Versuche. Bitte später erneut versuchen";
    case "auth/network-request-failed":
      return "Netzwerkfehler. Bitte Internetverbindung prüfen";
    default:
      return `Ein Fehler ist aufgetreten: ${message ?? code}`;
  }
}

interface FirebaseErrorLike {
  code?: string;
  message?: string;
}

export async function createUser(params: {
  email: string;
  password: string;
  username: string;
}): Promise<string> {
  try {
    const credential = await createUserWithEmailAndPassword(
      auth,
      params.email,
      params.password
    );
    const userId = credential.user.uid;
    await updateProfile(credential.user, { displayName: params.username });

    const now = new Date();
    await setDoc(doc(usersCollection(), userId), {
      email: params.email,
      username: params.username,
      usernameLower: params.username.toLowerCase(),
      role: "user",
      plan: "free",
      preferredLanguageCode: defaultPreferredLanguageCode(),
      isActive: true,
      locked: false,
      isOnline: false,
      avatarUrl: null,
      bio: null,
      createdAt: Timestamp.fromDate(now),
      lastLogin: null,
      lastSeenAt: null,
    });

    // Same behavior as the original app: sign out after registration so the
    // user logs in explicitly.
    await signOut(auth);
    return userId;
  } catch (e) {
    const err = e as FirebaseErrorLike;
    throw new Error(mapAuthError(err.code ?? "", err.message));
  }
}

export async function loginUser(params: {
  email?: string;
  username?: string;
  password: string;
}): Promise<UserModel> {
  let loginEmail = params.email ?? null;
  let storedUsername = params.username ?? null;

  if (params.username && !loginEmail) {
    const q = query(
      usersCollection(),
      where("username", "==", params.username),
      limit(1)
    );
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      throw new Error("Benutzer nicht gefunden");
    }
    loginEmail = String(snapshot.docs[0].get("email") ?? "");
    storedUsername = String(snapshot.docs[0].get("username") ?? params.username);
  }

  if (!loginEmail) {
    throw new Error("Bitte Username eingeben");
  }

  try {
    const credential = await signInWithEmailAndPassword(
      auth,
      loginEmail,
      params.password
    );
    const userId = credential.user.uid;
    const snapshot = await getDoc(doc(usersCollection(), userId));

    const data = snapshot.exists() ? (snapshot.data() as Record<string, unknown>) : {};
    if (snapshot.exists() && !("preferredLanguageCode" in data)) {
      void setDoc(
        doc(usersCollection(), userId),
        {
          preferredLanguageCode: defaultPreferredLanguageCode(),
          updatedAt: Timestamp.fromDate(new Date()),
        },
        { merge: true }
      );
    }

    let bio = (data.bio as string | undefined) ?? null;
    const encryptedBio = (data.bioEnc as string | undefined) ?? null;
    if (encryptedBio && encryptedBio.trim()) {
      const userKey = await getOrCreateUserContentKey(userId);
      bio = await decryptText(encryptedBio, userKey);
    }

    return userFromMap({
      ...data,
      id: userId,
      email: (data.email as string | undefined) ?? loginEmail,
      username: (data.username as string | undefined) ?? storedUsername ?? "User",
      bio,
    });
  } catch (e) {
    const err = e as FirebaseErrorLike;
    throw new Error(mapAuthError(err.code ?? "", err.message));
  }
}

export async function logoutUser(): Promise<void> {
  await signOut(auth);
}

export async function resetPassword(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (e) {
    const err = e as FirebaseErrorLike;
    throw new Error(mapAuthError(err.code ?? "", err.message));
  }
}

export async function getCurrentUser(): Promise<UserModel | null> {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) return null;
  try {
    const snapshot = await getDoc(doc(usersCollection(), firebaseUser.uid));
    if (!snapshot.exists()) return null;
    const data = snapshot.data() as Record<string, unknown>;

    let bio = (data.bio as string | undefined) ?? null;
    const encryptedBio = (data.bioEnc as string | undefined) ?? null;
    if (encryptedBio && encryptedBio.trim()) {
      const userKey = await getOrCreateUserContentKey(firebaseUser.uid);
      bio = await decryptText(encryptedBio, userKey);
    }
    return userFromMap({ ...data, id: snapshot.id, bio });
  } catch {
    return null;
  }
}

export async function updatePreferredLanguage(
  userId: string,
  languageCode: string
): Promise<void> {
  const normalized = languageCode.trim().toLowerCase();
  if (!normalized) return;
  await setDoc(
    doc(usersCollection(), userId),
    { preferredLanguageCode: normalized, updatedAt: Timestamp.fromDate(new Date()) },
    { merge: true }
  );
}

export async function updateOwnProfile(params: {
  username?: string;
  email?: string;
  avatarUrl?: string;
  bio?: string;
}): Promise<void> {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) throw new Error("Nicht eingeloggt");

  const updates: Record<string, unknown> = {};
  if (params.username !== undefined) {
    updates.username = params.username;
    updates.usernameLower = params.username.toLowerCase();
    await updateProfile(firebaseUser, { displayName: params.username });
  }
  if (params.avatarUrl !== undefined) updates.avatarUrl = params.avatarUrl;
  if (params.bio !== undefined) {
    const userKey = await getOrCreateUserContentKey(firebaseUser.uid);
    updates.bioEnc = await encryptText(params.bio, userKey);
    updates.bio = null;
  }

  if (params.email && params.email !== firebaseUser.email) {
    await verifyBeforeUpdateEmail(firebaseUser, params.email);
  }

  if (Object.keys(updates).length > 0) {
    await updateDoc(doc(usersCollection(), firebaseUser.uid), updates);
  }
}

export async function changeUserPassword(params: {
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser || !firebaseUser.email) throw new Error("Nicht eingeloggt");
  try {
    const credential = EmailAuthProvider.credential(
      firebaseUser.email,
      params.currentPassword
    );
    await reauthenticateWithCredential(firebaseUser, credential);
    await fbUpdatePassword(firebaseUser, params.newPassword);
  } catch (e) {
    const err = e as FirebaseErrorLike;
    if (
      err.code === "auth/wrong-password" ||
      err.code === "auth/invalid-credential"
    ) {
      throw new Error("Falsches aktuelles Passwort");
    }
    throw new Error(mapAuthError(err.code ?? "", err.message));
  }
}

export async function getAllUsers(): Promise<UserModel[]> {
  const snapshot = await getDocs(usersCollection());
  return snapshot.docs.map((d) => userFromDocument(d));
}

export async function getUsersByIds(userIds: string[]): Promise<UserModel[]> {
  if (userIds.length === 0) return [];
  const users: UserModel[] = [];
  for (const userId of userIds) {
    try {
      const snapshot = await getDoc(doc(usersCollection(), userId));
      if (snapshot.exists()) users.push(userFromDocument(snapshot));
    } catch {
      // skip unavailable users
    }
  }
  return users;
}

export async function getUserByUsernameOrEmail(
  search: string
): Promise<UserModel | null> {
  try {
    const queryLower = search.toLowerCase();
    const byUsername = await getDocs(
      query(usersCollection(), where("usernameLower", "==", queryLower), limit(1))
    );
    if (!byUsername.empty) return userFromDocument(byUsername.docs[0]);

    if (search.includes("@")) {
      const byEmail = await getDocs(
        query(usersCollection(), where("email", "==", search), limit(1))
      );
      if (!byEmail.empty) return userFromDocument(byEmail.docs[0]);
    }
    return null;
  } catch {
    return null;
  }
}

export async function updateUserPresence(
  userId: string,
  isOnline: boolean
): Promise<void> {
  try {
    await setDoc(
      doc(usersCollection(), userId),
      {
        isOnline,
        lastSeenAt: serverTimestamp(),
        presenceUpdatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch {
    // presence updates are best-effort
  }
}

// ── Admin methods ────────────────────────────────────────────────

export async function toggleUserActive(userId: string): Promise<void> {
  const snapshot = await getDoc(doc(usersCollection(), userId));
  const currentActive = Boolean(snapshot.data()?.isActive ?? false);
  await updateDoc(doc(usersCollection(), userId), { isActive: !currentActive });
}

export async function updateUserRole(userId: string, newRole: string): Promise<void> {
  if (!["admin", "user"].includes(newRole)) throw new Error("Ungültige Rolle");
  await updateDoc(doc(usersCollection(), userId), { role: newRole });
}

export async function updateUserPlan(userId: string, newPlan: string): Promise<void> {
  if (!["free", "vip"].includes(newPlan)) throw new Error("Ungültiger Plan");
  await updateDoc(doc(usersCollection(), userId), { plan: newPlan });
}

export async function lockUser(userId: string, locked: boolean): Promise<void> {
  await updateDoc(doc(usersCollection(), userId), { locked });
}

export async function deleteUserDoc(userId: string): Promise<void> {
  await deleteDoc(doc(usersCollection(), userId));
}

export async function updateUserProfileAsAdmin(params: {
  userId: string;
  username?: string;
  email?: string;
}): Promise<void> {
  const updates: Record<string, unknown> = {};
  if (params.username !== undefined) updates.username = params.username;
  if (params.email !== undefined) updates.email = params.email;
  if (Object.keys(updates).length === 0) return;
  await updateDoc(doc(usersCollection(), params.userId), updates);
}

export async function adminResetUserPassword(
  userId: string,
  newPassword: string
): Promise<boolean> {
  try {
    await httpsCallable(functions, "adminResetUserPassword")({ userId, newPassword });
    return true;
  } catch {
    return false;
  }
}
