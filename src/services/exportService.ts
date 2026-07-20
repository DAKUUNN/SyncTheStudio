import { save, open as openDialog } from "@tauri-apps/plugin-dialog";
import { writeTextFile, writeFile, mkdir, copyFile, readDir, exists } from "@tauri-apps/plugin-fs";
import { fetchBytes } from "@/lib/download";
import { getProjects, getProjectHistory } from "./projectService";
import { getCustomers } from "./customerService";
import { getTasks } from "./taskService";
import { getTimeEntries } from "./timeTrackingService";
import { getMessagesOnce } from "./exportChatHelper";
import { getMastersOnce } from "./masterService";
import { decryptBytes } from "@/lib/crypto";
import { getOrCreateProjectFileKey, resolveMasterFileKey } from "./fileKeyService";
import type { ProjectModel } from "@/models/types";

/** Port of export_service.dart + the folder/CSV parts of
 *  bulk_operations_service.dart, using Tauri dialog + fs plugins. */

function two(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDate(d: Date): string {
  return `${two(d.getDate())}.${two(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function formatDateTime(d: Date): string {
  return `${formatDate(d)} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

function timestampSuffix(): string {
  const now = new Date();
  return `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}_${two(
    now.getHours()
  )}${two(now.getMinutes())}${two(now.getSeconds())}`;
}

function csvEscape(value: string): string {
  return `"${value.replaceAll(";", ",").replaceAll("\n", " ")}"`;
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim();
  const sanitized = trimmed.replace(/[\\/:*?"<>|]/g, "_");
  return sanitized || "datei.bin";
}

async function downloadUrlToFile(url: string, destinationPath: string): Promise<void> {
  await writeFile(destinationPath, await fetchBytes(url));
}

/** Copies a directory tree file-by-file (the fs plugin has no native
 *  recursive copy). */
async function copyDirRecursive(source: string, destination: string): Promise<void> {
  await mkdir(destination, { recursive: true });
  for (const entry of await readDir(source)) {
    if (entry.isDirectory) {
      await copyDirRecursive(`${source}/${entry.name}`, `${destination}/${entry.name}`);
    } else if (entry.isFile) {
      await copyFile(`${source}/${entry.name}`, `${destination}/${entry.name}`);
    }
  }
}

export async function exportProjectsToCSV(userId: string): Promise<string | null> {
  const projects = await getProjects(userId);
  const customers = await getCustomers(userId);
  const customerMap = new Map(customers.map((c) => [c.id, c.name]));

  const lines = ["Projektname;Kunde;Status;Priorität;Typ;Deadline;Erstellt"];
  for (const project of projects) {
    const customerName =
      project.customerName ??
      (project.customerId ? customerMap.get(project.customerId) : null) ??
      "Kein Kunde";
    const deadline = project.deadline ? formatDate(project.deadline) : "Keine";
    lines.push(
      [
        csvEscape(project.name),
        csvEscape(customerName),
        csvEscape(project.statusValue),
        csvEscape(project.priority),
        csvEscape(project.projectType),
        deadline,
        formatDate(project.createdAt),
      ].join(";")
    );
  }

  const path = await save({
    defaultPath: `projekte_${timestampSuffix()}.csv`,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!path) return null;
  await writeTextFile(path, lines.join("\n"));
  return path;
}

export async function exportCustomersToCSV(userId: string): Promise<string | null> {
  const customers = await getCustomers(userId);
  const projects = await getProjects(userId);

  const projectCountMap: Record<string, number> = {};
  for (const project of projects) {
    if (project.customerId) {
      projectCountMap[project.customerId] =
        (projectCountMap[project.customerId] ?? 0) + 1;
    }
  }

  const lines = ["Name;E-Mail;Telefon;Discord;Instagram;Projekte;Erstellt"];
  for (const customer of customers) {
    lines.push(
      [
        csvEscape(customer.name),
        csvEscape(customer.email ?? ""),
        csvEscape(customer.phone ?? ""),
        csvEscape(customer.discord ?? ""),
        csvEscape(customer.instagram ?? ""),
        String(projectCountMap[customer.id] ?? 0),
        formatDate(customer.createdAt),
      ].join(";")
    );
  }

  const path = await save({
    defaultPath: `kunden_${timestampSuffix()}.csv`,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!path) return null;
  await writeTextFile(path, lines.join("\n"));
  return path;
}

export async function exportTimeEntriesToCSV(userId: string): Promise<string | null> {
  const projects = await getProjects(userId);
  const lines = ["Projekt;Start;Ende;Dauer (Stunden);Beschreibung"];
  let totalHours = 0;

  for (const project of projects) {
    const entries = await getTimeEntries(project.id);
    for (const entry of entries) {
      const hours = entry.durationMinutes / 60;
      totalHours += hours;
      lines.push(
        [
          csvEscape(project.name),
          formatDateTime(entry.startTime),
          entry.endTime ? formatDateTime(entry.endTime) : "Läuft",
          hours.toFixed(2),
          csvEscape(entry.description),
        ].join(";")
      );
    }
  }
  lines.push("");
  lines.push(`Gesamt Stunden;${totalHours.toFixed(2)}`);

  const path = await save({
    defaultPath: `zeiterfassung_${timestampSuffix()}.csv`,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!path) return null;
  await writeTextFile(path, lines.join("\n"));
  return path;
}

export async function generateFullBackup(userId: string): Promise<string | null> {
  const projects = await getProjects(userId);
  const customers = await getCustomers(userId);

  const projectData = [];
  for (const project of projects) {
    const tasks = await getTasks(project.id);
    const timeEntries = await getTimeEntries(project.id);
    projectData.push({
      id: project.id,
      name: project.name,
      status: project.statusValue,
      priority: project.priority,
      projectType: project.projectType,
      customerId: project.customerId,
      customerName: project.customerName,
      deadline: project.deadline?.toISOString() ?? null,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      bpm: project.bpm,
      musicalKey: project.musicalKey,
      workspaceLink: project.workspaceLink,
      referenceLink: project.referenceLink,
      attachments: project.attachments,
      tasks: tasks.map((t) => ({
        title: t.title,
        description: t.description,
        isCompleted: t.isCompleted,
        dueDate: t.dueDate?.toISOString() ?? null,
        subtasks: t.subtasks.map((s) => ({
          title: s.title,
          isCompleted: s.isCompleted,
        })),
      })),
      timeEntries: timeEntries.map((e) => ({
        startTime: e.startTime.toISOString(),
        endTime: e.endTime?.toISOString() ?? null,
        durationMinutes: e.durationMinutes,
        description: e.description,
      })),
    });
  }

  const backupData = {
    generatedAt: new Date().toISOString(),
    userId,
    projects: projectData,
    customers: customers.map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      phone: c.phone,
      notes: c.notes,
      discord: c.discord,
      instagram: c.instagram,
      spotify: c.spotify,
      appleMusic: c.appleMusic,
      clientMemory: c.clientMemory,
      referenceTracks: c.referenceTracks,
      createdAt: c.createdAt.toISOString(),
    })),
  };

  const path = await save({
    defaultPath: `backup_${timestampSuffix()}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!path) return null;
  await writeTextFile(path, JSON.stringify(backupData, null, 2));
  return path;
}

/** Folder export for a single project. Everything is numbered so the
 *  export folder sorts in a fixed, readable order:
 *    01 Projekt-Info.txt … 05 Verlauf.txt, 06 Dateien/, 07 Master/,
 *    08 DAW-Projekt/ (optional copy of the picked DAW zip or folder). */
export async function exportProjectAsFolder(params: {
  userId: string;
  project: ProjectModel;
  includeProjectText?: boolean;
  includeTodoList?: boolean;
  includeChatLogs?: boolean;
  includeTimeTracking?: boolean;
  includeHistory?: boolean;
  includeAttachments?: boolean;
  includeMasters?: boolean;
  dawProjectPath?: string | null;
  dawProjectIsDirectory?: boolean;
  onProgress?: (label: string) => void;
}): Promise<{ folder: string; skippedCount: number } | null> {
  // recursive: without it the dialog only scopes the folder itself, and
  // every write inside the created export subfolder is rejected by fs.
  const destination = await openDialog({
    directory: true,
    recursive: true,
    multiple: false,
    title: "Export-Zielordner auswählen",
  });
  if (!destination || typeof destination !== "string") return null;

  // "Kunde - Projektname" (or just the project name without a customer) —
  // no timestamp/number suffix by default; one is only appended if that
  // exact folder already exists, so a re-export never silently mixes old
  // and new files into the same directory.
  const customerName = params.project.customerName?.trim();
  const label = customerName ? `${customerName} - ${params.project.name}` : params.project.name;
  const safeName = label.replace(/[\\/:*?"<>|]/g, "_").trim() || "Projekt";
  let folder = `${destination}/${safeName}`;
  for (let i = 2; await exists(folder); i++) {
    folder = `${destination}/${safeName} (${i})`;
  }
  await mkdir(folder, { recursive: true });

  const p = params.project;

  if (params.includeProjectText !== false) {
    const info = [
      `Projekt: ${p.name}`,
      `Kunde: ${p.customerName ?? "-"}`,
      `Typ: ${p.projectType}`,
      `Status: ${p.statusValue}`,
      `Priorität: ${p.priority}`,
      `Deadline: ${p.deadline ? formatDateTime(p.deadline) : "-"}`,
      `BPM: ${p.bpm ?? "-"}`,
      `Tonart: ${p.musicalKey ?? "-"}`,
      `Workspace: ${p.workspaceLink ?? "-"}`,
      `Referenz-Link: ${p.referenceLink ?? "-"}`,
      `DAW-Projektpfad: ${p.dawProjectPath ?? "-"}`,
      `Erstellt: ${formatDateTime(p.createdAt)}`,
      `Aktualisiert: ${formatDateTime(p.updatedAt)}`,
      "",
      `Anhänge (${p.attachments.length}):`,
      ...p.attachments.map((url) => `- ${p.attachmentNames[url] ?? url}`),
    ].join("\n");
    await writeTextFile(`${folder}/01 Projekt-Info.txt`, info);
  }

  if (params.includeTodoList !== false) {
    const tasks = await getTasks(p.id);
    const lines = tasks.map((t) => {
      const subtaskLines = t.subtasks.map(
        (s) => `    ${s.isCompleted ? "[x]" : "[ ]"} ${s.title}`
      );
      return [
        `${t.isCompleted ? "[x]" : "[ ]"} ${t.title}`,
        ...(t.description ? [`    ${t.description}`] : []),
        ...subtaskLines,
      ].join("\n");
    });
    await writeTextFile(
      `${folder}/02 Aufgaben.txt`,
      lines.join("\n") || "Keine Aufgaben"
    );
  }

  if (params.includeChatLogs !== false) {
    const messages = await getMessagesOnce(p.id);
    const lines = messages.map(
      (m) => `[${formatDateTime(m.timestamp)}] ${m.username}: ${m.message}`
    );
    await writeTextFile(`${folder}/03 Chat.txt`, lines.join("\n") || "Keine Nachrichten");
  }

  if (params.includeTimeTracking !== false) {
    const entries = await getTimeEntries(p.id);
    const total = entries.reduce((sum, e) => sum + e.durationMinutes, 0);
    const lines = entries.map(
      (e) =>
        `${formatDateTime(e.startTime)} | ${e.username} | ${e.durationMinutes} min | ${e.description}`
    );
    lines.push("", `Gesamt: ${(total / 60).toFixed(2)} Stunden`);
    await writeTextFile(`${folder}/04 Zeiterfassung.txt`, lines.join("\n"));
  }

  if (params.includeHistory !== false) {
    const history = await getProjectHistory(p.id, params.userId);
    const lines = history.map(
      (h) =>
        `[${formatDateTime(h.timestamp)}] ${h.userName}: ${h.action}${
          h.fieldName ? ` (${h.fieldName}: ${h.oldValue ?? "-"} → ${h.newValue ?? "-"})` : ""
        }`
    );
    await writeTextFile(`${folder}/05 Verlauf.txt`, lines.join("\n") || "Kein Verlauf");
  }

  const projectFileKey = await getOrCreateProjectFileKey(p, params.userId);
  // Tracked instead of silently dropped — a locked device (or a failed
  // download) must never make files vanish from an export without a
  // trace the user can actually see.
  const skipped: string[] = [];

  if (params.includeAttachments) {
    const filesFolder = `${folder}/06 Dateien`;
    await mkdir(filesFolder, { recursive: true });
    let index = 0;
    for (const url of p.attachments) {
      index++;
      const originalName = p.attachmentNames[url] ?? `datei_${index}`;
      params.onProgress?.(`Datei ${index}/${p.attachments.length}: ${originalName}`);
      try {
        const meta = p.attachmentMeta[url];
        if (meta && projectFileKey) {
          const plain = await decryptBytes(await fetchBytes(url), meta.iv, projectFileKey);
          await writeFile(`${filesFolder}/${sanitizeFileName(originalName)}`, plain);
        } else if (!meta) {
          await downloadUrlToFile(url, `${filesFolder}/${sanitizeFileName(originalName)}`);
        } else {
          skipped.push(`${originalName} (Datei-Schlüssel gesperrt — bitte entsperren und erneut exportieren)`);
        }
      } catch {
        skipped.push(`${originalName} (Download fehlgeschlagen)`);
      }
    }
  }

  if (params.includeMasters) {
    const mastersFolder = `${folder}/07 Master`;
    await mkdir(mastersFolder, { recursive: true });
    const masters = await getMastersOnce(p.id);
    let index = 0;
    for (const master of masters) {
      index++;
      params.onProgress?.(`Master ${index}/${masters.length}: ${master.versionName}`);
      try {
        const masterKey = await resolveMasterFileKey(master, projectFileKey);
        if (master.encrypted && !masterKey) {
          skipped.push(`${master.versionName} (Master-Schlüssel gesperrt — bitte entsperren und erneut exportieren)`);
          continue;
        }
        const encryptedBytes = await fetchBytes(master.fileUrl);
        const plainBytes = master.encrypted
          ? await decryptBytes(encryptedBytes, master.iv, masterKey!)
          : encryptedBytes;
        const fileName = sanitizeFileName(
          master.originalFileName || `${master.versionName}.bin`
        );
        await writeFile(`${mastersFolder}/${fileName}`, plainBytes);
      } catch {
        skipped.push(`${master.versionName} (Download fehlgeschlagen)`);
      }
    }
  }

  if (skipped.length > 0) {
    await writeTextFile(
      `${folder}/00 ACHTUNG - Nicht exportierte Dateien.txt`,
      [
        `${skipped.length} Datei(en) konnten nicht mit exportiert werden:`,
        "",
        ...skipped.map((s) => `- ${s}`),
      ].join("\n")
    );
  }

  if (params.dawProjectPath) {
    const dawFolder = `${folder}/08 DAW-Projekt`;
    const sourceName = params.dawProjectPath.split(/[\\/]/).pop() ?? "DAW-Projekt";
    params.onProgress?.(`DAW-Projekt: ${sourceName}`);
    if (params.dawProjectIsDirectory) {
      await copyDirRecursive(params.dawProjectPath, `${dawFolder}/${sourceName}`);
    } else {
      await mkdir(dawFolder, { recursive: true });
      await copyFile(params.dawProjectPath, `${dawFolder}/${sanitizeFileName(sourceName)}`);
    }
  }

  return { folder, skippedCount: skipped.length };
}
