import { readFile } from 'node:fs/promises';
import { Injectable, OnModuleInit } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ErrorMessage } from '../../../common/constants/error-messages.constants';
import { FILE_NOT_FOUND } from '../../../common/constants/file.constants';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { retryWhileBusy } from '../../../common/fs/json-file';
import { JobState } from '../../../common/enums/job-state.enum';
import { DetectionControl, DetectionSnapshot, DetectionStateStore } from '../../detection-state';
import { Channel, ChannelDirectory } from '../../shops';
import { DetectionStateDto } from '../dtos/detection-state.dto';
import { DetectionJobManager } from './detection-job.manager';
import { StreamRefresher } from './stream-refresher';

/** What other modules and the controller use of detection; the jobs themselves stay inside. */
@Injectable()
export class DetectionService implements OnModuleInit {
  constructor(
    private readonly directory: ChannelDirectory,
    private readonly detectionStore: DetectionStateStore,
    private readonly jobs: DetectionJobManager,
    private readonly refresher: StreamRefresher,
    private readonly control: DetectionControl,
  ) {}

  onModuleInit(): void {
    this.control.register((key) => this.stop(key));
  }

  async start(key: string): Promise<DetectionStateDto> {
    return this.startChannel(await this.directory.require(key));
  }

  /** For a caller that already holds the channel (the monitor). */
  async startChannel(channel: Channel): Promise<DetectionStateDto> {
    return toState(channel.key, await this.jobs.start(channel));
  }

  /** Works by key, so a job of a deleted channel can still be stopped. */
  async stop(key: string): Promise<DetectionStateDto> {
    await this.jobs.stop(key);
    return { key, state: JobState.STOPPED, message: null, reason_code: null };
  }

  isActive(key: string): boolean {
    return this.jobs.isActive(key);
  }

  /** Stops every running job and starts it again; PUT /settings/layout calls it when the detector or show_mpv changed. */
  restartActive(): Promise<void> {
    return this.jobs.restartActive();
  }

  /** The URL the job of this channel last resolved; null without a job. Never resolves. */
  streamUrl(key: string): string | null {
    return this.jobs.streamUrl(key);
  }

  /** A fresh stream URL, or STREAM_UNAVAILABLE. */
  async refreshStream(channel: Channel): Promise<string> {
    const url = await this.refresher.refresh(channel);
    if (!url) {
      throw new DomainException(
        ErrorCode.STREAM_UNAVAILABLE,
        ErrorMessage.streamUnavailable(channel.key),
      );
    }
    return url;
  }

  /** The latest frame of the channel; FRAME_NOT_FOUND while there is none, thrown before the reply starts. */
  async frame(key: string): Promise<Buffer> {
    await this.directory.require(key);
    const { framePath } = this.detectionStore.get(key);
    if (framePath !== null) {
      try {
        return await retryWhileBusy(() => readFile(framePath));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== FILE_NOT_FOUND) throw error;
      }
    }
    throw new DomainException(ErrorCode.FRAME_NOT_FOUND, ErrorMessage.frameNotFound(key));
  }
}

function toState(key: string, snapshot: DetectionSnapshot): DetectionStateDto {
  return {
    key,
    state: snapshot.jobState,
    message: snapshot.message,
    reason_code: snapshot.reasonCode,
  };
}
