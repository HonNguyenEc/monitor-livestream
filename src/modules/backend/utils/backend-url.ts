import {
  BACKEND_API_PREFIX,
  BACKEND_URL_PROTOCOLS,
  TRAILING_SLASHES,
} from '../constants/backend.constants';

/**
 * The backend origin plus path, without a trailing `/api/v1`; null unless it is a plain http(s) URL.
 * Credentials, a query or a fragment are refused because API paths are appended to the result.
 */
export function normalizeBaseUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (
    !BACKEND_URL_PROTOCOLS.includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    return null;
  }
  const base = `${url.origin}${url.pathname}`.replace(TRAILING_SLASHES, '');
  return base.endsWith(BACKEND_API_PREFIX) ? base.slice(0, -BACKEND_API_PREFIX.length) : base;
}

export function apiUrl(baseUrl: string, path: string, query: Record<string, string> = {}): string {
  const filled = Object.entries(query).filter(([, value]) => value !== '');
  const search = filled.length > 0 ? `?${new URLSearchParams(filled).toString()}` : '';
  return `${baseUrl}${BACKEND_API_PREFIX}${path}${search}`;
}
