import { Logger } from '@nestjs/common';

import { abortableSleep } from '../../../common/concurrency/abortable-sleep';
import { JobState } from '../../../common/enums/job-state.enum';
import { LiveStatus } from '../../../common/enums/live-status.enum';
import { Platform } from '../../../common/enums/platform.enum';
import { ReasonCode } from '../../../common/enums/reason-code.enum';
import { ShopSource } from '../../../common/enums/shop-source.enum';
import { errorMessage } from '../../../common/utils/error-message';
import { retryDelayMs } from '../../../common/utils/retry-delay';
import { safeError } from '../../../common/utils/safe-error';
import { DetectionSnapshot } from '../../detection-state';
import { Channel, isCookieStoreUnreadable, isShopsFileUnreadable } from '../../shops';
import {
  COOKIE_PARK_AFTER_MISSES,
  COOKIE_PARK_POLL_MS,
  FAILED_RESOLVE_DELAY_MS,
  INTERNAL_ERROR_BACKOFF_MS,
  LOST_FRAMES_DELAY_MS,
  MAX_INTERNAL_ERROR_DELAY_MS,
  NO_SIGNAL_DELAY_MS,
} from '../constants/detection.constants';
import { DetectorEnd, DetectorReport, FrameDetector } from '../detectors/frame-detector.interface';
import { pickDetector } from '../detectors/pick-detector';
import { JobContext } from '../models/job-context.model';
import { delayAfter } from '../utils/attempt-delay';
import { cookieChanged, isCookieFailure } from '../utils/cookie-failure';
import { failureVerdict } from '../utils/failure-verdict';
import { projectJob } from '../utils/job-projection';
import {
  applyVerdict,
  LIVE_OBSERVATION,
  NO_VERDICT,
  Observation,
  VerdictState,
} from '../utils/verdict-reducer';

/** What an attempt asks the loop to do next: wait this long, or `ENDED` when the job is over. */
const ENDED = null;
type Delay = number | typeof ENDED;

type ResolveStep =
  | { kind: 'url'; url: string }
  | { kind: 'miss'; observation: Observation; cookie?: string }
  | { kind: 'cancelled' };

/**
 * One run of detection for one channel: resolve, look for frames, record the verdict, wait, repeat.
 * Its AbortController is the ownership token: a stopped run writes nothing, so a newer run of the
 * same key is never overwritten by a stale one.
 */
export class DetectionJob {
  private readonly logger = new Logger(DetectionJob.name);
  private readonly controller = new AbortController();
  private readonly key: string;
  private readonly platform: Platform;
  private readonly startEpoch: number | null;
  private verdict: VerdictState = NO_VERDICT;
  private attempts = 0;
  private cookieMisses = 0;
  private internalErrors = 0;
  private lastUrl: string | null = null;
  private done: Promise<void> = Promise.resolve();

  private readonly report: DetectorReport = {
    checking: () => this.setState(JobState.CHECKING_IMAGE),
    frame: (hasImage = true) => {
      this.record(LIVE_OBSERVATION);
      this.setState(
        JobState.PLAYING,
        hasImage ? { framePath: this.ctx.framePathOf(this.key), frameAtMs: Date.now() } : {},
      );
    },
  };

  constructor(
    channel: Channel,
    private readonly ctx: JobContext,
  ) {
    this.key = channel.key;
    this.platform = channel.platform;
    this.startEpoch = channel.source === ShopSource.BACKEND ? ctx.loginEpoch() : null;
  }

  /** Settles when the loop is over and it has asked for the processes it started to be killed. Never rejects. */
  get finished(): Promise<void> {
    return this.done;
  }

  get streamUrl(): string | null {
    return this.lastUrl;
  }

  setStreamUrl(url: string): void {
    this.lastUrl = url;
  }

  start(): void {
    this.done = this.run();
  }

