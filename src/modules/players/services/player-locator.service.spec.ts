import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { win32 } from 'node:path';
import { isSea } from 'node:sea';

import { PlayerLocator } from './player-locator.service';
import { UninstallEntry, UninstallRegistry } from './uninstall-registry.service';

jest.mock('node:sea', () => ({ isSea: jest.fn() }));
jest.mock('node:fs/promises', () => ({ readdir: jest.fn(), stat: jest.fn() }));

const LOCAL = 'C:\\Users\\op\\AppData\\Local';
const PROGRAM_FILES = 'C:\\Program Files';
const PATH_DIRS = ['C:\\tools', 'C:\\bin'];
const HOME = homedir();

describe('PlayerLocator', () => {
  const isSeaMock = jest.mocked(isSea);
  const readdirMock = readdir as unknown as jest.Mock<Promise<string[]>, [string]>;
  const statMock = stat as unknown as jest.Mock;
  const savedEnv = { ...process.env };
  let registryEntries: UninstallEntry[];
  let registryQuery: jest.Mock<Promise<UninstallEntry[]>, []>;
  let existing: Set<string>;
  let locator: PlayerLocator;

  beforeEach(() => {
    process.env.LOCALAPPDATA = LOCAL;
    process.env.ProgramFiles = PROGRAM_FILES;
    process.env.PATH = PATH_DIRS.join(';');
    isSeaMock.mockReturnValue(false);
    readdirMock.mockResolvedValue([]);
    existing = new Set();
    statMock.mockImplementation(async (path: string) => {
      if (!existing.has(path)) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
      return { isFile: () => true };
    });
    registryEntries = [];
    registryQuery = jest.fn(async () => registryEntries);
    locator = new PlayerLocator({ entries: registryQuery } as unknown as UninstallRegistry);
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    jest.clearAllMocks();
  });

  // With nothing installed, find() stats every location in search order.
  const checkedPaths = async (): Promise<string[]> => {
    await locator.find();
    return statMock.mock.calls.map(([path]) => path as string);
  };

  it('checks every location in the Python search order', async () => {
    readdirMock.mockResolvedValue(['shinchiro.mpv_b', 'other.app', 'shinchiro.mpv_a']);
    registryEntries = [
      { displayName: 'MPV Player', installLocation: 'D:\\Apps\\MPV' },
      { displayName: 'VLC media player', installLocation: 'D:\\Apps\\VLC' },
    ];

    expect(await checkedPaths()).toEqual([
      'C:\\tools\\mpv.exe',
      'C:\\bin\\mpv.exe',
      'C:\\tools\\mpvnet.exe',
      'C:\\bin\\mpvnet.exe',
      `${LOCAL}\\Microsoft\\WinGet\\Links\\mpv.exe`,
      `${LOCAL}\\Microsoft\\WinGet\\Packages\\shinchiro.mpv_a\\mpv.exe`,
      `${LOCAL}\\Microsoft\\WinGet\\Packages\\shinchiro.mpv_b\\mpv.exe`,
      `${PROGRAM_FILES}\\MPV Player\\mpv.exe`,
      `${PROGRAM_FILES}\\mpv\\mpv.exe`,
      'D:\\Apps\\MPV\\mpv.exe',
      win32.join(HOME, 'scoop', 'apps', 'mpv', 'current', 'mpv.exe'),
      `${LOCAL}\\Programs\\mpv.net\\mpvnet.exe`,
    ]);
  });

  it('puts the bundled copy first when running as the packaged executable', async () => {
    isSeaMock.mockReturnValue(true);
    const bundled = win32.join(win32.dirname(process.execPath), 'mpv', 'mpv.exe');
    existing.add(bundled);
    existing.add('C:\\tools\\mpv.exe');

    expect(await locator.find()).toBe(bundled);
  });

  it('does not query the registry when an earlier location has mpv', async () => {
    const programFilesMpv = `${PROGRAM_FILES}\\mpv\\mpv.exe`;
    existing.add(programFilesMpv);

    expect(await locator.find()).toBe(programFilesMpv);
    expect(registryQuery).not.toHaveBeenCalled();
  });

  it('ignores a bundled folder when running from source', async () => {
    const candidates = await checkedPaths();

    expect(candidates[0]).toBe('C:\\tools\\mpv.exe');
  });

  it('prefers mpv on PATH over mpv.net on PATH', async () => {
    existing.add('C:\\tools\\mpvnet.exe');
    existing.add('C:\\bin\\mpv.exe');

    expect(await locator.find()).toBe('C:\\bin\\mpv.exe');
  });

  it('finds a registry install that is not on PATH', async () => {
    process.env.PATH = '';
    registryEntries = [{ displayName: 'mpv (shinchiro)', installLocation: 'E:\\mpv\\' }];
    existing.add('E:\\mpv\\mpv.exe');

    expect(await locator.find()).toBe('E:\\mpv\\mpv.exe');
  });

  it('skips directories named like the player', async () => {
    statMock.mockResolvedValue({ isFile: () => false });

    expect(await locator.find()).toBeNull();
  });

  it('returns null when nothing is installed', async () => {
    readdirMock.mockRejectedValue(new Error('ENOENT'));

    expect(await locator.find()).toBeNull();
  });

  it('falls back to Program Files and the home profile when the variables are missing', async () => {
    delete process.env.ProgramFiles;
    delete process.env.LOCALAPPDATA;

    const candidates = await checkedPaths();

    expect(candidates).toContain('C:\\Program Files\\MPV Player\\mpv.exe');
    expect(candidates).toContain(
      win32.join(HOME, 'AppData', 'Local', 'Microsoft', 'WinGet', 'Links', 'mpv.exe'),
    );
  });
});
