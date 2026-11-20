import { LiveStatus } from '../../../common/enums/live-status.enum';
import { Platform } from '../../../common/enums/platform.enum';
import {
  FAILED_RESOLVE_DELAY_MS,
  NO_SIGNAL_DELAY_MS,
  OFFLINE_DELAY_MS,
} from '../constants/detection.constants';
import { Observation } from './verdict-reducer';

/** Wait before the next attempt, by what this one found (the table in the contract); the raw observation counts, not the verdict the grace rule reports. */
export function delayAfter(platform: Platform, observation: Observation): number {
  if (observation.status === LiveStatus.NO_SIGNAL) return NO_SIGNAL_DELAY_MS;
  if (observation.status === LiveStatus.OFFLINE) return OFFLINE_DELAY_MS[platform];
  return FAILED_RESOLVE_DELAY_MS[platform];
}
