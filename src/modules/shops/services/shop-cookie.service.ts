import { Injectable, Logger } from '@nestjs/common';

import { fsErrorSummary } from '../../../common/fs/fs-error';
import { isPlainObject } from '../../../common/utils/is-plain-object';
import { ShopField } from '../constants/shop-fields.constants';
import { COOKIES_FILE } from '../constants/shops.constants';
import { RememberedCookie } from '../models/remembered-cookie.model';
import { isCookieStoreUnreadable } from '../utils/data-file-errors';
import { CookieStore } from '../models/shop-record.model';
import { CookieRepository } from '../repositories/cookie.repository';
import { isPythonTruthy, pythonStr } from '../../../common/utils/python-values';

/** Owns shopee_cookies.json: one cookie per user_id still in use by a shop in shops.json. */
@Injectable()
export class ShopCookieService {
  private readonly logger = new Logger(ShopCookieService.name);

  constructor(private readonly cookieRepository: CookieRepository) {}

  /** For display: an unreadable file reads as no stored cookies. Never write the result back. */
  async peek(): Promise<CookieStore> {
    try {
      return await this.cookieRepository.load();
    } catch (error) {
      if (isCookieStoreUnreadable(error)) {
        return {};
      }
      throw error;
    }
  }

  /** The store a write decision depends on; throws when the file cannot be read. */
  load(): Promise<CookieStore> {
    return this.cookieRepository.load();
  }

  async remember(cookie: string, userId: unknown): Promise<RememberedCookie> {
    const cookies = await this.cookieRepository.load();
    const key = pythonStr(userId);
    const previous = Object.hasOwn(cookies, key) ? cookies[key] : undefined;
    cookies[key] = cookie;
    await this.cookieRepository.save(cookies);
    return { cookies, undo: () => this.restore(key, previous) };
  }

  /**
   * Drops the cookie of `userId` once no shop uses it. Runs after shops.json is saved, so any failure
   * here is logged and skipped (a stale cookie is harmless) rather than failing a saved change.
   */
  async forgetUnused(userId: unknown, shops: unknown[]): Promise<void> {
    if (!isPythonTruthy(userId)) {
      return;
    }
    try {
      const cookies = await this.cookieRepository.load();
      if (dropIfUnused(cookies, pythonStr(userId), shops)) {
        await this.cookieRepository.save(cookies);
      }
    } catch (error) {
      this.logger.warn(`Left ${COOKIES_FILE} as it is: ${fsErrorSummary(error)}`);
    }
  }

  private async restore(key: string, previous: unknown): Promise<void> {
    try {
      const cookies = await this.cookieRepository.load();
      if (previous === undefined) {
        delete cookies[key];
      } else {
        cookies[key] = previous;
      }
      await this.cookieRepository.save(cookies);
    } catch (error) {
      this.logger.warn(`Could not restore ${COOKIES_FILE}: ${fsErrorSummary(error)}`);
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
