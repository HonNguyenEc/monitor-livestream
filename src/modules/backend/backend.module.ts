import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { BackendApiClient } from './clients/backend-api.client';
import { BackendHttpClient } from './clients/backend-http.client';
import { backendConfig } from './config/backend.config';
import { BackendController } from './controllers/backend.controller';
import { BackendSessionRepository } from './repositories/backend-session.repository';
import { BackendConnectionService } from './services/backend-connection.service';
import { BackendSessionService } from './services/backend-session.service';
import { BackendSyncStore } from './services/backend-sync-store.service';
import { BackendSyncService } from './services/backend-sync.service';

@Module({
  imports: [ConfigModule.forFeature(backendConfig)],
  controllers: [BackendController],
  providers: [
    BackendConnectionService,
    BackendSessionService,
    BackendSessionRepository,
    BackendHttpClient,
    BackendApiClient,
    BackendSyncStore,
    BackendSyncService,
  ],
  exports: [BackendApiClient, BackendSessionService, BackendSyncStore],
})
export class BackendModule {}
