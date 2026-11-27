import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { BackendRequestError } from '../src/modules/backend/errors/backend-request.error';
import { createTestApp } from './helpers/create-test-app';
import { createDataDir, removeDataDir } from './helpers/data-dir';
import {
  ADMIN_LOGIN,
  BRAND_ID,
  BRAND_KEY,
  BRAND_NAME,
  fakeBackend,
  loginToFakeBackend,
} from './helpers/fake-backend';
import { callApi, expectError } from './helpers/http';

const MINUTE = 60_000;
const SESSION_ID = '88776655';
const SHOPS_JSON = { shops: [{ platform: 'tiktok', username: 'local_one' }] };

function boardRow(scheduleId: string, startOffsetMs: number): Record<string, unknown> {
  const start = Date.now() + startOffsetMs;
  return {
    schedule_id: scheduleId,
    brand_id: BRAND_ID,
    shop: BRAND_NAME,
    platform: 'shopee',
    account_id: 'private-account',
    session_id: SESSION_ID,
    scheduled_at: new Date(start).toISOString(),
    expected_end_at: new Date(start + 60 * MINUTE).toISOString(),
    status: 'waiting',
    status_label: 'Waiting',
    schedule_status: 'scheduled',
  };
}

describe('Backend sync (e2e)', () => {
  let app: NestFastifyApplication;
  let dataDir: string;
  let backend: ReturnType<typeof fakeBackend>;

  const start = async (): Promise<void> => {
    dataDir = await createDataDir({ 'shops.json': SHOPS_JSON });
    backend = fakeBackend({ board: { items: [boardRow('sch-1', -10 * MINUTE)] } });
    app = await createTestApp({ dataDir, backendHttp: backend });
  };

  beforeEach(start);

  afterEach(async () => {
    await app.close();
    await removeDataDir(dataDir);
  });

  it('shows no backend channel and calls no backend before a login', async () => {
    const { items } = (await callApi(app, 'GET', '/shops')).json();

    expect(items.map((row: { key: string }) => row.key)).toEqual(['tiktok_local_one']);
    expect(backend.request).not.toHaveBeenCalled();
    expect((await callApi(app, 'GET', `/shops/${BRAND_KEY}`)).statusCode).toBe(404);
  });

  it('syncs on login: the status counts them and the channels follow the local ones', async () => {
    const login = (await callApi(app, 'POST', '/backend/login', ADMIN_LOGIN)).json();

    expect(login).toMatchObject({ connected: true, error: null, brands: 1, schedules: 1 });
    expect(login.synced_at).toEqual(expect.any(String));
    const { items } = (await callApi(app, 'GET', '/shops')).json();
    expect(items.map((row: { key: string }) => row.key)).toEqual(['tiktok_local_one', BRAND_KEY]);
    expect(items[1]).toEqual({
      key: BRAND_KEY,
      platform: 'shopee',
      label: BRAND_NAME,
      source: 'backend',
      status: 'not_checked',
      job_state: 'stopped',
      attempts: 0,
      message: null,
      reason_code: null,
      checked_at: null,
      live_since: null,
      frame_url: null,
      cookie_set: false,
    });
  });

  it("shows today's schedules with a masked session id and no account id, and the on-air one", async () => {
    await loginToFakeBackend(app);

    const detail = (await callApi(app, 'GET', `/shops/${BRAND_KEY}`)).json();

    expect(detail).toMatchObject({
      key: BRAND_KEY,
      source: 'backend',
      config: { platform: 'shopee', name: BRAND_NAME },
      session: null,
      on_air_schedule_id: 'sch-1',
    });
    expect(detail.schedules).toEqual([
      {
        schedule_id: 'sch-1',
        platform: 'shopee',
        scheduled_at: expect.any(String),
        expected_end_at: expect.any(String),
        status: 'waiting',
        status_label: 'Waiting',
        schedule_status: 'scheduled',
        session_id: '•••6655',
      },
    ]);
    expect(JSON.stringify(detail)).not.toContain('private-account');
    expect(JSON.stringify(detail)).not.toContain(SESSION_ID);
  });

  it('has no on-air schedule when none is within its window', async () => {
    backend.data.board = { items: [boardRow('later', 5 * 60 * MINUTE)] };
    await loginToFakeBackend(app);

    const detail = (await callApi(app, 'GET', `/shops/${BRAND_KEY}`)).json();

    expect(detail.schedules).toHaveLength(1);
    expect(detail.on_air_schedule_id).toBeNull();
  });

  it('only lists the Shopee Open API brands the backend returns for the account', async () => {
    backend.data.brands = [
      { id: BRAND_ID, name: BRAND_NAME, is_connect_shopee: true },
      { id: 'manual-only', name: 'Manual', is_connect_shopee: false },
    ];
    await loginToFakeBackend(app);

    const { items } = (await callApi(app, 'GET', '/shops')).json();

    expect(items).toHaveLength(2);
  });

  it('leaves backend channels read-only', async () => {
    await loginToFakeBackend(app);

    expectError(
      await callApi(app, 'PUT', `/shops/${BRAND_KEY}`, { name: 'x' }),
      409,
      'BACKEND_SHOP_READ_ONLY',
    );
    expectError(await callApi(app, 'DELETE', `/shops/${BRAND_KEY}`), 409, 'BACKEND_SHOP_READ_ONLY');
  });

  it('POST /backend/sync reads the backend again', async () => {
    await loginToFakeBackend(app);
    backend.data.board = { items: [boardRow('a', -MINUTE), boardRow('b', -2 * MINUTE)] };

    const status = (await callApi(app, 'POST', '/backend/sync')).json();

    expect(status).toMatchObject({ brands: 1, schedules: 2, error: null });
    expect((await callApi(app, 'GET', `/shops/${BRAND_KEY}`)).json().schedules).toHaveLength(2);
  });

  it('keeps the last good rows and reports a masked error when a sync fails', async () => {
    await loginToFakeBackend(app);
    backend.data.failures['/live-monitor/board'] = new BackendRequestError('x', 503, 'down', 30);

    const response = await callApi(app, 'POST', '/backend/sync');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      brands: 1,
      schedules: 1,
      error: 'Backend trả lỗi HTTP 503: down',
    });
    expect((await callApi(app, 'GET', '/shops')).json().items).toHaveLength(2);
    expect(JSON.stringify(response.json())).not.toContain('access-1');
  });

  it('clears the channels and the counts on logout', async () => {
    await loginToFakeBackend(app);

    const status = (await callApi(app, 'POST', '/backend/logout')).json();

    expect(status).toMatchObject({
      connected: false,
      synced_at: null,
      error: null,
      brands: 0,
      schedules: 0,
    });
    expect((await callApi(app, 'GET', '/shops')).json().items).toHaveLength(1);
    expect((await callApi(app, 'GET', `/shops/${BRAND_KEY}`)).statusCode).toBe(404);
    expectError(await callApi(app, 'POST', '/backend/sync'), 400, 'BACKEND_NOT_CONNECTED');
  });

  it('replaces the previous login rows when logging in again', async () => {
    await loginToFakeBackend(app);
    backend.data.brands = [];

    await loginToFakeBackend(app);

    expect((await callApi(app, 'GET', '/shops')).json().items).toHaveLength(1);
    expect((await callApi(app, 'GET', '/backend/status')).json()).toMatchObject({ brands: 0 });
  });

  it('still logs in when the first sync fails, and says so in the status', async () => {
    backend.data.failures['/brands'] = new BackendRequestError('x', 500);

    const login = await callApi(app, 'POST', '/backend/login', ADMIN_LOGIN);

    expect(login.statusCode).toBe(200);
    expect(login.json()).toMatchObject({ connected: true, brands: 0, error: expect.any(String) });
  });
});
