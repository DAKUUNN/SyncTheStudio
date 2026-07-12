export function getPublicLinkToken(): string {
  const directToken = new URLSearchParams(window.location.search).get("token");
  if (directToken?.trim()) return directToken.trim();

  const hash = window.location.hash ?? "";
  const queryIndex = hash.indexOf("?");
  if (queryIndex >= 0) {
    const hashToken = new URLSearchParams(hash.slice(queryIndex + 1)).get("token");
    if (hashToken?.trim()) return hashToken.trim();
  }

  return "";
}
