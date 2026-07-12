import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, type Unsubscribe } from "firebase/firestore";
import { db } from "@/firebase";
import {
  customStatusFromMap,
  customStatusToMap,
  DEFAULT_CUSTOM_FIELDS_CONFIG,
  type CustomStatus,
  type CustomFieldsConfig,
} from "@/models/types";
import { coreStatusLabel, type CoreProjectStatus } from "@/models/types";

/** Port of customization_service.dart + status_workflow_service.dart.
 *  Local persistence uses localStorage; status workflow syncs to
 *  users/{uid}.statusWorkflow like the original app. */

const STATUSES_KEY = "custom_statuses";
const FIELDS_CONFIG_KEY = "custom_fields_config";
const STATUS_WORKFLOW_FIELD = "statusWorkflow";

export const DEFAULT_STATUS_ID = "neu";
export const IN_PROGRESS_STATUS_ID = "in_bearbeitung";
export const REVIEW_STATUS_ID = "review";
export const COMPLETED_STATUS_ID = "abgeschlossen";

export function defaultStatuses(): CustomStatus[] {
  const now = Date.now();
  return [
    { id: "neu", name: "Neu", colorValue: 0xff3b82f6, iconName: null, sortOrder: 0, isDefault: true, createdAt: now },
    { id: "in_bearbeitung", name: "In Bearbeitung", colorValue: 0xfff59e0b, iconName: null, sortOrder: 1, isDefault: true, createdAt: now },
    { id: "review", name: "Review", colorValue: 0xff8b5cf6, iconName: null, sortOrder: 2, isDefault: true, createdAt: now },
    { id: "abgeschlossen", name: "Abgeschlossen", colorValue: 0xff22c55e, iconName: null, sortOrder: 3, isDefault: true, createdAt: now },
  ];
}

export function isCompletedStatus(statusId: string): boolean {
  return statusId.trim().toLowerCase() === COMPLETED_STATUS_ID;
}

function isCoreStatusId(statusId: string): boolean {
  return (
    statusId === DEFAULT_STATUS_ID ||
    statusId === IN_PROGRESS_STATUS_ID ||
    statusId === REVIEW_STATUS_ID ||
    statusId === COMPLETED_STATUS_ID
  );
}

// ── Local storage layer (CustomizationService) ──────────────────

export function getLocalCustomStatuses(userId: string): CustomStatus[] {
  try {
    const json = localStorage.getItem(`${userId}_${STATUSES_KEY}`);
    if (json) {
      const list = JSON.parse(json) as Record<string, unknown>[];
      return list.map(customStatusFromMap);
    }
  } catch {
    // fall through
  }
  return defaultStatuses();
}

export function saveLocalCustomStatuses(userId: string, statuses: CustomStatus[]): void {
  try {
    localStorage.setItem(
      `${userId}_${STATUSES_KEY}`,
      JSON.stringify(statuses.map(customStatusToMap))
    );
  } catch {
    // ignore
  }
}

export function getCustomFieldsConfig(userId: string): CustomFieldsConfig {
  try {
    const json = localStorage.getItem(`${userId}_${FIELDS_CONFIG_KEY}`);
    if (json) {
      return { ...DEFAULT_CUSTOM_FIELDS_CONFIG, ...(JSON.parse(json) as Partial<CustomFieldsConfig>) };
    }
  } catch {
    // fall through
  }
  return { ...DEFAULT_CUSTOM_FIELDS_CONFIG };
}

export function saveCustomFieldsConfig(userId: string, config: CustomFieldsConfig): void {
  try {
    localStorage.setItem(`${userId}_${FIELDS_CONFIG_KEY}`, JSON.stringify(config));
  } catch {
    // ignore
  }
}

// ── Status workflow (cloud-synced) ──────────────────────────────

export function normalizeStatuses(statuses: CustomStatus[]): CustomStatus[] {
  const source = statuses.length === 0 ? defaultStatuses() : statuses;
  const deduplicated = new Map<string, CustomStatus>();

  for (const rawStatus of source) {
    const id = rawStatus.id.trim().toLowerCase();
    const name = rawStatus.name.trim();
    if (!id || !name) continue;
    deduplicated.set(id, { ...rawStatus, id, name });
  }

  if (deduplicated.size === 0) return defaultStatuses();

  const sorted = [...deduplicated.values()].sort((a, b) => {
    const byOrder = a.sortOrder - b.sortOrder;
    if (byOrder !== 0) return byOrder;
    return a.createdAt - b.createdAt;
  });

  return sorted.map((status, index) => ({ ...status, sortOrder: index }));
}

function parseCloudStatuses(raw: unknown): CustomStatus[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map(customStatusFromMap);
}

