import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { DEFAULT_ALLOWED_ORIGINS } from '../src/common/constants/app.constants';
import { ErrorMessage } from '../src/common/constants/error-messages.constants';
import { createTestApp } from './helpers/create-test-app';
import { callApi, expectError } from './helpers/http';

const FOREIGN_ORIGIN = 'https://evil.example';

describe('Local request hook (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(['127.0.0.1:8766', 'localhost:3004', '[::1]:8766', 'LOCALHOST:8766'])(
    'accepts Host %s',
    async (host) => {
      const response = await callApi(app, 'GET', '/health', undefined, { host });

      expect(response.statusCode).toBe(200);
    },
  );

  it('refuses before routing, so unmatched routes and Swagger are covered too', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/docs-json',
      headers: { host: 'attacker.example' },
    });

    expectError(response, 403, 'HOST_NOT_ALLOWED');
    expect(response.json().detail).toBe(ErrorMessage.hostNotAllowed);
  });

  it.each(['attacker.example:8766', 'localhost.evil.example', '127.0.0.1.nip.io:8766'])(
    'rejects the rebound DNS name %s in Host',
    async (host) => {
      expectError(
        await callApi(app, 'GET', '/shops', undefined, { host }),
        403,
        'HOST_NOT_ALLOWED',
      );
    },
  );

  it.each([
    ['POST', '/monitor/stop', FOREIGN_ORIGIN],
    ['PUT', '/settings/layout', FOREIGN_ORIGIN],
    ['DELETE', '/shops/tiktok_any', FOREIGN_ORIGIN],
    ['POST', '/monitor/stop', 'null'],
  ] as const)('rejects %s %s from Origin %s', async (method, path, origin) => {
    expectError(await callApi(app, method, path, {}, { origin }), 403, 'ORIGIN_NOT_ALLOWED');
  });

  it('accepts a write from the service itself, as Swagger "Try it out" sends', async () => {
    const response = await callApi(app, 'POST', '/monitor/stop', undefined, {
      host: 'localhost:5173',
      origin: 'http://localhost:5173',
    });

    expect(response.statusCode).toBe(200);
  });

  it('rejects a write whose loopback Origin differs from Host', async () => {
    const response = await callApi(app, 'POST', '/monitor/stop', undefined, {
      host: 'localhost:8766',
      origin: 'http://localhost:9999',
    });

    expectError(response, 403, 'ORIGIN_NOT_ALLOWED');
  });

  it('accepts a write from an allowed origin and one without Origin', async () => {
    const allowed = await callApi(app, 'POST', '/monitor/stop', undefined, {
      origin: DEFAULT_ALLOWED_ORIGINS,
    });
    const withoutOrigin = await callApi(app, 'POST', '/monitor/stop');

    expect(allowed.statusCode).toBe(200);
    expect(withoutOrigin.statusCode).toBe(200);
  });

  it('lets reads from a foreign origin through, since CORS keeps the response from that page', async () => {
    const response = await callApi(app, 'GET', '/monitor', undefined, { origin: FOREIGN_ORIGIN });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
