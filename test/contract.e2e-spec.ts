import { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { LightMyRequestResponse as Response } from 'fastify';

import { BackendRequestError } from '../src/modules/backend/errors/backend-request.error';
import { LiveStatus } from '../src/common/enums/live-status.enum';
import { JobState } from '../src/common/enums/job-state.enum';
import { DetectionStateStore } from '../src/modules/detection-state/services/detection-state.store';
import { createTestApp } from './helpers/create-test-app';
import { BRAND_KEY, fakeBackend, loginToFakeBackend } from './helpers/fake-backend';
import { createDataDir, removeDataDir } from './helpers/data-dir';
import { apiPath, callApi, expectError, Method } from './helpers/http';

const KNOWN_SHOP = 'tiktok_sample_shop';
const DELETABLE_SHOP = 'tiktok_to_delete';
const SHOPS_JSON = {
  shops: [
    { platform: 'tiktok', username: 'sample_shop' },
    { platform: 'tiktok', username: 'to_delete' },
  ],
};
const BACKEND_SHOP = BRAND_KEY;
const UNKNOWN_SHOP = 'nope';
const LOGIN = { email: 'admin@example.com', password: 'secret' };
const ADMIN_LOGIN_ANSWER = {
  access_token: 'access-1',
  refresh_token: 'refresh-1',
  token_type: 'bearer',
  user: { id: 7, role: 'admin', email: LOGIN.email, name: 'Sample Admin', shop_name: '' },
};

const nullableString = (value: unknown): boolean => value === null || typeof value === 'string';

const SHOP_ROW_SHAPE = {
  key: expect.any(String),
  platform: expect.stringMatching(/^(tiktok|shopee)$/),
  label: expect.any(String),
  source: expect.stringMatching(/^(local|backend)$/),
  status: expect.stringMatching(/^(live|offline|unknown|no_signal|checking|not_checked)$/),
  job_state: expect.stringMatching(/^(stopped|retrying|checking_image|playing|stopping|error)$/),
  attempts: expect.any(Number),
  reason_code: null,
  cookie_set: expect.any(Boolean),
};

const BACKEND_STATUS_SHAPE = {
  connected: expect.any(Boolean),
  backend: expect.any(String),
  email: expect.any(String),
  brands: expect.any(Number),
  schedules: expect.any(Number),
  api_calls_5m: expect.any(Number),
};

describe('Live QC contract v1 (e2e)', () => {
  let app: NestFastifyApplication;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = await createDataDir({ 'shops.json': SHOPS_JSON });
    app = await createTestApp({ dataDir, backendHttp: fakeBackend() });
    await loginToFakeBackend(app);
  });

  afterAll(async () => {
    await app.close();
    await removeDataDir(dataDir);
  });

  // Monitor and detection keep their state in memory and backend sync keeps its lists, so those tests start from a fresh app; layout settings live in the shared data folder.
  const useFreshApp = (): void => {
    beforeEach(async () => {
      await app.close();
      app = await createTestApp({ dataDir });
    });
  };

  const call = (method: Method, path: string, payload?: object): Promise<Response> =>
    callApi(app, method, path, payload);

  it('answers an unknown route with the error envelope', async () => {
    expectError(await call('GET', '/nope'), 404, 'NOT_FOUND');
  });

  describe('shops', () => {
    it('GET /shops lists shop rows', async () => {
      const response = await call('GET', '/shops');

      expect(response.statusCode).toBe(200);
      const { items } = response.json();
      expect(items.length).toBeGreaterThan(0);
      for (const row of items) {
        expect(row).toMatchObject(SHOP_ROW_SHAPE);
        for (const field of ['message', 'checked_at', 'live_since', 'frame_url']) {
          expect(nullableString(row[field])).toBe(true);
        }
      }
    });

    it('GET /shops/:key returns detail with schedules', async () => {
      const response = await call('GET', `/shops/${BACKEND_SHOP}`);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        ...SHOP_ROW_SHAPE,
        key: BACKEND_SHOP,
        config: expect.any(Object),
        schedules: expect.any(Array),
      });
    });

    it('POST /shops creates a shop', async () => {
      const response = await call('POST', '/shops', { platform: 'tiktok', username: 'x' });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ ...SHOP_ROW_SHAPE, platform: 'tiktok' });
    });

    it('PUT /shops/:key returns the shop', async () => {
      const response = await call('PUT', `/shops/${KNOWN_SHOP}`, {
        live_url: 'https://www.tiktok.com/@x/live',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ key: KNOWN_SHOP });
    });

    it('DELETE /shops/:key answers 204 with no body', async () => {
      const response = await call('DELETE', `/shops/${DELETABLE_SHOP}`);

      expect(response.statusCode).toBe(204);
      expect(response.body).toBe('');
    });

    it.each([
      ['GET', `/shops/${UNKNOWN_SHOP}`],
      ['PUT', `/shops/${UNKNOWN_SHOP}`],
      ['DELETE', `/shops/${UNKNOWN_SHOP}`],
    ] as const)('%s %s returns SHOP_NOT_FOUND', async (method, url) => {
      expectError(
        await call(method, url, method === 'PUT' ? {} : undefined),
        404,
        'SHOP_NOT_FOUND',
      );
    });

    it.each([
      ['an unknown platform', { platform: 'youtube', username: 'x' }],
      ['a TikTok shop without username', { platform: 'tiktok' }],
      ['a Shopee shop without cookie', { platform: 'shopee', name: 'x' }],
      ['an empty name', { platform: 'shopee', name: '', cookie: 'SPC_SC_SESSION=x' }],
      ['a non-integer user_id', { platform: 'tiktok', username: 'x', user_id: 'abc' }],
      [
        'a live_url that is not http(s)',
        { platform: 'tiktok', username: 'x', live_url: 'ftp://x.com' },
      ],
      ['an unknown field', { platform: 'tiktok', username: 'x', brand_id: 1 }],
    ])('POST /shops rejects %s', async (_case, body) => {
      expectError(await call('POST', '/shops', body), 400, 'BAD_REQUEST');
    });

    it('PUT /shops/:key accepts null for the optional fields', async () => {
      const response = await call('PUT', `/shops/${KNOWN_SHOP}`, {
        name: null,
        user_id: null,
        shop_id: null,
        live_url: null,
      });

      expect(response.statusCode).toBe(200);
    });

    it.each([
      ['an empty name', { name: '' }],
      ['a null username', { username: null }],
      ['an empty username', { username: '' }],
      ['a null cookie', { cookie: null }],
      ['an empty live_url', { live_url: '' }],
    ])('PUT /shops/:key rejects %s', async (_case, body) => {
      expectError(await call('PUT', `/shops/${KNOWN_SHOP}`, body), 400, 'BAD_REQUEST');
    });

    it('PUT /shops/:key rejects platform, which cannot change', async () => {
      expectError(
        await call('PUT', `/shops/${KNOWN_SHOP}`, { platform: 'shopee' }),
        400,
        'BAD_REQUEST',
      );
    });
  });

  describe('detection', () => {
    it('start/stop return the job state', async () => {
      const start = await call('POST', `/shops/${KNOWN_SHOP}/detection/start`);
      const stop = await call('POST', `/shops/${KNOWN_SHOP}/detection/stop`);

      expect(start.statusCode).toBe(200);
      expect(start.json()).toEqual({
        key: KNOWN_SHOP,
        state: 'retrying',
        message: expect.any(String),
        reason_code: null,
      });
      expect(stop.json()).toEqual({
        key: KNOWN_SHOP,
        state: 'stopped',
        message: null,
        reason_code: null,
      });
    });

    it.each([KNOWN_SHOP, BACKEND_SHOP])(
      'GET /shops/:key/frame of %s returns FRAME_NOT_FOUND while frame_url is null',
      async (key) => {
        const shop = (await call('GET', `/shops/${key}`)).json();

        expect(shop.frame_url).toBeNull();
        expectError(await call('GET', `/shops/${key}/frame`), 404, 'FRAME_NOT_FOUND');
      },
    );

    it.each([
      ['POST', `/shops/${UNKNOWN_SHOP}/detection/start`],
      ['GET', `/shops/${UNKNOWN_SHOP}/frame`],
    ] as const)('%s %s returns SHOP_NOT_FOUND', async (method, url) => {
      expectError(await call(method, url), 404, 'SHOP_NOT_FOUND');
    });

    it('stops by key even when the shop does not exist', async () => {
      const stop = await call('POST', `/shops/${UNKNOWN_SHOP}/detection/stop`);

      expect(stop.statusCode).toBe(200);
      expect(stop.json()).toEqual({
        key: UNKNOWN_SHOP,
        state: 'stopped',
        message: null,
        reason_code: null,
      });
    });
  });

  describe('monitor', () => {
    useFreshApp();

    it('start/stop round-trips', async () => {
      const start = await call('POST', '/monitor/start', { platforms: ['tiktok'], keys: ['a'] });
      const current = await call('GET', '/monitor');
      const stop = await call('POST', '/monitor/stop');

      const running = { running: true, platforms: ['tiktok'], keys: ['a'] };
      expect(start.json()).toEqual(running);
      expect(current.json()).toEqual(running);
      expect(stop.json()).toEqual({ running: false, platforms: [], keys: null });
    });

    it('reads keys: null as every shop of the platforms, as the Python tool', async () => {
      const response = await call('POST', '/monitor/start', { platforms: ['tiktok'], keys: null });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ running: true, platforms: ['tiktok'], keys: null });
    });

    it('start without keys monitors every shop, and a second start replaces the set', async () => {
      const all = await call('POST', '/monitor/start', { platforms: ['shopee'] });
      const some = await call('POST', '/monitor/start', { platforms: ['shopee'], keys: ['b'] });

      expect(all.json()).toEqual({ running: true, platforms: ['shopee'], keys: null });
      expect(some.json()).toEqual({ running: true, platforms: ['shopee'], keys: ['b'] });
    });

    it('start with an empty platform list returns NO_PLATFORM_SELECTED', async () => {
      expectError(
        await call('POST', '/monitor/start', { platforms: [] }),
        400,
        'NO_PLATFORM_SELECTED',
      );
    });

    it.each([
      ['a missing body', undefined],
      ['an unknown platform', { platforms: ['youtube'] }],
      ['platforms that is not an array', { platforms: 'tiktok' }],
      ['keys that is not a string array', { platforms: ['tiktok'], keys: 'abc' }],
    ])('start rejects %s', async (_case, body) => {
      expectError(await call('POST', '/monitor/start', body), 400, 'BAD_REQUEST');
    });
  });

  describe('backend', () => {
    let backendDir: string;
    const backendHttp = { request: jest.fn() };

    // Each test gets its own data folder, because a login writes backend_session.json there.
    beforeEach(async () => {
      backendDir = await createDataDir({});
      backendHttp.request.mockReset().mockResolvedValue(ADMIN_LOGIN_ANSWER);
      await app.close();
      app = await createTestApp({ dataDir: backendDir, backendHttp });
    });

    afterEach(() => removeDataDir(backendDir));

    it('reports disconnected, then connected after login, then disconnected after logout', async () => {
      const before = await call('GET', '/backend/status');
      const login = await call('POST', '/backend/login', LOGIN);
      const sync = await call('POST', '/backend/sync');
      const logout = await call('POST', '/backend/logout');

      for (const response of [before, login, sync, logout]) {
        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject(BACKEND_STATUS_SHAPE);
      }
      expect(before.json().connected).toBe(false);
      expect(login.json().connected).toBe(true);
      expect(sync.json().connected).toBe(true);
      expect(logout.json().connected).toBe(false);
      expect(Object.keys(login.json()).sort()).toEqual(Object.keys(before.json()).sort());
      expect(login.json()).toMatchObject({
        backend: 'http://localhost',
        email: 'ad•••@example.com',
        name: 'Sample Admin',
        role: 'admin',
      });
    });

    it('sync without a login is 400 BACKEND_NOT_CONNECTED', async () => {
      expectError(await call('POST', '/backend/sync'), 400, 'BACKEND_NOT_CONNECTED');
    });

    it.each([
      [
        'wrong credentials',
        () => backendHttp.request.mockRejectedValue(new BackendRequestError('x', 401)),
      ],
      [
        'an unreachable backend',
        () => backendHttp.request.mockRejectedValue(new BackendRequestError('x', 0)),
      ],
      [
        'an account that is not an admin',
        () =>
          backendHttp.request.mockResolvedValue({
            ...ADMIN_LOGIN_ANSWER,
            user: { ...ADMIN_LOGIN_ANSWER.user, role: 'shop' },
          }),
      ],
    ])(
      'login with %s is 400 BACKEND_LOGIN_FAILED and stays disconnected',
      async (_case, arrange) => {
        arrange();

        expectError(await call('POST', '/backend/login', LOGIN), 400, 'BACKEND_LOGIN_FAILED');
        expect((await call('GET', '/backend/status')).json().connected).toBe(false);
      },
    );

    it.each([
      ['a malformed email', { email: 'admin', password: 'x' }],
      ['an empty password', { email: LOGIN.email, password: '' }],
      ['a missing password', { email: LOGIN.email }],
    ])('login rejects %s', async (_case, body) => {
      expectError(await call('POST', '/backend/login', body), 400, 'BAD_REQUEST');
    });
  });

  describe('layout', () => {
    useFreshApp();

    it('GET /settings/layout returns the snapshot', async () => {
      const response = await call('GET', '/settings/layout');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        settings: expect.objectContaining({ detector: 'mpv', rows: 0 }),
        screen: expect.any(Object),
        area: expect.any(Object),
        aspects: ['9:16', '16:9', '3:4', '1:1'],
        detectors: ['mpv', 'ffmpeg'],
        tiles: expect.any(Array),
      });
    });

    it('PUT /settings/layout changes only the sent fields', async () => {
      const before = (await call('GET', '/settings/layout')).json().settings;
      const response = await call('PUT', '/settings/layout', { detector: 'ffmpeg' });

      expect(response.statusCode).toBe(200);
      expect(response.json().settings).toEqual({ ...before, detector: 'ffmpeg' });
    });

    it.each([
      ['an unknown aspect', { aspect: 'banana' }],
      ['an unknown detector', { detector: 'vlc' }],
      ['a non-integer number', { rows: 'abc' }],
      ['a negative size', { rows: -1 }],
      ['a negative gap', { gap: -4 }],
      ['a non-boolean flag', { live_only: 'yes' }],
      ['a null flag', { enabled: null }],
      ['a null number', { rows: null }],
      ['an unknown field', { evil: 1 }],
    ])('PUT /settings/layout rejects %s', async (_case, body) => {
      expectError(await call('PUT', '/settings/layout', body), 400, 'BAD_REQUEST');
    });

    it('PUT /settings/layout without a body changes nothing', async () => {
      const before = (await call('GET', '/settings/layout')).json().settings;

      const response = await call('PUT', '/settings/layout');

      expect(response.statusCode).toBe(200);
      expect(response.json().settings).toEqual(before);
    });
  });

  describe('a channel with a running job', () => {
    useFreshApp();

    const startJob = (): void => {
      app.get(DetectionStateStore, { strict: false }).update(KNOWN_SHOP, {
        status: LiveStatus.LIVE,
        jobState: JobState.PLAYING,
        attempts: 2,
        message: null,
        checkedAt: '2026-01-01T00:00:00.000Z',
        liveSince: '2026-01-01T00:00:00.000Z',
        framePath: 'frame.jpg',
        frameAtMs: 1700000000000,
      });
    };

    it('shows its detection state in the row and the detail', async () => {
      startJob();

      const row = (await call('GET', '/shops'))
        .json()
        .items.find((item: { key: string }) => item.key === KNOWN_SHOP);
      const detail = (await call('GET', `/shops/${KNOWN_SHOP}`)).json();

      for (const shop of [row, detail]) {
        expect(shop).toMatchObject({
          status: 'live',
          job_state: 'playing',
          attempts: 2,
          reason_code: null,
          live_since: '2026-01-01T00:00:00.000Z',
          frame_url: `/api/v1/shops/${KNOWN_SHOP}/frame?t=1700000000000`,
        });
      }
    });

    it('serves its frame as a JPEG', async () => {
      startJob();

      const response = await app.inject({
        method: 'GET',
        url: apiPath(`/shops/${KNOWN_SHOP}/frame`),
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/jpeg');
      expect(response.rawPayload.subarray(0, 2).toString('hex')).toBe('ffd8');
    });

    it('is a live tile with a stream URL on the layout and the wall', async () => {
      startJob();

      const layout = (await call('GET', '/settings/layout')).json();
      const wall = (await call('GET', '/wall')).json();

      expect(layout.tiles.find((tile: { key: string }) => tile.key === KNOWN_SHOP)).toMatchObject({
        live: true,
      });
      expect(wall.tiles.find((tile: { key: string }) => tile.key === KNOWN_SHOP)).toMatchObject({
        live: true,
        url: expect.stringMatching(/^https:/),
      });
    });

    it('goes back to idle once it is stopped', async () => {
      startJob();

      await call('POST', `/shops/${KNOWN_SHOP}/detection/stop`);

      const detail = (await call('GET', `/shops/${KNOWN_SHOP}`)).json();
      expect(detail).toMatchObject({
        status: 'not_checked',
        job_state: 'stopped',
        frame_url: null,
      });
    });
  });

  describe('wall', () => {
    useFreshApp();

    it('GET /wall follows the saved layout settings and the shop list', async () => {
      await call('PUT', '/settings/layout', { detector: 'ffmpeg', gap: 8, live_only: true });
      const shops = (await call('GET', '/shops')).json().items;
      const wall = (await call('GET', '/wall')).json();

      expect(wall.detector).toBe('ffmpeg');
      expect(wall.settings).toMatchObject({ gap: 8, live_only: true });
      expect(wall.tiles.map((tile: { key: string }) => tile.key)).toEqual(
        shops.map((shop: { key: string }) => shop.key),
      );
    });

    it('GET /wall tiles are the layout tiles plus a URL for live ones', async () => {
      const layout = (await call('GET', '/settings/layout')).json();
      const wall = (await call('GET', '/wall')).json();

      expect(wall.tiles.map(({ url: _url, ...tile }: { url: string | null }) => tile)).toEqual(
        layout.tiles,
      );
      expect(wall.detector).toMatch(/^(mpv|ffmpeg)$/);
      for (const tile of wall.tiles) {
        expect(tile).toMatchObject({
          key: expect.any(String),
          label: expect.any(String),
          live: expect.any(Boolean),
          visible: expect.any(Boolean),
        });
        expect(tile.url === null).toBe(!tile.live);
      }
    });

    it('POST /wall/:key/refresh returns a stream URL', async () => {
      const response = await call('POST', `/wall/${KNOWN_SHOP}/refresh`);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ url: expect.any(String) });
    });

    it('POST /wall/:key/refresh of an unknown shop returns SHOP_NOT_FOUND', async () => {
      expectError(await call('POST', `/wall/${UNKNOWN_SHOP}/refresh`), 404, 'SHOP_NOT_FOUND');
    });
  });
});
