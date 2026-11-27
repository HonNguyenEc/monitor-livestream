import { mpvInstanceArgs } from './mpv-instance-args';

const CONFIG = 'C:\\data\\runtime\\mpv-config\\tiktok_a';

describe('mpvInstanceArgs', () => {
  it('gives mpv.net its own process, or it would hand the URL to a window that already exists', () => {
    expect(mpvInstanceArgs('C:\\Tools\\MPVNET.exe', CONFIG)).toEqual([
      `--config-dir=${CONFIG}`,
      '--process-instance=multi',
    ]);
  });

  it('keeps mpv.exe quiet', () => {
    expect(mpvInstanceArgs('C:\\mpv\\mpv.exe', CONFIG)).toEqual([
      `--config-dir=${CONFIG}`,
      '--no-terminal',
    ]);
  });

  it('adds only the config folder for any other player', () => {
    expect(mpvInstanceArgs('C:\\vlc\\vlc.exe', CONFIG)).toEqual([`--config-dir=${CONFIG}`]);
  });
});
