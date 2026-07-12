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
