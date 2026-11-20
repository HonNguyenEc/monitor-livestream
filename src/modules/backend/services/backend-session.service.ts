import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ErrorMessage } from '../../../common/constants/error-messages.constants';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { errorMessage } from '../../../common/utils/error-message';
import { maskEmail, maskUrl } from '../../../common/utils/mask';
import { safeError } from '../../../common/utils/safe-error';
import { BackendHttpClient } from '../clients/backend-http.client';
import { BackendConfig, backendConfig } from '../config/backend.config';
import {
  ADMIN_ROLES,
  API_CALLS_WINDOW_MS,
  BACKEND_URL_ENV,
  LOGIN_PATH,
  MSG_NOT_LOGGED_IN,
  MSG_REFRESH_ANSWER,
  MSG_REFRESH_REFUSED,
  NO_HTTP_STATUS,
  REFRESH_PATH,
} from '../constants/backend.constants';
import { BackendAnswerError } from '../errors/backend-answer.error';
import { BackendAuthError } from '../errors/backend-auth.error';
import { BackendRequestError } from '../errors/backend-request.error';
import { BackendSession, BackendUser } from '../models/backend-session.model';
import { BackendSessionRepository } from '../repositories/backend-session.repository';
import { readLoginAnswer, readTokens } from '../utils/backend-values';
import { apiUrl } from '../utils/backend-url';
import { RecentCallCounter } from '../utils/recent-call-counter';

interface PendingRefresh {
  session: BackendSession;
  token: Promise<string>;
}

/** The service's own admin login to livestream-backend and every authenticated read made with it. */
@Injectable()
export class BackendSessionService implements OnModuleInit {
  private readonly logger = new Logger(BackendSessionService.name);
  private readonly calls = new RecentCallCounter(API_CALLS_WINDOW_MS);
  private session: BackendSession | null = null;
  private pendingRefresh: PendingRefresh | null = null;

  constructor(
    @Inject(backendConfig.KEY) private readonly config: BackendConfig,
    private readonly http: BackendHttpClient,
    private readonly repository: BackendSessionRepository,
  ) {}

  async onModuleInit(): Promise<void> {
    const stored = await this.repository.load();
    // Tokens of another backend are useless once AUTO_LIVES_BACKEND_URL points elsewhere.
    this.session = stored?.base_url === this.config.baseUrl ? stored : null;
    if (stored && !this.session) {
      this.logger.log(
        `Stored login of ${maskUrl(stored.base_url)} ignored: the service uses ${maskUrl(this.config.url)}`,
      );
    }
  }

  get connected(): boolean {
    return this.session !== null;
  }

  get user(): BackendUser | null {
    return this.session?.user ?? null;
  }

  get backendUrl(): string {
    return this.session?.base_url ?? this.config.baseUrl ?? this.config.url;
  }

  recentCallCount(): number {
    return this.calls.count();
  }

  /** Throws DomainException BACKEND_LOGIN_FAILED with the reason, and lets an unexpected error pass through; the password is never stored or logged. */
  async login(email: string, password: string): Promise<void> {
    const baseUrl = this.config.baseUrl;
    if (!baseUrl) {
      throw loginFailed(ErrorMessage.backendUrlInvalid(BACKEND_URL_ENV));
    }
    let answer: unknown;
    try {
      answer = await this.http.request('POST', apiUrl(baseUrl, LOGIN_PATH), {
        body: { email, password },
      });
    } catch (error) {
      if (!(error instanceof BackendRequestError)) {
        throw error;
      }
      throw loginFailed(this.loginFailureMessage(error));
    }
    const login = readLoginAnswer(answer);
    if (!login) {
      throw loginFailed(ErrorMessage.backendLoginAnswerInvalid);
    }
    if (!ADMIN_ROLES.includes(login.user.role)) {
      throw loginFailed(ErrorMessage.backendNotAdmin(email, login.user.role));
    }
    this.logger.log(`Logged in as ${maskEmail(email)} at ${maskUrl(baseUrl)}`);
    await this.replace(this.session, { base_url: baseUrl, ...login });
  }

  // Local only: the backend's /auth/logout revokes the account's refresh tokens on every device.
  async logout(): Promise<void> {
    const session = this.session;
    this.session = null;
    try {
      await this.repository.store(null);
    } catch (error) {
      // The file would log in again after a restart, so the logout has not happened.
      this.session ??= session;
      throw error;
    }
    this.logger.log('Logged out');
  }

  /**
   * GET `path` under /api/v1 with the access token; a 401 refreshes the token pair once and retries.
   * Throws BackendAuthError when there is no usable login, else BackendRequestError.
   */
  async get(
    path: string,
    query: Record<string, string> = {},
    timeoutMs?: number,
  ): Promise<unknown> {
    const session = this.session;
    if (!session) {
      throw notLoggedIn();
    }
    const url = apiUrl(session.base_url, path, query);
    this.calls.record();
    try {
      return await this.http.request('GET', url, { token: session.access_token, timeoutMs });
    } catch (error) {
      if (!(error instanceof BackendRequestError) || error.status !== HttpStatus.UNAUTHORIZED) {
        throw error;
      }
    }
    const token = await this.refresh(session);
    this.calls.record();
    return this.http.request('GET', url, { token, timeoutMs });
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
        if (await this.replace(session, null)) {
          this.logger.warn('Backend login expired; logged out');
          throw new BackendAuthError(MSG_REFRESH_REFUSED, error.status, {
            cause: error,
          });
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
    return (await this.replace(session, renewed)) ? renewed.access_token : this.currentToken();
  }

  /**
   * Swaps the session only while it is still `expected`, so a logout or a new login wins over a
   * slower refresh, and stores the result.
   */
  private async replace(
    expected: BackendSession | null,
    next: BackendSession | null,
  ): Promise<boolean> {
    if (this.session !== expected) {
      return false;
    }
    this.session = next;
    await this.repository.storeQuietly(next);
    return true;
  }

  private currentToken(): string {
    if (!this.session) {
      throw notLoggedIn();
    }
    return this.session.access_token;
  }

  private loginFailureMessage(error: BackendRequestError): string {
    if (error.status === NO_HTTP_STATUS) {
      this.logger.warn(
        `Backend login got no answer: ${safeError(errorMessage(error.cause ?? error))}`,
      );
      return ErrorMessage.backendUnreachable(BACKEND_URL_ENV);
    }
    if (error.status === HttpStatus.UNAUTHORIZED) {
      return ErrorMessage.backendWrongCredentials;
    }
    return ErrorMessage.backendLoginRefused(error.status, error.remoteMessage);
  }
}

function loginFailed(message: string): DomainException {
  return new DomainException(ErrorCode.BACKEND_LOGIN_FAILED, message);
}

function notLoggedIn(): BackendAuthError {
  return new BackendAuthError(MSG_NOT_LOGGED_IN);
}
