export const CHILD_PIDS_INDENT = 2;
/** Room for clock jitter between our record and Windows' creation time; a wider window would risk matching a reused pid that started inside it. */
export const SPAWN_TIME_TOLERANCE_MS = 15_000;
export const UNREADABLE_PIDS_SUFFIX = '.unreadable';
