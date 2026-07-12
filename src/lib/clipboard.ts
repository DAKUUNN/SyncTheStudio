/**
 * Clipboard helper that works inside Tauri WebViews (WKWebView/WebView2),
 * where navigator.clipboard is often unavailable or rejects.
 * Order: Tauri clipboard-manager plugin → navigator.clipboard → execCommand.
 */

export async function copyText(text: string): Promise<boolean> {
  // 1. Tauri plugin (native clipboard) — only available inside the Tauri app
  try {
    const { writeText } = await import("@tauri-apps/plugin-clipboard-manager");
    await writeText(text);
    return true;
  } catch {
    // not running in Tauri or plugin unavailable — fall through
  }

  // 2. Browser clipboard API (works in dev browser on localhost)
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }

  // 3. Legacy fallback
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/** Same fallback chain as copyText, in reverse (read instead of write). */
export async function pasteText(): Promise<string | null> {
  try {
    const { readText } = await import("@tauri-apps/plugin-clipboard-manager");
    const text = await readText();
    if (typeof text === "string") return text;
  } catch {
    // not running in Tauri or plugin unavailable — fall through
  }

  try {
    if (navigator.clipboard?.readText) {
      return await navigator.clipboard.readText();
    }
  } catch {
    // fall through — most likely a missing clipboard-read permission
  }

  return null;
}
