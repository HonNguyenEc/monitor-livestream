import { Injectable } from '@nestjs/common';

import { ErrorCode } from '../../../common/constants/error-codes.constants';
import { DIGITS } from '../../../common/constants/patterns.constants';
import { Platform } from '../../../common/enums/platform.enum';
import { DomainException } from '../../../common/exceptions/domain.exception';
import { isAllowedShopeeUrl } from '../../../common/shopee/shopee-url-policy';
import {
  INTEGER_FIELDS,
  LIVE_URL_PREFIXES,
  PLATFORM_EXTRA_INPUTS,
  PLATFORM_FIELD,
  PLATFORM_FIELDS,
  REQUIRED_FIELDS,
  ShopField,
  USERNAME_PREFIX,
} from '../constants/shop-fields.constants';
import { ErrorMessage } from '../../../common/constants/error-messages.constants';
import { ShopInput } from '../models/shop-input.model';
import { ShopRecord } from '../models/shop-record.model';

/** validate_shop of the Python tool: the stored fields of one shop, cleaned per platform. */
@Injectable()
export class ShopFieldsValidator {
  /** A request may only carry the fields its platform stores plus its request-only inputs, so a typo never vanishes silently. */
  rejectForeignFields(platform: Platform, request: object): void {
    const allowed = [
      PLATFORM_FIELD,
      ...PLATFORM_FIELDS[platform],
      ...PLATFORM_EXTRA_INPUTS[platform],
    ];
    const foreign = Object.entries(request)
      .filter(([field, value]) => value !== undefined && value !== null && !allowed.includes(field))
      .map(([field]) => field);
    if (foreign.length > 0) {
      throw invalid(ErrorMessage.fieldsNotForPlatform(platform, foreign));
    }
  }

  /** The rule for a live_url the request supplies; stored values only keep the generic http(s) check in clean. */
  assertSuppliedLiveUrl(platform: Platform, liveUrl: unknown): void {
    if (typeof liveUrl !== 'string' || !liveUrl.trim()) return;
    assertLiveUrl(platform, liveUrl.trim());
  }

  // Values are trimmed and blanks dropped as in Python, so ids typed as digit strings become numbers.
  clean(platform: Platform, input: ShopInput): ShopRecord {
    const shop: ShopRecord = { [PLATFORM_FIELD]: platform };
    for (const field of PLATFORM_FIELDS[platform]) {
      const value =
        input[field] === undefined || input[field] === null ? '' : String(input[field]).trim();
      const stored = field === ShopField.USERNAME ? value.replace(USERNAME_PREFIX, '') : value;
      if (!stored) {
        if (REQUIRED_FIELDS[platform].includes(field)) {
          throw invalid(ErrorMessage.missingField(field));
        }
        continue;
      }
      shop[field] = INTEGER_FIELDS.includes(field) ? toInteger(field, stored) : stored;
    }
    const liveUrl = shop[ShopField.LIVE_URL];
    if (
      typeof liveUrl === 'string' &&
      !LIVE_URL_PREFIXES.some((prefix) => liveUrl.toLowerCase().startsWith(prefix))
    ) {
      throw invalid(ErrorMessage.liveUrlScheme);
    }
    return shop;
  }
}

// Shopee links are fetched with the shop's cookie, so a supplied one must pass the shared Shopee policy.
function assertLiveUrl(platform: Platform, liveUrl: string): void {
  if (platform === Platform.SHOPEE) {
    const parsed = parseUrl(liveUrl);
    if (!parsed || !isAllowedShopeeUrl(parsed)) {
      throw invalid(ErrorMessage.shopeeLiveUrlNotAllowed);
    }
  }
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function toInteger(field: ShopField, value: string): number {
  const number = Number(value);
  if (!DIGITS.test(value) || !Number.isSafeInteger(number)) {
    throw invalid(ErrorMessage.notPositiveInteger(field));
  }
  return number;
}

function invalid(message: string): DomainException {
  return new DomainException(ErrorCode.BAD_REQUEST, message);
}
