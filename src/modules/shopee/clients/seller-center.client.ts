import { HttpStatus, Injectable } from '@nestjs/common';

import { withTimeout } from '../../../common/concurrency/with-timeout';
import { getJson, JsonResponse } from '../../../common/http/get-json';
import { toSafeId } from '../../../common/utils/to-safe-id';
import {
  LOCATION_HEADER,
  MAX_LINK_REDIRECTS,
  MSG_SELLER_CENTER_NO_ANSWER,
  msgSellerCenterAnswered,
  REDIRECT_STATUS_MAX,
  REDIRECT_STATUS_MIN,
  SELLER_CENTER_LOGIN_URL,
  SELLER_CENTER_SESSION_INFO_URL,
  SELLER_CENTER_TIMEOUT_MS,
  SHOPEE_HEADERS,
  SHOPEE_LIVE_BASE_URL,
  SHOPEE_LIVE_HOST,
  SHOPEE_ONGOING_PATH,
  SHOPEE_SESSION_QUERY_PARAM,
  SHOPEE_SHARE_REFERER,
} from '../constants/seller-center.constants';
import { DisallowedLiveUrlError } from '../errors/disallowed-live-url.error';
import { SellerCenterUnavailableError } from '../errors/seller-center-unavailable.error';
import { SellerAccount } from '../models/seller-account.model';
import { isLoginOutage } from '../utils/login-outage';
import { sellerCenterHeaders } from '../utils/seller-center-headers';
import { isAllowedShopeeUrl } from '../utils/shopee-url-policy';
import { textOf } from '../../../common/utils/text-of';

export interface LoginLookup extends JsonResponse {
  /** Null unless the login answered 200 with a safe id. */
  userId: number | null;
}

/** Every call to Shopee: the Seller Center login and session info, and the public live pages. */
@Injectable()
export class SellerCenterClient {
  /**
   * The account behind `cookie`, or null when Seller Center answers without one (expired or wrong cookie).
   * Throws SellerCenterUnavailableError when no usable answer came (any failure of the call, 5xx, 429
   * or a 200 whose body is not JSON), so an outage is not reported as a rejected cookie.
   */
  async account(cookie: string): Promise<SellerAccount | null> {
    let login: LoginLookup;
    try {
      login = await this.loginUserId(cookie, SELLER_CENTER_TIMEOUT_MS);
    } catch (error) {
      throw new SellerCenterUnavailableError(MSG_SELLER_CENTER_NO_ANSWER, { cause: error });
    }
    if (isLoginOutage(login.status, login.invalidBody)) {
      throw new SellerCenterUnavailableError(msgSellerCenterAnswered(login.status));
    }
    if (login.userId === null) return null;
    return {
      user_id: login.userId,
      shop_id: toSafeId(login.data.shopid),
      username: textOf(login.data.username),
    };
  }

  /** The login check (`seller_center_account` in livestream_qc/resolvers.py); status and body flags let the caller tell an outage from a rejection. Network errors throw. */
  async loginUserId(cookie: string, timeoutMs: number, signal?: AbortSignal): Promise<LoginLookup> {
    const { status, data, invalidBody } = await getJson(
      SELLER_CENTER_LOGIN_URL,
      sellerCenterHeaders(cookie),
      timeoutMs,
      signal,
    );
    return {
      status,
      data,
      invalidBody,
      userId: status === HttpStatus.OK ? toSafeId(data.id) : null,
    };
  }

  /**
   * Session id from a share link or a short link. Every hop must pass the Shopee allow-list before
   * it is requested, so a disallowed link throws DisallowedLiveUrlError instead of being fetched.
   */
  async sessionFromLink(
    url: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<number | null> {
    const start = URL.parse(url);
    if (!start) return null;
    // One budget for every hop of the redirect chain.
    const target = await this.followRedirects(start, withTimeout(timeoutMs, signal));
    if (!target) return null;
    return toSafeId(target.searchParams.get(SHOPEE_SESSION_QUERY_PARAM) ?? '');
  }

  /** Redirects are followed by hand because automatic following would request a disallowed host before it can be checked. */
  private async followRedirects(start: URL, signal: AbortSignal): Promise<URL | null> {
    let current = start;
    for (let hop = 0; hop <= MAX_LINK_REDIRECTS; hop += 1) {
      if (!isAllowedShopeeUrl(current)) throw new DisallowedLiveUrlError();
      if (current.hostname === SHOPEE_LIVE_HOST) return current;
      const response = await fetch(current, {
        headers: { ...SHOPEE_HEADERS },
        redirect: 'manual',
        signal,
      });
      // Only the headers are needed; an unread body would keep the socket busy.
      await response.body?.cancel();
      const location = response.headers.get(LOCATION_HEADER);
      const redirected =
        response.status >= REDIRECT_STATUS_MIN && response.status <= REDIRECT_STATUS_MAX;
      if (!redirected || !location) return current;
      const next = URL.parse(location, current);
      if (!next) return null;
      current = next;
    }
    return null;
  }

  ongoingLive(userId: number, timeoutMs: number, signal?: AbortSignal): Promise<JsonResponse> {
    return getJson(
      `${SHOPEE_LIVE_BASE_URL}${SHOPEE_ONGOING_PATH}${userId}`,
      { ...SHOPEE_HEADERS, referer: SHOPEE_SHARE_REFERER },
      timeoutMs,
      signal,
    );
  }

  sessionInfo(
    sessionId: number,
    cookie: string,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<JsonResponse> {
    return getJson(
      `${SELLER_CENTER_SESSION_INFO_URL}${sessionId}`,
      sellerCenterHeaders(cookie),
      timeoutMs,
      signal,
    );
  }
}
