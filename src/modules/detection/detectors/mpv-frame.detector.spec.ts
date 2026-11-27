import { EventEmitter } from 'node:events';
import { join } from 'node:path';

import { Logger } from '@nestjs/common';
import { Platform } from '../../../common/enums/platform.enum';
import { ShopSource } from '../../../common/enums/shop-source.enum';
import { MpvIpcClient, MpvPlayerProvider } from '../../players';
import { ChildProcessRegistry } from '../../processes';
import { LayoutSettingsStore } from '../../settings';
import { Channel } from '../../shops';
import { IMAGE_CHECK_MS, PLAYING_CHECK_MS } from '../constants/detection.constants';
import { DetectorEnd, DetectorReport, DetectorRun } from './frame-detector.interface';
import { MpvFrameDetector } from './mpv-frame.detector';

// Timers are faked, so no real file work may sit between two ticks.
jest.mock('node:fs/promises', () => ({ mkdir: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../../common/fs/replace-file-with', () => ({
  replaceFileWith: jest.fn((_destination: string, produce: (temp: string) => Promise<boolean>) =>
    produce('latest.tmp.jpg'),
  ),
}));

const DATA_DIR = join('C:', 'data');
const PLAYER = { path: 'C:\\Program Files\\MPV Player\\mpv.exe', supportsMediaControlsFlag: true };
const PID = 4242;
const channel: Channel = {
  key: 'tiktok_a',
  platform: Platform.TIKTOK,
  source: ShopSource.LOCAL,
  label: 'Shop A',
};

class FakeChild extends EventEmitter {
  pid: number | undefined = PID;
  exitCode: number | null = null;
  signalCode: string | null = null;
  exit(code = 0): void {
    this.exitCode = code;
    this.emit('exit', code);
  }
}

