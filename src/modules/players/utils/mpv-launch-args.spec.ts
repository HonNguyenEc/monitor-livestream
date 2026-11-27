import { MpvLaunch, mpvLaunchArgs } from './mpv-launch-args';

const launch = (overrides: Partial<MpvLaunch> = {}): MpvLaunch => ({
  player: { path: 'C:\\Program Files\\MPV Player\\mpv.exe', supportsMediaControlsFlag: true },
  configDir: 'C:\\data\\runtime\\mpv-config\\k',
  pipePath: '\\\\.\\pipe\\live-qc-abcd1234-k',
  hidden: true,
  title: 'Livestream Shop',
  url: 'https://cdn.example/live.flv',
  ...overrides,
});

describe('mpvLaunchArgs', () => {
  it('hidden mpv has no video or audio output and no media controls, and the URL comes last', () => {
    const args = mpvLaunchArgs(launch());

    expect(args).toEqual([
      '--config-dir=C:\\data\\runtime\\mpv-config\\k',
      '--no-terminal',
      '--vo=null',
      '--ao=null',
      '--media-controls=no',
      '--input-ipc-server=\\\\.\\pipe\\live-qc-abcd1234-k',
      '--keep-open=no',
      '--title=Livestream Shop',
      'https://cdn.example/live.flv',
    ]);
    expect(args).not.toContain('--force-window=yes');
  });

  it('leaves out --media-controls for a build that does not know it', () => {
    const args = mpvLaunchArgs(
      launch({ player: { path: 'C:\\mpv\\mpv.exe', supportsMediaControlsFlag: false } }),
    );

    expect(args).not.toContain('--media-controls=no');
    expect(args).toContain('--vo=null');
  });

  it('a visible mpv forces its window and keeps its output', () => {
    const args = mpvLaunchArgs(launch({ hidden: false }));

    expect(args).toContain('--force-window=yes');
    expect(args).not.toContain('--vo=null');
    expect(args).not.toContain('--ao=null');
  });

  it('mpv.net runs as its own instance, and hidden it is only muted', () => {
    const args = mpvLaunchArgs(
      launch({
        player: { path: 'C:\\Apps\\mpvnet.exe', supportsMediaControlsFlag: false },
      }),
    );

    expect(args).toContain('--process-instance=multi');
    expect(args).toContain('--mute=yes');
    expect(args).not.toContain('--vo=null');
    expect(args).not.toContain('--no-terminal');
  });
});
