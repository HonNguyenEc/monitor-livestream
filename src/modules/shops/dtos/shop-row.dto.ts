import { JobState } from '../../../common/enums/job-state.enum';
import { LiveStatus } from '../../../common/enums/live-status.enum';
import { Platform } from '../../../common/enums/platform.enum';
import { ShopSource } from '../../../common/enums/shop-source.enum';

export class ShopRowDto {
  key: string;
  platform: Platform;
  label: string;
  source: ShopSource;
  status: LiveStatus;
  job_state: JobState;
  attempts: number;
  message: string | null;
  checked_at: string | null;
  live_since: string | null;
  /** Always null for local shops until detection captures frames. */
  frame_url: string | null;
  cookie_set: boolean;
}
