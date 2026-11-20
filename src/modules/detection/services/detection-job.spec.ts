import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { Detector } from '../../../common/enums/detector.enum';
import { JobState } from '../../../common/enums/job-state.enum';
import { LiveStatus } from '../../../common/enums/live-status.enum';
import { Platform } from '../../../common/enums/platform.enum';
import { ReasonCode } from '../../../common/enums/reason-code.enum';
import { ShopSource } from '../../../common/enums/shop-source.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { DetectionStateStore } from '../../detection-state';
import { ResolveFailureCode } from '../../resolvers/enums/resolve-failure-code.enum';
import { failed, resolved, ResolveResult } from '../../resolvers/models/resolve-result.model';
import { Channel } from '../../shops';
import { DetectorEnd, DetectorRun, FrameDetector } from '../detectors/frame-detector.interface';
import { JobContext } from '../models/job-context.model';
import { DetectionJob } from './detection-job';

const FRAME_PATH = 'C:/data/runtime/frames/k/latest.jpg';
const STREAM = 'https://cdn.example/live.flv';
const NOT_LIVE = failed(ResolveFailureCode.NOT_LIVE, 'off');
const SECOND = 1000;

const tiktok: Channel = {
  key: 'tiktok_a',
  platform: Platform.TIKTOK,
  source: ShopSource.LOCAL,
  label: 'a',
  username: 'a',
};
const shopee: Channel = { ...tiktok, key: 'shopee_a', platform: Platform.SHOPEE, userId: 7 };
const backend: Channel = { ...shopee, key: 'shopee_api_x', source: ShopSource.BACKEND };

interface Rig {
  store: DetectionStateStore;
  resolve: jest.Mock<Promise<ResolveResult>, [{ signal?: AbortSignal }]>;
  detect: jest.Mock<Promise<DetectorEnd>, [DetectorRun]>;
  available: jest.Mock<Promise<boolean>, []>;
  channel: jest.Mock<Promise<Channel | undefined>, [string]>;
  toResolveRequest: jest.Mock;
  epoch: { value: number };
  job: DetectionJob;
}

function rig(channel: Channel = tiktok): Rig {
  const store = new DetectionStateStore();
  const resolve = jest.fn<Promise<ResolveResult>, [{ signal?: AbortSignal }]>();
  const detect = jest.fn<Promise<DetectorEnd>, [DetectorRun]>();
  const available = jest.fn<Promise<boolean>, []>().mockResolvedValue(true);
  const channelOf = jest.fn<Promise<Channel | undefined>, [string]>().mockResolvedValue(channel);
  const toResolveRequest = jest.fn(async (c: Channel) => ({ key: c.key, platform: c.platform }));
  const epoch = { value: 1 };
  const detector: FrameDetector = { kind: Detector.FFMPEG, available, run: detect };
  const ctx = {
    store,
    directory: { channel: channelOf, toResolveRequest },
    resolver: { resolve },
    settings: { get: () => Promise.resolve({ detector: Detector.FFMPEG }) },
    detectors: [detector],
    loginEpoch: () => epoch.value,
    framePathOf: () => FRAME_PATH,
  } as unknown as JobContext;
  const job = new DetectionJob(channel, ctx);
  store.update(channel.key, { jobState: JobState.RETRYING, status: LiveStatus.CHECKING });
  return { store, resolve, detect, available, channel: channelOf, toResolveRequest, epoch, job };
}

const advance = (ms: number): Promise<void> => jest.advanceTimersByTimeAsync(ms);

