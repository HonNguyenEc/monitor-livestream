import { registerAs } from '@nestjs/config';

import { BACKEND_URL_ENV, DEFAULT_BACKEND_URL } from '../constants/backend.constants';
import { normalizeBaseUrl } from '../utils/backend-url';

export interface BackendConfig {
  /** The URL as given: the trimmed AUTO_LIVES_BACKEND_URL, or the default when it is unset or blank. */
  url: string;
  /** `url` normalized, or null when it is not a usable http(s) URL; a typo must not stop the service. */
  baseUrl: string | null;
}

export function toBackendConfig(url: string): BackendConfig {
  return { url, baseUrl: normalizeBaseUrl(url) };
}

export const backendConfig = registerAs('backend', (): BackendConfig =>
  toBackendConfig(process.env[BACKEND_URL_ENV]?.trim() || DEFAULT_BACKEND_URL),
);
