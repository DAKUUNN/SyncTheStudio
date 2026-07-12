/** Port of lib/config/public_link_config.dart.
 *
 *  IMPORTANT: `masterShareBaseUrl` / `customerUploadBaseUrl` are persisted on
 *  the `projects/{id}` document and validated by firestore.rules against an
 *  exact whitelist (`validMasterShareBaseUrlValue` / `validCustomerUploadBaseUrlValue`).
 *  The stored value is the FULL prefix through the route segment (e.g.
 *  "https://syncthestudio.de/master"), not just the origin — build*Url()
 *  simply appends "?token=...". Keep these two default constants in sync
 *  with the whitelist in firestore.rules or link creation will fail with
 *  permission-denied.
 */

const DEFAULT_MASTER_SHARE_BASE_URL = "https://syncthestudio.de/master";
const DEFAULT_CUSTOMER_UPLOAD_BASE_URL = "https://syncthestudio.de/upload";

function normalizeBaseUrl(raw: string | null | undefined, fallback: string): string {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return fallback;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
    return trimmed.replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}

export const PublicLinkConfig = {
  defaultMasterShareBaseUrl: DEFAULT_MASTER_SHARE_BASE_URL,
  defaultCustomerUploadBaseUrl: DEFAULT_CUSTOMER_UPLOAD_BASE_URL,

  normalizeMasterShareBaseUrl(raw?: string | null): string {
    return normalizeBaseUrl(raw, DEFAULT_MASTER_SHARE_BASE_URL);
  },

  buildMasterShareUrl(token: string, baseUrl?: string | null): string {
    const base = this.normalizeMasterShareBaseUrl(baseUrl);
    return `${base}?token=${encodeURIComponent(token)}`;
  },

  normalizeCustomerUploadBaseUrl(raw?: string | null): string {
    return normalizeBaseUrl(raw, DEFAULT_CUSTOMER_UPLOAD_BASE_URL);
  },

  buildCustomerUploadUrl(token: string, baseUrl?: string | null): string {
    const base = this.normalizeCustomerUploadBaseUrl(baseUrl);
    return `${base}?token=${encodeURIComponent(token)}`;
  },
};
