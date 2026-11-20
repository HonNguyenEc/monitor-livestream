import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NestFastifyApplication } from '@nestjs/platform-fastify';

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
