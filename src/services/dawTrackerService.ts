/** Desktop-only DAW-linked automatic time tracking. Detects which
 *  application currently has focus via a native Tauri command
 *  (`frontmost_app_name`, see src-tauri/src/lib.rs) and matches it
 *  against a list of known DAW names. The polling state machine lives
 *  in DawAutoTracker.tsx; this module holds the pure matching logic
 *  and the small bits of local (per-device) persisted state — which
 *  project is currently "assigned" for auto-tracking, extra user
 *  keywords, and the dangling-entry recovery marker. */

const STORAGE_PROJECT_KEY = "sts_daw_autotrack_project";
const STORAGE_KEYWORDS_KEY = "sts_daw_custom_keywords";
const STORAGE_ACTIVE_ENTRY_KEY = "sts_daw_active_entry";

/** Normalized (lowercase, no spaces/punctuation) substrings matched
 *  against the frontmost app/process name. Covers the common DAWs on
 *  both macOS (App name, e.g. "Logic Pro") and Windows (process name,
 *  e.g. "ProTools"). */
const DEFAULT_DAW_KEYWORDS = [
  "protools",
  "logicpro",
  "garageband",
  "abletonlive",
  "studioone",
  "studiopro",
  "cubase",
  "nuendo",
  "reaper",
  "bitwig",
  "flstudio",
  "reason",
  "wavelab",
  "pyramix",
  "digitalperformer",
  "samplitude",
  "sequoia",
  "mixbus",
  "audition",
];

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isKnownDawName(name: string, customKeywordsRaw?: string): boolean {
  const normalized = normalize(name);
  if (!normalized) return false;
  const custom = (customKeywordsRaw ?? getCustomKeywordsRaw())
    .split(",")
    .map((k) => normalize(k))
    .filter(Boolean);
  return [...DEFAULT_DAW_KEYWORDS, ...custom].some((keyword) => normalized.includes(keyword));
}

export async function getFrontmostAppName(): Promise<string | null> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const name = await invoke<string | null>("frontmost_app_name");
    return name ?? null;
  } catch {
    return null;
  }
}

export function getAutoTrackProjectId(): string | null {
  try {
    return localStorage.getItem(STORAGE_PROJECT_KEY);
  } catch {
    return null;
  }
}

export function setAutoTrackProjectId(projectId: string | null): void {
  try {
    if (projectId) localStorage.setItem(STORAGE_PROJECT_KEY, projectId);
    else localStorage.removeItem(STORAGE_PROJECT_KEY);
  } catch {
    // ignore — localStorage unavailable
  }
}

export function getCustomKeywordsRaw(): string {
  try {
    return localStorage.getItem(STORAGE_KEYWORDS_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setCustomKeywordsRaw(raw: string): void {
  try {
    localStorage.setItem(STORAGE_KEYWORDS_KEY, raw);
  } catch {
    // ignore
  }
}

export interface DawActiveEntry {
  projectId: string;
  entryId: string;
}

export function getStoredActiveEntry(): DawActiveEntry | null {
  try {
    const raw = localStorage.getItem(STORAGE_ACTIVE_ENTRY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DawActiveEntry;
    if (parsed?.projectId && parsed?.entryId) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function setStoredActiveEntry(entry: DawActiveEntry | null): void {
  try {
    if (entry) localStorage.setItem(STORAGE_ACTIVE_ENTRY_KEY, JSON.stringify(entry));
    else localStorage.removeItem(STORAGE_ACTIVE_ENTRY_KEY);
  } catch {
    // ignore
  }
}
