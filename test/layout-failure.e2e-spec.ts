import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { DetectionService } from '../src/modules/detection/services/detection.service';
import { createTestApp } from './helpers/create-test-app';
import { createDataDir, removeDataDir } from './helpers/data-dir';
import { callApi, expectError } from './helpers/http';

describe('PUT /settings/layout when the shop list cannot be read (e2e)', () => {
  let app: NestFastifyApplication;
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await createDataDir({ 'shops.json': { shops: [] } });
    app = await createTestApp({ dataDir });
  });

  afterEach(async () => {
    await app.close();
    await removeDataDir(dataDir);
  });

  it('fails without keeping the new settings', async () => {
    const before = (await callApi(app, 'GET', '/settings/layout')).json().settings;
    await writeFile(join(dataDir, 'shops.json'), '{', 'utf8');

    expectError(
      await callApi(app, 'PUT', '/settings/layout', { gap: before.gap + 5 }),
      500,
      'SHOPS_FILE_UNREADABLE',
    );

    await writeFile(join(dataDir, 'shops.json'), '{"shops": []}', 'utf8');
    expect((await callApi(app, 'GET', '/settings/layout')).json().settings).toEqual(before);
  });
});

describe('Layout settings persistence (e2e)', () => {
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await createDataDir({ 'shops.json': { shops: [] } });
  });

  afterEach(() => removeDataDir(dataDir));

  it('keeps a saved setting across a restart', async () => {
    const first = await createTestApp({ dataDir });
    await callApi(first, 'PUT', '/settings/layout', { gap: 11, live_only: true });
    await first.close();

    const second = await createTestApp({ dataDir });
    const { settings } = (await callApi(second, 'GET', '/settings/layout')).json();
    await second.close();

    expect(settings).toMatchObject({ gap: 11, live_only: true });
    expect(JSON.parse(await readFile(join(dataDir, 'mpv_layout.json'), 'utf8')).gap).toBe(11);
  });

  it('restarts running jobs only when the detector or show_mpv changes, as the Python tool', async () => {
    const app = await createTestApp({ dataDir });
    const restart = jest.spyOn(app.get(DetectionService, { strict: false }), 'restartActive');

    await callApi(app, 'PUT', '/settings/layout', { gap: 9 });
    expect(restart).not.toHaveBeenCalled();

    await callApi(app, 'PUT', '/settings/layout', { detector: 'ffmpeg' });
    await callApi(app, 'PUT', '/settings/layout', { detector: 'ffmpeg', gap: 3 });
    await callApi(app, 'PUT', '/settings/layout', { show_mpv: false });
    await app.close();

    expect(restart).toHaveBeenCalledTimes(2);
  });

  it('refuses to overwrite an unreadable mpv_layout.json', async () => {
    await writeFile(join(dataDir, 'mpv_layout.json'), '{', 'utf8');
    const app = await createTestApp({ dataDir });

    expect((await callApi(app, 'GET', '/settings/layout')).statusCode).toBe(200);
    expectError(
      await callApi(app, 'PUT', '/settings/layout', { gap: 1 }),
      500,
      'LAYOUT_FILE_UNREADABLE',
    );
    await app.close();

    expect(await readFile(join(dataDir, 'mpv_layout.json'), 'utf8')).toBe('{');
  });

  it('clamps a saved value like the Python tool', async () => {
    const app = await createTestApp({ dataDir });

    const { settings } = (
      await callApi(app, 'PUT', '/settings/layout', { gap: 500, width: 50 })
    ).json();
    await app.close();

    expect(settings).toMatchObject({ gap: 100, width: 0, height: 0 });
  });
});
