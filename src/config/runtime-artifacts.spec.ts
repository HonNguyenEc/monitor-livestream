import { join } from 'node:path';

import { childPidsPathOf, framePathOf, mpvConfigDirOf, runtimeDir } from './runtime-artifacts';

describe('runtime artifacts', () => {
  const dataDir = join('data');

  it('keeps every artifact under the runtime folder, away from the Python tool files', () => {
    const root = runtimeDir(dataDir);

    expect(framePathOf(dataDir, 'tiktok_a').startsWith(root)).toBe(true);
    expect(mpvConfigDirOf(dataDir, 'tiktok_a').startsWith(root)).toBe(true);
    expect(childPidsPathOf(dataDir).startsWith(root)).toBe(true);
  });

  it('names the frame and the mpv config folder by channel key', () => {
    expect(framePathOf(dataDir, 'tiktok_a')).toBe(
      join('data', 'runtime', 'frames', 'tiktok_a', 'latest.jpg'),
    );
    expect(mpvConfigDirOf(dataDir, 'tiktok_a')).toBe(
      join('data', 'runtime', 'mpv-config', 'tiktok_a'),
    );
  });
});
