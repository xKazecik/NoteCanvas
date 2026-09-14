/**
 * Origin the collaboration socket connects to.
 *
 * This has to agree with how the REST client resolves its base URL
 * (`VITE_API_URL || "/api"`), which quietly treats an unset variable as "same
 * origin". A production build sets nothing — `VITE_API_URL` lives only in
 * `.env.example`, which local development copies to `.env` — so anything that
 * demands an explicit value works in dev and points at the wrong host once
 * deployed, taking realtime collaboration down without touching the REST API.
 *
 * So: a relative or missing base means the socket lives on the page's own
 * origin. An absolute base contributes only its origin, since socket.io reads a
 * trailing path as a namespace rather than as a prefix.
 */
export const resolveSocketUrl = (
  apiUrl: string | undefined,
  pageOrigin: string,
): string => {
  const trimmed = typeof apiUrl === "string" ? apiUrl.trim() : "";
  if (!trimmed || trimmed.startsWith("/")) return pageOrigin;
  try {
    return new URL(trimmed, pageOrigin).origin;
  } catch {
    return pageOrigin;
  }
};

export const getSocketUrl = (): string =>
  resolveSocketUrl(import.meta.env.VITE_API_URL, window.location.origin);
