import { Timestamp, type DocumentSnapshot } from "firebase/firestore";
import { getCurrentLanguageCode } from "@/i18n";

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

export function parseDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function parseStringMap(raw: unknown): Record<string, string> {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const parsed: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const k = String(key ?? "").trim();
    const v = String(value ?? "").trim();
    if (k && v) parsed[k] = v;
  }
  return parsed;
}

export function parseStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => String(item ?? "")).filter((item) => item.length > 0);
}

type DocData = Record<string, unknown>;

function docData(doc: DocumentSnapshot): DocData {
  return (doc.data() as DocData | undefined) ?? {};
}

// ─────────────────────────────────────────────────────────────────
// Project enums (values kept identical to the Flutter app)
// ─────────────────────────────────────────────────────────────────

export type ProjectPriority = "niedrig" | "mittel" | "hoch" | "dringend";

export const PROJECT_PRIORITIES: ProjectPriority[] = [
  "niedrig",
  "mittel",
  "hoch",
  "dringend",
];

const PRIORITY_LABELS: Record<ProjectPriority, Record<string, string>> = {
  niedrig: { de: "Niedrig", en: "Low", ru: "Низкий", tr: "Dusuk", fr: "Faible", es: "Baja" },
  mittel: { de: "Mittel", en: "Medium", ru: "Средний", tr: "Orta", fr: "Moyen", es: "Media" },
  hoch: { de: "Hoch", en: "High", ru: "Высокий", tr: "Yuksek", fr: "Eleve", es: "Alta" },
  dringend: { de: "Dringend", en: "Urgent", ru: "Срочно", tr: "Acil", fr: "Urgent", es: "Urgente" },
};

export function priorityLabel(priority: ProjectPriority): string {
  const lang = getCurrentLanguageCode();
  return PRIORITY_LABELS[priority][lang] ?? PRIORITY_LABELS[priority].de;
}

export function priorityColor(priority: ProjectPriority): string {
  switch (priority) {
    case "niedrig":
      return "#22C55E";
    case "mittel":
      return "#EAB308";
    case "hoch":
      return "#F97316";
    case "dringend":
      return "#EF4444";
  }
}

export function priorityFromString(value: string | undefined | null): ProjectPriority {
  const normalized = (value ?? "").toLowerCase();
  return (PROJECT_PRIORITIES as string[]).includes(normalized)
    ? (normalized as ProjectPriority)
    : "mittel";
}

export type CoreProjectStatus = "neu" | "in_bearbeitung" | "review" | "abgeschlossen";

export const CORE_STATUS_IDS: CoreProjectStatus[] = [
  "neu",
  "in_bearbeitung",
  "review",
  "abgeschlossen",
];

const STATUS_LABELS: Record<CoreProjectStatus, Record<string, string>> = {
  neu: { de: "Neu", en: "New", ru: "Новый", tr: "Yeni", fr: "Nouveau", es: "Nuevo" },
  in_bearbeitung: {
    de: "In Bearbeitung",
    en: "In progress",
    ru: "В работе",
    tr: "Islemde",
    fr: "En cours",
    es: "En progreso",
  },
  review: { de: "Review", en: "Review", ru: "Проверка", tr: "Inceleme", fr: "Revision", es: "Revision" },
  abgeschlossen: {
    de: "Abgeschlossen",
    en: "Completed",
    ru: "Завершено",
    tr: "Tamamlandi",
    fr: "Termine",
    es: "Completado",
  },
};

export function coreStatusLabel(status: CoreProjectStatus): string {
  const lang = getCurrentLanguageCode();
  return STATUS_LABELS[status][lang] ?? STATUS_LABELS[status].de;
}

export function coreStatusFromString(value: string | undefined | null): CoreProjectStatus {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "inbearbeitung") return "in_bearbeitung";
  return (CORE_STATUS_IDS as string[]).includes(normalized)
    ? (normalized as CoreProjectStatus)
    : "neu";
}

// ─────────────────────────────────────────────────────────────────
// UserModel
// ─────────────────────────────────────────────────────────────────

