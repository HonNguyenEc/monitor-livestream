import { ApiProperty } from '@nestjs/swagger';

import { JobState } from '../../../common/enums/job-state.enum';
import { LiveStatus } from '../../../common/enums/live-status.enum';
import { Platform } from '../../../common/enums/platform.enum';
import { ReasonCode } from '../../../common/enums/reason-code.enum';
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
  @ApiProperty({ enum: ReasonCode, enumName: 'ReasonCode', nullable: true })
  reason_code: ReasonCode | null;
  checked_at: string | null;
  live_since: string | null;
  /** Null until the first frame of this channel is captured; the same rule for local and backend channels. */
  frame_url: string | null;
  cookie_set: boolean;
}