describe('MpvFrameDetector', () => {
  let child: FakeChild;
  let controller: AbortController;
  let frames: jest.Mock<Promise<number>, []>;
  let screenshot: jest.Mock<Promise<boolean>, [string]>;
  let ipc: {
    connect: jest.Mock;
    framesShown: jest.Mock;
    screenshotToFile: jest.Mock;
    close: jest.Mock;
  };
  let launch: jest.Mock;
  let kill: jest.Mock;
  let forget: jest.Mock;
  let settings: { get: jest.Mock };
  let playerGet: jest.Mock;
  let report: jest.Mocked<DetectorReport>;
  let detector: MpvFrameDetector;

  beforeEach(() => {
    jest.useFakeTimers();
    child = new FakeChild();
    controller = new AbortController();
    frames = jest.fn().mockResolvedValue(0);
    screenshot = jest.fn().mockResolvedValue(true);
    ipc = {
      connect: jest.fn().mockResolvedValue(undefined),
      framesShown: frames,
      screenshotToFile: screenshot,
      close: jest.fn(),
    };
    launch = jest.fn(() => child);
    kill = jest.fn().mockResolvedValue(undefined);
    forget = jest.fn();
    playerGet = jest.fn().mockResolvedValue(PLAYER);
    settings = { get: jest.fn().mockResolvedValue({ show_mpv: false }) };
    report = { checking: jest.fn(), frame: jest.fn() };
    detector = new MpvFrameDetector(
      { get: playerGet, forget } as unknown as MpvPlayerProvider,
      { launch, kill } as unknown as ChildProcessRegistry,
      () => ipc as unknown as MpvIpcClient,
      settings as unknown as LayoutSettingsStore,
      DATA_DIR,
    );
  });
  afterEach(() => jest.useRealTimers());

  const run = (): Promise<DetectorEnd> =>
    detector.run({
      channel,
      url: 'https://cdn.example/live.flv',
      signal: controller.signal,
      framePath: join(DATA_DIR, 'frames', 'latest.jpg'),
      report,
    } as DetectorRun);
  const tick = (ms: number): Promise<void> => jest.advanceTimersByTimeAsync(ms);

  it('is available exactly when a player is installed', async () => {
    expect(await detector.available()).toBe(true);

    playerGet.mockResolvedValue(null);

    expect(await detector.available()).toBe(false);
  });

  it('is tool_missing without a player, and starts nothing', async () => {
    playerGet.mockResolvedValue(null);

    expect(await run()).toBe(DetectorEnd.TOOL_MISSING);
    expect(launch).not.toHaveBeenCalled();
  });

  it('launches a hidden mpv through the registry with its own pipe and config folder', async () => {
    const ended = run();
    await tick(0);

    const [file, args] = launch.mock.calls[0];
    expect(file).toBe(PLAYER.path);
    expect(args).toEqual(
      expect.arrayContaining([
        '--vo=null',
        '--ao=null',
        '--media-controls=no',
        '--keep-open=no',
        '--title=Livestream Shop A',
        'https://cdn.example/live.flv',
      ]),
    );
    expect(args).toContainEqual(expect.stringMatching(/^--config-dir=.*mpv-config.*tiktok_a$/));
    expect(args).toContainEqual(
      expect.stringMatching(/^--input-ipc-server=\\\\\.\\pipe\\live-qc-[0-9a-f]{8}-tiktok_a$/),
    );
    controller.abort();
    await ended;
  });

  it('shows a window when show_mpv is on', async () => {
    settings.get.mockResolvedValue({ show_mpv: true });
    const ended = run();
    await tick(0);

    expect(launch.mock.calls[0][1]).toEqual(expect.arrayContaining(['--force-window=yes']));
    expect(launch.mock.calls[0][1]).not.toContain('--vo=null');
    controller.abort();
    await ended;
  });

  it('is live at the first frame within 20 s, with a picture, and stops cleanly when stopped', async () => {
    frames.mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValue(120);
    const ended = run();

    await tick(2_000);
    expect(report.frame).not.toHaveBeenCalled();
    await tick(1_000);
    expect(report.checking).toHaveBeenCalledTimes(1);
    expect(report.frame).toHaveBeenCalledWith(true);
    expect(screenshot).toHaveBeenCalledWith('latest.tmp.jpg');
    controller.abort();

    expect(await ended).toBe(DetectorEnd.STOPPED);
    expect(ipc.close).toHaveBeenCalled();
    expect(kill).toHaveBeenCalledWith(PID);
  });

  it('is no_signal when 20 s pass without a frame, and kills the player', async () => {
    const ended = run();

    await tick(IMAGE_CHECK_MS + 1_000);

    expect(await ended).toBe(DetectorEnd.NO_SIGNAL);
    expect(kill).toHaveBeenCalledWith(PID);
    expect(report.frame).not.toHaveBeenCalled();
  });

  it('is no_signal at 20 s even while a pipe connect is still pending', async () => {
    ipc.connect.mockReturnValue(new Promise(() => undefined));
    let result: DetectorEnd | undefined;
    void run().then((end) => (result = end));

    await tick(IMAGE_CHECK_MS + 100);

    expect(result).toBe(DetectorEnd.NO_SIGNAL);
  });

  it('counts IPC errors and timeouts as no frames, never as an exception', async () => {
    frames.mockRejectedValue(new Error('mpv did not answer'));
    ipc.connect.mockRejectedValue(new Error('pipe unreachable'));
    const ended = run();

    await tick(IMAGE_CHECK_MS + 1_000);

    expect(await ended).toBe(DetectorEnd.NO_SIGNAL);
  });

  it('is no_signal at once when mpv exits before showing a frame', async () => {
    const ended = run();
    await tick(1_500);

    child.exit();

    expect(await ended).toBe(DetectorEnd.NO_SIGNAL);
    expect(kill).not.toHaveBeenCalled();
  });

  it('reports frames and refreshes the picture every 30 s while the count grows', async () => {
    frames.mockResolvedValueOnce(100).mockResolvedValueOnce(900).mockResolvedValue(900);
    const ended = run();
    await tick(1_000);
    expect(report.frame).toHaveBeenCalledTimes(1);

    await tick(PLAYING_CHECK_MS);
    expect(report.frame).toHaveBeenCalledTimes(2);
    await tick(PLAYING_CHECK_MS);

    expect(await ended).toBe(DetectorEnd.LOST_FRAMES);
    expect(report.frame).toHaveBeenCalledTimes(2);
    expect(kill).toHaveBeenCalledWith(PID);
  });

  it('a window closed while playing is lost frames at once, not after the next check', async () => {
    frames.mockResolvedValue(100);
    const ended = run();
    await tick(1_000);

    child.exit();

    expect(await ended).toBe(DetectorEnd.LOST_FRAMES);
    expect(kill).not.toHaveBeenCalled();
  });

  it('keeps the previous picture when the screenshot fails', async () => {
    frames.mockResolvedValue(100);
    screenshot.mockResolvedValue(false);
    const ended = run();
    await tick(1_000);

    expect(report.frame).toHaveBeenCalledWith(false);
    controller.abort();
    await ended;
  });

  it('starts no player for a job stopped while it looked for one', async () => {
    playerGet.mockImplementation(async () => {
      controller.abort();
      return PLAYER;
    });

    expect(await run()).toBe(DetectorEnd.STOPPED);
    expect(launch).not.toHaveBeenCalled();
  });

  it.each([
    [
      'throws',
      () => {
        throw new Error('spawn failed');
      },
    ],
    ['returns a child without a pid', () => Object.assign(new FakeChild(), { pid: undefined })],
  ])(
    'is player_failed when the launch %s, and the player is looked up again next time',
    async (_c, make) => {
      launch.mockImplementation(make);

      expect(await run()).toBe(DetectorEnd.PLAYER_FAILED);
      expect(forget).toHaveBeenCalled();
      expect(ipc.close).not.toHaveBeenCalled();
    },
  );

  it('does not kill a pid that already exited', async () => {
    const ended = run();
    await tick(0);
    child.exitCode = 0;
    controller.abort();

    await ended;

    expect(kill).not.toHaveBeenCalled();
  });

  it('counts IPC trouble while playing as no frames: the stall ends the run, and the cause is logged', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    frames.mockResolvedValueOnce(100).mockRejectedValue(new Error('mpv did not answer'));
    const ended = run();
    await tick(1_000);

    await tick(PLAYING_CHECK_MS);

    expect(await ended).toBe(DetectorEnd.LOST_FRAMES);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('mpv did not answer'));
    log.mockRestore();
  });

  it('does not blame a stall on an IPC failure that a later answer cleared', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    frames.mockRejectedValueOnce(new Error('mpv did not answer')).mockResolvedValue(100);
    const ended = run();
    await tick(2_000);

    await tick(PLAYING_CHECK_MS);

    expect(await ended).toBe(DetectorEnd.LOST_FRAMES);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('no frame count change'));
    log.mockRestore();
  });

  it('says why a player that showed nothing is no_signal: its exit code, else the IPC failure', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const ended = run();
    await tick(1_500);
    child.exit(3);

    expect(await ended).toBe(DetectorEnd.NO_SIGNAL);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('exited with code 3'));

    warn.mockClear();
    child = new FakeChild();
    ipc.connect.mockRejectedValue(new Error('pipe unreachable'));
    const second = run();
    await tick(IMAGE_CHECK_MS + 1_000);
    await second;

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('pipe unreachable'));
    warn.mockRestore();
  });

  it('logs a failed picture save once, however many checks fail', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    frames.mockResolvedValueOnce(100).mockResolvedValueOnce(200).mockResolvedValue(300);
    screenshot.mockResolvedValue(false);
    const ended = run();
    await tick(1_000);
    await tick(PLAYING_CHECK_MS);
    await tick(PLAYING_CHECK_MS);

    controller.abort();
    await ended;

    expect(warn.mock.calls.filter(([text]) => String(text).includes('frame picture'))).toHaveLength(
      1,
    );
    warn.mockRestore();
  });

  it('names the real cause when the picture cannot be saved', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    frames.mockResolvedValue(100);
    screenshot.mockRejectedValue(new Error('ENOSPC: no space left'));
    const ended = run();
    await tick(1_000);

    controller.abort();
    await ended;

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ENOSPC'));
    expect(report.frame).toHaveBeenCalledWith(false);
    warn.mockRestore();
  });
});
