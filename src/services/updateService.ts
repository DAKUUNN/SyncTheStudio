/** Auto-update via the Tauri updater plugin (GitHub Releases as the update
 *  feed — see .github/workflows/release.yml). Only ever runs inside the
 *  actual Tauri desktop shell; a no-op (never throws) in any browser
 *  context (dev preview, or the public master/upload web pages). */

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export interface AvailableUpdate {
  version: string;
  currentVersion: string;
  date: string | null;
  body: string | null;
}

let cachedUpdate: import("@tauri-apps/plugin-updater").Update | null = null;

export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  if (!isTauriRuntime()) return null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update?.available) return null;
    cachedUpdate = update;
    return {
      version: update.version,
      currentVersion: update.currentVersion,
      date: update.date ?? null,
      body: update.body ?? null,
    };
  } catch (e) {
    console.warn("Update check failed:", e);
    return null;
  }
}

export async function installUpdateAndRestart(
  onProgress?: (downloaded: number, total: number | null) => void
): Promise<void> {
  if (!cachedUpdate) throw new Error("Kein Update zum Installieren gefunden.");
  let total: number | null = null;
  let downloaded = 0;

  await cachedUpdate.downloadAndInstall((event) => {
    if (event.event === "Started") {
      total = event.data.contentLength ?? null;
      downloaded = 0;
      onProgress?.(0, total);
    } else if (event.event === "Progress") {
      downloaded += event.data.chunkLength;
      onProgress?.(downloaded, total);
    } else if (event.event === "Finished") {
      onProgress?.(total ?? downloaded, total);
    }
  });

  const { relaunch } = await import("@tauri-apps/plugin-process");
  await relaunch();
}
