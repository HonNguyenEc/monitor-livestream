import { Injectable, Logger } from '@nestjs/common';

import { AsyncLock } from '../../../common/concurrency/async-lock';
import { maskId } from '../../../common/utils/mask';
import { BackendApiClient } from '../../backend/clients/backend-api.client';
import {
  SESSION_SOURCE_CURRENT,
  SESSION_SOURCE_SCHEDULE,
} from '../../backend/constants/backend.constants';
import { MS_PER_SECOND } from '../../backend/constants/backend-sync.constants';
import { BackendAuthError } from '../../backend/errors/backend-auth.error';
import { BackendRequestError } from '../../backend/errors/backend-request.error';
import { BackendSchedule } from '../../backend/models/backend-schedule.model';
import { PlayUrlAnswer } from '../../backend/models/play-url-answer.model';
import { BackendSessionService } from '../../backend/services/backend-session.service';
import { BackendSyncStore } from '../../backend/services/backend-sync-store.service';
import { backendErrorDetail, backendErrorText } from '../../backend/utils/backend-error-text';
import { DEFAULT_RESOLVE_TIMEOUT_MS } from '../constants/resolver.constants';
import { ResolveFailureCode } from '../enums/resolve-failure-code.enum';
import { ResolveRequest } from '../models/resolve-request.model';
import { failed, failedRaw, resolved, ResolveResult } from '../models/resolve-result.model';
import {
  CACHE_KEY_SEPARATOR,
  CACHE_RETENTION_MS,
  CURRENT_SESSION_ID,
  MSG_NOT_CONNECTED,
  msgCached,
  msgNoApiSession,
  msgNoPlayUrl,
  msgNotLive,
  msgResolved,
  NO_API_SESSION_STATUS,
} from './backend-play-url.constants';
import { errorBackoffMs, liveTtlMs, notLiveTtlMs } from './backend-play-url-ttl';

interface CacheEntry {
  untilMs: number;
  result: ResolveResult;
  /** Consecutive failures of this session, for the backoff. */
  failures: number;
}

interface Fetched {
  result: ResolveResult;
  ttlMs: number;
  failed: boolean;
}

/**
 * The stream of a backend (Shopee Open API) channel from the backend play_url endpoint, as
 * `BackendSync.resolve` of backend_sync.py. Tries the session of every on-air schedule, most
 * likely first, then the brand current session, and stops at the first that is live.
 */
@Injectable()
export class BackendPlayUrlResolver {
  private readonly logger = new Logger(BackendPlayUrlResolver.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly brandLocks = new Map<string, AsyncLock>();
  private seenGeneration: number;

  constructor(
    private readonly session: BackendSessionService,
    private readonly api: BackendApiClient,
    private readonly store: BackendSyncStore,
  ) {
    this.seenGeneration = store.generation;
  }

  /** One request per brand at a time: a caller arriving meanwhile waits, then takes the cached answer. */
  async resolve(request: ResolveRequest): Promise<ResolveResult> {
    const brandId = request.brandId;
    this.dropStale();
    if (!brandId || !this.session.connected) {
      return failed(ResolveFailureCode.BACKEND_NOT_CONNECTED, MSG_NOT_CONNECTED);
    }
    const candidates = new Map<string, BackendSchedule | null>();
    for (const schedule of this.store.onAirSchedules(brandId)) {
      if (!candidates.has(schedule.sessionId)) candidates.set(schedule.sessionId, schedule);
    }
    if (!candidates.has(CURRENT_SESSION_ID)) candidates.set(CURRENT_SESSION_ID, null);
    const timeoutMs = request.timeoutMs ?? DEFAULT_RESOLVE_TIMEOUT_MS;
    return this.lockOf(brandId).run(async () => {
      let first: ResolveResult | null = null;
      for (const [sessionId, schedule] of candidates) {
        const result = await this.resolveSession(brandId, schedule, sessionId, timeoutMs);
        if (result.ok) return result;
        first ??= result;
        // Not logged in or the backend failing: do not hammer it with the next session.
        if (isBackendFailure(result.code)) break;
      }
      return first as ResolveResult;
    });
  }

  /** A logout, a new login or a refused refresh must not leave answers of the old login behind; the locks stay, so a resolve of the old login still in flight keeps the brand serialized. */
  private dropStale(): void {
    if (this.seenGeneration === this.store.generation && this.session.connected) return;
    this.seenGeneration = this.store.generation;
    this.cache.clear();
  }

  private lockOf(brandId: string): AsyncLock {
    let lock = this.brandLocks.get(brandId);
    if (!lock) {
      lock = new AsyncLock();
      this.brandLocks.set(brandId, lock);
    }
    return lock;
  }

  private async resolveSession(
    brandId: string,
    schedule: BackendSchedule | null,
    sessionId: string,
    timeoutMs: number,
  ): Promise<ResolveResult> {
    const key = `${brandId}${CACHE_KEY_SEPARATOR}${sessionId}`;
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && now < cached.untilMs) {
      return withCacheNote(cached.result, Math.floor((cached.untilMs - now) / MS_PER_SECOND));
    }
    const failures = cached?.failures ?? 0;
    const generation = this.store.generation;
    const fetched = await this.fetch(brandId, schedule, sessionId, timeoutMs, failures, generation);
    if (this.isCurrent(generation)) {
      this.remember(key, fetched, failures);
    }
    return fetched.result;
  }

