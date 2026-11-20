import { execFile, spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';

import { execFileHidden, killProcessTree, spawnHidden } from './hidden-process';

jest.mock('node:child_process', () => ({ execFile: jest.fn(), spawn: jest.fn() }));

describe('hidden-process', () => {
  const spawnMock = spawn as unknown as jest.Mock;
  const execFileMock = execFile as unknown as jest.Mock;

  afterEach(() => jest.clearAllMocks());

  it('spawns with no console window and no attached pipes', () => {
    spawnMock.mockReturnValue({ on: jest.fn() });

    spawnHidden('mpv.exe', ['--idle']);

    expect(spawnMock).toHaveBeenCalledWith('mpv.exe', ['--idle'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  });

  it('listens for spawn errors, so a bad path is not an uncaught exception', () => {
    const on = jest.fn();
    spawnMock.mockReturnValue({ on });

    spawnHidden('missing.exe', []);

    expect(on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(() =>
      on.mock.calls[0][1](Object.assign(new Error('x'), { code: 'ENOENT' })),
    ).not.toThrow();
  });

  it('runs a command to completion with no console window', async () => {
    execFileMock.mockImplementation((_file, _args, _options, callback) =>
      callback(null, { stdout: 'out', stderr: '' }),
    );

    const result = await execFileHidden('reg', ['query', 'HKCU'], { timeout: 5 });

    expect(result).toEqual({ stdout: 'out', stderr: '' });
    expect(execFileMock.mock.calls[0][2]).toEqual({
      timeout: 5,
      encoding: 'utf8',
      windowsHide: true,
    });
  });

  describe('killProcessTree', () => {
    const onWindows = process.platform === 'win32' ? it : it.skip;
    const killer = (): EventEmitter => {
      const emitter = new EventEmitter();
      spawnMock.mockReturnValue(emitter);
      return emitter;
    };

    onWindows.each([
      ['succeeds', 0, true],
      ['finds the process gone', 128, true],
      ['fails', 1, false],
    ])('reports whether taskkill %s', async (_case, code, confirmed) => {
      const emitter = killer();
      const result = killProcessTree(42);

      emitter.emit('close', code, null);

      expect(await result).toBe(confirmed);
      expect(spawnMock).toHaveBeenCalledWith(
        'taskkill',
        ['/T', '/F', '/PID', '42'],
        expect.objectContaining({ windowsHide: true }),
      );
    });

    onWindows('is not confirmed when taskkill cannot run', async () => {
      const emitter = killer();
      const result = killProcessTree(42);

      emitter.emit('error', Object.assign(new Error('x'), { code: 'ENOENT' }));

      expect(await result).toBe(false);
    });
  });
});
