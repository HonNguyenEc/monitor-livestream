import { Injectable, Logger } from '@nestjs/common';

import { ErrorMessage } from '../../../common/constants/error-messages.constants';
import { badRequest } from '../../../common/exceptions/bad-request';
import {
  INVALID_COOKIE_CHARS,
  SellerAccount,
  SellerCenterClient,
  SellerCenterUnavailableError,
  SELLER_CENTER_COOKIE_NAME,
  SELLER_CENTER_COOKIE_PREFIX,
} from '../../shopee';
import { wrappedErrorCode } from '../../../common/utils/error-chain';
import { safeErrorMessage } from '../../../common/utils/safe-error-message';
import {
  PASTED_COOKIE_PREFIX,
  SELLER_CENTER_COOKIE_PATTERN,
} from '../constants/seller-cookie.constants';
import { ShopField } from '../constants/shop-fields.constants';
import { VerifiedCookie } from '../models/seller-account.model';
import { CookieStore, ShopRecord } from '../models/shop-record.model';
import { isPythonTruthy, pythonStr } from '../../../common/utils/python-values';
import { optionalInteger } from '../utils/record-values';

/** A Shopee shop's identity comes from its Seller Center login, as _apply_seller_account does. */
@Injectable()
export class SellerAccountService {
  private readonly logger = new Logger(SellerAccountService.name);

  constructor(private readonly sellerCenter: SellerCenterClient) {}

  /** Keeps only SPC_SC_SESSION, the one cookie the stream API needs, and checks it with Seller Center. */
  async verify(pasted: string): Promise<VerifiedCookie> {
    const cookie = extractSellerCookie(pasted);
    let account: SellerAccount | null;
    try {
      account = await this.sellerCenter.account(cookie);
    } catch (error) {
      if (!(error instanceof SellerCenterUnavailableError)) {
        throw error;
      }
      const code = wrappedErrorCode(error);
      this.logger.warn(
        `Seller Center login check failed: ${safeErrorMessage(error)}${code ? ` (${code})` : ''}`,
      );
      throw badRequest(ErrorMessage.sellerCenterUnreachable);
    }
    if (!account) {
      throw badRequest(ErrorMessage.cookieRejected);
    }
    return { cookie, account };
  }

  applyAccount(shop: ShopRecord, account: SellerAccount): void {
    const typedId = shop[ShopField.USER_ID];
    if (isPythonTruthy(typedId) && typedId !== account.user_id) {
      throw badRequest(
        ErrorMessage.cookieAccountMismatch(account.username, account.user_id, typedId),
      );
    }
    shop[ShopField.USER_ID] = account.user_id;
    if (account.shop_id) {
      shop[ShopField.SHOP_ID] = account.shop_id;
    }
    shop[ShopField.NAME] ??= account.username || String(account.user_id);
  }

  /** An edit without a cookie keeps the stored login, so the account cannot change. */
  keepStoredAccount(shop: ShopRecord, stored: ShopRecord, cookies: CookieStore): void {
    const storedId = optionalInteger(stored[ShopField.USER_ID]);
    if (!storedId || !Object.hasOwn(cookies, pythonStr(storedId))) {
      throw badRequest(ErrorMessage.missingStoredCookie);
    }
    if ((shop[ShopField.USER_ID] ?? storedId) !== storedId) {
      throw badRequest(ErrorMessage.userIdNeedsCookie);
    }
    shop[ShopField.USER_ID] = storedId;
    shop[ShopField.NAME] ??= String(storedId);
  }
}

export function extractSellerCookie(pasted: string): string {
  const header = pasted.trim();
  const match = SELLER_CENTER_COOKIE_PATTERN.exec(
    header.startsWith(PASTED_COOKIE_PREFIX) ? header.slice(PASTED_COOKIE_PREFIX.length) : header,
  );
  if (!match) {
    throw badRequest(ErrorMessage.cookieWithoutSession(SELLER_CENTER_COOKIE_NAME));
  }
  if (INVALID_COOKIE_CHARS.test(match[1])) {
    throw badRequest(ErrorMessage.cookieInvalidCharacters);
  }
  return `${SELLER_CENTER_COOKIE_PREFIX}${match[1]}`;
}
