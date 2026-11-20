import { HttpStatus, Injectable } from '@nestjs/common';

import { JsonResponse } from '../../../common/http/get-json';
import { isLoginOutage } from '../../../common/shopee/login-outage';
import { fetchSellerCenterLogin } from '../../../common/shopee/seller-center-login';
import { SELLER_CENTER_TIMEOUT_MS } from '../../../common/shopee/seller-center.constants';
import { toSafeId } from '../../../common/utils/to-safe-id';
import { MSG_SELLER_CENTER_NO_ANSWER, msgSellerCenterAnswered } from '../constants/shops.constants';
import { SellerCenterUnavailableError } from '../errors/seller-center-unavailable.error';
import { SellerAccount } from '../models/seller-account.model';

/** Login check of a shop's own cookie (the same call as seller_center_account in livestream_qc/resolvers.py). */
@Injectable()
export class SellerCenterLoginClient {
  /**
   * The account behind `cookie`, or null when Seller Center answers without one (expired or wrong cookie).
   * Throws SellerCenterUnavailableError for a network failure, a timeout, 5xx, 429 or a 200 whose body
   * is not JSON, so an outage is not reported as a rejected cookie.
   */
  async account(cookie: string): Promise<SellerAccount | null> {
    const { status, data, invalidBody } = await this.fetchLogin(cookie);
    if (isLoginOutage(status, invalidBody)) {
      throw new SellerCenterUnavailableError(msgSellerCenterAnswered(status));
    }
    const userId = status === HttpStatus.OK ? toSafeId(data.id) : null;
    if (userId === null) {
      return null;
    }
    return {
      user_id: userId,
      shop_id: toSafeId(data.shopid),
      username: typeof data.username === 'string' ? data.username : '',
    };
  }

  private async fetchLogin(cookie: string): Promise<JsonResponse> {
    try {
      return await fetchSellerCenterLogin(cookie, SELLER_CENTER_TIMEOUT_MS);
    } catch (error) {
      throw new SellerCenterUnavailableError(MSG_SELLER_CENTER_NO_ANSWER, { cause: error });
    }
  }
}
