import { isSea } from 'node:sea';
import { Logger } from '@nestjs/common';

import * as hiddenProcess from '../../../common/process/hidden-process';
import { RunResult } from '../../../common/process/hidden-process';
import { PlayerLocator } from './player-locator.service';
import { bundledMpvPath } from '../utils/player-paths';
import { MpvPlayerProvider } from './mpv-player.provider';

jest.mock('node:sea', () => ({ isSea: jest.fn().mockReturnValue(false) }));

const MPV = 'C:\\Program Files\\MPV Player\\mpv.exe';
const version = (stdout: string): RunResult => ({
  exitCode: 0,
  stdout,
  stderr: '',
  timedOut: false,
});

describe('MpvPlayerProvider', () => {
  const find = jest.fn<Promise<string | null>, []>();
  let provider: MpvPlayerProvider;
  let run: jest.SpyInstance;

  beforeEach(() => {
    find.mockReset().mockResolvedValue(MPV);
    run = jest
      .spyOn(hiddenProcess, 'runHidden')
      .mockResolvedValue(version('mpv v0.42.0-3-g902818753'));
    provider = new MpvPlayerProvider({ find } as unknown as PlayerLocator);
  });
  afterEach(() => jest.restoreAllMocks());

  it('finds the player and its version once, however many jobs ask', async () => {
    const [first, second] = await Promise.all([provider.get(), provider.get()]);
    await provider.get();

    expect(first).toEqual({ path: MPV, supportsMediaControlsFlag: true });
    expect(second).toBe(first);
    expect(find).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run.mock.calls[0].slice(0, 2)).toEqual([MPV, ['--version']]);
  });

  it('does not offer --media-controls to an old build or one whose version is unreadable', async () => {
    run.mockResolvedValue(version('mpv 0.37.0'));
    expect((await provider.get())?.supportsMediaControlsFlag).toBe(false);

    provider.forget();
    run.mockResolvedValue(version(''));
    expect((await provider.get())?.supportsMediaControlsFlag).toBe(false);
  });

  it('does not run mpv.net to ask for a version', async () => {
    find.mockResolvedValue('C:\\Apps\\mpvnet.exe');

    expect(await provider.get()).toEqual({
      path: 'C:\\Apps\\mpvnet.exe',
      supportsMediaControlsFlag: false,
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('believes a missing player for a short while, then looks again', async () => {
    find.mockResolvedValue(null);

    expect(await provider.get(1_000)).toBeNull();
    expect(await provider.get(5_000)).toBeNull();
    expect(find).toHaveBeenCalledTimes(1);
    find.mockResolvedValue(MPV);

    expect((await provider.get(1_000 + 30_000))?.path).toBe(MPV);
    expect(find).toHaveBeenCalledTimes(2);
  });

  it('treats a failing search as no player instead of throwing', async () => {
    find.mockRejectedValue(new Error('reg.exe failed'));

    expect(await provider.get()).toBeNull();
  });

  it('looks again after a launch failure told it to forget', async () => {
    await provider.get();

    provider.forget();
    await provider.get();

    expect(find).toHaveBeenCalledTimes(2);
  });

  it('trusts the bundled mpv without running it', async () => {
    jest.mocked(isSea).mockReturnValue(true);
    find.mockResolvedValue(bundledMpvPath());

    expect((await provider.get())?.supportsMediaControlsFlag).toBe(true);
    expect(run).not.toHaveBeenCalled();
    jest.mocked(isSea).mockReturnValue(false);
  });

  it('does not take an mpv at the bundled path for the bundled one outside the installed service', async () => {
    find.mockResolvedValue(bundledMpvPath());
    run.mockResolvedValue(version('mpv 0.30.0'));

    expect((await provider.get())?.supportsMediaControlsFlag).toBe(false);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('logs a version question that got no answer', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    run.mockResolvedValue({ exitCode: null, stdout: '', stderr: '', timedOut: true });

    expect((await provider.get())?.supportsMediaControlsFlag).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('--version'));
    warn.mockRestore();
  });
});
