import { isTauriRuntime } from "./platform";

/** Cross-platform file picking/saving: native dialogs under Tauri,
 *  standard browser APIs (`<input type="file">`, Blob download links)
 *  in a plain browser tab (e.g. the syncthestudio.de web build). */

export interface PickedFile {
  bytes: Uint8Array;
  name: string;
}

export interface PickFilesOptions {
  multiple?: boolean;
  /** Browser `<input accept>` value, e.g. ".png,.jpg,.jpeg,.webp". */
  accept?: string;
  /** Tauri dialog filters. */
  dialogFilters?: { name: string; extensions: string[] }[];
}

export async function pickFiles(options: PickFilesOptions = {}): Promise<PickedFile[] | null> {
  if (isTauriRuntime()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const selected = await open({
      multiple: !!options.multiple,
      filters: options.dialogFilters,
    });
    if (!selected) return null;
    const paths = Array.isArray(selected) ? selected : [selected];
    const files: PickedFile[] = [];
    for (const path of paths) {
      const bytes = await readFile(path);
      files.push({ bytes, name: path.split(/[\\/]/).pop() ?? "file" });
    }
    return files;
  }

  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = !!options.multiple;
    if (options.accept) input.accept = options.accept;
    input.style.display = "none";
    let settled = false;
    const cleanup = () => {
      if (input.parentNode) document.body.removeChild(input);
    };
    input.onchange = () => {
      settled = true;
      const fileList = input.files;
      cleanup();
      if (!fileList || fileList.length === 0) {
        resolve(null);
        return;
      }
      void Promise.all(
        Array.from(fileList).map(async (file) => ({
          bytes: new Uint8Array(await file.arrayBuffer()),
          name: file.name,
        }))
      ).then(resolve);
    };
    // Modern browsers fire 'cancel' when the picker closes with no
    // selection; older engines don't, in which case the promise simply
    // stays pending until the user tries again — not ideal, but harmless.
    input.oncancel = () => {
      if (settled) return;
      cleanup();
      resolve(null);
    };
    document.body.appendChild(input);
    input.click();
  });
}

function triggerBrowserDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

/** Saves binary content — native "Save As" dialog under Tauri, a browser
 *  download under the web build. Returns the saved path (Tauri) or the
 *  file name (browser), or null if the user cancelled. */
export async function saveBytes(bytes: Uint8Array, defaultFileName: string): Promise<string | null> {
  if (isTauriRuntime()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const target = await save({ defaultPath: defaultFileName });
    if (!target) return null;
    await writeFile(target, bytes);
    return target;
  }
  triggerBrowserDownload(new Blob([bytesToArrayBuffer(bytes)]), defaultFileName);
  return defaultFileName;
}

/** Same as saveBytes but for text content (CSV/JSON exports). */
export async function saveText(content: string, defaultFileName: string): Promise<string | null> {
  if (isTauriRuntime()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const target = await save({ defaultPath: defaultFileName });
    if (!target) return null;
    await writeTextFile(target, content);
    return target;
  }
  triggerBrowserDownload(new Blob([content], { type: "text/plain" }), defaultFileName);
  return defaultFileName;
}
