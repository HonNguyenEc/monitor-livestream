import { execFile, spawn } from 'node:child_process';

import { execFileHidden, spawnHidden } from './hidden-process';

jest.mock('node:child_process', () => ({ execFile: jest.fn(), spawn: jest.fn() }));

describe('hidden-process', () => {
  const spawnMock = spawn as unknown as jest.Mock;
  const execFileMock = execFile as unknown as jest.Mock;

  afterEach(() => jest.clearAllMocks());

  it('spawns with no console window and no attached pipes', () => {
    spawnHidden('mpv.exe', ['--idle']);

    expect(spawnMock).toHaveBeenCalledWith('mpv.exe', ['--idle'], {
      stdio: 'ignore',
      windowsHide: true,
    });
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
});
