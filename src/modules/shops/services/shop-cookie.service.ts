import { Injectable } from '@nestjs/common';

import { isPlainObject } from '../../../common/utils/is-plain-object';
import { ShopField } from '../constants/shop-fields.constants';
import { CookieStore } from '../models/shop-record.model';
import { CookieRepository } from '../repositories/cookie.repository';
import { isPythonTruthy, pythonStr } from '../utils/python-values';

/** Keeps shopee_cookies.json in step with shops.json: one cookie per user_id still in use. */
@Injectable()
export class ShopCookieService {
  constructor(private readonly cookieRepository: CookieRepository) {}

  /** Stores `cookie` for `userId`; the previous account's cookie goes once no shop uses it. */
  async remember(
    cookie: string,
    userId: unknown,
    previousUserId: unknown,
    shops: unknown[],
  ): Promise<CookieStore> {
    const cookies = await this.cookieRepository.load();
    if (isPythonTruthy(previousUserId) && previousUserId !== userId) {
      dropIfUnused(cookies, pythonStr(previousUserId), shops);
    }
    cookies[pythonStr(userId)] = cookie;
    await this.cookieRepository.save(cookies);
    return cookies;
  }

  async forgetUnused(userId: unknown, shops: unknown[]): Promise<void> {
    const cookies = await this.cookieRepository.load();
    if (isPythonTruthy(userId) && dropIfUnused(cookies, pythonStr(userId), shops)) {
      await this.cookieRepository.save(cookies);
    }
  }
}

function dropIfUnused(cookies: CookieStore, userId: string, shops: unknown[]): boolean {
  const used = shops.some(
    (shop) => isPlainObject(shop) && pythonStr(shop[ShopField.USER_ID]) === userId,
  );
  if (used || !Object.hasOwn(cookies, userId)) {
    return false;
  }
  delete cookies[userId];
  return true;
}
