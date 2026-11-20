import { createHash } from 'node:crypto';

import { Platform } from '../../../common/enums/platform.enum';
import {
  BACKEND_IDENT_PREFIX,
  BRAND_HASH_ALGORITHM,
  BRAND_HASH_LENGTH,
  KEY_REPLACEMENT,
  KEY_SEPARATOR,
  KEY_UNSAFE_CHARACTERS,
} from '../constants/shops.constants';
import { BRAND_ID_FIELD, PLATFORM_FIELD, ShopField } from '../constants/shop-fields.constants';
import { ShopRecord } from '../models/shop-record.model';
import { isPythonTruthy, pythonStr } from '../../../common/utils/python-values';

const PLATFORMS: readonly string[] = Object.values(Platform);

/** The platform in lower case, or null for an entry neither tool can monitor. */
export function shopPlatform(record: ShopRecord): Platform | null {
  const platform =
    typeof record[PLATFORM_FIELD] === 'string' ? record[PLATFORM_FIELD].toLowerCase() : '';
  return PLATFORMS.includes(platform) ? (platform as Platform) : null;
}

export function isBackendShop(record: ShopRecord): boolean {
  return isPythonTruthy(record[BRAND_ID_FIELD]);
}

export function shopLabel(record: ShopRecord): string {
  const named = [record[ShopField.USERNAME], record[ShopField.NAME]].find(isPythonTruthy);
  return pythonStr(named ?? record[ShopField.SHOP_ID]);
}

// The `u` flag replaces a character outside the BMP with one `_`, as Python does, not two.
export function sanitizeKeyPart(ident: string): string {
  return ident.replace(KEY_UNSAFE_CHARACTERS, KEY_REPLACEMENT);
}

// Backend shops are keyed by a brand_id hash: the key shows up in URLs, file names and logs.
export function shopKey(platform: Platform, record: ShopRecord): string {
  const ident = isBackendShop(record)
    ? BACKEND_IDENT_PREFIX + brandHash(record[BRAND_ID_FIELD])
    : shopLabel(record);
  return platform + KEY_SEPARATOR + sanitizeKeyPart(ident);
}

function brandHash(brandId: unknown): string {
  return createHash(BRAND_HASH_ALGORITHM)
    .update(pythonStr(brandId), 'utf8')
    .digest('hex')
    .slice(0, BRAND_HASH_LENGTH);
}
