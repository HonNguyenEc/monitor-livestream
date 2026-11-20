import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { createTestApp } from './helpers/create-test-app';
import { createDataDir, removeDataDir } from './helpers/data-dir';
import { callApi, expectError, Method } from './helpers/http';

describe('Routes that read shops.json when it cannot be read (e2e)', () => {
  let app: NestFastifyApplication;
  let dataDir: string;

  beforeEach(async () => {
    dataDir = await createDataDir({
      'shops.json': { shops: [{ platform: 'tiktok', username: 'a' }] },
    });
    app = await createTestApp({ dataDir });
    await writeFile(join(dataDir, 'shops.json'), '{', 'utf8');
  });

  afterEach(async () => {
    await app.close();
    await removeDataDir(dataDir);
  });

  it.each([
    ['GET', '/shops'],
    ['GET', '/shops/tiktok_a'],
    ['POST', '/shops/tiktok_a/detection/start'],
    ['POST', '/shops/tiktok_a/detection/stop'],
    ['GET', '/shops/tiktok_a/frame'],
    ['GET', '/settings/layout'],
    ['GET', '/wall'],
    ['POST', '/wall/tiktok_a/refresh'],
  ] as const)('%s %s answers SHOPS_FILE_UNREADABLE', async (method: Method, path: string) => {
    expectError(await callApi(app, method, path), 500, 'SHOPS_FILE_UNREADABLE');
  });
});
