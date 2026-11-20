import { Injectable } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ErrorMessage } from '../../../common/constants/error-messages.constants';
import { JobState } from '../../../common/enums/job-state.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { ShopsService } from '../../shops/services/shops.service';
import { MSG_CONNECTING } from '../constants/detection.constants';
import { DetectionStateDto } from '../dtos/detection-state.dto';
import { SAMPLE_FRAME_JPEG } from '../fixtures/frame.fixtures';

@Injectable()
export class DetectionService {
  constructor(private readonly shopsService: ShopsService) {}

  async start(key: string): Promise<DetectionStateDto> {
    await this.shopsService.assertExists(key);
    return { key, state: JobState.RETRYING, message: MSG_CONNECTING };
  }

  async stop(key: string): Promise<DetectionStateDto> {
    await this.shopsService.assertExists(key);
    return { key, state: JobState.STOPPED, message: null };
  }

  /** Sample JPEG until detection is real; FRAME_NOT_FOUND when the shop has no frame, thrown before the reply starts. */
  async frame(key: string): Promise<Buffer> {
    if ((await this.shopsService.get(key)).frame_url === null) {
      throw new DomainException(ErrorCode.FRAME_NOT_FOUND, ErrorMessage.frameNotFound(key));
    }
    return SAMPLE_FRAME_JPEG;
  }
}
