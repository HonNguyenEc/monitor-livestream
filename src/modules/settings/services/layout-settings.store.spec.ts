import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { Detector } from '../../../common/enums/detector.enum';
import { DEFAULT_LAYOUT_SETTINGS, LAYOUT_FILE } from '../constants/layout-settings.constants';
import { LayoutSettingsRepository } from '../repositories/layout-settings.repository';
import { LayoutSettingsStore } from './layout-settings.store';

describe('LayoutSettingsStore', () => {
  let dir: string;
  let file: string;
  let store: LayoutSettingsStore;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'live-qc-layout-'));
    file = join(dir, LAYOUT_FILE);
    store = new LayoutSettingsStore(new LayoutSettingsRepository(dir));
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('reads the defaults when the file does not exist', async () => {
    expect(await store.get()).toEqual(DEFAULT_LAYOUT_SETTINGS);
  });

  it('merges a partial update into the stored settings and writes the Python keys', async () => {
    await store.update({ gap: 9 });
    const { next: saved } = await store.update({ detector: Detector.FFMPEG });

    expect(saved).toEqual({ ...DEFAULT_LAYOUT_SETTINGS, gap: 9, detector: Detector.FFMPEG });
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual(saved);
    expect(await store.get()).toEqual(saved);
  });

  it('hands a concurrent update the settings the one before it saved as `previous`', async () => {
    await store.update({ gap: 1 });

    const [first, second] = await Promise.all([
      store.update({ detector: Detector.FFMPEG }),
      store.update({ detector: Detector.MPV }),
    ]);

    expect(first.previous.detector).toBe(Detector.MPV);
    expect(first.next.detector).toBe(Detector.FFMPEG);
    expect(second.previous).toEqual(first.next);
    expect(second.next.detector).toBe(Detector.MPV);
  });

  it('writes no newline at the end, as the Python tool', async () => {
    await store.update({ gap: 5 });

    expect((await readFile(file, 'utf8')).endsWith('}')).toBe(true);
  });

  it('merges a change into the cleaned stored settings, as Python merges into its own', async () => {
    await writeFile(file, JSON.stringify({ width: 300, height: 100 }), 'utf8');

    const { next: saved } = await store.update({ height: 500 });

    expect(saved).toMatchObject({ width: 0, height: 0 });
  });

  it('reads and cleans a file written by the Python tool', async () => {
    await writeFile(file, JSON.stringify({ gap: '12', width: 100, detector: 'ffmpeg' }), 'utf8');

    expect(await store.get()).toMatchObject({ gap: 12, width: 0, detector: Detector.FFMPEG });
  });

  it('reads the defaults from an unreadable file but never overwrites it', async () => {
    await writeFile(file, '{', 'utf8');

    expect(await store.get()).toEqual(DEFAULT_LAYOUT_SETTINGS);
    await expect(store.update({ gap: 1 })).rejects.toMatchObject({
      code: ErrorCode.LAYOUT_FILE_UNREADABLE,
    });
    expect(await readFile(file, 'utf8')).toBe('{');
  });

  it('treats a file that is not an object as unreadable', async () => {
    await writeFile(file, '[1]', 'utf8');

    await expect(store.update({ gap: 1 })).rejects.toMatchObject({
      code: ErrorCode.LAYOUT_FILE_UNREADABLE,
    });
  });
});
