export interface MonitorDiff {
  /** Started by an earlier pass and no longer wanted. */
  stop: string[];
  /** Wanted and not started by this monitor yet, in the order wanted. */
  start: string[];
}

/**
 * What one pass must do. `started` is what the monitor has started or adopted so far, not what runs
 * now: a job that ended on its own, or that the operator stopped by hand, stays in it and is not
 * started again until its channel leaves the selection and comes back, as in monitor.py.
 */
export function diffMonitor(wanted: Iterable<string>, started: ReadonlySet<string>): MonitorDiff {
  const wantedKeys = new Set(wanted);
  return {
    stop: [...started].filter((key) => !wantedKeys.has(key)),
    start: [...wantedKeys].filter((key) => !started.has(key)),
  };
}
