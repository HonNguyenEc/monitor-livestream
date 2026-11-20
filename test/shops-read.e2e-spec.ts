import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { createTestApp } from './helpers/create-test-app';
import { createDataDir, missingDataDir, removeDataDir } from './helpers/data-dir';
import { callApi, expectError } from './helpers/http';

const SHOPS_JSON = {
  capture_seconds: 10,
  shops: [
    { platform: 'tiktok', username: 'unidry_official' },
    { platform: 'shopee', name: 'nivea', shop_id: 61922582, user_id: 61924024, session_id: 4 },
    { platform: 'shopee', name: 'Cửa hàng', user_id: '777' },
    { platform: 'youtube', username: 'skipped' },
    'not a shop',
  ],
};
const COOKIES_JSON = { '61924024': 'SPC_SC_SESSION=fake' };

describe('Shops read from shops.json (e2e)', () => {
  const dirs: string[] = [];
  let app: NestFastifyApplication;

  const start = async (files: Record<string, unknown>): Promise<void> => {
    const dataDir = await createDataDir(files);
    dirs.push(dataDir);
    app = await createTestApp({ dataDir });
  };

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await Promise.all(dirs.map(removeDataDir));
  });

  it('lists the local shops in file order, and no backend channel without a backend login', async () => {
    await start({ 'shops.json': SHOPS_JSON, 'shopee_cookies.json': COOKIES_JSON });

    const { items } = (await callApi(app, 'GET', '/shops')).json();

    expect(items).toEqual([
      expect.objectContaining({ key: 'tiktok_unidry_official', label: 'unidry_official' }),
      expect.objectContaining({ key: 'shopee_nivea', label: 'nivea', cookie_set: true }),
      expect.objectContaining({ key: 'shopee_C_a_h_ng', label: 'Cửa hàng', cookie_set: false }),
    ]);
    expect(items[0]).toMatchObject({
      platform: 'tiktok',
      source: 'local',
      status: 'not_checked',
      job_state: 'stopped',
      attempts: 0,
      frame_url: null,
      cookie_set: false,
    });
  });

  it('returns the editable config of a local shop without fields it does not know', async () => {
    await start({ 'shops.json': SHOPS_JSON });

    const shopee = (await callApi(app, 'GET', '/shops/shopee_nivea')).json();
    const digits = (await callApi(app, 'GET', '/shops/shopee_C_a_h_ng')).json();

    expect(shopee).toMatchObject({ session: null, schedules: [], on_air_schedule_id: null });
    expect(shopee.config).toEqual({
      platform: 'shopee',
      name: 'nivea',
      user_id: 61924024,
      shop_id: 61922582,
    });
    expect(digits.config).toEqual({ platform: 'shopee', name: 'Cửa hàng', user_id: 777 });
  });

  it('reads a file saved with a UTF-8 BOM', async () => {
    const dataDir = await createDataDir({});
    dirs.push(dataDir);
    await writeFile(join(dataDir, 'shops.json'), `\uFEFF${JSON.stringify(SHOPS_JSON)}`, 'utf8');
    app = await createTestApp({ dataDir });

    const response = await callApi(app, 'GET', '/shops/tiktok_unidry_official');

    expect(response.statusCode).toBe(200);
  });

  it('lists nothing when shops.json does not exist yet and there is no backend login', async () => {
    app = await createTestApp({ dataDir: missingDataDir() });

    expect((await callApi(app, 'GET', '/shops')).json().items).toEqual([]);
  });

  it('fails without guessing when shops.json is not valid JSON', async () => {
    const dataDir = await createDataDir({});
    dirs.push(dataDir);
    await writeFile(join(dataDir, 'shops.json'), '{"shops": [', 'utf8');
    app = await createTestApp({ dataDir });

    const response = await callApi(app, 'GET', '/shops');

    expectError(response, 500, 'SHOPS_FILE_UNREADABLE');
    expect(response.json().detail).toContain('shops.json');
  });

  it('fails without guessing when shops.json holds a list instead of an object', async () => {
    const dataDir = await createDataDir({ 'shops.json': [] });
    dirs.push(dataDir);
    app = await createTestApp({ dataDir });

    expectError(await callApi(app, 'GET', '/shops'), 500, 'SHOPS_FILE_UNREADABLE');
  });

  it.each([
    ['an object', {}],
    ['null', null],
    ['a string', 'x'],
  ])('fails without guessing when shops is %s instead of a list', async (_case, shops) => {
    const dataDir = await createDataDir({ 'shops.json': { capture_seconds: 5, shops } });
    dirs.push(dataDir);
    app = await createTestApp({ dataDir });
    const before = await readFile(join(dataDir, 'shops.json'), 'utf8');

    expectError(await callApi(app, 'GET', '/shops'), 500, 'SHOPS_FILE_UNREADABLE');
    expectError(
      await callApi(app, 'POST', '/shops', { platform: 'tiktok', username: 'x' }),
      500,
      'SHOPS_FILE_UNREADABLE',
    );
    expect(await readFile(join(dataDir, 'shops.json'), 'utf8')).toBe(before);
  });

  it('treats a file without a shops key as no shops', async () => {
    await start({ 'shops.json': { capture_seconds: 5 } });

    expect((await callApi(app, 'GET', '/shops')).json().items).toEqual([]);
  });

  it('returns SHOP_NOT_FOUND for an entry it skips', async () => {
    await start({ 'shops.json': SHOPS_JSON });

    const response = await callApi(app, 'GET', '/shops/youtube_skipped');

    expectError(response, 404, 'SHOP_NOT_FOUND');
    expect(response.json().detail).toBe('Không tìm thấy shop youtube_skipped.');
  });
});
