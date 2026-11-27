import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Platform } from '../../../common/enums/platform.enum';
import {
  DisallowedLiveUrlError,
  INVALID_COOKIE_CHARS,
  LoginLookup,
  SellerCenterClient,
  isLoginOutage,
} from '../../shopee';
import { safeErrorMessage } from '../../../common/utils/safe-error-message';
import { isNetworkError } from '../../../common/utils/is-network-error';
import { safeError } from '../../../common/utils/safe-error';
import { isPlainObject } from '../../../common/utils/is-plain-object';
import { ResolveDeadline } from '../utils/resolve-deadline';
import { ResolveFailureCode } from '../enums/resolve-failure-code.enum';
import { JsonResponse } from '../../../common/http/get-json';
import { PlatformResolver } from '../interfaces/platform-resolver.interface';
import { ResolveRequest } from '../models/resolve-request.model';
import {
  cancelled,
  failed,
  resolved,
  ResolveFailure,
  ResolveResult,
} from '../models/resolve-result.model';
import {
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
} from './seller-center.constants';
import { toSafeId } from '../../../common/utils/to-safe-id';
import {
  HTTP_URL_PROTOCOLS,
  MSG_INVALID_JSON_BODY,
} from '../../../common/constants/http.constants';
import { PYTHON_NONE } from '../../../common/constants/python.constants';

function isStreamUrl(value: string): boolean {
  const url = URL.parse(value);
  return url !== null && HTTP_URL_PROTOCOLS.includes(url.protocol);
}

// An outage is not an expired login, so the operator is not sent to paste a new cookie.
function answerFailure(
  { status, data, invalidBody }: JsonResponse,
  refused: boolean,
  msgUnavailable: (status: number) => string,
): ResolveFailure | null {
  if (isLoginOutage(status, invalidBody)) {
    const reason = invalidBody ? MSG_INVALID_JSON_BODY : msgUnavailable(status);
    return failed(ResolveFailureCode.SHOPEE_REQUEST_FAILED, reason);
  }
  if (!refused) return null;
  const message = safeError(String(data.msg || data.message || ''));
  return failed(ResolveFailureCode.SELLER_CENTER_AUTH_FAILED, msgAuthFailed(status, message));
}

function loginFailure(login: LoginLookup): ResolveFailure {
  return (
    answerFailure(login, login.status !== HttpStatus.OK, msgLoginUnavailable) ??
    failed(ResolveFailureCode.MISSING_USER_ID, MSG_MISSING_USER_ID)
  );
}

type SessionLookup = { sessionId: number } | { failure: ResolveFailure };

function text(value: unknown): string {
  return value === undefined || value === null ? PYTHON_NONE : String(value);
}

@Injectable()
export class ShopeeSellerCenterResolver implements PlatformResolver {
  private readonly logger = new Logger(ShopeeSellerCenterResolver.name);

  constructor(private readonly client: SellerCenterClient) {}

  supports(request: ResolveRequest): boolean {
    return request.platform === Platform.SHOPEE && request.brandId === undefined;
  }

  async resolve(request: ResolveRequest): Promise<ResolveResult> {
    const cookie = request.cookie?.trim();
    if (!cookie) return failed(ResolveFailureCode.MISSING_COOKIE, MSG_MISSING_COOKIE);
    if (INVALID_COOKIE_CHARS.test(cookie)) {
      return failed(ResolveFailureCode.INVALID_COOKIE, MSG_INVALID_COOKIE);
    }
    const deadline = ResolveDeadline.of(request);
    try {
      const lookup = await this.findSession(request, cookie, deadline);
      if ('failure' in lookup) return lookup.failure;
      const info = await this.client.sessionInfo(
        lookup.sessionId,
        cookie,
        deadline.remainingMs(),
        deadline.signal,
      );
      return this.fromSessionInfo(lookup.sessionId, info);
    } catch (error) {
      if (error instanceof DisallowedLiveUrlError) {
        return failed(ResolveFailureCode.INVALID_LIVE_URL, MSG_INVALID_LIVE_URL);
      }
      if (deadline.signal?.aborted) return cancelled();
      if (!isNetworkError(error)) throw error;
      const reason = safeErrorMessage(error);
      this.logger.warn(`${SHOPEE_REQUEST_FAILED_EVENT}: ${reason}`);
      return failed(ResolveFailureCode.SHOPEE_REQUEST_FAILED, reason);
    }
  }

  private async findSession(
    request: ResolveRequest,
    cookie: string,
    deadline: ResolveDeadline,
  ): Promise<SessionLookup> {
    if (request.liveUrl) {
      const fromLink = await this.client.sessionFromLink(
        request.liveUrl,
        deadline.remainingMs(),
        deadline.signal,
      );
      if (fromLink) return { sessionId: fromLink };
    }
    let userId = request.userId;
    if (!userId) {
      const login = await this.client.loginUserId(cookie, deadline.remainingMs(), deadline.signal);
      if (!login.userId) return { failure: loginFailure(login) };
      userId = login.userId;
    }
    const { status, data, invalidBody } = await this.client.ongoingLive(
      userId,
      deadline.remainingMs(),
      deadline.signal,
    );
    const ongoing = isPlainObject(data.data) ? data.data.ongoing_live : undefined;
    const sessionId = toSafeId(isPlainObject(ongoing) ? ongoing.session_id : undefined);
    if (sessionId) return { sessionId };
    if (status === HttpStatus.OK && data.err_code === ONGOING_OK_ERR_CODE) {
      return { failure: failed(ResolveFailureCode.NOT_LIVE, MSG_NO_ONGOING) };
    }
    const errCode = 'err_code' in data ? data.err_code : data.error;
    const reason = invalidBody ? MSG_INVALID_JSON_BODY : safeError(text(errCode));
    return {
      failure: failed(
        ResolveFailureCode.ONGOING_LOOKUP_FAILED,
        msgOngoingLookupFailed(status, reason),
      ),
    };
  }

  private fromSessionInfo(sessionId: number, answer: JsonResponse): ResolveResult {
    const { status, data } = answer;
    const code = data.code;
    const refused =
      status !== HttpStatus.OK ||
      (code !== undefined && code !== null && code !== SESSION_INFO_OK_CODE);
    const failure = answerFailure(answer, refused, msgSessionInfoUnavailable);
    if (failure) return failure;
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
