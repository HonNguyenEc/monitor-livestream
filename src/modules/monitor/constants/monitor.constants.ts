import { MS_PER_SECOND } from '../../../common/constants/time.constants';

/** How often the supervisor re-reads the channel list to follow added and removed ones (SYNC_SECONDS of monitor.py). */
export const MONITOR_PASS_MS = 5 * MS_PER_SECOND;
/** Pause after each job start, so every channel does not resolve at once (START_STAGGER of monitor.py). */
export const MONITOR_START_STAGGER_MS = 2 * MS_PER_SECOND;

/** Log event names, as monitor.py prints them. */
export const MonitorEvent = {
  started: 'monitor_started',
  updated: 'monitor_updated',
  stopped: 'monitor_stopped',
  configError: 'monitor_config_error',
} as const;
