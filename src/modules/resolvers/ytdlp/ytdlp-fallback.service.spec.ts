import { Logger } from '@nestjs/common';
import { ResolveFailureCode } from '../enums/resolve-failure-code.enum';
import { YtDlpFallback } from './ytdlp-fallback.service';
import { YtDlpRunner, YtDlpRunResult } from './ytdlp-runner';

const USER = 'some_user';
const TIMEOUT = 4321;

function makeFallback(result: YtDlpRunResult | Error): { svc: YtDlpFallback; run: jest.Mock } {
  const run = jest.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
  );
  const runner: YtDlpRunner = { run };
  return { svc: new YtDlpFallback(runner), run };
}

describe('YtDlpFallback', () => {
  it('logs a failure with the masked text', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const { svc } = makeFallback({ exitCode: 1, stdout: '', stderr: 'bad token=abc123' });
    await svc.resolve(USER, TIMEOUT);
    expect(warn).toHaveBeenCalledWith('ytdlp_failed: bad token=[redacted]');
    warn.mockRestore();
  });

  it('collects URLs and ignores noise lines', async () => {
    const stdout =
      '[info] noise\n  https://a.example/1.flv  \r\nhttp://b.example/2.m3u8\n\nnot a url\n';
    const { svc } = makeFallback({ exitCode: 0, stdout, stderr: 'warn' });
    expect(await svc.resolve(USER, TIMEOUT)).toEqual({
      ok: true,
      urls: ['https://a.example/1.flv', 'http://b.example/2.m3u8'],
      detail: 'resolved',
    });
  });

  it('fails when exit is 0 but no URL line exists', async () => {
    const { svc } = makeFallback({ exitCode: 0, stdout: 'nothing here', stderr: '' });
    const result = await svc.resolve(USER, TIMEOUT);
    expect(result).toEqual({
      ok: false,
      code: ResolveFailureCode.YTDLP_FAILED,
      detail: 'nothing here',
    });
  });

  it('fails on non-zero exit even with URLs, preferring stderr', async () => {
    const { svc } = makeFallback({ exitCode: 1, stdout: 'https://a.example/x', stderr: 'boom' });
    const result = await svc.resolve(USER, TIMEOUT);
    expect(result).toEqual({ ok: false, code: ResolveFailureCode.YTDLP_FAILED, detail: 'boom' });
  });

  it('falls back to stdout when stderr is empty, masking URLs', async () => {
    const { svc } = makeFallback({
      exitCode: 1,
      stdout: 'bad https://a.example/x?sig=1',
      stderr: '',
    });
    const result = await svc.resolve(USER, TIMEOUT);
    expect(result.detail).toBe('bad [url]');
  });

  it('reports the exit code when both streams are empty', async () => {
    const { svc } = makeFallback({ exitCode: 3, stdout: '', stderr: '' });
    expect((await svc.resolve(USER, TIMEOUT)).detail).toBe('yt-dlp exited 3');
  });

  it('masks secrets in stderr', async () => {
    const { svc } = makeFallback({
      exitCode: 1,
      stdout: '',
      stderr: 'at https://x.example/p failed cookie=abc123',
    });
    const detail = (await svc.resolve(USER, TIMEOUT)).detail;
    expect(detail).toBe('at [url] failed cookie=[redacted]');
    expect(detail).not.toContain('abc123');
  });

  it('explains a missing exit code instead of printing null', async () => {
    const { svc } = makeFallback({ exitCode: null, stdout: '', stderr: '' });
    const result = await svc.resolve(USER, TIMEOUT);
    expect(result).toEqual({
      ok: false,
      code: ResolveFailureCode.YTDLP_FAILED,
      detail: 'yt-dlp timed out or was killed',
    });
  });

  it('encodes the username into the live URL literally', async () => {
    const { svc, run } = makeFallback({ exitCode: 0, stdout: 'https://a.example/1', stderr: '' });
    await svc.resolve('a/b?c#$&', TIMEOUT);
    const args = run.mock.calls[0] as unknown as [string[], number];
    expect(args[0].at(-1)).toBe('https://www.tiktok.com/@a%2Fb%3Fc%23%24%26/live');
  });

  it('turns a runner error into a failure', async () => {
    const { svc } = makeFallback(new Error('spawn failed token=zzz'));
    const result = await svc.resolve(USER, TIMEOUT);
    expect(result).toEqual({
      ok: false,
      code: ResolveFailureCode.YTDLP_FAILED,
      detail: 'spawn failed token=[redacted]',
    });
  });

  it('passes the exact args and forwards the timeout', async () => {
    const { svc, run } = makeFallback({ exitCode: 0, stdout: 'https://a.example/1', stderr: '' });
    await svc.resolve(USER, TIMEOUT);
    expect(run).toHaveBeenCalledWith(
      ['--no-warnings', '--get-url', `https://www.tiktok.com/@${USER}/live`],
      TIMEOUT,
    );
  });
});