  /** A backend channel's job belongs to the login it started under. */
  loginEnded(): boolean {
    return this.startEpoch !== null && this.ctx.loginEpoch() !== this.startEpoch;
  }

  stop(): void {
    this.controller.abort();
  }

  private get signal(): AbortSignal {
    return this.controller.signal;
  }

  private async run(): Promise<void> {
    try {
      for (
        let delay = await this.attemptOnce();
        delay !== ENDED;
        delay = await this.attemptOnce()
      ) {
        if (delay > 0 && !(await abortableSleep(delay, this.signal))) return;
      }
    } catch (error) {
      this.logger.error(`Job of ${this.key} stopped: ${safeError(errorMessage(error))}`);
    }
  }

  /** One pass of the loop, never a rejection. An aborted attempt and an unreadable shops.json are handled first and record no verdict; any other error is an `internal_error` verdict. */
  private async attemptOnce(): Promise<Delay> {
    try {
      const delay = await this.attempt();
      this.internalErrors = 0;
      return delay;
    } catch (error) {
      if (this.signal.aborted) return ENDED;
      if (isShopsFileUnreadable(error)) return this.channelListUnreadable();
      return this.internalError(error);
    }
  }

  private async attempt(): Promise<Delay> {
    const channel = await this.liveChannel();
    if (!channel) return this.endGone();
    const detector = pickDetector(this.ctx.detectors, (await this.ctx.settings.get()).detector);
    if (!(await detector.available())) return this.fail(ReasonCode.TOOL_MISSING);
    this.attempts += 1;
    this.setState(JobState.RETRYING, { attempts: this.attempts });
    const step = await this.resolveStream(channel);
    if (this.signal.aborted) return ENDED;
    if (step.kind === 'cancelled') return FAILED_RESOLVE_DELAY_MS[channel.platform];
    if (step.kind === 'miss') return this.afterMiss(channel, step.observation, step.cookie);
    this.cookieMisses = 0;
    this.lastUrl = step.url;
    return this.detect(channel, step.url, detector);
  }

  /** The channel as it is now, or null when it is gone or, for a backend channel, its login ended. */
  private async liveChannel(): Promise<Channel | null> {
    if (this.loginEnded()) return null;
    return (await this.ctx.directory.channel(this.key)) ?? null;
  }

  private async resolveStream(channel: Channel): Promise<ResolveStep> {
    let request;
    try {
      request = await this.ctx.directory.toResolveRequest(channel);
    } catch (error) {
      if (!isCookieStoreUnreadable(error)) throw error;
      return miss(LiveStatus.UNKNOWN, ReasonCode.COOKIE_STORE_UNREADABLE);
    }
    const result = await this.ctx.resolver.resolve({ ...request, signal: this.signal });
    if (result.ok) {
      const [url] = result.urls;
      return url ? { kind: 'url', url } : miss(LiveStatus.UNKNOWN, ReasonCode.NO_STREAM_URL);
    }
    const verdict = failureVerdict(result);
    if (!verdict) return { kind: 'cancelled' };
    return { kind: 'miss', observation: verdict, cookie: request.cookie };
  }

  private async afterMiss(
    channel: Channel,
    observation: Observation,
    cookie: string | undefined,
  ): Promise<Delay> {
    this.record(observation);
    this.setState(JobState.RETRYING);
    const delay = delayAfter(channel.platform, observation);
    if (!isCookieFailure(observation.reasonCode)) {
      this.cookieMisses = 0;
      return delay;
    }
    this.cookieMisses += 1;
    if (this.cookieMisses < COOKIE_PARK_AFTER_MISSES) return delay;
    if (!(await this.waitForCookie(channel, observation.reasonCode, cookie))) return ENDED;
    this.cookieMisses = 0;
    return 0;
  }

