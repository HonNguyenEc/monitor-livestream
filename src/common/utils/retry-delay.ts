import { MS_PER_SECOND } from '../constants/time.constants';

/**
 * Wait after the `failures`-th consecutive failure (1-based): the step of `scheduleMs` (the last one
 * repeats), replaced by the server's Retry-After when it sent a positive one; never above `capMs`.
 */
export function retryDelayMs(
  failures: number,
  scheduleMs: readonly number[],
  retryAfterSeconds: number | null,
  capMs: number,
): number {
  const step = scheduleMs[Math.min(Math.max(failures, 1), scheduleMs.length) - 1];
  const delay = retryAfterSeconds ? retryAfterSeconds * MS_PER_SECOND : step;
  return Math.min(delay, capMs);
}
