import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';

import { JobState } from '../../../common/enums/job-state.enum';
import { LiveStatus } from '../../../common/enums/live-status.enum';
import { safeErrorMessage } from '../../../common/utils/safe-error-message';
import { DATA_DIR } from '../../../config/data-dir.module';
import { framePathOf } from '../../../config/runtime-artifacts';
import { BackendSyncStore } from '../../backend';
import { DetectionSnapshot, DetectionStateStore } from '../../detection-state';
import { ResolverService } from '../../resolvers';
import { LayoutSettingsStore } from '../../settings';
import { Channel, ChannelDirectory } from '../../shops';
import { GONE_SWEEP_MS, STOP_WAIT_MS } from '../constants/detection.constants';
import { FRAME_DETECTORS, FrameDetector } from '../detectors/frame-detector.interface';
import { JobContext } from '../models/job-context.model';
import { DetectionJob } from './detection-job';
import { settleWithin } from '../../../common/concurrency/settle-within';

/** The running jobs, one per channel key: starts, stops and restarts them, and ends the ones whose channel or login is gone. */
@Injectable()
export class DetectionJobManager implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DetectionJobManager.name);
  private readonly jobs = new Map<string, DetectionJob>();
  /** A stop in progress per key; a start of the same key waits for it, so two runs never share a frame file or a player. */
  private readonly stopping = new Map<string, Promise<void>>();
  private readonly context: JobContext;
  private sweepTimer: NodeJS.Timeout | null = null;
  private sweeping = false;
  private destroying = false;
  /** Explicit stops per key; a restart that sees the count move knows someone stopped the key while it ran. */
  private readonly stopRequests = new Map<string, number>();

  constructor(
    private readonly store: DetectionStateStore,
    private readonly directory: ChannelDirectory,
    resolver: ResolverService,
    settings: LayoutSettingsStore,
    @Inject(FRAME_DETECTORS) detectors: FrameDetector[],
    backend: BackendSyncStore,
    @Inject(DATA_DIR) dataDir: string,
  ) {
    this.context = {
      store,
      directory,
      resolver,
      settings,
      detectors,
      loginEpoch: () => backend.epoch,
      framePathOf: (key) => framePathOf(dataDir, key),
    };
  }

  onApplicationBootstrap(): void {
    this.sweepTimer = setInterval(() => void this.sweep(), GONE_SWEEP_MS);
    this.sweepTimer.unref();
  }

  async onModuleDestroy(): Promise<void> {
    this.destroying = true;
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
    await this.stopAll();
  }

  /** Starts the job of a channel, or answers the state of the one already running. */
  async start(channel: Channel): Promise<DetectionSnapshot> {
    const { key } = channel;
    await this.stopping.get(key);
    // Nothing starts once shutdown began: its stop pass may already be over.
    if (this.destroying || this.jobs.has(key)) return this.store.get(key);
    // A key that ended in `error` keeps its record until restarted; deleting it first also puts it last in start order.
    this.store.delete(key);
    this.store.update(key, { jobState: JobState.RETRYING, status: LiveStatus.CHECKING });
    const job = new DetectionJob(channel, this.context);
    this.jobs.set(key, job);
    job.start();
    void job.finished.then(() => {
      if (this.jobs.get(key) === job) this.jobs.delete(key);
    });
    return this.store.get(key);
  }

  /** Ends the job of a key, with whatever it started, and forgets its state. Works for a key with no job. */
  stop(key: string): Promise<void> {
    this.stopRequests.set(key, (this.stopRequests.get(key) ?? 0) + 1);
    return this.end(key);
  }

  private async end(key: string): Promise<void> {
    const job = this.jobs.get(key);
    if (job) {
      this.jobs.delete(key);
      this.store.update(key, { jobState: JobState.STOPPING });
      job.stop();
      const ended = this.waitForEnd(job, key)
        .then(() => this.store.delete(key))
        .finally(() => this.stopping.delete(key));
      this.stopping.set(key, ended);
    } else if (!this.stopping.has(key)) {
      this.store.delete(key);
    }
    await this.stopping.get(key);
  }

  /** Waits for the job to release its processes, but not longer than STOP_WAIT_MS: a stuck kill must not hold up the request. */
  private async waitForEnd(job: DetectionJob, key: string): Promise<void> {
    const timedOut = await settleWithin(
      job.finished.then(() => false),
      STOP_WAIT_MS,
      true,
    );
    if (timedOut) this.logger.warn(`Job of ${key} is slow to stop`);
  }

  isActive(key: string): boolean {
    return this.jobs.has(key);
  }

  streamUrl(key: string): string | null {
    return this.jobs.get(key)?.streamUrl ?? null;
  }

  setStreamUrl(key: string, url: string): void {
    const job = this.jobs.get(key);
    if (job) job.streamUrl = url;
  }

  /**
   * Restarts every running job from its channel as it is now, so a new detector or window mode
   * takes over. The jobs restart side by side. A job that was stopped, replaced or whose channel
   * is gone when its turn comes is left alone, and a stop asked for during its restart wins.
   */
  async restartActive(): Promise<void> {
    await Promise.all([...this.jobs.entries()].map(([key, job]) => this.restartOne(key, job)));
  }

  private async restartOne(key: string, job: DetectionJob): Promise<void> {
    try {
      const channel = await this.directory.channel(key);
      if (!channel || this.jobs.get(key) !== job) return;
      const stopsBefore = this.stopRequests.get(key);
      await this.end(key);
      if (this.stopRequests.get(key) !== stopsBefore) return;
      await this.start(channel);
    } catch (error) {
      this.logger.warn(`Cannot restart the job of ${key}: ${safeErrorMessage(error)}`);
    }
  }

  private async stopAll(): Promise<void> {
    await Promise.all([...this.jobs.keys(), ...this.stopping.keys()].map((key) => this.end(key)));
  }

  /** Ends the jobs whose channel left the list or whose backend login ended, whichever the job's own attempt has not noticed yet. */
  private async sweep(): Promise<void> {
    if (this.sweeping || this.jobs.size === 0) return;
    this.sweeping = true;
    try {
      const running = [...this.jobs.entries()];
      const present = new Set((await this.directory.channels()).map(({ key }) => key));
      const gone = running.filter(([key, job]) => !present.has(key) || job.loginEnded());
      await Promise.all(gone.map(([key]) => this.stop(key)));
    } catch (error) {
      this.logger.warn(`Job sweep failed: ${safeErrorMessage(error)}`);
    } finally {
      this.sweeping = false;
    }
  }
}