  /** Waits without resolving until the stored cookie can change the outcome; false when the job ends first. */
  private async waitForCookie(
    channel: Channel,
    reason: ReasonCode,
    failedCookie: string | undefined,
  ): Promise<boolean> {
    for (;;) {
      if (!(await abortableSleep(COOKIE_PARK_POLL_MS, this.signal))) return false;
      if (!(await this.liveChannel())) {
        this.endGone();
        return false;
      }
      if (cookieChanged(reason, failedCookie, await this.storedCookie(channel))) return true;
    }
  }

  private async storedCookie(
    channel: Channel,
  ): Promise<{ readable: boolean; cookie: string | undefined }> {
    try {
      const { cookie } = await this.ctx.directory.toResolveRequest(channel);
      return { readable: true, cookie };
    } catch (error) {
      if (!isCookieStoreUnreadable(error)) throw error;
      return { readable: false, cookie: undefined };
    }
  }

  private async detect(channel: Channel, url: string, detector: FrameDetector): Promise<Delay> {
    const end = await detector.run({
      channel,
      url,
      signal: this.signal,
      framePath: this.ctx.framePathOf(this.key),
      report: this.report,
    });
    switch (end) {
      case DetectorEnd.STOPPED:
        return ENDED;
      case DetectorEnd.LOST_FRAMES:
        this.setState(JobState.RETRYING);
        return LOST_FRAMES_DELAY_MS;
      case DetectorEnd.NO_SIGNAL:
        this.record({ status: LiveStatus.NO_SIGNAL, reasonCode: ReasonCode.NO_FRAMES });
        this.setState(JobState.RETRYING);
        return NO_SIGNAL_DELAY_MS;
      case DetectorEnd.TOOL_MISSING:
        return this.fail(ReasonCode.TOOL_MISSING);
      case DetectorEnd.PLAYER_FAILED:
        return this.fail(ReasonCode.PLAYER_FAILED);
    }
  }

  /** shops.json cannot be read: the channel is not known to be gone or offline, so no verdict, and the next try is the normal wait. */
  private channelListUnreadable(): Delay {
    this.logger.warn(`Cannot read the channel list for ${this.key}: the attempt is skipped`);
    return FAILED_RESOLVE_DELAY_MS[this.platform];
  }

  private internalError(error: unknown): Delay {
    this.internalErrors += 1;
    this.logger.error(`Attempt of ${this.key} failed: ${safeError(errorMessage(error))}`);
    const observation = {
      status: LiveStatus.UNKNOWN,
      reasonCode: ReasonCode.INTERNAL_ERROR,
    } as const;
    this.record(observation);
    this.setState(JobState.RETRYING);
    const normal = delayAfter(this.platform, observation);
    return retryDelayMs(
      this.internalErrors,
      [normal, ...INTERNAL_ERROR_BACKOFF_MS],
      null,
      MAX_INTERNAL_ERROR_DELAY_MS,
    );
  }

  private record(observation: Observation): void {
    const before = this.verdict.status;
    this.verdict = applyVerdict(this.verdict, observation, Date.now());
    if (before !== this.verdict.status) {
      this.logger.log(`${this.key}: ${before} -> ${this.verdict.status}`);
    }
  }

  private setState(jobState: JobState, extra: Partial<DetectionSnapshot> = {}): void {
    this.write({ ...projectJob(jobState, this.verdict), ...extra });
  }

  /** The job ends in `error`: it stops retrying, and starting it again retries. */
  private fail(reasonCode: ReasonCode): Delay {
    this.write({ ...projectJob(JobState.ERROR, this.verdict), reasonCode });
    this.logger.warn(`Job of ${this.key} ended: ${reasonCode}`);
    return ENDED;
  }

  private endGone(): Delay {
    if (!this.signal.aborted) this.ctx.store.delete(this.key);
    return ENDED;
  }

  private write(changes: Partial<DetectionSnapshot>): void {
    if (!this.signal.aborted) this.ctx.store.update(this.key, changes);
  }
}

function miss(status: Observation['status'], reasonCode: ReasonCode): ResolveStep {
  return { kind: 'miss', observation: { status, reasonCode } };
}
