import { Injectable } from '@nestjs/common';

import { maskId } from '../../../common/utils/mask';
import { BackendApiClient } from '../clients/backend-api.client';
import { SESSION_SOURCE_CURRENT, SESSION_SOURCE_SCHEDULE } from '../constants/backend.constants';
import { BackendLoginState } from '../models/backend-login-state.model';
import { BackendSchedule } from '../models/backend-schedule.model';
import { PlayUrlAnswer } from '../models/play-url-answer.model';
import { BackendSyncStore } from './backend-sync-store.service';

export interface PlayUrlLookup {
  answer: PlayUrlAnswer;
  /** Where the session id came from: an on-air schedule or the brand's current session. */
  source: string;
}

/** What the play URL resolver may use of the backend: the login state, the on-air schedules, and the lookup itself. */
@Injectable()
export class BackendPlayUrlGateway {
  constructor(
    private readonly login: BackendLoginState,
    private readonly api: BackendApiClient,
    private readonly store: BackendSyncStore,
  ) {}

  get connected(): boolean {
    return this.login.connected;
  }

  get epoch(): number {
    return this.login.epoch;
  }

  onAirSchedules(brandId: string): BackendSchedule[] {
    return this.store.onAirSchedules(brandId);
  }

  /**
   * Asks the backend for the signed URL of a session (an empty id means the brand's current one) and
   * remembers what it answered, unless the login changed meanwhile. Throws BackendAuthError or BackendRequestError.
   */
  async lookup(
    brandId: string,
    sessionId: string,
    schedule: BackendSchedule | null,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<PlayUrlLookup> {
    const epoch = this.login.epoch;
    const source = schedule ? SESSION_SOURCE_SCHEDULE : SESSION_SOURCE_CURRENT;
    const answer = await this.api.playUrl(brandId, sessionId, timeoutMs, signal);
    if (this.login.epoch === epoch) {
      this.store.setSession(brandId, {
        sessionId: maskId(answer.sessionId),
        shopeeStatus: answer.shopeeStatus,
        isLive: answer.isLive,
        title: answer.title,
        shareUrl: answer.shareUrl,
        expiresAt: answer.expiresAt,
        source,
        scheduleId: schedule?.scheduleId ?? null,
        checkedAt: new Date().toISOString(),
      });
    }
    return { answer, source };
  }
}
