import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { createTestApp } from './helpers/create-test-app';
import { callApi } from './helpers/http';

describe('Health (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns the product, status and version', async () => {
    const response = await callApi(app, 'GET', '/health');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      product: 'live-qc',
      status: 'ok',
      version: expect.any(String),
    });
  });
});
