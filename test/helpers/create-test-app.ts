import { Test } from '@nestjs/testing';
import { NestFastifyApplication } from '@nestjs/platform-fastify';

import { AppModule } from '../../src/app.module';
import { configureApp, createFastifyAdapter } from '../../src/app.setup';
import { DATA_DIR } from '../../src/config/data-dir.module';
import { SellerCenterLoginClient } from '../../src/modules/shops/clients/seller-center-login.client';
import { missingDataDir } from './data-dir';

export interface TestAppOptions {
  /** Defaults to a temp folder that does not exist yet, so a test that passes none reads no shops.json and any write lands in the temp folder, never the repo. */
  dataDir?: string;
  /** Replaces the Seller Center calls, so tests never reach Shopee. */
  sellerCenter?: Pick<SellerCenterLoginClient, 'account'>;
}

export async function createTestApp(options: TestAppOptions = {}): Promise<NestFastifyApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DATA_DIR)
    .useValue(options.dataDir ?? missingDataDir())
    .overrideProvider(SellerCenterLoginClient)
    .useValue(options.sellerCenter ?? { account: rejectNetwork })
    .compile();
  const app = moduleRef.createNestApplication<NestFastifyApplication>(createFastifyAdapter());
  configureApp(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();
  return app;
}

async function rejectNetwork(): Promise<never> {
  throw new Error('Seller Center is not reachable from tests');
}
