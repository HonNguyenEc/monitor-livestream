import { Injectable, Logger } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { ErrorMessage } from '../../../common/constants/error-messages.constants';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { SellerCenterLoginClient } from '../clients/seller-center-login.client';
import {
  PASTED_COOKIE_PREFIX,
  SELLER_CENTER_COOKIE,
  SELLER_CENTER_COOKIE_PATTERN,
} from '../constants/seller-cookie.constants';
import { ShopField } from '../constants/shop-fields.constants';
import { SellerAccount, VerifiedCookie } from '../models/seller-account.model';
import { CookieStore, ShopRecord } from '../models/shop-record.model';
import { isPythonTruthy, pythonStr } from '../utils/python-values';
import { optionalInteger } from '../utils/record-values';

/** A Shopee shop's identity comes from its Seller Center login, as _apply_seller_account does. */
@Injectable()
export class SellerAccountService {
  private readonly logger = new Logger(SellerAccountService.name);

  constructor(private readonly sellerCenter: SellerCenterLoginClient) {}

  /** Keeps only SPC_SC_SESSION, the one cookie the stream API needs, and checks it with Seller Center. */
  async verify(pasted: string): Promise<VerifiedCookie> {
    const cookie = extractSellerCookie(pasted);
    let account: SellerAccount | null;
    try {
      account = await this.sellerCenter.account(cookie);
    } catch (error) {
      this.logger.warn(`Seller Center login check failed: ${(error as Error).name}`);
      throw invalid(ErrorMessage.sellerCenterUnreachable);
    }
    if (!account) {
      throw invalid(ErrorMessage.cookieRejected);
    }
    return { cookie, account };
  }

  applyAccount(shop: ShopRecord, account: SellerAccount): void {
    const typedId = shop[ShopField.USER_ID];
    if (isPythonTruthy(typedId) && typedId !== account.user_id) {
      throw invalid(ErrorMessage.cookieAccountMismatch(account.username, account.user_id, typedId));
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
      throw invalid(ErrorMessage.missingStoredCookie);
    }
    if ((shop[ShopField.USER_ID] ?? storedId) !== storedId) {
      throw invalid(ErrorMessage.userIdNeedsCookie);
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
    throw invalid(ErrorMessage.cookieWithoutSession(SELLER_CENTER_COOKIE));
  }
  return `${SELLER_CENTER_COOKIE}=${match[1]}`;
}

function invalid(message: string): DomainException {
  return new DomainException(ErrorCode.BAD_REQUEST, message);
}
