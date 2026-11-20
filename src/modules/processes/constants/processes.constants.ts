export const CHILD_PIDS_INDENT = 2;
/** Room for clock jitter between our record and Windows' creation time; a wider window would risk matching a reused pid that started inside it. */
export const SPAWN_TIME_TOLERANCE_MS = 15_000;
export const UNREADABLE_PIDS_SUFFIX = '.unreadable';
/** Waits after the 1st, 2nd and later failed write of the child list in a row; the last repeats. */
export const CHILD_PIDS_RETRY_SCHEDULE_MS: readonly number[] = [1_000, 5_000, 30_000];
/** The wait never grows past the last step of the schedule. */
export const CHILD_PIDS_MAX_RETRY_MS =
  CHILD_PIDS_RETRY_SCHEDULE_MS[CHILD_PIDS_RETRY_SCHEDULE_MS.length - 1];
/** Besides the first, every Nth failed write in a row is logged, so a long outage stays visible without a line per retry. */
export const CHILD_PIDS_FAILURE_LOG_EVERY = 10;
