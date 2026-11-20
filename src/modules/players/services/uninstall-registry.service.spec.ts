import { execFile } from 'node:child_process';

import { parseUninstallEntries, UninstallRegistry } from './uninstall-registry.service';

jest.mock('node:child_process', () => ({ execFile: jest.fn() }));

const ROOT = 'HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall';
const REG_OUTPUT = [
  '',
  `${ROOT}\\MPV_Player_Automated_is1`,
  '    Inno Setup: App Path    REG_SZ    C:\\Program Files\\MPV Player',
  '    InstallLocation    REG_SZ    C:\\Program Files\\MPV Player\\',
  '    DisplayName    REG_SZ    MPV Player',
  '    NoModify    REG_DWORD    0x1',
  '',
  `${ROOT}\\MPV_Player_Automated_is1\\Nested`,
  '    DisplayName    REG_SZ    nested mpv',
  '    InstallLocation    REG_SZ    D:\\nested',
  '',
  `${ROOT}\\NoLocation`,
  '    DisplayName    REG_SZ    Something',
  '',
  `${ROOT}\\EmptyLocation`,
  '    DisplayName    REG_SZ    mpv.net',
  '    InstallLocation    REG_SZ    ',
  '',
  `${ROOT}\\Other`,
  '    DisplayName    REG_SZ    7-Zip 24.09 (x64)',
  '    InstallLocation    REG_SZ    C:\\Program Files\\7-Zip\\',
].join('\r\n');

describe('parseUninstallEntries', () => {
  it('keeps direct sub-keys that have both a name and an install location', () => {
    expect(parseUninstallEntries(REG_OUTPUT)).toEqual([
      { displayName: 'MPV Player', installLocation: 'C:\\Program Files\\MPV Player\\' },
      { displayName: '7-Zip 24.09 (x64)', installLocation: 'C:\\Program Files\\7-Zip\\' },
    ]);
  });

  it('returns nothing for empty output', () => {
    expect(parseUninstallEntries('')).toEqual([]);
  });
});

describe('UninstallRegistry', () => {
  const execFileMock = execFile as unknown as jest.Mock;

  afterEach(() => jest.clearAllMocks());

  it('queries the per-user hive before the machine hive', async () => {
    execFileMock.mockImplementation((_file, args: string[], _options, callback) => {
      const stdout = args[1].startsWith('HKCU')
        ? REG_OUTPUT.replace(/HKEY_LOCAL_MACHINE/g, 'HKEY_CURRENT_USER')
        : '';
      callback(null, { stdout, stderr: '' });
    });

    const entries = await new UninstallRegistry().entries();

    expect(execFileMock.mock.calls.map((call) => call[1][1])).toEqual([
      'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
      'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    ]);
    expect(entries.map((entry) => entry.displayName)).toEqual(['MPV Player', '7-Zip 24.09 (x64)']);
  });

  it('treats a failed query as no entries', async () => {
    execFileMock.mockImplementation((_file, _args, _options, callback) =>
      callback(new Error('exit 1')),
    );

    expect(await new UninstallRegistry().entries()).toEqual([]);
  });
});
