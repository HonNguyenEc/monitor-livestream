import { Injectable } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { JobState } from '../../../common/enums/job-state.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ShopsService } from '../../shops/services/shops.service';
import { DetectionStateDto } from '../dtos/detection-state.dto';
import { SAMPLE_FRAME_JPEG } from '../fixtures/frame.fixtures';

@Injectable()
export class DetectionService {
  constructor(private readonly shopsService: ShopsService) {}

  start(key: string): DetectionStateDto {
    this.shopsService.get(key);
    return { key, state: JobState.RETRYING, message: 'Connecting…' };
  }

  stop(key: string): DetectionStateDto {
    this.shopsService.get(key);
    return { key, state: JobState.STOPPED, message: null };
  }

  /** Latest JPEG as a buffer, so a missing frame surfaces as FRAME_NOT_FOUND before the reply starts. */
  async frame(key: string): Promise<Buffer> {
    if (this.shopsService.get(key).frame_url === null) {
      throw new DomainException(ErrorCode.FRAME_NOT_FOUND, `No frame for ${key}`);
    }
    return SAMPLE_FRAME_JPEG;
  }
}
