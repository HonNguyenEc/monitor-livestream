import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AuthenticatedBackendTransport } from './clients/authenticated-backend.transport';
import { BackendApiClient } from './clients/backend-api.client';
import { BackendHttpClient } from './clients/backend-http.client';
import { backendConfig } from './config/backend.config';
import { BackendController } from './controllers/backend.controller';
import { BackendLoginState } from './models/backend-login-state.model';
import { BackendSessionRepository } from './repositories/backend-session.repository';
import { BackendConnectionService } from './services/backend-connection.service';
import { BackendPlayUrlGateway } from './services/backend-play-url.gateway';
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
    AuthenticatedBackendTransport,
    { provide: BackendLoginState, useExisting: AuthenticatedBackendTransport },
    BackendApiClient,
    BackendSyncStore,
    BackendSyncService,
    BackendPlayUrlGateway,
  ],
  exports: [BackendSyncStore, BackendPlayUrlGateway],
})
export class BackendModule {}
