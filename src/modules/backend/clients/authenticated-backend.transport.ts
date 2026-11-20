import { HttpStatus, Injectable, Logger } from '@nestjs/common';

import { withTimeout } from '../../../common/concurrency/with-timeout';
import { raceAbort } from '../../../common/concurrency/race-abort';
import {
  API_CALLS_WINDOW_MS,
  BACKEND_TIMEOUT_MS,
  MSG_NO_ANSWER,
  MSG_NOT_LOGGED_IN,
  NO_HTTP_STATUS,
  MSG_REFRESH_ANSWER,
  MSG_REFRESH_REFUSED,
  REFRESH_PATH,
} from '../constants/backend.constants';
import { BackendAnswerError } from '../errors/backend-answer.error';
import { BackendAuthError } from '../errors/backend-auth.error';
import { BackendRequestError } from '../errors/backend-request.error';
import { BackendLoginState } from '../models/backend-login-state.model';
import { BackendSession, BackendUser } from '../models/backend-session.model';
import { BackendSessionRepository } from '../repositories/backend-session.repository';
import { apiUrl } from '../utils/backend-url';
import { readTokens } from '../utils/backend-values';
import { RecentCallCounter } from '../utils/recent-call-counter';
import { BackendHttpClient } from './backend-http.client';

interface PendingRefresh {
  session: BackendSession;
  token: Promise<string>;
}

/** Holds the login and makes every authenticated read with it: the access token, one shared refresh on a 401, the call count. */
@Injectable()
export class AuthenticatedBackendTransport implements BackendLoginState {
  private readonly logger = new Logger(AuthenticatedBackendTransport.name);
  private readonly calls = new RecentCallCounter(API_CALLS_WINDOW_MS);
  private session: BackendSession | null = null;
  private pendingRefresh: PendingRefresh | null = null;
  private loginEpoch = 0;

  constructor(
    private readonly http: BackendHttpClient,
    private readonly repository: BackendSessionRepository,
  ) {}

  get connected(): boolean {
    return this.session !== null;
  }

  get epoch(): number {
    return this.loginEpoch;
  }

  get user(): BackendUser | null {
    return this.session?.user ?? null;
  }

  get baseUrl(): string | null {
    return this.session?.base_url ?? null;
  }

  current(): BackendSession | null {
    return this.session;
  }

  recentCallCount(): number {
    return this.calls.count();
  }

  /** Installs a login (or none) and ends the epoch of the previous one. */
  adopt(session: BackendSession | null): void {
    this.session = session;
    this.loginEpoch += 1;
  }

  /** Puts `previous` back unless a login was installed meanwhile. */
  restoreIfEmpty(previous: BackendSession | null): void {
    if (this.session === null && previous !== null) this.adopt(previous);
  }

  /**
   * GET `path` under /api/v1 with the access token; a 401 refreshes the token pair once and retries.
   * Throws BackendAuthError when there is no usable login, else BackendRequestError.
   */
  async get(
    path: string,
    query: Record<string, string> = {},
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const session = this.session;
    if (!session) {
      throw notLoggedIn();
    }
    const url = apiUrl(session.base_url, path, query);
    // One budget for the first try, the refresh wait and the retry together.
    const deadline = withTimeout(timeoutMs ?? BACKEND_TIMEOUT_MS, signal);
    this.calls.record();
    try {
      return await this.http.request('GET', url, { token: session.access_token, signal: deadline });
    } catch (error) {
      if (!(error instanceof BackendRequestError) || error.status !== HttpStatus.UNAUTHORIZED) {
        throw error;
      }
    }
    const token = await raceAbort(this.refresh(session), deadline).catch((cause: unknown) => {
      // Only the caller's stop or the budget is rewritten, into the shape of an unanswered request.
      if (!deadline.aborted || cause !== deadline.reason) throw cause;
      throw new BackendRequestError(MSG_NO_ANSWER, NO_HTTP_STATUS, '', null, { cause });
    });
    this.calls.record();
    return this.http.request('GET', url, { token, signal: deadline });
  }

  // Callers of one session that hit a 401 together share one refresh: the backend rotates the refresh token.
  private async refresh(stale: BackendSession): Promise<string> {
    if (this.session !== stale) {
      return this.currentToken();
    }
    if (this.pendingRefresh?.session !== stale) {
      const pending: PendingRefresh = {
        session: stale,
        token: this.renew(stale).finally(() => {
          if (this.pendingRefresh === pending) {
            this.pendingRefresh = null;
          }
        }),
      };
      this.pendingRefresh = pending;
    }
    return this.pendingRefresh.token;
  }

  private async renew(session: BackendSession): Promise<string> {
    let answer: unknown;
    try {
      answer = await this.http.request('POST', apiUrl(session.base_url, REFRESH_PATH), {
        body: { refresh_token: session.refresh_token },
      });
    } catch (error) {
      // livestream-backend answers 401 for every refresh token it no longer accepts.
      if (error instanceof BackendRequestError && error.status === HttpStatus.UNAUTHORIZED) {
        const endedEpoch = this.swap(session, null);
        if (endedEpoch !== null) {
          await this.repository.storeQuietly(null);
          this.logger.warn('Backend login expired; logged out');
          const refused = new BackendAuthError(MSG_REFRESH_REFUSED, error.status, {
            cause: error,
          });
          refused.endedEpoch = endedEpoch;
          throw refused;
        }
        return this.currentToken();
      }
      throw error;
    }
    const tokens = readTokens(answer);
    if (!tokens) {
      throw new BackendAnswerError(MSG_REFRESH_ANSWER);
    }
    const renewed: BackendSession = { ...session, ...tokens };
    if (this.swap(session, renewed) === null) return this.currentToken();
    await this.repository.storeQuietly(renewed);
    return renewed.access_token;
  }

  /**
   * Swaps the session only while it is still `expected`, so a logout or a new login wins over a
   * slower refresh. Returns the epoch right after the swap, or null when `expected` was no longer
   * current. Rotating the tokens keeps the epoch; ending the login does not.
   */
  private swap(expected: BackendSession, next: BackendSession | null): number | null {
    if (this.session !== expected) {
      return null;
    }
    this.session = next;
    if (next === null) this.loginEpoch += 1;
    return this.loginEpoch;
  }

  private currentToken(): string {
    if (!this.session) {
      throw notLoggedIn();
    }
    return this.session.access_token;
  }
}

function notLoggedIn(): BackendAuthError {
  return new BackendAuthError(MSG_NOT_LOGGED_IN);
}