  /** False once a logout, a new login or a refused refresh happened since `generation`: the answer is stale. */
  private isCurrent(generation: number): boolean {
    return generation === this.store.generation && this.session.connected;
  }

  private remember(key: string, fetched: Fetched, failures: number): void {
    const now = Date.now();
    for (const [other, entry] of this.cache) {
      if (entry.untilMs + CACHE_RETENTION_MS <= now) this.cache.delete(other);
    }
    this.cache.set(key, {
      untilMs: now + fetched.ttlMs,
      result: fetched.result,
      failures: fetched.failed ? failures + 1 : 0,
    });
  }

  /** Asks the backend once; says how long to reuse the answer and whether it was a failure. */
  private async fetch(
    brandId: string,
    schedule: BackendSchedule | null,
    sessionId: string,
    timeoutMs: number,
    failures: number,
    generation: number,
  ): Promise<Fetched> {
    const where = schedule ? SESSION_SOURCE_SCHEDULE : SESSION_SOURCE_CURRENT;
    const offTtl = notLiveTtlMs(schedule !== null);
    let answer: PlayUrlAnswer;
    try {
      answer = await this.api.playUrl(brandId, sessionId, timeoutMs);
    } catch (error) {
      return this.failure(error, offTtl, failures);
    }
    const shownId = maskId(answer.sessionId);
    if (this.isCurrent(generation))
      this.store.setSession(brandId, {
        sessionId: shownId,
        shopeeStatus: answer.shopeeStatus,
        isLive: answer.isLive,
        title: answer.title,
        shareUrl: answer.shareUrl,
        expiresAt: answer.expiresAt,
        source: where,
        scheduleId: schedule?.scheduleId ?? null,
        checkedAt: new Date().toISOString(),
      });
    if (!answer.isLive) {
      const detail = msgNotLive(shownId, where, answer.shopeeStatus);
      return { result: failed(ResolveFailureCode.NOT_LIVE, detail), ttlMs: offTtl, failed: false };
    }
    if (!answer.playUrl) {
      const detail = msgNoPlayUrl(shownId);
      return {
        result: failed(ResolveFailureCode.NO_PLAY_URL, detail),
        ttlMs: offTtl,
        failed: false,
      };
    }
    this.logger.log(`Play URL of ${shownId} (${where})`);
    return {
      result: resolved([answer.playUrl], msgResolved(shownId, answer.title ?? '')),
      ttlMs: liveTtlMs(answer.expiresAt, Date.now()),
      failed: false,
    };
  }

  private failure(error: unknown, offTtl: number, failures: number): Fetched {
    if (error instanceof BackendAuthError) {
      return {
        result: failed(ResolveFailureCode.BACKEND_NOT_CONNECTED, backendErrorText(error)),
        ttlMs: 0,
        failed: false,
      };
    }
    if (error instanceof BackendRequestError && error.status === NO_API_SESSION_STATUS) {
      const detail = msgNoApiSession(error.remoteMessage);
      return { result: failed(ResolveFailureCode.NOT_LIVE, detail), ttlMs: offTtl, failed: false };
    }
    const retryAfter = error instanceof BackendRequestError ? error.retryAfterSeconds : null;
    const ttlMs = errorBackoffMs(failures + 1, retryAfter);
    const reason = backendErrorText(error);
    this.logger.warn(
      `play_url failed: ${reason} [${backendErrorDetail(error)}]; retrying in ${Math.floor(ttlMs / MS_PER_SECOND)}s`,
    );
    return { result: failed(ResolveFailureCode.BACKEND_ERROR, reason), ttlMs, failed: true };
  }
}

function isBackendFailure(code: ResolveFailureCode): boolean {
  return (
    code === ResolveFailureCode.BACKEND_NOT_CONNECTED || code === ResolveFailureCode.BACKEND_ERROR
  );
}

function withCacheNote(result: ResolveResult, seconds: number): ResolveResult {
  const note = msgCached(seconds);
  return result.ok
    ? resolved(result.urls, result.detail + note)
    : failedRaw(result.code, result.detail + note);
}
