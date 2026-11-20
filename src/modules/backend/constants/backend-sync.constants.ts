import { Platform } from '../../../common/enums/platform.enum';

export const SYNC_TICK_MS = 30_000;
// Brands (and their Shopee connection) change rarely; the board is read from the backend DB and its readings refresh every few minutes.
export const BRANDS_REFRESH_MS = 600_000;
export const BOARD_REFRESH_MS = 120_000;
export const SYNC_BACKOFF_BASE_S = 60;
export const SYNC_MAX_BACKOFF_S = 600;
export const MS_PER_SECOND = 1000;

// A schedule counts as on air from a little before its start until a while after its planned end, since lives start late and overrun.
export const SCHEDULE_LEAD_MS = 15 * 60_000;
export const SCHEDULE_GRACE_MS = 30 * 60_000;
export const SKIPPED_SCHEDULE_STATUSES: readonly string[] = ['cancelled', 'failed'];
export const DEFAULT_SCHEDULE_PLATFORM = Platform.SHOPEE;
// Order in which on-air schedules are tried: one the backend sees live first, finished ones last (its status lags, so they are still tried).
export const SCHEDULE_STATUS_RANK: Readonly<Record<string, number>> = {
  live: 0,
  completed: 2,
  ended: 2,
};
export const DEFAULT_SCHEDULE_RANK = 1;
