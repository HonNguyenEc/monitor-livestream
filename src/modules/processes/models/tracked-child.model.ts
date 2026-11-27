export interface TrackedChild {
  pid: number;
  /** Executable file name in lower case. */
  image: string;
  /** When it was started (ms since the epoch); with the image it tells the process from an unrelated one that reused the pid. */
  launchedAtMs: number;
}