export interface UserModel {
  id: string;
  email: string;
  username: string;
  role: string;
  plan: string;
  preferredLanguageCode: string;
  isActive: boolean;
  locked: boolean;
  isOnline: boolean;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: Date;
  lastLogin: Date | null;
  lastSeenAt: Date | null;
}

export function userFromMap(data: DocData): UserModel {
  const rawRole = String(data.role ?? "user").trim().toLowerCase();
  const storedPlan = String(data.plan ?? "").trim().toLowerCase();
  const normalizedPlan = storedPlan === "vip" || rawRole === "vip" ? "vip" : "free";

  return {
    id: String(data.id ?? ""),
    email: String(data.email ?? ""),
    username: String(data.username ?? ""),
    role: rawRole,
    plan: normalizedPlan,
    preferredLanguageCode: String(data.preferredLanguageCode ?? "en").toLowerCase(),
    isActive: Boolean(data.isActive ?? false),
    locked: Boolean(data.locked ?? false),
    isOnline: Boolean(data.isOnline ?? false),
    avatarUrl: (data.avatarUrl as string | undefined) ?? null,
    bio: (data.bio as string | undefined) ?? null,
    createdAt: parseDate(data.createdAt) ?? new Date(),
    lastLogin: parseDate(data.lastLogin) ?? parseDate(data.lastLoginAt),
    lastSeenAt: parseDate(data.lastSeenAt) ?? parseDate(data.presenceUpdatedAt),
  };
}

export function userFromDocument(doc: DocumentSnapshot): UserModel {
  return userFromMap({ ...docData(doc), id: doc.id });
}

export const userHelpers = {
  canAccessApp: (u: UserModel) => u.isActive && !u.locked,
  isAdmin: (u: UserModel) => u.role === "admin",
  isVip: (u: UserModel) => u.plan === "vip",
  isFree: (u: UserModel) => u.plan === "free",
  canUsePremiumStorage: (u: UserModel) => u.role === "admin" || u.plan === "vip",
};

// ─────────────────────────────────────────────────────────────────
// ProjectModel
// ─────────────────────────────────────────────────────────────────

export interface ProjectModel {
  id: string;
  name: string;
  customerId: string | null;
  customerName: string | null;
  projectType: string;
  priority: ProjectPriority;
  status: CoreProjectStatus;
  statusValue: string;
  deadline: Date | null;
  notifyBeforeMinutes: number;
  workspaceLink: string | null;
  attachments: string[];
  attachmentNames: Record<string, string>;
  sharedWith: string[];
  memberRoles: Record<string, string>;
  referenceLink: string | null;
  referenceFileUrl: string | null;
  referenceFileName: string | null;
  bpm: number | null;
  musicalKey: string | null;
  dawProjectPath: string | null;
  category: string | null;
  contentKey: string | null;
  encryptionVersion: number | null;
  customField1: string | null;
  customField2: string | null;
  customField3: string | null;
  customField4: string | null;
  customField5: string | null;
  ownerId: string;
  ownerName: string | null;
  createdAt: Date;
  updatedAt: Date;
  isFavorite: boolean;
}

export function projectFromMap(data: DocData): ProjectModel {
  const rawStatus = String(data.status ?? "neu").trim().toLowerCase();
  return {
    id: String(data.id ?? ""),
    name: String(data.name ?? ""),
    customerId: (data.customerId as string | undefined) ?? null,
    customerName: (data.customerName as string | undefined) ?? null,
    projectType: String(data.projectType ?? "Mix & Master"),
    priority: priorityFromString(data.priority as string | undefined),
    status: coreStatusFromString(rawStatus),
    statusValue: rawStatus,
    deadline: parseDate(data.deadline),
    notifyBeforeMinutes: Number(data.notifyBeforeMinutes ?? 60),
    workspaceLink: (data.workspaceLink as string | undefined) ?? null,
    attachments: parseStringList(data.attachments),
    attachmentNames: parseStringMap(data.attachmentNames),
    sharedWith: parseStringList(data.sharedWith),
    memberRoles: parseStringMap(data.memberRoles),
    referenceLink: (data.referenceLink as string | undefined) ?? null,
    referenceFileUrl: (data.referenceFileUrl as string | undefined) ?? null,
    referenceFileName: (data.referenceFileName as string | undefined) ?? null,
    bpm: typeof data.bpm === "number" ? data.bpm : null,
    musicalKey: (data.musicalKey as string | undefined) ?? null,
    dawProjectPath: (data.dawProjectPath as string | undefined) ?? null,
    category: (data.category as string | undefined) ?? null,
    contentKey: (data.contentKey as string | undefined) ?? null,
    encryptionVersion:
      typeof data.encryptionVersion === "number" ? data.encryptionVersion : null,
    customField1: (data.customField1 as string | undefined) ?? null,
    customField2: (data.customField2 as string | undefined) ?? null,
    customField3: (data.customField3 as string | undefined) ?? null,
    customField4: (data.customField4 as string | undefined) ?? null,
    customField5: (data.customField5 as string | undefined) ?? null,
    ownerId: String(data.ownerId ?? ""),
    ownerName: (data.ownerName as string | undefined) ?? null,
    createdAt: parseDate(data.createdAt) ?? new Date(),
    updatedAt: parseDate(data.updatedAt) ?? new Date(),
    isFavorite: Boolean(data.isFavorite ?? false),
  };
}

