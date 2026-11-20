import { HttpStatus } from '@nestjs/common';

import { MS_PER_SECOND, SYNC_MAX_BACKOFF_S } from '../../backend/constants/backend-sync.constants';

// Every play_url call costs the backend one Shopee API call, so answers are cached per brand and session.
/** A live answer is reused this long, never past EXPIRY_MARGIN_MS before the URL expires. */
export const LIVE_TTL_MS = 60 * MS_PER_SECOND;
export const EXPIRY_MARGIN_MS = 60 * MS_PER_SECOND;
/** Not live yet while a schedule is on air: the start is what we wait for. */
export const OFF_SCHEDULED_TTL_MS = 60 * MS_PER_SECOND;
/** Not live and nothing scheduled now: lives outside the calendar are rare. */
export const OFF_IDLE_TTL_MS = 600 * MS_PER_SECOND;
/** After the 1st, 2nd, 3rd and 4th or later consecutive failure of a session. */
export const ERROR_BACKOFF_MS: readonly number[] = [
  30 * MS_PER_SECOND,
  60 * MS_PER_SECOND,
  120 * MS_PER_SECOND,
  300 * MS_PER_SECOND,
];
/** Cap of a backend Retry-After, the same as the sync backoff. */
export const MAX_BACKOFF_MS = SYNC_MAX_BACKOFF_S * MS_PER_SECOND;
/** A cache entry is dropped this long after it expires; the wait keeps a failure streak's backoff growing. */
export const CACHE_RETENTION_MS = MAX_BACKOFF_MS;

/** Every 400 of the play_url route: the backend's only one is ERR_UPDATE_SESSION_ID_REQUIRED, the brand has no API session yet (it never created one, or only manual sessions). */
export const NO_API_SESSION_STATUS = HttpStatus.BAD_REQUEST;
/** The empty session id the backend reads as the brand current session. */
export const CURRENT_SESSION_ID = '';
export const CACHE_KEY_SEPARATOR = '\u0000';

export const MSG_NOT_CONNECTED = 'log in to the backend to get the stream of a Shopee API shop';
export const msgNoApiSession = (detail: string): string =>
  `the shop has no Shopee API session yet${detail ? ` (${detail})` : ''}`;
export const msgNotLive = (sessionId: string, where: string, status: number | null): string =>
  `session ${sessionId} (${where}) shopee_status=${status}`;
export const msgNoPlayUrl = (sessionId: string): string =>
  `session ${sessionId} is live but Shopee returned no play_url (session created from the phone app?)`;
export const msgResolved = (sessionId: string, title: string): string =>
  `session ${sessionId} via the backend (${title})`;
export const msgCached = (seconds: number): string => ` [cached, asking again in ${seconds}s]`;
