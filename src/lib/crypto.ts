/**
 * SecureContentService port — AES-256-GCM with the exact same wire format as
 * the Flutter app (package:encrypt AESMode.gcm):
 *   - text envelope: JSON string {"v":1,"iv":"<base64>","ct":"<base64>"}
 *   - ciphertext = raw AES-GCM output with the 16-byte auth tag appended,
 *     which matches WebCrypto's AES-GCM output exactly.
 *   - keys: 32 random bytes (base64), IVs: 12 random bytes (base64)
 */

const KEY_LENGTH_BYTES = 32;
const IV_LENGTH_BYTES = 12;

export interface EncryptedFilePayload {
  bytes: Uint8Array;
  iv: string;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function generateKeyBase64(): string {
  const bytes = new Uint8Array(KEY_LENGTH_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

export function generateIvBase64(): string {
  const bytes = new Uint8Array(IV_LENGTH_BYTES);
  crypto.getRandomValues(bytes);
  return bytesToBase64(bytes);
}

export function isEncryptedString(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.startsWith("{") && trimmed.includes('"iv"') && trimmed.includes('"ct"')
  );
}

async function importAesKey(keyBase64: string): Promise<CryptoKey> {
  const raw = base64ToBytes(keyBase64);
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export async function encryptText(
  plainText: string,
  keyBase64: string
): Promise<string> {
  if (!plainText) return plainText;
  const ivBase64 = generateIvBase64();
  const iv = base64ToBytes(ivBase64);
  const key = await importAesKey(keyBase64);
  const encoded = new TextEncoder().encode(plainText);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    encoded as BufferSource
  );
  return JSON.stringify({
    v: 1,
    iv: ivBase64,
    ct: bytesToBase64(new Uint8Array(cipher)),
  });
}

export async function decryptText(
  encryptedText: string,
  keyBase64: string
): Promise<string> {
  if (!encryptedText || !isEncryptedString(encryptedText)) return encryptedText;
  try {
    const envelope = JSON.parse(encryptedText) as { v?: number; iv?: string; ct?: string };
    const iv = base64ToBytes(envelope.iv ?? "");
    const cipher = base64ToBytes(envelope.ct ?? "");
    const key = await importAesKey(keyBase64);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      cipher as BufferSource
    );
    return new TextDecoder().decode(plain);
  } catch {
    return encryptedText;
  }
}

export async function encryptBytes(
  bytes: Uint8Array,
  keyBase64: string
): Promise<EncryptedFilePayload> {
  const ivBase64 = generateIvBase64();
  const iv = base64ToBytes(ivBase64);
  const key = await importAesKey(keyBase64);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    bytes as BufferSource
  );
  return { bytes: new Uint8Array(cipher), iv: ivBase64 };
}

export async function decryptBytes(
  encryptedBytes: Uint8Array,
  ivBase64: string,
  keyBase64: string
): Promise<Uint8Array> {
  const iv = base64ToBytes(ivBase64);
  const key = await importAesKey(keyBase64);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    encryptedBytes as BufferSource
  );
  return new Uint8Array(plain);
}

/** UUID v4 with fallback for WebViews where crypto.randomUUID is missing. */
export function uuid(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Matches MasterService/_hashPassword: sha256("salt:password") hex. */
export async function hashSharePassword(password: string, salt: string): Promise<string> {
  return sha256Hex(`${salt}:${password}`);
}

// ─────────────────────────────────────────────────────────────────
// Zero-knowledge key hierarchy primitives (see keyService.ts).
// The server only ever stores WRAPPED keys — every plaintext key
// below exists in client memory only.

export const PBKDF2_ITERATIONS = 600_000;

/** Derives a 32-byte KEK from a password or recovery code via
 *  PBKDF2-SHA256. Same secret + salt always yields the same KEK. */
export async function deriveKekBase64(
  secret: string,
  saltBase64: string,
  iterations: number = PBKDF2_ITERATIONS
): Promise<string> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret) as BufferSource,
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: base64ToBytes(saltBase64) as BufferSource,
      iterations,
    },
    baseKey,
    KEY_LENGTH_BYTES * 8
  );
  return bytesToBase64(new Uint8Array(bits));
}

/** Wraps one AES key with another (KEK) — same envelope as encryptText. */
export function wrapKeyBase64(keyBase64: string, kekBase64: string): Promise<string> {
  return encryptText(keyBase64, kekBase64);
}

/** Strict unwrap: throws when the KEK is wrong (unlike decryptText,
 *  which silently returns its input on failure). */
export async function unwrapKeyBase64(
  wrapped: string,
  kekBase64: string
): Promise<string> {
  const envelope = JSON.parse(wrapped) as { iv?: string; ct?: string };
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.iv ?? "") as BufferSource },
    await importAesKey(kekBase64),
    base64ToBytes(envelope.ct ?? "") as BufferSource
  );
  const keyBase64 = new TextDecoder().decode(plain);
  if (base64ToBytes(keyBase64).length !== KEY_LENGTH_BYTES) {
    throw new Error("unwrapped value is not a valid key");
  }
  return keyBase64;
}

export interface RsaKeyPairBase64 {
  publicKeySpki: string;
  privateKeyPkcs8: string;
}

const RSA_PARAMS: RsaHashedKeyGenParams = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

export async function generateRsaKeyPair(): Promise<RsaKeyPairBase64> {
  const pair = await crypto.subtle.generateKey(RSA_PARAMS, true, ["encrypt", "decrypt"]);
  const publicKey = await crypto.subtle.exportKey("spki", pair.publicKey);
  const privateKey = await crypto.subtle.exportKey("pkcs8", pair.privateKey);
  return {
    publicKeySpki: bytesToBase64(new Uint8Array(publicKey)),
    privateKeyPkcs8: bytesToBase64(new Uint8Array(privateKey)),
  };
}

/** Wraps an AES key for another user given their public key. */
export async function rsaWrapKey(
  keyBase64: string,
  publicKeySpkiBase64: string
): Promise<string> {
  const publicKey = await crypto.subtle.importKey(
    "spki",
    base64ToBytes(publicKeySpkiBase64) as BufferSource,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"]
  );
  const cipher = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    base64ToBytes(keyBase64) as BufferSource
  );
  return bytesToBase64(new Uint8Array(cipher));
}

export async function rsaUnwrapKey(
  wrappedBase64: string,
  privateKeyPkcs8Base64: string
): Promise<string> {
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    base64ToBytes(privateKeyPkcs8Base64) as BufferSource,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"]
  );
  const plain = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    base64ToBytes(wrappedBase64) as BufferSource
  );
  return bytesToBase64(new Uint8Array(plain));
}

/** Human-friendly recovery code: 5 groups of 5 chars from an alphabet
 *  without lookalikes (no 0/O/1/I/L), e.g. "K7X2M-9PQRT-…" — ~124 bits. */
const RECOVERY_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function generateRecoveryCode(): string {
  const chars = new Uint8Array(25);
  crypto.getRandomValues(chars);
  const groups: string[] = [];
  for (let g = 0; g < 5; g++) {
    let group = "";
    for (let i = 0; i < 5; i++) {
      group += RECOVERY_ALPHABET[chars[g * 5 + i] % RECOVERY_ALPHABET.length];
    }
    groups.push(group);
  }
  return groups.join("-");
}

/** Normalizes user input of a recovery code (case, separators). */
export function normalizeRecoveryCode(input: string): string {
  const cleaned = input.toUpperCase().replace(/[^0-9A-Z]/g, "");
  return cleaned.match(/.{1,5}/g)?.join("-") ?? cleaned;
}
