import { Platform } from '../../../common/enums/platform.enum';
import { ShopSource } from '../../../common/enums/shop-source.enum';
import { DetectionControl } from '../../detection-state';
import { Channel } from '../../shops';
import { MONITOR_PASS_MS, MONITOR_START_STAGGER_MS } from '../constants/monitor.constants';
import { MonitorSelection } from '../models/monitor-selection.model';
import { MonitorSupervisor } from './monitor-supervisor';

const channel = (key: string, platform = Platform.TIKTOK): Channel => ({
  key,
  platform,
  source: ShopSource.LOCAL,
  label: key,
});
const A = channel('tiktok_a');
const B = channel('tiktok_b');
const C = channel('tiktok_c');
const SHOPEE = channel('shopee_a', Platform.SHOPEE);
const ALL_TIKTOK: MonitorSelection = { platforms: [Platform.TIKTOK], keys: null };

describe('MonitorSupervisor', () => {
  let channels: Channel[];
  let running: Set<string>;
  let started: string[];
  let supervisor: MonitorSupervisor;
  let control: DetectionControl;
  let directory: { channels: jest.Mock };
  let detection: { startChannel: jest.Mock; stop: jest.Mock; isActive: jest.Mock };

  beforeEach(() => {
    jest.useFakeTimers();
    channels = [A, B, C, SHOPEE];
    running = new Set();
    started = [];
    directory = { channels: jest.fn(() => Promise.resolve(channels)) };
    detection = {
      startChannel: jest.fn((c: Channel) => {
        running.add(c.key);
        started.push(c.key);
        return Promise.resolve();
      }),
      stop: jest.fn((key: string) => {
        running.delete(key);
        return Promise.resolve();
      }),
      isActive: jest.fn((key: string) => running.has(key)),
    };
    control = new DetectionControl();
    supervisor = new MonitorSupervisor(directory as never, detection as never, control);
    supervisor.onModuleInit();
  });
  afterEach(async () => {
    await supervisor.end();
    jest.useRealTimers();
  });

  const tick = (ms: number): Promise<void> => jest.advanceTimersByTimeAsync(ms);

  it('starts a job for every wanted channel at once, then one every 2 s', async () => {
    supervisor.begin(ALL_TIKTOK);

    await tick(0);
    expect(started).toEqual(['tiktok_a']);
    await tick(MONITOR_START_STAGGER_MS);
    expect(started).toEqual(['tiktok_a', 'tiktok_b']);
    await tick(MONITOR_START_STAGGER_MS);

    expect(started).toEqual(['tiktok_a', 'tiktok_b', 'tiktok_c']);
  });

  it('watches only the listed keys, and none for an empty list', async () => {
    supervisor.begin({ platforms: [Platform.TIKTOK], keys: new Set(['tiktok_b']) });
    await tick(0);
    expect(started).toEqual(['tiktok_b']);

    supervisor.begin({ platforms: [Platform.TIKTOK], keys: new Set() });
    await tick(0);

    expect(detection.stop).toHaveBeenCalledWith('tiktok_b');
    expect(running.size).toBe(0);
  });

  it('applies a changed selection at once, stopping what left it and starting what joined', async () => {
    supervisor.begin({ platforms: [Platform.TIKTOK], keys: new Set(['tiktok_a']) });
    await tick(0);

    supervisor.begin({ platforms: [Platform.TIKTOK], keys: new Set(['tiktok_b']) });
    await tick(0);

    expect([...running]).toEqual(['tiktok_b']);
  });

  it('adopts a job started by hand: it is not started again, and stops with the monitor', async () => {
    running.add('tiktok_a');

    supervisor.begin({ platforms: [Platform.TIKTOK], keys: new Set(['tiktok_a', 'tiktok_b']) });
    await tick(0);
    expect(started).toEqual(['tiktok_b']);
    await supervisor.end();

    expect(running.size).toBe(0);
  });

  it('leaves a job of a channel outside the selection alone, also when the monitor stops', async () => {
    running.add('shopee_a');

    supervisor.begin(ALL_TIKTOK);
    await tick(10_000);
    await supervisor.end();

    expect(running.has('shopee_a')).toBe(true);
  });

  it('does not restart a job that ended on its own or that the operator stopped', async () => {
    supervisor.begin({ platforms: [Platform.TIKTOK], keys: new Set(['tiktok_a']) });
    await tick(0);
    running.delete('tiktok_a');

    await tick(MONITOR_PASS_MS * 3);

    expect(started).toEqual(['tiktok_a']);
  });

  it('follows the channel list: a channel added starts, one removed stops', async () => {
    channels = [A];
    supervisor.begin(ALL_TIKTOK);
    await tick(0);

    channels = [B];
    await tick(MONITOR_PASS_MS);
    await tick(0);

    expect(started).toEqual(['tiktok_a', 'tiktok_b']);
    expect([...running]).toEqual(['tiktok_b']);
  });

  it('a channel that left and comes back is started again', async () => {
    channels = [A];
    supervisor.begin(ALL_TIKTOK);
    await tick(0);
    channels = [];
    await tick(MONITOR_PASS_MS);
    channels = [A];

    await tick(MONITOR_PASS_MS);

    expect(started).toEqual(['tiktok_a', 'tiktok_a']);
  });

  it('stops nothing and tries again when the channel list cannot be read', async () => {
    channels = [A];
    supervisor.begin(ALL_TIKTOK);
    await tick(0);
    directory.channels.mockRejectedValueOnce(new Error('shops.json locked'));

    await tick(MONITOR_PASS_MS);
    expect(running.has('tiktok_a')).toBe(true);
    channels = [A, B];
    await tick(MONITOR_PASS_MS);
    await tick(0);

    expect(started).toEqual(['tiktok_a', 'tiktok_b']);
  });

  it('never runs two passes at once, even when one takes longer than the interval', async () => {
    let inside = 0;
    let overlapped = false;
    directory.channels.mockImplementation(async () => {
      inside += 1;
      overlapped ||= inside > 1;
      await new Promise((resolve) => setTimeout(resolve, MONITOR_PASS_MS * 2));
      inside -= 1;
      return [];
    });

    supervisor.begin(ALL_TIKTOK);
    await tick(MONITOR_PASS_MS * 12);

    expect(overlapped).toBe(false);
    expect(directory.channels.mock.calls.length).toBeGreaterThan(1);
    const ending = supervisor.end();
    await tick(MONITOR_PASS_MS * 2);
    await ending;
  });

  it('a stop during a start queue ends the queue and leaves no job behind', async () => {
    supervisor.begin(ALL_TIKTOK);
    await tick(0);
    expect(running.size).toBe(1);

    await supervisor.end();
    await tick(MONITOR_PASS_MS * 5);

    expect(running.size).toBe(0);
    expect(started).toEqual(['tiktok_a']);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('cuts a start queue short when the selection changes, instead of waiting out the stagger', async () => {
    supervisor.begin(ALL_TIKTOK);
    await tick(0);

    supervisor.begin({ platforms: [Platform.TIKTOK], keys: new Set(['tiktok_c']) });
    await tick(0);
    await tick(0);

    expect(running.has('tiktok_c')).toBe(true);
    expect(running.has('tiktok_a')).toBe(false);
  });

  it('a start after a stop begins from nothing started', async () => {
    supervisor.begin({ platforms: [Platform.TIKTOK], keys: new Set(['tiktok_a']) });
    await tick(0);
    await supervisor.end();

    supervisor.begin({ platforms: [Platform.TIKTOK], keys: new Set(['tiktok_a']) });
    await tick(0);

    expect(started).toEqual(['tiktok_a', 'tiktok_a']);
  });

  it('a rename moves a keyed selection to the new key, and the job starts under it', async () => {
    supervisor.begin({ platforms: [Platform.TIKTOK], keys: new Set(['tiktok_a']) });
    await tick(0);
    const renamed = channel('tiktok_z');
    channels = [renamed, B, C];

    await control.rename('tiktok_a', 'tiktok_z');
    await tick(0);

    expect(supervisor.current?.keys).toEqual(new Set(['tiktok_z']));
    expect(started).toEqual(['tiktok_a', 'tiktok_z']);
  });

  it('a rename leaves a selection of every shop, and one that does not name the key, as it is', async () => {
    supervisor.begin(ALL_TIKTOK);
    await control.rename('tiktok_a', 'tiktok_z');
    expect(supervisor.current?.keys).toBeNull();

    supervisor.begin({ platforms: [Platform.TIKTOK], keys: new Set(['tiktok_b']) });
    await control.rename('tiktok_a', 'tiktok_z');

    expect(supervisor.current?.keys).toEqual(new Set(['tiktok_b']));
  });

  it('survives a job that cannot start, and tries it on the next pass', async () => {
    detection.startChannel.mockRejectedValueOnce(new Error('boom'));
    channels = [A];

    supervisor.begin(ALL_TIKTOK);
    await tick(0);
    await tick(MONITOR_START_STAGGER_MS);
    await tick(MONITOR_PASS_MS);

    expect(running.has('tiktok_a')).toBe(true);
  });

  it('stops the deselected jobs side by side', async () => {
    supervisor.begin(ALL_TIKTOK);
    await tick(MONITOR_START_STAGGER_MS * 3);
    const finishers: Array<() => void> = [];
    detection.stop.mockImplementation(
      (key: string) =>
        new Promise<void>((done) =>
          finishers.push(() => {
            running.delete(key);
            done();
          }),
        ),
    );

    supervisor.begin({ platforms: [Platform.TIKTOK], keys: new Set() });
    await tick(0);

    expect(finishers).toHaveLength(3);
    finishers.forEach((finish) => finish());
  });

  it('a stop does not wait for a pass that is stuck reading the channel list', async () => {
    directory.channels.mockImplementation(() => new Promise(() => undefined));
    supervisor.begin(ALL_TIKTOK);
    await tick(0);

    await supervisor.end();

    expect(supervisor.current).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('stops a job whose start finished after the monitor was stopped', async () => {
    let finishStart: () => void = () => undefined;
    detection.startChannel.mockImplementation(
      (c: Channel) =>
        new Promise<void>((done) => {
          finishStart = () => {
            running.add(c.key);
            done();
          };
        }),
    );
    supervisor.begin({ platforms: [Platform.TIKTOK], keys: new Set(['tiktok_a']) });
    await tick(0);

    await supervisor.end();
    expect(running.size).toBe(0);
    finishStart();
    await tick(0);

    expect(running.size).toBe(0);
    expect(detection.stop).toHaveBeenCalledWith('tiktok_a');
    expect(detection.stop.mock.calls.length).toBe(2);
  });

  describe('a pass that outlives its run', () => {
    let release: () => void;
    let oldPassChannels: Channel[];

    beforeEach(async () => {
      oldPassChannels = [A];
      directory.channels.mockImplementationOnce(
        () =>
          new Promise<Channel[]>((done) => {
            release = () => done(oldPassChannels);
          }),
      );
      supervisor.begin({ platforms: [Platform.TIKTOK], keys: new Set(['tiktok_a']) });
      await tick(0);
      await supervisor.end();
    });

    it('starts and stops nothing, and leaves the next run its own set of started channels', async () => {
      supervisor.begin({ platforms: [Platform.TIKTOK], keys: new Set(['tiktok_b']) });
      await tick(0);
      release();
      await tick(0);
      await tick(0);

      expect(started).toEqual(['tiktok_b']);
      expect([...running]).toEqual(['tiktok_b']);
      expect(detection.stop).not.toHaveBeenCalledWith('tiktok_b');
    });

    it('is over before the next run reads the list, so two passes never overlap', async () => {
      supervisor.begin({ platforms: [Platform.TIKTOK], keys: new Set(['tiktok_b']) });
      await tick(0);
      expect(directory.channels).toHaveBeenCalledTimes(1);

      release();
      await tick(0);
      await tick(0);

      expect(directory.channels).toHaveBeenCalledTimes(2);
    });
  });

  it('a rename under a selection of every shop stops the old key and starts the new one', async () => {
    channels = [A];
    supervisor.begin(ALL_TIKTOK);
    await tick(0);
    channels = [channel('tiktok_z')];

    await control.rename('tiktok_a', 'tiktok_z');
    await tick(MONITOR_PASS_MS);

    expect([...running]).toEqual(['tiktok_z']);
    expect(started).toEqual(['tiktok_a', 'tiktok_z']);
  });

  it('ending twice, or before any start, is harmless', async () => {
    await supervisor.end();
    supervisor.begin(ALL_TIKTOK);
    await supervisor.end();
    await supervisor.end();

    expect(supervisor.current).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });
});
