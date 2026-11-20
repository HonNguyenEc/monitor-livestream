import { HttpStatus, Injectable } from '@nestjs/common';
import { getJson, JsonResponse } from '../../../common/http/get-json';
import {
  fetchSellerCenterLogin,
  sellerCenterHeaders,
} from '../../../common/shopee/seller-center-login';
import {
  SELLER_CENTER_SESSION_INFO_URL,
  SHOPEE_HEADERS,
  SHOPEE_LIVE_BASE_URL,
  LOCATION_HEADER,
  MAX_LINK_REDIRECTS,
  REDIRECT_STATUS_MAX,
  REDIRECT_STATUS_MIN,
  SHOPEE_LIVE_HOST,
  SHOPEE_ONGOING_PATH,
  SHOPEE_SESSION_QUERY_PARAM,
  SHOPEE_SHARE_REFERER,
} from './seller-center.constants';
import { DisallowedLiveUrlError } from './disallowed-live-url.error';
import { isAllowedShopeeUrl } from '../../../common/shopee/shopee-url-policy';
import { toSafeId } from '../../../common/utils/to-safe-id';

function parseUrl(value: string, base?: URL): URL | null {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

export interface LoginLookup extends JsonResponse {
  userId: number | null;
}

@Injectable()
export class SellerCenterSessionClient {
  /**
   * Session id from a share link or a short link. Every hop must pass the Shopee allow-list before
   * it is requested, so a disallowed link throws DisallowedLiveUrlError instead of being fetched.
   */
  async sessionFromLink(url: string, timeoutMs: number): Promise<number | null> {
    const start = parseUrl(url);
    if (!start) return null;
    const target = await this.followRedirects(start, timeoutMs);
    if (!target) return null;
    return toSafeId(target.searchParams.get(SHOPEE_SESSION_QUERY_PARAM) ?? '');
  }

  /** Redirects are followed by hand because automatic following would request a disallowed host before it can be checked. */
  private async followRedirects(start: URL, timeoutMs: number): Promise<URL | null> {
    let current = start;
    for (let hop = 0; hop <= MAX_LINK_REDIRECTS; hop += 1) {
      if (!isAllowedShopeeUrl(current)) throw new DisallowedLiveUrlError();
      if (current.hostname === SHOPEE_LIVE_HOST) return current;
      const response = await fetch(current, {
        headers: { ...SHOPEE_HEADERS },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Only the headers are needed; an unread body would keep the socket busy.
      await response.body?.cancel();
      const location = response.headers.get(LOCATION_HEADER);
      const redirected =
        response.status >= REDIRECT_STATUS_MIN && response.status <= REDIRECT_STATUS_MAX;
      if (!redirected || !location) return current;
      const next = parseUrl(location, current);
      if (!next) return null;
      current = next;
    }
    return null;
  }

  ongoingLive(userId: number, timeoutMs: number): Promise<JsonResponse> {
    return getJson(
      `${SHOPEE_LIVE_BASE_URL}${SHOPEE_ONGOING_PATH}${userId}`,
      { ...SHOPEE_HEADERS, referer: SHOPEE_SHARE_REFERER },
      timeoutMs,
    );
  }

  sessionInfo(sessionId: number, cookie: string, timeoutMs: number): Promise<JsonResponse> {
    return getJson(
      `${SELLER_CENTER_SESSION_INFO_URL}${sessionId}`,
      sellerCenterHeaders(cookie),
      timeoutMs,
    );
  }

  /** `userId` is null unless the login answered 200 with a safe id; status and body flags let the caller tell an outage from a rejection. */
  async loginUserId(cookie: string, timeoutMs: number): Promise<LoginLookup> {
    const { status, data, invalidBody } = await fetchSellerCenterLogin(cookie, timeoutMs);
    const id = data.id ? String(data.id) : '';
    return {
      status,
      data,
      invalidBody,
      userId: status === HttpStatus.OK ? toSafeId(id) : null,
    };
  }
}
