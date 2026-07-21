import { pickFiles } from "@/lib/filePicker";
import { createProject } from "./projectService";
import { createCustomer } from "./customerService";
import { importTasks } from "./taskService";
import { addTimeEntry } from "./timeTrackingService";
import { PROJECT_PRIORITIES, type ProjectPriority } from "@/models/types";

/** Counterpart of generateFullBackup in exportService: restores a
 *  backup JSON into the current account. Everything is created with
 *  NEW ids (old customer ids are remapped onto the new customers), so
 *  running an import twice creates duplicates rather than merging.
 *  Attachments and masters are not restorable — the backup only holds
 *  their URLs, the files themselves live in storage. */

interface BackupTask {
  title?: string;
  description?: string | null;
  isCompleted?: boolean;
  dueDate?: string | null;
  subtasks?: { title?: string; isCompleted?: boolean }[];
}

interface BackupTimeEntry {
  startTime?: string;
  durationMinutes?: number;
  description?: string;
}

interface BackupProject {
  name?: string;
  status?: string;
  priority?: string;
  projectType?: string;
  customerId?: string | null;
  customerName?: string | null;
  deadline?: string | null;
  bpm?: number | null;
  musicalKey?: string | null;
  workspaceLink?: string | null;
  referenceLink?: string | null;
  tasks?: BackupTask[];
  timeEntries?: BackupTimeEntry[];
}

interface BackupCustomer {
  id?: string;
  name?: string;
  email?: string;
  phone?: string;
  notes?: string;
  discord?: string;
  instagram?: string;
  spotify?: string;
  appleMusic?: string;
  clientMemory?: Record<string, string>;
  referenceTracks?: string[];
}

interface BackupFile {
  generatedAt?: string;
  projects?: BackupProject[];
  customers?: BackupCustomer[];
}

export interface BackupSummary {
  filePath: string;
  data: BackupFile;
  projectCount: number;
  customerCount: number;
  generatedAt: string | null;
}

/** Step 1: pick and parse a backup file, without importing anything yet. */
export async function pickBackupFile(): Promise<BackupSummary | null> {
  const selected = await pickFiles({
    multiple: false,
    accept: ".json",
    dialogFilters: [{ name: "Backup", extensions: ["json"] }],
  });
  const file = selected?.[0];
  if (!file) return null;

  const data = JSON.parse(new TextDecoder().decode(file.bytes)) as BackupFile;
  if (!Array.isArray(data.projects) && !Array.isArray(data.customers)) {
    throw new Error("Keine gültige Backup-Datei (projects/customers fehlen).");
  }
  return {
    filePath: file.name,
    data,
    projectCount: data.projects?.length ?? 0,
    customerCount: data.customers?.length ?? 0,
    generatedAt: data.generatedAt ?? null,
  };
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function parsePriority(value: string | undefined): ProjectPriority {
  return (PROJECT_PRIORITIES as readonly string[]).includes(value ?? "")
    ? (value as ProjectPriority)
    : "mittel";
}

/** Step 2: actually import. Returns counts of what was created. */
export async function importFullBackup(params: {
  userId: string;
  username: string;
  backup: BackupFile;
  onProgress?: (label: string) => void;
}): Promise<{ projects: number; customers: number }> {
  const { userId, username, backup, onProgress } = params;

  const customerIdMap = new Map<string, string>();
  let customersCreated = 0;
  for (const customer of backup.customers ?? []) {
    if (!customer.name?.trim()) continue;
    onProgress?.(`Kunde: ${customer.name}`);
    const newId = await createCustomer(userId, {
      name: customer.name.trim(),
      email: customer.email || undefined,
      phone: customer.phone || undefined,
      notes: customer.notes || undefined,
      discord: customer.discord || undefined,
      instagram: customer.instagram || undefined,
      spotify: customer.spotify || undefined,
      appleMusic: customer.appleMusic || undefined,
      clientMemory: customer.clientMemory ?? {},
      referenceTracks: customer.referenceTracks ?? [],
    });
    if (customer.id) customerIdMap.set(customer.id, newId);
    customersCreated++;
  }

  let projectsCreated = 0;
  for (const project of backup.projects ?? []) {
    if (!project.name?.trim()) continue;
    onProgress?.(`Projekt: ${project.name}`);
    const newProjectId = await createProject({
      userId,
      name: project.name.trim(),
      customerId: project.customerId ? (customerIdMap.get(project.customerId) ?? null) : null,
      customerName: project.customerName ?? null,
      projectType: project.projectType || "Mix",
      priority: parsePriority(project.priority),
      statusId: project.status || null,
      deadline: parseDate(project.deadline),
      workspaceLink: project.workspaceLink ?? null,
      referenceLink: project.referenceLink ?? null,
      bpm: project.bpm ?? null,
      musicalKey: project.musicalKey ?? null,
    });

    const tasks = (project.tasks ?? [])
      .filter((task) => task.title?.trim())
      .map((task) => ({
        title: task.title!,
        description: task.description ?? null,
        isCompleted: Boolean(task.isCompleted),
        dueDate: parseDate(task.dueDate),
        subtasks: (task.subtasks ?? [])
          .filter((sub) => sub.title?.trim())
          .map((sub) => ({ title: sub.title!, isCompleted: Boolean(sub.isCompleted) })),
      }));
    if (tasks.length > 0) await importTasks(newProjectId, tasks, userId);

    for (const entry of project.timeEntries ?? []) {
      const startTime = parseDate(entry.startTime);
      if (!startTime || !entry.durationMinutes) continue;
      await addTimeEntry({
        projectId: newProjectId,
        userId,
        username,
        description: entry.description ?? "",
        durationMinutes: entry.durationMinutes,
        startTime,
      });
    }
    projectsCreated++;
  }

  return { projects: projectsCreated, customers: customersCreated };
}
