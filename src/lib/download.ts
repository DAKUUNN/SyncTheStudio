/** Downloads a URL into memory, routing around WKWebView.
 *
 *  In the Tauri apps the webview's own fetch fails with a bare
 *  "Load failed" on Firebase Storage downloads, so there the request
 *  goes through the http plugin (native reqwest, no webview networking
 *  involved). In a plain browser (Firebase Hosting build) the plugin
 *  doesn't exist and the regular fetch works fine. */
export async function fetchBytes(url: string): Promise<Uint8Array> {
  const doFetch =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window
      ? (await import("@tauri-apps/plugin-http")).fetch
      : window.fetch.bind(window);
  const response = await doFetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}
