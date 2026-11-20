import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Platform } from '../../../common/enums/platform.enum';
import { isLoginOutage } from '../../../common/shopee/login-outage';
import { INVALID_COOKIE_CHARS } from '../../../common/shopee/shopee-cookie.constants';
import { errorMessage } from '../../../common/utils/error-message';
import { isNetworkError } from '../../../common/utils/is-network-error';
import { safeError } from '../../../common/utils/safe-error';
import { isPlainObject } from '../../../common/utils/is-plain-object';
import { DEFAULT_RESOLVE_TIMEOUT_MS } from '../constants/resolver.constants';
import { ResolveFailureCode } from '../enums/resolve-failure-code.enum';
import { JsonResponse } from '../../../common/http/get-json';
import { PlatformResolver } from '../interfaces/platform-resolver.interface';
import { ResolveRequest } from '../models/resolve-request.model';
import { failed, resolved, ResolveFailure, ResolveResult } from '../models/resolve-result.model';
import { DisallowedLiveUrlError } from './disallowed-live-url.error';
import { LoginLookup, SellerCenterSessionClient } from './seller-center-session.client';
import {
  ABSENT_VALUE_TEXT,
  MSG_INVALID_BODY,
  MSG_INVALID_COOKIE,
  MSG_INVALID_LIVE_URL,
  MSG_MISSING_COOKIE,
  MSG_MISSING_USER_ID,
  MSG_NO_ONGOING,
  msgAuthFailed,
  msgLoginUnavailable,
  msgSessionInfoUnavailable,
  msgNoAccess,
  msgNoPlayUrl,
  msgNotLive,
  msgOngoingLookupFailed,
  msgResolved,
  ONGOING_OK_ERR_CODE,
  SESSION_INFO_OK_CODE,
  SESSION_STATUS_LIVE,
  SHOPEE_REQUEST_FAILED_EVENT,
  STREAM_URL_PROTOCOLS,
} from './seller-center.constants';
import { toSafeId } from '../../../common/utils/to-safe-id';

function isStreamUrl(value: string): boolean {
  try {
    return STREAM_URL_PROTOCOLS.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function loginFailure({ status, data, invalidBody }: LoginLookup): ResolveFailure {
  if (isLoginOutage(status, invalidBody)) {
    const reason = invalidBody ? MSG_INVALID_BODY : msgLoginUnavailable(status);
    return failed(ResolveFailureCode.SHOPEE_REQUEST_FAILED, reason);
  }
  if (status !== HttpStatus.OK) {
    const message = safeError(String(data.msg || data.message || ''));
    return failed(ResolveFailureCode.SELLER_CENTER_AUTH_FAILED, msgAuthFailed(status, message));
  }
  return failed(ResolveFailureCode.MISSING_USER_ID, MSG_MISSING_USER_ID);
}

type SessionLookup = { sessionId: number } | { failure: ResolveFailure };

function text(value: unknown): string {
  return value === undefined || value === null ? ABSENT_VALUE_TEXT : String(value);
}

@Injectable()
export class ShopeeSellerCenterResolver implements PlatformResolver {
  readonly platform = Platform.SHOPEE;
  private readonly logger = new Logger(ShopeeSellerCenterResolver.name);

  constructor(private readonly client: SellerCenterSessionClient) {}

  async resolve(request: ResolveRequest): Promise<ResolveResult> {
    const cookie = request.cookie?.trim();
    if (!cookie) return failed(ResolveFailureCode.MISSING_COOKIE, MSG_MISSING_COOKIE);
    if (INVALID_COOKIE_CHARS.test(cookie)) {
      return failed(ResolveFailureCode.INVALID_COOKIE, MSG_INVALID_COOKIE);
    }
    const timeoutMs = request.timeoutMs ?? DEFAULT_RESOLVE_TIMEOUT_MS;
    try {
      const lookup = await this.findSession(request, cookie, timeoutMs);
      if ('failure' in lookup) return lookup.failure;
      const info = await this.client.sessionInfo(lookup.sessionId, cookie, timeoutMs);
      return this.fromSessionInfo(lookup.sessionId, info);
    } catch (error) {
      if (error instanceof DisallowedLiveUrlError) {
        return failed(ResolveFailureCode.INVALID_LIVE_URL, MSG_INVALID_LIVE_URL);
      }
      if (!isNetworkError(error)) throw error;
      const reason = safeError(errorMessage(error));
      this.logger.warn(`${SHOPEE_REQUEST_FAILED_EVENT}: ${reason}`);
      return failed(ResolveFailureCode.SHOPEE_REQUEST_FAILED, reason);
    }
  }

  private async findSession(
    request: ResolveRequest,
    cookie: string,
    timeoutMs: number,
  ): Promise<SessionLookup> {
    if (request.liveUrl) {
      const fromLink = await this.client.sessionFromLink(request.liveUrl, timeoutMs);
      if (fromLink) return { sessionId: fromLink };
    }
    let userId = request.userId;
    if (!userId) {
      const login = await this.client.loginUserId(cookie, timeoutMs);
      if (!login.userId) return { failure: loginFailure(login) };
      userId = login.userId;
    }
    const { status, data, invalidBody } = await this.client.ongoingLive(userId, timeoutMs);
    const ongoing = isPlainObject(data.data) ? data.data.ongoing_live : undefined;
    const sessionId = toSafeId(isPlainObject(ongoing) ? ongoing.session_id : undefined);
    if (sessionId) return { sessionId };
    if (status === HttpStatus.OK && data.err_code === ONGOING_OK_ERR_CODE) {
      return { failure: failed(ResolveFailureCode.NOT_LIVE, MSG_NO_ONGOING) };
    }
    const errCode = 'err_code' in data ? data.err_code : data.error;
    const reason = invalidBody ? MSG_INVALID_BODY : safeError(text(errCode));
    return {
      failure: failed(
        ResolveFailureCode.ONGOING_LOOKUP_FAILED,
        msgOngoingLookupFailed(status, reason),
      ),
    };
  }

  private fromSessionInfo(
    sessionId: number,
    { status, data, invalidBody }: JsonResponse,
  ): ResolveResult {
    // An outage is not an expired login, so the operator is not sent to paste a new cookie.
    if (isLoginOutage(status, invalidBody)) {
      const reason = invalidBody ? MSG_INVALID_BODY : msgSessionInfoUnavailable(status);
      return failed(ResolveFailureCode.SHOPEE_REQUEST_FAILED, reason);
    }
    const code = data.code;
    if (
      status !== HttpStatus.OK ||
      (code !== undefined && code !== null && code !== SESSION_INFO_OK_CODE)
    ) {
      const message = safeError(String(data.msg || data.message || ''));
      return failed(ResolveFailureCode.SELLER_CENTER_AUTH_FAILED, msgAuthFailed(status, message));
    }
    const info = isPlainObject(data.data) ? data.data : {};
    if (Object.keys(info).length === 0) {
      return failed(ResolveFailureCode.SELLER_CENTER_NO_ACCESS, msgNoAccess(sessionId));
    }
    if (info.sessionStatus !== SESSION_STATUS_LIVE) {
      return failed(
        ResolveFailureCode.NOT_LIVE,
        msgNotLive(sessionId, safeError(text(info.sessionStatus))),
      );
    }
    const url = info.sessionStreamingUrl;
    if (typeof url === 'string' && isStreamUrl(url)) {
      return resolved([url], msgResolved(sessionId, safeError(String(info.sessionTitle || ''))));
    }
    return failed(ResolveFailureCode.NO_PLAY_URL, msgNoPlayUrl(sessionId));
  }
}
