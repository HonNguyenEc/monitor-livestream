import { Test } from '@nestjs/testing';
import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from '../../src/app.module';
import { configureApp, createFastifyAdapter } from '../../src/app.setup';
import { DATA_DIR } from '../../src/config/data-dir.module';
import { BackendHttpClient } from '../../src/modules/backend/clients/backend-http.client';
import { backendConfig, toBackendConfig } from '../../src/modules/backend/config/backend.config';
import { DEFAULT_BACKEND_URL } from '../../src/modules/backend/constants/backend.constants';
import { PlayerLocator } from '../../src/modules/players/services/player-locator.service';
import { ChildProcessRegistry } from '../../src/modules/processes/services/child-process-registry.service';
import { TikTokRoomClient } from '../../src/modules/resolvers/tiktok/tiktok-room.client';
import { YTDLP_RUNNER } from '../../src/modules/resolvers/ytdlp/ytdlp-runner';
import { SellerCenterClient } from '../../src/modules/shopee/clients/seller-center.client';
import { missingDataDir } from './data-dir';
import {
  fakeChildProcessRegistry,
  fakePlayerLocator,
  fakeSellerCenterClient,
  fakeTikTokRoomClient,
  fakeYtDlpRunner,
  rejectNetwork,
} from './outbound-fakes';

export interface TestAppOptions {
  /** Defaults to a temp folder that does not exist yet, so a test that passes none reads no shops.json and any write lands in the temp folder, never the repo. */
  dataDir?: string;
  /** Replaces calls to Shopee (the cookie check of a shop, the Seller Center lookups of a resolve); calls it does not list fail. */
  sellerCenter?: Partial<Record<keyof SellerCenterClient, unknown>>;
  /** Replaces the livestream-backend calls, so tests never reach a real backend. */
  backendHttp?: Pick<BackendHttpClient, 'request'>;
  /** AUTO_LIVES_BACKEND_URL for the app; defaults to DEFAULT_BACKEND_URL whatever the developer's .env says. */
  backendUrl?: string;
  /** Replaces the TikTok room API; by default a call fails. */
  tiktokRoom?: Pick<TikTokRoomClient, 'fetchRoom'>;
  /** Replaces yt-dlp; by default a run fails. */
  ytdlpRunner?: { run: (...args: never[]) => Promise<unknown> };
  /** Replaces the player lookup; by default a call fails. */
  playerLocator?: Pick<PlayerLocator, 'find'>;
  /** Replaces the child process registry; by default a launch fails and nothing is swept. */
  childProcesses?: Partial<Record<keyof ChildProcessRegistry, unknown>>;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DATA_DIR)
    .useValue(options.dataDir ?? missingDataDir())
    .overrideProvider(SellerCenterClient)
    .useValue({ ...fakeSellerCenterClient, ...options.sellerCenter })
    .overrideProvider(BackendHttpClient)
    .useValue(options.backendHttp ?? { request: rejectNetwork })
    .overrideProvider(TikTokRoomClient)
    .useValue(options.tiktokRoom ?? fakeTikTokRoomClient)
    .overrideProvider(YTDLP_RUNNER)
    .useValue(options.ytdlpRunner ?? fakeYtDlpRunner)
    .overrideProvider(PlayerLocator)
    .useValue(options.playerLocator ?? fakePlayerLocator)
    .overrideProvider(ChildProcessRegistry)
    .useValue(options.childProcesses ?? fakeChildProcessRegistry)
    .overrideProvider(backendConfig.KEY)
    .useValue(toBackendConfig(options.backendUrl ?? DEFAULT_BACKEND_URL))
    .compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter());
  configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}
