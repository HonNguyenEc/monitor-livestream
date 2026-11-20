import { Injectable, Logger } from '@nestjs/common';

import { AsyncLock } from '../../../common/concurrency/async-lock';
import { MS_PER_SECOND } from '../../../common/constants/time.constants';
import { maskId } from '../../../common/utils/mask';
import {
  BackendAuthError,
  BackendPlayUrlGateway,
  BackendRequestError,
  BackendSchedule,
  PlayUrlLookup,
  backendErrorDetail,
  backendErrorText,
} from '../../backend';
import { PlatformResolver } from '../interfaces/platform-resolver.interface';
import { MSG_BUDGET_SPENT } from '../constants/resolver.constants';
import { ResolveDeadline } from '../utils/resolve-deadline';
import { ResolveFailureCode } from '../enums/resolve-failure-code.enum';
import { ResolveRequest } from '../models/resolve-request.model';
import {
  cancelled,
  failed,
  failedRaw,
  resolved,
  ResolveResult,
} from '../models/resolve-result.model';
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
  /** Not an answer of the backend (the resolve was cancelled): neither cached nor counted as a failure. */
  transient?: boolean;
}

/**
 * The stream of a backend (Shopee Open API) channel from the backend play_url endpoint, as
 * `BackendSync.resolve` of backend_sync.py. Tries the session of every on-air schedule, most
 * likely first, then the brand current session. It stops at the first that is live, or at a
 * backend failure or a cancel. Only answers it stored itself are reused, for a TTL by outcome.
 */
@Injectable()
export class BackendPlayUrlResolver implements PlatformResolver {
  private readonly logger = new Logger(BackendPlayUrlResolver.name);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly brandLocks = new Map<string, AsyncLock>();
  private seenEpoch: number;

  constructor(private readonly backend: BackendPlayUrlGateway) {
    this.seenEpoch = backend.epoch;
  }

  supports(request: ResolveRequest): boolean {
    return request.brandId !== undefined;
  }

  /** One request per brand at a time: a caller arriving meanwhile waits, then takes the cached answer. */
  async resolve(request: ResolveRequest): Promise<ResolveResult> {
    const brandId = request.brandId;
    this.dropStale();
    if (!brandId || !this.backend.connected) {
      return failed(ResolveFailureCode.BACKEND_NOT_CONNECTED, MSG_NOT_CONNECTED);
    }
    const candidates = new Map<string, BackendSchedule | null>();
    for (const schedule of this.backend.onAirSchedules(brandId)) {
      if (!candidates.has(schedule.sessionId)) candidates.set(schedule.sessionId, schedule);
    }
    if (!candidates.has(CURRENT_SESSION_ID)) candidates.set(CURRENT_SESSION_ID, null);
    const deadline = ResolveDeadline.of(request);
    return this.lockOf(brandId).run(async () => {
      let first: ResolveResult | null = null;
      for (const [sessionId, schedule] of candidates) {
        const result = await this.resolveSession(brandId, schedule, sessionId, deadline);
        if (result.ok) return result;
        first ??= result;
        // Not logged in, the backend failing or the resolve cancelled: do not try the next session.
        if (stopsSessionSearch(result.code)) break;
      }
      return first as ResolveResult;
    });
  }

  /** A logout, a new login or a refused refresh must not leave answers of the old login behind; the locks stay, so a resolve of the old login still in flight keeps the brand serialized. */
  private dropStale(): void {
    if (this.seenEpoch === this.backend.epoch) return;
    this.seenEpoch = this.backend.epoch;
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
    deadline: ResolveDeadline,
  ): Promise<ResolveResult> {
    const key = `${brandId}${CACHE_KEY_SEPARATOR}${sessionId}`;
    const cached = this.cache.get(key);
    const now = Date.now();
    if (cached && now < cached.untilMs) {
      return withCacheNote(cached.result, Math.floor((cached.untilMs - now) / MS_PER_SECOND));
    }
    // A resolve cancelled, or out of budget while it waited for the brand lock, asks nothing.
    if (deadline.signal?.aborted) return cancelled();
    if (deadline.expired()) return BUDGET_SPENT;
    const failures = cached?.failures ?? 0;
    const epoch = this.backend.epoch;
    const fetched = await this.fetch(brandId, schedule, sessionId, deadline, failures);
    if (!fetched.transient && this.backend.epoch === epoch) {
      this.remember(key, fetched, failures);
    }
    return fetched.result;
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
    deadline: ResolveDeadline,
    failures: number,
  ): Promise<Fetched> {
    const offTtl = notLiveTtlMs(schedule !== null);
    let lookup: PlayUrlLookup;
    try {
      lookup = await this.backend.lookup(
        brandId,
        sessionId,
        schedule,
        deadline.remainingMs(),
        deadline.signal,
      );
    } catch (error) {
      if (deadline.signal?.aborted) return { ...TRANSIENT_FETCH, result: cancelled() };
      return this.failure(error, offTtl, failures);
    }
    const { answer, source: where } = lookup;
    const shownId = maskId(answer.sessionId);
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

/** Whether trying the next session is pointless: the backend is not usable, or nobody wants the answer. */
function stopsSessionSearch(code: ResolveFailureCode): boolean {
  return (
    code === ResolveFailureCode.BACKEND_NOT_CONNECTED ||
    code === ResolveFailureCode.BACKEND_ERROR ||
    code === ResolveFailureCode.CANCELLED
  );
}

// A timeout of the resolve itself, not an answer of the backend: never cached.
const BUDGET_SPENT = failed(ResolveFailureCode.BACKEND_ERROR, MSG_BUDGET_SPENT);
const TRANSIENT_FETCH = { ttlMs: 0, failed: false, transient: true };

function withCacheNote(result: ResolveResult, seconds: number): ResolveResult {
  const note = msgCached(seconds);
  return result.ok
    ? resolved(result.urls, result.detail + note)
    : failedRaw(result.code, result.detail + note);
}
