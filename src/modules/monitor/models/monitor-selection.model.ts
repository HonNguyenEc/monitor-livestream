import { Platform } from '../../../common/enums/platform.enum';

/** What the operator asked the monitor to watch. */
export interface MonitorSelection {
  platforms: readonly Platform[];
  /** Only these channel keys; null is every channel of `platforms`. */
  keys: ReadonlySet<string> | null;
}
