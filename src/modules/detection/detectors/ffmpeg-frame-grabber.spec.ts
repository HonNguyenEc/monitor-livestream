import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { Logger } from '@nestjs/common';
import * as hiddenProcess from '../../../common/process/hidden-process';
import { RunResult } from '../../../common/process/hidden-process';
import { ToolLocator } from '../../processes';
import { FfmpegFrameGrabber, GrabOutcome } from './ffmpeg-frame-grabber';
import { createDataDir, removeDataDir } from '../../../../test/helpers/data-dir';

const OK: RunResult = { exitCode: 0, stdout: '', stderr: '', timedOut: false };

describe('FfmpegFrameGrabber', () => {
  const find = jest.fn<Promise<string | null>, []>();
  const grabber = new FfmpegFrameGrabber({ find } as unknown as ToolLocator);
  const live = (): AbortSignal => new AbortController().signal;
  let dir: string;
  let destination: string;
  let run: jest.SpyInstance<Promise<RunResult>, Parameters<typeof hiddenProcess.runHidden>>;

  /** Stands in for ffmpeg: writes `content` to the output argument, the last one. */
  const ffmpegWrites = (content: string, result: RunResult = OK): void => {
    run.mockImplementation(async (_file, args) => {
      await writeFile(args[args.length - 1], content);
      return result;
    });
  };

  beforeEach(async () => {
    dir = await createDataDir({});
    destination = join(dir, 'frames', 'k', 'latest.jpg');
    find.mockResolvedValue('C:/tools/ffmpeg.exe');
    run = jest.spyOn(hiddenProcess, 'runHidden').mockResolvedValue(OK);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await removeDataDir(dir);
  });

  it('moves a finished frame into place and leaves no temp file', async () => {
    ffmpegWrites('JPEG');

    const outcome = await grabber.grab('https://cdn/x.flv', destination, live());

    expect(outcome).toBe(GrabOutcome.FRAME);
    expect(await readFile(destination, 'utf8')).toBe('JPEG');
    expect(await readdir(join(dir, 'frames', 'k'))).toEqual(['latest.jpg']);
  });

  it('asks ffmpeg for one frame with a read timeout, writing to a temp name, not the destination', async () => {
    ffmpegWrites('JPEG');

    await grabber.grab('https://cdn/x.flv', destination, live());

    const [, args, options] = run.mock.calls[0];
    expect(args).toEqual(expect.arrayContaining(['-frames:v', '1', '-i', 'https://cdn/x.flv']));
    expect(args).toContain('-rw_timeout');
    expect(args[args.length - 1]).not.toBe(destination);
    expect(options.timeoutMs).toBe(20_000);
  });

  it('keeps the previous frame when ffmpeg fails or writes nothing', async () => {
    await mkdir(join(dir, 'frames', 'k'), { recursive: true });
    await writeFile(destination, 'OLD');

    ffmpegWrites('partial', { ...OK, exitCode: 1 });
    expect(await grabber.grab('u', destination, live())).toBe(GrabOutcome.NO_FRAME);
    ffmpegWrites('');
    expect(await grabber.grab('u', destination, live())).toBe(GrabOutcome.NO_FRAME);
    run.mockResolvedValue(OK);
    expect(await grabber.grab('u', destination, live())).toBe(GrabOutcome.NO_FRAME);

    expect(await readFile(destination, 'utf8')).toBe('OLD');
    expect(await readdir(join(dir, 'frames', 'k'))).toEqual(['latest.jpg']);
  });

  it('writes nothing for a grab that was aborted', async () => {
    const controller = new AbortController();
    run.mockImplementation(async (_file, args) => {
      await writeFile(args[args.length - 1], 'JPEG');
      controller.abort();
      return { ...OK, exitCode: null };
    });

    expect(await grabber.grab('u', destination, controller.signal)).toBe(GrabOutcome.NO_FRAME);
    await expect(readFile(destination)).rejects.toThrow();
  });

  it('reports a missing FFmpeg without running anything', async () => {
    find.mockResolvedValue(null);

    expect(await grabber.grab('u', destination, live())).toBe(GrabOutcome.TOOL_MISSING);
    expect(run).not.toHaveBeenCalled();
  });

  it('tells a binary that cannot run from a stream that gave no frame', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    run.mockResolvedValue({
      exitCode: null,
      stdout: '',
      stderr: 'Error ENOENT',
      timedOut: false,
      startError: 'Error ENOENT',
    });
    expect(await grabber.grab('u', destination, live())).toBe(GrabOutcome.TOOL_MISSING);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('could not run'));

    run.mockResolvedValue({ exitCode: null, stdout: '', stderr: '', timedOut: false });
    expect(await grabber.grab('u', destination, live())).toBe(GrabOutcome.NO_FRAME);

    run.mockResolvedValue({ exitCode: null, stdout: '', stderr: '', timedOut: true });
    expect(await grabber.grab('u', destination, live())).toBe(GrabOutcome.NO_FRAME);

    run.mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'Connection refused',
      timedOut: false,
    });
    expect(await grabber.grab('u', destination, live())).toBe(GrabOutcome.NO_FRAME);
  });

  it('logs why ffmpeg got no frame, with the stream URL masked', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    run.mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'rtmp://cdn.example/live/streamkey: Connection refused',
      timedOut: false,
    });

    await grabber.grab('u', destination, live());

    const text = String(log.mock.calls[0][0]);
    expect(text).toContain('Connection refused');
    expect(text).not.toContain('streamkey');
    log.mockRestore();
  });
});
