import { Injectable } from '@nestjs/common';

import { DIGITS } from '../../../common/constants/patterns.constants';
import { Platform } from '../../../common/enums/platform.enum';
import { badRequest } from '../../../common/exceptions/bad-request';
import { isAllowedShopeeUrl, SHOPEE_ALLOWED_DOMAINS } from '../../shopee';
import { parseUrl } from '../../../common/utils/parse-url';
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
      throw badRequest(ErrorMessage.fieldsNotForPlatform(platform, foreign));
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
          throw badRequest(ErrorMessage.missingField(field));
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
      throw badRequest(ErrorMessage.liveUrlScheme);
    }
    return shop;
  }
}

// The link is fetched from the operator's machine, so a supplied one must pass the shared Shopee policy.
function assertLiveUrl(platform: Platform, liveUrl: string): void {
  if (platform === Platform.SHOPEE) {
    const parsed = parseUrl(liveUrl);
    if (!parsed || !isAllowedShopeeUrl(parsed)) {
      throw badRequest(ErrorMessage.shopeeLiveUrlNotAllowed(SHOPEE_ALLOWED_DOMAINS));
    }
  }
}

function toInteger(field: ShopField, value: string): number {
  const number = Number(value);
  if (!DIGITS.test(value) || !Number.isSafeInteger(number)) {
    throw badRequest(ErrorMessage.notPositiveInteger(field));
  }
  return number;
}
