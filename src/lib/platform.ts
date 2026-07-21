/** Platform helpers for hiding/adapting desktop-only features on iOS
 *  (auto-update, arbitrary folder export, local DAW file paths — none of
 *  these map onto iOS's sandboxed filesystem or App Store update policy).
 *  No-ops (never throws) outside the Tauri runtime. */
import { useEffect, useState } from "react";

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** True in the Tauri desktop/iOS apps, false in a plain browser tab
 *  (e.g. the syncthestudio.de web build). Synchronous — Tauri injects its
 *  runtime marker before any app JS runs, unlike the iOS platform check
 *  below which needs an async plugin call. */
export function useIsTauri(): boolean {
  return isTauriRuntime();
}

/** True only for the Tauri desktop app (macOS/Windows) — false on iOS and
 *  false in a plain browser tab. Use this (not `!useIsIOS()` alone) to gate
 *  features that need real native capabilities unavailable to both iOS's
 *  sandbox and the browser (LAN transfer, DAW process detection, arbitrary
 *  local file paths). */
export function useIsDesktopTauri(): boolean {
  const isTauri = useIsTauri();
  const isIOSNow = useIsIOS();
  return isTauri && !isIOSNow;
}

/** Opens a URL in the system's default browser (Tauri) or a new tab
 *  (plain browser) — the opener plugin only exists under Tauri. */
export async function openExternalUrl(url: string): Promise<void> {
  if (isTauriRuntime()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

let cachedIsIOS: boolean | null = null;

/** Resolves once and caches — call this early (e.g. app mount) if you need
 *  the very first render to already know the platform. */
export async function isIOS(): Promise<boolean> {
  if (cachedIsIOS !== null) return cachedIsIOS;
  if (!isTauriRuntime()) {
    cachedIsIOS = false;
    return false;
  }
  try {
    const { platform } = await import("@tauri-apps/plugin-os");
    cachedIsIOS = platform() === "ios";
  } catch {
    cachedIsIOS = false;
  }
  return cachedIsIOS;
}

/** Synchronous best-effort read of the cached result — false (i.e. "assume
 *  desktop") until isIOS() has resolved at least once. Use this in render
 *  paths that already called isIOS() during mount via useIsIOS(). */
export function isIOSSync(): boolean {
  return cachedIsIOS === true;
}

/** Reactive platform check for components — starts as `false` (desktop
 *  assumed) and flips to `true` on iOS once the async check resolves,
 *  which is near-instant since the result is cached after the first call
 *  anywhere in the app. */
export function useIsIOS(): boolean {
  const [ios, setIos] = useState(isIOSSync());
  useEffect(() => {
    let cancelled = false;
    void isIOS().then((result) => {
      if (!cancelled) setIos(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return ios;
}
