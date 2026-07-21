import { httpsCallable } from "firebase/functions";
import { getFirebaseFunctions } from "@/firebase";

/** Port of task_extraction_service.dart — cloud function + local heuristics. */

export interface ExtractedTaskSuggestion {
  title: string;
  description: string | null;
  priority: string;
  dueHint: string | null;
}

function normalizePriority(value: string | undefined | null): string {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "urgent" || normalized === "dringend") return "dringend";
  if (normalized === "high" || normalized === "hoch") return "hoch";
  if (normalized === "low" || normalized === "niedrig") return "niedrig";
  return "mittel";
}

function suggestionFromMap(data: Record<string, unknown>): ExtractedTaskSuggestion {
  const title = String(data.title ?? "").trim();
  const description = String(data.description ?? "").trim();
  const dueHint = String(data.dueHint ?? "").trim();
  return {
    title,
    description: description || null,
    priority: normalizePriority(data.priority as string | undefined),
    dueHint: dueHint || null,
  };
}

function extractRawSuggestions(payload: unknown): Record<string, unknown>[] {
  if (
    typeof payload === "object" &&
    payload !== null &&
    Array.isArray((payload as Record<string, unknown>).tasks)
  ) {
    return ((payload as Record<string, unknown>).tasks as unknown[]).filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null
    );
  }
  if (Array.isArray(payload)) {
    return payload.filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null
    );
  }
  return [];
}

function detectPriority(text: string): string {
  const value = text.toLowerCase();
  const urgentKeywords = ["asap", "sofort", "dringend", "urgent", "wichtig", "heute"];
  const highKeywords = ["schnell", "prioritaet", "priority", "bald"];
  const lowKeywords = ["optional", "spater", "spaeter", "wenn moeglich"];
  if (urgentKeywords.some((k) => value.includes(k))) return "dringend";
  if (highKeywords.some((k) => value.includes(k))) return "hoch";
  if (lowKeywords.some((k) => value.includes(k))) return "niedrig";
  return "mittel";
}

function detectDueHint(text: string): string | null {
  const value = text.toLowerCase();
  if (value.includes("heute")) return "heute";
  if (value.includes("morgen")) return "morgen";
  const weekdayMatch =
    /\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/i.exec(text);
  if (weekdayMatch) return weekdayMatch[0];
  const dateMatch = /\b\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?\b/.exec(text);
  if (dateMatch) return dateMatch[0];
  return null;
}

function toTaskTitle(text: string): string {
  let normalized = text.trim();
  if (!normalized) return "";
  normalized = normalized
    .replace(/\s+/g, " ")
    .replace(/^(kannst du|koenntest du|bitte)\s+/i, "")
    .trim();
  if (normalized.length > 96) normalized = `${normalized.slice(0, 93)}...`;
  return `${normalized[0].toUpperCase()}${normalized.slice(1)}`;
}

function localHeuristicExtract(message: string): ExtractedTaskSuggestion[] {
  const chunks = message
    .split(/[\n\r.!?;]+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (chunks.length === 0) return [];

  const suggestions: ExtractedTaskSuggestion[] = [];
  for (const chunk of chunks) {
    const cleaned = chunk
      .replace(/^[-*\d).]\s*/, "")
      .replace(/^(bitte|pls|please)\s+/i, "")
      .trim();
    if (cleaned.length < 4) continue;
    const normalizedTitle = toTaskTitle(cleaned);
    if (!normalizedTitle) continue;
    suggestions.push({
      title: normalizedTitle,
      description: cleaned,
      priority: detectPriority(cleaned),
      dueHint: detectDueHint(cleaned),
    });
  }
  return suggestions.slice(0, 8);
}

export async function extractTasksFromMessage(
  message: string,
  languageCode = "de"
): Promise<ExtractedTaskSuggestion[]> {
  const trimmed = message.trim();
  if (!trimmed) return [];

  try {
    const callable = httpsCallable(await getFirebaseFunctions(), "extractTasksFromMessage");
    const result = await callable({ message: trimmed, languageCode });
    const parsed = extractRawSuggestions(result.data)
      .map(suggestionFromMap)
      .filter((item) => item.title.trim().length > 0);
    if (parsed.length > 0) return parsed;
  } catch {
    // fall back to local heuristics like the original app
  }
  return localHeuristicExtract(trimmed);
}
