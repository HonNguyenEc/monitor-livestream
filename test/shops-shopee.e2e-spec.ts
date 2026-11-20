import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { LightMyRequestResponse as Response } from 'fastify';

import { SellerCenterUnavailableError } from '../src/modules/shops/errors/seller-center-unavailable.error';
import { ShopRepository } from '../src/modules/shops/repositories/shop.repository';
import { SellerAccount } from '../src/modules/shops/models/seller-account.model';
import { createTestApp } from './helpers/create-test-app';
import { BRAND_ID, fakeBackend, loginToFakeBackend } from './helpers/fake-backend';
import { createDataDir, pythonJsonText, readDataFile, removeDataDir } from './helpers/data-dir';
import { callApi, expectError, Method } from './helpers/http';

const NIVEA = {
  platform: 'shopee',
  name: 'nivea',
  user_id: 61924024,
  shop_id: 61922582,
  session_id: 7,
};
const SHARED = { platform: 'shopee', name: 'nivea-2', user_id: 61924024 };
const NO_COOKIE = { platform: 'shopee', name: 'nocookie', user_id: 1 };
const COOKIES = { '61924024': 'SPC_SC_SESSION=old' };
const NEW_ACCOUNT: SellerAccount = { user_id: 500, shop_id: 600, username: 'new.seller' };

const ACCOUNTS: Record<string, SellerAccount | null> = {
  'SPC_SC_SESSION=good': NEW_ACCOUNT,
  'SPC_SC_SESSION=nivea': { user_id: 61924024, shop_id: 61922582, username: 'nivea_sc' },
  'SPC_SC_SESSION=expired': null,
};

const cookiesText = (value: object): string => pythonJsonText(value, 2);

