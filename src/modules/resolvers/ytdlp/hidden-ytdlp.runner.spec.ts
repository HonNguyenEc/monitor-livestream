import * as hiddenProcess from '../../../common/process/hidden-process';
import { RunResult } from '../../../common/process/hidden-process';
import { ToolLocator } from '../../processes';
import { HiddenYtDlpRunner } from './hidden-ytdlp.runner';
import { YTDLP_MAX_CONCURRENT, YTDLP_UNAVAILABLE_MESSAGE } from './ytdlp.constants';

const BINARY = 'C:/tools/yt-dlp.exe';
const OK: RunResult = { exitCode: 0, stdout: 'https://x/y.flv', stderr: '', timedOut: false };

describe('HiddenYtDlpRunner', () => {
  const find = jest.fn<Promise<string | null>, []>();
  let runner: HiddenYtDlpRunner;
  let run: jest.SpyInstance<Promise<RunResult>, Parameters<typeof hiddenProcess.runHidden>>;

  beforeEach(() => {
    runner = new HiddenYtDlpRunner({ find } as unknown as ToolLocator);
    find.mockResolvedValue(BINARY);
    run = jest.spyOn(hiddenProcess, 'runHidden').mockResolvedValue(OK);
  });
  afterEach(() => jest.restoreAllMocks());

  it('runs the binary it found with the arguments, the remaining budget and the signal', async () => {
    const controller = new AbortController();

    const result = await runner.run(['--get-url', 'u'], 5_000, controller.signal);

    expect(result).toBe(OK);
    expect(run).toHaveBeenCalledWith(
      BINARY,
      ['--get-url', 'u'],
      expect.objectContaining({ signal: controller.signal, timeoutMs: expect.any(Number) }),
    );
    expect(run.mock.calls[0][2].timeoutMs).toBeLessThanOrEqual(5_000);
  });

  it('reports a missing binary the way the verdict table reads as tool_missing, without spawning', async () => {
    find.mockResolvedValue(null);

    const result = await runner.run([], 5_000);

    expect(result).toMatchObject({ stderr: YTDLP_UNAVAILABLE_MESSAGE, timedOut: false });
    expect(result.exitCode).not.toBe(0);
    expect(run).not.toHaveBeenCalled();
  });

  it('never runs more than the cap at once and starts the next as a slot frees up', async () => {
    let running = 0;
    let peak = 0;
    const finishers: Array<() => void> = [];
    run.mockImplementation(
      () =>
        new Promise((resolve) => {
          running += 1;
          peak = Math.max(peak, running);
          finishers.push(() => {
            running -= 1;
            resolve(OK);
          });
        }),
    );

    const all = Array.from({ length: YTDLP_MAX_CONCURRENT + 2 }, () => runner.run([], 60_000));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(running).toBe(YTDLP_MAX_CONCURRENT);

    while (finishers.length > 0) {
      finishers.shift()?.();
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await Promise.all(all);

    expect(peak).toBe(YTDLP_MAX_CONCURRENT);
    expect(run).toHaveBeenCalledTimes(YTDLP_MAX_CONCURRENT + 2);
  });

  it('counts the wait for a slot in the timeout and reports it as timed out', async () => {
    run.mockImplementation(() => new Promise(() => undefined));
    for (let index = 0; index < YTDLP_MAX_CONCURRENT; index += 1) void runner.run([], 60_000);
    await new Promise((resolve) => setTimeout(resolve, 5));

    const result = await runner.run([], 30);

    expect(result).toEqual({ exitCode: null, stdout: '', stderr: '', timedOut: true });
  });

  it('answers a caller abort while it waits for a slot as killed, not timed out', async () => {
    const controller = new AbortController();
    run.mockImplementation(() => new Promise(() => undefined));
    for (let index = 0; index < YTDLP_MAX_CONCURRENT; index += 1) void runner.run([], 60_000);
    await new Promise((resolve) => setTimeout(resolve, 5));

    const waiting = runner.run([], 60_000, controller.signal);
    controller.abort();

    expect(await waiting).toEqual({ exitCode: null, stdout: '', stderr: '', timedOut: false });
  });

  it('passes the timeout kill of the process on as it is', async () => {
    const killed: RunResult = { exitCode: null, stdout: '', stderr: '', timedOut: true };
    run.mockResolvedValue(killed);

    expect(await runner.run([], 5_000)).toBe(killed);
  });
});
