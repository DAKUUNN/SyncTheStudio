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
