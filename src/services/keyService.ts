import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebase";
import {
  deriveKekBase64,
  generateKeyBase64,
  generateIvBase64,
  generateRecoveryCode,
  generateRsaKeyPair,
  normalizeRecoveryCode,
  unwrapKeyBase64,
  wrapKeyBase64,
  encryptText,
  PBKDF2_ITERATIONS,
} from "@/lib/crypto";

/**
 * Zero-knowledge key hierarchy for FILES (attachments + masters).
 *
 * Per user there is one random master key. It is stored ONLY wrapped:
 *   - masterKeyPw: wrapped with a KEK derived from the login password
 *   - masterKeyRc: wrapped with a KEK derived from the recovery code
 * The user's RSA private key (used to receive project file keys from
 * other members) is encrypted with the master key; the public key sits
 * on the main users/{uid} doc so team members can wrap keys FOR them.
 *
 * The server (and therefore the admin) never sees any plaintext key:
 * password and recovery code never leave the device, the KEKs are
 * derived locally, and unlocked keys live in memory + device-local
 * localStorage only.
 *
 * Consequences by design:
 *   - Mail password reset alone cannot restore file access — that's
 *     the zero-knowledge guarantee. The recovery code path rewraps the
 *     password copy after a reset.
 *   - Sign-in-with-Apple users have no password; their master key is
 *     wrapped only with the recovery code.
 */

const keysDoc = (userId: string) => doc(db, "users", userId, "private", "e2eKeys");

const LOCAL_KEY_PREFIX = "sts_e2e_mk_";

interface KeysDocData {
  v?: number;
  pwSalt?: string | null;
  pwIterations?: number;
  masterKeyPw?: string | null;
  rcSalt?: string;
  masterKeyRc?: string;
  privateKeyEnc?: string;
}

const memoryKeys = new Map<string, string>();
const privateKeyCache = new Map<string, string>();

function rememberMasterKey(userId: string, masterKey: string): void {
  memoryKeys.set(userId, masterKey);
  try {
    localStorage.setItem(LOCAL_KEY_PREFIX + userId, masterKey);
  } catch {
    // storage may be unavailable (private mode) — memory copy suffices
  }
}

/** Unlocked master key for this device, or null when locked. */
export function getUnlockedMasterKey(userId: string): string | null {
  const inMemory = memoryKeys.get(userId);
  if (inMemory) return inMemory;
  try {
    const stored = localStorage.getItem(LOCAL_KEY_PREFIX + userId);
    if (stored) {
      memoryKeys.set(userId, stored);
      return stored;
    }
  } catch {
    // ignore
  }
  return null;
}

export function clearUnlockedKeys(userId: string): void {
  memoryKeys.delete(userId);
  privateKeyCache.delete(userId);
  try {
    localStorage.removeItem(LOCAL_KEY_PREFIX + userId);
  } catch {
    // ignore
  }
}

export type EnsureKeysResult =
  | { state: "unlocked"; recoveryCode?: string }
  | { state: "locked" }; // wrong/changed password and no local copy → needs recovery code

export type KeyStatus = "none" | "unlocked" | "locked";

/** Where this device stands — used on session restore, where no
 *  password is available to unlock with. */
export async function getKeyStatus(userId: string): Promise<KeyStatus> {
  if (getUnlockedMasterKey(userId)) return "unlocked";
  const snapshot = await getDoc(keysDoc(userId));
  return snapshot.exists() ? "locked" : "none";
}

/** Unlocks with the account password (e.g. from the session-restore
 *  unlock dialog). Returns false when the password doesn't match the
 *  wrapped copy. */
export async function unlockWithPassword(userId: string, password: string): Promise<boolean> {
  const snapshot = await getDoc(keysDoc(userId));
  if (!snapshot.exists()) return false;
  const data = snapshot.data() as KeysDocData;
  if (!data.masterKeyPw || !data.pwSalt) return false;
  try {
    const kek = await deriveKekBase64(password, data.pwSalt, data.pwIterations);
    const masterKey = await unwrapKeyBase64(data.masterKeyPw, kek);
    rememberMasterKey(userId, masterKey);
    return true;
  } catch {
    return false;
  }
}

/**
 * Called right after login/registration while the password is still in
 * hand. Creates the key set on first use (returning the recovery code
 * exactly once — it is never persisted anywhere), otherwise unlocks.
 * `password` is null for Sign-in-with-Apple.
 */
