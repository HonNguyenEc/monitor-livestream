import { join } from 'node:path';

import { Detector } from '../../../common/enums/detector.enum';
import { JobState } from '../../../common/enums/job-state.enum';
import { LiveStatus } from '../../../common/enums/live-status.enum';
import { Platform } from '../../../common/enums/platform.enum';
import { ShopSource } from '../../../common/enums/shop-source.enum';
import { framePathOf } from '../../../config/runtime-artifacts';
import { BackendSyncStore } from '../../backend';
import { DetectionStateStore } from '../../detection-state';
import { ResolveFailureCode } from '../../resolvers/enums/resolve-failure-code.enum';
import { failed, resolved, ResolveResult } from '../../resolvers/models/resolve-result.model';
import { Channel } from '../../shops';
import { GONE_SWEEP_MS, STOP_WAIT_MS } from '../constants/detection.constants';
import { DetectorEnd, DetectorRun, FrameDetector } from '../detectors/frame-detector.interface';
import { DetectionJobManager } from './detection-job.manager';

const DATA_DIR = join('C:', 'data');
const local: Channel = {
  key: 'tiktok_a',
  platform: Platform.TIKTOK,
  source: ShopSource.LOCAL,
  label: 'a',
  username: 'a',
};
const other: Channel = { ...local, key: 'tiktok_b', label: 'b', username: 'b' };
const backend: Channel = {
  ...local,
  key: 'shopee_api_x',
  platform: Platform.SHOPEE,
  source: ShopSource.BACKEND,
};

