import { Injectable, OnModuleInit } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ErrorMessage } from '../../../common/constants/error-messages.constants';
import { Detector } from '../../../common/enums/detector.enum';
import { JobState } from '../../../common/enums/job-state.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { DetectionControl, DetectionStateStore } from '../../detection-state';
import { LayoutSettingsStore } from '../../settings';
import { ChannelDirectory } from '../../shops';
import { MSG_CONNECTING } from '../constants/detection.constants';
import { DetectionStateDto } from '../dtos/detection-state.dto';
import { SAMPLE_FRAME_JPEG } from '../fixtures/frame.fixtures';

@Injectable()
export class DetectionService implements OnModuleInit {
  constructor(
    private readonly directory: ChannelDirectory,
    private readonly detectionStore: DetectionStateStore,
    private readonly settings: LayoutSettingsStore,
    private readonly control: DetectionControl,
  ) {}

  onModuleInit(): void {
    this.control.register((key) => this.stop(key));
  }

  async start(key: string): Promise<DetectionStateDto> {
    await this.directory.require(key);
    return { key, state: JobState.RETRYING, message: MSG_CONNECTING, reason_code: null };
  }

  /** The detector the next attempt uses; read from the store, so a change applies without a restart. */
  async detector(): Promise<Detector> {
    return (await this.settings.get()).detector;
  }

  /** Stub until jobs exist: PUT /settings/layout calls it when the detector or show_mpv changed, and real jobs must then restart. */
  async restartActive(): Promise<void> {
    await Promise.resolve();
  }

  /** Works by key, so a job of a deleted channel can still be stopped. */
  async stop(key: string): Promise<DetectionStateDto> {
    this.detectionStore.delete(key);
    return { key, state: JobState.STOPPED, message: null, reason_code: null };
  }

  /** Sample JPEG until detection is real; FRAME_NOT_FOUND when the shop has no frame, thrown before the reply starts. */
  async frame(key: string): Promise<Buffer> {
    await this.directory.require(key);
    if (this.detectionStore.get(key).framePath === null) {
      throw new DomainException(ErrorCode.FRAME_NOT_FOUND, ErrorMessage.frameNotFound(key));
    }
    return SAMPLE_FRAME_JPEG;
  }
}
