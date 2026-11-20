import { readdir } from 'node:fs/promises';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { LightMyRequestResponse as Response } from 'fastify';

import { SAMPLE_BACKEND_ROW } from '../src/modules/shops/fixtures/shop.fixtures';
import { createTestApp } from './helpers/create-test-app';
import {
  createDataDir,
  missingDataDir,
  pythonJsonText,
  readDataFile,
  removeDataDir,
} from './helpers/data-dir';
import { callApi, expectError, Method } from './helpers/http';

const SHOPS_JSON = {
  capture_seconds: 10,
  frame_interval_seconds: 2,
  shops: [
    { platform: 'tiktok', username: 'first', live_url: 'https://www.tiktok.com/@first/live' },
    { platform: 'TikTok', username: 'second', note: 'kept' },
    {
      platform: 'shopee',
      name: 'nivea',
      user_id: 61924024,
      shop_id: 61922582,
      session_id: 41556990,
    },
  ],
};

const pythonText = (value: unknown): string => pythonJsonText(value, 4);

describe('Shops written to shops.json (e2e)', () => {
  let app: NestFastifyApplication;
  let dataDir: string;

  const call = (method: Method, path: string, payload?: object): Promise<Response> =>
    callApi(app, method, path, payload);
  const shopsFile = async (): Promise<{ shops: object[] }> =>
    JSON.parse(await readDataFile(dataDir, 'shops.json'));

  beforeEach(async () => {
    dataDir = await createDataDir({ 'shops.json': SHOPS_JSON });
    app = await createTestApp({ dataDir });
  });

  afterEach(async () => {
    await app.close();
    await removeDataDir(dataDir);
  });

  describe('POST /shops', () => {
    it('appends a TikTok shop and keeps the rest of the file as the Python tool wrote it', async () => {
      const response = await call('POST', '/shops', {
        platform: 'tiktok',
        username: ' @@Cửa_hàng ',
        live_url: 'https://www.tiktok.com/@x/live',
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        key: 'tiktok_C_a_h_ng',
        label: 'Cửa_hàng',
        source: 'local',
        config: {
          platform: 'tiktok',
          username: 'Cửa_hàng',
          live_url: 'https://www.tiktok.com/@x/live',
        },
      });
      expect(await readDataFile(dataDir, 'shops.json')).toBe(
        pythonText({
          ...SHOPS_JSON,
          shops: [
            ...SHOPS_JSON.shops,
            {
              platform: 'tiktok',
              username: 'Cửa_hàng',
              live_url: 'https://www.tiktok.com/@x/live',
            },
          ],
        }),
      );
      expect(await readdir(dataDir)).toEqual(['shops.json']);
    });

    it('creates shops.json on the first save', async () => {
      await app.close();
      await removeDataDir(dataDir);
      dataDir = missingDataDir();
      app = await createTestApp({ dataDir });

      expect(
        (await call('POST', '/shops', { platform: 'tiktok', username: 'new' })).statusCode,
      ).toBe(201);
      expect(await shopsFile()).toEqual({ shops: [{ platform: 'tiktok', username: 'new' }] });
    });

    it('serializes concurrent saves so none is lost', async () => {
      const names = ['a', 'b', 'c', 'd', 'e'];

      const responses = await Promise.all(
        names.map((username) => call('POST', '/shops', { platform: 'tiktok', username })),
      );

      expect(responses.map((response) => response.statusCode)).toEqual(names.map(() => 201));
      expect((await shopsFile()).shops).toHaveLength(SHOPS_JSON.shops.length + names.length);
    });

    it('rejects the key of an existing shop with SHOP_ALREADY_EXISTS', async () => {
      expectError(
        await call('POST', '/shops', { platform: 'tiktok', username: '@first' }),
        409,
        'SHOP_ALREADY_EXISTS',
      );
    });

    it.each([
      ['a username that is only @', { platform: 'tiktok', username: '@' }],
      ['a blank username', { platform: 'tiktok', username: '   ' }],
      ['a Shopee field on a TikTok shop', { platform: 'tiktok', username: 'x', name: 'n' }],
      [
        'a cookie on a TikTok shop',
        { platform: 'tiktok', username: 'x', cookie: 'SPC_SC_SESSION=1' },
      ],
    ])('rejects %s with BAD_REQUEST and leaves the file alone', async (_case, body) => {
      expectError(await call('POST', '/shops', body), 400, 'BAD_REQUEST');
      expect(await readDataFile(dataDir, 'shops.json')).toBe(pythonText(SHOPS_JSON));
    });
  });

  describe('PUT /shops/:key', () => {
    it('changes only the sent fields and keeps fields it does not know', async () => {
      const response = await call('PUT', '/shops/tiktok_second', {
        live_url: 'https://www.tiktok.com/@second/live',
      });

      expect(response.statusCode).toBe(200);
      expect((await shopsFile()).shops[1]).toEqual({
        platform: 'tiktok',
        username: 'second',
        live_url: 'https://www.tiktok.com/@second/live',
        note: 'kept',
      });
    });

    it('clears a field sent as null', async () => {
      const response = await call('PUT', '/shops/tiktok_first', { live_url: null });

      expect(response.json().config).toEqual({ platform: 'tiktok', username: 'first' });
      expect((await shopsFile()).shops[0]).toEqual({ platform: 'tiktok', username: 'first' });
    });

    it('moves the shop to its new key when the username changes', async () => {
      const response = await call('PUT', '/shops/tiktok_first', { username: 'renamed' });

      expect(response.json().key).toBe('tiktok_renamed');
      expectError(await call('GET', '/shops/tiktok_first'), 404, 'SHOP_NOT_FOUND');
      expect((await call('GET', '/shops/tiktok_renamed')).statusCode).toBe(200);
    });

    it('rejects a username another shop already uses', async () => {
      expectError(
        await call('PUT', '/shops/tiktok_first', { username: 'second' }),
        409,
        'SHOP_ALREADY_EXISTS',
      );
    });

    it.each([
      ['a Shopee field', { name: 'n' }],
      ['a cookie', { cookie: 'SPC_SC_SESSION=1' }],
    ])('rejects %s on a TikTok shop', async (_case, body) => {
      expectError(await call('PUT', '/shops/tiktok_first', body), 400, 'BAD_REQUEST');
    });

    it('rejects cookie: null on a Shopee shop', async () => {
      expectError(await call('PUT', '/shops/shopee_nivea', { cookie: null }), 400, 'BAD_REQUEST');
    });

    it('refuses a backend channel', async () => {
      expectError(
        await call('PUT', `/shops/${SAMPLE_BACKEND_ROW.key}`, { name: 'x' }),
        409,
        'BACKEND_SHOP_READ_ONLY',
      );
    });
  });

  describe('DELETE /shops/:key', () => {
    it('removes the entry and keeps everything else', async () => {
      expect((await call('DELETE', '/shops/tiktok_first')).statusCode).toBe(204);

      expect(await shopsFile()).toEqual({ ...SHOPS_JSON, shops: SHOPS_JSON.shops.slice(1) });
      expectError(await call('DELETE', '/shops/tiktok_first'), 404, 'SHOP_NOT_FOUND');
    });

    it('refuses a backend channel', async () => {
      expectError(
        await call('DELETE', `/shops/${SAMPLE_BACKEND_ROW.key}`),
        409,
        'BACKEND_SHOP_READ_ONLY',
      );
    });
  });
});
