import { Injectable, Logger } from '@nestjs/common';

import { safeErrorMessage } from '../../../common/utils/safe-error-message';
import { ResolverService } from '../../resolvers';
import { Channel, ChannelDirectory } from '../../shops';
import { DetectionJobManager } from './detection-job.manager';

/** Resolves a fresh stream URL for the wall: one resolve per channel at a time, and the job of that channel keeps the URL for the next viewers. */
@Injectable()
export class StreamRefresher {
  private readonly logger = new Logger(StreamRefresher.name);
  private readonly inFlight = new Map<string, Promise<string | null>>();

  constructor(
    private readonly directory: ChannelDirectory,
    private readonly resolver: ResolverService,
    private readonly jobs: DetectionJobManager,
  ) {}

  /** The new URL, or null when none could be resolved. */
  refresh(channel: Channel): Promise<string | null> {
    const running = this.inFlight.get(channel.key);
    if (running) return running;
    const started = this.resolveOnce(channel).finally(() => this.inFlight.delete(channel.key));
    this.inFlight.set(channel.key, started);
    return started;
  }

  private async resolveOnce(channel: Channel): Promise<string | null> {
    try {
      const result = await this.resolver.resolve(await this.directory.toResolveRequest(channel));
      const url = result.ok ? (result.urls[0] ?? null) : null;
      if (url) this.jobs.setStreamUrl(channel.key, url);
      return url;
    } catch (error) {
      this.logger.warn(`Refresh of ${channel.key} failed: ${safeErrorMessage(error)}`);
      return null;
    }
  }
}
