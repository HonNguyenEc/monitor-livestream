import { HttpStatus, Injectable } from '@nestjs/common';

import { DIGITS } from '../constants/shop-fields.constants';
import {
  COOKIE_HEADER,
  SELLER_CENTER_HEADERS,
  SELLER_CENTER_LOGIN_URL,
  SELLER_CENTER_TIMEOUT_MS,
} from './seller-center-login.constants';
import { SellerAccount } from '../models/seller-account.model';
import { isPlainObject } from '../../../common/utils/is-plain-object';
import { isPythonTruthy, pythonStr } from '../utils/python-values';

/** Seller Center login check with a shop's own cookie; the live and session calls belong to the resolvers. */
@Injectable()
export class SellerCenterLoginClient {
  /**
   * The account behind `cookie`, or null when Seller Center rejects it; network failures throw.
   * Same reading as seller_center_account in resolvers.py.
   */
  async account(cookie: string): Promise<SellerAccount | null> {
    const response = await fetch(SELLER_CENTER_LOGIN_URL, {
      headers: { ...SELLER_CENTER_HEADERS, [COOKIE_HEADER]: cookie },
      signal: AbortSignal.timeout(SELLER_CENTER_TIMEOUT_MS),
    });
    const body = await response.text();
    if (response.status !== HttpStatus.OK) {
      return null;
    }
    const data = parseObject(body);
    const userId = isPythonTruthy(data.id) ? pythonStr(data.id) : '';
    if (!DIGITS.test(userId)) {
      return null;
    }
    const shopId = isPythonTruthy(data.shopid) ? pythonStr(data.shopid) : '';
    return {
      user_id: Number(userId),
      shop_id: DIGITS.test(shopId) ? Number(shopId) : null,
      username: typeof data.username === 'string' ? data.username : '',
    };
  }
}

function parseObject(body: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(body);
    return isPlainObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
