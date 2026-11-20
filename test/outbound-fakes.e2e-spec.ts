import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { Platform } from '../src/common/enums/platform.enum';
import { PlayerLocator } from '../src/modules/players/services/player-locator.service';
import { ChildProcessRegistry } from '../src/modules/processes/services/child-process-registry.service';
import { ResolveFailureCode } from '../src/modules/resolvers/enums/resolve-failure-code.enum';
import { ResolverService } from '../src/modules/resolvers/services/resolver.service';
import { createTestApp } from './helpers/create-test-app';
import { NOT_REACHABLE_MESSAGE, NOT_RUNNABLE_MESSAGE } from './helpers/outbound-fakes';

describe('Outbound fakes of the test app (e2e)', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('resolves through the app graph without reaching the network or yt-dlp', async () => {
    const resolver = app.get(ResolverService, { strict: false });

    const tiktok = await resolver.resolve({
      key: 'tiktok_a',
      platform: Platform.TIKTOK,
      username: 'a',
    });
    const shopee = resolver.resolve({
      key: 'shopee_a',
      platform: Platform.SHOPEE,
      userId: 1,
      cookie: 'SPC_SC_SESSION=x',
    });

    expect(tiktok).toMatchObject({ ok: false, code: ResolveFailureCode.YTDLP_FAILED });
    expect(tiktok.detail).toContain(NOT_REACHABLE_MESSAGE);
    await expect(shopee).rejects.toThrow(NOT_REACHABLE_MESSAGE);
  });

  it('fails a process launch and a player lookup', async () => {
    const registry = app.get(ChildProcessRegistry, { strict: false });
    const locator = app.get(PlayerLocator, { strict: false });

    expect(() => registry.launch('mpv.exe', [])).toThrow(NOT_RUNNABLE_MESSAGE);
    await expect(locator.find()).rejects.toThrow(NOT_RUNNABLE_MESSAGE);
  });
});
