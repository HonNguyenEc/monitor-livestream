import { Test } from '@nestjs/testing';
import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from '../../src/app.module';
import { configureApp, createFastifyAdapter } from '../../src/app.setup';
import { DATA_DIR } from '../../src/config/data-dir.module';
import { BackendHttpClient } from '../../src/modules/backend/clients/backend-http.client';
import { backendConfig, toBackendConfig } from '../../src/modules/backend/config/backend.config';
import { DEFAULT_BACKEND_URL } from '../../src/modules/backend/constants/backend.constants';
import { SellerCenterLoginClient } from '../../src/modules/shops/clients/seller-center-login.client';
import { missingDataDir } from './data-dir';

export interface TestAppOptions {
  /** Defaults to a temp folder that does not exist yet, so a test that passes none reads no shops.json and any write lands in the temp folder, never the repo. */
  dataDir?: string;
  /** Replaces the Seller Center calls, so tests never reach Shopee. */
  sellerCenter?: Pick<SellerCenterLoginClient, 'account'>;
  /** Replaces the livestream-backend calls, so tests never reach a real backend. */
  backendHttp?: Pick<BackendHttpClient, 'request'>;
  /** AUTO_LIVES_BACKEND_URL for the app; defaults to DEFAULT_BACKEND_URL whatever the developer's .env says. */
  backendUrl?: string;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DATA_DIR)
    .useValue(options.dataDir ?? missingDataDir())
    .overrideProvider(SellerCenterLoginClient)
    .useValue(options.sellerCenter ?? { account: rejectNetwork })
    .overrideProvider(BackendHttpClient)
    .useValue(options.backendHttp ?? { request: rejectNetwork })
    .overrideProvider(backendConfig.KEY)
    .useValue(toBackendConfig(options.backendUrl ?? DEFAULT_BACKEND_URL))
    .compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter());
  configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

async function rejectNetwork(): Promise<never> {
  throw new Error('The network is not reachable from tests');
}
