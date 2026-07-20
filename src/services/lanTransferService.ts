/** Desktop-only direct file/folder transfer between two SyncTheStudio
 *  installs on the same local network — the native Rust side (see
 *  src-tauri/src/lan_transfer.rs) does the actual TCP handshake, PIN-based
 *  key derivation and AES-256-GCM encrypted streaming; this module is just
 *  a thin typed wrapper around those Tauri commands/events. */

export interface LanTransferProgress {
  bytesDone: number;
  bytesTotal: number;
  currentFile: string;
}

const DEFAULT_PORT = 51823;

export function defaultPort(): number {
  return DEFAULT_PORT;
}

/** 6-character alphanumeric PIN — short enough to read aloud/type across
 *  the room, long enough (36^6 ≈ 2.1 billion combinations) that guessing
 *  it during the few seconds a transfer window is open isn't practical. */
export function generatePin(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  let pin = "";
  for (let i = 0; i < 6; i++) {
    pin += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return pin;
}

export async function getLocalIp(): Promise<string | null> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return await invoke<string | null>("lan_transfer_local_ip");
  } catch {
    return null;
  }
}

export async function startSend(sourcePath: string, pin: string, port: number): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("lan_transfer_send", { sourcePath, pin, port });
}

export async function startReceive(
  host: string,
  port: number,
  pin: string,
  saveDir: string
): Promise<string> {
  const { invoke } = await import("@tauri-apps/api/core");
  return await invoke<string>("lan_transfer_receive", { host, port, pin, saveDir });
}

export async function cancelTransfer(): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("lan_transfer_cancel");
}

export async function onWaitingForConnection(cb: () => void): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen("lan-transfer://waiting", () => cb());
  return unlisten;
}

export async function onConnected(cb: () => void): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen("lan-transfer://connected", () => cb());
  return unlisten;
}

export async function onProgress(
  cb: (progress: LanTransferProgress) => void
): Promise<() => void> {
  const { listen } = await import("@tauri-apps/api/event");
  const unlisten = await listen<{ bytes_done: number; bytes_total: number; current_file: string }>(
    "lan-transfer://progress",
    (event) => {
      cb({
        bytesDone: event.payload.bytes_done,
        bytesTotal: event.payload.bytes_total,
        currentFile: event.payload.current_file,
      });
    }
  );
  return unlisten;
}
