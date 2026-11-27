/** One entry of shops.json as written by either tool; fields this service does not know are kept. */
export type ShopRecord = Record<string, unknown>;

/** shops.json; top-level fields other than `shops` (capture settings) are kept as they are. */
export interface ShopsDocument {
  shops: unknown[];
  [field: string]: unknown;
}

/** Shopee Seller Center cookies by user_id, as in shopee_cookies.json. */
export type CookieStore = Record<string, unknown>;