export async function getStatuses(userId: string): Promise<CustomStatus[]> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return defaultStatuses();

  const localStatuses = getLocalCustomStatuses(normalizedUserId);
  let remoteStatuses: CustomStatus[] = [];
  try {
    const snapshot = await getDoc(doc(db, "users", normalizedUserId));
    remoteStatuses = parseCloudStatuses(snapshot.data()?.[STATUS_WORKFLOW_FIELD]);
  } catch {
    // offline — use local
  }

  const selected =
    remoteStatuses.length > 0
      ? normalizeStatuses(remoteStatuses)
      : normalizeStatuses(localStatuses);

  saveLocalCustomStatuses(normalizedUserId, selected);
  if (remoteStatuses.length === 0) {
    void saveStatusesToCloud(normalizedUserId, selected);
  }
  return selected;
}

export function watchStatuses(
  userId: string,
  onChange: (statuses: CustomStatus[]) => void
): Unsubscribe {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    onChange(defaultStatuses());
    return () => {};
  }
  return onSnapshot(doc(db, "users", normalizedUserId), (snapshot) => {
    const remoteStatuses = parseCloudStatuses(snapshot.data()?.[STATUS_WORKFLOW_FIELD]);
    if (remoteStatuses.length > 0) {
      const normalized = normalizeStatuses(remoteStatuses);
      saveLocalCustomStatuses(normalizedUserId, normalized);
      onChange(normalized);
    } else {
      onChange(normalizeStatuses(getLocalCustomStatuses(normalizedUserId)));
    }
  });
}

async function saveStatusesToCloud(userId: string, statuses: CustomStatus[]): Promise<void> {
  try {
    await setDoc(
      doc(db, "users", userId),
      {
        [STATUS_WORKFLOW_FIELD]: statuses.map(customStatusToMap),
        statusWorkflowUpdatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch {
    // best-effort
  }
}

export async function saveStatuses(
  userId: string,
  statuses: CustomStatus[]
): Promise<void> {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) return;
  const normalized = normalizeStatuses(statuses);
  saveLocalCustomStatuses(normalizedUserId, normalized);
  await saveStatusesToCloud(normalizedUserId, normalized);
}

// ── Lookup helpers (port of StatusWorkflowService statics) ──────

function fallbackLabel(statusId: string): string {
  const normalized = statusId.trim().replaceAll("_", " ");
  if (!normalized) return "Status";
  return normalized
    .split(" ")
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(" ");
}

export function labelForStatusId(statusId: string, statuses: CustomStatus[]): string {
  const normalizedId = statusId.trim().toLowerCase();
  if (!normalizedId) return fallbackLabel(DEFAULT_STATUS_ID);

  const matched = statuses.find((status) => status.id === normalizedId);
  if (matched) {
    if (matched.isDefault && isCoreStatusId(normalizedId)) {
      return coreStatusLabel(normalizedId as CoreProjectStatus);
    }
    if (matched.name.trim()) return matched.name.trim();
  }
  if (isCoreStatusId(normalizedId)) {
    return coreStatusLabel(normalizedId as CoreProjectStatus);
  }
  return fallbackLabel(normalizedId);
}

export function colorForStatusId(statusId: string, statuses: CustomStatus[]): string {
  const normalizedId = statusId.trim().toLowerCase();
  const matched = statuses.find((status) => status.id === normalizedId);
  if (matched) {
    const rgb = matched.colorValue & 0xffffff;
    return `#${rgb.toString(16).padStart(6, "0")}`;
  }
  switch (normalizedId) {
    case IN_PROGRESS_STATUS_ID:
      return "#F59E0B";
    case REVIEW_STATUS_ID:
      return "#8B5CF6";
    case COMPLETED_STATUS_ID:
      return "#22C55E";
    default:
      return "#3B82F6";
  }
}

export function sortOrderForStatusId(statusId: string, statuses: CustomStatus[]): number {
  const normalizedId = statusId.trim().toLowerCase();
  const index = statuses.findIndex((status) => status.id === normalizedId);
  return index >= 0 ? index : statuses.length + 100;
}

export function createStatusId(rawName: string, existing: CustomStatus[]): string {
  const normalizedName = rawName.trim().toLowerCase();
  const base = normalizedName
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  const safeBase = base || "status";
  const existingIds = new Set(existing.map((status) => status.id));
  if (!existingIds.has(safeBase)) return safeBase;
  let suffix = 2;
  while (existingIds.has(`${safeBase}_${suffix}`)) suffix++;
  return `${safeBase}_${suffix}`;
}

export function normalizeLegacyFilterStatus(value: string): string {
  const normalized = value.trim();
  switch (normalized) {
    case "neu":
      return DEFAULT_STATUS_ID;
    case "inBearbeitung":
    case "in_bearbeitung":
      return IN_PROGRESS_STATUS_ID;
    case "review":
      return REVIEW_STATUS_ID;
    case "abgeschlossen":
      return COMPLETED_STATUS_ID;
    default:
      return normalized.toLowerCase();
  }
}
