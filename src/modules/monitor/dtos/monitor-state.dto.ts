import { Platform } from '../../../common/enums/platform.enum';

export class MonitorStateDto {
  running: boolean;
  /** Platforms selected by the last start; empty while stopped. */
  platforms: Platform[];
  /** Monitored shop keys, or null when every shop of `platforms` is monitored. */
  keys: string[] | null;
}
