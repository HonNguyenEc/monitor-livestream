import { Platform } from '../../../common/enums/platform.enum';

export const ShopField = {
  USERNAME: 'username',
  NAME: 'name',
  USER_ID: 'user_id',
  SHOP_ID: 'shop_id',
  LIVE_URL: 'live_url',
} as const;

export type ShopField = (typeof ShopField)[keyof typeof ShopField];

export const PLATFORM_FIELD = 'platform';
export const BRAND_ID_FIELD = 'brand_id';
export const COOKIE_FIELD = 'cookie';

// Same fields and order as FIELDS in livestream_qc/shop_store.py.
export const PLATFORM_FIELDS: Record<Platform, readonly ShopField[]> = {
  [Platform.TIKTOK]: [ShopField.USERNAME, ShopField.LIVE_URL],
  [Platform.SHOPEE]: [ShopField.NAME, ShopField.USER_ID, ShopField.SHOP_ID, ShopField.LIVE_URL],
};

export const REQUIRED_FIELDS: Record<Platform, readonly ShopField[]> = {
  [Platform.TIKTOK]: [ShopField.USERNAME],
  [Platform.SHOPEE]: [],
};

export const INTEGER_FIELDS: readonly ShopField[] = [ShopField.USER_ID, ShopField.SHOP_ID];

/** Request fields each platform accepts besides its stored fields. */
export const PLATFORM_EXTRA_INPUTS: Record<Platform, readonly string[]> = {
  [Platform.TIKTOK]: [],
  [Platform.SHOPEE]: [COOKIE_FIELD],
};

/** Fields this service rewrites on save; any other field of a shops.json entry is kept as it is. */
export const MANAGED_FIELDS: readonly string[] = [PLATFORM_FIELD, ...Object.values(ShopField)];

export const LIVE_URL_PREFIXES = ['http://', 'https://'];
export const USERNAME_PREFIX = /^@+/;