export function projectFromDocument(doc: DocumentSnapshot): ProjectModel {
  return projectFromMap({ ...docData(doc), id: doc.id });
}

export function isProjectOverdue(project: ProjectModel): boolean {
  if (!project.deadline) return false;
  return Date.now() > project.deadline.getTime();
}

// ─────────────────────────────────────────────────────────────────
// CustomerModel
// ─────────────────────────────────────────────────────────────────

export interface CustomerModel {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
  discord: string | null;
  instagram: string | null;
  spotify: string | null;
  appleMusic: string | null;
  clientMemory: Record<string, string>;
  referenceTracks: string[];
  ownerId: string;
  createdAt: Date;
}

export function customerFromMap(data: DocData): CustomerModel {
  return {
    id: String(data.id ?? ""),
    name: String(data.name ?? ""),
    email: (data.email as string | undefined) ?? null,
    phone: (data.phone as string | undefined) ?? null,
    notes: (data.notes as string | undefined) ?? null,
    discord: (data.discord as string | undefined) ?? null,
    instagram: (data.instagram as string | undefined) ?? null,
    spotify: (data.spotify as string | undefined) ?? null,
    appleMusic: (data.appleMusic as string | undefined) ?? null,
    clientMemory: parseStringMap(data.clientMemory),
    referenceTracks: parseStringList(data.referenceTracks),
    ownerId: String(data.ownerId ?? ""),
    createdAt: parseDate(data.createdAt) ?? new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────
// TaskModel + Subtask
// ─────────────────────────────────────────────────────────────────

export interface Subtask {
  id: string;
  title: string;
  isCompleted: boolean;
  createdAt: Date;
}

export interface TaskModel {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  isCompleted: boolean;
  createdAt: Date;
  completedAt: Date | null;
  dueDate: Date | null;
  createdBy: string | null;
  subtasks: Subtask[];
  order: number;
}

export function taskFromMap(data: DocData): TaskModel {
  const subtasksData = (data.subtasks as Record<string, DocData> | undefined) ?? {};
  const subtasks: Subtask[] = Object.entries(subtasksData).map(([id, sub]) => ({
    id,
    title: String(sub?.title ?? ""),
    isCompleted: Boolean(sub?.isCompleted ?? false),
    createdAt: parseDate(sub?.createdAt) ?? new Date(),
  }));
  subtasks.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return {
    id: String(data.id ?? ""),
    projectId: String(data.projectId ?? ""),
    title: String(data.title ?? ""),
    description: (data.description as string | undefined) ?? null,
    isCompleted: Boolean(data.isCompleted ?? false),
    createdAt: parseDate(data.createdAt) ?? new Date(),
    completedAt: parseDate(data.completedAt),
    dueDate: parseDate(data.dueDate),
    createdBy: (data.createdBy as string | undefined) ?? null,
    subtasks,
    order: Number(data.order ?? 0),
  };
}

// ─────────────────────────────────────────────────────────────────
// ChatMessageModel
// ─────────────────────────────────────────────────────────────────

export interface ChatMessageModel {
  id: string;
  projectId: string;
  userId: string;
  username: string;
  userAvatarUrl: string | null;
  message: string;
  timestamp: Date;
}

export function chatMessageFromMap(id: string, data: DocData): ChatMessageModel {
  return {
    id,
    projectId: String(data.projectId ?? ""),
    userId: String(data.userId ?? ""),
    username: String(data.username ?? "Unbekannt"),
    userAvatarUrl: (data.userAvatarUrl as string | undefined) ?? null,
    message: String(data.message ?? ""),
    timestamp: parseDate(data.timestamp) ?? new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────
// CommentModel
// ─────────────────────────────────────────────────────────────────

export interface CommentModel {
  id: string;
  taskId: string;
  projectId: string;
  userId: string;
  username: string;
  userAvatarUrl: string | null;
  content: string;
  createdAt: Date;
}

export function commentFromDocument(doc: DocumentSnapshot): CommentModel {
  const data = docData(doc);
  return {
    id: doc.id,
    taskId: String(data.taskId ?? ""),
    projectId: String(data.projectId ?? ""),
    userId: String(data.userId ?? ""),
    username: String(data.username ?? ""),
    userAvatarUrl: (data.userAvatarUrl as string | undefined) ?? null,
    content: String(data.content ?? ""),
    createdAt: parseDate(data.createdAt) ?? new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────
// TimeEntryModel
// ─────────────────────────────────────────────────────────────────

export interface TimeEntryModel {
  id: string;
  projectId: string;
  taskId: string | null;
  userId: string;
  username: string;
  description: string;
  durationMinutes: number;
  startTime: Date;
  endTime: Date | null;
  createdAt: Date;
}

export function timeEntryFromMap(id: string, data: DocData): TimeEntryModel {
  return {
    id,
    projectId: String(data.projectId ?? ""),
    taskId: (data.taskId as string | undefined) ?? null,
    userId: String(data.userId ?? ""),
    username: String(data.username ?? ""),
    description: String(data.description ?? ""),
    durationMinutes: Number(data.durationMinutes ?? 0),
    startTime: parseDate(data.startTime) ?? new Date(),
    endTime: parseDate(data.endTime),
    createdAt: parseDate(data.createdAt) ?? new Date(),
  };
}

export function formatDuration(durationMinutes: number): string {
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

// ─────────────────────────────────────────────────────────────────
// NotificationModel
// ─────────────────────────────────────────────────────────────────

export interface NotificationModel {
  id: string;
  title: string;
  message: string;
  senderId: string;
  senderName: string | null;
  type: string;
  priority: number;
  targetUserId: string | null;
  targetUserIds: string[];
  projectId: string | null;
  readBy: string[];
  createdAt: Date;
  isRead: boolean;
}

export function notificationFromDocument(doc: DocumentSnapshot): NotificationModel {
  const data = docData(doc);
  return {
    id: doc.id,
    title: String(data.title ?? ""),
    message: String(data.message ?? ""),
    senderId: String(data.senderId ?? ""),
    senderName: (data.senderName as string | undefined) ?? null,
    type: String(data.type ?? "system"),
    priority: Number(data.priority ?? 0),
    targetUserId: (data.targetUserId as string | undefined) ?? null,
    targetUserIds: parseStringList(data.targetUserIds),
    projectId: (data.projectId as string | undefined) ?? null,
    readBy: parseStringList(data.readBy),
    createdAt: parseDate(data.createdAt) ?? new Date(),
    isRead: Boolean(data.isRead ?? false),
  };
}

export function isNotificationActionable(n: NotificationModel): boolean {
  return n.type === "invitation" || n.type === "deadline";
}

export function isNotificationReadForUser(n: NotificationModel, userId: string): boolean {
  return n.isRead || n.readBy.includes(userId);
}

// ─────────────────────────────────────────────────────────────────
// NotificationPreferences
// ─────────────────────────────────────────────────────────────────

export interface NotificationPreferences {
  enabled: boolean;
  projectUpdatesEnabled: boolean;
  invitationsEnabled: boolean;
  deadlinesEnabled: boolean;
  systemEnabled: boolean;
  chatEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStartHour: number;
  quietHoursEndHour: number;
  intelligentSortingEnabled: boolean;
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  projectUpdatesEnabled: true,
  invitationsEnabled: true,
  deadlinesEnabled: true,
  systemEnabled: true,
  chatEnabled: true,
  quietHoursEnabled: false,
  quietHoursStartHour: 22,
  quietHoursEndHour: 7,
  intelligentSortingEnabled: true,
};

export function notificationPreferencesFromMap(map: DocData): NotificationPreferences {
  const d = DEFAULT_NOTIFICATION_PREFERENCES;
  return {
    enabled: Boolean(map.enabled ?? d.enabled),
    projectUpdatesEnabled: Boolean(map.projectUpdatesEnabled ?? d.projectUpdatesEnabled),
    invitationsEnabled: Boolean(map.invitationsEnabled ?? d.invitationsEnabled),
    deadlinesEnabled: Boolean(map.deadlinesEnabled ?? d.deadlinesEnabled),
    systemEnabled: Boolean(map.systemEnabled ?? d.systemEnabled),
    chatEnabled: Boolean(map.chatEnabled ?? d.chatEnabled),
    quietHoursEnabled: Boolean(map.quietHoursEnabled ?? d.quietHoursEnabled),
    quietHoursStartHour: Number(map.quietHoursStartHour ?? d.quietHoursStartHour),
    quietHoursEndHour: Number(map.quietHoursEndHour ?? d.quietHoursEndHour),
    intelligentSortingEnabled: Boolean(
      map.intelligentSortingEnabled ?? d.intelligentSortingEnabled
    ),
  };
}

export function isNotificationTypeEnabled(
  prefs: NotificationPreferences,
  type: string
): boolean {
  if (!prefs.enabled) return false;
  switch (type) {
    case "project_update":
      return prefs.projectUpdatesEnabled;
    case "invitation":
      return prefs.invitationsEnabled;
    case "deadline":
      return prefs.deadlinesEnabled;
    case "chat":
    case "chat_message":
      return prefs.chatEnabled;
    case "system":
    default:
      return prefs.systemEnabled;
  }
}

export function isInQuietHours(prefs: NotificationPreferences, timestamp: Date): boolean {
  if (!prefs.quietHoursEnabled) return false;
  const hour = timestamp.getHours();
  if (prefs.quietHoursStartHour === prefs.quietHoursEndHour) return true;
  if (prefs.quietHoursStartHour < prefs.quietHoursEndHour) {
    return hour >= prefs.quietHoursStartHour && hour < prefs.quietHoursEndHour;
  }
  return hour >= prefs.quietHoursStartHour || hour < prefs.quietHoursEndHour;
}

// ─────────────────────────────────────────────────────────────────
// InvitationModel (project_invitations collection)
// ─────────────────────────────────────────────────────────────────

export interface InvitationModel {
  id: string;
  projectId: string;
  projectName: string;
  ownerId: string;
  ownerName: string;
  inviterId: string;
  inviterName: string | null;
  invitedUserId: string;
  invitedUserName: string | null;
  status: string;
  createdAt: Date;
  respondedAt: Date | null;
}

export function invitationFromDocument(doc: DocumentSnapshot): InvitationModel {
  const data = docData(doc);
  return {
    id: doc.id,
    projectId: String(data.projectId ?? ""),
    projectName: String(data.projectName ?? ""),
    ownerId: String(data.ownerId ?? ""),
    ownerName: String(data.ownerName ?? ""),
    inviterId: String(data.inviterId ?? data.ownerId ?? ""),
    inviterName: (data.inviterName as string | undefined) ?? null,
    invitedUserId: String(data.invitedUserId ?? ""),
    invitedUserName: (data.invitedUserName as string | undefined) ?? null,
    status: String(data.status ?? "pending"),
    createdAt: parseDate(data.createdAt) ?? new Date(),
    respondedAt: parseDate(data.respondedAt),
  };
}

// ─────────────────────────────────────────────────────────────────
// MasterVersionModel
// ─────────────────────────────────────────────────────────────────

export interface MasterVersionModel {
  id: string;
  projectId: string;
  versionName: string;
  originalFileName: string;
  fileUrl: string;
  storagePath: string;
  mimeType: string;
  fileSize: number;
  iv: string;
  fileKey: string;
  encrypted: boolean;
  createdBy: string;
  createdAt: Date;
}

export function masterVersionFromDocument(doc: DocumentSnapshot): MasterVersionModel {
  const data = docData(doc);
  return {
    id: doc.id,
    projectId: String(data.projectId ?? ""),
    versionName: String(data.versionName ?? ""),
    originalFileName: String(data.originalFileName ?? ""),
    fileUrl: String(data.fileUrl ?? ""),
    storagePath: String(data.storagePath ?? ""),
    mimeType: String(data.mimeType ?? "audio/mpeg"),
    fileSize: Number(data.fileSize ?? 0),
    iv: String(data.iv ?? ""),
    fileKey: String(data.fileKey ?? ""),
    encrypted: Boolean(data.encrypted ?? true),
    createdBy: String(data.createdBy ?? ""),
    createdAt: parseDate(data.createdAt) ?? new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────
// ProjectHistoryEntry
// ─────────────────────────────────────────────────────────────────

export interface ProjectHistoryEntry {
  id: string;
  userId: string;
  userName: string;
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  timestamp: Date;
}

export function historyEntryFromMap(map: DocData): ProjectHistoryEntry {
  return {
    id: String(map.id ?? ""),
    userId: String(map.userId ?? ""),
    userName: String(map.userName ?? ""),
    action: String(map.action ?? ""),
    fieldName: (map.fieldName as string | undefined) ?? null,
    oldValue: (map.oldValue as string | undefined) ?? null,
    newValue: (map.newValue as string | undefined) ?? null,
    timestamp: parseDate(map.timestamp) ?? new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────
// ProjectTemplateModel
// ─────────────────────────────────────────────────────────────────

export interface ProjectTemplateModel {
  id: string;
  name: string;
  description: string | null;
  projectType: string | null;
  priority: string | null;
  customerName: string | null;
  notes: string | null;
  createdAt: Date;
}

export function templateFromMap(id: string, data: DocData): ProjectTemplateModel {
  return {
    id,
    name: String(data.name ?? ""),
    description: (data.description as string | undefined) ?? null,
    projectType: (data.projectType as string | undefined) ?? null,
    priority: (data.priority as string | undefined) ?? null,
    customerName: (data.customerName as string | undefined) ?? null,
    notes: (data.notes as string | undefined) ?? null,
    createdAt: parseDate(data.createdAt) ?? new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────
// ProjectTypeModel
// ─────────────────────────────────────────────────────────────────

export interface ProjectTypeModel {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  ownerId: string;
  createdAt: Date;
}

export function projectTypeFromDocument(doc: DocumentSnapshot): ProjectTypeModel {
  const data = docData(doc);
  return {
    id: doc.id,
    name: String(data.name ?? ""),
    color: String(data.color ?? "#6366F1"),
    isDefault: Boolean(data.isDefault ?? false),
    ownerId: String(data.ownerId ?? ""),
    createdAt: parseDate(data.createdAt) ?? new Date(),
  };
}

export function defaultProjectTypes(ownerId: string): ProjectTypeModel[] {
  const now = new Date();
  return [
    { id: "default_mix", name: "Mix", color: "#8B5CF6", isDefault: true, ownerId, createdAt: now },
    { id: "default_master", name: "Master", color: "#EC4899", isDefault: true, ownerId, createdAt: now },
    {
      id: "default_mix_master",
      name: "Mix & Master",
      color: "#6366F1",
      isDefault: true,
      ownerId,
      createdAt: now,
    },
  ];
}

// ─────────────────────────────────────────────────────────────────
// CustomStatus / ProjectCategory / CustomFieldsConfig
// ─────────────────────────────────────────────────────────────────

export interface CustomStatus {
  id: string;
  name: string;
  colorValue: number;
  iconName: string | null;
  sortOrder: number;
  isDefault: boolean;
  createdAt: number; // ms epoch — matches Flutter storage format
}

export function customStatusFromMap(map: DocData): CustomStatus {
  const created = parseDate(map.createdAt);
  return {
    id: String(map.id ?? ""),
    name: String(map.name ?? ""),
    colorValue: Number(map.colorValue ?? 0xff8b5cf6),
    iconName: (map.iconName as string | undefined) ?? null,
    sortOrder: Number(map.sortOrder ?? 0),
    isDefault: Boolean(map.isDefault ?? false),
    createdAt: created ? created.getTime() : Date.now(),
  };
}

export function customStatusToMap(status: CustomStatus): DocData {
  return {
    id: status.id,
    name: status.name,
    colorValue: status.colorValue,
    iconName: status.iconName,
    sortOrder: status.sortOrder,
    isDefault: status.isDefault,
    createdAt: status.createdAt,
  };
}

/** ARGB int (Flutter) → CSS hex color */
export function colorValueToCss(colorValue: number): string {
  const rgb = colorValue & 0xffffff;
  return `#${rgb.toString(16).padStart(6, "0")}`;
}

/** CSS hex color → ARGB int with full alpha (Flutter format) */
export function cssToColorValue(hex: string): number {
  const cleaned = hex.replace("#", "").slice(0, 6);
  const rgb = parseInt(cleaned.padEnd(6, "0"), 16);
  return (0xff000000 + rgb) >>> 0;
}

export interface CustomFieldsConfig {
  field1Name: string;
  field2Name: string;
  field3Name: string;
  field4Name: string;
  field5Name: string;
  field1Enabled: boolean;
  field2Enabled: boolean;
  field3Enabled: boolean;
  field4Enabled: boolean;
  field5Enabled: boolean;
}

export const DEFAULT_CUSTOM_FIELDS_CONFIG: CustomFieldsConfig = {
  field1Name: "Custom 1",
  field2Name: "Custom 2",
  field3Name: "Custom 3",
  field4Name: "Custom 4",
  field5Name: "Custom 5",
  field1Enabled: false,
  field2Enabled: false,
  field3Enabled: false,
  field4Enabled: false,
  field5Enabled: false,
};

// ─────────────────────────────────────────────────────────────────
// Master share / customer upload public links
// ─────────────────────────────────────────────────────────────────

export interface PublicMasterShare {
  token: string;
  isActive: boolean;
  allowDownload: boolean;
  hasPassword: boolean;
  expiresAt: Date | null;
  baseUrl: string;
  url: string;
}

export function isShareExpired(share: PublicMasterShare): boolean {
  return share.expiresAt !== null && share.expiresAt.getTime() <= Date.now();
}

export interface PublicCustomerUploadLink {
  token: string;
  isActive: boolean;
  hasPassword: boolean;
  baseUrl: string;
  url: string;
}

export interface MasterShareFeedback {
  id: string;
  projectId: string;
  kind: string;
  authorName: string;
  message: string;
  versionId: string;
  versionName: string;
  timeSeconds: number | null;
  timeLabel: string | null;
  taskTitles: string[];
  createdTaskCount: number;
  createdAt: Date;
}

export function masterFeedbackFromDocument(doc: DocumentSnapshot): MasterShareFeedback {
  const data = docData(doc);
  return {
    id: doc.id,
    projectId: String(data.projectId ?? ""),
    kind: String(data.kind ?? "feedback"),
    authorName: String(data.authorName ?? "Kunde"),
    message: String(data.message ?? ""),
    versionId: String(data.versionId ?? ""),
    versionName: String(data.versionName ?? ""),
    timeSeconds: typeof data.timeSeconds === "number" ? data.timeSeconds : null,
    timeLabel: (data.timeLabel as string | undefined) ?? null,
    taskTitles: parseStringList(data.taskTitles),
    createdTaskCount: Number(data.createdTaskCount ?? 0),
    createdAt: parseDate(data.createdAt) ?? new Date(),
  };
}

// ─────────────────────────────────────────────────────────────────
// Misc helpers
// ─────────────────────────────────────────────────────────────────

export function formatFileSize(fileSize: number): string {
  if (fileSize < 1024) return `${fileSize} B`;
  if (fileSize < 1024 * 1024) return `${(fileSize / 1024).toFixed(1)} KB`;
  if (fileSize < 1024 * 1024 * 1024) return `${(fileSize / (1024 * 1024)).toFixed(1)} MB`;
  return `${(fileSize / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
