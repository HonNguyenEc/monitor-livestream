import { HttpStatus, Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ErrorMessage } from '../../../common/constants/error-messages.constants';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { errorMessage } from '../../../common/utils/error-message';
import { maskEmail, maskUrl } from '../../../common/utils/mask';
import { safeError } from '../../../common/utils/safe-error';
import { AuthenticatedBackendTransport } from '../clients/authenticated-backend.transport';
import { BackendHttpClient } from '../clients/backend-http.client';
import { BackendConfig, backendConfig } from '../config/backend.config';
import {
  ADMIN_ROLES,
  MSG_LOG_BACKEND_URL_INVALID,
  MSG_LOG_CHECK_BACKEND_URL,
  LOGIN_PATH,
  NO_HTTP_STATUS,
} from '../constants/backend.constants';
import { BackendRequestError } from '../errors/backend-request.error';
import { BackendUser } from '../models/backend-session.model';
import { BackendSessionRepository } from '../repositories/backend-session.repository';
import { apiUrl } from '../utils/backend-url';
import { readLoginAnswer } from '../utils/backend-values';

/** The service's own admin login to livestream-backend: log in, log out, and the stored session across restarts. */
@Injectable()
export class BackendSessionService implements OnModuleInit {
  private readonly logger = new Logger(BackendSessionService.name);

  constructor(
    @Inject(backendConfig.KEY) private readonly config: BackendConfig,
    private readonly http: BackendHttpClient,
    private readonly repository: BackendSessionRepository,
    private readonly transport: AuthenticatedBackendTransport,
  ) {}

  async onModuleInit(): Promise<void> {
    const stored = await this.repository.load();
    // Tokens of another backend are useless once AUTO_LIVES_BACKEND_URL points elsewhere.
    if (stored?.base_url === this.config.baseUrl) {
      this.transport.adopt(stored);
    } else if (stored) {
      this.logger.log(
        `Stored login of ${maskUrl(stored.base_url)} ignored: the service uses ${maskUrl(this.config.url)}`,
      );
    }
  }

  get connected(): boolean {
    return this.transport.connected;
  }

  get user(): BackendUser | null {
    return this.transport.user;
  }

  get backendUrl(): string {
    return this.transport.baseUrl ?? this.config.baseUrl ?? this.config.url;
  }

  recentCallCount(): number {
    return this.transport.recentCallCount();
  }

  /** Throws DomainException BACKEND_LOGIN_FAILED with the reason, and lets an unexpected error pass through; the password is never stored or logged. */
  async login(email: string, password: string): Promise<void> {
    const baseUrl = this.config.baseUrl;
    if (!baseUrl) {
      this.logger.warn(MSG_LOG_BACKEND_URL_INVALID);
      throw loginFailed(ErrorMessage.backendUrlInvalid);
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
    const session = { base_url: baseUrl, ...login };
    this.transport.adopt(session);
    await this.repository.storeQuietly(session);
  }

  // Local only: the backend's /auth/logout revokes the account's refresh tokens on every device.
  async logout(): Promise<void> {
    const previous = this.transport.current();
    this.transport.adopt(null);
    try {
      await this.repository.store(null);
    } catch (error) {
      // The file would log in again after a restart, so the logout has not happened.
      this.transport.restoreIfEmpty(previous);
      throw error;
    }
    this.logger.log('Logged out');
  }

  private loginFailureMessage(error: BackendRequestError): string {
    if (error.status === NO_HTTP_STATUS) {
      this.logger.warn(
        `Backend login got no answer: ${safeError(errorMessage(error.cause ?? error))}; ${MSG_LOG_CHECK_BACKEND_URL}`,
      );
      return ErrorMessage.backendUnreachable;
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
