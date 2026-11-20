import { Injectable } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ErrorMessage } from '../../../common/constants/error-messages.constants';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { maskEmail, maskUrl } from '../../../common/utils/mask';
import { BackendLoginDto } from '../dtos/backend-login.dto';
import { BackendStatusDto } from '../dtos/backend-status.dto';
import { BackendSessionService } from './backend-session.service';
import { BackendSyncService } from './backend-sync.service';
import { BackendSyncStore } from './backend-sync-store.service';

@Injectable()
export class BackendConnectionService {
  constructor(
    private readonly session: BackendSessionService,
    private readonly sync: BackendSyncService,
    private readonly store: BackendSyncStore,
  ) {}

  status(): BackendStatusDto {
    const user = this.session.user;
    const { syncedAt, error, brands, schedules } = this.store.status;
    return {
      connected: this.session.connected,
      backend: maskUrl(this.session.backendUrl),
      email: maskEmail(user?.email ?? ''),
      name: user?.name ?? '',
      role: user?.role ?? '',
      synced_at: syncedAt,
      error,
      brands,
      schedules,
      api_calls_5m: this.session.recentCallCount(),
    };
  }

  async login(body: BackendLoginDto): Promise<BackendStatusDto> {
    await this.session.login(body.email, body.password);
    // A login to another backend or account must not show the lists of the previous one.
    this.sync.reset();
    await this.sync.syncNow();
    return this.status();
  }

  async logout(): Promise<BackendStatusDto> {
    await this.session.logout();
    this.sync.reset();
    return this.status();
  }

  async syncNow(): Promise<BackendStatusDto> {
    if (!this.session.connected) {
      throw new DomainException(ErrorCode.BACKEND_NOT_CONNECTED, ErrorMessage.backendNotConnected);
    }
    await this.sync.syncNow();
    return this.status();
  }
}
