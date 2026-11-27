import { ApiProperty } from '@nestjs/swagger';

import { JobState } from '../../../common/enums/job-state.enum';
import { ReasonCode } from '../../../common/enums/reason-code.enum';

export class DetectionStateDto {
  key: string;
  state: JobState;
  message: string | null;
  @ApiProperty({ enum: ReasonCode, enumName: 'ReasonCode', nullable: true })
  reason_code: ReasonCode | null;
}
