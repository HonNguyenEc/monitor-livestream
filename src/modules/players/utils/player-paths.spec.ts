import { bundledMpvPath, isMpvExe, isSamePath } from './player-paths';

describe('player paths', () => {
  it('knows mpv.exe by its file name, whatever the case or folder', () => {
    expect(isMpvExe('C:\\Program Files\\MPV Player\\MPV.EXE')).toBe(true);
    expect(isMpvExe('C:\\Apps\\mpvnet.exe')).toBe(false);
  });

  it('puts the bundled mpv in its own folder beside the service executable', () => {
    expect(bundledMpvPath('C:\\Apps\\LiveQC\\live-qc.exe')).toBe('C:\\Apps\\LiveQC\\mpv\\mpv.exe');
  });

  it('compares paths without regard to case or separators', () => {
    expect(isSamePath('C:/Apps/LiveQC/mpv/mpv.exe', 'c:\\apps\\liveqc\\mpv\\mpv.exe')).toBe(true);
    expect(isSamePath('C:\\a\\mpv.exe', 'C:\\b\\mpv.exe')).toBe(false);
  });
});