describe('Shopee shops with a Seller Center cookie (e2e)', () => {
  let app: NestFastifyApplication;
  let dataDir: string;
  const account = jest.fn(async (cookie: string): Promise<SellerAccount | null> => {
    if (!(cookie in ACCOUNTS)) {
      throw new SellerCenterUnavailableError('fetch failed');
    }
    return ACCOUNTS[cookie];
  });

  const call = (method: Method, path: string, payload?: object): Promise<Response> =>
    callApi(app, method, path, payload);
  const readJson = async (name: string): Promise<Record<string, unknown>> =>
    JSON.parse(await readDataFile(dataDir, name));
  const shops = async (): Promise<object[]> => (await readJson('shops.json')).shops as object[];

  const start = async (list: object[] = [NIVEA, NO_COOKIE]): Promise<void> => {
    dataDir = await createDataDir({
      'shops.json': { shops: list },
      'shopee_cookies.json': COOKIES,
    });
    app = await createTestApp({ dataDir, sellerCenter: { account } });
  };

  beforeEach(() => account.mockClear());

  afterEach(async () => {
    await app.close();
    await removeDataDir(dataDir);
  });

  describe('POST /shops', () => {
    beforeEach(() => start());

    it('fills the identity from Seller Center and stores only SPC_SC_SESSION', async () => {
      const response = await call('POST', '/shops', {
        platform: 'shopee',
        cookie: 'cookie: a=1; SPC_SC_SESSION=good; b=2',
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        key: 'shopee_new_seller',
        label: 'new.seller',
        cookie_set: true,
        config: { platform: 'shopee', name: 'new.seller', user_id: 500, shop_id: 600 },
      });
      expect(account).toHaveBeenCalledWith('SPC_SC_SESSION=good');
      expect((await shops()).at(-1)).toEqual({
        platform: 'shopee',
        name: 'new.seller',
        user_id: 500,
        shop_id: 600,
      });
      expect(await readDataFile(dataDir, 'shopee_cookies.json')).toBe(
        cookiesText({ ...COOKIES, '500': 'SPC_SC_SESSION=good' }),
      );
    });

    it.each([
      ['a cookie without SPC_SC_SESSION', { cookie: 'SPC_EC=1' }],
      ['a cookie Seller Center rejects', { cookie: 'SPC_SC_SESSION=expired' }],
      ['an unreachable Seller Center', { cookie: 'SPC_SC_SESSION=down' }],
      ['a typed user_id of another account', { cookie: 'SPC_SC_SESSION=good', user_id: 7 }],
      ['a TikTok field', { cookie: 'SPC_SC_SESSION=good', username: 'x' }],
      ['a cookie value outside printable ASCII', { cookie: 'SPC_SC_SESSION=aĀb' }],
      ['an http live_url', { cookie: 'SPC_SC_SESSION=good', live_url: 'http://live.shopee.vn/x' }],
      [
        'a live_url on another host',
        { cookie: 'SPC_SC_SESSION=good', live_url: 'https://evil.com/' },
      ],
    ])('rejects %s with BAD_REQUEST and writes nothing', async (_case, body) => {
      expectError(
        await call('POST', '/shops', { platform: 'shopee', ...body }),
        400,
        'BAD_REQUEST',
      );
      expect(await shops()).toEqual([NIVEA, NO_COOKIE]);
      expect(await readJson('shopee_cookies.json')).toEqual(COOKIES);
    });

    it.each([
      ['an existing shop', 'nivea'],
      [
        'a backend channel',
        `api_${createHash('sha1').update(BRAND_ID).digest('hex').slice(0, 10)}`,
      ],
    ])('rejects the key of %s and stores no cookie', async (_case, name) => {
      await app.close();
      app = await createTestApp({ dataDir, sellerCenter: { account }, backendHttp: fakeBackend() });
      await loginToFakeBackend(app);
      expectError(
        await call('POST', '/shops', { platform: 'shopee', name, cookie: 'SPC_SC_SESSION=good' }),
        409,
        'SHOP_ALREADY_EXISTS',
      );
      expect(await readJson('shopee_cookies.json')).toEqual(COOKIES);
    });
  });

  describe('PUT /shops/:key', () => {
    beforeEach(() => start());

    it('renames a shop whose stored live_url predates the allow-list', async () => {
      const stale = { ...NIVEA, live_url: 'http://x.test/live' };
      await app.close();
      await removeDataDir(dataDir);
      await start([stale, NO_COOKIE]);

      const response = await call('PUT', '/shops/shopee_nivea', { name: 'nivea2' });

      expect(response.statusCode).toBe(200);
      expect((await shops())[0]).toEqual({ ...stale, name: 'nivea2' });
    });

    it('rejects a bad live_url before calling Seller Center', async () => {
      expectError(
        await call('PUT', '/shops/shopee_nivea', {
          cookie: 'SPC_SC_SESSION=nivea',
          live_url: 'http://x.test/live',
        }),
        400,
        'BAD_REQUEST',
      );
      expect(account).not.toHaveBeenCalled();
    });

    it('accepts a shp.ee live_url', async () => {
      const response = await call('PUT', '/shops/shopee_nivea', { live_url: 'https://shp.ee/abc' });

      expect(response.statusCode).toBe(200);
    });

    it.each(['http://live.shopee.vn/share', 'https://evil.com/live'])(
      'rejects the live_url %s and writes nothing',
      async (liveUrl) => {
        expectError(
          await call('PUT', '/shops/shopee_nivea', { live_url: liveUrl }),
          400,
          'BAD_REQUEST',
        );
        expect(await shops()).toEqual([NIVEA, NO_COOKIE]);
      },
    );

    it('keeps the stored account and cookie when no cookie is sent', async () => {
      const response = await call('PUT', '/shops/shopee_nivea', {
        live_url: 'https://live.shopee.vn/share?session=1',
      });

      expect(response.statusCode).toBe(200);
      expect((await shops())[0]).toEqual({
        ...NIVEA,
        live_url: 'https://live.shopee.vn/share?session=1',
      });
      expect(await readJson('shopee_cookies.json')).toEqual(COOKIES);
      expect(account).not.toHaveBeenCalled();
    });

    it('falls back to the user_id when the name is cleared without a cookie', async () => {
      const response = await call('PUT', '/shops/shopee_nivea', { name: null });

      expect(response.json()).toMatchObject({ key: 'shopee_61924024', label: '61924024' });
    });

    it.each([
      ['a user_id change', '/shops/shopee_nivea', { user_id: 1 }, /Đổi user_id/],
      ['a shop with no stored cookie', '/shops/shopee_nocookie', { name: 'x' }, /Thiếu cookie/],
      ['a TikTok field', '/shops/shopee_nivea', { username: 'x' }, /không dùng trường/],
    ])('rejects %s without a cookie', async (_case, path, body, message) => {
      const response = await call('PUT', path, body);

      expectError(response, 400, 'BAD_REQUEST');
      expect(response.json().detail).toMatch(message);
    });

    it('moves the shop to the account of a new cookie once user_id is cleared', async () => {
      const response = await call('PUT', '/shops/shopee_nivea', {
        cookie: 'SPC_SC_SESSION=good',
        user_id: null,
      });

      expect(response.json()).toMatchObject({ key: 'shopee_nivea', cookie_set: true });
      expect((await shops())[0]).toEqual({ ...NIVEA, user_id: 500, shop_id: 600 });
      expect(await readJson('shopee_cookies.json')).toEqual({ '500': 'SPC_SC_SESSION=good' });
    });

    it('rejects a new cookie of another account while the stored user_id stays', async () => {
      expectError(
        await call('PUT', '/shops/shopee_nivea', { cookie: 'SPC_SC_SESSION=good' }),
        400,
        'BAD_REQUEST',
      );
    });

    it('replaces the cookie of the same account', async () => {
      await call('PUT', '/shops/shopee_nivea', { cookie: 'SPC_SC_SESSION=nivea' });

      expect(await readJson('shopee_cookies.json')).toEqual({ '61924024': 'SPC_SC_SESSION=nivea' });
    });

    it('keeps the old account cookie while another shop still uses it', async () => {
      await app.close();
      await removeDataDir(dataDir);
      await start([NIVEA, SHARED]);

      await call('PUT', '/shops/shopee_nivea', { cookie: 'SPC_SC_SESSION=good', user_id: null });

      expect(await readJson('shopee_cookies.json')).toEqual({
        ...COOKIES,
        '500': 'SPC_SC_SESSION=good',
      });
    });

    it('ignores user_id: null without a cookie and keeps the stored account', async () => {
      const response = await call('PUT', '/shops/shopee_nivea', { user_id: null, name: 'nivea' });

      expect(response.statusCode).toBe(200);
      expect((await shops())[0]).toMatchObject({ user_id: 61924024 });
    });

    it('puts the previous cookie back when shops.json cannot be written', async () => {
      jest.spyOn(app.get(ShopRepository), 'save').mockRejectedValueOnce(new Error('disk full'));

      const response = await call('PUT', '/shops/shopee_nivea', {
        cookie: 'SPC_SC_SESSION=nivea',
      });

      expect(response.statusCode).toBe(500);
      expect(await readJson('shopee_cookies.json')).toEqual(COOKIES);
      expect(await shops()).toEqual([NIVEA, NO_COOKIE]);
    });

    it('answers SHOP_NOT_FOUND when the shop is deleted during the Seller Center check', async () => {
      let release: (value: SellerAccount) => void = () => undefined;
      account.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));

      const pending = call('PUT', '/shops/shopee_nivea', { cookie: 'SPC_SC_SESSION=nivea' });
      while (account.mock.calls.length === 0) {
        await new Promise((resolve) => setImmediate(resolve));
      }
      await call('DELETE', '/shops/shopee_nivea');
      release(ACCOUNTS['SPC_SC_SESSION=nivea'] as SellerAccount);

      expectError(await pending, 404, 'SHOP_NOT_FOUND');
    });
  });

  describe('a cookie file that cannot be read', () => {
    const BROKEN = '{"61924024": ';

    beforeEach(async () => {
      await start();
      await writeFile(join(dataDir, 'shopee_cookies.json'), BROKEN, 'utf8');
    });

    const expectUntouched = async (): Promise<void> => {
      expect(await readDataFile(dataDir, 'shopee_cookies.json')).toBe(BROKEN);
      expect(await shops()).toEqual([NIVEA, NO_COOKIE]);
    };

    it('lists shops without a stored cookie instead of failing', async () => {
      const response = await call('GET', '/shops/shopee_nivea');

      expect(response.statusCode).toBe(200);
      expect(response.json().cookie_set).toBe(false);
    });

    it.each([
      ['POST', '/shops', { platform: 'shopee', cookie: 'SPC_SC_SESSION=good' }],
      ['PUT', '/shops/shopee_nivea', { cookie: 'SPC_SC_SESSION=nivea' }],
      ['PUT', '/shops/shopee_nivea', { live_url: 'https://live.shopee.vn/share?session=1' }],
    ] as const)('refuses %s %s and overwrites nothing', async (method, path, body) => {
      const response = await call(method, path, body);

      expectError(response, 500, 'COOKIES_FILE_UNREADABLE');
      expect(response.json().detail).toContain('shopee_cookies.json');
      await expectUntouched();
    });

    it('still deletes the shop and leaves the cookie file alone', async () => {
      expect((await call('DELETE', '/shops/shopee_nivea')).statusCode).toBe(204);

      expect(await readDataFile(dataDir, 'shopee_cookies.json')).toBe(BROKEN);
      expect(await shops()).toEqual([NO_COOKIE]);
    });
  });

  describe('DELETE /shops/:key', () => {
    it('drops the cookie no remaining shop uses', async () => {
      await start();

      expect((await call('DELETE', '/shops/shopee_nivea')).statusCode).toBe(204);
      expect(await readJson('shopee_cookies.json')).toEqual({});
    });

    it('keeps a cookie another shop still uses', async () => {
      await start([NIVEA, SHARED]);

      await call('DELETE', '/shops/shopee_nivea');

      expect(await readJson('shopee_cookies.json')).toEqual(COOKIES);
      expect((await call('GET', '/shops/shopee_nivea-2')).json().cookie_set).toBe(true);
    });
  });
});