describe('DetectionJobManager', () => {
  let store: DetectionStateStore;
  let channels: Channel[];
  let epoch: number;
  let resolve: jest.Mock<Promise<ResolveResult>, []>;
  let detect: jest.Mock<Promise<DetectorEnd>, [DetectorRun]>;
  let manager: DetectionJobManager;
  let directoryOf: {
    channels: () => Promise<Channel[]>;
    channel: (key: string) => Promise<Channel | undefined>;
    toResolveRequest: (c: Channel) => Promise<object>;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    store = new DetectionStateStore();
    channels = [local, other, backend];
    epoch = 1;
    resolve = jest.fn().mockResolvedValue(resolved(['https://cdn/x.flv'], 'ok'));
    detect = jest.fn(
      ({ signal }) =>
        new Promise((done) => signal.addEventListener('abort', () => done(DetectorEnd.STOPPED))),
    );
    const detector: FrameDetector = {
      kind: Detector.FFMPEG,
      available: () => Promise.resolve(true),
      run: detect,
    };
    directoryOf = {
      channels: () => Promise.resolve(channels),
      channel: (key: string) => Promise.resolve(channels.find((c) => c.key === key)),
      toResolveRequest: (c: Channel) => Promise.resolve({ key: c.key, platform: c.platform }),
    };
    manager = new DetectionJobManager(
      store,
      directoryOf as never,
      { resolve } as never,
      { get: () => Promise.resolve({ detector: Detector.FFMPEG }) } as never,
      [detector],
      {
        get epoch() {
          return epoch;
        },
      } as unknown as BackendSyncStore,
      DATA_DIR,
    );
  });
  afterEach(async () => {
    await manager.onModuleDestroy();
    jest.useRealTimers();
  });

  it('starts a job: a retrying snapshot at once, then the work of an attempt', async () => {
    const started = await manager.start(local);

    expect(started).toMatchObject({ jobState: JobState.RETRYING, status: LiveStatus.CHECKING });
    expect(manager.isActive(local.key)).toBe(true);
    await jest.advanceTimersByTimeAsync(0);
    expect(store.get(local.key)).toMatchObject({ attempts: 1 });
    expect(detect.mock.calls[0][0].framePath).toBe(framePathOf(DATA_DIR, local.key));
  });

  it('answers the running job instead of starting a second one', async () => {
    await manager.start(local);
    await jest.advanceTimersByTimeAsync(0);

    await manager.start(local);
    await jest.advanceTimersByTimeAsync(0);

    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it('stop ends the job, aborts what it started and forgets its state, also for an unknown key', async () => {
    await manager.start(local);
    await jest.advanceTimersByTimeAsync(0);
    const aborted = detect.mock.calls[0][0].signal;

    await manager.stop(local.key);
    await manager.stop('never-started');

    expect(aborted.aborted).toBe(true);
    expect(manager.isActive(local.key)).toBe(false);
    expect(store.has(local.key)).toBe(false);
  });

  it('forgets the state of a job that ended in error when it is stopped', async () => {
    detect.mockResolvedValue(DetectorEnd.TOOL_MISSING);
    await manager.start(local);
    await jest.advanceTimersByTimeAsync(0);
    expect(store.get(local.key).jobState).toBe(JobState.ERROR);
    expect(manager.isActive(local.key)).toBe(false);

    await manager.stop(local.key);

    expect(store.has(local.key)).toBe(false);
  });

  it('starting again after an error starts a fresh job', async () => {
    detect.mockResolvedValueOnce(DetectorEnd.TOOL_MISSING);
    await manager.start(local);
    await jest.advanceTimersByTimeAsync(0);

    await manager.start(local);
    await jest.advanceTimersByTimeAsync(0);

    expect(store.get(local.key)).toMatchObject({ jobState: JobState.RETRYING, attempts: 1 });
    expect(manager.isActive(local.key)).toBe(true);
  });

  it('a start right after a stop waits until the old run is gone', async () => {
    await manager.start(local);
    await jest.advanceTimersByTimeAsync(0);
    const first = detect.mock.calls[0][0].signal;

    const stopped = manager.stop(local.key);
    const restarted = manager.start(local);
    await Promise.all([stopped, restarted]);
    await jest.advanceTimersByTimeAsync(0);

    expect(first.aborted).toBe(true);
    expect(store.get(local.key)).toMatchObject({ jobState: JobState.RETRYING, attempts: 1 });
    expect(detect).toHaveBeenCalledTimes(2);
  });

  it('restartActive restarts every running job from its channel as it is now, with a fresh attempt count', async () => {
    await manager.start(local);
    await manager.start(other);
    await jest.advanceTimersByTimeAsync(0);
    resolve.mockResolvedValue(failed(ResolveFailureCode.NOT_LIVE, 'off'));
    detect.mockClear();

    await manager.restartActive();
    await jest.advanceTimersByTimeAsync(0);

    expect(store.get(local.key).attempts).toBe(1);
    expect(store.get(other.key).attempts).toBe(1);
    expect(manager.isActive(local.key) && manager.isActive(other.key)).toBe(true);
    expect(resolve).toHaveBeenCalledTimes(4);
  });

  it('restartActive leaves a job alone whose channel is gone', async () => {
    await manager.start(local);
    channels = [];

    await manager.restartActive();

    expect(manager.isActive(local.key)).toBe(true);
  });

  describe('restartActive', () => {
    /** Makes the detector take its time to wind down once aborted, like a player being killed. */
    function slowToStop(): () => void {
      let release: () => void = () => undefined;
      const released = new Promise<void>((done) => (release = done));
      detect.mockImplementation(
        ({ signal }) =>
          new Promise((done) =>
            signal.addEventListener(
              'abort',
              () => void released.then(() => done(DetectorEnd.STOPPED)),
            ),
          ),
      );
      return release;
    }

    it('restarts the jobs side by side, so one slow kill does not hold up the others', async () => {
      const release = slowToStop();
      await manager.start(local);
      await manager.start(other);
      await jest.advanceTimersByTimeAsync(0);
      const signals = detect.mock.calls.map(([run]) => run.signal);

      const restarting = manager.restartActive();
      await jest.advanceTimersByTimeAsync(0);

      expect(signals.every((signal) => signal.aborted)).toBe(true);
      release();
      await restarting;
      expect(manager.isActive(local.key) && manager.isActive(other.key)).toBe(true);
    });

    it('leaves a job alone that was stopped while its channel was being read', async () => {
      await manager.start(local);
      await jest.advanceTimersByTimeAsync(0);
      let answer: (channel: Channel) => void = () => undefined;
      const read = new Promise<Channel>((done) => (answer = done));
      directoryOf.channel = () => read;

      const restarting = manager.restartActive();
      await manager.stop(local.key);
      answer(local);
      await restarting;
      await jest.advanceTimersByTimeAsync(0);

      expect(manager.isActive(local.key)).toBe(false);
      expect(store.has(local.key)).toBe(false);
      expect(detect).toHaveBeenCalledTimes(1);
    });

    it('leaves a job running whose channel the list no longer has', async () => {
      await manager.start(local);
      await jest.advanceTimersByTimeAsync(0);
      directoryOf.channel = () => Promise.resolve(undefined);

      await manager.restartActive();

      expect(manager.isActive(local.key)).toBe(true);
      expect(detect).toHaveBeenCalledTimes(1);
    });

    it('does not restart a job that was replaced while its channel was read', async () => {
      await manager.start(local);
      await jest.advanceTimersByTimeAsync(0);
      let answer: (channel: Channel) => void = () => undefined;
      const read = new Promise<Channel>((done) => (answer = done));
      directoryOf.channel = () => read;

      const restarting = manager.restartActive();
      await manager.stop(local.key);
      await manager.start(local);
      await jest.advanceTimersByTimeAsync(0);
      answer(local);
      await restarting;
      await jest.advanceTimersByTimeAsync(0);

      expect(detect).toHaveBeenCalledTimes(2);
      expect(manager.isActive(local.key)).toBe(true);
    });

    it('keeps restarting the other jobs when one cannot be restarted', async () => {
      await manager.start(local);
      await manager.start(other);
      await jest.advanceTimersByTimeAsync(0);
      directoryOf.channel = (key: string) =>
        key === local.key
          ? Promise.reject(new Error('shops.json locked'))
          : Promise.resolve(channels.find((c) => c.key === key));
      const aborted = detect.mock.calls.map(([run]) => run.signal);

      await manager.restartActive();
      await jest.advanceTimersByTimeAsync(0);

      expect(aborted[0].aborted).toBe(false);
      expect(aborted[1].aborted).toBe(true);
      expect(manager.isActive(other.key)).toBe(true);
    });

    it('lets a stop asked for during the restart win, instead of starting the job again', async () => {
      const release = slowToStop();
      await manager.start(local);
      await jest.advanceTimersByTimeAsync(0);

      const restarting = manager.restartActive();
      await jest.advanceTimersByTimeAsync(0);
      const stopped = manager.stop(local.key);
      release();
      await Promise.all([restarting, stopped]);
      await jest.advanceTimersByTimeAsync(0);

      expect(manager.isActive(local.key)).toBe(false);
      expect(store.has(local.key)).toBe(false);
    });
  });

  it('stops answering after STOP_WAIT_MS for a job whose process will not die, and forgets its state', async () => {
    detect.mockImplementation(() => new Promise(() => undefined));
    await manager.start(local);
    await jest.advanceTimersByTimeAsync(0);
    let answered = false;

    const stopping = manager.stop(local.key).then(() => (answered = true));
    await jest.advanceTimersByTimeAsync(STOP_WAIT_MS - 1);
    expect(answered).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await stopping;

    expect(store.has(local.key)).toBe(false);
    expect(manager.isActive(local.key)).toBe(false);
  });

  it('starts nothing once the service began shutting down', async () => {
    await manager.onModuleDestroy();

    await manager.start(local);

    expect(manager.isActive(local.key)).toBe(false);
    expect(store.has(local.key)).toBe(false);
  });

  it('keeps the last resolved stream URL of a running job', async () => {
    await manager.start(local);
    await jest.advanceTimersByTimeAsync(0);
    expect(manager.streamUrl(local.key)).toBe('https://cdn/x.flv');

    manager.setStreamUrl(local.key, 'https://cdn/fresh.flv');

    expect(manager.streamUrl(local.key)).toBe('https://cdn/fresh.flv');
    expect(manager.streamUrl(other.key)).toBeNull();
  });

  describe('sweep', () => {
    beforeEach(() => manager.onApplicationBootstrap());

    it('ends the job of a channel that left the list', async () => {
      await manager.start(local);
      await manager.start(other);
      channels = [other, backend];

      await jest.advanceTimersByTimeAsync(GONE_SWEEP_MS);

      expect(manager.isActive(local.key)).toBe(false);
      expect(store.has(local.key)).toBe(false);
      expect(manager.isActive(other.key)).toBe(true);
    });

    it('ends a backend channel job when the login epoch changes, and only that one', async () => {
      await manager.start(backend);
      await manager.start(local);
      await jest.advanceTimersByTimeAsync(0);

      epoch += 1;
      await jest.advanceTimersByTimeAsync(GONE_SWEEP_MS);

      expect(manager.isActive(backend.key)).toBe(false);
      expect(store.has(backend.key)).toBe(false);
      expect(manager.isActive(local.key)).toBe(true);
    });

    it('does not end a job that was started while the channel list was being read', async () => {
      await manager.start(local);
      let answer: (list: Channel[]) => void = () => undefined;
      directoryOf.channels = () => new Promise<Channel[]>((done) => (answer = done));
      await jest.advanceTimersByTimeAsync(GONE_SWEEP_MS);

      await manager.start(other);
      answer([local]);
      await jest.advanceTimersByTimeAsync(0);

      expect(manager.isActive(local.key)).toBe(true);
      expect(manager.isActive(other.key)).toBe(true);
    });

    it('survives a failing channel read and tries again on the next sweep', async () => {
      await manager.start(local);
      const fail = jest.spyOn(channels, 'map').mockImplementation(() => {
        throw new Error('shops.json locked');
      });
      await jest.advanceTimersByTimeAsync(GONE_SWEEP_MS);
      expect(manager.isActive(local.key)).toBe(true);
      fail.mockRestore();
      channels = [];

      await jest.advanceTimersByTimeAsync(GONE_SWEEP_MS);

      expect(manager.isActive(local.key)).toBe(false);
    });
  });

  it('stops every job when the service shuts down, and leaves no timer', async () => {
    manager.onApplicationBootstrap();
    await manager.start(local);
    await manager.start(other);
    await jest.advanceTimersByTimeAsync(0);
    const signals = detect.mock.calls.map(([run]) => run.signal);

    await manager.onModuleDestroy();

    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(store.keys()).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });
});
