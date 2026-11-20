import { MS_PER_SECOND } from '../../backend/constants/backend-sync.constants';
import {
  ERROR_BACKOFF_MS,
  EXPIRY_MARGIN_MS,
  LIVE_TTL_MS,
  MAX_BACKOFF_MS,
  OFF_IDLE_TTL_MS,
  OFF_SCHEDULED_TTL_MS,
} from './backend-play-url.constants';

/** How long a live answer is reused: LIVE_TTL_MS, but never past `expiresAt` minus the margin. */
export function liveTtlMs(expiresAt: string | null, nowMs: number): number {
  const expires = expiresAt === null ? Number.NaN : Date.parse(expiresAt);
  if (Number.isNaN(expires)) return LIVE_TTL_MS;
  return Math.max(0, Math.min(LIVE_TTL_MS, expires - nowMs - EXPIRY_MARGIN_MS));
}

export function notLiveTtlMs(scheduled: boolean): number {
  return scheduled ? OFF_SCHEDULED_TTL_MS : OFF_IDLE_TTL_MS;
}

/** Wait after the `failures`-th consecutive failure (1-based); the backend Retry-After wins when sent, capped at MAX_BACKOFF_MS. */
export function errorBackoffMs(failures: number, retryAfterSeconds: number | null): number {
  const retryAfterMs = retryAfterSeconds
    ? Math.min(retryAfterSeconds * MS_PER_SECOND, MAX_BACKOFF_MS)
    : 0;
  return retryAfterMs || ERROR_BACKOFF_MS[Math.min(failures, ERROR_BACKOFF_MS.length) - 1];
}