export async function ensureUserKeys(
  userId: string,
  password: string | null
): Promise<EnsureKeysResult> {
  const snapshot = await getDoc(keysDoc(userId));

  if (!snapshot.exists()) {
    const masterKey = generateKeyBase64();
    const recoveryCode = generateRecoveryCode();
    const keyPair = await generateRsaKeyPair();

    const rcSalt = generateIvBase64();
    const rcKek = await deriveKekBase64(recoveryCode, rcSalt);

    let pwSalt: string | null = null;
    let masterKeyPw: string | null = null;
    if (password) {
      pwSalt = generateIvBase64();
      masterKeyPw = await wrapKeyBase64(masterKey, await deriveKekBase64(password, pwSalt));
    }

    await setDoc(keysDoc(userId), {
      v: 1,
      pwSalt,
      pwIterations: PBKDF2_ITERATIONS,
      masterKeyPw,
      rcSalt,
      masterKeyRc: await wrapKeyBase64(masterKey, rcKek),
      privateKeyEnc: await encryptText(keyPair.privateKeyPkcs8, masterKey),
      updatedAt: serverTimestamp(),
    });
    // public key goes on the main user doc so other members can read it
    await setDoc(doc(db, "users", userId), { publicKey: keyPair.publicKeySpki }, { merge: true });

    rememberMasterKey(userId, masterKey);
    privateKeyCache.set(userId, keyPair.privateKeyPkcs8);
    return { state: "unlocked", recoveryCode };
  }

  // Already provisioned: this device may hold the key, or the password unlocks it.
  if (getUnlockedMasterKey(userId)) return { state: "unlocked" };

  const data = snapshot.data() as KeysDocData;
  if (password && data.masterKeyPw && data.pwSalt) {
    try {
      const kek = await deriveKekBase64(password, data.pwSalt, data.pwIterations);
      const masterKey = await unwrapKeyBase64(data.masterKeyPw, kek);
      rememberMasterKey(userId, masterKey);
      return { state: "unlocked" };
    } catch {
      // password changed via mail reset (or wrong copy) → recovery needed
    }
  }
  return { state: "locked" };
}

/**
 * Unlocks with the recovery code — the path after a mail password
 * reset. When `newPassword` is provided (the freshly set password the
 * user just logged in with), the password copy is rewrapped so the
 * next login unlocks normally again.
 */
export async function unlockWithRecoveryCode(
  userId: string,
  recoveryCodeInput: string,
  newPassword: string | null
): Promise<boolean> {
  const snapshot = await getDoc(keysDoc(userId));
  if (!snapshot.exists()) return false;
  const data = snapshot.data() as KeysDocData;
  if (!data.masterKeyRc || !data.rcSalt) return false;

  let masterKey: string;
  try {
    const code = normalizeRecoveryCode(recoveryCodeInput);
    const kek = await deriveKekBase64(code, data.rcSalt, data.pwIterations);
    masterKey = await unwrapKeyBase64(data.masterKeyRc, kek);
  } catch {
    return false;
  }

  rememberMasterKey(userId, masterKey);

  if (newPassword) {
    const pwSalt = generateIvBase64();
    const masterKeyPw = await wrapKeyBase64(
      masterKey,
      await deriveKekBase64(newPassword, pwSalt)
    );
    await setDoc(
      keysDoc(userId),
      { pwSalt, masterKeyPw, updatedAt: serverTimestamp() },
      { merge: true }
    );
  }
  return true;
}

/** Rewraps the password copy after an in-app password change (user is
 *  unlocked, old session still valid). */
export async function rewrapPasswordCopy(userId: string, newPassword: string): Promise<void> {
  const masterKey = getUnlockedMasterKey(userId);
  if (!masterKey) return;
  const pwSalt = generateIvBase64();
  const masterKeyPw = await wrapKeyBase64(masterKey, await deriveKekBase64(newPassword, pwSalt));
  await setDoc(
    keysDoc(userId),
    { pwSalt, masterKeyPw, pwIterations: PBKDF2_ITERATIONS, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** The user's RSA private key (for unwrapping project file keys).
 *  Requires the master key to be unlocked. */
export async function getPrivateKey(userId: string): Promise<string | null> {
  const cached = privateKeyCache.get(userId);
  if (cached) return cached;
  const masterKey = getUnlockedMasterKey(userId);
  if (!masterKey) return null;
  const snapshot = await getDoc(keysDoc(userId));
  const encrypted = (snapshot.data() as KeysDocData | undefined)?.privateKeyEnc;
  if (!encrypted) return null;
  try {
    const { decryptText } = await import("@/lib/crypto");
    const privateKey = await decryptText(encrypted, masterKey);
    if (privateKey === encrypted) return null; // decrypt failed
    privateKeyCache.set(userId, privateKey);
    return privateKey;
  } catch {
    return null;
  }
}

/** Another user's public key from their main user doc (readable by
 *  signed-in users) — needed to wrap project keys for team members. */
export async function getPublicKeyOf(userId: string): Promise<string | null> {
  const snapshot = await getDoc(doc(db, "users", userId));
  const publicKey = (snapshot.data()?.publicKey as string | undefined)?.trim();
  return publicKey || null;
}