describe('DetectionJob', () => {
  let current: Rig;

  beforeEach(() => jest.useFakeTimers());
  afterEach(async () => {
    current?.job.stop();
    await current?.job.finished;
    jest.useRealTimers();
  });

  function begin(channel?: Channel): Rig {
    current = rig(channel);
    return current;
  }

  it('records an offline verdict from a failed resolve and waits the platform delay', async () => {
    const { job, store, resolve } = begin();
    resolve.mockResolvedValue(NOT_LIVE);

    job.start();
    await advance(0);

    expect(store.get(tiktok.key)).toMatchObject({
      jobState: JobState.RETRYING,
      status: LiveStatus.OFFLINE,
      reasonCode: ReasonCode.NOT_LIVE,
      attempts: 1,
      message: null,
    });
    await advance(19 * SECOND);
    expect(resolve).toHaveBeenCalledTimes(1);
    await advance(1 * SECOND);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(store.get(tiktok.key).attempts).toBe(2);
  });

  it('waits the shorter delay of another failed resolve, and longer for Shopee', async () => {
    const { job, resolve } = begin(shopee);
    resolve.mockResolvedValue(failed(ResolveFailureCode.BACKEND_ERROR, 'x'));

    job.start();
    await advance(14 * SECOND);
    expect(resolve).toHaveBeenCalledTimes(1);
    await advance(1 * SECOND);

    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('is live while the detector sees frames, with the frame recorded', async () => {
    const { job, store, resolve, detect } = begin();
    resolve.mockResolvedValue(resolved([STREAM], 'ok'));
    detect.mockImplementation(async ({ report, signal }) => {
      report.checking();
      expect(store.get(tiktok.key)).toMatchObject({ jobState: JobState.CHECKING_IMAGE });
      report.frame();
      await new Promise((done) => signal.addEventListener('abort', done));
      return DetectorEnd.STOPPED;
    });

    job.start();
    await advance(0);

    expect(store.get(tiktok.key)).toMatchObject({
      jobState: JobState.PLAYING,
      status: LiveStatus.LIVE,
      reasonCode: null,
      framePath: FRAME_PATH,
      frameAtMs: expect.any(Number),
      liveSince: expect.any(String),
    });
    expect(detect.mock.calls[0][0]).toMatchObject({ url: STREAM, framePath: FRAME_PATH });
  });

  it('lost frames record no verdict: the channel stays live and the job resolves again after 3 s', async () => {
    const { job, store, resolve, detect } = begin();
    resolve.mockResolvedValueOnce(resolved([STREAM], 'ok')).mockResolvedValue(NOT_LIVE);
    detect.mockImplementationOnce(async ({ report }) => {
      report.frame();
      return DetectorEnd.LOST_FRAMES;
    });

    job.start();
    await advance(0);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(store.get(tiktok.key)).toMatchObject({
      status: LiveStatus.LIVE,
      jobState: JobState.RETRYING,
    });
    await advance(3 * SECOND);

    expect(resolve).toHaveBeenCalledTimes(2);
    expect(store.get(tiktok.key)).toMatchObject({ status: LiveStatus.LIVE, attempts: 2 });
  });

  it('reports a live channel as not live only after its 2nd miss in a row', async () => {
    const { job, store, resolve, detect } = begin();
    resolve.mockResolvedValueOnce(resolved([STREAM], 'ok')).mockResolvedValue(NOT_LIVE);
    detect.mockImplementationOnce(async ({ report }) => {
      report.frame();
      return DetectorEnd.LOST_FRAMES;
    });

    job.start();
    await advance(0);
    expect(store.get(tiktok.key)).toMatchObject({ status: LiveStatus.LIVE, reasonCode: null });
    await advance(23 * SECOND);

    expect(store.get(tiktok.key)).toMatchObject({
      status: LiveStatus.OFFLINE,
      reasonCode: ReasonCode.NOT_LIVE,
      liveSince: null,
    });
  });

  it('opened but no frames is no_signal, retried after 3 s', async () => {
    const { job, store, resolve, detect } = begin();
    resolve.mockResolvedValue(resolved([STREAM], 'ok'));
    detect.mockResolvedValue(DetectorEnd.NO_SIGNAL);

    job.start();
    await advance(0);

    expect(store.get(tiktok.key)).toMatchObject({
      status: LiveStatus.NO_SIGNAL,
      reasonCode: ReasonCode.NO_FRAMES,
      jobState: JobState.RETRYING,
    });
    await advance(2 * SECOND);
    expect(resolve).toHaveBeenCalledTimes(1);
    await advance(1 * SECOND);
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('a missing tool ends the job before any resolve, whatever the channel does', async () => {
    const { job, store, resolve, available } = begin();
    available.mockResolvedValue(false);

    job.start();
    await advance(0);
    await job.finished;

    expect(store.get(tiktok.key)).toMatchObject({
      jobState: JobState.ERROR,
      reasonCode: ReasonCode.TOOL_MISSING,
      attempts: 0,
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('notices a tool that went missing between two attempts', async () => {
    const { job, store, resolve, available } = begin();
    resolve.mockResolvedValue(NOT_LIVE);

    job.start();
    await advance(0);
    available.mockResolvedValue(false);
    await advance(20 * SECOND);

    expect(store.get(tiktok.key)).toMatchObject({
      jobState: JobState.ERROR,
      reasonCode: ReasonCode.TOOL_MISSING,
    });
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it.each([
    [DetectorEnd.TOOL_MISSING, ReasonCode.TOOL_MISSING],
    [DetectorEnd.PLAYER_FAILED, ReasonCode.PLAYER_FAILED],
  ])('a detector that ends %s puts the job in error and stops it retrying', async (end, reason) => {
    const { job, store, resolve, detect } = begin();
    resolve.mockResolvedValue(resolved([STREAM], 'ok'));
    detect.mockResolvedValue(end);

    job.start();
    await advance(0);
    await job.finished;
    await advance(10 * 60 * SECOND);

    expect(store.get(tiktok.key)).toMatchObject({
      jobState: JobState.ERROR,
      status: LiveStatus.NOT_CHECKED,
      reasonCode: reason,
      message: null,
      checkedAt: null,
      liveSince: null,
    });
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('a resolve cancelled by a stop records no verdict and writes nothing more', async () => {
    const { job, store, resolve } = begin();
    resolve.mockImplementation(
      ({ signal }) =>
        new Promise((done) =>
          signal?.addEventListener('abort', () =>
            done(failed(ResolveFailureCode.CANCELLED, 'cancelled')),
          ),
        ),
    );
    job.start();
    await advance(0);
    const before = { ...store.get(tiktok.key) };

    job.stop();
    await job.finished;

    expect(store.get(tiktok.key)).toEqual(before);
    expect(before.status).toBe(LiveStatus.CHECKING);
  });

  it('a stopped run never overwrites what a newer run of the key wrote', async () => {
    const { job, store, resolve } = begin();
    let finish: (result: ResolveResult) => void = () => undefined;
    resolve.mockImplementation(() => new Promise((done) => (finish = done)));
    job.start();
    await advance(0);

    job.stop();
    store.delete(tiktok.key);
    store.update(tiktok.key, { jobState: JobState.RETRYING, status: LiveStatus.CHECKING });
    finish(NOT_LIVE);
    await job.finished;

    expect(store.get(tiktok.key)).toMatchObject({ status: LiveStatus.CHECKING, attempts: 0 });
  });

  it('turns an unexpected exception into unknown / internal_error and backs off when it repeats', async () => {
    const { job, store, resolve } = begin();
    resolve.mockRejectedValue(new Error('boom'));

    job.start();
    await advance(0);
    expect(store.get(tiktok.key)).toMatchObject({
      status: LiveStatus.UNKNOWN,
      reasonCode: ReasonCode.INTERNAL_ERROR,
      jobState: JobState.RETRYING,
    });
    await advance(5 * SECOND);
    expect(resolve).toHaveBeenCalledTimes(2);
    await advance(29 * SECOND);
    expect(resolve).toHaveBeenCalledTimes(2);
    await advance(1 * SECOND);

    expect(resolve).toHaveBeenCalledTimes(3);
  });

  it('is unknown / cookie_store_unreadable when the cookie file cannot be read', async () => {
    const { job, store, toResolveRequest, resolve } = begin(shopee);
    toResolveRequest.mockRejectedValue(
      new DomainException(ErrorCode.COOKIES_FILE_UNREADABLE, 'unreadable'),
    );

    job.start();
    await advance(0);

    expect(store.get(shopee.key)).toMatchObject({
      status: LiveStatus.UNKNOWN,
      reasonCode: ReasonCode.COOKIE_STORE_UNREADABLE,
    });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('a resolve that comes back cancelled without a stop records no verdict and is tried again after the normal wait', async () => {
    const { job, store, resolve } = begin(shopee);
    resolve.mockResolvedValue(failed(ResolveFailureCode.CANCELLED, 'cancelled'));

    job.start();
    await advance(0);

    expect(store.get(shopee.key)).toMatchObject({ status: LiveStatus.CHECKING, attempts: 1 });
    await advance(15 * SECOND);
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  it('an unreadable shops.json is no verdict: a live channel stays live, and the next try is after the normal wait', async () => {
    const { job, store, resolve, detect, channel } = begin();
    resolve.mockResolvedValueOnce(resolved([STREAM], 'ok')).mockResolvedValue(NOT_LIVE);
    detect.mockImplementationOnce(async ({ report }) => {
      report.frame();
      return DetectorEnd.LOST_FRAMES;
    });
    job.start();
    await advance(0);
    channel.mockRejectedValue(new DomainException(ErrorCode.SHOPS_FILE_UNREADABLE, 'unreadable'));

    await advance(3 * SECOND);

    expect(store.get(tiktok.key)).toMatchObject({ status: LiveStatus.LIVE, reasonCode: null });
    channel.mockResolvedValue(tiktok);
    await advance(5 * SECOND);
    expect(resolve).toHaveBeenCalledTimes(2);
  });

  describe('a cookie failure', () => {
    const MISSING = failed(ResolveFailureCode.MISSING_COOKIE, 'none');

    it('retries once, then waits for the cookie to change instead of retrying every 15 s', async () => {
      const { job, store, resolve, toResolveRequest } = begin(shopee);
      resolve.mockResolvedValue(MISSING);

      job.start();
      await advance(15 * SECOND);
      expect(resolve).toHaveBeenCalledTimes(2);
      await advance(5 * 60 * SECOND);

      expect(resolve).toHaveBeenCalledTimes(2);
      expect(store.get(shopee.key)).toMatchObject({
        status: LiveStatus.UNKNOWN,
        reasonCode: ReasonCode.COOKIE_MISSING,
      });
      toResolveRequest.mockResolvedValue({
        key: shopee.key,
        platform: Platform.SHOPEE,
        cookie: 'SPC_SC_SESSION=new',
      });
      resolve.mockResolvedValue(NOT_LIVE);
      await advance(5 * SECOND);
      expect(resolve).toHaveBeenCalledTimes(3);
    });

    it('stays parked while the refused cookie is unchanged', async () => {
      const { job, resolve, toResolveRequest } = begin(shopee);
      const request = { key: shopee.key, platform: Platform.SHOPEE, cookie: 'SPC_SC_SESSION=old' };
      toResolveRequest.mockResolvedValue(request);
      resolve.mockResolvedValue(failed(ResolveFailureCode.SELLER_CENTER_AUTH_FAILED, 'refused'));

      job.start();
      await advance(15 * SECOND);
      await advance(60 * SECOND);
      expect(resolve).toHaveBeenCalledTimes(2);

      toResolveRequest.mockResolvedValue({ ...request, cookie: 'SPC_SC_SESSION=fresh' });
      await advance(5 * SECOND);

      expect(resolve).toHaveBeenCalledTimes(3);
    });

    it('parks on an unreadable cookie file and resumes once it reads again', async () => {
      const { job, store, resolve, toResolveRequest } = begin(shopee);
      const unreadable = new DomainException(ErrorCode.COOKIES_FILE_UNREADABLE, 'unreadable');
      toResolveRequest.mockRejectedValue(unreadable);

      job.start();
      await advance(15 * SECOND);
      await advance(5 * 60 * SECOND);

      expect(resolve).not.toHaveBeenCalled();
      expect(store.get(shopee.key)).toMatchObject({
        status: LiveStatus.UNKNOWN,
        reasonCode: ReasonCode.COOKIE_STORE_UNREADABLE,
      });
      toResolveRequest.mockResolvedValue({ key: shopee.key, platform: Platform.SHOPEE });
      resolve.mockResolvedValue(NOT_LIVE);
      await advance(5 * SECOND);

      expect(resolve).toHaveBeenCalledTimes(1);
    });

    it('ends when the channel disappears while parked', async () => {
      const { job, store, resolve, channel } = begin(shopee);
      resolve.mockResolvedValue(MISSING);
      job.start();
      await advance(15 * SECOND);

      channel.mockResolvedValue(undefined);
      await advance(5 * SECOND);
      await job.finished;

      expect(store.has(shopee.key)).toBe(false);
    });
  });

  describe('lifecycle', () => {
    it('ends and forgets its state when the channel no longer exists', async () => {
      const { job, store, resolve, channel } = begin();
      channel.mockResolvedValue(undefined);

      job.start();
      await job.finished;

      expect(store.has(tiktok.key)).toBe(false);
      expect(resolve).not.toHaveBeenCalled();
    });

    it('ends a backend channel job when the login epoch changed', async () => {
      const { job, store, resolve, epoch } = begin(backend);
      resolve.mockResolvedValue(NOT_LIVE);
      job.start();
      await advance(0);
      expect(job.loginEnded()).toBe(false);

      epoch.value += 1;
      await advance(60 * SECOND);
      await job.finished;

      expect(job.loginEnded()).toBe(true);
      expect(store.has(backend.key)).toBe(false);
      expect(resolve).toHaveBeenCalledTimes(1);
    });

    it('does not tie a local channel to the login', async () => {
      const { job, epoch } = begin();
      epoch.value += 1;

      expect(job.loginEnded()).toBe(false);
    });

    it('keeps the last resolved URL for the wall', async () => {
      const { job, resolve, detect } = begin();
      resolve.mockResolvedValue(resolved([STREAM], 'ok'));
      detect.mockImplementation(
        ({ signal }) =>
          new Promise((done) => signal.addEventListener('abort', () => done(DetectorEnd.STOPPED))),
      );

      job.start();
      await advance(0);

      expect(job.streamUrl).toBe(STREAM);
    });
  });
});
