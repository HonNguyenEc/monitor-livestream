import { BACKEND_API_PREFIX, TRAILING_SLASHES } from '../constants/backend.constants';
import { HTTP_URL_PROTOCOLS } from '../../../common/constants/http.constants';

/**
 * The backend origin plus path, without a trailing `/api/v1`; null unless it is a plain http(s) URL.
 * Credentials, a query or a fragment are refused because API paths are appended to the result.
 */
export function normalizeBaseUrl(raw: string): string | null {
  const url = URL.parse(raw.trim());
  if (
    !url ||
    !HTTP_URL_PROTOCOLS.includes(url.protocol) ||
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
